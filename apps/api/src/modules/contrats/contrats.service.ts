/**
 * Service Contrats — génération du bail, signature électronique, activation.
 *
 * Règles appliquées :
 *  - REQ-CTR-01 : contrat généré depuis un modèle versionné ; le contrat
 *    référence modèle + version, de sorte qu'une évolution du gabarit ne
 *    modifie pas rétroactivement les baux déjà conclus.
 *  - REQ-CTR-02 : signature séquentielle bailleur puis locataire, chacun
 *    authentifié par OTP SMS. Le procès-verbal enregistre l'empreinte SHA-256
 *    du document au moment de la signature (art. 14 du bail).
 *  - REQ-CTR-04 : la seconde signature déclenche l'appel de fonds initial —
 *    échéancier complet et compte de séquestre pour la caution.
 *  - Plafonds loi n°2019-576 : repris de l'annonce, revalidés ici, et gravés
 *    en CHECK PostgreSQL. Trois barrières pour une exigence légale.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 *          Ingénieur Système & Infrastructure Cloud / System Architect
 *          Expert Solutions ICT (Cloud, Système, Cybersécurité)
 * Date   : 10 août 2026
 */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  Prisma,
  StatutContrat,
  StatutCandidature,
  RoleSignataire,
  TypeModeleContrat,
  TypeEcheance,
  StatutEcheance,
  RoleUtilisateur,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { SmsService } from '../notifications/sms.service';
import { StockageService } from '../medias/stockage.service';
import { AuthService } from '../auth/auth.service';
import { GabaritService } from './gabarit.service';
import { PdfService } from './pdf.service';
import type { UtilisateurConnecte } from '../auth/jwt.strategy';
import { GenererContratDto, ListerContratsDto } from './dto/contrat.dto';

/** Statuts permettant encore une signature. */
const SIGNABLES: StatutContrat[] = [StatutContrat.genere, StatutContrat.en_signature];
/** Usage OTP dédié à la signature, distinct de la vérification de téléphone. */
const USAGE_OTP_SIGNATURE = 'signature';

@Injectable()
export class ContratsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sms: SmsService,
    private readonly stockage: StockageService,
    private readonly auth: AuthService,
    private readonly gabarit: GabaritService,
    private readonly pdf: PdfService,
  ) {}

  private estSuperviseur(utilisateur: UtilisateurConnecte): boolean {
    const roles: RoleUtilisateur[] = [RoleUtilisateur.admin, RoleUtilisateur.agence];
    return utilisateur.roles.some((r) => roles.includes(r as RoleUtilisateur));
  }

  /** Référence lisible et unique : CTR-AAAA-NNNNNN. */
  private async genererReference(): Promise<string> {
    const annee = new Date().getFullYear();
    const compte = await this.prisma.contrat.count({
      where: { reference: { startsWith: `CTR-${annee}-` } },
    });
    return `CTR-${annee}-${String(compte + 1).padStart(6, '0')}`;
  }

  /**
   * Génère le contrat depuis une candidature acceptée.
   * Les montants sont recalculés à partir du loyer et du nombre de mois plutôt
   * que repris tels quels : la contrainte SQL `contrat_montants_coherents`
   * exige que caution = loyer × nb_mois, et un écart bloquerait l'insertion.
   */
  async generer(dto: GenererContratDto, utilisateur: UtilisateurConnecte) {
    const candidature = await this.prisma.candidature.findUnique({
      where: { id: dto.candidatureId },
      include: {
        dossier: { include: { locataire: true } },
        annonce: {
          include: {
            bien: {
              include: {
                agence: { include: { parametreLegal: true } },
                proprietaire: true,
              },
            },
          },
        },
      },
    });

    if (!candidature) throw new NotFoundException('Candidature introuvable.');

    const bien = candidature.annonce.bien;
    if (bien.proprietaireId !== utilisateur.id && !this.estSuperviseur(utilisateur)) {
      throw new NotFoundException('Candidature introuvable.');
    }
    if (candidature.statut !== StatutCandidature.acceptee) {
      throw new ConflictException(
        'Le contrat ne peut être généré que depuis une candidature acceptée.',
      );
    }

    const existant = await this.prisma.contrat.findFirst({
      where: {
        candidatureId: candidature.id,
        statut: { notIn: [StatutContrat.resilie, StatutContrat.termine] },
      },
    });
    if (existant) {
      throw new ConflictException(
        `Un contrat (${existant.reference}) existe déjà pour cette candidature.`,
      );
    }

    const annonce = candidature.annonce;
    const loyer = annonce.loyerMontant;
    if (!loyer || loyer <= 0n) {
      throw new BadRequestException("L'annonce ne comporte pas de loyer exploitable.");
    }

    // Revalidation des plafonds : l'annonce a pu être créée avant une évolution
    // du paramétrage légal du pays.
    const plafonds = bien.agence.parametreLegal;
    if (annonce.cautionNbMois > plafonds.cautionMaxMois) {
      throw new BadRequestException(
        `La caution de l'annonce (${annonce.cautionNbMois} mois) dépasse le plafond légal de ${plafonds.cautionMaxMois} mois.`,
      );
    }
    if (annonce.avanceNbMois > plafonds.avanceMaxMois) {
      throw new BadRequestException(
        `L'avance de l'annonce (${annonce.avanceNbMois} mois) dépasse le plafond légal de ${plafonds.avanceMaxMois} mois.`,
      );
    }

    const modele = await this.prisma.modeleContrat.findFirst({
      where: {
        type: TypeModeleContrat.bail_habitation,
        actif: true,
        OR: [{ agenceId: bien.agenceId }, { agenceId: null }],
      },
      // Un modèle propre à l'agence prime sur le modèle plateforme.
      orderBy: [{ agenceId: 'desc' }, { version: 'desc' }],
    });
    if (!modele) {
      throw new NotFoundException('Aucun modèle de bail actif disponible.');
    }

    const reference = await this.genererReference();

    const contrat = await this.prisma.contrat.create({
      data: {
        reference,
        agenceId: bien.agenceId,
        annonceId: annonce.id,
        bienId: bien.id,
        bailleurId: bien.proprietaireId,
        locataireId: candidature.dossier.locataireId,
        candidatureId: candidature.id,
        modeleId: modele.id,
        loyerMontant: loyer,
        chargesMontant: annonce.chargesMontant,
        jourEcheance: dto.jourEcheance,
        cautionMontant: loyer * BigInt(annonce.cautionNbMois),
        cautionNbMois: annonce.cautionNbMois,
        avanceMontant: loyer * BigInt(annonce.avanceNbMois),
        avanceNbMois: annonce.avanceNbMois,
        fraisAgenceMontant: annonce.fraisAgenceMontant,
        dureeMois: dto.dureeMois,
        datePriseEffet: new Date(dto.datePriseEffet),
        preavisLocataireJours:
          dto.preavisLocataireJours ?? plafonds.preavisLocataireDefautJours,
        preavisBailleurJours: dto.preavisBailleurJours ?? plafonds.preavisBailleurDefautJours,
        delaiRestitutionCautionJours:
          dto.delaiRestitutionCautionJours ?? plafonds.delaiRestitutionCautionJours,
        joursTolerance: dto.joursTolerance ?? 5,
        penaliteRetardMontant: BigInt(dto.penaliteRetardMontant ?? '0'),
        statut: StatutContrat.genere,
      },
    });

    const pdf = await this.rendreEtArchiver(contrat.id);

    await this.audit.enregistrer({
      agenceId: bien.agenceId,
      utilisateurId: utilisateur.id,
      action: 'contrat.generation',
      entiteType: 'contrat',
      entiteId: contrat.id,
      donneesApres: { reference, modeleVersion: modele.version, empreinte: pdf.empreinte },
    });

    return { ...contrat, documentEmpreinteSha256: pdf.empreinte };
  }

  /** Assemble les variables, rend le PDF et l'archive dans le stockage privé. */
  private async rendreEtArchiver(contratId: string): Promise<{ cle: string; empreinte: string }> {
    const contrat = await this.prisma.contrat.findUnique({
      where: { id: contratId },
      include: {
        modele: true,
        bailleur: true,
        locataire: true,
        bien: true,
        signatures: true,
      },
    });
    if (!contrat) throw new NotFoundException('Contrat introuvable.');

    const identiteBailleur = await this.prisma.kycVerification.findFirst({
      where: { utilisateurId: contrat.bailleurId, numeroPieceChiffre: { not: null } },
      select: { typePiece: true },
    });
    const identiteLocataire = await this.prisma.kycVerification.findFirst({
      where: { utilisateurId: contrat.locataireId, numeroPieceChiffre: { not: null } },
      select: { typePiece: true },
    });

    const signature = (role: RoleSignataire): string => {
      const s = contrat.signatures.find((x) => x.roleSignataire === role);
      return s ? `signé le ${this.gabarit.formaterDate(s.horodatage)}` : 'en attente';
    };

    const variables: Record<string, string> = {
      contrat_ref: contrat.reference,
      bien_ref: contrat.bienId.slice(0, 8).toUpperCase(),
      date_generation: this.gabarit.formaterDate(contrat.createdAt),

      bailleur_nom_complet: contrat.bailleur.nomComplet,
      // Le numéro de pièce est chiffré en base : seul son type figure au bail,
      // le numéro en clair étant produit sur demande justifiée.
      bailleur_piece_identite: identiteBailleur ? `${identiteBailleur.typePiece} vérifiée` : 'vérifiée',
      bailleur_adresse: contrat.bailleur.adresse ?? contrat.bien.adresse,
      bailleur_telephone: contrat.bailleur.telephone,
      bailleur_email: contrat.bailleur.email ?? 'non communiqué',

      locataire_nom_complet: contrat.locataire.nomComplet,
      locataire_piece_identite: identiteLocataire ? `${identiteLocataire.typePiece} vérifiée` : 'vérifiée',
      locataire_adresse: contrat.locataire.adresse ?? '—',
      locataire_telephone: contrat.locataire.telephone,
      locataire_email: contrat.locataire.email ?? 'non communiqué',

      bien_adresse: contrat.bien.adresse,
      bien_commune: contrat.bien.commune,
      bien_quartier: contrat.bien.quartier ?? '—',
      bien_type: contrat.bien.typeBien,
      bien_nb_pieces: String(contrat.bien.nbPieces ?? '—'),
      bien_dependances: contrat.bien.dependances ?? 'néant',
      bien_meuble_oui_non: contrat.bien.meuble ? 'Oui' : 'Non',

      duree_bail: `${contrat.dureeMois} mois`,
      date_prise_effet: this.gabarit.formaterDate(contrat.datePriseEffet),
      loyer_montant: this.gabarit.formaterMontant(contrat.loyerMontant),
      loyer_montant_lettres: `${this.gabarit.montantEnLettres(contrat.loyerMontant)} francs CFA`,
      jour_echeance: String(contrat.jourEcheance),

      caution_montant: this.gabarit.formaterMontant(contrat.cautionMontant),
      caution_nb_mois: String(contrat.cautionNbMois),
      delai_restitution_caution: String(contrat.delaiRestitutionCautionJours),
      avance_montant: this.gabarit.formaterMontant(contrat.avanceMontant),
      avance_nb_mois: String(contrat.avanceNbMois),

      charges_recuperables: 'selon décompte annuel',
      preavis_locataire: `${contrat.preavisLocataireJours} jours`,
      preavis_bailleur: `${contrat.preavisBailleurJours} jours`,
      jours_tolerance: String(contrat.joursTolerance),
      penalite_retard:
        contrat.penaliteRetardMontant > 0n
          ? `${this.gabarit.formaterMontant(contrat.penaliteRetardMontant)} FCFA`
          : 'néant',

      date_signature: this.gabarit.formaterDate(new Date()),
      bailleur_signature_horodatage: signature(RoleSignataire.bailleur),
      locataire_signature_horodatage: signature(RoleSignataire.locataire),
    };

    const html = this.gabarit.rendre(contrat.modele.contenuTemplate, variables);
    const document = await this.pdf.depuisHtml(html, contrat.reference);
    const empreinte = this.pdf.empreinte(document);

    const cle = this.stockage.construireCle(`contrats/${contrat.agenceId}`, 'pdf');
    await this.stockage.televerser(cle, document, 'application/pdf', 'prive');

    await this.prisma.contrat.update({
      where: { id: contratId },
      data: { documentUrl: cle, documentEmpreinteSha256: empreinte },
    });

    return { cle, empreinte };
  }

  /** Vérifie que l'utilisateur est partie au contrat et renvoie son rôle. */
  private roleAuContrat(
    contrat: { bailleurId: string; locataireId: string },
    utilisateur: UtilisateurConnecte,
  ): RoleSignataire {
    if (contrat.bailleurId === utilisateur.id) return RoleSignataire.bailleur;
    if (contrat.locataireId === utilisateur.id) return RoleSignataire.locataire;
    throw new ForbiddenException("Vous n'êtes pas partie à ce contrat.");
  }

  /**
   * Envoie le code de signature.
   * L'ordre est imposé : le bailleur signe d'abord. Un locataire qui signerait
   * un document que le bailleur peut encore refuser serait engagé unilatéralement.
   */
  async demanderCodeSignature(contratId: string, utilisateur: UtilisateurConnecte) {
    const contrat = await this.prisma.contrat.findUnique({
      where: { id: contratId },
      include: { signatures: true },
    });
    if (!contrat) throw new NotFoundException('Contrat introuvable.');

    const role = this.roleAuContrat(contrat, utilisateur);

    if (!SIGNABLES.includes(contrat.statut)) {
      throw new ConflictException(`Ce contrat est ${contrat.statut} : il n'est plus à signer.`);
    }
    if (contrat.signatures.some((s) => s.roleSignataire === role)) {
      throw new ConflictException('Vous avez déjà signé ce contrat.');
    }
    if (
      role === RoleSignataire.locataire &&
      !contrat.signatures.some((s) => s.roleSignataire === RoleSignataire.bailleur)
    ) {
      throw new ConflictException(
        'Le bailleur doit signer avant vous. Vous serez notifié dès que ce sera fait.',
      );
    }

    await this.auth.envoyerOtp(utilisateur.id, utilisateur.telephone, USAGE_OTP_SIGNATURE, contratId);

    return {
      message: 'Un code de signature vous a été envoyé par SMS.',
      expireDansSecondes: 300,
    };
  }

  /**
   * Signe le contrat après vérification du code.
   * L'empreinte enregistrée est celle du document au moment de la signature :
   * c'est ce qui permet de démontrer plus tard qu'il n'a pas été altéré.
   */
  async signer(
    contratId: string,
    code: string,
    utilisateur: UtilisateurConnecte,
    contexte: { ip?: string; userAgent?: string },
  ) {
    const contrat = await this.prisma.contrat.findUnique({
      where: { id: contratId },
      include: { signatures: true, bailleur: true, locataire: true },
    });
    if (!contrat) throw new NotFoundException('Contrat introuvable.');

    const role = this.roleAuContrat(contrat, utilisateur);
    if (!SIGNABLES.includes(contrat.statut)) {
      throw new ConflictException(`Ce contrat est ${contrat.statut} : il n'est plus à signer.`);
    }

    const otp = await this.prisma.otpCode.findFirst({
      where: {
        utilisateurId: utilisateur.id,
        usage: USAGE_OTP_SIGNATURE,
        contexteId: contratId,
        consommeLe: null,
        expireLe: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp || otp.tentatives >= 5) {
      throw new BadRequestException('Code invalide ou expiré.');
    }
    if (otp.codeHash !== createHash('sha256').update(code).digest('hex')) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { tentatives: { increment: 1 } },
      });
      throw new BadRequestException('Code invalide ou expiré.');
    }

    if (!contrat.documentEmpreinteSha256) {
      throw new ConflictException("Le document du contrat n'a pas encore été généré.");
    }

    await this.prisma.$transaction([
      this.prisma.otpCode.update({ where: { id: otp.id }, data: { consommeLe: new Date() } }),
      this.prisma.signature.create({
        data: {
          contratId,
          signataireId: utilisateur.id,
          roleSignataire: role,
          otpVerifieLe: new Date(),
          empreinteDocument: contrat.documentEmpreinteSha256,
          adresseIp: contexte.ip,
          userAgent: contexte.userAgent,
        },
      }),
      this.prisma.contrat.update({
        where: { id: contratId },
        data: { statut: StatutContrat.en_signature },
      }),
    ]);

    const total = contrat.signatures.length + 1;

    await this.audit.enregistrer({
      agenceId: contrat.agenceId,
      utilisateurId: utilisateur.id,
      action: 'contrat.signature',
      entiteType: 'contrat',
      entiteId: contratId,
      donneesApres: { role, empreinte: contrat.documentEmpreinteSha256, signaturesTotal: total },
    });

    if (role === RoleSignataire.bailleur) {
      await this.sms.envoyer(
        contrat.locataire.telephone,
        `Le bailleur a signe le bail ${contrat.reference}. Vous pouvez signer a votre tour sur la plateforme.`,
      );
    }

    // Deux signatures : le contrat devient actif et l'appel de fonds est ouvert.
    if (total >= 2) {
      await this.activer(contratId);
      return { message: 'Contrat signé par les deux parties. Il est désormais actif.', complet: true };
    }

    return { message: 'Signature enregistrée. En attente de la seconde partie.', complet: false };
  }

  /**
   * Active le contrat : régénère le PDF avec les mentions de signature,
   * crée l'échéancier et ouvre le compte de séquestre (REQ-CTR-04).
   */
  private async activer(contratId: string): Promise<void> {
    // Le PDF est régénéré pour porter les horodatages de signature ; la
    // nouvelle empreinte diffère donc de celle signée, laquelle reste
    // conservée dans le procès-verbal — c'est elle qui fait foi.
    await this.rendreEtArchiver(contratId);

    const contrat = await this.prisma.contrat.findUnique({
      where: { id: contratId },
      include: { locataire: true },
    });
    if (!contrat) return;

    const echeances: Prisma.EcheanceCreateManyInput[] = [];
    const priseEffet = contrat.datePriseEffet;

    if (contrat.cautionMontant > 0n) {
      echeances.push({
        contratId,
        type: TypeEcheance.caution,
        montantDu: contrat.cautionMontant,
        dateEcheance: priseEffet,
        statut: StatutEcheance.due,
      });
    }
    if (contrat.avanceMontant > 0n) {
      echeances.push({
        contratId,
        type: TypeEcheance.avance,
        montantDu: contrat.avanceMontant,
        dateEcheance: priseEffet,
        statut: StatutEcheance.due,
      });
    }
    if (contrat.fraisAgenceMontant > 0n) {
      echeances.push({
        contratId,
        type: TypeEcheance.frais_agence,
        montantDu: contrat.fraisAgenceMontant,
        dateEcheance: priseEffet,
        statut: StatutEcheance.due,
      });
    }

    // Échéancier de loyer sur toute la durée. L'avance versée s'impute sur les
    // premières échéances (art. 5 du bail) : elles sont créées mais couvertes.
    const moisCouverts = contrat.avanceNbMois;
    for (let mois = 0; mois < contrat.dureeMois; mois++) {
      const periode = new Date(priseEffet.getFullYear(), priseEffet.getMonth() + mois, 1);
      const echeance = new Date(
        periode.getFullYear(),
        periode.getMonth(),
        contrat.jourEcheance,
      );
      const couverte = mois < moisCouverts;

      echeances.push({
        contratId,
        type: TypeEcheance.loyer,
        periode,
        montantDu: contrat.loyerMontant + contrat.chargesMontant,
        montantPaye: couverte ? contrat.loyerMontant : 0n,
        dateEcheance: echeance,
        statut: couverte ? StatutEcheance.partielle : StatutEcheance.a_venir,
      });
    }

    await this.prisma.$transaction([
      this.prisma.echeance.createMany({ data: echeances, skipDuplicates: true }),
      this.prisma.compteSequestre.create({
        data: { contratId, montantInitial: contrat.cautionMontant, solde: 0n },
      }),
      this.prisma.contrat.update({
        where: { id: contratId },
        data: { statut: StatutContrat.actif },
      }),
    ]);

    await this.sms.envoyer(
      contrat.locataire.telephone,
      `Bail ${contrat.reference} actif. Montant a regler a la signature : ${this.gabarit.formaterMontant(contrat.cautionMontant + contrat.avanceMontant + contrat.fraisAgenceMontant)} FCFA.`,
    );

    await this.audit.enregistrer({
      agenceId: contrat.agenceId,
      action: 'contrat.activation',
      entiteType: 'contrat',
      entiteId: contratId,
      donneesApres: { echeancesCreees: echeances.length },
    });
  }

  async detail(id: string, utilisateur: UtilisateurConnecte) {
    const contrat = await this.prisma.contrat.findUnique({
      where: { id },
      include: {
        bien: { select: { adresse: true, commune: true, quartier: true, typeBien: true } },
        bailleur: { select: { nomComplet: true } },
        locataire: { select: { nomComplet: true } },
        signatures: { select: { roleSignataire: true, horodatage: true, empreinteDocument: true } },
        _count: { select: { echeances: true } },
      },
    });

    const introuvable = new NotFoundException('Contrat introuvable.');
    if (!contrat) throw introuvable;

    const partie =
      contrat.bailleurId === utilisateur.id || contrat.locataireId === utilisateur.id;
    if (!partie && !this.estSuperviseur(utilisateur)) throw introuvable;

    return contrat;
  }

  /** URL temporaire vers le PDF du contrat, réservée aux parties. */
  async urlDocument(id: string, utilisateur: UtilisateurConnecte) {
    const contrat = await this.prisma.contrat.findUnique({ where: { id } });

    const introuvable = new NotFoundException('Contrat introuvable.');
    if (!contrat) throw introuvable;

    const partie =
      contrat.bailleurId === utilisateur.id || contrat.locataireId === utilisateur.id;
    if (!partie && !this.estSuperviseur(utilisateur)) throw introuvable;
    if (!contrat.documentUrl) {
      throw new ConflictException("Le document n'a pas encore été généré.");
    }

    const url = await this.stockage.urlPresignee(contrat.documentUrl);

    await this.audit.enregistrer({
      agenceId: contrat.agenceId,
      utilisateurId: utilisateur.id,
      action: 'contrat.document.consultation',
      entiteType: 'contrat',
      entiteId: id,
    });

    return { url, expireDansSecondes: 300, empreinte: contrat.documentEmpreinteSha256 };
  }

  async lister(filtres: ListerContratsDto, utilisateur: UtilisateurConnecte) {
    const { page = 1, limite = 20, statut } = filtres;

    const where: Prisma.ContratWhereInput = {
      ...(this.estSuperviseur(utilisateur)
        ? {}
        : { OR: [{ bailleurId: utilisateur.id }, { locataireId: utilisateur.id }] }),
      ...(statut ? { statut } : {}),
    };

    const [total, donnees] = await this.prisma.$transaction([
      this.prisma.contrat.count({ where }),
      this.prisma.contrat.findMany({
        where,
        skip: (page - 1) * limite,
        take: limite,
        orderBy: { createdAt: 'desc' },
        include: {
          bien: { select: { commune: true, quartier: true, typeBien: true } },
          bailleur: { select: { nomComplet: true } },
          locataire: { select: { nomComplet: true } },
        },
      }),
    ]);

    return { donnees, pagination: { page, limite, total, pages: Math.ceil(total / limite) } };
  }

  /** Congé donné par l'une des parties (REQ-CTR-05). */
  async donnerPreavis(id: string, motif: string | undefined, utilisateur: UtilisateurConnecte) {
    const contrat = await this.prisma.contrat.findUnique({
      where: { id },
      include: { bailleur: true, locataire: true },
    });

    const introuvable = new NotFoundException('Contrat introuvable.');
    if (!contrat) throw introuvable;

    const role = this.roleAuContrat(contrat, utilisateur);
    if (contrat.statut !== StatutContrat.actif) {
      throw new ConflictException(`Un contrat ${contrat.statut} ne peut pas recevoir de congé.`);
    }

    const preavisJours =
      role === RoleSignataire.bailleur
        ? contrat.preavisBailleurJours
        : contrat.preavisLocataireJours;

    const finEffective = new Date();
    finEffective.setDate(finEffective.getDate() + preavisJours);

    const modifie = await this.prisma.contrat.update({
      where: { id },
      data: {
        statut: StatutContrat.en_preavis,
        preavisDonnePar: utilisateur.id,
        preavisLe: new Date(),
        finEffectiveLe: finEffective,
      },
    });

    const destinataire =
      role === RoleSignataire.bailleur ? contrat.locataire : contrat.bailleur;
    await this.sms.envoyer(
      destinataire.telephone,
      `Un conge a ete donne sur le bail ${contrat.reference}. Fin effective le ${finEffective.toLocaleDateString('fr-FR')}.`,
    );

    await this.audit.enregistrer({
      agenceId: contrat.agenceId,
      utilisateurId: utilisateur.id,
      action: 'contrat.preavis',
      entiteType: 'contrat',
      entiteId: id,
      donneesApres: { role, preavisJours, finEffectiveLe: finEffective.toISOString(), motif },
    });

    return modifie;
  }
}
