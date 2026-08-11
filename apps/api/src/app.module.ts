/**
 * Module racine — le découpage reprend les 8 domaines du modèle de données.
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 05 août 2026
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProfilModule } from './modules/profil/profil.module';
import { AuditModule } from './common/audit/audit.module';
import { BiensModule } from './modules/biens/biens.module';
import { AnnoncesModule } from './modules/annonces/annonces.module';
import { MediasModule } from './modules/medias/medias.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { VisitesModule } from './modules/visites/visites.module';
import { CandidaturesModule } from './modules/candidatures/candidatures.module';
import { ContratsModule } from './modules/contrats/contrats.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Limitation de débit globale : 100 requêtes / minute / IP
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuditModule,
    AuthModule,
    ProfilModule,
    BiensModule,
    AnnoncesModule,
    MediasModule,
    NotificationsModule,
    VisitesModule,
    CandidaturesModule,
    ContratsModule,
    // À venir : PaiementsModule,
    // LitigesModule, ReportingModule
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
