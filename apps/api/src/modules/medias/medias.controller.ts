/**
 * Endpoints de téléversement des photos et documents.
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 09 août 2026
 */
import {
  Controller, Post, Get, Delete, Patch, Param, Body, UploadedFile,
  UseInterceptors, ParseUUIDPipe, HttpCode, HttpStatus, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { RoleUtilisateur } from '@prisma/client';
import { MediasService } from './medias.service';
import { TAILLE_MAX_IMAGE, TAILLE_MAX_DOCUMENT } from './fichiers.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Utilisateur } from '../../common/decorators/utilisateur.decorator';
import type { UtilisateurConnecte } from '../auth/jwt.strategy';
import { TypeDocumentDto } from './dto/media.dto';

/** Fichier reçu via multipart ; typé localement pour éviter la dépendance Multer. */
interface FichierTeleverse {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
}

@ApiTags('Médias')
@ApiBearerAuth()
@Controller('biens/:bienId')
export class MediasController {
  constructor(private readonly medias: MediasService) {}

  @Post('photos')
  @Roles(RoleUtilisateur.proprietaire, RoleUtilisateur.agence, RoleUtilisateur.admin)
  @UseInterceptors(FileInterceptor('fichier', { limits: { fileSize: TAILLE_MAX_IMAGE } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { fichier: { type: 'string', format: 'binary' } } },
  })
  @ApiOperation({ summary: 'Téléverser une photo (réencodée en WebP, vignette générée)' })
  @ApiResponse({ status: 400, description: 'Format non reconnu ou image trop volumineuse' })
  ajouterPhoto(
    @Param('bienId', ParseUUIDPipe) bienId: string,
    @UploadedFile() fichier: FichierTeleverse,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    if (!fichier) throw new BadRequestException('Aucun fichier reçu (champ « fichier » attendu).');
    return this.medias.ajouterPhoto(bienId, fichier, utilisateur);
  }

  @Get('photos')
  @Roles(RoleUtilisateur.proprietaire, RoleUtilisateur.agence, RoleUtilisateur.admin, RoleUtilisateur.agent)
  @ApiOperation({ summary: "Lister les photos d'un bien" })
  listerPhotos(
    @Param('bienId', ParseUUIDPipe) bienId: string,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.medias.listerPhotos(bienId, utilisateur);
  }

  @Patch('photos/:photoId/couverture')
  @HttpCode(HttpStatus.OK)
  @Roles(RoleUtilisateur.proprietaire, RoleUtilisateur.agence, RoleUtilisateur.admin)
  @ApiOperation({ summary: 'Définir la photo de couverture' })
  definirCouverture(
    @Param('bienId', ParseUUIDPipe) bienId: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.medias.definirCouverture(bienId, photoId, utilisateur);
  }

  @Delete('photos/:photoId')
  @HttpCode(HttpStatus.OK)
  @Roles(RoleUtilisateur.proprietaire, RoleUtilisateur.agence, RoleUtilisateur.admin)
  @ApiOperation({ summary: 'Supprimer une photo' })
  supprimerPhoto(
    @Param('bienId', ParseUUIDPipe) bienId: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.medias.supprimerPhoto(bienId, photoId, utilisateur);
  }

  @Post('documents')
  @Roles(RoleUtilisateur.proprietaire, RoleUtilisateur.agence, RoleUtilisateur.admin)
  @UseInterceptors(FileInterceptor('fichier', { limits: { fileSize: TAILLE_MAX_DOCUMENT } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fichier: { type: 'string', format: 'binary' },
        typePiece: { type: 'string', example: 'titre_propriete' },
      },
    },
  })
  @ApiOperation({ summary: 'Téléverser un justificatif (stockage privé chiffré)' })
  ajouterDocument(
    @Param('bienId', ParseUUIDPipe) bienId: string,
    @Body() dto: TypeDocumentDto,
    @UploadedFile() fichier: FichierTeleverse,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    if (!fichier) throw new BadRequestException('Aucun fichier reçu (champ « fichier » attendu).');
    return this.medias.ajouterDocument(bienId, dto.typePiece, fichier, utilisateur);
  }

  @Get('documents/:documentId/url')
  @Roles(RoleUtilisateur.proprietaire, RoleUtilisateur.agence, RoleUtilisateur.admin)
  @ApiOperation({ summary: 'Obtenir une URL temporaire (5 min) vers un document' })
  urlDocument(
    @Param('bienId', ParseUUIDPipe) bienId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.medias.urlDocument(bienId, documentId, utilisateur);
  }
}
