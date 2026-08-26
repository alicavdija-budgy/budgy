#!/usr/bin/env node
/**
 * BUDGY v3.9.0 Build 74 — AI Optimizer crash-safety contract test.
 *
 * Validates that `normalizeOptimizerResult()` in `app/more/ai-optimizer.tsx`
 * produces a shape that CANNOT crash the render, whatever the backend returns.
 *
 * We reproduce the normaliser here (pure JS mirror) and test every degenerate
 * payload seen in TestFlight Build 73:
 *   - undefined tips
 *   - undefined proposals
 *   - backend 500 (empty body)
 *   - backend success but partial (only some fields)
 *   - invalid JSON structure
 *
 * Run: `node scripts/test-ai-optimizer.mjs`
 */

// Pure mirror of normalizeOptimizerResult
function normalizeOptimizerResult(input) {
  const proposals = Array.isArray(input?.proposals) ? input.proposals : [];
  const tips = Array.isArray(input?.tips)
    ? input.tips.filter((t) => typeof t === 'string' && t.trim().length > 0)
    : [];
  const monthly = Number(
    input?.monthly_potential ??
      input?.total_monthly_potential ??
      proposals.reduce(
        (s, p) => s + Number(p?.potential_saving_monthly ?? p?.monthly_potential ?? 0),
        0
      )
  );
  const yearly = Number(
    input?.yearly_potential ??
      input?.total_annual_potential ??
      proposals.reduce(
        (s, p) => s + Number(p?.potential_saving_yearly ?? p?.annual_potential ?? 0),
        0
      )
  );
  return {
    success: !!input?.success,
    summary: typeof input?.summary === 'string' ? input.summary : '',
    monthly_potential: Number.isFinite(monthly) ? monthly : 0,
    yearly_potential: Number.isFinite(yearly) ? yearly : 0,
    proposals,
    tips,
    error: typeof input?.error === 'string' ? input.error : undefined,
  };
}

let PASS = 0;
let FAIL = 0;
const FAILURES = [];

function assert(name, cond, detail = '') {
  if (cond) {
    PASS++;
    console.log(`  ✅ ${name}`);
  } else {
    FAIL++;
    FAILURES.push({ name, detail });
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function checkSafeShape(name, input) {
  const r = normalizeOptimizerResult(input);
  assert(`${name}: proposals is array`, Array.isArray(r.proposals));
  assert(`${name}: tips is array`, Array.isArray(r.tips));
  assert(`${name}: summary is string`, typeof r.summary === 'string');
  assert(`${name}: monthly_potential is finite number`, Number.isFinite(r.monthly_potential));
  assert(`${name}: yearly_potential is finite number`, Number.isFinite(r.yearly_potential));
  assert(`${name}: r.tips.length exists`, typeof r.tips.length === 'number');
  assert(`${name}: r.proposals.length exists`, typeof r.proposals.length === 'number');
}

console.log('\n▶ 1. Backend success complete');
checkSafeShape('complete', {
  success: true,
  summary: 'Great savings ahead!',
  monthly_potential: 350,
  yearly_potential: 4200,
  proposals: [
    { title: 'Netflix', category: 'subscription', potential_saving_monthly: 15, potential_saving_yearly: 180, effort: 'easy', action: 'Cancel' },
  ],
  tips: ['Cook at home', 'Bike to work'],
});

console.log('\n▶ 2. Backend success WITHOUT tips (P0-B repro)');
checkSafeShape('no-tips', {
  success: true,
  summary: 'ok',
  proposals: [{ title: 'x', category: 'other', potential_saving_monthly: 10, potential_saving_yearly: 120, effort: 'easy', action: 'z' }],
  // tips: undefined  ← would have crashed in Build 73
});

console.log('\n▶ 3. Backend success WITHOUT proposals');
checkSafeShape('no-proposals', {
  success: true,
  summary: 'ok',
  tips: ['Hint 1'],
  // proposals: undefined
});

console.log('\n▶ 4. Backend HTTP 500 (empty body)');
checkSafeShape('http-500', {});

console.log('\n▶ 5. Offline / no response');
checkSafeShape('offline', null);
checkSafeShape('offline-undefined', undefined);

console.log('\n▶ 6. Timeout / partial fields');
checkSafeShape('timeout-partial', { success: false, error: 'timeout' });

console.log('\n▶ 7. Invalid JSON (garbage types)');
checkSafeShape('garbage', { success: 'yes', summary: 42, proposals: 'not-array', tips: 12, monthly_potential: 'abc' });

console.log('\n▶ 8. Tips array contains non-string entries (filter safe)');
{
  const r = normalizeOptimizerResult({ success: true, tips: [null, 'ok', 42, '  ', 'yay', undefined] });
  assert('tips filtered to strings only', r.tips.every((t) => typeof t === 'string' && t.trim().length > 0));
  assert('tips has 2 valid entries', r.tips.length === 2);
}

console.log('\n▶ 9. Defensive render pattern');
{
  const r = normalizeOptimizerResult({ success: true });
  // Simulate the JSX condition: (result.tips ?? []).length > 0
  const cond1 = (r.tips ?? []).length > 0;
  const cond2 = (r.proposals ?? []).length > 0;
  assert('tips length check does not throw', cond1 === false);
  assert('proposals length check does not throw', cond2 === false);
}

console.log('\n▶ 10. Monthly potential derived from proposals when missing');
{
  const r = normalizeOptimizerResult({
    success: true,
    proposals: [
      { potential_saving_monthly: 10, potential_saving_yearly: 120 },
      { potential_saving_monthly: 20, potential_saving_yearly: 240 },
    ],
  });
  assert('monthly derived = 30', r.monthly_potential === 30);
  assert('yearly derived = 360', r.yearly_potential === 360);
}

console.log('\n' + '─'.repeat(60));
console.log(`AI Optimizer crash-safety tests : ${PASS} passed, ${FAIL} failed`);
if (FAIL > 0) {
  console.log('\n❌ FAILURES:');
  FAILURES.forEach((f) => console.log(`  · ${f.name} ${f.detail}`));
  process.exit(1);
}
console.log('✅ All AI optimizer crash-safety tests PASS');
process.exit(0);
