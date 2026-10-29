/**
 * BUDGY SMART 4.0 — Métriques pures du tableau de bord bento (écran Plus).
 *
 * Fonctions déterministes, sans effet de bord, testées par
 * scripts/test-bento.mjs. Aucun deuxième moteur financier : uniquement des
 * calculs d'échéance affichés sur les cartes.
 */

export interface RecurringLike {
  title: string;
  dayOfMonth: number;
  active: boolean;
  frequency: string;
}

type NextCharge = { title: string; inDays: number };

/**
 * Prochaine échéance réelle parmi les charges mensuelles actives, y compris
 * le passage au mois suivant (ex. le 28 alors que la charge tombe le 1er).
 * Les jours 29/30/31 sont bornés à la longueur réelle du mois concerné.
 */
export function nextMonthlyChargeInDays(recurring: RecurringLike[], now: Date = new Date()): NextCharge | null {
  const today = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysInNext = new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate();
  let best: NextCharge | null = null;
  for (const r of recurring) {
    if (!r.active || r.frequency !== 'monthly') continue;
    const dayThisMonth = Math.min(r.dayOfMonth, daysInMonth);
    const inDays = dayThisMonth >= today
      ? dayThisMonth - today
      : daysInMonth - today + Math.min(r.dayOfMonth, daysInNext);
    if (best === null || inDays < best.inDays) best = { title: r.title, inDays };
  }
  return best;
}

export interface InvoiceLike {
  dueDate?: string;
}

/**
 * Échéance la plus pertinente parmi les factures NON payées :
 * - s'il existe des échéances futures (>= 0 jour), retourne la plus proche;
 * - sinon, s'il existe des échéances dépassées, retourne la plus récente
 *   (valeur négative => « en retard »);
 * - null si aucune date exploitable (état explicite, pas de valeur inventée).
 */
export function nearestPendingInvoiceDays(
  pending: InvoiceLike[],
  parse: (s: string) => Date | null,
  daysUntil: (d: Date, now: Date) => number,
  now: Date = new Date(),
): number | null {
  let bestFuture: number | null = null;
  let bestPast: number | null = null;
  for (const inv of pending) {
    const d = inv.dueDate ? parse(inv.dueDate) : null;
    if (!d) continue;
    const days = daysUntil(d, now);
    if (days >= 0) {
      if (bestFuture === null || days < bestFuture) bestFuture = days;
    } else if (bestPast === null || days > bestPast) {
      bestPast = days;
    }
  }
  return bestFuture !== null ? bestFuture : bestPast;
}
