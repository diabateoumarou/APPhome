import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { StatutUtilisateur } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface UtilisateurConnecte {
  id: string;
  telephone: string;
  roles: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') as string,
    });
  }

  async validate(charge: { sub: string; telephone: string; roles: string[] }): Promise<UtilisateurConnecte> {
    // Vérification à chaque requête : un compte suspendu perd l'accès immédiatement.
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { id: charge.sub },
      select: { id: true, telephone: true, statut: true },
    });

    if (!utilisateur || utilisateur.statut !== StatutUtilisateur.actif) {
      throw new UnauthorizedException('Session invalide.');
    }

    return { id: utilisateur.id, telephone: utilisateur.telephone, roles: charge.roles };
  }
}
