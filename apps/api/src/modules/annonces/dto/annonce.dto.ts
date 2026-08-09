/**
 * DTO du module Annonces.
 *
 * Les montants sont exprimés en FCFA entiers (pas de décimales) et transitent
 * en string dans le JSON : au-delà de 2^53, un number JavaScript perdrait en
 * précision. Ils sont convertis en BigInt côté service.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 *          Ingénieur Système & Infrastructure Cloud / System Architect
 *          Expert Solutions ICT (Cloud, Système, Cybersécurité)
 * Date   : 09 août 2026
 */
import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString, IsEnum, IsOptional, IsInt, IsUUID, IsDateString,
  Min, Max, Length, Matches,
} from 'class-validator';
import { TypeTransaction, StatutAnnonce, TypeBien } from '@prisma/client';

/** Montant en FCFA : entier positif, sans séparateur ni décimale. */
const MONTANT_FCFA = /^\d{1,15}$/;

export class CreerAnnonceDto {
  @ApiProperty({ format: 'uuid', description: 'Bien concerné (doit vous appartenir)' })
  @IsUUID('4', { message: 'Identifiant de bien invalide' })
  bienId!: string;

  @ApiProperty({ enum: TypeTransaction, example: TypeTransaction.location })
  @IsEnum(TypeTransaction)
  transaction!: TypeTransaction;

  @ApiProperty({ example: 'Appartement 3 pièces — Cocody Angré 8e tranche' })
  @IsString()
  @Length(10, 160)
  titre!: string;

  @ApiPropertyOptional({ example: 'Appartement lumineux, proche commodités…' })
  @IsOptional()
  @IsString()
  @Length(0, 5000)
  description?: string;

  @ApiPropertyOptional({ example: '150000', description: 'Loyer mensuel en FCFA (location)' })
  @IsOptional()
  @Matches(MONTANT_FCFA, { message: 'Le loyer doit être un montant entier en FCFA' })
  loyerMontant?: string;

  @ApiPropertyOptional({ example: '45000000', description: 'Prix en FCFA (vente)' })
  @IsOptional()
  @Matches(MONTANT_FCFA, { message: 'Le prix doit être un montant entier en FCFA' })
  prixVente?: string;

  @ApiPropertyOptional({ example: '10000', description: 'Charges mensuelles en FCFA' })
  @IsOptional()
  @Matches(MONTANT_FCFA, { message: 'Les charges doivent être un montant entier en FCFA' })
  chargesMontant?: string;

  @ApiPropertyOptional({
    example: 2,
    description: 'Caution en mois de loyer — maximum 2 (loi n°2019-576)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2, { message: 'La caution ne peut excéder 2 mois de loyer (loi n°2019-576)' })
  cautionNbMois?: number;

  @ApiPropertyOptional({
    example: 2,
    description: 'Avance en mois de loyer — maximum 2 (loi n°2019-576)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2, { message: "L'avance ne peut excéder 2 mois de loyer (loi n°2019-576)" })
  avanceNbMois?: number;

  @ApiPropertyOptional({ example: '150000', description: "Frais d'agence en FCFA" })
  @IsOptional()
  @Matches(MONTANT_FCFA, { message: "Les frais d'agence doivent être un montant entier en FCFA" })
  fraisAgenceMontant?: string;

  @ApiPropertyOptional({ example: '2026-09-01', description: 'Date de disponibilité' })
  @IsOptional()
  @IsDateString({}, { message: 'Date de disponibilité invalide (format AAAA-MM-JJ)' })
  disponibleLe?: string;
}

export class ModifierAnnonceDto extends PartialType(
  OmitType(CreerAnnonceDto, ['bienId'] as const),
) {}

export class RejeterAnnonceDto {
  @ApiProperty({
    example: 'Photos de qualité insuffisante et titre de propriété illisible.',
    description: 'Motif communiqué au bailleur — obligatoire (REQ-ANN-04)',
  })
  @IsString()
  @Length(10, 1000, { message: 'Le motif de rejet doit être explicite (10 caractères minimum)' })
  motif!: string;
}

export class ListerAnnoncesDto {
  @ApiPropertyOptional({ enum: StatutAnnonce })
  @IsOptional()
  @IsEnum(StatutAnnonce)
  statut?: StatutAnnonce;

  @ApiPropertyOptional({ enum: TypeTransaction })
  @IsOptional()
  @IsEnum(TypeTransaction)
  transaction?: TypeTransaction;

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

/** Recherche publique (REQ-RCH-01) — ne retourne que les annonces publiées. */
export class RechercherAnnoncesDto {
  @ApiPropertyOptional({ example: 'Cocody' })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  commune?: string;

  @ApiPropertyOptional({ example: 'Angré' })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  quartier?: string;

  @ApiPropertyOptional({ enum: TypeBien })
  @IsOptional()
  @IsEnum(TypeBien)
  typeBien?: TypeBien;

  @ApiPropertyOptional({ enum: TypeTransaction, default: TypeTransaction.location })
  @IsOptional()
  @IsEnum(TypeTransaction)
  transaction?: TypeTransaction;

  @ApiPropertyOptional({ example: '50000', description: 'Budget minimum en FCFA' })
  @IsOptional()
  @Matches(MONTANT_FCFA)
  budgetMin?: string;

  @ApiPropertyOptional({ example: '200000', description: 'Budget maximum en FCFA' })
  @IsOptional()
  @Matches(MONTANT_FCFA)
  budgetMax?: string;

  @ApiPropertyOptional({ example: 2, description: 'Nombre minimum de chambres' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(50)
  chambresMin?: number;

  @ApiPropertyOptional({
    enum: ['recent', 'prix_croissant', 'prix_decroissant'],
    default: 'recent',
    description: 'Ordre de tri (REQ-RCH-03)',
  })
  @IsOptional()
  @IsEnum(['recent', 'prix_croissant', 'prix_decroissant'])
  tri?: 'recent' | 'prix_croissant' | 'prix_decroissant' = 'recent';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limite?: number = 20;
}
