import { Module } from '@nestjs/common';
import { ProfilService } from './profil.service';
import { ProfilController } from './profil.controller';

@Module({
  controllers: [ProfilController],
  providers: [ProfilService],
  exports: [ProfilService],
})
export class ProfilModule {}
