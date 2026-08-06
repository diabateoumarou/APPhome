/**
 * Tests unitaires du service d'authentification.
 * Vérifient les garanties de sécurité, pas seulement le chemin nominal :
 * hachage des OTP, usage unique, expiration, plafond de tentatives,
 * non-énumération des comptes.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1,
 *          DATACONNECT AFRICA · 06 août 2026
 */
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import * as argon2 from 'argon2';
import { AuthService } from '../../apps/api/src/modules/auth/auth.service';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { SmsService } from '../../apps/api/src/modules/notifications/sms.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: Record<string, any>;
  let sms: { envoyer: jest.Mock };

  const TEL = '+2259900000001';

  beforeEach(async () => {
    prisma = {
      utilisateur: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      otpCode: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      utilisateurRole: { findMany: jest.fn().mockResolvedValue([{ role: 'locataire', agenceId: null }]) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    sms = { envoyer: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: SmsService, useValue: sms },
        { provide: JwtService, useValue: { signAsync: jest.fn().mockResolvedValue('jeton-test') } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('secret-test') } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('inscription', () => {
    const dto = { telephone: TEL, nomComplet: 'Awa Traoré', motDePasse: 'MotDePasse!2026' };

    it("refuse un numéro déjà enregistré", async () => {
      prisma.utilisateur.findUnique.mockResolvedValue({ id: 'u1' });
      await expect(service.inscrire(dto)).rejects.toThrow(ConflictException);
      expect(prisma.utilisateur.create).not.toHaveBeenCalled();
    });

    it('hache le mot de passe en Argon2id et ne le stocke jamais en clair', async () => {
      prisma.utilisateur.findUnique.mockResolvedValue(null);
      prisma.utilisateur.create.mockResolvedValue({ id: 'u1', telephone: TEL });

      await service.inscrire(dto);

      const hash = prisma.utilisateur.create.mock.calls[0][0].data.motDePasseHash;
      expect(hash).toMatch(/^\$argon2id\$/);
      expect(hash).not.toContain(dto.motDePasse);
      await expect(argon2.verify(hash, dto.motDePasse)).resolves.toBe(true);
    });

    it("attribue le rôle locataire et déclenche l'envoi du code", async () => {
      prisma.utilisateur.findUnique.mockResolvedValue(null);
      prisma.utilisateur.create.mockResolvedValue({ id: 'u1', telephone: TEL });

      await service.inscrire(dto);

      expect(prisma.utilisateur.create.mock.calls[0][0].data.roles.create.role).toBe('locataire');
      expect(sms.envoyer).toHaveBeenCalledWith(TEL, expect.stringContaining('code'));
    });
  });

  describe('envoi du code OTP', () => {
    it("stocke le code haché, jamais en clair, avec une expiration", async () => {
      prisma.otpCode.create.mockResolvedValue({});
      await service.envoyerOtp('u1', TEL, 'verification_tel');

      const donnees = prisma.otpCode.create.mock.calls[0][0].data;
      const message: string = sms.envoyer.mock.calls[0][1];
      const code = message.match(/\b(\d{6})\b/)![1];

      expect(donnees.codeHash).toBe(createHash('sha256').update(code).digest('hex'));
      expect(donnees.codeHash).not.toContain(code);
      expect(donnees.expireLe.getTime()).toBeGreaterThan(Date.now());
    });

    it('génère un code à 6 chiffres', async () => {
      prisma.otpCode.create.mockResolvedValue({});
      await service.envoyerOtp('u1', TEL, 'verification_tel');
      expect(sms.envoyer.mock.calls[0][1]).toMatch(/\b\d{6}\b/);
    });
  });

  describe('vérification du code OTP', () => {
    const CODE = '482913';
    const hash = createHash('sha256').update(CODE).digest('hex');

    it('accepte un code valide et marque le numéro comme vérifié', async () => {
      prisma.utilisateur.findUnique.mockResolvedValue({ id: 'u1', telephone: TEL });
      prisma.otpCode.findFirst.mockResolvedValue({ id: 'o1', codeHash: hash, tentatives: 0 });

      const jetons = await service.verifierOtp(TEL, CODE);

      expect(jetons.accessToken).toBeDefined();
      expect(jetons.refreshToken).toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('incrémente les tentatives sur code erroné', async () => {
      prisma.utilisateur.findUnique.mockResolvedValue({ id: 'u1', telephone: TEL });
      prisma.otpCode.findFirst.mockResolvedValue({ id: 'o1', codeHash: hash, tentatives: 0 });

      await expect(service.verifierOtp(TEL, '000000')).rejects.toThrow(BadRequestException);
      expect(prisma.otpCode.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { tentatives: { increment: 1 } } }),
      );
    });

    it('refuse au-delà du plafond de tentatives (anti-force brute)', async () => {
      prisma.utilisateur.findUnique.mockResolvedValue({ id: 'u1', telephone: TEL });
      prisma.otpCode.findFirst.mockResolvedValue({ id: 'o1', codeHash: hash, tentatives: 5 });

      await expect(service.verifierOtp(TEL, CODE)).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("refuse quand aucun code valide n'existe (expiré ou déjà consommé)", async () => {
      prisma.utilisateur.findUnique.mockResolvedValue({ id: 'u1', telephone: TEL });
      prisma.otpCode.findFirst.mockResolvedValue(null);

      await expect(service.verifierOtp(TEL, CODE)).rejects.toThrow(BadRequestException);
    });

    it("ne révèle pas si le numéro existe (pas d'énumération)", async () => {
      prisma.utilisateur.findUnique.mockResolvedValue(null);
      await expect(service.verifierOtp(TEL, CODE)).rejects.toThrow('Code invalide ou expiré.');
    });
  });

  describe('connexion', () => {
    let hashMdp: string;
    const MDP = 'MotDePasse!2026';

    beforeAll(async () => {
      hashMdp = await argon2.hash(MDP, { type: argon2.argon2id });
    });

    it('accepte des identifiants valides sur un compte vérifié', async () => {
      prisma.utilisateur.findUnique.mockResolvedValue({
        id: 'u1', telephone: TEL, motDePasseHash: hashMdp,
        statut: 'actif', telephoneVerifieLe: new Date(),
      });

      const jetons = await service.connecter({ telephone: TEL, motDePasse: MDP });
      expect(jetons.accessToken).toBeDefined();
    });

    it('renvoie le même message pour compte inexistant et mot de passe erroné', async () => {
      prisma.utilisateur.findUnique.mockResolvedValue(null);
      const erreurInconnu = await service.connecter({ telephone: TEL, motDePasse: MDP }).catch((e: Error) => e);

      prisma.utilisateur.findUnique.mockResolvedValue({
        id: 'u1', telephone: TEL, motDePasseHash: hashMdp,
        statut: 'actif', telephoneVerifieLe: new Date(),
      });
      const erreurMdp = await service.connecter({ telephone: TEL, motDePasse: 'mauvais' }).catch((e: Error) => e);

      expect(erreurInconnu).toBeInstanceOf(UnauthorizedException);
      expect(erreurMdp).toBeInstanceOf(UnauthorizedException);
      expect((erreurInconnu as Error).message).toBe((erreurMdp as Error).message);
    });

    it('refuse un compte suspendu', async () => {
      prisma.utilisateur.findUnique.mockResolvedValue({
        id: 'u1', telephone: TEL, motDePasseHash: hashMdp,
        statut: 'suspendu', telephoneVerifieLe: new Date(),
      });
      await expect(service.connecter({ telephone: TEL, motDePasse: MDP })).rejects.toThrow(UnauthorizedException);
    });

    it('refuse un numéro non vérifié', async () => {
      prisma.utilisateur.findUnique.mockResolvedValue({
        id: 'u1', telephone: TEL, motDePasseHash: hashMdp,
        statut: 'actif', telephoneVerifieLe: null,
      });
      await expect(service.connecter({ telephone: TEL, motDePasse: MDP })).rejects.toThrow(/non vérifié/);
    });
  });
});
