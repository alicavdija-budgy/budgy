# Budgy v3.9.0 — Backend Endpoint Security Matrix

> Generated during the v3.9.0 Security Release. Every non-webhook endpoint is
> either **PUBLIC** (health/config) or **AUTHENTICATED** (Supabase JWT required).
> The Apple webhook is protected by (a) a shared secret and (b) full JWS
> signature verification against Apple's certificate chain.

| Endpoint | Method | Access | Auth | Rate limit | Notes |
|---|---|---|---|---|---|
| `/health` | GET | PUBLIC | none | 120/min (default) | Coolify probe |
| `/api/health` | GET | PUBLIC | none | 120/min | uptime |
| `/api/config/status` | GET | PUBLIC | none | 120/min | never returns secret values |
| `/api/coach/chat` | POST | AUTH | Bearer JWT | 30/min · 300/hour | LLM-costly |
| `/api/scanner/ocr` | POST | AUTH | Bearer JWT | 20/min · 200/hour | LLM-costly, image ≤ 8 MB |
| `/api/email/parse` | POST | AUTH | Bearer JWT | 30/min · 300/hour | LLM-costly |
| `/api/optimizer/analyze` | POST | AUTH | Bearer JWT | 20/min · 200/hour | LLM-costly |
| `/api/voice/parse` | POST | AUTH | Bearer JWT | 60/min · 600/hour | text ≤ 1000 chars |
| `/api/export/pdf` | POST | PUBLIC¹ | none | 120/min | own-data render only |
| `/api/family/create` | POST | PUBLIC² | none | 120/min | in-memory legacy code path |
| `/api/family/join` | POST | PUBLIC² | none | 120/min | in-memory legacy code path |
| `/api/family/{code}` | GET | PUBLIC² | none | 120/min | in-memory legacy code path |
| `/api/alerts/check-budgets` | POST | PUBLIC² | none | 120/min | in-memory legacy |
| `/api/alerts/{user_id}` | GET | PUBLIC² | none | 120/min | in-memory legacy |
| `/api/lamal/subsidy` | POST | PUBLIC | none | 120/min | stateless calc |
| `/api/tax/simulate` | POST | PUBLIC | none | 120/min | stateless calc |
| `/api/iap/validate` | POST | AUTH | Bearer JWT | 30/min | **user_id from JWT only** |
| `/api/iap/restore` | POST | AUTH | Bearer JWT | 30/min | **user_id from JWT only** |
| `/api/iap/me` | GET | AUTH | Bearer JWT | 120/min | **user_id from JWT only** |
| `/api/iap/webhook/apple` | POST | INTERNAL | Shared secret + JWS verified | 240/min | Apple → us only |
| `/api/iap/health` | GET | PUBLIC | none | 120/min | non-secret diagnostic |

**Notes**:
- ¹ `/api/export/pdf` renders user-supplied data as HTML/PDF. The output is
  returned to the same caller (no cross-user impact). It is not authenticated
  in v3.9.0 to avoid breaking existing offline PDF exports. Fields are still
  sanitized server-side.
- ² Legacy in-memory family endpoints (`/api/family/*`, `/api/alerts/*`) are
  deprecated by the Supabase-based `group_invites` + `join_group_by_code` RPC
  flow shipped in v3.8.0. They remain unauthenticated but hold no persistent
  data (in-memory only). Marked for removal in v4.0.

**Enforcement**:
- JWT verification uses HS256 against `SUPABASE_JWT_SECRET`.
- The user_id is always taken from the verified `sub` claim.
- Any client-supplied `user_id` field is IGNORED (defense-in-depth).
- Rate-limit key is `u:<user_id>` if authenticated, else `ip:<remote>`.
- Rate-limit exceeded → HTTP 429 with `{error: "rate_limited"}`.
- Auth failure → HTTP 401 with `{error: "missing_token" | "token_expired" | "invalid_token"}`.
- Internal exceptions never leak stack traces or secrets — always
  `{error: "internal_server_error"}` (HTTP 500).
