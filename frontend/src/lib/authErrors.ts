/**
 * BUDGY — Humanisation des erreurs Supabase Auth (v3.9.0 build 80)
 *
 * @i18n-technical-file — literal strings in this file are technical pattern
 * matchers only. Raw Supabase/API errors are never rendered to users.
 */

import { Platform } from 'react-native';

export interface HumanAuthError {
  titleKey: string;
  messageKey: string;
  hintKey?: string;
  /** Technical code for logging/branching — NEVER shown to the user. */
  _code: string;
}

const TAG = '[auth]';

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

  // Build 80: configuration/API-key failures must NEVER be presented as a
  // wrong password. Machine-only codes are mapped to translated service UX.
  if (
    lower.includes('supabase_config_missing') ||
    lower.includes('supabase not configured') ||
    lower.includes('invalid api key') ||
    lower.includes('no api key') ||
    lower.includes('apikey') ||
    lower.includes('api key') ||
    lower.includes('service unavailable') ||
    status === 502 ||
    status === 503 ||
    status === 504
  ) {
    return {
      titleKey: 'authErrors.networkTitle',
      messageKey: 'authErrors.networkMessage',
      _code: 'AUTH_SERVICE_UNAVAILABLE',
    };
  }

  // Explicit invalid credentials MUST be checked before the broad 401 block.
  if (lower.includes('invalid login') || lower.includes('invalid credentials')) {
    return {
      titleKey: 'authErrors.signInImpossibleTitle',
      messageKey: 'authErrors.invalidCredentialsMessage',
      hintKey: 'authErrors.forgotPasswordHint',
      _code: 'AUTH_INVALID_CREDENTIALS',
    };
  }

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

  if (lower.includes('email not confirmed') || lower.includes('confirm your email')) {
    return {
      titleKey: 'authErrors.emailNotConfirmedTitle',
      messageKey: 'authErrors.emailNotConfirmedMessage',
      hintKey: 'authErrors.checkSpam',
      _code: 'AUTH_EMAIL_NOT_CONFIRMED',
    };
  }

  if (lower.includes('password should be') || lower.includes('weak password')) {
    return {
      titleKey: 'authErrors.weakPasswordTitle',
      messageKey: 'authErrors.weakPasswordMessage',
      _code: 'AUTH_WEAK_PASSWORD',
    };
  }

  if (lower.includes('invalid email') || lower.includes('email address')) {
    return {
      titleKey: 'authErrors.invalidEmailTitle',
      messageKey: 'authErrors.invalidEmailMessage',
      _code: 'AUTH_INVALID_EMAIL',
    };
  }

  if (lower.includes('rate limit') || lower.includes('too many requests') || status === 429) {
    return {
      titleKey: 'authErrors.rateLimitTitle',
      messageKey: 'authErrors.rateLimitMessage',
      _code: 'AUTH_RATE_LIMIT',
    };
  }

  if (
    lower.includes('confirmation email') ||
    lower.includes('sending') ||
    lower.includes('smtp') ||
    lower.includes('email rate limit') ||
    lower.includes('error sending recovery email') ||
    lower.includes('email address not authorized')
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

  if (
    lower.includes('network') ||
    lower.includes('fetch failed') ||
    lower.includes('offline') ||
    lower.includes('timeout') ||
    lower.includes('econnrefused') ||
    lower.includes('failed to fetch') ||
    (Platform.OS === 'web' && lower.includes('load failed'))
  ) {
    return {
      titleKey: 'authErrors.networkTitle',
      messageKey: 'authErrors.networkMessage',
      _code: 'AUTH_NETWORK',
    };
  }

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
