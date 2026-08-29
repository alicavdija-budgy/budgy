/**
 * BUDGY — Apple StoreKit / In-App Purchase Service (react-native-iap 15.x / Nitro)
 *
 * @i18n-technical-file
 *
 * v3.9.0 Build 79 — hardened authentication around StoreKit purchases.
 * A native purchase is never started unless a valid Supabase session exists,
 * and backend IAP calls retry once after refreshing an expired session.
 *
 * v15 API used here:
 *   - initConnection() / endConnection()
 *   - fetchProducts({ skus, type: 'subs' })
 *   - requestPurchase({ request: { apple: { sku } }, type: 'subs' })
 *   - purchaseUpdatedListener / purchaseErrorListener
 *   - finishTransaction({ purchase, isConsumable: false })
 *   - getAvailablePurchases()
 *
 * Product IDs MUST match App Store Connect → Monetization → Subscriptions.
 * All prices, currencies, titles and trial periods come from StoreKit.
 * Premium is granted only after a real StoreKit transaction and backend
 * validation (or the bounded provisional path for genuine transient failures).
 */

import { Platform } from 'react-native';

// ── IAP authentication ───────────────────────────────────────────────────────
// The IAP backend is account-bound and fail-closed. A local/demo-only Zustand
// user is NOT sufficient: the backend requires a real Supabase Bearer token.
// We resolve the session at request time and refresh it when missing/near expiry
// so stale persisted sessions cannot produce `missing_token` after Apple charges.
async function resolveAuthSession(forceRefresh = false): Promise<any | null> {
  try {
    const { supabase, isSupabaseConfigured } = await import('../lib/supabase');
    if (!isSupabaseConfigured()) return null;

    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    let session = data?.session ?? null;

    const expiresAtMs = session?.expires_at ? Number(session.expires_at) * 1000 : null;
    const nearExpiry = !!expiresAtMs && expiresAtMs <= Date.now() + 60_000;

    if (forceRefresh || !session?.access_token || nearExpiry) {
      const refreshed = await supabase.auth.refreshSession();
      if (!refreshed.error && refreshed.data?.session) {
        session = refreshed.data.session;
      }
    }

    return session?.access_token ? session : null;
  } catch {
    return null;
  }
}

async function getAuthHeaders(forceRefresh = false): Promise<Record<string, string>> {
  const session = await resolveAuthSession(forceRefresh);
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

/**
 * Returns the authenticated Supabase user id if IAP can safely bind a purchase.
 * Used as a preflight BEFORE StoreKit is opened, preventing a user from being
 * charged when the backend would necessarily answer `missing_token`.
 */
export async function getIapAuthenticatedUserId(): Promise<string | undefined> {
  const session = await resolveAuthSession(false);
  return session?.user?.id || undefined;
}

export const IAP_PRODUCT_IDS = {
  monthly: 'com.budgy.ch.budgy.monthly',
  annual: 'com.budgy.ch.budgy.annual',
} as const;

export type IapPlan = 'monthly' | 'annual';

export const IAP_SKUS: string[] = [IAP_PRODUCT_IDS.monthly, IAP_PRODUCT_IDS.annual];

/** Normalised free-trial descriptor extracted from StoreKit. */
export interface IapIntroOffer {
  isFreeTrial: boolean;
  periodDays: number | null;
  paymentMode: 'free-trial' | 'pay-as-you-go' | 'pay-up-front' | 'unknown' | null;
}

export interface IapProduct {
  productId: string;
  price: string;
  localizedPrice: string;
  currency: string;
  title: string;
  description: string;
  introOffer: IapIntroOffer | null;
  androidOfferToken: string | null;
}

export interface IapPurchaseReceipt {
  productId: string;
  transactionId: string;
  transactionReceipt: string;
  originalTransactionId?: string;
  purchaseTime: number;
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
}

function onPurchaseError(err: any) {
  const code = String(err?.code || '').toLowerCase();
  const isCancel = code === 'user-cancelled' || code === 'e_user_cancelled';
  const failingSku: string | undefined =
    err?.productId || (Array.isArray(err?.productIds) && err.productIds[0]);
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
function extractIntroOffer(raw: any): IapIntroOffer | null {
  if (!raw) return null;
  const offers: any[] = Array.isArray(raw.subscriptionOffers) ? raw.subscriptionOffers : [];
  const intro = offers.find((o) => String(o?.type).toLowerCase() === 'introductory');
  if (intro) {
    const paymentMode = String(intro.paymentMode || '').toLowerCase();
    const isFreeTrial =
      paymentMode === 'free-trial' ||
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

export function mapProduct(raw: any): IapProduct {
  const productId: string = raw?.id || raw?.productId || '';
  const displayPrice: string = raw?.displayPrice || '';
  const numericPrice: number | null = typeof raw?.price === 'number' ? raw.price : null;
  const currency: string = raw?.currency || '';
  let androidOfferToken: string | null = null;
  if (raw?.platform === 'android') {
    const offers = Array.isArray(raw.subscriptionOffers) ? raw.subscriptionOffers : [];
    const firstToken = offers.find((o: any) => o?.offerTokenAndroid)?.offerTokenAndroid;
    androidOfferToken = firstToken || null;
    if (!androidOfferToken && Array.isArray(raw.subscriptionOfferDetailsAndroid)) {
      const legacy = raw.subscriptionOfferDetailsAndroid.find((o: any) => o?.offerToken);
      androidOfferToken = legacy?.offerToken || null;
    }
  }
  return {
    productId,
    price: numericPrice != null ? String(numericPrice) : '',
    localizedPrice:
      displayPrice || (currency && numericPrice != null ? `${currency} ${numericPrice}` : ''),
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
export async function requestSubscription(
  productId: string,
  opts: { androidOfferToken?: string | null } = {}
): Promise<IapPurchaseReceipt | null> {
  if (!isIapAvailable()) throw new Error(getIapUnavailableReason() || 'IAP unavailable');
  if (typeof RNIap?.requestPurchase !== 'function') {
    throw new Error('IAP module is missing requestPurchase on this build');
  }

  // SECURITY / UX: never show Apple's payment sheet if we cannot bind the
  // resulting transaction to an authenticated account. This is the direct
  // guard against the Build 78 `missing_token` failure observed after payment.
  const userId = await getIapAuthenticatedUserId();
  if (!userId) {
    const authError: any = new Error('auth_required');
    authError.code = 'auth_required';
    throw authError;
  }

  registerListeners();

  const promise = new Promise<IapPurchaseReceipt | null>((resolve, reject) => {
    const timeout = setTimeout(() => {
      const idx = pendingResolvers.findIndex((r) => r.sku === productId);
      if (idx >= 0) {
        pendingResolvers.splice(idx, 1);
        reject(new Error('purchase_timeout'));
      }
    }, 90_000);
    pendingResolvers.push({ sku: productId, resolve, reject, timeout });
  });

  const request: any = { type: 'subs' as const, request: {} };
  if (Platform.OS === 'ios') {
    request.request.apple = {
      sku: productId,
      andDangerouslyFinishTransactionAutomatically: false,
    };
  } else {
    request.request.google = {
      skus: [productId],
      subscriptionOffers: opts.androidOfferToken
        ? [{ sku: productId, offerToken: opts.androidOfferToken }]
        : [],
    };
  }

  try {
    await RNIap.requestPurchase(request);
  } catch (e: any) {
    const idx = pendingResolvers.findIndex((r) => r.sku === productId);
    if (idx >= 0) {
      const [r] = pendingResolvers.splice(idx, 1);
      if (r.timeout) clearTimeout(r.timeout);
    }
    const code = String(e?.code || '').toLowerCase();
    if (code === 'user-cancelled' || code === 'e_user_cancelled') return null;
    throw e;
  }

  return promise;
}

export async function finishTransaction(purchase: IapPurchaseReceipt): Promise<void> {
  if (!isIapAvailable()) return;
  try {
    if (typeof RNIap?.finishTransaction !== 'function') return;
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

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://api.budgy.ch';

export type SubscriptionState =
  | 'FREE'
  | 'PRO'
  | 'EXPIRED'
  | 'GRACE_PERIOD'
  | 'REFUNDED';

export interface BackendValidation {
  ok: boolean;
  valid: boolean;
  subscription_state?: SubscriptionState;
  product_id?: string | null;
  expires_at?: number | null;
  pro_until?: string | null;
  original_transaction_id?: string | null;
  environment?: 'Sandbox' | 'Production' | null;
  auto_renew?: boolean | null;
  error?: string | null;
  not_configured?: boolean;
  missing?: string[];
}

function isAuthFailure(status: number, data: any): boolean {
  const detail = String(data?.detail || data?.error || '').toLowerCase();
  return (
    status === 401 ||
    status === 403 ||
    detail === 'missing_token' ||
    detail === 'token_expired' ||
    detail === 'invalid_token' ||
    detail === 'malformed_token' ||
    detail === 'unknown_kid' ||
    detail === 'invalid_signature' ||
    detail === 'invalid_audience' ||
    detail === 'invalid_issuer'
  );
}

async function postJson(path: string, body: any): Promise<BackendValidation> {
  const perform = async (forceRefresh: boolean) => {
    const authHeaders = await getAuthHeaders(forceRefresh);
    if (!authHeaders.Authorization) return null;
    return safeFetch(
      `${BACKEND_URL}${path}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(body),
      },
      { timeoutMs: 8000, retries: 1, silent: true }
    );
  };

  // No token means this request can never succeed. Fail before making a
  // pointless backend call and, crucially, never classify it as transient.
  let r = await perform(false);
  if (!r) {
    return { ok: false, valid: false, error: 'auth_required' };
  }

  // Session may expire between StoreKit and backend validation. Refresh once
  // and replay the exact request; never retry an auth failure indefinitely.
  if (isAuthFailure(r.status, r.data)) {
    const retried = await perform(true);
    if (!retried) {
      return { ok: false, valid: false, error: 'auth_required' };
    }
    r = retried;
    if (isAuthFailure(r.status, r.data)) {
      return { ok: false, valid: false, error: 'auth_required' };
    }
  }

  if (r.offline || (!r.ok && r.status === 0)) {
    return { ok: false, valid: false, error: 'network_error' };
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
    error: data.error ?? data.detail ?? null,
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
  const perform = async (forceRefresh: boolean) => {
    const authHeaders = await getAuthHeaders(forceRefresh);
    if (!authHeaders.Authorization) return null;
    return safeFetch(
      `${BACKEND_URL}/api/iap/me`,
      { headers: authHeaders },
      { timeoutMs: 6000, retries: 1, silent: true }
    );
  };

  let r = await perform(false);
  if (!r) return null;
  if (isAuthFailure(r.status, r.data)) {
    r = await perform(true);
    if (!r || isAuthFailure(r.status, r.data)) return null;
  }
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
