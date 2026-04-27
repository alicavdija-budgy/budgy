-- ============================================================
-- GUARDIAN MONEY CHF - RLS Performance Fix
-- ============================================================
-- Fixes the 10 "auth_rls_initplan" warnings from Supabase linter.
-- Replaces auth.uid() with (select auth.uid()) so Postgres caches
-- the value once per query instead of re-evaluating per row.
--
-- HOW TO RUN:
--   1. Open Supabase Dashboard → SQL Editor
--   2. Paste this entire file
--   3. Click "Run"
--   4. Re-run the linter — all 10 warnings should be gone.
--
-- SAFE: idempotent (DROP IF EXISTS + CREATE), preserves data.
-- ============================================================

BEGIN;

-- ── 1. user_preferences ─────────────────────────────────────
DROP POLICY IF EXISTS "Users own preferences" ON public.user_preferences;
CREATE POLICY "Users own preferences" ON public.user_preferences
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── 2. transactions ────────────────────────────────────────
DROP POLICY IF EXISTS "Users own transactions" ON public.transactions;
CREATE POLICY "Users own transactions" ON public.transactions
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── 3. incomes ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Users own incomes" ON public.incomes;
CREATE POLICY "Users own incomes" ON public.incomes
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── 4. savings_goals ───────────────────────────────────────
DROP POLICY IF EXISTS "Users own savings" ON public.savings_goals;
CREATE POLICY "Users own savings" ON public.savings_goals
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── 5. budgets ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Users own budgets" ON public.budgets;
CREATE POLICY "Users own budgets" ON public.budgets
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── 6. recurring_expenses ──────────────────────────────────
DROP POLICY IF EXISTS "Users own recurring" ON public.recurring_expenses;
CREATE POLICY "Users own recurring" ON public.recurring_expenses
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── 7. contracts ───────────────────────────────────────────
DROP POLICY IF EXISTS "Users own contracts" ON public.contracts;
CREATE POLICY "Users own contracts" ON public.contracts
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── 8. debts ───────────────────────────────────────────────
DROP POLICY IF EXISTS "Users own debts" ON public.debts;
CREATE POLICY "Users own debts" ON public.debts
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── 9. investments ─────────────────────────────────────────
DROP POLICY IF EXISTS "Users own investments" ON public.investments;
CREATE POLICY "Users own investments" ON public.investments
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

COMMIT;

-- ============================================================
-- VERIFICATION (optional)
-- ============================================================
-- After running, verify the policies were updated:
SELECT
  schemaname,
  tablename,
  policyname,
  qual AS using_expression,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'user_preferences', 'transactions', 'incomes', 'savings_goals',
    'budgets', 'recurring_expenses', 'contracts', 'debts', 'investments'
  )
ORDER BY tablename;
-- All using_expression values should now contain "( SELECT auth.uid()" instead of "auth.uid()"
