/**
 * Endpoints du profil utilisateur.
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 11 août 2026
 */
import { Controller, Get, Patch, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProfilService } from './profil.service';
import { Utilisateur } from '../../common/decorators/utilisateur.decorator';
import type { UtilisateurConnecte } from '../auth/jwt.strategy';
import { ModifierProfilDto } from './dto/profil.dto';

@ApiTags('Profil')
@ApiBearerAuth()
@Controller('profil')
export class ProfilController {
  constructor(private readonly profil: ProfilService) {}

  @Get()
  @ApiOperation({ summary: 'Consulter son profil et les mentions manquantes' })
  consulter(@Utilisateur() utilisateur: UtilisateurConnecte) {
    return this.profil.consulter(utilisateur);
  }

  @Patch()
  @ApiOperation({ summary: "Mettre à jour son profil (l'adresse sert d'élection de domicile)" })
  modifier(
    @Body() dto: ModifierProfilDto,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.profil.modifier(dto, utilisateur);
  }
}
