/**
 * Dossier de candidature.
 *
 * Le dossier est constitué une fois et réutilisé sur plusieurs annonces
 * (REQ-DOS-02) : c'est l'argument d'adoption le plus fort côté locataire sur
 * un marché où chaque agence redemande les mêmes papiers.
 *
 * Le consentement au partage est demandé explicitement et par candidature :
 * postuler chez un bailleur n'autorise pas les autres à voir vos justificatifs
 * (loi n°2013-450).
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 * Date   : 13 août 2026
 */
'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { appelAuthentifie, lireJeton } from '@/lib/session';

interface Piece {
  id: string;
  typePiece: string;
  statut: string;
}

interface Dossier {
  id: string;
  statut: 'incomplet' | 'complet';
  pieces: Piece[];
  piecesManquantes: string[];
}

interface Profil {
  adresse: string | null;
  commune: string | null;
  complet: boolean;
  mentionsManquantes: string[];
}

const LIBELLES: Record<string, string> = {
  identite: "Pièce d'identité",
  revenus: 'Justificatif de revenus',
  attestation_employeur: "Attestation d'employeur",
  garant_identite: "Pièce d'identité du garant",
  garant_engagement: "Engagement du garant",
};

const AIDES: Record<string, string> = {
  identite: 'CNI, passeport ou attestation d’identité, recto-verso.',
  revenus: 'Trois derniers bulletins de salaire, ou attestation de revenus.',
};

function Candidature() {
  const router = useRouter();
  const params = useSearchParams();
  const annonceId = params.get('annonce');

  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [consentement, setConsentement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [televersement, setTeleversement] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const [d, p] = await Promise.all([
        appelAuthentifie<Dossier>('/dossier'),
        appelAuthentifie<Profil>('/profil'),
      ]);
      setDossier(d);
      setProfil(p);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Votre dossier ne se charge pas.');
    }
  }, []);

  useEffect(() => {
    if (!lireJeton()) {
      const suite = `/dossier?annonce=${annonceId ?? ''}`;
      router.replace(`/connexion?suite=${encodeURIComponent(suite)}`);
      return;
    }
    void charger();
  }, [annonceId, router, charger]);

  const televerser = async (typePiece: string, fichier: File) => {
    setErreur(null);
    setTeleversement(typePiece);
    try {
      const corps = new FormData();
      corps.append('fichier', fichier);
      corps.append('typePiece', typePiece);
      await appelAuthentifie('/dossier/pieces', { method: 'POST', body: corps });
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Le document n’a pas pu être envoyé.');
    } finally {
      setTeleversement(null);
    }
  };

  const candidater = async () => {
    if (!annonceId) return;
    setErreur(null);
    setEnCours(true);
    try {
      await appelAuthentifie('/candidatures', {
        method: 'POST',
        body: JSON.stringify({ annonceId, consentementPartagePieces: consentement }),
      });
      setSucces(true);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'La candidature n’a pas pu être déposée.');
    } finally {
      setEnCours(false);
    }
  };

  if (succes) {
    return (
      <div className="formulaire">
        <p className="pastille">Candidature déposée</p>
        <h1>Le bailleur a reçu votre dossier</h1>
        <p className="aide-page">
          Vous serez averti par SMS dès qu&apos;une décision sera prise. Votre dossier reste
          disponible pour postuler à d&apos;autres biens sans le reconstituer.
        </p>
        <div className="actions">
          <Link href="/" className="bouton bouton-or large">
            Continuer à chercher
          </Link>
        </div>
      </div>
    );
  }

  if (!dossier) {
    return (
      <div className="formulaire">
        <h1>Chargement de votre dossier…</h1>
        {erreur && <p className="message-erreur">{erreur}</p>}
      </div>
    );
  }

  const requises = ['identite', 'revenus'];
  const profilIncomplet = profil && !profil.complet;

  return (
    <div className="formulaire large-formulaire">
      <h1>Votre dossier</h1>
      <p className="aide-page">
        Constitué une fois, il vous sert pour toutes vos candidatures. Vous choisissez à chaque
        fois si le bailleur peut consulter vos justificatifs.
      </p>

      {profilIncomplet && (
        <div className="avis">
          <strong>Renseignez votre adresse</strong>
          Elle figure au contrat de bail comme élection de domicile. Sans elle, votre candidature
          ne peut pas être transmise.
          <Link href="/profil" className="bouton bouton-ligne" style={{ marginTop: 10 }}>
            Compléter mon profil
          </Link>
        </div>
      )}

      <div className="pieces">
        {requises.map((type) => {
          const piece = dossier.pieces.find((p) => p.typePiece === type);
          const enChargement = televersement === type;

          return (
            <div className={`piece ${piece ? 'fournie' : ''}`} key={type}>
              <div className="piece-texte">
                <strong>{LIBELLES[type]}</strong>
                <span>{piece ? 'Document reçu' : (AIDES[type] ?? 'PDF ou photo, 15 Mo maximum.')}</span>
              </div>

              <label className="bouton bouton-ligne">
                {enChargement ? 'Envoi…' : piece ? 'Remplacer' : 'Ajouter'}
                <input
                  type="file"
                  accept=".pdf,image/jpeg,image/png"
                  hidden
                  disabled={enChargement}
                  onChange={(e) => {
                    const fichier = e.target.files?.[0];
                    if (fichier) void televerser(type, fichier);
                  }}
                />
              </label>
            </div>
          );
        })}
      </div>

      {annonceId && (
        <>
          <label className="consentement">
            <input
              type="checkbox"
              checked={consentement}
              onChange={(e) => setConsentement(e.target.checked)}
            />
            <span>
              J&apos;autorise ce bailleur à consulter mes justificatifs. Sans cet accord, il verra
              que mon dossier est complet mais n&apos;aura pas accès aux documents.
            </span>
          </label>

          {erreur && <p className="message-erreur">{erreur}</p>}

          <button
            type="button"
            className="bouton bouton-or large"
            onClick={candidater}
            disabled={enCours || dossier.statut !== 'complet' || Boolean(profilIncomplet)}
          >
            {enCours ? 'Envoi…' : 'Déposer ma candidature'}
          </button>

          {dossier.statut !== 'complet' && (
            <p className="indication" style={{ marginTop: 10 }}>
              Ajoutez les documents manquants pour pouvoir candidater.
            </p>
          )}
        </>
      )}

      {!annonceId && erreur && <p className="message-erreur">{erreur}</p>}
    </div>
  );
}

export default function PageDossier() {
  return (
    <section className="detail">
      <div className="enveloppe">
        <Suspense fallback={<div className="formulaire"><h1>Chargement…</h1></div>}>
          <Candidature />
        </Suspense>
      </div>
    </section>
  );
}
