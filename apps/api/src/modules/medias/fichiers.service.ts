/**
 * Validation et traitement des fichiers téléversés.
 *
 * Principe directeur : ne jamais faire confiance au client. L'extension du
 * fichier et l'en-tête Content-Type sont fournis par l'appelant et peuvent
 * mentir ; seuls les premiers octets du fichier (nombre magique) font foi.
 * Un exécutable renommé en .jpg est ainsi rejeté avant tout traitement.
 *
 * Les images sont systématiquement réencodées par Sharp, ce qui a un effet de
 * bord précieux : toute charge utile dissimulée dans les métadonnées EXIF ou
 * après les octets d'image disparaît. Les données GPS des photos prises au
 * téléphone sont également supprimées — un bailleur ne doit pas exposer sans
 * le savoir les coordonnées exactes de son domicile.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 *          Ingénieur Système & Infrastructure Cloud / System Architect
 *          Expert Solutions ICT (Cloud, Système, Cybersécurité)
 * Date   : 09 août 2026
 */
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import sharp from 'sharp';

export interface ImageTraitee {
  principale: Buffer;
  vignette: Buffer;
  largeur: number;
  hauteur: number;
  typeMime: string;
  extension: string;
}

/** Taille maximale acceptée à l'entrée (avant compression). */
export const TAILLE_MAX_IMAGE = 10 * 1024 * 1024; // 10 Mo
export const TAILLE_MAX_DOCUMENT = 15 * 1024 * 1024; // 15 Mo

/** Dimensions cibles : suffisantes pour un grand écran, légères en 3G. */
const LARGEUR_MAX = 1920;
const LARGEUR_VIGNETTE = 400;
const QUALITE_WEBP = 82;

/** Nombres magiques — les premiers octets qui identifient réellement un format. */
const SIGNATURES: Array<{ typeMime: string; octets: number[]; decalage: number }> = [
  { typeMime: 'image/jpeg', octets: [0xff, 0xd8, 0xff], decalage: 0 },
  { typeMime: 'image/png', octets: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], decalage: 0 },
  { typeMime: 'image/webp', octets: [0x52, 0x49, 0x46, 0x46], decalage: 0 }, // "RIFF"
  { typeMime: 'image/heic', octets: [0x66, 0x74, 0x79, 0x70], decalage: 4 }, // "ftyp"
  { typeMime: 'application/pdf', octets: [0x25, 0x50, 0x44, 0x46], decalage: 0 }, // "%PDF"
];

@Injectable()
export class FichiersService {
  private readonly logger = new Logger(FichiersService.name);

  /** Identifie le type réel d'un fichier par ses octets d'en-tête. */
  private detecterType(contenu: Buffer): string | null {
    for (const sig of SIGNATURES) {
      const extrait = contenu.subarray(sig.decalage, sig.decalage + sig.octets.length);
      if (extrait.length === sig.octets.length && sig.octets.every((o, i) => extrait[i] === o)) {
        // WebP exige une seconde vérification : "RIFF" sert aussi aux fichiers audio.
        if (sig.typeMime === 'image/webp') {
          const marque = contenu.subarray(8, 12).toString('ascii');
          if (marque !== 'WEBP') continue;
        }
        return sig.typeMime;
      }
    }
    return null;
  }

  /**
   * Valide et normalise une image.
   * Sortie systématiquement en WebP : meilleure compression que JPEG à qualité
   * équivalente, ce qui compte sur des réseaux mobiles facturés au volume.
   */
  async traiterImage(contenu: Buffer, tailleAnnoncee: number): Promise<ImageTraitee> {
    if (tailleAnnoncee > TAILLE_MAX_IMAGE) {
      throw new BadRequestException(
        `Image trop volumineuse (maximum ${TAILLE_MAX_IMAGE / 1024 / 1024} Mo).`,
      );
    }

    const typeReel = this.detecterType(contenu);
    if (!typeReel || !typeReel.startsWith('image/')) {
      throw new BadRequestException(
        'Fichier non reconnu comme image. Formats acceptés : JPEG, PNG, WebP, HEIC.',
      );
    }

    try {
      const source = sharp(contenu, { failOn: 'error' });
      const metadonnees = await source.metadata();

      if (!metadonnees.width || !metadonnees.height) {
        throw new BadRequestException('Image illisible ou corrompue.');
      }
      // Une image de 30 000 px de côté épuiserait la mémoire au redimensionnement.
      if (metadonnees.width > 20000 || metadonnees.height > 20000) {
        throw new BadRequestException('Dimensions d’image excessives.');
      }

      // rotate() sans argument applique l'orientation EXIF puis la supprime :
      // les photos prises au téléphone restent droites, sans métadonnée résiduelle.
      const principale = await sharp(contenu)
        .rotate()
        .resize({ width: LARGEUR_MAX, withoutEnlargement: true })
        .webp({ quality: QUALITE_WEBP })
        .toBuffer();

      const vignette = await sharp(contenu)
        .rotate()
        .resize({ width: LARGEUR_VIGNETTE, withoutEnlargement: true })
        .webp({ quality: 70 })
        .toBuffer();

      const finales = await sharp(principale).metadata();

      return {
        principale,
        vignette,
        largeur: finales.width ?? metadonnees.width,
        hauteur: finales.height ?? metadonnees.height,
        typeMime: 'image/webp',
        extension: 'webp',
      };
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      const motif = e instanceof Error ? e.message : 'erreur inconnue';
      this.logger.warn(`Traitement d'image échoué : ${motif}`);
      throw new BadRequestException("Cette image n'a pas pu être traitée.");
    }
  }

  /**
   * Valide un document justificatif (PDF ou photo de pièce).
   * Les PDF ne sont pas réécrits : altérer un titre de propriété ou une pièce
   * d'identité compromettrait sa valeur probante. Le contrôle porte donc sur
   * le type réel et la taille, et le fichier est stocké tel quel, chiffré.
   */
  validerDocument(contenu: Buffer, tailleAnnoncee: number): { typeMime: string; extension: string } {
    if (tailleAnnoncee > TAILLE_MAX_DOCUMENT) {
      throw new BadRequestException(
        `Document trop volumineux (maximum ${TAILLE_MAX_DOCUMENT / 1024 / 1024} Mo).`,
      );
    }

    const typeReel = this.detecterType(contenu);
    if (!typeReel) {
      throw new BadRequestException('Format non reconnu. Formats acceptés : PDF, JPEG, PNG.');
    }

    const acceptes: Record<string, string> = {
      'application/pdf': 'pdf',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/heic': 'heic',
    };

    const extension = acceptes[typeReel];
    if (!extension) {
      throw new BadRequestException('Format non accepté. Formats acceptés : PDF, JPEG, PNG.');
    }

    return { typeMime: typeReel, extension };
  }
}
