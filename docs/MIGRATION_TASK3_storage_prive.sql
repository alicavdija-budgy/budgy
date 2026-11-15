-- ═══════════════════════════════════════════════════════════════
-- BUDGY 4.0 — TÂCHE 3 : MIGRATION ADDITIVE (NE PAS APPLIQUER EN
-- PRODUCTION SANS VALIDATION EXPLICITE DE L'UTILISATEUR)
-- ═══════════════════════════════════════════════════════════════
-- Principes :
--  • 100 % ADDITIF : aucun DROP, aucun RENAME, aucune réécriture.
--  • Les anciennes colonnes (documents.data_uri, documents.notes,
--    receipts.image_uri, …) sont CONSERVÉES telles quelles tant que la
--    nouvelle copie n'a pas été vérifiée (reprise/retour arrière § C).
--  • Le client gère l'absence de ces colonnes (repli « legacy » dans
--    cloudSync.ts) : l'app fonctionne AVANT et APRÈS migration.

-- ─── A. Colonnes additives ───────────────────────────────────────
-- documents : type documentaire + métadonnées fichier + référence Storage.
-- (les binaires base64 ne vont PAS en colonnes : ils vont dans Storage)
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS document_type text
  CHECK (document_type IN ('invoice','contract','expense_receipt','unclassified'));
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS file_uri text;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS pdf_uri text;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS mime_type text;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS pages jsonb;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS tags jsonb;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS remote_path text;   -- chemin Storage (PAS une URL signée)
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS file_size bigint;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS imported_at bigint;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS expires_at text;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS updated_at bigint;

-- Anciennes données au type incertain → « À classer » (JAMAIS converties
-- automatiquement en facture/ticket ; classification manuelle dans l'app).
UPDATE public.documents SET document_type = 'unclassified' WHERE document_type IS NULL;

-- contracts : lien vers le document d'origine (relation additive Tâche 2/3).
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS document_id text;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS photo_uri text;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS notice_period text;

-- invoices : champs jusqu'ici perdus à la synchro.
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS paid_at bigint;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS recurring_id text;

-- receipts (tickets) : type, devise, note, liens transaction/document.
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS transaction_id text;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS document_id text;

-- transactions : liens anti-double-comptage (critiques pour le moteur
-- financier : attribution par ID, jamais par montant).
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS invoice_id text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS debt_id text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS recurring_id text;

-- ─── B. Bucket Storage PRIVÉ + policies propriétaire ─────────────
-- Arborescence : users/{uid}/invoices|contracts|expense-receipts/{documentId}/…
-- L'identité vient de auth.uid() (session vérifiée côté serveur), jamais du client.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-documents', 'user-documents', false,           -- PRIVÉ, aucun accès public
  8388608,                                             -- 8 Mo (cohérent client/backend)
  ARRAY['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif']
)
ON CONFLICT (id) DO NOTHING;

-- Lecture/écriture/suppression limitées AU PROPRIÉTAIRE du dossier users/{uid}/…
CREATE POLICY "docs_owner_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'user-documents' AND (storage.foldername(name))[1] = 'users'
         AND (storage.foldername(name))[2] = auth.uid()::text);
CREATE POLICY "docs_owner_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'user-documents' AND (storage.foldername(name))[1] = 'users'
         AND (storage.foldername(name))[2] = auth.uid()::text);
CREATE POLICY "docs_owner_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'user-documents' AND (storage.foldername(name))[1] = 'users'
         AND (storage.foldername(name))[2] = auth.uid()::text);
CREATE POLICY "docs_owner_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'user-documents' AND (storage.foldername(name))[1] = 'users'
         AND (storage.foldername(name))[2] = auth.uid()::text);
-- Aucune policy `anon`, aucune policy publique : accès uniquement via
-- URLs signées TEMPORAIRES générées par le propriétaire authentifié.

-- RLS des tables : inchangée (policies owner-only déjà en place sur
-- user_id = auth.uid() d'après docs/SUPABASE_SCHEMA.sql). Les nouvelles
-- colonnes héritent de ces policies — aucune action supplémentaire.

-- ─── C. Reprise et retour arrière ────────────────────────────────
-- Reprise : la file d'envoi côté client est durable et idempotente
--   (chemin fixe + upsert) ; relancer l'app suffit après interruption.
-- Retour arrière (si nécessaire, SANS perte) :
--   • les colonnes additives peuvent être ignorées par l'app (repli
--     legacy automatique) — il n'est PAS nécessaire de les supprimer ;
--   • ne JAMAIS supprimer data_uri/notes/image_uri ni un fichier du
--     bucket tant que remote_path n'a pas été vérifié par relecture ;
--   • suppression éventuelle du bucket uniquement après export complet.
-- ═══════════════════════════════════════════════════════════════
-- STATUT : PRÉPARÉE, NON EXÉCUTÉE (aucune migration en production).
-- ═══════════════════════════════════════════════════════════════
