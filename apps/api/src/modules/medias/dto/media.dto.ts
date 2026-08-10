/**
 * DTO du module Médias.
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 09 août 2026
 */
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { TypePieceKyc } from '@prisma/client';

export class TypeDocumentDto {
  @ApiProperty({ enum: TypePieceKyc, example: TypePieceKyc.titre_propriete })
  @IsEnum(TypePieceKyc, { message: 'Type de pièce invalide' })
  typePiece!: TypePieceKyc;
}
