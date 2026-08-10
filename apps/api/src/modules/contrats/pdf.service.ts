/**
 * Génération PDF via Gotenberg.
 *
 * Le rendu est délégué à un conteneur dédié plutôt qu'embarqué dans l'API :
 * Chromium headless consomme beaucoup de mémoire et se comporte mal sous
 * charge. L'isoler protège l'API d'un pic de génération documentaire.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 *          Ingénieur Système & Infrastructure Cloud / System Architect
 *          Expert Solutions ICT (Cloud, Système, Cybersécurité)
 * Date   : 10 août 2026
 */
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

/** Feuille de style commune aux documents générés (contrats, quittances). */
const STYLE_DOCUMENT = `
  @page { size: A4; margin: 2cm 2cm 2.5cm 2cm; }
  body { font-family: "Liberation Serif", Georgia, serif; font-size: 11pt; line-height: 1.5; color: #1a1a1a; }
  h1 { font-size: 16pt; text-align: center; margin-bottom: 4pt; }
  h2 { font-size: 12pt; margin-top: 16pt; margin-bottom: 6pt; border-bottom: 1px solid #999; padding-bottom: 2pt; }
  p { margin: 6pt 0; text-align: justify; }
  .sous-titre { text-align: center; font-style: italic; font-size: 9pt; color: #555; margin-top: 0; }
  .ref { text-align: center; font-size: 9pt; color: #555; margin-bottom: 18pt; }
  .signatures { margin-top: 24pt; font-size: 10pt; }
  strong { font-weight: bold; }
`;

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);
  private readonly urlGotenberg: string;

  constructor(config: ConfigService) {
    this.urlGotenberg = (config.get<string>('GOTENBERG_URL') ?? 'http://localhost:3001').replace(
      /\/$/,
      '',
    );
  }

  /** Convertit un document HTML en PDF. */
  async depuisHtml(html: string, titre: string): Promise<Buffer> {
    const document = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>${titre}</title>
<style>${STYLE_DOCUMENT}</style></head><body>${html}</body></html>`;

    const formulaire = new FormData();
    formulaire.append('files', new Blob([document], { type: 'text/html' }), 'index.html');
    formulaire.append('paperWidth', '8.27');
    formulaire.append('paperHeight', '11.7');
    formulaire.append('marginTop', '0.8');
    formulaire.append('marginBottom', '0.8');

    try {
      const reponse = await fetch(`${this.urlGotenberg}/forms/chromium/convert/html`, {
        method: 'POST',
        body: formulaire,
      });

      if (!reponse.ok) {
        throw new Error(`Gotenberg a répondu ${reponse.status}`);
      }

      return Buffer.from(await reponse.arrayBuffer());
    } catch (e) {
      const motif = e instanceof Error ? e.message : 'erreur inconnue';
      this.logger.error(`Génération PDF échouée (${titre}) : ${motif}`);
      throw new ServiceUnavailableException(
        'La génération du document est momentanément indisponible. Réessayez dans quelques instants.',
      );
    }
  }

  /**
   * Empreinte SHA-256 du document.
   * C'est elle qui fait preuve : le procès-verbal de signature enregistre
   * l'empreinte du document au moment exact de la signature, ce qui permet
   * de démontrer qu'il n'a pas été modifié depuis (art. 14 du bail).
   */
  empreinte(contenu: Buffer): string {
    return createHash('sha256').update(contenu).digest('hex');
  }
}
