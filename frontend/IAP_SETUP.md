# Budgy — Apple StoreKit (In-App Purchase) Setup

## Architecture

```
┌───────────────┐       ┌───────────────────┐       ┌────────────────┐
│ paywall.tsx   │──────▶│ useIAP() hook     │──────▶│ iap.ts service │
└───────────────┘       └─────────┬─────────┘       └────────┬───────┘
                                  │                          │
                                  ▼                          ▼
                        setPremium(true) in         react-native-iap
                        usePremiumStore             (StoreKit native)
                                  ▲                          │
                                  │   validate receipt       │
                                  │ ◀────────────────────────┘
                        ┌─────────┴──────────┐
                        │ POST /api/iap/     │
                        │      validate      │
                        │ (FastAPI)          │
                        └────────┬───────────┘
                                 │
                                 ▼
                        verifyReceipt API
                        (buy.itunes.apple.com
                         or sandbox)
```

## Product IDs (must match App Store Connect)

| Plan      | Product ID                 | Suggested Price |
|-----------|----------------------------|-----------------|
| Monthly   | `ch.budgy.pro.monthly`     | CHF 4.90        |
| Annual    | `ch.budgy.pro.annual`      | CHF 39.00       |

Both belong to subscription group **Budgy Premium**.

## Required secrets

Add to `/app/backend/.env`:

```
APPLE_SHARED_SECRET=<32-hex-chars from App Store Connect → Users and Access → Shared Secret>
APPLE_BUNDLE_ID=ch.budgy.app
```

## Testing on device

Expo Go **cannot** test IAP → you must build via EAS:

```bash
cd /app/frontend
eas build --profile development --platform ios
# Install the resulting .ipa via TestFlight or EAS Internal Distribution
```

Sign in to Expo Go with your App Store Connect **Sandbox Tester** account:
Settings → App Store → Sandbox Account → Sign in.

## Files

- `/app/frontend/src/services/iap.ts` – StoreKit wrapper
- `/app/frontend/src/hooks/useIAP.ts` – React hook orchestrating purchase/restore
- `/app/frontend/app/paywall.tsx` – UI that calls `iap.purchase(plan)`
- `/app/backend/server.py` – `POST /api/iap/validate` endpoint (Apple verifyReceipt)

## Web/Expo Go fallback

`isIapAvailable()` returns `false` on Expo Go and web preview, so the paywall
falls back to a **mock unlock** (alert says "Mode aperçu"). The real StoreKit
flow only runs in native iOS builds.
