/**
 * Confirmation de réservation de visite.
 *
 * L'écran est atteint après avoir choisi un créneau sur la fiche bien. Il
 * réserve, puis affiche les coordonnées du bailleur — qui ne sont révélées
 * qu'à ce moment (REQ-RDV-07).
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 * Date   : 13 août 2026
 */
'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { appelAuthentifie, lireJeton } from '@/lib/session';
import { formaterDate, formaterHeure } from '@/lib/api';

interface VisiteConfirmee {
  id: string;
  statut: string;
  creneau: { debut: string; fin: string };
  bien: { commune: string };
}

interface DetailVisite {
  id: string;
  statut: string;
  debut: string;
  fin: string;
  annonce: { titre: string };
  bien: { commune: string; quartier: string | null; adresse?: string };
  contact?: { nomComplet: string; telephone: string };
}

function Reservation() {
  const router = useRouter();
  const params = useSearchParams();
  const creneauId = params.get('creneau');
  const annonceId = params.get('annonce');

  const [visite, setVisite] = useState<DetailVisite | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(true);

  const reserver = useCallback(async () => {
    if (!creneauId || !annonceId) {
      setErreur("Le créneau choisi n'est plus identifiable. Revenez à l'annonce.");
      setEnCours(false);
      return;
    }

    try {
      const reservation = await appelAuthentifie<VisiteConfirmee>('/visites', {
        method: 'POST',
        body: JSON.stringify({ creneauId, annonceId }),
      });
      // Le détail porte les coordonnées, que la réservation ne renvoie pas.
      const detail = await appelAuthentifie<DetailVisite>(`/visites/${reservation.id}`);
      setVisite(detail);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'La réservation a échoué.');
    } finally {
      setEnCours(false);
    }
  }, [creneauId, annonceId]);

  useEffect(() => {
    if (!lireJeton()) {
      const suite = `/visite?creneau=${creneauId ?? ''}&annonce=${annonceId ?? ''}`;
      router.replace(`/connexion?suite=${encodeURIComponent(suite)}`);
      return;
    }
    void reserver();
  }, [creneauId, annonceId, router, reserver]);

  if (enCours) {
    return (
      <div className="formulaire">
        <h1>Réservation en cours…</h1>
        <p className="aide-page">Nous confirmons votre créneau auprès du bailleur.</p>
      </div>
    );
  }

  if (erreur) {
    return (
      <div className="formulaire">
        <h1>La visite n&apos;a pas pu être réservée</h1>
        <p className="message-erreur">{erreur}</p>
        <Link href="/" className="bouton bouton-ligne large">
          Revenir aux annonces
        </Link>
      </div>
    );
  }

  if (!visite) return null;

  return (
    <div className="formulaire">
      <p className="pastille">Visite confirmée</p>
      <h1>{formaterDate(visite.debut)} à {formaterHeure(visite.debut)}</h1>
      <p className="aide-page">{visite.annonce.titre}</p>

      <dl className="recapitulatif">
        <div>
          <dt>Adresse</dt>
          <dd>
            {visite.bien.adresse ?? `${visite.bien.commune}${visite.bien.quartier ? ` — ${visite.bien.quartier}` : ''}`}
          </dd>
        </div>
        {visite.contact && (
          <div>
            <dt>Votre interlocuteur</dt>
            <dd>
              {visite.contact.nomComplet}
              <br />
              <a href={`tel:${visite.contact.telephone}`}>{visite.contact.telephone}</a>
            </dd>
          </div>
        )}
        <div>
          <dt>Horaire</dt>
          <dd>
            {formaterHeure(visite.debut)} — {formaterHeure(visite.fin)}
          </dd>
        </div>
      </dl>

      <p className="aide-page">
        Un rappel vous sera envoyé par SMS la veille. Vous pouvez annuler sans conséquence
        jusqu&apos;à quatre heures avant le rendez-vous.
      </p>

      <div className="actions">
        <Link href="/mes-visites" className="bouton bouton-or large">
          Voir mes visites
        </Link>
        <Link href="/" className="bouton bouton-ligne large">
          Continuer à chercher
        </Link>
      </div>
    </div>
  );
}

export default function PageVisite() {
  return (
    <section className="detail">
      <div className="enveloppe">
        <Suspense fallback={<div className="formulaire"><h1>Chargement…</h1></div>}>
          <Reservation />
        </Suspense>
      </div>
    </section>
  );
}
