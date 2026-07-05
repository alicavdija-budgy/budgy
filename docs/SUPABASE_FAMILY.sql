-- ============================================================================
-- BUDGY — Migration Supabase Famille & Groupes (Milestone A, v3.8.0)
-- À appliquer APRÈS `SUPABASE_SCHEMA.sql` sur https://supabase.budgy.ch
--
-- Ajoute :
--   • Table `group_invites` (code → group_id) pour l'invitation cross-device
--   • Colonne `member_user_ids uuid[]` sur expense_groups + group_expenses
--   • RLS étendues pour permettre l'accès en LECTURE aux membres invités
--   • RPC `join_group_by_code(text)` (SECURITY DEFINER) qui gère l'entrée
--   • RPC `leave_group(text)` pour quitter un groupe
--
-- Script IDEMPOTENT : rejouable sans casser de données.
-- Realtime cross-device : NON activé ici (arrive en Milestone B).
-- ============================================================================

-- ─── 1. Table group_invites ─────────────────────────────────────────────────
create table if not exists public.group_invites (
  code           text primary key,
  group_id       text not null,
  created_by     uuid not null references auth.users(id) on delete cascade,
  created_at     timestamptz default now(),
  expires_at     timestamptz not null
);

-- v3.8.0 iter_10 : ajouter CASCADE si la contrainte a été créée sans (idempotent)
alter table public.group_invites drop constraint if exists group_invites_group_id_fkey;
alter table public.group_invites
  add constraint group_invites_group_id_fkey
  foreign key (group_id) references public.expense_groups(id) on delete cascade;

-- Purge des orphelins historiques éventuels
delete from public.group_invites
 where group_id not in (select id from public.expense_groups);

create index if not exists idx_group_invites_group_id on public.group_invites(group_id);

alter table public.group_invites enable row level security;

-- Le créateur peut gérer ses propres invitations.
drop policy if exists "own_manage_invites" on public.group_invites;
create policy "own_manage_invites" on public.group_invites
  for all using (auth.uid() = created_by) with check (auth.uid() = created_by);

-- N'importe quel utilisateur authentifié peut LIRE un code (pour rejoindre).
-- La confidentialité vient du fait que le code fait 8 caractères aléatoires
-- (32^8 ≈ 1 000 milliards de combinaisons) et est short-lived (30 jours).
drop policy if exists "authenticated_lookup_invite" on public.group_invites;
create policy "authenticated_lookup_invite" on public.group_invites
  for select using (auth.role() = 'authenticated');

-- ─── 2. Extension expense_groups + group_expenses ───────────────────────────
alter table public.expense_groups
  add column if not exists member_user_ids uuid[] not null default '{}';

alter table public.group_expenses
  add column if not exists member_user_ids uuid[] not null default '{}';

-- Backfill : owner is a member of his own groups
update public.expense_groups
   set member_user_ids = array[user_id]
 where member_user_ids = '{}' or member_user_ids is null;

update public.group_expenses ge
   set member_user_ids = coalesce(
         (select member_user_ids from public.expense_groups g where g.id = ge.group_id),
         array[ge.user_id]
       )
 where member_user_ids = '{}' or member_user_ids is null;

-- ─── 3. RLS étendues : membres peuvent LIRE + AJOUTER des dépenses ──────────
-- expense_groups
drop policy if exists "own_select_expense_groups"  on public.expense_groups;
drop policy if exists "own_insert_expense_groups"  on public.expense_groups;
drop policy if exists "own_update_expense_groups"  on public.expense_groups;
drop policy if exists "own_delete_expense_groups"  on public.expense_groups;

create policy "select_expense_groups_member" on public.expense_groups
  for select using (
    auth.uid() = user_id
    or auth.uid() = any(member_user_ids)
  );
create policy "insert_expense_groups_owner" on public.expense_groups
  for insert with check (auth.uid() = user_id);
create policy "update_expense_groups_member" on public.expense_groups
  for update using (
    auth.uid() = user_id or auth.uid() = any(member_user_ids)
  ) with check (
    auth.uid() = user_id or auth.uid() = any(member_user_ids)
  );
create policy "delete_expense_groups_owner" on public.expense_groups
  for delete using (auth.uid() = user_id);

-- group_expenses
drop policy if exists "own_select_group_expenses"  on public.group_expenses;
drop policy if exists "own_insert_group_expenses"  on public.group_expenses;
drop policy if exists "own_update_group_expenses"  on public.group_expenses;
drop policy if exists "own_delete_group_expenses"  on public.group_expenses;

create policy "select_group_expenses_member" on public.group_expenses
  for select using (
    auth.uid() = user_id
    or auth.uid() = any(member_user_ids)
  );
create policy "insert_group_expenses_member" on public.group_expenses
  for insert with check (
    auth.uid() = user_id or auth.uid() = any(member_user_ids)
  );
create policy "update_group_expenses_author_or_owner" on public.group_expenses
  for update using (
    auth.uid() = user_id or auth.uid() = any(member_user_ids)
  ) with check (
    auth.uid() = user_id or auth.uid() = any(member_user_ids)
  );
create policy "delete_group_expenses_owner" on public.group_expenses
  for delete using (auth.uid() = user_id);

-- ─── 4. RPC : join_group_by_code ────────────────────────────────────────────
-- Appelé par le client authentifié. Fait tout en atomique côté DB.
-- Retour :
--   { group: {...}, expenses: [...], already_member: bool }
create or replace function public.join_group_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_group_id text;
  v_group public.expense_groups%rowtype;
  v_expenses jsonb;
  v_already boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Look up the code (any authenticated user can read invites)
  select group_id into v_group_id
    from public.group_invites
    where code = upper(p_code)
      and expires_at > now();

  if v_group_id is null then
    raise exception 'invite_not_found';
  end if;

  -- Fetch the group (bypass RLS thanks to SECURITY DEFINER)
  select * into v_group
    from public.expense_groups
    where id = v_group_id;

  if v_group.id is null then
    raise exception 'group_missing';
  end if;

  -- Append caller to member_user_ids (idempotent) + mark already_member
  if v_uid = any(v_group.member_user_ids) then
    v_already := true;
  else
    update public.expense_groups
       set member_user_ids = array_append(member_user_ids, v_uid)
     where id = v_group_id;
    -- Cascade on group_expenses so RLS lets the caller read them
    update public.group_expenses
       set member_user_ids = array_append(member_user_ids, v_uid)
     where group_id = v_group_id
       and not (v_uid = any(member_user_ids));
  end if;

  -- Fetch the (possibly updated) group + expenses
  select to_jsonb(g) into v_expenses
    from public.expense_groups g
    where g.id = v_group_id;

  return jsonb_build_object(
    'group', v_expenses,
    'expenses', coalesce(
      (select jsonb_agg(to_jsonb(e))
         from public.group_expenses e
        where e.group_id = v_group_id),
      '[]'::jsonb
    ),
    'already_member', v_already
  );
end;
$$;

revoke all on function public.join_group_by_code(text) from public;
grant execute on function public.join_group_by_code(text) to authenticated;

-- ─── 5. RPC : leave_group ───────────────────────────────────────────────────
create or replace function public.leave_group(p_group_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Owner cannot leave via this function (must delete the group instead)
  if exists (
    select 1 from public.expense_groups
     where id = p_group_id and user_id = v_uid
  ) then
    raise exception 'owner_cannot_leave';
  end if;

  update public.expense_groups
     set member_user_ids = array_remove(member_user_ids, v_uid)
   where id = p_group_id;

  update public.group_expenses
     set member_user_ids = array_remove(member_user_ids, v_uid)
   where group_id = p_group_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.leave_group(text) from public;
grant execute on function public.leave_group(text) to authenticated;

-- ─── 6. Vérification manuelle rapide ────────────────────────────────────────
-- select code, group_id, expires_at from public.group_invites limit 5;
-- select tablename, count(*) from pg_policies
--   where schemaname='public'
--     and tablename in ('expense_groups','group_expenses','group_invites')
--  group by tablename;
--
-- Attendu :
--   expense_groups     → 4 policies
--   group_expenses     → 4 policies
--   group_invites      → 2 policies
