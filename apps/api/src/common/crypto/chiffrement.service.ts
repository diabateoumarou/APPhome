/**
 * Chiffrement applicatif AES-256-GCM des données sensibles
 * (numéros de pièce d'identité, secrets TOTP) — NFR sécurité du CDC.
 * En production, la clé provient du KMS ; jamais du code ni du dépôt.
 *
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 05 août 2026
 */
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Injectable()
export class ChiffrementService {
  private readonly cle: Buffer;
  private static readonly ALGO = 'aes-256-gcm';

  constructor(config: ConfigService) {
    const b64 = config.get<string>('CLE_CHIFFREMENT');
    if (!b64) {
      throw new InternalServerErrorException('CLE_CHIFFREMENT absente de la configuration');
    }
    this.cle = Buffer.from(b64, 'base64');
    if (this.cle.length !== 32) {
      throw new InternalServerErrorException('CLE_CHIFFREMENT doit faire 32 octets (base64)');
    }
  }

  /** Retourne « iv:tag:chiffré », le tout en base64. */
  chiffrer(clair: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ChiffrementService.ALGO, this.cle, iv);
    const chiffre = Buffer.concat([cipher.update(clair, 'utf8'), cipher.final()]);
    return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), chiffre.toString('base64')].join(':');
  }

  dechiffrer(charge: string): string {
    const [iv, tag, donnees] = charge.split(':');
    const decipher = createDecipheriv(ChiffrementService.ALGO, this.cle, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(donnees, 'base64')), decipher.final()]).toString('utf8');
  }
}
