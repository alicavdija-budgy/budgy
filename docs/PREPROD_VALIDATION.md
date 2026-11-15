# BUDGY 4.0 — VALIDATION PRÉPRODUCTION SÉCURISÉE (procédure corrigée)
Commit de référence : 4ef1433f1b5585f396542cb5de08a8518acad945
Toute la procédure est réalisable **depuis un navigateur (iPhone inclus)** :
Supabase Studio (SQL Editor, Table Editor, Storage, Backups) et l'app Budgy.
Aucun terminal requis.

## 0. ÉTAT ACTUEL (mis à jour — préprod créée par le propriétaire)
FAIT par vous, depuis l'iPhone :
- organisation Budgy + projet Supabase Cloud **`budgy-preprod`** (Healthy) ;
- vérification « No rows returned » (base vierge) ;
- exécution manuelle de `docs/SUPABASE_SCHEMA.sql` dans le SQL Editor.
À FAIRE MAINTENANT (résultat d'exécution non transmis → **non vérifié**) :
1. **Exécuter `docs/VERIFY_SCHEMA_INITIAL.sql`** (lecture seule) dans le SQL
   Editor de budgy-preprod : 14 tables, clés primaires, types, RLS, 56
   politiques, fonction + 14 déclencheurs, zéro donnée, zéro colonne T3/4/5.
2. Seulement si tout est conforme : Section A de `VERIFY_MIGRATION.sql`
   (copier les résultats), backup, puis — sur votre autorisation —
   `MIGRATION_TASK3_storage_prive.sql`, puis Section B.
⚠️ Audit de compatibilité effectué : la migration ne référence QUE des tables
du schéma initial (uniquement `ADD COLUMN IF NOT EXISTS`, l'UPDATE de
backfill, la table `sync_tombstones`, le bucket et les politiques) — aucune
suppression de colonne métier, identifiants et relations conservés, anciennes
valeurs NULL gérées (jamais interprétées comme 0), aucune conversion
monétaire implicite.

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

## 1. Préproduction isolée — reste à faire (navigateur)
Le projet `budgy-preprod` existe déjà (§0). Reste :
1. Créer 2 comptes de test (Authentication → Add user) :
   `test-a@budgy-preprod.ch` / `test-b@budgy-preprod.ch` (mots de passe de
   test, jamais réutilisés ailleurs, jamais collés dans un document).
2. Après validation du schéma (§0) et migration autorisée : quelques données
   de test pour A/B via l'app pointée préprod — jamais de données réelles.
3. **Backend : fonctions qui DÉPENDENT de `api.budgy.ch`** (audit du code) :
   scan OCR (`/api/scanner/ocr`), import e-mail (`/api/email/parse`),
   dictée serveur (`/api/voice/parse`), coach (`/api/coach/chat`),
   export PDF (`/api/export/pdf`), subsides LAMal (`/api/lamal/subsidy`),
   simulation impôts (`/api/tax/simulate`), optimiseur
   (`/api/optimizer/analyze`), abonnement IAP (`/api/iap/*`).
   → Tant qu'aucune instance backend de test n'existe RÉELLEMENT, deux
   choix : (a) déployer une seconde instance backend (votre action), ou
   (b) **limiter la campagne préprod au périmètre Supabase** (synchro,
   RLS, documents/Storage, devises, tombstones) — ces flux ne passent pas
   par le backend. NE PAS inventer d'URL backend.
4. Profil EAS `preprod` (MODÈLE — ne l'appliquer qu'après votre accord ;
   aucun profil actif n'a été modifié). L'URL Supabase est celle du NOUVEAU
   projet : Studio budgy-preprod → Settings → API → « Project URL » et
   « anon public key » :
```json
"preprod": {
  "extends": "preview",
  "channel": "preprod",
  "env": {
    "EXPO_PUBLIC_SUPABASE_URL": "https://<ref-budgy-preprod>.supabase.co",
    "EXPO_PUBLIC_BACKEND_URL": "<UNIQUEMENT si une instance backend de test existe — sinon ne pas définir et limiter les tests au périmètre Supabase>"
  }
}
```
   (+ `EXPO_PUBLIC_SUPABASE_ANON_KEY` préprod via secret EAS — la clé `anon`
   est publique par conception, mais ne JAMAIS mettre la `service_role`.)
   GARANTIE d'isolation : avec ce profil, l'app ne connaît QUE l'URL
   budgy-preprod — aucune écriture possible vers supabase.budgy.ch.

## 2. Sauvegarde VÉRIFIÉE et retour arrière SANS destruction
**Stratégie : on ne « dé-migre » JAMAIS en supprimant des colonnes, des
tables ou le bucket — on RESTAURE une sauvegarde vérifiée.**
Une sauvegarde COMPLÈTE couvre SIX périmètres distincts (un export CSV seul
n'en couvre qu'un et n'est PAS une sauvegarde complète) :
1. **Données PostgreSQL** : Studio → Database → Backups (backup géré) ;
2. **Schéma SQL** (tables/colonnes/index) : inclus dans le backup géré ;
3. **Politiques RLS** : vérifiées séparément (requêtes §B7 — les politiques
   sont dans le schéma, mais contrôler leur présence APRÈS restauration) ;
4. **Authentification** (utilisateurs auth.users) : incluse dans le backup
   géré Supabase ; noter à part la liste des comptes de test ;
5. **Métadonnées documentaires** (table documents) : incluses dans 1 ;
6. **Fichiers binaires Storage** (bucket user-documents) : NON couverts par
   le backup PostgreSQL — à sauvegarder séparément (téléchargement des
   objets via Studio → Storage, réaliste en préprod avec peu de fichiers).
Procédure :
1. AVANT migration : vérifier qu'un backup géré récent existe (sinon le
   déclencher) ET exécuter la Section A (empreintes) — le COUPLE
   backup + empreintes constitue la sauvegarde « vérifiée ».
2. **Vérifier la sauvegarde** : comparer les comptages du backup aux
   résultats de la Section A. Une sauvegarde non vérifiée n'en est pas une.
3. Retour arrière si problème : **restaurer le backup** (Studio → Backups →
   Restore) sur l'environnement ISOLÉ, puis re-vérifier RLS (§B7) et
   Storage. Jamais de DROP comme procédure standard ; jamais de
   restauration de production déclenchée automatiquement.
4. Filet supplémentaire : l'app fonctionne à 100 % sur l'ANCIEN schéma
   (repli `L:` testé) — on peut restaurer sans casser les clients, puis
   re-planifier la migration.

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
