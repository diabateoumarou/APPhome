/**
 * Tests unitaires du service Biens.
 * Vérifient les règles de sécurité et de cohérence métier :
 * garde KYC à deux niveaux, isolation entre bailleurs, statuts figés.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 * Date   : 09 août 2026
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { TypeBien, StatutBien, TypePieceKyc, StatutKyc } from '@prisma/client';
import { BiensService } from '../../apps/api/src/modules/biens/biens.service';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { AuditService } from '../../apps/api/src/common/audit/audit.service';
import type { UtilisateurConnecte } from '../../apps/api/src/modules/auth/jwt.strategy';

describe('BiensService', () => {
  let service: BiensService;
  let prisma: Record<string, any>;
  let audit: { enregistrer: jest.Mock };

  const BAILLEUR: UtilisateurConnecte = {
    id: 'u-bailleur',
    telephone: '+2259900000001',
    roles: ['proprietaire'],
  };
  const ADMIN: UtilisateurConnecte = {
    id: 'u-admin',
    telephone: '+2259900000009',
    roles: ['admin'],
  };
  const AGENCE_ID = 'ag-001';

  const dtoBien = {
    typeBien: TypeBien.appartement,
    adresse: 'Rue des Jardins, Angré',
    commune: 'Cocody',
  };

  /** KYC complet : identité + titre de propriété vérifiés. */
  const kycComplet = [
    { typePiece: TypePieceKyc.cni },
    { typePiece: TypePieceKyc.titre_propriete },
  ];

  beforeEach(async () => {
    prisma = {
      kycVerification: { findMany: jest.fn().mockResolvedValue(kycComplet) },
      utilisateurRole: { findFirst: jest.fn().mockResolvedValue({ agenceId: AGENCE_ID }) },
      equipement: { findMany: jest.fn().mockResolvedValue([]) },
      bien: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
      },
      bienDocument: { create: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([0, []]),
    };
    audit = { enregistrer: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BiensService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<BiensService>(BiensService);
  });

  describe('garde KYC (RG-002)', () => {
    it("refuse la création sans pièce d'identité vérifiée", async () => {
      prisma.kycVerification.findMany.mockResolvedValue([]);
      await expect(service.creer(dtoBien, BAILLEUR)).rejects.toThrow(ForbiddenException);
      expect(prisma.bien.create).not.toHaveBeenCalled();
    });

    it('refuse la création sans titre de propriété ni mandat', async () => {
      prisma.kycVerification.findMany.mockResolvedValue([{ typePiece: TypePieceKyc.cni }]);
      await expect(service.creer(dtoBien, BAILLEUR)).rejects.toThrow(
        /titre de propriété ou un mandat de gestion/,
      );
      expect(prisma.bien.create).not.toHaveBeenCalled();
    });

    it('accepte un mandat de gestion en substitut du titre de propriété', async () => {
      prisma.kycVerification.findMany.mockResolvedValue([
        { typePiece: TypePieceKyc.passeport },
        { typePiece: TypePieceKyc.mandat_gestion },
      ]);
      prisma.bien.create.mockResolvedValue({ id: 'b1', ...dtoBien });

      await expect(service.creer(dtoBien, BAILLEUR)).resolves.toBeDefined();
    });

    it('ne considère que les vérifications au statut « verifie »', async () => {
      await service.creer(dtoBien, BAILLEUR).catch(() => undefined);
      expect(prisma.kycVerification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ statut: StatutKyc.verifie }),
        }),
      );
    });
  });

  describe('création', () => {
    it("rattache le bien à l'agence et au bailleur, et journalise", async () => {
      prisma.bien.create.mockResolvedValue({ id: 'b1', commune: 'Cocody', typeBien: TypeBien.appartement });

      await service.creer(dtoBien, BAILLEUR);

      const data = prisma.bien.create.mock.calls[0][0].data;
      expect(data.agenceId).toBe(AGENCE_ID);
      expect(data.proprietaireId).toBe(BAILLEUR.id);
      expect(audit.enregistrer).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'bien.creation', entiteType: 'bien' }),
      );
    });

    it("refuse un bailleur non rattaché à une agence", async () => {
      prisma.utilisateurRole.findFirst.mockResolvedValue(null);
      await expect(service.creer(dtoBien, BAILLEUR)).rejects.toThrow(BadRequestException);
    });

    it('signale les codes équipements inconnus', async () => {
      prisma.equipement.findMany.mockResolvedValue([{ id: 'e1', code: 'parking' }]);
      await expect(
        service.creer({ ...dtoBien, equipements: ['parking', 'heliport'] }, BAILLEUR),
      ).rejects.toThrow(/heliport/);
    });
  });

  describe('contrôle de propriété', () => {
    const bienAutrui = {
      id: 'b9',
      agenceId: AGENCE_ID,
      proprietaireId: 'autre-bailleur',
      statut: StatutBien.disponible,
      _count: { annonces: 0, contrats: 0 },
    };

    it("masque l'existence du bien d'un autre bailleur", async () => {
      prisma.bien.findUnique.mockResolvedValue(bienAutrui);
      await expect(service.detail('b9', BAILLEUR)).rejects.toThrow(NotFoundException);
    });

    it('renvoie le même message pour un bien inexistant', async () => {
      prisma.bien.findUnique.mockResolvedValue(null);
      const erreurInexistant = await service.detail('b0', BAILLEUR).catch((e: Error) => e);

      prisma.bien.findUnique.mockResolvedValue(bienAutrui);
      const erreurAutrui = await service.detail('b9', BAILLEUR).catch((e: Error) => e);

      expect((erreurInexistant as Error).message).toBe((erreurAutrui as Error).message);
    });

    it("autorise l'admin à consulter tout le parc", async () => {
      prisma.bien.findUnique.mockResolvedValue(bienAutrui);
      await expect(service.detail('b9', ADMIN)).resolves.toBeDefined();
    });
  });

  describe('modification et suppression', () => {
    const bienLoue = {
      id: 'b1',
      agenceId: AGENCE_ID,
      proprietaireId: BAILLEUR.id,
      statut: StatutBien.loue,
      commune: 'Cocody',
      _count: { annonces: 1, contrats: 1 },
    };

    it('refuse de modifier un bien loué (caractéristiques opposables)', async () => {
      prisma.bien.findUnique.mockResolvedValue(bienLoue);
      await expect(service.modifier('b1', { commune: 'Yopougon' }, BAILLEUR)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.bien.update).not.toHaveBeenCalled();
    });

    it("refuse de supprimer un bien portant un historique contractuel", async () => {
      prisma.bien.findUnique.mockResolvedValue(bienLoue);
      await expect(service.supprimer('b1', BAILLEUR)).rejects.toThrow(/historique de contrats/);
      expect(prisma.bien.delete).not.toHaveBeenCalled();
    });

    it("refuse de supprimer un bien qui n'est pas disponible", async () => {
      prisma.bien.findUnique.mockResolvedValue({
        ...bienLoue,
        statut: StatutBien.reserve,
        _count: { annonces: 1, contrats: 0 },
      });
      await expect(service.supprimer('b1', BAILLEUR)).rejects.toThrow(ConflictException);
    });

    it('supprime un bien disponible et sans contrat', async () => {
      prisma.bien.findUnique.mockResolvedValue({
        ...bienLoue,
        statut: StatutBien.disponible,
        _count: { annonces: 0, contrats: 0 },
      });
      await expect(service.supprimer('b1', BAILLEUR)).resolves.toEqual(
        expect.objectContaining({ message: expect.any(String) }),
      );
      expect(prisma.bien.delete).toHaveBeenCalled();
    });
  });

  describe('listage', () => {
    it("restreint la liste aux biens du bailleur", async () => {
      await service.lister({ page: 1, limite: 20 }, BAILLEUR);
      const where = prisma.bien.count.mock.calls[0][0].where;
      expect(where.proprietaireId).toBe(BAILLEUR.id);
    });

    it("n'applique aucune restriction de propriété pour l'admin", async () => {
      await service.lister({ page: 1, limite: 20 }, ADMIN);
      const where = prisma.bien.count.mock.calls[0][0].where;
      expect(where.proprietaireId).toBeUndefined();
    });
  });
});
