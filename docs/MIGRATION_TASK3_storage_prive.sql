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
-- (audit §4) file_uri / pdf_uri / pages NE SONT PAS migrés : chemins locaux
-- propres à un appareil et pages base64 restent locaux ; seuls remote_path
-- (référence Storage) et les métadonnées portables sont synchronisés.
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS mime_type text;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS tags jsonb;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS remote_path text;   -- chemin Storage (PAS une URL signée)
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS file_size bigint;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS imported_at bigint;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS expires_at text;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS updated_at bigint;
-- TÂCHE 5 — payload SPC BRUT de la QR-facture (texte ≤ ~1000 car., norme SIX).
-- JAMAIS de PDF/image/base64 en colonne : les binaires vont dans Storage.
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS spc_payload text;

-- Anciennes données au type incertain → « À classer » (JAMAIS converties
-- automatiquement en facture/ticket ; classification manuelle dans l'app).
UPDATE public.documents SET document_type = 'unclassified' WHERE document_type IS NULL;

-- contracts : lien vers le document d'origine (relation additive Tâche 2/3).
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS document_id text;
-- (audit §4) photo_uri non migré : chemin local propre à un appareil.
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS notice_period text;

-- invoices : champs jusqu'ici perdus à la synchro.
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS paid_at bigint;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS recurring_id text;
-- TÂCHE 5 — lien facture ↔ document conservé + payload SPC brut (texte).
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS document_id text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS qr_payload text;
-- TÂCHE 4 — conversion VÉRIFIÉE uniquement : montant CHF calculé + taux +
-- date + source du taux (jamais de conversion implicite 1:1).
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS chf_amount double precision;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS fx_rate double precision;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS fx_date text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS fx_source text;

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
-- TÂCHE 4 — devise du paiement (absent = CHF) : un paiement EUR ne revient
-- JAMAIS du cloud comme un paiement CHF.
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS currency text;

-- ─── A bis. Tombstones de synchronisation (audit §1) ─────────────
-- Une suppression n'est JAMAIS déduite de l'absence d'un élément dans une
-- réponse : elle est propagée EXPLICITEMENT via cette table.
CREATE TABLE IF NOT EXISTS public.sync_tombstones (
  id text PRIMARY KEY,                   -- `${user_id}:${table}:${item_id}`
  user_id uuid NOT NULL,
  entity_key text NOT NULL,              -- `${table}:${item_id}`
  deleted_at bigint NOT NULL,            -- epoch ms (cohérent avec createdAt TS)
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.sync_tombstones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tombstones_owner_select" ON public.sync_tombstones;
CREATE POLICY "tombstones_owner_select" ON public.sync_tombstones FOR SELECT TO authenticated
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "tombstones_owner_insert" ON public.sync_tombstones;
CREATE POLICY "tombstones_owner_insert" ON public.sync_tombstones FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "tombstones_owner_update" ON public.sync_tombstones;
CREATE POLICY "tombstones_owner_update" ON public.sync_tombstones FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "tombstones_owner_delete" ON public.sync_tombstones;
CREATE POLICY "tombstones_owner_delete" ON public.sync_tombstones FOR DELETE TO authenticated
  USING (user_id = auth.uid());

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
-- Idempotent : DROP IF EXISTS avant chaque CREATE (ré-exécution sans erreur).
DROP POLICY IF EXISTS "docs_owner_read" ON storage.objects;
CREATE POLICY "docs_owner_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'user-documents' AND (storage.foldername(name))[1] = 'users'
         AND (storage.foldername(name))[2] = auth.uid()::text);
DROP POLICY IF EXISTS "docs_owner_insert" ON storage.objects;
CREATE POLICY "docs_owner_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'user-documents' AND (storage.foldername(name))[1] = 'users'
         AND (storage.foldername(name))[2] = auth.uid()::text);
-- UPDATE requis pour l'upsert (écrasement idempotent du même chemin) :
-- USING + WITH CHECK empêchent de « déplacer » un objet hors de son dossier.
DROP POLICY IF EXISTS "docs_owner_update" ON storage.objects;
CREATE POLICY "docs_owner_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'user-documents' AND (storage.foldername(name))[1] = 'users'
         AND (storage.foldername(name))[2] = auth.uid()::text)
  WITH CHECK (bucket_id = 'user-documents' AND (storage.foldername(name))[1] = 'users'
         AND (storage.foldername(name))[2] = auth.uid()::text);
DROP POLICY IF EXISTS "docs_owner_delete" ON storage.objects;
CREATE POLICY "docs_owner_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'user-documents' AND (storage.foldername(name))[1] = 'users'
         AND (storage.foldername(name))[2] = auth.uid()::text);
-- Aucune policy `anon`, aucune policy publique : accès uniquement via
-- URLs signées TEMPORAIRES générées par le propriétaire authentifié.
-- Aucune clé service_role n'est utilisée ni exposée côté application.

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
