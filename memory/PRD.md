# Budgy v3.9.0 build 73 — Locale-aware backend + release checklist

## Contexte
- Passe finale i18n: backend `/api/coach/chat`, `/api/email/parse`, `/api/scanner/ocr` deviennent locale-aware.
- Aucun build iOS/Android généré; aucune publication.

## Frontend (inchangé, validé baseline)
- USER_VISIBLE = 0, REVIEW_MANUALLY = 0, IGNORED_DIRECTIVES = 0
- 85 namespaces × 1962 clés × 4 langues, parity PASS
- Nouveau helper: `src/utils/apiLocale.ts` → `getApiLocale(lang)` (fr/en/de/it, fallback fr)
- Callsites migrés: `predict.tsx` (coach), `email-import.tsx`, `scanner-modal.tsx` (envoient body.locale + Accept-Language)

## Backend v3.9.0 (locale-aware)
- `SYSTEM_PROMPT` refactoré en `SYSTEM_PROMPT_BASE + build_system_prompt(locale)` + `LANGUAGE_DIRECTIVES` par langue (FR/EN/DE/IT)
- Modèles Pydantic: `ChatRequest`, `EmailParseRequest`, `OCRRequest` → nouveau champ `locale: Optional[str] = "fr"`
- Chat sessions namespacées par `(user_id, locale, session_id)` — pas de fuite cross-locale
- Prompts OCR + Email: nouvelle clause "DATA INTEGRITY — NEVER TRANSLATE" (merchant, IBAN, references, amounts, currency, raw_text = verbatim)
- Codes d'erreur stables UPPER_SNAKE_CASE: `LLM_NOT_CONFIGURED`, `IMAGE_TOO_SMALL`, `INVALID_BASE64`, `INVALID_JSON`, `OCR_FAILED`, `EMAIL_PARSE_FAILED`

## Tests
- **Frontend**: TypeScript PASS, audit:i18n PASS, check:i18n PASS, audit self-test 4/4 PASS
- **Backend**: 144 passed / 1 skipped / 0 failed (via `testing_agent`)
- **Nouveau**: `test_v390_locale_endpoints.py` — 18 tests couvrant les 4 locales × 3 endpoints + data-integrity + error codes stables

## Apple / StoreKit
- iap.purchase, iap.restore, startTrial no-op intacts
- Product IDs, version 3.9.0, build 73, iPad maxWidth 560 inchangés

## Supabase / EAS
- eas.json: development / preview / production restaurés avec `environment` explicite
- URLs: https://api.budgy.ch + https://supabase.budgy.ch
- Aucune clé exposée dans le repo

## LAMal
- Aucune donnée modifiée (primes, franchises, calculs, codes cantonaux)
- `getCantonName(code, lang)` inchangé
- INSURERS.desc / strengths: non affichés — pas migrés (comme convenu)

## Ne PAS générer de build
Attendre validation utilisateur du rapport avant publication.
