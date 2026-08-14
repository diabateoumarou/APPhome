/**
 * Profil de l'utilisateur.
 *
 * L'adresse n'est pas un champ de confort : elle figure au bail comme élection
 * de domicile (art. 16), et conditionne l'opposabilité des notifications
 * contractuelles. L'écran le dit plutôt que de la présenter comme facultative.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 * Date   : 14 août 2026
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { appelAuthentifie, lireJeton, fermerSession } from '@/lib/session';

interface Profil {
  id: string;
  nomComplet: string;
  telephone: string;
  email: string | null;
  adresse: string | null;
  commune: string | null;
  telephoneVerifieLe: string | null;
  complet: boolean;
  mentionsManquantes: string[];
}

export default function PageProfil() {
  const router = useRouter();

  const [profil, setProfil] = useState<Profil | null>(null);
  const [nomComplet, setNomComplet] = useState('');
  const [email, setEmail] = useState('');
  const [adresse, setAdresse] = useState('');
  const [commune, setCommune] = useState('');

  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistre, setEnregistre] = useState(false);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    try {
      const p = await appelAuthentifie<Profil>('/profil');
      setProfil(p);
      setNomComplet(p.nomComplet);
      setEmail(p.email ?? '');
      setAdresse(p.adresse ?? '');
      setCommune(p.commune ?? '');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Votre profil ne se charge pas.');
    }
  }, []);

  useEffect(() => {
    if (!lireJeton()) {
      router.replace('/connexion?suite=%2Fprofil');
      return;
    }
    void charger();
  }, [router, charger]);

  const enregistrer = async () => {
    setErreur(null);
    setEnregistre(false);
    setEnCours(true);
    try {
      await appelAuthentifie('/profil', {
        method: 'PATCH',
        body: JSON.stringify({
          nomComplet,
          email: email || undefined,
          adresse: adresse || undefined,
          commune: commune || undefined,
        }),
      });
      await charger();
      setEnregistre(true);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'enregistrement a échoué.");
    } finally {
      setEnCours(false);
    }
  };

  const seDeconnecter = () => {
    fermerSession();
    router.push('/');
  };

  if (!profil) {
    return (
      <section className="detail">
        <div className="enveloppe">
          <div className="formulaire">
            <h1>Chargement…</h1>
            {erreur && <p className="message-erreur">{erreur}</p>}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="detail">
      <div className="enveloppe">
        <div className="formulaire large-formulaire">
          <h1>Votre profil</h1>
          <p className="aide-page">
            Ces informations figurent sur vos contrats de bail. Elles ne sont visibles que par
            les bailleurs auprès de qui vous candidatez.
          </p>

          {!profil.complet && (
            <div className="avis">
              <strong>Votre adresse est nécessaire pour candidater</strong>
              Elle sert d&apos;élection de domicile au contrat : c&apos;est à cette adresse que les
              notifications vous seront valablement adressées.
            </div>
          )}

          <div className="champ-form">
            <label htmlFor="nom">Nom et prénoms</label>
            <input
              id="nom"
              type="text"
              value={nomComplet}
              onChange={(e) => setNomComplet(e.target.value)}
              autoComplete="name"
            />
          </div>

          <div className="champ-form">
            <label htmlFor="tel">Numéro de téléphone</label>
            <input id="tel" type="tel" value={profil.telephone} disabled />
            <span className="indication">
              {profil.telephoneVerifieLe
                ? 'Numéro vérifié. Il sert à signer vos contrats.'
                : 'Numéro non vérifié.'}
            </span>
          </div>

          <div className="champ-form">
            <label htmlFor="email">Adresse e-mail</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Facultative"
              autoComplete="email"
            />
          </div>

          <div className="champ-form">
            <label htmlFor="adresse">Adresse de domicile</label>
            <input
              id="adresse"
              type="text"
              value={adresse}
              onChange={(e) => setAdresse(e.target.value)}
              placeholder="Rue L142, Angré 8e tranche"
              autoComplete="street-address"
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
              autoComplete="address-level2"
            />
          </div>

          {erreur && <p className="message-erreur">{erreur}</p>}
          {enregistre && <p className="message-succes">Vos informations sont à jour.</p>}

          <button
            type="button"
            className="bouton bouton-or large"
            onClick={enregistrer}
            disabled={enCours || nomComplet.trim().length < 2}
          >
            {enCours ? 'Enregistrement…' : 'Enregistrer'}
          </button>

          <div className="actions" style={{ marginTop: 18 }}>
            <Link href="/dossier" className="bouton bouton-ligne large">
              Voir mon dossier
            </Link>
            <button type="button" className="bouton bouton-ligne large" onClick={seDeconnecter}>
              Se déconnecter
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
