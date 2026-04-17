/**
 * GUARDIAN MONEY CHF - Supabase Client
 * Handles authentication and database operations
 */

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Lazy initialization to avoid crash during SSR when env vars aren't loaded
let _supabase: ReturnType<typeof createClient> | null = null;

export const getSupabase = () => {
  if (!_supabase && supabaseUrl && supabaseAnonKey) {
    _supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage as any,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
      },
    });
  }
  return _supabase;
};

// For backward compat - returns a proxy that lazy-inits
export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_, prop) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not configured');
    return (client as any)[prop];
  },
});

// Helper to check if Supabase is configured
export const isSupabaseConfigured = (): boolean => {
  return !!(supabaseUrl && supabaseAnonKey);
};

// Auth helpers
export const signUp = async (email: string, password: string, name: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
    },
  });
  if (error) throw error;
  return data;
};

export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const getSession = async () => {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
};

// Database helpers
export const db = {
  // Transactions
  async getTransactions(userId: string) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async upsertTransaction(userId: string, transaction: any) {
    const { data, error } = await supabase
      .from('transactions')
      .upsert({ ...transaction, user_id: userId })
      .select();
    if (error) throw error;
    return data;
  },

  async deleteTransaction(id: string) {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // Savings Goals
  async getSavingsGoals(userId: string) {
    const { data, error } = await supabase
      .from('savings_goals')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async upsertSavingsGoal(userId: string, goal: any) {
    const { data, error } = await supabase
      .from('savings_goals')
      .upsert({ ...goal, user_id: userId })
      .select();
    if (error) throw error;
    return data;
  },

  async deleteSavingsGoal(id: string) {
    const { error } = await supabase
      .from('savings_goals')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // Budgets
  async getBudgets(userId: string) {
    const { data, error } = await supabase
      .from('budgets')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;
    return data || [];
  },

  async upsertBudget(userId: string, budget: any) {
    const { data, error } = await supabase
      .from('budgets')
      .upsert({ ...budget, user_id: userId })
      .select();
    if (error) throw error;
    return data;
  },

  // Incomes
  async getIncomes(userId: string) {
    const { data, error } = await supabase
      .from('incomes')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;
    return data || [];
  },

  async upsertIncome(userId: string, income: any) {
    const { data, error } = await supabase
      .from('incomes')
      .upsert({ ...income, user_id: userId })
      .select();
    if (error) throw error;
    return data;
  },

  // User Preferences
  async getPreferences(userId: string) {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async upsertPreferences(userId: string, prefs: any) {
    const { data, error } = await supabase
      .from('user_preferences')
      .upsert({ ...prefs, user_id: userId })
      .select();
    if (error) throw error;
    return data;
  },

  // Recurring Expenses
  async getRecurringExpenses(userId: string) {
    const { data, error } = await supabase
      .from('recurring_expenses')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;
    return data || [];
  },

  async upsertRecurringExpense(userId: string, expense: any) {
    const { data, error } = await supabase
      .from('recurring_expenses')
      .upsert({ ...expense, user_id: userId })
      .select();
    if (error) throw error;
    return data;
  },
};

// Create tables SQL (to be run in Supabase SQL editor)
export const CREATE_TABLES_SQL = `
-- Users preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  language TEXT DEFAULT 'fr',
  currency TEXT DEFAULT 'CHF',
  canton TEXT DEFAULT 'VD',
  onboarded BOOLEAN DEFAULT false,
  theme TEXT DEFAULT 'dark',
  is_pro BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  date TEXT,
  category TEXT,
  note TEXT,
  is_pro BOOLEAN DEFAULT false,
  justification TEXT,
  tva NUMERIC(4,1) DEFAULT 0,
  created_at BIGINT,
  updated_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);

-- Incomes table  
CREATE TABLE IF NOT EXISTS incomes (
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
CREATE INDEX IF NOT EXISTS idx_incomes_user ON incomes(user_id);

-- Savings Goals table
CREATE TABLE IF NOT EXISTS savings_goals (
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
CREATE INDEX IF NOT EXISTS idx_savings_user ON savings_goals(user_id);

-- Budgets table
CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  amount_limit NUMERIC(12,2) NOT NULL,
  color TEXT,
  created_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id);

-- Recurring Expenses table
CREATE TABLE IF NOT EXISTS recurring_expenses (
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
CREATE INDEX IF NOT EXISTS idx_recurring_user ON recurring_expenses(user_id);

-- Enable Row Level Security
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE incomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;

-- RLS Policies (users can only see their own data)
CREATE POLICY "Users can CRUD own preferences" ON user_preferences FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can CRUD own transactions" ON transactions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can CRUD own incomes" ON incomes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can CRUD own savings" ON savings_goals FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can CRUD own budgets" ON budgets FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can CRUD own recurring" ON recurring_expenses FOR ALL USING (auth.uid() = user_id);
`;
