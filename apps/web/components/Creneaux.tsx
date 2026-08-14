/**
 * Créneaux de visite disponibles.
 *
 * Le composant est client : le choix d'un créneau est une interaction, et la
 * disponibilité change vite — deux visiteurs peuvent viser le même horaire.
 *
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 13 août 2026
 */
'use client';

import { useEffect, useState } from 'react';
import { lireCreneaux, formaterDate, formaterHeure, type Creneau } from '@/lib/api';

export function Creneaux({ bienId, annonceId }: { bienId: string; annonceId: string }) {
  const [creneaux, setCreneaux] = useState<Creneau[] | null>(null);
  const [choisi, setChoisi] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;

    lireCreneaux(bienId)
      .then((c) => actif && setCreneaux(c))
      .catch(() => actif && setErreur('Les créneaux ne se chargent pas.'));

    return () => {
      actif = false;
    };
  }, [bienId]);

  if (erreur) {
    return (
      <div className="creneaux">
        <h3>Visiter ce bien</h3>
        <p className="vide-message">{erreur} Réessayez dans quelques instants.</p>
      </div>
    );
  }

  if (!creneaux) {
    return (
      <div className="creneaux">
        <h3>Visiter ce bien</h3>
        <p className="vide-message">Chargement des créneaux…</p>
      </div>
    );
  }

  if (creneaux.length === 0) {
    return (
      <div className="creneaux">
        <h3>Visiter ce bien</h3>
        <p className="vide-message">
          Aucun créneau n&apos;est ouvert pour le moment. Déposez votre dossier : le bailleur
          vous proposera une visite.
        </p>
      </div>
    );
  }

  // Regroupement par jour : un locataire raisonne en journées, pas en horaires isolés.
  const parJour = creneaux.reduce<Record<string, Creneau[]>>((acc, creneau) => {
    const jour = formaterDate(creneau.debut);
    (acc[jour] ??= []).push(creneau);
    return acc;
  }, {});

  return (
    <div className="creneaux">
      <h3>Visiter ce bien</h3>
      <p className="aide">
        Choisissez un créneau. Les coordonnées du bailleur vous seront communiquées dès la
        confirmation.
      </p>

      {Object.entries(parJour).map(([jour, liste]) => (
        <div className="jour" key={jour}>
          <p className="jour-titre">{jour}</p>
          <div className="heures">
            {liste.map((creneau) => (
              <button
                key={creneau.id}
                type="button"
                className={choisi === creneau.id ? 'choisi' : ''}
                onClick={() => setChoisi(creneau.id)}
                aria-pressed={choisi === creneau.id}
              >
                {formaterHeure(creneau.debut)}
              </button>
            ))}
          </div>
        </div>
      ))}

      {choisi && (
        <a href={`/visite?creneau=${choisi}&annonce=${annonceId}`} className="bouton bouton-or" style={{ marginTop: 6 }}>
          Confirmer ce créneau
        </a>
      )}
    </div>
  );
}
