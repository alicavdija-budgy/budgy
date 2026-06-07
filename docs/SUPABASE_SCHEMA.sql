-- ============================================================================
-- BUDGY — Schéma Supabase complet (v3.7.28)
-- À appliquer sur https://supabase.budgy.ch → SQL Editor → New query → Run
--
-- ⚠️ Sans ce schéma, la cloud sync échoue silencieusement avec code 42P01
-- (table manquante) ou 42501 (RLS bloque l'écriture).
-- C'est très probablement la cause du bug "données perdues après reconnexion".
--
-- Ce script est IDEMPOTENT : on peut le rejouer sans casser de données.
-- ============================================================================

-- ─── Extension utile ────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Helper : Trigger pour défaut user_id = auth.uid() ──────────────────────
create or replace function public.set_user_id_default()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

-- ─── Tables ──────────────────────────────────────────────────────────────────
-- Convention : chaque table a (id text PK, user_id uuid not null, ...).
-- id est généré côté app (cuid/ulid en TS) pour permettre l'upsert offline.

create table if not exists public.user_preferences (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  currency       text default 'CHF',
  language       text default 'fr',
  canton         text,
  onboarded      boolean default false,
  is_pro         boolean default false,
  updated_at     timestamptz default now()
);

create table if not exists public.transactions (
  id              text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  title           text not null,
  amount          numeric not null,
  category        text,
  date            text,
  payment_method  text,
  note            text,
  created_at      bigint,
  updated_at      bigint,
  synced          boolean
);

create table if not exists public.incomes (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text,
  amount      numeric,
  frequency   text,
  type        text,
  category    text,
  created_at  bigint
);

create table if not exists public.savings_goals (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text,
  emoji       text,
  color       text,
  target      numeric,
  saved       numeric,
  deadline    text,
  category    text,
  created_at  bigint
);

create table if not exists public.budgets (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  category    text,
  monthly     numeric,
  spent       numeric,
  created_at  bigint
);

create table if not exists public.recurring_expenses (
  id              text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  title           text,
  amount          numeric,
  category        text,
  frequency       text,
  active          boolean default true,
  next_date       text,
  created_at      bigint
);

create table if not exists public.contracts (
  id                text primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  title             text,
  issuer            text,
  amount            numeric,
  category          text,
  expiration_date   text,
  start_date        text,
  urgent            boolean,
  auto_renew        boolean,
  notes             text,
  created_at        bigint
);

create table if not exists public.debts (
  id                  text primary key,
  user_id             uuid not null references auth.users(id) on delete cascade,
  title               text,
  color               text,
  total               numeric,
  paid                numeric,
  interest_rate       numeric,
  monthly_payment     numeric,
  created_at          bigint
);

create table if not exists public.investments (
  id              text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  symbol          text,
  shares          numeric,
  avg_cost        numeric,
  current_price   numeric,
  name            text,
  type            text,
  created_at      bigint
);

create table if not exists public.receipts (
  id              text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  merchant        text,
  amount          numeric,
  date            text,
  category        text,
  image_uri       text,
  created_at      bigint
);

create table if not exists public.invoices (
  id              text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  title           text,
  issuer          text,
  amount          numeric,
  currency        text,
  due_date        text,
  invoice_date    text,
  iban            text,
  reference       text,
  category        text,
  status          text,
  source          text,
  created_at      bigint
);

create table if not exists public.documents (
  id              text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  title           text,
  category        text,
  data_uri        text,
  notes           text,
  created_at      bigint
);

create table if not exists public.expense_groups (
  id              text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text,
  members         jsonb,
  created_at      bigint
);

create table if not exists public.group_expenses (
  id              text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  group_id        text,
  title           text,
  amount          numeric,
  paid_by         text,
  split           jsonb,
  date            text,
  created_at      bigint
);

-- ─── Activation RLS sur TOUTES les tables ────────────────────────────────────
alter table public.user_preferences   enable row level security;
alter table public.transactions       enable row level security;
alter table public.incomes            enable row level security;
alter table public.savings_goals      enable row level security;
alter table public.budgets            enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.contracts          enable row level security;
alter table public.debts              enable row level security;
alter table public.investments        enable row level security;
alter table public.receipts           enable row level security;
alter table public.invoices           enable row level security;
alter table public.documents          enable row level security;
alter table public.expense_groups     enable row level security;
alter table public.group_expenses     enable row level security;

-- ─── Policies RLS : user manages own data only ──────────────────────────────
-- Cette macro génère 4 policies (SELECT/INSERT/UPDATE/DELETE) par table.

do $$
declare
  t text;
  tables text[] := array[
    'user_preferences', 'transactions', 'incomes', 'savings_goals',
    'budgets', 'recurring_expenses', 'contracts', 'debts', 'investments',
    'receipts', 'invoices', 'documents', 'expense_groups', 'group_expenses'
  ];
begin
  foreach t in array tables loop
    execute format(
      'drop policy if exists "own_select_%s"  on public.%I;', t, t);
    execute format(
      'drop policy if exists "own_insert_%s"  on public.%I;', t, t);
    execute format(
      'drop policy if exists "own_update_%s"  on public.%I;', t, t);
    execute format(
      'drop policy if exists "own_delete_%s"  on public.%I;', t, t);

    execute format(
      'create policy "own_select_%s"  on public.%I for select using (auth.uid() = user_id);', t, t);
    execute format(
      'create policy "own_insert_%s"  on public.%I for insert with check (auth.uid() = user_id);', t, t);
    execute format(
      'create policy "own_update_%s"  on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id);', t, t);
    execute format(
      'create policy "own_delete_%s"  on public.%I for delete using (auth.uid() = user_id);', t, t);
  end loop;
end;
$$;

-- ─── Triggers : auto-fill user_id si l'app oublie de l'envoyer ──────────────
-- (Sécurité supplémentaire : si pour une raison X l'app n'envoie pas user_id,
--  il sera mis à auth.uid() automatiquement. Évite les inserts perdus.)

do $$
declare
  t text;
  tables text[] := array[
    'transactions', 'incomes', 'savings_goals', 'budgets',
    'recurring_expenses', 'contracts', 'debts', 'investments',
    'receipts', 'invoices', 'documents', 'expense_groups', 'group_expenses'
  ];
begin
  foreach t in array tables loop
    execute format(
      'drop trigger if exists set_user_id_%s on public.%I;', t, t);
    execute format(
      'create trigger set_user_id_%s before insert on public.%I for each row execute function public.set_user_id_default();', t, t);
  end loop;
end;
$$;

-- ─── Vérification rapide ────────────────────────────────────────────────────
-- Pour vérifier que tout est OK, exécute ensuite :
--   select tablename, rowsecurity from pg_tables where schemaname = 'public';
-- → toutes les tables Budgy doivent avoir rowsecurity = true.
--
--   select tablename, count(*) as n_policies
--   from pg_policies where schemaname = 'public' group by tablename;
-- → chaque table Budgy doit avoir 4 policies.
