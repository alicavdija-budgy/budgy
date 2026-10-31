/**
 * BUDGY SMART 4.0 — Pont widgets iOS / Siri (App Group).
 *
 * Écrit un instantané des chiffres Budgy dans l'App Group partagé
 * (group.com.budgy.ch.budgy) lu par la cible WidgetKit et l'extension
 * App Intents. Règles :
 *  - AUCUN second moteur budgétaire : on réutilise getMonthlyFinancialSnapshot.
 *  - Confidentialité : budgy.hideAmounts respecté ; montants écran verrouillé
 *    et Siri désactivés par défaut ; purge complète à la déconnexion, à la
 *    suppression des données et au changement de compte (le scope est inclus
 *    dans le snapshot, les widgets de l'ancien compte sont écrasés).
 *  - AUCUN jeton Supabase ni donnée d'identité dans le stockage partagé.
 *  - La file des dépenses Siri n'est vidée qu'après enregistrement confirmé.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore } from '../stores/useStore';
import { useAlertsStore } from '../stores/useAlertsStore';
import { getMonthlyFinancialSnapshot } from '../stores/selectors';

const APP_GROUP = 'group.com.budgy.ch.budgy';
const SNAPSHOT_KEY = 'budgy.widget.snapshot';
const PENDING_KEY = 'budgy.widget.pendingExpenses';
const ROUTE_KEY = 'budgy.widget.pendingRoute';
const PROCESSED_KEY = 'budgy.widget.processedIds';

export const WIDGET_PREF_KEYS = {
  enabled: 'budgy.widgets.enabled', // '0' pour désactiver (actif par défaut)
  lockAmounts: 'budgy.widgets.lockAmounts', // '1' pour afficher sur l'écran verrouillé (OFF par défaut)
  siriAmounts: 'budgy.widgets.siriAmounts', // '1' pour laisser Siri énoncer les montants (OFF par défaut)
} as const;

export interface PendingExpense {
  id: string;
  amount: number;
  label: string;
  scope: string;
  createdAt: number;
}

type Storage = {
  set: (key: string, value?: string) => void;
  get: (key: string) => string | null;
  remove: (key: string) => void;
};

let storage: Storage | null = null;
let reloadWidgets: () => void = () => {};
if (Platform.OS === 'ios') {
  try {
    // Natif uniquement (module absent sur web / Android / Expo Go sans build)

    const mod = require('@bacons/apple-targets');
    storage = new mod.ExtensionStorage(APP_GROUP);
    reloadWidgets = () => {
      try { mod.ExtensionStorage.reloadWidget(); } catch {}
    };
  } catch {
    storage = null;
  }
}

/** Le pont est-il réellement disponible (build natif iOS) ? */
export const widgetBridgeAvailable = () => storage !== null;

function activeScope(): string {
  try { return useAlertsStore.getState().activeScope || 'guest'; } catch { return 'guest'; }
}

/**
 * Reconstruit et publie l'instantané du widget depuis le moteur existant.
 * À appeler : transaction/revenu/facture/objectif modifiés, retour au premier
 * plan, changement de compte, bascule du masquage ou des préférences widgets.
 */
export async function refreshWidgetSnapshot(): Promise<void> {
  if (!storage) return;
  try {
    const [hideRaw, enabledRaw, lockRaw, siriRaw] = await Promise.all([
      AsyncStorage.getItem('budgy.hideAmounts'),
      AsyncStorage.getItem(WIDGET_PREF_KEYS.enabled),
      AsyncStorage.getItem(WIDGET_PREF_KEYS.lockAmounts),
      AsyncStorage.getItem(WIDGET_PREF_KEYS.siriAmounts),
    ]);
    const s = useStore.getState();
    if (!s.user) {
      // Pas de session : aucun chiffre partagé (fail-safe confidentialité).
      clearWidgetDataSync();
      return;
    }
    const snap = getMonthlyFinancialSnapshot({
      incomes: s.incomes,
      transactions: s.transactions,
      recurringExpenses: s.recurringExpenses,
      invoices: s.invoices,
    });
    const goal = (s.savingsGoals || []).find((g: any) => (g.target || 0) > 0);
    const payload = {
      v: 1,
      scope: activeScope(),
      available: Math.round(snap.realAvailableThisMonth * 100) / 100,
      spent: Math.round(snap.paidExpenses * 100) / 100,
      income: Math.round(snap.monthlyIncome * 100) / 100,
      periodLabel: snap.monthLabel,
      goalName: goal ? String(goal.title || '').slice(0, 24) : undefined,
      goalPct: goal ? Math.min(100, Math.round(((goal.saved || 0) / goal.target) * 100)) : undefined,
      currency: 'CHF',
      hide: hideRaw === '1',
      widgetsEnabled: enabledRaw !== '0',
      lockAmounts: lockRaw === '1',
      siriAmounts: siriRaw === '1',
      updatedAt: Date.now() / 1000,
    };
    storage.set(SNAPSHOT_KEY, JSON.stringify(payload));
    reloadWidgets();
  } catch {}
}

function clearWidgetDataSync(): void {
  if (!storage) return;
  try {
    storage.remove(SNAPSHOT_KEY);
    storage.remove(PENDING_KEY);
    storage.remove(ROUTE_KEY);
    reloadWidgets();
  } catch {}
}

/** Purge totale du stockage partagé — déconnexion / suppression des données. */
export async function clearWidgetData(): Promise<void> {
  clearWidgetDataSync();
}

/** Dépenses dictées à Siri pour le compte ACTIF uniquement (sans les retirer). */
export function peekPendingExpenses(): PendingExpense[] {
  if (!storage) return [];
  try {
    const raw = storage.get(PENDING_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as PendingExpense[];
    const scope = activeScope();
    return list.filter(
      (e) => e && typeof e.id === 'string' && e.amount > 0 && (e.scope === scope || e.scope === 'unknown'),
    );
  } catch {
    return [];
  }
}

/**
 * Retire une dépense de la file APRÈS enregistrement confirmé dans le store,
 * et mémorise son id pour qu'elle ne soit jamais enregistrée deux fois
 * (interruption, redémarrage, hors ligne compris).
 */
export async function resolvePendingExpense(id: string): Promise<void> {
  if (!storage) return;
  try {
    const raw = storage.get(PENDING_KEY);
    const list: PendingExpense[] = raw ? JSON.parse(raw) : [];
    storage.set(PENDING_KEY, JSON.stringify(list.filter((e) => e.id !== id)));
    const processedRaw = (await AsyncStorage.getItem(PROCESSED_KEY)) || '[]';
    const processed: string[] = JSON.parse(processedRaw);
    if (!processed.includes(id)) processed.push(id);
    await AsyncStorage.setItem(PROCESSED_KEY, JSON.stringify(processed.slice(-200)));
  } catch {}
}

/** L'identifiant a-t-il déjà été enregistré (anti-doublon absolu) ? */
export async function isAlreadyProcessed(id: string): Promise<boolean> {
  try {
    const processed: string[] = JSON.parse((await AsyncStorage.getItem(PROCESSED_KEY)) || '[]');
    return processed.includes(id);
  } catch {
    return false;
  }
}

/** Écran demandé par Siri / widget (consommé une seule fois). */
export function popPendingRoute(): string | null {
  if (!storage) return null;
  try {
    const r = storage.get(ROUTE_KEY);
    if (r) storage.remove(ROUTE_KEY);
    return r || null;
  } catch {
    return null;
  }
}
