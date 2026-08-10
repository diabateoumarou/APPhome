import { Module } from '@nestjs/common';
import { ContratsService } from './contrats.service';
import { ContratsController } from './contrats.controller';
import { GabaritService } from './gabarit.service';
import { PdfService } from './pdf.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { MediasModule } from '../medias/medias.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [NotificationsModule, MediasModule, AuthModule],
  controllers: [ContratsController],
  providers: [ContratsService, GabaritService, PdfService],
  exports: [ContratsService, GabaritService, PdfService],
})
export class ContratsModule {}
