/**
 * GUARDIAN MONEY CHF - Security service
 * Handles PIN hashing, biometric, app lock, decoy mode (panic PIN).
 */

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

const PIN_KEY = 'guardian.pin.hash';
const DECOY_KEY = 'guardian.decoy.hash';

export async function hashPin(pin: string): Promise<string> {
  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `guardian-${pin}`,
  );
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

export async function verifyPin(pin: string, hash?: string): Promise<boolean> {
  if (!hash) return false;
  const h = await hashPin(pin);
  return h === hash;
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
  reason = 'Déverrouiller Guardian',
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
