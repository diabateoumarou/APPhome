/**
 * Service Candidatures — dossier numérique et arbitrage des candidatures.
 *
 * Règles appliquées :
 *  - REQ-DOS-02 : un seul dossier par locataire, réutilisable sur plusieurs
 *    annonces. Constituer son dossier une fois est l'argument d'adoption le
 *    plus fort côté locataire sur un marché où chaque agence redemande tout.
 *  - REQ-DOS-04 : les pièces ne sont visibles du bailleur qu'après consentement
 *    explicite et horodaté du candidat (loi n°2013-450). Le consentement est
 *    donné par candidature, pas globalement : postuler chez A n'autorise pas B.
 *  - REQ-DOS-03 : motif de refus obligatoire, choisi dans une liste fermée —
 *    un champ libre laisserait passer des motifs discriminatoires.
 *  - RG-DOS-A : l'acceptation bascule le bien en « réservé » et place les
 *    autres candidats en liste d'attente, dans une transaction unique.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 *          Ingénieur Système & Infrastructure Cloud / System Architect
 *          Expert Solutions ICT (Cloud, Système, Cybersécurité)
 * Date   : 10 août 2026
 */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  Prisma,
  StatutDossier,
  StatutPiece,
  StatutCandidature,
  StatutAnnonce,
  StatutBien,
  TypePieceDossier,
  RoleUtilisateur,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { SmsService } from '../notifications/sms.service';
import { StockageService } from '../medias/stockage.service';
import { FichiersService } from '../medias/fichiers.service';
import type { UtilisateurConnecte } from '../auth/jwt.strategy';
import {
  SoumettreCandidatureDto,
  DecisionCandidatureDto,
  ListerCandidaturesDto,
} from './dto/candidature.dto';

/** Pièces minimales pour qu'un dossier soit considéré complet. */
const PIECES_REQUISES: TypePieceDossier[] = [
  TypePieceDossier.identite,
  TypePieceDossier.revenus,
];

/** Statuts de candidature encore en cours d'examen. */
const CANDIDATURES_ACTIVES: StatutCandidature[] = [
  StatutCandidature.soumise,
  StatutCandidature.en_examen,
  StatutCandidature.liste_attente,
];

@Injectable()
export class CandidaturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sms: SmsService,
    private readonly stockage: StockageService,
    private readonly fichiers: FichiersService,
  ) {}

  private estSuperviseur(utilisateur: UtilisateurConnecte): boolean {
    const roles: RoleUtilisateur[] = [RoleUtilisateur.admin, RoleUtilisateur.agence];
    return utilisateur.roles.some((r) => roles.includes(r as RoleUtilisateur));
  }

  /** Récupère ou crée le dossier du locataire — il n'en existe qu'un. */
  private async dossierDe(locataireId: string) {
    const existant = await this.prisma.dossier.findUnique({
      where: { locataireId },
      include: { pieces: { orderBy: { createdAt: 'asc' } } },
    });
    if (existant) return existant;

    return this.prisma.dossier.create({
      data: { locataireId },
      include: { pieces: true },
    });
  }

  /** Recalcule la complétude après chaque changement de pièce. */
  private async rafraichirCompletude(dossierId: string): Promise<StatutDossier> {
    const pieces = await this.prisma.dossierPiece.findMany({
      where: { dossierId, statut: { not: StatutPiece.rejetee } },
      select: { typePiece: true },
    });

    const types = pieces.map((p) => p.typePiece);
    const complet = PIECES_REQUISES.every((requise) => types.includes(requise));
    const statut = complet ? StatutDossier.complet : StatutDossier.incomplet;

    await this.prisma.dossier.update({ where: { id: dossierId }, data: { statut } });
    return statut;
  }

  async monDossier(utilisateur: UtilisateurConnecte) {
    const dossier = await this.dossierDe(utilisateur.id);

    const manquantes = PIECES_REQUISES.filter(
      (requise) =>
        !dossier.pieces.some(
          (p) => p.typePiece === requise && p.statut !== StatutPiece.rejetee,
        ),
    );

    return {
      id: dossier.id,
      statut: dossier.statut,
      pieces: dossier.pieces.map((p) => ({
        id: p.id,
        typePiece: p.typePiece,
        statut: p.statut,
        motifRejet: p.motifRejet,
        createdAt: p.createdAt,
      })),
      piecesManquantes: manquantes,
    };
  }

  /** Téléverse une pièce justificative dans le stockage privé. */
  async ajouterPiece(
    typePiece: TypePieceDossier,
    fichier: { buffer: Buffer; size: number },
    utilisateur: UtilisateurConnecte,
  ) {
    const dossier = await this.dossierDe(utilisateur.id);
    const { typeMime, extension } = this.fichiers.validerDocument(fichier.buffer, fichier.size);

    const cle = this.stockage.construireCle(`dossiers/${dossier.id}`, extension);
    await this.stockage.televerser(cle, fichier.buffer, typeMime, 'prive');

    // Une nouvelle pièce du même type remplace la précédente : un locataire qui
    // met à jour son bulletin de salaire ne doit pas accumuler les versions.
    const ancienne = await this.prisma.dossierPiece.findFirst({
      where: { dossierId: dossier.id, typePiece },
    });
    if (ancienne) {
      await this.prisma.dossierPiece.delete({ where: { id: ancienne.id } });
      await this.stockage.supprimer(ancienne.fichierUrl, 'prive');
    }

    const piece = await this.prisma.dossierPiece.create({
      data: { dossierId: dossier.id, typePiece, fichierUrl: cle },
    });

    const statut = await this.rafraichirCompletude(dossier.id);

    await this.audit.enregistrer({
      utilisateurId: utilisateur.id,
      action: 'dossier.piece.ajout',
      entiteType: 'dossier',
      entiteId: dossier.id,
      donneesApres: { typePiece, statutDossier: statut },
    });

    return {
      id: piece.id,
      typePiece: piece.typePiece,
      statut: piece.statut,
      statutDossier: statut,
    };
  }

  async supprimerPiece(pieceId: string, utilisateur: UtilisateurConnecte) {
    const dossier = await this.dossierDe(utilisateur.id);

    const piece = await this.prisma.dossierPiece.findFirst({
      where: { id: pieceId, dossierId: dossier.id },
    });
    if (!piece) throw new NotFoundException('Pièce introuvable.');

    await this.prisma.dossierPiece.delete({ where: { id: pieceId } });
    await this.stockage.supprimer(piece.fichierUrl, 'prive');
    const statut = await this.rafraichirCompletude(dossier.id);

    return { message: 'Pièce supprimée.', statutDossier: statut };
  }

  /**
   * Soumet une candidature sur une annonce publiée.
   * Le dossier doit être complet : transmettre un dossier incomplet fait
   * perdre du temps aux deux parties et encombre la file du bailleur.
   */
  async soumettre(dto: SoumettreCandidatureDto, utilisateur: UtilisateurConnecte) {
    const dossier = await this.dossierDe(utilisateur.id);

    if (dossier.statut !== StatutDossier.complet) {
      const manquantes = PIECES_REQUISES.filter(
        (r) => !dossier.pieces.some((p) => p.typePiece === r && p.statut !== StatutPiece.rejetee),
      );
      throw new BadRequestException(
        `Votre dossier est incomplet. Pièces manquantes : ${manquantes.join(', ')}.`,
      );
    }

    // L'adresse sert d'élection de domicile au bail (art. 16) : sans elle,
    // les notifications contractuelles seraient difficilement opposables.
    const profil = await this.prisma.utilisateur.findUnique({
      where: { id: utilisateur.id },
      select: { adresse: true, commune: true },
    });
    if (!profil?.adresse || !profil.commune) {
      throw new BadRequestException(
        "Renseignez votre adresse dans votre profil : elle sert d'élection de domicile au contrat de bail.",
      );
    }

    const annonce = await this.prisma.annonce.findUnique({
      where: { id: dto.annonceId },
      include: {
        bien: {
          select: { id: true, agenceId: true, proprietaireId: true, statut: true, commune: true },
        },
      },
    });

    if (!annonce) throw new NotFoundException('Annonce introuvable.');
    if (annonce.statut !== StatutAnnonce.publiee) {
      throw new ConflictException("Cette annonce n'accepte plus de candidatures.");
    }
    if (annonce.bien.statut !== StatutBien.disponible) {
      throw new ConflictException("Ce bien n'est plus disponible.");
    }
    if (annonce.bien.proprietaireId === utilisateur.id) {
      throw new BadRequestException('Vous ne pouvez pas candidater sur votre propre bien.');
    }

    let candidature;
    try {
      candidature = await this.prisma.candidature.create({
        data: {
          dossierId: dossier.id,
          annonceId: annonce.id,
          statut: StatutCandidature.soumise,
          consentementPartagePieces: dto.consentementPartagePieces,
          consentementLe: dto.consentementPartagePieces ? new Date() : null,
        },
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'P2002') {
        throw new ConflictException('Vous avez déjà candidaté sur cette annonce.');
      }
      throw e;
    }

    await this.audit.enregistrer({
      agenceId: annonce.bien.agenceId,
      utilisateurId: utilisateur.id,
      action: 'candidature.soumission',
      entiteType: 'candidature',
      entiteId: candidature.id,
      donneesApres: {
        annonceId: annonce.id,
        consentementPartagePieces: dto.consentementPartagePieces,
      },
    });

    return candidature;
  }

  /** Retrait volontaire par le candidat. */
  async retirer(id: string, utilisateur: UtilisateurConnecte) {
    const candidature = await this.prisma.candidature.findUnique({
      where: { id },
      include: { dossier: { select: { locataireId: true } }, annonce: { select: { bien: { select: { agenceId: true } } } } },
    });

    const introuvable = new NotFoundException('Candidature introuvable.');
    if (!candidature) throw introuvable;
    if (candidature.dossier.locataireId !== utilisateur.id) throw introuvable;

    if (!CANDIDATURES_ACTIVES.includes(candidature.statut)) {
      throw new ConflictException(`Cette candidature est déjà ${candidature.statut}.`);
    }

    const retiree = await this.prisma.candidature.update({
      where: { id },
      data: { statut: StatutCandidature.retiree },
    });

    await this.audit.enregistrer({
      agenceId: candidature.annonce.bien.agenceId,
      utilisateurId: utilisateur.id,
      action: 'candidature.retrait',
      entiteType: 'candidature',
      entiteId: id,
    });

    return retiree;
  }

  async mesCandidatures(filtres: ListerCandidaturesDto, utilisateur: UtilisateurConnecte) {
    const { page = 1, limite = 20, statut } = filtres;
    const dossier = await this.dossierDe(utilisateur.id);

    const where: Prisma.CandidatureWhereInput = {
      dossierId: dossier.id,
      ...(statut ? { statut } : {}),
    };

    const [total, donnees] = await this.prisma.$transaction([
      this.prisma.candidature.count({ where }),
      this.prisma.candidature.findMany({
        where,
        skip: (page - 1) * limite,
        take: limite,
        orderBy: { createdAt: 'desc' },
        include: {
          annonce: {
            select: {
              titre: true,
              loyerMontant: true,
              bien: { select: { commune: true, quartier: true, typeBien: true } },
            },
          },
          motifRefus: { select: { libelle: true } },
        },
      }),
    ]);

    return { donnees, pagination: { page, limite, total, pages: Math.ceil(total / limite) } };
  }

  /**
   * Candidatures reçues sur une annonce, du point de vue du bailleur.
   * Les pièces ne sont listées que si le candidat a consenti à les partager.
   */
  async candidaturesRecues(annonceId: string, utilisateur: UtilisateurConnecte) {
    const annonce = await this.prisma.annonce.findUnique({
      where: { id: annonceId },
      include: { bien: { select: { agenceId: true, proprietaireId: true } } },
    });

    const introuvable = new NotFoundException('Annonce introuvable.');
    if (!annonce) throw introuvable;
    if (annonce.bien.proprietaireId !== utilisateur.id && !this.estSuperviseur(utilisateur)) {
      throw introuvable;
    }

    const candidatures = await this.prisma.candidature.findMany({
      where: { annonceId },
      orderBy: { createdAt: 'asc' },
      include: {
        dossier: {
          include: {
            locataire: { select: { nomComplet: true, telephone: true } },
            pieces: { select: { id: true, typePiece: true, statut: true } },
          },
        },
        motifRefus: { select: { code: true, libelle: true } },
      },
    });

    return candidatures.map((c) => ({
      id: c.id,
      statut: c.statut,
      createdAt: c.createdAt,
      candidat: c.dossier.locataire.nomComplet,
      // Le téléphone n'est utile qu'une fois la candidature retenue.
      telephone: c.statut === StatutCandidature.acceptee ? c.dossier.locataire.telephone : undefined,
      dossierComplet: c.dossier.statut === StatutDossier.complet,
      consentementPartagePieces: c.consentementPartagePieces,
      consentementLe: c.consentementLe,
      // REQ-DOS-04 : sans consentement, le bailleur voit la candidature mais
      // pas les justificatifs. Il connaît l'existence du dossier, pas son contenu.
      pieces: c.consentementPartagePieces ? c.dossier.pieces : undefined,
      motifRefus: c.motifRefus,
    }));
  }

  /** URL temporaire vers une pièce, sous réserve du consentement du candidat. */
  async urlPiece(candidatureId: string, pieceId: string, utilisateur: UtilisateurConnecte) {
    const candidature = await this.prisma.candidature.findUnique({
      where: { id: candidatureId },
      include: {
        dossier: { select: { id: true, locataireId: true } },
        annonce: { select: { bien: { select: { agenceId: true, proprietaireId: true } } } },
      },
    });

    const introuvable = new NotFoundException('Candidature introuvable.');
    if (!candidature) throw introuvable;

    const estCandidat = candidature.dossier.locataireId === utilisateur.id;
    const estBailleur = candidature.annonce.bien.proprietaireId === utilisateur.id;
    if (!estCandidat && !estBailleur && !this.estSuperviseur(utilisateur)) throw introuvable;

    // Le candidat accède toujours à ses propres pièces ; le bailleur seulement
    // si le consentement a été donné.
    if (!estCandidat && !candidature.consentementPartagePieces) {
      throw new ForbiddenException(
        "Le candidat n'a pas consenti au partage de ses justificatifs.",
      );
    }

    const piece = await this.prisma.dossierPiece.findFirst({
      where: { id: pieceId, dossierId: candidature.dossier.id },
    });
    if (!piece) throw new NotFoundException('Pièce introuvable.');

    const url = await this.stockage.urlPresignee(piece.fichierUrl);

    await this.audit.enregistrer({
      agenceId: candidature.annonce.bien.agenceId,
      utilisateurId: utilisateur.id,
      action: 'candidature.piece.consultation',
      entiteType: 'candidature',
      entiteId: candidatureId,
      donneesApres: { pieceId, typePiece: piece.typePiece },
    });

    return { url, expireDansSecondes: 300 };
  }

  /**
   * Décision du bailleur.
   * L'acceptation est une transaction : réservation du bien, mise en liste
   * d'attente des autres candidats, marquage de la candidature retenue. Un
   * état intermédiaire laisserait un bien disponible avec un candidat accepté.
   */
  async decider(id: string, dto: DecisionCandidatureDto, utilisateur: UtilisateurConnecte) {
    const candidature = await this.prisma.candidature.findUnique({
      where: { id },
      include: {
        dossier: { include: { locataire: { select: { telephone: true, nomComplet: true } } } },
        annonce: {
          select: {
            id: true,
            titre: true,
            bienId: true,
            bien: { select: { agenceId: true, proprietaireId: true, statut: true } },
          },
        },
      },
    });

    const introuvable = new NotFoundException('Candidature introuvable.');
    if (!candidature) throw introuvable;
    if (
      candidature.annonce.bien.proprietaireId !== utilisateur.id &&
      !this.estSuperviseur(utilisateur)
    ) {
      throw introuvable;
    }

    if (!CANDIDATURES_ACTIVES.includes(candidature.statut)) {
      throw new ConflictException(`Cette candidature est déjà ${candidature.statut}.`);
    }

    if (dto.decision === StatutCandidature.refusee) {
      if (!dto.motifRefusCode) {
        throw new BadRequestException('Un motif de refus est obligatoire.');
      }
      const motif = await this.prisma.motifRefus.findUnique({
        where: { code: dto.motifRefusCode },
      });
      if (!motif) {
        throw new BadRequestException(
          "Motif de refus inconnu. Choisissez-en un dans la liste proposée.",
        );
      }
    }

    if (dto.decision === StatutCandidature.acceptee) {
      if (candidature.annonce.bien.statut !== StatutBien.disponible) {
        throw new ConflictException(
          "Ce bien n'est plus disponible : une autre candidature a déjà été retenue.",
        );
      }

      // RG-DOS-A : tout ou rien.
      await this.prisma.$transaction([
        this.prisma.candidature.update({
          where: { id },
          data: {
            statut: StatutCandidature.acceptee,
            decideePar: utilisateur.id,
            decideeLe: new Date(),
            motifRefusCode: null,
          },
        }),
        this.prisma.candidature.updateMany({
          where: {
            annonceId: candidature.annonceId,
            id: { not: id },
            statut: { in: [StatutCandidature.soumise, StatutCandidature.en_examen] },
          },
          data: { statut: StatutCandidature.liste_attente },
        }),
        this.prisma.bien.update({
          where: { id: candidature.annonce.bienId },
          data: { statut: StatutBien.reserve },
        }),
      ]);

      await this.sms.envoyer(
        candidature.dossier.locataire.telephone,
        `Votre candidature pour ${candidature.annonce.titre} a ete acceptee. Le contrat va vous etre transmis.`,
      );
    } else {
      await this.prisma.candidature.update({
        where: { id },
        data: {
          statut: dto.decision,
          motifRefusCode: dto.decision === StatutCandidature.refusee ? dto.motifRefusCode : null,
          decideePar: utilisateur.id,
          decideeLe: new Date(),
        },
      });

      if (dto.decision === StatutCandidature.refusee) {
        await this.sms.envoyer(
          candidature.dossier.locataire.telephone,
          `Votre candidature pour ${candidature.annonce.titre} n'a pas ete retenue. Consultez le motif sur la plateforme.`,
        );
      }
    }

    await this.audit.enregistrer({
      agenceId: candidature.annonce.bien.agenceId,
      utilisateurId: utilisateur.id,
      action: `candidature.decision.${dto.decision}`,
      entiteType: 'candidature',
      entiteId: id,
      donneesAvant: { statut: candidature.statut },
      donneesApres: { statut: dto.decision, motifRefusCode: dto.motifRefusCode },
    });

    return this.prisma.candidature.findUnique({
      where: { id },
      include: { motifRefus: { select: { code: true, libelle: true } } },
    });
  }

  /** Liste fermée des motifs de refus licites, pour les interfaces. */
  async motifsRefus() {
    return this.prisma.motifRefus.findMany({ orderBy: { libelle: 'asc' } });
  }
}
