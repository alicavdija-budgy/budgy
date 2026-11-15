-- ============================================================================
-- BUDGY — CORRECTIF DE SÉCURITÉ P0 : public.set_user_id_default()
-- Corrige les 3 avertissements de l'audit Supabase :
--   • function_search_path_mutable
--   • anon_security_definer_function_executable
--   • authenticated_security_definer_function_executable
--
-- À exécuter dans le SQL Editor de budgy-preprod (PAS automatiquement).
-- IDEMPOTENT : rejouable sans effet de bord. Ne touche AUCUNE donnée.
-- CREATE OR REPLACE conserve les 13 déclencheurs set_user_id_* existants
-- (ils référencent la fonction par OID — aucun re-câblage nécessaire).
-- ============================================================================

-- 1) SECURITY INVOKER : la fonction s'exécute avec les droits de
--    l'utilisateur qui insère (le rôle authenticated), PAS ceux du
--    propriétaire. Elle ne lit que NEW et auth.uid() — aucun privilège
--    élevé n'est nécessaire, donc DEFINER était un risque inutile.
-- 2) search_path épinglé à '' : plus aucune résolution d'objet via un
--    schéma contrôlable par un tiers (auth.uid() est déjà qualifié).
-- 3) Comportement fonctionnel INCHANGÉ : user_id manquant → auth.uid().
create or replace function public.set_user_id_default()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

-- 4) Retrait du droit EXECUTE direct : personne ne peut appeler la
--    fonction à la main (anon, authenticated, PUBLIC). Les DÉCLENCHEURS
--    continuent de fonctionner : PostgreSQL vérifie EXECUTE au moment du
--    CREATE TRIGGER (déjà fait), pas à chaque déclenchement.
revoke execute on function public.set_user_id_default() from public;
revoke execute on function public.set_user_id_default() from anon;
revoke execute on function public.set_user_id_default() from authenticated;

-- ============================================================================
-- VALIDATION (lecture seule) — exécuter APRÈS le correctif
-- ============================================================================

-- V1) Attendu : security_definer = false, config contient search_path=""
select p.proname,
       p.prosecdef  as security_definer,
       p.proconfig  as config,
       p.proacl     as acl   -- attendu : anon/authenticated ABSENTS de l'ACL
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'set_user_id_default';

-- V2) Les 13 déclencheurs sont toujours en place (attendu : 13)
select count(*) as nb_triggers
from information_schema.triggers
where trigger_schema = 'public' and trigger_name like 'set_user_id_%';

-- ============================================================================
-- VALIDATION FONCTIONNELLE (avec un compte de test, via l'app ou l'API REST,
-- JAMAIS avec la clé service_role) :
--  a) INSERT d'une transaction SANS user_id → la ligne reçoit auth.uid() ;
--  b) INSERT avec SON PROPRE user_id → accepté tel quel ;
--  c) INSERT avec le user_id d'un AUTRE compte → REFUSÉ par la politique
--     RLS "WITH CHECK (auth.uid() = user_id)" (la fonction ne modifie pas
--     un user_id non NULL : aucun contournement possible) ;
--  d) SELECT des données d'un autre compte → 0 ligne (RLS inchangée).
-- ============================================================================
