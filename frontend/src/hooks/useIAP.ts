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
 *   restore()  → auth preflight → StoreKit sync + receipts → backend restore → Pro
 *   sync()     → authenticated /api/iap/me → authoritative subscription state
 *
 * Already-owned recovery (Build 81):
 *   When StoreKit answers "already owned" on purchase, the SAME reconciliation
 *   used by restore() runs once (never re-entering purchase(), so no loop) and
 *   recovers the entitlement through backend validation instead of surfacing
 *   the raw error to the user.
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
  isAlreadyOwnedError,
  IAP_PRODUCT_IDS,
  IAP_SKUS,
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

// ── Shared Apple → backend reconciliation ─────────────────────────────────
/**
 * Single restore implementation used by BOTH the user-facing "Restore
 * Purchases" action and the already-owned purchase recovery path.
 *
 * Flow: StoreKit sync (AppStore.sync on iOS) → getAvailablePurchases →
 * filter Budgy subscription SKUs → backend /api/iap/restore per original
 * transaction → apply the authoritative backend verdict.
 *
 * It never calls purchase()/requestSubscription, so a purchase→restore loop
 * is structurally impossible. Premium is only confirmed after the backend
 * validated the Apple subscription (verdict.valid).
 */
interface ReconcileOutcome {
  restored: number;
  lastState: NonNullable<IapResult['state']>;
  lastError: string | null;
  authFailed: boolean;
  notConfigured: boolean;
  missingEnv: string[];
}

async function reconcileEntitlements(
  userId: string,
  confirmProAction: (plan: IapPlan) => void,
  cancelProAction: () => void
): Promise<ReconcileOutcome> {
  const outcome: ReconcileOutcome = {
    restored: 0,
    lastState: 'FREE',
    lastError: null,
    authFailed: false,
    notConfigured: false,
    missingEnv: [],
  };

  // syncFirst performs a real Apple restore so entitlements are visible even
  // after reinstall / device change / an unfinished historical transaction.
  const receipts = (await getAvailableReceipts({ syncFirst: true })).filter(
    (r) => IAP_SKUS.includes(r.productId)
  );
  if (receipts.length === 0) return outcome;

  let sawInactive: 'EXPIRED' | 'REFUNDED' | null = null;

  for (const receipt of receipts) {
    const orig = receipt.originalTransactionId || receipt.transactionId;
    const verdict = await restoreOnBackend({
      original_transaction_id: orig,
      user_id: userId,
    });
    if (verdict.error === 'auth_required') {
      outcome.authFailed = true;
      break;
    }
    if (verdict.not_configured) {
      outcome.notConfigured = true;
      outcome.missingEnv = verdict.missing || [];
      break;
    }
    if (verdict.valid) {
      const plan: IapPlan =
        receipt.productId === IAP_PRODUCT_IDS.annual ? 'annual' : 'monthly';
      confirmProAction(plan);
      outcome.restored += 1;
      outcome.lastState = 'PRO';
      // Backend confirmed the entitlement: acknowledge the StoreKit
      // transaction so it does not linger unfinished and keep re-triggering
      // "Item already owned" on the next purchase attempt.
      await finishTransaction(receipt);
    } else if (
      verdict.subscription_state === 'EXPIRED' ||
      verdict.subscription_state === 'REFUNDED'
    ) {
      sawInactive = verdict.subscription_state;
      outcome.lastError = verdict.error || verdict.subscription_state;
    } else {
      outcome.lastError = verdict.error || null;
    }
  }

  // Downgrade only when NO receipt produced a valid entitlement — an old
  // expired monthly must never cancel a freshly restored active annual.
  if (outcome.restored === 0 && sawInactive) {
    cancelProAction();
    outcome.lastState = sawInactive;
  }

  if (__DEV__) {
    // Diagnostics only — never receipt/JWS contents or tokens.
    console.log('[IAP] reconcile', {
      receiptProductIds: receipts.map((r) => r.productId),
      restored: outcome.restored,
      state: outcome.lastState,
      authFailed: outcome.authFailed,
      notConfigured: outcome.notConfigured,
    });
  }
  return outcome;
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
          if (__DEV__) console.warn('[IAP] backend rejected purchase:', verdict.error);
          const rejectMessage = t('iapErrors.invalidReceipt');
          setPhase('idle', { error: rejectMessage });
          await finishTransaction(receipt);
          return {
            success: false,
            error: rejectMessage,
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

        // "Item already owned": this Apple ID already holds the subscription
        // (typically an unfinished/unsynced historical transaction) while the
        // Budgy account state does not reflect it yet. Never surface the raw
        // StoreKit error — run the SAME safe restore/reconciliation used by
        // the Restore button, exactly once (purchase() is never re-entered,
        // so no purchase/restore loop is possible).
        if (!isAuth && isAlreadyOwnedError(e)) {
          try {
            const ownerId = await getIapAuthenticatedUserId();
            if (ownerId) {
              setPhase('validating');
              const outcome = await reconcileEntitlements(ownerId, confirmPro, cancelPro);
              if (outcome.restored > 0) {
                setPhase('idle', { error: null });
                return { success: true, restored: outcome.restored, state: 'PRO' };
              }
              if (outcome.notConfigured) {
                setState((s) => ({
                  ...s,
                  phase: 'idle',
                  notConfigured: true,
                  missingEnv: outcome.missingEnv,
                }));
                return { success: false, notConfigured: true, error: 'iap_not_configured' };
              }
              if (outcome.lastState === 'EXPIRED' || outcome.lastState === 'REFUNDED') {
                const message = t('iap.restoreExpiredBody');
                setPhase('idle', { error: message });
                return { success: false, error: message, state: outcome.lastState };
              }
            }
          } catch (reconcileError: any) {
            if (__DEV__) {
              console.warn(
                '[IAP] already-owned reconciliation failed',
                reconcileError?.code,
                reconcileError?.message
              );
            }
          }
          const fallback = t('iap.buyFailedBody');
          setPhase('idle', { error: fallback });
          return { success: false, error: fallback };
        }

        if (__DEV__ && !isAuth) console.warn('[IAP] purchase failed', e?.code, e?.message);
        // Localized message only — internal codes/raw store errors stay in logs.
        const message = isAuth ? authError() : t('iap.buyFailedBody');
        setPhase('idle', { error: message });
        return { success: false, error: message };
      }
    },
    [setPhase, state.products, confirmPro, cancelPro, grantProvisional, authError, t]
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

      // Shared reconciliation: real Apple restore/sync → Budgy SKUs → backend
      // validation. Never concludes "no subscription" before StoreKit has been
      // properly synchronized (AppStore.sync on iOS).
      const outcome = await reconcileEntitlements(userId, confirmPro, cancelPro);

      if (outcome.authFailed) {
        const message = authError();
        setPhase('idle', { error: message });
        return { success: false, restored: 0, error: message };
      }
      if (outcome.notConfigured) {
        setState((s) => ({
          ...s,
          phase: 'idle',
          notConfigured: true,
          missingEnv: outcome.missingEnv,
        }));
        return { success: false, notConfigured: true, error: 'iap_not_configured' };
      }
      if (outcome.restored > 0) {
        setPhase('idle', { error: null });
        return { success: true, restored: outcome.restored, state: outcome.lastState };
      }
      if (outcome.lastState === 'EXPIRED' || outcome.lastState === 'REFUNDED') {
        setPhase('idle');
        return { success: false, restored: 0, state: outcome.lastState };
      }
      if (outcome.lastError) {
        // Backend/technical failure (network, ownership check…) — this is NOT
        // the same as "no subscription found". Localized retry message only,
        // never the raw internal error code.
        const message = t('iap.restoreFailedBody');
        setPhase('idle', { error: message });
        return { success: false, restored: 0, error: message };
      }
      // Genuinely no valid Budgy entitlement on this Apple account.
      setPhase('idle');
      return { success: false, restored: 0, state: 'FREE' };
    } catch (e: any) {
      const isAuth = e?.code === 'auth_required' || e?.message === 'auth_required';
      if (__DEV__ && !isAuth) console.warn('[IAP] restore failed', e?.code, e?.message);
      const message = isAuth ? authError() : t('iap.restoreFailedBody');
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
