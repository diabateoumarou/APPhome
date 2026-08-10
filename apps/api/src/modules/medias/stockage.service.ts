/**
 * Service de stockage objet (S3 / MinIO).
 *
 * Deux buckets distincts, conformément à l'architecture :
 *  - PUBLIC : photos d'annonces, servies directement (vitrine SEO, CDN).
 *  - PRIVÉ  : pièces d'identité, titres de propriété, contrats — accessibles
 *    uniquement par URL présignée à durée courte, avec accès journalisé.
 *
 * L'interface est identique à celle d'AWS S3 : passer de MinIO (développement)
 * à Scaleway ou AWS (production) ne demande qu'un changement de variables
 * d'environnement, aucune réécriture.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 *          Ingénieur Système & Infrastructure Cloud / System Architect
 *          Expert Solutions ICT (Cloud, Système, Cybersécurité)
 * Date   : 09 août 2026
 */
import {
  Injectable,
  OnModuleInit,
  Logger,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

export type Visibilite = 'public' | 'prive';

/** Durée de validité d'une URL présignée : assez pour ouvrir, trop court pour partager. */
const DUREE_URL_PRESIGNEE_S = 300;

@Injectable()
export class StockageService implements OnModuleInit {
  private readonly logger = new Logger(StockageService.name);
  private readonly client: S3Client;
  private readonly bucketPublic: string;
  private readonly bucketPrive: string;
  private readonly urlPublique: string;
  /** SSE désactivable : MinIO en développement n'a pas de KMS configuré. */
  private readonly chiffrementServeur: boolean;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('S3_ENDPOINT');
    if (!endpoint) {
      throw new InternalServerErrorException('S3_ENDPOINT absent de la configuration');
    }

    this.client = new S3Client({
      endpoint,
      region: this.config.get<string>('S3_REGION') ?? 'us-east-1',
      credentials: {
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY') ?? '',
        secretAccessKey: this.config.get<string>('S3_SECRET_KEY') ?? '',
      },
      // Indispensable avec MinIO : les buckets sont dans le chemin, pas le sous-domaine.
      forcePathStyle: true,
    });

    this.bucketPublic = this.config.get<string>('S3_BUCKET_PUBLIC') ?? 'immo-photos';
    this.bucketPrive = this.config.get<string>('S3_BUCKET_PRIVE') ?? 'immo-documents';
    this.urlPublique = (this.config.get<string>('S3_URL_PUBLIQUE') ?? endpoint).replace(/\/$/, '');
    // En production (AWS, Scaleway), activer S3_CHIFFREMENT_SERVEUR=true :
    // le chiffrement au repos des pièces d'identité est une exigence ARTCI.
    this.chiffrementServeur = this.config.get<string>('S3_CHIFFREMENT_SERVEUR') === 'true';
  }

  /** Crée les buckets au démarrage s'ils n'existent pas (confort de développement). */
  async onModuleInit(): Promise<void> {
    for (const [bucket, visibilite] of [
      [this.bucketPublic, 'public'],
      [this.bucketPrive, 'prive'],
    ] as const) {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        try {
          await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
          if (visibilite === 'public') await this.appliquerLectureAnonyme(bucket);
          this.logger.log(`Bucket ${bucket} créé (${visibilite})`);
        } catch (e) {
          const motif = e instanceof Error ? e.message : 'erreur inconnue';
          this.logger.warn(`Bucket ${bucket} indisponible : ${motif}`);
        }
      }
    }
  }

  /** Lecture anonyme sur le bucket des photos uniquement — jamais sur le privé. */
  private async appliquerLectureAnonyme(bucket: string): Promise<void> {
    await this.client.send(
      new PutBucketPolicyCommand({
        Bucket: bucket,
        Policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { AWS: ['*'] },
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${bucket}/*`],
            },
          ],
        }),
      }),
    );
  }

  /**
   * Construit une clé d'objet non devinable.
   * Le nom d'origine n'est jamais réutilisé : il pourrait contenir des
   * caractères dangereux ou révéler des informations sur le déposant.
   */
  construireCle(prefixe: string, extension: string): string {
    const jour = new Date().toISOString().slice(0, 10);
    return `${prefixe}/${jour}/${randomUUID()}.${extension.replace(/^\./, '')}`;
  }

  async televerser(
    cle: string,
    contenu: Buffer,
    typeMime: string,
    visibilite: Visibilite,
  ): Promise<string> {
    const bucket = visibilite === 'public' ? this.bucketPublic : this.bucketPrive;

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: cle,
          Body: contenu,
          ContentType: typeMime,
          // Chiffrement au repos ; MinIO l'ignore silencieusement en local.
          ServerSideEncryption:
            visibilite === 'prive' && this.chiffrementServeur ? 'AES256' : undefined,
        }),
      );
      return cle;
    } catch (e) {
      const motif = e instanceof Error ? e.message : 'erreur inconnue';
      this.logger.error(`Échec de téléversement (${cle}) : ${motif}`);
      throw new ServiceUnavailableException(
        "Le stockage est momentanément indisponible. Réessayez dans quelques instants.",
      );
    }
  }

  async supprimer(cle: string, visibilite: Visibilite): Promise<void> {
    const bucket = visibilite === 'public' ? this.bucketPublic : this.bucketPrive;
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: cle }));
    } catch (e) {
      // Un objet orphelin coûte moins cher qu'une suppression métier bloquée.
      const motif = e instanceof Error ? e.message : 'erreur inconnue';
      this.logger.warn(`Suppression impossible (${cle}) : ${motif}`);
    }
  }

  /** URL directe d'une photo publique — servie par le CDN en production. */
  urlPublic(cle: string): string {
    return `${this.urlPublique}/${this.bucketPublic}/${cle}`;
  }

  /** URL temporaire pour un document sensible (5 minutes). */
  async urlPresignee(cle: string, dureeSecondes = DUREE_URL_PRESIGNEE_S): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucketPrive, Key: cle }),
      { expiresIn: dureeSecondes },
    );
  }
}
