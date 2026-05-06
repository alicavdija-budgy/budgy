/**
 * BUDGY — Apple StoreKit / In-App Purchase Service (react-native-iap)
 *
 * Wraps the native IAP layer with:
 *   - Web / Expo Go safe fallback (no-op — keeps bundler happy)
 *   - Product fetching for the Budgy Pro subscription group
 *   - Purchase / Restore helpers that always validate receipts on our backend
 *
 * Product IDs MUST match App Store Connect → Monetization → Subscriptions.
 */

import { Platform } from 'react-native';

export const IAP_PRODUCT_IDS = {
  monthly: 'com.budgy.ch.budgy.monthly',
  annual: 'com.budgy.ch.budgy.annual',
} as const;

export type IapPlan = 'monthly' | 'annual';

export const IAP_SKUS: string[] = [IAP_PRODUCT_IDS.monthly, IAP_PRODUCT_IDS.annual];

export interface IapProduct {
  productId: string;
  price: string;          // e.g. "4.90"
  localizedPrice: string; // e.g. "CHF 4.90"
  currency: string;       // e.g. "CHF"
  title: string;
  description: string;
  subscriptionPeriodUnitIOS?: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
  subscriptionPeriodNumberIOS?: string;
}

export interface IapPurchaseReceipt {
  productId: string;
  transactionId: string;
  transactionReceipt: string; // base64 receipt for Apple validation
  originalTransactionId?: string;
  purchaseTime: number;
}

// ── Native lazy-load (Expo Go / Web safe) ────────────────────────────────────
let RNIap: any = null;
let RNIapError: string | null = null;

function loadIap() {
  if (RNIap || RNIapError) return;
  if (Platform.OS === 'web') {
    RNIapError = 'IAP not available on web';
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    RNIap = require('react-native-iap');
  } catch (e: any) {
    RNIapError = e?.message || 'react-native-iap native module not linked (Expo Go?)';
  }
}

export function isIapAvailable(): boolean {
  loadIap();
  return !!RNIap && Platform.OS !== 'web';
}

export function getIapUnavailableReason(): string | null {
  loadIap();
  return RNIapError;
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
export async function initIap(): Promise<boolean> {
  loadIap();
  if (!isIapAvailable()) return false;
  try {
    await RNIap.initConnection();
    if (Platform.OS === 'android') {
      // No-op on iOS — flushes pending consumables on Android
      await RNIap.flushFailedPurchasesCachedAsPendingAndroid?.();
    }
    return true;
  } catch (e) {
    console.warn('[IAP] initConnection failed', e);
    return false;
  }
}

export async function endIap(): Promise<void> {
  if (!isIapAvailable()) return;
  try {
    await RNIap.endConnection();
  } catch {}
}

// ── Products ─────────────────────────────────────────────────────────────────
export async function fetchSubscriptions(): Promise<IapProduct[]> {
  if (!isIapAvailable()) return [];
  try {
    const raw = await RNIap.getSubscriptions({ skus: IAP_SKUS });
    return (raw || []).map((p: any) => ({
      productId: p.productId,
      price: p.price,
      localizedPrice: p.localizedPrice || `${p.currency ?? ''} ${p.price}`.trim(),
      currency: p.currency ?? 'CHF',
      title: p.title ?? '',
      description: p.description ?? '',
      subscriptionPeriodUnitIOS: p.subscriptionPeriodUnitIOS,
      subscriptionPeriodNumberIOS: p.subscriptionPeriodNumberIOS,
    }));
  } catch (e) {
    console.warn('[IAP] getSubscriptions failed', e);
    return [];
  }
}

// ── Purchase ─────────────────────────────────────────────────────────────────
export async function requestSubscription(
  productId: string
): Promise<IapPurchaseReceipt | null> {
  if (!isIapAvailable()) throw new Error(getIapUnavailableReason() || 'IAP indisponible');

  try {
    const purchase = await RNIap.requestSubscription({
      sku: productId,
      // On iOS we manually finish after backend validation
      andDangerouslyFinishTransactionAutomaticallyIOS: false,
    });

    // Some platforms return an array
    const p = Array.isArray(purchase) ? purchase[0] : purchase;
    if (!p || !p.transactionReceipt) return null;

    return {
      productId: p.productId,
      transactionId: p.transactionId,
      transactionReceipt: p.transactionReceipt,
      originalTransactionId: p.originalTransactionIdentifierIOS,
      purchaseTime: p.transactionDate || Date.now(),
    };
  } catch (e: any) {
    if (e?.code === 'E_USER_CANCELLED') return null;
    throw e;
  }
}

export async function finishTransaction(purchase: IapPurchaseReceipt): Promise<void> {
  if (!isIapAvailable()) return;
  try {
    await RNIap.finishTransaction({ purchase: purchase as any, isConsumable: false });
  } catch (e) {
    console.warn('[IAP] finishTransaction failed', e);
  }
}

// ── Restore ──────────────────────────────────────────────────────────────────
export async function getAvailableReceipts(): Promise<IapPurchaseReceipt[]> {
  if (!isIapAvailable()) return [];
  try {
    const purchases = await RNIap.getAvailablePurchases();
    return (purchases || []).map((p: any) => ({
      productId: p.productId,
      transactionId: p.transactionId,
      transactionReceipt: p.transactionReceipt,
      originalTransactionId: p.originalTransactionIdentifierIOS,
      purchaseTime: p.transactionDate || Date.now(),
    }));
  } catch (e) {
    console.warn('[IAP] getAvailablePurchases failed', e);
    return [];
  }
}

// ── Backend validation ───────────────────────────────────────────────────────
const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

export interface BackendValidationResult {
  valid: boolean;
  productId?: string;
  expiresAt?: number;      // unix ms
  originalTransactionId?: string;
  environment?: 'Sandbox' | 'Production';
  error?: string;
}

export async function validateReceiptOnBackend(
  receipt: IapPurchaseReceipt
): Promise<BackendValidationResult> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/iap/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: Platform.OS,
        product_id: receipt.productId,
        transaction_id: receipt.transactionId,
        receipt_data: receipt.transactionReceipt,
      }),
    });
    const data = await res.json();
    return data;
  } catch (e: any) {
    return { valid: false, error: e?.message || 'Network error' };
  }
}
