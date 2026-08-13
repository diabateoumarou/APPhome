/**
 * Déclenchement manuel des traitements planifiés.
 * Réservé à l'administrateur : utile pour rattraper un incident sans
 * attendre le prochain passage, et pour les tests d'exploitation.
 *
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 12 août 2026
 */
import { Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RoleUtilisateur } from '@prisma/client';
import { TachesFinancieresService } from './taches-financieres.service';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Paiements')
@ApiBearerAuth()
@Controller('taches')
export class TachesController {
  constructor(private readonly taches: TachesFinancieresService) {}

  @Post('echeances/retards')
  @HttpCode(HttpStatus.OK)
  @Roles(RoleUtilisateur.admin)
  @ApiOperation({ summary: 'Passer les échéances dues et en retard (manuel)' })
  marquerRetards() {
    return this.taches.marquerRetards();
  }

  @Post('echeances/avis')
  @HttpCode(HttpStatus.OK)
  @Roles(RoleUtilisateur.admin)
  @ApiOperation({ summary: 'Envoyer les avis d’échéance à 5 jours (manuel)' })
  avertir() {
    return this.taches.avertirEcheancesProches();
  }

  @Post('impayes/relances')
  @HttpCode(HttpStatus.OK)
  @Roles(RoleUtilisateur.admin)
  @ApiOperation({ summary: 'Envoyer les relances graduées sur impayés (manuel)' })
  relancer() {
    return this.taches.relancerImpayes();
  }
}
