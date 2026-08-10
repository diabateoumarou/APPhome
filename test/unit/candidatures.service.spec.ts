/**
 * Tests unitaires du service Candidatures.
 *
 * Le consentement au partage des pièces est le point le plus sensible :
 * une régression y exposerait des justificatifs de revenus sans autorisation,
 * en violation de la loi n°2013-450. Il est testé sous plusieurs angles.
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
  StatutDossier,
  StatutCandidature,
  StatutAnnonce,
  StatutBien,
  TypePieceDossier,
} from '@prisma/client';
import { CandidaturesService } from '../../apps/api/src/modules/candidatures/candidatures.service';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { AuditService } from '../../apps/api/src/common/audit/audit.service';
import { SmsService } from '../../apps/api/src/modules/notifications/sms.service';
import { StockageService } from '../../apps/api/src/modules/medias/stockage.service';
import { FichiersService } from '../../apps/api/src/modules/medias/fichiers.service';
import type { UtilisateurConnecte } from '../../apps/api/src/modules/auth/jwt.strategy';

describe('CandidaturesService', () => {
  let service: CandidaturesService;
  let prisma: Record<string, any>;
  let audit: { enregistrer: jest.Mock };
  let sms: { envoyer: jest.Mock };
  let stockage: Record<string, jest.Mock>;

  const LOCATAIRE: UtilisateurConnecte = { id: 'u-loc', telephone: '+2259900000055', roles: ['locataire'] };
  const BAILLEUR: UtilisateurConnecte = { id: 'u-bail', telephone: '+2259900000001', roles: ['proprietaire'] };
  const TIERS: UtilisateurConnecte = { id: 'u-tiers', telephone: '+2259900000099', roles: ['locataire'] };

  const dossierComplet = {
    id: 'd1',
    locataireId: LOCATAIRE.id,
    statut: StatutDossier.complet,
    pieces: [
      { id: 'p1', typePiece: TypePieceDossier.identite, statut: 'soumise', fichierUrl: 'k1' },
      { id: 'p2', typePiece: TypePieceDossier.revenus, statut: 'soumise', fichierUrl: 'k2' },
    ],
  };

  const annoncePubliee = {
    id: 'a1',
    statut: StatutAnnonce.publiee,
    titre: 'Appartement Cocody',
    bienId: 'b1',
    bien: {
      id: 'b1',
      agenceId: 'ag-001',
      proprietaireId: BAILLEUR.id,
      statut: StatutBien.disponible,
      commune: 'Cocody',
    },
  };

  beforeEach(async () => {
    prisma = {
      dossier: {
        findUnique: jest.fn().mockResolvedValue(dossierComplet),
        create: jest.fn().mockResolvedValue({ ...dossierComplet, pieces: [] }),
        update: jest.fn().mockResolvedValue({}),
      },
      dossierPiece: {
        findMany: jest.fn().mockResolvedValue(dossierComplet.pieces),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'p3', typePiece: TypePieceDossier.revenus, statut: 'soumise' }),
        delete: jest.fn().mockResolvedValue({}),
      },
      annonce: { findUnique: jest.fn().mockResolvedValue(annoncePubliee) },
      candidature: {
        create: jest.fn().mockResolvedValue({ id: 'c1', statut: StatutCandidature.soumise }),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({ statut: StatutCandidature.acceptee }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      motifRefus: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      bien: { update: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockResolvedValue([0, []]),
    };
    audit = { enregistrer: jest.fn().mockResolvedValue(undefined) };
    sms = { envoyer: jest.fn().mockResolvedValue(undefined) };
    stockage = {
      construireCle: jest.fn().mockReturnValue('dossiers/d1/2026-08-10/abc.pdf'),
      televerser: jest.fn().mockResolvedValue('k3'),
      supprimer: jest.fn().mockResolvedValue(undefined),
      urlPresignee: jest.fn().mockResolvedValue('https://stockage/presigne'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CandidaturesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: SmsService, useValue: sms },
        { provide: StockageService, useValue: stockage },
        {
          provide: FichiersService,
          useValue: { validerDocument: jest.fn().mockReturnValue({ typeMime: 'application/pdf', extension: 'pdf' }) },
        },
      ],
    }).compile();

    service = module.get<CandidaturesService>(CandidaturesService);
  });

  describe('dossier', () => {
    it("crée le dossier à la première consultation", async () => {
      prisma.dossier.findUnique.mockResolvedValue(null);
      await service.monDossier(LOCATAIRE);
      expect(prisma.dossier.create).toHaveBeenCalled();
    });

    it('signale les pièces manquantes', async () => {
      prisma.dossier.findUnique.mockResolvedValue({
        ...dossierComplet,
        statut: StatutDossier.incomplet,
        pieces: [{ id: 'p1', typePiece: TypePieceDossier.identite, statut: 'soumise' }],
      });

      const resultat = await service.monDossier(LOCATAIRE);
      expect(resultat.piecesManquantes).toEqual([TypePieceDossier.revenus]);
    });

    it('stocke les pièces dans le bucket privé', async () => {
      await service.ajouterPiece(TypePieceDossier.revenus, { buffer: Buffer.alloc(10), size: 10 }, LOCATAIRE);
      expect(stockage.televerser).toHaveBeenCalledWith(
        expect.any(String), expect.any(Buffer), 'application/pdf', 'prive',
      );
    });

    it("remplace une pièce du même type au lieu d'accumuler les versions", async () => {
      prisma.dossierPiece.findFirst.mockResolvedValue({ id: 'ancienne', fichierUrl: 'k-vieille' });
      await service.ajouterPiece(TypePieceDossier.revenus, { buffer: Buffer.alloc(10), size: 10 }, LOCATAIRE);

      expect(prisma.dossierPiece.delete).toHaveBeenCalledWith({ where: { id: 'ancienne' } });
      expect(stockage.supprimer).toHaveBeenCalledWith('k-vieille', 'prive');
    });
  });

  describe('soumission', () => {
    it('refuse un dossier incomplet en listant les manquants', async () => {
      prisma.dossier.findUnique.mockResolvedValue({
        ...dossierComplet,
        statut: StatutDossier.incomplet,
        pieces: [],
      });

      await expect(
        service.soumettre({ annonceId: 'a1', consentementPartagePieces: true }, LOCATAIRE),
      ).rejects.toThrow(/identite, revenus/);
      expect(prisma.candidature.create).not.toHaveBeenCalled();
    });

    it('horodate le consentement au partage', async () => {
      await service.soumettre({ annonceId: 'a1', consentementPartagePieces: true }, LOCATAIRE);
      const data = prisma.candidature.create.mock.calls[0][0].data;

      expect(data.consentementPartagePieces).toBe(true);
      expect(data.consentementLe).toBeInstanceOf(Date);
    });

    it("n'horodate rien si le consentement est refusé", async () => {
      await service.soumettre({ annonceId: 'a1', consentementPartagePieces: false }, LOCATAIRE);
      const data = prisma.candidature.create.mock.calls[0][0].data;

      expect(data.consentementPartagePieces).toBe(false);
      expect(data.consentementLe).toBeNull();
    });

    it("refuse une annonce qui n'est plus publiée", async () => {
      prisma.annonce.findUnique.mockResolvedValue({ ...annoncePubliee, statut: StatutAnnonce.retiree });
      await expect(
        service.soumettre({ annonceId: 'a1', consentementPartagePieces: true }, LOCATAIRE),
      ).rejects.toThrow(ConflictException);
    });

    it('refuse un bien déjà réservé', async () => {
      prisma.annonce.findUnique.mockResolvedValue({
        ...annoncePubliee,
        bien: { ...annoncePubliee.bien, statut: StatutBien.reserve },
      });
      await expect(
        service.soumettre({ annonceId: 'a1', consentementPartagePieces: true }, LOCATAIRE),
      ).rejects.toThrow(/plus disponible/);
    });

    it('interdit au bailleur de candidater sur son bien', async () => {
      prisma.dossier.findUnique.mockResolvedValue({ ...dossierComplet, locataireId: BAILLEUR.id });
      await expect(
        service.soumettre({ annonceId: 'a1', consentementPartagePieces: true }, BAILLEUR),
      ).rejects.toThrow(/votre propre bien/);
    });

    it('traduit la double candidature en message clair', async () => {
      prisma.candidature.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
      await expect(
        service.soumettre({ annonceId: 'a1', consentementPartagePieces: true }, LOCATAIRE),
      ).rejects.toThrow(/déjà candidaté/);
    });
  });

  describe('consentement et accès aux pièces', () => {
    const candidatureSansConsentement = {
      id: 'c2',
      consentementPartagePieces: false,
      dossier: { id: 'd2', locataireId: TIERS.id },
      annonce: { bien: { agenceId: 'ag-001', proprietaireId: BAILLEUR.id } },
    };

    it('masque les pièces au bailleur sans consentement', async () => {
      prisma.annonce.findUnique.mockResolvedValue(annoncePubliee);
      prisma.candidature.findMany.mockResolvedValue([
        {
          id: 'c1', statut: StatutCandidature.soumise, createdAt: new Date(),
          consentementPartagePieces: false, consentementLe: null,
          dossier: {
            statut: StatutDossier.complet,
            locataire: { nomComplet: 'Bamba', telephone: '+2259900000077' },
            pieces: [{ id: 'p1', typePiece: TypePieceDossier.identite, statut: 'soumise' }],
          },
          motifRefus: null,
        },
      ]);

      const recues = await service.candidaturesRecues('a1', BAILLEUR);

      expect(recues[0].dossierComplet).toBe(true);
      expect(recues[0].pieces).toBeUndefined();
    });

    it('ne révèle le téléphone du candidat qu’après acceptation', async () => {
      prisma.annonce.findUnique.mockResolvedValue(annoncePubliee);
      prisma.candidature.findMany.mockResolvedValue([
        {
          id: 'c1', statut: StatutCandidature.soumise, createdAt: new Date(),
          consentementPartagePieces: true, consentementLe: new Date(),
          dossier: {
            statut: StatutDossier.complet,
            locataire: { nomComplet: 'Kone', telephone: '+2259900000055' },
            pieces: [],
          },
          motifRefus: null,
        },
      ]);

      const recues = await service.candidaturesRecues('a1', BAILLEUR);
      expect(recues[0].telephone).toBeUndefined();
    });

    it("refuse au bailleur l'accès à une pièce non consentie", async () => {
      prisma.candidature.findUnique.mockResolvedValue(candidatureSansConsentement);
      await expect(service.urlPiece('c2', 'p1', BAILLEUR)).rejects.toThrow(ForbiddenException);
      expect(stockage.urlPresignee).not.toHaveBeenCalled();
    });

    it('laisse le candidat accéder à ses propres pièces sans consentement', async () => {
      prisma.candidature.findUnique.mockResolvedValue({
        ...candidatureSansConsentement,
        dossier: { id: 'd2', locataireId: TIERS.id },
      });
      prisma.dossierPiece.findFirst.mockResolvedValue({ id: 'p1', fichierUrl: 'k1', typePiece: 'identite' });

      await expect(service.urlPiece('c2', 'p1', TIERS)).resolves.toHaveProperty('url');
    });

    it('journalise chaque consultation de pièce', async () => {
      prisma.candidature.findUnique.mockResolvedValue({
        ...candidatureSansConsentement,
        consentementPartagePieces: true,
      });
      prisma.dossierPiece.findFirst.mockResolvedValue({ id: 'p1', fichierUrl: 'k1', typePiece: 'revenus' });

      await service.urlPiece('c2', 'p1', BAILLEUR);
      expect(audit.enregistrer).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'candidature.piece.consultation' }),
      );
    });
  });

  describe('décision du bailleur', () => {
    const candidatureActive = {
      id: 'c1',
      statut: StatutCandidature.soumise,
      annonceId: 'a1',
      dossier: { locataire: { telephone: '+2259900000055', nomComplet: 'Kone' } },
      annonce: {
        id: 'a1', titre: 'Appartement Cocody', bienId: 'b1',
        bien: { agenceId: 'ag-001', proprietaireId: BAILLEUR.id, statut: StatutBien.disponible },
      },
    };

    beforeEach(() => {
      prisma.candidature.findUnique.mockResolvedValue(candidatureActive);
    });

    it('exige un motif pour un refus', async () => {
      await expect(
        service.decider('c1', { decision: StatutCandidature.refusee }, BAILLEUR),
      ).rejects.toThrow(/motif de refus est obligatoire/);
    });

    it('refuse un motif hors de la liste fermée', async () => {
      prisma.motifRefus.findUnique.mockResolvedValue(null);
      await expect(
        service.decider('c1', { decision: StatutCandidature.refusee, motifRefusCode: 'invente' }, BAILLEUR),
      ).rejects.toThrow(/Motif de refus inconnu/);
    });

    it('accepte un motif figurant dans la liste', async () => {
      prisma.motifRefus.findUnique.mockResolvedValue({ code: 'revenus_insuffisants' });
      await expect(
        service.decider('c1', { decision: StatutCandidature.refusee, motifRefusCode: 'revenus_insuffisants' }, BAILLEUR),
      ).resolves.toBeDefined();
    });

    it('réserve le bien et met les autres en liste d’attente (RG-DOS-A)', async () => {
      await service.decider('c1', { decision: StatutCandidature.acceptee }, BAILLEUR);

      // Les trois opérations doivent être dans une seule transaction.
      expect(prisma.$transaction).toHaveBeenCalled();
      const operations = prisma.$transaction.mock.calls.at(-1)?.[0];
      expect(Array.isArray(operations)).toBe(true);
      expect(operations).toHaveLength(3);
    });

    it("refuse d'accepter si le bien n'est plus disponible", async () => {
      prisma.candidature.findUnique.mockResolvedValue({
        ...candidatureActive,
        annonce: {
          ...candidatureActive.annonce,
          bien: { ...candidatureActive.annonce.bien, statut: StatutBien.reserve },
        },
      });

      await expect(
        service.decider('c1', { decision: StatutCandidature.acceptee }, BAILLEUR),
      ).rejects.toThrow(/autre candidature a déjà été retenue/);
    });

    it('notifie le candidat retenu', async () => {
      await service.decider('c1', { decision: StatutCandidature.acceptee }, BAILLEUR);
      expect(sms.envoyer).toHaveBeenCalledWith(
        '+2259900000055',
        expect.stringContaining('acceptee'),
      );
    });

    it("refuse de statuer sur une candidature déjà tranchée", async () => {
      prisma.candidature.findUnique.mockResolvedValue({
        ...candidatureActive,
        statut: StatutCandidature.refusee,
      });
      await expect(
        service.decider('c1', { decision: StatutCandidature.acceptee }, BAILLEUR),
      ).rejects.toThrow(ConflictException);
    });

    it('masque la candidature à un bailleur tiers', async () => {
      prisma.candidature.findUnique.mockResolvedValue({
        ...candidatureActive,
        annonce: {
          ...candidatureActive.annonce,
          bien: { ...candidatureActive.annonce.bien, proprietaireId: 'autre' },
        },
      });
      await expect(
        service.decider('c1', { decision: StatutCandidature.acceptee }, BAILLEUR),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('retrait par le candidat', () => {
    it('refuse le retrait par un tiers', async () => {
      prisma.candidature.findUnique.mockResolvedValue({
        id: 'c1',
        statut: StatutCandidature.soumise,
        dossier: { locataireId: LOCATAIRE.id },
        annonce: { bien: { agenceId: 'ag-001' } },
      });
      await expect(service.retirer('c1', TIERS)).rejects.toThrow(NotFoundException);
    });

    it("refuse le retrait d'une candidature déjà acceptée", async () => {
      prisma.candidature.findUnique.mockResolvedValue({
        id: 'c1',
        statut: StatutCandidature.acceptee,
        dossier: { locataireId: LOCATAIRE.id },
        annonce: { bien: { agenceId: 'ag-001' } },
      });
      await expect(service.retirer('c1', LOCATAIRE)).rejects.toThrow(ConflictException);
    });
  });
});
