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

// ── Phase 4.1 : ordre de purge, migration sans fuite, éligibilité essai ──
check('supprimer mes données: clearActiveScope AVANT clearAllData (ordre critique)',
  /try \{ useAlertsStore\.getState\(\)\.clearActiveScope\(\); \} catch \{\}\s*cancelAllEntityReminders\(\)\.catch\(\(\) => \{\}\);\s*clearAllData\(\);/.test(settingsSrc));
const migrateBlock = storeSrc.slice(storeSrc.indexOf('migrate:'), storeSrc.indexOf('return persisted;'));
check('migration v2: anciennes alertes JAMAIS exposées (alerts: [])', /alerts: \[\],/.test(migrateBlock) && !/persisted\.alerts/.test(migrateBlock));

const iapSrc = read('src/services/iap.ts');
const paywallSrc = read('app/paywall.tsx');
check('iap: checkIntroEligibilityIOS (StoreKit isEligibleForIntroOfferIOS)', /isEligibleForIntroOfferIOS/.test(iapSrc) && /return null/.test(iapSrc));
check('paywall: essai annoncé UNIQUEMENT si éligibilité confirmée (iOS introEligible === true)',
  /Platform\.OS === 'ios' \? introEligible === true : true/.test(paywallSrc));
check('paywall: pendant le chargement → offre standard (reset null)', /setIntroEligible\(null\); \/\/ pendant le chargement/.test(paywallSrc));
check('paywall: cache par groupe (pas de flicker mensuel/annuel)', /eligCache/.test(paywallSrc));
check('paywall: Android non dégradé (true côté non-iOS)', /: true\);/.test(paywallSrc));

const easSrc = read('eas.json');
const eas = JSON.parse(easSrc);
check('eas: profil testflight distribution store + canal testflight séparé',
  eas.build.testflight?.extends === 'production' && eas.build.testflight?.channel === 'testflight');
check('eas: profil production intact (channel production, store)',
  eas.build.production.channel === 'production' && eas.build.production.distribution === 'store');
check('eas: submit.testflight = même identité Apple que production',
  eas.submit.testflight?.ios?.ascAppId === eas.submit.production.ios.ascAppId &&
  eas.submit.testflight?.ios?.appleTeamId === eas.submit.production.ios.appleTeamId);
const appJson = JSON.parse(read('app.json'));
check('build iOS 83 confirmé (version 3.9.0, bundle inchangé)',
  appJson.expo.ios.buildNumber === '83' && appJson.expo.version === '3.9.0' &&
  appJson.expo.ios.bundleIdentifier === 'com.budgy.ch.budgy');

// ── Comportement réel du store de scopes (import du creator zustand) ─────
const defStart = storeSrc.indexOf('export const DEFAULT_ALERTS_PREFS');
const defBlock = storeSrc.slice(defStart, storeSrc.indexOf('};', defStart) + 2)
  .replace(': AlertsPrefs =', ' =');
const creatorStart = storeSrc.indexOf('(set, get) => ({');
const creatorEnd = storeSrc.lastIndexOf('}),', storeSrc.indexOf("'budgy-alerts-storage'")) + 2;
let creator = storeSrc.slice(creatorStart, creatorEnd)
  .replace('const fresh: BudgyAlert[] = [];', 'const fresh = [];')
  .replace('const addedToday: Record<string, number> = {};', 'const addedToday = {};');
check('scopes: creator extrait sans annotation TS', !/: Budgy|: Record</.test(creator));
const storeMod = await import('data:text/javascript;base64,' + Buffer.from(
  'const MAX_ALERTS = 50;\n' +
  defBlock.replace('export const', 'const') +
  '\nexport function makeStore() { let state; const set = (p) => { state = { ...state, ...(typeof p === "function" ? p(state) : p) }; }; const get = () => state; state = (' +
  creator + ')(set, get); return () => state; }'
).toString('base64'));
const S = storeMod.makeStore();
const mkAlert = (id) => ({ id, category: 'invoices', titleKey: 't', bodyKey: 'b', createdAt: Date.now(), read: false });

S().setActiveScope('user:A');
S().upsertAlerts([mkAlert('invoice-due-secretA')]);
check('scopes: alerte créée dans le compte A', S().alerts.length === 1);
S().setActiveScope('user:B');
check('scopes: compte B ne voit RIEN du compte A', S().alerts.length === 0);
S().upsertAlerts([mkAlert('invoice-due-secretB')]);
S().setActiveScope('user:A');
check('scopes: retour compte A → son alerte restaurée', S().alerts.length === 1 && S().alerts[0].id === 'invoice-due-secretA');
// « Supprimer mes données » (ordre corrigé) : purge du scope PUIS bascule guest
S().clearActiveScope();
S().setActiveScope('guest'); // simulate user → null (initAlertsScopeSync)
check('suppression données A: invité ne voit rien', S().alerts.length === 0);
S().setActiveScope('user:A');
check('suppression données A: le compte A est réellement vide ensuite', S().alerts.length === 0);
S().setActiveScope('user:B');
check('suppression données A: le compte B conserve SON historique intact', S().alerts.length === 1 && S().alerts[0].id === 'invoice-due-secretB');

console.log(`\n[test-alerts] ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
