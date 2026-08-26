/**
 * BUDGY — API locale helper (v3.9.0)
 *
 * Central helper to pass the Budgy-selected locale to the backend.
 * The backend uses this value to localize:
 *   • Coach IA replies (/api/coach/chat)
 *   • User-facing UX messages emitted by /api/email/parse and /api/scanner/ocr
 *     (extracted DATA — merchant names, amounts, IBAN, references — is
 *     preserved verbatim from the source document, NEVER translated.)
 *
 * The selected app language is the SINGLE source of truth here — never fall
 * back to system locale, IP geolocation or message content sniffing.
 */
export type ApiLocale = 'fr' | 'en' | 'de' | 'it';

/**
 * Coerce any incoming lang string to a supported ApiLocale.
 * Falls back to `fr` (Budgy CH default) for unknown values.
 */
export function getApiLocale(lang: unknown): ApiLocale {
  const v = String(lang || '').toLowerCase().slice(0, 2);
  if (v === 'fr' || v === 'en' || v === 'de' || v === 'it') return v;
  return 'fr';
}
