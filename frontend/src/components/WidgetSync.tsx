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
import { useRouter, useRootNavigationState } from 'expo-router';
import { useStore } from '../stores/useStore';
import { useAlertsStore } from '../stores/useAlertsStore';
import {
  widgetBridgeAvailable, refreshWidgetSnapshot, peekPendingRoute, popPendingRoute, peekPendingExpenses,
} from '../services/widgetBridge';

const ROUTES: Record<string, string> = {
  'home': '/',
  'quick-add': '/quick-add',
  'scanner-modal': '/scanner-modal',
  // TÂCHE 4 — cibles des commandes de consultation (repli confidentialité)
  'invoices': '/more/invoices',
  'budgets': '/more/budgets',
};

export default function WidgetSync() {
  const router = useRouter();
  const rootState = useRootNavigationState();
  const navReady = !!rootState?.key; // expo-router avale les push avant montage
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushedPid = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !widgetBridgeAvailable() || !navReady) return;

    const schedule = () => {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => { refreshWidgetSnapshot(); }, 1500);
    };

    const consumeNative = () => {
      // Siri can launch the app BEFORE Swift finishes writing the amount.
      // Also don't pop the route while Zustand is still hydrating: user-scoped
      // drafts are not visible until the matching account has loaded.
      const hasHydrated = (useStore as any).persist?.hasHydrated?.() !== false;
      if (!hasHydrated) return false;
      const route = peekPendingRoute();
      const pending = peekPendingExpenses(route === 'quick-add');
      if (pending.length > 0) {
        const e = pending[0];
        // The native amount is copied only as a visible preview, NEVER saved
        // until the user taps Add. Duplicate routing must not duplicate writes.
        if (pushedPid.current === e.id) {
          if (route === 'quick-add') popPendingRoute();
          return true;
        }
        pushedPid.current = e.id;
        if (route === 'quick-add') popPendingRoute();
        router.push(
          `/quick-add?text=${encodeURIComponent(`${e.amount} CHF ${e.label}`)}&source=siri&pid=${encodeURIComponent(e.id)}` as any,
        );
        return true;
      }
      pushedPid.current = null;
      if (route && ROUTES[route]) {
        // Only now consume native route, after hydration and account lookup.
        popPendingRoute();
        router.push(ROUTES[route] as any);
        return true;
      }
      return false;
    };

    // Démarrage (navigateur prêt) : republier, puis consommer avec réessais —
    // sur un lancement à froid par Siri, la file et le compte actif ne sont
    // visibles qu'après l'hydratation des stores persistés. On réessaie donc
    // brièvement au lieu d'un unique minuteur aveugle.
    refreshWidgetSnapshot();
    // Keep polling very cheap shared UserDefaults while the app is active:
    // Siri's amount prompt may last longer than the old 12-second boot window,
    // and Siri may be invoked while Budgy is already open (no AppState event).
    // Inactive/background state never reads another account's draft.
    const boot = setInterval(() => {
      if (AppState.currentState === 'active') consumeNative();
    }, 1500);

    const appSub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        schedule();
        consumeNative();
      }
    });

    // Changements réels de données → republier. La signature couvre le
    // contenu (montants, dates, statuts, objectifs), pas seulement les
    // longueurs : modification, paiement ou suppression déclenchent aussi.
    const hash = (acc: number, s: string) => {
      for (let i = 0; i < s.length; i++) acc = (acc * 31 + s.charCodeAt(i)) | 0;
      return acc;
    };
    const sig = (s: ReturnType<typeof useStore.getState>) => {
      let a = 0;
      for (const t of s.transactions) a = hash(a, `${t.id}${t.amount}${t.date}${t.category}`);
      for (const i of s.incomes) a = hash(a, `${i.id}${i.amount}${(i as any).type || ''}`);
      for (const v of s.invoices) a = hash(a, `${v.id}${v.amount}${v.status}${v.dueDate || ''}`);
      for (const r of s.recurringExpenses) a = hash(a, `${r.id}${r.amount}${r.dayOfMonth}${r.active}`);
      for (const g of s.savingsGoals || []) a = hash(a, `${g.id}${(g as any).saved || 0}${(g as any).target || 0}`);
      return `${s.user?.id || ''}|${a}`;
    };
    let lastSig = sig(useStore.getState());
    const unsubStore = useStore.subscribe((s) => {
      const next = sig(s);
      if (next !== lastSig) {
        lastSig = next;
        schedule();
      }
    });
    // Changement de compte (scope) → republier immédiatement : les chiffres de
    // l'ancien compte sont écrasés ou purgés (fail-safe dans le bridge), et la
    // file Siri du nouveau compte est consommée (hydratation tardive couverte).
    let lastScope = useAlertsStore.getState().activeScope;
    const unsubScope = useAlertsStore.subscribe((s) => {
      if (s.activeScope !== lastScope) {
        lastScope = s.activeScope;
        refreshWidgetSnapshot();
        consumeNative();
      }
    });

    return () => {
      appSub.remove();
      unsubStore();
      unsubScope();
      clearInterval(boot);
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [router, navReady]);

  return null;
}
