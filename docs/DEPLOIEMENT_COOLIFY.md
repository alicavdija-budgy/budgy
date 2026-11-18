# Budgy 4.0 — procédure Coolify sur l'infrastructure EXISTANTE (non exécutée)

**ATTENTION — PLAN, PAS DÉPLOIEMENT.** Ce document n'autorise aucune action sur
la production. Une validation explicite de l'exploitant est obligatoire avant
le changement de branche, la compilation Docker dans Coolify ou toute migration.

## 0. Point de départ attesté le 15–16 novembre 2026

- GitHub : `alicavdija-budgy/budgy`
- Branche de développement : `budgy-smart-4.0`
- Commit au début de la PR :
  `1bfa9703d945d76c907e078ac7a6567294ab1a32`
- Branche **de cette PR** : `fix/backend-coolify-traceability-20261116`;
  cible : `budgy-smart-4.0` (et **jamais** `main`).
- Coolify actuel **d'après le diagnostic confirmé par l'exploitant** :
  Branch=`main`, Commit SHA=`HEAD`, Build strategy=`Dockerfile`,
  Base directory=`/backend`, Dockerfile location=`/Dockerfile`
  (donc `backend/Dockerfile`), port 8000, sans commandes pre/post deploy.
- API : `https://api.budgy.ch` ; Supabase auto-hébergée **existante**
  `https://supabase.budgy.ch`. Aucune autre base n'entre dans le périmètre.
- L'OpenAPI public de l'API en ligne avait `document_type`, mais pas
  `swiss_qr_content`. Le `APP_VERSION=3.7.29` affiché venait d'une
  variable Coolify et **ne permettait pas d'identifier le commit réel**.
- Le nouveau backend indique `4.0.0` dans le **code**, indépendamment
  de la variable historique `APP_VERSION` ; celle-ci est volontairement
  ignorée pour les routes `/health` et `/api/health`.

## 1. Avant la moindre opération de production

1. Relire et faire approuver la PR et les tests automatisés.
2. **Désactiver l'auto-deploy dans Coolify** pour l'application
   `api.budgy.ch`. Le nom et la position du réglage dépendent de la version
   de Coolify : vérifier les paramètres Git/déploiement de la ressource.
3. Vérifier qu'un commit de `main` ou un webhook ne déclenchera pas
   de déploiement automatique pendant le changement de branche.
4. Enregistrer, sans les publier ni les coller dans une IA, la branche actuelle
   (`main`), le SHA complet du **dernier déploiement qui fonctionne**,
   la configuration Dockerfile/Base directory/port, les noms des variables
   d'environnement configurées, l'identifiant du déploiement/image et sa
   procédure de retour arrière.
5. Faire valider que l'image précédente est réutilisable et que l'API est
   stable. Préparer des factures/tickets/contrats **fictifs** pour les tests.
6. Si une migration de schéma Supabase est envisagée, **arrêter le processus**
   jusqu'à disposer d'une sauvegarde **vérifiée et restaurable** de
   `supabase.budgy.ch`, d'un inventaire du schéma existant et d'un diff SQL
   relu. Cette PR **ne contient aucune migration** et ne doit en déclencher
   aucune.

## 2. Préparer une révision reproductible

1. **Après validation de la PR uniquement**, intégrer la PR dans
   `budgy-smart-4.0`. L'opération de merge change le SHA : récupérer
   le **SHA de commit final** de `budgy-smart-4.0` *après* la fusion.
   Ne pas utiliser le SHA pré-merge `1bfa9703...` pour cette livraison.
2. Dans Coolify, sélectionner la ressource existante qui sert
   `api.budgy.ch` et vérifier qu'elle est liée au bon dépôt GitHub.
3. Changer **Branch `main` → `budgy-smart-4.0`**.
4. Remplacer **Commit SHA `HEAD`** par le **SHA complet épinglé** obtenu
   au point 1. (Si l'interface Coolify n'accepte pas une valeur fixe, ne pas
   déployer avant d'avoir sécurisé la révision de manière reproductible.)
5. Conserver exactement Build strategy=`Dockerfile`,
   Base directory=`/backend`, Dockerfile location=`/Dockerfile`,
   port `8000`, URL de production existante et toutes les variables privées.
6. Pour rendre le SHA visible dans `/health`, transmettre à la construction
   Docker l'ARG **`BUDGY_GIT_SHA`** égal au **même SHA épinglé**. Le
   `Dockerfile` embarque cette valeur dans l'environnement du conteneur.
   La méthode pour fournir un build-arg dépend de la version de Coolify ;
   vérifier dans sa configuration de build ou son mécanisme de variables
   de construction. **Ne pas supposer** que Coolify injecte automatiquement
   le SHA Git dans le build Docker.
   - Si l'ARG manque ou n'est pas 40 caractères hexadécimaux, l'API indique
     `"commit_sha": "unknown"`. C'est un état de provenance non vérifiée :
     ne pas le confondre avec un SHA réellement déployé.
   - La variable `APP_VERSION=3.7.29` peut rester dans l'interface
     pour compatibilité historique, mais la **version du code** renvoyée par
     la nouvelle API doit être `4.0.0`. Prévoir son nettoyage ultérieur
     sous contrôle opérateur.
7. **Ne pas déployer automatiquement** : la validation doit précéder toute
   compilation/recréation de conteneur dans Coolify.

## 3. Contrôles APRÈS déploiement AUTORISÉ (jamais effectués dans cette PR)

Les commandes ci-dessous sont exclusivement des **GET publics**, sans
identifiant ni donnée financière ; elles peuvent être réalisées depuis
l'iPhone avec Safari (visualisation JSON) ou un terminal autorisé :

```bash
curl -fsS https://api.budgy.ch/health
curl -fsS https://api.budgy.ch/api/health
curl -fsS https://api.budgy.ch/openapi.json
```

Vérifier exactement :
- `status=ok` dans `/health` et `/api/health`.
- `version=4.0.0` sur les deux routes.
- `commit_sha` identique au SHA complet **épinglé**.
- Dans `/openapi.json`, `components.schemas.OCRResponse.properties`
  contient `document_type`, `needs_user_confirmation` et
  **`swiss_qr_content`**.
- La route `/api/scanner/ocr` reste protégée (JWT Supabase) et répond
  normalement sur de vrais fichiers **fictifs** JPEG/PNG/PDF/Swiss QR.
- Les fonctions de paiements Apple et de synchronisation ne régressent pas.
- Les deux endpoints de diagnostic `/api/config/status` (historique) et
  `/api/config/readiness` requièrent désormais **un JWT Supabase valide
  portant `app_metadata.budgy_operator=true`**, valeur définie uniquement
  côté serveur par un administrateur Supabase Auth après vérification du
  compte. La simple connexion d'un utilisateur ne suffit pas : 401 sans
  JWT, 403 pour un utilisateur ordinaire, 200 pour l'opérateur autorisé.
  Les réponses n'exposent que `defined` / `missing` ou des métadonnées
  non secrètes. Ne jamais copier un JWT ou une clé dans le chat.
- Les anciens scripts externes qui interrogeaient publiquement
  `/api/config/status` devront cesser de le faire ou utiliser un compte
  opérateur autorisé. Les tests de santé publics restent `/health` et
  `/api/health`, sans jeton.

Si le SHA retourné est `unknown` ou différent de la révision épinglée,
**ne pas annoncer une livraison vérifiée** : contrôler l'ARG du Dockerfile,
le cache Docker, l'image et l'historique Coolify.

## 4. Habiliter un compte de diagnostic (sans migration)

**Seulement si un opérateur doit utiliser les diagnostics depuis un appareil
authentifié**, ouvrir le panneau **Auth Users de la vraie instance**
`supabase.budgy.ch`, identifier et vérifier le compte de l'opérateur.
Définir **sur son app_metadata gérée côté serveur**, et JAMAIS dans
`user_metadata`, le booléen `budgy_operator=true`. La modification de
ce rôle est une action administrative sensible à valider distinctement :
cette PR ne l'effectue pas. Forcer le renouvellement du JWT pour que le
nouveau claim signé apparaisse dans la session opérateur. Ce droit donne
uniquement accès aux diagnostics de présence, **pas aux données métier**.

Les opérateurs peuvent tester par la suite, avec leur propre client
authentifié, que le diagnostic renvoie 200 et des indicateurs, et qu'un
compte ordinaire reçoit 403. Ne jamais partager le token ni les clés.

## 5. Inventaire des variables : noms seulement

Ces groupes sont requis **pour la fonctionnalité indiquée**, pas tous pour
que la route de santé fonctionne :

| Fonction | Variables à vérifier | Règle |
|---|---|---|
| API / authentification | `SUPABASE_URL` | Requis pour une configuration explicite de production ; doit pointer vers `supabase.budgy.ch`. `auth.py` possède un fallback historique, à ne pas prendre pour une preuve de bonne configuration |
| IA OCR OpenAI | `OPENAI_API_KEY` | Requis si OpenAI est le fournisseur retenu ; alternatives Anthropic/Gemini prévues par le client |
| État abonnement et restauration | `SUPABASE_SERVICE_ROLE_KEY` | Requis pour persister les abonnements côté serveur ; rester uniquement dans le conteneur/backend |
| Abonnements Apple | `APPLE_BUNDLE_ID`, `APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY_P8` (alias `APPLE_PRIVATE_KEY`), `APPLE_PRODUCT_ID_MONTHLY` (alias `APPLE_PRODUCT_MONTHLY`, `IAP_PRODUCT_MONTHLY`), `APPLE_PRODUCT_ID_YEARLY` (alias `APPLE_PRODUCT_YEARLY`, `APPLE_PRODUCT_ID_ANNUAL`, `APPLE_PRODUCT_ANNUAL`, `IAP_PRODUCT_YEARLY`, `IAP_PRODUCT_ANNUAL`) | Requis pour la validation complète Apple et l'identification des produits selon la fonctionnalité ; ne jamais exposer les valeurs |
| Auth JWT HS256 legacy | `SUPABASE_JWT_ALLOW_HS256_FALLBACK`, `SUPABASE_JWT_SECRET` | Optionnelles, uniquement pour le mode HS256 explicitement activé (JWKS asymétrique privilégié) |
| Apple optionnelles | `APPLE_SHARED_SECRET`, `APPLE_APP_APPLE_ID`, `APPLE_USE_SANDBOX`, `IAP_WEBHOOK_SECRET` | Selon la configuration Apple/webhooks |
| LLM alternatives | `LLM_PROVIDER`, `LLM_MODEL`, `LLM_MODEL_CHAT`, `LLM_MODEL_FAST`, `LLM_TIMEOUT_SECONDS`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` (ou `GOOGLE_API_KEY`), `AZURE_OPENAI_API_KEY` (ou `AZURE_API_KEY`), `EMERGENT_LLM_KEY` | Paramètres/alternatives ou fallback legacy ; ne pas recréer Emergent |
| Runtime / réseau | `APP_ENV`, `LOG_LEVEL`, `HOST`, `PORT`, `CORS_ALLOWED_ORIGINS`, `CORS_ALLOWED_ORIGIN_REGEX`, `SUPABASE_JWT_AUD`, `SUPABASE_JWT_ISS` | Valeurs par défaut présentes dans le code ; à contrôler pour production |
| Provenance | `BUDGY_GIT_SHA` | Optionnelle pour démarrer, **obligatoire pour attester le commit réel** (build-arg à injecter explicitement) |
| Historique obsolète | `APP_VERSION` | Ignorée pour l'identité de code du nouveau backend (version canonique `4.0.0`) |

Un **état `defined`** ne prouve pas que le secret est correct, que l'API
répond, ni que les abonnements sont valides ; il atteste seulement la présence
d'une chaîne non vide.

## 6. Retour arrière obligatoire en cas d'écart

1. Garder le déploiement automatique **désactivé**.
2. Remettre dans Coolify la branche `main`, le **SHA précis de l'ancien
   déploiement fonctionnel** (ne pas laisser `HEAD` si la révision
   précédente ne peut pas être retrouvée), et l'ancien ARG de provenance
   si nécessaire.
3. Utiliser l'image / le déploiement antérieur de Coolify si disponible
   ou redéployer le SHA antérieur **uniquement sur autorisation**.
4. Vérifier `/health`, le contrat OpenAPI et un test fonctionnel simple.
5. Vérifier que les variables et les URLs de Supabase n'ont pas changé.
6. Ne pas tenter de « corriger » une erreur par migration SQL improvisée.
   Un rollback applicatif ne remplace pas une restauration testée lorsqu'un
   schéma a été changé, d'où l'obligation de sauvegarde avant toute migration.

## 7. Restrictions

- Aucune action sur une autre base Supabase.
- Aucun déploiement automatique depuis cette PR.
- Aucun `git push --force`, aucun push sur `main`, aucune suppression
  des branches `backup-*`, `conflict_*` ou `emergent-nov-15`.
- Aucune compilation Expo, TestFlight ou Google Play requise pour cette PR.
- Si le déploiement précédent est impossible à restaurer, **stopper** et
  résoudre le rollback avant de changer Coolify.

## Addendum build iOS 92 — confidentialité documentaire (18.11.2026)

La politique **stockage local des documents + iCloud personnel** concerne le
**frontend** et ne requiert **aucun déploiement Coolify**, aucune migration SQL,
ni aucune modification des buckets Supabase de production pour compiler le
build 92. Sur le client, les nouveaux envois binaires et la synchronisation des
tables `documents`, `invoices`, `contracts`, `receipts` sont désactivés.
Les anciennes copies cloud restent intactes afin de permettre une récupération
contrôlée avant suppression autorisée et auditée.

La sauvegarde iCloud iOS de l'appareil est conditionnelle aux réglages Apple ;
l'export vers **iCloud Drive** est réalisé **manuellement** avec Partager →
Enregistrer dans Fichiers. Aucun entitlement CloudKit ou sync automatique
iCloud Drive n'est revendiqué dans le build 92.

La procédure opérationnelle et les réserves sur l'OCR externe figurent dans
[BUILD92_LOCAL_ICLOUD_PROCEDURE_FR.md](BUILD92_LOCAL_ICLOUD_PROCEDURE_FR.md).
Ne pas déployer la production en se fondant sur cet addendum.

**Gate final de la PR #4 :** exécuter `test-document-privacy`, le test de stabilité des 17 lignes du menu et le contrôle Expo iOS/Android sur le SHA exact ; la validation native iCloud Backup et Fichiers/iCloud Drive reste à faire sur appareil Apple avant diffusion.
