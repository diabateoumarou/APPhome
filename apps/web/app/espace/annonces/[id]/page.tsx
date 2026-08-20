/**
 * Détail d'une annonce — statut, motif de rejet, soumission à modération.
 *
 * C'est la destination de trois parcours : la création (redirection directe),
 * le tableau de bord (alerte sur rejet), et la liste. Chacun y trouve ce qui
 * lui manquait à l'étape précédente.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 * Date   : 14 août 2026
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  lireAnnonce,
  soumettreAnnonce,
  STATUTS_ANNONCE,
  type AnnonceDetail,
} from '@/lib/espace-api';

function fcfa(montant: string | null): string {
  if (!montant) return '—';
  return montant.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export default function DetailAnnonce() {
  const params = useParams<{ id: string }>();

  const [annonce, setAnnonce] = useState<AnnonceDetail | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    try {
      setAnnonce(await lireAnnonce(params.id));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Cette annonce ne se charge pas.");
    }
  }, [params.id]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const soumettre = async () => {
    setErreur(null);
    setEnCours(true);
    try {
      await soumettreAnnonce(params.id);
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La soumission a échoué.");
    } finally {
      setEnCours(false);
    }
  };

  if (erreur && !annonce) {
    return <div className="carte-erreur">{erreur}</div>;
  }

  if (!annonce) {
    return <p className="chargement">Chargement…</p>;
  }

  const statut = STATUTS_ANNONCE[annonce.statut] ?? { libelle: annonce.statut, ton: 'neutre' };
  const total =
    (Number(annonce.loyerMontant ?? 0) * annonce.cautionNbMois) +
    (Number(annonce.loyerMontant ?? 0) * annonce.avanceNbMois) +
    Number(annonce.fraisAgenceMontant ?? 0);

  return (
    <div className="page-detail-bien">
      <div className="tb-entete">
        <div>
          <span className={`etiquette-statut ton-${statut.ton}`}>{statut.libelle}</span>
          <h1>{annonce.titre}</h1>
          <p className="sous-lieu">
            {annonce.bien.commune}
            {annonce.bien.quartier ? ` · ${annonce.bien.quartier}` : ''}
          </p>
        </div>

        {annonce.statut === 'brouillon' && (
          <div style={{ display: 'flex', gap: 10 }}>
            <a href={`/espace/biens/${annonce.bienId}`} className="bouton bouton-ligne">
              Gérer les photos
            </a>
            <button
              type="button"
              className="bouton bouton-or"
              onClick={soumettre}
              disabled={enCours}
            >
              {enCours ? 'Envoi…' : 'Soumettre à modération'}
            </button>
          </div>
        )}
      </div>

      {annonce.statut === 'rejetee' && annonce.motifRejet && (
        <div className="carte-erreur">
          <strong>Annonce rejetée</strong>
          {annonce.motifRejet}
        </div>
      )}

      {erreur && <div className="carte-erreur">{erreur}</div>}

      <section className="bloc-section">
        <h2>Description</h2>
        <p className="sous-lieu" style={{ maxWidth: '62ch' }}>
          {annonce.description ?? 'Aucune description renseignée.'}
        </p>
      </section>

      <section className="bloc-section">
        <h2>Conditions financières</h2>
        <div className="releve">
          <div className="releve-entete">
            <span className="releve-titre">Coût d&apos;entrée pour le locataire</span>
          </div>
          <div className="ligne">
            <span className="libelle">
              Caution
              <span className="calcul">
                {fcfa(annonce.loyerMontant)} × {annonce.cautionNbMois} mois
              </span>
            </span>
            <span className="montant">
              {fcfa(String(Number(annonce.loyerMontant ?? 0) * annonce.cautionNbMois))}
            </span>
          </div>
          <div className="ligne">
            <span className="libelle">
              Avance
              <span className="calcul">
                {fcfa(annonce.loyerMontant)} × {annonce.avanceNbMois} mois
              </span>
            </span>
            <span className="montant">
              {fcfa(String(Number(annonce.loyerMontant ?? 0) * annonce.avanceNbMois))}
            </span>
          </div>
          <div className="ligne">
            <span className="libelle">Frais d&apos;agence</span>
            <span className="montant">{fcfa(annonce.fraisAgenceMontant)}</span>
          </div>
          <div className="ligne ligne-total">
            <span className="libelle">À la signature</span>
            <span className="montant">{fcfa(String(total))} F</span>
          </div>
        </div>
      </section>
    </div>
  );
}
