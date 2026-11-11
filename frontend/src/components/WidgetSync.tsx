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
  widgetBridgeAvailable, refreshWidgetSnapshot, popPendingRoute, peekPendingExpenses,
} from '../services/widgetBridge';

const ROUTES: Record<string, string> = {
  'home': '/',
  'quick-add': '/quick-add',
  'scanner-modal': '/scanner-modal',
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
      const route = popPendingRoute();
      const pending = peekPendingExpenses();
      if (pending.length > 0) {
        const e = pending[0];
        // Une seule présentation par dépense dictée : jamais de double push
        // pendant que l'utilisateur confirme dans /quick-add.
        if (pushedPid.current === e.id) return true;
        pushedPid.current = e.id;
        router.push(
          `/quick-add?text=${encodeURIComponent(`${e.amount} CHF ${e.label}`)}&source=siri&pid=${encodeURIComponent(e.id)}` as any,
        );
        return true;
      }
      if (route && ROUTES[route]) {
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
    let tries = 0;
    const boot = setInterval(() => {
      tries += 1;
      const consumed = consumeNative();
      if (consumed || tries >= 15) clearInterval(boot);
    }, 800);

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
