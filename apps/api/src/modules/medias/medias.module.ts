import { Module } from '@nestjs/common';
import { MediasService } from './medias.service';
import { MediasController } from './medias.controller';
import { StockageService } from './stockage.service';
import { FichiersService } from './fichiers.service';

@Module({
  controllers: [MediasController],
  providers: [MediasService, StockageService, FichiersService],
  exports: [MediasService, StockageService, FichiersService],
})
export class MediasModule {}
