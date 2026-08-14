/**
 * Connexion et inscription.
 *
 * Un seul écran pour les deux : la plupart des visiteurs arrivent sans compte,
 * et les obliger à choisir entre deux boutons avant même d'avoir saisi leur
 * numéro ajoute une étape sans valeur.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 * Date   : 13 août 2026
 */
'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { appelPublic, enregistrerSession, type Jetons } from '@/lib/session';

type Etape = 'connexion' | 'inscription' | 'code';

function Formulaire() {
  const router = useRouter();
  const params = useSearchParams();
  const suite = params.get('suite') ?? '/';

  const [etape, setEtape] = useState<Etape>('connexion');
  const [telephone, setTelephone] = useState('+225');
  const [nomComplet, setNomComplet] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const executer = async (action: () => Promise<void>) => {
    setErreur(null);
    setEnCours(true);
    try {
      await action();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Une erreur est survenue.');
    } finally {
      setEnCours(false);
    }
  };

  const seConnecter = () =>
    executer(async () => {
      const jetons = await appelPublic<Jetons>('/auth/connexion', {
        method: 'POST',
        body: JSON.stringify({ telephone, motDePasse }),
      });
      enregistrerSession(jetons);
      router.push(suite);
    });

  const sInscrire = () =>
    executer(async () => {
      await appelPublic<{ message: string }>('/auth/inscription', {
        method: 'POST',
        body: JSON.stringify({ telephone, nomComplet, motDePasse }),
      });
      setInfo(`Un code à 6 chiffres vient d'être envoyé au ${telephone}.`);
      setEtape('code');
    });

  const verifierCode = () =>
    executer(async () => {
      const jetons = await appelPublic<Jetons>('/auth/otp/verification', {
        method: 'POST',
        body: JSON.stringify({ telephone, code }),
      });
      enregistrerSession(jetons, nomComplet);
      router.push(suite);
    });

  return (
    <section className="detail">
      <div className="enveloppe">
        <div className="formulaire">
          {etape === 'connexion' && (
            <>
              <h1>Votre numéro suffit</h1>
              <p className="aide-page">
                Il vous identifie et reçoit vos confirmations de visite.
              </p>

              <div className="champ-form">
                <label htmlFor="tel">Numéro de téléphone</label>
                <input
                  id="tel"
                  type="tel"
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  placeholder="+2250700000001"
                  autoComplete="tel"
                />
              </div>

              <div className="champ-form">
                <label htmlFor="mdp">Mot de passe</label>
                <input
                  id="mdp"
                  type="password"
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              {erreur && <p className="message-erreur">{erreur}</p>}

              <button
                type="button"
                className="bouton bouton-or large"
                onClick={seConnecter}
                disabled={enCours || motDePasse.length < 10}
              >
                {enCours ? 'Connexion…' : 'Se connecter'}
              </button>

              <p className="bascule">
                Pas encore de compte ?{' '}
                <button type="button" onClick={() => { setErreur(null); setEtape('inscription'); }}>
                  Créer un compte
                </button>
              </p>
            </>
          )}

          {etape === 'inscription' && (
            <>
              <h1>Créer votre compte</h1>
              <p className="aide-page">
                Vous recevrez un code par SMS pour confirmer votre numéro.
              </p>

              <div className="champ-form">
                <label htmlFor="nom">Nom et prénoms</label>
                <input
                  id="nom"
                  type="text"
                  value={nomComplet}
                  onChange={(e) => setNomComplet(e.target.value)}
                  placeholder="Koné Adjoua"
                  autoComplete="name"
                />
              </div>

              <div className="champ-form">
                <label htmlFor="tel2">Numéro de téléphone</label>
                <input
                  id="tel2"
                  type="tel"
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  placeholder="+2250700000001"
                  autoComplete="tel"
                />
              </div>

              <div className="champ-form">
                <label htmlFor="mdp2">Mot de passe</label>
                <input
                  id="mdp2"
                  type="password"
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  autoComplete="new-password"
                />
                <span className="indication">10 caractères minimum</span>
              </div>

              {erreur && <p className="message-erreur">{erreur}</p>}

              <button
                type="button"
                className="bouton bouton-or large"
                onClick={sInscrire}
                disabled={enCours || motDePasse.length < 10 || nomComplet.length < 2}
              >
                {enCours ? 'Envoi du code…' : 'Recevoir mon code'}
              </button>

              <p className="bascule">
                Vous avez déjà un compte ?{' '}
                <button type="button" onClick={() => { setErreur(null); setEtape('connexion'); }}>
                  Se connecter
                </button>
              </p>
            </>
          )}

          {etape === 'code' && (
            <>
              <h1>Entrez le code reçu</h1>
              {info && <p className="aide-page">{info}</p>}

              <div className="champ-form">
                <label htmlFor="code">Code à 6 chiffres</label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  className="saisie-code"
                  autoComplete="one-time-code"
                />
                <span className="indication">Le code expire dans 5 minutes.</span>
              </div>

              {erreur && <p className="message-erreur">{erreur}</p>}

              <button
                type="button"
                className="bouton bouton-or large"
                onClick={verifierCode}
                disabled={enCours || code.length !== 6}
              >
                {enCours ? 'Vérification…' : 'Confirmer'}
              </button>

              <p className="bascule">
                <button type="button" onClick={() => setEtape('inscription')}>
                  Modifier mon numéro
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export default function Connexion() {
  return (
    <Suspense
      fallback={
        <section className="detail">
          <div className="enveloppe" />
        </section>
      }
    >
      <Formulaire />
    </Suspense>
  );
}
