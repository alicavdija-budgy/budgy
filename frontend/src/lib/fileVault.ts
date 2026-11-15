/**
 * BUDGY — Coffre de fichiers durable (TÂCHE 2).
 *
 * Copie les fichiers importés (contrats, factures…) depuis leur URI
 * TEMPORAIRE iOS (cache du picker / share sheet) vers un stockage DURABLE
 * de l'app (documentDirectory/vault/). Sans cette copie, iOS purge le cache
 * et la pièce jointe devient introuvable après redémarrage.
 *
 * Limites explicites : taille max et formats pris en charge — erreurs
 * codées (FILE_TOO_LARGE / UNSUPPORTED_FORMAT) traduites par l'appelant.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

// COHÉRENCE AVEC LE BACKEND : /api/scanner/ocr limite le base64 à 12 M de
// caractères (≈ 9 Mo bruts). Limite frontale fixée à 8 Mo : 8 Mo bruts →
// ~10,7 M caractères base64, TOUJOURS sous la limite serveur (jamais de 413
// surprise après un « succès » apparent côté client).
export const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB — limite explicite

const SUPPORTED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'heif', 'webp'];
// DOC/DOCX : AUCUN moteur de conversion n'est disponible dans l'app —
// refusés avec une erreur claire (jamais de faux succès).
const KNOWN_UNSUPPORTED = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip'];

export function extOf(uriOrName: string, mime?: string): string {
  const m = (mime || '').toLowerCase();
  if (m === 'application/pdf') return 'pdf';
  if (m.startsWith('image/')) {
    const sub = m.slice(6);
    if (sub === 'jpeg') return 'jpg';
    if (SUPPORTED_EXT.includes(sub)) return sub;
  }
  const clean = uriOrName.split('?')[0];
  const dot = clean.lastIndexOf('.');
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : '';
}

export class VaultError extends Error {
  code: 'FILE_TOO_LARGE' | 'UNSUPPORTED_FORMAT' | 'SAVE_FAILED';
  constructor(code: 'FILE_TOO_LARGE' | 'UNSUPPORTED_FORMAT' | 'SAVE_FAILED') {
    super(code);
    this.code = code;
  }
}

/** Vérifie format + taille AVANT tout traitement. Lance VaultError. */
export async function assertFileAcceptable(uri: string, mime?: string, name?: string): Promise<void> {
  const ext = extOf(name || uri, mime);
  if (KNOWN_UNSUPPORTED.includes(ext)) throw new VaultError('UNSUPPORTED_FORMAT');
  if (ext && !SUPPORTED_EXT.includes(ext) && !(mime || '').startsWith('text/')) {
    throw new VaultError('UNSUPPORTED_FORMAT');
  }
  if (Platform.OS === 'web') return; // taille vérifiée côté serveur (413)
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true } as any);
    const size = (info as any)?.size;
    if (typeof size === 'number' && size > MAX_FILE_BYTES) throw new VaultError('FILE_TOO_LARGE');
  } catch (e) {
    if (e instanceof VaultError) throw e;
    /* taille indisponible : on laisse passer, le backend limite à 413 */
  }
}

/**
 * Copie durable. Retourne l'URI PERMANENTE (vault) à stocker dans
 * PersonalDocument.pdfUri / photoUri. Lance VaultError('SAVE_FAILED') si la
 * copie échoue — l'import ne doit alors JAMAIS être annoncé comme réussi.
 */
export async function saveToVault(srcUri: string, id: string, mime?: string, name?: string): Promise<string> {
  if (Platform.OS === 'web') {
    // Web : seule une data URL est durable. Une URL temporaire (blob:/file:)
    // est CONVERTIE — jamais considérée durable telle quelle.
    if (srcUri.startsWith('data:')) return srcUri;
    try {
      const blob = await (await fetch(srcUri)).blob();
      if (!blob.size) throw new Error('empty');
      return await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
    } catch {
      throw new VaultError('SAVE_FAILED');
    }
  }
  const ext = extOf(name || srcUri, mime) || 'bin';
  const dir = `${FileSystem.documentDirectory}vault/`;
  // Nom UNIQUE : id + horodatage + aléa (aucun écrasement possible)
  const dest = `${dir}${id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
    let srcSize: number | undefined;
    try {
      const si = await FileSystem.getInfoAsync(srcUri, { size: true } as any);
      srcSize = (si as any)?.size;
    } catch { /* taille source indisponible */ }
    await FileSystem.copyAsync({ from: srcUri, to: dest });
    // INTÉGRITÉ : existence + taille réelle (> 0, égale à la source si connue)
    const check = await FileSystem.getInfoAsync(dest, { size: true } as any);
    const destSize = (check as any)?.size;
    const okSize = typeof destSize === 'number' && destSize > 0 &&
      (typeof srcSize !== 'number' || destSize === srcSize);
    if (!(check as any)?.exists || !okSize) {
      // sauvegarde interrompue/tronquée → on NETTOIE, aucun orphelin
      await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
      throw new Error('copy_truncated');
    }
    return dest;
  } catch (e) {
    if (!(e instanceof VaultError)) {
      await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
    }
    throw new VaultError('SAVE_FAILED');
  }
}

/** Vérifie qu'une pièce jointe existe réellement (relecture après sauvegarde). */
export async function vaultFileExists(uri?: string): Promise<boolean> {
  if (!uri) return false;
  if (uri.startsWith('data:')) return true;
  if (Platform.OS === 'web') return true;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return !!(info as any)?.exists;
  } catch {
    return false;
  }
}
