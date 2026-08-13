/**
 * Service Quittances — génération automatique à chaque paiement confirmé.
 *
 * La délivrance de quittance est une obligation du bailleur (art. 3 et 7 du
 * bail). L'automatiser supprime le principal motif de litige sur les loyers
 * payés en espèces : le locataire dispose systématiquement d'une preuve
 * horodatée, sans avoir à la réclamer.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 *          Ingénieur Système & Infrastructure Cloud / System Architect
 *          Expert Solutions ICT (Cloud, Système, Cybersécurité)
 * Date   : 12 août 2026
 */
import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { StatutPaiement, TypeEcheance, RoleUtilisateur } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { StockageService } from '../medias/stockage.service';
import { GabaritService } from '../contrats/gabarit.service';
import { PdfService } from '../contrats/pdf.service';
import type { UtilisateurConnecte } from '../auth/jwt.strategy';

/** Libellés des types d'échéance tels qu'ils apparaissent sur la quittance. */
const LIBELLES: Record<TypeEcheance, string> = {
  loyer: 'Loyer',
  caution: 'Dépôt de garantie',
  avance: 'Avance sur loyer',
  frais_agence: "Frais d'agence",
  charges: 'Charges',
  penalite: 'Pénalité de retard',
};

@Injectable()
export class QuittancesService {
  private readonly logger = new Logger(QuittancesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stockage: StockageService,
    private readonly gabarit: GabaritService,
    private readonly pdf: PdfService,
  ) {}

  private estSuperviseur(utilisateur: UtilisateurConnecte): boolean {
    const roles: RoleUtilisateur[] = [RoleUtilisateur.admin, RoleUtilisateur.agence];
    return utilisateur.roles.some((r) => roles.includes(r as RoleUtilisateur));
  }

  /**
   * Numéro séquentiel par agence, sur l'année.
   * La numérotation continue est une exigence comptable : une quittance
   * manquante dans la série signale un document supprimé.
   */
  private async numeroter(agenceId: string): Promise<string> {
    const annee = new Date().getFullYear();
    const prefixe = `QUI-${annee}-`;

    const compte = await this.prisma.quittance.count({
      where: { agenceId, numero: { startsWith: prefixe } },
    });

    return `${prefixe}${String(compte + 1).padStart(6, '0')}`;
  }

  /**
   * Génère la quittance d'un paiement confirmé.
   * Idempotent : un paiement déjà quittancé ressort sa quittance existante,
   * ce qui évite les doublons lorsqu'une confirmation est rejouée.
   */
  async genererPourPaiement(paiementId: string) {
    const paiement = await this.prisma.paiement.findUnique({
      where: { id: paiementId },
      include: {
        quittance: true,
        payeur: { select: { nomComplet: true, adresse: true } },
        echeances: { include: { echeance: true } },
        contrat: {
          include: {
            bien: { select: { adresse: true, commune: true, quartier: true, typeBien: true } },
            bailleur: { select: { nomComplet: true, adresse: true } },
            locataire: { select: { nomComplet: true, adresse: true } },
          },
        },
      },
    });

    if (!paiement) throw new NotFoundException('Paiement introuvable.');
    if (paiement.quittance) return paiement.quittance;

    if (paiement.statut !== StatutPaiement.confirme) {
      throw new ConflictException(
        "Une quittance ne peut être délivrée que sur un paiement confirmé.",
      );
    }
    if (!paiement.contrat) {
      throw new ConflictException("Ce paiement n'est rattaché à aucun contrat.");
    }

    const contrat = paiement.contrat;
    const numero = await this.numeroter(contrat.agenceId);

    const lignes = paiement.echeances
      .map((v) => {
        const periode = v.echeance.periode
          ? ` — ${v.echeance.periode.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`
          : '';
        return `<tr><td>${LIBELLES[v.echeance.type]}${periode}</td>` +
          `<td style="text-align:right">${this.gabarit.formaterMontant(v.montantAffecte)} FCFA</td></tr>`;
      })
      .join('');

    const html = `
      <h1>QUITTANCE DE LOYER</h1>
      <p class="sous-titre">Délivrée en application de l'article 3 du contrat de bail</p>
      <p class="ref">N° ${numero} • Bail ${contrat.reference} • ${this.gabarit.formaterDate(new Date())}</p>

      <h2>Parties</h2>
      <p><strong>Bailleur :</strong> ${contrat.bailleur.nomComplet}
         ${contrat.bailleur.adresse ? `— ${contrat.bailleur.adresse}` : ''}</p>
      <p><strong>Locataire :</strong> ${contrat.locataire.nomComplet}
         ${contrat.locataire.adresse ? `— ${contrat.locataire.adresse}` : ''}</p>

      <h2>Logement</h2>
      <p>${contrat.bien.adresse}, ${contrat.bien.commune}${contrat.bien.quartier ? ` — ${contrat.bien.quartier}` : ''}</p>

      <h2>Détail du règlement</h2>
      <table style="width:100%;border-collapse:collapse">
        ${lignes}
        <tr><td><strong>Total réglé</strong></td>
            <td style="text-align:right"><strong>${this.gabarit.formaterMontant(paiement.montant)} FCFA</strong></td></tr>
      </table>
      <p>Soit ${this.gabarit.montantEnLettres(paiement.montant)} francs CFA,
         réglés le ${this.gabarit.formaterDate(paiement.updatedAt)}
         par ${paiement.moyen.replace(/_/g, ' ')}.</p>

      <p>Le bailleur reconnaît avoir reçu la somme ci-dessus et en donne quittance
         au locataire, sous réserve de tous ses droits.</p>

      <p class="ref" style="margin-top:24pt">
        Référence de transaction : ${paiement.referenceInterne}<br>
        Document généré automatiquement par la plateforme — aucune signature manuscrite requise.
      </p>`;

    const document = await this.pdf.depuisHtml(html, numero);
    const cle = this.stockage.construireCle(`quittances/${contrat.agenceId}`, 'pdf');
    await this.stockage.televerser(cle, document, 'application/pdf', 'prive');

    const quittance = await this.prisma.quittance.create({
      data: {
        paiementId: paiement.id,
        contratId: contrat.id,
        agenceId: contrat.agenceId,
        numero,
        pdfUrl: cle,
      },
    });

    await this.audit.enregistrer({
      agenceId: contrat.agenceId,
      utilisateurId: paiement.payeurId,
      action: 'quittance.generation',
      entiteType: 'quittance',
      entiteId: quittance.id,
      donneesApres: { numero, montant: paiement.montant.toString() },
    });

    this.logger.log(`Quittance ${numero} générée pour le paiement ${paiement.referenceInterne}`);
    return quittance;
  }

  /** URL temporaire vers le PDF, réservée aux parties au contrat. */
  async urlQuittance(id: string, utilisateur: UtilisateurConnecte) {
    const quittance = await this.prisma.quittance.findUnique({
      where: { id },
      include: {
        contrat: { select: { bailleurId: true, locataireId: true } },
      },
    });

    const introuvable = new NotFoundException('Quittance introuvable.');
    if (!quittance) throw introuvable;

    const partie =
      quittance.contrat.bailleurId === utilisateur.id ||
      quittance.contrat.locataireId === utilisateur.id;
    if (!partie && !this.estSuperviseur(utilisateur)) throw introuvable;

    const url = await this.stockage.urlPresignee(quittance.pdfUrl);

    await this.audit.enregistrer({
      agenceId: quittance.agenceId,
      utilisateurId: utilisateur.id,
      action: 'quittance.consultation',
      entiteType: 'quittance',
      entiteId: id,
    });

    return { url, numero: quittance.numero, expireDansSecondes: 300 };
  }

  /** Quittances d'un contrat, du plus récent au plus ancien. */
  async listerParContrat(contratId: string, utilisateur: UtilisateurConnecte) {
    const contrat = await this.prisma.contrat.findUnique({
      where: { id: contratId },
      select: { bailleurId: true, locataireId: true },
    });

    const introuvable = new NotFoundException('Contrat introuvable.');
    if (!contrat) throw introuvable;

    const partie =
      contrat.bailleurId === utilisateur.id || contrat.locataireId === utilisateur.id;
    if (!partie && !this.estSuperviseur(utilisateur)) throw introuvable;

    return this.prisma.quittance.findMany({
      where: { contratId },
      orderBy: { genereeLe: 'desc' },
      select: {
        id: true,
        numero: true,
        genereeLe: true,
        paiement: { select: { montant: true, moyen: true, referenceInterne: true } },
      },
    });
  }
}
