import { Module } from '@nestjs/common';
import { SequestreService } from './sequestre.service';
import { SequestreController } from './sequestre.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { MediasModule } from '../medias/medias.module';
import { ContratsModule } from '../contrats/contrats.module';

@Module({
  imports: [NotificationsModule, MediasModule, ContratsModule],
  controllers: [SequestreController],
  providers: [SequestreService],
  exports: [SequestreService],
})
export class SequestreModule {}
