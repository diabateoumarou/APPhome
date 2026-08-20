/**
 * Création d'un bien.
 *
 * La garde KYC est appliquée côté API (RG-002) : un bailleur non vérifié
 * recevra un 403 explicite que le formulaire relaie tel quel, sans essayer
 * de deviner la cause.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 * Date   : 14 août 2026
 */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { creerBien, listerEquipements, type Equipement } from '@/lib/espace-api';

const TYPES = [
  { valeur: 'appartement', libelle: 'Appartement' },
  { valeur: 'maison', libelle: 'Maison' },
  { valeur: 'studio', libelle: 'Studio' },
  { valeur: 'bureau', libelle: 'Bureau' },
  { valeur: 'commerce', libelle: 'Local commercial' },
  { valeur: 'terrain', libelle: 'Terrain' },
];

export default function NouveauBien() {
  const router = useRouter();

  const [equipements, setEquipements] = useState<Equipement[]>([]);
  const [choisis, setChoisis] = useState<Set<string>>(new Set());

  const [typeBien, setTypeBien] = useState('appartement');
  const [adresse, setAdresse] = useState('');
  const [commune, setCommune] = useState('');
  const [quartier, setQuartier] = useState('');
  const [superficie, setSuperficie] = useState('');
  const [nbPieces, setNbPieces] = useState('');
  const [nbChambres, setNbChambres] = useState('');
  const [nbSallesEau, setNbSallesEau] = useState('');
  const [meuble, setMeuble] = useState(false);
  const [dependances, setDependances] = useState('');

  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    listerEquipements()
      .then(setEquipements)
      .catch(() => undefined);
  }, []);

  const basculer = (code: string) => {
    setChoisis((precedent) => {
      const suivant = new Set(precedent);
      if (suivant.has(code)) suivant.delete(code);
      else suivant.add(code);
      return suivant;
    });
  };

  const enregistrer = async () => {
    setErreur(null);
    setEnCours(true);
    try {
      const bien = await creerBien({
        typeBien,
        adresse,
        commune,
        quartier: quartier || undefined,
        superficieM2: superficie ? Number(superficie) : undefined,
        nbPieces: nbPieces ? Number(nbPieces) : undefined,
        nbChambres: nbChambres ? Number(nbChambres) : undefined,
        nbSallesEau: nbSallesEau ? Number(nbSallesEau) : undefined,
        meuble,
        dependances: dependances || undefined,
        equipements: Array.from(choisis),
      });
      router.push(`/espace/biens/${bien.id}?nouveau=1`);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'enregistrement a échoué.");
    } finally {
      setEnCours(false);
    }
  };

  const valide = adresse.trim().length >= 5 && commune.trim().length >= 2;

  return (
    <div className="page-formulaire">
      <h1>Ajouter un bien</h1>
      <p className="aide-page">
        Renseignez les caractéristiques du logement. Vous créerez son annonce à l&apos;étape
        suivante.
      </p>

      {erreur && (
        <div className="carte-erreur">
          {erreur}
          {erreur.includes('vérifiée') && (
            <p className="carte-erreur-aide">
              Votre pièce d&apos;identité et votre titre de propriété doivent être vérifiés avant
              de publier un bien. Cette vérification est faite manuellement par notre équipe.
            </p>
          )}
        </div>
      )}

      <div className="grille-formulaire">
        <div className="champ-form">
          <label htmlFor="type">Type de bien</label>
          <select id="type" value={typeBien} onChange={(e) => setTypeBien(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t.valeur} value={t.valeur}>
                {t.libelle}
              </option>
            ))}
          </select>
        </div>

        <div className="champ-form champ-large">
          <label htmlFor="adresse">Adresse</label>
          <input
            id="adresse"
            type="text"
            value={adresse}
            onChange={(e) => setAdresse(e.target.value)}
            placeholder="Rue des Jardins, Angré 8e tranche"
          />
        </div>

        <div className="champ-form">
          <label htmlFor="commune">Commune</label>
          <input
            id="commune"
            type="text"
            value={commune}
            onChange={(e) => setCommune(e.target.value)}
            placeholder="Cocody"
          />
        </div>

        <div className="champ-form">
          <label htmlFor="quartier">Quartier</label>
          <input
            id="quartier"
            type="text"
            value={quartier}
            onChange={(e) => setQuartier(e.target.value)}
            placeholder="Angré 8e tranche"
          />
        </div>

        <div className="champ-form">
          <label htmlFor="superficie">Superficie (m²)</label>
          <input
            id="superficie"
            type="number"
            value={superficie}
            onChange={(e) => setSuperficie(e.target.value)}
            min="1"
          />
        </div>

        <div className="champ-form">
          <label htmlFor="pieces">Pièces</label>
          <input
            id="pieces"
            type="number"
            value={nbPieces}
            onChange={(e) => setNbPieces(e.target.value)}
            min="0"
          />
        </div>

        <div className="champ-form">
          <label htmlFor="chambres">Chambres</label>
          <input
            id="chambres"
            type="number"
            value={nbChambres}
            onChange={(e) => setNbChambres(e.target.value)}
            min="0"
          />
        </div>

        <div className="champ-form">
          <label htmlFor="sallesEau">Salles d&apos;eau</label>
          <input
            id="sallesEau"
            type="number"
            value={nbSallesEau}
            onChange={(e) => setNbSallesEau(e.target.value)}
            min="0"
          />
        </div>

        <div className="champ-form champ-large">
          <label htmlFor="dependances">Dépendances</label>
          <input
            id="dependances"
            type="text"
            value={dependances}
            onChange={(e) => setDependances(e.target.value)}
            placeholder="Cour, garage, dépendance 1 pièce"
          />
        </div>
      </div>

      <label className="case-simple">
        <input type="checkbox" checked={meuble} onChange={(e) => setMeuble(e.target.checked)} />
        <span>Logement meublé</span>
      </label>

      {equipements.length > 0 && (
        <div className="bloc-equipements">
          <p className="sous-titre-form">Équipements</p>
          <div className="puces-equipements">
            {equipements.map((eq) => (
              <button
                key={eq.code}
                type="button"
                className={choisis.has(eq.code) ? 'puce-choisie' : 'puce'}
                onClick={() => basculer(eq.code)}
              >
                {eq.libelle}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="actions-formulaire">
        <button
          type="button"
          className="bouton bouton-or large"
          onClick={enregistrer}
          disabled={enCours || !valide}
        >
          {enCours ? 'Enregistrement…' : 'Enregistrer le bien'}
        </button>
      </div>
    </div>
  );
}
