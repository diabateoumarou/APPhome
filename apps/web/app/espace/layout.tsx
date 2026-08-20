/**
 * Enveloppe de l'espace bailleur — navigation latérale persistante.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 * Date   : 14 août 2026
 */
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AccesProtege } from '@/components/AccesProtege';
import { fermerSession, lireNom } from '@/lib/session';

const LIENS = [
  { href: '/espace', libelle: 'Vue d’ensemble', exact: true },
  { href: '/espace/biens', libelle: 'Mes biens' },
  { href: '/espace/annonces', libelle: 'Mes annonces' },
  { href: '/espace/candidatures', libelle: 'Candidatures' },
  { href: '/espace/contrats', libelle: 'Contrats' },
  { href: '/espace/paiements', libelle: 'Paiements' },
];

export default function LayoutEspace({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const estActif = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  const seDeconnecter = () => {
    fermerSession();
    router.push('/');
  };

  return (
    <AccesProtege>
      <div className="espace-mise-en-page">
        <aside className="espace-nav">
          <div className="espace-identite">
            <span className="espace-nom">{lireNom() ?? 'Mon espace'}</span>
            <span className="espace-role">Bailleur</span>
          </div>

          <nav>
            {LIENS.map((lien) => (
              <Link
                key={lien.href}
                href={lien.href}
                className={estActif(lien.href, lien.exact) ? 'actif' : ''}
              >
                {lien.libelle}
              </Link>
            ))}
          </nav>

          <button type="button" className="espace-deconnexion" onClick={seDeconnecter}>
            Se déconnecter
          </button>
        </aside>

        <main className="espace-contenu">{children}</main>
      </div>
    </AccesProtege>
  );
}
