/**
 * Service Annonces — publication, modération, recherche.
 *
 * Règles appliquées :
 *  - REQ-ANN-03 : plafonds légaux (loi n°2019-576) validés en couche
 *    applicative, en amont des CHECK PostgreSQL. Les valeurs proviennent de
 *    `parametre_legal` (configurable par pays) : la base reste le garde-fou
 *    ultime, l'application donne un message clair avant d'y arriver.
 *  - REQ-ANN-04 : workflow brouillon → soumise → en_moderation → publiée/rejetée,
 *    motif obligatoire en cas de rejet.
 *  - REQ-ANN-05 : contrôles de modération outillés (titre de propriété, photos).
 *  - REQ-ANN-07 : une annonce publiée ne peut concerner qu'un bien disponible.
 *  - REQ-ANN-08 : expiration à 60 jours sans activité.
 *  - Toute décision de modération est journalisée (REQ-ANN-06).
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 *          Ingénieur Système & Infrastructure Cloud / System Architect
 *          Expert Solutions ICT (Cloud, Système, Cybersécurité)
 * Date   : 09 août 2026
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
  StatutAnnonce,
  StatutBien,
  TypeTransaction,
  RoleUtilisateur,
  TypePieceKyc,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import type { UtilisateurConnecte } from '../auth/jwt.strategy';
import {
  CreerAnnonceDto,
  ModifierAnnonceDto,
  ListerAnnoncesDto,
  RechercherAnnoncesDto,
} from './dto/annonce.dto';

/** Nombre minimum de photos exigé avant soumission à modération (REQ-ANN-01). */
const PHOTOS_MINIMUM = 3;
/** Durée de validité d'une annonce publiée sans activité (REQ-ANN-08). */
const VALIDITE_JOURS = 60;
/** Statuts depuis lesquels le bailleur peut encore modifier son annonce. */
const STATUTS_MODIFIABLES: StatutAnnonce[] = [StatutAnnonce.brouillon, StatutAnnonce.rejetee];
/** Statuts sur lesquels une décision de modération peut être rendue. */
const STATUTS_MODERABLES: StatutAnnonce[] = [StatutAnnonce.soumise, StatutAnnonce.en_moderation];
/** Pièces justifiant le droit de mettre le bien en location. */
const PIECES_PROPRIETE: TypePieceKyc[] = [TypePieceKyc.titre_propriete, TypePieceKyc.mandat_gestion];

@Injectable()
export class AnnoncesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private estSuperviseur(utilisateur: UtilisateurConnecte): boolean {
    const roles: RoleUtilisateur[] = [RoleUtilisateur.admin, RoleUtilisateur.agence];
    return utilisateur.roles.some((r) => roles.includes(r as RoleUtilisateur));
  }

  /**
   * Valide les plafonds légaux du pays de l'agence.
   * Ces mêmes limites sont gravées en CHECK SQL : la validation applicative
   * existe pour produire un message compréhensible, pas pour la remplacer.
   */
  private async validerPlafondsLegaux(
    pays: string,
    cautionNbMois: number,
    avanceNbMois: number,
  ): Promise<void> {
    const plafonds = await this.prisma.parametreLegal.findUnique({ where: { pays } });
    if (!plafonds) {
      throw new BadRequestException(`Aucun paramétrage légal défini pour le pays ${pays}.`);
    }

    if (cautionNbMois > plafonds.cautionMaxMois) {
      throw new BadRequestException(
        `La caution ne peut excéder ${plafonds.cautionMaxMois} mois de loyer.`,
      );
    }
    if (avanceNbMois > plafonds.avanceMaxMois) {
      throw new BadRequestException(
        `L'avance ne peut excéder ${plafonds.avanceMaxMois} mois de loyer.`,
      );
    }
    if (cautionNbMois + avanceNbMois > plafonds.totalEntreeMaxMois) {
      throw new BadRequestException(
        `Le total exigible à la signature ne peut excéder ${plafonds.totalEntreeMaxMois} mois de loyer.`,
      );
    }
  }

  /** Cohérence du prix selon le type de transaction. */
  private validerPrix(dto: {
    transaction?: TypeTransaction;
    loyerMontant?: string;
    prixVente?: string;
  }): void {
    if (dto.transaction === TypeTransaction.location && !dto.loyerMontant) {
      throw new BadRequestException('Le loyer mensuel est obligatoire pour une location.');
    }
    if (dto.transaction === TypeTransaction.vente && !dto.prixVente) {
      throw new BadRequestException('Le prix de vente est obligatoire pour une vente.');
    }
  }

  private async trouverAvecDroits(id: string, utilisateur: UtilisateurConnecte) {
    const annonce = await this.prisma.annonce.findUnique({
      where: { id },
      include: {
        bien: {
          select: {
            id: true,
            agenceId: true,
            proprietaireId: true,
            statut: true,
            commune: true,
            quartier: true,
            typeBien: true,
            nbChambres: true,
            agence: { select: { pays: true } },
            _count: { select: { photos: true, documents: true } },
          },
        },
      },
    });

    const introuvable = new NotFoundException('Annonce introuvable.');
    if (!annonce) throw introuvable;

    if (annonce.bien.proprietaireId !== utilisateur.id && !this.estSuperviseur(utilisateur)) {
      throw introuvable;
    }
    return annonce;
  }

  async creer(dto: CreerAnnonceDto, utilisateur: UtilisateurConnecte) {
    const bien = await this.prisma.bien.findUnique({
      where: { id: dto.bienId },
      include: { agence: { select: { pays: true } } },
    });

    if (!bien) throw new NotFoundException('Bien introuvable.');
    if (bien.proprietaireId !== utilisateur.id && !this.estSuperviseur(utilisateur)) {
      throw new ForbiddenException("Ce bien ne vous appartient pas.");
    }
    if (bien.statut !== StatutBien.disponible) {
      throw new ConflictException(
        `Ce bien est ${bien.statut} : il ne peut pas faire l'objet d'une nouvelle annonce.`,
      );
    }

    // Une seule annonce active par bien : sinon deux prix concurrents circulent.
    const active = await this.prisma.annonce.findFirst({
      where: {
        bienId: bien.id,
        statut: { in: [StatutAnnonce.soumise, StatutAnnonce.en_moderation, StatutAnnonce.publiee] },
      },
      select: { id: true, statut: true },
    });
    if (active) {
      throw new ConflictException(
        `Une annonce est déjà ${active.statut} pour ce bien. Retirez-la avant d'en créer une autre.`,
      );
    }

    this.validerPrix(dto);
    const caution = dto.cautionNbMois ?? 0;
    const avance = dto.avanceNbMois ?? 0;
    await this.validerPlafondsLegaux(bien.agence.pays, caution, avance);

    const annonce = await this.prisma.annonce.create({
      data: {
        bienId: bien.id,
        transaction: dto.transaction,
        titre: dto.titre,
        description: dto.description,
        loyerMontant: dto.loyerMontant ? BigInt(dto.loyerMontant) : null,
        prixVente: dto.prixVente ? BigInt(dto.prixVente) : null,
        chargesMontant: BigInt(dto.chargesMontant ?? '0'),
        cautionNbMois: caution,
        avanceNbMois: avance,
        fraisAgenceMontant: BigInt(dto.fraisAgenceMontant ?? '0'),
        disponibleLe: dto.disponibleLe ? new Date(dto.disponibleLe) : null,
        statut: StatutAnnonce.brouillon,
      },
    });

    await this.audit.enregistrer({
      agenceId: bien.agenceId,
      utilisateurId: utilisateur.id,
      action: 'annonce.creation',
      entiteType: 'annonce',
      entiteId: annonce.id,
      donneesApres: { titre: annonce.titre, transaction: annonce.transaction },
    });

    return annonce;
  }

  async modifier(id: string, dto: ModifierAnnonceDto, utilisateur: UtilisateurConnecte) {
    const annonce = await this.trouverAvecDroits(id, utilisateur);

    if (!STATUTS_MODIFIABLES.includes(annonce.statut)) {
      throw new ConflictException(
        `Une annonce ${annonce.statut} ne peut plus être modifiée. Retirez-la pour la corriger.`,
      );
    }

    const transaction = dto.transaction ?? annonce.transaction;
    this.validerPrix({
      transaction,
      loyerMontant: dto.loyerMontant ?? annonce.loyerMontant?.toString(),
      prixVente: dto.prixVente ?? annonce.prixVente?.toString(),
    });

    const caution = dto.cautionNbMois ?? annonce.cautionNbMois;
    const avance = dto.avanceNbMois ?? annonce.avanceNbMois;
    await this.validerPlafondsLegaux(annonce.bien.agence.pays, caution, avance);

    const modifiee = await this.prisma.annonce.update({
      where: { id },
      data: {
        transaction: dto.transaction,
        titre: dto.titre,
        description: dto.description,
        loyerMontant: dto.loyerMontant !== undefined ? BigInt(dto.loyerMontant) : undefined,
        prixVente: dto.prixVente !== undefined ? BigInt(dto.prixVente) : undefined,
        chargesMontant: dto.chargesMontant !== undefined ? BigInt(dto.chargesMontant) : undefined,
        cautionNbMois: dto.cautionNbMois,
        avanceNbMois: dto.avanceNbMois,
        fraisAgenceMontant:
          dto.fraisAgenceMontant !== undefined ? BigInt(dto.fraisAgenceMontant) : undefined,
        disponibleLe: dto.disponibleLe ? new Date(dto.disponibleLe) : undefined,
        // Une annonce rejetée puis corrigée repart en brouillon : elle devra
        // être resoumise, et donc repasser par la modération.
        statut: annonce.statut === StatutAnnonce.rejetee ? StatutAnnonce.brouillon : undefined,
        motifRejet: annonce.statut === StatutAnnonce.rejetee ? null : undefined,
      },
    });

    await this.audit.enregistrer({
      agenceId: annonce.bien.agenceId,
      utilisateurId: utilisateur.id,
      action: 'annonce.modification',
      entiteType: 'annonce',
      entiteId: id,
      donneesAvant: { statut: annonce.statut },
      donneesApres: { statut: modifiee.statut },
    });

    return modifiee;
  }

  /**
   * Soumission à modération (REQ-ANN-04).
   * Les contrôles de complétude sont faits ici plutôt que côté modérateur :
   * cela évite d'encombrer la file d'annonces manifestement incomplètes.
   */
  async soumettre(id: string, utilisateur: UtilisateurConnecte) {
    const annonce = await this.trouverAvecDroits(id, utilisateur);

    if (!STATUTS_MODIFIABLES.includes(annonce.statut)) {
      throw new ConflictException(`Cette annonce est déjà ${annonce.statut}.`);
    }
    if (annonce.bien.statut !== StatutBien.disponible) {
      throw new ConflictException("Le bien n'est plus disponible.");
    }
    if (annonce.bien._count.photos < PHOTOS_MINIMUM) {
      throw new BadRequestException(
        `Ajoutez au moins ${PHOTOS_MINIMUM} photos avant de soumettre votre annonce.`,
      );
    }

    const soumise = await this.prisma.annonce.update({
      where: { id },
      data: { statut: StatutAnnonce.soumise, motifRejet: null },
    });

    await this.audit.enregistrer({
      agenceId: annonce.bien.agenceId,
      utilisateurId: utilisateur.id,
      action: 'annonce.soumission',
      entiteType: 'annonce',
      entiteId: id,
      donneesApres: { statut: soumise.statut },
    });

    return soumise;
  }

  /** File de modération, la plus ancienne soumission d'abord. */
  async fileModeration(filtres: ListerAnnoncesDto) {
    const { page = 1, limite = 20 } = filtres;

    const where: Prisma.AnnonceWhereInput = {
      statut: { in: [StatutAnnonce.soumise, StatutAnnonce.en_moderation] },
    };

    const [total, donnees] = await this.prisma.$transaction([
      this.prisma.annonce.count({ where }),
      this.prisma.annonce.findMany({
        where,
        skip: (page - 1) * limite,
        take: limite,
        orderBy: { updatedAt: 'asc' },
        include: {
          bien: {
            select: {
              commune: true,
              quartier: true,
              typeBien: true,
              proprietaire: { select: { nomComplet: true, telephone: true } },
              documents: { select: { typePiece: true, verifieLe: true } },
              _count: { select: { photos: true } },
            },
          },
        },
      }),
    ]);

    // REQ-ANN-05 : contrôles présentés au modérateur, décision humaine au MVP.
    const avecControles = donnees.map((a) => ({
      ...a,
      controles: {
        photosSuffisantes: a.bien._count.photos >= PHOTOS_MINIMUM,
        titreProprieteVerifie: a.bien.documents.some(
          (d) =>
            PIECES_PROPRIETE.includes(d.typePiece) &&
            d.verifieLe !== null,
        ),
        plafondsRespectes: a.cautionNbMois <= 2 && a.avanceNbMois <= 2,
      },
    }));

    return {
      donnees: avecControles,
      pagination: { page, limite, total, pages: Math.ceil(total / limite) },
    };
  }

  async publier(id: string, moderateur: UtilisateurConnecte) {
    const annonce = await this.prisma.annonce.findUnique({
      where: { id },
      include: { bien: { select: { agenceId: true, statut: true, _count: { select: { photos: true } } } } },
    });

    if (!annonce) throw new NotFoundException('Annonce introuvable.');
    if (!STATUTS_MODERABLES.includes(annonce.statut)) {
      throw new ConflictException(
        `Seule une annonce soumise peut être publiée (statut actuel : ${annonce.statut}).`,
      );
    }
    if (annonce.bien.statut !== StatutBien.disponible) {
      throw new ConflictException("Le bien n'est plus disponible.");
    }

    const expiration = new Date();
    expiration.setDate(expiration.getDate() + VALIDITE_JOURS);

    const publiee = await this.prisma.annonce.update({
      where: { id },
      data: {
        statut: StatutAnnonce.publiee,
        modereePar: moderateur.id,
        modereeLe: new Date(),
        publieeLe: new Date(),
        expireLe: expiration,
        motifRejet: null,
      },
    });

    await this.audit.enregistrer({
      agenceId: annonce.bien.agenceId,
      utilisateurId: moderateur.id,
      action: 'annonce.moderation.publication',
      entiteType: 'annonce',
      entiteId: id,
      donneesAvant: { statut: annonce.statut },
      donneesApres: { statut: publiee.statut, expireLe: publiee.expireLe?.toISOString() },
    });

    return publiee;
  }

  async rejeter(id: string, motif: string, moderateur: UtilisateurConnecte) {
    const annonce = await this.prisma.annonce.findUnique({
      where: { id },
      include: { bien: { select: { agenceId: true } } },
    });

    if (!annonce) throw new NotFoundException('Annonce introuvable.');
    if (!STATUTS_MODERABLES.includes(annonce.statut)) {
      throw new ConflictException(
        `Seule une annonce soumise peut être rejetée (statut actuel : ${annonce.statut}).`,
      );
    }

    const rejetee = await this.prisma.annonce.update({
      where: { id },
      data: {
        statut: StatutAnnonce.rejetee,
        motifRejet: motif,
        modereePar: moderateur.id,
        modereeLe: new Date(),
      },
    });

    await this.audit.enregistrer({
      agenceId: annonce.bien.agenceId,
      utilisateurId: moderateur.id,
      action: 'annonce.moderation.rejet',
      entiteType: 'annonce',
      entiteId: id,
      donneesAvant: { statut: annonce.statut },
      donneesApres: { statut: rejetee.statut, motif },
    });

    return rejetee;
  }

  /** Retrait volontaire par le bailleur (bien loué hors plateforme, etc.). */
  async retirer(id: string, utilisateur: UtilisateurConnecte) {
    const annonce = await this.trouverAvecDroits(id, utilisateur);

    if (annonce.statut === StatutAnnonce.retiree) {
      throw new ConflictException('Cette annonce est déjà retirée.');
    }

    const retiree = await this.prisma.annonce.update({
      where: { id },
      data: { statut: StatutAnnonce.retiree },
    });

    await this.audit.enregistrer({
      agenceId: annonce.bien.agenceId,
      utilisateurId: utilisateur.id,
      action: 'annonce.retrait',
      entiteType: 'annonce',
      entiteId: id,
      donneesAvant: { statut: annonce.statut },
    });

    return retiree;
  }

  async listerMiennes(filtres: ListerAnnoncesDto, utilisateur: UtilisateurConnecte) {
    const { page = 1, limite = 20, statut, transaction } = filtres;

    const where: Prisma.AnnonceWhereInput = {
      ...(this.estSuperviseur(utilisateur)
        ? {}
        : { bien: { proprietaireId: utilisateur.id } }),
      ...(statut ? { statut } : {}),
      ...(transaction ? { transaction } : {}),
    };

    const [total, donnees] = await this.prisma.$transaction([
      this.prisma.annonce.count({ where }),
      this.prisma.annonce.findMany({
        where,
        skip: (page - 1) * limite,
        take: limite,
        orderBy: { createdAt: 'desc' },
        include: {
          bien: { select: { commune: true, quartier: true, typeBien: true, statut: true } },
        },
      }),
    ]);

    return { donnees, pagination: { page, limite, total, pages: Math.ceil(total / limite) } };
  }

  /**
   * Recherche publique (REQ-RCH-01/03/05).
   * Seules les annonces publiées et non expirées sont exposées ; les
   * coordonnées du bailleur ne sont jamais incluses (REQ-RDV-07).
   */
  async rechercher(filtres: RechercherAnnoncesDto) {
    const {
      page = 1,
      limite = 20,
      tri = 'recent',
      transaction = TypeTransaction.location,
      budgetMin,
      budgetMax,
      chambresMin,
      commune,
      quartier,
      typeBien,
    } = filtres;

    const champPrix = transaction === TypeTransaction.location ? 'loyerMontant' : 'prixVente';

    const where: Prisma.AnnonceWhereInput = {
      statut: StatutAnnonce.publiee,
      transaction,
      OR: [{ expireLe: null }, { expireLe: { gt: new Date() } }],
      bien: {
        statut: StatutBien.disponible,
        ...(commune ? { commune: { contains: commune, mode: 'insensitive' } } : {}),
        ...(quartier ? { quartier: { contains: quartier, mode: 'insensitive' } } : {}),
        ...(typeBien ? { typeBien } : {}),
        ...(chambresMin !== undefined ? { nbChambres: { gte: chambresMin } } : {}),
      },
      ...(budgetMin || budgetMax
        ? {
            [champPrix]: {
              ...(budgetMin ? { gte: BigInt(budgetMin) } : {}),
              ...(budgetMax ? { lte: BigInt(budgetMax) } : {}),
            },
          }
        : {}),
    };

    const orderBy: Prisma.AnnonceOrderByWithRelationInput =
      tri === 'prix_croissant'
        ? { [champPrix]: 'asc' }
        : tri === 'prix_decroissant'
          ? { [champPrix]: 'desc' }
          : { publieeLe: 'desc' };

    const [total, donnees] = await this.prisma.$transaction([
      this.prisma.annonce.count({ where }),
      this.prisma.annonce.findMany({
        where,
        skip: (page - 1) * limite,
        take: limite,
        orderBy,
        select: {
          id: true,
          titre: true,
          description: true,
          transaction: true,
          loyerMontant: true,
          prixVente: true,
          chargesMontant: true,
          cautionNbMois: true,
          avanceNbMois: true,
          fraisAgenceMontant: true,
          disponibleLe: true,
          publieeLe: true,
          bien: {
            select: {
              commune: true,
              quartier: true,
              typeBien: true,
              superficieM2: true,
              nbPieces: true,
              nbChambres: true,
              nbSallesEau: true,
              meuble: true,
              latitude: true,
              longitude: true,
              photos: { orderBy: { ordre: 'asc' }, select: { url: true, isCouverture: true } },
              equipements: { select: { equipement: { select: { code: true, libelle: true } } } },
            },
          },
        },
      }),
    ]);

    // REQ-RCH-05 : le coût total d'entrée est calculé côté serveur pour que
    // toutes les interfaces affichent le même montant, sans surprise.
    const avecCoutEntree = donnees.map((a) => {
      const loyer = a.loyerMontant ?? 0n;
      const caution = loyer * BigInt(a.cautionNbMois);
      const avance = loyer * BigInt(a.avanceNbMois);
      return {
        ...a,
        coutEntree: {
          caution,
          avance,
          fraisAgence: a.fraisAgenceMontant,
          total: caution + avance + a.fraisAgenceMontant,
        },
      };
    });

    return {
      donnees: avecCoutEntree,
      pagination: { page, limite, total, pages: Math.ceil(total / limite) },
    };
  }

  /** Fiche publique d'une annonce publiée. */
  async detailPublic(id: string) {
    const annonce = await this.prisma.annonce.findFirst({
      where: {
        id,
        statut: StatutAnnonce.publiee,
        OR: [{ expireLe: null }, { expireLe: { gt: new Date() } }],
      },
      select: {
        id: true,
        titre: true,
        description: true,
        transaction: true,
        loyerMontant: true,
        prixVente: true,
        chargesMontant: true,
        cautionNbMois: true,
        avanceNbMois: true,
        fraisAgenceMontant: true,
        disponibleLe: true,
        publieeLe: true,
        bien: {
          select: {
            commune: true,
            quartier: true,
            adresse: true,
            typeBien: true,
            superficieM2: true,
            nbPieces: true,
            nbChambres: true,
            nbSallesEau: true,
            meuble: true,
            dependances: true,
            latitude: true,
            longitude: true,
            photos: { orderBy: { ordre: 'asc' } },
            equipements: { select: { equipement: true } },
            // Badge « bailleur vérifié » sans exposer d'information personnelle.
            proprietaire: { select: { nomComplet: true } },
          },
        },
      },
    });

    if (!annonce) throw new NotFoundException("Cette annonce n'est plus disponible.");

    const loyer = annonce.loyerMontant ?? 0n;
    const caution = loyer * BigInt(annonce.cautionNbMois);
    const avance = loyer * BigInt(annonce.avanceNbMois);

    return {
      ...annonce,
      coutEntree: {
        caution,
        avance,
        fraisAgence: annonce.fraisAgenceMontant,
        total: caution + avance + annonce.fraisAgenceMontant,
      },
    };
  }
}
