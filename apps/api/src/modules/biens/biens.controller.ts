/**
 * Endpoints du module Biens.
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 09 août 2026
 */
import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RoleUtilisateur } from '@prisma/client';
import { BiensService } from './biens.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Utilisateur } from '../../common/decorators/utilisateur.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { UtilisateurConnecte } from '../auth/jwt.strategy';
import {
  CreerBienDto, ModifierBienDto, ListerBiensDto,
} from './dto/bien.dto';

@ApiTags('Biens')
@ApiBearerAuth()
@Controller('biens')
export class BiensController {
  constructor(private readonly biens: BiensService) {}

  @Public()
  @Get('equipements')
  @ApiOperation({ summary: 'Lister les équipements disponibles (référentiel)' })
  listerEquipements() {
    return this.biens.listerEquipements();
  }

  @Post()
  @Roles(RoleUtilisateur.proprietaire, RoleUtilisateur.agence, RoleUtilisateur.admin)
  @ApiOperation({ summary: 'Créer un bien (KYC vérifié requis)' })
  @ApiResponse({ status: 403, description: 'KYC incomplet : identité ou titre de propriété non vérifié' })
  creer(@Body() dto: CreerBienDto, @Utilisateur() utilisateur: UtilisateurConnecte) {
    return this.biens.creer(dto, utilisateur);
  }

  @Get()
  @Roles(RoleUtilisateur.proprietaire, RoleUtilisateur.agence, RoleUtilisateur.admin)
  @ApiOperation({ summary: 'Lister ses biens (parc complet pour agence et admin)' })
  lister(@Query() filtres: ListerBiensDto, @Utilisateur() utilisateur: UtilisateurConnecte) {
    return this.biens.lister(filtres, utilisateur);
  }

  @Get(':id')
  @Roles(RoleUtilisateur.proprietaire, RoleUtilisateur.agence, RoleUtilisateur.admin, RoleUtilisateur.agent)
  @ApiOperation({ summary: "Détail d'un bien" })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.biens.detail(id, utilisateur);
  }

  @Patch(':id')
  @Roles(RoleUtilisateur.proprietaire, RoleUtilisateur.agence, RoleUtilisateur.admin)
  @ApiOperation({ summary: 'Modifier un bien (impossible si loué ou vendu)' })
  modifier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModifierBienDto,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.biens.modifier(id, dto, utilisateur);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(RoleUtilisateur.proprietaire, RoleUtilisateur.agence, RoleUtilisateur.admin)
  @ApiOperation({ summary: 'Supprimer un bien sans historique contractuel' })
  supprimer(
    @Param('id', ParseUUIDPipe) id: string,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.biens.supprimer(id, utilisateur);
  }

}
