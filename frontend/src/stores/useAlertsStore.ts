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
  /** Scope de données actif : 'guest', 'demo' ou 'user:<id>' */
  activeScope: string;
  /** Données des autres scopes (isolation par compte sur le même appareil) */
  scopes: Record<string, { prefs: AlertsPrefs; alerts: BudgyAlert[] }>;
  /** Bascule vers le scope d'un compte : snapshot du scope courant, puis
   *  chargement du scope cible. Les ALERTES ne traversent JAMAIS les
   *  comptes ; seules les préférences du scope invité servent de graine
   *  (migration non destructive des réglages de l'appareil). */
  setActiveScope: (scope: string) => void;
  /** Efface définitivement les alertes/préférences du scope courant
   *  (utilisé par « Supprimer mes données »). */
  clearActiveScope: () => void;
  setCategoryEnabled: (cat: AlertCategory, enabled: boolean) => void;
  setQuietHours: (enabled: boolean, start?: number, end?: number) => void;
  setFrequency: (f: AlertsPrefs['frequency']) => void;
  setShowAmounts: (v: boolean) => void;
  /** Ajoute uniquement les alertes nouvelles (dédupliquées par id stable). */
  upsertAlerts: (incoming: BudgyAlert[]) => void;
  resolveMissing: (category: AlertCategory, freshIds: string[]) => void;
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
      activeScope: 'guest',
      scopes: {},

      setActiveScope: (scope) => {
        const s = get();
        if (scope === s.activeScope) return;
        // Snapshot du scope courant
        const scopes = { ...s.scopes, [s.activeScope]: { prefs: s.prefs, alerts: s.alerts } };
        // Chargement du scope cible — jamais d'alertes d'un autre compte.
        // Nouveau scope : préférences héritées du scope invité (réglages de
        // l'appareil, non sensibles), alertes vides.
        const seedPrefs = scopes[scope]?.prefs
          ?? scopes.guest?.prefs
          ?? DEFAULT_ALERTS_PREFS;
        const next = scopes[scope] ?? {
          prefs: { ...seedPrefs, categories: { ...seedPrefs.categories } },
          alerts: [],
        };
        set({ activeScope: scope, scopes, prefs: next.prefs, alerts: next.alerts });
      },

      clearActiveScope: () => {
        const s = get();
        const scopes = { ...s.scopes };
        delete scopes[s.activeScope];
        set({ scopes, prefs: DEFAULT_ALERTS_PREFS, alerts: [] });
      },

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

      /** Marque lues les alertes non lues d'une catégorie dont l'id n'existe
       *  plus dans l'évaluation courante (ex. facture payée/supprimée). */
      resolveMissing: (category, freshIds) => {
        const valid = new Set(freshIds);
        set((s) => ({
          alerts: s.alerts.map((a) =>
            a.category === category && !a.read && !valid.has(a.id) ? { ...a, read: true } : a,
          ),
        }));
      },

      markRead: (id) =>
        set((s) => ({ alerts: s.alerts.map((a) => (a.id === id ? { ...a, read: true } : a)) })),
      markAllRead: () => set((s) => ({ alerts: s.alerts.map((a) => ({ ...a, read: true })) })),
      clearAll: () => set({ alerts: [] }),
    }),
    {
      name: 'budgy-alerts-storage',
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      // Migration non destructive : l'historique/préférences pré-Phase 4
      // (non scopés) deviennent le scope 'guest' de l'appareil.
      migrate: (persisted: any, version) => {
        if (version < 2 && persisted) {
          return {
            prefs: persisted.prefs ?? DEFAULT_ALERTS_PREFS,
            alerts: persisted.alerts ?? [],
            activeScope: 'guest',
            scopes: {},
          };
        }
        return persisted;
      },
    },
  ),
);
