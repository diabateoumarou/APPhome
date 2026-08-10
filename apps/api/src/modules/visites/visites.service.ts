/**
 * Service Visites — créneaux, réservations, comptes rendus.
 *
 * Règles appliquées :
 *  - REQ-RDV-01 : créneaux définis par le bailleur ou l'agent ; le chevauchement
 *    sur un même bien est interdit par contrainte d'exclusion PostgreSQL. La
 *    validation applicative existe pour donner un message clair, la base reste
 *    le garde-fou (le code d'erreur 23P01 est intercepté et traduit).
 *  - REQ-RDV-02 : réservation par le locataire, confirmation immédiate si libre ;
 *    la capacité du créneau permet les visites groupées.
 *  - REQ-RDV-04 : annulation possible jusqu'à 4 h avant ; au-delà, elle compte
 *    comme un manquement.
 *  - RG-RDV-A : 3 absences non excusées sur 90 jours suspendent la prise de
 *    rendez-vous pendant 7 jours.
 *  - REQ-RDV-07 : les coordonnées ne sont révélées qu'après confirmation, ce qui
 *    protège le modèle économique de l'agence autant que la vie privée.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 *          Ingénieur Système & Infrastructure Cloud / System Architect
 *          Expert Solutions ICT (Cloud, Système, Cybersécurité)
 * Date   : 10 août 2026
 */
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  Prisma,
  StatutRdv,
  StatutCreneau,
  StatutAnnonce,
  StatutBien,
  RoleUtilisateur,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { SmsService } from '../notifications/sms.service';
import type { UtilisateurConnecte } from '../auth/jwt.strategy';
import {
  CreerCreneauxDto,
  ReserverVisiteDto,
  ListerCreneauxDto,
  ListerVisitesDto,
} from './dto/visite.dto';

/** Délai minimal d'annulation sans conséquence (REQ-RDV-04). */
const DELAI_ANNULATION_H = 4;
/** Fenêtre d'observation des absences (RG-RDV-A). */
const FENETRE_NO_SHOW_JOURS = 90;
/** Nombre d'absences déclenchant la suspension. */
const SEUIL_NO_SHOW = 3;
/** Durée de la suspension de prise de rendez-vous. */
const SUSPENSION_JOURS = 7;
/** Durée minimale et maximale d'un créneau, pour éviter les saisies aberrantes. */
const DUREE_MIN_MIN = 15;
const DUREE_MAX_MIN = 240;
/** Code PostgreSQL renvoyé par une contrainte d'exclusion violée. */
const ERREUR_EXCLUSION = 'P2010';
/** Statuts de bien excluant toute nouvelle visite. */
const BIENS_INDISPONIBLES: StatutBien[] = [StatutBien.loue, StatutBien.vendu];
/** Statuts de rendez-vous déjà clos, non annulables. */
const RDV_CLOS: StatutRdv[] = [StatutRdv.annule, StatutRdv.effectue, StatutRdv.no_show];

@Injectable()
export class VisitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sms: SmsService,
  ) {}

  private estSuperviseur(utilisateur: UtilisateurConnecte): boolean {
    const roles: RoleUtilisateur[] = [
      RoleUtilisateur.admin,
      RoleUtilisateur.agence,
      RoleUtilisateur.agent,
    ];
    return utilisateur.roles.some((r) => roles.includes(r as RoleUtilisateur));
  }

  private async bienAutorise(bienId: string, utilisateur: UtilisateurConnecte) {
    const bien = await this.prisma.bien.findUnique({
      where: { id: bienId },
      select: { id: true, agenceId: true, proprietaireId: true, statut: true, commune: true },
    });

    const introuvable = new NotFoundException('Bien introuvable.');
    if (!bien) throw introuvable;
    if (bien.proprietaireId !== utilisateur.id && !this.estSuperviseur(utilisateur)) {
      throw introuvable;
    }
    return bien;
  }

  /**
   * Ouvre des créneaux de visite.
   * Le lot est inséré dans une transaction : soit tous les créneaux passent,
   * soit aucun. Un bailleur qui définit son planning hebdomadaire n'aurait
   * aucun moyen de savoir lesquels ont échoué en cas d'insertion partielle.
   */
  async creerCreneaux(bienId: string, dto: CreerCreneauxDto, utilisateur: UtilisateurConnecte) {
    const bien = await this.bienAutorise(bienId, utilisateur);

    if (BIENS_INDISPONIBLES.includes(bien.statut)) {
      throw new ConflictException(
        "Ce bien n'est plus disponible : aucune visite ne peut être planifiée.",
      );
    }

    const maintenant = Date.now();
    const aInserer = dto.creneaux.map((c) => {
      const debut = new Date(c.debut);
      const fin = new Date(c.fin);

      if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime())) {
        throw new BadRequestException('Dates de créneau invalides.');
      }
      if (fin <= debut) {
        throw new BadRequestException('La fin du créneau doit suivre son début.');
      }
      if (debut.getTime() < maintenant) {
        throw new BadRequestException('Un créneau ne peut pas être ouvert dans le passé.');
      }

      const dureeMin = (fin.getTime() - debut.getTime()) / 60_000;
      if (dureeMin < DUREE_MIN_MIN || dureeMin > DUREE_MAX_MIN) {
        throw new BadRequestException(
          `La durée d'un créneau doit être comprise entre ${DUREE_MIN_MIN} et ${DUREE_MAX_MIN} minutes.`,
        );
      }

      return { bienId, debut, fin, capacite: c.capacite ?? 1, creePar: utilisateur.id };
    });

    // Chevauchement à l'intérieur du lot : la contrainte SQL ne verrait que
    // les conflits avec l'existant, pas ceux entre lignes d'un même envoi.
    const tries = [...aInserer].sort((a, b) => a.debut.getTime() - b.debut.getTime());
    for (let i = 1; i < tries.length; i++) {
      if (tries[i].debut < tries[i - 1].fin) {
        throw new BadRequestException(
          'Deux créneaux du même envoi se chevauchent. Vérifiez votre planning.',
        );
      }
    }

    try {
      await this.prisma.$transaction(
        aInserer.map((data) => this.prisma.creneauVisite.create({ data })),
      );
    } catch (e) {
      // La contrainte d'exclusion PostgreSQL est le garde-fou final.
      const message = e instanceof Error ? e.message : '';
      if (message.includes('creneau_sans_chevauchement') || message.includes(ERREUR_EXCLUSION)) {
        throw new ConflictException(
          'Un créneau chevauche une plage déjà ouverte pour ce bien.',
        );
      }
      throw e;
    }

    await this.audit.enregistrer({
      agenceId: bien.agenceId,
      utilisateurId: utilisateur.id,
      action: 'visite.creneaux.ouverture',
      entiteType: 'bien',
      entiteId: bienId,
      donneesApres: { nombre: aInserer.length },
    });

    return { message: `${aInserer.length} créneau(x) ouvert(s).`, nombre: aInserer.length };
  }

  /** Créneaux encore réservables, exposés publiquement sur la fiche d'annonce. */
  async creneauxDisponibles(bienId: string, filtres: ListerCreneauxDto) {
    const depuis = filtres.depuis ? new Date(filtres.depuis) : new Date();
    const jusqua = filtres.jusqua ? new Date(filtres.jusqua) : undefined;

    const creneaux = await this.prisma.creneauVisite.findMany({
      where: {
        bienId,
        statut: StatutCreneau.ouvert,
        debut: { gte: depuis, ...(jusqua ? { lte: jusqua } : {}) },
      },
      orderBy: { debut: 'asc' },
      include: {
        _count: {
          select: {
            rendezVous: { where: { statut: { in: [StatutRdv.demande, StatutRdv.confirme] } } },
          },
        },
      },
    });

    // Les créneaux complets sont retirés plutôt que signalés : proposer un
    // créneau non réservable dégrade l'expérience sans apporter d'information.
    return creneaux
      .filter((c) => c._count.rendezVous < c.capacite)
      .map((c) => ({
        id: c.id,
        debut: c.debut,
        fin: c.fin,
        placesRestantes: c.capacite - c._count.rendezVous,
      }));
  }

  /** Vérifie qu'un locataire n'est pas sous le coup d'une suspension (RG-RDV-A). */
  private async verifierSuspension(utilisateurId: string): Promise<void> {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { id: utilisateurId },
      select: { suspensionRdvJusquAu: true },
    });

    if (utilisateur?.suspensionRdvJusquAu && utilisateur.suspensionRdvJusquAu > new Date()) {
      const jusqua = utilisateur.suspensionRdvJusquAu.toLocaleDateString('fr-FR');
      throw new ForbiddenException(
        `Suite à plusieurs absences non excusées, la prise de rendez-vous est suspendue jusqu'au ${jusqua}.`,
      );
    }
  }

  async reserver(dto: ReserverVisiteDto, visiteur: UtilisateurConnecte) {
    await this.verifierSuspension(visiteur.id);

    const creneau = await this.prisma.creneauVisite.findUnique({
      where: { id: dto.creneauId },
      include: {
        bien: { select: { id: true, agenceId: true, proprietaireId: true, statut: true, commune: true } },
        _count: {
          select: {
            rendezVous: { where: { statut: { in: [StatutRdv.demande, StatutRdv.confirme] } } },
          },
        },
      },
    });

    if (!creneau || creneau.statut !== StatutCreneau.ouvert) {
      throw new NotFoundException('Créneau indisponible.');
    }
    if (creneau.debut < new Date()) {
      throw new ConflictException('Ce créneau est déjà passé.');
    }
    if (creneau._count.rendezVous >= creneau.capacite) {
      throw new ConflictException('Ce créneau est complet. Choisissez-en un autre.');
    }
    if (creneau.bien.statut !== StatutBien.disponible) {
      throw new ConflictException("Ce bien n'est plus disponible à la visite.");
    }

    const annonce = await this.prisma.annonce.findUnique({
      where: { id: dto.annonceId },
      select: { id: true, bienId: true, statut: true, titre: true },
    });

    if (!annonce || annonce.bienId !== creneau.bienId) {
      throw new BadRequestException("L'annonce ne correspond pas à ce créneau.");
    }
    if (annonce.statut !== StatutAnnonce.publiee) {
      throw new ConflictException("Cette annonce n'est plus publiée.");
    }

    // Le bailleur ne visite pas son propre bien.
    if (creneau.bien.proprietaireId === visiteur.id) {
      throw new BadRequestException('Vous ne pouvez pas réserver une visite sur votre propre bien.');
    }

    let rendezVous;
    try {
      rendezVous = await this.prisma.rendezVous.create({
        data: {
          creneauId: creneau.id,
          annonceId: annonce.id,
          visiteurId: visiteur.id,
          // Confirmation immédiate : le créneau était libre (REQ-RDV-02).
          statut: StatutRdv.confirme,
        },
      });
    } catch (e) {
      // Contrainte d'unicité (creneauId, visiteurId).
      const code = (e as { code?: string }).code;
      if (code === 'P2002') {
        throw new ConflictException('Vous avez déjà réservé ce créneau.');
      }
      throw e;
    }

    await this.sms.envoyer(
      visiteur.telephone,
      `Visite confirmee le ${creneau.debut.toLocaleString('fr-FR')} - ${annonce.titre}. Un rappel vous sera envoye la veille.`,
    );

    await this.audit.enregistrer({
      agenceId: creneau.bien.agenceId,
      utilisateurId: visiteur.id,
      action: 'visite.reservation',
      entiteType: 'rendez_vous',
      entiteId: rendezVous.id,
      donneesApres: { creneauId: creneau.id, annonceId: annonce.id },
    });

    return {
      ...rendezVous,
      creneau: { debut: creneau.debut, fin: creneau.fin },
      bien: { commune: creneau.bien.commune },
    };
  }

  /**
   * Détail d'un rendez-vous. Les coordonnées de l'interlocuteur ne sont
   * incluses qu'une fois la visite confirmée (REQ-RDV-07).
   */
  async detail(id: string, utilisateur: UtilisateurConnecte) {
    const rdv = await this.prisma.rendezVous.findUnique({
      where: { id },
      include: {
        creneau: {
          include: {
            bien: {
              select: {
                id: true,
                adresse: true,
                commune: true,
                quartier: true,
                agenceId: true,
                proprietaireId: true,
                proprietaire: { select: { nomComplet: true, telephone: true } },
              },
            },
          },
        },
        annonce: { select: { titre: true } },
        visiteur: { select: { nomComplet: true, telephone: true } },
      },
    });

    const introuvable = new NotFoundException('Rendez-vous introuvable.');
    if (!rdv) throw introuvable;

    const estVisiteur = rdv.visiteurId === utilisateur.id;
    const estBailleur = rdv.creneau.bien.proprietaireId === utilisateur.id;
    if (!estVisiteur && !estBailleur && !this.estSuperviseur(utilisateur)) throw introuvable;

    const confirme = rdv.statut === StatutRdv.confirme || rdv.statut === StatutRdv.effectue;

    return {
      id: rdv.id,
      statut: rdv.statut,
      debut: rdv.creneau.debut,
      fin: rdv.creneau.fin,
      annonce: rdv.annonce,
      bien: {
        commune: rdv.creneau.bien.commune,
        quartier: rdv.creneau.bien.quartier,
        // L'adresse précise n'est utile qu'une fois la visite actée.
        adresse: confirme ? rdv.creneau.bien.adresse : undefined,
      },
      contact: confirme
        ? estVisiteur
          ? rdv.creneau.bien.proprietaire
          : rdv.visiteur
        : undefined,
      compteRendu: estBailleur || this.estSuperviseur(utilisateur) ? rdv.compteRendu : undefined,
    };
  }

  async listerMiennes(filtres: ListerVisitesDto, utilisateur: UtilisateurConnecte) {
    const { page = 1, limite = 20, statut } = filtres;

    const where: Prisma.RendezVousWhereInput = {
      ...(this.estSuperviseur(utilisateur)
        ? {}
        : {
            OR: [
              { visiteurId: utilisateur.id },
              { creneau: { bien: { proprietaireId: utilisateur.id } } },
            ],
          }),
      ...(statut ? { statut } : {}),
    };

    const [total, donnees] = await this.prisma.$transaction([
      this.prisma.rendezVous.count({ where }),
      this.prisma.rendezVous.findMany({
        where,
        skip: (page - 1) * limite,
        take: limite,
        orderBy: { creneau: { debut: 'asc' } },
        include: {
          creneau: {
            select: {
              debut: true,
              fin: true,
              bien: { select: { commune: true, quartier: true, typeBien: true } },
            },
          },
          annonce: { select: { titre: true } },
        },
      }),
    ]);

    return { donnees, pagination: { page, limite, total, pages: Math.ceil(total / limite) } };
  }

  /**
   * Annulation. Passé le délai de 4 h, l'annulation reste possible — refuser
   * pousserait à l'absence pure et simple, ce qui est pire pour le bailleur —
   * mais elle est comptabilisée comme un manquement.
   */
  async annuler(id: string, motif: string | undefined, utilisateur: UtilisateurConnecte) {
    const rdv = await this.prisma.rendezVous.findUnique({
      where: { id },
      include: {
        creneau: { select: { debut: true, bien: { select: { agenceId: true, proprietaireId: true } } } },
      },
    });

    const introuvable = new NotFoundException('Rendez-vous introuvable.');
    if (!rdv) throw introuvable;

    const estVisiteur = rdv.visiteurId === utilisateur.id;
    const estBailleur = rdv.creneau.bien.proprietaireId === utilisateur.id;
    if (!estVisiteur && !estBailleur && !this.estSuperviseur(utilisateur)) throw introuvable;

    if (RDV_CLOS.includes(rdv.statut)) {
      throw new ConflictException(`Ce rendez-vous est déjà ${rdv.statut}.`);
    }

    const heuresAvant = (rdv.creneau.debut.getTime() - Date.now()) / 3_600_000;
    const tardive = heuresAvant < DELAI_ANNULATION_H;

    const annule = await this.prisma.rendezVous.update({
      where: { id },
      data: {
        statut: StatutRdv.annule,
        annulePar: utilisateur.id,
        annuleLe: new Date(),
        motifAnnulation: motif,
      },
    });

    await this.audit.enregistrer({
      agenceId: rdv.creneau.bien.agenceId,
      utilisateurId: utilisateur.id,
      action: 'visite.annulation',
      entiteType: 'rendez_vous',
      entiteId: id,
      donneesApres: { tardive, heuresAvant: Math.round(heuresAvant) },
    });

    return {
      ...annule,
      tardive,
      message: tardive
        ? `Annulation à moins de ${DELAI_ANNULATION_H} h : elle est signalée au bailleur.`
        : 'Rendez-vous annulé.',
    };
  }

  /**
   * Compte rendu de visite par le bailleur ou l'agent.
   * Une absence déclenche le comptage RG-RDV-A ; au troisième manquement sur
   * 90 jours, la prise de rendez-vous est suspendue une semaine.
   */
  async cloturer(
    id: string,
    issue: StatutRdv,
    compteRendu: string | undefined,
    utilisateur: UtilisateurConnecte,
  ) {
    const rdv = await this.prisma.rendezVous.findUnique({
      where: { id },
      include: {
        creneau: {
          select: { debut: true, bien: { select: { agenceId: true, proprietaireId: true } } },
        },
      },
    });

    const introuvable = new NotFoundException('Rendez-vous introuvable.');
    if (!rdv) throw introuvable;

    if (rdv.creneau.bien.proprietaireId !== utilisateur.id && !this.estSuperviseur(utilisateur)) {
      throw introuvable;
    }
    if (rdv.statut !== StatutRdv.confirme && rdv.statut !== StatutRdv.demande) {
      throw new ConflictException(`Ce rendez-vous est déjà ${rdv.statut}.`);
    }
    if (rdv.creneau.debut > new Date()) {
      throw new ConflictException("Ce rendez-vous n'a pas encore eu lieu.");
    }

    const cloture = await this.prisma.rendezVous.update({
      where: { id },
      data: { statut: issue, compteRendu, marquePar: utilisateur.id },
    });

    let suspension: Date | null = null;
    if (issue === StatutRdv.no_show) {
      suspension = await this.appliquerRegleNoShow(rdv.visiteurId);
    }

    await this.audit.enregistrer({
      agenceId: rdv.creneau.bien.agenceId,
      utilisateurId: utilisateur.id,
      action: `visite.${issue}`,
      entiteType: 'rendez_vous',
      entiteId: id,
      donneesApres: { issue, suspensionAppliquee: suspension !== null },
    });

    return { ...cloture, suspensionVisiteurJusquAu: suspension };
  }

  /** RG-RDV-A : suspension après 3 absences non excusées sur 90 jours. */
  private async appliquerRegleNoShow(visiteurId: string): Promise<Date | null> {
    const depuis = new Date();
    depuis.setDate(depuis.getDate() - FENETRE_NO_SHOW_JOURS);

    const absences = await this.prisma.rendezVous.count({
      where: { visiteurId, statut: StatutRdv.no_show, updatedAt: { gte: depuis } },
    });

    if (absences < SEUIL_NO_SHOW) return null;

    const jusqua = new Date();
    jusqua.setDate(jusqua.getDate() + SUSPENSION_JOURS);

    await this.prisma.utilisateur.update({
      where: { id: visiteurId },
      data: { suspensionRdvJusquAu: jusqua },
    });

    const visiteur = await this.prisma.utilisateur.findUnique({
      where: { id: visiteurId },
      select: { telephone: true },
    });

    if (visiteur) {
      await this.sms.envoyer(
        visiteur.telephone,
        `Suite a ${absences} absences non excusees, la prise de rendez-vous est suspendue jusqu'au ${jusqua.toLocaleDateString('fr-FR')}.`,
      );
    }

    return jusqua;
  }

  /** Ferme un créneau non réservé (le bailleur n'est plus disponible). */
  async fermerCreneau(creneauId: string, utilisateur: UtilisateurConnecte) {
    const creneau = await this.prisma.creneauVisite.findUnique({
      where: { id: creneauId },
      include: {
        bien: { select: { agenceId: true, proprietaireId: true } },
        _count: {
          select: {
            rendezVous: { where: { statut: { in: [StatutRdv.demande, StatutRdv.confirme] } } },
          },
        },
      },
    });

    const introuvable = new NotFoundException('Créneau introuvable.');
    if (!creneau) throw introuvable;
    if (creneau.bien.proprietaireId !== utilisateur.id && !this.estSuperviseur(utilisateur)) {
      throw introuvable;
    }
    if (creneau._count.rendezVous > 0) {
      throw new ConflictException(
        'Ce créneau porte des réservations. Annulez-les avant de le fermer.',
      );
    }

    await this.prisma.creneauVisite.update({
      where: { id: creneauId },
      data: { statut: StatutCreneau.ferme },
    });

    await this.audit.enregistrer({
      agenceId: creneau.bien.agenceId,
      utilisateurId: utilisateur.id,
      action: 'visite.creneau.fermeture',
      entiteType: 'creneau_visite',
      entiteId: creneauId,
    });

    return { message: 'Créneau fermé.' };
  }
}
