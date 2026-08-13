/**
 * Tests unitaires du service Séquestre.
 *
 * La caution appartient au locataire jusqu'à preuve du contraire. Les tests
 * vérifient donc surtout ce qui empêche de la retenir indûment : justificatif
 * obligatoire, co-validation, impossibilité d'agir seul.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 * Date   : 13 août 2026
 */
import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { StatutSequestre, TypeMvtSequestre, StatutContrat } from '@prisma/client';
import { SequestreService } from '../../apps/api/src/modules/sequestre/sequestre.service';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { AuditService } from '../../apps/api/src/common/audit/audit.service';
import { SmsService } from '../../apps/api/src/modules/notifications/sms.service';
import { StockageService } from '../../apps/api/src/modules/medias/stockage.service';
import { FichiersService } from '../../apps/api/src/modules/medias/fichiers.service';
import { GabaritService } from '../../apps/api/src/modules/contrats/gabarit.service';
import type { UtilisateurConnecte } from '../../apps/api/src/modules/auth/jwt.strategy';

describe('SequestreService', () => {
  let service: SequestreService;
  let prisma: Record<string, any>;
  let audit: { enregistrer: jest.Mock };
  let sms: { envoyer: jest.Mock };

  const BAILLEUR: UtilisateurConnecte = { id: 'u-bail', telephone: '+2259900000001', roles: ['proprietaire'] };
  const LOCATAIRE: UtilisateurConnecte = { id: 'u-loc', telephone: '+2259900000055', roles: ['locataire'] };
  const TIERS: UtilisateurConnecte = { id: 'u-tiers', telephone: '+2259900000099', roles: ['locataire'] };
  const ADMIN: UtilisateurConnecte = { id: 'u-admin', telephone: '+2259900000009', roles: ['admin'] };

  const justificatif = { buffer: Buffer.from('%PDF-1.4'), size: 8 };

  /** Contrat en préavis : les propositions y sont recevables. */
  const contratEnPreavis = {
    id: 'ct1',
    reference: 'CTR-2026-000001',
    agenceId: 'ag-001',
    statut: StatutContrat.en_preavis,
    bailleurId: BAILLEUR.id,
    locataireId: LOCATAIRE.id,
    delaiRestitutionCautionJours: 30,
    finEffectiveLe: new Date('2026-09-12'),
    bailleur: { telephone: BAILLEUR.telephone },
    locataire: { telephone: LOCATAIRE.telephone },
  };

  const compte = {
    id: 'cpt1',
    contratId: 'ct1',
    montantInitial: 300000n,
    solde: 300000n,
    statut: StatutSequestre.actif,
    contrat: contratEnPreavis,
    mouvements: [],
  };

  beforeEach(async () => {
    prisma = {
      compteSequestre: {
        findUnique: jest.fn().mockResolvedValue(compte),
        update: jest.fn().mockResolvedValue({}),
      },
      mouvementSequestre: {
        create: jest.fn().mockResolvedValue({
          id: 'mvt1', type: TypeMvtSequestre.retenue, montant: 40000n,
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'mvt1' }),
        delete: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    audit = { enregistrer: jest.fn().mockResolvedValue(undefined) };
    sms = { envoyer: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SequestreService,
        GabaritService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: SmsService, useValue: sms },
        {
          provide: StockageService,
          useValue: {
            construireCle: jest.fn().mockReturnValue('sequestres/cpt1/j.pdf'),
            televerser: jest.fn().mockResolvedValue('cle'),
          },
        },
        {
          provide: FichiersService,
          useValue: {
            validerDocument: jest.fn().mockReturnValue({ typeMime: 'application/pdf', extension: 'pdf' }),
          },
        },
      ],
    }).compile();

    service = module.get<SequestreService>(SequestreService);
  });

  describe('proposition de retenue', () => {
    const dto = { montant: '40000', motif: 'Remplacement du chauffe-eau, facture jointe' };

    it('exige un justificatif', async () => {
      await expect(
        service.proposerRetenue('ct1', dto, undefined, BAILLEUR),
      ).rejects.toThrow(/justificatif est obligatoire/);
      expect(prisma.mouvementSequestre.create).not.toHaveBeenCalled();
    });

    it('interdit au locataire de proposer une retenue sur sa propre caution', async () => {
      await expect(
        service.proposerRetenue('ct1', dto, justificatif, LOCATAIRE),
      ).rejects.toThrow(ForbiddenException);
    });

    it("refuse tant que le bail court", async () => {
      prisma.compteSequestre.findUnique.mockResolvedValue({
        ...compte,
        contrat: { ...contratEnPreavis, statut: StatutContrat.actif },
      });
      await expect(
        service.proposerRetenue('ct1', dto, justificatif, BAILLEUR),
      ).rejects.toThrow(/état des lieux de sortie/);
    });

    it('refuse une retenue supérieure au solde', async () => {
      await expect(
        service.proposerRetenue('ct1', { ...dto, montant: '400000' }, justificatif, BAILLEUR),
      ).rejects.toThrow(/dépasse le solde/);
    });

    it('refuse pendant un gel des fonds', async () => {
      prisma.compteSequestre.findUnique.mockResolvedValue({
        ...compte,
        statut: StatutSequestre.gele,
      });
      await expect(
        service.proposerRetenue('ct1', dto, justificatif, BAILLEUR),
      ).rejects.toThrow(/gelés/);
    });

    it('enregistre la validation du proposant, pas celle du locataire', async () => {
      await service.proposerRetenue('ct1', dto, justificatif, BAILLEUR);

      const data = prisma.mouvementSequestre.create.mock.calls[0][0].data;
      expect(data.valideBailleurLe).toBeInstanceOf(Date);
      expect(data.valideLocataireLe).toBeUndefined();
      expect(data.justificatifUrl).toBeDefined();
    });

    it('notifie le locataire de la proposition', async () => {
      await service.proposerRetenue('ct1', dto, justificatif, BAILLEUR);
      expect(sms.envoyer).toHaveBeenCalledWith(
        LOCATAIRE.telephone,
        expect.stringContaining('Retenue'),
      );
    });
  });

  describe('proposition de restitution', () => {
    it('restitue le solde par défaut', async () => {
      await service.proposerRestitution('ct1', {}, BAILLEUR);
      expect(prisma.mouvementSequestre.create.mock.calls[0][0].data.montant).toBe(300000n);
    });

    it('refuse une seconde restitution simultanée', async () => {
      prisma.mouvementSequestre.findFirst.mockResolvedValue({ id: 'mvt-en-cours' });
      await expect(service.proposerRestitution('ct1', {}, BAILLEUR)).rejects.toThrow(
        /déjà en cours/,
      );
    });

    it('peut être proposée par le locataire', async () => {
      await service.proposerRestitution('ct1', {}, LOCATAIRE);
      const data = prisma.mouvementSequestre.create.mock.calls[0][0].data;

      expect(data.valideLocataireLe).toBeInstanceOf(Date);
      expect(data.valideBailleurLe).toBeNull();
    });

    it("refuse tant que le bail court", async () => {
      prisma.compteSequestre.findUnique.mockResolvedValue({
        ...compte,
        contrat: { ...contratEnPreavis, statut: StatutContrat.actif },
      });
      await expect(service.proposerRestitution('ct1', {}, BAILLEUR)).rejects.toThrow(
        /fin de bail/,
      );
    });
  });

  describe('co-validation', () => {
    const propositionBailleur = {
      id: 'mvt1',
      compteId: 'cpt1',
      type: TypeMvtSequestre.retenue,
      montant: 40000n,
      valideBailleurLe: new Date(),
      valideLocataireLe: null,
      executeLe: null,
      compte: { ...compte, contrat: contratEnPreavis },
    };

    beforeEach(() => {
      prisma.mouvementSequestre.findUnique.mockResolvedValue(propositionBailleur);
    });

    it("n'exécute rien tant qu'une seule partie a validé", async () => {
      prisma.mouvementSequestre.findUnique.mockResolvedValue({
        ...propositionBailleur,
        valideBailleurLe: null,
      });

      const resultat = await service.valider('mvt1', BAILLEUR);

      expect(resultat.execute).toBe(false);
      expect(resultat.enAttenteDe).toBe('locataire');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('exécute et débite le solde quand les deux ont validé', async () => {
      const resultat = await service.valider('mvt1', LOCATAIRE);

      expect(resultat.execute).toBe(true);
      expect(resultat.soldeRestant).toBe(260000n);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('clôt le séquestre lorsque le solde tombe à zéro', async () => {
      prisma.mouvementSequestre.findUnique.mockResolvedValue({
        ...propositionBailleur,
        type: TypeMvtSequestre.restitution,
        montant: 300000n,
      });

      await service.valider('mvt1', LOCATAIRE);

      const operations = prisma.$transaction.mock.calls[0][0];
      const majCompte = prisma.compteSequestre.update.mock.calls[0][0].data;
      expect(operations).toHaveLength(2);
      expect(majCompte.statut).toBe(StatutSequestre.clos);
    });

    it('refuse une double validation par la même partie', async () => {
      await expect(service.valider('mvt1', BAILLEUR)).rejects.toThrow(/déjà validé/);
    });

    it("refuse de valider une proposition déjà exécutée", async () => {
      prisma.mouvementSequestre.findUnique.mockResolvedValue({
        ...propositionBailleur,
        executeLe: new Date(),
      });
      await expect(service.valider('mvt1', LOCATAIRE)).rejects.toThrow(/déjà exécutée/);
    });

    it('écarte un tiers', async () => {
      await expect(service.valider('mvt1', TIERS)).rejects.toThrow(NotFoundException);
    });

    it('refuse de valider pendant un gel', async () => {
      prisma.mouvementSequestre.findUnique.mockResolvedValue({
        ...propositionBailleur,
        compte: { ...compte, statut: StatutSequestre.gele, contrat: contratEnPreavis },
      });
      await expect(service.valider('mvt1', LOCATAIRE)).rejects.toThrow(/gelés/);
    });

    it("refuse si le solde est devenu insuffisant entre-temps", async () => {
      prisma.mouvementSequestre.findUnique.mockResolvedValue({
        ...propositionBailleur,
        montant: 400000n,
      });
      await expect(service.valider('mvt1', LOCATAIRE)).rejects.toThrow(/insuffisant/);
    });
  });

  describe('refus de proposition', () => {
    it('supprime la proposition et notifie l’autre partie', async () => {
      prisma.mouvementSequestre.findUnique.mockResolvedValue({
        id: 'mvt1',
        type: TypeMvtSequestre.retenue,
        montant: 40000n,
        executeLe: null,
        compte: { ...compte, contrat: contratEnPreavis },
      });

      await service.refuser('mvt1', 'Retenue non justifiée', LOCATAIRE);

      expect(prisma.mouvementSequestre.delete).toHaveBeenCalledWith({ where: { id: 'mvt1' } });
      expect(sms.envoyer).toHaveBeenCalledWith(
        BAILLEUR.telephone,
        expect.stringContaining('refusee'),
      );
    });

    it("refuse d'annuler un mouvement déjà exécuté", async () => {
      prisma.mouvementSequestre.findUnique.mockResolvedValue({
        id: 'mvt1',
        type: TypeMvtSequestre.retenue,
        montant: 40000n,
        executeLe: new Date(),
        compte: { ...compte, contrat: contratEnPreavis },
      });
      await expect(service.refuser('mvt1', undefined, LOCATAIRE)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('gel des fonds', () => {
    it("interdit à une partie de geler unilatéralement", async () => {
      // Le gel serait sinon un moyen de pression dans la négociation.
      await expect(service.definirGel('ct1', true, undefined, BAILLEUR)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.definirGel('ct1', true, undefined, LOCATAIRE)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("permet à l'administrateur de geler avec référence de litige", async () => {
      const resultat = await service.definirGel('ct1', true, 'lit-1', ADMIN);

      expect(resultat.statut).toBe(StatutSequestre.gele);
      const operations = prisma.$transaction.mock.calls[0][0];
      expect(operations).toHaveLength(2);
    });

    it('permet le dégel', async () => {
      const resultat = await service.definirGel('ct1', false, undefined, ADMIN);
      expect(resultat.statut).toBe(StatutSequestre.actif);
    });
  });

  describe('exécution sur décision de litige', () => {
    it("réservée à l'administrateur", async () => {
      await expect(
        service.executerSurDecision('ct1', 'lit-1', 40000n, BAILLEUR),
      ).rejects.toThrow(ForbiddenException);
    });

    it('répartit entre retenue et restitution, puis clôt', async () => {
      const resultat = await service.executerSurDecision('ct1', 'lit-1', 40000n, ADMIN);

      expect(resultat.retenu).toBe(40000n);
      expect(resultat.restitue).toBe(260000n);
      expect(resultat.statut).toBe(StatutSequestre.clos);
    });

    it('restitue tout si aucune retenue n’est décidée', async () => {
      const resultat = await service.executerSurDecision('ct1', 'lit-1', 0n, ADMIN);

      expect(resultat.restitue).toBe(300000n);
      // Aucun mouvement de retenue à montant nul : deux opérations suffisent.
      const operations = prisma.$transaction.mock.calls[0][0];
      expect(operations).toHaveLength(2);
    });

    it('refuse une retenue supérieure au solde', async () => {
      await expect(
        service.executerSurDecision('ct1', 'lit-1', 400000n, ADMIN),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('consultation', () => {
    it('distingue les propositions en cours des mouvements exécutés', async () => {
      prisma.compteSequestre.findUnique.mockResolvedValue({
        ...compte,
        mouvements: [
          { id: 'm1', type: TypeMvtSequestre.depot, montant: 300000n, executeLe: new Date(), createdAt: new Date(), valideBailleurLe: null, valideLocataireLe: null },
          { id: 'm2', type: TypeMvtSequestre.retenue, montant: 40000n, executeLe: new Date(), createdAt: new Date(), valideBailleurLe: new Date(), valideLocataireLe: new Date() },
          { id: 'm3', type: TypeMvtSequestre.restitution, montant: 260000n, executeLe: null, createdAt: new Date(), valideBailleurLe: new Date(), valideLocataireLe: null },
        ],
      });

      const resultat = await service.consulter('ct1', LOCATAIRE);

      expect(resultat.retenuesValidees).toBe(40000n);
      expect(resultat.propositionsEnCours).toHaveLength(1);
      expect(resultat.propositionsEnCours[0].id).toBe('m3');
    });

    it('masque le séquestre à un tiers', async () => {
      await expect(service.consulter('ct1', TIERS)).rejects.toThrow(NotFoundException);
    });
  });
});
