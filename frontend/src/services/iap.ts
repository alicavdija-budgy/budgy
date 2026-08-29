/**
 * BUDGY — Apple StoreKit / In-App Purchase Service (react-native-iap 15.x / Nitro)
 *
 * @i18n-technical-file
 *
 * v3.9.0 Build 77 — Full migration to the react-native-iap 15.x (OpenIAP / Nitro)
 * API surface. The previous implementation relied on the deprecated
 * `getSubscriptions()` + `requestSubscription({ sku })` helpers which no longer
 * exist in v15 and returned an empty product list at runtime — the direct
 * cause of the Apple 2.1(b) rejection on Build 75. The Sandbox reviewers saw
 * "0 products" because our code was calling a non-existent function.
 *
 * v15 API used here (all documented in
 * node_modules/react-native-iap/lib/typescript/src/index.d.ts):
 *   - initConnection() / endConnection()
 *   - fetchProducts({ skus, type: 'subs' })      → ProductSubscription[]
 *   - requestPurchase({ request: { apple: { sku } }, type: 'subs' })
 *   - purchaseUpdatedListener / purchaseErrorListener
 *   - finishTransaction({ purchase, isConsumable: false })
 *   - getAvailablePurchases()
 *
 * Product IDs MUST match App Store Connect → Monetization → Subscriptions.
 * All prices, currencies, titles and trial periods come from StoreKit —
 * nothing hardcoded. Pro is NEVER granted client-side; the backend
 * (/api/iap/validate, /api/iap/restore) talks to Apple's App Store Server API
 * and is the sole source of truth.
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

/** Normalised free-trial descriptor extracted from StoreKit. */
export interface IapIntroOffer {
  /** True when the offer is a free trial (period at price=0). */
  isFreeTrial: boolean;
  /** Number of days the free trial lasts. Null if unavailable. */
  periodDays: number | null;
  /** Raw payment mode (free-trial, pay-as-you-go, pay-up-front). */
  paymentMode: 'free-trial' | 'pay-as-you-go' | 'pay-up-front' | 'unknown' | null;
}

export interface IapProduct {
  productId: string;
  /** Numeric price as a string. Localised price is `localizedPrice`. */
  price: string;
  /** StoreKit-provided localised display price, e.g. "$X.XX / CHF X.XX". */
  localizedPrice: string;
  currency: string;
  title: string;
  description: string;
  /** Normalised introductory offer if the product exposes one. */
  introOffer: IapIntroOffer | null;
  /**
   * Android-only: offer token needed for `requestPurchase` on Play Billing.
   * On iOS this is always null.
   */
  androidOfferToken: string | null;
}

export interface IapPurchaseReceipt {
  productId: string;
  transactionId: string;
  /** iOS: StoreKit 2 JWS. Android: Play purchaseToken. Used by backend for validation. */
  transactionReceipt: string;
  originalTransactionId?: string;
  purchaseTime: number;
  /** Raw purchase object from the native module (needed by finishTransaction). */
  raw: any;
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
 * v3.9.0 Build 77 — StoreKit diagnostics for TestFlight.
 *
 * Machine-readable snapshot of the last IAP init/fetch cycle. Never contains
 * PII — only stable machine codes and product IDs. Read from getIapDiagnostics().
 *
 *   OK                    → connection + at least one product returned
 *   STOREKIT_UNAVAILABLE  → native module not linked (Expo Go / web)
 *   INIT_FAILED           → initConnection threw / returned falsy
 *   FETCH_PRODUCTS_FAILED → fetchProducts threw synchronously
 *   NETWORK_ERROR         → transient store/network failure
 *   PRODUCTS_NOT_FOUND    → connection OK, StoreKit returned 0 SKUs
 *   MONTHLY_MISSING       → connection OK, only annual returned
 *   ANNUAL_MISSING        → connection OK, only monthly returned
 */
export type IapDiagnosticCode =
  | 'OK'
  | 'STOREKIT_UNAVAILABLE'
  | 'INIT_FAILED'
  | 'FETCH_PRODUCTS_FAILED'
  | 'NETWORK_ERROR'
  | 'PRODUCTS_NOT_FOUND'
  | 'MONTHLY_MISSING'
  | 'ANNUAL_MISSING';

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

// ── Purchase event pump (v15 is listener-based) ──────────────────────────────
type PurchaseResolver = {
  sku: string;
  resolve: (r: IapPurchaseReceipt | null) => void;
  reject: (e: any) => void;
  timeout?: any;
};
let pendingResolvers: PurchaseResolver[] = [];
let listenerSubs: Array<{ remove: () => void }> = [];

function normalisePurchase(p: any): IapPurchaseReceipt | null {
  if (!p) return null;
  // v15 unified fields: id, productId, purchaseToken (JWS on iOS), transactionDate
  const productId: string = p.productId || p.id || (Array.isArray(p.ids) && p.ids[0]) || '';
  if (!productId) return null;
  const transactionId: string = p.transactionId || p.id || '';
  const receipt: string =
    p.purchaseToken || p.transactionReceipt || p.jwsRepresentationIOS || '';
  return {
    productId,
    transactionId,
    transactionReceipt: receipt,
    originalTransactionId:
      p.originalTransactionIdentifierIOS || p.originalTransactionId || undefined,
    purchaseTime:
      typeof p.transactionDate === 'number' ? p.transactionDate : Date.now(),
    raw: p,
  };
}

function onPurchaseUpdated(rawPurchase: any) {
  const receipt = normalisePurchase(rawPurchase);
  if (!receipt) return;
  const idx = pendingResolvers.findIndex((r) => r.sku === receipt.productId);
  if (idx >= 0) {
    const [resolver] = pendingResolvers.splice(idx, 1);
    if (resolver.timeout) clearTimeout(resolver.timeout);
    resolver.resolve(receipt);
  }
  // If no resolver matches (e.g. a re-delivered transaction on relaunch),
  // we drop the event silently — the caller is expected to call
  // getAvailablePurchases() explicitly on foreground.
}

function onPurchaseError(err: any) {
  const code = String(err?.code || '').toLowerCase();
  const isCancel = code === 'user-cancelled' || code === 'e_user_cancelled';
  const failingSku: string | undefined = err?.productId || (Array.isArray(err?.productIds) && err.productIds[0]);
  const settleWith = (resolver: PurchaseResolver) => {
    if (resolver.timeout) clearTimeout(resolver.timeout);
    if (isCancel) resolver.resolve(null);
    else resolver.reject(err);
  };
  if (failingSku) {
    const idx = pendingResolvers.findIndex((r) => r.sku === failingSku);
    if (idx >= 0) {
      const [resolver] = pendingResolvers.splice(idx, 1);
      settleWith(resolver);
      return;
    }
  }
  // No SKU identified — settle the oldest pending resolver.
  const resolver = pendingResolvers.shift();
  if (resolver) settleWith(resolver);
}

function registerListeners() {
  if (!RNIap || listenerSubs.length > 0) return;
  try {
    if (typeof RNIap.purchaseUpdatedListener === 'function') {
      listenerSubs.push(RNIap.purchaseUpdatedListener(onPurchaseUpdated));
    }
    if (typeof RNIap.purchaseErrorListener === 'function') {
      listenerSubs.push(RNIap.purchaseErrorListener(onPurchaseError));
    }
  } catch (e) {
    console.warn('[IAP] failed to register listeners', e);
  }
}

function removeListeners() {
  for (const s of listenerSubs) {
    try { s.remove(); } catch {}
  }
  listenerSubs = [];
  // Any pending resolvers must be cleared — connection is gone.
  for (const r of pendingResolvers) {
    if (r.timeout) clearTimeout(r.timeout);
    r.resolve(null);
  }
  pendingResolvers = [];
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
    const connected = await RNIap.initConnection();
    // initConnection may return void OR true depending on the platform; we
    // don't consider `false` fatal here (some Android paths return true only
    // after products are queried). But `void` is treated as success.
    if (connected === false) {
      setDiagnostics({
        code: 'INIT_FAILED',
        isIapAvailable: true,
        initConnected: false,
        returnedProductIds: [],
        errorCode: 'init_returned_false',
        errorMessage: 'initConnection resolved with false',
      });
      return false;
    }
    registerListeners();
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
  removeListeners();
  try {
    if (typeof RNIap?.endConnection === 'function') {
      await RNIap.endConnection();
    }
  } catch {}
}

// ── Products ─────────────────────────────────────────────────────────────────

/** Pull an intro offer out of a v15 ProductSubscription. */
function extractIntroOffer(raw: any): IapIntroOffer | null {
  if (!raw) return null;
  // Preferred (v15): subscriptionOffers[] with type === 'introductory'.
  const offers: any[] = Array.isArray(raw.subscriptionOffers) ? raw.subscriptionOffers : [];
  const intro = offers.find((o) => String(o?.type).toLowerCase() === 'introductory');
  if (intro) {
    const paymentMode = String(intro.paymentMode || '').toLowerCase();
    const isFreeTrial =
      paymentMode === 'free-trial' ||
      // Some SDKs also emit price 0 without paymentMode when the offer IS a trial.
      (Number(intro.price ?? -1) === 0 && paymentMode !== 'pay-as-you-go');
    let periodDays: number | null = null;
    if (intro.period && typeof intro.period.value === 'number') {
      const unit = String(intro.period.unit).toLowerCase();
      const value = Number(intro.period.value);
      const count = Number(intro.periodCount ?? 1) || 1;
      const totalUnits = value * count;
      if (unit === 'day') periodDays = totalUnits;
      else if (unit === 'week') periodDays = totalUnits * 7;
      else if (unit === 'month') periodDays = totalUnits * 30;
      else if (unit === 'year') periodDays = totalUnits * 365;
    }
    return {
      isFreeTrial,
      periodDays,
      paymentMode:
        paymentMode === 'free-trial' ||
        paymentMode === 'pay-as-you-go' ||
        paymentMode === 'pay-up-front'
          ? paymentMode
          : isFreeTrial
            ? 'free-trial'
            : 'unknown',
    };
  }
  // Legacy fallback (v15 still populates these on iOS for parity).
  //   introductoryPricePaymentModeIOS: 'empty' | 'free-trial' | 'pay-as-you-go' | 'pay-up-front'
  //   introductoryPriceNumberOfPeriodsIOS: string
  //   introductoryPriceSubscriptionPeriodIOS: 'day' | 'week' | 'month' | 'year' | 'empty'
  const legacyMode = String(raw.introductoryPricePaymentModeIOS || '').toLowerCase();
  if (!legacyMode || legacyMode === 'empty') return null;
  const legacyUnit = String(raw.introductoryPriceSubscriptionPeriodIOS || '').toLowerCase();
  const legacyCount = Number(raw.introductoryPriceNumberOfPeriodsIOS || 0);
  let periodDays: number | null = null;
  if (legacyCount > 0 && legacyUnit) {
    if (legacyUnit === 'day') periodDays = legacyCount;
    else if (legacyUnit === 'week') periodDays = legacyCount * 7;
    else if (legacyUnit === 'month') periodDays = legacyCount * 30;
    else if (legacyUnit === 'year') periodDays = legacyCount * 365;
  }
  return {
    isFreeTrial: legacyMode === 'free-trial',
    periodDays,
    paymentMode:
      legacyMode === 'free-trial' ||
      legacyMode === 'pay-as-you-go' ||
      legacyMode === 'pay-up-front'
        ? (legacyMode as any)
        : 'unknown',
  };
}

/** v15 mapping: ProductSubscription → IapProduct. Exported for tests. */
export function mapProduct(raw: any): IapProduct {
  const productId: string = raw?.id || raw?.productId || '';
  const displayPrice: string = raw?.displayPrice || '';
  const numericPrice: number | null = typeof raw?.price === 'number' ? raw.price : null;
  const currency: string = raw?.currency || '';
  // Android: pick the first subscription offer token if present (needed for purchase).
  let androidOfferToken: string | null = null;
  if (raw?.platform === 'android') {
    const offers = Array.isArray(raw.subscriptionOffers) ? raw.subscriptionOffers : [];
    const firstToken = offers.find((o: any) => o?.offerTokenAndroid)?.offerTokenAndroid;
    androidOfferToken = firstToken || null;
    // Legacy fallback.
    if (!androidOfferToken && Array.isArray(raw.subscriptionOfferDetailsAndroid)) {
      const legacy = raw.subscriptionOfferDetailsAndroid.find((o: any) => o?.offerToken);
      androidOfferToken = legacy?.offerToken || null;
    }
  }
  return {
    productId,
    price: numericPrice != null ? String(numericPrice) : '',
    localizedPrice: displayPrice || (currency && numericPrice != null ? `${currency} ${numericPrice}` : ''),
    currency: currency || 'CHF',
    title: raw?.title || raw?.displayName || raw?.displayNameIOS || '',
    description: raw?.description || '',
    introOffer: extractIntroOffer(raw),
    androidOfferToken,
  };
}

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
  // v15 exposes fetchProducts. `getSubscriptions` no longer exists.
  if (typeof RNIap?.fetchProducts !== 'function') {
    console.warn('[IAP] fetchProducts is not a function on this build');
    setDiagnostics({
      code: 'FETCH_PRODUCTS_FAILED',
      returnedProductIds: [],
      errorCode: 'fetch_products_missing',
      errorMessage: 'fetchProducts is not a function on this build',
    });
    return [];
  }
  try {
    const raw = await RNIap.fetchProducts({ skus: IAP_SKUS, type: 'subs' });
    const list: any[] = Array.isArray(raw) ? raw : [];
    const products: IapProduct[] = list
      .filter((p) => p && (p.type === 'subs' || p.type == null))
      .map(mapProduct)
      .filter((p) => !!p.productId);
    const returnedIds = products.map((p) => p.productId);
    const hasMonthly = returnedIds.includes(IAP_PRODUCT_IDS.monthly);
    const hasAnnual = returnedIds.includes(IAP_PRODUCT_IDS.annual);
    let code: IapDiagnosticCode = 'OK';
    if (!hasMonthly && !hasAnnual) code = 'PRODUCTS_NOT_FOUND';
    else if (!hasMonthly) code = 'MONTHLY_MISSING';
    else if (!hasAnnual) code = 'ANNUAL_MISSING';
    setDiagnostics({
      code,
      returnedProductIds: returnedIds,
      errorCode: code === 'OK' ? null : 'partial_or_empty_products',
      errorMessage:
        code === 'OK'
          ? null
          : `StoreKit returned ${products.length}/${IAP_SKUS.length} expected subscriptions`,
    });
    return products;
  } catch (e: any) {
    console.warn('[IAP] fetchProducts failed', e);
    const isNetwork = String(e?.code || '').toLowerCase().includes('network');
    setDiagnostics({
      code: isNetwork ? 'NETWORK_ERROR' : 'FETCH_PRODUCTS_FAILED',
      returnedProductIds: [],
      errorCode: e?.code || (isNetwork ? 'network_error' : 'fetch_products_failed'),
      errorMessage: e?.message || String(e),
    });
    return [];
  }
}

// ── Purchase ─────────────────────────────────────────────────────────────────

/**
 * v15 requestPurchase dispatch. Real result is delivered via
 * `purchaseUpdatedListener` — we bridge it back to a Promise here.
 */
export async function requestSubscription(
  productId: string,
  opts: { androidOfferToken?: string | null } = {}
): Promise<IapPurchaseReceipt | null> {
  if (!isIapAvailable()) throw new Error(getIapUnavailableReason() || 'IAP indisponible');
  if (typeof RNIap?.requestPurchase !== 'function') {
    throw new Error('IAP module is missing requestPurchase on this build');
  }
  // Make sure listeners are registered (they should be, from initIap).
  registerListeners();

  const promise = new Promise<IapPurchaseReceipt | null>((resolve, reject) => {
    const timeout = setTimeout(() => {
      const idx = pendingResolvers.findIndex((r) => r.sku === productId);
      if (idx >= 0) {
        pendingResolvers.splice(idx, 1);
        reject(new Error('purchase_timeout'));
      }
    }, 90_000); // 90s upper bound (Apple auth sheets can take a while).
    pendingResolvers.push({ sku: productId, resolve, reject, timeout });
  });

  const request: any = { type: 'subs' as const, request: {} };
  if (Platform.OS === 'ios') {
    request.request.apple = {
      sku: productId,
      andDangerouslyFinishTransactionAutomatically: false,
    };
  } else {
    // Android needs the offer token; fall back to empty if unknown so we still get an error.
    request.request.google = {
      skus: [productId],
      subscriptionOffers: opts.androidOfferToken
        ? [{ sku: productId, offerToken: opts.androidOfferToken }]
        : [],
    };
  }

  try {
    // v15 documents that the return value should NOT be relied upon — the
    // listener is authoritative. We still `await` to catch synchronous
    // rejections (e.g. E_NOT_PREPARED).
    await RNIap.requestPurchase(request);
  } catch (e: any) {
    // Drop the resolver we just pushed and re-throw so useIAP can react.
    const idx = pendingResolvers.findIndex((r) => r.sku === productId);
    if (idx >= 0) {
      const [r] = pendingResolvers.splice(idx, 1);
      if (r.timeout) clearTimeout(r.timeout);
    }
    if (String(e?.code || '').toLowerCase() === 'user-cancelled') return null;
    throw e;
  }

  return promise;
}

export async function finishTransaction(purchase: IapPurchaseReceipt): Promise<void> {
  if (!isIapAvailable()) return;
  try {
    if (typeof RNIap?.finishTransaction !== 'function') return;
    // v15 signature: { purchase, isConsumable }. The Purchase argument must be
    // the raw native object (with id/purchaseToken); we kept it in `raw`.
    await RNIap.finishTransaction({
      purchase: (purchase.raw as any) || (purchase as any),
      isConsumable: false,
    });
  } catch (e) {
    console.warn('[IAP] finishTransaction failed', e);
  }
}

// ── Restore (native) ─────────────────────────────────────────────────────────
export async function getAvailableReceipts(): Promise<IapPurchaseReceipt[]> {
  if (!isIapAvailable()) return [];
  try {
    if (typeof RNIap?.getAvailablePurchases !== 'function') return [];
    const purchases: any[] = await RNIap.getAvailablePurchases();
    const receipts: IapPurchaseReceipt[] = [];
    for (const p of purchases || []) {
      const n = normalisePurchase(p);
      if (n) receipts.push(n);
    }
    return receipts;
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
