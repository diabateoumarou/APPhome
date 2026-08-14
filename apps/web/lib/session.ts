/**
 * Session utilisateur côté navigateur.
 *
 * Le jeton d'accès est conservé en mémoire de session (sessionStorage) plutôt
 * qu'en localStorage : il disparaît à la fermeture de l'onglet, ce qui limite
 * l'exposition sur un poste partagé — cas fréquent en cybercafé à Abidjan.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 *          Ingénieur Système & Infrastructure Cloud / System Architect
 *          Expert Solutions ICT (Cloud, Système, Cybersécurité)
 * Date   : 13 août 2026
 */
'use client';

const CLE_JETON = 'apphome.acces';
const CLE_NOM = 'apphome.nom';

export interface Jetons {
  accessToken: string;
  refreshToken: string;
}

export function enregistrerSession(jetons: Jetons, nomComplet?: string): void {
  sessionStorage.setItem(CLE_JETON, jetons.accessToken);
  if (nomComplet) sessionStorage.setItem(CLE_NOM, nomComplet);
}

export function lireJeton(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(CLE_JETON);
}

export function lireNom(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(CLE_NOM);
}

export function fermerSession(): void {
  sessionStorage.removeItem(CLE_JETON);
  sessionStorage.removeItem(CLE_NOM);
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100/api/v1';

/**
 * Appel authentifié. Une expiration de jeton renvoie l'utilisateur vers la
 * connexion plutôt que d'afficher une erreur technique qu'il ne peut pas résoudre.
 */
export async function appelAuthentifie<T>(
  chemin: string,
  options: RequestInit = {},
): Promise<T> {
  const jeton = lireJeton();

  const reponse = await fetch(`${BASE}${chemin}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
      ...options.headers,
    },
  });

  if (reponse.status === 401) {
    fermerSession();
    throw new Error('Votre session a expiré. Reconnectez-vous pour continuer.');
  }

  if (!reponse.ok) {
    const corps = (await reponse.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(corps?.message) ? corps.message[0] : corps?.message;
    throw new Error(message ?? `Le service a répondu ${reponse.status}.`);
  }

  return reponse.json() as Promise<T>;
}

/** Appel public, sans jeton. */
export async function appelPublic<T>(chemin: string, options: RequestInit = {}): Promise<T> {
  const reponse = await fetch(`${BASE}${chemin}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  if (!reponse.ok) {
    const corps = (await reponse.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(corps?.message) ? corps.message[0] : corps?.message;
    throw new Error(message ?? `Le service a répondu ${reponse.status}.`);
  }

  return reponse.json() as Promise<T>;
}
