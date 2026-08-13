/**
 * Endpoints du séquestre de caution.
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 13 août 2026
 */
import {
  Controller, Get, Post, Body, Param, UploadedFile, UseInterceptors,
  ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { RoleUtilisateur } from '@prisma/client';
import { SequestreService } from './sequestre.service';
import { TAILLE_MAX_DOCUMENT } from '../medias/fichiers.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Utilisateur } from '../../common/decorators/utilisateur.decorator';
import type { UtilisateurConnecte } from '../auth/jwt.strategy';
import {
  ProposerRetenueDto, ProposerRestitutionDto, RefuserPropositionDto,
  GelSequestreDto, DecisionLitigeDto,
} from './dto/sequestre.dto';

interface FichierTeleverse {
  buffer: Buffer;
  size: number;
}

@ApiTags('Séquestre')
@ApiBearerAuth()
@Controller()
export class SequestreController {
  constructor(private readonly sequestre: SequestreService) {}

  @Get('contrats/:contratId/sequestre')
  @ApiOperation({ summary: 'Consulter le séquestre et ses mouvements' })
  consulter(
    @Param('contratId', ParseUUIDPipe) contratId: string,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.sequestre.consulter(contratId, utilisateur);
  }

  @Post('contrats/:contratId/sequestre/retenues')
  @UseInterceptors(FileInterceptor('justificatif', { limits: { fileSize: TAILLE_MAX_DOCUMENT } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        justificatif: { type: 'string', format: 'binary' },
        montant: { type: 'string', example: '40000' },
        motif: { type: 'string', example: 'Remplacement du chauffe-eau, facture jointe' },
      },
    },
  })
  @ApiOperation({ summary: 'Proposer une retenue (justificatif obligatoire)' })
  @ApiResponse({ status: 400, description: 'Justificatif manquant ou montant supérieur au solde' })
  proposerRetenue(
    @Param('contratId', ParseUUIDPipe) contratId: string,
    @Body() dto: ProposerRetenueDto,
    @UploadedFile() justificatif: FichierTeleverse | undefined,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.sequestre.proposerRetenue(contratId, dto, justificatif, utilisateur);
  }

  @Post('contrats/:contratId/sequestre/restitution')
  @ApiOperation({ summary: 'Proposer la restitution du solde au locataire' })
  proposerRestitution(
    @Param('contratId', ParseUUIDPipe) contratId: string,
    @Body() dto: ProposerRestitutionDto,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.sequestre.proposerRestitution(contratId, dto, utilisateur);
  }

  @Post('sequestre/mouvements/:id/validation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Valider une proposition — exécutée dès que les deux parties ont validé',
  })
  valider(
    @Param('id', ParseUUIDPipe) id: string,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.sequestre.valider(id, utilisateur);
  }

  @Post('sequestre/mouvements/:id/refus')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refuser une proposition' })
  refuser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefuserPropositionDto,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.sequestre.refuser(id, dto.motif, utilisateur);
  }

  @Post('contrats/:contratId/sequestre/gel')
  @HttpCode(HttpStatus.OK)
  @Roles(RoleUtilisateur.admin, RoleUtilisateur.agence)
  @ApiOperation({ summary: 'Geler ou dégeler les fonds pendant un litige' })
  definirGel(
    @Param('contratId', ParseUUIDPipe) contratId: string,
    @Body() dto: GelSequestreDto,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.sequestre.definirGel(contratId, dto.geler, dto.litigeId, utilisateur);
  }

  @Post('contrats/:contratId/sequestre/decision')
  @HttpCode(HttpStatus.OK)
  @Roles(RoleUtilisateur.admin, RoleUtilisateur.agence)
  @ApiOperation({ summary: 'Exécuter une décision de litige (sans co-validation)' })
  executerDecision(
    @Param('contratId', ParseUUIDPipe) contratId: string,
    @Body() dto: DecisionLitigeDto,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.sequestre.executerSurDecision(
      contratId,
      dto.litigeId,
      BigInt(dto.montantRetenu),
      utilisateur,
    );
  }
}
