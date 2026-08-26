/**
 * BUDGY — File system compatibility layer
 *
 * @i18n-technical-file
 *
 * ⚠ Throws thrown here are FR-CH default messages caught upstream and mapped
 * to translated UI errors by humanizeError() and the callers.
 *
 * expo-file-system v19+ removed the `EncodingType.Base64` enum (it now uses
 * either string literals or the new modular File API). Anywhere we used
 * `FileSystem.EncodingType.Base64` we got `Cannot read property 'Base64'
 * of undefined` at runtime on iOS 17+ devices.
 *
 * This shim provides a consistent `readAsBase64(uri)` that works on both
 * legacy (v17/v18) and v19+ versions of expo-file-system, with verbose
 * logging so device-side errors are easy to diagnose in TestFlight logs.
 */

import * as FileSystem from 'expo-file-system';

const TAG = '[fs-compat]';

/**
 * Read a file URI and return its content as a base64-encoded string.
 * Falls back through three strategies in order.
 */
export async function readAsBase64(uri: string): Promise<string> {
  if (!uri) throw new Error('readAsBase64: empty uri');

  // Strategy 1 — legacy enum (v17/v18)
  try {
    const enc = (FileSystem as any).EncodingType?.Base64;
    if (enc) {
      console.log(`${TAG} reading via EncodingType.Base64 →`, uri);
      return await (FileSystem as any).readAsStringAsync(uri, { encoding: enc });
    }
  } catch (e) {
    console.warn(`${TAG} strategy#1 (EncodingType) failed:`, e);
  }

  // Strategy 2 — string literal (v19+ retains the legacy method)
  try {
    if (typeof (FileSystem as any).readAsStringAsync === 'function') {
      console.log(`${TAG} reading via readAsStringAsync('base64') →`, uri);
      return await (FileSystem as any).readAsStringAsync(uri, { encoding: 'base64' as any });
    }
  } catch (e) {
    console.warn(`${TAG} strategy#2 (string literal) failed:`, e);
  }

  // Strategy 3 — new modular File API (v19+)
  try {
    const FileCtor = (FileSystem as any).File;
    if (FileCtor) {
      console.log(`${TAG} reading via new File(uri).base64() →`, uri);
      const file = new FileCtor(uri);
      if (typeof file.base64 === 'function') return await file.base64();
      if (typeof file.text === 'function') {
        const txt: string = await file.text();
        if (typeof Buffer !== 'undefined') return Buffer.from(txt).toString('base64');
        // RN polyfill — btoa on iso-8859-1 only; fallback minimal
        return globalThis.btoa ? globalThis.btoa(unescape(encodeURIComponent(txt))) : '';
      }
    }
  } catch (e) {
    console.warn(`${TAG} strategy#3 (File API) failed:`, e);
  }

  throw new Error(
    'Impossible de lire ce fichier. Vérifiez que vous avez accordé l\'accès aux fichiers à Budgy.'
  );
}

/**
 * Read a file URI and return its content as plain text (utf8).
 */
export async function readAsText(uri: string): Promise<string> {
  if (!uri) throw new Error('readAsText: empty uri');
  try {
    if (typeof (FileSystem as any).readAsStringAsync === 'function') {
      console.log(`${TAG} reading text →`, uri);
      return await (FileSystem as any).readAsStringAsync(uri);
    }
  } catch (e) {
    console.warn(`${TAG} readAsText legacy failed:`, e);
  }
  try {
    const FileCtor = (FileSystem as any).File;
    if (FileCtor) {
      console.log(`${TAG} reading text via new File(uri).text() →`, uri);
      const file = new FileCtor(uri);
      if (typeof file.text === 'function') return await file.text();
    }
  } catch (e) {
    console.warn(`${TAG} readAsText new API failed:`, e);
  }
  throw new Error('Impossible de lire ce fichier.');
}
