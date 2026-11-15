# BUDGY 4.0 — VALIDATION PRÉPRODUCTION SÉCURISÉE
Commit de référence : 1244678ddce9b93d241c06362a7303294f63791f

## ⚠️ CONSTAT D'AUDIT (environnements)
- `eas.json` : les profils **development, preview, production et testflight
  pointent TOUS sur `https://api.budgy.ch` et `https://supabase.budgy.ch`**.
- L'environnement de développement (préview Emergent) utilise LUI AUSSI
  `supabase.budgy.ch` (même projet que la production).
- CONSÉQUENCE : il n'existe AUCUNE base isolée. **Aucun essai destructif ni
  migration ne doit être exécuté tant qu'un projet Supabase de préproduction
  séparé n'existe pas.** Rien n'a été exécuté sur la base actuelle.

## 1. Créer la préproduction isolée (ACTION PROPRIÉTAIRE)
1. Créer un NOUVEAU projet Supabase (ex. `budgy-preprod`) — jamais le projet
   existant.
2. Y créer le schéma de base actuel (mêmes tables qu'en production AVANT
   migration : export du schéma via Supabase Studio → SQL → `pg_dump --schema-only`).
3. Y insérer des données de test UNIQUEMENT (2 comptes de test, quelques
   transactions/factures/documents — jamais de données réelles d'utilisateurs).
4. Profil EAS de préproduction (À AJOUTER UNIQUEMENT SUR VOTRE ACCORD —
   aucun profil déployé n'a été modifié) :
```json
"preprod": {
  "extends": "preview",
  "channel": "preprod",
  "env": {
    "EXPO_PUBLIC_BACKEND_URL": "https://api-preprod.budgy.ch",
    "EXPO_PUBLIC_SUPABASE_URL": "https://<ref-preprod>.supabase.co"
  }
}
```
   (+ `EXPO_PUBLIC_SUPABASE_ANON_KEY` de préprod via secret EAS, jamais en clair.)

## 2. Sauvegarde et retour arrière (AVANT toute migration)
- Sauvegarde : Supabase Studio → Database → Backups (ou
  `pg_dump "$PREPROD_DB_URL" > backup_preprod_$(date +%F).sql`).
- La migration `docs/MIGRATION_TASK3_storage_prive.sql` est **purement
  additive** (CREATE/ADD COLUMN IF NOT EXISTS, politiques recréées
  idempotentes) : AUCUNE ligne existante n'est modifiée ni supprimée,
  les nouvelles colonnes sont NULLables (les anciens enregistrements restent
  valides, NULL = « champ non renseigné », jamais 0).
- Retour arrière (si nécessaire, préprod uniquement) :
```sql
ALTER TABLE public.transactions DROP COLUMN IF EXISTS currency;
ALTER TABLE public.invoices  DROP COLUMN IF EXISTS chf_amount, DROP COLUMN IF EXISTS fx_rate,
  DROP COLUMN IF EXISTS fx_date, DROP COLUMN IF EXISTS fx_source,
  DROP COLUMN IF EXISTS document_id, DROP COLUMN IF EXISTS qr_payload,
  DROP COLUMN IF EXISTS paid_at, DROP COLUMN IF EXISTS recurring_id;
ALTER TABLE public.documents DROP COLUMN IF EXISTS spc_payload; -- etc. (colonnes T3)
DROP TABLE IF EXISTS public.sync_tombstones;
-- Storage : supprimer le bucket 'user-documents' via Studio.
```
  En production réelle, préférer TOUJOURS la restauration du backup.
- L'app reste 100 % fonctionnelle sur l'ANCIEN schéma (repli `L:` testé) :
  le retour arrière SQL ne casse pas les clients.

## 3. Procédure de vérification préprod (étape par étape)
1. Exécuter `docs/MIGRATION_TASK3_storage_prive.sql` dans SQL Editor.
2. Exécuter `docs/VERIFY_MIGRATION.sql` (lecture seule) : colonnes, types,
   NULLs, politiques RLS, bucket.
3. Créer le bucket privé **`user-documents`** (public = OFF) si la migration
   ne l'a pas créé (section storage) — vérifier `public = false`.
4. Isolation 2 comptes : connecter compte A, créer facture + document + PDF ;
   connecter compte B → B ne doit RIEN voir (SQL et Storage) ; tenter une
   lecture croisée via l'API REST avec le token de B → 0 ligne / 403.
5. PDF : upload (file d'envoi de l'app), lecture (URL signée), suppression,
   récupération sur un 2e appareil (cache vérifié).
6. Ancien → nouveau schéma : partir d'une base SANS les colonnes T4/T5,
   synchroniser (confirmations `L:`), appliquer la migration, re-synchroniser
   (manuel ou reconnexion) → vérifier que currency / chf_amount / fx_* /
   qr_payload / spc_payload arrivent SANS perte ni doublon.
7. Devises : facture EUR vérifiée payée sur l'appareil 1 → pull appareil 2 →
   statut + conversion intacts, disponible identique.

## 4. Build iOS (quand vous l'autoriserez)
- buildNumber reste **91** tant que vous ne l'augmentez pas.
- Première compilation native = première preuve réelle des fichiers Swift
  (intents + widgets + xcstrings) — marquée NON TESTÉE jusque-là.
- Certificats/signature : gérés par EAS (`appleTeamId N69NHCB9S3`,
  `ascAppId 6767026949` déjà configurés) — inchangés.

## 5. Interdits respectés
Aucune migration exécutée, aucun bucket créé, aucun build/OTA/TestFlight,
aucune configuration déployée modifiée, aucune donnée touchée.
