# Budgy 4.0 — audit technique iOS, Android, API, finance et données
Date : 15 novembre 2026 — branche de travail `budgy-smart-4.0`

## Mise à jour 15 novembre 2026 — après redéploiement Coolify

L'utilisateur a redéployé `api.budgy.ch`. Une nouvelle vérification **après** ce redéploiement a réussi :
[GitHub Actions LIVE 43769061287](https://github.com/alicavdija-budgy/budgy/actions/runs/43769061287).

- `/api/health` : 200 OK ; `APP_VERSION=3.7.29` demeure, mais c'est une valeur d'environnement qui **ne permet pas d'identifier un commit**.
- `/api/config/status` : clé OpenAI déclarée configurée.
- `/openapi.json` : `document_type` et `needs_user_confirmation` existent ; `swiss_qr_content` est ABSENT. Le code de `backend/server.py` sur `main` n'a pas ce champ, celui de `budgy-smart-4.0` l'a. Vérifier dans Coolify la branche/le commit/le répertoire réellement déployés avant toute action.
- `supabase.budgy.ch/auth/v1/health` : HTTP 401 **sans clé**, service joignable mais aucune autorisation de lire les données ou le schéma. Aucun SQL exécuté sur le Supabase de production.

### Corrections complémentaires enregistrées sur `budgy-smart-4.0`

- `src/utils/localDate.ts` + dépenses manuelles/scannées : date locale en ISO `YYYY-MM-DD`, sans changement de jour par UTC ni format `MM/DD/YYYY` incompatible avec le moteur financier.
- `app/(tabs)/expenses.tsx` : normalisation CHF exacte à la création et la modification ; parser de dates de la liste aligné sur le moteur financier.
- `app/scanner-modal.tsx` : si le backend reconnait un `swiss_qr_content`, ouverture de la revue Swiss QR (pas du ticket vide). Capture et correction de la devise OCR dans les trois enregistrements : facture, transaction et reçu, sans considérer 100 EUR comme 100 CHF.
- Facture depuis appareil photo : détection des doublons avec confirmation, copie préalable dans le coffre durable, ajout d'un document lié et mise en file d'envoi privé ; pas de faux succès si la copie échoue.
- `scripts/test-local-dates.mjs` : tests exécutant la vraie normalisation du montant CHF et la vraie date locale, plus garde-fous des routes.

**Tous les tests du code ont finalement réussi** : [GitHub Actions audit iOS + Android 43769917571](https://github.com/alicavdija-budgy/budgy/actions/runs/43769917571), incluant TypeScript, i18n, régressions financières, OCR Python et exports Metro iOS/Android. Le code a été testé hors production ; pas de compilation native, d'essai réel sur mobile ni de migration de production.

### Intervention dépendant d'un accès d'opérateur privé

- [Prompt complet Claude pour Coolify et le vrai Supabase](./CLAUDE_MISSION_INFRA_BUDGY_EXISTANTE.md)
- [SQL de diagnostic uniquement en lecture sur supabase.budgy.ch](./PRODUCTION_SELFHOST_READONLY_AUDIT.sql)

**Ne jamais réutiliser la base Cloud séparée de préproduction.** Ne jamais forcer un push, basculer la production ou lancer un build EAS sans autorisation.

## Portée et principes de sûreté

Audit du code GitHub, exécution de tests GitHub Actions SANS compilation native, vérifications non destructives du projet Supabase Cloud `budgy-preprod`, et interrogation **lecture seule** de l'API publique `https://api.budgy.ch`.

Aucune suppression de compte ni de transaction ; aucune requête d'écriture sur la base de production, aucune migration de production, aucun déploiement backend, aucun build EAS ou envoi App Store/Google Play dans le cadre de cet audit.

Limites : base Supabase de production **auto-hébergée**, panneau Coolify, comptes Apple/Google Billing, clés du serveur et appareils réels NON vérifiés par cet audit. Les tests statiques et bundles JS ne prouvent pas le fonctionnement natif d'une caméra, de Siri, du Google Billing ni la synchronisation de données réelles.

## Verdict de la campagne d'audit automatique

**PASS — 15 novembre 2026, 22:08 UTC** : [GitHub Actions, audit iOS et Android (exécution 43767387936)](https://github.com/alicavdija-budgy/budgy/actions/runs/43767387936).

- TypeScript, parité et audit des traductions FR/EN/DE/IT : PASS.
- 22 suites de régression documentaires, finances, budget, cloud, IAP, Siri, alertes, LAMal, widgets : PASS (tests de code, pas de téléphone).
- Résolution native Expo (identifiants iOS/Android), contrôle du blocage des achats Android : PASS.
- **Export JavaScript iOS Hermes : PASS** (~9,66 MiB) ; **Android Hermes : PASS** (~9,64 MiB). Aucun build EAS exécuté.
- Python : compilation syntaxique et 6 tests unitaires offline sur les types d'images OCR : PASS.

Ce PASS n'efface pas les obstacles P0 du backend actuellement déployé ni l'absence de validation Google Play Billing.

## État vérifié

| Périmètre | Constat | Gravité |
|---|---|---|
| iOS | Build 91 (4.0.0) existant compilé séparément et envoyé à Expo précédemment ; les corrections de ce rapport sont POSTÉRIEURES au build 91 | Information |
| Android | `com.budgy.ch.budgy` / `versionCode: 82` ; profils APK interne et AAB Play configurés dans `eas.json`. Aucune compilation native ni Google Play release validée | P1 |
| Backend | `/api/health` répond **200, version déclarée 3.7.29**. `/api/config/status` déclare **OpenAI configuré** | P0 : version/API |
| Contrat d'API OCR déployé | La définition OpenAPI comporte `document_type` mais **pas `swiss_qr_content`**, alors que Budgy 4.0 attend ce champ. Le code effectivement déployé diverge sur ce contrat, indépendamment d'un numéro d'env `APP_VERSION` obsolète | P0 |
| OCR images/PDF | Le code de développement transmettait des pages PDF converties en PNG en les étiquetant JPEG pour l'IA. Correctif : fonction testable `detect_image_mime` (PNG/JPEG/WebP). Pas encore déployé | P0 |
| Importation | Après échec OCR, le formulaire manuel de contrat apparaissait même en mode facture ; type OCR parfois prioritaire sans confirmation. Correctifs ciblés de séparation et confirmation explicite | P0 |
| Abonnements Android | Client `react-native-iap` supportait un chemin Google, mais `/api/iap/validate` reste **Apple-only**. Achats Google bloqués côté application jusqu'à validation serveur effective pour ne pas facturer sans droit Pro | P0 Android |
| Supabase préproduction | 15 tables en `public`, 4 politiques et RLS actif par table, droits CRUD `authenticated`, 0 lignes métier ; bucket `user-documents` PRIVÉ, limite 8 MiB. Advisors sécurité : **0 alerte**. 13 index de FK manquants et 60 avertissements de performance RLS | P2 |
| Supabase production | Instance `supabase.budgy.ch` auto-hébergée NON accessible avec la connexion Supabase Cloud actuelle ; migrations, sauvegardes et RLS non vérifiées | P0 avant déploiement |
| Branches/CI | `main` contient encore `app.json 3.9.0 / iOS 82`, `budgy-smart-4.0` contient 4.0.0/91. Workflow EAS générique ancien : Node 20/npm/package-lock, inadapté au Yarn du code 4.0 | P1 |

Preuves des contrôles API publics, sans envoi de document privé :
- [État du serveur, fournisseurs d'IA et contrat OpenAPI](https://github.com/alicavdija-budgy/budgy/actions/runs/43767131929).
- [Première vérification du service](https://github.com/alicavdija-budgy/budgy/actions/runs/43766951830).

## Modifications effectivement enregistrées

1. `frontend/app/more/email-import.tsx` : fallback facture spécifique, conservation du document original, refus d'une obligation à CHF 0 quand le montant manque, confirmation des désaccords de classement, transfert du type vers le scanner.
2. `frontend/app/scanner-modal.tsx` : type détecté par `document_type` plutôt que `receipt_type='ticket'`, sélection explicite **facture / contrat / ticket / remboursement**, confirmation des divergences.
3. `frontend/app/more/add-contract.tsx` : montant facultatif lorsqu'absent du document, renouvellement non inventé, rattachement du fichier classé comme contrat.
4. `backend/qr_decode.py` et `backend/server.py` : cohérence MIME effective pour l'OCR des PDF rendus en PNG, JPEG et WebP.
5. `backend/tests/test_ocr_media.py` : tests Python sans fournisseur externe ni données personnelles.
6. `frontend/src/services/iap.ts` : protection contre l'achat Android tant que la vérification Google Play côté backend n'existe pas. Apple iOS inchangé.
7. `frontend/scripts/test-iap-v15.mjs`, `test-notifications.mjs` : suppression d'attentes d'anciennes versions (3.9.1/85) et d'un découpage de fonction incomplet.
8. `.github/workflows/budgy-audit-ios-android.yml` : batterie de tests TypeScript, traductions, finance, cloud, factures, Siri, achats, backend + exports JavaScript iOS et Android, sans build EAS.

Aucun changement de ce rapport n'a été inclus rétroactivement dans l'IPA iOS 91 précédemment construite.

## Risques à résoudre AVANT de lancer Android ou de promouvoir une mise à jour iOS

### P0 — backend OCR
- Examiner la configuration/déploiement Coolify actuel, prendre une sauvegarde et conserver un chemin de retour arrière.
- Déployer *après validation* le backend correspondant au code mobile, sur l'infrastructure actuelle (ne pas créer un second produit Supabase).
- Confirmer `GET /api/health` et la présence de `swiss_qr_content` dans le contrat OpenAPI.
- Tester avec des documents **fictifs** : ticket, facture PDF ordinaire, QR-facture SPC avec et sans montant, contrat. Tester les erreurs d'authentification et la dégradation sans IA. Ne jamais journaliser l'image complète, les IBAN ou les secrets.

### P0 — données / cloud
- Vérifier et sauvegarder la base **de production** avant une migration ; confirmer schéma réel, privilèges, RLS, stockage privé et droits par utilisateur sur deux comptes isolés.
- Vérifier les imports sur iPhone et Android, redémarrage hors ligne, connexion/déconnexion, fusion de données entre appareils, absence de transactions et factures en doublon.
- N'effectuer aucune migration SQL sur la base actuelle sans comparaison précise du schéma et sauvegarde exploitable.

### P0 — abonnement Google Play
- Implémenter et tester les *purchase tokens* Google Play / Google Play Developer API côté serveur, entitlement lié à l'utilisateur et au produit, renouvellement, remboursement, annulation, restauration et notifications Google.
- Ne réactiver l'achat Android qu'après tests sandbox et double validation serveur. La version actuelle protège l'utilisateur en bloquant ces achats.

### P1 — livraison iOS + Android
- Valider que l'export JavaScript réussit sur les deux OS, puis n'engager un build natif qu'une fois le backend synchronisé.
- iOS : nouvelle incrémentation **après 91** (ex. 92 lors de la prochaine compilation), TestFlight existant, tests Siri/widgets/Apple IAP réels.
- Android : construire d'abord un **APK interne** pour essais réels, puis l'AAB Google Play avec signature et service account du compte Play ; tests caméra, PDF, notifications et permissions Android.
- Corriger ou remplacer le vieux workflow EAS générique Node 20/npm, en évitant un build sur `main` encore à 3.9.0.

### P2 — qualité et performances
- Sur préprod : 13 index de clés étrangères et 60 avertissements `auth_rls_initplan` à optimiser ; confirmer aucun écart de stratégie RLS et refaire le conseiller après optimisation.
- Remplacer progressivement les tests de présence de chaîne par des tests métier exécutant les vraies fonctions : classifier et conserver, rapprochements, suppression cloud, restore IAP.
- Vérifier les demandes de permissions Android (`READ_MEDIA_IMAGES`, anciens `READ/WRITE_EXTERNAL_STORAGE`) avant dépôt Play.
- Améliorer la lisibilité des erreurs OCR par un code stable traduit (auth manquante, timeout, LLM absent, PDF invalide) plutôt qu'un message générique.
- Mettre à jour les documents d'installation/CI qui citent encore d'anciennes versions.

## Décision de déploiement

**Pas encore « prêt pour publication générale ».** Les contrôles de code peuvent être verts sans garantir le serveur de production ni les fonctionnalités natives. L'ordre proposé est : audit final des tests, sauvegarde et validation du backend, vérification réelle de la sync, tests iOS+Android sur appareils, puis UNE compilation par plateforme après incrémentation et validation de l'utilisateur.

Pas besoin de créer un nouveau Budgy iOS, de recréer Supabase, ni d'acheter des crédits Emergent pour ces étapes. L'IA peut être appelée via la clé OpenAI **déjà déclarée comme configurée** sur le backend, sous réserve de vérifier qu'elle fonctionne réellement.
