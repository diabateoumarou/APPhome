/**
 * Consultation de l'échéancier d'un contrat.
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 11 août 2026
 */
import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaiementsService } from './paiements.service';
import { Utilisateur } from '../../common/decorators/utilisateur.decorator';
import type { UtilisateurConnecte } from '../auth/jwt.strategy';

@ApiTags('Paiements')
@ApiBearerAuth()
@Controller('contrats/:contratId/echeancier')
export class EcheancierController {
  constructor(private readonly paiements: PaiementsService) {}

  @Get()
  @ApiOperation({ summary: "Échéancier du contrat avec le solde restant dû" })
  echeancier(
    @Param('contratId', ParseUUIDPipe) contratId: string,
    @Utilisateur() utilisateur: UtilisateurConnecte,
  ) {
    return this.paiements.echeancier(contratId, utilisateur);
  }
}
