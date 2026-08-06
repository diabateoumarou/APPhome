/**
 * Tests du service de chiffrement AES-256-GCM.
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 06 août 2026
 */
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { ChiffrementService } from '../../apps/api/src/common/crypto/chiffrement.service';

describe('ChiffrementService', () => {
  const cle = randomBytes(32).toString('base64');
  const config = { get: () => cle } as unknown as ConfigService;
  let service: ChiffrementService;

  beforeEach(() => {
    service = new ChiffrementService(config);
  });

  it('restitue la valeur d’origine après un aller-retour', () => {
    const clair = 'CI0012345678';
    expect(service.dechiffrer(service.chiffrer(clair))).toBe(clair);
  });

  it('ne laisse jamais la valeur en clair dans la sortie', () => {
    const clair = 'CI0012345678';
    expect(service.chiffrer(clair)).not.toContain(clair);
  });

  it('produit un résultat différent à chaque appel (vecteur aléatoire)', () => {
    const clair = 'CI0012345678';
    expect(service.chiffrer(clair)).not.toBe(service.chiffrer(clair));
  });

  it('rejette une charge altérée (authentification GCM)', () => {
    const charge = service.chiffrer('CI0012345678');
    const [iv, tag, donnees] = charge.split(':');
    const altere = Buffer.from(donnees, 'base64');
    altere[0] ^= 0xff;
    expect(() => service.dechiffrer([iv, tag, altere.toString('base64')].join(':'))).toThrow();
  });

  it('refuse une clé de taille incorrecte', () => {
    const mauvaise = { get: () => randomBytes(16).toString('base64') } as unknown as ConfigService;
    expect(() => new ChiffrementService(mauvaise)).toThrow(InternalServerErrorException);
  });

  it('refuse une configuration sans clé', () => {
    const absente = { get: () => undefined } as unknown as ConfigService;
    expect(() => new ChiffrementService(absente)).toThrow(InternalServerErrorException);
  });

  it('gère les caractères accentués', () => {
    const clair = 'Koné Adjoua Émilie — Cocody Angré';
    expect(service.dechiffrer(service.chiffrer(clair))).toBe(clair);
  });
});
