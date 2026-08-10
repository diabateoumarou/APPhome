/**
 * DTO du module Visites.
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 *          Ingénieur Système & Infrastructure Cloud / System Architect
 *          Expert Solutions ICT (Cloud, Système, Cybersécurité)
 * Date   : 10 août 2026
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString, IsEnum, IsOptional, IsInt, IsUUID, IsDateString,
  Min, Max, Length, ArrayMinSize, ArrayMaxSize, ValidateNested,
} from 'class-validator';
import { StatutRdv } from '@prisma/client';

export class CreneauDto {
  @ApiProperty({ example: '2026-08-15T09:00:00.000Z', description: 'Début du créneau (ISO 8601)' })
  @IsDateString({}, { message: 'Date de début invalide' })
  debut!: string;

  @ApiProperty({ example: '2026-08-15T09:30:00.000Z', description: 'Fin du créneau (ISO 8601)' })
  @IsDateString({}, { message: 'Date de fin invalide' })
  fin!: string;

  @ApiPropertyOptional({
    example: 1,
    default: 1,
    description: 'Nombre de visiteurs acceptés (visite groupée si > 1)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  capacite?: number = 1;
}

export class CreerCreneauxDto {
  @ApiProperty({ type: [CreneauDto], description: 'Créneaux à ouvrir (traitement atomique)' })
  @ValidateNested({ each: true })
  @Type(() => CreneauDto)
  @ArrayMinSize(1, { message: 'Indiquez au moins un créneau' })
  @ArrayMaxSize(50, { message: 'Maximum 50 créneaux par envoi' })
  creneaux!: CreneauDto[];
}

export class ReserverVisiteDto {
  @ApiProperty({ format: 'uuid', description: 'Créneau choisi' })
  @IsUUID('4', { message: 'Identifiant de créneau invalide' })
  creneauId!: string;

  @ApiProperty({ format: 'uuid', description: 'Annonce concernée' })
  @IsUUID('4', { message: "Identifiant d'annonce invalide" })
  annonceId!: string;
}

export class AnnulerVisiteDto {
  @ApiPropertyOptional({ example: 'Empêchement de dernière minute' })
  @IsOptional()
  @IsString()
  @Length(3, 500)
  motif?: string;
}

export class CompteRenduDto {
  @ApiProperty({
    enum: [StatutRdv.effectue, StatutRdv.no_show],
    description: 'Issue de la visite',
  })
  @IsEnum([StatutRdv.effectue, StatutRdv.no_show], {
    message: 'Issue invalide : « effectue » ou « no_show » attendu',
  })
  issue!: typeof StatutRdv.effectue | typeof StatutRdv.no_show;

  @ApiPropertyOptional({ example: 'Visiteur intéressé, souhaite déposer un dossier.' })
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  compteRendu?: string;
}

export class ListerCreneauxDto {
  @ApiPropertyOptional({ example: '2026-08-15', description: 'Date de début de recherche' })
  @IsOptional()
  @IsDateString()
  depuis?: string;

  @ApiPropertyOptional({ example: '2026-08-31' })
  @IsOptional()
  @IsDateString()
  jusqua?: string;
}

export class ListerVisitesDto {
  @ApiPropertyOptional({ enum: StatutRdv })
  @IsOptional()
  @IsEnum(StatutRdv)
  statut?: StatutRdv;

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
