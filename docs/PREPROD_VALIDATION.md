# BUDGY 4.0 — VALIDATION PRÉPRODUCTION SÉCURISÉE (procédure corrigée)
Commit de référence : 4ef1433f1b5585f396542cb5de08a8518acad945
Toute la procédure est réalisable **depuis un navigateur (iPhone inclus)** :
Supabase Studio (SQL Editor, Table Editor, Storage, Backups) et l'app Budgy.
Aucun terminal requis.

## ⚠️ CONSTAT D'AUDIT (environnements)
- `eas.json` : les profils **development, preview, production et testflight
  pointent TOUS sur `https://api.budgy.ch` et `https://supabase.budgy.ch`**.
- L'environnement de développement (préview Emergent) utilise LUI AUSSI
  `supabase.budgy.ch` (même projet que la production).
- **Il n'existe AUCUNE base isolée.** Aucun essai destructif ni migration ne
  doit être exécuté tant qu'un projet Supabase de préproduction séparé
  n'existe pas. Rien n'a été exécuté sur la base actuelle.
- **`api-preprod.budgy.ch` N'EXISTE PAS à ce jour** : c'est un nom proposé.
  La séparation réelle exige DEUX services distincts : un projet Supabase de
  test **et** une instance backend de test (ou, à défaut, des essais limités
  au périmètre Supabase uniquement, sans toucher au backend partagé).

## CE QUE FAIT RÉELLEMENT LA MIGRATION (honnêteté)
`docs/MIGRATION_TASK3_storage_prive.sql` est principalement additive, MAIS :
1. **Elle modifie des lignes existantes** : un `UPDATE public.documents SET
   document_type = 'unclassified' WHERE document_type IS NULL` (remplissage
   du nouveau champ ; aucune valeur existante non NULL n'est écrasée).
2. **Elle modifie des politiques RLS** : `DROP POLICY IF EXISTS` suivi de
   `CREATE POLICY` (tombstones + storage.objects). Entre le DROP et le
   CREATE d'une même transaction, c'est sûr ; mais toute politique
   PRÉEXISTANTE portant le même nom est remplacée par la version du script.
3. Le reste : `CREATE TABLE/ADD COLUMN IF NOT EXISTS` (colonnes NULLables),
   création du bucket privé `user-documents`.
→ Il est donc FAUX de dire « aucune ligne n'est modifiée ». C'est pour cela
que la comparaison avant/après (ci-dessous) et la sauvegarde VÉRIFIÉE sont
obligatoires, même en préproduction.

## 1. Créer la préproduction isolée (ACTION PROPRIÉTAIRE — navigateur)
1. supabase.com → New project → ex. `budgy-preprod` (région CH/UE).
2. Recréer le schéma de base ACTUEL (avant migration) : Studio du projet de
   production → SQL Editor → `select ... from information_schema` ou copie du
   script de schéma existant → l'exécuter dans le SQL Editor de la préprod.
   (Ne copier AUCUNE donnée réelle d'utilisateur.)
3. Créer 2 comptes de test (Authentication → Add user) :
   `test-a@budgy-preprod.ch` / `test-b@budgy-preprod.ch`.
4. Insérer quelques données de test pour A (Table Editor ou SQL) :
   transactions, 1 facture, 1 document.
5. Backend : ne PAS supposer `api-preprod.budgy.ch`. Options :
   a. déployer une seconde instance backend pointant sur la préprod (idéal) ;
   b. ou limiter la campagne aux vérifications Supabase (SQL + Storage + RLS),
      qui ne passent pas par le backend.
6. Profil EAS `preprod` (MODÈLE — ne l'appliquer qu'après création réelle
   des services, et sur votre accord ; aucun profil actif n'a été modifié) :
```json
"preprod": {
  "extends": "preview",
  "channel": "preprod",
  "env": {
    "EXPO_PUBLIC_BACKEND_URL": "<URL backend de test RÉELLEMENT créée>",
    "EXPO_PUBLIC_SUPABASE_URL": "https://<ref-preprod>.supabase.co"
  }
}
```
   (+ `EXPO_PUBLIC_SUPABASE_ANON_KEY` préprod via secret EAS, jamais en clair.)

## 2. Sauvegarde VÉRIFIÉE et retour arrière SANS destruction
**Stratégie : on ne « dé-migre » JAMAIS en supprimant des colonnes, des
tables ou le bucket — on RESTAURE une sauvegarde vérifiée.** Les anciennes
instructions destructives (DROP COLUMN / DROP TABLE / suppression du bucket)
sont retirées de la procédure : elles détruiraient les données écrites après
migration.
1. AVANT migration : Studio → Database → **Backups** → vérifier qu'un backup
   récent existe ; sinon en déclencher un (plan payant) OU exporter les
   tables en CSV depuis Table Editor (navigateur, adapté à une base de test).
2. **Vérifier la sauvegarde** : ouvrir le backup/CSV et contrôler le nombre
   de lignes de chaque table par rapport à l'étape « AVANT » du script de
   comparaison (§3). Une sauvegarde non vérifiée n'est pas une sauvegarde.
3. Retour arrière si problème : **restaurer le backup** (Studio → Backups →
   Restore) — les données sont conservées à l'état antérieur. En production
   réelle : uniquement cette voie, jamais de DROP.
4. Filet supplémentaire : l'app fonctionne à 100 % sur l'ANCIEN schéma
   (repli `L:` testé). En cas de doute, on peut donc restaurer sans casser
   les clients, puis re-planifier la migration.

## 3. Comparaison AVANT/APRÈS (obligatoire)
Dans `docs/VERIFY_MIGRATION.sql` :
- exécuter la **SECTION A (AVANT)** dans le SQL Editor juste avant la
  migration et **copier le résultat** (nombres de lignes, empreintes des
  identifiants et des valeurs des colonnes existantes, relations) ;
- exécuter la migration ;
- exécuter la **SECTION B (APRÈS)** : les mêmes empreintes doivent être
  IDENTIQUES (sauf `documents.document_type` : les NULL deviennent
  'unclassified' — contrôle dédié B5), plus les contrôles de structure.

## 4. Tests RLS avec deux comptes AUTHENTIFIÉS (jamais service_role)
La clé `service_role` contourne la RLS : elle ne prouve rien. Utiliser les
jetons des comptes de test, depuis le navigateur :
1. Se connecter dans l'app Budgy (build préprod ou préview pointée préprod)
   avec le compte A → créer facture + document + PDF.
2. Récupérer un jeton utilisateur SANS terminal : dans Budgy, le jeton de
   session est celui de Supabase Auth ; à défaut, utiliser l'onglet
   Authentication → l'API `POST /auth/v1/token?grant_type=password` peut être
   appelée depuis un client REST web (ex. hoppscotch.io sur iPhone) avec la
   clé `anon` + email/mot de passe du compte B.
3. Avec le jeton de B (en-têtes `apikey: <anon>`, `Authorization: Bearer
   <jeton B>`), appeler :
   - `GET https://<ref-preprod>.supabase.co/rest/v1/invoices?select=*`
     → attendu : UNIQUEMENT les factures de B (aucune de A) ;
   - idem `documents`, `transactions`, `sync_tombstones` ;
   - Storage : `GET /storage/v1/object/user-documents/users/<uid-A>/...`
     → attendu : **403/400**, jamais le fichier de A ;
   - `POST /storage/v1/object/user-documents/users/<uid-A>/x.pdf` avec le
     jeton de B → attendu : **refusé**.
4. Répéter en sens inverse (jeton A sur les données de B).
5. PDF complet avec le compte A : upload depuis l'app, lecture via URL
   signée, suppression, récupération sur un 2e appareil/session.

## 5. Ancien → nouveau schéma, devises, QR
1. Partir de la préprod SANS les colonnes T4/T5 → synchroniser (l'app marque
   des confirmations partielles `L:`).
2. Appliquer la migration, puis synchro manuelle (ou reconnexion) → vérifier
   dans Table Editor que `currency`, `chf_amount/fx_rate/fx_date/fx_source`,
   `qr_payload`, `spc_payload` arrivent SANS perte ni doublon.
3. Facture EUR vérifiée payée sur la session 1 → pull session 2 → statut et
   conversion intacts, disponible identique.

## 6. Build iOS (quand vous l'autoriserez)
- `buildNumber` reste **91** tant que vous ne l'augmentez pas.
- Première compilation native = première preuve réelle des fichiers Swift
  (intents, widgets, xcstrings) — **NON TESTÉE jusque-là**.
- Certificats/signature Apple : `eas.json` contient les identifiants
  (`appleTeamId`, `ascAppId`), mais **cela ne prouve PAS que les certificats
  et profils de provisionnement sont valides ou non expirés** — la validité
  ne sera établie qu'au prochain build/submit EAS. Statut : NON VÉRIFIÉ.

## 7. Interdits respectés
Aucun projet créé, aucune configuration active modifiée, aucune migration,
publication, OTA ou build. Documentation uniquement.
