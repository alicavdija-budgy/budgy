/**
 * BUDGY — Safe file sharing & iOS-imported file handling.
 *
 * Two recurring iOS pain points are handled here:
 *
 * 1. `Sharing.shareAsync(uri)` fails when the URI is a temp path that iOS has
 *    already invalidated (or that the app does not have permission for).
 *    Solution: always *copy* the file into the app's documentDirectory first,
 *    then share that stable copy.
 *
 * 2. Files received from `expo-share-intent`, `expo-document-picker` or
 *    `expo-image-picker` often live in `.../tmp/...` which iOS may purge at
 *    any moment. `persistIncomingFile()` makes a permanent copy with a
 *    deterministic name and returns the new URI so callers can use it later
 *    (e.g. open from history, attach to a contract, etc.).
 *
 * NEVER pass a raw share-intent URI to `shareAsync`, `fetch`, or `FileSystem.readAsStringAsync`.
 * Always go through `persistIncomingFile` (or `safeShareFile`) first.
 */
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { humanizeError } from './errorSanitizer';

// expo-file-system v19 hides documentDirectory behind the new modular API
// but keeps the legacy paths working at runtime. Cast through `any` so TS
// stays happy across versions.
const FS = FileSystem as any;
const BASE_DIR = ((FS.documentDirectory as string) || (FS.cacheDirectory as string) || '') + 'budgy-files/';

async function ensureBaseDir(): Promise<string> {
  try {
    const info = await FS.getInfoAsync?.(BASE_DIR);
    if (info && !info.exists) {
      await FS.makeDirectoryAsync?.(BASE_DIR, { intermediates: true });
    }
  } catch {}
  return BASE_DIR;
}

function pickExtension(uri: string, mime?: string | null): string {
  const fromUri = (uri.match(/\.([a-zA-Z0-9]{1,6})(?:\?|$)/) || [])[1];
  if (fromUri) return fromUri.toLowerCase();
  if (!mime) return 'bin';
  if (/pdf/i.test(mime)) return 'pdf';
  if (/jpeg|jpg/i.test(mime)) return 'jpg';
  if (/png/i.test(mime)) return 'png';
  if (/heic|heif/i.test(mime)) return 'heic';
  if (/text\/plain/i.test(mime)) return 'txt';
  return 'bin';
}

function safeFileName(name: string | null | undefined, ext: string): string {
  const cleaned = (name || `file_${Date.now()}`)
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .slice(0, 80);
  const finalName = cleaned.toLowerCase().endsWith('.' + ext) ? cleaned : `${cleaned}.${ext}`;
  return finalName;
}

/**
 * Copy any incoming file (share-intent, document picker, image picker, …)
 * into a persistent location inside the sandbox. Returns the new local URI.
 *
 * On web (or if anything goes wrong), the original URI is returned untouched
 * so the caller can still proceed in best-effort mode.
 */
export async function persistIncomingFile(
  uri: string,
  opts?: { name?: string; mime?: string }
): Promise<string> {
  if (!uri) return uri;
  if (Platform.OS === 'web') return uri;
  if (uri.startsWith('data:')) return uri; // base64 in memory — nothing to copy

  try {
    const dir = await ensureBaseDir();
    const ext = pickExtension(uri, opts?.mime);
    const finalName = safeFileName(opts?.name || null, ext);
    const dest = `${dir}${Date.now()}_${finalName}`;
    // Use copyAsync so the original temp file is left untouched
    await FS.copyAsync?.({ from: uri, to: dest });
    return dest;
  } catch (e) {
    console.warn('[persistIncomingFile] copy failed, returning original URI', e);
    return uri;
  }
}

/**
 * Share a file with the iOS / Android share sheet.
 * Always copies to documentDirectory first to dodge tmp-uri permission issues.
 *
 * @returns true if the share sheet was presented, false if user/device cancelled.
 */
export async function safeShareFile(
  uri: string,
  opts?: { name?: string; mime?: string; dialogTitle?: string }
): Promise<{ ok: boolean; error?: string }> {
  if (!uri) return { ok: false, error: 'Aucun fichier à partager.' };

  try {
    const available = await Sharing.isAvailableAsync();
    if (!available) {
      return { ok: false, error: 'Le partage de fichiers n\'est pas disponible sur cet appareil.' };
    }
    const persisted = await persistIncomingFile(uri, opts);
    await Sharing.shareAsync(persisted, {
      mimeType: opts?.mime,
      dialogTitle: opts?.dialogTitle || 'Partager le document',
      UTI: opts?.mime === 'application/pdf' ? 'com.adobe.pdf' : undefined,
    });
    return { ok: true };
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (/cancel|dismissed/i.test(msg)) {
      // User dismissed the share sheet — treat as success no-op
      return { ok: true };
    }
    if (/no access to provided file|file does not exist|shareasync failed/i.test(msg)) {
      return {
        ok: false,
        error: 'Impossible d\'accéder au fichier partagé. Réessayez depuis Fichiers ou Mail.',
      };
    }
    return { ok: false, error: humanizeError(e).message };
  }
}
