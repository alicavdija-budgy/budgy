# Migration Supabase Self-Hosted vers Signing Keys ES256

**Version cible:** Budgy v3.9.0 (Build 71)
**Contexte:** L'endpoint `https://supabase.budgy.ch/auth/v1/.well-known/jwks.json` retourne actuellement `{"keys":[]}` → Supabase self-hosted utilise encore le JWT legacy HS256. Il faut migrer proprement vers ES256 asymétrique **sans casser** les utilisateurs existants.

**Bonne nouvelle:** La procédure officielle Supabase inclut nativement le legacy HS256 dans le **JWKS interne inter-services**. Le fallback HS256 reste ainsi accessible aux services Supabase (PostgREST, Realtime, Storage) **sans jamais exposer le secret** sur l'endpoint public.

---

## 🔒 Distinction critique — JWKS interne vs JWKS public

⚠️ **Point de sécurité fondamental à comprendre avant toute action :**

| Aspect | **JWKS interne** (`JWT_JWKS` env) | **JWKS public** (`/.well-known/jwks.json`) |
|---|---|---|
| Rôle | Consommé UNIQUEMENT par les services self-hosted (PostgREST, Realtime, Storage, Edge Functions) via variables d'env | Consommé par les **clients externes** (backend Budgy, apps tierces) pour vérifier les JWT |
| Peut contenir HS256 ? | ✅ OUI temporairement (transition legacy) — le champ `k` reste dans le réseau privé Docker/K8s | ❌ **NON, JAMAIS** — n'importe qui lit cet endpoint |
| Matériel autorisé | JWK privée EC + JWK publique EC + clé oct (HS256) legacy | UNIQUEMENT clés publiques asymétriques (`kty=EC` ou `kty=RSA` ou `kty=OKP`, sans `d`, `p`, `q`, `dp`, `dq`, `qi`, `k`) |
| Exposition réseau | Interne, docker network | HTTPS public, Internet |

### ❌ Ce qui NE DOIT JAMAIS apparaître dans `/.well-known/jwks.json`

- `"kty": "oct"` → indique une clé symétrique (leak = forgeage complet de tokens)
- Champ `"k"` → **c'est le secret HS256 en clair**
- Champs `"d"`, `"p"`, `"q"`, `"dp"`, `"dq"`, `"qi"` → composantes privées EC/RSA
- Toute clé privée sous quelque forme que ce soit

### ✅ Ce qui EST autorisé dans `/.well-known/jwks.json`

UNIQUEMENT les champs publics d'une clé asymétrique :

- `kty`: `EC`, `RSA` ou `OKP`
- `crv`: `P-256`, `P-384`, `Ed25519` etc.
- `alg`: `ES256`, `RS256`, `EdDSA`
- `kid`: identifiant public
- `x`, `y`: coordonnées publiques EC (safe)
- `n`, `e`: exposants publics RSA (safe)
- `use`, `key_ops`: métadonnées non sensibles

### Vérification GoTrue

GoTrue expose par défaut `/.well-known/jwks.json` en filtrant automatiquement les champs privés. Néanmoins, **toujours vérifier** avec `scripts/verify-jwks.sh` après chaque migration ou rotation de clé (voir Phase 4.2).

Le fallback legacy HS256 fonctionne côté Budgy backend via `SUPABASE_JWT_ALLOW_HS256_FALLBACK=1` + `SUPABASE_JWT_SECRET`, **sans dépendre du JWKS public**. C'est le design correct.

---

**IMPORTANT — Statut backend Budgy:** Le backend `auth.py` supporte déjà :
- ✅ JWKS ES256 / RS256 / EdDSA (asymétrique)
- ✅ Fallback HS256 opt-in (`SUPABASE_JWT_ALLOW_HS256_FALLBACK=1`)
- ✅ Anti-amplification (negative cache)
- ✅ Rejet strict `alg=none`, `kid` inconnu, tokens sans `exp`/`sub`

Aucune modification côté Budgy n'est requise pour cette migration. **Toutes les étapes ci-dessous sont à exécuter côté serveur Coolify Supabase.**

---

## 📋 Phase 0 — Prérequis & Audit (5 min)

### 0.1 Vérifier la version Supabase self-hosted

Connectez-vous en SSH sur votre serveur Coolify puis :

```bash
# Trouver le container GoTrue (Auth)
docker ps --format 'table {{.Names}}\t{{.Image}}' | grep -Ei 'auth|gotrue|supabase'
```

Vous devriez voir des containers du type :
- `supabase-auth` (image `supabase/gotrue:v2.x.x`)
- `supabase-rest` (image `postgrest/postgrest:v12.x.x`)
- `realtime-dev.supabase-realtime`
- `supabase-storage` (image `supabase/storage-api:v1.x.x`)
- `supabase-kong`

### 0.2 Localiser le repo Supabase (utils/)

La procédure officielle utilise `utils/add-new-auth-keys.sh`. Ce script est fourni dans le repo `supabase/supabase` (`docker/utils/`).

```bash
# Localiser le docker-compose Supabase de Coolify
find / -name "docker-compose*.yml" 2>/dev/null | grep -i supabase
# Généralement: /var/lib/coolify/services/<uuid>/docker-compose.yml
# ou:          /opt/supabase/docker/docker-compose.yml

cd <chemin trouvé>
ls utils/ 2>/dev/null
```

**Si `utils/` n'existe pas dans votre setup Coolify** (Coolify gère ses propres compose), voir la **Phase 3-bis** ci-dessous pour la procédure manuelle.

### 0.3 Vérifier l'état actuel de JWKS

```bash
curl -s https://supabase.budgy.ch/auth/v1/.well-known/jwks.json
# Attendu actuellement: {"keys":[]}
```

---

## 📋 Phase 1 — Sauvegarde & Rollback (10 min)

### 1.1 Sauvegarder les fichiers critiques

```bash
STAMP=$(date +%Y%m%d-%H%M%S)
SUPABASE_DIR=<chemin de votre docker-compose supabase>
mkdir -p ~/supabase-backup-${STAMP}

# Env file
cp ${SUPABASE_DIR}/.env ~/supabase-backup-${STAMP}/env.bak
# Docker compose
cp ${SUPABASE_DIR}/docker-compose.yml ~/supabase-backup-${STAMP}/docker-compose.yml.bak
# Kong config si utilisé
cp ${SUPABASE_DIR}/volumes/api/kong.yml ~/supabase-backup-${STAMP}/kong.yml.bak 2>/dev/null

# Dump base de données (préventif — les JWT n'y touchent pas mais on ne prend pas de risque)
docker exec supabase-db pg_dumpall -U postgres > ~/supabase-backup-${STAMP}/db-full-dump.sql

ls -lh ~/supabase-backup-${STAMP}/
```

### 1.2 Noter la valeur actuelle du `JWT_SECRET` (masquée)

```bash
grep '^JWT_SECRET=' ${SUPABASE_DIR}/.env | sed 's/=.*/=***KEEP-INTACT***/'
```

**⚠️ Ne supprimez PAS `JWT_SECRET`.** Supabase l'inclura dans le JWKS comme clé legacy tant que vous ne la retirez pas explicitement.

### 1.3 Script de rollback

```bash
cat > ~/supabase-backup-${STAMP}/ROLLBACK.sh <<'EOF'
#!/bin/bash
set -e
STAMP=<REPLACE_ME>
SUPABASE_DIR=<REPLACE_ME>
cd ${SUPABASE_DIR}
cp ~/supabase-backup-${STAMP}/env.bak .env
cp ~/supabase-backup-${STAMP}/docker-compose.yml.bak docker-compose.yml
docker compose down
docker compose up -d
echo "Rollback done."
EOF
chmod +x ~/supabase-backup-${STAMP}/ROLLBACK.sh
```

---

## 📋 Phase 2 — Générer les Signing Keys ES256 (5 min)

### 2.1 Cas A — Vous avez le script officiel `utils/add-new-auth-keys.sh`

```bash
cd ${SUPABASE_DIR}
sh utils/add-new-auth-keys.sh --update-env
```

Ce script :
- Génère une paire EC P-256 (ES256)
- Ajoute `JWT_KEYS` (privée+publique+legacy HS256) dans `.env`
- Ajoute `JWT_JWKS` (publique+legacy HS256) dans `.env`
- **N'écrase PAS** `JWT_SECRET` (compatibilité)

### 2.2 Cas B — Script absent (setup Coolify custom)

Récupérez-le depuis GitHub :

```bash
cd /tmp
curl -sL -o add-new-auth-keys.sh \
  https://raw.githubusercontent.com/supabase/supabase/master/docker/utils/add-new-auth-keys.sh
chmod +x add-new-auth-keys.sh
# Éditer si nécessaire pour pointer vers votre chemin .env
sh add-new-auth-keys.sh --update-env
```

### 2.3 Vérification post-génération

```bash
grep -E '^(JWT_KEYS|JWT_JWKS|JWT_SECRET)=' ${SUPABASE_DIR}/.env | awk -F= '{print $1"=***PRESENT***"}'
```

Attendu (3 lignes) :
```
JWT_KEYS=***PRESENT***
JWT_JWKS=***PRESENT***
JWT_SECRET=***PRESENT***
```

---

## 📋 Phase 3 — Configurer les services (10 min)

### 3.1 Éditer `docker-compose.yml`

Assurez-vous que **chaque service** ci-dessous a la ligne d'environnement correspondante (décommentez si nécessaire) :

```yaml
services:
  auth:              # GoTrue
    environment:
      GOTRUE_JWT_SECRET: ${JWT_SECRET}            # ← conserver pour compat
      GOTRUE_JWT_KEYS: ${JWT_KEYS:-[]}            # ← NOUVEAU (ES256)

  rest:              # PostgREST
    environment:
      PGRST_JWT_SECRET: ${JWT_JWKS:-${JWT_SECRET}}   # ← JWKS ou fallback legacy

  realtime:
    environment:
      API_JWT_SECRET: ${JWT_SECRET}                # ← conserver
      API_JWT_JWKS: ${JWT_JWKS:-{"keys":[]}}       # ← NOUVEAU

  storage:
    environment:
      JWT_SECRET: ${JWT_SECRET}                    # ← conserver
      JWT_JWKS: ${JWT_JWKS:-{"keys":[]}}           # ← NOUVEAU

  functions:         # Edge Functions (si utilisées)
    environment:
      SUPABASE_JWT_SECRET: ${JWT_SECRET}
      SUPABASE_JWKS: ${JWT_JWKS:-{"keys":[]}}      # ← NOUVEAU
```

**⚠️ Points de vigilance :**
- **Realtime ET Storage** DOIVENT avoir la variable JWKS, sinon ils tomberont silencieusement sur HS256 et les tokens ES256 rendront `auth.uid() = NULL`.
- `${JWT_JWKS:-{"keys":[]}}` : la valeur par défaut évite un crash si `JWT_JWKS` n'est pas définie.

### 3.2 Cas Coolify — Interface web

Si vous gérez le service via l'UI Coolify (pas de docker-compose éditable directement) :
1. Ouvrez le service Supabase dans Coolify
2. Onglet "Environment Variables"
3. Ajoutez pour **chaque service composant** (Auth, PostgREST, Realtime, Storage) les variables correspondantes de la section 3.1
4. Save + Restart

---

## 📋 Phase 4 — Redémarrage & Vérification (5 min)

### 4.1 Recréer les containers

```bash
cd ${SUPABASE_DIR}
docker compose down
docker compose up -d
# ou via Coolify: bouton "Restart"

# Attendre que les services soient prêts
sleep 20
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep supabase
```

### 4.2 Vérifier l'endpoint JWKS public

```bash
curl -s https://supabase.budgy.ch/auth/v1/.well-known/jwks.json | jq .
```

**Attendu — UNIQUEMENT du matériel public asymétrique :**
```json
{
  "keys": [
    {
      "kty": "EC",
      "crv": "P-256",
      "alg": "ES256",
      "kid": "<uuid>",
      "x": "...",
      "y": "..."
    }
  ]
}
```

🚨 **INTERDIT dans le JWKS public** — si `curl` retourne l'un des éléments suivants, **ARRÊTEZ IMMÉDIATEMENT** et rollback :

- `"kty": "oct"` (clé symétrique)
- Champ `"k"` (secret HS256 en clair)
- Champs `"d"`, `"p"`, `"q"`, `"dp"`, `"dq"`, `"qi"` (composantes privées EC/RSA)

Toute présence de ces champs signifie que GoTrue expose votre secret sur Internet.

**Contrôle automatique — OBLIGATOIRE :**
```bash
/app/scripts/verify-jwks.sh https://supabase.budgy.ch
```
Le script échoue en `exit 3` si un secret est détecté et bloque le GO Build 71.

**⚠️ Ne jamais logguer/afficher la clé privée EC** — elle reste uniquement dans `JWT_KEYS` côté serveur (env interne).

**⚠️ Le legacy HS256 reste supporté** — mais UNIQUEMENT via le JWKS interne (env `JWT_JWKS` des services) ou via `SUPABASE_JWT_SECRET` côté backend Budgy. **Pas via l'endpoint public.**

### 4.3 Vérifier chaque service (script de diagnostic officiel)

```bash
cd ${SUPABASE_DIR}
# Si dispo:
./utils/diagnose-jwt.sh
# Ou manuellement (voir Phase 5)
```

---

## 📋 Phase 5 — Tests fonctionnels (15 min)

### 5.1 Créer une session test et inspecter le header JWT

Depuis l'app mobile Budgy (ou via un login test admin) :

```bash
# Exemple avec curl (remplacer par un vrai login test)
TOKEN=$(curl -s -X POST https://supabase.budgy.ch/auth/v1/token?grant_type=password \
  -H "apikey: <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@budgy.ch","password":"<TEST_PWD>"}' | jq -r .access_token)

# Décoder UNIQUEMENT le header (jamais afficher le token complet)
echo "$TOKEN" | cut -d. -f1 | base64 -d 2>/dev/null | jq .
```

**Attendu :**
```json
{ "alg": "ES256", "typ": "JWT", "kid": "<uuid>" }
```

### 5.2 Tester le backend Budgy avec le nouveau token

```bash
# Endpoint protégé Budgy
curl -sSf -H "Authorization: Bearer ${TOKEN}" \
  https://api.budgy.ch/api/iap/me | jq .
```

Attendu : `200 OK` avec le user actuel (pas de 401).

### 5.3 Tests de sécurité (rejet)

Le backend Budgy doit **refuser** :

| Test | Attendu |
|------|---------|
| `alg=none` | 401 `algorithm_not_allowed` |
| `kid` inconnu | 401 `unknown_kid` |
| Signature modifiée | 401 `invalid_signature` |
| Token expiré | 401 `token_expired` |
| Autre `aud` | 401 `invalid_audience` |
| Missing `exp`/`sub` | 401 `invalid_token` |

Ces tests sont déjà couverts par la suite `/app/backend/tests/test_v390_security.py` — relancez-la après la migration :

```bash
cd /app/backend
pytest tests/test_v390_security.py -v
pytest tests/test_v390_jwks_negcache_fix.py -v
```

### 5.4 Tester le fallback HS256 legacy

Les sessions déjà émises **avant** la migration (HS256) doivent continuer de fonctionner :

- Sur l'app mobile (session déjà connectée avant migration) : ouvrir l'app → toutes les requêtes API doivent passer.
- Test unitaire déjà couvert dans `test_v390_security.py` (`test_hs256_fallback_when_enabled`).

### 5.5 Tests Supabase natifs

Depuis un client (Postman, script, ou app) :

**Auth**
- [ ] `POST /auth/v1/signup` → 200
- [ ] `POST /auth/v1/token?grant_type=password` → 200
- [ ] `POST /auth/v1/token?grant_type=refresh_token` → 200
- [ ] `POST /auth/v1/logout` → 204
- [ ] `POST /auth/v1/recover` (password reset) → 200

**RLS (avec 2 users)**
- [ ] User A GET `/rest/v1/expense_groups` → ne voit que ses groupes
- [ ] User A UPDATE `/rest/v1/expense_groups?id=<user_B_group>` → 403/empty
- [ ] `auth.uid()` retourne bien le UUID user dans PostgREST

**Storage**
- [ ] Upload autorisé pour User A dans son bucket
- [ ] Access refusé pour User B sur objet User A

**Realtime**
- [ ] Subscription authentifiée → OK
- [ ] Isolation cross-user vérifiée

---

## 📋 Phase 6 — Post-migration (optionnel)

### 6.1 Passer le backend Budgy en mode ES256-only (post stabilité)

Une fois la stabilité confirmée pendant ~1-2 semaines et que **plus aucun token HS256 legacy** n'est en circulation (vérifier logs) :

Dans `/app/backend/.env` :
```
SUPABASE_JWT_ALLOW_HS256_FALLBACK=0
```

Puis retirer côté Supabase le `JWT_SECRET` de la config (le retrait du legacy nécessitera une regénération sans le legacy embarqué — voir docs Supabase).

**❌ Ne pas exécuter cette étape maintenant** (attente utilisateur explicite).

### 6.2 Rotation ultérieure des clés API

Pour rotation des clés API opaques (`sb_publishable_*`, `sb_secret_*`), sans invalider les sessions ES256 :

```bash
sh utils/rotate-new-api-keys.sh --update-env
```

---

## 📋 Rollback d'urgence

Si un service casse après migration :

```bash
~/supabase-backup-${STAMP}/ROLLBACK.sh
```

Puis vérifier :
```bash
curl -s https://supabase.budgy.ch/auth/v1/.well-known/jwks.json
# Devrait retourner {"keys":[]} de nouveau (état pré-migration)
```

Le backend Budgy continuera de fonctionner grâce à `SUPABASE_JWT_ALLOW_HS256_FALLBACK=1`.

---

## 📊 Rapport final attendu

Après la Phase 5, vous devriez pouvoir remplir :

| Item | Statut |
|------|--------|
| ✅ Supabase version | `<detected>` |
| ✅ Auth Signing Mode ES256 | YES |
| ✅ JWKS Public dispo | YES |
| ✅ Nouveau JWT header | `alg=ES256`, `kid=<uuid>` |
| ✅ Legacy HS256 fallback | YES (temporaire) |
| ✅ Budgy Backend Auth | PASS |
| ✅ Supabase Auth | PASS |
| ✅ RLS | PASS |
| ✅ Realtime | PASS |
| ✅ Storage | PASS |
| ✅ Regression Tests | 23/23 PASS |
| ⚠️ ACTION REQUIRED | Aucune si tout PASS |
| ✅ BUILD 71 READINESS | READY |

---

## 🔒 Règles absolues respectées

- ❌ Aucune clé privée jamais affichée
- ❌ Aucun secret committé dans Git
- ✅ Ancien `JWT_SECRET` conservé pour compat
- ✅ Mobile Budgy **inchangé** (Supabase JS gère tout)
- ✅ Rollback possible à tout moment
- ✅ Backend Budgy déjà prêt (JWKS + fallback HS256 opt-in)

---

## Références officielles

- Supabase Self-Hosted Auth Keys: <https://supabase.com/docs/guides/self-hosting/self-hosted-auth-keys>
- Blog JWT Signing Keys: <https://supabase.com/blog/jwt-signing-keys>
- Script officiel: <https://github.com/supabase/supabase/blob/master/docker/utils/add-new-auth-keys.sh>
- PR JWKS enable services: <https://github.com/supabase/supabase/pull/46621>
