/**
 * BUDGY — Synchronisation des widgets iOS et de Siri.
 * Monté une fois dans le layout racine. Sans UI.
 *
 * - Republie l'instantané du widget quand les données changent réellement
 *   (transactions, revenus, factures, objectifs, charges, compte) ou au
 *   retour au premier plan (debounce, respect des limites WidgetKit).
 * - Consomme la route demandée par Siri / le widget et la file des dépenses
 *   dictées (une à la fois, via le formulaire de confirmation /quick-add).
 */
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '../stores/useStore';
import { useAlertsStore } from '../stores/useAlertsStore';
import {
  widgetBridgeAvailable, refreshWidgetSnapshot, popPendingRoute, peekPendingExpenses,
} from '../services/widgetBridge';

const ROUTES: Record<string, string> = {
  'home': '/',
  'quick-add': '/quick-add',
  'scanner-modal': '/scanner-modal',
};

export default function WidgetSync() {
  const router = useRouter();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !widgetBridgeAvailable()) return;

    const schedule = () => {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => { refreshWidgetSnapshot(); }, 1500);
    };

    const consumeNative = () => {
      const route = popPendingRoute();
      const pending = peekPendingExpenses();
      if (pending.length > 0) {
        const e = pending[0];
        router.push(
          `/quick-add?text=${encodeURIComponent(`${e.amount} CHF ${e.label}`)}&source=siri&pid=${encodeURIComponent(e.id)}` as any,
        );
      } else if (route && ROUTES[route]) {
        router.push(ROUTES[route] as any);
      }
    };

    // Démarrage : republier + consommer ce que Siri a laissé.
    refreshWidgetSnapshot();
    setTimeout(consumeNative, 600);

    const appSub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        schedule();
        consumeNative();
      }
    });

    // Changements réels de données → republier (signature légère).
    let lastSig = '';
    const sig = (s: ReturnType<typeof useStore.getState>) =>
      `${s.user?.id || ''}|${s.transactions.length}|${s.incomes.length}|${s.invoices.length}|${s.recurringExpenses.length}|${(s.savingsGoals || []).length}`;
    lastSig = sig(useStore.getState());
    const unsubStore = useStore.subscribe((s) => {
      const next = sig(s);
      if (next !== lastSig) {
        lastSig = next;
        schedule();
      }
    });
    // Changement de compte (scope) → republier immédiatement : les chiffres de
    // l'ancien compte sont écrasés ou purgés (fail-safe dans le bridge).
    let lastScope = useAlertsStore.getState().activeScope;
    const unsubScope = useAlertsStore.subscribe((s) => {
      if (s.activeScope !== lastScope) {
        lastScope = s.activeScope;
        refreshWidgetSnapshot();
      }
    });

    return () => {
      appSub.remove();
      unsubStore();
      unsubScope();
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [router]);

  return null;
}
