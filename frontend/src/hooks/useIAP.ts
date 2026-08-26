/**
 * BUDGY — useIAP hook (backend-first)
 *
 * User-visible error messages are localised through useTranslation() and
 * exposed via `IapResult.error`. Stable machine-readable codes (product_not_found,
 * transaction_not_found…) are preserved for logic branching.
 *
 * Production-ready flow:
 *   purchase()  → StoreKit → /api/iap/validate (App Store Server API)
 *                 → upserts state in Supabase + unlocks Pro locally.
 *   restore()   → StoreKit getAvailablePurchases → /api/iap/restore
 *                 → re-derives state from Apple, unlocks if active.
 *   sync()      → /api/iap/me?user_id=...  (called at app boot / login)
 *                 → silently downgrades to Free if subscription expired.
 *
 * Graceful when backend not configured:
 *   - returns { success:false, notConfigured:true } — UI shows toast.
 *   - DOES NOT silently unlock Pro on production builds.
 *   - On Web/Expo Go (no native StoreKit): preview unlock is allowed.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import {
  initIap,
  endIap,
  fetchSubscriptions,
  requestSubscription,
  finishTransaction,
  getAvailableReceipts,
  validateOnBackend,
  restoreOnBackend,
  fetchSubscriptionFromBackend,
  isIapAvailable,
  getIapUnavailableReason,
  getIapDiagnostics,
  IAP_PRODUCT_IDS,
  IapProduct,
  IapPlan,
  IapDiagnosticCode,
} from '../services/iap';
import { usePremiumStore } from '../stores/usePremiumStore';
import { getSupabase } from '../lib/supabase';
import { useTranslation } from './useTranslation';

export type IapPhase = 'idle' | 'loading' | 'purchasing' | 'validating' | 'restoring' | 'syncing';

export interface UseIapState {
  ready: boolean;
  available: boolean;
  reason: string | null;
  phase: IapPhase;
  products: IapProduct[];
  monthly: IapProduct | null;
  annual: IapProduct | null;
  error: string | null;
  notConfigured: boolean;       // server returned 503
  missingEnv: string[];          // which env vars are missing on server
  // v3.9.0 Build 74 — fine-grained diagnostic (never PII) for TestFlight.
  diagnosticCode: IapDiagnosticCode;
}

export interface IapResult {
  success: boolean;
  error?: string;
  notConfigured?: boolean;
  cancelled?: boolean;
  restored?: number;
  /** When backend missing but native receipt obtained — UI can choose to
   *  show a "preview unlock" message. Pro is NOT activated in this case. */
  pendingValidation?: boolean;
  /** Provisional Pro granted locally (Apple receipt OK but backend not yet
   *  confirmed). Will be re-validated automatically. */
  provisional?: boolean;
  state?: 'PRO' | 'EXPIRED' | 'GRACE_PERIOD' | 'REFUNDED' | 'FREE';
}

async function getCurrentUserId(): Promise<string | undefined> {
  try {
    const supa = getSupabase();
    if (!supa) return undefined;
    const { data } = await supa.auth.getUser();
    return data?.user?.id;
  } catch {
    return undefined;
  }
}

export function useIAP() {
  const { t } = useTranslation();
  const setPro = usePremiumStore((s) => s.purchase);
  const confirmPro = usePremiumStore((s) => s.confirmPro);
  const grantProvisional = usePremiumStore((s) => s.grantProvisionalPro);
  const cancelPro = usePremiumStore((s) => s.cancel);

  const [state, setState] = useState<UseIapState>({
    ready: false,
    available: isIapAvailable(),
    reason: getIapUnavailableReason(),
    phase: 'loading',
    products: [],
    monthly: null,
    annual: null,
    error: null,
    notConfigured: false,
    missingEnv: [],
    diagnosticCode: getIapDiagnostics().code,
  });

  const setPhase = useCallback(
    (phase: IapPhase, patch: Partial<UseIapState> = {}) =>
      setState((s) => ({ ...s, phase, ...patch })),
    []
  );

  // ── Lifecycle ───────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    setPhase('loading', { error: null });
    const ok = await initIap();
    if (!ok) {
      setState((s) => ({
        ...s,
        phase: 'idle',
        ready: false,
        available: false,
        reason: getIapUnavailableReason() || t('iapErrors.unavailable'),
        diagnosticCode: getIapDiagnostics().code,
      }));
      return;
    }
    const products = await fetchSubscriptions();
    const monthly = products.find((p) => p.productId === IAP_PRODUCT_IDS.monthly) ?? null;
    const annual = products.find((p) => p.productId === IAP_PRODUCT_IDS.annual) ?? null;
    setState((s) => ({
      ...s,
      ready: true,
      available: true,
      reason: null,
      phase: 'idle',
      products,
      monthly,
      annual,
      error: null,
      diagnosticCode: getIapDiagnostics().code,
    }));
  }, [setPhase, t]);

  useEffect(() => {
    reload();
    return () => {
      endIap();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Purchase ────────────────────────────────────────────────────────────
  const purchase = useCallback(
    async (plan: IapPlan): Promise<IapResult> => {
      if (!isIapAvailable()) {
        return {
          success: false,
          error: getIapUnavailableReason() || t('iapErrors.unavailable'),
        };
      }

      setPhase('purchasing', { error: null, notConfigured: false });
      try {
        const sku =
          plan === 'monthly' ? IAP_PRODUCT_IDS.monthly : IAP_PRODUCT_IDS.annual;

        // CRITICAL: ensure the product is loaded from App Store Connect BEFORE
        // attempting to purchase. Calling requestSubscription on a product that
        // wasn't returned by getSubscriptions causes the iOS error
        // "Missing purchase request configuration".
        const localProduct = (state.products || []).find((p) => p.productId === sku);
        if (!localProduct) {
          // Try one reload in case products weren't loaded yet
          const freshProducts = await fetchSubscriptions();
          const freshHas = freshProducts.some((p) => p.productId === sku);
          if (!freshHas) {
            setState((s) => ({
              ...s,
              phase: 'idle',
              error: 'product_not_found',
              notConfigured: true,
              products: freshProducts,
            }));
            return {
              success: false,
              notConfigured: true,
              error: `${t('iapErrors.notReadyToSubmit')} ${t('iapErrors.debugTip')}`,
            };
          }
          // Update state with the freshly-loaded products
          setState((s) => ({ ...s, products: freshProducts }));
        }

        const receipt = await requestSubscription(sku);
        if (!receipt) {
          setPhase('idle');
          return { success: false, cancelled: true };
        }

        // Send to backend for validation + Supabase sync
        setPhase('validating');
        const userId = await getCurrentUserId();
        const verdict = await validateOnBackend({
          transaction_id: receipt.transactionId,
          product_id: receipt.productId,
          user_id: userId,
          receipt_data: receipt.transactionReceipt,
        });

        if (verdict.not_configured) {
          // Backend missing keys, but Apple receipt is valid — user PAID.
          // Grant 48h of provisional Pro and queue for later re-validation.
          grantProvisional(plan, 48, {
            transactionId: receipt.transactionId,
            productId: receipt.productId,
            receiptData: receipt.transactionReceipt,
          });
          setState((s) => ({
            ...s,
            phase: 'idle',
            notConfigured: true,
            missingEnv: verdict.missing || [],
            error: null,
          }));
          await finishTransaction(receipt);
          return {
            success: true,
            provisional: true,
            pendingValidation: true,
            notConfigured: true,
            state: 'PRO',
          };
        }

        if (!verdict.valid) {
          const isTransient =
            verdict.error === 'transaction_not_found' ||
            verdict.error === 'network_error' ||
            verdict.error?.includes('timeout');
          if (isTransient) {
            // Apple Sandbox/TestFlight propagation lag — receipt is real,
            // give the user provisional access immediately while we re-try.
            grantProvisional(plan, 48, {
              transactionId: receipt.transactionId,
              productId: receipt.productId,
              receiptData: receipt.transactionReceipt,
            });
            setPhase('idle');
            await finishTransaction(receipt);
            return {
              success: true,
              provisional: true,
              pendingValidation: true,
              state: 'PRO',
            };
          }
          setPhase('idle', {
            error: verdict.error || t('iapErrors.invalidReceipt'),
          });
          // Still finish the txn — backend has the data; user should not be
          // re-prompted on next launch.
          await finishTransaction(receipt);
          return {
            success: false,
            error: verdict.error || t('iapErrors.invalidReceipt'),
            state: (verdict.subscription_state as any) || 'FREE',
          };
        }

        // Server confirmed Pro → unlock locally and finish native txn.
        confirmPro(plan);
        await finishTransaction(receipt);
        setPhase('idle');
        return {
          success: true,
          state: (verdict.subscription_state as any) || 'PRO',
        };
      } catch (e: any) {
        setPhase('idle', { error: e?.message || t('iapErrors.purchaseFailed') });
        return { success: false, error: e?.message || t('iapErrors.purchaseFailed') };
      }
    },
    [setPhase, confirmPro, grantProvisional, t]
  );

  // ── Restore ─────────────────────────────────────────────────────────────
  const restore = useCallback(async (): Promise<IapResult> => {
    if (!isIapAvailable()) {
      return {
        success: false,
        error: getIapUnavailableReason() || t('iapErrors.unavailable'),
      };
    }
    setPhase('restoring', { error: null, notConfigured: false });

    try {
      const receipts = await getAvailableReceipts();
      if (receipts.length === 0) {
        setPhase('idle');
        return { success: false, restored: 0 };
      }

      const userId = await getCurrentUserId();
      let restored = 0;
      let lastState: IapResult['state'] = 'FREE';
      let lastError: string | null = null;
      let serverNotConfigured = false;
      let missingEnv: string[] = [];

      for (const r of receipts) {
        const orig = r.originalTransactionId || r.transactionId;
        const verdict = await restoreOnBackend({
          original_transaction_id: orig,
          user_id: userId,
        });
        if (verdict.not_configured) {
          serverNotConfigured = true;
          missingEnv = verdict.missing || [];
          break;
        }
        if (verdict.valid) {
          const plan: IapPlan =
            r.productId === IAP_PRODUCT_IDS.annual ? 'annual' : 'monthly';
          confirmPro(plan);
          restored += 1;
          lastState = 'PRO';
        } else if (verdict.subscription_state === 'EXPIRED' || verdict.subscription_state === 'REFUNDED') {
          // Silent downgrade so app reflects reality.
          cancelPro();
          lastState = verdict.subscription_state;
          lastError = verdict.error || verdict.subscription_state;
        } else {
          lastError = verdict.error || null;
        }
      }

      if (serverNotConfigured) {
        setState((s) => ({
          ...s,
          phase: 'idle',
          notConfigured: true,
          missingEnv,
        }));
        return { success: false, notConfigured: true, error: 'iap_not_configured' };
      }

      setPhase('idle', { error: restored === 0 ? lastError : null });
      return {
        success: restored > 0,
        restored,
        state: lastState,
        error: restored === 0 ? lastError || undefined : undefined,
      };
    } catch (e: any) {
      setPhase('idle', { error: e?.message || t('iapErrors.purchaseFailed') });
      return { success: false, error: e?.message || t('iapErrors.purchaseFailed') };
    }
  }, [setPhase, confirmPro, cancelPro]);

  // ── Silent sync (called at app boot / on auth change) ───────────────────
  const syncFromBackend = useCallback(async (): Promise<void> => {
    try {
      const userId = await getCurrentUserId();
      if (!userId) return;
      setPhase('syncing');
      const remote = await fetchSubscriptionFromBackend(userId);
      if (!remote) {
        setPhase('idle');
        return;
      }
      // v3.9.0 Build 74 — Backend truth is authoritative.
      //   remote PRO + is_pro=true  → confirm Pro
      //   remote anything else     → revoke local Pro (FREE/EXPIRED/REFUNDED)
      // Exception: keep a valid provisional grant if the SAME transaction is
      // still pending validation (Apple Sandbox propagation lag).
      if (remote.is_pro && remote.subscription_state === 'PRO') {
        const plan: IapPlan =
          remote.apple_product_id === IAP_PRODUCT_IDS.annual ? 'annual' : 'monthly';
        confirmPro(plan);
      } else {
        const local = usePremiumStore.getState();
        const stillPendingValid =
          !!local.pendingValidation &&
          !!local.provisionalProUntil &&
          local.provisionalProUntil > Date.now();
        if (!stillPendingValid) {
          cancelPro();
        }
      }
      setPhase('idle');
    } catch {
      setPhase('idle');
    }
  }, [setPhase, confirmPro, cancelPro]);

  return useMemo(
    () => ({
      ...state,
      // legacy aliases
      loading: state.phase !== 'idle',
      reload,
      purchase,
      restore,
      syncFromBackend,
    }),
    [state, reload, purchase, restore, syncFromBackend]
  );
}

// Standalone helper for one-shot sync (e.g. inside _layout.tsx without React tree)
export async function syncSubscriptionFromBackendOnce(): Promise<void> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return;
    const remote = await fetchSubscriptionFromBackend(userId);
    if (!remote) return;
    const store = usePremiumStore.getState();
    // v3.9.0 Build 74 — Backend truth is authoritative (see syncFromBackend).
    if (remote.is_pro && remote.subscription_state === 'PRO') {
      const plan: IapPlan =
        remote.apple_product_id === IAP_PRODUCT_IDS.annual ? 'annual' : 'monthly';
      store.confirmPro(plan);
    } else {
      const stillPendingValid =
        !!store.pendingValidation &&
        !!store.provisionalProUntil &&
        store.provisionalProUntil > Date.now();
      if (!stillPendingValid) {
        store.cancel();
      }
    }
  } catch {}
}

/**
 * Re-validate any pending receipt against the backend. Called on app
 * foreground / launch to upgrade a provisional Pro to a confirmed Pro once
 * Apple's App Store Server API has propagated the transaction.
 *
 * Never throws. No-op if there's no pending validation.
 */
export async function retryPendingValidationOnce(): Promise<void> {
  try {
    const store = usePremiumStore.getState();
    const pending = store.pendingValidation;
    if (!pending) return;
    // Skip if provisional expired (Apple sandbox usually propagates in <5min)
    if (store.provisionalProUntil && store.provisionalProUntil < Date.now()) {
      store.clearProvisional();
      return;
    }
    const userId = await getCurrentUserId();
    const verdict = await validateOnBackend({
      transaction_id: pending.transactionId,
      product_id: pending.productId,
      user_id: userId,
      receipt_data: pending.receiptData,
    });
    if (verdict.valid) {
      const plan: IapPlan =
        pending.productId === IAP_PRODUCT_IDS.annual ? 'annual' : 'monthly';
      store.confirmPro(plan);
    } else if (
      verdict.subscription_state === 'EXPIRED' ||
      verdict.subscription_state === 'REFUNDED'
    ) {
      // Real refusal — revoke provisional access (e.g. refund).
      store.cancel();
    }
    // Otherwise leave provisional in place; we'll try again next foreground.
  } catch {}
}

// Re-export Platform if needed elsewhere
export { Platform };
