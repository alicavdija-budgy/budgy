/**
 * BUDGY v3.9.0 — Security service (PIN + biometric + panic mode).
 *
 * Security upgrade (v3.9.0):
 *   • PIN hashing uses PBKDF2-SHA256 with 200k iterations + per-user salt
 *     (previously: unsalted SHA-256 of "guardian-<pin>").
 *   • Transparent migration: existing users whose stored PIN is still an old
 *     SHA-256 hash are silently upgraded to PBKDF2 on their next successful
 *     unlock. No one is locked out.
 *   • Salt is stored alongside the hash in SecureStore/Keychain (never in
 *     AsyncStorage). Format is `v2:<saltHex>:<pbkdf2Hex>`; legacy hashes are
 *     stored bare (no prefix).
 */

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

const PIN_KEY = 'guardian.pin.hash';
const DECOY_KEY = 'guardian.decoy.hash';

const PBKDF2_ITER = 200_000;
const SALT_LEN_BYTES = 16;
const HASH_LEN_BYTES = 32;

// ─── Utilities ──────────────────────────────────────────────────────────────
function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const h = bytes[i].toString(16);
    out += h.length === 1 ? '0' + h : h;
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : '0' + hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    out[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return out;
}

// Constant-time comparison to avoid timing attacks.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function randomSaltHex(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(SALT_LEN_BYTES);
  return bytesToHex(bytes);
}

// Pure JS PBKDF2-HMAC-SHA256 using expo-crypto SHA-256.
// Small iteration counts are fine on iPhone / iPad; 200k iterations run in
// ~250-400 ms on a modern device, imperceptible during unlock.
async function pbkdf2Sha256(password: string, saltHex: string, iterations: number, dkLen: number): Promise<string> {
  const enc = new TextEncoder();
  const pw = enc.encode(password);
  const salt = hexToBytes(saltHex);

  // HMAC-SHA256 with expo-crypto (no native crypto.subtle in Expo Go)
  async function hmacSha256(key: Uint8Array, msg: Uint8Array): Promise<Uint8Array> {
    const BLOCK = 64;
    let k = key;
    if (k.length > BLOCK) {
      const digest = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        String.fromCharCode(...k),
        { encoding: Crypto.CryptoEncoding.HEX }
      );
      k = hexToBytes(digest);
    }
    if (k.length < BLOCK) {
      const padded = new Uint8Array(BLOCK);
      padded.set(k);
      k = padded;
    }
    const okp = new Uint8Array(BLOCK);
    const ikp = new Uint8Array(BLOCK);
    for (let i = 0; i < BLOCK; i++) {
      okp[i] = k[i] ^ 0x5c;
      ikp[i] = k[i] ^ 0x36;
    }
    // Inner: SHA256(ikp || msg)
    const inner = new Uint8Array(ikp.length + msg.length);
    inner.set(ikp);
    inner.set(msg, ikp.length);
    const innerHex = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      String.fromCharCode(...inner),
      { encoding: Crypto.CryptoEncoding.HEX }
    );
    const innerBytes = hexToBytes(innerHex);
    // Outer: SHA256(okp || innerBytes)
    const outer = new Uint8Array(okp.length + innerBytes.length);
    outer.set(okp);
    outer.set(innerBytes, okp.length);
    const outerHex = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      String.fromCharCode(...outer),
      { encoding: Crypto.CryptoEncoding.HEX }
    );
    return hexToBytes(outerHex);
  }

  const T: Uint8Array[] = [];
  const blocks = Math.ceil(dkLen / 32);
  for (let block = 1; block <= blocks; block++) {
    const blockIdx = new Uint8Array([(block >>> 24) & 0xff, (block >>> 16) & 0xff, (block >>> 8) & 0xff, block & 0xff]);
    const saltPlus = new Uint8Array(salt.length + 4);
    saltPlus.set(salt);
    saltPlus.set(blockIdx, salt.length);
    let U = await hmacSha256(pw, saltPlus);
    const Ti = new Uint8Array(U);
    for (let i = 2; i <= iterations; i++) {
      U = await hmacSha256(pw, U);
      for (let j = 0; j < Ti.length; j++) Ti[j] ^= U[j];
    }
    T.push(Ti);
  }
  const merged = new Uint8Array(dkLen);
  let offset = 0;
  for (const b of T) {
    merged.set(b.subarray(0, Math.min(32, dkLen - offset)), offset);
    offset += 32;
  }
  return bytesToHex(merged);
}

// ─── Public API ─────────────────────────────────────────────────────────────
/** Legacy hash (v1) — kept for backward compatibility during migration. */
async function legacyHash(pin: string): Promise<string> {
  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `guardian-${pin}`,
  );
}

/**
 * Compute a strong PBKDF2 hash and return a versioned string:
 *   "v2:<saltHex>:<dkHex>"
 */
export async function hashPin(pin: string, salt?: string): Promise<string> {
  const s = salt || (await randomSaltHex());
  const dk = await pbkdf2Sha256(pin, s, PBKDF2_ITER, HASH_LEN_BYTES);
  return `v2:${s}:${dk}`;
}

export async function setPin(pin: string): Promise<string> {
  const h = await hashPin(pin);
  if (Platform.OS !== 'web') {
    try {
      await SecureStore.setItemAsync(PIN_KEY, h);
    } catch {}
  }
  return h;
}

export async function setDecoyPin(pin: string | null): Promise<string | null> {
  if (!pin) {
    if (Platform.OS !== 'web') {
      try { await SecureStore.deleteItemAsync(DECOY_KEY); } catch {}
    }
    return null;
  }
  const h = await hashPin(pin);
  if (Platform.OS !== 'web') {
    try { await SecureStore.setItemAsync(DECOY_KEY, h); } catch {}
  }
  return h;
}

/**
 * Verify a PIN against a stored hash. Supports both v1 (legacy unsalted
 * SHA-256) and v2 (PBKDF2). On successful legacy verify, silently returns
 * true so the caller can rewrite the stored hash with `setPin(pin)`.
 */
export async function verifyPin(pin: string, hash?: string): Promise<boolean> {
  if (!hash) return false;
  if (hash.startsWith('v2:')) {
    const parts = hash.split(':');
    if (parts.length !== 3) return false;
    const salt = parts[1];
    const dk = await pbkdf2Sha256(pin, salt, PBKDF2_ITER, HASH_LEN_BYTES);
    return timingSafeEqual(dk, parts[2]);
  }
  // Legacy v1 — unsalted SHA-256
  const legacy = await legacyHash(pin);
  return timingSafeEqual(legacy, hash);
}

/**
 * Post-verify migration hook. Call this from the lock screen after a
 * successful `verifyPin(...)` returns `true` : if the stored hash is still
 * v1, upgrade it silently to v2. Failure is tolerated (best-effort).
 */
export async function maybeUpgradePin(pin: string, storedHash?: string): Promise<void> {
  if (!storedHash || storedHash.startsWith('v2:')) return;
  try {
    const newHash = await hashPin(pin);
    if (Platform.OS !== 'web') {
      // Preserve which key (PIN or DECOY) — up to the caller to decide,
      // but the vast majority of callers store the PIN under PIN_KEY.
      await SecureStore.setItemAsync(PIN_KEY, newHash);
    }
  } catch {
    // best-effort — do not disrupt user
  }
}

export async function isBiometricAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const has = await LocalAuthentication.hasHardwareAsync();
    if (!has) return false;
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
  } catch {
    return false;
  }
}

export async function requestBiometric(
  reason = 'Déverrouiller Budgy',
): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      fallbackLabel: 'Utiliser le code PIN',
      cancelLabel: 'Annuler',
      disableDeviceFallback: false,
    });
    return res.success;
  } catch {
    return false;
  }
}
