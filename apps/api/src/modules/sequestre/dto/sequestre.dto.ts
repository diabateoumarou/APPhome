/**
 * DTO du module Séquestre.
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 13 août 2026
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, IsBoolean, Matches, Length } from 'class-validator';

const MONTANT_FCFA = /^\d{1,15}$/;

export class ProposerRetenueDto {
  @ApiProperty({ example: '40000', description: 'Montant retenu en FCFA' })
  @Matches(MONTANT_FCFA, { message: 'Le montant doit être un entier en FCFA' })
  montant!: string;

  @ApiProperty({
    example: 'Remplacement du chauffe-eau, facture jointe',
    description: 'Motif de la retenue, communiqué au locataire',
  })
  @IsString()
  @Length(10, 1000, { message: 'Le motif doit être explicite (10 caractères minimum)' })
  motif!: string;
}

export class ProposerRestitutionDto {
  @ApiPropertyOptional({
    example: '260000',
    description: 'Montant restitué — le solde du séquestre par défaut',
  })
  @IsOptional()
  @Matches(MONTANT_FCFA, { message: 'Le montant doit être un entier en FCFA' })
  montant?: string;
}

export class RefuserPropositionDto {
  @ApiPropertyOptional({ example: 'Retenue non justifiée par l’état des lieux' })
  @IsOptional()
  @IsString()
  @Length(3, 500)
  motif?: string;
}

export class GelSequestreDto {
  @ApiProperty({ example: true, description: 'true pour geler, false pour dégeler' })
  @IsBoolean()
  geler!: boolean;

  @ApiPropertyOptional({ format: 'uuid', description: 'Litige justifiant le gel' })
  @IsOptional()
  @IsUUID('4')
  litigeId?: string;
}

export class DecisionLitigeDto {
  @ApiProperty({ format: 'uuid', description: 'Litige tranché' })
  @IsUUID('4')
  litigeId!: string;

  @ApiProperty({ example: '40000', description: 'Montant retenu au bailleur, le reste est restitué' })
  @Matches(MONTANT_FCFA, { message: 'Le montant doit être un entier en FCFA' })
  montantRetenu!: string;
}
