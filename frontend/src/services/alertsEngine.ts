/**
 * BUDGY ALERTS — moteur déterministe d'évaluation (Budgy Smart 4.0, Phase 3).
 *
 * Règles 100 % déterministes sur les données locales existantes :
 * - AUCUN appel réseau, AUCUNE IA : rien n'est inventé (pas de hausse de prix,
 *   d'échéance ou de changement contractuel non confirmé par les données).
 * - Identifiants STABLES (par entité/mois) → déduplication garantie.
 * - Lecture seule : ne modifie jamais les données financières.
 *
 * Les catégories 'fuel' (carburant) et 'news' (actualités financières CH)
 * sont préparées mais ne génèrent AUCUNE alerte tant que des sources
 * officielles, fiables et légalement réutilisables ne sont pas validées
 * (voir EXTERNAL_ALERTS_ENABLED dans src/config/features.ts).
 */

export type AlertCategory = 'contracts' | 'budget' | 'invoices' | 'fuel' | 'news';

export interface BudgyAlert {
  /** Id stable et déterministe (dédup) : ex. "invoice-due-abc", "budget-over-2026-06" */
  id: string;
  category: AlertCategory;
  titleKey: string;
  bodyKey: string;
  params?: Record<string, string | number>;
  createdAt: number;
  read: boolean;
  /** Route expo-router à ouvrir au tap */
  route?: string;
}

export interface AlertsEvalInput {
  now?: Date;
  monthlyIncome: number;
  paidExpenses: number;
  prevPaidExpenses: number;
  totalCommitted: number;
  txCountThisMonth: number;
  prevTxCount: number;
  invoices: { id: string; title: string; amount: number; dueDate?: string; status: string }[];
  enabled: Record<AlertCategory, boolean>;
}

const DAY_MS = 86400000;

function parseDue(s?: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function evaluateAlerts(input: AlertsEvalInput): BudgyAlert[] {
  const now = input.now || new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const out: BudgyAlert[] = [];

  // ── BUDGET ───────────────────────────────────────────────────────────
  if (input.enabled.budget) {
    // Engagements du mois > revenus — dépassement confirmé par les données
    if (input.monthlyIncome > 0 && input.totalCommitted > input.monthlyIncome) {
      out.push({
        id: `budget-over-${ym}`,
        category: 'budget',
        titleKey: 'alerts.budgetOverTitle',
        bodyKey: 'alerts.budgetOverBody',
        params: { n: Math.round(input.totalCommitted - input.monthlyIncome) },
        createdAt: now.getTime(),
        read: false,
        route: '/(tabs)/expenses',
      });
    }
    // Évolution inhabituelle : +30 % vs mois précédent (base minimale 100
    // pour éviter le bruit, et uniquement si les DEUX mois ont des données)
    if (
      input.prevPaidExpenses >= 100 &&
      input.txCountThisMonth > 0 &&
      input.prevTxCount > 0 &&
      input.paidExpenses > input.prevPaidExpenses * 1.3
    ) {
      out.push({
        id: `budget-surge-${ym}`,
        category: 'budget',
        titleKey: 'alerts.budgetSurgeTitle',
        bodyKey: 'alerts.budgetSurgeBody',
        params: { p: Math.round((input.paidExpenses / input.prevPaidExpenses - 1) * 100) },
        createdAt: now.getTime(),
        read: false,
        route: '/(tabs)/expenses',
      });
    }
  }

  // ── FACTURES ─────────────────────────────────────────────────────────
  if (input.enabled.invoices) {
    for (const inv of input.invoices) {
      if (inv.status === 'paid') continue;
      const due = parseDue(inv.dueDate);
      if (!due) continue;
      const days = Math.floor((due.getTime() - now.getTime()) / DAY_MS);
      if (days < 0) {
        out.push({
          id: `invoice-late-${inv.id}`,
          category: 'invoices',
          titleKey: 'alerts.invoiceLateTitle',
          bodyKey: 'alerts.invoiceLateBody',
          params: { name: inv.title, d: Math.abs(days) },
          createdAt: now.getTime(),
          read: false,
          route: '/more/invoices',
        });
      } else if (days <= 7) {
        out.push({
          id: `invoice-due-${inv.id}`,
          category: 'invoices',
          titleKey: 'alerts.invoiceDueTitle',
          bodyKey: 'alerts.invoiceDueBody',
          params: { name: inv.title, d: days },
          createdAt: now.getTime(),
          read: false,
          route: '/more/invoices',
        });
      }
    }
  }

  // ── CONTRATS & ASSURANCES ────────────────────────────────────────────
  // Les rappels d'échéance J-90/J-30/J-7/J-1 et le rappel LAMal sont gérés
  // par les notifications OS planifiées (src/services/notifications.ts),
  // elles-mêmes conditionnées par la préférence 'contracts'. Aucun
  // changement de prix n'est annoncé ici sans donnée confirmée.

  // ── CARBURANT & ACTUALITÉS ───────────────────────────────────────────
  // Désactivés : aucune source externe validée. Rien n'est généré.

  return out;
}
