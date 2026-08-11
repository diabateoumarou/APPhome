import { Module } from '@nestjs/common';
import { PaiementsService } from './paiements.service';
import { PaiementsController } from './paiements.controller';
import { EcheancierController } from './echeancier.controller';
import { ConsoleFournisseur } from './fournisseurs/console.fournisseur';
import { FOURNISSEUR_PAIEMENT } from './fournisseurs/fournisseur.interface';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [PaiementsController, EcheancierController],
  providers: [
    PaiementsService,
    // Le fournisseur réel (CinetPay ou PayDunya) remplacera cette
    // implémentation après le POC de phase 0, sans toucher au métier.
    { provide: FOURNISSEUR_PAIEMENT, useClass: ConsoleFournisseur },
  ],
  exports: [PaiementsService],
})
export class PaiementsModule {}
