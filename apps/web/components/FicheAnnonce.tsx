/**
 * Fiche d'annonce dans la grille de résultats.
 *
 * Le coût d'entrée y figure au même niveau que le loyer : c'est la question
 * que se pose réellement un locataire avant de décrocher son téléphone.
 *
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 13 août 2026
 */
import Link from 'next/link';
import { formaterFCFA, urlPhoto, LIBELLES_TYPE, type Annonce } from '@/lib/api';

export function FicheAnnonce({ annonce }: { annonce: Annonce }) {
  const bien = annonce.bien;
  const couverture = bien.photos.find((p) => p.isCouverture) ?? bien.photos[0];
  const enVente = annonce.transaction === 'vente';

  return (
    <Link href={`/biens/${annonce.id}`} className="fiche">
      <div className="fiche-image">
        {couverture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={urlPhoto(couverture.url)}
            alt={annonce.titre}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span className="fiche-lieu">Photo à venir</span>
        )}
        <span className="etiquette etiquette-verifie">Bailleur vérifié</span>
      </div>

      <div className="fiche-corps">
        <p className="fiche-lieu">
          {bien.commune}
          {bien.quartier ? ` · ${bien.quartier}` : ''}
        </p>
        <h3 className="fiche-titre">{annonce.titre}</h3>

        <p className="fiche-attributs">
          {bien.superficieM2 && <span>{Math.round(Number(bien.superficieM2))} m²</span>}
          {bien.nbChambres !== null && (
            <span>
              {bien.nbChambres} chambre{bien.nbChambres > 1 ? 's' : ''}
            </span>
          )}
          <span>{bien.meuble ? 'Meublé' : 'Non meublé'}</span>
        </p>

        <div className="fiche-prix">
          {enVente ? (
            <span className="loyer">
              {formaterFCFA(annonce.prixVente)} <small>F</small>
            </span>
          ) : (
            <>
              <span className="loyer">
                {formaterFCFA(annonce.loyerMontant)} <small>F/mois</small>
              </span>
              <span className="entree">
                <span className="cle">à la signature</span>
                <span className="valeur">{formaterFCFA(annonce.coutEntree.total)} F</span>
              </span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

/** Libellé lisible du type de bien, pour les titres de section. */
export function libelleType(type?: string): string {
  return type ? (LIBELLES_TYPE[type] ?? 'Biens') : 'Biens';
}
