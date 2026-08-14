/**
 * Page d'accueil et de recherche.
 *
 * Rendue côté serveur : les annonces doivent être indexables, le référencement
 * naturel étant le premier canal d'acquisition sur ce marché.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 * Date   : 13 août 2026
 */
import { rechercherAnnonces, type FiltresRecherche } from '@/lib/api';
import { FicheAnnonce, libelleType } from '@/components/FicheAnnonce';
import { Releve } from '@/components/Releve';

export const dynamic = 'force-dynamic';

/** Exemple affiché dans le hero quand aucune annonce n'est encore publiée. */
const EXEMPLE = {
  id: 'exemple',
  titre: 'Appartement 3 pièces',
  description: null,
  transaction: 'location' as const,
  loyerMontant: '150000',
  prixVente: null,
  chargesMontant: '10000',
  cautionNbMois: 2,
  avanceNbMois: 2,
  fraisAgenceMontant: '150000',
  disponibleLe: null,
  publieeLe: null,
  bien: {
    commune: 'Cocody',
    quartier: 'Angré',
    typeBien: 'appartement',
    superficieM2: '78',
    nbPieces: 3,
    nbChambres: 2,
    nbSallesEau: 1,
    meuble: false,
    photos: [],
  },
  coutEntree: {
    caution: '300000',
    avance: '300000',
    fraisAgence: '150000',
    total: '750000',
  },
};

export default async function Accueil({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const filtres: FiltresRecherche = {
    commune: params.commune,
    typeBien: params.typeBien,
    budgetMax: params.budgetMax,
    transaction: params.transaction ?? 'location',
    tri: params.tri ?? 'recent',
    page: params.page,
  };

  let resultats: Awaited<ReturnType<typeof rechercherAnnonces>> | null = null;
  let erreur: string | null = null;

  try {
    resultats = await rechercherAnnonces(filtres);
  } catch (e) {
    erreur = e instanceof Error ? e.message : 'Service indisponible.';
  }

  // Le hero illustre le relevé avec la première annonce réelle si elle existe,
  // faute de quoi avec un exemple : la signature ne doit jamais être vide.
  const vitrine = resultats?.donnees[0] ?? EXEMPLE;
  const titreSection = filtres.commune
    ? `${libelleType(filtres.typeBien)}s à ${filtres.commune}`
    : 'Biens disponibles';

  return (
    <>
      <section className="hero">
        <div className="enveloppe">
          <div className="hero-grille">
            <div>
              <p className="surtitre">Abidjan · location</p>
              <h1>
                Le loyer, c&apos;est une chose.
                <br />
                Ce qu&apos;il faut sortir <em>aujourd&apos;hui</em>, c&apos;en est une autre.
              </h1>
              <p>
                Chaque annonce affiche l&apos;arithmétique complète, avant même que vous
                décrochiez votre téléphone.
              </p>

              <div className="confiance">
                <div>
                  <strong>Caution sous séquestre</strong>
                  <span>Conservée par la plateforme, restituée après l&apos;état des lieux.</span>
                </div>
                <div>
                  <strong>Bailleurs vérifiés</strong>
                  <span>Pièce d&apos;identité et titre de propriété contrôlés avant publication.</span>
                </div>
              </div>
            </div>

            <Releve
              annonce={vitrine}
              reference={`${vitrine.bien.nbPieces ?? ''} pièces · ${vitrine.bien.commune}`}
            />
          </div>

          <form className="recherche" role="search" action="/" method="get">
            <div className="champ">
              <label htmlFor="commune">Où</label>
              <input
                id="commune"
                name="commune"
                type="text"
                placeholder="Cocody, Marcory, Yopougon…"
                defaultValue={filtres.commune ?? ''}
              />
            </div>
            <div className="champ">
              <label htmlFor="typeBien">Type de bien</label>
              <select id="typeBien" name="typeBien" defaultValue={filtres.typeBien ?? ''}>
                <option value="">Tous les biens</option>
                <option value="appartement">Appartement</option>
                <option value="maison">Maison</option>
                <option value="studio">Studio</option>
                <option value="bureau">Bureau</option>
              </select>
            </div>
            <div className="champ">
              <label htmlFor="budgetMax">Loyer maximum</label>
              <select id="budgetMax" name="budgetMax" defaultValue={filtres.budgetMax ?? ''}>
                <option value="">Sans limite</option>
                <option value="100000">100 000 F</option>
                <option value="200000">200 000 F</option>
                <option value="350000">350 000 F</option>
                <option value="500000">500 000 F</option>
              </select>
            </div>
            <button type="submit" className="bouton bouton-or">
              Voir les biens
            </button>
          </form>
        </div>
      </section>

      <section className="resultats">
        <div className="enveloppe">
          {erreur ? (
            <div className="erreur">
              <strong>Les annonces ne se chargent pas</strong>
              Le service est momentanément injoignable. Réessayez dans quelques instants.
            </div>
          ) : (
            <>
              <div className="resultats-entete">
                <h2>{titreSection}</h2>
                <span className="compte">
                  {resultats?.pagination.total ?? 0} bien
                  {(resultats?.pagination.total ?? 0) > 1 ? 's' : ''} disponible
                  {(resultats?.pagination.total ?? 0) > 1 ? 's' : ''}
                </span>
                <div className="tri">
                  <TriLien filtres={filtres} valeur="recent" libelle="Plus récents" />
                  <TriLien filtres={filtres} valeur="prix_croissant" libelle="Loyer croissant" />
                </div>
              </div>

              {resultats && resultats.donnees.length > 0 ? (
                <div className="grille">
                  {resultats.donnees.map((annonce) => (
                    <FicheAnnonce key={annonce.id} annonce={annonce} />
                  ))}
                </div>
              ) : (
                <div className="erreur">
                  <strong>Aucun bien ne correspond</strong>
                  Élargissez la commune ou le budget, ou consultez tous les biens disponibles.
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
}

/** Lien de tri conservant les filtres en cours. */
function TriLien({
  filtres,
  valeur,
  libelle,
}: {
  filtres: FiltresRecherche;
  valeur: string;
  libelle: string;
}) {
  const params = new URLSearchParams(
    Object.entries({ ...filtres, tri: valeur }).filter(([, v]) => Boolean(v)) as [string, string][],
  );
  const actif = (filtres.tri ?? 'recent') === valeur;

  return (
    <a href={`/?${params.toString()}`} className={actif ? 'actif' : ''}>
      <button type="button" className={actif ? 'actif' : ''}>
        {libelle}
      </button>
    </a>
  );
}
