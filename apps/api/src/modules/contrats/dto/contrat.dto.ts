/**
 * DTO du module Contrats.
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 10 août 2026
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString, IsEnum, IsOptional, IsInt, IsUUID, IsDateString, Matches, Min, Max, Length,
} from 'class-validator';
import { StatutContrat } from '@prisma/client';

const MONTANT_FCFA = /^\d{1,15}$/;

export class GenererContratDto {
  @ApiProperty({ format: 'uuid', description: 'Candidature acceptée' })
  @IsUUID('4', { message: 'Identifiant de candidature invalide' })
  candidatureId!: string;

  @ApiProperty({ example: 12, description: 'Durée du bail en mois' })
  @IsInt()
  @Min(1)
  @Max(120)
  dureeMois!: number;

  @ApiProperty({ example: '2026-09-01', description: "Date de prise d'effet" })
  @IsDateString({}, { message: 'Date de prise d\'effet invalide' })
  datePriseEffet!: string;

  @ApiProperty({ example: 5, description: 'Jour du mois de paiement du loyer (1 à 28)' })
  @IsInt()
  @Min(1)
  @Max(28, { message: 'Le jour d\'échéance doit être compris entre 1 et 28' })
  jourEcheance!: number;

  @ApiPropertyOptional({ example: 30, description: 'Préavis locataire en jours' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  preavisLocataireJours?: number;

  @ApiPropertyOptional({ example: 90, description: 'Préavis bailleur en jours' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  preavisBailleurJours?: number;

  @ApiPropertyOptional({ example: 30, description: 'Délai de restitution de la caution en jours' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(180)
  delaiRestitutionCautionJours?: number;

  @ApiPropertyOptional({ example: 5, description: 'Jours de tolérance avant relance' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  joursTolerance?: number;

  @ApiPropertyOptional({ example: '0', description: 'Pénalité de retard en FCFA' })
  @IsOptional()
  @Matches(MONTANT_FCFA, { message: 'La pénalité doit être un montant entier en FCFA' })
  penaliteRetardMontant?: string;
}

export class DemanderSignatureDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  contratId!: string;
}

export class SignerDto {
  @ApiProperty({ example: '482913', description: 'Code reçu par SMS' })
  @Matches(/^\d{6}$/, { message: 'Le code doit contenir 6 chiffres' })
  code!: string;
}

export class DonnerPreavisDto {
  @ApiPropertyOptional({ example: 'Mutation professionnelle' })
  @IsOptional()
  @IsString()
  @Length(3, 500)
  motif?: string;
}

export class ListerContratsDto {
  @ApiPropertyOptional({ enum: StatutContrat })
  @IsOptional()
  @IsEnum(StatutContrat)
  statut?: StatutContrat;

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
