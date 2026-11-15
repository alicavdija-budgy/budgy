-- BUDGY 4.0 — AUDIT MÉTADONNÉES DE LA VRAIE BASE SELF-HOSTED
-- CIBLE EXCLUSIVE : https://supabase.budgy.ch (base actuelle de Budgy).
-- Lecture seule : 0 INSERT / UPDATE / DELETE / ALTER / DROP, aucun PII/secret.
-- Ne pas exécuter sur un autre projet Supabase.
-- Coller séparément les requêtes dans SQL Editor ou exécuter ce fichier,
-- puis rendre UNIQUEMENT un bilan technique (pas d'enregistrements utilisateur).

-- A. Schéma métier, RLS et nombre de politiques.
SELECT t.tablename,
       t.rowsecurity AS rls_enabled,
       COUNT(p.policyname) AS policy_count
FROM pg_tables t
LEFT JOIN pg_policies p
  ON p.schemaname = t.schemaname AND p.tablename = t.tablename
WHERE t.schemaname = 'public'
AND t.tablename IN (
  'user_preferences','transactions','incomes','savings_goals','budgets',
  'recurring_expenses','contracts','debts','investments','receipts',
  'invoices','documents','expense_groups','group_expenses','sync_tombstones'
)
GROUP BY t.tablename, t.rowsecurity ORDER BY t.tablename;

-- B. Colonnes importantes réellement présentes (ne lit PAS les valeurs).
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

-- C. Droits de la Data REST API pour le rôle utilisateur (pas d'accès aux lignes).
SELECT t.tablename,
       has_table_privilege('authenticated',format('%I.%I',t.schemaname,t.tablename),'SELECT') AS can_select,
       has_table_privilege('authenticated',format('%I.%I',t.schemaname,t.tablename),'INSERT') AS can_insert,
       has_table_privilege('authenticated',format('%I.%I',t.schemaname,t.tablename),'UPDATE') AS can_update,
       has_table_privilege('authenticated',format('%I.%I',t.schemaname,t.tablename),'DELETE') AS can_delete
FROM pg_tables t
WHERE t.schemaname='public'
AND t.tablename IN ('transactions','budgets','invoices','documents','receipts','contracts','sync_tombstones')
ORDER BY t.tablename;

-- D. Types/fonctions de protection et triggers (métadonnées).
SELECT n.nspname AS schema_name, p.proname AS function_name,
       p.prosecdef AS security_definer
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='set_user_id_default';

SELECT event_object_table AS table_name, trigger_name,
       action_timing, event_manipulation
FROM information_schema.triggers
WHERE event_object_schema='public'
  AND trigger_name LIKE '%user_id%'
ORDER BY event_object_table, trigger_name;

-- E. Index B-tree utiles pour les filtres par user_id (sans donnée).
SELECT t.tablename, i.indexname, i.indexdef
FROM pg_indexes i JOIN pg_tables t
  ON t.schemaname=i.schemaname AND t.tablename=i.tablename
WHERE t.schemaname='public'
  AND t.tablename IN ('transactions','budgets','invoices','documents','receipts','contracts','sync_tombstones')
ORDER BY t.tablename, i.indexname;

-- F. Storage privé / politiques (si Supabase Storage installé).
SELECT id AS bucket_name, public AS publicly_readable, file_size_limit
FROM storage.buckets
WHERE id='user-documents';

SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname='storage' AND tablename='objects'
ORDER BY policyname;

-- G. Estimations de volumétrie SANS lire les données utilisateur.
SELECT c.relname AS table_name, c.reltuples::bigint AS estimated_rows
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
  AND c.relname IN ('transactions','budgets','invoices','documents','receipts','contracts')
ORDER BY c.relname;

-- H. Migrations Supabase historiques (optionnelle : la table peut manquer).
-- Vérifier son existence AVANT tout SELECT :
SELECT EXISTS(
  SELECT 1 FROM information_schema.tables
  WHERE table_schema='supabase_migrations' AND table_name='schema_migrations'
) AS has_migration_history;
