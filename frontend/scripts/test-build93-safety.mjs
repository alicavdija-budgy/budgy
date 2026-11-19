#!/usr/bin/env node
/**
 * Budgy 4.0 (93) — quality gate for real iPhone regressions.
 * No personal PDF or user data is embedded in this repository.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const read = path => readFileSync(path, 'utf8');
const brand = read('src/data/swiss-brands.ts');
const recur = read('app/more/recurring.tsx');
const imp = read('app/more/email-import.tsx');
const inv = read('app/more/invoices.tsx');
const swift = read('targets/intents/_shared/BudgyShared.swift');
const bridge = read('src/services/widgetBridge.ts');
const sync = read('src/components/WidgetSync.tsx');
const app = JSON.parse(read('app.json')).expo;

assert.equal(app.version, '4.0.0');
assert.equal(app.ios.buildNumber, '94');
assert.equal(app.ios.bundleIdentifier, 'com.budgy.ch.budgy');
assert.match(brand, /isAlnum/);
assert.match(recur, /shield-checkmark-outline/);
assert.match(imp, /_qrValidationCode: code/);
assert.match(imp, /_originalUri: uriOrPath/);
assert.match(imp, /pdfReadBody/);
assert.match(inv, /const amount = normalizeChfAmount\(newInvoice.amount\)/);
assert.match(inv, /const amount = normalizeChfAmount\(values.amount\)/);
assert(!inv.includes('parseFloat(newInvoice.amount)'));
assert.match(swift, /scope = snapshotScope.hasPrefix\("user:"\) \? snapshotScope : "unscoped"/);
assert.match(bridge, /allowUnscopedSiriDraft && e.scope === 'unscoped'/);
assert.match(sync, /peekPendingExpenses\(route === 'quick-add'\)/);
console.log('PASS: release 93 invariants — QR manual fallback / Siri explicit confirmation / amounts');

execFileSync('npx', [
  'tsc', 'src/data/swiss-brands.ts', '--outDir', '/tmp/budgy-brand93',
  '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'
], { stdio: 'pipe' });
const require = createRequire(import.meta.url);
const { findBrand } = require('/tmp/budgy-brand93/swiss-brands.js');
assert.equal(findBrand('Assurance'), null);
assert.equal(findBrand('Assurances maladie'), null);
assert.equal(findBrand('Assura')?.name, 'Assura');
assert.equal(findBrand('Prime Assura Novembre')?.name, 'Assura');
assert.equal(findBrand('Swisscom')?.name, 'Swisscom');
console.log('PASS: executing real brand matcher avoids false insurer attribution');
