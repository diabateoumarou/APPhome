/**
 * Endpoints du module Paiements.
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 11 août 2026
 */
import {
  Controller, Get, Post, Body, Param, Query, Headers, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiExcludeEndpoint } from '@nestjs/swagger';
import { RawBody } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { PaiementsService } from './paiements.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Utilisateur } from '../../common/decorators/utilisateur.decorator';
import type { UtilisateurConnecte } from '../auth/jwt.strategy';
import { InitierPaiementDto, ListerPaiementsDto } from './dto/paiement.dto';

@ApiTags('Paiements')
@Controller('paiements')
export class PaiementsController {
  constructor(private readonly paiements: PaiementsService) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initier le règlement d’une ou plusieurs échéances' })
  @ApiResponse({ status: 400, description: 'Montant supérieur au solde dû' })
  initier(@Body() dto: InitierPaiementDto, @Utilisateur() payeur: UtilisateurConnecte) {
    return this.paiements.initier(dto, payeur);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lister ses paiements' })
  lister(
    @Query() filtres: ListerPaiementsDto,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.paiements.lister(filtres, utilisateur);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Détail d'un paiement et sa ventilation" })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.paiements.detail(id, utilisateur);
  }

  /**
   * Point d'entrée des notifications de l'agrégateur.
   * Public par nécessité — l'agrégateur ne porte pas de jeton — mais protégé
   * par vérification de signature HMAC dans le service.
   */
  @Public()
  @Post('notification')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  notification(
    @Body() corps: Record<string, unknown>,
    @Headers('x-signature') signature: string | undefined,
    @RawBody() brut: Buffer | undefined,
  ) {
    return this.paiements.traiterNotification(corps, signature, brut);
  }

  @Post('reconciliation')
  @HttpCode(HttpStatus.OK)
  @Roles(RoleUtilisateur.admin)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Vérifier activement les paiements sans notification (rattrapage manuel)',
  })
  reconcilier() {
    return this.paiements.reconcilier();
  }
}
