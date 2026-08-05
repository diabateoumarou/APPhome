-- CreateEnum
CREATE TYPE "StatutAgence" AS ENUM ('active', 'suspendue');

-- CreateEnum
CREATE TYPE "FrequenceReversement" AS ENUM ('immediat', 'hebdomadaire', 'mensuel');

-- CreateEnum
CREATE TYPE "StatutUtilisateur" AS ENUM ('actif', 'suspendu', 'supprime');

-- CreateEnum
CREATE TYPE "RoleUtilisateur" AS ENUM ('admin', 'agence', 'proprietaire', 'locataire', 'agent');

-- CreateEnum
CREATE TYPE "TypePieceKyc" AS ENUM ('cni', 'passeport', 'titre_propriete', 'mandat_gestion', 'selfie');

-- CreateEnum
CREATE TYPE "StatutKyc" AS ENUM ('soumis', 'verifie', 'rejete');

-- CreateEnum
CREATE TYPE "TypeBien" AS ENUM ('maison', 'appartement', 'studio', 'terrain', 'bureau', 'commerce');

-- CreateEnum
CREATE TYPE "StatutBien" AS ENUM ('disponible', 'reserve', 'loue', 'vendu');

-- CreateEnum
CREATE TYPE "TypeTransaction" AS ENUM ('location', 'vente');

-- CreateEnum
CREATE TYPE "StatutAnnonce" AS ENUM ('brouillon', 'soumise', 'en_moderation', 'publiee', 'rejetee', 'expiree', 'retiree');

-- CreateEnum
CREATE TYPE "StatutCreneau" AS ENUM ('ouvert', 'ferme');

-- CreateEnum
CREATE TYPE "StatutRdv" AS ENUM ('demande', 'confirme', 'effectue', 'annule', 'no_show');

-- CreateEnum
CREATE TYPE "StatutDossier" AS ENUM ('incomplet', 'complet');

-- CreateEnum
CREATE TYPE "TypePieceDossier" AS ENUM ('identite', 'revenus', 'attestation_employeur', 'garant_identite', 'garant_engagement');

-- CreateEnum
CREATE TYPE "StatutPiece" AS ENUM ('soumise', 'validee', 'rejetee');

-- CreateEnum
CREATE TYPE "StatutCandidature" AS ENUM ('soumise', 'en_examen', 'acceptee', 'refusee', 'liste_attente', 'retiree');

-- CreateEnum
CREATE TYPE "TypeModeleContrat" AS ENUM ('bail_habitation', 'bail_commercial', 'mandat_gestion', 'compromis');

-- CreateEnum
CREATE TYPE "StatutContrat" AS ENUM ('genere', 'en_signature', 'signe', 'actif', 'en_preavis', 'termine', 'resilie');

-- CreateEnum
CREATE TYPE "RoleSignataire" AS ENUM ('bailleur', 'locataire');

-- CreateEnum
CREATE TYPE "TypeEcheance" AS ENUM ('loyer', 'caution', 'avance', 'frais_agence', 'charges', 'penalite');

-- CreateEnum
CREATE TYPE "StatutEcheance" AS ENUM ('a_venir', 'due', 'payee', 'partielle', 'en_retard', 'annulee');

-- CreateEnum
CREATE TYPE "MoyenPaiement" AS ENUM ('orange_money', 'mtn_momo', 'moov_money', 'wave', 'carte');

-- CreateEnum
CREATE TYPE "StatutPaiement" AS ENUM ('initie', 'en_attente', 'confirme', 'echoue', 'expire', 'rembourse');

-- CreateEnum
CREATE TYPE "StatutSequestre" AS ENUM ('actif', 'gele', 'en_restitution', 'clos');

-- CreateEnum
CREATE TYPE "TypeMvtSequestre" AS ENUM ('depot', 'retenue', 'restitution', 'gel', 'degel');

-- CreateEnum
CREATE TYPE "StatutReversement" AS ENUM ('prepare', 'execute', 'echoue');

-- CreateEnum
CREATE TYPE "StatutCommission" AS ENUM ('acquise', 'payee');

-- CreateEnum
CREATE TYPE "CategorieMaintenance" AS ENUM ('plomberie', 'electricite', 'serrurerie', 'gros_oeuvre', 'autre');

-- CreateEnum
CREATE TYPE "StatutMaintenance" AS ENUM ('declare', 'pris_en_charge', 'resolu', 'rejete');

-- CreateEnum
CREATE TYPE "TypeLitige" AS ENUM ('caution', 'impaye', 'etat_bien', 'annonce');

-- CreateEnum
CREATE TYPE "StatutLitige" AS ENUM ('ouvert', 'instruction', 'decide', 'clos');

-- CreateEnum
CREATE TYPE "CanalNotification" AS ENUM ('push', 'email', 'sms');

-- CreateEnum
CREATE TYPE "StatutNotification" AS ENUM ('en_attente', 'envoyee', 'echec', 'lue');

-- CreateTable
CREATE TABLE "parametre_legal" (
    "pays" CHAR(2) NOT NULL,
    "caution_max_mois" SMALLINT NOT NULL DEFAULT 2,
    "avance_max_mois" SMALLINT NOT NULL DEFAULT 2,
    "total_entree_max_mois" SMALLINT NOT NULL DEFAULT 4,
    "delai_restitution_caution_jours" SMALLINT NOT NULL DEFAULT 30,
    "preavis_locataire_defaut_jours" SMALLINT NOT NULL DEFAULT 30,
    "preavis_bailleur_defaut_jours" SMALLINT NOT NULL DEFAULT 90,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "parametre_legal_pkey" PRIMARY KEY ("pays")
);

-- CreateTable
CREATE TABLE "agence" (
    "id" UUID NOT NULL,
    "nom" VARCHAR(160) NOT NULL,
    "email" VARCHAR(255),
    "telephone" VARCHAR(20),
    "pays" CHAR(2) NOT NULL DEFAULT 'CI',
    "frais_agence_pct" DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    "frequence_reversement" "FrequenceReversement" NOT NULL DEFAULT 'mensuel',
    "statut" "StatutAgence" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utilisateur" (
    "id" UUID NOT NULL,
    "telephone" VARCHAR(20) NOT NULL,
    "email" VARCHAR(255),
    "mot_de_passe_hash" VARCHAR(255) NOT NULL,
    "nom_complet" VARCHAR(160) NOT NULL,
    "telephone_verifie_le" TIMESTAMPTZ(6),
    "email_verifie_le" TIMESTAMPTZ(6),
    "totp_secret_chiffre" TEXT,
    "langue" CHAR(2) NOT NULL DEFAULT 'fr',
    "suspension_rdv_jusqu_au" TIMESTAMPTZ(6),
    "statut" "StatutUtilisateur" NOT NULL DEFAULT 'actif',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utilisateur_role" (
    "id" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "role" "RoleUtilisateur" NOT NULL,
    "agence_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "utilisateur_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_code" (
    "id" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "code_hash" VARCHAR(255) NOT NULL,
    "usage" VARCHAR(40) NOT NULL,
    "contexte_id" UUID,
    "expire_le" TIMESTAMPTZ(6) NOT NULL,
    "tentatives" SMALLINT NOT NULL DEFAULT 0,
    "consomme_le" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_verification" (
    "id" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "type_piece" "TypePieceKyc" NOT NULL,
    "numero_piece_chiffre" TEXT,
    "fichier_url" TEXT NOT NULL,
    "statut" "StatutKyc" NOT NULL DEFAULT 'soumis',
    "motif_rejet" TEXT,
    "verifie_par" UUID,
    "verifie_le" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "kyc_verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bien" (
    "id" UUID NOT NULL,
    "agence_id" UUID NOT NULL,
    "proprietaire_id" UUID NOT NULL,
    "type_bien" "TypeBien" NOT NULL,
    "adresse" TEXT NOT NULL,
    "commune" VARCHAR(80) NOT NULL,
    "quartier" VARCHAR(80),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "superficie_m2" DECIMAL(8,2),
    "nb_pieces" SMALLINT,
    "nb_chambres" SMALLINT,
    "nb_salles_eau" SMALLINT,
    "meuble" BOOLEAN NOT NULL DEFAULT false,
    "dependances" TEXT,
    "attributs" JSONB NOT NULL DEFAULT '{}',
    "statut" "StatutBien" NOT NULL DEFAULT 'disponible',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bien_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bien_photo" (
    "id" UUID NOT NULL,
    "bien_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "ordre" SMALLINT NOT NULL DEFAULT 0,
    "is_couverture" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bien_photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bien_document" (
    "id" UUID NOT NULL,
    "bien_id" UUID NOT NULL,
    "type_piece" "TypePieceKyc" NOT NULL,
    "fichier_url" TEXT NOT NULL,
    "verifie_le" TIMESTAMPTZ(6),
    "verifie_par" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bien_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipement" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "libelle" VARCHAR(120) NOT NULL,

    CONSTRAINT "equipement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bien_equipement" (
    "bien_id" UUID NOT NULL,
    "equipement_id" UUID NOT NULL,

    CONSTRAINT "bien_equipement_pkey" PRIMARY KEY ("bien_id","equipement_id")
);

-- CreateTable
CREATE TABLE "annonce" (
    "id" UUID NOT NULL,
    "bien_id" UUID NOT NULL,
    "transaction" "TypeTransaction" NOT NULL,
    "titre" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "loyer_montant" BIGINT,
    "prix_vente" BIGINT,
    "charges_montant" BIGINT NOT NULL DEFAULT 0,
    "caution_nb_mois" SMALLINT NOT NULL DEFAULT 0,
    "avance_nb_mois" SMALLINT NOT NULL DEFAULT 0,
    "frais_agence_montant" BIGINT NOT NULL DEFAULT 0,
    "disponible_le" DATE,
    "statut" "StatutAnnonce" NOT NULL DEFAULT 'brouillon',
    "motif_rejet" TEXT,
    "moderee_par" UUID,
    "moderee_le" TIMESTAMPTZ(6),
    "publiee_le" TIMESTAMPTZ(6),
    "expire_le" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "annonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creneau_visite" (
    "id" UUID NOT NULL,
    "bien_id" UUID NOT NULL,
    "debut" TIMESTAMPTZ(6) NOT NULL,
    "fin" TIMESTAMPTZ(6) NOT NULL,
    "capacite" SMALLINT NOT NULL DEFAULT 1,
    "cree_par" UUID NOT NULL,
    "statut" "StatutCreneau" NOT NULL DEFAULT 'ouvert',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creneau_visite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rendez_vous" (
    "id" UUID NOT NULL,
    "creneau_id" UUID NOT NULL,
    "annonce_id" UUID NOT NULL,
    "visiteur_id" UUID NOT NULL,
    "statut" "StatutRdv" NOT NULL DEFAULT 'demande',
    "annule_par" UUID,
    "annule_le" TIMESTAMPTZ(6),
    "motif_annulation" TEXT,
    "compte_rendu" TEXT,
    "marque_par" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rendez_vous_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dossier" (
    "id" UUID NOT NULL,
    "locataire_id" UUID NOT NULL,
    "statut" "StatutDossier" NOT NULL DEFAULT 'incomplet',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dossier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dossier_piece" (
    "id" UUID NOT NULL,
    "dossier_id" UUID NOT NULL,
    "type_piece" "TypePieceDossier" NOT NULL,
    "fichier_url" TEXT NOT NULL,
    "statut" "StatutPiece" NOT NULL DEFAULT 'soumise',
    "motif_rejet" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dossier_piece_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motif_refus" (
    "code" VARCHAR(40) NOT NULL,
    "libelle" VARCHAR(200) NOT NULL,

    CONSTRAINT "motif_refus_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "candidature" (
    "id" UUID NOT NULL,
    "dossier_id" UUID NOT NULL,
    "annonce_id" UUID NOT NULL,
    "statut" "StatutCandidature" NOT NULL DEFAULT 'soumise',
    "motif_refus_code" VARCHAR(40),
    "consentement_partage_pieces" BOOLEAN NOT NULL DEFAULT false,
    "consentement_le" TIMESTAMPTZ(6),
    "decidee_par" UUID,
    "decidee_le" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "candidature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modele_contrat" (
    "id" UUID NOT NULL,
    "agence_id" UUID,
    "type" "TypeModeleContrat" NOT NULL,
    "contenu_template" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modele_contrat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contrat" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(30) NOT NULL,
    "agence_id" UUID NOT NULL,
    "annonce_id" UUID NOT NULL,
    "bien_id" UUID NOT NULL,
    "bailleur_id" UUID NOT NULL,
    "locataire_id" UUID NOT NULL,
    "candidature_id" UUID,
    "modele_id" UUID NOT NULL,
    "loyer_montant" BIGINT NOT NULL,
    "charges_montant" BIGINT NOT NULL DEFAULT 0,
    "jour_echeance" SMALLINT NOT NULL,
    "caution_montant" BIGINT NOT NULL DEFAULT 0,
    "caution_nb_mois" SMALLINT NOT NULL DEFAULT 0,
    "avance_montant" BIGINT NOT NULL DEFAULT 0,
    "avance_nb_mois" SMALLINT NOT NULL DEFAULT 0,
    "frais_agence_montant" BIGINT NOT NULL DEFAULT 0,
    "duree_mois" SMALLINT NOT NULL,
    "date_prise_effet" DATE NOT NULL,
    "preavis_locataire_jours" SMALLINT NOT NULL,
    "preavis_bailleur_jours" SMALLINT NOT NULL,
    "delai_restitution_caution_jours" SMALLINT NOT NULL,
    "jours_tolerance" SMALLINT NOT NULL DEFAULT 5,
    "penalite_retard_montant" BIGINT NOT NULL DEFAULT 0,
    "statut" "StatutContrat" NOT NULL DEFAULT 'genere',
    "document_url" TEXT,
    "document_empreinte_sha256" CHAR(64),
    "preavis_donne_par" UUID,
    "preavis_le" TIMESTAMPTZ(6),
    "fin_effective_le" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contrat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature" (
    "id" UUID NOT NULL,
    "contrat_id" UUID NOT NULL,
    "signataire_id" UUID NOT NULL,
    "role_signataire" "RoleSignataire" NOT NULL,
    "otp_verifie_le" TIMESTAMPTZ(6) NOT NULL,
    "horodatage" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "empreinte_document" CHAR(64) NOT NULL,
    "adresse_ip" INET,
    "user_agent" TEXT,

    CONSTRAINT "signature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "echeance" (
    "id" UUID NOT NULL,
    "contrat_id" UUID NOT NULL,
    "type" "TypeEcheance" NOT NULL,
    "periode" DATE,
    "montant_du" BIGINT NOT NULL,
    "montant_paye" BIGINT NOT NULL DEFAULT 0,
    "date_echeance" DATE NOT NULL,
    "statut" "StatutEcheance" NOT NULL DEFAULT 'a_venir',
    "relance_niveau" SMALLINT NOT NULL DEFAULT 0,
    "derniere_relance_le" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "echeance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paiement" (
    "id" UUID NOT NULL,
    "contrat_id" UUID,
    "payeur_id" UUID NOT NULL,
    "montant" BIGINT NOT NULL,
    "devise" CHAR(3) NOT NULL DEFAULT 'XOF',
    "moyen" "MoyenPaiement" NOT NULL,
    "agregateur" VARCHAR(40),
    "reference_interne" VARCHAR(64) NOT NULL,
    "reference_agregateur" VARCHAR(128),
    "statut" "StatutPaiement" NOT NULL DEFAULT 'initie',
    "webhook_recu_le" TIMESTAMPTZ(6),
    "reconcilie" BOOLEAN NOT NULL DEFAULT false,
    "reconcilie_le" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "paiement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paiement_echeance" (
    "paiement_id" UUID NOT NULL,
    "echeance_id" UUID NOT NULL,
    "montant_affecte" BIGINT NOT NULL,

    CONSTRAINT "paiement_echeance_pkey" PRIMARY KEY ("paiement_id","echeance_id")
);

-- CreateTable
CREATE TABLE "quittance" (
    "id" UUID NOT NULL,
    "paiement_id" UUID NOT NULL,
    "contrat_id" UUID NOT NULL,
    "agence_id" UUID NOT NULL,
    "numero" VARCHAR(30) NOT NULL,
    "pdf_url" TEXT NOT NULL,
    "generee_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quittance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compte_sequestre" (
    "id" UUID NOT NULL,
    "contrat_id" UUID NOT NULL,
    "montant_initial" BIGINT NOT NULL,
    "solde" BIGINT NOT NULL,
    "statut" "StatutSequestre" NOT NULL DEFAULT 'actif',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "compte_sequestre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mouvement_sequestre" (
    "id" UUID NOT NULL,
    "compte_id" UUID NOT NULL,
    "type" "TypeMvtSequestre" NOT NULL,
    "montant" BIGINT NOT NULL,
    "justificatif_url" TEXT,
    "litige_id" UUID,
    "valide_bailleur_le" TIMESTAMPTZ(6),
    "valide_locataire_le" TIMESTAMPTZ(6),
    "execute_le" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mouvement_sequestre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reversement" (
    "id" UUID NOT NULL,
    "agence_id" UUID NOT NULL,
    "bailleur_id" UUID NOT NULL,
    "periode_debut" DATE NOT NULL,
    "periode_fin" DATE NOT NULL,
    "montant_brut" BIGINT NOT NULL,
    "frais_agence" BIGINT NOT NULL DEFAULT 0,
    "montant_net" BIGINT NOT NULL,
    "moyen" "MoyenPaiement" NOT NULL,
    "reference" VARCHAR(64),
    "statut" "StatutReversement" NOT NULL DEFAULT 'prepare',
    "releve_url" TEXT,
    "execute_le" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reversement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reversement_paiement" (
    "reversement_id" UUID NOT NULL,
    "paiement_id" UUID NOT NULL,

    CONSTRAINT "reversement_paiement_pkey" PRIMARY KEY ("reversement_id","paiement_id")
);

-- CreateTable
CREATE TABLE "commission" (
    "id" UUID NOT NULL,
    "agence_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "contrat_id" UUID,
    "rendez_vous_id" UUID,
    "montant" BIGINT NOT NULL,
    "statut" "StatutCommission" NOT NULL DEFAULT 'acquise',
    "payee_le" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demande_maintenance" (
    "id" UUID NOT NULL,
    "bien_id" UUID NOT NULL,
    "contrat_id" UUID,
    "declarant_id" UUID NOT NULL,
    "categorie" "CategorieMaintenance" NOT NULL,
    "description" TEXT NOT NULL,
    "photos" JSONB NOT NULL DEFAULT '[]',
    "statut" "StatutMaintenance" NOT NULL DEFAULT 'declare',
    "motif_rejet" TEXT,
    "resolu_le" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "demande_maintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "litige" (
    "id" UUID NOT NULL,
    "contrat_id" UUID NOT NULL,
    "type" "TypeLitige" NOT NULL,
    "ouvert_par" UUID NOT NULL,
    "statut" "StatutLitige" NOT NULL DEFAULT 'ouvert',
    "description" TEXT NOT NULL,
    "decision" TEXT,
    "decide_par" UUID,
    "decide_le" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "litige_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "litige_message" (
    "id" UUID NOT NULL,
    "litige_id" UUID NOT NULL,
    "auteur_id" UUID NOT NULL,
    "contenu" TEXT NOT NULL,
    "pieces" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "litige_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "canal" "CanalNotification" NOT NULL,
    "type_evenement" VARCHAR(60) NOT NULL,
    "titre" VARCHAR(160) NOT NULL,
    "contenu" TEXT NOT NULL,
    "entite_type" VARCHAR(40),
    "entite_id" UUID,
    "statut" "StatutNotification" NOT NULL DEFAULT 'en_attente',
    "envoyee_le" TIMESTAMPTZ(6),
    "lue_le" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preference_notification" (
    "utilisateur_id" UUID NOT NULL,
    "type_evenement" VARCHAR(60) NOT NULL,
    "canal" "CanalNotification" NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "preference_notification_pkey" PRIMARY KEY ("utilisateur_id","type_evenement","canal")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "agence_id" UUID,
    "utilisateur_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entite_type" VARCHAR(40) NOT NULL,
    "entite_id" UUID,
    "donnees_avant" JSONB,
    "donnees_apres" JSONB,
    "adresse_ip" INET,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "utilisateur_telephone_key" ON "utilisateur"("telephone");

-- CreateIndex
CREATE UNIQUE INDEX "utilisateur_email_key" ON "utilisateur"("email");

-- CreateIndex
CREATE UNIQUE INDEX "utilisateur_role_utilisateur_id_role_agence_id_key" ON "utilisateur_role"("utilisateur_id", "role", "agence_id");

-- CreateIndex
CREATE INDEX "otp_code_utilisateur_id_usage_idx" ON "otp_code"("utilisateur_id", "usage");

-- CreateIndex
CREATE INDEX "bien_commune_quartier_idx" ON "bien"("commune", "quartier");

-- CreateIndex
CREATE INDEX "bien_proprietaire_id_idx" ON "bien"("proprietaire_id");

-- CreateIndex
CREATE INDEX "bien_agence_id_idx" ON "bien"("agence_id");

-- CreateIndex
CREATE UNIQUE INDEX "equipement_code_key" ON "equipement"("code");

-- CreateIndex
CREATE INDEX "annonce_bien_id_idx" ON "annonce"("bien_id");

-- CreateIndex
CREATE INDEX "annonce_transaction_loyer_montant_idx" ON "annonce"("transaction", "loyer_montant");

-- CreateIndex
CREATE INDEX "creneau_visite_bien_id_debut_idx" ON "creneau_visite"("bien_id", "debut");

-- CreateIndex
CREATE INDEX "rendez_vous_visiteur_id_statut_idx" ON "rendez_vous"("visiteur_id", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "rendez_vous_creneau_id_visiteur_id_key" ON "rendez_vous"("creneau_id", "visiteur_id");

-- CreateIndex
CREATE UNIQUE INDEX "dossier_locataire_id_key" ON "dossier"("locataire_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidature_dossier_id_annonce_id_key" ON "candidature"("dossier_id", "annonce_id");

-- CreateIndex
CREATE UNIQUE INDEX "modele_contrat_agence_id_type_version_key" ON "modele_contrat"("agence_id", "type", "version");

-- CreateIndex
CREATE UNIQUE INDEX "contrat_reference_key" ON "contrat"("reference");

-- CreateIndex
CREATE INDEX "contrat_bailleur_id_statut_idx" ON "contrat"("bailleur_id", "statut");

-- CreateIndex
CREATE INDEX "contrat_locataire_id_statut_idx" ON "contrat"("locataire_id", "statut");

-- CreateIndex
CREATE INDEX "contrat_agence_id_idx" ON "contrat"("agence_id");

-- CreateIndex
CREATE UNIQUE INDEX "signature_contrat_id_role_signataire_key" ON "signature"("contrat_id", "role_signataire");

-- CreateIndex
CREATE INDEX "echeance_statut_date_echeance_idx" ON "echeance"("statut", "date_echeance");

-- CreateIndex
CREATE INDEX "echeance_contrat_id_statut_idx" ON "echeance"("contrat_id", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "echeance_contrat_id_type_periode_key" ON "echeance"("contrat_id", "type", "periode");

-- CreateIndex
CREATE UNIQUE INDEX "paiement_reference_interne_key" ON "paiement"("reference_interne");

-- CreateIndex
CREATE INDEX "paiement_contrat_id_idx" ON "paiement"("contrat_id");

-- CreateIndex
CREATE INDEX "paiement_statut_created_at_idx" ON "paiement"("statut", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "quittance_paiement_id_key" ON "quittance"("paiement_id");

-- CreateIndex
CREATE UNIQUE INDEX "quittance_agence_id_numero_key" ON "quittance"("agence_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "compte_sequestre_contrat_id_key" ON "compte_sequestre"("contrat_id");

-- CreateIndex
CREATE UNIQUE INDEX "reversement_reference_key" ON "reversement"("reference");

-- CreateIndex
CREATE INDEX "notification_utilisateur_id_created_at_idx" ON "notification"("utilisateur_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_entite_type_entite_id_idx" ON "audit_log"("entite_type", "entite_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- AddForeignKey
ALTER TABLE "agence" ADD CONSTRAINT "agence_pays_fkey" FOREIGN KEY ("pays") REFERENCES "parametre_legal"("pays") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utilisateur_role" ADD CONSTRAINT "utilisateur_role_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utilisateur_role" ADD CONSTRAINT "utilisateur_role_agence_id_fkey" FOREIGN KEY ("agence_id") REFERENCES "agence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_code" ADD CONSTRAINT "otp_code_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_verification" ADD CONSTRAINT "kyc_verification_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_verification" ADD CONSTRAINT "kyc_verification_verifie_par_fkey" FOREIGN KEY ("verifie_par") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bien" ADD CONSTRAINT "bien_agence_id_fkey" FOREIGN KEY ("agence_id") REFERENCES "agence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bien" ADD CONSTRAINT "bien_proprietaire_id_fkey" FOREIGN KEY ("proprietaire_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bien_photo" ADD CONSTRAINT "bien_photo_bien_id_fkey" FOREIGN KEY ("bien_id") REFERENCES "bien"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bien_document" ADD CONSTRAINT "bien_document_bien_id_fkey" FOREIGN KEY ("bien_id") REFERENCES "bien"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bien_document" ADD CONSTRAINT "bien_document_verifie_par_fkey" FOREIGN KEY ("verifie_par") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bien_equipement" ADD CONSTRAINT "bien_equipement_bien_id_fkey" FOREIGN KEY ("bien_id") REFERENCES "bien"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bien_equipement" ADD CONSTRAINT "bien_equipement_equipement_id_fkey" FOREIGN KEY ("equipement_id") REFERENCES "equipement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annonce" ADD CONSTRAINT "annonce_bien_id_fkey" FOREIGN KEY ("bien_id") REFERENCES "bien"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annonce" ADD CONSTRAINT "annonce_moderee_par_fkey" FOREIGN KEY ("moderee_par") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creneau_visite" ADD CONSTRAINT "creneau_visite_bien_id_fkey" FOREIGN KEY ("bien_id") REFERENCES "bien"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creneau_visite" ADD CONSTRAINT "creneau_visite_cree_par_fkey" FOREIGN KEY ("cree_par") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_creneau_id_fkey" FOREIGN KEY ("creneau_id") REFERENCES "creneau_visite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_annonce_id_fkey" FOREIGN KEY ("annonce_id") REFERENCES "annonce"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_visiteur_id_fkey" FOREIGN KEY ("visiteur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_annule_par_fkey" FOREIGN KEY ("annule_par") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_marque_par_fkey" FOREIGN KEY ("marque_par") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossier" ADD CONSTRAINT "dossier_locataire_id_fkey" FOREIGN KEY ("locataire_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossier_piece" ADD CONSTRAINT "dossier_piece_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidature" ADD CONSTRAINT "candidature_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidature" ADD CONSTRAINT "candidature_annonce_id_fkey" FOREIGN KEY ("annonce_id") REFERENCES "annonce"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidature" ADD CONSTRAINT "candidature_motif_refus_code_fkey" FOREIGN KEY ("motif_refus_code") REFERENCES "motif_refus"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidature" ADD CONSTRAINT "candidature_decidee_par_fkey" FOREIGN KEY ("decidee_par") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modele_contrat" ADD CONSTRAINT "modele_contrat_agence_id_fkey" FOREIGN KEY ("agence_id") REFERENCES "agence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrat" ADD CONSTRAINT "contrat_agence_id_fkey" FOREIGN KEY ("agence_id") REFERENCES "agence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrat" ADD CONSTRAINT "contrat_annonce_id_fkey" FOREIGN KEY ("annonce_id") REFERENCES "annonce"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrat" ADD CONSTRAINT "contrat_bien_id_fkey" FOREIGN KEY ("bien_id") REFERENCES "bien"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrat" ADD CONSTRAINT "contrat_bailleur_id_fkey" FOREIGN KEY ("bailleur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrat" ADD CONSTRAINT "contrat_locataire_id_fkey" FOREIGN KEY ("locataire_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrat" ADD CONSTRAINT "contrat_candidature_id_fkey" FOREIGN KEY ("candidature_id") REFERENCES "candidature"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrat" ADD CONSTRAINT "contrat_modele_id_fkey" FOREIGN KEY ("modele_id") REFERENCES "modele_contrat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrat" ADD CONSTRAINT "contrat_preavis_donne_par_fkey" FOREIGN KEY ("preavis_donne_par") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature" ADD CONSTRAINT "signature_contrat_id_fkey" FOREIGN KEY ("contrat_id") REFERENCES "contrat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature" ADD CONSTRAINT "signature_signataire_id_fkey" FOREIGN KEY ("signataire_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "echeance" ADD CONSTRAINT "echeance_contrat_id_fkey" FOREIGN KEY ("contrat_id") REFERENCES "contrat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiement" ADD CONSTRAINT "paiement_contrat_id_fkey" FOREIGN KEY ("contrat_id") REFERENCES "contrat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiement" ADD CONSTRAINT "paiement_payeur_id_fkey" FOREIGN KEY ("payeur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiement_echeance" ADD CONSTRAINT "paiement_echeance_paiement_id_fkey" FOREIGN KEY ("paiement_id") REFERENCES "paiement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiement_echeance" ADD CONSTRAINT "paiement_echeance_echeance_id_fkey" FOREIGN KEY ("echeance_id") REFERENCES "echeance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quittance" ADD CONSTRAINT "quittance_paiement_id_fkey" FOREIGN KEY ("paiement_id") REFERENCES "paiement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quittance" ADD CONSTRAINT "quittance_contrat_id_fkey" FOREIGN KEY ("contrat_id") REFERENCES "contrat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quittance" ADD CONSTRAINT "quittance_agence_id_fkey" FOREIGN KEY ("agence_id") REFERENCES "agence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compte_sequestre" ADD CONSTRAINT "compte_sequestre_contrat_id_fkey" FOREIGN KEY ("contrat_id") REFERENCES "contrat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_sequestre" ADD CONSTRAINT "mouvement_sequestre_compte_id_fkey" FOREIGN KEY ("compte_id") REFERENCES "compte_sequestre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_sequestre" ADD CONSTRAINT "mouvement_sequestre_litige_id_fkey" FOREIGN KEY ("litige_id") REFERENCES "litige"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reversement" ADD CONSTRAINT "reversement_agence_id_fkey" FOREIGN KEY ("agence_id") REFERENCES "agence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reversement" ADD CONSTRAINT "reversement_bailleur_id_fkey" FOREIGN KEY ("bailleur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reversement_paiement" ADD CONSTRAINT "reversement_paiement_reversement_id_fkey" FOREIGN KEY ("reversement_id") REFERENCES "reversement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reversement_paiement" ADD CONSTRAINT "reversement_paiement_paiement_id_fkey" FOREIGN KEY ("paiement_id") REFERENCES "paiement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission" ADD CONSTRAINT "commission_agence_id_fkey" FOREIGN KEY ("agence_id") REFERENCES "agence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission" ADD CONSTRAINT "commission_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission" ADD CONSTRAINT "commission_contrat_id_fkey" FOREIGN KEY ("contrat_id") REFERENCES "contrat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission" ADD CONSTRAINT "commission_rendez_vous_id_fkey" FOREIGN KEY ("rendez_vous_id") REFERENCES "rendez_vous"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demande_maintenance" ADD CONSTRAINT "demande_maintenance_bien_id_fkey" FOREIGN KEY ("bien_id") REFERENCES "bien"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demande_maintenance" ADD CONSTRAINT "demande_maintenance_contrat_id_fkey" FOREIGN KEY ("contrat_id") REFERENCES "contrat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demande_maintenance" ADD CONSTRAINT "demande_maintenance_declarant_id_fkey" FOREIGN KEY ("declarant_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "litige" ADD CONSTRAINT "litige_contrat_id_fkey" FOREIGN KEY ("contrat_id") REFERENCES "contrat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "litige" ADD CONSTRAINT "litige_ouvert_par_fkey" FOREIGN KEY ("ouvert_par") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "litige" ADD CONSTRAINT "litige_decide_par_fkey" FOREIGN KEY ("decide_par") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "litige_message" ADD CONSTRAINT "litige_message_litige_id_fkey" FOREIGN KEY ("litige_id") REFERENCES "litige"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "litige_message" ADD CONSTRAINT "litige_message_auteur_id_fkey" FOREIGN KEY ("auteur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preference_notification" ADD CONSTRAINT "preference_notification_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

