# Plateforme Intégrée de Gestion Immobilière — API

Backend de la plateforme SaaS de gestion locative (marché ivoirien / ouest-africain) :
annonces, visites, candidatures, contrats avec signature électronique, paiements
mobile money et séquestre de caution.

**Auteur :** DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
| Ingénieur Système & Infrastructure Cloud / System Architect
| Expert Solutions ICT (Cloud, Système, Cybersécurité)
**Date :** 05 août 2026 · **Version :** 0.1.0 (sprint S1–S2)

---

## Démarrage

```bash
cp .env.example .env
# Générer les secrets
openssl rand -base64 48   # → JWT_SECRET
openssl rand -base64 48   # → JWT_REFRESH_SECRET
openssl rand -base64 32   # → CLE_CHIFFREMENT (32 octets exactement)

docker compose up -d postgres redis
npm install
npx prisma migrate deploy   # tables + contraintes métier
npm run db:seed             # plafonds légaux, motifs, équipements, modèle de bail
npm run start:dev
```

API sur `http://localhost:3000/api/v1` · Documentation OpenAPI sur `/api/docs`.

## Endpoints disponibles (sprint S1–S2)

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/api/v1/auth/inscription` | Créer un compte, envoi du code SMS |
| POST | `/api/v1/auth/otp/verification` | Vérifier le code, obtenir les jetons |
| POST | `/api/v1/auth/connexion` | Connexion téléphone + mot de passe |

## Structure

```
apps/api/src/
  main.ts                  Bootstrap (Helmet, CORS, validation stricte, Swagger)
  app.module.ts            Modules — miroir des 8 domaines du modèle de données
  prisma/                  Accès base (sérialisation BigInt des montants FCFA)
  common/
    crypto/                Chiffrement AES-256-GCM des données sensibles
    decorators/            @Public, @Roles, @Utilisateur
    guards/                JwtAuthGuard (auth par défaut), RolesGuard
  modules/
    auth/                  Inscription, OTP, connexion, JWT
    notifications/         SMS avec bascule automatique entre fournisseurs
prisma/
  schema.prisma            36 modèles, 33 enums, 136 relations
  migrations/              Contraintes métier non exprimables en Prisma
  seed.ts                  Données de référence
test/
  contraintes.test.sql     6 tests des garde-fous légaux et financiers
```

## Principes non négociables

1. **Montants en `BigInt` (FCFA), jamais `Float`** — aucune erreur d'arrondi sur l'argent.
2. **Plafonds légaux appliqués par la base** (loi n°2019-576 : 2 mois de caution + 2 mois
   d'avance maximum) : un bug applicatif ne peut pas produire un contrat illégal.
3. **API protégée par défaut** — `@Public()` ouvre explicitement une route.
4. **Aucune donnée sensible en clair** : mots de passe en Argon2id, codes OTP hachés,
   numéros de pièce d'identité chiffrés AES-256-GCM (clé issue du KMS en production).
5. **Idempotence des paiements** : `reference_interne` unique, webhook + réconciliation
   active — jamais de double débit sur coupure réseau.
6. **Messages d'erreur non discriminants** à la connexion (pas d'énumération de comptes).

## Prochains sprints

S3–S5 biens et annonces · S6–S7 recherche · S8–S9 visites · S10–S11 candidatures ·
S12–S14 contrats et signature · S15–S17 paiements et séquestre · S18 durcissement.
Voir `roadmap-developpement.md`.
