-- ============================================================================
-- Valeur par défaut sur updated_at
-- Prisma gère @updatedAt côté application ; ce défaut protège les écritures
-- SQL directes (scripts de maintenance, imports, tests de contraintes).
-- Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 06 août 2026
-- ============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'updated_at'
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN updated_at SET DEFAULT now()', t);
  END LOOP;
END $$;
