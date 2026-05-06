/**
 * BUDGY — useIAP hook
 * Orchestrates StoreKit/react-native-iap with our Zustand premium store.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  initIap,
  endIap,
  fetchSubscriptions,
  requestSubscription,
  finishTransaction,
  getAvailableReceipts,
  validateReceiptOnBackend,
  isIapAvailable,
  getIapUnavailableReason,
  IAP_PRODUCT_IDS,
  IapProduct,
  IapPlan,
} from '../services/iap';
import { usePremiumStore } from '../stores/usePremiumStore';

export interface UseIapState {
  ready: boolean;               // connection + products loaded
  available: boolean;           // StoreKit accessible on this device/env
  reason: string | null;        // reason for unavailability (e.g. web, Expo Go)
  loading: boolean;
  products: IapProduct[];
  monthly: IapProduct | null;
  annual: IapProduct | null;
  error: string | null;
}

export function useIAP() {
  const { purchase: setPurchased } = usePremiumStore();
  const [state, setState] = useState<UseIapState>({
    ready: false,
    available: isIapAvailable(),
    reason: getIapUnavailableReason(),
    loading: true,
    products: [],
    monthly: null,
    annual: null,
    error: null,
  });

  const reload = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    const ok = await initIap();
    if (!ok) {
      setState(s => ({
        ...s,
        loading: false,
        available: false,
        reason: getIapUnavailableReason() || 'IAP indisponible sur cet appareil',
      }));
      return;
    }
    const products = await fetchSubscriptions();
    const monthly = products.find(p => p.productId === IAP_PRODUCT_IDS.monthly) ?? null;
    const annual = products.find(p => p.productId === IAP_PRODUCT_IDS.annual) ?? null;
    setState({
      ready: true,
      available: true,
      reason: null,
      loading: false,
      products,
      monthly,
      annual,
      error: null,
    });
  }, []);

  useEffect(() => {
    reload();
    return () => {
      endIap();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const purchase = useCallback(
    async (plan: IapPlan): Promise<{ success: boolean; error?: string }> => {
      if (!isIapAvailable()) {
        return { success: false, error: getIapUnavailableReason() || 'IAP indisponible' };
      }
      try {
        setState(s => ({ ...s, loading: true, error: null }));
        const sku =
          plan === 'monthly' ? IAP_PRODUCT_IDS.monthly : IAP_PRODUCT_IDS.annual;

        const receipt = await requestSubscription(sku);
        if (!receipt) {
          // User cancelled
          setState(s => ({ ...s, loading: false }));
          return { success: false, error: 'cancelled' };
        }

        // Server-side validation — never trust the client
        const validation = await validateReceiptOnBackend(receipt);
        if (!validation.valid) {
          setState(s => ({ ...s, loading: false, error: validation.error || 'Reçu invalide' }));
          return { success: false, error: validation.error || 'Reçu invalide' };
        }

        // Unlock premium locally
        setPurchased(plan);

        // Finish native transaction (remove from queue)
        await finishTransaction(receipt);

        setState(s => ({ ...s, loading: false, error: null }));
        return { success: true };
      } catch (e: any) {
        setState(s => ({ ...s, loading: false, error: e?.message || 'Achat échoué' }));
        return { success: false, error: e?.message || 'Achat échoué' };
      }
    },
    [setPurchased]
  );

  const restore = useCallback(async (): Promise<{ success: boolean; restored: number }> => {
    if (!isIapAvailable()) return { success: false, restored: 0 };
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const receipts = await getAvailableReceipts();
      let restored = 0;
      for (const r of receipts) {
        const v = await validateReceiptOnBackend(r);
        if (v.valid) {
          const plan: IapPlan =
            r.productId === IAP_PRODUCT_IDS.annual ? 'annual' : 'monthly';
          setPurchased(plan);
          restored += 1;
        }
      }
      setState(s => ({ ...s, loading: false }));
      return { success: restored > 0, restored };
    } catch (e: any) {
      setState(s => ({ ...s, loading: false, error: e?.message || 'Restore failed' }));
      return { success: false, restored: 0 };
    }
  }, [setPurchased]);

  return useMemo(
    () => ({
      ...state,
      reload,
      purchase,
      restore,
    }),
    [state, reload, purchase, restore]
  );
}
