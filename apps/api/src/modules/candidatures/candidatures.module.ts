import { Module } from '@nestjs/common';
import { CandidaturesService } from './candidatures.service';
import { CandidaturesController } from './candidatures.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { MediasModule } from '../medias/medias.module';

@Module({
  imports: [NotificationsModule, MediasModule],
  controllers: [CandidaturesController],
  providers: [CandidaturesService],
  exports: [CandidaturesService],
})
export class CandidaturesModule {}
