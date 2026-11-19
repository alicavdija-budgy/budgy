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
import { getMonthlyFinancialSnapshot, computeBudgetConsumption, parseDate } from '../stores/selectors';

// Isolation préprod : App Group distinct — le build de test n'écrit JAMAIS
// dans le conteneur partagé du Budgy de production (et réciproquement).
const APP_GROUP = process.env.EXPO_PUBLIC_APP_VARIANT === 'preprod'
  ? 'group.com.budgy.ch.budgy.preprod'
  : 'group.com.budgy.ch.budgy';
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
    const mod = require('@bacons/apple-targets');
    // apple-targets may expose a no-op JS shim if its Expo native module
    // wasn't registered when the JS bundle was evaluated. Constructing
    // ExtensionStorage alone does NOT prove App Group access is working.
    const candidate = new mod.ExtensionStorage(APP_GROUP) as Storage;
    const probeKey = 'budgy.widget.bridge.ready';
    const probe = (bridge: Storage): boolean => {
      try {
        bridge.set(probeKey, 'ready');
        const ok = bridge.get(probeKey) === 'ready';
        bridge.remove(probeKey);
        return ok;
      } catch { return false; }
    };
    if (probe(candidate)) {
      storage = candidate;
      reloadWidgets = () => { try { mod.ExtensionStorage.reloadWidget(); } catch {} };
    } else {
      // Expo SDK 54+ can register the native module through
      // requireOptionalNativeModule while the apple-targets JS singleton was
      // evaluated before global expo.modules became ready.
      const core = require('expo-modules-core');
      const native = core.requireOptionalNativeModule?.('ExtensionStorage');
      if (native && typeof native.get === 'function' &&
          typeof native.setString === 'function') {
        const direct: Storage = {
          set: (key, value) => {
            if (value === undefined) native.remove(key, APP_GROUP);
            else native.setString(key, value, APP_GROUP);
          },
          get: (key) => native.get(key, APP_GROUP) ?? null,
          remove: (key) => native.remove(key, APP_GROUP),
        };
        if (probe(direct)) {
          storage = direct;
          reloadWidgets = () => { try { native.reloadWidget?.(null); } catch {} };
        }
      }
    }
    if (!storage) console.warn('[budgy-siri] Native App Group bridge is unavailable');
  } catch {
    storage = null;
    console.warn('[budgy-siri] App Group storage initialization failed');
  }
}

/** Le pont est-il réellement disponible (build natif iOS) ? */
export const widgetBridgeAvailable = () => storage !== null;

function activeScope(): string {
  // An authenticated account must NEVER publish a guest-scoped Siri snapshot.
  // After cold start alerts hydration may temporarily still report 'guest'.
  const uid = useStore.getState().user?.id;
  if (uid) return `user:${uid}`;
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
    // DÉMARRAGE À FROID (Siri) — distinction OBLIGATOIRE entre :
    //  a) store pas encore hydraté (lancement) : NE RIEN TOUCHER — surtout
    //     pas la file des dépenses dictées ni la route demandée par Siri ;
    //  b) session réellement absente (hydraté, pas d'utilisateur) : on retire
    //     uniquement les CHIFFRES (snapshot). La file Siri reste : elle est
    //     filtrée par scope et ne sera consommée que par le bon compte.
    // La purge TOTALE (file comprise) n'a lieu que sur action explicite :
    //     déconnexion / suppression des données / changement de compte
    //     → clearWidgetData().
    const hydrated = (() => {
      try { return (useStore as any).persist?.hasHydrated?.() !== false; } catch { return true; }
    })();
    if (!hydrated) return;
    if (!s.user) {
      storage.remove(SNAPSHOT_KEY);
      reloadWidgets();
      return;
    }
    const snap = getMonthlyFinancialSnapshot({
      incomes: s.incomes,
      transactions: s.transactions,
      recurringExpenses: s.recurringExpenses,
      invoices: s.invoices,
      debts: s.debts,
    });
    const goal = (s.savingsGoals || []).find((g: any) => (g.target || 0) > 0);
    // TÂCHE 4 — données RÉELLES pour les commandes Siri. Périmètre des
    // factures EXPLICITE et UNIQUE : « exigibles d'ici la fin du mois »
    // (y compris déjà en retard) — billsCount et billsTotal portent sur le
    // MÊME périmètre (le total CHF exclut les devises étrangères, énoncées à
    // part). Échéances triées sur dates réellement analysées (parseDate).
    const nowD = new Date();
    const endOfMonth = new Date(nowD.getFullYear(), nowD.getMonth() + 1, 0, 23, 59, 59, 999);
    const dueBillsList = (s.invoices || []).filter((i: any) => {
      if ((i.status || '') === 'paid') return false;
      const due = parseDate(i.dueDate);
      return !due || due <= endOfMonth;
    });
    const nextDue = dueBillsList
      .map((i: any) => ({ i, d: parseDate(i.dueDate) }))
      .filter((x: any) => !!x.d)
      .sort((a: any, b: any) => a.d.getTime() - b.d.getTime())[0]?.i;
    const savedTotal = (s.savingsGoals || []).reduce((sum: number, g: any) => sum + (Number(g.saved) || 0), 0);
    // Budget mensuel : SÉLECTEUR PARTAGÉ avec l'écran Budgets (limites
    // réelles budget.limit + transactions du mois par catégorie — jamais un
    // second moteur qui diverge de l'interface).
    const consumption = computeBudgetConsumption(
      s.budgets as any, s.transactions as any, nowD.getFullYear(), nowD.getMonth(),
    );
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
      // TÂCHE 4 — Siri factures / épargne / budget (champs optionnels).
      // billsCount et billsTotal = MÊME périmètre (exigibles fin de mois).
      billsCount: snap.dueBillsCount,
      billsOverdue: snap.overdueBillsCount || undefined,
      billsTotal: Math.round(snap.upcomingBills * 100) / 100,
      billsForeign: (snap.foreignBills || [])
        .map((f) => `${f.count} × ${f.currency} ${f.total.toFixed(2)}`)
        .join(', ') || undefined,
      nextBillTitle: nextDue ? String(nextDue.title || '').slice(0, 30) : undefined,
      nextBillDue: nextDue ? String(nextDue.dueDate) : undefined,
      savedTotal: Math.round(savedTotal * 100) / 100,
      budgetCount: consumption.rows.length,
      budgetTotal: Math.round(consumption.totalLimit * 100) / 100,
      budgetSpent: Math.round(consumption.totalSpent * 100) / 100,
      availablePartial: snap.availableIsPartial || undefined,
      // Langue active de l'app → les dialogues Siri répondent FR/DE/IT/EN.
      lang: String(s.preferences?.language || 'fr'),
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
export function peekPendingExpenses(allowUnscopedSiriDraft = false): PendingExpense[] {
  if (!storage) return [];
  try {
    const raw = storage.get(PENDING_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as PendingExpense[];
    const scope = activeScope();
    // Association STRICTE au compte : une entrée dont le scope est inconnu ou
    // différent n'est jamais proposée (et encore moins enregistrée). Elle
    // reste en file pour le bon compte ; les entrées 'unknown' sont purgées
    // après 48 h (aucune écriture automatique d'origine non vérifiable).
    const cutoff = Date.now() / 1000 - 48 * 3600;
    const kept = list.filter((e) => !(e.scope === 'unknown' && e.createdAt < cutoff));
    if (kept.length !== list.length) {
      try { storage.set(PENDING_KEY, JSON.stringify(kept)); } catch {}
    }
    const now = Date.now() / 1000;
    return kept.filter(
      (e) => e && typeof e.id === 'string' && e.amount > 0 &&
        (e.scope === scope ||
          // Only a Siri-triggered explicit open may show a draft without a
          // verified account scope. Never auto-book; quick-add confirms first.
          (allowUnscopedSiriDraft && e.scope === 'unscoped' && now - e.createdAt < 5 * 60)),
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

/** Non-destructive native intent inspection: never lose a route during hydration. */
export function peekPendingRoute(): string | null {
  if (!storage) return null;
  try { return storage.get(ROUTE_KEY) || null; }
  catch { return null; }
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
