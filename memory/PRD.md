# Budgy — PRD v3.9.0 build 73

## Objectifs de session
- **Zéro** chaîne `USER_VISIBLE` hardcodée dans l'app (i18n stricte fr/en/de/it)
- **Zéro** régression Apple Review 2.1(b) (StoreKit strict, pas de bypass Premium)
- **Zéro** régression Supabase (URLs de prod, aucune clé service_role hardcodée, EAS Secrets)
- Build 73 maintenu (pas d'incrément)

## État final (session courante)
- ✅ **USER_VISIBLE : 0** (audit `scripts/audit-i18n.mjs`)
- ✅ **REVIEW_MANUALLY : 0** (tous traités : soit traduits, soit annotés `// i18n-technical` pour matchers Supabase internes)
- ✅ **Parité i18n stricte** : 69 namespaces × 4 langues × 1828 clés — 0 erreur `scripts/check-i18n.mjs`
- ✅ **TypeScript** : `npx tsc --noEmit` PASS
- ✅ **Runtime web** : app charge, écran onboarding langue OK, écran auth traduit en EN

## Fichiers traités dans cette session
- `app/quick-add.tsx` : `SOURCE_LABELS`, tous les strings (titre, boutons, exemples) → i18n
- `app/lock.tsx` : "Budgy verrouillé", "Code incorrect", "Trop d'erreurs..." → `lockScreen.*`
- `app/auth.tsx` : "Confirmer le mot de passe", "Cloud sync activé", "Marie Dupont" → `authExtra.*`
- `app/(tabs)/more.tsx` : "Score Budgy", "Calendrier financier" → `moreExt.budgyScoreTitle|calendarTitle`
- `app/more/financial-calendar.tsx` : projections + tous les strings hero/segment/filter/empty + `fmtDay` locale-aware
- `app/more/recurring.tsx` : hero + impact labels + modal add + edit fields → `recurringScreen.*`
- `app/more/subscription.tsx` : header + fallbacks → `subscriptionScreen.*`
- `app/+html.tsx` : annoté `@i18n-technical-file`
- `src/lib/authErrors.ts` : annoté `@i18n-technical-file` (matchers Supabase, jamais UI)
- `src/utils/currency.ts` : SUPPORTED_CURRENCIES.label → clés `currencies.CHF|EUR|USD`
- `src/stores/selectors.ts` : `locale` param optionnel, plus de "Avril 2026" hardcodé
- `src/services/security.ts` : JSDoc réparé (bloc mal fermé)
- `src/data/priminfo-2026.ts` : JSDoc réparé
- `app/(tabs)/expenses.tsx` + `savings.tsx` : JSDoc réparé
- `src/components/CategoryIcon.tsx` : `getCategoryName(id, t?)` accepte translator optionnel
- Callers migrés : `predict.tsx`, `budgets.tsx`, `receipts.tsx`

## Nouveaux namespaces i18n (parité FR/EN/DE/IT)
- `quickAdd` étendu (18 clés supplémentaires)
- `lockScreen` (4 clés)
- `authExtra` (3 clés)
- `calendarScreen` (20+ clés incluant messages avec `{{issuer}}`)
- `recurringScreen` (18 clés incluant `{{currency}}`, `{{amount}}`, `{{n}}`)
- `subscriptionScreen` (5 clés)
- `currencies` (3 clés)
- `categoryLabels` (19 clés) — permet traduction dynamique de EXPENSE/INCOME_CATEGORIES
- `franchiseLabels` (9 clés — LAMal)
- `paymentMethods` (5 clés non-brand)
- `savingsTemplates` (12 clés)

## Traitement chirurgical `swiss-data.ts`
Fichier annoté `@i18n-official-data` — **AUCUNE modification métier**.
- ✅ Codes cantonaux, taux d'imposition, primes LAMal, plafonds subsides : **intacts**
- ✅ Noms de marques (CSS, Helsana, SWICA, TWINT, Apple Pay…) : **intacts** (trademarks)
- ✅ Nouveau : `categoryLabels.*` disponibles côté UI via `getCategoryName(id, t)` — les IDs internes restent français mais l'affichage est traduit
- Reste comme dette pour v3.9.1 (optionnel) : migrer `INSURERS.desc` et `INSURERS.strengths` vers i18n (visible uniquement dans le comparateur LAMal — utilisateurs FR-CH seulement à date)

## Règles préservées (do or die)
- ✅ StoreKit paywall : `iap.purchase()` inchangé, pas de `startTrial()` bypass
- ✅ Product IDs : `com.budgy.ch.budgy.monthly` / `com.budgy.ch.budgy.annual`
- ✅ Version **3.9.0** · Build **73** · iPad maxWidth 560
- ✅ Supabase URLs prod : `https://supabase.budgy.ch` + `https://api.budgy.ch`
- ✅ `EXPO_PUBLIC_SUPABASE_ANON_KEY` toujours via EAS environment

## Prochaines étapes (P1/P2)
1. `testing_agent` frontend multilingue complet (FR → EN → DE → IT → FR) sur Auth, Dashboard, Expenses, Paywall StoreKit, Calendar
2. Traduction backend AI : `/api/coach/chat`, `/api/email/parse`, `/api/scanner/ocr` (respecter `Accept-Language`)
3. Migrer `INSURERS.desc` / `strengths` vers i18n si l'app cible EN/DE/IT LAMal
