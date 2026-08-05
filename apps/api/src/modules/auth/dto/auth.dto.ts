/**
 * DTO d'authentification — validation stricte des entrées.
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 05 août 2026
 */
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEmail, IsOptional, MinLength, Matches, Length } from 'class-validator';

/** Format E.164 — identifiant principal sur un marché mobile-first. */
const E164 = /^\+[1-9]\d{7,14}$/;

export class InscriptionDto {
  @ApiProperty({ example: '+2250700000001', description: 'Téléphone au format international' })
  @Matches(E164, { message: 'Le téléphone doit être au format international, ex. +2250700000001' })
  telephone!: string;

  @ApiProperty({ example: 'Awa Traoré' })
  @IsString()
  @Length(2, 160)
  nomComplet!: string;

  @ApiProperty({ example: 'MotDePasse!2026', minLength: 10 })
  @IsString()
  @MinLength(10, { message: 'Le mot de passe doit contenir au moins 10 caractères' })
  motDePasse!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail({}, { message: 'Adresse e-mail invalide' })
  email?: string;
}

export class DemandeOtpDto {
  @ApiProperty({ example: '+2250700000001' })
  @Matches(E164)
  telephone!: string;
}

export class VerificationOtpDto {
  @ApiProperty({ example: '+2250700000001' })
  @Matches(E164)
  telephone!: string;

  @ApiProperty({ example: '482913', description: 'Code à 6 chiffres reçu par SMS' })
  @Matches(/^\d{6}$/, { message: 'Le code doit contenir 6 chiffres' })
  code!: string;
}

export class ConnexionDto {
  @ApiProperty({ example: '+2250700000001' })
  @Matches(E164)
  telephone!: string;

  @ApiProperty()
  @IsString()
  motDePasse!: string;
}

export class RafraichirDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}
