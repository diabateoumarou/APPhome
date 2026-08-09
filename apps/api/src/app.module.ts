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
import { AuditModule } from './common/audit/audit.module';
import { BiensModule } from './modules/biens/biens.module';
import { AnnoncesModule } from './modules/annonces/annonces.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Limitation de débit globale : 100 requêtes / minute / IP
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuditModule,
    AuthModule,
    BiensModule,
    AnnoncesModule,
    NotificationsModule,
    // À venir (sprints S3+) : BiensModule, AnnoncesModule, VisitesModule,
    // CandidaturesModule, ContratsModule, PaiementsModule, LitigesModule, ReportingModule
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
