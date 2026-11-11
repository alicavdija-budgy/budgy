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

import type { Transaction, Income, RecurringExpense, Invoice, Contract, Budget, SavingsGoal, Debt } from '../types';

export interface FinancialSnapshot {
  monthlyIncome: number;
  paidExpenses: number;
  recurringExpenses: number;
  upcomingBills: number;
  subscriptions: number;            // sous-ensemble de recurringExpenses
  debtPayments: number;             // mensualités de dettes encore dues ce mois
  totalCommitted: number;           // paid + recurring + upcoming + debts
  realAvailableThisMonth: number;   // monthlyIncome - totalCommitted (peut être négatif)
  // Métadonnées utiles aux modules IA / pédagogiques
  monthLabel: string;               // localised month + year (via toLocaleDateString)
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
    case 'semiannual':
    case 'biannual':  return amount / 6;
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
export function parseDate(s?: string | number | null): Date | null {
  if (s == null) return null;
  if (typeof s === 'number') return new Date(s);
  if (typeof s !== 'string') return null;
  if (!s.trim()) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  // Date-only strings are parsed as LOCAL midnight (never UTC) so a
  // transaction dated the 1st is never attributed to the previous month
  // in negative-offset timezones.
  if (iso) return new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
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
  debts?: Debt[];
  contracts?: Contract[];
  budgets?: Budget[];
  savingsGoals?: SavingsGoal[];
  now?: Date;
  locale?: string;
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

  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

  // 2) Dépenses déjà payées ce mois (transactions ; négatif = remboursement).
  //    Les transactions de type 'income' ne sont jamais des dépenses.
  const thisMonthTx = (input.transactions || []).filter((t) => {
    const d = parseDate(t.date);
    return d && d.getFullYear() === year && d.getMonth() === month;
  });
  const expenseTx = thisMonthTx.filter((t) => (t as any).type !== 'income');
  const paidExpenses = expenseTx.reduce((s, t) => s + (Number(t.amount) || 0), 0);

  // 3) Charges récurrentes actives — mensualisées. Une charge MARQUÉE PAYÉE ce
  //    mois (lastPaidMonth) sort de l'engagement : son paiement réel est déjà
  //    dans paidExpenses (remplacement, jamais double déduction).
  const activeRecurring = (input.recurringExpenses || []).filter((r) => r.active !== false);
  const recurringDue = activeRecurring.filter((r) => (r as any).lastPaidMonth !== monthKey);
  const recurringExpenses = recurringDue.reduce(
    (s, r) => s + toMonthlyAmount(Number(r.amount) || 0, r.frequency as any),
    0,
  );
  // Sous-ensemble = abonnements / télécoms
  const subscriptions = activeRecurring
    .filter((r) => SUBSCRIPTION_CATEGORIES.has((r.category || '').toLowerCase()))
    .reduce((s, r) => s + toMonthlyAmount(Number(r.amount) || 0, r.frequency as any), 0);

  // 4) Factures impayées : échéance jusqu'à la fin du mois COURANT, y compris
  //    les factures EN RETARD des mois précédents (elles restent dues tant
  //    qu'elles ne sont pas payées). Statut 'paid' exclu — son paiement réel
  //    vit dans paidExpenses (remplacement de l'engagement).
  const upcomingBills = (input.invoices || [])
    .filter((inv) => (inv.status || '').toLowerCase() !== 'paid')
    .filter((inv) => {
      const due = parseDate((inv as any).dueDate);
      if (!due) return true; // facture sans échéance = due
      return due <= endOfMonth;
    })
    .reduce((s, inv) => s + (Number(inv.amount) || 0), 0);

  // 4b) Mensualités de dettes en cours (capital restant > 0) — intégrées à la
  // trésorerie engagée. Anti double comptage : les remboursements DÉJÀ payés ce
  // mois (transaction liée debtId ou catégorie dettes) réduisent l'engagement
  // restant (jamais en dessous de 0).
  const debtCommitted = (input.debts || [])
    .filter((d) => (Number(d.total) || 0) - (Number(d.paid) || 0) > 0)
    .reduce((s, d) => s + (Number(d.monthlyPayment) || 0), 0);
  const debtCatPaid = expenseTx
    .filter((t) => {
      if ((t as any).debtId) return true;
      const c = (t.category || '').toLowerCase();
      return c === 'dettes' || c === 'debt' || c === 'debts';
    })
    .reduce((s, t) => s + Math.max(0, Number(t.amount) || 0), 0);
  const debtPayments = Math.max(0, debtCommitted - debtCatPaid);

  const totalCommitted = paidExpenses + recurringExpenses + upcomingBills + debtPayments;
  // JAMAIS de clamp à zéro : un déficit doit s'afficher comme déficit.
  const realAvailableThisMonth = monthlyIncome - totalCommitted;

  const monthLabel = now.toLocaleDateString(input.locale || 'fr-CH', { month: 'long', year: 'numeric' });

  return {
    monthlyIncome,
    paidExpenses,
    recurringExpenses,
    upcomingBills,
    subscriptions,
    debtPayments,
    totalCommitted,
    realAvailableThisMonth,
    monthLabel,
    txCountThisMonth: thisMonthTx.length,
    recurringCount: activeRecurring.length,
  };
}
