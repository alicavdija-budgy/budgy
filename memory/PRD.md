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

## Session SEO site web budgy.ch (commit 7e807012) — SITE UNIQUEMENT
- Refonte SEO complète de frontend/public/ (landing + 6 pages piliers FR + hub /fr/guides + 9 guides + homepages DE/EN/IT traduites + robots.txt + sitemap.xml + 404.html + CSS partagé site-v1.css + générateur scripts/gen-website.mjs).
- Liens App Store corrigés (étaient href="#") → https://apps.apple.com/ch/app/budgy/id6767026949 partout.
- canonical/hreflang/JSON-LD/OG sur toutes les pages ; delete-account en noindex ; redirect 301 /landing → /.
- AUCUN fichier de l'app mobile modifié. Validé localement via npx serve (tous 200, 404 réel, 0 lien cassé, titles/desc/H1 uniques, JSON-LD valide).
- PUSH EN ATTENTE via "Save to GitHub" (commits de la session précédente déjà poussés par l'utilisateur ; nouveau commit 7e807012 local).
- Après déploiement : soumettre https://budgy.ch/sitemap.xml dans Google Search Console.

## Session Budgy Smart 4.0 — Phase 1 (branche budgy-smart-4.0, main INTACTE)
- Audit : workspace = GitHub main fecf80038, aucune divergence.
- Commit b2ba6115 : FIX CRITIQUE notifications — scheduleMonthlyReminder() effaçait TOUTES les notifications programmées (rappels contrats J-90/30/7/1) à chaque démarrage. Identifiants fixes + test-notifications.mjs (4/4).
- Commit dd6e9530 : Menu Plus en 5 rubriques premium (Mes finances / Mes documents / Intelligence & projets / Services suisses / Compte & réglages) via FEATURE_CATEGORIES + écran /more/category/[id] (réutilise MenuList exporté de more.tsx). Toutes routes et droits Free/Pro conservés. i18n moreHub.* ×4 langues. Validé visuellement (mode démo) + tsc + lint + i18n + 9 suites de tests vertes.
- Essai 7 jours (Étape 3) : CODE DÉJÀ PRÊT (paywall affiche introOffer StoreKit). Action UTILISATEUR : App Store Connect → Abonnements → SKU com.budgy.ch.budgy.annual/.monthly → Offre d'introduction → Gratuit 1 semaine.
- RESTANT (phases non réalisées, à prioriser) : refonte visuelle accueil/dépenses/épargne (gros chantier, design_agent recommandé), centre d'alertes (préférences par catégorie + heures silencieuses, sources Internet derrière flag), Budgy Twin (simulateur déterministe "puis-je me le permettre"), alertes serveur planifiées (OFSP/AFC/TCS).
- AUCUN déploiement, OTA, build ni modification App Store effectués. PUSH de la branche via "Save to GitHub" par l'utilisateur.

## Session Budgy Smart 4.0 — Phase 2 (branche budgy-smart-4.0)
- Étape 0 : GitHub main vérifié en direct = adcdc63c (phase 1 incluse). Branche locale budgy-smart-4.0 = main + commits phase 2. AUCUN reset/force-push. Push de branche impossible depuis le pod (pas de credentials) — Save to GitHub pousse vers main ; procédure backup-phase1 communiquée à l'utilisateur.
- Commit 9bea1533 : refonte premium — Accueil (œil masquage montants persisté AsyncStorage 'budgy.hideAmounts', comparaison % vs mois précédent honnête via snapshot décalé, section Dernières opérations, actions rapides Dépense/Scanner/Dicter/Économiser avec VoiceInputModal depuis l'accueil, Score déplacé en bas) ; Dépenses (sélecteur mensuel ‹›, total du mois, chips catégories, liste groupée par jour avec totaux) ; Épargne (carte résumé dégradé gradientHero si objectifs) ; AIMenuModal (3 actions prioritaires + séparateur PLUS D'OUTILS) ; Budgy Twin BETA gratuit (/more/twin, src/services/twinSimulator.ts déterministe lecture seule sur getMonthlyFinancialSnapshot, verdict oui/juste/déconseillé, toggle préserver épargne, breakdown, disclaimers) + scripts/test-twin.mjs 15 checks + rubrique Intelligence.
- Commit 4d87c72a : fixes itération tests — parseTxDate niveau module (crash TDZ), window.confirm sur web pour suppressions (EntityActionsSheet + savings ; natif inchangé), badge BETA propre dans MenuList, paymentMethods twint/apple_pay/postfinance/google_pay/samsung_pay ×4 langues, interpolation {{n}} twin, 2 décimales + singulier '1 élément' dépenses, minWidth/outline web champ Twin.
- Tests : iteration_19 (30/34) puis iteration_20 = ALL PASS. 10 suites de garde vertes + tsc + eslint + i18n ×4.
- Validations restant sur iPhone réel (hors web preview) : haptics, long-press natif, Alert natif, VoiceInputModal micro, scanner caméra, notifications, StoreKit essai 7 jours (après config App Store Connect).
- RESTANT (phases futures) : centre d'alertes (préférences par catégorie + heures silencieuses, sources externes derrière flag), harmonisations visuelles complémentaires, alertes serveur. PAS de build/OTA/soumission sans autorisation.

## Session Budgy Smart 4.0 — Phase 3 (branche budgy-smart-4.0 = remote GitHub vérifiée sur 8fef4146)
- Étape 0 : branche distante budgy-smart-4.0 CONFIRMÉE sur GitHub (ls-remote) pointant 8fef4146 (= main, phases 1+2). Travail local sur cette branche, main intacte.
- Commit 01554e45 : FIX Twin — disponible recalculé depuis les composantes brutes (revenus−payés−récurrents−factures), sans écrêtage Math.max(0,..) du moteur mensuel (moteur selectors.ts NON modifié) → déficit préexistant visible, détail==total exact. test-twin.mjs réécrit : import réel via strip TS + data-URL, 18 comportements numériques (excédent, déficit, achat>budget, épargne on/off, données manquantes, 0/NaN/négatif/limites, cohérence breakdown) = 30/30.
- Commit 6d75e850 : BUDGY ALERTS — useAlertsStore (persist 'budgy-alerts-storage') : prefs 5 catégories (contracts/budget/invoices + fuel/news préparées désactivées), heures silencieuses (déf. 22-7), fréquence normal/réduite (1/jour/cat), confidentialité lock screen (montants masqués PAR DÉFAUT), historique dédupliqué max 50. alertsEngine déterministe (dépassement engagements>revenus, hausse +30% min base 100, factures ≤7j/retard, ids stables). notifications.ts gated par prefs (budget: quiet hours + anti-répétition mensuelle AsyncStorage ; échéances: contracts/invoices ; LAMal sous contracts, mensuel sous budget ; montants jamais sans opt-in). Écran notifications.tsx reconstruit premium (feed + legacy notifications, préférences, presets, segmented). EXTERNAL_ALERTS_ENABLED=false dans features.ts. test-alerts.mjs.
- Commit a368fda6 : fixes itération 21 — parseFlexibleDate exporté (DD.MM.YYYY + ISO en dates LOCALES, partagé avec notifications.ts), calendarDaysUntil (jours calendaires exacts), resolveMissing (alertes obsolètes auto-lues si facture payée/supprimée), 'Tout lire' inclut notifications héritées, sous-titre confidentialité dynamique, dates localisées, chips 44pt. test-alerts 30/30. Vérifié e2e : facture suisse 31.10.2026 → alerte '3 jour(s)' exacte.
- Étude sources externes (livrée en texte, RIEN développé) : OFSP/Priminfo (primes LAMal, données publiques, gratuit, annuel), ESTV/admin fiscales cantonales (barèmes publics, annuel), TCS (prix carburant, PAS d'API publique gratuite — licence à négocier ou alternative comparis/API payante). Recommandation : cron serveur + cache partagé, AUCUN appel par utilisateur. Flag reste false.
- Restant : activation sources externes (après validation licences/coûts par l'utilisateur), harmonisations visuelles mineures, validations iPhone réel (notifications OS, StoreKit essai 7j).

## Session Budgy Smart 4.0 — Phase 4 (branche budgy-smart-4.0, remote vérifiée f604b80c, main 8fef4146 intacte)
- Isolation Budgy Alerts par compte : useAlertsStore v2 scopé (guest/demo/user:<id>), migration non destructive v2, alertes jamais partagées entre comptes, prefs appareil en graine. alertsScope.ts (subscribe useStore.user) initialisé dans _layout. 'Supprimer mes données' purge le scope + rappels.
- Hygiène rappels OS : cancelAllEntityReminders() ciblé (clés budgy_notif_ids_*) appelé au logout ; facture marquée payée → rappels annulés, repassée à payer → reprogrammés (invoices.tsx). recurring.tsx ne programme AUCUN rappel (pas d'orphelin possible) ; contrats add-only (pas de suppression UI → pas d'orphelin).
- Tests : test-alerts 38/38, test-notifications 7/7, 12 suites + tsc + eslint + i18n verts. Migration v2 validée en preview (aucun crash, scope demo vide = isolation démontrée).
- IAP/essai 7j : suites iap-v15 32/32 + iap-restore 35/35 + premium 45/45 + pro-gating 49/49 (pas de Pro local, restore/already-owned OK). Paywall affiche introOffer (durée+prix après essai) — seule action restante : créer l'offre introductive 7j dans App Store Connect (manuel, utilisateur).
- EAS vérifié NON modifié : bundle com.budgy.ch.budgy, v3.9.0 build 82, profils development/preview/production + submit (ascAppId 6767026949). Pour TestFlight il faudra incrémenter buildNumber (sur autorisation uniquement).
- À valider sur iPhone réel : notifications OS (programmation, heures silencieuses, confidentialité lock screen), permissions, caméra/OCR, voix, auth+sync reconnexion, achats/restauration/essai, logout entre 2 comptes réels.

## Session Budgy Smart 4.0 — Phase 4.1 (dernier correctif avant TestFlight, branche budgy-smart-4.0 @ 8ef31aa0 + commit local)
- FIX ordre critique « Supprimer mes données » : clearActiveScope AVANT clearAllData (sinon le reset user bascule le scope sur guest et on purge le mauvais scope). Tests comportementaux réels du store (creator zustand importé via strip) : isolation A/B, suppression A laisse B intact — test-alerts 49/49.
- Migration v2 durcie : les anciennes alertes (noms de factures) ne sont JAMAIS migrées (alerts:[]) — prefs seules migrées ; les alertes sont régénérées par le moteur pour le bon compte.
- Paywall honnête : checkIntroEligibilityIOS (RNIAP v15 isEligibleForIntroOfferIOS par subscriptionGroupIdIOS, nouveau champ IapProduct) → bannière essai masquée si Apple confirme non-éligible ; null (web/Android/indéterminé) = comportement actuel, feuille Apple autoritaire.
- Build iOS 83 préparé (app.json ios.buildNumber='83' UNIQUEMENT ; version 3.9.0, bundle, prix, Android versionCode 82 inchangés). Suites test-iap-v15 et test-auth-production mises à jour (83). EAS production vérifié : distribution store, channel production, image latest — build ≠ OTA (eas update séparé, workflow manuel). AUCUN build/submit/OTA lancé.
- Commandes TestFlight (à lancer PAR L'UTILISATEUR depuis frontend/ sur la branche budgy-smart-4.0) : npx eas build --platform ios --profile production ; puis npx eas submit --platform ios --latest (profil submit ascAppId 6767026949 déjà configuré).
test

## Session TestFlight 83 (branche budgy-smart-4.0, commit 7401b85c)
- Paywall iOS : essai annonce UNIQUEMENT si introEligible === true (StoreKit) ; chargement/indetermine = offre standard prix exact ; cache par subscriptionGroup ; Android inchange.
- eas.json : profil build testflight (extends production, channel testflight separe, OTA production jamais livrees) + submit.testflight. Production intact. Build iOS 83 / v3.9.0 confirmes. test-alerts 56/56.
- Commandes : npx eas build --platform ios --profile testflight ; npx eas submit --platform ios --profile testflight --id BUILD_ID. AUCUN build/submit/OTA lance.

## Session Bento Premium (branche budgy-smart-4.0 @ eed48b4c, commit f4621824)
- Ecran Plus transforme en tableau de bord bento (nouveau src/components/BentoPlus.tsx + header reecrit dans more.tsx) : header salutation+cloche alertes (compteur non-lu reel)+avatar, hero FinancialHealthScore (moteur reel), carte Epargne pleine largeur, duo Budgets/Charges fixes, carte LAMal violette texte NEUTRE, duo Revenus/Factures, pastilles outils (FEATURE_BY_ID, locks Pro -> /pro), carte Pro discrete, rangee reglages, hub 5 rubriques CONSERVE (exports MenuList/makeStyles/SAVINGS_ROUTE intacts pour category/[id]).
- Donnees 100% reelles (snapshot, goals saved/target, budgets restant, factures pending, prochaine echeance) ; etats vides elegants ; masquage budgy.hideAmounts respecte ; i18n plusV2 x4 ; valide 390px + 320px clair/sombre.
- ACCUEIL ANIME NON TOUCHE (critere absolu). Fichiers Claude = reference visuelle seulement.
- Idees Claude NON integrees (avec raisons) : prevision fin de mois (risque double comptage avec recurrents, a specifier), serie de jours (jour sans donnees != reussite), simulateur epargne (a integrer plus tard dans Epargne, doublon partiel Budgy Twin), pilier 3a (plafond officiel/situation prevoyance manquants, pas de chiffres fictifs), categorisation intelligente (memorisation correction = phase dediee + isolation comptes), resume hebdo (backlog), widgets/Siri/Dynamic Island (integration native, phase ulterieure).

## Session Finalisation TestFlight 83 (commit ci-dessus, base 68c76dde)
- Masquage montants reactif : BentoPlus relit budgy.hideAmounts a chaque focus (useFocusEffect) + cache anti-flash ; Accueil->Plus->Accueil teste statiquement ; index.tsx NON modifie.
- Droits Pro harmonises sur usePremiumStore.hasPremiumAccess() (couvre acces provisoire StoreKit) dans BentoPlus et more.tsx.
- Charges fixes : rollover mois suivant + clamp 29/30/31 (src/services/bentoMetrics.ts, pur, teste) ; factures en retard affichees explicitement (plusV2.overdue x4).
- scripts/test-bento.mjs : 36/36 ; 12 suites de garde + tsc + eslint + i18n verts ; captures Accueil + Plus OK.
- Config TestFlight verifiee sans modification : 3.9.0 / build 83 / bundle com.budgy.ch.budgy / profil eas testflight (canal distinct) + submit.testflight.
- ATTENTION : le profil testflight pointe sur backend/Supabase de PRODUCTION (api.budgy.ch, supabase.budgy.ch) -> tester avec un compte dedie, aucune action destructive sur compte reel ; isolation serveur a envisager si tests intensifs.

## Session Derniere etape avant TestFlight (base 8cc3265c)
- Confidentialite durcie : lastKnownHide initialise a null + maskAmount(value, hide) pure (reel UNIQUEMENT si hide===false) => montants masques par defaut tant que budgy.hideAmounts n est pas hydrate (premier demarrage, redemarrage, changement de compte). Valide e2e navigateur : oeil Accueil -> Plus masque instantanement -> demasquage propage.
- test-bento.mjs : 40/40 (tests comportementaux reels de maskAmount inclus) ; 12 suites + tsc + eslint + i18n verts.
- Config verifiee inchangee : 3.9.0 / build 83 / com.budgy.ch.budgy / logo / profil eas testflight (canal distinct) / StoreKit & Pro intacts / main intacte.
- Commandes TestFlight fournies SANS --latest (selection par BUILD_ID exact) ; rappel : profil testflight = backend/Supabase de PRODUCTION, compte de test dedie obligatoire.

## Session CI TestFlight (base dd3df160)
- Echec build GitHub Actions n35 : Apple 403 "PLA Update available" -> le titulaire du compte Apple Developer doit accepter le License Agreement sur developer.apple.com (action manuelle, aucun contournement tente).
- .github/workflows/eas-build.yml : profil testflight ajoute et par defaut (recommande tests iOS), production/preview/development conserves, declenchement manuel uniquement, submit=false par defaut ; si submit=true -> attend la fin, verifie status FINISHED, soumet le binaire EXACT via --id (plus jamais --latest), refuse platform=all.
- Aucun code applicatif touche ; YAML valide + coherence eas.json verifiee ; aucun build/submit/OTA lance.

## Session Fix EAS iOS image (base 1c897110, commit ad1215b5)
- Build iOS post-PLA echouait dans Xcode : production ios.image=latest => Xcode 27.1, incompatible Expo SDK 54.
- Correctif minimal : profil testflight epingle ios.image=sdk-54 avec bloc ios complet replique (simulator:false, resourceClass m-medium) car extends EAS REMPLACE les objets de premier niveau (pas de fusion profonde).
- production/canaux/distribution store/submit (appleId, ascAppId)/bundle/logo/ShareExtension/StoreKit/Supabase/Pro inchanges ; tsc + i18n + tests iap/bento verts ; aucun build lance.
- Si un futur echec persiste malgre sdk-54 : recuperer la PREMIERE erreur dans la section "Run fastlane"/xcodebuild des logs expo.dev (ignorer les warnings de deployment target), probablement liee a ShareExtension ou a un pod.

## Session Bump 3.9.1 (84) (base 9bcc9c8d)
- Refus Apple build 83 : ITMS-90062 (version non superieure) + ITMS-90186 (train TestFlight 3.9.0 ferme) -> app.json passe a version 3.9.1 / buildNumber 84 ; ShareExtension herite automatiquement (expo-share-intent, prebuild) ; bundle/signature/SDK54/image sdk-54/canaux/dependances intacts ; Android 82 intact.
- Tests de garde mis a jour (3.9.1/84) ; 12 suites + tsc + i18n verts ; aucun build lance.
- Impossible de verifier depuis le pod si Apple a deja recu 3.9.1(84) : si refus identique, incrementer buildNumber seulement (85).

## Session Integration native iOS (widgets/Siri/QR/LAMal) — commits a51a5374, 8f930c6a + final
- WIDGETS iOS reels (@bacons/apple-targets v5, SDK 54) : cible BudgyWidget (petit/moyen/ecran verrouille, identite noir encre + menthe, liens budgy://quick-add et budgy://scanner-modal, indicateur obsolescence 36h) + cible BudgyIntents (App Intents : AddExpense/GetBudget/ScanBill/Open + raccourcis Siri FR). App Group group.com.budgy.ch.budgy dans les 4 cibles (verifie par prebuild --clean reel). ios/ gitignore (CNG).
- CONFIDENTIALITE : aucun fallback .standard, aucune valeur fictive, verrouille masque par defaut, montants Siri opt-in, purge logout/suppression/changement de compte, aucun jeton partage, file Siri persistante retiree UNIQUEMENT apres sauvegarde confirmee (anti-doublon persistant). Pont RN src/services/widgetBridge.ts (moteur snapshot existant), WidgetSync dans _layout, ecran reglages /more/widgets-settings (catalogue features), /quick-add etendu (pid).
- QR-FACTURES SUISSES : src/services/qrBill.ts conforme SIX 2.3 (QRR mod10/QR-IBAN, SCOR mod97, NON, CHF/EUR, adresses S+K), integre au scanner-modal existant (scan QR live -> Controler -> Corriger -> Confirmer -> addInvoice ; doublons avertis ; AUCUNE echeance inventee ; aucun paiement bancaire). test-qrbill 33/33.
- LAMAL : primes open data 2027 PAS ENCORE publiees (verifie opendata.swiss, s arrete a 2026) -> bloc Sources/limites + delais resiliation AOS (30.11 / 31.03) sur le comparateur (i18n x4) + pipeline scripts/build-lamal-data.mjs pret (validation stricte, refuse les donnees incompletes). Comparateur existant conserve.
- Tests : test-widgets 38/38, test-qrbill 33/33, 14 suites + tsc + eslint + i18n verts. Accueil anime NON modifie (1 ligne : rafraichissement widget au toggle oeil). Swift NON compile ici (Linux) : validation structurelle prebuild seulement -> le build EAS compile ; tester widgets/Siri sur iPhone TestFlight.
- Restant utilisateur : Save to GitHub puis GitHub Actions EAS Build (ios/testflight) ; EAS enregistrera l App Group pour les nouveaux identifiants com.budgy.ch.budgy.widget et .app-intent (credentials geres) ; verifier build number vs App Store Connect.

## Session Finalisation native + LAMal 2027 (base 16a0de1f)
- LAMAL 2027 OFFICIEL INTEGRE : Prämien_CH.csv reel telecharge (opendata.bagnet.ch, 219916 lignes, separateur VIRGULE, Geschäftsjahr 2027/Erhebungsjahr 2026) + Tarife.csv (noms modeles) + registre assureurs (32/32 resolus). build-lamal-data.mjs reecrit (RFC4180, P_OKPCH, sous-groupes E1/J1/K1, seuils reels) -> src/data/priminfo-2027.json (175866 offres, 1596 profils, 755 Ko). Nouveau composant LamalOfficial2027 dans le comparateur (top 20 par profil, modeles officiels, regions, franchises admissibles par age, source affichee). test-lamal 26/26.
- Durcissements : signature WidgetSync par CONTENU (montants/dates/statuts/objectifs), Siri scope strict (unknown jamais enregistre, purge 48h, enqueue Swift refuse sans compte), confirmation idempotente via id deterministe siri_<pid> verifie dans le store (crash entre sauvegarde et registre ne duplique plus), depense Siri jamais requalifiee.
- Build iOS 85 (84 consomme par le build pre-natif). prebuild --clean revalide (4 cibles + App Group).
- EAS DISABLE dans ce pod (politique) : compilation Swift via GitHub Actions uniquement -> Save to GitHub puis Run workflow ios/testflight. 15 suites + tsc + i18n verts.

## Session Design premium 3D (base 714c3fa8)
- 7 illustrations PNG 480x480 integrees en imports statiques (assets/images/premium-tools) ; references full_french_reference utilisees pour le style seulement (titres = i18n x4).
- Nouveau PremiumTools.tsx : grille 2 colonnes (6 outils, bleu nuit + lueur menthe, haptique, FadeInDown, badge BETA, verrou Pro discret, VoiceOver, 1 colonne <340px) + carte Budgy Pro diamant pleine largeur (hasPremiumAccess canonique).
- BentoPlus reordonne : outils -> Pro -> Mon apercu financier -> LAMal 2027 -> reglages ; doublon FinancialHealthScore SUPPRIME de Plus (reference = Accueil, 0 ligne modifiee sur index.tsx, composant conserve).
- test-bento 41/41 ; tsc/eslint/i18n verts ; captures navigateur 390px validees (grille, Pro, apercu, LAMal, Tout Budgy). Natif/Siri/QR/LAMal/EAS intacts, build 85 inchange, aucun build lance.

## Session Reorganisation premium Plus (base d0539d44)
- Budgy Pro desormais PREMIER element de Plus : carte horizontale compacte ~100pt (diamant 62pt, statut exact hasPremiumAccess, chevron), entierement cliquable.
- Cause racine alignement corrigee : PressScale stylait le wrapper Animated.View -> nouveau prop additif contentStyle applique au Pressable (aucun autre ecran impacte).
- Outils en 3 colonnes x 2 rangees, cartes ~122pt, visuels 58pt, badges discrets ; <360px libelle court Calendrier (VoiceOver = titre complet) ; fontScale>=1.4 -> 2 colonnes adaptatives.
- Halos carres sombres retires des 7 PNG par feather radial alpha (r210->237), medaillons/3D preserves.
- Styles morts BentoPlus purges ; apercu/LAMal/reglages/Tout Budgy intacts ; index.tsx 0 ligne.
- tsc/eslint/i18n verts, test-bento 41/41, captures 320 et 390 px validees. Build 85 inchange, aucun build lance.

## Session Deblocage CI i18n (base cff3e251) -> commit 1af8f83b
- QrBillError porte uniquement un code stable precis (18 codes : spc, version, coding, length, ibanFormat, ibanChecksum, creditorMissing, addressType, amountFormat, amountRange, currency, referenceQrrInvalid, referenceQrrRequiresQrIban, referenceScorInvalid, referenceQrIbanRequiresQrr, referenceNonNotEmpty, referenceTypeUnknown, trailer) ; message technique qrbill/<code> ; validations SIX inchangees.
- scanner-modal traduit le code a l affichage (qrbill.errors.<code>) avec repli generique traduit ; e?.message supprime.
- translations.ts : 19 cles qrbill.errors x4 langues.
- audit-i18n : commentaires // en fin de ligne retires (quote-aware), identifiants SIX QRR/SCOR/NON/SPC/EPD classes TECHNICAL, +3 fixtures self-test, expectUserVisibleMax ; audit toujours strict et present dans le workflow.
- Resultats : audit USER_VISIBLE=0, self-test 7/7, parity i18n PASS, test-qrbill 42/42, tsc/eslint verts, 7 suites verertes. REVIEW_MANUALLY=7 justifies (Budgy Alerts = nom produit, 5 warnings dev internes). Build 85 inchange, aucun build lance, main intacte.

## Session Comparateur LAMal officiel + mise a jour automatique (base 3c0378d5) -> commit 7edfa4dc
- Ecran lamal-comparator REECRIT : un seul comparateur officiel (profil canton -> commune officielle (cle OFS) -> region de prime, age, franchises admissibles, accident ; meilleure offre reelle ; classement <=20 assureurs reels avec modeles officiels et ecart vs moins cher ; etat des donnees honnete ; lien priminfo ; delais de resiliation AOS + note LCA ; lien subsides dedie explicite).
- SUPPRIMES : boutons HMO-10/Telmed-8, remises theoriques, Assureur A/B/C, top-10 modelise 2026, economies fictives, classement cantons modelise, onglets internes, priminfo-2026.ts, LamalOfficial2027.tsx.
- NOUVEAU : src/data/lamal-regions-2027.json (praemienregionen officiel, 2104 communes) + scripts/build-lamal-regions.py ; src/services/lamalData.ts (cache valide -> secours embarque 2027, refresh non bloquant du manifest versionne, revalidation client, etat offline/bundled/cache, nouveau millesime automatique via latestYear) ; scripts/lamal-update.mjs (CKAN metadata + SHA-256, telechargement seulement si changement, millesime auto, validations strictes, coherence vs version precedente, publication atomique versionnee) ; workflow .github/workflows/lamal-data-update.yml (hebdo + quotidien sept-nov, publication branche lamal-data, dispatch manuel).
- ACTIVATION PROD (etape restante cote utilisateur) : 1) Save to GitHub ; 2) lancer une fois le workflow manuellement (cree la branche lamal-data) ; 3) le cron planifie ne s executera que lorsque le fichier workflow sera sur la branche PAR DEFAUT du depot ; 4) si le depot est prive, raw.githubusercontent nécessite un depot public ou un hebergement equivalent (constante DATA_BASE_URL unique dans lamalData.ts).
- Tests : import reel PUBLISHED (2027.20260929), 2e passage UP_TO_DATE, CSV invalide refuse, test-lamal 70/70, tsc/eslint/audit/parity verts, suites bento/qrbill/premium/alerts/widgets vertes. Captures 390px validees. Build 85 inchange, main intacte.

## Session Activation securisee mise a jour LAMal (base 3c78d182)
- Workflow lamal-data-update : premier lancement robuste (ls-remote -> clone OU git init -b lamal-data, premier push cree la branche), permissions contents:write verifiees, code toujours execute depuis budgy-smart-4.0.
- lamal-update.mjs : retrogradation de millesime refusee, ecritures atomiques tmp+rename (manifest en dernier), atomicite consommateurs = push git apres succes complet uniquement.
- lamalData.ts : cache accepte seulement si primes+regions+meta = meme millesime, meta.year stocke, manifest annoncant un millesime plus ancien ignore (pas de retour arriere silencieux), secours 2027 preserve.
- TESTS REELS : creation branche au 1er push (simulation git bare) ; import 2027 PUBLISHED ; re-verification UP_TO_DATE sans telechargement ; millesime 2028 simule OK (zero code par annee) ; CSV invalide refuse ; interruption mi-pipeline -> repertoire publie intact ; test-lamal 77/77 ; tsc/eslint verts.
- RESTE A FAIRE PAR UTILISATEUR (GitHub) : 1) Save to GitHub ; 2) ouvrir la PR minimale vers main contenant UNIQUEMENT .github/workflows/lamal-data-update.yml (GitHub web : main -> Add file -> coller le fichier -> Propose new file -> PR), NE PAS fusionner sans autorisation ; 3) apres fusion, lancer le workflow manuellement une fois (cree lamal-data) ; cron hebdo + quotidien sept-nov actifs ensuite. NB : workflow_dispatch ET schedule exigent le fichier sur la branche par defaut. 4) Depot prive = raw.githubusercontent inaccessible : prevoir hebergement public (constante DATA_BASE_URL unique).
- Automatisation NON encore active en conditions reelles (aucun workflow GitHub execute) ; l app le signale honnetement et utilise le secours embarque 2027.

## Session Budgy Smart 4.0 majeure (base a8550802) -> commit e3a3ab17, version 4.0.0 build 87
- P0 Siri : WidgetSync consommait la file avec un minuteur aveugle 600ms au lancement a froid (push avale par expo-router avant montage + hydratation tardive du scope) -> navigation conditionnee a useRootNavigationState + 15 reessais x800ms + anti double-push par pid + consommation au changement de compte.
- P0 montants suisses : EntityEditModal normalise 1 apostrophe 200.50 / espaces insecables avant parseFloat (les montants ne retrecissent plus).
- P0 charges : total mensuel reellement mensualise par frequence, periodicite editable (hebdo->annuelle, semiannual ajoute au selecteur), modifier une date ne touche jamais un montant.
- P0 budgets : moteur corrige (filtre mois+annee reels, remboursements negatifs deduits, reconciliation avec Accueil).
- P0 QR : feedback visible si QR non reconnu + scan depuis image galerie (scanFromURLAsync) ; montant absent = saisie manuelle.
- Dettes : mensualites (capital restant>0) integrees au cashflow engage (snapshot debtPayments, passe par Accueil/Plus/widgets), dettes soldees exclues.
- P1 Plus Luminous Rows : 6 lignes horizontales (52pt art + description x4 langues + chevron/BETA/cadenas, verre bleu nuit + reflets emeraude) + carte Pro hero (reflet diagonal, statut reel).
- P1 Budgets : navigation mensuelle, recap (consomme 
## Session Budgy Smart 4.0 majeure (base a8550802) -> commit e3a3ab17, version 4.0.0 build 87
- P0 Siri : WidgetSync consommait la file avec un minuteur aveugle 600ms au lancement a froid (push avale par expo-router avant montage + hydratation tardive du scope) -> navigation conditionnee a useRootNavigationState + 15 reessais x800ms + anti double-push par pid + consommation au changement de compte.
- P0 montants suisses : EntityEditModal normalise 1'200.50 / 1 200,50 avant parseFloat (les montants ne retrecissent plus).
- P0 charges : total mensuel reellement mensualise par frequence, periodicite editable (hebdo->annuelle, semiannual ajoute au selecteur), modifier une date ne touche jamais un montant.
- P0 budgets : moteur corrige (filtre mois+annee reels, remboursements negatifs deduits, reconciliation avec Accueil).
- P0 QR : feedback visible si QR non reconnu + scan depuis image galerie (scanFromURLAsync) ; montant absent = saisie manuelle.
- Dettes : mensualites (capital restant>0) integrees au cashflow engage (snapshot debtPayments, passe par Accueil/Plus/widgets), dettes soldees exclues.
- P1 Plus Luminous Rows : 6 lignes horizontales (52pt art + description x4 langues + chevron/BETA/cadenas, verre bleu nuit + reflets emeraude) + carte Pro hero (reflet diagonal, statut StoreKit reel).
- P1 Budgets : navigation mensuelle, recap (consomme %, dispo != solde bancaire, depassement total), grille 2 colonnes anneaux (plafond 100%, depassement explicite), detail categorie (tx du mois, modifier limite, ajout rapide), Budgy Pulse verifiable.
- P2 : barre onglets iOS verre systeme (expo-blur systemChromeMaterial, sans regression layout ; vrais native tabs Liquid Glass iOS26 = Xcode 26, volontairement non migre) ; categories menage suisse additives ; version 4.0.0 (87).
- Tests : tsc/eslint/i18n/audit verts ; test-budgets 37/37 (nouveau) ; bento 41/41, widgets 44/44, alerts 56/56 (maj build 87), qrbill/premium/pro-gating/twin/lamal verts ; e2e navigateur Plus + Budgets valides. RESTE : tests iPhone physique (Siri voix, camera QR) sur build TestFlight 87 ; aucun build lance, main intacte.

## Session Audit final 4.0.0 + abonnements (commit 10620813)
- Paywall : mensuel premier + selectionne par defaut, badge economie % calcule depuis prix StoreKit reels, note annulation essai x4 langues, ligne essai corrigee (ne dependait qu'a tort du prix annuel), 3 sous-titres d'avantages dedupliques.
- Audit proactif corrige : route morte /more/contracts -> /more/documents ; parseDate minuit LOCAL (bug fuseau UTC, budgets.tsx aligne) ; logout() purge toutes les donnees financieres ; listener global SIGNED_OUT (purge store+premium+widget sur session expiree/revoquee) ; mensualite dette reduite par remboursements saisis ce mois (anti double comptage) ; taux moyen dettes pondere.
- IAP verifie cote code : ids com.budgy.ch.budgy.monthly/.annual, eligibilite essai via isEligibleForIntroOfferIOS, restore/reconcile, backend JWT-only + ownership fail-closed + webhook V2. NON verifiable d'ici : App Store Connect (produits, offre intro 7j Free Trial, sandbox), env backend prod (APPLE_ISSUER_ID/KEY_ID/P8), achats sandbox reels.
- Tests : test-budgets 47/47 (non-regression par correctif), 8 suites vertes, tsc/eslint/i18n verts, e2e navigateur paywall OK. Build 87 : a lancer par l'utilisateur via GitHub Actions eas-build.yml (profil testflight, option submit) apres Save to GitHub. Aucun remote git accessible depuis le pod.

## Session Fiabilisation 4.0 (commit 20069be2, build iOS 88)
- CAUSE RACINE SIRI : quick-add enregistrait les depenses en NEGATIF -> augmentait le disponible et creditait les budgets. Convention unique : depense = positif, source 'siri'.
- Moteur financier unique (selectors) : disponible = revenus - payees - charges dues (payees exclues via lastPaidMonth) - factures impayees RETARDS INCLUS (due <= fin de mois, != paid) - mensualites dettes restantes ; plus de clamp 0, deficit affiche. Test 12 chiffre : 4250 stable apres paiement (remplacement, zero double deduction).
- Rapprochements : Transaction.type/source/invoiceId/debtId/recurringId ; facture payee -> transaction liee (annulation la retire) ; remboursement dette -> transaction liee ; charge 'Marquer payee' -> transaction + lastPaidMonth + paymentHistory + Annuler ; dates jamais liees aux montants.
- Banniere accueil : sous-titre 'Apres depenses et charges a payer' + modal Detail du calcul + deficit rouge.
- Budgets : formulaire premium (clavier gere, validation stricte jamais CHF 0 silencieux, nom perso, alerte 80/100, periode mensuelle), CategoryGroupPicker plein ecran groupe suisse + recherche + categories personnelles (store.customCategories).
- Charges : recap du mois (du/paye), prochaine echeance (clamp fin de mois, locale), equiv mensuel, periodicite a la creation (hebdo->annuelle), groupes suisses ; taxonomie etendue (+lca, assurances, famille, animaux, vacances, cadeaux ; labels x4 ; loyerExpense != loyer revenu).
- iOS : barre FLOTTANTE verre systeme (coins 30pt, halo emeraude), Budgy AI central conserve. Native tabs iOS26 (SDK54) dispo mais SANS bouton central custom -> non migre, compromis documente.
- QR Nexum : test isole 49/49 (SCOR RF75 4110 1211 mod97, CHF 523.50, Company, James Johnson) + test anti-hardcode (aucune donnee demo dans l'app).
- Build 88 (87 consomme). Tests : test-budgets 64/64, 9 suites vertes, tsc/eslint/i18n/audit verts. E2E navigateur : banniere+detail, budget 600 (erreur validation + picker groupe), charge LAMal 385 payee/annulable. RESTE iPhone : Siri voix, camera QR, barre flottante, StoreKit sandbox (TestFlight 88).

## Session Integration ChatGPT (commit 031a8427)
- Budgy AI coach -> gpt-6-sol ; analyse tickets/emails/voix/conseiller -> gpt-5.4-mini (multimodal). Modeles via env LLM_MODEL_CHAT / LLM_MODEL_FAST.
- llm_client.py : cle sk-emergent -> proxy Emergent (emergentintegrations) ; autres cles -> LiteLLM direct (prod Coolify inchangee). emergentintegrations dans requirements.txt.
- Tests reels : texte gpt-6-sol OK, JSON gpt-5.4-mini OK, vision OK (image rouge reconnue). test-budgets 67/67. Endpoint /api/coach/chat protege par JWT Supabase (inchange).

## Session Audit final avant TestFlight (commit e7d1aaac40ab1e21549accd52e8f3280050b6067)
- Moteur : recurringExpenses = EXIGIBLE reel du mois (annuelle 1200 -> 1200 son mois, 0 ailleurs) ; recurringMonthlyAvg = moyenne stats ; hebdo = 4 occurrences payables individuellement (statut partiel, undo par occurrence, migration lastPaidMonth) ; dettes nettees PAR debtId (repli categorie seulement si 1 dette) ; revenus ponctuels type 'income' dans les ressources (oneOffIncome).
- Rapprochements CONFIRMES par l'utilisateur : facture payee <-> depense existante (lier/creer, dissociation propre) ; import QR <-> charge active (Invoice.recurringId, obligation comptee 1 fois).
- test-engine.mjs : transpile et EXECUTE le vrai getMonthlyFinancialSnapshot — 23/23 scenarios chiffres (4250 stable, deficit -250, retard sept. du en nov., 2 dettes isolees, navigation mois, migration). Plus de tests uniquement textuels pour le moteur.
- Hash reel des commits : fiabilisation = 69be222b3f51 (le '20069be2' annonce etait le short-hash mal lu), audit final = e7d1aaac40ab. Build 88 conserve. RESTE iPhone : Siri voix, camera QR Nexum, barre flottante, StoreKit.

## Session STABILISATION PREMIUM (commits 2f8ecfce + 3ddd918e)
- P0 categories : CategoryGroupPicker n'est plus un Modal natif — calque absolu rendu DANS le Modal du formulaire (budgets.tsx, recurring.tsx) ; une seule fenetre native, deux vues internes. Cause racine du blocage iPhone = deux Modals UIKit empiles.
- P0 Siri : refreshWidgetSnapshot attend persist.hasHydrated() ; sans session il ne retire QUE le snapshot (plus jamais la file pendingExpenses ni la route — cause racine de la commande perdue au cold start). Purge totale uniquement via clearWidgetData (logout/changement de compte). pushedPid libere quand la file se vide ; annulation quick-add retire la commande. Dialogue Swift = 'confirmez... dans Budgy' (jamais 'c'est fait') → le 'c'est fait' de la video venait d'un ancien binaire : BUILD 89 requis sur iPhone.
- Protections Apple recrees localement (les commits distants 485328f0/b283e1f6/218ca545/f5cd2bfa/c4d776e5/11de6a26 n'existaient pas dans le pod) : BudgyIntentsExtension.swift (@main AppIntentsExtension, anti ITMS-90896), buildNumber 88→89, test-alerts verifie 4.0.0/build>=89.
- P1 menu Plus : refonte editoriale (#0A0F1C, carte Budgy Pro or relief, 5 sections exactes, 17 lignes texte+chevron via FEATURE_BY_ID, titres extrudes+trait vert, i18n plusV3 x4, a11y) ; /more/category/[id] → redirect. Gardes FREE/PRO et statut StoreKit intacts.
- Montants exacts : formatNumber/formatMoney/useMoney auto-decimales (17,90 jamais 18).
- scripts/test-stability.mjs : 43 garde-fous. testing_agent iteration_22 : tous parcours PASS apres fixes.
- RESTE iPhone physique (build 89) : commande Siri vocale reelle, rendu natif du picker mono-modal, barre flottante, StoreKit.
