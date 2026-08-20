/**
 * Vue d'ensemble de l'espace bailleur.
 *
 * Trois questions immédiates : combien de biens tournent, où en sont mes
 * annonces, qu'ai-je à traiter. Aucun endpoint de reporting dédié n'existe
 * encore côté API : les indicateurs sont calculés ici depuis les listes,
 * ce qui suffit à l'échelle d'un pilote mais méritera un endpoint agrégé
 * si le nombre de biens par bailleur augmente.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 * Date   : 14 août 2026
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  listerMesBiens,
  listerMesAnnonces,
  STATUTS_ANNONCE,
  STATUTS_BIEN,
  LIBELLES_TYPE_BIEN,
  type BienListe,
  type AnnonceListe,
} from '@/lib/espace-api';
import { urlPhoto } from '@/lib/api';

export default function TableauDeBord() {
  const [biens, setBiens] = useState<BienListe[] | null>(null);
  const [annonces, setAnnonces] = useState<AnnonceListe[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listerMesBiens(), listerMesAnnonces()])
      .then(([b, a]) => {
        setBiens(b.donnees);
        setAnnonces(a.donnees);
      })
      .catch((e) => setErreur(e instanceof Error ? e.message : 'Le tableau de bord ne se charge pas.'));
  }, []);

  if (erreur) {
    return (
      <div className="carte-erreur">
        <strong>Vos données ne se chargent pas</strong>
        {erreur}
      </div>
    );
  }

  if (!biens || !annonces) {
    return <p className="chargement">Chargement de votre tableau de bord…</p>;
  }

  const disponibles = biens.filter((b) => b.statut === 'disponible').length;
  const loues = biens.filter((b) => b.statut === 'loue').length;
  const enModeration = annonces.filter((a) =>
    ['soumise', 'en_moderation'].includes(a.statut),
  );
  const rejetees = annonces.filter((a) => a.statut === 'rejetee');
  const brouillons = annonces.filter((a) => a.statut === 'brouillon');
  const sansAnnonce = biens.filter((b) => b._count.annonces === 0);

  const aTraiter = [
    ...rejetees.map((a) => ({
      type: 'rejet' as const,
      texte: `« ${a.titre} » a été rejetée`,
      detail: a.motifRejet,
      lien: `/espace/annonces/${a.id}`,
    })),
    ...sansAnnonce.map((b) => ({
      type: 'sans-annonce' as const,
      texte: `${LIBELLES_TYPE_BIEN[b.typeBien] ?? b.typeBien} à ${b.commune} n'a pas d'annonce`,
      detail: null,
      lien: `/espace/annonces/nouvelle?bien=${b.id}`,
    })),
  ];

  return (
    <div className="tableau-bord">
      <div className="tb-entete">
        <h1>Vue d&apos;ensemble</h1>
        <Link href="/espace/biens/nouveau" className="bouton bouton-or">
          Ajouter un bien
        </Link>
      </div>

      <div className="tb-indicateurs">
        <div className="indicateur">
          <span className="indicateur-valeur">{biens.length}</span>
          <span className="indicateur-libelle">
            Bien{biens.length > 1 ? 's' : ''} au total
          </span>
        </div>
        <div className="indicateur">
          <span className="indicateur-valeur">{disponibles}</span>
          <span className="indicateur-libelle">Disponible{disponibles > 1 ? 's' : ''}</span>
        </div>
        <div className="indicateur">
          <span className="indicateur-valeur">{loues}</span>
          <span className="indicateur-libelle">Loué{loues > 1 ? 's' : ''}</span>
        </div>
        <div className="indicateur">
          <span className="indicateur-valeur">{enModeration.length}</span>
          <span className="indicateur-libelle">En modération</span>
        </div>
      </div>

      {aTraiter.length > 0 && (
        <section className="tb-section">
          <h2>À traiter</h2>
          <div className="liste-alertes">
            {aTraiter.map((item, i) => (
              <Link href={item.lien} key={i} className="alerte">
                <span className={`alerte-puce ${item.type === 'rejet' ? 'alerte-rouge' : 'alerte-ambre'}`} />
                <span className="alerte-texte">
                  {item.texte}
                  {item.detail && <span className="alerte-detail">{item.detail}</span>}
                </span>
                <span className="alerte-fleche">→</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {brouillons.length > 0 && (
        <section className="tb-section">
          <h2>Brouillons en attente</h2>
          <div className="liste-alertes">
            {brouillons.map((a) => (
              <Link href={`/espace/annonces/${a.id}`} key={a.id} className="alerte">
                <span className="alerte-puce alerte-neutre" />
                <span className="alerte-texte">{a.titre}</span>
                <span className="alerte-fleche">→</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="tb-section">
        <div className="tb-section-entete">
          <h2>Mes biens récents</h2>
          <Link href="/espace/biens">Voir tout</Link>
        </div>

        {biens.length === 0 ? (
          <div className="etat-vide">
            <p>Vous n&apos;avez pas encore de bien enregistré.</p>
            <Link href="/espace/biens/nouveau" className="bouton bouton-or">
              Ajouter mon premier bien
            </Link>
          </div>
        ) : (
          <div className="tb-grille-biens">
            {biens.slice(0, 4).map((bien) => {
              const couverture = bien.photos.find((p) => p.isCouverture) ?? bien.photos[0];
              const statut = STATUTS_BIEN[bien.statut] ?? { libelle: bien.statut, ton: 'neutre' };

              return (
                <Link href={`/espace/biens/${bien.id}`} key={bien.id} className="mini-fiche">
                  <div className="mini-fiche-image">
                    {couverture ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={urlPhoto(couverture.url)} alt="" />
                    ) : (
                      <span>Sans photo</span>
                    )}
                  </div>
                  <div className="mini-fiche-corps">
                    <span className={`etiquette-statut ton-${statut.ton}`}>{statut.libelle}</span>
                    <strong>{LIBELLES_TYPE_BIEN[bien.typeBien] ?? bien.typeBien}</strong>
                    <span className="mini-fiche-lieu">
                      {bien.commune}
                      {bien.quartier ? ` · ${bien.quartier}` : ''}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
