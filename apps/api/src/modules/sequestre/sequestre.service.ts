/**
 * Service Séquestre — dépôt, retenues, restitution de la caution.
 *
 * Ce module traite le litige numéro un du marché locatif : la caution non
 * restituée. Le mécanisme retenu est la co-validation — aucune retenue ni
 * restitution n'est exécutée sans l'accord des deux parties, ou à défaut sans
 * décision d'arbitrage. La contrainte SQL `mvt_covalidation` posée dès la
 * conception du schéma garantit cette règle au niveau du moteur : même un
 * défaut applicatif ne peut produire un mouvement unilatéral.
 *
 * Règles appliquées :
 *  - REQ-PAY-08 : la caution reste sous séquestre pendant toute la durée du
 *    bail ; elle n'appartient ni au bailleur ni à la plateforme.
 *  - RG-PAY-A : restitution co-validée, retenues justifiées par pièce.
 *  - REQ-LIT-02 : les fonds sont gelés pendant l'instruction d'un litige.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 *          Ingénieur Système & Infrastructure Cloud / System Architect
 *          Expert Solutions ICT (Cloud, Système, Cybersécurité)
 * Date   : 13 août 2026
 */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import {
  Prisma,
  StatutSequestre,
  TypeMvtSequestre,
  StatutContrat,
  RoleUtilisateur,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { SmsService } from '../notifications/sms.service';
import { StockageService } from '../medias/stockage.service';
import { FichiersService } from '../medias/fichiers.service';
import { GabaritService } from '../contrats/gabarit.service';
import type { UtilisateurConnecte } from '../auth/jwt.strategy';
import { ProposerRetenueDto, ProposerRestitutionDto } from './dto/sequestre.dto';

/** Rôle d'une partie vis-à-vis du séquestre. */
type PartieSequestre = 'bailleur' | 'locataire';

/** Mouvements soumis à co-validation des deux parties. */
const MVT_COVALIDES: TypeMvtSequestre[] = [
  TypeMvtSequestre.retenue,
  TypeMvtSequestre.restitution,
];

@Injectable()
export class SequestreService {
  private readonly logger = new Logger(SequestreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sms: SmsService,
    private readonly stockage: StockageService,
    private readonly fichiers: FichiersService,
    private readonly gabarit: GabaritService,
  ) {}

  private estSuperviseur(utilisateur: UtilisateurConnecte): boolean {
    const roles: RoleUtilisateur[] = [RoleUtilisateur.admin, RoleUtilisateur.agence];
    return utilisateur.roles.some((r) => roles.includes(r as RoleUtilisateur));
  }

  /** Charge le compte et détermine le rôle de l'appelant. */
  private async compteEtRole(contratId: string, utilisateur: UtilisateurConnecte) {
    const compte = await this.prisma.compteSequestre.findUnique({
      where: { contratId },
      include: {
        contrat: {
          select: {
            id: true,
            reference: true,
            agenceId: true,
            statut: true,
            bailleurId: true,
            locataireId: true,
            delaiRestitutionCautionJours: true,
            finEffectiveLe: true,
            bailleur: { select: { telephone: true } },
            locataire: { select: { telephone: true } },
          },
        },
        mouvements: { orderBy: { createdAt: 'asc' } },
      },
    });

    const introuvable = new NotFoundException('Compte de séquestre introuvable.');
    if (!compte) throw introuvable;

    let role: PartieSequestre | null = null;
    if (compte.contrat.bailleurId === utilisateur.id) role = 'bailleur';
    else if (compte.contrat.locataireId === utilisateur.id) role = 'locataire';
    else if (!this.estSuperviseur(utilisateur)) throw introuvable;

    return { compte, role };
  }

  /** État du séquestre et détail des mouvements. */
  async consulter(contratId: string, utilisateur: UtilisateurConnecte) {
    const { compte } = await this.compteEtRole(contratId, utilisateur);

    const retenuesValidees = compte.mouvements
      .filter((m) => m.type === TypeMvtSequestre.retenue && m.executeLe)
      .reduce((total, m) => total + m.montant, 0n);

    const propositionsEnCours = compte.mouvements.filter(
      (m) =>
        MVT_COVALIDES.includes(m.type) &&
        !m.executeLe,
    );

    return {
      contrat: { id: compte.contrat.id, reference: compte.contrat.reference },
      montantInitial: compte.montantInitial,
      solde: compte.solde,
      statut: compte.statut,
      retenuesValidees,
      soldeRestituable: compte.solde,
      delaiRestitutionJours: compte.contrat.delaiRestitutionCautionJours,
      propositionsEnCours: propositionsEnCours.map((m) => ({
        id: m.id,
        type: m.type,
        montant: m.montant,
        valideBailleur: m.valideBailleurLe !== null,
        valideLocataire: m.valideLocataireLe !== null,
        createdAt: m.createdAt,
      })),
      mouvements: compte.mouvements.map((m) => ({
        id: m.id,
        type: m.type,
        montant: m.montant,
        executeLe: m.executeLe,
        createdAt: m.createdAt,
      })),
    };
  }

  /**
   * Le bailleur propose une retenue, pièce justificative à l'appui.
   * Le justificatif est exigé : une retenue sans devis ni facture est
   * précisément ce que la co-validation vise à empêcher.
   */
  async proposerRetenue(
    contratId: string,
    dto: ProposerRetenueDto,
    justificatif: { buffer: Buffer; size: number } | undefined,
    utilisateur: UtilisateurConnecte,
  ) {
    const { compte, role } = await this.compteEtRole(contratId, utilisateur);

    if (role !== 'bailleur' && !this.estSuperviseur(utilisateur)) {
      throw new ForbiddenException('Seul le bailleur peut proposer une retenue.');
    }
    if (compte.statut === StatutSequestre.gele) {
      throw new ConflictException(
        'Les fonds sont gelés pendant l’instruction du litige : aucune retenue possible.',
      );
    }
    if (compte.statut === StatutSequestre.clos) {
      throw new ConflictException('Ce séquestre est clos.');
    }
    // La retenue se justifie par l'état des lieux de sortie : la proposer
    // pendant que le bail court n'aurait pas de fondement.
    if (
      compte.contrat.statut !== StatutContrat.en_preavis &&
      compte.contrat.statut !== StatutContrat.termine
    ) {
      throw new ConflictException(
        "Une retenue ne peut être proposée qu'à compter du congé, sur la base de l'état des lieux de sortie.",
      );
    }
    if (!justificatif) {
      throw new BadRequestException(
        'Un justificatif est obligatoire : devis, facture ou constat de sortie.',
      );
    }

    const montant = BigInt(dto.montant);
    if (montant <= 0n) throw new BadRequestException('Le montant doit être positif.');
    if (montant > compte.solde) {
      throw new BadRequestException(
        `La retenue dépasse le solde du séquestre (${compte.solde} FCFA).`,
      );
    }

    const { typeMime, extension } = this.fichiers.validerDocument(
      justificatif.buffer,
      justificatif.size,
    );
    const cle = this.stockage.construireCle(`sequestres/${compte.id}`, extension);
    await this.stockage.televerser(cle, justificatif.buffer, typeMime, 'prive');

    const mouvement = await this.prisma.mouvementSequestre.create({
      data: {
        compteId: compte.id,
        type: TypeMvtSequestre.retenue,
        montant,
        justificatifUrl: cle,
        // Le proposant vaut validation de son côté.
        valideBailleurLe: new Date(),
      },
    });

    await this.sms.envoyer(
      compte.contrat.locataire.telephone,
      `Retenue de ${this.gabarit.formaterMontant(montant)} FCFA proposee sur votre caution ` +
      `(bail ${compte.contrat.reference}). Consultez le justificatif et donnez votre accord sur la plateforme.`,
    );

    await this.audit.enregistrer({
      agenceId: compte.contrat.agenceId,
      utilisateurId: utilisateur.id,
      action: 'sequestre.retenue.proposition',
      entiteType: 'compte_sequestre',
      entiteId: compte.id,
      donneesApres: { mouvementId: mouvement.id, montant: montant.toString(), motif: dto.motif },
    });

    return {
      id: mouvement.id,
      type: mouvement.type,
      montant: mouvement.montant,
      enAttenteDe: 'locataire',
    };
  }

  /**
   * Propose la restitution du solde au locataire.
   * Le bailleur peut la proposer directement s'il n'a aucune retenue à faire,
   * ce qui est le cas le plus fréquent et doit rester le plus simple.
   */
  async proposerRestitution(
    contratId: string,
    dto: ProposerRestitutionDto,
    utilisateur: UtilisateurConnecte,
  ) {
    const { compte, role } = await this.compteEtRole(contratId, utilisateur);

    if (compte.statut === StatutSequestre.gele) {
      throw new ConflictException("Les fonds sont gelés pendant l'instruction du litige.");
    }
    if (compte.statut === StatutSequestre.clos) {
      throw new ConflictException('Ce séquestre est clos.');
    }
    if (
      compte.contrat.statut !== StatutContrat.en_preavis &&
      compte.contrat.statut !== StatutContrat.termine
    ) {
      throw new ConflictException(
        "La restitution ne peut intervenir qu'en fin de bail.",
      );
    }

    const enCours = await this.prisma.mouvementSequestre.findFirst({
      where: {
        compteId: compte.id,
        type: TypeMvtSequestre.restitution,
        executeLe: null,
      },
    });
    if (enCours) {
      throw new ConflictException('Une restitution est déjà en cours de validation.');
    }

    const montant = dto.montant ? BigInt(dto.montant) : compte.solde;
    if (montant <= 0n) throw new BadRequestException('Le montant doit être positif.');
    if (montant > compte.solde) {
      throw new BadRequestException(
        `Le montant dépasse le solde du séquestre (${compte.solde} FCFA).`,
      );
    }

    const mouvement = await this.prisma.mouvementSequestre.create({
      data: {
        compteId: compte.id,
        type: TypeMvtSequestre.restitution,
        montant,
        valideBailleurLe: role === 'bailleur' ? new Date() : null,
        valideLocataireLe: role === 'locataire' ? new Date() : null,
      },
    });

    const destinataire =
      role === 'bailleur'
        ? compte.contrat.locataire.telephone
        : compte.contrat.bailleur.telephone;

    await this.sms.envoyer(
      destinataire,
      `Restitution de ${this.gabarit.formaterMontant(montant)} FCFA proposee sur la caution ` +
      `(bail ${compte.contrat.reference}). Validez-la sur la plateforme.`,
    );

    await this.audit.enregistrer({
      agenceId: compte.contrat.agenceId,
      utilisateurId: utilisateur.id,
      action: 'sequestre.restitution.proposition',
      entiteType: 'compte_sequestre',
      entiteId: compte.id,
      donneesApres: { mouvementId: mouvement.id, montant: montant.toString(), proposePar: role },
    });

    return {
      id: mouvement.id,
      type: mouvement.type,
      montant: mouvement.montant,
      enAttenteDe: role === 'bailleur' ? 'locataire' : 'bailleur',
    };
  }

  /**
   * Validation par la seconde partie.
   * Lorsque les deux accords sont réunis, le mouvement est exécuté dans une
   * transaction unique : marquage, débit du solde, et clôture le cas échéant.
   */
  async valider(mouvementId: string, utilisateur: UtilisateurConnecte) {
    const mouvement = await this.prisma.mouvementSequestre.findUnique({
      where: { id: mouvementId },
      include: {
        compte: {
          include: {
            contrat: {
              select: {
                agenceId: true,
                reference: true,
                bailleurId: true,
                locataireId: true,
                bailleur: { select: { telephone: true } },
                locataire: { select: { telephone: true } },
              },
            },
          },
        },
      },
    });

    const introuvable = new NotFoundException('Proposition introuvable.');
    if (!mouvement) throw introuvable;

    const contrat = mouvement.compte.contrat;
    let role: PartieSequestre | null = null;
    if (contrat.bailleurId === utilisateur.id) role = 'bailleur';
    else if (contrat.locataireId === utilisateur.id) role = 'locataire';
    else if (!this.estSuperviseur(utilisateur)) throw introuvable;

    if (mouvement.executeLe) {
      throw new ConflictException('Cette proposition est déjà exécutée.');
    }
    if (mouvement.compte.statut === StatutSequestre.gele) {
      throw new ConflictException("Les fonds sont gelés pendant l'instruction du litige.");
    }
    if (role === 'bailleur' && mouvement.valideBailleurLe) {
      throw new ConflictException('Vous avez déjà validé cette proposition.');
    }
    if (role === 'locataire' && mouvement.valideLocataireLe) {
      throw new ConflictException('Vous avez déjà validé cette proposition.');
    }

    const maintenant = new Date();
    const valideBailleur = mouvement.valideBailleurLe ?? (role === 'bailleur' ? maintenant : null);
    const valideLocataire =
      mouvement.valideLocataireLe ?? (role === 'locataire' ? maintenant : null);

    const complet = valideBailleur !== null && valideLocataire !== null;

    if (!complet) {
      const misAJour = await this.prisma.mouvementSequestre.update({
        where: { id: mouvementId },
        data: { valideBailleurLe: valideBailleur, valideLocataireLe: valideLocataire },
      });

      await this.audit.enregistrer({
        agenceId: contrat.agenceId,
        utilisateurId: utilisateur.id,
        action: 'sequestre.validation.partielle',
        entiteType: 'mouvement_sequestre',
        entiteId: mouvementId,
        donneesApres: { role },
      });

      return {
        id: misAJour.id,
        execute: false,
        enAttenteDe: valideBailleur ? 'locataire' : 'bailleur',
      };
    }

    // Les deux accords sont réunis : le mouvement peut être exécuté. La
    // contrainte SQL `mvt_covalidation` refuserait l'écriture sans eux.
    const nouveauSolde = mouvement.compte.solde - mouvement.montant;
    if (nouveauSolde < 0n) {
      throw new ConflictException(
        'Le solde du séquestre est insuffisant : la proposition doit être révisée.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.mouvementSequestre.update({
        where: { id: mouvementId },
        data: {
          valideBailleurLe: valideBailleur,
          valideLocataireLe: valideLocataire,
          executeLe: maintenant,
        },
      }),
      this.prisma.compteSequestre.update({
        where: { id: mouvement.compteId },
        data: {
          solde: nouveauSolde,
          statut: nouveauSolde === 0n ? StatutSequestre.clos : mouvement.compte.statut,
        },
      }),
    ]);

    const libelle =
      mouvement.type === TypeMvtSequestre.restitution ? 'restituee' : 'retenue';

    await this.sms.envoyer(
      contrat.locataire.telephone,
      `Caution : ${this.gabarit.formaterMontant(mouvement.montant)} FCFA ${libelle} ` +
      `(bail ${contrat.reference}). Solde restant : ${this.gabarit.formaterMontant(nouveauSolde)} FCFA.`,
    );

    await this.audit.enregistrer({
      agenceId: contrat.agenceId,
      utilisateurId: utilisateur.id,
      action: `sequestre.${mouvement.type}.execution`,
      entiteType: 'mouvement_sequestre',
      entiteId: mouvementId,
      donneesApres: {
        montant: mouvement.montant.toString(),
        soldeApres: nouveauSolde.toString(),
      },
    });

    this.logger.log(
      `Séquestre ${contrat.reference} : ${mouvement.type} de ${mouvement.montant} exécutée, solde ${nouveauSolde}`,
    );

    return { id: mouvementId, execute: true, soldeRestant: nouveauSolde };
  }

  /** Refus d'une proposition : elle est retirée, la voie du litige reste ouverte. */
  async refuser(mouvementId: string, motif: string | undefined, utilisateur: UtilisateurConnecte) {
    const mouvement = await this.prisma.mouvementSequestre.findUnique({
      where: { id: mouvementId },
      include: {
        compte: {
          include: {
            contrat: {
              select: {
                agenceId: true,
                reference: true,
                bailleurId: true,
                locataireId: true,
                bailleur: { select: { telephone: true } },
                locataire: { select: { telephone: true } },
              },
            },
          },
        },
      },
    });

    const introuvable = new NotFoundException('Proposition introuvable.');
    if (!mouvement) throw introuvable;

    const contrat = mouvement.compte.contrat;
    const partie =
      contrat.bailleurId === utilisateur.id || contrat.locataireId === utilisateur.id;
    if (!partie && !this.estSuperviseur(utilisateur)) throw introuvable;

    if (mouvement.executeLe) {
      throw new ConflictException('Cette proposition est déjà exécutée.');
    }

    await this.prisma.mouvementSequestre.delete({ where: { id: mouvementId } });

    const destinataire =
      contrat.bailleurId === utilisateur.id
        ? contrat.locataire.telephone
        : contrat.bailleur.telephone;

    await this.sms.envoyer(
      destinataire,
      `La proposition sur la caution du bail ${contrat.reference} a ete refusee. ` +
      `Un accord amiable ou un litige peut etre ouvert sur la plateforme.`,
    );

    await this.audit.enregistrer({
      agenceId: contrat.agenceId,
      utilisateurId: utilisateur.id,
      action: 'sequestre.proposition.refus',
      entiteType: 'mouvement_sequestre',
      entiteId: mouvementId,
      donneesAvant: { type: mouvement.type, montant: mouvement.montant.toString() },
      donneesApres: { motif },
    });

    return { message: 'Proposition refusée. Vous pouvez ouvrir un litige si aucun accord n’est trouvé.' };
  }

  /**
   * Gèle ou dégèle les fonds (REQ-LIT-02).
   * Réservé à l'administrateur, qui instruit le litige : laisser une partie
   * geler unilatéralement en ferait un moyen de pression.
   */
  async definirGel(
    contratId: string,
    geler: boolean,
    litigeId: string | undefined,
    utilisateur: UtilisateurConnecte,
  ) {
    if (!this.estSuperviseur(utilisateur)) {
      throw new ForbiddenException("Seul l'administrateur peut geler ou dégeler les fonds.");
    }

    const compte = await this.prisma.compteSequestre.findUnique({
      where: { contratId },
      include: { contrat: { select: { agenceId: true, reference: true } } },
    });
    if (!compte) throw new NotFoundException('Compte de séquestre introuvable.');
    if (compte.statut === StatutSequestre.clos) {
      throw new ConflictException('Ce séquestre est clos.');
    }

    const statut = geler ? StatutSequestre.gele : StatutSequestre.actif;

    await this.prisma.$transaction([
      this.prisma.compteSequestre.update({ where: { id: compte.id }, data: { statut } }),
      this.prisma.mouvementSequestre.create({
        data: {
          compteId: compte.id,
          type: geler ? TypeMvtSequestre.gel : TypeMvtSequestre.degel,
          montant: 0n,
          litigeId,
          executeLe: new Date(),
        },
      }),
    ]);

    await this.audit.enregistrer({
      agenceId: compte.contrat.agenceId,
      utilisateurId: utilisateur.id,
      action: geler ? 'sequestre.gel' : 'sequestre.degel',
      entiteType: 'compte_sequestre',
      entiteId: compte.id,
      donneesApres: { litigeId },
    });

    return { statut, message: geler ? 'Fonds gelés.' : 'Fonds dégelés.' };
  }

  /**
   * Exécution d'office sur décision de litige.
   * La contrainte SQL accepte un mouvement sans co-validation dès lors qu'il
   * porte une référence de litige : c'est la voie de sortie quand les parties
   * ne s'accordent pas.
   */
  async executerSurDecision(
    contratId: string,
    litigeId: string,
    montantRetenu: bigint,
    utilisateur: UtilisateurConnecte,
  ) {
    if (!this.estSuperviseur(utilisateur)) {
      throw new ForbiddenException("Seul l'administrateur peut exécuter une décision de litige.");
    }

    const compte = await this.prisma.compteSequestre.findUnique({
      where: { contratId },
      include: {
        contrat: {
          select: {
            agenceId: true,
            reference: true,
            locataire: { select: { telephone: true } },
          },
        },
      },
    });
    if (!compte) throw new NotFoundException('Compte de séquestre introuvable.');
    if (montantRetenu > compte.solde) {
      throw new BadRequestException('La retenue décidée dépasse le solde du séquestre.');
    }

    const restitue = compte.solde - montantRetenu;
    const operations: Prisma.PrismaPromise<unknown>[] = [];

    if (montantRetenu > 0n) {
      operations.push(
        this.prisma.mouvementSequestre.create({
          data: {
            compteId: compte.id,
            type: TypeMvtSequestre.retenue,
            montant: montantRetenu,
            litigeId,
            executeLe: new Date(),
          },
        }),
      );
    }
    if (restitue > 0n) {
      operations.push(
        this.prisma.mouvementSequestre.create({
          data: {
            compteId: compte.id,
            type: TypeMvtSequestre.restitution,
            montant: restitue,
            litigeId,
            executeLe: new Date(),
          },
        }),
      );
    }

    operations.push(
      this.prisma.compteSequestre.update({
        where: { id: compte.id },
        data: { solde: 0n, statut: StatutSequestre.clos },
      }),
    );

    await this.prisma.$transaction(operations);

    await this.sms.envoyer(
      compte.contrat.locataire.telephone,
      `Decision rendue sur la caution du bail ${compte.contrat.reference} : ` +
      `${this.gabarit.formaterMontant(restitue)} FCFA vous sont restitues.`,
    );

    await this.audit.enregistrer({
      agenceId: compte.contrat.agenceId,
      utilisateurId: utilisateur.id,
      action: 'sequestre.decision.execution',
      entiteType: 'compte_sequestre',
      entiteId: compte.id,
      donneesApres: {
        litigeId,
        retenu: montantRetenu.toString(),
        restitue: restitue.toString(),
      },
    });

    return { retenu: montantRetenu, restitue, statut: StatutSequestre.clos };
  }
}
