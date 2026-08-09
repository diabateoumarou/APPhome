/**
 * Service Biens — gestion du parc immobilier.
 *
 * Règles appliquées :
 *  - RG-002 (KYC) : publication d'un bien impossible tant que le bailleur n'est
 *    pas vérifié (pièce d'identité + titre de propriété ou mandat de gestion).
 *  - Contrôle de propriété : un bailleur n'accède qu'à ses propres biens ;
 *    l'admin et l'agence de rattachement accèdent à l'ensemble du parc.
 *  - REQ-ANN-07 : le statut du bien pilote sa visibilité et son cycle de vie.
 *  - Toute action sensible est journalisée dans audit_log.
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
import { Prisma, StatutBien, StatutKyc, TypePieceKyc, RoleUtilisateur } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import type { UtilisateurConnecte } from '../auth/jwt.strategy';
import {
  CreerBienDto,
  ModifierBienDto,
  ListerBiensDto,
  AjouterDocumentBienDto,
} from './dto/bien.dto';

/** Pièces d'identité acceptées pour la vérification d'une personne. */
const PIECES_IDENTITE: TypePieceKyc[] = [TypePieceKyc.cni, TypePieceKyc.passeport];
/** Titres justifiant le droit de mettre un bien en location. */
const PIECES_PROPRIETE: TypePieceKyc[] = [
  TypePieceKyc.titre_propriete,
  TypePieceKyc.mandat_gestion,
];

@Injectable()
export class BiensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * RG-002 : refuse la création tant que l'identité et le droit de propriété
   * ne sont pas vérifiés. Contrôle volontairement placé en amont de toute
   * écriture — un bien créé sans KYC pollue ensuite la file de modération.
   */
  private async verifierKyc(utilisateurId: string): Promise<void> {
    const verifications = await this.prisma.kycVerification.findMany({
      where: { utilisateurId, statut: StatutKyc.verifie },
      select: { typePiece: true },
    });

    const types = verifications.map((v) => v.typePiece);

    if (!types.some((t) => PIECES_IDENTITE.includes(t))) {
      throw new ForbiddenException(
        "Votre pièce d'identité doit être vérifiée avant de publier un bien.",
      );
    }
    if (!types.some((t) => PIECES_PROPRIETE.includes(t))) {
      throw new ForbiddenException(
        'Un titre de propriété ou un mandat de gestion vérifié est requis pour publier un bien.',
      );
    }
  }

  /** Rattache le bailleur à son agence ; requis pour l'isolation multi-tenant. */
  private async resoudreAgence(utilisateurId: string): Promise<string> {
    const role = await this.prisma.utilisateurRole.findFirst({
      where: { utilisateurId, agenceId: { not: null } },
      select: { agenceId: true },
    });

    if (!role?.agenceId) {
      throw new BadRequestException(
        "Votre compte n'est rattaché à aucune agence. Contactez votre gestionnaire.",
      );
    }
    return role.agenceId;
  }

  /**
   * Récupère un bien en vérifiant les droits d'accès.
   * Un message identique est renvoyé qu'il s'agisse d'un bien inexistant ou
   * appartenant à autrui : on ne révèle pas l'existence des biens d'autrui.
   */
  private async trouverAvecDroits(id: string, utilisateur: UtilisateurConnecte) {
    const bien = await this.prisma.bien.findUnique({
      where: { id },
      include: {
        photos: { orderBy: { ordre: 'asc' } },
        equipements: { include: { equipement: true } },
        _count: { select: { annonces: true, contrats: true } },
      },
    });

    const introuvable = new NotFoundException('Bien introuvable.');
    if (!bien) throw introuvable;

    const estProprietaire = bien.proprietaireId === utilisateur.id;
    const superviseurs: RoleUtilisateur[] = [
      RoleUtilisateur.admin,
      RoleUtilisateur.agence,
      RoleUtilisateur.agent,
    ];
    const estSuperviseur = utilisateur.roles.some((r) =>
      superviseurs.includes(r as RoleUtilisateur),
    );

    if (!estProprietaire && !estSuperviseur) throw introuvable;
    return bien;
  }

  /** Résout les codes d'équipements en identifiants, en signalant les inconnus. */
  private async resoudreEquipements(codes: string[]): Promise<string[]> {
    if (!codes.length) return [];

    const trouves = await this.prisma.equipement.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true },
    });

    const inconnus = codes.filter((c) => !trouves.some((t) => t.code === c));
    if (inconnus.length) {
      throw new BadRequestException(`Équipements inconnus : ${inconnus.join(', ')}`);
    }
    return trouves.map((t) => t.id);
  }

  async creer(dto: CreerBienDto, utilisateur: UtilisateurConnecte) {
    await this.verifierKyc(utilisateur.id);
    const agenceId = await this.resoudreAgence(utilisateur.id);
    const equipementIds = await this.resoudreEquipements(dto.equipements ?? []);

    const { equipements: _codes, attributs, latitude, longitude, superficieM2, ...reste } = dto;

    const bien = await this.prisma.bien.create({
      data: {
        ...reste,
        agenceId,
        proprietaireId: utilisateur.id,
        latitude: latitude !== undefined ? new Prisma.Decimal(latitude) : undefined,
        longitude: longitude !== undefined ? new Prisma.Decimal(longitude) : undefined,
        superficieM2: superficieM2 !== undefined ? new Prisma.Decimal(superficieM2) : undefined,
        attributs: (attributs ?? {}) as Prisma.InputJsonValue,
        equipements: equipementIds.length
          ? { create: equipementIds.map((equipementId) => ({ equipementId })) }
          : undefined,
      },
      include: { equipements: { include: { equipement: true } } },
    });

    await this.audit.enregistrer({
      agenceId,
      utilisateurId: utilisateur.id,
      action: 'bien.creation',
      entiteType: 'bien',
      entiteId: bien.id,
      donneesApres: { commune: bien.commune, typeBien: bien.typeBien },
    });

    return bien;
  }

  async lister(filtres: ListerBiensDto, utilisateur: UtilisateurConnecte) {
    const { page = 1, limite = 20, ...criteres } = filtres;

    const superviseurs: RoleUtilisateur[] = [RoleUtilisateur.admin, RoleUtilisateur.agence];
    const estSuperviseur = utilisateur.roles.some((r) =>
      superviseurs.includes(r as RoleUtilisateur),
    );

    const where: Prisma.BienWhereInput = {
      ...(estSuperviseur ? {} : { proprietaireId: utilisateur.id }),
      ...(criteres.commune
        ? { commune: { contains: criteres.commune, mode: 'insensitive' } }
        : {}),
      ...(criteres.typeBien ? { typeBien: criteres.typeBien } : {}),
      ...(criteres.statut ? { statut: criteres.statut } : {}),
    };

    const [total, donnees] = await this.prisma.$transaction([
      this.prisma.bien.count({ where }),
      this.prisma.bien.findMany({
        where,
        skip: (page - 1) * limite,
        take: limite,
        orderBy: { createdAt: 'desc' },
        include: {
          photos: { where: { isCouverture: true }, take: 1 },
          _count: { select: { annonces: true } },
        },
      }),
    ]);

    return {
      donnees,
      pagination: { page, limite, total, pages: Math.ceil(total / limite) },
    };
  }

  async detail(id: string, utilisateur: UtilisateurConnecte) {
    return this.trouverAvecDroits(id, utilisateur);
  }

  async modifier(id: string, dto: ModifierBienDto, utilisateur: UtilisateurConnecte) {
    const bien = await this.trouverAvecDroits(id, utilisateur);

    // Un bien loué ou vendu porte un contrat en cours : ses caractéristiques
    // sont opposables aux parties et ne peuvent plus être modifiées librement.
    const statutsFiges: StatutBien[] = [StatutBien.loue, StatutBien.vendu];
    if (statutsFiges.includes(bien.statut)) {
      throw new ConflictException(
        'Un bien loué ou vendu ne peut plus être modifié. Terminez le contrat au préalable.',
      );
    }

    const { equipements, attributs, latitude, longitude, superficieM2, ...reste } = dto;
    const equipementIds =
      equipements !== undefined ? await this.resoudreEquipements(equipements) : undefined;

    const modifie = await this.prisma.bien.update({
      where: { id },
      data: {
        ...reste,
        latitude: latitude !== undefined ? new Prisma.Decimal(latitude) : undefined,
        longitude: longitude !== undefined ? new Prisma.Decimal(longitude) : undefined,
        superficieM2: superficieM2 !== undefined ? new Prisma.Decimal(superficieM2) : undefined,
        attributs: attributs !== undefined ? (attributs as Prisma.InputJsonValue) : undefined,
        equipements: equipementIds
          ? { deleteMany: {}, create: equipementIds.map((equipementId) => ({ equipementId })) }
          : undefined,
      },
      include: { equipements: { include: { equipement: true } } },
    });

    await this.audit.enregistrer({
      agenceId: bien.agenceId,
      utilisateurId: utilisateur.id,
      action: 'bien.modification',
      entiteType: 'bien',
      entiteId: id,
      donneesAvant: { statut: bien.statut, commune: bien.commune },
      donneesApres: { statut: modifie.statut, commune: modifie.commune },
    });

    return modifie;
  }

  async supprimer(id: string, utilisateur: UtilisateurConnecte) {
    const bien = await this.trouverAvecDroits(id, utilisateur);

    // Les contrats et annonces publiées constituent un historique opposable :
    // la suppression est refusée, le retrait passe par le statut.
    if (bien._count.contrats > 0) {
      throw new ConflictException(
        'Ce bien porte un historique de contrats et ne peut pas être supprimé.',
      );
    }
    if (bien.statut !== StatutBien.disponible) {
      throw new ConflictException('Seul un bien disponible peut être supprimé.');
    }

    await this.prisma.bien.delete({ where: { id } });

    await this.audit.enregistrer({
      agenceId: bien.agenceId,
      utilisateurId: utilisateur.id,
      action: 'bien.suppression',
      entiteType: 'bien',
      entiteId: id,
      donneesAvant: { commune: bien.commune, typeBien: bien.typeBien },
    });

    return { message: 'Bien supprimé.' };
  }

  /** Documents justificatifs (titre de propriété, mandat) rattachés au bien. */
  async ajouterDocument(
    id: string,
    dto: AjouterDocumentBienDto,
    utilisateur: UtilisateurConnecte,
  ) {
    const bien = await this.trouverAvecDroits(id, utilisateur);

    const document = await this.prisma.bienDocument.create({
      data: { bienId: bien.id, typePiece: dto.typePiece, fichierUrl: dto.fichierUrl },
    });

    await this.audit.enregistrer({
      agenceId: bien.agenceId,
      utilisateurId: utilisateur.id,
      action: 'bien.document.ajout',
      entiteType: 'bien',
      entiteId: id,
      donneesApres: { typePiece: dto.typePiece },
    });

    return document;
  }

  /** Liste des équipements disponibles pour les formulaires de publication. */
  async listerEquipements() {
    return this.prisma.equipement.findMany({ orderBy: { libelle: 'asc' } });
  }
}
