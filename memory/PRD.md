# Budgy v3.9.0 build 77 — react-native-iap v15 migration

## Contexte
- Cause réelle du rejet Apple 2.1(b) identifiée : `src/services/iap.ts` appelait `RNIap.getSubscriptions(...)`, une API disparue dans `react-native-iap` 15.x → retournait toujours `[]` → paywall sans produits.
- Le Build 76 (retry doux sur `PRODUCTS_NOT_FOUND`) ne suffit pas : il fallait migrer vers l'API v15 pour que StoreKit renvoie vraiment les abonnements.
- Le Build 76 reste en place non soumis. Le prochain build est **3.9.0 (77)**.
- AUCUN `eas build` / `eas submit` lancé par l'agent — action manuelle utilisateur.

## Migration StoreKit v15
- `react-native-iap` installé : **15.6.2** (Nitro / OpenIAP).
- Ancienne API supprimée : `getSubscriptions({ skus })`, `requestSubscription({ sku, andDangerouslyFinishTransactionAutomaticallyIOS })`.
- Nouvelle API v15 utilisée : 
  - `initConnection()` / `endConnection()`
  - `fetchProducts({ skus, type: 'subs' })` → `ProductSubscription[]`
  - `requestPurchase({ request: { apple: { sku, ... } }, type: 'subs' })` — événementiel
  - `purchaseUpdatedListener` + `purchaseErrorListener` (pont Promise interne dans `iap.ts`)
  - `finishTransaction({ purchase, isConsumable: false })` avec le `Purchase` brut natif
  - `getAvailablePurchases()`
- Mapping v15 → `IapProduct` interne : `id → productId`, `displayPrice → localizedPrice`, `price:number → price:string`, intro-offer normalisé via `subscriptionOffers[type='introductory', paymentMode='free-trial']` avec fallback legacy iOS (`introductoryPricePaymentModeIOS = 'free-trial'`).
- Nouveau diagnostic : `OK`, `STOREKIT_UNAVAILABLE`, `INIT_FAILED`, `FETCH_PRODUCTS_FAILED`, `NETWORK_ERROR`, `PRODUCTS_NOT_FOUND`, `MONTHLY_MISSING`, `ANNUAL_MISSING`.

## Règles StoreKit strictes (contrat inchangé)
- Product IDs figés : `com.budgy.ch.budgy.monthly`, `com.budgy.ch.budgy.annual`.
- ZÉRO prix hardcodé (aucun `4.90` / `39.90` dans le code — StoreKit seule source).
- ZÉRO durée d'essai hardcodée (aucun `7 jours` / `1 semaine` — trial détecté uniquement si StoreKit renvoie `paymentMode: free-trial`).
- ZÉRO bypass Premium local (`startTrial` reste no-op, aucun `setPro(true)`).
- Pro activé UNIQUEMENT après validation backend (`/api/iap/validate`, `/api/iap/me`).

## Fichiers modifiés
- `frontend/src/services/iap.ts` (réécriture complète, migration v15)
- `frontend/src/hooks/useIAP.ts` (transmission `androidOfferToken` à `requestSubscription`)
- `frontend/app/paywall.tsx` (helpers intro-offer → nouveau champ `introOffer`)
- `frontend/app.json` (buildNumber 77, versionCode 77, version 3.9.0)
- `frontend/package.json` (script `test:iap-v15`)
- `frontend/scripts/test-iap-v15.mjs` (34 assertions — contrat migration v15)

## Tests
- TypeScript strict : **PASS** (0 erreur)
- i18n check : **2028 clés × 4 langues** PASS
- i18n audit : **0 USER_VISIBLE** hardcoded
- `test:premium` : **48/48**
- `test:pro-gating` : **49/49**
- `test:savings-tier` : **22/22**
- `test:cloud-auth` : **14/14**
- `test:ai-optimizer` : **62/62**
- `test:iap-v15` : **34/34** (fetchProducts, mapProduct, intro-offer, cancel/error, restore, listener bridge, ZÉRO bypass, ZÉRO hardcode)
- Backend pytest : **144 passed / 1 skipped**

## App Store Connect (config utilisateur, hors code)
- Monthly `com.budgy.ch.budgy.monthly` — CHF 4.90, 1 mois, pas d'offre intro
- Annual `com.budgy.ch.budgy.annual` — CHF 39.90, 1 an, offre intro Free Trial 1 semaine (illimitée, 175 régions)
- Les prix et durées de trial doivent rester configurés côté ASC — le code lit tout via StoreKit.

## GitHub
- Commit local : `af326a8a48f97a638149dd169fc21360945f4f71`
- Message : `fix: migrate StoreKit integration for build 77`
- ⚠ Aucun remote configuré dans ce workspace. Push vers `alicavdija-budgy/budgy@main` à faire par l'utilisateur via le bouton "Push to GitHub" d'Emergent.

## Ne PAS générer de build
- Le Build 77 doit être lancé manuellement par l'utilisateur (portail Emergent Publish → EAS iOS production).
- **AUTO-SUBMIT = NO**. Aucune soumission App Review avant test TestFlight.
