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
  monthlyIncome: number;            // ressources du mois (récurrents + ponctuels reçus)
  oneOffIncome: number;             // revenus ponctuels reçus ce mois
  paidExpenses: number;
  recurringExpenses: number;        // EXIGIBLE restant ce mois (occurrences réelles)
  recurringMonthlyAvg: number;      // moyenne mensuelle budgétaire (stats uniquement)
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

  // 2) Transactions du mois. Convention : dépense POSITIVE ; type 'income' =
  //    revenu PONCTUEL reçu (intégré aux ressources, jamais aux dépenses).
  const thisMonthTx = (input.transactions || []).filter((t) => {
    const d = parseDate(t.date);
    return d && d.getFullYear() === year && d.getMonth() === month;
  });
  const expenseTx = thisMonthTx.filter((t) => (t as any).type !== 'income');
  const paidExpenses = expenseTx.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  // Revenus ponctuels réellement reçus ce mois (saisis comme transactions).
  const oneOffIncome = thisMonthTx
    .filter((t) => (t as any).type === 'income')
    .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);

  // 3) Charges récurrentes — DEUX notions distinctes :
  //    A. recurringMonthlyAvg : moyenne mensuelle BUDGÉTAIRE (stats/comparaisons).
  //    B. recurringExpenses  : montant RÉELLEMENT EXIGIBLE ce mois, net des
  //       paiements déjà effectués (occurrence par occurrence, jamais une
  //       moyenne). Une assurance annuelle de 1200 pèse 1200 sur son mois
  //       d'échéance et 0 les autres mois — jamais 100 déduits chaque mois.
  const activeRecurring = (input.recurringExpenses || []).filter((r) => r.active !== false);
  const PER_MONTH: Record<string, number> = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, semiannual: 1 / 6, yearly: 1 / 12 };
  const STEP_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 };

  const recurringMonthlyAvg = activeRecurring.reduce(
    (s, r) => s + (Number(r.amount) || 0) * (PER_MONTH[String(r.frequency || 'monthly')] ?? 1),
    0,
  );

  /** Montant exigible ce mois pour une charge (occurrences réelles). */
  const dueAmountThisMonth = (r: RecurringExpense): number => {
    const amt = Number(r.amount) || 0;
    const freq = String(r.frequency || 'monthly');
    if (freq === 'weekly') return amt * 4; // 4 occurrences standard par mois
    if (freq === 'monthly') return amt;
    const step = STEP_MONTHS[freq] ?? 1;
    const anchor = new Date((r as any).createdAt || Date.now());
    const diff = (year - anchor.getFullYear()) * 12 + (month - anchor.getMonth());
    return diff >= 0 && diff % step === 0 ? amt : 0;
  };

  /** Déjà payé ce mois pour cette charge : transactions LIÉES (recurringId),
   *  sinon historique de paiements, sinon héritage lastPaidMonth (= payé en
   *  totalité — migration douce des anciennes données). */
  const paidForCharge = (r: RecurringExpense): number => {
    const linked = expenseTx
      .filter((t) => (t as any).recurringId === r.id)
      .reduce((s, t) => s + Math.max(0, Number(t.amount) || 0), 0);
    if (linked > 0) return linked;
    const hist = ((r as any).paymentHistory as any[]) || [];
    const histPaid = hist
      .filter((h) => typeof h?.date === 'string' && h.date.startsWith(monthKey))
      .reduce((s, h) => s + Math.max(0, Number(h.amount) || 0), 0);
    if (histPaid > 0) return histPaid;
    return (r as any).lastPaidMonth === monthKey ? dueAmountThisMonth(r) : 0;
  };

  // Rapprochement facture↔charge : si une facture de ce mois est LIÉE à la
  // charge (recurringId posé après confirmation de l'utilisateur), l'obligation
  // est représentée par la facture — la charge ne compte pas une 2e fois.
  const invoicesArr = input.invoices || [];
  const chargeHasLinkedInvoice = (r: RecurringExpense): boolean =>
    invoicesArr.some((inv) => {
      if ((inv as any).recurringId !== r.id) return false;
      const d = parseDate((inv as any).dueDate) || parseDate((inv as any).createdAt as any);
      return !d || (d.getFullYear() === year && d.getMonth() === month) || (inv.status || '') !== 'paid';
    });

  const recurringExpenses = activeRecurring.reduce((s, r) => {
    if (chargeHasLinkedInvoice(r)) return s;
    return s + Math.max(0, dueAmountThisMonth(r) - paidForCharge(r));
  }, 0);

  // Sous-ensemble = abonnements / télécoms (exigible restant)
  const subscriptions = activeRecurring
    .filter((r) => SUBSCRIPTION_CATEGORIES.has((r.category || '').toLowerCase()))
    .filter((r) => !chargeHasLinkedInvoice(r))
    .reduce((s, r) => s + Math.max(0, dueAmountThisMonth(r) - paidForCharge(r)), 0);

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

  // 4b) Dettes — PAR IDENTIFIANT : chaque mensualité est calculée dette par
  // dette ; un paiement lié (debtId) ne règle JAMAIS une autre dette.
  // Le repli par catégorie « dettes » n'est appliqué que s'il n'existe
  // qu'UNE seule dette active (aucune ambiguïté possible).
  const activeDebts = (input.debts || [])
    .filter((d) => (Number(d.total) || 0) - (Number(d.paid) || 0) > 0);
  const paidForDebt = (debtId: string): number => expenseTx
    .filter((t) => (t as any).debtId === debtId)
    .reduce((s, t) => s + Math.max(0, Number(t.amount) || 0), 0);
  const unlinkedDebtCatPaid = expenseTx
    .filter((t) => {
      if ((t as any).debtId) return false;
      const c = (t.category || '').toLowerCase();
      return c === 'dettes' || c === 'debt' || c === 'debts';
    })
    .reduce((s, t) => s + Math.max(0, Number(t.amount) || 0), 0);
  const debtPayments = activeDebts.reduce((s, d, idx) => {
    let paidD = paidForDebt(d.id);
    if (activeDebts.length === 1 && idx === 0) paidD += unlinkedDebtCatPaid;
    return s + Math.max(0, (Number(d.monthlyPayment) || 0) - paidD);
  }, 0);

  // Ressources du mois = revenus récurrents prévus + revenus PONCTUELS reçus.
  const totalIncome = monthlyIncome + oneOffIncome;
  const totalCommitted = paidExpenses + recurringExpenses + upcomingBills + debtPayments;
  // JAMAIS de clamp à zéro : un déficit doit s'afficher comme déficit.
  const realAvailableThisMonth = totalIncome - totalCommitted;

  const monthLabel = now.toLocaleDateString(input.locale || 'fr-CH', { month: 'long', year: 'numeric' });

  return {
    monthlyIncome: totalIncome,
    oneOffIncome,
    paidExpenses,
    recurringExpenses,
    recurringMonthlyAvg,
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
