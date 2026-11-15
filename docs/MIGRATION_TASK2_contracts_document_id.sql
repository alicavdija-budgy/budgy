-- TÂCHE 2 — MIGRATION ADDITIVE (NE PAS APPLIQUER SANS AUTORISATION)
-- Objectif : synchroniser le lien contrat → pièce jointe entre appareils.
-- Sans cette colonne, le lien documentId reste LOCAL (le contrat et ses
-- métadonnées se synchronisent déjà ; le fichier et son lien suivront en
-- TÂCHE 3 avec le stockage privé par utilisateur).
-- Additive uniquement : aucune suppression, aucun écrasement.

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS document_id text;

-- Après application de cette migration, ajouter 'document_id' à la liste
-- des colonnes contracts dans frontend/src/services/cloudSync.ts (TABLE_FIELDS).
