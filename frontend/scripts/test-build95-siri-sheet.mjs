#!/usr/bin/env node
/**
 * Build 95: direct Siri confirmation, App Group native fallback and exact
 * expense accounting. Synthetic fixtures ONLY; no customer data or device.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const read = (p) => readFileSync(p, 'utf8');
const modal = read('src/components/WidgetSync.tsx');
const app = read('app/_layout.tsx');
const bridge = read('src/services/widgetBridge.ts');
const saveSource = read('src/services/saveSiriExpense.ts');
const swift = read('targets/intents/_shared/BudgyIntents.swift');
const translations = read('src/i18n/translations.ts');
const conf = JSON.parse(read('app.json')).expo;

assert.equal(conf.ios.buildNumber, '95');
assert.equal(conf.ios.bundleIdentifier, 'com.budgy.ch.budgy');
assert.match(swift,/BudgyIntentStore.enqueue\(amount: amount, label: cleanLabel\)/);
// Native App Group can look available when @bacons provides a no-op JS shim.
// Verify write/read first, then use the Expo native fallback.
assert.match(bridge,/probe\(candidate\)/);
assert.match(bridge,/requireOptionalNativeModule\?\.\('ExtensionStorage'\)/);
assert.match(bridge,/native.setString\(key, value, APP_GROUP\)/);
assert.match(bridge,/if \(!storage\) console.warn/);

// UI confirmation is inside LockGate and not dependent on expo-router push.
assert(app.indexOf('<LockGate>') < app.indexOf('<WidgetSync />'));
assert(app.indexOf('<WidgetSync />') < app.indexOf('<Stack'));
assert.match(modal,/<Modal/);
assert.match(modal,/testID="siri-expense-confirm"/);
assert.match(modal,/testID="siri-expense-cancel"/);
assert.match(modal,/testID="siri-fallback-manual"/);
assert.match(modal,/setInterval\(consumeNative, 800\)/);
assert.match(modal,/peekPendingExpenses\(route === 'quick-add'\)/);
assert.match(modal,/setDraft\(e\)/);
assert.match(modal,/saveConfirmedSiriExpense\(draft.id, label\)/);
assert.match(modal,/await resolvePendingExpense\(draft.id\)/);
assert(!modal.includes("router.push(\n          `/quick-add?text="));
assert(modal.indexOf("popPendingRoute();") > modal.indexOf("saveConfirmedSiriExpense"));
for (const key of ['title','amountLabel','reviewHint','add','cancel','checkBody']) {
  // Key appears once per language in the localized siriConfirm section.
  const start = translations.indexOf('  siriConfirm: {');
  const end = translations.indexOf('  quickAdd: {', start);
  assert(start >= 0 && end > start);
  const section = translations.slice(start, end);
  assert.equal((section.match(new RegExp('\\b' + key + ':', 'g')) || []).length, 4, key);
}

// Execute the *actual* TS service with faked in-memory store and App Group,
// not a duplicate implementation of saveConfirmedSiriExpense.
const js = ts.transpileModule(saveSource, { compilerOptions: {
  target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
}}).outputText;
let processed = false;
let pending = [{
  id: 'synthetic-uuid-01', amount: 10.25, label: 'Courses',
  scope: 'user:synthetic-user', createdAt: Date.now() / 1000,
}];
let route = 'quick-add';
const transactions = [];
let resolveCount = 0;
const state = {
  user: { id: 'synthetic-user' }, isAuthenticated: true, isLocked: false,
  transactions,
  addTransaction: (tx) => transactions.unshift(tx),
};
const store = { useStore: { getState: () => state } };
const storage = {
  peekPendingExpenses: () => pending,
  peekPendingRoute: () => route,
  isAlreadyProcessed: async () => processed,
  resolvePendingExpense: async () => { resolveCount++; },
  refreshWidgetSnapshot: async () => {},
};
const localModule = { exports: {} };
new Function('require', 'module', 'exports', js)(
  (path) => path.includes('useStore') ? store : storage,
  localModule, localModule.exports,
);
const { saveConfirmedSiriExpense, swissLocalDate } = localModule.exports;
assert.equal(swissLocalDate(new Date(2026, 10, 20, 1, 15)), '2026-11-20');

assert.equal(await saveConfirmedSiriExpense('synthetic-uuid-01'), 'saved');
assert.equal(transactions.length, 1);
assert.equal(transactions[0].amount, 10.25); // exact Siri amount, NOT rounded or negative
assert.equal(transactions[0].title, 'Courses');
assert.equal(transactions[0].id, 'siri_synthetic-uuid-01');
assert.equal(transactions[0].source, 'siri');
assert.equal(resolveCount, 1);

assert.equal(await saveConfirmedSiriExpense('synthetic-uuid-01'), 'already');
assert.equal(transactions.length, 1);

pending = [{ ...pending[0], id: 'new-id', scope: 'user:other-account' }];
assert.equal(await saveConfirmedSiriExpense('new-id'), 'unauthorized');
assert.equal(transactions.length, 1);

pending = [{ ...pending[0], id: 'unscoped-id', scope: 'unscoped' }];
route = null;
assert.equal(await saveConfirmedSiriExpense('unscoped-id'), 'unauthorized');
route = 'quick-add';
assert.equal(await saveConfirmedSiriExpense('unscoped-id'), 'saved');
assert.equal(transactions.length, 2);

pending = [{ ...pending[0], id: 'bad-amount', amount: -5 }];
assert.equal(await saveConfirmedSiriExpense('bad-amount'), 'invalid');
assert.equal(transactions.length, 2);

state.isLocked = true;
assert.equal(await saveConfirmedSiriExpense('unscoped-id'), 'unauthorized');
console.log('PASS: native shared bridge probe + direct root Siri sheet + 4 locales + exact amount, idempotence, scope, app lock and local date');
