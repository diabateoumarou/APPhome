/**
 * Enveloppe commune de la vitrine.
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 13 août 2026
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'APPhome — Louer à Abidjan sans mauvaise surprise',
  description:
    "Chaque annonce affiche le coût d'entrée complet : caution, avance et frais d'agence, " +
    'plafonnés par la loi et vérifiés avant publication.',
  openGraph: {
    title: 'APPhome — Louer à Abidjan sans mauvaise surprise',
    description: "Le coût d'entrée affiché avant tout contact. Caution sous séquestre.",
    locale: 'fr_CI',
    type: 'website',
  },
};

export default function RacineLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=Instrument+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <header>
          <div className="enveloppe barre">
            <Link href="/" className="logo">
              APP<span>home</span>
            </Link>
            <nav>
              <Link href="/">Louer</Link>
              <Link href="/?transaction=vente">Acheter</Link>
              <Link href="/publier">Publier un bien</Link>
              <Link href="/espace">Espace bailleur</Link>
              <Link href="/connexion" className="bouton bouton-ligne">
                Se connecter
              </Link>
            </nav>
          </div>
        </header>

        {children}

        <footer>
          <div className="enveloppe">
            <Link href="/aide">Comment ça marche</Link>
            <Link href="/publier">Publier un bien</Link>
            <Link href="/mentions">Mentions légales</Link>
            <p className="mention">
              Caution et avance plafonnées à deux mois chacune, conformément à la loi n°2019-576.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
