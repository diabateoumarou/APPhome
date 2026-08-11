/**
 * DTO du module Paiements.
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 11 août 2026
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum, IsOptional, IsInt, IsUUID, IsArray, Matches, Min, Max, ArrayMinSize, ArrayMaxSize,
} from 'class-validator';
import { MoyenPaiement, StatutPaiement } from '@prisma/client';

const MONTANT_FCFA = /^\d{1,15}$/;
/** Format E.164, comme partout ailleurs sur la plateforme. */
const E164 = /^\+[1-9]\d{7,14}$/;

export class InitierPaiementDto {
  @ApiProperty({
    type: [String],
    description: 'Échéances à régler — toutes du même contrat',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Indiquez au moins une échéance' })
  @ArrayMaxSize(24, { message: 'Maximum 24 échéances par paiement' })
  @IsUUID('4', { each: true, message: "Identifiant d'échéance invalide" })
  echeanceIds!: string[];

  @ApiProperty({ enum: MoyenPaiement, example: MoyenPaiement.orange_money })
  @IsEnum(MoyenPaiement, { message: 'Moyen de paiement non pris en charge' })
  moyen!: MoyenPaiement;

  @ApiPropertyOptional({
    example: '160000',
    description: 'Montant en FCFA — le solde dû par défaut (paiement partiel accepté)',
  })
  @IsOptional()
  @Matches(MONTANT_FCFA, { message: 'Le montant doit être un entier en FCFA' })
  montant?: string;

  @ApiPropertyOptional({
    example: '+2250700000055',
    description: 'Numéro à débiter, si différent de celui du compte',
  })
  @IsOptional()
  @Matches(E164, { message: 'Numéro au format international attendu' })
  telephonePayeur?: string;
}

export class ListerPaiementsDto {
  @ApiPropertyOptional({ enum: StatutPaiement })
  @IsOptional()
  @IsEnum(StatutPaiement)
  statut?: StatutPaiement;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  contratId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite?: number = 20;
}
