#!/usr/bin/env node
/**
 * Budgy Smart 4.0 Phase 3 — Tests Budgy Alerts.
 *
 * 1) Moteur alertsEngine : import réel (strip TS) + comportement numérique
 *    (règles déterministes, ids stables, respect des catégories, rien
 *    d'inventé pour carburant/actualités).
 * 2) Store useAlertsStore : contrat statique (dédup, fréquence réduite,
 *    persistance séparée).
 * 3) notifications.ts : respect des préférences (catégories, heures
 *    silencieuses, aucun montant sur l'écran verrouillé par défaut),
 *    et toujours AUCUN cancelAll global.
 * 4) Flag EXTERNAL_ALERTS_ENABLED = false tant que les sources officielles
 *    ne sont pas validées.
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

const engineSrc = read('src/services/alertsEngine.ts');
const storeSrc = read('src/stores/useAlertsStore.ts');
const notifSrc = read('src/services/notifications.ts');
const screenSrc = read('app/more/notifications.tsx');
const featuresSrc = read('src/config/features.ts');

console.log('[test-alerts] Budgy Alerts — moteur, préférences, confidentialité');

// ── Contrat statique ──────────────────────────────────────────────────
check('engine: aucun appel réseau ni IA', !/fetch\(|axios|supabase|openai|gemini|anthropic/i.test(engineSrc));
check('engine: lecture seule (aucune écriture store/storage)', !/AsyncStorage|useStore|set\(/.test(engineSrc));
check('flag EXTERNAL_ALERTS_ENABLED = false (sources non validées)', /EXTERNAL_ALERTS_ENABLED = false/.test(featuresSrc));
check('screen: fuel/news verrouillés derrière le flag', screenSrc.includes('EXTERNAL_ALERTS_ENABLED') && /locked = external && !EXTERNAL_ALERTS_ENABLED/.test(screenSrc));
check('store: persistance séparée (budgy-alerts-storage)', storeSrc.includes("name: 'budgy-alerts-storage'"));
check('store: déduplication par id stable', /known\.has\(a\.id\)/.test(storeSrc));
check('store: fréquence réduite = max 1/jour/catégorie', /reduced.*&&.*addedToday/.test(storeSrc.replace(/\n/g, ' ')));
check('notifications: TOUJOURS aucun cancelAll global', !notifSrc.includes('cancelAllScheduledNotificationsAsync'));
check('notifications: budget gate catégorie + heures silencieuses', /prefs\.categories\.budget \|\| isQuietNow\(prefs\)/.test(notifSrc.replace('!prefs.categories.budget', 'prefs.categories.budget')));
check('notifications: anti-répétition mensuelle budget', notifSrc.includes('budgy_budget_alert_'));
check('notifications: montants masqués sans opt-in (budget + échéances)', /showAmountsOnLockScreen && input\.amount/.test(notifSrc) && /const showAmounts = prefs\.showAmountsOnLockScreen/.test(notifSrc));
check('notifications: échéances gated par catégorie (contracts/invoices)', /input\.type === 'invoice' \? prefs\.categories\.invoices : prefs\.categories\.contracts/.test(notifSrc));
check('notifications: LAMal sous contrats, mensuel sous budget', /prefs\.categories\.contracts\) \{[\s\S]*?LAMAL_REMINDER_ID/.test(notifSrc) && /prefs\.categories\.budget\) \{[\s\S]*?MONTHLY_REMINDER_ID/.test(notifSrc));
check('défaut: showAmountsOnLockScreen = false', /showAmountsOnLockScreen: false/.test(storeSrc));
check('défaut: heures silencieuses 22h→7h actives', /quietStart: 22[\s\S]*?quietEnd: 7[\s\S]*?quietEnabled: true/.test(storeSrc));

// ── Import réel du moteur ─────────────────────────────────────────────
let js = engineSrc
  .replace(/^export type.*$/gm, '')
  .replace(/^export interface [\s\S]*?^\}/gm, '')
  .replace('export function parseFlexibleDate(s?: string): Date | null {', 'export function parseFlexibleDate(s) {')
  .replace('const startOfDay = (d: Date) =>', 'const startOfDay = (d) =>')
  .replace('export function calendarDaysUntil(due: Date, now: Date): number {', 'export function calendarDaysUntil(due, now) {')
  .replace('export function evaluateAlerts(input: AlertsEvalInput): BudgyAlert[] {', 'export function evaluateAlerts(input) {')
  .replace('const out: BudgyAlert[] = [];', 'const out = [];');
check('transform: annotations TS retirées', !/interface |: Alerts|: BudgyAlert/.test(js));
const mod = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const evaluate = mod.evaluateAlerts;
check('transform: evaluateAlerts importée', typeof evaluate === 'function');

const allOn = { contracts: true, budget: true, invoices: true, fuel: true, news: true };
const now = new Date(2026, 5, 15); // 15 juin 2026
const base = {
  now, monthlyIncome: 5000, paidExpenses: 2000, prevPaidExpenses: 1800,
  totalCommitted: 3000, txCountThisMonth: 8, prevTxCount: 10, invoices: [], enabled: allOn,
};

// ── Comportement numérique ────────────────────────────────────────────
let r = evaluate(base);
check('aucune alerte quand tout est sain', r.length === 0, `got ${r.length}`);

r = evaluate({ ...base, totalCommitted: 5600 });
check('dépassement: engagements 5600 > revenus 5000 → alerte CHF 600', r.length === 1 && r[0].id === 'budget-over-2026-06' && r[0].params.n === 600, JSON.stringify(r));

r = evaluate({ ...base, paidExpenses: 2600, prevPaidExpenses: 1800 });
check('hausse +44% (>30%) → alerte avec p=44', r.length === 1 && r[0].id === 'budget-surge-2026-06' && r[0].params.p === 44, JSON.stringify(r));

r = evaluate({ ...base, paidExpenses: 2200, prevPaidExpenses: 1800 });
check('hausse +22% (<30%) → pas de bruit', r.length === 0);

r = evaluate({ ...base, paidExpenses: 300, prevPaidExpenses: 50, prevTxCount: 1 });
check('base mois précédent < 100 → pas de fausse alerte', r.length === 0);

const invoices = [
  { id: 'a1', title: 'Swisscom', amount: 80, dueDate: '2026-06-18', status: 'pending' },
  { id: 'a2', title: 'EWZ', amount: 120, dueDate: '2026-06-10', status: 'pending' },
  { id: 'a3', title: 'Sunrise', amount: 60, dueDate: '2026-06-16', status: 'paid' },
  { id: 'a4', title: 'Visana', amount: 400, dueDate: '2026-07-20', status: 'pending' },
];
r = evaluate({ ...base, invoices });
const ids = r.map((a) => a.id).sort();
check('factures: due J-3 + retard 5j, payée et lointaine ignorées',
  ids.length === 2 && ids[0] === 'invoice-due-a1' && ids[1] === 'invoice-late-a2', JSON.stringify(ids));
const dueAlert = r.find((a) => a.id === 'invoice-due-a1');
const lateAlert = r.find((a) => a.id === 'invoice-late-a2');
check('factures: paramètres corrects (d=3 / retard d=5)', dueAlert.params.d === 3 && lateAlert.params.d === 5, JSON.stringify([dueAlert.params, lateAlert.params]));
check('factures: route vers /more/invoices', dueAlert.route === '/more/invoices');

// Format suisse DD.MM.YYYY : même résultat que l'ISO (dates locales, pas UTC)
r = evaluate({ ...base, invoices: [{ id: 'ch1', title: 'TWINT', amount: 50, dueDate: '18.06.2026', status: 'pending' }] });
check('format suisse 18.06.2026 → due dans 3 jours calendaires', r.length === 1 && r[0].id === 'invoice-due-ch1' && r[0].params.d === 3, JSON.stringify(r));
r = evaluate({ ...base, invoices: [{ id: 'ch2', title: 'EWZ', amount: 50, dueDate: '05.11.2026', status: 'pending' }] });
check('format suisse 05.11.2026 (lointain) → aucune fausse alerte retard', r.length === 0, JSON.stringify(r));

r = evaluate({ ...base, invoices, totalCommitted: 9000, enabled: { ...allOn, budget: false, invoices: false } });
check('catégories désactivées → aucune alerte générée', r.length === 0, `got ${r.length}`);

const r1 = evaluate({ ...base, totalCommitted: 5600 });
const r2 = evaluate({ ...base, totalCommitted: 5600 });
check('ids stables entre deux évaluations (dédup garantie)', r1[0].id === r2[0].id);

check('carburant/actualités: jamais aucune alerte générée', !/'fuel'|'news'/.test(js.split('── CARBURANT')[1] || '') && !evaluate({ ...base, totalCommitted: 9999 }).some((a) => a.category === 'fuel' || a.category === 'news'));

// ── Phase 4 : isolation des données par compte ────────────────────────
const scopeSrc = read('src/services/alertsScope.ts');
const layoutSrc = read('app/_layout.tsx');
const settingsSrc = read('app/more/settings.tsx');
check('store: scopes par compte (activeScope + scopes map)', /activeScope: string/.test(storeSrc) && /scopes: Record<string/.test(storeSrc));
check('store: bascule de scope ne transfère JAMAIS les alertes', /alerts: \[\],\s*\};/.test(storeSrc.split('const next = scopes[scope] ??')[1] || ''));
check('store: migration non destructive v2 (legacy → guest)', /version: 2/.test(storeSrc) && /migrate:/.test(storeSrc) && /activeScope: 'guest'/.test(storeSrc));
check('store: clearActiveScope pour « Supprimer mes données »', /clearActiveScope: \(\) =>/.test(storeSrc));
check("scope: mapping guest/demo/user:<id>", /return 'guest'/.test(scopeSrc) && /return 'demo'/.test(scopeSrc) && /`user:\$\{user\.id\}`/.test(scopeSrc));
check('scope: synchronisé au démarrage (_layout)', layoutSrc.includes('initAlertsScopeSync'));
check('logout: rappels d\'entités annulés de façon ciblée', settingsSrc.includes('cancelAllEntityReminders'));
check('supprimer mes données: scope alertes purgé', settingsSrc.includes('clearActiveScope'));

console.log(`\n[test-alerts] ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
