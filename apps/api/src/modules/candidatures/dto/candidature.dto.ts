/**
 * DTO du module Candidatures.
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 *          Ingénieur Système & Infrastructure Cloud / System Architect
 *          Expert Solutions ICT (Cloud, Système, Cybersécurité)
 * Date   : 10 août 2026
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString, IsEnum, IsOptional, IsInt, IsUUID, IsBoolean,
  Min, Max, Length,
} from 'class-validator';
import { TypePieceDossier, StatutCandidature } from '@prisma/client';

export class TypePieceDossierDto {
  @ApiProperty({ enum: TypePieceDossier, example: TypePieceDossier.revenus })
  @IsEnum(TypePieceDossier, { message: 'Type de pièce invalide' })
  typePiece!: TypePieceDossier;
}

export class SoumettreCandidatureDto {
  @ApiProperty({ format: 'uuid', description: 'Annonce visée' })
  @IsUUID('4', { message: "Identifiant d'annonce invalide" })
  annonceId!: string;

  @ApiProperty({
    example: true,
    description:
      "Consentement explicite au partage des pièces avec le bailleur (loi n°2013-450). " +
      "Sans lui, la candidature est transmise sans les justificatifs.",
  })
  @IsBoolean()
  consentementPartagePieces!: boolean;
}

export class DecisionCandidatureDto {
  @ApiProperty({
    enum: [StatutCandidature.acceptee, StatutCandidature.refusee, StatutCandidature.liste_attente],
    description: 'Décision du bailleur',
  })
  @IsEnum([
    StatutCandidature.acceptee,
    StatutCandidature.refusee,
    StatutCandidature.liste_attente,
  ], { message: 'Décision invalide : acceptee, refusee ou liste_attente attendu' })
  decision!: StatutCandidature;

  @ApiPropertyOptional({
    example: 'revenus_insuffisants',
    description:
      "Code du motif de refus — obligatoire si refusée. La liste est fermée : " +
      "elle prévient les motifs discriminatoires.",
  })
  @IsOptional()
  @IsString()
  @Length(3, 40)
  motifRefusCode?: string;
}

export class ListerCandidaturesDto {
  @ApiPropertyOptional({ enum: StatutCandidature })
  @IsOptional()
  @IsEnum(StatutCandidature)
  statut?: StatutCandidature;

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
