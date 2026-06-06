# Budgy — Apple IAP TestFlight Checklist (v3.7.27)

> Audit du flux In-App Purchase pour validation TestFlight + soumission App Store.
> **Verdict** : ✅ **READY** côté code app + backend. ⚠️ **NOT READY** tant que les actions utilisateur ci-dessous ne sont pas faites côté App Store Connect.

---

## 🟢 Côté code (READY — rien à modifier)

| Composant | Fichier | Statut |
|---|---|---|
| Frontend StoreKit wrapper | `frontend/src/hooks/useIAP.ts` (454 lignes) | ✅ react-native-iap intégré |
| Frontend service IAP | `frontend/src/services/iap.ts` (317 lignes) | ✅ |
| Paywall UI | `frontend/app/paywall.tsx` (657 lignes) | ✅ Gold/Teal premium |
| Backend validate | `backend/server.py` `/api/iap/validate` | ✅ App Store Server API |
| Backend restore | `backend/server.py` `/api/iap/restore` | ✅ |
| Backend status | `backend/server.py` `/api/iap/me?user_id=…` | ✅ |
| Backend health | `backend/server.py` `/api/iap/health` | ✅ Retourne `iap_ready`, `sandbox`, `products` |
| Persistance Pro | `backend/server.py` + Supabase `iap_subscriptions` | ✅ |
| Apple `.p8` key | Coolify env `APPLE_PRIVATE_KEY_P8` + `APPLE_KEY_ID`, `APPLE_ISSUER_ID` | ✅ Configuré |

### Produits référencés dans le code

| Product ID | Type | Durée | Code constante |
|---|---|---|---|
| `ch.budgy.pro.monthly` | Auto-renewable subscription | 1 mois | `IAP_PRODUCT_MONTHLY` |
| `ch.budgy.pro.yearly` | Auto-renewable subscription | 1 an | `IAP_PRODUCT_YEARLY` |

(IDs exacts dans `backend/.env` côté Coolify : `IAP_PRODUCT_MONTHLY=...` / `IAP_PRODUCT_YEARLY=...`)

---

## ⚠️ Actions utilisateur côté App Store Connect (NOT READY tant que pas fait)

### 1. Créer les produits IAP

`App Store Connect → My Apps → Budgy → Subscriptions`

Pour chacun (`ch.budgy.pro.monthly`, `ch.budgy.pro.yearly`) :

- **Reference Name** : "Budgy Pro mensuel" / "Budgy Pro annuel"
- **Product ID** : EXACTEMENT comme défini dans Coolify env (sensible à la casse)
- **Subscription Group** : créer un seul groupe "Budgy Pro" et y placer les 2 produits (pour permettre upgrade/downgrade)
- **Price** : ex CHF 4.99 / mois ; CHF 39.99 / an
- **Localization FR-CH** : description + display name
- **Review Info** :
  - Screenshot du paywall (1290×2796 ou tout taille acceptée)
  - "App Review Notes" : "Le paiement débloque les fonctionnalités Économiseur IA, Coach Predict, Radar d'économies, Optimisation fiscale, Export PDF Premium."
- **Privacy Policy URL** : `https://budgy.ch/privacy`
- **Status final** : **Ready to Submit** (pas "Missing Metadata")

### 2. Apple Pay / Merchant Agreement

`App Store Connect → Agreements, Tax, and Banking`

- ☑ Paid Apps Agreement → **Active**
- ☑ Tax Forms remplis (W-8BEN pour CH)
- ☑ Banking Info (IBAN CH)
- ☑ Contact (au moins 1 contact Finance + 1 Senior Mgmt)

> **Sans Paid Apps Agreement actif**, les achats IAP échouent en sandbox ET en prod avec `cannot connect to iTunes Store`.
>
> Apple Pay s'affiche automatiquement dans l'UI StoreKit native quand l'utilisateur a une carte dans son Wallet — **aucun code supplémentaire requis**.

### 3. Sandbox testing

`App Store Connect → Users and Access → Sandbox Testers`

- Créer ≥ 1 compte test (ex `qa-iap-2026@budgy.ch`)
- Sur ton iPhone TestFlight : Réglages → App Store → Sandbox Account → se logger
- Tester :
  - achat mensuel → Apple Pay UI s'ouvre → confirmer → Pro débloqué dans Budgy
  - achat annuel → idem
  - "Restore Purchases" → état Pro restauré sans paiement
  - cancel renewal (depuis Sandbox account settings) → Pro persiste jusqu'à fin de période

### 4. TestFlight build

Build EAS production (build 67+) avec `react-native-iap` correctement bundlé.

- ☑ Le build a la capability "In-App Purchase" (vérifier dans Xcode → Signing & Capabilities)
- ☑ `app.json` a `"ios.bundleIdentifier": "com.budgy.ch.budgy"` matchant l'app dans App Store Connect
- ☑ Le build est uploadé via `eas submit` ou Transporter

---

## 🧪 Smoke test endpoint backend (à exécuter après deploy)

```bash
# 1. IAP service ready ?
curl https://api.budgy.ch/api/iap/health
# → expected: {
#     "iap_ready": true,
#     "supabase_ready": true,
#     "missing": [],
#     "sandbox": false,           ← prod : doit être false
#     "products": ["ch.budgy.pro.monthly", "ch.budgy.pro.yearly"]
#   }

# 2. État d'un user
curl "https://api.budgy.ch/api/iap/me?user_id=00000000-0000-0000-0000-000000000000"
# → expected: { "is_pro": false, "subscription_state": "FREE", ... }

# 3. Validation d'une transaction (depuis l'app après achat)
# Auto-déclenché par useIAP.ts après StoreKit success
```

---

## 📋 Résumé GO / NO-GO

| Critère | Statut |
|---|---|
| Code app + backend prêt | ✅ READY |
| Produits créés dans App Store Connect | ⚠️ Action utilisateur |
| Paid Apps Agreement active | ⚠️ Action utilisateur |
| Sandbox tester créé | ⚠️ Action utilisateur |
| Build TestFlight ≥ 67 uploadé | ⚠️ Action utilisateur |
| `iap_ready=true` sur api.budgy.ch | À confirmer après deploy |

**Verdict global** : 🟡 **Code READY** + **Configuration utilisateur PENDING (4 étapes)** → 1-2h utilisateur pour passer en GO complet.

---

## 📞 Support

- Email : `support@budgy.ch`
- Doc Apple : https://developer.apple.com/in-app-purchase/
- Doc react-native-iap : https://github.com/dooboolab-community/react-native-iap
