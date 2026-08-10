/**
 * Service Médias — orchestre validation, traitement et stockage des fichiers
 * rattachés aux biens (photos d'annonces, documents justificatifs).
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 *          Ingénieur Système & Infrastructure Cloud / System Architect
 *          Expert Solutions ICT (Cloud, Système, Cybersécurité)
 * Date   : 09 août 2026
 */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { StatutBien, RoleUtilisateur, TypePieceKyc } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { StockageService } from './stockage.service';
import { FichiersService } from './fichiers.service';
import type { UtilisateurConnecte } from '../auth/jwt.strategy';

/** Plafond de photos par bien (REQ-ANN-01). */
const PHOTOS_MAX = 20;
/** Statuts sur lesquels les médias du bien sont figés. */
const STATUTS_FIGES: StatutBien[] = [StatutBien.loue, StatutBien.vendu];

@Injectable()
export class MediasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockage: StockageService,
    private readonly fichiers: FichiersService,
    private readonly audit: AuditService,
  ) {}

  private estSuperviseur(utilisateur: UtilisateurConnecte): boolean {
    const roles: RoleUtilisateur[] = [RoleUtilisateur.admin, RoleUtilisateur.agence];
    return utilisateur.roles.some((r) => roles.includes(r as RoleUtilisateur));
  }

  private async bienAutorise(bienId: string, utilisateur: UtilisateurConnecte) {
    const bien = await this.prisma.bien.findUnique({
      where: { id: bienId },
      select: {
        id: true,
        agenceId: true,
        proprietaireId: true,
        statut: true,
        _count: { select: { photos: true } },
      },
    });

    const introuvable = new NotFoundException('Bien introuvable.');
    if (!bien) throw introuvable;
    if (bien.proprietaireId !== utilisateur.id && !this.estSuperviseur(utilisateur)) {
      throw introuvable;
    }
    return bien;
  }

  /** Téléverse une photo : validation, réencodage WebP, vignette, stockage public. */
  async ajouterPhoto(
    bienId: string,
    fichier: { buffer: Buffer; size: number },
    utilisateur: UtilisateurConnecte,
  ) {
    const bien = await this.bienAutorise(bienId, utilisateur);

    if (STATUTS_FIGES.includes(bien.statut)) {
      throw new ConflictException("Les photos d'un bien loué ou vendu ne peuvent plus changer.");
    }
    if (bien._count.photos >= PHOTOS_MAX) {
      throw new BadRequestException(`Un bien ne peut pas dépasser ${PHOTOS_MAX} photos.`);
    }

    const image = await this.fichiers.traiterImage(fichier.buffer, fichier.size);

    const cle = this.stockage.construireCle(`biens/${bienId}`, image.extension);
    const cleVignette = cle.replace(/\.webp$/, '-vignette.webp');

    await this.stockage.televerser(cle, image.principale, image.typeMime, 'public');
    await this.stockage.televerser(cleVignette, image.vignette, image.typeMime, 'public');

    // La première photo déposée devient la couverture par défaut.
    const photo = await this.prisma.bienPhoto.create({
      data: {
        bienId,
        url: cle,
        ordre: bien._count.photos,
        isCouverture: bien._count.photos === 0,
      },
    });

    await this.audit.enregistrer({
      agenceId: bien.agenceId,
      utilisateurId: utilisateur.id,
      action: 'bien.photo.ajout',
      entiteType: 'bien',
      entiteId: bienId,
      donneesApres: { photoId: photo.id, largeur: image.largeur, hauteur: image.hauteur },
    });

    return {
      ...photo,
      urlComplete: this.stockage.urlPublic(cle),
      urlVignette: this.stockage.urlPublic(cleVignette),
      dimensions: { largeur: image.largeur, hauteur: image.hauteur },
    };
  }

  async listerPhotos(bienId: string, utilisateur: UtilisateurConnecte) {
    await this.bienAutorise(bienId, utilisateur);

    const photos = await this.prisma.bienPhoto.findMany({
      where: { bienId },
      orderBy: { ordre: 'asc' },
    });

    return photos.map((p) => ({
      ...p,
      urlComplete: this.stockage.urlPublic(p.url),
      urlVignette: this.stockage.urlPublic(p.url.replace(/\.webp$/, '-vignette.webp')),
    }));
  }

  async definirCouverture(bienId: string, photoId: string, utilisateur: UtilisateurConnecte) {
    const bien = await this.bienAutorise(bienId, utilisateur);

    const photo = await this.prisma.bienPhoto.findFirst({ where: { id: photoId, bienId } });
    if (!photo) throw new NotFoundException('Photo introuvable.');

    // Une seule couverture par bien : bascule atomique.
    await this.prisma.$transaction([
      this.prisma.bienPhoto.updateMany({ where: { bienId }, data: { isCouverture: false } }),
      this.prisma.bienPhoto.update({ where: { id: photoId }, data: { isCouverture: true } }),
    ]);

    await this.audit.enregistrer({
      agenceId: bien.agenceId,
      utilisateurId: utilisateur.id,
      action: 'bien.photo.couverture',
      entiteType: 'bien',
      entiteId: bienId,
      donneesApres: { photoId },
    });

    return { message: 'Photo de couverture définie.' };
  }

  async supprimerPhoto(bienId: string, photoId: string, utilisateur: UtilisateurConnecte) {
    const bien = await this.bienAutorise(bienId, utilisateur);

    const photo = await this.prisma.bienPhoto.findFirst({ where: { id: photoId, bienId } });
    if (!photo) throw new NotFoundException('Photo introuvable.');

    await this.prisma.bienPhoto.delete({ where: { id: photoId } });
    await this.stockage.supprimer(photo.url, 'public');
    await this.stockage.supprimer(photo.url.replace(/\.webp$/, '-vignette.webp'), 'public');

    // La couverture supprimée est réattribuée à la photo restante la plus ancienne.
    if (photo.isCouverture) {
      const suivante = await this.prisma.bienPhoto.findFirst({
        where: { bienId },
        orderBy: { ordre: 'asc' },
      });
      if (suivante) {
        await this.prisma.bienPhoto.update({
          where: { id: suivante.id },
          data: { isCouverture: true },
        });
      }
    }

    await this.audit.enregistrer({
      agenceId: bien.agenceId,
      utilisateurId: utilisateur.id,
      action: 'bien.photo.suppression',
      entiteType: 'bien',
      entiteId: bienId,
      donneesAvant: { photoId },
    });

    return { message: 'Photo supprimée.' };
  }

  /** Document justificatif : stockage privé chiffré, jamais public. */
  async ajouterDocument(
    bienId: string,
    typePiece: TypePieceKyc,
    fichier: { buffer: Buffer; size: number },
    utilisateur: UtilisateurConnecte,
  ) {
    const bien = await this.bienAutorise(bienId, utilisateur);
    const { typeMime, extension } = this.fichiers.validerDocument(fichier.buffer, fichier.size);

    const cle = this.stockage.construireCle(`documents/biens/${bienId}`, extension);
    await this.stockage.televerser(cle, fichier.buffer, typeMime, 'prive');

    const document = await this.prisma.bienDocument.create({
      data: { bienId, typePiece, fichierUrl: cle },
    });

    await this.audit.enregistrer({
      agenceId: bien.agenceId,
      utilisateurId: utilisateur.id,
      action: 'bien.document.televersement',
      entiteType: 'bien',
      entiteId: bienId,
      donneesApres: { documentId: document.id, typePiece },
    });

    // La clé n'est pas retournée : l'accès passe obligatoirement par l'endpoint dédié.
    return { id: document.id, typePiece: document.typePiece, createdAt: document.createdAt };
  }

  /**
   * Délivre une URL temporaire vers un document sensible.
   * Chaque consultation est journalisée : sur des pièces d'identité et titres
   * de propriété, savoir qui a consulté quoi est une exigence de conformité
   * (loi n°2013-450) autant qu'une protection en cas de litige.
   */
  async urlDocument(bienId: string, documentId: string, utilisateur: UtilisateurConnecte) {
    const bien = await this.bienAutorise(bienId, utilisateur);

    const document = await this.prisma.bienDocument.findFirst({
      where: { id: documentId, bienId },
    });
    if (!document) throw new NotFoundException('Document introuvable.');

    const url = await this.stockage.urlPresignee(document.fichierUrl);

    await this.audit.enregistrer({
      agenceId: bien.agenceId,
      utilisateurId: utilisateur.id,
      action: 'bien.document.consultation',
      entiteType: 'bien',
      entiteId: bienId,
      donneesApres: { documentId, typePiece: document.typePiece },
    });

    return { url, expireDansSecondes: 300 };
  }
}
