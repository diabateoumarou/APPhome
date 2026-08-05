/**
 * Envoi de SMS avec bascule automatique entre fournisseurs.
 * Le SMS porte les OTP : une panne de fournisseur bloquerait inscriptions et
 * signatures. D'où le double fournisseur exigé par l'architecture (§5).
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 * Date   : 05 août 2026
 */
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface FournisseurSms {
  readonly nom: string;
  envoyer(destinataire: string, message: string): Promise<void>;
}

/** Fournisseur de développement : trace le message au lieu de l'envoyer. */
class FournisseurConsole implements FournisseurSms {
  readonly nom = 'console';
  private readonly logger = new Logger('SMS/console');

  envoyer(destinataire: string, message: string): Promise<void> {
    this.logger.log(`→ ${destinataire} : ${message}`);
    return Promise.resolve();
  }
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly fournisseurs: FournisseurSms[];

  constructor(private readonly config: ConfigService) {
    // Sprint S1 : fournisseur console. Les adaptateurs réels (Africa's Talking,
    // passerelle Orange CI) s'ajoutent ici sans toucher aux appelants.
    this.fournisseurs = [new FournisseurConsole()];
  }

  /**
   * Tente chaque fournisseur dans l'ordre ; bascule sur le suivant en cas d'échec.
   * Le message n'est jamais journalisé en production (il peut contenir un OTP).
   */
  async envoyer(destinataire: string, message: string): Promise<void> {
    const erreurs: string[] = [];

    for (const fournisseur of this.fournisseurs) {
      try {
        await fournisseur.envoyer(destinataire, message);
        return;
      } catch (e) {
        const motif = e instanceof Error ? e.message : 'erreur inconnue';
        erreurs.push(`${fournisseur.nom} : ${motif}`);
        this.logger.warn(`Échec fournisseur ${fournisseur.nom}, bascule en cours (${motif})`);
      }
    }

    this.logger.error(`Aucun fournisseur SMS disponible — ${erreurs.join(' | ')}`);
    throw new ServiceUnavailableException(
      "L'envoi du SMS a échoué. Réessayez dans quelques instants.",
    );
  }
}
