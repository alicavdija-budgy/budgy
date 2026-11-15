-- BUDGY — VÉRIFICATION DU SCHÉMA INITIAL (budgy-preprod)
-- À exécuter dans le SQL Editor du NOUVEAU projet (navigateur iPhone) APRÈS
-- l'exécution manuelle de docs/SUPABASE_SCHEMA.sql et AVANT toute migration.
-- 100 % LECTURE SEULE. Chaque bloc indique le résultat attendu.

-- 1) Les 14 tables Budgy attendues (attendu : 14 lignes, toutes présentes)
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN (
  'user_preferences','transactions','incomes','savings_goals','budgets',
  'recurring_expenses','contracts','debts','investments','receipts',
  'invoices','documents','expense_groups','group_expenses')
ORDER BY table_name;

-- 2) Clés primaires (attendu : 14 lignes — 1 PK par table)
SELECT tc.table_name, kcu.column_name AS pk
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
ORDER BY tc.table_name;

-- 3) Types essentiels (attendu : id=text, user_id=uuid, amount=numeric)
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((column_name = 'id' AND table_name <> 'user_preferences')
    OR column_name = 'user_id'
    OR (table_name IN ('transactions','invoices') AND column_name = 'amount'))
ORDER BY table_name, column_name;

-- 4) CONTRÔLE SCHÉMA NON MIGRÉ : ces colonnes ne doivent PAS encore exister
--    (attendu : 0 ligne — si des lignes apparaissent, la migration T3/4/5 a
--    déjà été appliquée en partie)
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = 'public' AND (
   (table_name = 'transactions' AND column_name IN ('invoice_id','currency','type','source','debt_id','recurring_id'))
 OR (table_name = 'documents'   AND column_name IN ('document_type','remote_path','spc_payload'))
 OR (table_name = 'invoices'    AND column_name IN ('document_id','qr_payload','chf_amount','fx_rate','fx_date','fx_source','paid_at','recurring_id')));

-- 5) RLS activée sur les 14 tables (attendu : rls_enabled = true partout)
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

-- 6) Politiques owner-only (attendu : 4 par table métier = 56 au total,
--    chacune filtrant auth.uid() = user_id)
SELECT tablename, count(*) AS nb_policies
FROM pg_policies WHERE schemaname = 'public'
GROUP BY tablename ORDER BY tablename;
SELECT tablename, policyname, cmd, qual FROM pg_policies
WHERE schemaname = 'public' AND qual NOT LIKE '%auth.uid()%' AND qual IS NOT NULL;
-- (2e requête : attendu 0 ligne — aucune politique sans filtre auth.uid())

-- 7) Fonction + déclencheurs user_id (attendu : 1 fonction, 14 triggers)
SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND proname = 'set_user_id_default';
SELECT count(*) AS nb_triggers_user_id
FROM information_schema.triggers
WHERE trigger_schema = 'public' AND trigger_name LIKE 'set_user_id_%';

-- 8) AUCUNE donnée réelle importée (attendu : 0 partout)
SELECT 'transactions' AS t, count(*) FROM public.transactions
UNION ALL SELECT 'invoices', count(*) FROM public.invoices
UNION ALL SELECT 'documents', count(*) FROM public.documents
UNION ALL SELECT 'contracts', count(*) FROM public.contracts
UNION ALL SELECT 'receipts', count(*) FROM public.receipts
UNION ALL SELECT 'incomes', count(*) FROM public.incomes
UNION ALL SELECT 'budgets', count(*) FROM public.budgets
UNION ALL SELECT 'user_preferences', count(*) FROM public.user_preferences;

-- 9) Aucun objet en erreur / vue invalide (attendu : 0 ligne)
SELECT c.relname FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind NOT IN ('r','i','S','v','m','t','p');

-- ✅ Si 1–9 sont conformes, le schéma initial est VALIDÉ : la migration
-- docs/MIGRATION_TASK3_storage_prive.sql peut être planifiée (après
-- l'exécution de la SECTION A de docs/VERIFY_MIGRATION.sql et un backup).
