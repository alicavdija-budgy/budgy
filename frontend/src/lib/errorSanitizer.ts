/**
 * BUDGY — Error sanitizer
 *
 * @i18n-technical-file
 *
 * ⚠ Central mapping table from raw technical errors → HumanizedError.
 * Titles and messages here are FR-CH defaults used when no `t` translator
 * is available at call time (background jobs, module init). All UI-visible
 * error displays go through `t('errors.<code>')` in the calling components.
 *
 * Full multi-locale error codes are planned as a follow-up (v3.9.1): each
 * pattern will emit a stable `code` field and the UI will translate.
 *
 * Converts ANY raw technical error (litellm.BadRequestError, OpenAIException,
 * HTTP 404, JSON Parse error, unsupported image format, gpt-4o-mini, etc.)
 * into a clean human message suitable for display in the app.
 *
 * Always use this before showing an error to the user.
 */
export interface HumanizedError {
  title: string;
  message: string;
  /** Optional suggested fallback action label. */
  fallback?: string;
}

const TECH_PATTERNS: { match: RegExp; out: HumanizedError }[] = [
  // iOS share / file access
  { match: /shareasync.?failed|no access to provided file|file does not exist|cannot read property.*path/i,
    out: {
      title: 'Fichier inaccessible',
      message: 'Impossible d\'accéder au fichier partagé. Réessayez depuis Fichiers ou Mail.',
      fallback: 'Réessayer',
    } },
  // Coolify mis-routing (api.budgy.ch pointing to Coolify dashboard instead of the app)
  { match: /coolify\.io|coolify_dashboard|"docs":"https?:\/\/coolify\.io/i,
    out: {
      title: 'Service indisponible',
      message: 'Notre service est en cours de redémarrage. Réessayez dans quelques minutes. Si le problème persiste, contactez le support.',
    } },
  // LLM / OpenAI errors
  { match: /unsupported image format|invalid_image_format|image format.*not supported/i,
    out: {
      title: 'Format non reconnu',
      message: 'Ce fichier n\'a pas pu être analysé. Le PDF original a été conservé et vous pouvez ajouter manuellement.',
      fallback: 'Saisir manuellement',
    } },
  { match: /litellm|openai\.|openaiexception|model_not_found|rate_?limit|insufficient_quota|api[\s_-]?key|authentication.?error/i,
    out: {
      title: 'Service IA momentanément indisponible',
      message: 'L\'analyse IA n\'a pas pu aboutir. Réessayez dans quelques instants ou saisissez manuellement les informations.',
      fallback: 'Saisir manuellement',
    } },
  // Network / HTTP
  { match: /JSON Parse error|Unexpected character/i,
    out: {
      title: 'Réponse invalide du serveur',
      message: 'Le serveur a renvoyé une réponse inattendue. Réessayez dans quelques instants.',
    } },
  { match: /HTTP\s*404|status code 404|not found/i,
    out: {
      title: 'Service momentanément indisponible',
      message: 'Cette fonctionnalité n\'est pas accessible pour le moment. Réessayez plus tard.',
    } },
  { match: /HTTP\s*5\d{2}|status code 5\d{2}|internal server error/i,
    out: {
      title: 'Problème serveur',
      message: 'Le serveur rencontre un problème temporaire. Nos équipes ont été notifiées.',
    } },
  { match: /HTTP\s*40[0-9]|status code 40[0-9]/i,
    out: {
      title: 'Demande refusée',
      message: 'Le serveur a refusé la demande. Vérifiez les informations et réessayez.',
    } },
  { match: /aborted|abort.*error|timeout/i,
    out: {
      title: 'Délai dépassé',
      message: 'Le serveur met trop de temps à répondre. Vérifiez votre Internet et réessayez.',
    } },
  { match: /Network request failed|fetch failed|net::ERR|networkerror/i,
    out: {
      title: 'Connexion impossible',
      message: 'Vérifiez votre Internet et réessayez. Vos données restent en sécurité hors ligne.',
    } },
  // Image / file errors
  { match: /image trop petite|image too small|too small/i,
    out: {
      title: 'Image trop petite',
      message: 'Reprenez la photo avec un meilleur cadrage ou choisissez une image plus grande.',
    } },
  { match: /heic|heif/i,
    out: {
      title: 'Format HEIC',
      message: 'Conversion HEIC→JPEG en cours. Réessayez dans un instant.',
    } },
  // Auth
  { match: /unauthorized|401|forbidden|403/i,
    out: {
      title: 'Authentification requise',
      message: 'Connectez-vous pour continuer.',
    } },
];

/**
 * Convert any error object/message to a user-friendly HumanizedError.
 * Safe for any input — never throws.
 */
export function humanizeError(err: unknown, fallback?: Partial<HumanizedError>): HumanizedError {
  const raw =
    typeof err === 'string'
      ? err
      : err && typeof err === 'object' && 'message' in err
        ? String((err as { message: string }).message)
        : err
          ? String(err)
          : '';
  for (const p of TECH_PATTERNS) {
    if (p.match.test(raw)) return p.out;
  }
  return {
    title: fallback?.title || 'Une erreur est survenue',
    message: fallback?.message || 'Réessayez dans quelques instants.',
    fallback: fallback?.fallback,
  };
}

/**
 * Convenience: produce just the human-readable message (no title).
 */
export function humanErrorMessage(err: unknown, fallback?: string): string {
  return humanizeError(err, { message: fallback }).message;
}
