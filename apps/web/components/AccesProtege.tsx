/**
 * Garde d'accès de l'espace bailleur.
 *
 * Toute route sous /espace exige une session active. Le contrôle se fait
 * côté client (le jeton vit en sessionStorage) : chaque page protégée
 * l'utilise et redirige vers la connexion en le mémorisant, pour revenir
 * exactement là après authentification.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 * Date   : 14 août 2026
 */
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { lireJeton } from '@/lib/session';

export function AccesProtege({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [verifie, setVerifie] = useState(false);

  useEffect(() => {
    if (!lireJeton()) {
      router.replace(`/connexion?suite=${encodeURIComponent(pathname)}`);
      return;
    }
    setVerifie(true);
  }, [router, pathname]);

  if (!verifie) {
    return (
      <div className="chargement-page">
        <p>Vérification de votre session…</p>
      </div>
    );
  }

  return <>{children}</>;
}
