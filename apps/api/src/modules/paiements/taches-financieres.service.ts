/**
 * Tâches planifiées du domaine financier.
 *
 * Trois traitements quotidiens :
 *  - REQ-PAY-05 : réconciliation des paiements sans notification.
 *  - REQ-PAY-06 : passage des échéances en retard après le délai de tolérance.
 *  - REQ-PAY-06 : relances graduées, du rappel amiable à la mise en demeure.
 *
 * Chaque traitement est indépendant et tolère l'échec des autres : un incident
 * sur les relances ne doit pas empêcher la réconciliation, qui est le
 * mécanisme protégeant les locataires d'un loyer débité mais non crédité.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 *          Ingénieur Système & Infrastructure Cloud / System Architect
 *          Expert Solutions ICT (Cloud, Système, Cybersécurité)
 * Date   : 12 août 2026
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StatutEcheance, StatutContrat, TypeEcheance } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { SmsService } from '../notifications/sms.service';
import { PaiementsService } from './paiements.service';
import { GabaritService } from '../contrats/gabarit.service';

/** Paliers de relance, en jours de retard. */
const PALIERS_RELANCE = [
  { niveau: 1, jours: 1, canal: 'rappel' },
  { niveau: 2, jours: 7, canal: 'relance' },
  { niveau: 3, jours: 15, canal: 'mise_en_demeure' },
] as const;

/** Nombre de jours avant échéance déclenchant l'avis de prélèvement à venir. */
const PREAVIS_ECHEANCE_JOURS = 5;

@Injectable()
export class TachesFinancieresService {
  private readonly logger = new Logger(TachesFinancieresService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sms: SmsService,
    private readonly paiements: PaiementsService,
    private readonly gabarit: GabaritService,
  ) {}

  /**
   * Réconciliation — toutes les 30 minutes.
   * Fréquence volontairement élevée : un locataire qui a payé ne doit pas
   * attendre le lendemain pour voir son loyer crédité.
   */
  @Cron(CronExpression.EVERY_30_MINUTES, { name: 'reconciliation-paiements' })
  async reconcilier(): Promise<void> {
    try {
      const bilan = await this.paiements.reconcilier();
      if (bilan.confirmes || bilan.echoues) {
        await this.audit.enregistrer({
          action: 'paiement.reconciliation.lot',
          entiteType: 'paiement',
          donneesApres: bilan,
        });
      }
    } catch (e) {
      const motif = e instanceof Error ? e.message : 'erreur inconnue';
      this.logger.error(`Réconciliation interrompue : ${motif}`);
    }
  }

  /**
   * Passage des échéances en retard — chaque nuit.
   * Le délai de tolérance est propre à chaque contrat (art. 12 du bail) :
   * un bailleur peut accorder plus de souplesse que le défaut de 5 jours.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM, { name: 'echeances-en-retard' })
  async marquerRetards(): Promise<{ dues: number; enRetard: number }> {
    const aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);

    let dues = 0;
    let enRetard = 0;

    try {
      // Les échéances à venir dont la date est atteinte deviennent dues.
      const passageDues = await this.prisma.echeance.updateMany({
        where: {
          statut: StatutEcheance.a_venir,
          dateEcheance: { lte: aujourdhui },
          contrat: { statut: { in: [StatutContrat.actif, StatutContrat.en_preavis] } },
        },
        data: { statut: StatutEcheance.due },
      });
      dues = passageDues.count;

      // Le passage en retard dépend du délai de tolérance du contrat, qui
      // varie : le traitement se fait donc contrat par contrat.
      const contrats = await this.prisma.contrat.findMany({
        where: { statut: { in: [StatutContrat.actif, StatutContrat.en_preavis] } },
        select: { id: true, joursTolerance: true },
      });

      for (const contrat of contrats) {
        const limite = new Date(aujourdhui);
        limite.setDate(limite.getDate() - contrat.joursTolerance);

        const passage = await this.prisma.echeance.updateMany({
          where: {
            contratId: contrat.id,
            statut: { in: [StatutEcheance.due, StatutEcheance.partielle] },
            dateEcheance: { lt: limite },
          },
          data: { statut: StatutEcheance.en_retard },
        });
        enRetard += passage.count;
      }

      if (dues || enRetard) {
        this.logger.log(`Échéances : ${dues} dues, ${enRetard} passées en retard`);
      }
    } catch (e) {
      const motif = e instanceof Error ? e.message : 'erreur inconnue';
      this.logger.error(`Marquage des retards interrompu : ${motif}`);
    }

    return { dues, enRetard };
  }

  /**
   * Avis de prélèvement à venir — chaque matin.
   * Prévenir cinq jours avant laisse au locataire le temps d'approvisionner
   * son compte mobile money, ce qui améliore le taux de recouvrement à
   * l'échéance sans rien coûter.
   */
  @Cron(CronExpression.EVERY_DAY_AT_8AM, { name: 'avis-echeance' })
  async avertirEcheancesProches(): Promise<{ avis: number }> {
    const cible = new Date();
    cible.setDate(cible.getDate() + PREAVIS_ECHEANCE_JOURS);
    cible.setHours(0, 0, 0, 0);
    const lendemain = new Date(cible);
    lendemain.setDate(lendemain.getDate() + 1);

    let avis = 0;

    try {
      const echeances = await this.prisma.echeance.findMany({
        where: {
          statut: StatutEcheance.a_venir,
          type: TypeEcheance.loyer,
          dateEcheance: { gte: cible, lt: lendemain },
          contrat: { statut: StatutContrat.actif },
        },
        include: {
          contrat: {
            select: { reference: true, locataire: { select: { telephone: true } } },
          },
        },
      });

      for (const echeance of echeances) {
        const restant = echeance.montantDu - echeance.montantPaye;
        if (restant <= 0n) continue;

        await this.sms.envoyer(
          echeance.contrat.locataire.telephone,
          `Rappel : loyer de ${this.gabarit.formaterMontant(restant)} FCFA a regler avant le ` +
          `${echeance.dateEcheance.toLocaleDateString('fr-FR')} (bail ${echeance.contrat.reference}).`,
        );
        avis++;
      }
    } catch (e) {
      const motif = e instanceof Error ? e.message : 'erreur inconnue';
      this.logger.error(`Avis d'échéance interrompus : ${motif}`);
    }

    return { avis };
  }

  /**
   * Relances graduées sur impayés — chaque matin.
   * La gradation est volontaire : un rappel le lendemain suffit dans la
   * plupart des cas, et réserver la mise en demeure au quinzième jour évite
   * de dégrader la relation pour un simple oubli.
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM, { name: 'relances-impayes' })
  async relancerImpayes(): Promise<{ relances: number }> {
    let relances = 0;

    try {
      const impayees = await this.prisma.echeance.findMany({
        where: {
          statut: { in: [StatutEcheance.en_retard, StatutEcheance.partielle] },
          contrat: { statut: { in: [StatutContrat.actif, StatutContrat.en_preavis] } },
        },
        include: {
          contrat: {
            select: {
              reference: true,
              agenceId: true,
              locataire: { select: { telephone: true, nomComplet: true } },
              bailleur: { select: { telephone: true } },
            },
          },
        },
        take: 500,
      });

      const maintenant = Date.now();

      for (const echeance of impayees) {
        const restant = echeance.montantDu - echeance.montantPaye;
        if (restant <= 0n) continue;

        const joursRetard = Math.floor(
          (maintenant - echeance.dateEcheance.getTime()) / 86_400_000,
        );

        // Palier le plus élevé atteint, non encore notifié.
        const palier = [...PALIERS_RELANCE]
          .reverse()
          .find((p) => joursRetard >= p.jours && echeance.relanceNiveau < p.niveau);
        if (!palier) continue;

        const montant = this.gabarit.formaterMontant(restant);
        const message =
          palier.niveau === 1
            ? `Votre loyer de ${montant} FCFA (bail ${echeance.contrat.reference}) est arrive a echeance. Reglez-le sur la plateforme.`
            : palier.niveau === 2
              ? `Rappel : ${montant} FCFA restent dus depuis ${joursRetard} jours (bail ${echeance.contrat.reference}).`
              : `Mise en demeure : ${montant} FCFA impayes depuis ${joursRetard} jours (bail ${echeance.contrat.reference}). Regularisez sans delai.`;

        await this.sms.envoyer(echeance.contrat.locataire.telephone, message);

        // Le bailleur est informé au stade de la mise en demeure : c'est à ce
        // moment qu'une décision lui revient (échelonnement, procédure).
        if (palier.niveau === 3) {
          await this.sms.envoyer(
            echeance.contrat.bailleur.telephone,
            `Impaye de ${montant} FCFA depuis ${joursRetard} jours sur le bail ${echeance.contrat.reference}.`,
          );
        }

        await this.prisma.echeance.update({
          where: { id: echeance.id },
          data: { relanceNiveau: palier.niveau, derniereRelanceLe: new Date() },
        });

        await this.audit.enregistrer({
          agenceId: echeance.contrat.agenceId,
          action: `paiement.relance.${palier.canal}`,
          entiteType: 'echeance',
          entiteId: echeance.id,
          donneesApres: { niveau: palier.niveau, joursRetard, restant: restant.toString() },
        });

        relances++;
      }

      if (relances) this.logger.log(`${relances} relance(s) envoyée(s)`);
    } catch (e) {
      const motif = e instanceof Error ? e.message : 'erreur inconnue';
      this.logger.error(`Relances interrompues : ${motif}`);
    }

    return { relances };
  }
}
