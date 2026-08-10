/**
 * Tests unitaires du service Visites.
 *
 * Priorité aux règles temporelles et aux cas de concurrence : ce sont elles
 * qui produisent les litiges (créneau réservé deux fois, absence contestée,
 * annulation de dernière minute) et qui sont les plus faciles à casser lors
 * d'une évolution ultérieure.
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
import { StatutRdv, StatutCreneau, StatutAnnonce, StatutBien } from '@prisma/client';
import { VisitesService } from '../../apps/api/src/modules/visites/visites.service';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { AuditService } from '../../apps/api/src/common/audit/audit.service';
import { SmsService } from '../../apps/api/src/modules/notifications/sms.service';
import type { UtilisateurConnecte } from '../../apps/api/src/modules/auth/jwt.strategy';

describe('VisitesService', () => {
  let service: VisitesService;
  let prisma: Record<string, any>;
  let audit: { enregistrer: jest.Mock };
  let sms: { envoyer: jest.Mock };

  const BAILLEUR: UtilisateurConnecte = { id: 'u-bailleur', telephone: '+2259900000001', roles: ['proprietaire'] };
  const LOCATAIRE: UtilisateurConnecte = { id: 'u-locataire', telephone: '+2259900000055', roles: ['locataire'] };
  const ADMIN: UtilisateurConnecte = { id: 'u-admin', telephone: '+2259900000009', roles: ['admin'] };

  /** Décale une date de N heures par rapport à maintenant. */
  const dans = (heures: number) => new Date(Date.now() + heures * 3_600_000);
  const iso = (heures: number) => dans(heures).toISOString();

  const bien = {
    id: 'b1',
    agenceId: 'ag-001',
    proprietaireId: BAILLEUR.id,
    statut: StatutBien.disponible,
    commune: 'Cocody',
  };

  beforeEach(async () => {
    prisma = {
      bien: { findUnique: jest.fn().mockResolvedValue(bien) },
      creneauVisite: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      annonce: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'a1',
          bienId: 'b1',
          statut: StatutAnnonce.publiee,
          titre: 'Appartement Cocody',
        }),
      },
      rendezVous: {
        create: jest.fn().mockResolvedValue({ id: 'rdv1', statut: StatutRdv.confirme }),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({ statut: StatutRdv.annule }),
      },
      utilisateur: {
        findUnique: jest.fn().mockResolvedValue({ suspensionRdvJusquAu: null, telephone: LOCATAIRE.telephone }),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    audit = { enregistrer: jest.fn().mockResolvedValue(undefined) };
    sms = { envoyer: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisitesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: SmsService, useValue: sms },
      ],
    }).compile();

    service = module.get<VisitesService>(VisitesService);
  });

  describe('ouverture de créneaux', () => {
    const creneauValide = { debut: iso(24), fin: iso(24.5) };

    it('refuse un créneau dans le passé', async () => {
      await expect(
        service.creerCreneaux('b1', { creneaux: [{ debut: iso(-2), fin: iso(-1.5) }] }, BAILLEUR),
      ).rejects.toThrow(/dans le passé/);
    });

    it('refuse une fin antérieure au début', async () => {
      await expect(
        service.creerCreneaux('b1', { creneaux: [{ debut: iso(25), fin: iso(24) }] }, BAILLEUR),
      ).rejects.toThrow(/doit suivre son début/);
    });

    it('refuse une durée inférieure à 15 minutes', async () => {
      await expect(
        service.creerCreneaux('b1', { creneaux: [{ debut: iso(24), fin: iso(24.1) }] }, BAILLEUR),
      ).rejects.toThrow(/durée/);
    });

    it('refuse une durée supérieure à 4 heures', async () => {
      await expect(
        service.creerCreneaux('b1', { creneaux: [{ debut: iso(24), fin: iso(29) }] }, BAILLEUR),
      ).rejects.toThrow(/durée/);
    });

    it('détecte un chevauchement entre créneaux du même envoi', async () => {
      await expect(
        service.creerCreneaux(
          'b1',
          {
            creneaux: [
              { debut: iso(24), fin: iso(24.5) },
              { debut: iso(24.3), fin: iso(25) },
            ],
          },
          BAILLEUR,
        ),
      ).rejects.toThrow(/même envoi se chevauchent/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('accepte des créneaux jointifs sans chevauchement', async () => {
      await expect(
        service.creerCreneaux(
          'b1',
          {
            creneaux: [
              { debut: iso(24), fin: iso(24.5) },
              { debut: iso(24.5), fin: iso(25) },
            ],
          },
          BAILLEUR,
        ),
      ).resolves.toEqual(expect.objectContaining({ nombre: 2 }));
    });

    it("traduit la contrainte d'exclusion PostgreSQL en message clair", async () => {
      prisma.$transaction.mockRejectedValue(
        new Error('conflicting key value violates exclusion constraint "creneau_sans_chevauchement"'),
      );
      await expect(
        service.creerCreneaux('b1', { creneaux: [creneauValide] }, BAILLEUR),
      ).rejects.toThrow(/chevauche une plage déjà ouverte/);
    });

    it("refuse d'ouvrir des créneaux sur un bien loué", async () => {
      prisma.bien.findUnique.mockResolvedValue({ ...bien, statut: StatutBien.loue });
      await expect(
        service.creerCreneaux('b1', { creneaux: [creneauValide] }, BAILLEUR),
      ).rejects.toThrow(ConflictException);
    });

    it("masque le bien d'un autre bailleur", async () => {
      prisma.bien.findUnique.mockResolvedValue({ ...bien, proprietaireId: 'autre' });
      await expect(
        service.creerCreneaux('b1', { creneaux: [creneauValide] }, LOCATAIRE),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('créneaux disponibles', () => {
    it('exclut les créneaux complets', async () => {
      prisma.creneauVisite.findMany.mockResolvedValue([
        { id: 'c1', debut: dans(24), fin: dans(24.5), capacite: 1, _count: { rendezVous: 1 } },
        { id: 'c2', debut: dans(25), fin: dans(25.5), capacite: 3, _count: { rendezVous: 1 } },
      ]);

      const dispo = await service.creneauxDisponibles('b1', {});

      expect(dispo).toHaveLength(1);
      expect(dispo[0]).toEqual(expect.objectContaining({ id: 'c2', placesRestantes: 2 }));
    });
  });

  describe('réservation', () => {
    const creneauLibre = {
      id: 'c1',
      statut: StatutCreneau.ouvert,
      debut: dans(24),
      fin: dans(24.5),
      capacite: 1,
      bienId: 'b1',
      bien,
      _count: { rendezVous: 0 },
    };

    beforeEach(() => {
      prisma.creneauVisite.findUnique.mockResolvedValue(creneauLibre);
    });

    it('confirme immédiatement une réservation sur créneau libre', async () => {
      await service.reserver({ creneauId: 'c1', annonceId: 'a1' }, LOCATAIRE);
      expect(prisma.rendezVous.create.mock.calls[0][0].data.statut).toBe(StatutRdv.confirme);
    });

    it('notifie le visiteur par SMS', async () => {
      await service.reserver({ creneauId: 'c1', annonceId: 'a1' }, LOCATAIRE);
      expect(sms.envoyer).toHaveBeenCalledWith(LOCATAIRE.telephone, expect.stringContaining('confirmee'));
    });

    it('refuse un créneau complet', async () => {
      prisma.creneauVisite.findUnique.mockResolvedValue({ ...creneauLibre, _count: { rendezVous: 1 } });
      await expect(service.reserver({ creneauId: 'c1', annonceId: 'a1' }, LOCATAIRE)).rejects.toThrow(
        /complet/,
      );
    });

    it('refuse un créneau déjà passé', async () => {
      prisma.creneauVisite.findUnique.mockResolvedValue({ ...creneauLibre, debut: dans(-1) });
      await expect(service.reserver({ creneauId: 'c1', annonceId: 'a1' }, LOCATAIRE)).rejects.toThrow(
        /déjà passé/,
      );
    });

    it('refuse un créneau fermé', async () => {
      prisma.creneauVisite.findUnique.mockResolvedValue({ ...creneauLibre, statut: StatutCreneau.ferme });
      await expect(service.reserver({ creneauId: 'c1', annonceId: 'a1' }, LOCATAIRE)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("refuse si l'annonce ne correspond pas au créneau", async () => {
      prisma.annonce.findUnique.mockResolvedValue({ id: 'a9', bienId: 'autre-bien', statut: StatutAnnonce.publiee });
      await expect(service.reserver({ creneauId: 'c1', annonceId: 'a9' }, LOCATAIRE)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("refuse si l'annonce n'est plus publiée", async () => {
      prisma.annonce.findUnique.mockResolvedValue({ id: 'a1', bienId: 'b1', statut: StatutAnnonce.retiree });
      await expect(service.reserver({ creneauId: 'c1', annonceId: 'a1' }, LOCATAIRE)).rejects.toThrow(
        /plus publiée/,
      );
    });

    it('interdit au bailleur de réserver sur son propre bien', async () => {
      await expect(service.reserver({ creneauId: 'c1', annonceId: 'a1' }, BAILLEUR)).rejects.toThrow(
        /votre propre bien/,
      );
    });

    it('traduit la double réservation en message clair', async () => {
      prisma.rendezVous.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
      await expect(service.reserver({ creneauId: 'c1', annonceId: 'a1' }, LOCATAIRE)).rejects.toThrow(
        /déjà réservé ce créneau/,
      );
    });

    it('refuse un visiteur suspendu (RG-RDV-A)', async () => {
      prisma.utilisateur.findUnique.mockResolvedValue({ suspensionRdvJusquAu: dans(72) });
      await expect(service.reserver({ creneauId: 'c1', annonceId: 'a1' }, LOCATAIRE)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.rendezVous.create).not.toHaveBeenCalled();
    });

    it('accepte un visiteur dont la suspension est expirée', async () => {
      prisma.utilisateur.findUnique.mockResolvedValue({ suspensionRdvJusquAu: dans(-24) });
      await expect(service.reserver({ creneauId: 'c1', annonceId: 'a1' }, LOCATAIRE)).resolves.toBeDefined();
    });
  });

  describe('annulation', () => {
    const rdvConfirme = (heuresAvant: number) => ({
      id: 'rdv1',
      visiteurId: LOCATAIRE.id,
      statut: StatutRdv.confirme,
      creneau: { debut: dans(heuresAvant), bien: { agenceId: 'ag-001', proprietaireId: BAILLEUR.id } },
    });

    it("marque l'annulation comme tardive à moins de 4 heures", async () => {
      prisma.rendezVous.findUnique.mockResolvedValue(rdvConfirme(2));
      const resultat = await service.annuler('rdv1', 'Empêchement', LOCATAIRE);
      expect(resultat.tardive).toBe(true);
    });

    it("n'est pas tardive au-delà de 4 heures", async () => {
      prisma.rendezVous.findUnique.mockResolvedValue(rdvConfirme(10));
      const resultat = await service.annuler('rdv1', undefined, LOCATAIRE);
      expect(resultat.tardive).toBe(false);
    });

    it('reste possible même tardivement (éviter une absence pure)', async () => {
      prisma.rendezVous.findUnique.mockResolvedValue(rdvConfirme(1));
      await expect(service.annuler('rdv1', 'Retard', LOCATAIRE)).resolves.toBeDefined();
      expect(prisma.rendezVous.update).toHaveBeenCalled();
    });

    it("refuse d'annuler un rendez-vous déjà clos", async () => {
      prisma.rendezVous.findUnique.mockResolvedValue({
        ...rdvConfirme(10),
        statut: StatutRdv.effectue,
      });
      await expect(service.annuler('rdv1', undefined, LOCATAIRE)).rejects.toThrow(ConflictException);
    });

    it('autorise le bailleur à annuler', async () => {
      prisma.rendezVous.findUnique.mockResolvedValue(rdvConfirme(10));
      await expect(service.annuler('rdv1', 'Indisponible', BAILLEUR)).resolves.toBeDefined();
    });

    it('masque le rendez-vous à un tiers', async () => {
      prisma.rendezVous.findUnique.mockResolvedValue(rdvConfirme(10));
      const tiers: UtilisateurConnecte = { id: 'u-tiers', telephone: '+2259900000077', roles: ['locataire'] };
      await expect(service.annuler('rdv1', undefined, tiers)).rejects.toThrow(NotFoundException);
    });
  });

  describe('clôture et règle no-show', () => {
    const rdvPasse = {
      id: 'rdv1',
      visiteurId: LOCATAIRE.id,
      statut: StatutRdv.confirme,
      creneau: { debut: dans(-2), bien: { agenceId: 'ag-001', proprietaireId: BAILLEUR.id } },
    };

    beforeEach(() => {
      prisma.rendezVous.findUnique.mockResolvedValue(rdvPasse);
      prisma.rendezVous.update.mockResolvedValue({ statut: StatutRdv.effectue });
    });

    it("refuse de clôturer un rendez-vous à venir", async () => {
      prisma.rendezVous.findUnique.mockResolvedValue({
        ...rdvPasse,
        creneau: { ...rdvPasse.creneau, debut: dans(5) },
      });
      await expect(service.cloturer('rdv1', StatutRdv.effectue, undefined, BAILLEUR)).rejects.toThrow(
        /pas encore eu lieu/,
      );
    });

    it('enregistre le compte rendu et son auteur', async () => {
      await service.cloturer('rdv1', StatutRdv.effectue, 'Visiteur intéressé.', BAILLEUR);
      const data = prisma.rendezVous.update.mock.calls[0][0].data;
      expect(data.compteRendu).toBe('Visiteur intéressé.');
      expect(data.marquePar).toBe(BAILLEUR.id);
    });

    it("ne suspend pas avant le 3e manquement", async () => {
      prisma.rendezVous.count.mockResolvedValue(2);
      const resultat = await service.cloturer('rdv1', StatutRdv.no_show, undefined, BAILLEUR);
      expect(resultat.suspensionVisiteurJusquAu).toBeNull();
      expect(prisma.utilisateur.update).not.toHaveBeenCalled();
    });

    it('suspend 7 jours au 3e manquement sur 90 jours (RG-RDV-A)', async () => {
      prisma.rendezVous.count.mockResolvedValue(3);
      const resultat = await service.cloturer('rdv1', StatutRdv.no_show, undefined, BAILLEUR);

      expect(resultat.suspensionVisiteurJusquAu).not.toBeNull();
      const jours = Math.round(
        ((resultat.suspensionVisiteurJusquAu as Date).getTime() - Date.now()) / 86_400_000,
      );
      expect(jours).toBe(7);
      expect(prisma.utilisateur.update).toHaveBeenCalled();
    });

    it('notifie le visiteur de sa suspension', async () => {
      prisma.rendezVous.count.mockResolvedValue(3);
      await service.cloturer('rdv1', StatutRdv.no_show, undefined, BAILLEUR);
      expect(sms.envoyer).toHaveBeenCalledWith(
        LOCATAIRE.telephone,
        expect.stringContaining('suspendue'),
      );
    });

    it('ne compte que les absences de la fenêtre de 90 jours', async () => {
      prisma.rendezVous.count.mockResolvedValue(3);
      await service.cloturer('rdv1', StatutRdv.no_show, undefined, BAILLEUR);

      const where = prisma.rendezVous.count.mock.calls[0][0].where;
      const jours = Math.round((Date.now() - where.updatedAt.gte.getTime()) / 86_400_000);
      expect(jours).toBe(90);
      expect(where.statut).toBe(StatutRdv.no_show);
    });

    it("interdit à un tiers de clôturer", async () => {
      await expect(service.cloturer('rdv1', StatutRdv.effectue, undefined, LOCATAIRE)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("autorise l'admin à clôturer", async () => {
      await expect(service.cloturer('rdv1', StatutRdv.effectue, undefined, ADMIN)).resolves.toBeDefined();
    });
  });

  describe('fermeture de créneau', () => {
    it('refuse de fermer un créneau portant des réservations', async () => {
      prisma.creneauVisite.findUnique.mockResolvedValue({
        id: 'c1',
        bien: { agenceId: 'ag-001', proprietaireId: BAILLEUR.id },
        _count: { rendezVous: 1 },
      });
      await expect(service.fermerCreneau('c1', BAILLEUR)).rejects.toThrow(/porte des réservations/);
    });

    it('ferme un créneau sans réservation', async () => {
      prisma.creneauVisite.findUnique.mockResolvedValue({
        id: 'c1',
        bien: { agenceId: 'ag-001', proprietaireId: BAILLEUR.id },
        _count: { rendezVous: 0 },
      });
      await expect(service.fermerCreneau('c1', BAILLEUR)).resolves.toEqual(
        expect.objectContaining({ message: expect.any(String) }),
      );
    });
  });
});
