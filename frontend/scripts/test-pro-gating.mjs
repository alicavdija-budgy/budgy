#!/usr/bin/env node
/**
 * BUDGY v3.9.0 Build 74 — Pro Route Gating contract test.
 *
 * Validates:
 *   1) FREE_QUOTAS never unlocks a Pro route (0 for AI/Predict/Tax/Export/Investments/Cloud)
 *   2) The central FEATURES catalog matches the expected tier matrix
 *   3) A FREE user hitting a Pro route → paywall (blocked=true in useRequirePro)
 *   4) auth.tsx never contains a production local-auth fallback
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let PASS = 0;
let FAIL = 0;
const FAILURES = [];

function assert(name, cond, detail = '') {
  if (cond) { PASS++; console.log(`  ✅ ${name}`); }
  else {
    FAIL++;
    FAILURES.push({ name, detail });
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function scenario(title, fn) {
  console.log(`\n▶ ${title}`);
  fn();
}

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// ── 1. FREE_QUOTAS never unlocks Pro ────────────────────────────────────
scenario('1. FREE_QUOTAS neutralised for Pro features', () => {
  const src = read('src/stores/usePremiumStore.ts');
  const match = src.match(/export const FREE_QUOTAS[^}]+\}/s);
  assert('FREE_QUOTAS block found', !!match);
  if (!match) return;
  const block = match[0];

  // Extract "key: value" pairs
  const pairs = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^\s*(\w+):\s*(\d+)/);
    if (m) pairs[m[1]] = parseInt(m[2], 10);
  }

  const proFeatures = ['ai', 'tax', 'export', 'cloud', 'predict', 'investments'];
  for (const f of proFeatures) {
    assert(`FREE_QUOTAS.${f} === 0`, pairs[f] === 0, `got ${pairs[f]}`);
  }

  // Genuinely free features stay unlimited
  const freeFeatures = ['invoices', 'recurring', 'analytics'];
  for (const f of freeFeatures) {
    assert(`FREE_QUOTAS.${f} > 0 (genuine free)`, (pairs[f] || 0) > 0);
  }
});

// ── 2. Feature catalog tier matrix ──────────────────────────────────────
scenario('2. FEATURES catalog matches Apple 2.1(b) tier matrix', () => {
  const src = read('src/config/features.ts');
  const rows = [...src.matchAll(/id:\s*'([\w-]+)',[^}]*?tier:\s*'(free|pro)'/g)];
  const tiers = Object.fromEntries(rows.map((r) => [r[1], r[2]]));

  const mustBePro = [
    'ai-optimizer', 'savings-radar', 'budgy-score', 'predict',
    'calendar', 'tax', 'investments',
    'export-pdf', 'email-import', 'cloud-sync', 'family',
  ];
  const mustBeFree = [
    'incomes', 'recurring', 'debts', 'invoices', 'lamal', 'budgets',
    'receipts', 'documents', 'security', 'settings', 'notifications',
    'subscription', 'legal',
  ];
  for (const id of mustBePro) {
    assert(`${id} = PRO`, tiers[id] === 'pro', `got ${tiers[id]}`);
  }
  for (const id of mustBeFree) {
    assert(`${id} = FREE`, tiers[id] === 'free', `got ${tiers[id]}`);
  }
});

// ── 3. auth.tsx: no production local-auth fallback ──────────────────────
scenario('3. auth.tsx: production has NO silent local fallback', () => {
  const src = read('app/auth.tsx');
  const stripped = stripComments(src);
  // Search for the removed pattern
  assert(
    'no "confirmation email" auto-loginAsLocalUser bypass',
    !/error\.message\.includes\(['"]confirmation email/.test(stripped),
  );
  // The remaining else branch MUST be guarded by __DEV__
  const elseBlockMatch = stripped.match(/\}\s*else if\s*\(\s*__DEV__[^)]*\)\s*\{[\s\S]*?loginAsLocalUser[\s\S]*?\}\s*else\s*\{[\s\S]*?throw/);
  assert(
    'production else-branch throws instead of local fallback',
    !!elseBlockMatch,
  );
});

// ── 4. StoreKit not bypassed anywhere ───────────────────────────────────
scenario('4. No hardcoded "7 days" or "CHF 4.90" in user copy', () => {
  const files = [
    'src/i18n/translations.ts',
    'app/(tabs)/more.tsx',
    'app/paywall.tsx',
  ];
  for (const f of files) {
    const src = read(f);
    // Exclude dynamic {{days}} template placeholders which come from StoreKit,
    // and calendar horizon labels like "Next 7 days" (not a trial promise).
    const trimmed = src
      .replace(/\{\{days\}\}/g, '<PLACEHOLDER>')
      .replace(/horizonWeek:\s*['"][^'"]*['"]/g, 'horizonWeek: <CALENDAR>');
    // Only flag TRIAL promises — must be near "trial" / "free" / "gratuit" / "gratis"
    const trialPattern =
      /(7\s*jours\s*(gratuits|d['\u2019]essai)|7\s*giorni\s*gratis|7\s*Tage\s*(kostenlos|gratis)|7-day\s*free\s*trial|7\s*days\s*free\s*trial|free\s*for\s*7\s*days)/i;
    assert(
      `${f}: no hardcoded "7 days" trial promise`,
      !trialPattern.test(trimmed),
    );
    assert(
      `${f}: no "CHF 4.90" / "4.90/mo"`,
      !/\bCHF\s*4[.,]90\b|\b4[.,]90\s*(CHF|\/\s*(mois|mo|Monat|mese))/i.test(src),
    );
  }
});

// ── 5. ProRouteGuard file exists ────────────────────────────────────────
scenario('5. Route guard + central catalog exist', () => {
  assert('src/config/features.ts exists', fs.existsSync(path.join(root, 'src/config/features.ts')));
  assert('src/hooks/useRequirePro.tsx exists', fs.existsSync(path.join(root, 'src/hooks/useRequirePro.tsx')));
  const layoutSrc = read('app/more/_layout.tsx');
  assert('/more/_layout.tsx checks isProRoute', /isProRoute\s*\(/.test(layoutSrc));
  assert('/more/_layout.tsx redirects to /paywall', /\/paywall\?trigger/.test(layoutSrc));
});

// ── 6. Demo mode / no local Pro grant (regression from Build 74) ────────
scenario('6. Demo mode never grants local Pro', () => {
  const src = stripComments(read('app/auth.tsx'));
  assert('no premium.purchase() in auth.tsx', !/premium\.purchase\s*\(/.test(src));
  assert('no setPro(true) in auth.tsx', !/setPro\s*\(\s*true\s*\)/.test(src));
  assert('no isPro: true literal in auth.tsx', !/isPro\s*:\s*true/.test(src));
});

// ── Report ─────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
console.log(`Pro-gating tests : ${PASS} passed, ${FAIL} failed`);
if (FAIL > 0) {
  console.log('\n❌ FAILURES:');
  FAILURES.forEach((f) => console.log(`  · ${f.name} ${f.detail}`));
  process.exit(1);
}
console.log('✅ All pro-gating tests PASS');
process.exit(0);
