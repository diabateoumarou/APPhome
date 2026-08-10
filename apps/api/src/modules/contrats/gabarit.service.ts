/**
 * Rendu du gabarit de contrat — substitution des variables {{...}}.
 *
 * Le gabarit est celui du modèle de bail établi lors du cadrage : les noms de
 * variables font contrat d'interface entre le document juridique et le schéma
 * de données. Toute variable non substituée est signalée plutôt que laissée
 * telle quelle : un bail comportant « {{loyer_montant}} » serait inexploitable
 * et, s'il était signé, contestable.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 *          Ingénieur Système & Infrastructure Cloud / System Architect
 *          Expert Solutions ICT (Cloud, Système, Cybersécurité)
 * Date   : 10 août 2026
 */
import { Injectable, InternalServerErrorException } from '@nestjs/common';

@Injectable()
export class GabaritService {
  /** Échappe le HTML : une adresse contenant « & » ou « < » casserait le rendu. */
  private echapper(valeur: string): string {
    return valeur
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Formate un montant en FCFA avec séparateurs de milliers.
   * Les montants sont des BigInt : les convertir en Number ferait perdre la
   * précision au-delà de 2^53, ce qui est atteignable sur un prix de vente.
   */
  formaterMontant(montant: bigint): string {
    const chiffres = montant.toString();
    const groupes: string[] = [];
    for (let i = chiffres.length; i > 0; i -= 3) {
      groupes.unshift(chiffres.slice(Math.max(0, i - 3), i));
    }
    return groupes.join(' ');
  }

  /** Convertit un montant en toutes lettres, exigence de forme des actes. */
  montantEnLettres(montant: bigint): string {
    const unites = [
      '', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
      'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
      'dix-sept', 'dix-huit', 'dix-neuf',
    ];
    const dizaines = [
      '', '', 'vingt', 'trente', 'quarante', 'cinquante',
      'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt',
    ];

    // `suivi` indique qu'un multiplicateur suit (mille, million…) : « cent »
    // et « vingt » restent alors invariables — « trois cent mille », non
    // « trois cents mille ».
    const sousMille = (n: number, suivi = false): string => {
      if (n === 0) return '';
      if (n < 20) return unites[n];
      if (n < 100) {
        const d = Math.floor(n / 10);
        const u = n % 10;
        // Le français a des irrégularités à 70 et 90 : on compose sur dix-sept, etc.
        if (d === 7 || d === 9) {
          const base = dizaines[d];
          return u === 0 ? `${base}-dix` : `${base}-${unites[10 + u]}`;
        }
        if (u === 0) return d === 8 && !suivi ? 'quatre-vingts' : dizaines[d];
        if (u === 1 && d !== 8) return `${dizaines[d]} et un`;
        return `${dizaines[d]}-${unites[u]}`;
      }
      const c = Math.floor(n / 100);
      const reste = n % 100;
      const prefixe = c === 1 ? 'cent' : `${unites[c]} cent${reste === 0 && !suivi ? 's' : ''}`;
      return reste === 0 ? prefixe : `${prefixe} ${sousMille(reste)}`;
    };

    if (montant === 0n) return 'zéro';

    const paliers: Array<[bigint, string, string]> = [
      [1_000_000_000n, 'milliard', 'milliards'],
      [1_000_000n, 'million', 'millions'],
      [1_000n, 'mille', 'mille'],
    ];

    let reste = montant;
    const parties: string[] = [];

    for (const [valeur, singulier, pluriel] of paliers) {
      const quotient = reste / valeur;
      if (quotient > 0n) {
        const nombre = Number(quotient);
        // « mille » est invariable et ne prend pas « un » devant.
        if (singulier === 'mille' && nombre === 1) {
          parties.push('mille');
        } else {
          parties.push(`${sousMille(nombre, true)} ${nombre > 1 ? pluriel : singulier}`);
        }
        reste %= valeur;
      }
    }

    const unitesFinales = Number(reste);
    if (unitesFinales > 0) parties.push(sousMille(unitesFinales));

    return parties.join(' ').replace(/\s+/g, ' ').trim();
  }

  formaterDate(date: Date | null | undefined): string {
    if (!date) return '—';
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  /**
   * Substitue les variables du gabarit.
   * Une variable manquante est une erreur bloquante : mieux vaut refuser de
   * générer le contrat que produire un document juridiquement bancal.
   */
  rendre(gabarit: string, variables: Record<string, string>): string {
    const rendu = gabarit.replace(/\{\{(\w+)\}\}/g, (_correspondance, nom: string) => {
      const valeur = variables[nom];
      if (valeur === undefined) return `{{${nom}}}`;
      return this.echapper(valeur);
    });

    const restantes = [...rendu.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    if (restantes.length) {
      throw new InternalServerErrorException(
        `Variables non renseignées dans le contrat : ${[...new Set(restantes)].join(', ')}`,
      );
    }

    return rendu;
  }
}
