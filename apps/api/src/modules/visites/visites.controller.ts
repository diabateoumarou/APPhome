/**
 * Endpoints du module Visites.
 * Les créneaux disponibles sont publics (fiche d'annonce) ; la réservation et
 * la gestion exigent une authentification.
 *
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 10 août 2026
 */
import {
  Controller, Get, Post, Patch, Body, Param, Query, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RoleUtilisateur } from '@prisma/client';
import { VisitesService } from './visites.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Utilisateur } from '../../common/decorators/utilisateur.decorator';
import type { UtilisateurConnecte } from '../auth/jwt.strategy';
import {
  CreerCreneauxDto, ReserverVisiteDto, AnnulerVisiteDto, CompteRenduDto,
  ListerCreneauxDto, ListerVisitesDto,
} from './dto/visite.dto';

@ApiTags('Visites')
@Controller()
export class VisitesController {
  constructor(private readonly visites: VisitesService) {}

  // ---------- Créneaux (bailleur / agent) ----------

  @Post('biens/:bienId/creneaux')
  @Roles(RoleUtilisateur.proprietaire, RoleUtilisateur.agence, RoleUtilisateur.admin, RoleUtilisateur.agent)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ouvrir des créneaux de visite (lot atomique)' })
  @ApiResponse({ status: 409, description: 'Chevauchement avec un créneau existant' })
  creerCreneaux(
    @Param('bienId', ParseUUIDPipe) bienId: string,
    @Body() dto: CreerCreneauxDto,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.visites.creerCreneaux(bienId, dto, utilisateur);
  }

  @Public()
  @Get('biens/:bienId/creneaux')
  @ApiOperation({ summary: 'Lister les créneaux encore réservables' })
  creneauxDisponibles(
    @Param('bienId', ParseUUIDPipe) bienId: string,
    @Query() filtres: ListerCreneauxDto,
  ) {
    return this.visites.creneauxDisponibles(bienId, filtres);
  }

  @Patch('creneaux/:creneauId/fermeture')
  @HttpCode(HttpStatus.OK)
  @Roles(RoleUtilisateur.proprietaire, RoleUtilisateur.agence, RoleUtilisateur.admin, RoleUtilisateur.agent)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Fermer un créneau sans réservation' })
  fermerCreneau(
    @Param('creneauId', ParseUUIDPipe) creneauId: string,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.visites.fermerCreneau(creneauId, utilisateur);
  }

  // ---------- Rendez-vous ----------

  @Post('visites')
  @Roles(RoleUtilisateur.locataire, RoleUtilisateur.proprietaire, RoleUtilisateur.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Réserver une visite (confirmation immédiate si libre)' })
  @ApiResponse({ status: 403, description: 'Prise de rendez-vous suspendue (absences répétées)' })
  reserver(@Body() dto: ReserverVisiteDto, @Utilisateur() visiteur: UtilisateurConnecte) {
    return this.visites.reserver(dto, visiteur);
  }

  @Get('visites')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lister ses visites (comme visiteur ou comme bailleur)' })
  listerMiennes(
    @Query() filtres: ListerVisitesDto,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.visites.listerMiennes(filtres, utilisateur);
  }

  @Get('visites/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Détail d'une visite (coordonnées révélées après confirmation)" })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.visites.detail(id, utilisateur);
  }

  @Post('visites/:id/annulation')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Annuler une visite (signalée si à moins de 4 h)' })
  annuler(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnnulerVisiteDto,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.visites.annuler(id, dto.motif, utilisateur);
  }

  @Post('visites/:id/cloture')
  @HttpCode(HttpStatus.OK)
  @Roles(RoleUtilisateur.proprietaire, RoleUtilisateur.agence, RoleUtilisateur.admin, RoleUtilisateur.agent)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Clôturer une visite : effectuée ou absence' })
  cloturer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompteRenduDto,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.visites.cloturer(id, dto.issue, dto.compteRendu, utilisateur);
  }
}
