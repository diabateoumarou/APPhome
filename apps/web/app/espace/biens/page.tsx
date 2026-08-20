/**
 * Liste des biens du bailleur.
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 14 août 2026
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  listerMesBiens,
  STATUTS_BIEN,
  LIBELLES_TYPE_BIEN,
  type BienListe,
} from '@/lib/espace-api';
import { urlPhoto } from '@/lib/api';

export default function ListeBiens() {
  const [biens, setBiens] = useState<BienListe[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    listerMesBiens()
      .then((r) => setBiens(r.donnees))
      .catch((e) => setErreur(e instanceof Error ? e.message : 'Vos biens ne se chargent pas.'));
  }, []);

  return (
    <div className="page-liste">
      <div className="tb-entete">
        <h1>Mes biens</h1>
        <Link href="/espace/biens/nouveau" className="bouton bouton-or">
          Ajouter un bien
        </Link>
      </div>

      {erreur && <div className="carte-erreur">{erreur}</div>}

      {!biens && !erreur && <p className="chargement">Chargement…</p>}

      {biens && biens.length === 0 && (
        <div className="etat-vide">
          <p>Vous n&apos;avez pas encore de bien enregistré.</p>
          <Link href="/espace/biens/nouveau" className="bouton bouton-or">
            Ajouter mon premier bien
          </Link>
        </div>
      )}

      {biens && biens.length > 0 && (
        <div className="table-biens">
          <div className="table-entete">
            <span>Bien</span>
            <span>Localisation</span>
            <span>Statut</span>
            <span>Annonces</span>
          </div>
          {biens.map((bien) => {
            const couverture = bien.photos.find((p) => p.isCouverture) ?? bien.photos[0];
            const statut = STATUTS_BIEN[bien.statut] ?? { libelle: bien.statut, ton: 'neutre' };

            return (
              <Link href={`/espace/biens/${bien.id}`} key={bien.id} className="table-ligne">
                <span className="table-bien">
                  <span className="table-vignette">
                    {couverture ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={urlPhoto(couverture.url)} alt="" />
                    ) : (
                      <span className="table-vignette-vide" />
                    )}
                  </span>
                  {LIBELLES_TYPE_BIEN[bien.typeBien] ?? bien.typeBien}
                </span>
                <span>
                  {bien.commune}
                  {bien.quartier ? ` · ${bien.quartier}` : ''}
                </span>
                <span>
                  <span className={`etiquette-statut ton-${statut.ton}`}>{statut.libelle}</span>
                </span>
                <span>{bien._count.annonces}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
