/**
 * Tests unitaires du service Contrats.
 *
 * Priorité aux garanties juridiques : ordre de signature imposé, empreinte
 * enregistrée au moment exact de la signature, activation transactionnelle.
 * Une régression sur ces points rendrait des baux contestables.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 * Date   : 10 août 2026
 */
import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  StatutContrat,
  StatutCandidature,
  RoleSignataire,
  TypeEcheance,
} from '@prisma/client';
import { createHash } from 'crypto';
import { ContratsService } from '../../apps/api/src/modules/contrats/contrats.service';
import { GabaritService } from '../../apps/api/src/modules/contrats/gabarit.service';
import { PdfService } from '../../apps/api/src/modules/contrats/pdf.service';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { AuditService } from '../../apps/api/src/common/audit/audit.service';
import { SmsService } from '../../apps/api/src/modules/notifications/sms.service';
import { StockageService } from '../../apps/api/src/modules/medias/stockage.service';
import { AuthService } from '../../apps/api/src/modules/auth/auth.service';
import type { UtilisateurConnecte } from '../../apps/api/src/modules/auth/jwt.strategy';

describe('ContratsService', () => {
  let service: ContratsService;
  let prisma: Record<string, any>;
  let audit: { enregistrer: jest.Mock };
  let sms: { envoyer: jest.Mock };
  let auth: { envoyerOtp: jest.Mock };
  let pdf: Record<string, jest.Mock>;

  const BAILLEUR: UtilisateurConnecte = { id: 'u-bail', telephone: '+2259900000001', roles: ['proprietaire'] };
  const LOCATAIRE: UtilisateurConnecte = { id: 'u-loc', telephone: '+2259900000055', roles: ['locataire'] };
  const TIERS: UtilisateurConnecte = { id: 'u-tiers', telephone: '+2259900000099', roles: ['locataire'] };

  const EMPREINTE = 'a'.repeat(64);
  const CODE = '482913';
  const CODE_HASH = createHash('sha256').update(CODE).digest('hex');
  const CONTEXTE = { ip: '127.0.0.1', userAgent: 'test' };

  /** Plafonds ivoiriens (loi n°2019-576). */
  const plafonds = {
    cautionMaxMois: 2,
    avanceMaxMois: 2,
    totalEntreeMaxMois: 4,
    preavisLocataireDefautJours: 30,
    preavisBailleurDefautJours: 90,
    delaiRestitutionCautionJours: 30,
  };

  const candidatureAcceptee = {
    id: 'c1',
    statut: StatutCandidature.acceptee,
    dossier: { locataireId: LOCATAIRE.id, locataire: { nomComplet: 'Kone', telephone: LOCATAIRE.telephone } },
    annonce: {
      id: 'a1',
      loyerMontant: 150000n,
      chargesMontant: 10000n,
      cautionNbMois: 2,
      avanceNbMois: 2,
      fraisAgenceMontant: 150000n,
      bien: {
        id: 'b1',
        agenceId: 'ag-001',
        proprietaireId: BAILLEUR.id,
        agence: { parametreLegal: plafonds },
        proprietaire: { nomComplet: 'Awa' },
      },
    },
  };

  const dtoGeneration = {
    candidatureId: 'c1',
    dureeMois: 12,
    datePriseEffet: '2026-09-01',
    jourEcheance: 5,
  };

  /** Contrat complet, tel que renvoyé lors du rendu du document. */
  const contratComplet = {
    id: 'ct1',
    reference: 'CTR-2026-000001',
    agenceId: 'ag-001',
    bienId: 'b1',
    bailleurId: BAILLEUR.id,
    locataireId: LOCATAIRE.id,
    statut: StatutContrat.genere,
    loyerMontant: 150000n,
    chargesMontant: 10000n,
    cautionMontant: 300000n,
    cautionNbMois: 2,
    avanceMontant: 300000n,
    avanceNbMois: 2,
    fraisAgenceMontant: 150000n,
    dureeMois: 12,
    jourEcheance: 5,
    datePriseEffet: new Date('2026-09-01'),
    preavisLocataireJours: 30,
    preavisBailleurJours: 90,
    delaiRestitutionCautionJours: 30,
    joursTolerance: 5,
    penaliteRetardMontant: 0n,
    documentEmpreinteSha256: EMPREINTE,
    documentUrl: 'contrats/ag-001/ct1.pdf',
    createdAt: new Date('2026-08-10'),
    modele: { contenuTemplate: 'Bail figé sans variable.', version: 1 },
    bailleur: { nomComplet: 'Awa', telephone: BAILLEUR.telephone, email: null },
    locataire: { nomComplet: 'Kone', telephone: LOCATAIRE.telephone, email: null },
    bien: {
      adresse: 'Rue des Jardins', commune: 'Cocody', quartier: 'Angré',
      typeBien: 'appartement', nbPieces: 3, dependances: null, meuble: false,
    },
    signatures: [],
  };

  beforeEach(async () => {
    prisma = {
      candidature: { findUnique: jest.fn().mockResolvedValue(candidatureAcceptee) },
      contrat: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue(contratComplet),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(contratComplet),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue(contratComplet),
      },
      modeleContrat: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'm1', version: 1, contenuTemplate: 'Bail figé sans variable.',
        }),
      },
      kycVerification: { findFirst: jest.fn().mockResolvedValue({ typePiece: 'cni' }) },
      otpCode: {
        findFirst: jest.fn().mockResolvedValue({ id: 'o1', codeHash: CODE_HASH, tentatives: 0 }),
        update: jest.fn().mockResolvedValue({}),
      },
      signature: { create: jest.fn().mockResolvedValue({}) },
      echeance: { createMany: jest.fn().mockResolvedValue({ count: 15 }) },
      compteSequestre: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    audit = { enregistrer: jest.fn().mockResolvedValue(undefined) };
    sms = { envoyer: jest.fn().mockResolvedValue(undefined) };
    auth = { envoyerOtp: jest.fn().mockResolvedValue(undefined) };
    pdf = {
      depuisHtml: jest.fn().mockResolvedValue(Buffer.from('PDF')),
      empreinte: jest.fn().mockReturnValue(EMPREINTE),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContratsService,
        GabaritService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: SmsService, useValue: sms },
        { provide: AuthService, useValue: auth },
        { provide: PdfService, useValue: pdf },
        {
          provide: StockageService,
          useValue: {
            construireCle: jest.fn().mockReturnValue('contrats/ag-001/ct1.pdf'),
            televerser: jest.fn().mockResolvedValue('cle'),
            urlPresignee: jest.fn().mockResolvedValue('https://stockage/presigne'),
          },
        },
      ],
    }).compile();

    service = module.get<ContratsService>(ContratsService);
  });

  describe('génération', () => {
    it('refuse une candidature non acceptée', async () => {
      prisma.candidature.findUnique.mockResolvedValue({
        ...candidatureAcceptee,
        statut: StatutCandidature.soumise,
      });
      await expect(service.generer(dtoGeneration, BAILLEUR)).rejects.toThrow(
        /candidature acceptée/,
      );
    });

    it('refuse un second contrat sur la même candidature', async () => {
      prisma.contrat.findFirst.mockResolvedValue({ reference: 'CTR-2026-000001' });
      await expect(service.generer(dtoGeneration, BAILLEUR)).rejects.toThrow(/existe déjà/);
    });

    it('calcule les montants pour respecter la contrainte de cohérence SQL', async () => {
      await service.generer(dtoGeneration, BAILLEUR);
      const data = prisma.contrat.create.mock.calls[0][0].data;

      // caution = loyer × nb_mois, exigé par contrat_montants_coherents.
      expect(data.cautionMontant).toBe(300000n);
      expect(data.avanceMontant).toBe(300000n);
    });

    it('revalide les plafonds légaux au moment de la génération', async () => {
      prisma.candidature.findUnique.mockResolvedValue({
        ...candidatureAcceptee,
        annonce: { ...candidatureAcceptee.annonce, cautionNbMois: 3 },
      });
      await expect(service.generer(dtoGeneration, BAILLEUR)).rejects.toThrow(/plafond légal/);
    });

    it('applique les préavis par défaut du pays si non précisés', async () => {
      await service.generer(dtoGeneration, BAILLEUR);
      const data = prisma.contrat.create.mock.calls[0][0].data;

      expect(data.preavisLocataireJours).toBe(30);
      expect(data.preavisBailleurJours).toBe(90);
    });

    it('privilégie un modèle propre à l’agence sur le modèle plateforme', async () => {
      await service.generer(dtoGeneration, BAILLEUR);
      const ordre = prisma.modeleContrat.findFirst.mock.calls[0][0].orderBy;
      expect(ordre).toEqual([{ agenceId: 'desc' }, { version: 'desc' }]);
    });

    it('génère une référence lisible et séquentielle', async () => {
      prisma.contrat.count.mockResolvedValue(41);
      await service.generer(dtoGeneration, BAILLEUR);
      const data = prisma.contrat.create.mock.calls[0][0].data;
      expect(data.reference).toMatch(/^CTR-\d{4}-000042$/);
    });

    it('masque la candidature à un bailleur tiers', async () => {
      await expect(service.generer(dtoGeneration, TIERS)).rejects.toThrow(NotFoundException);
    });

    it("refuse une annonce sans loyer exploitable", async () => {
      prisma.candidature.findUnique.mockResolvedValue({
        ...candidatureAcceptee,
        annonce: { ...candidatureAcceptee.annonce, loyerMontant: null },
      });
      await expect(service.generer(dtoGeneration, BAILLEUR)).rejects.toThrow(BadRequestException);
    });
  });

  describe('ordre de signature', () => {
    it('refuse au locataire de signer avant le bailleur', async () => {
      await expect(service.demanderCodeSignature('ct1', LOCATAIRE)).rejects.toThrow(
        /bailleur doit signer avant vous/,
      );
      expect(auth.envoyerOtp).not.toHaveBeenCalled();
    });

    it('autorise le bailleur à demander son code en premier', async () => {
      await expect(service.demanderCodeSignature('ct1', BAILLEUR)).resolves.toBeDefined();
      expect(auth.envoyerOtp).toHaveBeenCalledWith(
        BAILLEUR.id, BAILLEUR.telephone, 'signature', 'ct1',
      );
    });

    it('autorise le locataire une fois le bailleur signataire', async () => {
      prisma.contrat.findUnique.mockResolvedValue({
        ...contratComplet,
        statut: StatutContrat.en_signature,
        signatures: [{ roleSignataire: RoleSignataire.bailleur }],
      });
      await expect(service.demanderCodeSignature('ct1', LOCATAIRE)).resolves.toBeDefined();
    });

    it('refuse une seconde signature du même rôle', async () => {
      prisma.contrat.findUnique.mockResolvedValue({
        ...contratComplet,
        signatures: [{ roleSignataire: RoleSignataire.bailleur }],
      });
      await expect(service.demanderCodeSignature('ct1', BAILLEUR)).rejects.toThrow(/déjà signé/);
    });

    it("écarte un utilisateur qui n'est pas partie au contrat", async () => {
      await expect(service.demanderCodeSignature('ct1', TIERS)).rejects.toThrow(ForbiddenException);
    });

    it("refuse la signature d'un contrat déjà actif", async () => {
      prisma.contrat.findUnique.mockResolvedValue({
        ...contratComplet,
        statut: StatutContrat.actif,
      });
      await expect(service.demanderCodeSignature('ct1', BAILLEUR)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('signature', () => {
    it('refuse un code erroné et incrémente les tentatives', async () => {
      await expect(service.signer('ct1', '000000', BAILLEUR, CONTEXTE)).rejects.toThrow(
        /Code invalide/,
      );
      expect(prisma.otpCode.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { tentatives: { increment: 1 } } }),
      );
    });

    it('refuse au-delà du plafond de tentatives', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({ id: 'o1', codeHash: CODE_HASH, tentatives: 5 });
      await expect(service.signer('ct1', CODE, BAILLEUR, CONTEXTE)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("refuse si aucun code valide n'est en cours", async () => {
      prisma.otpCode.findFirst.mockResolvedValue(null);
      await expect(service.signer('ct1', CODE, BAILLEUR, CONTEXTE)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("enregistre l'empreinte du document au moment de la signature", async () => {
      await service.signer('ct1', CODE, BAILLEUR, CONTEXTE);

      const operations = prisma.$transaction.mock.calls[0][0];
      expect(operations).toHaveLength(3);
      const donneesSignature = prisma.signature.create.mock.calls[0][0].data;
      expect(donneesSignature.empreinteDocument).toBe(EMPREINTE);
      expect(donneesSignature.roleSignataire).toBe(RoleSignataire.bailleur);
    });

    it('conserve IP et user-agent au procès-verbal', async () => {
      await service.signer('ct1', CODE, BAILLEUR, CONTEXTE);
      const donnees = prisma.signature.create.mock.calls[0][0].data;

      expect(donnees.adresseIp).toBe('127.0.0.1');
      expect(donnees.userAgent).toBe('test');
    });

    it('consomme le code : il ne peut pas être rejoué', async () => {
      await service.signer('ct1', CODE, BAILLEUR, CONTEXTE);
      expect(prisma.otpCode.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'o1' }, data: { consommeLe: expect.any(Date) } }),
      );
    });

    it('notifie le locataire après la signature du bailleur', async () => {
      const resultat = await service.signer('ct1', CODE, BAILLEUR, CONTEXTE);

      expect(resultat.complet).toBe(false);
      expect(sms.envoyer).toHaveBeenCalledWith(
        LOCATAIRE.telephone,
        expect.stringContaining('signe'),
      );
    });

    it("refuse de signer si le document n'a pas été généré", async () => {
      prisma.contrat.findUnique.mockResolvedValue({
        ...contratComplet,
        documentEmpreinteSha256: null,
      });
      await expect(service.signer('ct1', CODE, BAILLEUR, CONTEXTE)).rejects.toThrow(
        /pas encore été généré/,
      );
    });
  });

  describe('activation après la seconde signature', () => {
    beforeEach(() => {
      // Une signature déjà présente : celle du locataire complète le contrat.
      prisma.contrat.findUnique.mockResolvedValue({
        ...contratComplet,
        statut: StatutContrat.en_signature,
        signatures: [{ roleSignataire: RoleSignataire.bailleur }],
      });
    });

    it('signale le contrat comme complet', async () => {
      const resultat = await service.signer('ct1', CODE, LOCATAIRE, CONTEXTE);
      expect(resultat.complet).toBe(true);
    });

    it("crée l'échéancier complet sur la durée du bail", async () => {
      await service.signer('ct1', CODE, LOCATAIRE, CONTEXTE);

      const echeances = prisma.echeance.createMany.mock.calls[0][0].data;
      const loyers = echeances.filter((e: { type: string }) => e.type === TypeEcheance.loyer);

      // caution + avance + frais + 12 loyers
      expect(echeances).toHaveLength(15);
      expect(loyers).toHaveLength(12);
    });

    it("impute l'avance sur les premières échéances (art. 5 du bail)", async () => {
      await service.signer('ct1', CODE, LOCATAIRE, CONTEXTE);

      const echeances = prisma.echeance.createMany.mock.calls[0][0].data;
      const loyers = echeances.filter((e: { type: string }) => e.type === TypeEcheance.loyer);

      // 2 mois d'avance couvrent les 2 premières échéances.
      expect(loyers[0].montantPaye).toBe(150000n);
      expect(loyers[1].montantPaye).toBe(150000n);
      expect(loyers[2].montantPaye).toBe(0n);
    });

    it('inclut les charges dans le montant dû du loyer', async () => {
      await service.signer('ct1', CODE, LOCATAIRE, CONTEXTE);

      const echeances = prisma.echeance.createMany.mock.calls[0][0].data;
      const loyer = echeances.find((e: { type: string }) => e.type === TypeEcheance.loyer);
      expect(loyer.montantDu).toBe(160000n);
    });

    it('ouvre le compte de séquestre à la hauteur de la caution', async () => {
      await service.signer('ct1', CODE, LOCATAIRE, CONTEXTE);

      const donnees = prisma.compteSequestre.create.mock.calls[0][0].data;
      expect(donnees.montantInitial).toBe(300000n);
      // Le solde reste nul tant que la caution n'est pas encaissée.
      expect(donnees.solde).toBe(0n);
    });
  });

  describe('congé', () => {
    beforeEach(() => {
      prisma.contrat.findUnique.mockResolvedValue({
        ...contratComplet,
        statut: StatutContrat.actif,
      });
    });

    it('applique le préavis du bailleur quand il donne congé', async () => {
      await service.donnerPreavis('ct1', 'Reprise', BAILLEUR);
      const data = prisma.contrat.update.mock.calls[0][0].data;

      const jours = Math.round((data.finEffectiveLe.getTime() - Date.now()) / 86_400_000);
      expect(jours).toBe(90);
    });

    it('applique le préavis du locataire quand il donne congé', async () => {
      await service.donnerPreavis('ct1', 'Mutation', LOCATAIRE);
      const data = prisma.contrat.update.mock.calls[0][0].data;

      const jours = Math.round((data.finEffectiveLe.getTime() - Date.now()) / 86_400_000);
      expect(jours).toBe(30);
    });

    it("notifie l'autre partie", async () => {
      await service.donnerPreavis('ct1', undefined, LOCATAIRE);
      expect(sms.envoyer).toHaveBeenCalledWith(
        BAILLEUR.telephone,
        expect.stringContaining('conge'),
      );
    });

    it("refuse un congé sur un contrat non actif", async () => {
      prisma.contrat.findUnique.mockResolvedValue({
        ...contratComplet,
        statut: StatutContrat.genere,
      });
      await expect(service.donnerPreavis('ct1', undefined, BAILLEUR)).rejects.toThrow(
        ConflictException,
      );
    });

    it("écarte un tiers", async () => {
      await expect(service.donnerPreavis('ct1', undefined, TIERS)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('accès au document', () => {
    it('renvoie une URL temporaire et rappelle l’empreinte', async () => {
      const resultat = await service.urlDocument('ct1', BAILLEUR);

      expect(resultat.url).toMatch(/^https:\/\//);
      expect(resultat.empreinte).toBe(EMPREINTE);
    });

    it('journalise la consultation', async () => {
      await service.urlDocument('ct1', LOCATAIRE);
      expect(audit.enregistrer).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'contrat.document.consultation' }),
      );
    });

    it('masque le contrat à un tiers', async () => {
      await expect(service.urlDocument('ct1', TIERS)).rejects.toThrow(NotFoundException);
    });
  });
});
