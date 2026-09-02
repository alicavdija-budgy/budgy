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

---

# Session Build 81 (juin 2026) — Restore StoreKit + already-owned + reset password

## Baseline
- Workspace resynchronisé sur GitHub `origin/main` @ `1406cee41fa96f9f502842d2b82302386701c4e2` (Build 80, protections auth intactes).
- Commit local créé : `2af3aaf0` — "fix: real StoreKit restore, already-owned recovery and public reset redirect (build 81)". **PUSH EN ATTENTE** (pas de credentials GitHub dans ce fork — utiliser "Save to GitHub").

## Bugs TestFlight corrigés (Build 80 → 81)
1. **Restore = "Aucun abonnement actif"** : `getAvailablePurchases()` était appelé SANS synchronisation StoreKit préalable. Fix : `syncNativeTransactions()` (RNIap.syncIOS / AppStore.sync, fallback restorePurchases) avant lecture, via `getAvailableReceipts({ syncFirst: true })`.
2. **"Achat échoué – Item already owned"** : le code brut StoreKit remontait à l'UI. Fix : `isAlreadyOwnedError()` (exclut user-cancelled) + réconciliation partagée `reconcileEntitlements()` dans useIAP — même logique que le bouton Restore (sync Apple → filtre SKUs Budgy → /api/iap/restore → confirmPro si valide → finishTransaction). Jamais de ré-entrée dans purchase() (pas de boucle).
3. **Transactions bloquées** : les reçus restaurés validés par le backend sont maintenant `finishTransaction()`és → plus de re-déclenchement already-owned.
4. **Edge case** : un reçu EXPIRED ne peut plus annuler un abonnement actif restauré dans la même passe (cancel seulement si restored === 0).
5. **pro.tsx** utilisait des clés i18n mortes `paywall.restore*` → corrigé vers `iap.restore*`.
6. **Reset password** : redirect centralisé dans `src/lib/authRedirects.ts` — production = `budgy://reset-password`, jamais supabase-kong/localhost. `forgot-password.tsx` utilise le helper.
7. **UX (FR/EN/DE/IT)** : "Abonnement restauré" / "Votre abonnement Budgy Pro a été restauré avec succès." / "Aucun abonnement Budgy actif n'a été trouvé sur ce compte Apple." / "Achat impossible" + "Une erreur est survenue avec l'App Store. Veuillez réessayer.". Aucun code technique (missing_token, Item already owned…) n'atteint l'UI.

## Sécurité préservée (vérifiée par tests)
- Preflight Supabase avant StoreKit (purchase + restore) : intact.
- Validation backend obligatoire avant confirmPro : intacte.
- startTrial()/purchase() locaux : toujours NO-OP. 1 seul `isPro: true` (confirmPro).
- Chemin provisionnel borné : NON élargi (2 chemins, transient uniquement, jamais auth).
- Guard auth Build 80 (supabase_config_missing → service unavailable) : intact.
- Aucun token/reçu/JWS loggé.

## Environnement local (fork) — IMPORTANT
- `package-lock.json` (committé) épingle `react-native-iap@15.2.0` (qui contient `app.plugin.js`). Le node_modules local avait 15.6.2 (sans plugin) → `expo start` crashait. Fix local : node_modules/react-native-iap remplacé par 15.2.0 exact (aucun changement de package.json/lockfile). Les API utilisées (syncIOS, restorePurchases, getAvailablePurchases, fetchProducts, ErrorCode "already-owned") existent en 15.2.0 (typecheck OK).
- `npm ci` échoue sur ce lockfile (entrées binaires optionnelles manquantes) — ne pas s'en servir ici.

## Tests Build 81
- `test:iap-restore` (NOUVEAU) : **34/34**
- `test:iap-v15` : **31/31** (assertions build 81)
- `test:auth-production` : **11/11** — `test:cloud-auth` : **15/15**
- `test:premium` 45/45, `test:pro-gating` 49/49, `test:savings-tier` 22/22, ai-optimizer PASS
- TypeScript strict PASS, ESLint PASS, i18n parity PASS
- Backend pytest : **144 passed / 1 skipped**

## Build
- iOS buildNumber 80 → **81**, Android versionCode 80 → **81** (version marketing 3.9.0 inchangée).

## À faire (utilisateur)
1. Pousser le commit `2af3aaf0` sur GitHub main (Save to GitHub).
2. Lancer le Build 81 EAS manuellement (jamais par l'agent).
3. TestFlight : reset password, achat mensuel/annuel, restore, compte already-owned, logout/login + restore, réinstallation + restore.
4. Côté Supabase self-hosted : vérifier que `budgy://reset-password` est dans la liste des Redirect URLs autorisées.

---

# Session hotfix "suppressions cloud persistantes" (sept. 2026) — commit dd1732a1

## Bug corrigé
Suppression d'une dépense/facture/charge récurrente → disparaît localement mais revient au relaunch (la ligne Supabase survivait car pushAllToCloud est upsert-only et pullAllFromCloud remplace les tableaux locaux).

## Correctif
- NOUVEAU `src/services/cloudDelete.ts` : deleteFromCloud(table, id) + deleteEntityWithCloud — whitelist typée (transactions/invoices/recurring_expenses), user_id UNIQUEMENT depuis la session, DELETE .eq(id).eq(user_id).select('id'), vérification idempotente si 0 ligne, garde anti double-tap (Set + finally).
- Ordre cloud-first pour utilisateur connecté : Zustand supprimé APRÈS confirmation cloud. Mode local (pas de session) : suppression locale directe inchangée. proExpenses inchangées (non synchronisées).
- Écrans modifiés : (tabs)/expenses.tsx, more/invoices.tsx (rappels annulés seulement après succès), more/recurring.tsx. Actions Zustand inchangées (synchrones).
- i18n : nouveau namespace `cloudDelete` (failedTitle/failedBody) FR/EN/DE/IT.
- NOUVEAU test `scripts/test-cloud-delete.mjs` (18 checks, comportemental via transpilation TS + contrats statiques) — lancé via `node scripts/...` (package.json protégé, pas de nouveau script npm). Ajouté au Pre-build Quality Gate.
- NOUVEAU workflow manuel `.github/workflows/eas-update.yml` (workflow_dispatch only, channel preview/production whitelisté, message obligatoire, gate qualité + guard identité Build 82 + expo-updates + URL EAS, seule commande de déploiement = `eas update`). NON lancé.

## Protections Build 82 — INTACTES
app.json / eas.json / package.json / package-lock.json inchangés. Version 3.9.0, build iOS 82, versionCode 82. Aucun eas build/submit/update exécuté. Aucun secret ajouté.

## Validations
tsc PASS, check:i18n + audit:i18n PASS, premium 45/45, pro-gating 49/49, savings-tier 22/22, cloud-auth 15/15, ai-optimizer 62/62, iap-v15 32/32, iap-restore 35/35, auth-production 11/11, test-cloud-delete 18/18, expo config public OK.
`npm ci --legacy-peer-deps` : ÉCHOUE avec npm 11 local (entrées optionnelles absentes du lockfile, strictness npm 11) mais PASSE avec npm@10 (= Node 20 de la CI GitHub) → lockfile valide pour la CI, ne pas régénérer.

## PUSH EN ATTENTE
Commit local `dd1732a1` sur main (base edfd866f). Pas de credentials GitHub dans ce fork → l'utilisateur doit pousser via "Save to GitHub". Le push déclenchera le Pre-build Quality Gate (normal). Ne PAS lancer EAS Build ni EAS Update.

## Durcissement défensif cloudDelete (commit de73b8af)
- Client Supabase indisponible alors que configuré → échec `client_unavailable` (pas de suppression locale).
- getSession() qui lève → échec `session_error` (jamais assimilé à "pas de session").
- Mode local seulement si non configuré OU getSession() confirme session === null (session sans user.id → session_error).
- test-cloud-delete : 21/21. Toutes les autres suites re-passées vertes. Fichiers protégés intacts.
- PUSH EN ATTENTE : commits dd1732a1 + de73b8af à pousser via "Save to GitHub".
