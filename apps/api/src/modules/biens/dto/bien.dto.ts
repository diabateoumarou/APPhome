/**
 * DTO du module Biens — validation stricte des entrées.
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 *          Ingénieur Système & Infrastructure Cloud / System Architect
 *          Expert Solutions ICT (Cloud, Système, Cybersécurité)
 * Date   : 09 août 2026
 */
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString, IsEnum, IsOptional, IsInt, IsBoolean, IsNumber, IsArray,
  Min, Max, Length, IsObject,
} from 'class-validator';
import { TypeBien, StatutBien, TypePieceKyc } from '@prisma/client';

export class CreerBienDto {
  @ApiProperty({ enum: TypeBien, example: TypeBien.appartement })
  @IsEnum(TypeBien, { message: 'Type de bien invalide' })
  typeBien!: TypeBien;

  @ApiProperty({ example: 'Rue des Jardins, Cocody Angré 8e tranche' })
  @IsString()
  @Length(5, 500)
  adresse!: string;

  @ApiProperty({ example: 'Cocody' })
  @IsString()
  @Length(2, 80)
  commune!: string;

  @ApiPropertyOptional({ example: 'Angré 8e tranche' })
  @IsOptional()
  @IsString()
  @Length(2, 80)
  quartier?: string;

  @ApiPropertyOptional({ example: 5.3897, description: 'Latitude (-90 à 90)' })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ example: -3.9838, description: 'Longitude (-180 à 180)' })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({ example: 78.5, description: 'Superficie en m²' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000000)
  superficieM2?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  nbPieces?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  nbChambres?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  nbSallesEau?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  meuble?: boolean;

  @ApiPropertyOptional({ example: 'Cour, garage, dépendance 1 pièce' })
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  dependances?: string;

  @ApiPropertyOptional({
    description: 'Attributs libres (étage, orientation…), extensibles sans migration',
    example: { etage: 2, orientation: 'sud' },
  })
  @IsOptional()
  @IsObject()
  attributs?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [String], description: 'Codes des équipements (ex. climatisation)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  equipements?: string[];
}

export class ModifierBienDto extends PartialType(CreerBienDto) {}

export class ChangerStatutBienDto {
  @ApiProperty({ enum: StatutBien })
  @IsEnum(StatutBien)
  statut!: StatutBien;
}

export class ListerBiensDto {
  @ApiPropertyOptional({ example: 'Cocody' })
  @IsOptional()
  @IsString()
  commune?: string;

  @ApiPropertyOptional({ enum: TypeBien })
  @IsOptional()
  @IsEnum(TypeBien)
  typeBien?: TypeBien;

  @ApiPropertyOptional({ enum: StatutBien })
  @IsOptional()
  @IsEnum(StatutBien)
  statut?: StatutBien;

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

export class AjouterDocumentBienDto {
  @ApiProperty({ enum: TypePieceKyc, example: TypePieceKyc.titre_propriete })
  @IsEnum(TypePieceKyc)
  typePiece!: TypePieceKyc;

  @ApiProperty({ example: 'documents/titre-abc.pdf' })
  @IsString()
  @Length(3, 500)
  fichierUrl!: string;
}
