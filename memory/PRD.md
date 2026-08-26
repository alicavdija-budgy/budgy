# Budgy — PRD v3.9.0 build 73 — Passe corrective i18n stricte

## Contexte
- **Rejet précédent**: Le rapport initial « USER_VISIBLE = 0 » était faussement rassurant car `@i18n-technical-file` était utilisé sur des vrais écrans utilisateurs pour masquer les résidus.
- **Version cible**: 3.9.0 / Build 73 maintenus (aucun incrément).

## Correctif du script d'audit
`scripts/audit-i18n.mjs` réécrit avec règles strictes:
- La directive **`@i18n-technical-file` est INTERDITE sous `app/**`** (routes/écrans utilisateur).
- Autorisée UNIQUEMENT sous les racines back-office `src/data/`, `src/lib/`, `src/services/`, `src/utils/`, `src/i18n/`.
- Sous `app/**`, seules les annotations LIGNE `// i18n-technical` sont acceptées.
- Toute directive fichier illégale est signalée dans `IGNORED_DIRECTIVES` et le fichier est SCANNÉ NORMALEMENT.
- **Self-test intégré**: `node scripts/audit-i18n.mjs --self-test` couvre 4 fixtures (dont l'exemple critique demandé: fichier `app/*.tsx` avec `@i18n-technical-file` + texte français ⇒ USER_VISIBLE détecté).

## Résultats audit
- **Avant correctif**: USER_VISIBLE=79, REVIEW_MANUALLY=45, IGNORED_DIRECTIVES=25.
- **Après correctif**: **USER_VISIBLE=0, REVIEW_MANUALLY=0, IGNORED_DIRECTIVES=0**.
- Fichiers corrigés: 30 (voir ci-dessous).

## Écrans traités
Tous ces écrans avaient `@i18n-technical-file` supprimé et leurs strings traduits:

| Écran | Traduit | Notes |
|---|---|---|
| `expenses.tsx` | ✅ | EditFields, dates locale-aware (DATE_LOCALES[lang]), catégories via `categoryLabels.*`, paiements via `paymentMethods.*` |
| `savings.tsx` | ✅ | EditFields, deleteConfirm, placeholder |
| `add-receipt-manual.tsx` | ✅ | Titre, Type, Commerce, Montant, Date (locale-aware), Catégorie, Moyen de paiement, Note, Pièce jointe, Alerts, Permissions |
| `budgets.tsx` | ✅ | Catégories, EditFields, emptyState, deleteConfirm, ratio-suffix |
| `group-detail.tsx` | ✅ | emptyState, placeholders, CTA |
| `incomes.tsx` | ✅ | INCOME_TYPES → labelKey, FREQUENCIES → labelKey, alerts, CTA |
| `investments.tsx` | ✅ | EditFields, exemples ETF (Vanguard/iShares annotés technical brands) |
| `lamal-subsidy.tsx` | ✅ | HOUSEHOLD_OPTIONS → labelKey |
| `lamal-comparator.tsx` | ✅ | Canton label, anonInsurer, canton names locale-aware via `getCantonName(code, lang)` |
| `legal/index.tsx` | ✅ | CGU/Terms/Licenses subtitles |
| `legal/licenses.tsx` | ✅ | OSS library names annotées `i18n-technical` (proper nouns) |
| `legal/support.tsx` | ✅ | FAQ title |
| `notifications.tsx` | ✅ | Empty state |
| `siri-assistant.tsx` | ✅ | Exemples via `siriAssistant.example1..5` + `voiceExample`, deep-link URLs annotées technical |
| `tax-optimizer.tsx` | ✅ | CTA calcul, edit situation, error, placeholder |
| `debug-network.tsx` | 🟡 Partiel | Écran gated `__DEV__` uniquement — labels dev diagnostiques annotés `i18n-technical`, boutons user-facing traduits |
| `+html.tsx` | 🟡 | Meta viewport annoté `i18n-technical` (pas d'UI text) |
| `onboarding.tsx` | ✅ | Canton name via `getCantonName(code, lang)` |

## Composants corrigés (directive retirée)
- `EntityActionsSheet.tsx`: cancel/delete/edit + defaultDeleteConfirmTitle/Message via useTranslation.
- `EntityEditModal.tsx`: switch on/off + submitLabel via useTranslation (via `common.*`).
- `LanguageOnboardModal.tsx`: welcomes multilingues annotés ligne par ligne `// i18n-technical` (samples intentionnels).
- `VoiceInputModal.tsx`: mic permission, expense label, dictation buttons.
- `CornerEditor.tsx`: alerts, header, buttons.
- `BudgyAIButton.tsx`: accessibilityLabel via `budgyAI.title`.
- `AITimeline.tsx`: PRETTY → { key, tip } + `resolveCat(params)` traduit `cat` via `categoryLabels.*`.

## Hooks et stores
- `useIAP.ts`: directive retirée; erreurs via `useTranslation()` (`iapErrors.*`).
- `usePremiumStore.ts`: directive retirée; console.warn annotés `i18n-technical`.
- `src/lib/authErrors.ts`: garde `@i18n-technical-file` (autorisé sous `src/lib/` — matchers Supabase internes).
- `src/services/security.ts`: garde `@i18n-technical-file` (autorisé sous `src/services/`).

## Data files (autorisés sous `src/data/`)
- `swiss-data.ts` conserve `@i18n-official-data`; **aucune modification métier** (codes cantons, taux, primes LAMal, franchises intacts).
- Nouveau helper `getCantonName(code, lang)`: retourne `nameDE` pour DE, `name` (FR) sinon.
- `getCategoryName(id, t?)` inchangé — résout via `categoryLabels.*` si t fourni.

## Nouveaux namespaces i18n (parité FR/EN/DE/IT)
`entitySheet`, `expensesScreen`, `savingsScreen2`, `addReceipt`, `budgetsScreen`, `incomesScreen`, `investmentsScreen`, `lamalSubsidyScreen`, `legalScreen`, `taxOptimizer`, `cornerEditor`, `voiceInputModal`, `budgyAI`, `iapErrors`, `lamalComparator`, `debugNetwork`, `common` (étendu), `categoryLabels`, `paymentMethods`, `franchiseLabels`, `savingsTemplates`, `currencies`, `lockScreen`, `authExtra` — 85 namespaces au total, 1962 clés × 4 langues.

## eas.json restauré
- `environment: "development"` / `"preview"` / `"production"` réintroduits.
- URLs Supabase/API `https://api.budgy.ch` + `https://supabase.budgy.ch` conservées.
- Aucune clé `EXPO_PUBLIC_SUPABASE_ANON_KEY` hardcodée — vient de l'environnement EAS.
- Aucune `service_role`/`SUPABASE_SERVICE_ROLE_KEY` dans le repo.

## Apple / StoreKit inchangés
- `iap.purchase(selected)` reste seule voie d'activation Pro (paywall.tsx).
- `iap.restore()` intact.
- `usePremiumStore.startTrial()` reste neutralisé (`console.warn` no-op).
- `setPro(true)` callsites restants dans `app/auth.tsx`:
  - L75 `if (isPro) setPro(true)` — miroir du back-end (StoreKit validé côté serveur).
  - L176 dans `handleDemoMode()` — mode démo `isDemo: true` uniquement, jamais un compte réel.
- Product IDs `com.budgy.ch.budgy.monthly` / `com.budgy.ch.budgy.annual` intacts.
- Version 3.9.0 / Build 73 maintenus.
- iPad `maxWidth: 560` inchangé.

## Prochaines actions
1. Tests multilingues via `testing_agent` FR → EN → DE → IT (à ne PAS lancer avant validation du rapport ci-dessus).
2. Backend AI multilingue (`/api/coach/chat`, `/api/email/parse`, `/api/scanner/ocr`) — passe suivante.
3. INSURERS.desc / strengths dans `swiss-data.ts` restent en FR (LAMal comparator affiche uniquement les cheveux/scores; la desc n'est pas surfacée). Migration optionnelle en v3.9.1 si LAMal compare devient EN/DE/IT.
