/**
 * Client de l'API APPhome.
 *
 * Les montants transitent en chaîne : au-delà de 2^53 un number JavaScript
 * perdrait en précision, ce qui serait inacceptable sur un prix de vente en
 * FCFA. Ils ne sont convertis qu'au moment de l'affichage.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 *          Ingénieur Système & Infrastructure Cloud / System Architect
 *          Expert Solutions ICT (Cloud, Système, Cybersécurité)
 * Date   : 13 août 2026
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100/api/v1';
const STOCKAGE = process.env.NEXT_PUBLIC_STOCKAGE_URL ?? 'http://localhost:9000/immo-photos';

export interface CoutEntree {
  caution: string;
  avance: string;
  fraisAgence: string;
  total: string;
}

export interface BienResume {
  commune: string;
  quartier: string | null;
  adresse?: string;
  typeBien: string;
  superficieM2: string | null;
  nbPieces: number | null;
  nbChambres: number | null;
  nbSallesEau: number | null;
  meuble: boolean;
  dependances?: string | null;
  photos: { url: string; isCouverture: boolean }[];
  equipements?: { equipement: { code: string; libelle: string } }[];
  proprietaire?: { nomComplet: string };
}

export interface Annonce {
  id: string;
  /** Requis pour résoudre les créneaux de visite du bien. */
  bienId?: string;
  titre: string;
  description: string | null;
  transaction: 'location' | 'vente';
  loyerMontant: string | null;
  prixVente: string | null;
  chargesMontant: string;
  cautionNbMois: number;
  avanceNbMois: number;
  fraisAgenceMontant: string;
  disponibleLe: string | null;
  publieeLe: string | null;
  bien: BienResume;
  coutEntree: CoutEntree;
}

export interface Recherche {
  donnees: Annonce[];
  pagination: { page: number; limite: number; total: number; pages: number };
}

export interface Creneau {
  id: string;
  debut: string;
  fin: string;
  placesRestantes: number;
}

/** Requête vers l'API ; l'erreur remonte avec le message du serveur. */
async function requete<T>(chemin: string): Promise<T> {
  const reponse = await fetch(`${BASE}${chemin}`, {
    headers: { 'Content-Type': 'application/json' },
    // La vitrine est rendue à la demande : les prix ne doivent jamais être figés.
    cache: 'no-store',
  });

  if (!reponse.ok) {
    const corps = (await reponse.json().catch(() => null)) as { message?: string } | null;
    throw new Error(corps?.message ?? `Le service a répondu ${reponse.status}.`);
  }

  return reponse.json() as Promise<T>;
}

export interface FiltresRecherche {
  commune?: string;
  quartier?: string;
  typeBien?: string;
  transaction?: string;
  budgetMax?: string;
  chambresMin?: string;
  tri?: string;
  page?: string;
}

export function rechercherAnnonces(filtres: FiltresRecherche): Promise<Recherche> {
  const parametres = new URLSearchParams(
    Object.entries(filtres).filter(([, v]) => Boolean(v)) as [string, string][],
  );
  return requete<Recherche>(`/annonces/recherche?${parametres.toString()}`);
}

export function lireAnnonce(id: string): Promise<Annonce> {
  return requete<Annonce>(`/annonces/publiques/${id}`);
}

export function lireCreneaux(bienId: string): Promise<Creneau[]> {
  return requete<Creneau[]>(`/biens/${bienId}/creneaux`);
}

/** URL publique d'une photo, servie par le CDN en production. */
export function urlPhoto(cle: string): string {
  return `${STOCKAGE}/${cle}`;
}

/**
 * Formate un montant FCFA avec séparateurs.
 * La chaîne est traitée telle quelle : aucune conversion en number, donc
 * aucune perte de précision sur les grands montants.
 */
export function formaterFCFA(montant: string | null | undefined): string {
  if (!montant) return '—';
  return montant.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function formaterDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function formaterHeure(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export const LIBELLES_TYPE: Record<string, string> = {
  maison: 'Maison',
  appartement: 'Appartement',
  studio: 'Studio',
  terrain: 'Terrain',
  bureau: 'Bureau',
  commerce: 'Local commercial',
};
