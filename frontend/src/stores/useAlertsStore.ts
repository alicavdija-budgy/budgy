/**
 * BUDGY ALERTS — préférences + historique d'alertes (Budgy Smart 4.0, Phase 3).
 *
 * Store zustand persisté (AsyncStorage), séparé de useStore pour ne toucher
 * à aucune donnée financière. Lisible hors React via useAlertsStore.getState()
 * (utilisé par le service de notifications pour respecter les préférences).
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AlertCategory, BudgyAlert } from '../services/alertsEngine';

export interface AlertsPrefs {
  categories: Record<AlertCategory, boolean>;
  /** Heures silencieuses : aucune notification immédiate entre start et end */
  quietStart: number; // heure 0-23
  quietEnd: number;   // heure 0-23
  quietEnabled: boolean;
  /** 'reduced' = au plus 1 nouvelle alerte par catégorie et par jour */
  frequency: 'normal' | 'reduced';
  /** false (défaut) = aucun montant sur l'écran verrouillé */
  showAmountsOnLockScreen: boolean;
}

export const DEFAULT_ALERTS_PREFS: AlertsPrefs = {
  categories: { contracts: true, budget: true, invoices: true, fuel: false, news: false },
  quietStart: 22,
  quietEnd: 7,
  quietEnabled: true,
  frequency: 'normal',
  showAmountsOnLockScreen: false,
};

interface AlertsState {
  prefs: AlertsPrefs;
  alerts: BudgyAlert[];
  setCategoryEnabled: (cat: AlertCategory, enabled: boolean) => void;
  setQuietHours: (enabled: boolean, start?: number, end?: number) => void;
  setFrequency: (f: AlertsPrefs['frequency']) => void;
  setShowAmounts: (v: boolean) => void;
  /** Ajoute uniquement les alertes nouvelles (dédupliquées par id stable). */
  upsertAlerts: (incoming: BudgyAlert[]) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
}

const MAX_ALERTS = 50;

export const useAlertsStore = create<AlertsState>()(
  persist(
    (set, get) => ({
      prefs: DEFAULT_ALERTS_PREFS,
      alerts: [],

      setCategoryEnabled: (cat, enabled) =>
        set((s) => ({ prefs: { ...s.prefs, categories: { ...s.prefs.categories, [cat]: enabled } } })),
      setQuietHours: (enabled, start, end) =>
        set((s) => ({
          prefs: {
            ...s.prefs,
            quietEnabled: enabled,
            quietStart: start ?? s.prefs.quietStart,
            quietEnd: end ?? s.prefs.quietEnd,
          },
        })),
      setFrequency: (frequency) => set((s) => ({ prefs: { ...s.prefs, frequency } })),
      setShowAmounts: (showAmountsOnLockScreen) =>
        set((s) => ({ prefs: { ...s.prefs, showAmountsOnLockScreen } })),

      upsertAlerts: (incoming) => {
        const { alerts, prefs } = get();
        const known = new Set(alerts.map((a) => a.id));
        const today = new Date().toDateString();
        // Anti-répétition : en mode réduit, max 1 nouvelle alerte/jour/catégorie
        const addedToday: Record<string, number> = {};
        for (const a of alerts) {
          if (new Date(a.createdAt).toDateString() === today) {
            addedToday[a.category] = (addedToday[a.category] || 0) + 1;
          }
        }
        const fresh: BudgyAlert[] = [];
        for (const a of incoming) {
          if (known.has(a.id)) continue;
          if (prefs.frequency === 'reduced' && (addedToday[a.category] || 0) >= 1) continue;
          addedToday[a.category] = (addedToday[a.category] || 0) + 1;
          fresh.push(a);
        }
        if (!fresh.length) return;
        set({ alerts: [...fresh, ...alerts].slice(0, MAX_ALERTS) });
      },

      markRead: (id) =>
        set((s) => ({ alerts: s.alerts.map((a) => (a.id === id ? { ...a, read: true } : a)) })),
      markAllRead: () => set((s) => ({ alerts: s.alerts.map((a) => ({ ...a, read: true })) })),
      clearAll: () => set({ alerts: [] }),
    }),
    {
      name: 'budgy-alerts-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
