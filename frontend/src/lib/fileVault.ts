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

export const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB — limite explicite

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
  if (Platform.OS === 'web') return srcUri; // web : data URL déjà durable
  const ext = extOf(name || srcUri, mime) || 'bin';
  const dir = `${FileSystem.documentDirectory}vault/`;
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
    const dest = `${dir}${id}.${ext}`;
    await FileSystem.copyAsync({ from: srcUri, to: dest });
    const check = await FileSystem.getInfoAsync(dest);
    if (!(check as any)?.exists) throw new Error('copy_not_found');
    return dest;
  } catch {
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
