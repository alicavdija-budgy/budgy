-- ============================================================
-- GUARDIAN MONEY CHF - Complete Schema (Supabase)
-- ============================================================
-- HOW TO RUN:
--   1. Open Supabase Studio → https://supabase.delami.online
--   2. SQL Editor → + New query
--   3. Paste this entire file
--   4. Click "Run"
--
-- This file is SAFE to re-run (uses IF NOT EXISTS / DROP IF EXISTS).
-- All RLS policies are PRE-OPTIMIZED with (select auth.uid()).
-- ============================================================

-- ───────────────────── TABLES ─────────────────────

-- 1. user_preferences
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  language TEXT DEFAULT 'fr',
  currency TEXT DEFAULT 'CHF',
  canton TEXT DEFAULT 'VD',
  onboarded BOOLEAN DEFAULT false,
  theme TEXT DEFAULT 'dark',
  is_pro BOOLEAN DEFAULT false,
  monthly_income NUMERIC(12,2),
  household TEXT,
  children INTEGER DEFAULT 0,
  goals JSONB DEFAULT '[]'::jsonb,
  employment_type TEXT,
  biometric_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. transactions
CREATE TABLE IF NOT EXISTS public.transactions (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  date TEXT,
  category TEXT,
  payment_method TEXT,
  note TEXT,
  receipt TEXT,
  is_pro BOOLEAN DEFAULT false,
  justification TEXT,
  tva NUMERIC(4,1) DEFAULT 0,
  created_at BIGINT,
  updated_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions(date);

-- 3. incomes
CREATE TABLE IF NOT EXISTS public.incomes (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  type TEXT DEFAULT 'recurring',
  frequency TEXT,
  category TEXT,
  color TEXT,
  icon TEXT,
  created_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_incomes_user ON public.incomes(user_id);

-- 4. savings_goals
CREATE TABLE IF NOT EXISTS public.savings_goals (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  emoji TEXT,
  target NUMERIC(12,2) DEFAULT 0,
  saved NUMERIC(12,2) DEFAULT 0,
  color TEXT,
  category TEXT,
  deadline TEXT,
  auto_save NUMERIC(12,2) DEFAULT 0,
  tip TEXT,
  created_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_savings_user ON public.savings_goals(user_id);

-- 5. budgets
CREATE TABLE IF NOT EXISTS public.budgets (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  amount_limit NUMERIC(12,2) NOT NULL,
  color TEXT,
  created_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_budgets_user ON public.budgets(user_id);

-- 6. recurring_expenses
CREATE TABLE IF NOT EXISTS public.recurring_expenses (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  category TEXT,
  frequency TEXT DEFAULT 'monthly',
  day_of_month INTEGER DEFAULT 1,
  color TEXT,
  active BOOLEAN DEFAULT true,
  created_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_recurring_user ON public.recurring_expenses(user_id);

-- 7. contracts
CREATE TABLE IF NOT EXISTS public.contracts (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT,
  monthly_cost NUMERIC(12,2) DEFAULT 0,
  end_date TEXT,
  notice_period_days INTEGER DEFAULT 0,
  notes TEXT,
  created_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_contracts_user ON public.contracts(user_id);

-- 8. debts
CREATE TABLE IF NOT EXISTS public.debts (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  remaining NUMERIC(12,2) NOT NULL,
  interest_rate NUMERIC(6,3) DEFAULT 0,
  monthly_payment NUMERIC(12,2) DEFAULT 0,
  end_date TEXT,
  type TEXT,
  created_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_debts_user ON public.debts(user_id);

-- 9. investments
CREATE TABLE IF NOT EXISTS public.investments (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT,
  invested NUMERIC(12,2) DEFAULT 0,
  current_value NUMERIC(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'CHF',
  notes TEXT,
  created_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_investments_user ON public.investments(user_id);

-- 10. receipts (NEW - scanned tickets)
CREATE TABLE IF NOT EXISTS public.receipts (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  image_base64 TEXT,
  merchant TEXT,
  amount NUMERIC(12,2),
  currency TEXT DEFAULT 'CHF',
  date TEXT,
  category TEXT,
  type TEXT DEFAULT 'ticket',
  items JSONB,
  note TEXT,
  transaction_id TEXT,
  created_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_receipts_user ON public.receipts(user_id);

-- 11. invoices (NEW - factures)
CREATE TABLE IF NOT EXISTS public.invoices (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  issuer TEXT,
  amount NUMERIC(12,2),
  currency TEXT DEFAULT 'CHF',
  due_date TEXT,
  invoice_date TEXT,
  iban TEXT,
  reference TEXT,
  category TEXT,
  status TEXT DEFAULT 'pending',
  source TEXT DEFAULT 'manual',
  created_at BIGINT,
  paid_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_invoices_user ON public.invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);

-- 12. documents (NEW - personal classeur)
CREATE TABLE IF NOT EXISTS public.documents (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT,
  image_base64 TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  note TEXT,
  expires_at TEXT,
  created_at BIGINT,
  updated_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_documents_user ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_category ON public.documents(category);

-- 13. expense_groups (NEW - shared groups)
CREATE TABLE IF NOT EXISTS public.expense_groups (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT,
  color TEXT,
  members JSONB NOT NULL,
  currency TEXT DEFAULT 'CHF',
  created_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_groups_user ON public.expense_groups(user_id);

-- 14. group_expenses (NEW)
CREATE TABLE IF NOT EXISTS public.group_expenses (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES public.expense_groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT DEFAULT 'CHF',
  paid_by TEXT NOT NULL,
  split_mode TEXT DEFAULT 'equal',
  shares JSONB NOT NULL,
  date TEXT,
  category TEXT,
  note TEXT,
  created_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_gexp_user ON public.group_expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_gexp_group ON public.group_expenses(group_id);

-- ─────────────── ENABLE RLS ───────────────
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_expenses ENABLE ROW LEVEL SECURITY;

-- ─────────────── RLS POLICIES (pre-optimized) ───────────────
DROP POLICY IF EXISTS "Users own preferences" ON public.user_preferences;
CREATE POLICY "Users own preferences" ON public.user_preferences
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users own transactions" ON public.transactions;
CREATE POLICY "Users own transactions" ON public.transactions
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users own incomes" ON public.incomes;
CREATE POLICY "Users own incomes" ON public.incomes
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users own savings" ON public.savings_goals;
CREATE POLICY "Users own savings" ON public.savings_goals
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users own budgets" ON public.budgets;
CREATE POLICY "Users own budgets" ON public.budgets
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users own recurring" ON public.recurring_expenses;
CREATE POLICY "Users own recurring" ON public.recurring_expenses
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users own contracts" ON public.contracts;
CREATE POLICY "Users own contracts" ON public.contracts
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users own debts" ON public.debts;
CREATE POLICY "Users own debts" ON public.debts
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users own investments" ON public.investments;
CREATE POLICY "Users own investments" ON public.investments
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users own receipts" ON public.receipts;
CREATE POLICY "Users own receipts" ON public.receipts
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users own invoices" ON public.invoices;
CREATE POLICY "Users own invoices" ON public.invoices
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users own documents" ON public.documents;
CREATE POLICY "Users own documents" ON public.documents
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users own groups" ON public.expense_groups;
CREATE POLICY "Users own groups" ON public.expense_groups
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users own group expenses" ON public.group_expenses;
CREATE POLICY "Users own group expenses" ON public.group_expenses
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- ─────────────── REFRESH POSTGREST SCHEMA CACHE ───────────────
NOTIFY pgrst, 'reload schema';
