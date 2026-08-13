/**
 * Tests unitaires du service Paiements.
 *
 * Ce module déplace de l'argent réel. Les tests portent en priorité sur ce
 * qui, en cas de régression, ferait perdre de l'argent à quelqu'un :
 * idempotence de la confirmation, ventilation, écarts de montant, et
 * ordre strict entre confirmation et mise à jour des statuts métier.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 * Date   : 13 août 2026
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  StatutPaiement,
  StatutEcheance,
  TypeEcheance,
  MoyenPaiement,
  StatutContrat,
} from '@prisma/client';
import { PaiementsService } from '../../apps/api/src/modules/paiements/paiements.service';
import { QuittancesService } from '../../apps/api/src/modules/paiements/quittances.service';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { AuditService } from '../../apps/api/src/common/audit/audit.service';
import { SmsService } from '../../apps/api/src/modules/notifications/sms.service';
import { FOURNISSEUR_PAIEMENT } from '../../apps/api/src/modules/paiements/fournisseurs/fournisseur.interface';
import type { UtilisateurConnecte } from '../../apps/api/src/modules/auth/jwt.strategy';

describe('PaiementsService', () => {
  let service: PaiementsService;
  let prisma: Record<string, any>;
  let audit: { enregistrer: jest.Mock };
  let fournisseur: Record<string, jest.Mock>;
  let quittances: { genererPourPaiement: jest.Mock };

  const LOCATAIRE: UtilisateurConnecte = { id: 'u-loc', telephone: '+2259900000055', roles: ['locataire'] };
  const TIERS: UtilisateurConnecte = { id: 'u-tiers', telephone: '+2259900000099', roles: ['locataire'] };
  const ADMIN: UtilisateurConnecte = { id: 'u-admin', telephone: '+2259900000009', roles: ['admin'] };

  const contrat = {
    id: 'ct1',
    reference: 'CTR-2026-000001',
    agenceId: 'ag-001',
    locataireId: LOCATAIRE.id,
    statut: StatutContrat.actif,
  };

  /** Échéance de loyer ouverte, 160 000 dus. */
  const echeanceLoyer = {
    id: 'e1',
    contratId: 'ct1',
    type: TypeEcheance.loyer,
    montantDu: 160000n,
    montantPaye: 0n,
    dateEcheance: new Date('2026-09-05'),
    statut: StatutEcheance.due,
    contrat,
  };

  beforeEach(async () => {
    prisma = {
      echeance: {
        findMany: jest.fn().mockResolvedValue([echeanceLoyer]),
        update: jest.fn().mockResolvedValue({}),
      },
      paiement: {
        create: jest.fn().mockResolvedValue({ id: 'p1', referenceInterne: 'PAY-TEST' }),
        update: jest.fn().mockResolvedValue({ id: 'p1', statut: StatutPaiement.en_attente }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      utilisateur: {
        findUnique: jest.fn().mockResolvedValue({ nomComplet: 'Kone', telephone: LOCATAIRE.telephone }),
      },
      compteSequestre: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({ id: 'cpt1' }),
      },
      mouvementSequestre: { create: jest.fn().mockResolvedValue({}) },
      contrat: { findUnique: jest.fn().mockResolvedValue(contrat) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    audit = { enregistrer: jest.fn().mockResolvedValue(undefined) };
    fournisseur = {
      initier: jest.fn().mockResolvedValue({
        referenceAgregateur: 'SIM-1',
        statut: StatutPaiement.en_attente,
      }),
      verifier: jest.fn().mockResolvedValue({ referenceAgregateur: 'SIM-1', statut: StatutPaiement.en_attente }),
      validerNotification: jest.fn(),
    };
    quittances = { genererPourPaiement: jest.fn().mockResolvedValue({ numero: 'QUI-2026-000001' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaiementsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: SmsService, useValue: { envoyer: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('http://test') } },
        { provide: FOURNISSEUR_PAIEMENT, useValue: { ...fournisseur, nom: 'test' } },
        { provide: QuittancesService, useValue: quittances },
      ],
    }).compile();

    service = module.get<PaiementsService>(PaiementsService);
  });

  describe('initiation', () => {
    const dto = { echeanceIds: ['e1'], moyen: MoyenPaiement.orange_money };

    it('refuse des échéances relevant de contrats différents', async () => {
      prisma.echeance.findMany.mockResolvedValue([
        echeanceLoyer,
        { ...echeanceLoyer, id: 'e2', contratId: 'ct2', contrat: { ...contrat, id: 'ct2' } },
      ]);
      await expect(
        service.initier({ echeanceIds: ['e1', 'e2'], moyen: MoyenPaiement.wave }, LOCATAIRE),
      ).rejects.toThrow(/même contrat/);
    });

    it("écarte un payeur qui n'est pas le locataire", async () => {
      await expect(service.initier(dto, TIERS)).rejects.toThrow(ForbiddenException);
    });

    it('refuse une échéance déjà réglée', async () => {
      prisma.echeance.findMany.mockResolvedValue([
        { ...echeanceLoyer, statut: StatutEcheance.payee },
      ]);
      await expect(service.initier(dto, LOCATAIRE)).rejects.toThrow(ConflictException);
    });

    it('refuse un contrat résilié', async () => {
      prisma.echeance.findMany.mockResolvedValue([
        { ...echeanceLoyer, contrat: { ...contrat, statut: StatutContrat.resilie } },
      ]);
      await expect(service.initier(dto, LOCATAIRE)).rejects.toThrow(/résilié/);
    });

    it('règle le solde dû par défaut', async () => {
      await service.initier(dto, LOCATAIRE);
      expect(prisma.paiement.create.mock.calls[0][0].data.montant).toBe(160000n);
    });

    it('accepte un paiement partiel', async () => {
      await service.initier({ ...dto, montant: '80000' }, LOCATAIRE);
      expect(prisma.paiement.create.mock.calls[0][0].data.montant).toBe(80000n);
    });

    it('refuse un montant supérieur au solde (trop-perçu à rembourser)', async () => {
      await expect(service.initier({ ...dto, montant: '200000' }, LOCATAIRE)).rejects.toThrow(
        /dépasse le solde/,
      );
    });

    it('tient compte des montants déjà payés dans le solde', async () => {
      prisma.echeance.findMany.mockResolvedValue([
        { ...echeanceLoyer, montantPaye: 100000n, statut: StatutEcheance.partielle },
      ]);
      await service.initier(dto, LOCATAIRE);
      expect(prisma.paiement.create.mock.calls[0][0].data.montant).toBe(60000n);
    });

    it('génère une référence interne unique par initiation', async () => {
      await service.initier(dto, LOCATAIRE);
      await service.initier(dto, LOCATAIRE);

      const r1 = prisma.paiement.create.mock.calls[0][0].data.referenceInterne;
      const r2 = prisma.paiement.create.mock.calls[1][0].data.referenceInterne;
      expect(r1).not.toBe(r2);
    });

    it("marque le paiement en échec si l'agrégateur est injoignable", async () => {
      fournisseur.initier.mockRejectedValue(new Error('réseau'));
      const module = await Test.createTestingModule({
        providers: [
          PaiementsService,
          { provide: PrismaService, useValue: prisma },
          { provide: AuditService, useValue: audit },
          { provide: SmsService, useValue: { envoyer: jest.fn() } },
          { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('http://test') } },
          { provide: FOURNISSEUR_PAIEMENT, useValue: { ...fournisseur, nom: 'test' } },
          { provide: QuittancesService, useValue: quittances },
        ],
      }).compile();
      const s = module.get<PaiementsService>(PaiementsService);

      await expect(s.initier(dto, LOCATAIRE)).rejects.toThrow(ConflictException);
      expect(prisma.paiement.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { statut: StatutPaiement.echoue } }),
      );
    });
  });

  describe('ventilation', () => {
    it('impute de la plus ancienne à la plus récente', async () => {
      prisma.echeance.findMany.mockResolvedValue([
        { ...echeanceLoyer, id: 'recente', dateEcheance: new Date('2026-10-05') },
        { ...echeanceLoyer, id: 'ancienne', dateEcheance: new Date('2026-09-05') },
      ]);

      await service.initier(
        { echeanceIds: ['recente', 'ancienne'], moyen: MoyenPaiement.wave, montant: '200000' },
        LOCATAIRE,
      );

      const ventilation = prisma.paiement.create.mock.calls[0][0].data.echeances.create;
      // L'ancienne est soldée en premier : un locataire ne doit pas régler le
      // mois courant en laissant traîner un impayé.
      expect(ventilation[0]).toEqual({ echeanceId: 'ancienne', montantAffecte: 160000n });
      expect(ventilation[1]).toEqual({ echeanceId: 'recente', montantAffecte: 40000n });
    });

    it('ignore les échéances déjà soldées', async () => {
      prisma.echeance.findMany.mockResolvedValue([
        { ...echeanceLoyer, id: 'soldee', montantPaye: 160000n },
        { ...echeanceLoyer, id: 'due', dateEcheance: new Date('2026-10-05') },
      ]);

      await service.initier(
        { echeanceIds: ['soldee', 'due'], moyen: MoyenPaiement.wave },
        LOCATAIRE,
      );

      const ventilation = prisma.paiement.create.mock.calls[0][0].data.echeances.create;
      expect(ventilation).toHaveLength(1);
      expect(ventilation[0].echeanceId).toBe('due');
    });
  });

  describe('confirmation', () => {
    const paiementEnAttente = {
      id: 'p1',
      payeurId: LOCATAIRE.id,
      montant: 160000n,
      statut: StatutPaiement.en_attente,
      referenceAgregateur: 'SIM-1',
      contratId: 'ct1',
      contrat,
      echeances: [
        { echeanceId: 'e1', montantAffecte: 160000n, echeance: echeanceLoyer },
      ],
    };

    beforeEach(() => {
      prisma.paiement.findUnique.mockResolvedValue(paiementEnAttente);
    });

    it('solde l’échéance couverte intégralement', async () => {
      await service.confirmer('PAY-TEST', { referenceAgregateur: 'SIM-1', montant: 160000n }, 'webhook');

      const operations = prisma.$transaction.mock.calls[0][0];
      expect(operations.length).toBeGreaterThanOrEqual(2);
      const majEcheance = prisma.echeance.update.mock.calls[0][0].data;
      expect(majEcheance.montantPaye).toBe(160000n);
      expect(majEcheance.statut).toBe(StatutEcheance.payee);
    });

    it('laisse l’échéance partielle si le montant ne la solde pas', async () => {
      prisma.paiement.findUnique.mockResolvedValue({
        ...paiementEnAttente,
        montant: 80000n,
        echeances: [{ echeanceId: 'e1', montantAffecte: 80000n, echeance: echeanceLoyer }],
      });

      await service.confirmer('PAY-TEST', { referenceAgregateur: 'SIM-1', montant: 80000n }, 'webhook');

      const majEcheance = prisma.echeance.update.mock.calls[0][0].data;
      expect(majEcheance.statut).toBe(StatutEcheance.partielle);
    });

    it('est idempotente : un paiement déjà confirmé ne produit aucun effet', async () => {
      prisma.paiement.findUnique.mockResolvedValue({
        ...paiementEnAttente,
        statut: StatutPaiement.confirme,
      });

      const resultat = await service.confirmer('PAY-TEST', null, 'reconciliation');

      expect(resultat).toEqual({ confirme: true, dejaTraite: true });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.echeance.update).not.toHaveBeenCalled();
    });

    it('refuse de confirmer sur un écart de montant et journalise l’anomalie', async () => {
      const resultat = await service.confirmer(
        'PAY-TEST',
        { referenceAgregateur: 'SIM-1', montant: 150000n },
        'webhook',
      );

      expect(resultat.confirme).toBe(false);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(audit.enregistrer).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'paiement.anomalie.montant' }),
      );
    });

    it('crédite le séquestre lorsque l’échéance est une caution', async () => {
      prisma.paiement.findUnique.mockResolvedValue({
        ...paiementEnAttente,
        montant: 300000n,
        echeances: [
          {
            echeanceId: 'e-caution',
            montantAffecte: 300000n,
            echeance: { ...echeanceLoyer, id: 'e-caution', type: TypeEcheance.caution, montantDu: 300000n },
          },
        ],
      });

      await service.confirmer('PAY-TEST', { referenceAgregateur: 'SIM-1', montant: 300000n }, 'webhook');

      expect(prisma.compteSequestre.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { solde: { increment: 300000n } } }),
      );
      expect(prisma.mouvementSequestre.create).toHaveBeenCalled();
    });

    it('ne touche pas au séquestre pour un loyer', async () => {
      await service.confirmer('PAY-TEST', { referenceAgregateur: 'SIM-1', montant: 160000n }, 'webhook');
      expect(prisma.compteSequestre.update).not.toHaveBeenCalled();
    });

    it('génère la quittance après confirmation', async () => {
      await service.confirmer('PAY-TEST', { referenceAgregateur: 'SIM-1', montant: 160000n }, 'webhook');
      expect(quittances.genererPourPaiement).toHaveBeenCalledWith('p1');
    });

    it("n'annule pas l'encaissement si la quittance échoue", async () => {
      quittances.genererPourPaiement.mockRejectedValue(new Error('Gotenberg indisponible'));
      const resultat = await service.confirmer(
        'PAY-TEST',
        { referenceAgregateur: 'SIM-1', montant: 160000n },
        'webhook',
      );
      expect(resultat.confirme).toBe(true);
    });

    it('ignore une référence inconnue sans lever d’erreur', async () => {
      prisma.paiement.findUnique.mockResolvedValue(null);
      const resultat = await service.confirmer('PAY-INCONNU', null, 'webhook');
      expect(resultat).toEqual({ confirme: false, dejaTraite: false });
    });
  });

  describe('notification entrante', () => {
    it('rejette une notification dont la signature est invalide', async () => {
      fournisseur.validerNotification.mockReturnValue(null);
      const module = await Test.createTestingModule({
        providers: [
          PaiementsService,
          { provide: PrismaService, useValue: prisma },
          { provide: AuditService, useValue: audit },
          { provide: SmsService, useValue: { envoyer: jest.fn() } },
          { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('http://test') } },
          { provide: FOURNISSEUR_PAIEMENT, useValue: { ...fournisseur, nom: 'test' } },
          { provide: QuittancesService, useValue: quittances },
        ],
      }).compile();
      const s = module.get<PaiementsService>(PaiementsService);

      const resultat = await s.traiterNotification({ reference: 'x' }, 'fausse');

      expect(resultat).toEqual({ recu: false });
      expect(prisma.paiement.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('réconciliation', () => {
    it('ne vérifie que les paiements antérieurs au délai', async () => {
      prisma.paiement.findMany.mockResolvedValue([]);
      await service.reconcilier();

      const where = prisma.paiement.findMany.mock.calls[0][0].where;
      const minutes = Math.round((Date.now() - where.createdAt.lt.getTime()) / 60_000);
      expect(minutes).toBe(30);
      expect(where.statut.in).toEqual([StatutPaiement.initie, StatutPaiement.en_attente]);
    });

    it("poursuit le lot malgré l'échec d'une vérification", async () => {
      prisma.paiement.findMany.mockResolvedValue([
        { id: 'p1', referenceInterne: 'PAY-1' },
        { id: 'p2', referenceInterne: 'PAY-2' },
      ]);
      fournisseur.verifier
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce({ referenceAgregateur: null, statut: StatutPaiement.en_attente });

      const module = await Test.createTestingModule({
        providers: [
          PaiementsService,
          { provide: PrismaService, useValue: prisma },
          { provide: AuditService, useValue: audit },
          { provide: SmsService, useValue: { envoyer: jest.fn() } },
          { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('http://test') } },
          { provide: FOURNISSEUR_PAIEMENT, useValue: { ...fournisseur, nom: 'test' } },
          { provide: QuittancesService, useValue: quittances },
        ],
      }).compile();
      const s = module.get<PaiementsService>(PaiementsService);

      const bilan = await s.reconcilier();
      expect(bilan.examines).toBe(2);
    });
  });

  describe('échéancier', () => {
    it('calcule le solde restant dû sur les échéances ouvertes', async () => {
      prisma.echeance.findMany.mockResolvedValue([
        { ...echeanceLoyer, montantDu: 160000n, montantPaye: 0n, statut: StatutEcheance.due },
        { ...echeanceLoyer, id: 'e2', montantDu: 160000n, montantPaye: 160000n, statut: StatutEcheance.payee },
        { ...echeanceLoyer, id: 'e3', montantDu: 160000n, montantPaye: 60000n, statut: StatutEcheance.partielle },
      ]);

      const resultat = await service.echeancier('ct1', LOCATAIRE);

      // 160 000 dus + 100 000 restants sur la partielle ; la payée est ignorée.
      expect(resultat.totalRestantDu).toBe(260000n);
    });

    it('masque le contrat à un tiers', async () => {
      await expect(service.echeancier('ct1', TIERS)).rejects.toThrow(NotFoundException);
    });

    it("autorise l'admin", async () => {
      prisma.echeance.findMany.mockResolvedValue([]);
      await expect(service.echeancier('ct1', ADMIN)).resolves.toBeDefined();
    });
  });
});
