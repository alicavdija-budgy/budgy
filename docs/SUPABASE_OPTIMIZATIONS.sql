-- ============================================================================
-- BUDGY — OPTIMISATIONS RECOMMANDÉES PAR L'ADVISOR SUPABASE (performance)
-- OPTIONNEL, IDEMPOTENT, NON DESTRUCTIF. Préparé pour budgy-preprod.
-- À exécuter UNIQUEMENT sur votre feu vert, APRÈS la migration T3/T4/T5.
-- Aucune donnée modifiée. La SÉCURITÉ des politiques est STRICTEMENT
-- identique avant/après : seul le plan d'exécution change.
-- ============================================================================

-- ─── 1. Index sur user_id (avertissement « RLS policy without index ») ──
-- Chaque politique filtre sur user_id : sans index, chaque requête balaye
-- la table entière. Idempotent (IF NOT EXISTS).
DO $$
DECLARE
  t text;
  tables text[] := array[
    'user_preferences', 'transactions', 'incomes', 'savings_goals',
    'budgets', 'recurring_expenses', 'contracts', 'debts', 'investments',
    'receipts', 'invoices', 'documents', 'expense_groups', 'group_expenses',
    'sync_tombstones'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_user_id ON public.%I (user_id);', t, t);
  END LOOP;
END $$;

-- ─── 2. Politiques RLS « initplan » (avertissement auth_rls_initplan) ──
-- auth.uid() nu est ré-évalué LIGNE PAR LIGNE ; (select auth.uid()) est
-- évalué UNE FOIS par requête. Mêmes règles d'accès, simple optimisation.
-- Recrée les 4 politiques standard des 14 tables métier (mêmes noms).
DO $$
DECLARE
  t text;
  tables text[] := array[
    'user_preferences', 'transactions', 'incomes', 'savings_goals',
    'budgets', 'recurring_expenses', 'contracts', 'debts', 'investments',
    'receipts', 'invoices', 'documents', 'expense_groups', 'group_expenses'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('drop policy if exists "own_select_%s"  on public.%I;', t, t);
    EXECUTE format('create policy "own_select_%s"  on public.%I for select using ((select auth.uid()) = user_id);', t, t);
    EXECUTE format('drop policy if exists "own_insert_%s"  on public.%I;', t, t);
    EXECUTE format('create policy "own_insert_%s"  on public.%I for insert with check ((select auth.uid()) = user_id);', t, t);
    EXECUTE format('drop policy if exists "own_update_%s"  on public.%I;', t, t);
    EXECUTE format('create policy "own_update_%s"  on public.%I for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);', t, t);
    EXECUTE format('drop policy if exists "own_delete_%s"  on public.%I;', t, t);
    EXECUTE format('create policy "own_delete_%s"  on public.%I for delete using ((select auth.uid()) = user_id);', t, t);
  END LOOP;
END $$;

-- Idem pour sync_tombstones (politiques créées par la migration T3)
DROP POLICY IF EXISTS "tombstones_owner_select" ON public.sync_tombstones;
CREATE POLICY "tombstones_owner_select" ON public.sync_tombstones FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "tombstones_owner_insert" ON public.sync_tombstones;
CREATE POLICY "tombstones_owner_insert" ON public.sync_tombstones FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "tombstones_owner_update" ON public.sync_tombstones;
CREATE POLICY "tombstones_owner_update" ON public.sync_tombstones FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "tombstones_owner_delete" ON public.sync_tombstones;
CREATE POLICY "tombstones_owner_delete" ON public.sync_tombstones FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);
-- NB : les 4 politiques Storage (docs_owner_*) peuvent être optimisées de la
-- même façon plus tard ; volume préprod faible → non critique aujourd'hui.

-- ─── 3. VALIDATION (lecture seule) ──────────────────────────────
-- a) 15 index présents (attendu : 15 lignes)
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND indexname LIKE 'idx_%_user_id' ORDER BY 1;
-- b) Toujours 60 politiques public (56 + 4 tombstones), aucune permissive à tous
SELECT count(*) AS policies_public FROM pg_policies WHERE schemaname = 'public';
-- c) Plus aucune politique avec auth.uid() nu (attendu : 0)
SELECT count(*) AS policies_non_optimisees FROM pg_policies
WHERE schemaname = 'public'
  AND (qual LIKE '%auth.uid()%' AND qual NOT LIKE '%( SELECT auth.uid()%'
       OR with_check LIKE '%auth.uid()%' AND with_check NOT LIKE '%( SELECT auth.uid()%');
