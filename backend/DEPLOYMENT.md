# Budgy API — Self-hosted Deployment Guide (Coolify)

This backend is a stateless FastAPI service designed to run **only** on your
own VPS through [Coolify](https://coolify.io). No Emergent-hosted service is
required at runtime — all LLM calls go directly to the provider you configure
(OpenAI by default) and all persistent state lives in your self-hosted
Supabase instance (`https://supabase.budgy.ch`).

---

## 1 · Architecture

| Component | URL | Where it runs |
|-----------|-----|---------------|
| Mobile / Web frontend | `https://budgy.ch` | Coolify (Expo static export or React Native client) |
| Backend API           | `https://api.budgy.ch` | Coolify (this Dockerfile) |
| Supabase              | `https://supabase.budgy.ch` | Coolify (official `supabase/supabase` stack) |

DNS: point all three subdomains to the same VPS A record; Coolify provisions
the TLS certificate via Let's Encrypt for each one.

---

## 2 · One-time prerequisites on the VPS

1. A Coolify v4 instance already running.
2. A Supabase project deployed via Coolify, available at `https://supabase.budgy.ch`.
3. Run the SQL migration once: `supabase_iap_migration.sql` (creates the
   `public.user_subscriptions` table used by the IAP flow).
4. Generate a **service-role** JWT for that Supabase project — you'll need
   it for `SUPABASE_SERVICE_ROLE_KEY`.

---

## 3 · Create the service in Coolify

1. **New Resource → Application → Public Repository**.
2. Repository: your GitHub fork of Budgy.
3. Branch: `main` (or whatever you ship from).
4. Build pack: **Dockerfile** (the repo already contains `backend/Dockerfile`).
5. Base directory: `backend/`.
6. Dockerfile location: `backend/Dockerfile`.
7. Port: **8000** (Coolify will publish it on 443 via its Traefik proxy).
8. Health-check path: `/health` (returns `{"status":"ok"}`).
9. Domain: `api.budgy.ch` — toggle automatic HTTPS.

> If you prefer Nixpacks, the repo also ships `backend/nixpacks.toml`. Switch
> the build pack to *Nixpacks* and leave the rest unchanged.

---

## 4 · Environment variables

Paste every variable from `backend/.env.example` into Coolify's *Environment
Variables* tab and replace the placeholders. The mandatory ones are:

| Group | Variables |
|-------|-----------|
| Runtime | `APP_ENV`, `APP_VERSION`, `LOG_LEVEL`, `HOST`, `PORT` |
| CORS | `CORS_ALLOWED_ORIGINS`, `CORS_ALLOWED_ORIGIN_REGEX` |
| LLM | `LLM_PROVIDER`, `LLM_MODEL`, `OPENAI_API_KEY` (or your provider's key) |
| Supabase | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Apple IAP | `APPLE_BUNDLE_ID`, `APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRODUCT_ID_MONTHLY`, `APPLE_PRODUCT_ID_YEARLY`, `APPLE_USE_SANDBOX`, `APPLE_SHARED_SECRET`, `APPLE_PRIVATE_KEY_P8`, `IAP_WEBHOOK_SECRET` |

### Tips for the Apple `.p8` private key

The full PEM (including `-----BEGIN PRIVATE KEY-----` and the matching
`-----END PRIVATE KEY-----` lines) must be stored on a single Coolify line.
Use `\n` between every line of the PEM **and surround the whole value with
double-quotes** so the shell does not interpret the dollar signs:

```
APPLE_PRIVATE_KEY_P8="-----BEGIN PRIVATE KEY-----\nMIGT...\n-----END PRIVATE KEY-----"
```

Coolify will pass this verbatim to the container; the backend converts the
`\n` sequences back to real new-lines before signing.

---

## 5 · Deploy

Click **Deploy**. Coolify will:

1. Clone the repo.
2. Build the Docker image (see `backend/Dockerfile`).
3. Start one container on port 8000.
4. Wire the container to Traefik with a TLS cert for `api.budgy.ch`.
5. Probe `/health`; once the probe is green the service is live.

To check from your laptop:

```bash
curl https://api.budgy.ch/health
# → {"status":"ok","service":"budgy-api","version":"3.7.16","env":"production"}

curl https://api.budgy.ch/api/iap/health
# → diagnostic JSON; "iap_ready":true once the Apple env vars are filled in
```

---

## 6 · Mobile client configuration

In `frontend/eas.json`, replace the Emergent preview URL with the production
backend in every build profile:

```jsonc
"env": {
  "EXPO_PUBLIC_BACKEND_URL": "https://api.budgy.ch",
  "EXPO_PUBLIC_SUPABASE_URL": "https://supabase.budgy.ch",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY": "<anon JWT from your Supabase project>"
}
```

Bump the build (`buildNumber` / `versionCode`) and submit the new TestFlight
build — the app will now hit your VPS exclusively.

---

## 7 · Observability

* **Logs** — Coolify streams stdout. The backend logs in the format
  `2026-01-01 12:00:00 [budgy] INFO …`.
* **Health probes** — `GET /health` (root) and `GET /api/health`.
* **IAP diagnostics** — `GET /api/iap/health` returns which env vars are
  missing without ever leaking secrets.

Recommended Coolify alerts: container restarts, health-check failures,
HTTP 5xx rate above 1% over 5 min.

---

## 8 · Local dev (optional)

```bash
cd backend
cp .env.example .env        # fill in your dev keys
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

Or with Docker:

```bash
cd backend
docker build -t budgy-api .
docker run --rm --env-file .env -p 8000:8000 budgy-api
```

---

## 9 · Rollback

Coolify keeps the previous image. From the application page → *Deployments*
tab → pick the last good build → **Redeploy**.
