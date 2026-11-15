-- BUDGY — VÉRIFICATION DE MIGRATION (préproduction, SQL Editor navigateur)
-- SECTION A : à exécuter AVANT la migration (copier le résultat).
-- SECTION B : à exécuter APRÈS la migration (comparer avec A).
-- 100 % lecture seule : uniquement des SELECT.

-- ════════════════ SECTION A — ÉTAT AVANT MIGRATION ════════════════
-- A1) Nombre d'enregistrements par table (à comparer à B1 : IDENTIQUE)
SELECT 'transactions' AS t, count(*) FROM public.transactions
UNION ALL SELECT 'invoices', count(*) FROM public.invoices
UNION ALL SELECT 'documents', count(*) FROM public.documents
UNION ALL SELECT 'contracts', count(*) FROM public.contracts
UNION ALL SELECT 'receipts', count(*) FROM public.receipts;

-- A2) Empreinte des IDENTIFIANTS (à comparer à B2 : IDENTIQUE —
--     aucun id ajouté/supprimé/modifié par la migration)
SELECT 'transactions' AS t, md5(string_agg(id, ',' ORDER BY id)) AS ids_hash FROM public.transactions
UNION ALL SELECT 'invoices', md5(string_agg(id, ',' ORDER BY id)) FROM public.invoices
UNION ALL SELECT 'documents', md5(string_agg(id, ',' ORDER BY id)) FROM public.documents
UNION ALL SELECT 'contracts', md5(string_agg(id, ',' ORDER BY id)) FROM public.contracts
UNION ALL SELECT 'receipts', md5(string_agg(id, ',' ORDER BY id)) FROM public.receipts;

-- A3) Empreinte des VALEURS des colonnes PRÉEXISTANTES (à comparer à B3 :
--     IDENTIQUE — la migration ne doit altérer aucune valeur métier)
SELECT 'transactions' AS t, md5(string_agg(concat_ws('|', id, user_id, title, amount::text, category, date), ',' ORDER BY id)) AS data_hash FROM public.transactions
UNION ALL SELECT 'invoices', md5(string_agg(concat_ws('|', id, user_id, title, amount::text, currency, status, due_date), ',' ORDER BY id)) FROM public.invoices
UNION ALL SELECT 'documents', md5(string_agg(concat_ws('|', id, user_id, title, category), ',' ORDER BY id)) FROM public.documents;

-- A4) Relations et spécificités du SCHÉMA INITIAL uniquement.
--     ⚠️ Compatible base NON migrée : transactions.invoice_id et
--     documents.document_type N'EXISTENT PAS encore ici — ils ne sont
--     vérifiés qu'en SECTION B (après migration).
SELECT
  (SELECT count(*) FROM public.documents) AS documents_total_avant,
  (SELECT count(*) FROM public.invoices WHERE currency IS NOT NULL AND upper(currency) <> 'CHF') AS factures_devise_etrangere,
  (SELECT count(DISTINCT user_id) FROM public.transactions) AS proprietaires_transactions;
-- NOTE : après migration, TOUTES les lignes de documents auront
-- document_type = 'unclassified' (backfill documenté) puisque la colonne
-- n'existe pas encore : noter ici documents_total_avant pour le contrôle B5.

-- ════════════════ SECTION B — ÉTAT APRÈS MIGRATION ════════════════
-- B1) = A1 (mêmes requêtes de comptage) → résultats IDENTIQUES attendus
SELECT 'transactions' AS t, count(*) FROM public.transactions
UNION ALL SELECT 'invoices', count(*) FROM public.invoices
UNION ALL SELECT 'documents', count(*) FROM public.documents
UNION ALL SELECT 'contracts', count(*) FROM public.contracts
UNION ALL SELECT 'receipts', count(*) FROM public.receipts;

-- B2) = A2 (mêmes empreintes d'identifiants) → IDENTIQUES attendues
SELECT 'transactions' AS t, md5(string_agg(id, ',' ORDER BY id)) AS ids_hash FROM public.transactions
UNION ALL SELECT 'invoices', md5(string_agg(id, ',' ORDER BY id)) FROM public.invoices
UNION ALL SELECT 'documents', md5(string_agg(id, ',' ORDER BY id)) FROM public.documents
UNION ALL SELECT 'contracts', md5(string_agg(id, ',' ORDER BY id)) FROM public.contracts
UNION ALL SELECT 'receipts', md5(string_agg(id, ',' ORDER BY id)) FROM public.receipts;

-- B3) = A3 (mêmes empreintes de valeurs) → IDENTIQUES attendues
SELECT 'transactions' AS t, md5(string_agg(concat_ws('|', id, user_id, title, amount::text, category, date), ',' ORDER BY id)) AS data_hash FROM public.transactions
UNION ALL SELECT 'invoices', md5(string_agg(concat_ws('|', id, user_id, title, amount::text, currency, status, due_date), ',' ORDER BY id)) FROM public.invoices
UNION ALL SELECT 'documents', md5(string_agg(concat_ws('|', id, user_id, title, category), ',' ORDER BY id)) FROM public.documents;

-- B4) Relations APRÈS migration (colonnes désormais présentes) : aucune
--     relation orpheline créée, backfill contrôlé
SELECT
  (SELECT count(*) FROM public.transactions WHERE invoice_id IS NOT NULL) AS tx_liees_factures,
  (SELECT count(*) FROM public.transactions tx WHERE invoice_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = tx.invoice_id)) AS tx_orphelines,     -- attendu : 0
  (SELECT count(*) FROM public.invoices inv WHERE document_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.id = inv.document_id)) AS factures_sans_document, -- attendu : 0
  (SELECT count(*) FROM public.documents WHERE document_type IS NULL) AS documents_type_null;            -- attendu : 0
-- documents_type_null = 0 : le backfill (NULL → 'unclassified') est la SEULE
-- modification de lignes de la migration ; le total de documents doit rester
-- égal à documents_total_avant (A4).

-- B5) La SEULE modification de lignes autorisée : backfill document_type
SELECT count(*) AS doc_type_invalide
FROM public.documents
WHERE document_type IS NULL OR document_type NOT IN ('invoice', 'contract', 'expense_receipt', 'unclassified');
-- attendu : 0 (anciens NULL → 'unclassified' ; valeurs existantes intactes via A3=B3)

-- B6) Nouvelles colonnes : présentes, bons types, NULLables, et NULL sur les
--     lignes anciennes (aucune valeur inventée)
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'transactions' AND column_name IN ('currency', 'invoice_id', 'debt_id', 'recurring_id'))
    OR (table_name = 'invoices'  AND column_name IN ('paid_at', 'recurring_id', 'document_id', 'qr_payload', 'chf_amount', 'fx_rate', 'fx_date', 'fx_source'))
    OR (table_name = 'documents' AND column_name IN ('document_type', 'mime_type', 'remote_path', 'file_size', 'imported_at', 'expires_at', 'spc_payload', 'updated_at')))
ORDER BY table_name, column_name;
SELECT count(*) AS invoices_fx_renseignes_avant_sync
FROM public.invoices WHERE chf_amount IS NOT NULL OR fx_rate IS NOT NULL; -- attendu : 0 avant toute synchro

-- B7) RLS activée + politiques owner-only (filtre auth.uid() = user_id)
SELECT c.relname, c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('transactions', 'invoices', 'documents', 'contracts', 'receipts', 'sync_tombstones');
SELECT tablename, policyname, cmd, qual FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;

-- B8) Bucket privé + politiques Storage (préfixe users/{uid}/)
SELECT id, name, public FROM storage.buckets WHERE name = 'user-documents'; -- public attendu : false
SELECT policyname, cmd, qual FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' ORDER BY policyname;

-- B9) ISOLATION RÉELLE : à faire via l'API REST avec les JETONS des comptes
--     de test A et B (JAMAIS service_role, qui contourne la RLS) — procédure
--     navigateur détaillée dans PREPROD_VALIDATION.md §4.
