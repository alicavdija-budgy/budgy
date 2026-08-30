/**
 * BUDGY — Centralized Supabase auth redirect targets.
 *
 * The password-recovery email must NEVER point at an internal hostname
 * (supabase-kong, localhost, a Docker/Coolify service name): those are
 * unreachable from a user's device. Production builds always use the public
 * app scheme (budgy://reset-password — see app.json "scheme"); Expo Go and
 * dev builds use the runtime-generated deep link so the flow stays testable
 * in development.
 *
 * Server-side, the Supabase SITE_URL / additional redirect allow-list must
 * include this URL (configured on the self-hosted Supabase instance).
 */
import * as Linking from 'expo-linking';

/** expo-router screen that handles the Supabase recovery callback. */
export const PASSWORD_RESET_PATH = 'reset-password';

/** Public production deep link (scheme from app.json). */
export const PASSWORD_RESET_REDIRECT = `budgy://${PASSWORD_RESET_PATH}`;

const FORBIDDEN_HOST_FRAGMENTS = [
  'supabase-kong',
  'kong:8000',
  'localhost',
  '127.0.0.1',
];

/**
 * Redirect URL passed to supabase.auth.resetPasswordForEmail().
 * Always public — falls back to the production deep link if the runtime
 * URL would leak an internal/dev hostname.
 */
export function getPasswordResetRedirectUrl(): string {
  if (!__DEV__) return PASSWORD_RESET_REDIRECT;
  try {
    const url = Linking.createURL(PASSWORD_RESET_PATH);
    if (url && !FORBIDDEN_HOST_FRAGMENTS.some((f) => url.includes(f))) {
      return url;
    }
  } catch {}
  return PASSWORD_RESET_REDIRECT;
}
