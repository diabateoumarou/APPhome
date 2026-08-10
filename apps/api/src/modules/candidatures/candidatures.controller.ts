/**
 * Endpoints du module Candidatures.
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 10 août 2026
 */
import {
  Controller, Get, Post, Delete, Body, Param, Query, UploadedFile,
  UseInterceptors, ParseUUIDPipe, HttpCode, HttpStatus, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { RoleUtilisateur } from '@prisma/client';
import { CandidaturesService } from './candidatures.service';
import { TAILLE_MAX_DOCUMENT } from '../medias/fichiers.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Utilisateur } from '../../common/decorators/utilisateur.decorator';
import type { UtilisateurConnecte } from '../auth/jwt.strategy';
import {
  TypePieceDossierDto, SoumettreCandidatureDto,
  DecisionCandidatureDto, ListerCandidaturesDto,
} from './dto/candidature.dto';

interface FichierTeleverse {
  buffer: Buffer;
  size: number;
}

@ApiTags('Candidatures')
@Controller()
export class CandidaturesController {
  constructor(private readonly candidatures: CandidaturesService) {}

  // ---------- Référentiel ----------

  @Public()
  @Get('motifs-refus')
  @ApiOperation({ summary: 'Lister les motifs de refus autorisés (liste fermée)' })
  motifsRefus() {
    return this.candidatures.motifsRefus();
  }

  // ---------- Dossier du locataire ----------

  @Get('dossier')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Consulter son dossier et les pièces manquantes' })
  monDossier(@Utilisateur() utilisateur: UtilisateurConnecte) {
    return this.candidatures.monDossier(utilisateur);
  }

  @Post('dossier/pieces')
  @UseInterceptors(FileInterceptor('fichier', { limits: { fileSize: TAILLE_MAX_DOCUMENT } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fichier: { type: 'string', format: 'binary' },
        typePiece: { type: 'string', example: 'revenus' },
      },
    },
  })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Téléverser une pièce justificative (remplace la précédente du même type)' })
  ajouterPiece(
    @Body() dto: TypePieceDossierDto,
    @UploadedFile() fichier: FichierTeleverse,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    if (!fichier) throw new BadRequestException('Aucun fichier reçu (champ « fichier » attendu).');
    return this.candidatures.ajouterPiece(dto.typePiece, fichier, utilisateur);
  }

  @Delete('dossier/pieces/:pieceId')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Supprimer une pièce de son dossier' })
  supprimerPiece(
    @Param('pieceId', ParseUUIDPipe) pieceId: string,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.candidatures.supprimerPiece(pieceId, utilisateur);
  }

  // ---------- Candidatures du locataire ----------

  @Post('candidatures')
  @Roles(RoleUtilisateur.locataire, RoleUtilisateur.proprietaire, RoleUtilisateur.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Candidater sur une annonce (dossier complet requis)' })
  @ApiResponse({ status: 400, description: 'Dossier incomplet' })
  @ApiResponse({ status: 409, description: 'Candidature déjà déposée sur cette annonce' })
  soumettre(
    @Body() dto: SoumettreCandidatureDto,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.candidatures.soumettre(dto, utilisateur);
  }

  @Get('candidatures')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lister ses candidatures et leur statut' })
  mesCandidatures(
    @Query() filtres: ListerCandidaturesDto,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.candidatures.mesCandidatures(filtres, utilisateur);
  }

  @Post('candidatures/:id/retrait')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retirer sa candidature' })
  retirer(
    @Param('id', ParseUUIDPipe) id: string,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.candidatures.retirer(id, utilisateur);
  }

  // ---------- Arbitrage par le bailleur ----------

  @Get('annonces/:annonceId/candidatures')
  @Roles(RoleUtilisateur.proprietaire, RoleUtilisateur.agence, RoleUtilisateur.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Candidatures reçues (pièces visibles seulement si consenties)' })
  candidaturesRecues(
    @Param('annonceId', ParseUUIDPipe) annonceId: string,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.candidatures.candidaturesRecues(annonceId, utilisateur);
  }

  @Get('candidatures/:id/pieces/:pieceId/url')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'URL temporaire vers une pièce (consentement exigé pour le bailleur)' })
  @ApiResponse({ status: 403, description: 'Consentement au partage non donné' })
  urlPiece(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pieceId', ParseUUIDPipe) pieceId: string,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.candidatures.urlPiece(id, pieceId, utilisateur);
  }

  @Post('candidatures/:id/decision')
  @HttpCode(HttpStatus.OK)
  @Roles(RoleUtilisateur.proprietaire, RoleUtilisateur.agence, RoleUtilisateur.admin)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Décider d'une candidature — l'acceptation réserve le bien (RG-DOS-A)",
  })
  @ApiResponse({ status: 400, description: 'Motif de refus manquant ou hors liste' })
  decider(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecisionCandidatureDto,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.candidatures.decider(id, dto, utilisateur);
  }
}
