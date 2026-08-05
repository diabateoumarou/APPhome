/**
 * Endpoints d'authentification.
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 05 août 2026
 */
import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { InscriptionDto, ConnexionDto, VerificationOtpDto } from './dto/auth.dto';

@ApiTags('Authentification')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('inscription')
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } }) // 5 inscriptions / heure / IP
  @ApiOperation({ summary: 'Créer un compte et recevoir un code de vérification par SMS' })
  @ApiResponse({ status: 201, description: 'Compte créé, code envoyé' })
  @ApiResponse({ status: 409, description: 'Numéro déjà utilisé' })
  inscription(@Body() dto: InscriptionDto) {
    return this.auth.inscrire(dto);
  }

  @Public()
  @Post('otp/verification')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Vérifier le code SMS et obtenir les jetons' })
  verifierOtp(@Body() dto: VerificationOtpDto) {
    return this.auth.verifierOtp(dto.telephone, dto.code);
  }

  @Public()
  @Post('connexion')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 900_000 } }) // 10 tentatives / 15 min
  @ApiOperation({ summary: 'Se connecter avec téléphone et mot de passe' })
  connexion(@Body() dto: ConnexionDto) {
    return this.auth.connecter(dto);
  }
}
