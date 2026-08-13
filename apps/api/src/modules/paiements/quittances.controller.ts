/**
 * Endpoints des quittances.
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 12 août 2026
 */
import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { QuittancesService } from './quittances.service';
import { Utilisateur } from '../../common/decorators/utilisateur.decorator';
import type { UtilisateurConnecte } from '../auth/jwt.strategy';

@ApiTags('Quittances')
@ApiBearerAuth()
@Controller()
export class QuittancesController {
  constructor(private readonly quittances: QuittancesService) {}

  @Get('contrats/:contratId/quittances')
  @ApiOperation({ summary: "Lister les quittances d'un contrat" })
  listerParContrat(
    @Param('contratId', ParseUUIDPipe) contratId: string,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.quittances.listerParContrat(contratId, utilisateur);
  }

  @Get('quittances/:id/document')
  @ApiOperation({ summary: 'URL temporaire vers le PDF de la quittance' })
  urlQuittance(
    @Param('id', ParseUUIDPipe) id: string,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.quittances.urlQuittance(id, utilisateur);
  }
}
