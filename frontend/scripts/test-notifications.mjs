#!/usr/bin/env node
/**
 * BUDGY Smart 4.0 — Notifications safety contract.
 * Regression: scheduleMonthlyReminder() used to call
 * cancelAllScheduledNotificationsAsync() at every app startup, wiping the
 * contract deadline reminders (J-90/J-30/J-7/J-1) and bill reminders.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'src', 'services', 'notifications.ts'), 'utf8');

let passed = 0, failed = 0;
const ok = (label, fn) => { try { fn(); passed++; console.log('  ✓', label); } catch (e) { failed++; console.error('  ✗', label, '\n   ', e.message); } };

console.log('\n[test-notifications] safety contract\n');

ok('no global cancelAllScheduledNotificationsAsync anywhere in the service', () => {
  assert.ok(!src.includes('cancelAllScheduledNotificationsAsync'), 'global cancel would wipe deadline reminders');
});

ok('monthly + LAMal reminders use fixed identifiers', () => {
  assert.match(src, /MONTHLY_REMINDER_ID = 'budgy-monthly-reminder'/);
  assert.match(src, /LAMAL_REMINDER_ID = 'budgy-lamal-reminder'/);
  assert.match(src, /identifier: MONTHLY_REMINDER_ID/);
  assert.match(src, /identifier: LAMAL_REMINDER_ID/);
});

ok('rescheduling cancels ONLY its own identifiers', () => {
  const fn = src.slice(src.indexOf('export async function scheduleMonthlyReminder'));
  assert.match(fn, /cancelScheduledNotificationAsync\(MONTHLY_REMINDER_ID\)/);
  assert.match(fn, /cancelScheduledNotificationAsync\(LAMAL_REMINDER_ID\)/);
});

ok('contract deadline reminders (J-90/J-30/J-7/J-1) remain intact', () => {
  assert.match(src, /scheduleDeadlineReminders|deadline/i);
  assert.match(src, /cancel previously scheduled deadline reminders/i);
});

// ── Phase 4 — hygiène des rappels ─────────────────────────────────────
ok('cancelAllEntityReminders: nettoyage CIBLÉ (jamais cancelAll global)', () => {
  assert.match(src, /export async function cancelAllEntityReminders/);
  assert.match(src, /startsWith\('budgy_notif_ids_'\)/);
  assert.ok(!src.includes('cancelAllScheduledNotificationsAsync'));
});

ok('facture marquée payée → rappels annulés ; repassée à payer → reprogrammés', () => {
  const inv = fs.readFileSync(path.join(root, 'app', 'more', 'invoices.tsx'), 'utf8');
  const fn = inv.slice(inv.indexOf('const toggleStatus'), inv.indexOf('const toggleStatus') + 900);
  assert.match(fn, /becomesPaid/);
  assert.match(fn, /cancelDeadlineRemindersForEntity\(id\)/);
  assert.match(fn, /scheduleDeadlineRemindersForEntity\(id/);
});

ok('déconnexion → cancelAllEntityReminders appelé (settings)', () => {
  const st = fs.readFileSync(path.join(root, 'app', 'more', 'settings.tsx'), 'utf8');
  assert.match(st, /await cancelAllEntityReminders\(\)/);
});

console.log(`\n[test-notifications] ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
