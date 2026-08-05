-- ============================================================================
-- Contraintes métier non exprimables en Prisma
-- À appliquer après `prisma migrate` — elles constituent la défense en
-- profondeur : même un bug applicatif ne peut produire un contrat illégal.
--
-- Auteur : DIABATE Oumarou — Chef de Service Customer Support N1,
--          DATACONNECT AFRICA | Ingénieur Système & Infrastructure Cloud
-- Date   : 05 août 2026
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- --- Plafonds légaux (loi n°2019-576 : 2 mois caution + 2 mois avance) ------
ALTER TABLE annonce
  ADD CONSTRAINT annonce_caution_legale CHECK (caution_nb_mois BETWEEN 0 AND 2),
  ADD CONSTRAINT annonce_avance_legale  CHECK (avance_nb_mois  BETWEEN 0 AND 2),
  ADD CONSTRAINT annonce_prix_coherent CHECK (
    (transaction = 'location' AND loyer_montant IS NOT NULL)
    OR (transaction = 'vente' AND prix_vente IS NOT NULL)),
  ADD CONSTRAINT annonce_rejet_motive CHECK (statut <> 'rejetee' OR motif_rejet IS NOT NULL);

ALTER TABLE contrat
  ADD CONSTRAINT contrat_caution_legale CHECK (caution_nb_mois BETWEEN 0 AND 2),
  ADD CONSTRAINT contrat_avance_legale  CHECK (avance_nb_mois  BETWEEN 0 AND 2),
  ADD CONSTRAINT contrat_total_entree_legal CHECK (caution_nb_mois + avance_nb_mois <= 4),
  ADD CONSTRAINT contrat_jour_echeance CHECK (jour_echeance BETWEEN 1 AND 28),
  ADD CONSTRAINT contrat_montants_coherents CHECK (
    caution_montant = loyer_montant * caution_nb_mois
    AND avance_montant = loyer_montant * avance_nb_mois);

-- --- Montants strictement positifs ------------------------------------------
ALTER TABLE echeance
  ADD CONSTRAINT echeance_montant_positif CHECK (montant_du > 0),
  ADD CONSTRAINT echeance_paiement_borne  CHECK (montant_paye BETWEEN 0 AND montant_du);

ALTER TABLE paiement ADD CONSTRAINT paiement_montant_positif CHECK (montant > 0);

ALTER TABLE compte_sequestre ADD CONSTRAINT sequestre_solde_positif CHECK (solde >= 0);

ALTER TABLE reversement
  ADD CONSTRAINT reversement_net_coherent CHECK (montant_net = montant_brut - frais_agence);

-- --- Créneaux de visite : aucun chevauchement sur un même bien (REQ-RDV-01) --
ALTER TABLE creneau_visite
  ADD CONSTRAINT creneau_duree CHECK (fin > debut),
  ADD CONSTRAINT creneau_sans_chevauchement
    EXCLUDE USING gist (bien_id WITH =, tstzrange(debut, fin) WITH &&);

-- --- Séquestre : retenue/restitution exigent co-validation ou litige (RG-PAY-A)
ALTER TABLE mouvement_sequestre
  ADD CONSTRAINT mvt_covalidation CHECK (
    execute_le IS NULL
    OR type NOT IN ('retenue','restitution')
    OR (valide_bailleur_le IS NOT NULL AND valide_locataire_le IS NOT NULL)
    OR litige_id IS NOT NULL);

-- --- Motifs obligatoires -----------------------------------------------------
ALTER TABLE kyc_verification
  ADD CONSTRAINT kyc_rejet_motive CHECK (statut <> 'rejete' OR motif_rejet IS NOT NULL);
ALTER TABLE candidature
  ADD CONSTRAINT candidature_refus_motive CHECK (statut <> 'refusee' OR motif_refus_code IS NOT NULL);
ALTER TABLE demande_maintenance
  ADD CONSTRAINT maintenance_rejet_motive CHECK (statut <> 'rejete' OR motif_rejet IS NOT NULL);

-- --- Garde : pas d'activation de contrat sans les deux signatures ------------
CREATE OR REPLACE FUNCTION verifier_signatures_contrat() RETURNS trigger AS $$
BEGIN
  IF NEW.statut IN ('signe','actif') AND OLD.statut NOT IN ('signe','actif') THEN
    IF (SELECT count(*) FROM signature WHERE contrat_id = NEW.id) < 2 THEN
      RAISE EXCEPTION 'Contrat % : les deux signatures (bailleur et locataire) sont requises', NEW.reference;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contrat_signatures ON contrat;
CREATE TRIGGER trg_contrat_signatures
  BEFORE UPDATE OF statut ON contrat
  FOR EACH ROW EXECUTE FUNCTION verifier_signatures_contrat();

-- --- Index complémentaires ---------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_annonce_publiee ON annonce (transaction, loyer_montant)
  WHERE statut = 'publiee';
CREATE INDEX IF NOT EXISTS idx_bien_quartier_trgm ON bien USING gin (quartier gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_paiement_a_reconcilier ON paiement (created_at)
  WHERE statut = 'en_attente';

-- --- Audit append-only : à exécuter après création du rôle applicatif --------
-- REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM app_role;
