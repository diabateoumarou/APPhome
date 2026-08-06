-- ============================================================================
-- Valeur par défaut sur les identifiants UUID
-- Prisma génère les UUID côté application (support hors-ligne mobile) ; ce
-- défaut protège les écritures SQL directes (maintenance, imports, tests).
-- Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 06 août 2026
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
    WHERE c.table_schema = 'public'
      AND c.column_name = 'id'
      AND c.data_type = 'uuid'
      AND c.column_default IS NULL
      AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN id SET DEFAULT gen_random_uuid()', t);
  END LOOP;
END $$;
