/**
 * Point d'entrée de l'API — Plateforme de Gestion Immobilière
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 *          Ingénieur Système & Infrastructure Cloud / System Architect
 *          Expert Solutions ICT (Cloud, Système, Cybersécurité)
 * Date   : 05 août 2026
 */
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });

  // Helmet reste actif ; la CSP est assouplie uniquement pour les ressources
  // dont Swagger UI a besoin (scripts et styles en ligne, images data:).
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          // Désactivé : sans TLS en développement, cette directive ferait
          // échouer le chargement des ressources en HTTPS. La production
          // termine le TLS au niveau du reverse proxy.
          upgradeInsecureRequests: null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.enableCors({ origin: process.env.CORS_ORIGINS?.split(',') ?? [], credentials: true });
  app.setGlobalPrefix('api/v1');

  // Rejet strict de tout champ non déclaré dans les DTO
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const config = new DocumentBuilder()
    .setTitle('API Plateforme Immobilière')
    .setDescription("Gestion locative intégrée — annonces, visites, contrats, paiements")
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`API démarrée sur le port ${port} — docs : /api/docs`);
}

void bootstrap();
