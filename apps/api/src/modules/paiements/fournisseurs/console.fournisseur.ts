/**
 * Fournisseur de développement — simule un agrégateur sans appel réseau.
 *
 * Permet de dérouler le parcours complet avant que le POC de phase 0 n'ait
 * tranché entre CinetPay et PayDunya. Les transactions restent « en attente »
 * jusqu'à confirmation explicite, ce qui reproduit fidèlement le comportement
 * réel : aucun paiement mobile money n'est instantané.
 *
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 11 août 2026
 */
import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { StatutPaiement } from '@prisma/client';
import type {
  FournisseurPaiement, DemandePaiement, InitiationPaiement,
  EtatPaiement, NotificationPaiement,
} from './fournisseur.interface';

@Injectable()
export class ConsoleFournisseur implements FournisseurPaiement {
  readonly nom = 'console';
  private readonly logger = new Logger('Paiement/console');
  private readonly secret: string;

  constructor(config: ConfigService) {
    const secret = config.get<string>('PSP_WEBHOOK_SECRET');
    // Un secret vide rendrait les notifications falsifiables : n'importe qui
    // pourrait déclarer un loyer payé. L'API refuse donc de démarrer sans lui.
    if (!secret || secret.length < 16) {
      throw new Error(
        'PSP_WEBHOOK_SECRET absent ou trop court (16 caractères minimum) : ' +
        'les notifications de paiement seraient falsifiables.',
      );
    }
    this.secret = secret;
  }

  initier(demande: DemandePaiement): Promise<InitiationPaiement> {
    this.logger.log(
      `Initiation ${demande.referenceInterne} — ${demande.montant} ${demande.devise} ` +
      `via ${demande.moyen} pour ${demande.telephonePayeur}`,
    );

    return Promise.resolve({
      referenceAgregateur: `SIM-${demande.referenceInterne}`,
      urlPaiement: undefined,
      statut: StatutPaiement.en_attente,
    });
  }

  /** En développement, l'état réel n'est pas connu : la réconciliation ne tranche pas. */
  verifier(referenceInterne: string): Promise<EtatPaiement> {
    this.logger.log(`Vérification ${referenceInterne} — état inchangé en simulation`);
    return Promise.resolve({
      referenceAgregateur: `SIM-${referenceInterne}`,
      statut: StatutPaiement.en_attente,
    });
  }

  /**
   * Vérifie la signature HMAC de la notification.
   * La comparaison est faite en temps constant : une comparaison naïve
   * laisserait fuiter la signature attendue par mesure de durée.
   */
  validerNotification(
    corps: Record<string, unknown>,
    signature: string | undefined,
    brut?: Buffer,
  ): NotificationPaiement | null {
    if (!signature) {
      this.logger.warn('Notification sans signature — rejetée');
      return null;
    }

    const attendue = createHmac('sha256', this.secret)
      .update(brut ?? Buffer.from(JSON.stringify(corps)))
      .digest('hex');

    const recue = Buffer.from(signature, 'utf8');
    const calculee = Buffer.from(attendue, 'utf8');
    if (recue.length !== calculee.length || !timingSafeEqual(recue, calculee)) {
      this.logger.warn('Signature de notification invalide — rejetée');
      return null;
    }

    const reference = corps.reference as string | undefined;
    const statut = corps.statut as StatutPaiement | undefined;
    const montant = corps.montant as string | number | undefined;

    if (!reference || !statut || montant === undefined) {
      this.logger.warn('Notification incomplète — rejetée');
      return null;
    }

    return {
      referenceInterne: reference,
      referenceAgregateur: (corps.referenceAgregateur as string) ?? `SIM-${reference}`,
      statut,
      montant: BigInt(montant),
    };
  }
}
