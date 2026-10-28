#!/usr/bin/env node
/**
 * Budgy Smart 4.0 — Tests Budgy Twin (contrat statique + comportement numérique).
 *
 * Phase 3 : le simulateur recalcule le disponible à partir des composantes
 * brutes (sans l'écrêtage à 0 de realAvailableThisMonth) afin qu'un déficit
 * préexistant reste visible et que le détail du calcul = total affiché.
 *
 * Les tests numériques importent réellement simulatePurchase() : le source TS
 * (simple par construction) est transformé en JS par retrait des annotations,
 * puis importé via une data-URL. Déterministe, zéro dépendance.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

let passed = 0;
let failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const near = (a, b) => Math.abs(a - b) < 1e-9;

const sim = read('src/services/twinSimulator.ts');
const screen = read('app/more/twin.tsx');
const features = read('src/config/features.ts');

console.log('[test-twin] Budgy Twin — contrat déterministe & lecture seule');

// ── 1. Contrat statique ──────────────────────────────────────────────
check('simulator: aucun appel réseau (fetch/axios/supabase)', !/fetch\(|axios|supabase/i.test(sim));
check('simulator: aucun appel IA', !/openai|anthropic|gemini|emergentintegrations/i.test(sim));
check('simulator: aucune écriture (stores/storage)', !/AsyncStorage|setState|useStore|addTransaction|updateTransaction|deleteTransaction/.test(sim));
check('simulator: consomme FinancialSnapshot (selectors)', sim.includes("from '../stores/selectors'") && sim.includes('FinancialSnapshot'));
check('simulator: ne re-somme pas les transactions', !/transactions\s*\.\s*(reduce|filter|map)/.test(sim));
check('simulator: déficit NON écrêté (pas de Math.max sur le disponible)', !/Math\.max\(\s*0\s*,\s*(rawAvailable|availableBefore|snapshot\.realAvailable)/.test(sim));
check('screen: lecture seule (aucune mutation, aucun paiement)', !/addTransaction|updateTransaction|deleteTransaction|addProExpense|requestPurchase|purchase\(/.test(screen));
check('screen: disclaimer + avertissements données', screen.includes("t('twin.disclaimer')") && screen.includes("t('twin.dataNone')") && screen.includes("t('twin.dataPartial')"));
check("features: twin gratuit BETA sur /more/twin", /id: 'twin'.*route: '\/more\/twin'.*tier: 'free'.*badge: 'BETA'/.test(features));
check('features: twin dans la rubrique Intelligence', /'intelligence'[\s\S]*?featureIds: \['twin'/.test(features));

// ── 2. Import réel du simulateur (strip des annotations TS) ─────────
let js = sim
  .replace(/^import type.*$/m, '')
  .replace(/^export type.*$/gm, '')
  .replace(/^export interface [\s\S]*?^\}/gm, '')
  .replace('(input: TwinInput): TwinResult {', '(input) {')
  .replace('let verdict: TwinVerdict;', 'let verdict;')
  .replace("let dataQuality: TwinDataQuality = 'ok';", "let dataQuality = 'ok';");
check('transform: annotations TS entièrement retirées', !/: Twin|interface |import type/.test(js));

const mod = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const simulate = mod.simulatePurchase;
check('transform: simulatePurchase importée', typeof simulate === 'function');

const snap = (o = {}) => ({
  monthlyIncome: 0, paidExpenses: 0, recurringExpenses: 0, upcomingBills: 0,
  totalCommitted: 0, realAvailableThisMonth: 0, txCountThisMonth: 5, recurringCount: 2,
  ...o,
});

// ── 3. Comportement numérique vérifié ────────────────────────────────
// Cas A : revenus > charges
let r = simulate({ amount: 500, protectSavings: true, monthlyAutoSave: 300,
  snapshot: snap({ monthlyIncome: 6000, paidExpenses: 1000, recurringExpenses: 1500, upcomingBills: 500 }) });
check('A: disponible avant = 2700 (6000−1000−1500−500−300)', near(r.availableBefore, 2700), `got ${r.availableBefore}`);
check('A: restant après 500 = 2200, verdict yes (seuil 600)', near(r.availableAfter, 2200) && r.verdict === 'yes', `got ${r.availableAfter}/${r.verdict}`);

// Cas B : charges > revenus — le déficit préexistant doit rester visible
r = simulate({ amount: 100, protectSavings: false, monthlyAutoSave: 0,
  snapshot: snap({ monthlyIncome: 3000, paidExpenses: 2000, recurringExpenses: 1500, upcomingBills: 500, realAvailableThisMonth: 0 }) });
check('B: déficit visible — avant = −1000 (pas 0 écrêté)', near(r.availableBefore, -1000), `got ${r.availableBefore}`);
check('B: après = −1100, verdict no', near(r.availableAfter, -1100) && r.verdict === 'no', `got ${r.availableAfter}/${r.verdict}`);

// Cas C : achat supérieur au budget disponible
r = simulate({ amount: 4000, protectSavings: false, monthlyAutoSave: 0,
  snapshot: snap({ monthlyIncome: 5000, paidExpenses: 1000, recurringExpenses: 1000, upcomingBills: 0 }) });
check('C: 3000 − 4000 = −1000, verdict no', near(r.availableAfter, -1000) && r.verdict === 'no', `got ${r.availableAfter}/${r.verdict}`);

// Cas D : épargne activée vs désactivée
const base = snap({ monthlyIncome: 4000, paidExpenses: 500, recurringExpenses: 500, upcomingBills: 0 });
const on = simulate({ amount: 1800, protectSavings: true, monthlyAutoSave: 1000, snapshot: base });
const off = simulate({ amount: 1800, protectSavings: false, monthlyAutoSave: 1000, snapshot: base });
check('D: épargne ON — avant 2000, après 200, verdict tight (seuil 400)', near(on.availableBefore, 2000) && near(on.availableAfter, 200) && on.verdict === 'tight', `got ${on.availableBefore}/${on.availableAfter}/${on.verdict}`);
check('D: épargne OFF — avant 3000, après 1200, verdict yes', near(off.availableBefore, 3000) && near(off.availableAfter, 1200) && off.verdict === 'yes', `got ${off.availableBefore}/${off.availableAfter}/${off.verdict}`);
check('D: réserve comptée une seule fois (pas de double comptage)', near(on.breakdown.reservedSavings, 1000) && near(off.breakdown.reservedSavings, 0));

// Cas E : données manquantes
r = simulate({ amount: 100, protectSavings: false, monthlyAutoSave: 0, snapshot: snap({ monthlyIncome: 0 }) });
check("E: sans revenu → dataQuality 'none'", r.dataQuality === 'none');
r = simulate({ amount: 100, protectSavings: false, monthlyAutoSave: 0,
  snapshot: snap({ monthlyIncome: 5000, txCountThisMonth: 0, recurringCount: 0 }) });
check("E: revenu sans aucune donnée de dépense → 'partial'", r.dataQuality === 'partial');

// Cas F : montants nuls, invalides et limites
r = simulate({ amount: 0, protectSavings: false, monthlyAutoSave: 0, snapshot: base });
check('F: montant 0 → après = avant', near(r.availableAfter, r.availableBefore));
r = simulate({ amount: NaN, protectSavings: false, monthlyAutoSave: 0, snapshot: base });
check('F: montant NaN → normalisé à 0', near(r.amount, 0) && near(r.availableAfter, r.availableBefore));
r = simulate({ amount: -50, protectSavings: false, monthlyAutoSave: 0, snapshot: base });
check('F: montant négatif → normalisé à 0', near(r.amount, 0));
r = simulate({ amount: 100, protectSavings: true, monthlyAutoSave: NaN, snapshot: base });
check('F: autoSave NaN → réserve 0', near(r.reservedSavings, 0));
// Limites de verdict : seuil = 10 % du revenu (400 ici, raw dispo 3000)
r = simulate({ amount: 2600, protectSavings: false, monthlyAutoSave: 0, snapshot: base });
check('F: après == seuil exactement → yes', near(r.availableAfter, 400) && r.verdict === 'yes', `got ${r.availableAfter}/${r.verdict}`);
r = simulate({ amount: 3000, protectSavings: false, monthlyAutoSave: 0, snapshot: base });
check('F: après == 0 → tight', near(r.availableAfter, 0) && r.verdict === 'tight', `got ${r.availableAfter}/${r.verdict}`);

// Cas G : cohérence EXACTE détail ↔ total, y compris en déficit
for (const [label, args] of [
  ['excédent', { amount: 750, protectSavings: true, monthlyAutoSave: 250, snapshot: snap({ monthlyIncome: 7000, paidExpenses: 1234.55, recurringExpenses: 2100.45, upcomingBills: 320 }) }],
  ['déficit', { amount: 99.9, protectSavings: true, monthlyAutoSave: 500, snapshot: snap({ monthlyIncome: 2000, paidExpenses: 1800.5, recurringExpenses: 900, upcomingBills: 250 }) }],
]) {
  r = simulate(args);
  const fromBreakdown = r.breakdown.monthlyIncome - r.breakdown.paidExpenses - r.breakdown.recurringExpenses
    - r.breakdown.upcomingBills - r.breakdown.reservedSavings - r.breakdown.purchase;
  check(`G: détail == total affiché (${label})`, near(fromBreakdown, r.availableAfter), `breakdown ${fromBreakdown} vs ${r.availableAfter}`);
}

console.log(`\n[test-twin] ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
