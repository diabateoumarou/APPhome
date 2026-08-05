/**
 * Service d'authentification — inscription, OTP SMS, connexion, jetons.
 * Règles appliquées :
 *  - RG-001 : compte unique multi-rôles, identifié par le téléphone (E.164).
 *  - Mot de passe haché en Argon2id ; codes OTP stockés hachés, jamais en clair.
 *  - Réponses volontairement non discriminantes (pas d'énumération de comptes).
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 * Date   : 05 août 2026
 */
import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RoleUtilisateur, StatutUtilisateur } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomInt, randomUUID, createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SmsService } from '../notifications/sms.service';
import { InscriptionDto, ConnexionDto } from './dto/auth.dto';

/** Durée de validité d'un code OTP. */
const OTP_VALIDITE_MS = 5 * 60 * 1000;
/** Nombre maximum de tentatives avant invalidation du code. */
const OTP_TENTATIVES_MAX = 5;

export interface Jetons {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly sms: SmsService,
  ) {}

  /** Inscription : crée le compte (rôle locataire par défaut) et envoie l'OTP. */
  async inscrire(dto: InscriptionDto): Promise<{ message: string }> {
    const existant = await this.prisma.utilisateur.findUnique({
      where: { telephone: dto.telephone },
    });
    if (existant) {
      throw new ConflictException('Ce numéro est déjà associé à un compte.');
    }

    const utilisateur = await this.prisma.utilisateur.create({
      data: {
        telephone: dto.telephone,
        email: dto.email,
        nomComplet: dto.nomComplet,
        motDePasseHash: await argon2.hash(dto.motDePasse, { type: argon2.argon2id }),
        roles: { create: { role: RoleUtilisateur.locataire } },
      },
    });

    await this.envoyerOtp(utilisateur.id, dto.telephone, 'verification_tel');
    return { message: 'Compte créé. Un code de vérification vous a été envoyé par SMS.' };
  }

  /** Génère un OTP à 6 chiffres, le stocke haché et le transmet par SMS. */
  async envoyerOtp(utilisateurId: string, telephone: string, usage: string, contexteId?: string): Promise<void> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');

    await this.prisma.otpCode.create({
      data: {
        utilisateurId,
        codeHash: createHash('sha256').update(code).digest('hex'),
        usage,
        contexteId,
        expireLe: new Date(Date.now() + OTP_VALIDITE_MS),
      },
    });

    await this.sms.envoyer(
      telephone,
      `Votre code de verification est ${code}. Il expire dans 5 minutes. Ne le communiquez a personne.`,
    );
  }

  /** Vérifie un code OTP : usage unique, expiration et plafond de tentatives. */
  async verifierOtp(telephone: string, code: string): Promise<Jetons> {
    const utilisateur = await this.prisma.utilisateur.findUnique({ where: { telephone } });
    if (!utilisateur) {
      throw new BadRequestException('Code invalide ou expiré.');
    }

    const otp = await this.prisma.otpCode.findFirst({
      where: {
        utilisateurId: utilisateur.id,
        usage: 'verification_tel',
        consommeLe: null,
        expireLe: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp || otp.tentatives >= OTP_TENTATIVES_MAX) {
      throw new BadRequestException('Code invalide ou expiré.');
    }

    const attendu = createHash('sha256').update(code).digest('hex');
    if (otp.codeHash !== attendu) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { tentatives: { increment: 1 } },
      });
      throw new BadRequestException('Code invalide ou expiré.');
    }

    await this.prisma.$transaction([
      this.prisma.otpCode.update({ where: { id: otp.id }, data: { consommeLe: new Date() } }),
      this.prisma.utilisateur.update({
        where: { id: utilisateur.id },
        data: { telephoneVerifieLe: new Date() },
      }),
    ]);

    return this.genererJetons(utilisateur.id, telephone);
  }

  /** Connexion par téléphone + mot de passe. */
  async connecter(dto: ConnexionDto): Promise<Jetons> {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { telephone: dto.telephone },
    });

    // Message identique dans tous les cas : pas d'énumération de comptes.
    const echec = new UnauthorizedException('Numéro ou mot de passe incorrect.');
    if (!utilisateur || utilisateur.statut !== StatutUtilisateur.actif) {
      throw echec;
    }
    if (!(await argon2.verify(utilisateur.motDePasseHash, dto.motDePasse))) {
      throw echec;
    }
    if (!utilisateur.telephoneVerifieLe) {
      throw new UnauthorizedException('Numéro non vérifié. Demandez un nouveau code par SMS.');
    }

    return this.genererJetons(utilisateur.id, utilisateur.telephone);
  }

  /** Jeton d'accès court (15 min) + jeton de rafraîchissement rotatif (30 j). */
  private async genererJetons(utilisateurId: string, telephone: string): Promise<Jetons> {
    const roles = await this.prisma.utilisateurRole.findMany({
      where: { utilisateurId },
      select: { role: true, agenceId: true },
    });

    const charge = { sub: utilisateurId, telephone, roles: roles.map((r) => r.role) };

    const accessToken = await this.jwt.signAsync(charge, {
      secret: this.config.get<string>('JWT_SECRET'),
      expiresIn: '15m',
    });

    const refreshToken = await this.jwt.signAsync(
      { sub: utilisateurId, jti: randomUUID() },
      { secret: this.config.get<string>('JWT_REFRESH_SECRET'), expiresIn: '30d' },
    );

    return { accessToken, refreshToken };
  }
}
