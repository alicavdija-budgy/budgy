# Budgy — Production Supabase Auth email configuration

This document is intentionally secret-free. Never commit SMTP passwords, Supabase service-role keys, JWT secrets or Apple private keys.

## Goal

Budgy uses the self-hosted Supabase Auth (GoTrue) service at `https://supabase.budgy.ch` for account confirmation and password recovery. Production auth emails should be sent with a verified Budgy domain identity.

Recommended sender identity:

- From address: `support@budgy.ch`
- Sender name: `Budgy Support`
- Reply-To: `support@budgy.ch` when supported by the SMTP provider

Use a transactional SMTP provider (AWS SES, Postmark, Resend SMTP, Brevo, SendGrid, etc.) rather than a personal mailbox SMTP. Configure SPF and DKIM for `budgy.ch` in the provider before App Store submission.

## Supabase self-hosted SMTP variables

Configure these on the **Supabase service / Auth stack**, not on the Budgy frontend application:

```env
SMTP_ADMIN_EMAIL=support@budgy.ch
SMTP_HOST=<provider SMTP host>
SMTP_PORT=<provider SMTP port, normally 465 or 587>
SMTP_USER=<provider SMTP username>
SMTP_PASS=<provider SMTP password>
SMTP_SENDER_NAME=Budgy Support
```

Depending on the Coolify Supabase template/version these may be wired into GoTrue as `GOTRUE_SMTP_*` variables internally. Follow the variables already exposed by the deployed Supabase template rather than duplicating incompatible names.

## Auth redirect configuration

The native password-reset link must be allowed to return to Budgy:

```text
budgy://reset-password
```

The Supabase Auth allow-list must permit this URI. The application scheme is `budgy` in `frontend/app.json` and the recovery screen is `frontend/app/reset-password.tsx`.

For web flows also keep the production site URL/allow-list aligned with:

```text
https://budgy.ch
https://www.budgy.ch
```

## EAS production client configuration

The native app needs the **public** Supabase values at build time:

```env
EXPO_PUBLIC_SUPABASE_URL=https://supabase.budgy.ch
EXPO_PUBLIC_SUPABASE_ANON_KEY=<matching public anon key>
```

`EXPO_PUBLIC_SUPABASE_ANON_KEY` belongs in the EAS `production` environment. It must never be replaced with `SUPABASE_SERVICE_ROLE_KEY`.

## Mandatory TestFlight acceptance test

Before submitting a build to Apple, run all of these against production services:

1. Register a brand-new email address.
2. Receive the confirmation email if email confirmation is enabled.
3. Sign in with the created account.
4. Request a password reset.
5. Confirm the email arrives from `Budgy Support <support@budgy.ch>`.
6. Open the recovery link on the iPhone and verify Budgy opens the reset-password screen.
7. Set a new password and sign in with it.
8. Open the paywall while authenticated.
9. Purchase or restore a StoreKit subscription.
10. Confirm `/api/iap/me` sync results in Pro access.

Do not submit to App Review if any of steps 1–10 fails.
