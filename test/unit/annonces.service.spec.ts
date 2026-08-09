/**
 * Tests unitaires du service Annonces.
 * Vérifient la conformité légale (loi n°2019-576), le workflow de modération
 * et l'exposition publique restreinte.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 * Date   : 09 août 2026
 */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { StatutAnnonce, StatutBien, TypeTransaction, TypePieceKyc } from '@prisma/client';
import { AnnoncesService } from '../../apps/api/src/modules/annonces/annonces.service';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { AuditService } from '../../apps/api/src/common/audit/audit.service';
import type { UtilisateurConnecte } from '../../apps/api/src/modules/auth/jwt.strategy';

describe('AnnoncesService', () => {
  let service: AnnoncesService;
  let prisma: Record<string, any>;
  let audit: { enregistrer: jest.Mock };

  const BAILLEUR: UtilisateurConnecte = { id: 'u-bailleur', telephone: '+2259900000001', roles: ['proprietaire'] };
  const MODERATEUR: UtilisateurConnecte = { id: 'u-admin', telephone: '+2259900000009', roles: ['admin'] };

  /** Plafonds ivoiriens : 2 mois de caution + 2 mois d'avance (loi n°2019-576). */
  const PLAFONDS_CI = {
    pays: 'CI',
    cautionMaxMois: 2,
    avanceMaxMois: 2,
    totalEntreeMaxMois: 4,
  };

  const bienDisponible = {
    id: 'b1',
    agenceId: 'ag-001',
    proprietaireId: BAILLEUR.id,
    statut: StatutBien.disponible,
    commune: 'Cocody',
    agence: { pays: 'CI' },
    _count: { photos: 3, documents: 1 },
  };

  const dtoAnnonce = {
    bienId: 'b1',
    transaction: TypeTransaction.location,
    titre: 'Appartement 3 pièces Cocody Angré',
    loyerMontant: '150000',
    cautionNbMois: 2,
    avanceNbMois: 2,
  };

  beforeEach(async () => {
    prisma = {
      bien: { findUnique: jest.fn().mockResolvedValue(bienDisponible) },
      parametreLegal: { findUnique: jest.fn().mockResolvedValue(PLAFONDS_CI) },
      annonce: {
        create: jest.fn().mockResolvedValue({ id: 'a1', titre: dtoAnnonce.titre, transaction: TypeTransaction.location }),
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({ statut: StatutAnnonce.publiee, expireLe: new Date() }),
      },
      $transaction: jest.fn().mockResolvedValue([0, []]),
    };
    audit = { enregistrer: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnnoncesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<AnnoncesService>(AnnoncesService);
  });

  describe('plafonds légaux (loi n°2019-576)', () => {
    it('refuse une caution supérieure à 2 mois', async () => {
      await expect(
        service.creer({ ...dtoAnnonce, cautionNbMois: 3 }, BAILLEUR),
      ).rejects.toThrow(/caution ne peut excéder 2 mois/);
      expect(prisma.annonce.create).not.toHaveBeenCalled();
    });

    it('refuse une avance supérieure à 2 mois', async () => {
      await expect(
        service.creer({ ...dtoAnnonce, avanceNbMois: 3 }, BAILLEUR),
      ).rejects.toThrow(/avance ne peut excéder 2 mois/);
    });

    it('accepte le maximum légal de 2 + 2 mois', async () => {
      await expect(service.creer(dtoAnnonce, BAILLEUR)).resolves.toBeDefined();
      const data = prisma.annonce.create.mock.calls[0][0].data;
      expect(data.cautionNbMois).toBe(2);
      expect(data.avanceNbMois).toBe(2);
    });

    it('lit les plafonds du pays de l’agence (multi-pays)', async () => {
      await service.creer(dtoAnnonce, BAILLEUR);
      expect(prisma.parametreLegal.findUnique).toHaveBeenCalledWith({ where: { pays: 'CI' } });
    });

    it("refuse si aucun paramétrage légal n'existe pour le pays", async () => {
      prisma.parametreLegal.findUnique.mockResolvedValue(null);
      await expect(service.creer(dtoAnnonce, BAILLEUR)).rejects.toThrow(BadRequestException);
    });
  });

  describe('cohérence des prix', () => {
    it('exige un loyer pour une location', async () => {
      const { loyerMontant: _absent, ...sansLoyer } = dtoAnnonce;
      await expect(service.creer(sansLoyer, BAILLEUR)).rejects.toThrow(/loyer mensuel est obligatoire/);
    });

    it('exige un prix pour une vente', async () => {
      await expect(
        service.creer({ ...dtoAnnonce, transaction: TypeTransaction.vente, loyerMontant: undefined }, BAILLEUR),
      ).rejects.toThrow(/prix de vente est obligatoire/);
    });

    it('convertit les montants en BigInt (précision FCFA préservée)', async () => {
      await service.creer(dtoAnnonce, BAILLEUR);
      expect(prisma.annonce.create.mock.calls[0][0].data.loyerMontant).toBe(150000n);
    });
  });

  describe('création', () => {
    it("refuse une annonce sur le bien d'un autre bailleur", async () => {
      prisma.bien.findUnique.mockResolvedValue({ ...bienDisponible, proprietaireId: 'autre' });
      await expect(service.creer(dtoAnnonce, BAILLEUR)).rejects.toThrow(ForbiddenException);
    });

    it("refuse une annonce sur un bien déjà loué", async () => {
      prisma.bien.findUnique.mockResolvedValue({ ...bienDisponible, statut: StatutBien.loue });
      await expect(service.creer(dtoAnnonce, BAILLEUR)).rejects.toThrow(ConflictException);
    });

    it('interdit deux annonces actives sur le même bien', async () => {
      prisma.annonce.findFirst.mockResolvedValue({ id: 'a-existante', statut: StatutAnnonce.publiee });
      await expect(service.creer(dtoAnnonce, BAILLEUR)).rejects.toThrow(/déjà publiee/);
    });

    it('crée en brouillon, jamais directement publiée', async () => {
      await service.creer(dtoAnnonce, BAILLEUR);
      expect(prisma.annonce.create.mock.calls[0][0].data.statut).toBe(StatutAnnonce.brouillon);
    });
  });

  describe('soumission à modération', () => {
    const annonceBrouillon = {
      id: 'a1',
      statut: StatutAnnonce.brouillon,
      bien: bienDisponible,
    };

    it('exige au moins 3 photos', async () => {
      prisma.annonce.findUnique.mockResolvedValue({
        ...annonceBrouillon,
        bien: { ...bienDisponible, _count: { photos: 2, documents: 1 } },
      });
      await expect(service.soumettre('a1', BAILLEUR)).rejects.toThrow(/au moins 3 photos/);
    });

    it('passe en statut soumise et efface un éventuel motif de rejet', async () => {
      prisma.annonce.findUnique.mockResolvedValue(annonceBrouillon);
      prisma.annonce.update.mockResolvedValue({ statut: StatutAnnonce.soumise });

      await service.soumettre('a1', BAILLEUR);

      const data = prisma.annonce.update.mock.calls[0][0].data;
      expect(data.statut).toBe(StatutAnnonce.soumise);
      expect(data.motifRejet).toBeNull();
    });

    it("refuse de resoumettre une annonce déjà publiée", async () => {
      prisma.annonce.findUnique.mockResolvedValue({ ...annonceBrouillon, statut: StatutAnnonce.publiee });
      await expect(service.soumettre('a1', BAILLEUR)).rejects.toThrow(ConflictException);
    });
  });

  describe('modération', () => {
    const annonceSoumise = {
      id: 'a1',
      statut: StatutAnnonce.soumise,
      bien: { agenceId: 'ag-001', statut: StatutBien.disponible, _count: { photos: 3 } },
    };

    it('publie et fixe une expiration à 60 jours (REQ-ANN-08)', async () => {
      prisma.annonce.findUnique.mockResolvedValue(annonceSoumise);
      await service.publier('a1', MODERATEUR);

      const data = prisma.annonce.update.mock.calls[0][0].data;
      const jours = Math.round((data.expireLe.getTime() - Date.now()) / 86_400_000);
      expect(data.statut).toBe(StatutAnnonce.publiee);
      expect(jours).toBe(60);
      expect(data.modereePar).toBe(MODERATEUR.id);
    });

    it('refuse de publier une annonce en brouillon', async () => {
      prisma.annonce.findUnique.mockResolvedValue({ ...annonceSoumise, statut: StatutAnnonce.brouillon });
      await expect(service.publier('a1', MODERATEUR)).rejects.toThrow(ConflictException);
    });

    it("refuse de publier si le bien n'est plus disponible", async () => {
      prisma.annonce.findUnique.mockResolvedValue({
        ...annonceSoumise,
        bien: { ...annonceSoumise.bien, statut: StatutBien.loue },
      });
      await expect(service.publier('a1', MODERATEUR)).rejects.toThrow(/plus disponible/);
    });

    it('enregistre le motif de rejet et son auteur', async () => {
      prisma.annonce.findUnique.mockResolvedValue(annonceSoumise);
      prisma.annonce.update.mockResolvedValue({ statut: StatutAnnonce.rejetee });

      await service.rejeter('a1', 'Photos de qualité insuffisante.', MODERATEUR);

      const data = prisma.annonce.update.mock.calls[0][0].data;
      expect(data.motifRejet).toBe('Photos de qualité insuffisante.');
      expect(data.modereePar).toBe(MODERATEUR.id);
    });

    it('journalise chaque décision de modération (REQ-ANN-06)', async () => {
      prisma.annonce.findUnique.mockResolvedValue(annonceSoumise);
      await service.publier('a1', MODERATEUR);
      expect(audit.enregistrer).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'annonce.moderation.publication' }),
      );
    });
  });

  describe('modification', () => {
    it("refuse de modifier une annonce publiée", async () => {
      prisma.annonce.findUnique.mockResolvedValue({
        id: 'a1',
        statut: StatutAnnonce.publiee,
        transaction: TypeTransaction.location,
        loyerMontant: 150000n,
        cautionNbMois: 2,
        avanceNbMois: 2,
        bien: bienDisponible,
      });
      await expect(service.modifier('a1', { titre: 'Nouveau titre' }, BAILLEUR)).rejects.toThrow(
        ConflictException,
      );
    });

    it('remet une annonce rejetée en brouillon après correction', async () => {
      prisma.annonce.findUnique.mockResolvedValue({
        id: 'a1',
        statut: StatutAnnonce.rejetee,
        transaction: TypeTransaction.location,
        loyerMontant: 150000n,
        cautionNbMois: 2,
        avanceNbMois: 2,
        bien: bienDisponible,
      });
      prisma.annonce.update.mockResolvedValue({ statut: StatutAnnonce.brouillon });

      await service.modifier('a1', { titre: 'Titre corrigé et complété' }, BAILLEUR);

      const data = prisma.annonce.update.mock.calls[0][0].data;
      expect(data.statut).toBe(StatutAnnonce.brouillon);
      expect(data.motifRejet).toBeNull();
    });
  });

  describe('recherche publique', () => {
    it("n'expose que les annonces publiées et non expirées", async () => {
      await service.rechercher({ page: 1, limite: 20, tri: 'recent' });
      const where = prisma.annonce.count.mock.calls[0][0].where;

      expect(where.statut).toBe(StatutAnnonce.publiee);
      expect(where.bien.statut).toBe(StatutBien.disponible);
      expect(where.OR).toEqual([{ expireLe: null }, { expireLe: expect.objectContaining({ gt: expect.any(Date) }) }]);
    });

    it('applique le filtre de budget sur le loyer en location', async () => {
      await service.rechercher({ page: 1, limite: 20, budgetMax: '200000', transaction: TypeTransaction.location });
      const where = prisma.annonce.count.mock.calls[0][0].where;
      expect(where.loyerMontant).toEqual({ lte: 200000n });
    });

    it('applique le filtre de budget sur le prix en vente', async () => {
      await service.rechercher({ page: 1, limite: 20, budgetMax: '50000000', transaction: TypeTransaction.vente });
      const where = prisma.annonce.count.mock.calls[0][0].where;
      expect(where.prixVente).toEqual({ lte: 50000000n });
    });

    it("calcule le coût total d'entrée côté serveur (REQ-RCH-05)", async () => {
      prisma.$transaction.mockResolvedValue([
        1,
        [{ loyerMontant: 150000n, cautionNbMois: 2, avanceNbMois: 2, fraisAgenceMontant: 150000n, bien: {} }],
      ]);

      const resultat = await service.rechercher({ page: 1, limite: 20 });
      const cout = resultat.donnees[0].coutEntree;

      expect(cout.caution).toBe(300000n);
      expect(cout.avance).toBe(300000n);
      expect(cout.total).toBe(750000n);
    });
  });

  describe('fiche publique', () => {
    it("refuse une annonce non publiée", async () => {
      prisma.annonce.findFirst.mockResolvedValue(null);
      await expect(service.detailPublic('a1')).rejects.toThrow(NotFoundException);
    });
  });
});
