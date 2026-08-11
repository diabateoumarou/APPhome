-- ============================================================================
-- Adresse et complément d'identité des utilisateurs
--
-- L'article 16 du bail fait élection de domicile aux adresses des parties.
-- Sans ce champ, le contrat généré porte un tiret à cet endroit, ce qui
-- affaiblit sa portée : une notification adressée à un domicile non déclaré
-- est difficilement opposable.
--
-- Auteur : DIABATE Oumarou — Chef de Service Customer Support N1,
--          DATACONNECT AFRICA · 11 août 2026
-- ============================================================================

ALTER TABLE utilisateur
  ADD COLUMN IF NOT EXISTS adresse TEXT,
  ADD COLUMN IF NOT EXISTS commune VARCHAR(80);

COMMENT ON COLUMN utilisateur.adresse IS
  'Domicile déclaré — élection de domicile au contrat (art. 16 du bail)';
