/**
 * Détail d'un bien — photos, caractéristiques, annonces liées.
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 * Date   : 14 août 2026
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  lireBien,
  ajouterPhoto,
  STATUTS_BIEN,
  LIBELLES_TYPE_BIEN,
  type BienDetail,
} from '@/lib/espace-api';
import { urlPhoto } from '@/lib/api';

export default function DetailBien() {
  const params = useParams<{ id: string }>();
  const recherche = useSearchParams();
  const estNouveau = recherche.get('nouveau') === '1';

  const [bien, setBien] = useState<BienDetail | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [televersement, setTeleversement] = useState(false);

  const charger = useCallback(async () => {
    try {
      const b = await lireBien(params.id);
      setBien(b);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Ce bien ne se charge pas.');
    }
  }, [params.id]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const televerser = async (fichier: File) => {
    setTeleversement(true);
    setErreur(null);
    try {
      await ajouterPhoto(params.id, fichier);
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La photo n'a pas pu être envoyée.");
    } finally {
      setTeleversement(false);
    }
  };

  if (erreur && !bien) {
    return <div className="carte-erreur">{erreur}</div>;
  }

  if (!bien) {
    return <p className="chargement">Chargement…</p>;
  }

  const statut = STATUTS_BIEN[bien.statut] ?? { libelle: bien.statut, ton: 'neutre' };
  const nbPhotosMin = 3;
  const photosSuffisantes = bien.photos.length >= nbPhotosMin;

  return (
    <div className="page-detail-bien">
      {estNouveau && (
        <div className="avis avis-succes">
          <strong>Bien enregistré</strong>
          Ajoutez au moins {nbPhotosMin} photos, puis créez une annonce pour le publier.
        </div>
      )}

      <div className="tb-entete">
        <div>
          <span className={`etiquette-statut ton-${statut.ton}`}>{statut.libelle}</span>
          <h1>{LIBELLES_TYPE_BIEN[bien.typeBien] ?? bien.typeBien}</h1>
          <p className="sous-lieu">
            {bien.adresse} — {bien.commune}
            {bien.quartier ? ` · ${bien.quartier}` : ''}
          </p>
        </div>
        {bien._count.annonces === 0 && (
          <Link href={`/espace/annonces/nouvelle?bien=${bien.id}`} className="bouton bouton-or">
            Créer une annonce
          </Link>
        )}
      </div>

      {erreur && <div className="carte-erreur">{erreur}</div>}

      <section className="bloc-section">
        <div className="bloc-section-entete">
          <h2>
            Photos ({bien.photos.length})
            {!photosSuffisantes && (
              <span className="rappel-min"> — {nbPhotosMin} minimum pour publier</span>
            )}
          </h2>
          <label className="bouton bouton-ligne">
            {televersement ? 'Envoi…' : 'Ajouter une photo'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              disabled={televersement}
              onChange={(e) => {
                const fichier = e.target.files?.[0];
                if (fichier) void televerser(fichier);
              }}
            />
          </label>
        </div>

        {bien.photos.length === 0 ? (
          <div className="etat-vide etat-vide-compact">
            <p>Aucune photo pour le moment.</p>
          </div>
        ) : (
          <div className="galerie-gestion">
            {bien.photos.map((photo) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={photo.url}
                src={urlPhoto(photo.url)}
                alt=""
                className={photo.isCouverture ? 'photo-couverture' : ''}
              />
            ))}
          </div>
        )}
      </section>

      <section className="bloc-section">
        <h2>Caractéristiques</h2>
        <dl className="caracteristiques-espace">
          {bien.superficieM2 && (
            <div>
              <dt>Superficie</dt>
              <dd>{Math.round(Number(bien.superficieM2))} m²</dd>
            </div>
          )}
          {bien.nbPieces !== null && (
            <div>
              <dt>Pièces</dt>
              <dd>{bien.nbPieces}</dd>
            </div>
          )}
          {bien.nbChambres !== null && (
            <div>
              <dt>Chambres</dt>
              <dd>{bien.nbChambres}</dd>
            </div>
          )}
          <div>
            <dt>Ameublement</dt>
            <dd>{bien.meuble ? 'Meublé' : 'Non meublé'}</dd>
          </div>
        </dl>

        {bien.equipements.length > 0 && (
          <div className="puces-equipements" style={{ marginTop: 14 }}>
            {bien.equipements.map((e) => (
              <span key={e.equipement.code} className="puce puce-lecture">
                {e.equipement.libelle}
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
