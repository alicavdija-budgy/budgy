/**
 * BUDGY — Humanisation des erreurs Supabase Auth (v3.7.27)
 *
 * Règle : l'utilisateur NE DOIT JAMAIS voir "Unauthorized", "AuthApiError",
 * "401" ou tout code technique. On mappe chaque message Supabase connu
 * vers un message UX clair en français.
 *
 * Logs développeur uniquement via console.warn (jamais Alert).
 */

import { Platform } from 'react-native';

export interface HumanAuthError {
  title: string;
  message: string;
  /** Suggestion d'action concrète (bouton secondaire optionnel) */
  hint?: string;
  /** Code technique pour debug — JAMAIS affiché à l'utilisateur */
  _code: string;
}

const TAG = '[auth]';

/**
 * Cartographie Supabase → UX français.
 * Toutes les variantes de "Unauthorized" / 401 / SMTP / rate-limit gérées.
 */
export function humanizeAuthError(
  err: unknown,
  context: 'signUp' | 'signIn' | 'resetPassword' | 'updatePassword' | 'verifyOtp',
): HumanAuthError {
  const raw = String((err as any)?.message || err || '').trim();
  const status = (err as any)?.status ?? (err as any)?.statusCode;
  const lower = raw.toLowerCase();

  // Logs développeur uniquement (sera filtré en prod par metro / sentry)
  if (__DEV__) {
    console.warn(`${TAG} ${context} raw error:`, raw, 'status:', status);
  }

  // ── Cas Unauthorized / 401 / token / session ─────────────────────────────
  if (
    lower.includes('unauthorized') ||
    lower === 'invalid' ||
    status === 401 ||
    lower.includes('jwt') ||
    lower.includes('refresh_token') ||
    lower.includes('invalid token')
  ) {
    if (context === 'signUp') {
      return {
        title: 'Création de compte impossible',
        message:
          "Le serveur Budgy n'a pas pu créer votre compte. Vérifiez votre connexion ou réessayez dans quelques instants.",
        hint: 'Si le problème persiste, contactez support@budgy.ch',
        _code: 'AUTH_SIGNUP_UNAUTHORIZED',
      };
    }
    if (context === 'resetPassword') {
      return {
        title: 'Email non envoyé',
        message:
          "Impossible d'envoyer l'email de réinitialisation. Vérifiez votre adresse et réessayez.",
        hint: 'Vérifiez aussi votre dossier spam ou contactez support@budgy.ch.',
        _code: 'AUTH_RESET_UNAUTHORIZED',
      };
    }
    return {
      title: 'Connexion impossible',
      message: 'Email ou mot de passe incorrect.',
      hint: 'Vous pouvez réinitialiser votre mot de passe si besoin.',
      _code: 'AUTH_SIGNIN_UNAUTHORIZED',
    };
  }

  // ── Identifiants invalides (cas explicite Supabase) ──────────────────────
  if (lower.includes('invalid login') || lower.includes('invalid credentials')) {
    return {
      title: 'Connexion impossible',
      message: 'Email ou mot de passe incorrect.',
      hint: 'Mot de passe oublié ? Touchez le lien sous le formulaire.',
      _code: 'AUTH_INVALID_CREDENTIALS',
    };
  }

  // ── Compte déjà existant ─────────────────────────────────────────────────
  if (
    lower.includes('user already registered') ||
    lower.includes('already exists') ||
    lower.includes('email taken')
  ) {
    return {
      title: 'Compte déjà existant',
      message:
        'Un compte Budgy existe déjà avec cette adresse. Connectez-vous ou utilisez "Mot de passe oublié".',
      _code: 'AUTH_USER_EXISTS',
    };
  }

  // ── Email non confirmé ──────────────────────────────────────────────────
  if (lower.includes('email not confirmed') || lower.includes('confirm your email')) {
    return {
      title: 'Email non confirmé',
      message:
        "Vérifiez votre boîte mail pour activer votre compte (le mail peut prendre 1-2 minutes).",
      hint: 'Pensez à regarder dans les spams.',
      _code: 'AUTH_EMAIL_NOT_CONFIRMED',
    };
  }

  // ── Mot de passe trop faible ────────────────────────────────────────────
  if (lower.includes('password should be') || lower.includes('weak password')) {
    return {
      title: 'Mot de passe trop faible',
      message: 'Choisissez un mot de passe d\'au moins 8 caractères avec lettres et chiffres.',
      _code: 'AUTH_WEAK_PASSWORD',
    };
  }

  // ── Email invalide ──────────────────────────────────────────────────────
  if (lower.includes('invalid email') || lower.includes('email address')) {
    return {
      title: 'Email invalide',
      message: 'Vérifiez que votre adresse email est correctement écrite (ex: nom@exemple.ch).',
      _code: 'AUTH_INVALID_EMAIL',
    };
  }

  // ── Rate limit ──────────────────────────────────────────────────────────
  if (lower.includes('rate limit') || lower.includes('too many requests') || status === 429) {
    return {
      title: 'Trop de tentatives',
      message: 'Veuillez patienter quelques minutes avant de réessayer.',
      _code: 'AUTH_RATE_LIMIT',
    };
  }

  // ── SMTP / Email confirmation envoi impossible ──────────────────────────
  if (
    lower.includes('confirmation email') ||
    lower.includes('sending') ||
    lower.includes('smtp') ||
    lower.includes('email rate limit')
  ) {
    if (context === 'resetPassword') {
      return {
        title: 'Service email temporairement indisponible',
        message:
          "Nous n'arrivons pas à envoyer l'email pour le moment. Réessayez dans quelques minutes.",
        hint: 'Si le problème persiste, contactez support@budgy.ch.',
        _code: 'AUTH_SMTP_DOWN',
      };
    }
    return {
      title: 'Compte créé (en attente)',
      message:
        "Votre compte a bien été créé mais l'email de confirmation n'a pas pu partir. Vous pourrez vous connecter dès que notre service email sera rétabli.",
      _code: 'AUTH_SMTP_DOWN_SIGNUP',
    };
  }

  // ── Réseau / offline ────────────────────────────────────────────────────
  if (
    lower.includes('network') ||
    lower.includes('fetch failed') ||
    lower.includes('offline') ||
    lower.includes('timeout') ||
    lower.includes('econnrefused') ||
    Platform.OS === 'web' && lower.includes('failed to fetch')
  ) {
    return {
      title: 'Pas de connexion',
      message: 'Vérifiez votre connexion Internet puis réessayez.',
      _code: 'AUTH_NETWORK',
    };
  }

  // ── Catch-all : on N'AFFICHE JAMAIS le message brut Supabase ────────────
  if (context === 'signUp') {
    return {
      title: 'Création de compte impossible',
      message:
        'Une erreur est survenue lors de la création de votre compte. Réessayez dans un instant.',
      hint: 'Si le problème persiste, contactez support@budgy.ch.',
      _code: 'AUTH_SIGNUP_GENERIC',
    };
  }
  if (context === 'resetPassword') {
    return {
      title: 'Email non envoyé',
      message:
        "Impossible d'envoyer l'email de réinitialisation pour le moment. Réessayez dans quelques instants.",
      hint: 'Si le problème persiste, contactez support@budgy.ch.',
      _code: 'AUTH_RESET_GENERIC',
    };
  }
  if (context === 'updatePassword') {
    return {
      title: 'Mot de passe non mis à jour',
      message: 'Impossible de mettre à jour votre mot de passe. Réessayez ou demandez un nouveau lien.',
      _code: 'AUTH_UPDATE_GENERIC',
    };
  }
  return {
    title: 'Connexion impossible',
    message: 'Une erreur est survenue. Vérifiez vos identifiants puis réessayez.',
    hint: 'Mot de passe oublié ? Utilisez le lien sous le formulaire.',
    _code: 'AUTH_SIGNIN_GENERIC',
  };
}
