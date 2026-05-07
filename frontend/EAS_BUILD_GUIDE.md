# 🚀 Budgy — Guide Build TestFlight (depuis votre Mac)

## ✅ Ce qui est déjà prêt

- ✅ Projet EAS créé : **https://expo.dev/accounts/avdijaalic/projects/budgy**
- ✅ Project ID : `cf75668b-71ba-4bfb-9169-8ad2f572e982` (déjà dans `app.json`)
- ✅ Bundle ID iOS : `com.budgy.ch.budgy`
- ✅ Product IDs IAP : `com.budgy.ch.budgy.monthly`, `com.budgy.ch.budgy.annual`
- ✅ `eas.json`, `app.json`, code IAP/StoreKit complet

## 📋 Prérequis sur votre Mac

```bash
# 1. Node 20+ installé (ou via brew install node)
node --version   # v20.x ou v22.x

# 2. Xcode (Mac App Store) — pas obligatoire mais utile pour debugger
# 3. EAS CLI installée globalement
npm install -g eas-cli

# 4. Compte Apple Developer actif (vous l'avez déjà ✓)
```

## 🔧 Étape 1 — Récupérer le code

### Si Emergent expose Git :
```bash
git clone <url-de-votre-repo>
cd budgy/frontend
```

### Sinon, téléchargez le ZIP depuis Emergent (bouton "Download code") :
```bash
unzip budgy.zip
cd budgy/frontend
yarn install   # ou npm install
```

## 🔧 Étape 2 — Login EAS

```bash
eas login
# Email : avdijaalic@... (votre compte Expo)
# Password : ...
# 2FA si activée : code envoyé par email/app
```

Vérifiez :
```bash
eas whoami
# → avdijaalic
```

## 🔧 Étape 3 — Avant le build : compléter `eas.json`

Ouvrez `frontend/eas.json` et remplacez les placeholders dans la section `submit.production.ios` :

```json
"submit": {
  "production": {
    "ios": {
      "appleId": "VOTRE_APPLE_ID@email.com",   ← votre Apple ID Developer
      "ascAppId": "1234567890",                 ← visible dans App Store Connect → Budgy → App Information → Apple ID
      "appleTeamId": "ABCDE12345",              ← visible sur developer.apple.com → Membership → Team ID
      "language": "fr-FR"
    }
  }
}
```

> 💡 Trouver l'**ascAppId** : App Store Connect → My Apps → Budgy → App Information → en haut à droite, "Apple ID" (10 chiffres).
> 💡 Trouver le **Team ID** : developer.apple.com → Account → Membership → Team ID (10 chars).

## 🔧 Étape 4 — Lancer le build

```bash
cd frontend
eas build --profile production --platform ios --auto-submit
```

EAS vous guidera **interactivement** :

1. **Apple Developer login** → email + mot de passe + code 2FA (envoyé sur votre iPhone)
2. **Distribution Certificate** → "Generate new" (la 1ère fois) ou "Use existing"
3. **Provisioning Profile pour Budgy** → "Generate new"
4. **Provisioning Profile pour ShareExtension** → "Generate new"
5. **App-Specific Password** (pour --auto-submit vers TestFlight)
   - Si demandé : générez-en un sur https://appleid.apple.com → Sign-In and Security → App-Specific Passwords → +
   - Nom : `EAS Submit`, copiez-collez dans le terminal

⏱ **Durée totale** : ~25-35 minutes
- Build : ~15-20 min sur les serveurs EAS
- Upload TestFlight : ~5 min
- Apple processing : ~10 min

## 🔧 Étape 5 — Pendant que ça build : récupérer le Shared Secret

Une fois le build accepté par App Store Connect (vous recevez un email "Your build is ready to test") :

1. App Store Connect → **My Apps → Budgy → Monetization → Subscriptions**
2. Tout en bas de la page : **App-Specific Shared Secret** → **View / Generate**
3. Copiez les 32 caractères hex
4. **Envoyez-les-moi via Emergent** : je les colle dans `/app/backend/.env` → variable `APPLE_SHARED_SECRET=`

## 🔧 Étape 6 — Tester l'achat in-app

1. Sur votre iPhone : **Réglages iOS → App Store → Sandbox Account** → connectez-vous avec votre tester sandbox
2. Installez Budgy via TestFlight
3. Ouvrez Budgy → onglet Plus → **"Passer Pro"** ou trigger un feature Pro
4. Sur l'écran paywall, tapez **"Essayer gratuitement 7 jours"**
5. La feuille **StoreKit native Apple** apparaît avec vos prix réels CHF 4.90 / CHF 39.00
6. Validez avec Touch ID / Face ID
7. ✨ Le reçu est envoyé à `https://api.budgy.ch/api/iap/validate` → `isPro = true` → Premium déverrouillé !

## 🐛 Si quelque chose foire

- **Build qui échoue** : copiez-moi l'erreur, je débogue à distance.
- **TestFlight rejette** : généralement Privacy Manifest ou un produit IAP non soumis. Je guide.
- **Achat échoue avec "Cannot connect to iTunes Store"** : vérifiez que vous êtes connecté avec un compte sandbox (PAS production), Réglages iOS → App Store.

## 🎯 Récap rapide

```bash
# Sur votre Mac, après git clone :
cd budgy/frontend
yarn install
eas login
# (éditer eas.json avec vos infos Apple)
eas build --profile production --platform ios --auto-submit
# attendre ~30 min
# email TestFlight reçu → récupérer Shared Secret → me l'envoyer
```

Bonne build ! 🚀
