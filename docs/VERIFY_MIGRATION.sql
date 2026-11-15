-- BUDGY — VÉRIFICATION POST-MIGRATION (LECTURE SEULE — préproduction)
-- À exécuter APRÈS docs/MIGRATION_TASK3_storage_prive.sql sur la base de TEST.
-- Aucune écriture : uniquement des SELECT de contrôle.

-- 1) Colonnes attendues (types + nullabilité) — tout doit apparaître, is_nullable = YES
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'transactions' AND column_name IN ('currency', 'invoice_id', 'debt_id', 'recurring_id'))
 OR (table_name = 'invoices'  AND column_name IN ('paid_at', 'recurring_id', 'document_id', 'qr_payload', 'chf_amount', 'fx_rate', 'fx_date', 'fx_source'))
 OR (table_name = 'documents' AND column_name IN ('document_type', 'mime_type', 'remote_path', 'file_size', 'imported_at', 'expires_at', 'spc_payload', 'updated_at'))
  )
ORDER BY table_name, column_name;

-- 2) Anciennes lignes INTACTES : les nouvelles colonnes doivent être NULL
--    (jamais 0 ni '') sur les enregistrements antérieurs à la migration.
SELECT count(*) AS invoices_legacy_non_null
FROM public.invoices
WHERE chf_amount IS NOT NULL OR fx_rate IS NOT NULL; -- attendu : 0 avant toute synchro post-migration

-- 3) Table des tombstones + RLS activée sur toutes les tables
SELECT c.relname, c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('transactions', 'invoices', 'documents', 'contracts', 'receipts', 'sync_tombstones');

-- 4) Politiques owner-only (chaque table doit filtrer sur auth.uid() = user_id)
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 5) Bucket privé documents : public doit être FALSE
SELECT id, name, public FROM storage.buckets WHERE name IN ('user-documents', 'documents');

-- 6) Politiques Storage : accès restreint au préfixe users/{uid}/
SELECT policyname, cmd, qual FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;

-- 7) Isolation 2 comptes (à exécuter avec le JWT du compte B via l'API REST,
--    PAS en service_role) : doit retourner 0 ligne pour les données de A.
-- SELECT count(*) FROM public.invoices;  -- en tant que B : uniquement les siennes
