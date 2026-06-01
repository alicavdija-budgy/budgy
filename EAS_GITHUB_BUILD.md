# EAS Build depuis GitHub — sans Mac

Ce document explique comment lancer des builds iOS / Android **directement
depuis GitHub ou EAS Dashboard**, sans passer par un Mac local.

---

## 1 · Architecture du repo

Budgy est un **monorepo** :

```
budgy/
├─ backend/         ← FastAPI (Coolify)
├─ frontend/        ← Expo / React Native (ce qui se build avec EAS)
│  ├─ app.json
│  ├─ eas.json
│  ├─ package.json
│  └─ .easignore
├─ docs/
├─ supabase/
└─ .github/workflows/eas-build.yml
```

Il n'y a **PAS** de `package.json` à la racine. EAS doit donc être configuré
pour utiliser `frontend/` comme base directory.

---

## 2 · Configuration EAS Dashboard (à faire UNE SEULE FOIS)

C'est ce qui débloque le bug "EAS GitHub ne trouve pas package.json".

1. Va sur https://expo.dev/accounts/avdijaalic/projects/budgy.
2. Ouvre **Project settings** → **GitHub**.
3. Connecte le repo `budgy` s'il ne l'est pas déjà.
4. Dans "Repository settings", configure :
   - **Base directory** : `frontend`
   - **Build profile (default)** : `production`
   - **Build on push** : Off (on contrôle manuellement)

Après sauvegarde, EAS reconnaîtra `frontend/app.json` et
`frontend/package.json` comme racine du projet Expo.

---

## 3 · Token EAS dans GitHub Secrets

Pour que le workflow `.github/workflows/eas-build.yml` fonctionne :

1. Génère un Access Token sur https://expo.dev/accounts/[username]/settings/access-tokens.
2. Sur GitHub : **Settings** → **Secrets and variables** → **Actions** →
   **New repository secret**.
3. Nom : `EXPO_TOKEN` — Valeur : le token généré.

---

## 4 · Trois façons de lancer un build

### A. Via le **EAS Dashboard** (le plus simple)

https://expo.dev/accounts/avdijaalic/projects/budgy/builds → bouton **New Build**
→ choix de la platform & du profile. EAS lit directement le repo GitHub grâce
à la config faite en §2.

### B. Via **GitHub Actions** (workflow_dispatch)

Dans GitHub → onglet **Actions** → "EAS Build (iOS & Android)" → **Run workflow**
→ choisis platform/profile/submit. Le job utilise `npm ci` + `eas build` dans
`frontend/` automatiquement.

Deux déclenchements activés :
- **Manuel** (`workflow_dispatch`) avec choix platform/profile/submit
- **Auto** sur push d'un commit modifiant `frontend/app.json` (= bump version)

### C. Via la CLI depuis ton Mac (alternative legacy)

```bash
cd frontend
npx eas build --platform ios --profile production
npx eas submit --platform ios --latest
```

---

## 5 · Vérifications pré-build

```bash
cd frontend

npx expo-doctor          # vérifie SDK, peer deps, app.json
npx tsc --noEmit         # 0 erreur attendu
npx eas build:configure  # (idempotent) vérifie eas.json
```

### Champs obligatoires dans `frontend/app.json` (déjà OK — ne pas casser)

| Champ | Valeur attendue |
|---|---|
| `expo.name` | `Budgy` |
| `expo.slug` | `budgy` |
| `expo.owner` | `avdijaalic` |
| `expo.version` | `3.7.24` |
| `expo.ios.bundleIdentifier` | `com.budgy.ch.budgy` |
| `expo.android.package` | `com.budgy.ch.budgy` |
| `expo.ios.buildNumber` | `64` |
| `expo.android.versionCode` | `64` |
| `expo.runtimeVersion` | objet (policy ou string) |
| `expo.updates.url` | `https://u.expo.dev/cf75668b-...` |
| `expo.extra.eas.projectId` | `cf75668b-71ba-4bfb-9169-8ad2f572e982` |
| `expo.newArchEnabled` | `true` |

---

## 6 · Variables secrètes (EAS Secrets)

Les secrets coté mobile (anon key Supabase, clefs analytics, etc.) doivent
vivre **uniquement** dans EAS Secrets, jamais dans le repo :

```bash
cd frontend
npx eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value '<JWT>' --scope project
```

Une fois créés, ils sont automatiquement injectés au build.

---

## 7 · Pourquoi le bug "package.json introuvable" arrivait

Quand EAS démarre un build via la GitHub integration, il :

1. Clone le repo,
2. Cherche `package.json` au chemin que tu lui as donné dans le dashboard
   (par défaut : la racine du repo).
3. Lance `npm install` puis `eas build` depuis ce chemin.

Sans **Base directory = frontend**, EAS clone la racine du monorepo, ne trouve
aucun `package.json`, et échoue avec :

> `Error: Cannot find module ... package.json not found in repository root`

La config du §2 corrige définitivement ce problème.

---

## 8 · Bonus — builds Android sans clé keystore locale

EAS gère ton keystore Android automatiquement ("managed credentials") la
première fois que tu lances un build Android. Aucun keystore à fournir
manuellement.

Pour iOS : EAS peut générer Apple Distribution Certificate +
Provisioning Profile via l'API App Store Connect en utilisant le `.p8`
déjà configuré côté backend Coolify (mêmes variables APPLE_KEY_ID /
APPLE_ISSUER_ID / APPLE_PRIVATE_KEY_P8).

---

## Résumé — ce qu'il te reste à faire

1. **EAS Dashboard** : Base directory = `frontend` (1 clic, une fois pour toutes).
2. **GitHub Secrets** : ajouter `EXPO_TOKEN`.
3. (Optionnel) **EAS Secrets** : ajouter `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
4. Lancer un build depuis :
   - EAS Dashboard → *New Build* — OU
   - GitHub Actions → *EAS Build (iOS & Android)* → *Run workflow*.
