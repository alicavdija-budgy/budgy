# Budgy — Supabase Auth Dashboard Checklist (v3.7.27)

> **Pourquoi ce document ?**
> En TestFlight Build 65/66, la création de compte et la récupération de mot de passe renvoient `Unauthorized`. La cause racine est presque toujours **côté configuration Supabase**, pas côté code app. Cette checklist couvre les **6 points obligatoires** à vérifier sur ton dashboard `https://supabase.budgy.ch/project/_/auth`.

Mise à jour : v3.7.27 · App version mobile : 3.7.27 (build 67)

---

## ✅ Étape 1 — Site URL

`Authentication → URL Configuration → Site URL`

```
https://budgy.ch
```

(Site URL est le **seul domaine source** depuis lequel les magic links sont valides. Toute autre URL doit être listée dans Redirect URLs.)

---

## ✅ Étape 2 — Redirect URLs (wildcards autorisés)

`Authentication → URL Configuration → Redirect URLs`

Ajouter **EXACTEMENT** ces 6 lignes (ordre indifférent) :

```
budgy://reset-password
budgy://reset-password/**
budgy://**
https://budgy.ch/reset-password
https://budgy.ch/reset-password/**
https://app.budgy.ch/**
```

> ⚠️ **Sans ces entrées**, Supabase répond `Unauthorized` au moment où l'utilisateur clique sur le lien dans l'email parce que la redirection n'est pas whitelistée.
>
> Le prefix `budgy://` correspond au scheme déclaré dans `frontend/app.json` (`expo.scheme`).

---

## ✅ Étape 3 — Email Provider (SMTP)

`Authentication → Email Templates → SMTP Settings`

**Option A — Service tiers recommandé (Resend / Postmark / SendGrid)** :

```
Sender email     : support@budgy.ch
Sender name      : Budgy
SMTP host        : smtp.resend.com (ou ton provider)
SMTP port        : 465  (SSL/TLS)
SMTP username    : resend  (ou ton user)
SMTP password    : <SECRET_RESEND_API_KEY>   ← Coolify env, JAMAIS dans le repo
Min interval     : 60s  (anti-flood)
```

**Option B — SMTP perso (OVH, Infomaniak, etc.)** : configurer un compte dédié `support@budgy.ch` avec mot de passe d'application.

> ⚠️ **Sans SMTP configuré, Supabase tente quand même d'envoyer via son SMTP par défaut (limité à 3 emails/h en self-hosted)** → l'utilisateur reçoit `Email rate limit exceeded` après quelques essais.

**Test SMTP** : dans le dashboard, bouton "Send test email" → doit arriver dans la boîte mail destinataire en <30s.

---

## ✅ Étape 4 — Email Templates (Confirm Signup + Reset Password)

`Authentication → Email Templates`

Pour chacun des 4 templates (Confirm, Invite, Magic Link, Recovery), vérifier :

1. Le **From** est `support@budgy.ch` (pas `noreply@supabase.co`)
2. Le **Reply-To** est `support@budgy.ch`
3. Le **Subject** est en français : ex. `Bienvenue sur Budgy — Confirmez votre adresse`
4. Le corps HTML contient le lien magique `{{ .ConfirmationURL }}` (ne pas le supprimer !)

**Template "Reset Password" minimum** :

```html
<h2>Réinitialiser votre mot de passe Budgy</h2>
<p>Bonjour,</p>
<p>Vous avez demandé à réinitialiser votre mot de passe Budgy. Cliquez ci-dessous :</p>
<p><a href="{{ .ConfirmationURL }}">Choisir un nouveau mot de passe</a></p>
<p>Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez ce mail.</p>
<p>— L'équipe Budgy<br/>support@budgy.ch</p>
```

---

## ✅ Étape 5 — Auth Providers

`Authentication → Providers → Email`

```
☑ Enable Email provider
☑ Confirm email (recommandé pour App Store)
☐ Secure email change   (optionnel)
☑ Enable signup
Minimum password length : 8
```

> Si "Confirm email" est activé : l'utilisateur reçoit un mail de confirmation. **OBLIGATOIRE** d'avoir un SMTP qui marche (étape 3).

---

## ✅ Étape 6 — Rate Limits

`Authentication → Rate Limits`

Valeurs recommandées en production :

```
Email sends    : 10 / hour / IP
Sign-up        : 5 / hour / IP
Sign-in        : 10 / minute / IP
Password reset : 3 / hour / IP
```

Ces valeurs évitent le spam tout en restant tolérantes pour de vrais utilisateurs.

---

## 🧪 Test de validation E2E (à faire après config)

Sur ton iPhone TestFlight Build ≥67 :

1. **Signup** : créer un nouveau compte avec une adresse `test+date@budgy.ch`.
   - Attendu : message "Compte créé. Vérifiez votre email" + email reçu en <60s.
2. **Confirmation** : cliquer le lien dans l'email.
   - Attendu : ouverture de Budgy + login automatique.
3. **Mot de passe oublié** : depuis l'écran de login, taper "Mot de passe oublié" → entrer l'email.
   - Attendu : message "Email envoyé" + email reçu en <60s.
4. **Reset** : cliquer le lien dans l'email.
   - Attendu : ouverture de Budgy sur `/reset-password` + formulaire de nouveau mdp.
5. **Login** : se déconnecter, se reconnecter avec le nouveau mdp.
   - Attendu : succès, accès au dashboard.

---

## 🔥 Si "Unauthorized" persiste après cette checklist

Vérifier dans cet ordre :

1. **Logs Supabase** : `Dashboard → Logs → Auth`. Cherche `email_change` / `recovery_link` / `signup`. L'erreur réelle y est visible.
2. **JWT secret** : `Project Settings → API → JWT Secret`. Doit être ≥ 32 chars. Si modifié récemment, **redéployer le service Supabase**.
3. **Self-hosted GoTrue version** : doit être ≥ v2.150 pour supporter les redirect wildcards. `Docker logs supabase-auth | head -5`.
4. **Reverse proxy (Coolify)** : le header `Authorization` doit être conservé. Vérifier la conf Caddy/Traefik :
   ```
   header_up Authorization {http.request.header.Authorization}
   header_up Apikey {http.request.header.Apikey}
   ```

---

## 📞 Support

- Email : `support@budgy.ch`
- Docs Supabase : https://supabase.com/docs/guides/auth
- Status page : https://status.supabase.com
