-- ─────────────────────────────────────────────────────────────────────────
-- BUDGY — Supabase IAP migration
-- Run this ONCE in:  Supabase Dashboard → SQL Editor → New query → paste → Run.
-- It is idempotent (safe to re-run).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.user_subscriptions (
    user_id uuid primary key references auth.users(id) on delete cascade,
    is_pro boolean not null default false,
    subscription_state text not null default 'FREE'
        check (subscription_state in ('FREE','PRO','EXPIRED','GRACE_PERIOD','REFUNDED')),
    pro_until timestamptz,
    apple_original_transaction_id text,
    apple_product_id text,
    environment text,
    last_receipt_validation timestamptz,
    updated_at timestamptz not null default now()
);

-- Helpful indexes
create index if not exists idx_user_subs_orig_tx
    on public.user_subscriptions (apple_original_transaction_id);
create index if not exists idx_user_subs_state
    on public.user_subscriptions (subscription_state);
create index if not exists idx_user_subs_pro_until
    on public.user_subscriptions (pro_until);

-- Auto-touch updated_at
create or replace function public._touch_user_subs() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_touch_user_subs on public.user_subscriptions;
create trigger trg_touch_user_subs
    before update on public.user_subscriptions
    for each row execute function public._touch_user_subs();

-- ── Row-Level Security
-- The SERVICE ROLE key bypasses RLS and is the ONLY thing that should write
-- to this table. End-users may read their own row through the anon key.
alter table public.user_subscriptions enable row level security;

drop policy if exists "user can read own subscription" on public.user_subscriptions;
create policy "user can read own subscription"
    on public.user_subscriptions
    for select
    using (auth.uid() = user_id);

-- Optional: convenient view exposing only "is the user Pro right now?"
create or replace view public.v_user_pro as
select
    user_id,
    is_pro and (pro_until is null or pro_until > now()) as effective_pro,
    subscription_state,
    pro_until
from public.user_subscriptions;
