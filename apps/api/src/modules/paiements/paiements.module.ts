/**
 * Module Paiements — encaissements, quittances, traitements planifiés.
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 12 août 2026
 */
import { Module } from '@nestjs/common';
import { PaiementsService } from './paiements.service';
import { PaiementsController } from './paiements.controller';
import { EcheancierController } from './echeancier.controller';
import { QuittancesService } from './quittances.service';
import { QuittancesController } from './quittances.controller';
import { TachesFinancieresService } from './taches-financieres.service';
import { TachesController } from './taches.controller';
import { ConsoleFournisseur } from './fournisseurs/console.fournisseur';
import { FOURNISSEUR_PAIEMENT } from './fournisseurs/fournisseur.interface';
import { NotificationsModule } from '../notifications/notifications.module';
import { MediasModule } from '../medias/medias.module';
import { ContratsModule } from '../contrats/contrats.module';

@Module({
  imports: [NotificationsModule, MediasModule, ContratsModule],
  controllers: [
    PaiementsController,
    EcheancierController,
    QuittancesController,
    TachesController,
  ],
  providers: [
    PaiementsService,
    QuittancesService,
    TachesFinancieresService,
    // Le fournisseur réel (CinetPay ou PayDunya) remplacera cette
    // implémentation après le POC de phase 0, sans toucher au métier.
    { provide: FOURNISSEUR_PAIEMENT, useClass: ConsoleFournisseur },
  ],
  exports: [PaiementsService, QuittancesService],
})
export class PaiementsModule {}
