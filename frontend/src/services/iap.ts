/**
 * BUDGY — Apple StoreKit / In-App Purchase Service (react-native-iap)
 *
 * @i18n-technical-file
 *
 * ⚠ Contains only stable internal error codes returned in {ok:false,
 * error:'iap_not_configured'|'network_error'|'transaction_not_found'|...}.
 * Any UI-visible message is translated by the caller (see useIAP.ts / paywall).
 *
 * Wraps the native IAP layer with:
 *   - Web / Expo Go safe fallback (no-op — keeps bundler happy)
 *   - Product fetching for the Budgy Pro subscription group
 *   - Backend-first validation/restore via FastAPI (/api/iap/*) which talks
 *     to Apple's App Store Server API (StoreKit 2 / production-ready).
 *   - Graceful behavior when the server isn't configured yet (returns
 *     `{ ok:false, missing:[...] }` so the UI can show a clear message
 *     instead of crashing or silently unlocking).
 *
 * Product IDs MUST match App Store Connect → Monetization → Subscriptions.
 */

import { Platform } from 'react-native';

// v3.9.0 SECURITY: attach Supabase JWT to all backend calls.
async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { supabase, isSupabaseConfigured } = await import('../lib/supabase');
    if (!isSupabaseConfigured()) return {};
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export const IAP_PRODUCT_IDS = {
  monthly: 'com.budgy.ch.budgy.monthly',
  annual: 'com.budgy.ch.budgy.annual',
} as const;

export type IapPlan = 'monthly' | 'annual';

export const IAP_SKUS: string[] = [IAP_PRODUCT_IDS.monthly, IAP_PRODUCT_IDS.annual];

export interface IapProduct {
  productId: string;
  price: string;
  localizedPrice: string;
  currency: string;
  title: string;
  description: string;
  subscriptionPeriodUnitIOS?: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
  subscriptionPeriodNumberIOS?: string;
}

export interface IapPurchaseReceipt {
  productId: string;
  transactionId: string;
  transactionReceipt: string;
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

// ── Diagnostics ──────────────────────────────────────────────────────────────
/**
 * v3.9.0 Build 74 — StoreKit diagnostics.
 *
 * Machine-readable snapshot of the last IAP init/fetch cycle. Used by
 * TestFlight builds to distinguish between:
 *   - STOREKIT_UNAVAILABLE   → native module not linked (Expo Go / web)
 *   - INIT_FAILED            → initConnection threw / returned false
 *   - PRODUCTS_NOT_FOUND     → connection OK, StoreKit returned 0 SKUs
 *                              (App Store Connect not yet configured or
 *                               "Cleared for Sale" is OFF)
 *   - NETWORK_ERROR          → getSubscriptions threw (transient)
 * NEVER contains PII. Product IDs, platform, error code/message only.
 */
export type IapDiagnosticCode =
  | 'OK'
  | 'STOREKIT_UNAVAILABLE'
  | 'INIT_FAILED'
  | 'PRODUCTS_NOT_FOUND'
  | 'NETWORK_ERROR';

export interface IapDiagnostics {
  code: IapDiagnosticCode;
  platform: string;
  isIapAvailable: boolean;
  initConnected: boolean | null;
  requestedSkus: string[];
  returnedProductIds: string[];
  errorCode: string | null;
  errorMessage: string | null;
  at: number;
}

let LAST_DIAGNOSTICS: IapDiagnostics = {
  code: 'STOREKIT_UNAVAILABLE',
  platform: Platform.OS,
  isIapAvailable: false,
  initConnected: null,
  requestedSkus: [...IAP_SKUS],
  returnedProductIds: [],
  errorCode: null,
  errorMessage: null,
  at: Date.now(),
};

export function getIapDiagnostics(): IapDiagnostics {
  return LAST_DIAGNOSTICS;
}

function setDiagnostics(patch: Partial<IapDiagnostics>) {
  LAST_DIAGNOSTICS = {
    ...LAST_DIAGNOSTICS,
    ...patch,
    at: Date.now(),
  };
  if (__DEV__ || process.env.EXPO_PUBLIC_IAP_DIAGNOSTICS === '1') {
    // TestFlight diagnostic logs — machine-readable, no PII.
    // eslint-disable-next-line no-console
    console.log('[IAP-DIAG]', JSON.stringify(LAST_DIAGNOSTICS));
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
  if (!isIapAvailable()) {
    setDiagnostics({
      code: 'STOREKIT_UNAVAILABLE',
      isIapAvailable: false,
      initConnected: false,
      returnedProductIds: [],
      errorCode: 'not_available',
      errorMessage: RNIapError || 'IAP native module not available',
    });
    return false;
  }
  try {
    if (typeof RNIap?.initConnection !== 'function') {
      console.warn('[IAP] initConnection unavailable on this build');
      setDiagnostics({
        code: 'INIT_FAILED',
        isIapAvailable: true,
        initConnected: false,
        returnedProductIds: [],
        errorCode: 'init_missing',
        errorMessage: 'initConnection is not a function on this build',
      });
      return false;
    }
    await RNIap.initConnection();
    if (Platform.OS === 'android' && typeof RNIap?.flushFailedPurchasesCachedAsPendingAndroid === 'function') {
      await RNIap.flushFailedPurchasesCachedAsPendingAndroid();
    }
    setDiagnostics({
      code: 'OK',
      isIapAvailable: true,
      initConnected: true,
      errorCode: null,
      errorMessage: null,
    });
    return true;
  } catch (e: any) {
    console.warn('[IAP] initConnection failed', e);
    setDiagnostics({
      code: 'INIT_FAILED',
      isIapAvailable: true,
      initConnected: false,
      returnedProductIds: [],
      errorCode: e?.code || 'init_failed',
      errorMessage: e?.message || String(e),
    });
    return false;
  }
}

export async function endIap(): Promise<void> {
  if (!isIapAvailable()) return;
  try {
    if (typeof RNIap?.endConnection === 'function') {
      await RNIap.endConnection();
    }
  } catch {}
}

// ── Products ─────────────────────────────────────────────────────────────────
export async function fetchSubscriptions(): Promise<IapProduct[]> {
  if (!isIapAvailable()) {
    setDiagnostics({
      code: 'STOREKIT_UNAVAILABLE',
      isIapAvailable: false,
      returnedProductIds: [],
      errorCode: 'not_available',
      errorMessage: RNIapError || 'IAP native module not available',
    });
    return [];
  }
  try {
    // react-native-iap v12+ uses `getSubscriptions({ skus })`. Older versions
    // used `getSubscriptions({ skus })` too — but some forks may have removed it.
    if (typeof RNIap?.getSubscriptions !== 'function') {
      console.warn('[IAP] getSubscriptions is not a function on this build');
      setDiagnostics({
        code: 'INIT_FAILED',
        returnedProductIds: [],
        errorCode: 'get_subscriptions_missing',
        errorMessage: 'getSubscriptions is not a function on this build',
      });
      return [];
    }
    const raw = await RNIap.getSubscriptions({ skus: IAP_SKUS });
    const products: IapProduct[] = (raw || []).map((p: any) => ({
      productId: p.productId,
      price: p.price,
      localizedPrice: p.localizedPrice || `${p.currency ?? ''} ${p.price}`.trim(),
      currency: p.currency ?? 'CHF',
      title: p.title ?? '',
      description: p.description ?? '',
      subscriptionPeriodUnitIOS: p.subscriptionPeriodUnitIOS,
      subscriptionPeriodNumberIOS: p.subscriptionPeriodNumberIOS,
    }));
    setDiagnostics({
      code: products.length > 0 ? 'OK' : 'PRODUCTS_NOT_FOUND',
      returnedProductIds: products.map((p) => p.productId),
      errorCode: products.length > 0 ? null : 'no_products',
      errorMessage:
        products.length > 0
          ? null
          : 'StoreKit returned 0 products for the requested SKUs',
    });
    return products;
  } catch (e: any) {
    console.warn('[IAP] getSubscriptions failed', e);
    setDiagnostics({
      code: 'NETWORK_ERROR',
      returnedProductIds: [],
      errorCode: e?.code || 'network_error',
      errorMessage: e?.message || String(e),
    });
    return [];
  }
}

// ── Purchase ─────────────────────────────────────────────────────────────────
export async function requestSubscription(
  productId: string
): Promise<IapPurchaseReceipt | null> {
  if (!isIapAvailable()) throw new Error(getIapUnavailableReason() || 'IAP indisponible');

  try {
    // Defensive: react-native-iap v12+ uses `requestSubscription`; some forks
    // renamed it to `requestPurchase`. Pick whichever is callable.
    const fn =
      typeof RNIap?.requestSubscription === 'function'
        ? RNIap.requestSubscription
        : typeof RNIap?.requestPurchase === 'function'
          ? RNIap.requestPurchase
          : null;
    if (!fn) {
      throw new Error('IAP module is missing a purchase function on this build');
    }
    const purchase = await fn({
      sku: productId,
      andDangerouslyFinishTransactionAutomaticallyIOS: false,
    });

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
    if (typeof RNIap?.finishTransaction !== 'function') return;
    await RNIap.finishTransaction({ purchase: purchase as any, isConsumable: false });
  } catch (e) {
    console.warn('[IAP] finishTransaction failed', e);
  }
}

// ── Restore (native) ─────────────────────────────────────────────────────────
export async function getAvailableReceipts(): Promise<IapPurchaseReceipt[]> {
  if (!isIapAvailable()) return [];
  try {
    if (typeof RNIap?.getAvailablePurchases !== 'function') return [];
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

// ── Backend (FastAPI) ────────────────────────────────────────────────────────
import { safeFetch } from '../lib/network';

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL || 'https://api.budgy.ch';

export type SubscriptionState =
  | 'FREE'
  | 'PRO'
  | 'EXPIRED'
  | 'GRACE_PERIOD'
  | 'REFUNDED';

export interface BackendValidation {
  ok: boolean;                 // true if Apple call succeeded
  valid: boolean;              // true if subscription is currently Pro
  subscription_state?: SubscriptionState;
  product_id?: string | null;
  expires_at?: number | null;
  pro_until?: string | null;
  original_transaction_id?: string | null;
  environment?: 'Sandbox' | 'Production' | null;
  auto_renew?: boolean | null;
  error?: string | null;
  // 503 helpers
  not_configured?: boolean;
  missing?: string[];
}

async function postJson(path: string, body: any): Promise<BackendValidation> {
  // v3.9.0 SECURITY: attach Supabase JWT
  const authHeaders = await getAuthHeaders();
  const r = await safeFetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify(body),
  }, { timeoutMs: 8000, retries: 1, silent: true });

  // Network failure → graceful offline result, never throw
  if (r.offline || (!r.ok && r.status === 0)) {
    return {
      ok: false,
      valid: false,
      error: 'network_error',
    };
  }

  const data: any = r.data || {};
  if (r.status === 503 || data?.error === 'iap_not_configured') {
    return {
      ok: false,
      valid: false,
      not_configured: true,
      missing: data?.missing || [],
      error: 'iap_not_configured',
    };
  }
  return {
    ok: !!data.ok,
    valid: !!data.valid,
    subscription_state: data.subscription_state,
    product_id: data.product_id ?? null,
    expires_at: data.expires_at ?? null,
    pro_until: data.pro_until ?? null,
    original_transaction_id: data.original_transaction_id ?? null,
    environment: data.environment ?? null,
    auto_renew: data.auto_renew ?? null,
    error: data.error ?? null,
  };
}

export async function validateOnBackend(input: {
  transaction_id: string;
  product_id?: string;
  user_id?: string;
  receipt_data?: string;
}): Promise<BackendValidation> {
  return postJson('/api/iap/validate', {
    platform: 'ios',
    transaction_id: input.transaction_id,
    product_id: input.product_id,
    user_id: input.user_id,
    receipt_data: input.receipt_data,
  });
}

export async function restoreOnBackend(input: {
  original_transaction_id: string;
  user_id?: string;
}): Promise<BackendValidation> {
  return postJson('/api/iap/restore', {
    original_transaction_id: input.original_transaction_id,
    user_id: input.user_id,
  });
}

export interface RemoteSubscription {
  is_pro: boolean;
  subscription_state: SubscriptionState;
  pro_until?: string | null;
  apple_product_id?: string | null;
  apple_original_transaction_id?: string | null;
}

export async function fetchSubscriptionFromBackend(
  user_id: string
): Promise<RemoteSubscription | null> {
  // v3.9.0 SECURITY: user_id is now derived from JWT server-side — the query
  // param is kept for backwards compat but ignored by the backend.
  const authHeaders = await getAuthHeaders();
  const r = await safeFetch(
    `${BACKEND_URL}/api/iap/me`,
    { headers: authHeaders },
    { timeoutMs: 6000, retries: 1, silent: true }
  );
  if (!r.ok || !r.data) return null;
  const data: any = r.data;
  return {
    is_pro: !!data.is_pro,
    subscription_state: (data.subscription_state || 'FREE') as SubscriptionState,
    pro_until: data.pro_until ?? null,
    apple_product_id: data.apple_product_id ?? null,
    apple_original_transaction_id: data.apple_original_transaction_id ?? null,
  };
}
