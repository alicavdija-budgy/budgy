#!/usr/bin/env node
/**
 * BUDGY v3.9.0 Build 74 — Savings tier contract test.
 *
 * Validates:
 *   - Free user: 1 goal max — 2nd create attempt goes through paywall
 *   - Pro user: unlimited goals
 *   - Free user with 1 goal sees the "unlock unlimited" upsell banner
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let PASS = 0, FAIL = 0;
const FAILURES = [];
function assert(name, cond, detail = '') {
  if (cond) { PASS++; console.log(`  ✅ ${name}`); }
  else { FAIL++; FAILURES.push({ name, detail }); console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function scenario(title, fn) { console.log(`\n▶ ${title}`); fn(); }

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// Pure canCreateGoal logic mirror
const canCreateGoal = (isPro, goalsCount) => isPro || goalsCount < 1;

scenario('1. Free tier: 1 goal max', () => {
  assert('Free + 0 goals → can create', canCreateGoal(false, 0));
  assert('Free + 1 goal → CANNOT create (paywall)', !canCreateGoal(false, 1));
  assert('Free + 3 goals (edge case) → cannot create', !canCreateGoal(false, 3));
});

scenario('2. Pro tier: unlimited', () => {
  for (let n of [0, 1, 5, 20, 100]) {
    assert(`Pro + ${n} goals → can create`, canCreateGoal(true, n));
  }
});

scenario('3. Source scan: savings.tsx enforces the rule', () => {
  const src = read('app/(tabs)/savings.tsx');
  assert(
    'imports usePremiumStore',
    /from ['"]\.\.\/\.\.\/src\/stores\/usePremiumStore['"]/.test(src),
  );
  assert(
    'imports usePaywall',
    /from ['"]\.\.\/\.\.\/src\/hooks\/usePaywall['"]/.test(src),
  );
  assert(
    'defines canCreateGoal with `< 1` free limit',
    /canCreateGoal\s*=\s*isPro\s*\|\|\s*savingsGoals\.length\s*<\s*1/.test(src),
  );
  assert(
    'calls paywall.open when !canCreateGoal',
    /if\s*\(!canCreateGoal\)\s*\{[\s\S]*?paywall\.open/.test(src),
  );
  assert(
    'renders upsell banner when !isPro && savingsGoals.length >= 1',
    /!isPro\s*&&\s*savingsGoals\.length\s*>=\s*1/.test(src),
  );
});

scenario('4. Translation keys exist for savingsV2 in all 4 langs', () => {
  const t = read('src/i18n/translations.ts');
  for (const lang of ['fr:', 'en:', 'de:', 'it:']) {
    const savingsV2Block = t.match(new RegExp(`savingsV2:[\\s\\S]*?${lang}[\\s\\S]*?heroQuestion`));
    assert(`savingsV2.${lang.slice(0, 2)} has heroQuestion`, !!savingsV2Block);
  }
  const keys = ['heroQuestion', 'heroSub', 'createGoal', 'free1GoalLimit', 'unlockGoals'];
  for (const k of keys) {
    assert(`translation has ${k}`, new RegExp(`${k}:`).test(t));
  }
});

// ── Report ─────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
console.log(`Savings tier tests : ${PASS} passed, ${FAIL} failed`);
if (FAIL > 0) {
  console.log('\n❌ FAILURES:');
  FAILURES.forEach((f) => console.log(`  · ${f.name} ${f.detail}`));
  process.exit(1);
}
console.log('✅ All savings tier tests PASS');
process.exit(0);
