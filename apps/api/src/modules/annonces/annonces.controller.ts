/**
 * Endpoints du module Annonces.
 * Les routes de recherche sont publiques (vitrine SEO) ; la modération est
 * réservée aux rôles admin et agence.
 *
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 09 août 2026
 */
import {
  Controller, Get, Post, Patch, Body, Param, Query, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RoleUtilisateur } from '@prisma/client';
import { AnnoncesService } from './annonces.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Utilisateur } from '../../common/decorators/utilisateur.decorator';
import type { UtilisateurConnecte } from '../auth/jwt.strategy';
import {
  CreerAnnonceDto, ModifierAnnonceDto, RejeterAnnonceDto,
  ListerAnnoncesDto, RechercherAnnoncesDto,
} from './dto/annonce.dto';

@ApiTags('Annonces')
@Controller('annonces')
export class AnnoncesController {
  constructor(private readonly annonces: AnnoncesService) {}

  // ---------- Vitrine publique ----------

  @Public()
  @Get('recherche')
  @ApiOperation({ summary: 'Rechercher des annonces publiées (filtres, tri, pagination)' })
  rechercher(@Query() filtres: RechercherAnnoncesDto) {
    return this.annonces.rechercher(filtres);
  }

  @Public()
  @Get('publiques/:id')
  @ApiOperation({ summary: "Fiche publique d'une annonce, avec coût total d'entrée" })
  detailPublic(@Param('id', ParseUUIDPipe) id: string) {
    return this.annonces.detailPublic(id);
  }

  // ---------- Espace bailleur ----------

  @Post()
  @Roles(RoleUtilisateur.proprietaire, RoleUtilisateur.agence, RoleUtilisateur.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Créer une annonce en brouillon' })
  @ApiResponse({ status: 400, description: 'Plafonds légaux dépassés (loi n°2019-576)' })
  creer(@Body() dto: CreerAnnonceDto, @Utilisateur() utilisateur: UtilisateurConnecte) {
    return this.annonces.creer(dto, utilisateur);
  }

  @Get()
  @Roles(RoleUtilisateur.proprietaire, RoleUtilisateur.agence, RoleUtilisateur.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lister ses annonces' })
  listerMiennes(
    @Query() filtres: ListerAnnoncesDto,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.annonces.listerMiennes(filtres, utilisateur);
  }

  @Patch(':id')
  @Roles(RoleUtilisateur.proprietaire, RoleUtilisateur.agence, RoleUtilisateur.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Modifier une annonce (brouillon ou rejetée uniquement)' })
  modifier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModifierAnnonceDto,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.annonces.modifier(id, dto, utilisateur);
  }

  @Post(':id/soumission')
  @HttpCode(HttpStatus.OK)
  @Roles(RoleUtilisateur.proprietaire, RoleUtilisateur.agence, RoleUtilisateur.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soumettre une annonce à modération (3 photos minimum)' })
  soumettre(
    @Param('id', ParseUUIDPipe) id: string,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.annonces.soumettre(id, utilisateur);
  }

  @Post(':id/retrait')
  @HttpCode(HttpStatus.OK)
  @Roles(RoleUtilisateur.proprietaire, RoleUtilisateur.agence, RoleUtilisateur.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retirer une annonce de la publication' })
  retirer(
    @Param('id', ParseUUIDPipe) id: string,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.annonces.retirer(id, utilisateur);
  }

  // ---------- Modération ----------

  @Get('moderation/file')
  @Roles(RoleUtilisateur.admin, RoleUtilisateur.agence)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'File des annonces à modérer, avec contrôles automatiques' })
  fileModeration(@Query() filtres: ListerAnnoncesDto) {
    return this.annonces.fileModeration(filtres);
  }

  @Post(':id/moderation/publication')
  @HttpCode(HttpStatus.OK)
  @Roles(RoleUtilisateur.admin, RoleUtilisateur.agence)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publier une annonce (validité 60 jours)' })
  publier(
    @Param('id', ParseUUIDPipe) id: string,
    @Utilisateur() moderateur: UtilisateurConnecte,
  ) {
    return this.annonces.publier(id, moderateur);
  }

  @Post(':id/moderation/rejet')
  @HttpCode(HttpStatus.OK)
  @Roles(RoleUtilisateur.admin, RoleUtilisateur.agence)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Rejeter une annonce avec motif obligatoire' })
  rejeter(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejeterAnnonceDto,
    @Utilisateur() moderateur: UtilisateurConnecte,
  ) {
    return this.annonces.rejeter(id, dto.motif, moderateur);
  }
}
