-- ============================================================================
-- Tests des garde-fous métier appliqués par le moteur PostgreSQL.
-- Exécutés en CI : ils échouent si une règle légale ou financière est perdue.
--   1. Caution > 2 mois refusée (loi n°2019-576)
--   2. Contrat conforme (2+2) accepté
--   3. Activation de contrat sans les 2 signatures refusée
--   4. Activation avec 2 signatures acceptée
--   5. Chevauchement de créneaux de visite refusé
--   6. Retenue sur séquestre sans co-validation refusée (RG-PAY-A)
--
-- Auteur : DIABATE Oumarou — Chef de Service Customer Support N1,
--          DATACONNECT AFRICA · 05 août 2026
-- ============================================================================

BEGIN;

-- Jeu de données minimal
INSERT INTO agence (id, nom) VALUES ('a0000000-0000-0000-0000-000000000001','Agence Test');
INSERT INTO utilisateur (id, telephone, mot_de_passe_hash, nom_complet) VALUES
 ('b0000000-0000-0000-0000-000000000001','+2250700000001','h','Bailleur Test'),
 ('b0000000-0000-0000-0000-000000000002','+2250700000002','h','Locataire Test');
INSERT INTO bien (id, agence_id, proprietaire_id, type_bien, adresse, commune)
 VALUES ('c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','appartement','Rue T1','Cocody');
INSERT INTO annonce (id, bien_id, transaction, titre, loyer_montant, caution_nb_mois, avance_nb_mois)
 VALUES ('d0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','location','Appart Cocody',150000,2,2);
INSERT INTO modele_contrat (id, type, contenu_template)
 VALUES ('e0000000-0000-0000-0000-000000000001','bail_habitation','{{contrat_ref}}...');

-- TEST 1 : caution 3 mois -> doit être REJETÉ (loi 2019-576)
DO $$ BEGIN
  INSERT INTO contrat (reference, agence_id, annonce_id, bien_id, bailleur_id, locataire_id, modele_id,
    loyer_montant, jour_echeance, caution_montant, caution_nb_mois, avance_montant, avance_nb_mois,
    duree_mois, date_prise_effet, preavis_locataire_jours, preavis_bailleur_jours, delai_restitution_caution_jours)
  VALUES ('CTR-KO-1','a0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002',
    'e0000000-0000-0000-0000-000000000001',150000,5,450000,3,300000,2,12,'2026-09-01',30,90,30);
  RAISE EXCEPTION 'ECHEC TEST 1 : la caution de 3 mois aurait dû être bloquée';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'TEST 1 OK : caution > 2 mois bloquée par le moteur';
END $$;

-- TEST 2 : contrat conforme (2+2, montants cohérents) -> doit PASSER
INSERT INTO contrat (id, reference, agence_id, annonce_id, bien_id, bailleur_id, locataire_id, modele_id,
  loyer_montant, jour_echeance, caution_montant, caution_nb_mois, avance_montant, avance_nb_mois,
  duree_mois, date_prise_effet, preavis_locataire_jours, preavis_bailleur_jours, delai_restitution_caution_jours)
VALUES ('f0000000-0000-0000-0000-000000000001','CTR-2026-000001','a0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002',
  'e0000000-0000-0000-0000-000000000001',150000,5,300000,2,300000,2,12,'2026-09-01',30,90,30);
DO $$ BEGIN RAISE NOTICE 'TEST 2 OK : contrat conforme (2 mois + 2 mois = 600 000 FCFA sur loyer 150 000) accepté'; END $$;

-- TEST 3 : activer le contrat SANS signatures -> doit être REJETÉ
DO $$ BEGIN
  UPDATE contrat SET statut='actif' WHERE reference='CTR-2026-000001';
  RAISE EXCEPTION 'ECHEC TEST 3 : activation sans signatures aurait dû être bloquée';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE '%signatures%' THEN RAISE NOTICE 'TEST 3 OK : activation sans les 2 signatures bloquée';
  ELSE RAISE; END IF;
END $$;

-- TEST 4 : avec les 2 signatures -> activation doit PASSER
INSERT INTO signature (contrat_id, signataire_id, role_signataire, otp_verifie_le, empreinte_document) VALUES
 ('f0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','bailleur',now(),repeat('a',64)),
 ('f0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002','locataire',now(),repeat('a',64));
UPDATE contrat SET statut='actif' WHERE reference='CTR-2026-000001';
DO $$ BEGIN RAISE NOTICE 'TEST 4 OK : activation avec 2 signatures acceptée'; END $$;

-- TEST 5 : créneaux qui se chevauchent sur le même bien -> doit être REJETÉ
INSERT INTO creneau_visite (bien_id, debut, fin, cree_par)
 VALUES ('c0000000-0000-0000-0000-000000000001','2026-09-05 10:00+00','2026-09-05 10:30+00','b0000000-0000-0000-0000-000000000001');
DO $$ BEGIN
  INSERT INTO creneau_visite (bien_id, debut, fin, cree_par)
   VALUES ('c0000000-0000-0000-0000-000000000001','2026-09-05 10:15+00','2026-09-05 10:45+00','b0000000-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'ECHEC TEST 5 : chevauchement aurait dû être bloqué';
EXCEPTION WHEN exclusion_violation THEN RAISE NOTICE 'TEST 5 OK : chevauchement de créneaux bloqué';
END $$;

-- TEST 6 : mouvement séquestre 'retenue' exécuté sans co-validation -> REJETÉ
INSERT INTO compte_sequestre (id, contrat_id, montant_initial, solde)
 VALUES ('90000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001',300000,300000);
DO $$ BEGIN
  INSERT INTO mouvement_sequestre (compte_id, type, montant, execute_le)
   VALUES ('90000000-0000-0000-0000-000000000001','retenue',50000,now());
  RAISE EXCEPTION 'ECHEC TEST 6 : retenue sans co-validation aurait dû être bloquée';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'TEST 6 OK : retenue sans co-validation ni litige bloquée';
END $$;

ROLLBACK;  -- les tests ne laissent aucune donnée
