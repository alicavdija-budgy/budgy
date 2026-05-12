/**
 * BUDGY — Light Mode JSX colors patcher
 *
 * For files already converted by convert-light-mode.js:
 *   Replace `Colors.X` references that appear BEFORE the `makeStyles` block
 *   (i.e. inside JSX / component code) with `theme.X`.
 *   References INSIDE `makeStyles` keep `Colors.X` because there `Colors` is
 *   the function parameter.
 *
 * Safe: only touches files that contain both `useTheme()` and `makeStyles`.
 */

const fs = require('fs');
const path = require('path');

const FILES = [
  'app/(tabs)/savings.tsx',
  'app/(tabs)/index.tsx',
  'app/(tabs)/expenses.tsx',
  'app/(tabs)/more.tsx',
  'app/(tabs)/scanner.tsx',
  'app/more/recurring.tsx',
  'app/more/budgets.tsx',
  'app/more/debts.tsx',
  'app/more/groups.tsx',
  'app/more/family.tsx',
  'app/more/receipts.tsx',
  'app/more/invoices.tsx',
  'app/more/documents.tsx',
  'app/more/lamal-comparator.tsx',
  'app/more/analytics.tsx',
  'app/more/predict.tsx',
  'app/more/tax-optimizer.tsx',
  'app/more/security.tsx',
  'app/more/cloud-sync.tsx',
  'app/more/lamal-subsidy.tsx',
  'app/more/subscription.tsx',
  'app/more/notifications.tsx',
  'app/more/email-import.tsx',
  'app/more/group-detail.tsx',
  'app/scanner-modal.tsx',
];

const ROOT = '/app/frontend';
let total = 0;
let changed = 0;

for (const f of FILES) {
  const abs = path.join(ROOT, f);
  if (!fs.existsSync(abs)) continue;
  const src = fs.readFileSync(abs, 'utf8');
  if (!src.includes('useTheme()') || !src.includes('const makeStyles')) {
    console.log(`  ⏭️  ${f} (not converted)`);
    continue;
  }
  const splitIdx = src.indexOf('const makeStyles');
  if (splitIdx < 0) continue;
  const head = src.slice(0, splitIdx);
  const tail = src.slice(splitIdx);

  let patches = 0;
  const newHead = head.replace(/\bColors\.([A-Za-z_$][A-Za-z0-9_$]*)/g, (_, prop) => {
    patches++;
    return `theme.${prop}`;
  });
  // gradientPrimary / gradientSuccess / etc. — kept as theme.X (palettes have them)
  if (patches === 0) {
    console.log(`  ⏭️  ${f} (no jsx-level Colors.X)`);
    continue;
  }
  const finalSrc = newHead + tail;
  fs.writeFileSync(abs, finalSrc, 'utf8');
  console.log(`  ✅ ${f} — ${patches} Colors.X → theme.X`);
  total += patches;
  changed++;
}

console.log(`\n→ ${changed} files patched, ${total} replacements total`);
