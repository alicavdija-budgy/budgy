-- BUDGY 4.0 — AUDIT DE MÉTADONNÉES UNIQUEMENT, SUR LA BASE EXISTANTE
-- CIBLE EXCLUSIVE : https://supabase.budgy.ch (Supabase auto-hébergée Budgy).
-- SELECT seulement : ne lit jamais les lignes clients, les JWT ou les fichiers.
-- Cette requête doit être lancée dans l'éditeur SQL de CETTE instance.
-- Ne PAS utiliser l'autre projet Supabase (préproduction).
--
-- Attention : qual / with_check peuvent contenir des expressions SQL de politique ;
-- ce sont des métadonnées de sécurité, pas des enregistrements clients.

-- A. Toutes les 15 tables attendues, y compris celles ABSENTES.
WITH expected(tablename) AS (
  VALUES
    ('user_preferences'), ('transactions'), ('incomes'),
    ('savings_goals'), ('budgets'), ('recurring_expenses'),
    ('contracts'), ('debts'), ('investments'), ('receipts'),
    ('invoices'), ('documents'), ('expense_groups'),
    ('group_expenses'), ('sync_tombstones')
)
SELECT e.tablename,
       CASE WHEN t.tablename IS NULL THEN 'MISSING' ELSE 'PRESENT' END AS table_status,
       t.rowsecurity AS rls_enabled,
       COUNT(p.policyname) AS policy_count
FROM expected e
LEFT JOIN pg_tables t
  ON t.schemaname = 'public' AND t.tablename = e.tablename
LEFT JOIN pg_policies p
  ON p.schemaname = 'public' AND p.tablename = e.tablename
GROUP BY e.tablename, t.tablename, t.rowsecurity
ORDER BY e.tablename;

-- A2. RLS : politiques réelles des 15 tables, expressions USING et WITH CHECK.
-- Les conditions sont des métadonnées du catalogue PostgreSQL.
SELECT p.tablename, p.policyname, p.permissive, p.roles, p.cmd,
       p.qual AS using_condition,
       p.with_check AS with_check_condition
FROM pg_policies p
WHERE p.schemaname = 'public'
  AND p.tablename IN (
    'user_preferences','transactions','incomes','savings_goals','budgets',
    'recurring_expenses','contracts','debts','investments','receipts',
    'invoices','documents','expense_groups','group_expenses','sync_tombstones'
  )
ORDER BY p.tablename, p.policyname;

-- B. Présence des colonnes structurantes sans lire les valeurs.
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND (
 (table_name='budgets' AND column_name IN ('id','user_id','monthly','alerts_enabled','auto_save'))
 OR (table_name='documents' AND column_name IN ('id','user_id','document_type','remote_path','spc_payload'))
 OR (table_name='invoices' AND column_name IN ('id','user_id','document_id','qr_payload','currency','chf_amount'))
 OR (table_name='transactions' AND column_name IN ('id','user_id','invoice_id','recurring_id','debt_id'))
 OR (table_name='sync_tombstones' AND column_name IN ('id','user_id','entity_key','deleted_at'))
)
ORDER BY table_name, column_name;

-- C. Privilèges anon ET authenticated sur les 15 tables (SELECT/INSERT/UPDATE/DELETE).
-- has_table_privilege interroge exclusivement les métadonnées des rôles.
WITH expected(tablename) AS (
  VALUES
    ('user_preferences'), ('transactions'), ('incomes'),
    ('savings_goals'), ('budgets'), ('recurring_expenses'),
    ('contracts'), ('debts'), ('investments'), ('receipts'),
    ('invoices'), ('documents'), ('expense_groups'),
    ('group_expenses'), ('sync_tombstones')
)
SELECT e.tablename,
       CASE WHEN t.tablename IS NULL THEN 'MISSING' ELSE 'PRESENT' END AS table_status,
       CASE WHEN t.tablename IS NULL THEN NULL ELSE
         has_table_privilege('anon', format('%I.%I', t.schemaname, t.tablename), 'SELECT') END AS anon_select,
       CASE WHEN t.tablename IS NULL THEN NULL ELSE
         has_table_privilege('anon', format('%I.%I', t.schemaname, t.tablename), 'INSERT') END AS anon_insert,
       CASE WHEN t.tablename IS NULL THEN NULL ELSE
         has_table_privilege('anon', format('%I.%I', t.schemaname, t.tablename), 'UPDATE') END AS anon_update,
       CASE WHEN t.tablename IS NULL THEN NULL ELSE
         has_table_privilege('anon', format('%I.%I', t.schemaname, t.tablename), 'DELETE') END AS anon_delete,
       CASE WHEN t.tablename IS NULL THEN NULL ELSE
         has_table_privilege('authenticated', format('%I.%I', t.schemaname, t.tablename), 'SELECT') END AS auth_select,
       CASE WHEN t.tablename IS NULL THEN NULL ELSE
         has_table_privilege('authenticated', format('%I.%I', t.schemaname, t.tablename), 'INSERT') END AS auth_insert,
       CASE WHEN t.tablename IS NULL THEN NULL ELSE
         has_table_privilege('authenticated', format('%I.%I', t.schemaname, t.tablename), 'UPDATE') END AS auth_update,
       CASE WHEN t.tablename IS NULL THEN NULL ELSE
         has_table_privilege('authenticated', format('%I.%I', t.schemaname, t.tablename), 'DELETE') END AS auth_delete
FROM expected e
LEFT JOIN pg_tables t
  ON t.schemaname = 'public' AND t.tablename = e.tablename
ORDER BY e.tablename;

-- D. Fonctions sensibles / triggers liés à l'attribution user_id.
SELECT n.nspname AS schema_name, p.proname AS function_name,
       p.prosecdef AS security_definer
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'set_user_id_default';

SELECT event_object_table AS table_name, trigger_name,
       action_timing, event_manipulation
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND trigger_name LIKE '%user_id%'
ORDER BY event_object_table, trigger_name;

-- E. Index des tables métier (définitions uniquement).
SELECT t.tablename, i.indexname, i.indexdef
FROM pg_indexes i JOIN pg_tables t
  ON t.schemaname = i.schemaname AND t.tablename = i.tablename
WHERE t.schemaname = 'public'
  AND t.tablename IN (
    'user_preferences','transactions','incomes','savings_goals','budgets',
    'recurring_expenses','contracts','debts','investments','receipts',
    'invoices','documents','expense_groups','group_expenses','sync_tombstones'
  )
ORDER BY t.tablename, i.indexname;

-- F. Storage privé user-documents et politiques sur storage.objects.
-- Ces SELECT supposent Supabase Storage installé.
SELECT id AS bucket_name, public AS publicly_readable, file_size_limit
FROM storage.buckets
WHERE id = 'user-documents';

SELECT p.policyname, p.permissive, p.cmd, p.roles,
       p.qual AS using_condition,
       p.with_check AS with_check_condition
FROM pg_policies p
WHERE p.schemaname = 'storage' AND p.tablename = 'objects'
ORDER BY p.policyname;

-- G. Estimation de volume à partir de pg_class (ne lit aucune ligne métier).
SELECT c.relname AS table_name, c.reltuples::bigint AS estimated_rows
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relname IN ('transactions','budgets','invoices','documents','receipts','contracts')
ORDER BY c.relname;

-- H. Présence de l'historique des migrations (sans lire son contenu).
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'
) AS has_migration_history;
