/**
 * Fiche publique d'une annonce.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 * Date   : 13 août 2026
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  lireAnnonce,
  formaterFCFA,
  urlPhoto,
  LIBELLES_TYPE,
} from '@/lib/api';
import { Releve } from '@/components/Releve';
import { Creneaux } from '@/components/Creneaux';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const annonce = await lireAnnonce(id);
    return {
      title: `${annonce.titre} — ${annonce.bien.commune} | APPhome`,
      description:
        `${formaterFCFA(annonce.loyerMontant)} F/mois. ` +
        `Coût d'entrée : ${formaterFCFA(annonce.coutEntree.total)} F, détaillé et sans frais caché.`,
    };
  } catch {
    return { title: 'Annonce introuvable | APPhome' };
  }
}

export default async function FicheBien({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let annonce;
  try {
    annonce = await lireAnnonce(id);
  } catch {
    notFound();
  }

  const bien = annonce.bien;
  const photos = bien.photos ?? [];
  const enVente = annonce.transaction === 'vente';
  const mensuel = String(
    BigInt(annonce.loyerMontant ?? '0') + BigInt(annonce.chargesMontant ?? '0'),
  );

  return (
    <section className="detail">
      <div className="enveloppe">
        <nav className="fil" aria-label="Fil d'Ariane">
          <Link href="/">Louer</Link>
          <span>›</span>
          <Link href={`/?commune=${encodeURIComponent(bien.commune)}`}>{bien.commune}</Link>
          <span>›</span>
          <span>{LIBELLES_TYPE[bien.typeBien] ?? bien.typeBien}</span>
        </nav>

        <div className="galerie">
          {photos[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="principale" src={urlPhoto(photos[0].url)} alt={annonce.titre} />
          ) : (
            <div className="principale vide" />
          )}
          {photos.slice(1, 3).map((photo, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={photo.url}
              className="secondaire"
              src={urlPhoto(photo.url)}
              alt={`${annonce.titre} — vue ${i + 2}`}
            />
          ))}
        </div>

        <div className="detail-grille">
          <div>
            <p className="detail-lieu">
              {bien.commune}
              {bien.quartier ? ` · ${bien.quartier}` : ''}
            </p>
            <h1>{annonce.titre}</h1>

            <dl className="caracteristiques">
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
              {bien.nbSallesEau !== null && (
                <div>
                  <dt>Salles d&apos;eau</dt>
                  <dd>{bien.nbSallesEau}</dd>
                </div>
              )}
              <div>
                <dt>Ameublement</dt>
                <dd>{bien.meuble ? 'Meublé' : 'Non meublé'}</dd>
              </div>
            </dl>

            {annonce.description && <p className="description">{annonce.description}</p>}

            {bien.equipements && bien.equipements.length > 0 && (
              <div className="equipements">
                {bien.equipements.map((e) => (
                  <span key={e.equipement.code}>{e.equipement.libelle}</span>
                ))}
              </div>
            )}

            <div id="creneaux">{annonce.bienId && <Creneaux bienId={annonce.bienId} annonceId={annonce.id} />}</div>
          </div>

          <aside className="aparte">
            <div className="loyer-bloc">
              {enVente ? (
                <>
                  <p className="principal">
                    {formaterFCFA(annonce.prixVente)} <small>F</small>
                  </p>
                  <p className="charges">Prix de vente</p>
                </>
              ) : (
                <>
                  <p className="principal">
                    {formaterFCFA(annonce.loyerMontant)} <small>F/mois</small>
                  </p>
                  <p className="charges">
                    {annonce.chargesMontant !== '0'
                      ? `Soit ${formaterFCFA(mensuel)} F charges comprises`
                      : 'Charges non comprises'}
                  </p>
                </>
              )}
            </div>

            {!enVente && <Releve annonce={annonce} />}

            <div className="actions">
              <Link href="#creneaux" className="bouton bouton-or">
                Réserver une visite
              </Link>
              <Link href={`/dossier?annonce=${annonce.id}`} className="bouton bouton-ligne">
                Déposer mon dossier
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
