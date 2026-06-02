/**
 * BUDGY — Centralized monthly financial snapshot (v3.7.26 / build 66)
 *
 * Source de vérité unique pour "Disponible ce mois-ci" et tous les calculs
 * d'agrégation mensuelle. Évite la duplication dans 10 écrans (Dashboard,
 * Calendrier, Score Budgy, Économiseur IA, Radar d'économies…).
 *
 * RÈGLE PRODUIT (DO OR DIE) :
 *   realAvailableThisMonth =
 *     monthlyIncome
 *     - paidExpenses (dépenses déjà payées ce mois)
 *     - recurringExpenses (charges mensuelles actives + part mensuelle des
 *       trimestrielles / annuelles)
 *     - upcomingBills (factures du mois encore à payer)
 */

import type { Transaction, Income, RecurringExpense, Invoice, Contract, Budget, SavingsGoal } from '../types';

export interface FinancialSnapshot {
  monthlyIncome: number;
  paidExpenses: number;
  recurringExpenses: number;
  upcomingBills: number;
  subscriptions: number;            // sous-ensemble de recurringExpenses
  totalCommitted: number;           // paid + recurring + upcoming
  realAvailableThisMonth: number;   // monthlyIncome - totalCommitted
  // Métadonnées utiles aux modules IA / pédagogiques
  monthLabel: string;               // ex "Avril 2026"
  txCountThisMonth: number;
  recurringCount: number;
}

const SUBSCRIPTION_CATEGORIES = new Set([
  'abonnements', 'telecoms', 'streaming', 'cloud', 'media',
]);

/**
 * Normalise une fréquence en montant mensuel.
 */
function toMonthlyAmount(amount: number, frequency: string | undefined): number {
  if (!amount || !isFinite(amount)) return 0;
  switch ((frequency || 'monthly').toLowerCase()) {
    case 'weekly':    return amount * 4.333;
    case 'biweekly':  return amount * 2.166;
    case 'monthly':   return amount;
    case 'quarterly': return amount / 3;
    case 'yearly':    return amount / 12;
    case 'one_time':
    case 'one-time':
    case 'once':      return 0;     // ponctuel = pas mensualisé
    default:          return amount;
  }
}

/**
 * Parse une date en objet Date robuste (accepte ISO et fr-CH "DD.MM.YYYY").
 */
function parseDate(s?: string | number | null): Date | null {
  if (s == null) return null;
  if (typeof s === 'number') return new Date(s);
  if (typeof s !== 'string') return null;
  if (!s.trim()) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(s);
  const eu = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (eu) return new Date(parseInt(eu[3]), parseInt(eu[2]) - 1, parseInt(eu[1]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Compute the monthly financial snapshot at `now` (default: current date).
 * 100% pure — peut être appelée depuis n'importe quel écran ou test.
 */
export function getMonthlyFinancialSnapshot(input: {
  incomes: Income[];
  transactions: Transaction[];
  recurringExpenses: RecurringExpense[];
  invoices?: Invoice[];
  contracts?: Contract[];
  budgets?: Budget[];
  savingsGoals?: SavingsGoal[];
  now?: Date;
}): FinancialSnapshot {
  const now = input.now || new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

  // 1) Revenus mensualisés (recurring seulement — one-time exclu)
  const monthlyIncome = (input.incomes || []).reduce((sum, i) => {
    if (i.type !== 'recurring') return sum;
    return sum + toMonthlyAmount(Number(i.amount) || 0, i.frequency as any);
  }, 0);

  // 2) Dépenses déjà payées ce mois (transactions)
  const thisMonthTx = (input.transactions || []).filter((t) => {
    const d = parseDate(t.date);
    return d && d.getFullYear() === year && d.getMonth() === month;
  });
  const paidExpenses = thisMonthTx.reduce((s, t) => s + (Number(t.amount) || 0), 0);

  // 3) Charges récurrentes actives — mensualisées
  const activeRecurring = (input.recurringExpenses || []).filter((r) => r.active !== false);
  const recurringExpenses = activeRecurring.reduce(
    (s, r) => s + toMonthlyAmount(Number(r.amount) || 0, r.frequency as any),
    0,
  );
  // Sous-ensemble = abonnements / télécoms
  const subscriptions = activeRecurring
    .filter((r) => SUBSCRIPTION_CATEGORIES.has((r.category || '').toLowerCase()))
    .reduce((s, r) => s + toMonthlyAmount(Number(r.amount) || 0, r.frequency as any), 0);

  // 4) Factures pending dont l'échéance tombe dans ce mois (et pas déjà payées)
  const upcomingBills = (input.invoices || [])
    .filter((inv) => (inv.status || '').toLowerCase() === 'pending')
    .filter((inv) => {
      const due = parseDate((inv as any).dueDate);
      return due && due >= now && due <= endOfMonth;
    })
    .reduce((s, inv) => s + (Number(inv.amount) || 0), 0);

  const totalCommitted = paidExpenses + recurringExpenses + upcomingBills;
  const realAvailableThisMonth = Math.max(0, monthlyIncome - totalCommitted);

  const monthLabel = now.toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' });

  return {
    monthlyIncome,
    paidExpenses,
    recurringExpenses,
    upcomingBills,
    subscriptions,
    totalCommitted,
    realAvailableThisMonth,
    monthLabel,
    txCountThisMonth: thisMonthTx.length,
    recurringCount: activeRecurring.length,
  };
}
