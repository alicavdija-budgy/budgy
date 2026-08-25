/**
 * BUDGY — Humanisation des erreurs Supabase Auth (v3.9.0 build 73)
 *
 * Retourne des CLÉS i18n (pas de texte). L'UI appelle t(h.titleKey) pour
 * afficher le message dans la langue de l'utilisateur (fr/en/de/it).
 *
 * Règle : l'utilisateur NE DOIT JAMAIS voir "Unauthorized", "AuthApiError",
 * "401" ou tout code technique. Le mapping technique Supabase reste unique;
 * seuls les textes passent par i18n.
 *
 * Logs développeur uniquement via console.warn (jamais Alert).
 */

import { Platform } from 'react-native';

export interface HumanAuthError {
  /** i18n key for the title (e.g. `authErrors.signInUnauthorizedTitle`) */
  titleKey: string;
  /** i18n key for the body message */
  messageKey: string;
  /** Optional i18n key for a hint / suggestion */
  hintKey?: string;
  /** Technical code for logging — NEVER shown to the user */
  _code: string;
}

const TAG = '[auth]';

/** Convenience helper for callers who receive an HumanAuthError.
 *  Usage: `Alert.alert(...toAlert(h, t))`  */
export function toAlert(
  h: HumanAuthError,
  t: (k: string, p?: any) => string,
): [string, string] {
  return [t(h.titleKey), t(h.messageKey) + (h.hintKey ? '\n\n' + t(h.hintKey) : '')];
}

export function humanizeAuthError(
  err: unknown,
  context: 'signUp' | 'signIn' | 'resetPassword' | 'updatePassword' | 'verifyOtp',
): HumanAuthError {
  const raw = String((err as any)?.message || err || '').trim();
  const status = (err as any)?.status ?? (err as any)?.statusCode;
  const lower = raw.toLowerCase();

  if (__DEV__) {
    console.warn(`${TAG} ${context} raw error:`, raw, 'status:', status);
  }

  // ── Unauthorized / 401 / token / session ─────────────────────────────
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
        titleKey: 'authErrors.signUpUnauthorizedTitle',
        messageKey: 'authErrors.signUpUnauthorizedMessage',
        hintKey: 'authErrors.contactSupport',
        _code: 'AUTH_SIGNUP_UNAUTHORIZED',
      };
    }
    if (context === 'resetPassword') {
      return {
        titleKey: 'authErrors.resetEmailNotSentTitle',
        messageKey: 'authErrors.resetEmailNotSentMessage',
        hintKey: 'authErrors.checkSpamOrSupport',
        _code: 'AUTH_RESET_UNAUTHORIZED',
      };
    }
    return {
      titleKey: 'authErrors.signInImpossibleTitle',
      messageKey: 'authErrors.invalidCredentialsMessage',
      hintKey: 'authErrors.forgotPasswordHint',
      _code: 'AUTH_SIGNIN_UNAUTHORIZED',
    };
  }

  // ── Invalid credentials (explicit) ───────────────────────────────────
  if (lower.includes('invalid login') || lower.includes('invalid credentials')) {
    return {
      titleKey: 'authErrors.signInImpossibleTitle',
      messageKey: 'authErrors.invalidCredentialsMessage',
      hintKey: 'authErrors.forgotPasswordHint',
      _code: 'AUTH_INVALID_CREDENTIALS',
    };
  }

  // ── User already exists ──────────────────────────────────────────────
  if (
    lower.includes('user already registered') ||
    lower.includes('already exists') ||
    lower.includes('email taken')
  ) {
    return {
      titleKey: 'authErrors.userExistsTitle',
      messageKey: 'authErrors.userExistsMessage',
      _code: 'AUTH_USER_EXISTS',
    };
  }

  // ── Email not confirmed ──────────────────────────────────────────────
  if (lower.includes('email not confirmed') || lower.includes('confirm your email')) {
    return {
      titleKey: 'authErrors.emailNotConfirmedTitle',
      messageKey: 'authErrors.emailNotConfirmedMessage',
      hintKey: 'authErrors.checkSpam',
      _code: 'AUTH_EMAIL_NOT_CONFIRMED',
    };
  }

  // ── Weak password ────────────────────────────────────────────────────
  if (lower.includes('password should be') || lower.includes('weak password')) {
    return {
      titleKey: 'authErrors.weakPasswordTitle',
      messageKey: 'authErrors.weakPasswordMessage',
      _code: 'AUTH_WEAK_PASSWORD',
    };
  }

  // ── Invalid email ────────────────────────────────────────────────────
  if (lower.includes('invalid email') || lower.includes('email address')) {
    return {
      titleKey: 'authErrors.invalidEmailTitle',
      messageKey: 'authErrors.invalidEmailMessage',
      _code: 'AUTH_INVALID_EMAIL',
    };
  }

  // ── Rate limit ───────────────────────────────────────────────────────
  if (lower.includes('rate limit') || lower.includes('too many requests') || status === 429) {
    return {
      titleKey: 'authErrors.rateLimitTitle',
      messageKey: 'authErrors.rateLimitMessage',
      _code: 'AUTH_RATE_LIMIT',
    };
  }

  // ── SMTP / Email sending down ────────────────────────────────────────
  if (
    lower.includes('confirmation email') ||
    lower.includes('sending') ||
    lower.includes('smtp') ||
    lower.includes('email rate limit')
  ) {
    if (context === 'resetPassword') {
      return {
        titleKey: 'authErrors.smtpDownTitle',
        messageKey: 'authErrors.smtpDownMessage',
        hintKey: 'authErrors.contactSupport',
        _code: 'AUTH_SMTP_DOWN',
      };
    }
    return {
      titleKey: 'authErrors.smtpDownSignupTitle',
      messageKey: 'authErrors.smtpDownSignupMessage',
      _code: 'AUTH_SMTP_DOWN_SIGNUP',
    };
  }

  // ── Network / offline ────────────────────────────────────────────────
  if (
    lower.includes('network') ||
    lower.includes('fetch failed') ||
    lower.includes('offline') ||
    lower.includes('timeout') ||
    lower.includes('econnrefused') ||
    (Platform.OS === 'web' && lower.includes('failed to fetch'))
  ) {
    return {
      titleKey: 'authErrors.networkTitle',
      messageKey: 'authErrors.networkMessage',
      _code: 'AUTH_NETWORK',
    };
  }

  // ── Catch-all — never surface raw Supabase strings ───────────────────
  if (context === 'signUp') {
    return {
      titleKey: 'authErrors.signUpGenericTitle',
      messageKey: 'authErrors.signUpGenericMessage',
      hintKey: 'authErrors.contactSupport',
      _code: 'AUTH_SIGNUP_GENERIC',
    };
  }
  if (context === 'resetPassword') {
    return {
      titleKey: 'authErrors.resetEmailNotSentTitle',
      messageKey: 'authErrors.resetGenericMessage',
      hintKey: 'authErrors.contactSupport',
      _code: 'AUTH_RESET_GENERIC',
    };
  }
  if (context === 'updatePassword') {
    return {
      titleKey: 'authErrors.updateGenericTitle',
      messageKey: 'authErrors.updateGenericMessage',
      _code: 'AUTH_UPDATE_GENERIC',
    };
  }
  return {
    titleKey: 'authErrors.signInImpossibleTitle',
    messageKey: 'authErrors.signInGenericMessage',
    hintKey: 'authErrors.forgotPasswordHint',
    _code: 'AUTH_SIGNIN_GENERIC',
  };
}
