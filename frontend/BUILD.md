# Budgy — iOS / App Store Build Guide

Quick reference for building and submitting Budgy to the Apple App Store and Google Play Store using **EAS Build**.

## 🔑 Prerequisites

1. **macOS** (recommended) or Linux for building
2. **Apple Developer account** (CHF 99/year)
3. **Google Play Console account** (one-time CHF 25)
4. **Node.js 18+** and **Yarn**
5. **Expo account** with EAS CLI installed:
   ```bash
   npm install -g eas-cli
   eas login
   ```

## 📦 First-time setup

1. Clone the repo and install dependencies:
   ```bash
   git clone <your-repo-url>
   cd budgy/frontend
   yarn install
   ```

2. Initialize EAS project (one-time only):
   ```bash
   eas init
   ```
   This will create a real `projectId` in `app.json`. Replace the placeholder
   `00000000-0000-0000-0000-000000000000` value automatically.

3. Update `eas.json` with your real **Apple ID**, **App Store Connect App ID**
   (`ascAppId`) and **Apple Team ID** (`appleTeamId`). You can find these in
   App Store Connect once you've created the app entry.

4. (Optional) For Android, generate a Google Play service account JSON and
   place it at `frontend/google-service-account.json` (referenced in `eas.json`).
   Add this file to your `.gitignore`!

## 🚀 Build commands

| Profile | Command | Purpose |
|---|---|---|
| **Development** | `eas build --profile development --platform ios` | Dev client for Expo Go-like dev experience on physical devices |
| **Preview** | `eas build --profile preview --platform all` | Internal testing (TestFlight + APK) |
| **Production** | `eas build --profile production --platform all` | App Store + Google Play release builds |

## 📤 Submit to stores

After a successful production build:

```bash
# iOS — App Store Connect
eas submit --profile production --platform ios

# Android — Google Play
eas submit --profile production --platform android
```

## 🔧 Configuration files

- **`app.json`** — Expo / app metadata (bundle ID, permissions, plugins, version). Already configured for Budgy with:
  - Bundle ID: `ch.budgy.app`
  - iOS infoPlist permissions (camera, photos, Face ID, contacts)
  - Android permissions (camera, biometric, storage)
  - Universal links / app links for `budgy.ch`
  - Localized to FR / EN / DE / IT
- **`eas.json`** — EAS Build & Submit profiles (development, preview, production)

## 🔐 Environment variables

Set per-profile in `eas.json` under each `build.{profile}.env`:

- `EXPO_PUBLIC_BACKEND_URL` — points to your FastAPI backend (e.g. `https://api.budgy.ch`)
- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` — set via EAS secrets:
  ```bash
  eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://xxx.supabase.co" --scope project
  eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJ..." --scope project
  ```

## ✅ App Store submission checklist

- [ ] App icons (1024×1024 in `assets/images/icon.png`) ✅ ready
- [ ] Splash screen (`assets/images/splash-icon.png`) ✅ ready
- [ ] Privacy policy hosted at `https://budgy.ch/privacy.html` ✅ ready
- [ ] Terms of Service at `https://budgy.ch/terms.html` ✅ ready
- [ ] App Store screenshots (6.7" iPhone, 6.5" iPhone, 5.5" iPhone, 12.9" iPad) — to generate
- [ ] App description, keywords, support URL — see `app-store-assets/APP_STORE_TEXTS.md`
- [ ] Age rating questionnaire (likely 4+, but check finance category requirements)
- [ ] Demo account credentials for App Review (set in App Store Connect)
- [ ] Export compliance: `ITSAppUsesNonExemptEncryption: false` ✅ already set
- [ ] RevenueCat keys (`appl_...`) configured before first paid build

## 🛠️ Backend deployment

The **FastAPI backend** is in `/backend`. Deploy options:

- **Emergent native deploy** (recommended for simplicity, click "Deploy" in Emergent)
- **Railway** / **Fly.io** / **Render** (Docker-friendly hosting)
- Set `MONGO_URL`, `EMERGENT_LLM_KEY`, etc. as secrets in your hosting provider
- Update `EXPO_PUBLIC_BACKEND_URL` in `eas.json` production profile to match

## 📝 Useful commands

```bash
# Verify config is valid
npx expo config --type prebuild

# Diagnose dependency issues
npx expo-doctor

# Test on web
yarn start

# View build logs
eas build:list
```

---

For questions: `support@budgy.ch`
