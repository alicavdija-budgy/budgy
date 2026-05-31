# Budgy Web — Déploiement Coolify / npm

Cette page décrit comment déployer le site **https://budgy.ch** (Expo Web) sur
Coolify, en n'utilisant **que npm** (pas de Yarn).

---

## 1 · Pile déployée

- **Build** : `npx expo export --platform web` → `frontend/dist/`
- **Runtime** : [`serve`](https://www.npmjs.com/package/serve) (Node 20)
- **Routage** : `frontend/serve.json` (rewrites + cleanUrls + cache headers)
- **Pages publiques** statiques copiées depuis `public/` :
  - `landing.html` — page d'accueil publique
  - `privacy.html` — politique de confidentialité
  - `serve.json` — config rewrites (rebasculée dans `dist/` au build)

---

## 2 · Scripts npm

Dans `frontend/package.json` :

```json
{
  "scripts": {
    "build":     "expo export --platform web",
    "serve":     "serve dist -s -l tcp://0.0.0.0:${PORT:-3000}",
    "start:prod": "npm run build && npm run serve"
  }
}
```

Note : la commande `serve` n'utilise PAS le flag `-s` parce que les rewrites
sont définis dans `serve.json`. Le paramétrage `-s` cassait le service de
`landing.html` et `privacy.html`. La config `serve.json` corrige ce problème
en mappant :

| URL entrante     | Servi                    |
|------------------|--------------------------|
| `/`              | `landing.html` (rewrite) |
| `/landing`       | `landing.html` (cleanUrls) |
| `/privacy`       | `privacy.html` (cleanUrls) |
| `/landing.html`  | 301 → `/landing`           |
| `/privacy.html`  | 301 → `/privacy`           |
| `/expenses`      | `expenses.html` (page Expo pré-rendue) |
| `/more/foo`      | `more/foo.html` (page Expo pré-rendue) |
| `/_expo/**`      | bundles JS, cachés 1 an    |
| `/assets/**`     | images / fonts, cachés 1 an |

---

## 3 · Configuration Coolify

Dans Coolify, créer une **Application** pointée sur la branche `main` du repo,
avec ces paramètres :

| Champ Coolify       | Valeur                       |
|---------------------|------------------------------|
| Build pack          | **Dockerfile**               |
| Base directory      | `/frontend`                  |
| Dockerfile location | `/frontend/Dockerfile`       |
| Port                | `3000`                       |
| Health check path   | `/`                          |
| Domain              | `https://budgy.ch` (+ `www.budgy.ch` en alias) |

Aucune variable d'environnement obligatoire pour le web : les URLs
(`EXPO_PUBLIC_BACKEND_URL`, etc.) sont figées dans le build via les valeurs
de `frontend/eas.json` au moment du `npx expo export`.

Si tu préfères sans Dockerfile (Nixpacks), utilise :

| Champ Coolify       | Valeur                       |
|---------------------|------------------------------|
| Build pack          | **Nixpacks**                 |
| Install command     | `npm ci --legacy-peer-deps`  |
| Build command       | `npm run build && cp serve.json dist/serve.json` |
| Start command       | `npm run serve`              |
| Publish directory   | `dist`                       |
| Port                | `3000`                       |

---

## 4 · Vérifications post-déploiement

```bash
curl -I https://budgy.ch/                # 200, landing.html
curl -I https://budgy.ch/landing         # 200, landing.html
curl -I https://budgy.ch/privacy         # 200, privacy.html
curl -I https://budgy.ch/landing.html    # 301 → /landing
curl -I https://budgy.ch/privacy.html    # 301 → /privacy
curl -I https://budgy.ch/expenses        # 200, page Expo pré-rendue
curl -I https://budgy.ch/more/budgy-score # 200
```

Si Coolify renvoie `Bad Gateway` :

1. Vérifie que le container écoute bien sur **0.0.0.0:3000** (et pas
   127.0.0.1).
2. Vérifie que le proxy Coolify route bien vers le port **3000** (et pas
   80/8080).
3. Regarde les logs du container : `serve` log normalement
   `INFO Accepting connections at http://0.0.0.0:3000`.

---

## 5 · npm uniquement (pas de Yarn)

- `package-lock.json` est la source de vérité.
- `yarn.lock` est explicitement **exclu** via `.dockerignore` et doit être
  retiré du repo si un IDE le re-crée.
- `npm ci --legacy-peer-deps` (flag nécessaire pour la stack React Native /
  Expo qui a parfois des peer deps strictes en pre-release).

---

## 6 · Tests locaux

```bash
cd frontend
rm -rf dist && npm run build
PORT=4000 npm run serve
# → http://localhost:4000/  → landing.html
```
