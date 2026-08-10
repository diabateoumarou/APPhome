/**
 * Endpoints du module Contrats.
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 10 août 2026
 */
import {
  Controller, Get, Post, Body, Param, Query, Req, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RoleUtilisateur } from '@prisma/client';
import { ContratsService } from './contrats.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Utilisateur } from '../../common/decorators/utilisateur.decorator';
import type { UtilisateurConnecte } from '../auth/jwt.strategy';
import { GenererContratDto, SignerDto, DonnerPreavisDto, ListerContratsDto } from './dto/contrat.dto';

/** Requête HTTP réduite aux éléments nécessaires au procès-verbal de signature. */
interface RequeteSignature {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

@ApiTags('Contrats')
@ApiBearerAuth()
@Controller('contrats')
export class ContratsController {
  constructor(private readonly contrats: ContratsService) {}

  @Post()
  @Roles(RoleUtilisateur.proprietaire, RoleUtilisateur.agence, RoleUtilisateur.admin)
  @ApiOperation({ summary: 'Générer le bail depuis une candidature acceptée' })
  @ApiResponse({ status: 400, description: 'Plafonds légaux dépassés' })
  @ApiResponse({ status: 409, description: 'Un contrat existe déjà pour cette candidature' })
  generer(@Body() dto: GenererContratDto, @Utilisateur() utilisateur: UtilisateurConnecte) {
    return this.contrats.generer(dto, utilisateur);
  }

  @Get()
  @ApiOperation({ summary: 'Lister ses contrats' })
  lister(
    @Query() filtres: ListerContratsDto,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.contrats.lister(filtres, utilisateur);
  }

  @Get(':id')
  @ApiOperation({ summary: "Détail d'un contrat et état des signatures" })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.contrats.detail(id, utilisateur);
  }

  @Get(':id/document')
  @ApiOperation({ summary: 'URL temporaire vers le PDF du bail, avec son empreinte' })
  urlDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.contrats.urlDocument(id, utilisateur);
  }

  @Post(':id/signature/code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recevoir le code de signature par SMS (bailleur en premier)' })
  @ApiResponse({ status: 409, description: 'Le bailleur doit signer avant le locataire' })
  demanderCode(
    @Param('id', ParseUUIDPipe) id: string,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.contrats.demanderCodeSignature(id, utilisateur);
  }

  @Post(':id/signature')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Signer électroniquement — la seconde signature active le contrat',
  })
  signer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SignerDto,
    @Utilisateur() utilisateur: UtilisateurConnecte,
    @Req() requete: RequeteSignature,
  ) {
    const userAgent = requete.headers['user-agent'];
    return this.contrats.signer(id, dto.code, utilisateur, {
      ip: requete.ip,
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    });
  }

  @Post(':id/preavis')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Donner congé (délai selon le rôle)' })
  donnerPreavis(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DonnerPreavisDto,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.contrats.donnerPreavis(id, dto.motif, utilisateur);
  }
}
