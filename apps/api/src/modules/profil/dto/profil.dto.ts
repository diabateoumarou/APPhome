/**
 * DTO du profil utilisateur.
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 11 août 2026
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail, Length } from 'class-validator';

export class ModifierProfilDto {
  @ApiPropertyOptional({ example: 'Awa Traoré' })
  @IsOptional()
  @IsString()
  @Length(2, 160)
  nomComplet?: string;

  @ApiPropertyOptional({ example: 'awa.traore@exemple.ci' })
  @IsOptional()
  @IsEmail({}, { message: 'Adresse e-mail invalide' })
  email?: string;

  @ApiPropertyOptional({
    example: 'Rue L142, Cocody Angré 8e tranche',
    description: "Domicile déclaré — sert d'élection de domicile au contrat (art. 16)",
  })
  @IsOptional()
  @IsString()
  @Length(5, 500)
  adresse?: string;

  @ApiPropertyOptional({ example: 'Cocody' })
  @IsOptional()
  @IsString()
  @Length(2, 80)
  commune?: string;
}
