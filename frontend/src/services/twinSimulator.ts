/**
 * BUDGY TWIN — Simulateur déterministe « Puis-je me permettre cet achat ? »
 *
 * Prototype Budgy Smart 4.0 — Étape 7.
 * - 100 % pur et déterministe : aucun appel réseau, aucune IA, aucun écrit.
 * - S'appuie sur le moteur existant getMonthlyFinancialSnapshot (source de
 *   vérité unique) — AUCUN recalcul parallèle des finances.
 * - Ne modifie jamais une transaction réelle et ne déclenche aucun paiement.
 * - Pas de double comptage : l'épargne automatique (autoSave des objectifs)
 *   n'est PAS incluse dans snapshot.totalCommitted, elle est donc réservée
 *   ici séparément, une seule fois, si l'utilisateur le demande.
 */

import type { FinancialSnapshot } from '../stores/selectors';

export type TwinVerdict = 'yes' | 'tight' | 'no';
export type TwinDataQuality = 'ok' | 'partial' | 'none';

export interface TwinInput {
  amount: number;
  snapshot: FinancialSnapshot;
  /** Somme des autoSave mensuels des objectifs d'épargne actifs */
  monthlyAutoSave: number;
  /** true = préserver les versements d'épargne prévus ce mois */
  protectSavings: boolean;
}

export interface TwinResult {
  amount: number;
  /** Disponible du mois AVANT l'achat (après réserve d'épargne éventuelle) */
  availableBefore: number;
  /** Épargne mensuelle réservée (0 si non protégée) */
  reservedSavings: number;
  /** Budget restant APRÈS l'achat (peut être négatif) */
  availableAfter: number;
  verdict: TwinVerdict;
  dataQuality: TwinDataQuality;
  /** Seuil de confort utilisé pour le verdict (10 % du revenu mensuel) */
  comfortThreshold: number;
  /** Détail du calcul, pour l'explication à l'utilisateur */
  breakdown: {
    monthlyIncome: number;
    paidExpenses: number;
    recurringExpenses: number;
    upcomingBills: number;
    reservedSavings: number;
    purchase: number;
  };
}

export function simulatePurchase(input: TwinInput): TwinResult {
  const { snapshot } = input;
  const amount = isFinite(input.amount) && input.amount > 0 ? input.amount : 0;

  const reservedSavings = input.protectSavings
    ? Math.max(0, isFinite(input.monthlyAutoSave) ? input.monthlyAutoSave : 0)
    : 0;

  // Disponible RÉEL du mois, recalculé ici à partir des composantes brutes
  // (revenus − dépenses payées − charges récurrentes − factures à venir)
  // SANS l'écrêtage à 0 appliqué par snapshot.realAvailableThisMonth :
  // un déficit préexistant doit rester visible et le détail du calcul doit
  // correspondre exactement, ligne à ligne, au total affiché.
  // Le moteur mensuel (selectors.ts) n'est PAS modifié.
  const rawAvailable =
    snapshot.monthlyIncome -
    snapshot.paidExpenses -
    snapshot.recurringExpenses -
    snapshot.upcomingBills;
  const availableBefore = rawAvailable - reservedSavings;
  const availableAfter = availableBefore - amount;

  // Seuil de confort : il doit rester au moins 10 % du revenu mensuel
  // après l'achat pour un « oui » franc.
  const comfortThreshold = Math.max(0, snapshot.monthlyIncome * 0.1);

  let verdict: TwinVerdict;
  if (availableAfter < 0) verdict = 'no';
  else if (availableAfter < comfortThreshold) verdict = 'tight';
  else verdict = 'yes';

  // Qualité des données : sans revenu déclaré, le verdict n'a pas de sens.
  let dataQuality: TwinDataQuality = 'ok';
  if (snapshot.monthlyIncome <= 0) dataQuality = 'none';
  else if (snapshot.txCountThisMonth === 0 && snapshot.recurringCount === 0) dataQuality = 'partial';

  return {
    amount,
    availableBefore,
    reservedSavings,
    availableAfter,
    verdict,
    dataQuality,
    comfortThreshold,
    breakdown: {
      monthlyIncome: snapshot.monthlyIncome,
      paidExpenses: snapshot.paidExpenses,
      recurringExpenses: snapshot.recurringExpenses,
      upcomingBills: snapshot.upcomingBills,
      reservedSavings,
      purchase: amount,
    },
  };
}
