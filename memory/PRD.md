# Budgy — PRD v3.9.0 build 73

## Objectifs de session
- Zéro chaîne `USER_VISIBLE` hardcodée dans l'app (i18n stricte fr/en/de/it)
- Zéro régression Apple Review 2.1(b) (StoreKit strict, pas de bypass Premium)
- Zéro régression Supabase (URLs de prod, aucune clé service_role hardcodée, EAS Secrets)
- Build 73 maintenu (pas d'incrément)

## Avancée session actuelle
- USER_VISIBLE : 619 → **450** (−169)
- 6 écrans passés à 0 hardcode : `email-import`, `family`, `documents`, `add-contract`, `invoices`, `predict`
- 4 nouvelles namespaces i18n créées avec parité FR/EN/DE/IT stricte : `emailImport`, `addContract`, `documents`, `invoices`, `predict` + extensions `family`
- TypeScript : PASS · check-i18n : PASS (1387 clés, 38 namespaces, 0 erreur)
- Formats locale : `toLocaleDateString('fr-CH')` → locale dynamique via `DATE_LOCALES[lang]` dans `family.tsx` et `documents.tsx`

## Reste à faire (P0)
- Batch 4 : `export-pdf.tsx` (19), `cloud-sync.tsx` (16)
- Top files restants : `legal/sources.tsx` (20), `scanner-modal.tsx` (17), `receipts.tsx` (14), `incomes.tsx` (12), `recurring.tsx` (11), `investments.tsx` (11), `financial-calendar.tsx` (11), `quick-add.tsx` (10), `add-receipt-manual.tsx` (10)
- `src/data/swiss-data.ts` (61) — attention labels UI seulement, PAS les codes techniques

## Règles préservées
- StoreKit paywall : `iap.purchase()` inchangé, `startTrial()` neutralisé, prix Apple dynamiques
- Product IDs : `com.budgy.ch.budgy.monthly` / `com.budgy.ch.budgy.annual`
- Version 3.9.0 · Build 73 · iPad maxWidth 560
- Supabase URLs prod : `https://supabase.budgy.ch` + `https://api.budgy.ch`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` toujours via EAS environment
