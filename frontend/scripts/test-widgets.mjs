#!/usr/bin/env node
/**
 * Budgy — Contrats widgets iOS / Siri / confidentialité (statique + réel).
 * Le Swift ne peut pas être compilé ici : ces tests vérifient les contrats
 * de code (TS réel importé + invariants de sécurité dans les sources Swift).
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

let passed = 0, failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
};

const widgetSwift = read('targets/widgets/BudgyWidget.swift');
const widgetShared = read('targets/widgets/BudgyShared.swift');
const intents = read('targets/intents/_shared/BudgyIntents.swift');
const intentsShared = read('targets/intents/_shared/BudgyShared.swift');
const shortcuts = read('targets/intents/_shared/BudgyShortcuts.swift');
const bridge = read('src/services/widgetBridge.ts');
const sync = read('src/components/WidgetSync.tsx');
const quickAdd = read('app/quick-add.tsx');
const settings = read('app/more/settings.tsx');
const appJson = JSON.parse(read('app.json'));

console.log('\n— Configuration native —');
check('App Group déclaré dans app.json', JSON.stringify(appJson.expo.ios.entitlements || {}).includes('group.com.budgy.ch.budgy'));
check('appleTeamId présent', appJson.expo.ios.appleTeamId === 'N69NHCB9S3');
check('plugin @bacons/apple-targets déclaré', appJson.expo.plugins.includes('@bacons/apple-targets'));
check('cible widget configurée (type widget)', read('targets/widgets/expo-target.config.js').includes("type: 'widget'"));
check('cible intents configurée (type app-intent)', read('targets/intents/expo-target.config.js').includes("type: 'app-intent'"));
check('App Group identique partout', [widgetShared, intentsShared, bridge].every((s) => s.includes('group.com.budgy.ch.budgy')));
check('ShareExtension (expo-share-intent) conservée', appJson.expo.plugins.some((p) => p === 'expo-share-intent' || (Array.isArray(p) && p[0] === 'expo-share-intent')));

console.log('\n— Confidentialité widgets (Swift) —');
check('AUCUN fallback UserDefaults.standard', !widgetShared.includes('.standard') && !intentsShared.includes('.standard'));
check('AUCUNE valeur de démonstration (pas de placeholder chiffré)', !/4823|5200|Achat immobilier|streak/.test(widgetShared + widgetSwift));
check('pas de snapshot => état « Ouvrez Budgy » (unavailable)', widgetShared.includes('case unavailable') && widgetSwift.includes('EmptyBudgy'));
check('masquage respecté (hide => masked)', widgetShared.includes('if snap.hide { return .masked'));
check('écran verrouillé masqué par défaut (lockAmounts opt-in)', widgetShared.includes('forLockScreen && !snap.lockAmounts'));
check('indicateur de données obsolètes (>36h)', widgetShared.includes('36 * 3600') && widgetSwift.includes('StaleDot'));
check('widgetsEnabled exigé pour afficher', widgetShared.includes('snap.widgetsEnabled'));

console.log('\n— Siri / App Intents (Swift) —');
check('file persistante, jamais vidée côté intent', !intentsShared.includes('removeObject(forKey: BudgyShared.pendingKey') && intentsShared.includes('n\'est JAMAIS vidée ici'));
check('identifiant unique par dépense (UUID)', intentsShared.includes('UUID().uuidString'));
check('rattachée au scope du compte', intentsShared.includes('scope: scope'));
check('aucune mutation du solde affiché avant enregistrement', !intentsShared.includes('snap.available -='));
check('montant validé (0 < m < 1 000 000)', intents.includes('amount > 0, amount < 1_000_000'));
check('annonce honnête : « confirmez » (pas « enregistré »)', intentsShared.includes('confirmez') && !intentsShared.includes('Il te reste'));
check('budget vocal : opt-in explicite + non masqué + frais', intents.includes('s.siriAmounts') && intents.includes('!s.hide') && intents.includes('36 * 3600'));
check('sinon ouverture de Budgy (pas de montant énoncé)', intentsShared.includes('Ouvrez Budgy pour consulter vos chiffres'));
check('4 raccourcis déclarés (dépense, budget, scanner, ouvrir)', ['AddExpenseIntent', 'GetBudgetIntent', 'ScanBillIntent', 'OpenBudgyIntent'].every((i) => shortcuts.includes(i)));
check('phrases françaises présentes', shortcuts.includes('Combien me reste-t-il dans'));

console.log('\n— Pont React Native —');
check('moteur existant réutilisé (getMonthlyFinancialSnapshot)', bridge.includes('getMonthlyFinancialSnapshot'));
check('aucun jeton Supabase partagé', !bridge.includes('supabase') && !bridge.includes('access_token') && !bridge.includes('refresh_token'));
check('purge fail-safe sans session (user null)', bridge.includes('if (!s.user)') && bridge.includes('clearWidgetDataSync()'));
check('file Siri retirée APRÈS enregistrement confirmé', bridge.includes('resolvePendingExpense') && quickAdd.includes('if (pendingId) await resolvePendingExpense(pendingId)'));
check('anti-doublon persistant (registre des ids)', bridge.includes('processedIds') && quickAdd.includes('isAlreadyProcessed(pendingId)'));
check('filtrage par scope du compte actif', bridge.includes('e.scope === scope'));
check('déconnexion + suppression purgent le stockage partagé', settings.includes('clearWidgetData'));
check('rafraîchissement sur données/compte/premier plan', sync.includes("st === 'active'") && sync.includes('activeScope') && sync.includes('for (const t of s.transactions)'));
check('signature de contenu (montants, dates, statuts, objectifs — pas seulement les longueurs)',
  sync.includes('${t.amount}${t.date}') && sync.includes('${v.status}') && sync.includes('${r.active}') && sync.includes('saved'));
check('Siri lié au compte ou brouillon temporaire uniquement sur ouverture explicite',
  bridge.includes('e.scope === scope') &&
  bridge.includes("allowUnscopedSiriDraft && e.scope === 'unscoped'") &&
  bridge.includes('now - e.createdAt < 5 * 60') &&
  sync.includes("peekPendingExpenses(route === 'quick-add')") &&
  !bridge.includes("|| e.scope === 'unknown'"));
check('entrées d\'origine inconnue purgées (48 h), jamais enregistrées', bridge.includes('48 * 3600'));
check('intent garde un brouillon non lié si snapshot absent (jamais une dépense enregistrée)',
  intentsShared.includes('snapshotScope.hasPrefix("user:") ? snapshotScope : "unscoped"') &&
  intentsShared.includes('scope: scope') &&
  intents.includes('BudgyIntentStore.enqueue') &&
  intentsShared.includes('confirmez'));
check('écriture idempotente : transaction siri_<pid> jamais recréée', quickAdd.includes('transactions.some((tx) => tx.id === id)'));
check('une dépense Siri reste une dépense (pas de requalification)', quickAdd.includes("pendingId ? 'expense'"));
check('rafraîchissement débouncé (limites WidgetKit)', sync.includes('1500'));
check('masquage accueil propagé aux widgets', read('app/(tabs)/index.tsx').includes('refreshWidgetSnapshot'));

console.log('\n— Comportement réel du pont (web no-op sûr) —');
// Import réel du bridge en environnement non-iOS simulé : tout doit être no-op sans crash.
let bridgeSrc = bridge
  .replace(/import \{ Platform \}.*\n/, 'const Platform = { OS: "web" };\n')
  .replace(/import AsyncStorage.*\n/, 'const AsyncStorage = { getItem: async () => null, setItem: async () => {}, };\n')
  .replace(/import \{ useStore \}.*\n/, 'const useStore = { getState: () => ({ user: null, incomes: [], transactions: [], recurringExpenses: [], invoices: [], savingsGoals: [] }) };\n')
  .replace(/import \{ useAlertsStore \}.*\n/, 'const useAlertsStore = { getState: () => ({ activeScope: "guest" }) };\n')
  .replace(/import \{ getMonthlyFinancialSnapshot, computeBudgetConsumption, parseDate \}.*\n/, 'const getMonthlyFinancialSnapshot = () => ({});\nconst computeBudgetConsumption = () => ({ rows: [], totalLimit: 0, totalSpent: 0 });\nconst parseDate = () => null;\n')
  .replace(/export interface PendingExpense \{[\s\S]*?\}\n/, '')
  .replace(/type Storage = \{[\s\S]*?\};\n/, '')
  .replace(/let storage: Storage \| null/, 'let storage')
  .replace(/let reloadWidgets.*\n/, 'let reloadWidgets = () => {};\n')
  .replace(/: PendingExpense\[\]/g, '')
  .replace(/: Promise<void>/g, '')
  .replace(/: Promise<boolean>/g, '')
  .replace(/: string\[\]/g, '')
  .replace(/: string \| null/g, '')
  .replace(/\(id: string\)/g, '(id)')
  .replace(/ as PendingExpense\[\]/g, '')
  .replace(/ as Storage/g, '')
  .replace(/\(useStore as any\)/g, '(useStore)')
  .replace(/: any/g, '')
  .replace(/ as any/g, '')
  .replace(/: number/g, '')
  .replace(/: string/g, '')
  .replace(/: boolean/g, '')
  .replace(/: void/g, '')
  .replace(/ as const;/, ';')
  .replace(/\(e\): e is [^)]*\)/g, '(e)');
try {
  const m = await import('data:text/javascript;base64,' + Buffer.from(bridgeSrc).toString('base64'));
  check('bridge indisponible hors iOS (no-op)', m.widgetBridgeAvailable() === false);
  check('peekPendingExpenses => [] sans natif', Array.isArray(m.peekPendingExpenses()) && m.peekPendingExpenses().length === 0);
  check('refreshWidgetSnapshot ne lève pas', await m.refreshWidgetSnapshot().then(() => true).catch(() => false));
  check('popPendingRoute => null sans natif', m.popPendingRoute() === null);
} catch (e) {
  check('import réel du bridge', false, String(e).slice(0, 120));
}

console.log(`\nRésultat : ${passed} réussis, ${failed} échoués`);
if (failed > 0) process.exit(1);
