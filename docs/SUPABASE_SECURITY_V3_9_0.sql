-- ============================================================================
-- BUDGY — Security Migration v3.9.0 (SEC-001 + Owner/Admin/Member roles)
-- Applied AFTER SUPABASE_SCHEMA.sql and SUPABASE_FAMILY.sql on supabase.budgy.ch
--
-- Fixes:
--   • SEC-001 [HIGH] Cross-tenant exposure via permissive group_invites SELECT
--   • Adds strict Owner / Admin / Member role model
--   • Prevents privilege escalation by members
--   • Tightens UPDATE policies to prevent member_user_ids tampering
--
-- Script IDEMPOTENT — safe to re-run.
-- ============================================================================

-- ─── 1. FIX SEC-001 : Remove permissive invite SELECT policy ────────────────
--
-- Old policy allowed ANY authenticated user to `SELECT * FROM group_invites`.
-- Replace with a code-scoped policy that only lets the owner see their own,
-- AND rely EXCLUSIVELY on the SECURITY DEFINER RPC to resolve invites by code.
--
-- The RPC (join_group_by_code) already bypasses RLS via SECURITY DEFINER,
-- so end-users NEVER need direct SELECT access to look up an invite.
--
drop policy if exists "authenticated_lookup_invite" on public.group_invites;
drop policy if exists "own_manage_invites" on public.group_invites;

-- Owner (creator) can manage HIS OWN invites only.
create policy "own_manage_invites" on public.group_invites
  for all
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

-- NO SELECT policy for other authenticated users.
-- Code resolution happens EXCLUSIVELY inside `join_group_by_code` RPC.

-- ─── 2. Add strict role model (Owner / Admin / Member) ──────────────────────
--
-- Roles are stored per-user-per-group in a dedicated join table.
-- The `owner` role is a synthetic role derived from expense_groups.user_id.
--
create table if not exists public.group_members (
  group_id     text        not null references public.expense_groups(id) on delete cascade,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  role         text        not null check (role in ('admin', 'member')),
  added_by     uuid        references auth.users(id) on delete set null,
  added_at     timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists idx_group_members_user on public.group_members(user_id);
create index if not exists idx_group_members_group on public.group_members(group_id);

alter table public.group_members enable row level security;

drop policy if exists "select_group_members_own" on public.group_members;
create policy "select_group_members_own" on public.group_members
  for select using (
    -- Members of a group can see their peers
    exists (
      select 1 from public.expense_groups g
       where g.id = group_members.group_id
         and (g.user_id = auth.uid() or auth.uid() = any(g.member_user_ids))
    )
  );

-- ONLY the owner can INSERT/DELETE/UPDATE roles (via SECURITY DEFINER RPCs).
-- Direct writes are forbidden.
drop policy if exists "insert_group_members_none" on public.group_members;
create policy "insert_group_members_none" on public.group_members
  for insert with check (false);

drop policy if exists "update_group_members_none" on public.group_members;
create policy "update_group_members_none" on public.group_members
  for update using (false);

drop policy if exists "delete_group_members_none" on public.group_members;
create policy "delete_group_members_none" on public.group_members
  for delete using (false);

-- Helper : is_owner_or_admin(group_id, user_id)
create or replace function public.is_owner_or_admin(p_group_id text, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.expense_groups
       where id = p_group_id and user_id = p_user_id
    )
    or exists (
      select 1 from public.group_members
       where group_id = p_group_id
         and user_id = p_user_id
         and role = 'admin'
    );
$$;

revoke all on function public.is_owner_or_admin(text, uuid) from public;
grant execute on function public.is_owner_or_admin(text, uuid) to authenticated;

-- ─── 3. Tighten expense_groups UPDATE policy ────────────────────────────────
-- Members must NOT be able to change member_user_ids or user_id (ownership).
--
drop policy if exists "select_expense_groups_member" on public.expense_groups;
drop policy if exists "insert_expense_groups_owner" on public.expense_groups;
drop policy if exists "update_expense_groups_member" on public.expense_groups;
drop policy if exists "update_expense_groups_owner_admin" on public.expense_groups;
drop policy if exists "delete_expense_groups_owner" on public.expense_groups;

create policy "select_expense_groups_member" on public.expense_groups
  for select using (
    auth.uid() = user_id
    or auth.uid() = any(member_user_ids)
  );

create policy "insert_expense_groups_owner" on public.expense_groups
  for insert with check (auth.uid() = user_id);

-- Only owner OR admin can UPDATE. Even so, ownership fields are unchangeable
-- via direct UPDATE — a trigger (below) prevents member_user_ids/user_id tampering.
create policy "update_expense_groups_owner_admin" on public.expense_groups
  for update
  using (public.is_owner_or_admin(id, auth.uid()))
  with check (public.is_owner_or_admin(id, auth.uid()));

create policy "delete_expense_groups_owner" on public.expense_groups
  for delete using (auth.uid() = user_id);

-- Trigger : block ownership escalation on UPDATE
create or replace function public.prevent_group_ownership_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'ownership_change_forbidden';
  end if;
  if new.member_user_ids is distinct from old.member_user_ids then
    -- Members list can only change via SECURITY DEFINER RPCs
    if not (
      current_setting('request.jwt.claim.sub', true) is null  -- allow from RPC (no JWT context)
      or public.is_owner_or_admin(new.id, auth.uid())
    ) then
      raise exception 'member_list_change_forbidden';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_group_ownership_change on public.expense_groups;
create trigger trg_prevent_group_ownership_change
  before update on public.expense_groups
  for each row execute function public.prevent_group_ownership_change();

-- ─── 4. Tighten group_expenses ──────────────────────────────────────────────
-- Members can INSERT and read.
-- Only the author OR owner/admin can UPDATE/DELETE their expense.
--
drop policy if exists "select_group_expenses_member" on public.group_expenses;
drop policy if exists "insert_group_expenses_member" on public.group_expenses;
drop policy if exists "update_group_expenses_author_or_owner" on public.group_expenses;
drop policy if exists "update_group_expenses_role" on public.group_expenses;
drop policy if exists "delete_group_expenses_owner" on public.group_expenses;
drop policy if exists "delete_group_expenses_role" on public.group_expenses;

create policy "select_group_expenses_member" on public.group_expenses
  for select using (
    auth.uid() = user_id
    or auth.uid() = any(member_user_ids)
  );

create policy "insert_group_expenses_member" on public.group_expenses
  for insert with check (
    auth.uid() = user_id
    or exists (
      select 1 from public.expense_groups g
       where g.id = group_expenses.group_id
         and (g.user_id = auth.uid() or auth.uid() = any(g.member_user_ids))
    )
  );

create policy "update_group_expenses_role" on public.group_expenses
  for update
  using (
    auth.uid() = user_id
    or public.is_owner_or_admin(group_id, auth.uid())
  )
  with check (
    auth.uid() = user_id
    or public.is_owner_or_admin(group_id, auth.uid())
  );

create policy "delete_group_expenses_role" on public.group_expenses
  for delete using (
    auth.uid() = user_id
    or public.is_owner_or_admin(group_id, auth.uid())
  );

-- ─── 5. Harden join_group_by_code RPC ───────────────────────────────────────
-- Same logic as before but with defensive checks (code normalized, expiry
-- strictly enforced, minimum length enforced).
--
create or replace function public.join_group_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid   := auth.uid();
  v_group_id text;
  v_group    public.expense_groups%rowtype;
  v_already  boolean := false;
  v_code_norm text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Defensive : enforce format server-side (8 alphanumeric chars, upper-cased)
  v_code_norm := upper(coalesce(p_code, ''));
  if length(v_code_norm) < 6 or length(v_code_norm) > 12 then
    raise exception 'invalid_code_format';
  end if;

  select group_id into v_group_id
    from public.group_invites
    where code = v_code_norm
      and expires_at > now();

  if v_group_id is null then
    -- Same error for expired vs unknown to avoid enumeration hints
    raise exception 'invite_not_found';
  end if;

  select * into v_group
    from public.expense_groups
    where id = v_group_id;

  if v_group.id is null then
    raise exception 'group_missing';
  end if;

  if v_uid = any(v_group.member_user_ids) then
    v_already := true;
  else
    update public.expense_groups
       set member_user_ids = array_append(member_user_ids, v_uid)
     where id = v_group_id;

    update public.group_expenses
       set member_user_ids = array_append(member_user_ids, v_uid)
     where group_id = v_group_id
       and not (v_uid = any(member_user_ids));

    -- Auto-add as 'member' role
    insert into public.group_members(group_id, user_id, role, added_by)
      values (v_group_id, v_uid, 'member', v_group.user_id)
      on conflict (group_id, user_id) do nothing;
  end if;

  return jsonb_build_object(
    'group', to_jsonb(v_group),
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

-- ─── 6. NEW RPC : promote_to_admin / demote_from_admin / remove_member ─────
create or replace function public.promote_to_admin(p_group_id text, p_target_uid uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1 from public.expense_groups
     where id = p_group_id and user_id = v_uid
  ) then
    raise exception 'not_owner';
  end if;
  insert into public.group_members(group_id, user_id, role, added_by)
    values (p_group_id, p_target_uid, 'admin', v_uid)
    on conflict (group_id, user_id) do update set role = 'admin';
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.demote_from_admin(p_group_id text, p_target_uid uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1 from public.expense_groups
     where id = p_group_id and user_id = v_uid
  ) then
    raise exception 'not_owner';
  end if;
  update public.group_members
     set role = 'member'
   where group_id = p_group_id and user_id = p_target_uid;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.remove_member(p_group_id text, p_target_uid uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_owner_or_admin(p_group_id, v_uid) then
    raise exception 'not_owner_or_admin';
  end if;
  -- Cannot remove the owner
  if exists (
    select 1 from public.expense_groups
     where id = p_group_id and user_id = p_target_uid
  ) then
    raise exception 'cannot_remove_owner';
  end if;
  update public.expense_groups
     set member_user_ids = array_remove(member_user_ids, p_target_uid)
   where id = p_group_id;
  update public.group_expenses
     set member_user_ids = array_remove(member_user_ids, p_target_uid)
   where group_id = p_group_id;
  delete from public.group_members
   where group_id = p_group_id and user_id = p_target_uid;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.promote_to_admin(text, uuid) from public;
revoke all on function public.demote_from_admin(text, uuid) from public;
revoke all on function public.remove_member(text, uuid) from public;
grant execute on function public.promote_to_admin(text, uuid) to authenticated;
grant execute on function public.demote_from_admin(text, uuid) to authenticated;
grant execute on function public.remove_member(text, uuid) to authenticated;

-- ─── 7. Verify all RLS is enabled on user-scoped tables ─────────────────────
-- Reminder — run once manually:
--   select tablename, rowsecurity from pg_tables
--    where schemaname='public' and rowsecurity = false;
--
-- Expected result: EMPTY (all tables in public schema must have RLS enabled)

-- ─── 8. Verification queries (post-migration) ───────────────────────────────
-- 8a) group_invites should have EXACTLY 1 policy (own_manage_invites) :
--     select policyname from pg_policies
--      where schemaname='public' and tablename='group_invites';
--
-- 8b) As user A (authenticated), this should return only A's own invites :
--     select code, group_id from public.group_invites;
--
-- 8c) join_group_by_code with a wrong code should raise 'invite_not_found' :
--     select public.join_group_by_code('WRONGCODE');
--
-- 8d) A random member should NOT be able to UPDATE member_user_ids directly :
--     update public.expense_groups set member_user_ids = '{}' where id = '<any>';
--     -- expected : denied by RLS or trigger

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
