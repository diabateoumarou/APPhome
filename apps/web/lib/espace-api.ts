/**
 * Client de l'espace bailleur.
 *
 * Distinct de lib/api.ts (vitrine publique) : ces appels sont tous
 * authentifiés et portent sur les propres biens de l'utilisateur.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 *          Ingénieur Système & Infrastructure Cloud / System Architect
 *          Expert Solutions ICT (Cloud, Système, Cybersécurité)
 * Date   : 14 août 2026
 */
import { appelAuthentifie } from './session';

export interface BienListe {
  id: string;
  typeBien: string;
  adresse: string;
  commune: string;
  quartier: string | null;
  statut: 'disponible' | 'reserve' | 'loue' | 'vendu';
  photos: { url: string; isCouverture: boolean }[];
  _count: { annonces: number };
}

export interface BienDetail extends Omit<BienListe, '_count'> {
  nbPieces: number | null;
  nbChambres: number | null;
  nbSallesEau: number | null;
  superficieM2: string | null;
  meuble: boolean;
  dependances: string | null;
  attributs: Record<string, unknown>;
  equipements: { equipement: { code: string; libelle: string } }[];
  _count: { annonces: number; contrats: number };
}

export interface AnnonceListe {
  id: string;
  titre: string;
  transaction: 'location' | 'vente';
  statut: string;
  loyerMontant: string | null;
  prixVente: string | null;
  motifRejet: string | null;
  createdAt: string;
  bien: { commune: string; quartier: string | null; typeBien: string; statut: string };
}

export interface Pagination<T> {
  donnees: T[];
  pagination: { page: number; limite: number; total: number; pages: number };
}

export interface Equipement {
  id: string;
  code: string;
  libelle: string;
}

/** Liste paginée des biens du bailleur connecté. */
export function listerMesBiens(page = 1): Promise<Pagination<BienListe>> {
  return appelAuthentifie(`/biens?page=${page}&limite=20`);
}

export function lireBien(id: string): Promise<BienDetail> {
  return appelAuthentifie(`/biens/${id}`);
}

export function listerEquipements(): Promise<Equipement[]> {
  return appelAuthentifie('/biens/equipements');
}

export interface CreerBienDto {
  typeBien: string;
  adresse: string;
  commune: string;
  quartier?: string;
  superficieM2?: number;
  nbPieces?: number;
  nbChambres?: number;
  nbSallesEau?: number;
  meuble?: boolean;
  dependances?: string;
  equipements?: string[];
}

export function creerBien(dto: CreerBienDto): Promise<BienDetail> {
  return appelAuthentifie('/biens', { method: 'POST', body: JSON.stringify(dto) });
}

export function ajouterPhoto(bienId: string, fichier: File) {
  const corps = new FormData();
  corps.append('fichier', fichier);
  return appelAuthentifie(`/biens/${bienId}/photos`, { method: 'POST', body: corps });
}

/** Liste des annonces du bailleur, tous statuts confondus. */
export function listerMesAnnonces(page = 1): Promise<Pagination<AnnonceListe>> {
  return appelAuthentifie(`/annonces?page=${page}&limite=20`);
}

export interface CreerAnnonceDto {
  bienId: string;
  transaction: 'location' | 'vente';
  titre: string;
  description?: string;
  loyerMontant?: string;
  prixVente?: string;
  chargesMontant?: string;
  cautionNbMois?: number;
  avanceNbMois?: number;
  fraisAgenceMontant?: string;
}

export interface AnnonceDetail extends AnnonceListe {
  description: string | null;
  chargesMontant: string;
  cautionNbMois: number;
  avanceNbMois: number;
  fraisAgenceMontant: string;
  bienId: string;
}

/**
 * Détail d'une annonce.
 * L'API n'expose pas de GET /annonces/:id : on filtre depuis la liste du
 * bailleur, qui contient déjà tous les champs nécessaires à cet écran.
 */
export async function lireAnnonce(id: string): Promise<AnnonceDetail> {
  const { donnees } = await appelAuthentifie<{ donnees: AnnonceDetail[] }>(
    '/annonces?limite=100',
  );
  const trouvee = donnees.find((a) => a.id === id);
  if (!trouvee) throw new Error('Annonce introuvable.');
  return trouvee;
}

export function creerAnnonce(dto: CreerAnnonceDto): Promise<{ id: string }> {
  return appelAuthentifie('/annonces', { method: 'POST', body: JSON.stringify(dto) });
}

export function soumettreAnnonce(id: string) {
  return appelAuthentifie(`/annonces/${id}/soumission`, { method: 'POST' });
}

/** Libellés d'affichage des statuts d'annonce, avec leur ton (couleur). */
export const STATUTS_ANNONCE: Record<string, { libelle: string; ton: string }> = {
  brouillon: { libelle: 'Brouillon', ton: 'neutre' },
  soumise: { libelle: 'En file de modération', ton: 'attente' },
  en_moderation: { libelle: 'En cours de modération', ton: 'attente' },
  publiee: { libelle: 'Publiée', ton: 'succes' },
  rejetee: { libelle: 'Rejetée', ton: 'alerte' },
  expiree: { libelle: 'Expirée', ton: 'neutre' },
  retiree: { libelle: 'Retirée', ton: 'neutre' },
};

export const STATUTS_BIEN: Record<string, { libelle: string; ton: string }> = {
  disponible: { libelle: 'Disponible', ton: 'succes' },
  reserve: { libelle: 'Réservé', ton: 'attente' },
  loue: { libelle: 'Loué', ton: 'neutre' },
  vendu: { libelle: 'Vendu', ton: 'neutre' },
};

export const LIBELLES_TYPE_BIEN: Record<string, string> = {
  maison: 'Maison',
  appartement: 'Appartement',
  studio: 'Studio',
  terrain: 'Terrain',
  bureau: 'Bureau',
  commerce: 'Local commercial',
};
