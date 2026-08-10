/**
 * Tests unitaires de la validation des fichiers.
 *
 * Ce service est un point d'entrée exposé : il reçoit des octets fournis par
 * l'utilisateur. Les tests portent donc en priorité sur les tentatives de
 * contournement — extension mensongère, format inconnu déguisé, dépassement
 * de taille — plutôt que sur le seul chemin nominal.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 * Date   : 10 août 2026
 */
import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import {
  FichiersService,
  TAILLE_MAX_IMAGE,
  TAILLE_MAX_DOCUMENT,
} from '../../apps/api/src/modules/medias/fichiers.service';

describe('FichiersService', () => {
  let service: FichiersService;

  /** Fabrique une vraie image encodée, seule façon de tester Sharp honnêtement. */
  const creerImage = (largeur: number, hauteur: number, format: 'jpeg' | 'png' = 'jpeg') =>
    sharp({
      create: { width: largeur, height: hauteur, channels: 3, background: { r: 80, g: 120, b: 170 } },
    })
      [format]()
      .toBuffer();

  beforeEach(() => {
    service = new FichiersService();
  });

  describe('détection du type réel', () => {
    it('rejette un fichier texte présenté comme image', async () => {
      const texte = Buffer.from("Ceci n'est pas une image, quelle que soit son extension.");
      await expect(service.traiterImage(texte, texte.length)).rejects.toThrow(
        /non reconnu comme image/,
      );
    });

    it('rejette un exécutable ELF déguisé', async () => {
      const elf = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(500)]);
      await expect(service.traiterImage(elf, elf.length)).rejects.toThrow(BadRequestException);
    });

    it('rejette un fichier RIFF audio, malgré la signature partagée avec WebP', () => {
      // "RIFF" + taille + "WAVE" : mêmes 4 premiers octets qu'un WebP.
      const wav = Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.from([0x24, 0x00, 0x00, 0x00]),
        Buffer.from('WAVE'),
        Buffer.alloc(100),
      ]);
      expect(() => service.validerDocument(wav, wav.length)).toThrow(BadRequestException);
    });

    it('accepte un WebP authentique', () => {
      const webp = Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.from([0x24, 0x00, 0x00, 0x00]),
        Buffer.from('WEBP'),
        Buffer.alloc(100),
      ]);
      expect(service.validerDocument(webp, webp.length)).toEqual({
        typeMime: 'image/webp',
        extension: 'webp',
      });
    });

    it('rejette un fichier vide', async () => {
      const vide = Buffer.alloc(0);
      await expect(service.traiterImage(vide, 0)).rejects.toThrow(BadRequestException);
    });
  });

  describe('plafonds de taille', () => {
    it("refuse une image au-delà du plafond, avant tout décodage", async () => {
      const petit = await creerImage(10, 10);
      // La taille annoncée fait foi : le contrôle intervient avant Sharp.
      await expect(service.traiterImage(petit, TAILLE_MAX_IMAGE + 1)).rejects.toThrow(
        /trop volumineuse/,
      );
    });

    it('refuse un document au-delà du plafond', () => {
      const pdf = Buffer.concat([Buffer.from('%PDF-1.4'), Buffer.alloc(100)]);
      expect(() => service.validerDocument(pdf, TAILLE_MAX_DOCUMENT + 1)).toThrow(
        /trop volumineux/,
      );
    });
  });

  describe('traitement des images', () => {
    it('redimensionne au-delà de 1920 px de large', async () => {
      const grande = await creerImage(3000, 2000);
      const traitee = await service.traiterImage(grande, grande.length);

      expect(traitee.largeur).toBe(1920);
      expect(traitee.hauteur).toBe(1280);
    });

    it("n'agrandit jamais une image plus petite que la cible", async () => {
      const petite = await creerImage(800, 600);
      const traitee = await service.traiterImage(petite, petite.length);

      expect(traitee.largeur).toBe(800);
      expect(traitee.hauteur).toBe(600);
    });

    it('convertit systématiquement en WebP', async () => {
      const png = await creerImage(1000, 800, 'png');
      const traitee = await service.traiterImage(png, png.length);

      expect(traitee.typeMime).toBe('image/webp');
      expect(traitee.extension).toBe('webp');
      // Signature WebP dans le tampon produit.
      expect(traitee.principale.subarray(8, 12).toString('ascii')).toBe('WEBP');
    });

    it('génère une vignette plus légère que la principale', async () => {
      const grande = await creerImage(2400, 1600);
      const traitee = await service.traiterImage(grande, grande.length);

      expect(traitee.vignette.length).toBeLessThan(traitee.principale.length);
      const meta = await sharp(traitee.vignette).metadata();
      expect(meta.width).toBe(400);
    });

    it('supprime les métadonnées EXIF, dont la géolocalisation', async () => {
      // Une image porteuse d'EXIF ; le réencodage doit les faire disparaître.
      const avecExif = await sharp({
        create: { width: 900, height: 600, channels: 3, background: { r: 10, g: 20, b: 30 } },
      })
        .withMetadata({ exif: { IFD0: { Copyright: 'Test', Artist: 'Bailleur' } } })
        .jpeg()
        .toBuffer();

      const traitee = await service.traiterImage(avecExif, avecExif.length);
      const meta = await sharp(traitee.principale).metadata();

      expect(meta.exif).toBeUndefined();
    });

    it('rejette une image corrompue portant une signature valide', async () => {
      // En-tête JPEG correct, contenu inexploitable.
      const corrompue = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2000, 0x41)]);
      await expect(service.traiterImage(corrompue, corrompue.length)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('validation des documents', () => {
    it('accepte un PDF', () => {
      const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(500)]);
      expect(service.validerDocument(pdf, pdf.length)).toEqual({
        typeMime: 'application/pdf',
        extension: 'pdf',
      });
    });

    it('accepte une photo de pièce au format JPEG', async () => {
      const jpeg = await creerImage(1200, 800);
      expect(service.validerDocument(jpeg, jpeg.length)).toEqual({
        typeMime: 'image/jpeg',
        extension: 'jpg',
      });
    });

    it('accepte un PNG', async () => {
      const png = await creerImage(600, 400, 'png');
      expect(service.validerDocument(png, png.length)).toEqual({
        typeMime: 'image/png',
        extension: 'png',
      });
    });

    it('rejette un format non reconnu', () => {
      const inconnu = Buffer.alloc(200, 0x7a);
      expect(() => service.validerDocument(inconnu, inconnu.length)).toThrow(/non reconnu/);
    });
  });
});
