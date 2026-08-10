import { Module } from '@nestjs/common';
import { VisitesService } from './visites.service';
import { VisitesController } from './visites.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [VisitesController],
  providers: [VisitesService],
  exports: [VisitesService],
})
export class VisitesModule {}
