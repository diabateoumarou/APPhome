/**
 * Liste des annonces du bailleur, tous statuts.
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 14 août 2026
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listerMesAnnonces, STATUTS_ANNONCE, type AnnonceListe } from '@/lib/espace-api';

// formaterFCFA n'existe pas dans espace-api ; on le redéfinit localement pour
// éviter une dépendance croisée vers lib/api (vitrine publique).
function fcfa(montant: string | null): string {
  if (!montant) return '—';
  return montant.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export default function ListeAnnonces() {
  const [annonces, setAnnonces] = useState<AnnonceListe[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    listerMesAnnonces()
      .then((r) => setAnnonces(r.donnees))
      .catch((e) => setErreur(e instanceof Error ? e.message : 'Vos annonces ne se chargent pas.'));
  }, []);

  return (
    <div className="page-liste">
      <div className="tb-entete">
        <h1>Mes annonces</h1>
        <Link href="/espace/annonces/nouvelle" className="bouton bouton-or">
          Créer une annonce
        </Link>
      </div>

      {erreur && <div className="carte-erreur">{erreur}</div>}
      {!annonces && !erreur && <p className="chargement">Chargement…</p>}

      {annonces && annonces.length === 0 && (
        <div className="etat-vide">
          <p>Vous n&apos;avez pas encore créé d&apos;annonce.</p>
          <Link href="/espace/biens" className="bouton bouton-or">
            Voir mes biens
          </Link>
        </div>
      )}

      {annonces && annonces.length > 0 && (
        <div className="table-biens">
          <div className="table-entete">
            <span>Annonce</span>
            <span>Localisation</span>
            <span>Prix</span>
            <span>Statut</span>
          </div>
          {annonces.map((annonce) => {
            const statut = STATUTS_ANNONCE[annonce.statut] ?? {
              libelle: annonce.statut,
              ton: 'neutre',
            };
            return (
              <Link href={`/espace/annonces/${annonce.id}`} key={annonce.id} className="table-ligne">
                <span>{annonce.titre}</span>
                <span>
                  {annonce.bien.commune}
                  {annonce.bien.quartier ? ` · ${annonce.bien.quartier}` : ''}
                </span>
                <span>
                  {annonce.transaction === 'vente'
                    ? `${fcfa(annonce.prixVente)} F`
                    : `${fcfa(annonce.loyerMontant)} F/mois`}
                </span>
                <span>
                  <span className={`etiquette-statut ton-${statut.ton}`}>{statut.libelle}</span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
