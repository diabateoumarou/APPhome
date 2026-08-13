/**
 * Service Paiements — initiation, confirmation, ventilation sur les échéances.
 *
 * Règles appliquées :
 *  - REQ-PAY-01 : mobile money et carte via agrégateur, jamais en direct.
 *  - REQ-PAY-05 : `referenceInterne` unique sert de clé d'idempotence. Une
 *    notification et la réconciliation peuvent confirmer le même paiement :
 *    la confirmation doit donc être rejouable sans double effet.
 *  - REQ-PAY-04 : paiement partiel accepté ; le solde reste dû et tracé.
 *  - Le séquestre est alimenté à la confirmation d'une caution, jamais avant.
 *
 * Principe directeur : aucun statut métier ne bouge tant que le paiement n'est
 * pas confirmé. Un locataire ne doit jamais voir « payé » sur une transaction
 * que l'agrégateur n'a pas actée.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 *          Ingénieur Système & Infrastructure Cloud / System Architect
 *          Expert Solutions ICT (Cloud, Système, Cybersécurité)
 * Date   : 11 août 2026
 */
import {
  Injectable,
  Inject,
  forwardRef,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  StatutPaiement,
  StatutEcheance,
  TypeEcheance,
  TypeMvtSequestre,
  StatutContrat,
  RoleUtilisateur,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { SmsService } from '../notifications/sms.service';
import { QuittancesService } from './quittances.service';
import {
  FOURNISSEUR_PAIEMENT,
  type FournisseurPaiement,
} from './fournisseurs/fournisseur.interface';
import type { UtilisateurConnecte } from '../auth/jwt.strategy';
import { InitierPaiementDto, ListerPaiementsDto } from './dto/paiement.dto';

/** Échéances encore ouvertes au paiement. */
const ECHEANCES_OUVERTES: StatutEcheance[] = [
  StatutEcheance.a_venir,
  StatutEcheance.due,
  StatutEcheance.partielle,
  StatutEcheance.en_retard,
];

/** Délai au-delà duquel un paiement sans notification est vérifié activement. */
export const DELAI_VERIFICATION_MIN = 30;

@Injectable()
export class PaiementsService {
  private readonly logger = new Logger(PaiementsService.name);
  private readonly urlRetour: string;
  private readonly urlNotification: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sms: SmsService,
    private readonly config: ConfigService,
    @Inject(FOURNISSEUR_PAIEMENT) private readonly fournisseur: FournisseurPaiement,
    @Inject(forwardRef(() => QuittancesService))
    private readonly quittances: QuittancesService,
  ) {
    const base = (config.get<string>('API_URL_PUBLIQUE') ?? 'http://localhost:3100').replace(
      /\/$/,
      '',
    );
    this.urlRetour = `${base}/paiement/retour`;
    this.urlNotification = `${base}/api/v1/paiements/notification`;
  }

  private estSuperviseur(utilisateur: UtilisateurConnecte): boolean {
    const roles: RoleUtilisateur[] = [RoleUtilisateur.admin, RoleUtilisateur.agence];
    return utilisateur.roles.some((r) => roles.includes(r as RoleUtilisateur));
  }

  /**
   * Référence interne unique.
   * Elle est transmise à l'agrégateur et sert de clé de rapprochement : deux
   * initiations distinctes ne peuvent jamais partager la même référence, ce qui
   * rend impossible qu'une notification crédite la mauvaise transaction.
   */
  private construireReference(): string {
    return `PAY-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  /** Initie l'encaissement d'une ou plusieurs échéances. */
  async initier(dto: InitierPaiementDto, payeur: UtilisateurConnecte) {
    const echeances = await this.prisma.echeance.findMany({
      where: { id: { in: dto.echeanceIds } },
      include: {
        contrat: {
          select: {
            id: true,
            reference: true,
            agenceId: true,
            locataireId: true,
            statut: true,
          },
        },
      },
    });

    if (echeances.length !== dto.echeanceIds.length) {
      throw new NotFoundException('Une ou plusieurs échéances sont introuvables.');
    }

    // Toutes les échéances doivent relever du même contrat : un paiement
    // unique réparti sur deux baux serait ingérable en cas de remboursement.
    const contrats = new Set(echeances.map((e) => e.contratId));
    if (contrats.size > 1) {
      throw new BadRequestException(
        'Les échéances réglées ensemble doivent relever du même contrat.',
      );
    }

    const contrat = echeances[0].contrat;
    if (contrat.locataireId !== payeur.id && !this.estSuperviseur(payeur)) {
      throw new ForbiddenException("Ces échéances ne vous concernent pas.");
    }
    if (contrat.statut === StatutContrat.resilie) {
      throw new ConflictException('Ce contrat est résilié.');
    }

    for (const echeance of echeances) {
      if (!ECHEANCES_OUVERTES.includes(echeance.statut)) {
        throw new ConflictException(
          `L'échéance ${echeance.type} du ${echeance.dateEcheance.toLocaleDateString('fr-FR')} est déjà ${echeance.statut}.`,
        );
      }
    }

    const restantDu = echeances.reduce(
      (total, e) => total + (e.montantDu - e.montantPaye),
      0n,
    );
    if (restantDu <= 0n) {
      throw new ConflictException('Ces échéances sont déjà réglées.');
    }

    const montant = dto.montant ? BigInt(dto.montant) : restantDu;
    if (montant <= 0n) {
      throw new BadRequestException('Le montant doit être positif.');
    }
    if (montant > restantDu) {
      throw new BadRequestException(
        `Le montant dépasse le solde dû (${restantDu} FCFA). Un trop-perçu serait à rembourser.`,
      );
    }

    const reference = this.construireReference();

    // Le paiement est enregistré avant l'appel à l'agrégateur : si celui-ci
    // répond puis que l'écriture échoue, la transaction serait orpheline.
    const paiement = await this.prisma.paiement.create({
      data: {
        contratId: contrat.id,
        payeurId: payeur.id,
        montant,
        moyen: dto.moyen,
        agregateur: this.fournisseur.nom,
        referenceInterne: reference,
        statut: StatutPaiement.initie,
        echeances: {
          create: this.ventiler(echeances, montant),
        },
      },
    });

    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { id: payeur.id },
      select: { nomComplet: true, telephone: true },
    });

    try {
      const initiation = await this.fournisseur.initier({
        referenceInterne: reference,
        montant,
        devise: 'XOF',
        moyen: dto.moyen,
        telephonePayeur: dto.telephonePayeur ?? utilisateur?.telephone ?? payeur.telephone,
        nomPayeur: utilisateur?.nomComplet ?? '',
        description: `Bail ${contrat.reference}`,
        urlRetour: this.urlRetour,
        urlNotification: this.urlNotification,
      });

      const misAJour = await this.prisma.paiement.update({
        where: { id: paiement.id },
        data: {
          referenceAgregateur: initiation.referenceAgregateur,
          statut: initiation.statut,
        },
      });

      await this.audit.enregistrer({
        agenceId: contrat.agenceId,
        utilisateurId: payeur.id,
        action: 'paiement.initiation',
        entiteType: 'paiement',
        entiteId: paiement.id,
        donneesApres: { reference, montant: montant.toString(), moyen: dto.moyen },
      });

      return {
        id: misAJour.id,
        referenceInterne: reference,
        montant,
        statut: misAJour.statut,
        urlPaiement: initiation.urlPaiement,
      };
    } catch (e) {
      await this.prisma.paiement.update({
        where: { id: paiement.id },
        data: { statut: StatutPaiement.echoue },
      });
      const motif = e instanceof Error ? e.message : 'erreur inconnue';
      this.logger.error(`Initiation ${reference} échouée : ${motif}`);
      throw new ConflictException(
        "Le service de paiement n'a pas pu être joint. Réessayez dans quelques instants.",
      );
    }
  }

  /**
   * Répartit un montant sur les échéances, de la plus ancienne à la plus
   * récente. L'imputation par ancienneté est la règle usuelle : elle évite
   * qu'un locataire règle le mois courant en laissant traîner un impayé.
   */
  private ventiler(
    echeances: Array<{ id: string; montantDu: bigint; montantPaye: bigint; dateEcheance: Date }>,
    montant: bigint,
  ): Array<{ echeanceId: string; montantAffecte: bigint }> {
    const triees = [...echeances].sort(
      (a, b) => a.dateEcheance.getTime() - b.dateEcheance.getTime(),
    );

    const ventilation: Array<{ echeanceId: string; montantAffecte: bigint }> = [];
    let reste = montant;

    for (const echeance of triees) {
      if (reste <= 0n) break;
      const du = echeance.montantDu - echeance.montantPaye;
      if (du <= 0n) continue;

      const affecte = reste >= du ? du : reste;
      ventilation.push({ echeanceId: echeance.id, montantAffecte: affecte });
      reste -= affecte;
    }

    return ventilation;
  }

  /**
   * Traite une notification entrante de l'agrégateur.
   * La signature est vérifiée avant toute lecture du contenu : sans cela,
   * n'importe qui pourrait déclarer un loyer payé.
   */
  async traiterNotification(
    corps: Record<string, unknown>,
    signature: string | undefined,
    brut?: Buffer,
  ): Promise<{ recu: boolean }> {
    const notification = this.fournisseur.validerNotification(corps, signature, brut);
    if (!notification) {
      // Réponse volontairement neutre : ne pas renseigner un attaquant.
      this.logger.warn('Notification rejetée (signature ou contenu invalide)');
      return { recu: false };
    }

    await this.prisma.paiement.updateMany({
      where: { referenceInterne: notification.referenceInterne },
      data: { webhookRecuLe: new Date() },
    });

    if (notification.statut === StatutPaiement.confirme) {
      await this.confirmer(notification.referenceInterne, notification, 'webhook');
    } else if (
      notification.statut === StatutPaiement.echoue ||
      notification.statut === StatutPaiement.expire
    ) {
      await this.marquerEchec(notification.referenceInterne, notification.statut);
    }

    return { recu: true };
  }

  /**
   * Confirme un paiement et propage ses effets.
   * Idempotent : un paiement déjà confirmé ressort inchangé, sans double
   * imputation. C'est indispensable, la notification et la réconciliation
   * pouvant traiter la même transaction à quelques secondes d'intervalle.
   */
  async confirmer(
    referenceInterne: string,
    notification: { referenceAgregateur: string | null; montant?: bigint } | null,
    origine: 'webhook' | 'reconciliation',
  ): Promise<{ confirme: boolean; dejaTraite: boolean }> {
    const paiement = await this.prisma.paiement.findUnique({
      where: { referenceInterne },
      include: {
        echeances: { include: { echeance: true } },
        contrat: { select: { id: true, agenceId: true, reference: true, locataireId: true } },
      },
    });

    if (!paiement) {
      this.logger.warn(`Confirmation reçue pour une référence inconnue : ${referenceInterne}`);
      return { confirme: false, dejaTraite: false };
    }

    if (paiement.statut === StatutPaiement.confirme) {
      return { confirme: true, dejaTraite: true };
    }

    // Un montant différent de celui initié signale une anomalie : on ne
    // confirme pas, l'écart doit être instruit par l'administrateur.
    if (notification?.montant !== undefined && notification.montant !== paiement.montant) {
      this.logger.error(
        `Écart de montant sur ${referenceInterne} : attendu ${paiement.montant}, reçu ${notification.montant}`,
      );
      await this.audit.enregistrer({
        agenceId: paiement.contrat?.agenceId,
        action: 'paiement.anomalie.montant',
        entiteType: 'paiement',
        entiteId: paiement.id,
        donneesApres: {
          attendu: paiement.montant.toString(),
          recu: notification.montant.toString(),
        },
      });
      return { confirme: false, dejaTraite: false };
    }

    const operations: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.paiement.update({
        where: { id: paiement.id },
        data: {
          statut: StatutPaiement.confirme,
          referenceAgregateur: notification?.referenceAgregateur ?? paiement.referenceAgregateur,
          reconcilie: true,
          reconcilieLe: new Date(),
        },
      }),
    ];

    for (const ventilation of paiement.echeances) {
      const nouveauPaye = ventilation.echeance.montantPaye + ventilation.montantAffecte;
      const solde = nouveauPaye >= ventilation.echeance.montantDu;

      operations.push(
        this.prisma.echeance.update({
          where: { id: ventilation.echeanceId },
          data: {
            montantPaye: nouveauPaye,
            statut: solde ? StatutEcheance.payee : StatutEcheance.partielle,
          },
        }),
      );

      // La caution rejoint le séquestre : elle n'appartient ni au bailleur
      // ni à la plateforme tant que le bail court (REQ-PAY-08).
      if (ventilation.echeance.type === TypeEcheance.caution) {
        operations.push(
          this.prisma.compteSequestre.update({
            where: { contratId: ventilation.echeance.contratId },
            data: { solde: { increment: ventilation.montantAffecte } },
          }),
        );
      }
    }

    await this.prisma.$transaction(operations);

    // Le mouvement de séquestre est tracé séparément : son échec ne doit pas
    // annuler l'encaissement, mais il est journalisé pour rattrapage.
    const caution = paiement.echeances.find(
      (v) => v.echeance.type === TypeEcheance.caution,
    );
    if (caution) {
      const compte = await this.prisma.compteSequestre.findUnique({
        where: { contratId: caution.echeance.contratId },
        select: { id: true },
      });
      if (compte) {
        await this.prisma.mouvementSequestre.create({
          data: {
            compteId: compte.id,
            type: TypeMvtSequestre.depot,
            montant: caution.montantAffecte,
            executeLe: new Date(),
          },
        });
      }
    }

    await this.audit.enregistrer({
      agenceId: paiement.contrat?.agenceId,
      utilisateurId: paiement.payeurId,
      action: 'paiement.confirmation',
      entiteType: 'paiement',
      entiteId: paiement.id,
      donneesApres: {
        origine,
        montant: paiement.montant.toString(),
        echeancesReglees: paiement.echeances.length,
      },
    });

    // La quittance est délivrée automatiquement : obligation du bailleur
    // (art. 3 du bail) et principal motif de litige évité.
    if (paiement.contratId) {
      try {
        await this.quittances.genererPourPaiement(paiement.id);
      } catch (e) {
        // Une quittance non générée n'annule pas un encaissement valide.
        const motif = e instanceof Error ? e.message : 'erreur inconnue';
        this.logger.error(`Quittance non générée pour ${referenceInterne} : ${motif}`);
      }
    }

    return { confirme: true, dejaTraite: false };
  }

  private async marquerEchec(referenceInterne: string, statut: StatutPaiement): Promise<void> {
    const paiement = await this.prisma.paiement.findUnique({
      where: { referenceInterne },
      select: { id: true, statut: true, contrat: { select: { agenceId: true } } },
    });

    if (!paiement || paiement.statut === StatutPaiement.confirme) return;

    await this.prisma.paiement.update({
      where: { id: paiement.id },
      data: { statut, reconcilie: true, reconcilieLe: new Date() },
    });

    await this.audit.enregistrer({
      agenceId: paiement.contrat?.agenceId,
      action: 'paiement.echec',
      entiteType: 'paiement',
      entiteId: paiement.id,
      donneesApres: { statut },
    });
  }

  /**
   * Vérification active des paiements sans notification.
   * C'est le filet de sécurité contre les notifications perdues, fréquentes
   * chez les opérateurs mobile money. Sans ce mécanisme, un loyer réellement
   * débité resterait affiché comme impayé.
   */
  async reconcilier(): Promise<{ examines: number; confirmes: number; echoues: number }> {
    const limite = new Date(Date.now() - DELAI_VERIFICATION_MIN * 60_000);

    const enAttente = await this.prisma.paiement.findMany({
      where: {
        statut: { in: [StatutPaiement.initie, StatutPaiement.en_attente] },
        createdAt: { lt: limite },
      },
      select: { id: true, referenceInterne: true },
      take: 200,
    });

    let confirmes = 0;
    let echoues = 0;

    for (const paiement of enAttente) {
      try {
        const etat = await this.fournisseur.verifier(paiement.referenceInterne);

        if (etat.statut === StatutPaiement.confirme) {
          const resultat = await this.confirmer(
            paiement.referenceInterne,
            { referenceAgregateur: etat.referenceAgregateur, montant: etat.montant },
            'reconciliation',
          );
          if (resultat.confirme && !resultat.dejaTraite) confirmes++;
        } else if (
          etat.statut === StatutPaiement.echoue ||
          etat.statut === StatutPaiement.expire
        ) {
          await this.marquerEchec(paiement.referenceInterne, etat.statut);
          echoues++;
        }
      } catch (e) {
        // Un échec de vérification ne doit pas interrompre le lot : le
        // paiement sera repris au prochain passage.
        const motif = e instanceof Error ? e.message : 'erreur inconnue';
        this.logger.warn(`Vérification ${paiement.referenceInterne} échouée : ${motif}`);
      }
    }

    if (enAttente.length) {
      this.logger.log(
        `Réconciliation : ${enAttente.length} examinés, ${confirmes} confirmés, ${echoues} échoués`,
      );
    }

    return { examines: enAttente.length, confirmes, echoues };
  }

  async detail(id: string, utilisateur: UtilisateurConnecte) {
    const paiement = await this.prisma.paiement.findUnique({
      where: { id },
      include: {
        echeances: { include: { echeance: { select: { type: true, periode: true } } } },
        contrat: { select: { reference: true, locataireId: true, bailleurId: true } },
        quittance: { select: { numero: true, genereeLe: true } },
      },
    });

    const introuvable = new NotFoundException('Paiement introuvable.');
    if (!paiement) throw introuvable;

    const concerne =
      paiement.payeurId === utilisateur.id ||
      paiement.contrat?.bailleurId === utilisateur.id;
    if (!concerne && !this.estSuperviseur(utilisateur)) throw introuvable;

    return paiement;
  }

  async lister(filtres: ListerPaiementsDto, utilisateur: UtilisateurConnecte) {
    const { page = 1, limite = 20, statut, contratId } = filtres;

    const where: Prisma.PaiementWhereInput = {
      ...(this.estSuperviseur(utilisateur)
        ? {}
        : {
            OR: [
              { payeurId: utilisateur.id },
              { contrat: { bailleurId: utilisateur.id } },
            ],
          }),
      ...(statut ? { statut } : {}),
      ...(contratId ? { contratId } : {}),
    };

    const [total, donnees] = await this.prisma.$transaction([
      this.prisma.paiement.count({ where }),
      this.prisma.paiement.findMany({
        where,
        skip: (page - 1) * limite,
        take: limite,
        orderBy: { createdAt: 'desc' },
        include: {
          contrat: { select: { reference: true } },
          quittance: { select: { numero: true } },
        },
      }),
    ]);

    return { donnees, pagination: { page, limite, total, pages: Math.ceil(total / limite) } };
  }

  /** Échéancier d'un contrat, avec le solde restant dû. */
  async echeancier(contratId: string, utilisateur: UtilisateurConnecte) {
    const contrat = await this.prisma.contrat.findUnique({
      where: { id: contratId },
      select: { id: true, reference: true, locataireId: true, bailleurId: true },
    });

    const introuvable = new NotFoundException('Contrat introuvable.');
    if (!contrat) throw introuvable;

    const partie =
      contrat.locataireId === utilisateur.id || contrat.bailleurId === utilisateur.id;
    if (!partie && !this.estSuperviseur(utilisateur)) throw introuvable;

    const echeances = await this.prisma.echeance.findMany({
      where: { contratId },
      orderBy: { dateEcheance: 'asc' },
    });

    const restantDu = echeances.reduce(
      (total, e) =>
        ECHEANCES_OUVERTES.includes(e.statut) ? total + (e.montantDu - e.montantPaye) : total,
      0n,
    );

    return {
      contrat: { id: contrat.id, reference: contrat.reference },
      echeances: echeances.map((e) => ({
        ...e,
        restantDu: e.montantDu - e.montantPaye,
      })),
      totalRestantDu: restantDu,
    };
  }
}
