/**
 * BUDGY — Light Mode auto-converter
 *
 * Transforms each target page so that:
 *   - `const styles = StyleSheet.create({...})` (module-level)
 *      becomes `const makeStyles = (Colors: ThemePalette) => StyleSheet.create({...})`
 *   - Component body gets `const theme = useTheme(); const styles = useMemo(() => makeStyles(theme), [theme]);`
 *   - The original `Colors.X` references INSIDE the styles still work because
 *     `Colors` is now the function parameter (shadows the import).
 *   - Adds the required imports: useTheme, ThemePalette, useMemo (if missing).
 *
 * Idempotent: skips files already converted.
 */

const fs = require('fs');
const path = require('path');

const TARGETS = [
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
];

const ROOT = '/app/frontend';

function transform(filePath) {
  const abs = path.join(ROOT, filePath);
  if (!fs.existsSync(abs)) {
    console.log(`  ⚠️  ${filePath} not found, skipping`);
    return { skipped: true };
  }
  let src = fs.readFileSync(abs, 'utf8');
  const orig = src;

  // Already converted?
  if (src.includes('makeStyles') && src.includes('useTheme()')) {
    console.log(`  ⏭️  ${filePath} already converted`);
    return { skipped: true };
  }

  // Only target files that import Colors and have module-level StyleSheet.create
  if (!src.includes('StyleSheet.create')) {
    console.log(`  ⏭️  ${filePath} no StyleSheet — skip`);
    return { skipped: true };
  }

  // 1. Add useMemo import if missing
  if (!/from 'react'[^;]*useMemo/.test(src) && !/import\s*{[^}]*useMemo[^}]*}\s*from\s*'react'/.test(src)) {
    src = src.replace(
      /(import\s+React(?:,\s*\{([^}]+)\})?\s+from\s+'react';)/,
      (m, full, named) => {
        if (named && named.includes('useMemo')) return m;
        if (named) {
          return `import React, { ${named.trim()}, useMemo } from 'react';`;
        }
        return `import React, { useMemo } from 'react';`;
      }
    );
    // Fallback: if no React default import line, prepend
    if (!/useMemo/.test(src)) {
      src = `import { useMemo } from 'react';\n` + src;
    }
  }

  // 2. Add useTheme + ThemePalette imports (right after Colors import line)
  if (!src.includes('useTheme')) {
    const colorsImport = src.match(/import\s+\{[^}]*Colors[^}]*\}\s+from\s+'[^']*\/constants\/theme'\s*;?/);
    if (colorsImport) {
      const after = colorsImport[0];
      const hookPath = filePath.startsWith('app/more/')
        ? '../../src/hooks/useTheme'
        : '../src/hooks/useTheme';
      const palettePath = filePath.startsWith('app/more/')
        ? '../../src/constants/palettes'
        : '../src/constants/palettes';
      const inserts = [
        `import { useTheme } from '${hookPath}';`,
        `import type { ThemePalette } from '${palettePath}';`,
      ].join('\n');
      src = src.replace(after, `${after}\n${inserts}`);
    }
  }

  // 3. Convert module-level `const styles = StyleSheet.create(` to makeStyles
  //    We need to find the LAST `const styles = StyleSheet.create({` (usually at bottom)
  const styleRegex = /^const styles = StyleSheet\.create\(\{/m;
  if (styleRegex.test(src)) {
    src = src.replace(
      styleRegex,
      'const makeStyles = (Colors: ThemePalette) => StyleSheet.create({'
    );
  } else {
    console.log(`  ⚠️  ${filePath} no module-level "const styles = StyleSheet.create(" found`);
    // No conversion possible — bail
    return { skipped: true };
  }

  // 4. Insert `const theme = useTheme(); const styles = useMemo(...)` at start of default export component
  //    Find pattern `export default function XxxScreen(...) {` or similar
  //    Insert as first body line.
  const fnRegex = /(export default function [A-Za-z0-9_]+\s*\([^)]*\)\s*\{)/;
  const match = src.match(fnRegex);
  if (match) {
    const indent = '  ';
    const inject = `\n${indent}const theme = useTheme();\n${indent}const styles = useMemo(() => makeStyles(theme), [theme]);`;
    src = src.replace(fnRegex, `$1${inject}`);
  } else {
    console.log(`  ⚠️  ${filePath} no "export default function" — bail`);
    return { skipped: true };
  }

  if (src !== orig) {
    fs.writeFileSync(abs, src, 'utf8');
    console.log(`  ✅ ${filePath} converted`);
    return { changed: true };
  }
  return { skipped: true };
}

console.log('=== BUDGY Light Mode Auto-Converter ===');
let changed = 0;
let skipped = 0;
for (const t of TARGETS) {
  const r = transform(t);
  if (r.changed) changed++;
  if (r.skipped) skipped++;
}
console.log(`\n→ ${changed} files converted, ${skipped} skipped`);
