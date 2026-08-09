/**
 * Journal d'audit — table append-only (NFR du CDC).
 * Les échecs d'écriture ne bloquent jamais l'action métier, mais sont tracés :
 * perdre une ligne d'audit est préférable à refuser une opération légitime.
 *
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 09 août 2026
 */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface EntreeAudit {
  agenceId?: string | null;
  utilisateurId?: string | null;
  action: string;
  entiteType: string;
  entiteId?: string | null;
  donneesAvant?: Record<string, unknown> | null;
  donneesApres?: Record<string, unknown> | null;
  adresseIp?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async enregistrer(entree: EntreeAudit): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          agenceId: entree.agenceId ?? null,
          utilisateurId: entree.utilisateurId ?? null,
          action: entree.action,
          entiteType: entree.entiteType,
          entiteId: entree.entiteId ?? null,
          donneesAvant: (entree.donneesAvant ?? undefined) as Prisma.InputJsonValue,
          donneesApres: (entree.donneesApres ?? undefined) as Prisma.InputJsonValue,
          adresseIp: entree.adresseIp ?? null,
        },
      });
    } catch (e) {
      const motif = e instanceof Error ? e.message : 'erreur inconnue';
      this.logger.error(`Échec d'écriture du journal d'audit (${entree.action}) : ${motif}`);
    }
  }
}
