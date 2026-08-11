/**
 * Contrat d'interface avec un agrégateur de paiement.
 *
 * L'agrégateur est volontairement abstrait : le choix entre CinetPay et
 * PayDunya sera tranché par le POC de la phase 0, et l'architecture prévoit un
 * second agrégateur en V1 avec bascule par drapeau. Aucune logique métier ne
 * doit donc connaître le fournisseur retenu.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 *          Ingénieur Système & Infrastructure Cloud / System Architect
 *          Expert Solutions ICT (Cloud, Système, Cybersécurité)
 * Date   : 11 août 2026
 */
import { MoyenPaiement, StatutPaiement } from '@prisma/client';

/** Demande d'encaissement transmise à l'agrégateur. */
export interface DemandePaiement {
  /** Référence interne : clé d'idempotence, jamais réutilisée. */
  referenceInterne: string;
  montant: bigint;
  devise: string;
  moyen: MoyenPaiement;
  telephonePayeur: string;
  nomPayeur: string;
  description: string;
  urlRetour: string;
  urlNotification: string;
}

/** Réponse d'initiation : l'utilisateur est redirigé ou reçoit une invite USSD. */
export interface InitiationPaiement {
  referenceAgregateur: string;
  /** URL de paiement, ou undefined si l'opérateur pousse directement l'invite. */
  urlPaiement?: string;
  statut: StatutPaiement;
}

/** État renvoyé par la vérification active auprès du fournisseur. */
export interface EtatPaiement {
  referenceAgregateur: string | null;
  statut: StatutPaiement;
  montant?: bigint;
  motifEchec?: string;
}

/** Contenu d'une notification entrante, après vérification de signature. */
export interface NotificationPaiement {
  referenceInterne: string;
  referenceAgregateur: string;
  statut: StatutPaiement;
  montant: bigint;
}

export interface FournisseurPaiement {
  readonly nom: string;

  initier(demande: DemandePaiement): Promise<InitiationPaiement>;

  /**
   * Interroge l'agrégateur sur l'état réel d'une transaction.
   * C'est le filet de sécurité du système : les notifications entrantes se
   * perdent régulièrement chez les opérateurs mobile money, et un paiement
   * encaissé mais non crédité est le pire des défauts pour un locataire.
   */
  verifier(referenceInterne: string): Promise<EtatPaiement>;

  /**
   * Valide l'authenticité d'une notification entrante.
   * Sans cette vérification, n'importe qui pourrait déclarer un loyer payé.
   */
  validerNotification(
    corps: Record<string, unknown>,
    signature: string | undefined,
    brut?: Buffer,
  ): NotificationPaiement | null;
}

/** Jeton d'injection — l'implémentation est choisie par configuration. */
export const FOURNISSEUR_PAIEMENT = Symbol('FOURNISSEUR_PAIEMENT');
