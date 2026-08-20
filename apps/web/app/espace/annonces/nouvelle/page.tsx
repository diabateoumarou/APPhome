/**
 * Création d'une annonce.
 *
 * L'aperçu du relevé se recalcule en direct : le bailleur voit l'effet de
 * chaque valeur saisie sur le coût d'entrée avant même de soumettre, ce qui
 * lui évite l'aller-retour d'un rejet pour dépassement de plafond.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 * Date   : 14 août 2026
 */
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { creerAnnonce, soumettreAnnonce, listerMesBiens, type BienListe } from '@/lib/espace-api';

function fcfa(valeur: string): string {
  // Les zéros de tête doivent disparaître avant le regroupement par milliers,
  // sinon « 022 222 » reste affiché alors que la valeur numérique est 22 222.
  const n = valeur.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!n) return '0';
  return n.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function Formulaire() {
  const router = useRouter();
  const params = useSearchParams();
  const bienDepuisUrl = params.get('bien');

  // Sans bien précisé dans l'URL (accès direct à l'écran plutôt que depuis la
  // fiche d'un bien), on propose de le choisir plutôt que de laisser
  // échouer silencieusement la soumission.
  const [bienId, setBienId] = useState<string | null>(bienDepuisUrl);
  const [mesBiens, setMesBiens] = useState<BienListe[] | null>(null);

  useEffect(() => {
    if (bienDepuisUrl) return;
    listerMesBiens()
      .then((r) => setMesBiens(r.donnees))
      .catch(() => setMesBiens([]));
  }, [bienDepuisUrl]);

  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [loyer, setLoyer] = useState('');
  const [charges, setCharges] = useState('0');
  const [cautionMois, setCautionMois] = useState(2);
  const [avanceMois, setAvanceMois] = useState(2);
  const [frais, setFrais] = useState('0');

  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [etapeSoumission, setEtapeSoumission] = useState(false);

  const loyerNum = Number(loyer.replace(/\D/g, '')) || 0;
  const caution = loyerNum * cautionMois;
  const avance = loyerNum * avanceMois;
  const fraisNum = Number(frais.replace(/\D/g, '')) || 0;
  const total = caution + avance + fraisNum;
  const chargesNum = Number(charges.replace(/\D/g, '')) || 0;

  const enregistrer = async (soumettre: boolean) => {
    if (!bienId) {
      setErreur('Aucun bien sélectionné.');
      return;
    }
    setErreur(null);
    setEnCours(true);
    setEtapeSoumission(soumettre);
    try {
      const annonce = await creerAnnonce({
        bienId,
        transaction: 'location',
        titre,
        description: description || undefined,
        loyerMontant: String(loyerNum),
        chargesMontant: String(chargesNum),
        cautionNbMois: cautionMois,
        avanceNbMois: avanceMois,
        fraisAgenceMontant: String(fraisNum),
      });

      if (soumettre) {
        try {
          await soumettreAnnonce(annonce.id);
        } catch (e) {
          // L'annonce existe en brouillon même si la soumission échoue
          // (par exemple faute de photos) : on redirige quand même.
          setErreur(e instanceof Error ? e.message : 'La soumission a échoué.');
          router.push(`/espace/annonces/${annonce.id}`);
          return;
        }
      }

      router.push(`/espace/annonces/${annonce.id}`);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'enregistrement a échoué.");
    } finally {
      setEnCours(false);
    }
  };

  const valide = titre.trim().length >= 10 && loyerNum > 0;

  return (
    <div className="page-formulaire page-formulaire-large">
      <h1>Créer une annonce</h1>
      <p className="aide-page">
        Le coût d&apos;entrée est calculé automatiquement et plafonné par la loi n°2019-576.
      </p>

      <div className="colonnes-annonce">
        <div className="grille-formulaire grille-formulaire-simple">
          {!bienDepuisUrl && (
            <div className="champ-form champ-large">
              <label htmlFor="bien">Bien concerné</label>
              {mesBiens === null ? (
                <p className="sous-lieu">Chargement de vos biens…</p>
              ) : mesBiens.length === 0 ? (
                <p className="carte-erreur">
                  Aucun bien n&apos;est encore enregistré.{' '}
                  <a href="/espace/biens/nouveau">Ajoutez-en un</a> avant de créer une annonce.
                </p>
              ) : (
                <select
                  id="bien"
                  value={bienId ?? ''}
                  onChange={(e) => setBienId(e.target.value || null)}
                >
                  <option value="">Choisissez un bien</option>
                  {mesBiens.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.typeBien} — {b.adresse}, {b.commune}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="champ-form champ-large">
            <label htmlFor="titre">Titre de l&apos;annonce</label>
            <input
              id="titre"
              type="text"
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              placeholder="Appartement 3 pièces, résidence sécurisée"
            />
          </div>

          <div className="champ-form champ-large">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Appartement lumineux, proche commodités…"
            />
          </div>

          <div className="champ-form">
            <label htmlFor="loyer">Loyer mensuel (FCFA)</label>
            <input
              id="loyer"
              type="text"
              inputMode="numeric"
              value={fcfa(loyer)}
              onChange={(e) => setLoyer(e.target.value)}
              placeholder="150 000"
            />
          </div>

          <div className="champ-form">
            <label htmlFor="charges">Charges mensuelles (FCFA)</label>
            <input
              id="charges"
              type="text"
              inputMode="numeric"
              value={fcfa(charges)}
              onChange={(e) => setCharges(e.target.value)}
            />
          </div>

          <div className="champ-form">
            <label htmlFor="caution">Caution (mois de loyer)</label>
            <select
              id="caution"
              value={cautionMois}
              onChange={(e) => setCautionMois(Number(e.target.value))}
            >
              <option value={0}>Aucune</option>
              <option value={1}>1 mois</option>
              <option value={2}>2 mois — maximum légal</option>
            </select>
          </div>

          <div className="champ-form">
            <label htmlFor="avance">Avance (mois de loyer)</label>
            <select
              id="avance"
              value={avanceMois}
              onChange={(e) => setAvanceMois(Number(e.target.value))}
            >
              <option value={0}>Aucune</option>
              <option value={1}>1 mois</option>
              <option value={2}>2 mois — maximum légal</option>
            </select>
          </div>

          <div className="champ-form champ-large">
            <label htmlFor="frais">Frais d&apos;agence (FCFA)</label>
            <input
              id="frais"
              type="text"
              inputMode="numeric"
              value={fcfa(frais)}
              onChange={(e) => setFrais(e.target.value)}
            />
          </div>
        </div>

        <aside className="apercu-releve">
          <div className="releve">
            <div className="releve-entete">
              <span className="releve-titre">Aperçu du coût d&apos;entrée</span>
            </div>
            <div className="ligne">
              <span className="libelle">
                Caution
                <span className="calcul">
                  {fcfa(loyer)} × {cautionMois} mois
                </span>
              </span>
              <span className="montant">{fcfa(String(caution))}</span>
            </div>
            <div className="ligne">
              <span className="libelle">
                Avance
                <span className="calcul">
                  {fcfa(loyer)} × {avanceMois} mois
                </span>
              </span>
              <span className="montant">{fcfa(String(avance))}</span>
            </div>
            <div className="ligne">
              <span className="libelle">Frais d&apos;agence</span>
              <span className="montant">{fcfa(String(fraisNum))}</span>
            </div>
            <div className="ligne ligne-total">
              <span className="libelle">À la signature</span>
              <span className="montant">{fcfa(String(total))} F</span>
            </div>
            <p className="releve-note">
              Puis {fcfa(String(loyerNum + chargesNum))} F par mois, charges comprises.
            </p>
          </div>
        </aside>
      </div>

      {erreur && <div className="carte-erreur">{erreur}</div>}

      <div className="actions-formulaire">
        <button
          type="button"
          className="bouton bouton-ligne large"
          onClick={() => enregistrer(false)}
          disabled={enCours || !valide}
        >
          {enCours && !etapeSoumission ? 'Enregistrement…' : 'Enregistrer en brouillon'}
        </button>
        <button
          type="button"
          className="bouton bouton-or large"
          onClick={() => enregistrer(true)}
          disabled={enCours || !valide}
        >
          {enCours && etapeSoumission ? 'Envoi…' : 'Soumettre à modération'}
        </button>
      </div>
      {!valide && (
        <p className="indication-bloquante">
          {titre.trim().length < 10
            ? `Le titre doit compter au moins 10 caractères (${titre.trim().length}/10).`
            : 'Indiquez un loyer supérieur à zéro.'}
        </p>
      )}
      <p className="indication" style={{ marginTop: 10 }}>
        Trois photos seront ensuite requises sur la fiche du bien pour passer en modération.
      </p>
    </div>
  );
}

export default function NouvelleAnnonce() {
  return (
    <Suspense fallback={<p className="chargement">Chargement…</p>}>
      <Formulaire />
    </Suspense>
  );
}
