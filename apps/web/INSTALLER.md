# Vitrine publique APPhome — Next.js

**Auteur :** DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
| Ingénieur Système & Infrastructure Cloud / System Architect
| Expert Solutions ICT (Cloud, Système, Cybersécurité)
**Date :** 13 août 2026

## Direction visuelle

**Le sujet.** Un locataire abidjanais ne cherche pas d'abord « un joli appartement ».
Il cherche une réponse à une question brutale : combien dois-je sortir aujourd'hui
pour entrer. Sur ce marché, 750 000 FCFA en liquide séparent un logement accessible
d'un logement théorique. C'est cette arithmétique qui structure toute l'interface.

**Signature.** Le coût d'entrée est traité comme un **relevé**, en chiffres
tabulaires monospacés : loyer × 2 = caution, loyer × 2 = avance, frais, trait,
total. L'arithmétique est montrée, jamais résumée. La bordure inférieure est
dentelée comme un reçu. C'est ce qu'on retiendra de la plateforme, et c'est la
promesse « aucun frais caché » rendue littérale.

**Palette.** Le pétrole profond de la lagune Ébrié domine — il porte aussi le
sérieux qu'exige une plateforme maniant contrats et séquestre. Les fiches
flottent dessus en papier chaud. Le marigold est réservé à l'argent et aux
actions, nulle part ailleurs : quand il apparaît, il signifie toujours la même
chose.

**Typographie.** Bricolage Grotesque pour l'affichage, Instrument Sans pour le
texte, IBM Plex Mono pour les montants. Le monospace n'est pas un effet de style :
les montants en FCFA sont longs et doivent s'aligner pour se comparer d'une
annonce à l'autre.

## Installation

```bash
cd ~/projets/plateforme-immo/apps
tar -xzf ~/web.tar.gz
mv web web-tmp 2>/dev/null || true   # si un dossier web existe déjà
cd web && npm install
cp .env.example .env.local
```

Ajuster `.env.local` si l'adresse de la VM diffère, puis :

```bash
npm run dev
```

La vitrine écoute sur le port **3200** (l'API garde 3100).

```bash
sudo ufw allow 3200/tcp comment 'Vitrine APPhome (dev)'
```

Ouvrir `http://192.168.32.135:3200`.

## Ce qui est livré

| Écran | Route | État |
|---|---|---|
| Accueil et recherche | `/` | Complet, rendu serveur (SEO) |
| Fiche bien | `/biens/[id]` | Complet, avec créneaux de visite |
| Connexion | `/connexion` | À construire |
| Dépôt de dossier | `/biens/[id]/dossier` | À construire |

Les deux premiers écrans ne consomment que des endpoints publics déjà stabilisés :
`/annonces/recherche`, `/annonces/publiques/:id` et `/biens/:id/creneaux`.

## Prérequis côté données

La vitrine n'affiche que les annonces **publiées**. Pour voir quelque chose, il
faut au moins une annonce passée en modération, et des photos téléversées pour
que les fiches ne soient pas vides.

## Points d'attention

Les photos sont servies directement par MinIO en développement. En production,
`NEXT_PUBLIC_STOCKAGE_URL` pointera vers le CDN, ce qui ne demande aucun
changement de code.

Le composant `Creneaux` appelle `/biens/:id/creneaux` avec l'identifiant
d'annonce : côté API, cette route attend un identifiant de bien. Il faudra soit
exposer le `bienId` dans la fiche publique, soit ajouter une route
`/annonces/:id/creneaux`. C'est le seul ajustement backend nécessaire.
