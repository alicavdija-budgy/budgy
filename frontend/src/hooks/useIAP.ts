/**
 * BUDGY — useIAP hook (backend-first)
 *
 * Build 79 hardening:
 *   - requires a valid Supabase session BEFORE opening StoreKit;
 *   - never charges a local/demo-only user that the backend cannot identify;
 *   - maps auth failures to a localized message instead of exposing
 *     `missing_token` / backend implementation details;
 *   - restore and pending-validation paths use the same auth preflight.
 *
 * Production flow:
 *   purchase() → auth preflight → StoreKit → backend validation → Pro
 *   restore()  → auth preflight → StoreKit receipts → backend restore → Pro
 *   sync()     → authenticated /api/iap/me → authoritative subscription state
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
  getIapAuthenticatedUserId,
  isIapAvailable,
  getIapUnavailableReason,
  getIapDiagnostics,
  IAP_PRODUCT_IDS,
  IapProduct,
  IapPlan,
  IapDiagnosticCode,
} from '../services/iap';
import { usePremiumStore } from '../stores/usePremiumStore';
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
  notConfigured: boolean;
  missingEnv: string[];
  diagnosticCode: IapDiagnosticCode;
}

export interface IapResult {
  success: boolean;
  error?: string;
  notConfigured?: boolean;
  cancelled?: boolean;
  restored?: number;
  pendingValidation?: boolean;
  provisional?: boolean;
  state?: 'PRO' | 'EXPIRED' | 'GRACE_PERIOD' | 'REFUNDED' | 'FREE';
}

export function useIAP() {
  const { t } = useTranslation();
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

  const authError = useCallback(() => t('errors.unauthorized'), [t]);

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
        // Build 79: account preflight MUST happen before Apple's purchase sheet.
        // This prevents a successful charge followed by backend `missing_token`.
        const userId = await getIapAuthenticatedUserId();
        if (!userId) {
          const message = authError();
          setPhase('idle', { error: message });
          return { success: false, error: message };
        }

        const sku =
          plan === 'monthly' ? IAP_PRODUCT_IDS.monthly : IAP_PRODUCT_IDS.annual;

        const localProduct = (state.products || []).find((p) => p.productId === sku);
        let productForSku = localProduct || null;
        if (!localProduct) {
          const freshProducts = await fetchSubscriptions();
          const freshProduct = freshProducts.find((p) => p.productId === sku) || null;
          if (!freshProduct) {
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
          productForSku = freshProduct;
          setState((s) => ({ ...s, products: freshProducts }));
        }

        const receipt = await requestSubscription(sku, {
          androidOfferToken: productForSku?.androidOfferToken ?? null,
        });
        if (!receipt) {
          setPhase('idle');
          return { success: false, cancelled: true };
        }

        setPhase('validating');
        const verdict = await validateOnBackend({
          transaction_id: receipt.transactionId,
          product_id: receipt.productId,
          user_id: userId,
          receipt_data: receipt.transactionReceipt,
        });

        // Auth failures are explicit, non-transient and NEVER eligible for
        // provisional Pro. The user can sign in and use Restore Purchases.
        if (verdict.error === 'auth_required') {
          const message = authError();
          setPhase('idle', { error: message });
          await finishTransaction(receipt);
          return { success: false, error: message, state: 'FREE' };
        }

        if (verdict.not_configured) {
          // A real StoreKit transaction exists, but our Apple validation service
          // is temporarily unavailable. Keep the bounded, account-scoped 48h
          // provisional path so a paid user is not locked out.
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
          await finishTransaction(receipt);
          return {
            success: false,
            error: verdict.error || t('iapErrors.invalidReceipt'),
            state: (verdict.subscription_state as any) || 'FREE',
          };
        }

        confirmPro(plan);
        await finishTransaction(receipt);
        setPhase('idle');
        return {
          success: true,
          state: (verdict.subscription_state as any) || 'PRO',
        };
      } catch (e: any) {
        const isAuth = e?.code === 'auth_required' || e?.message === 'auth_required';
        const message = isAuth
          ? authError()
          : e?.message || t('iapErrors.purchaseFailed');
        setPhase('idle', { error: message });
        return { success: false, error: message };
      }
    },
    [setPhase, state.products, confirmPro, grantProvisional, authError, t]
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
      // Restore is account-bound too. Fail before touching backend if this is
      // a demo/local-only session; no raw `missing_token` should reach the UI.
      const userId = await getIapAuthenticatedUserId();
      if (!userId) {
        const message = authError();
        setPhase('idle', { error: message });
        return { success: false, restored: 0, error: message };
      }

      const receipts = await getAvailableReceipts();
      if (receipts.length === 0) {
        setPhase('idle');
        return { success: false, restored: 0 };
      }

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
        if (verdict.error === 'auth_required') {
          lastError = authError();
          break;
        }
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
        } else if (
          verdict.subscription_state === 'EXPIRED' ||
          verdict.subscription_state === 'REFUNDED'
        ) {
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
      const isAuth = e?.code === 'auth_required' || e?.message === 'auth_required';
      const message = isAuth
        ? authError()
        : e?.message || t('iapErrors.purchaseFailed');
      setPhase('idle', { error: message });
      return { success: false, error: message };
    }
  }, [setPhase, confirmPro, cancelPro, authError, t]);

  // ── Silent sync ─────────────────────────────────────────────────────────
  const syncFromBackend = useCallback(async (): Promise<void> => {
    try {
      const userId = await getIapAuthenticatedUserId();
      if (!userId) return;
      setPhase('syncing');
      const remote = await fetchSubscriptionFromBackend(userId);
      if (!remote) {
        setPhase('idle');
        return;
      }
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
    const userId = await getIapAuthenticatedUserId();
    if (!userId) return;
    const remote = await fetchSubscriptionFromBackend(userId);
    if (!remote) return;
    const store = usePremiumStore.getState();
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
 * Re-validate a pending receipt after a genuine transient Apple/backend delay.
 * Auth failures are not provisional-eligible and are never silently retried as
 * if they were network propagation errors.
 */
export async function retryPendingValidationOnce(): Promise<void> {
  try {
    const store = usePremiumStore.getState();
    const pending = store.pendingValidation;
    if (!pending) return;
    if (store.provisionalProUntil && store.provisionalProUntil < Date.now()) {
      store.clearProvisional();
      return;
    }
    const userId = await getIapAuthenticatedUserId();
    if (!userId) return;
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
      store.cancel();
    }
  } catch {}
}

export { Platform };
