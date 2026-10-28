#!/usr/bin/env node
/**
 * Budgy Smart 4.0 — Contract tests for the Budgy Twin prototype.
 *
 * Static source assertions (same style as test-cloud-delete.mjs):
 * the simulator must stay deterministic, read-only and reuse the
 * canonical snapshot engine — never recomputing finances in parallel.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

let passed = 0;
let failed = 0;
const check = (name, cond) => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
};

const sim = read('src/services/twinSimulator.ts');
const screen = read('app/more/twin.tsx');
const features = read('src/config/features.ts');

console.log('[test-twin] Budgy Twin — deterministic & read-only contract');

// 1. Simulator is pure: no network, no AI, no storage writes
check('simulator has no fetch/axios/supabase call', !/fetch\(|axios|supabase/i.test(sim));
check('simulator has no LLM/AI call', !/openai|anthropic|gemini|emergentintegrations/i.test(sim));
check('simulator never writes to stores/storage', !/AsyncStorage|setState|useStore|addTransaction|updateTransaction|deleteTransaction/.test(sim));

// 2. Reuses the canonical snapshot type, no parallel finance engine
check('simulator consumes FinancialSnapshot from selectors', sim.includes("from '../stores/selectors'") && sim.includes('FinancialSnapshot'));
check('simulator does not re-sum transactions itself', !/transactions\s*\.\s*(reduce|filter|map)/.test(sim));

// 3. Verdict rules present (yes / tight / no) + data quality guard
check('three verdicts implemented', sim.includes("'no'") && sim.includes("'tight'") && sim.includes("'yes'"));
check('negative budget → no', /availableAfter < 0\)?\s*verdict = 'no'/.test(sim));
check('data quality none when no income', /monthlyIncome <= 0\)?\s*dataQuality = 'none'/.test(sim));
check('savings reserve only when protectSavings', sim.includes('input.protectSavings'));

// 4. Screen is read-only: no mutations, no payments
check('screen uses simulatePurchase + snapshot engine', screen.includes('simulatePurchase') && screen.includes('getMonthlyFinancialSnapshot'));
check('screen never mutates store data', !/addTransaction|updateTransaction|deleteTransaction|addProExpense|requestPurchase|purchase\(/.test(screen));
check('screen shows disclaimer', screen.includes("t('twin.disclaimer')"));
check('screen warns on incomplete data', screen.includes("t('twin.dataNone')") && screen.includes("t('twin.dataPartial')"));

// 5. Catalog entry: free tier BETA, reachable route
check("features.ts registers twin at /more/twin (free, BETA)", /id: 'twin'.*route: '\/more\/twin'.*tier: 'free'.*badge: 'BETA'/.test(features));
check('twin listed in Intelligence category', /'intelligence'[\s\S]*?featureIds: \['twin'/.test(features));

console.log(`\n[test-twin] ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
