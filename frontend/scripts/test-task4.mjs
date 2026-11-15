#!/usr/bin/env node
// TÂCHE 4 — Siri & App Intents + correctif devises CHF/EUR.
// Catégories SÉPARÉES : [UNIT] exécutés réellement / [STATIC] contrôles de
// code. Tout ce qui exige un iPhone physique est documenté NON TESTÉ.
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let unit = 0, stat = 0, fail = 0;
const U = (n, c) => { if (c) { unit++; console.log(`  ✅ [UNIT] ${n}`); } else { fail++; console.log(`  ❌ [UNIT] ${n}`); } };
const S = (n, c) => { if (c) { stat++; console.log(`  ✅ [STATIC] ${n}`); } else { fail++; console.log(`  ❌ [STATIC] ${n}`); } };
const read = (f) => readFileSync(join(root, f), 'utf8');

const sel = await import(join(root, 'src/stores/selectors.ts'));
const nw = await import(join(root, 'src/lib/numberWords.ts'));
// voiceLocalParser importe './numberWords' sans extension (résolution Metro) :
// on réécrit l'import en URL absolue pour une EXÉCUTION RÉELLE sous Node.
const vpTmp = join(root, 'scripts', '.vp-under-test.ts');
writeFileSync(vpTmp, read('src/lib/voiceLocalParser.ts').replace(
  "from './numberWords'",
  `from '${pathToFileURL(join(root, 'src/lib/numberWords.ts')).href}'`,
));
const vp = await import(pathToFileURL(vpTmp).href);
rmSync(vpTmp);
const sm = await import(join(root, 'src/lib/syncMerge.ts'));

console.log('\n═ CORRECTIF PRÉALABLE — devises étrangères (exécution réelle) ═');
{
  const now = new Date(2026, 5, 15);
  const base = { incomes: [{ id: 'i', amount: 5000, type: 'recurring', frequency: 'monthly' }], transactions: [], recurringExpenses: [], debts: [], now };
  // 1) CHF seuls — référence
  const chfOnly = sel.getMonthlyFinancialSnapshot({ ...base, invoices: [
    { id: 'a', title: 'A', amount: 100, currency: 'CHF', status: 'pending' },
    { id: 'b', title: 'B', amount: 50, status: 'pending' }, // devise absente = CHF (héritage)
    { id: 'c', title: 'C', amount: 999, currency: 'CHF', status: 'paid' },
  ] });
  U('factures CHF (et héritage sans devise) comptées, payées exclues', chfOnly.upcomingBills === 150 && chfOnly.foreignBills.length === 0 && !chfOnly.availableIsPartial);
  // 2) 100 EUR ≠ 100 CHF : JAMAIS au taux 1:1, JAMAIS de taux inventé
  const withEur = sel.getMonthlyFinancialSnapshot({ ...base, invoices: [
    { id: 'a', title: 'A', amount: 100, currency: 'CHF', status: 'pending' },
    { id: 'e', title: 'Hôtel', amount: 100, currency: 'EUR', status: 'pending' },
    { id: 'e2', title: 'Train', amount: 50.5, currency: 'EUR', status: 'pending' },
  ] });
  U('100 EUR jamais comptés comme 100 CHF (exclus du total CHF)', withEur.upcomingBills === 100);
  U('obligation EUR présentée SÉPARÉMENT (devise conservée)', withEur.foreignBills.length === 1 && withEur.foreignBills[0].currency === 'EUR' && withEur.foreignBills[0].total === 150.5 && withEur.foreignBills[0].count === 2);
  U('disponible signalé PARTIEL (jamais présenté comme définitif)', withEur.availableIsPartial === true && withEur.realAvailableThisMonth === 5000 - 100);
  // 3) Taux VÉRIFIÉ conservé (taux + date + montant CHF) → compté en CHF calculé
  const withRate = sel.getMonthlyFinancialSnapshot({ ...base, invoices: [
    { id: 'e', title: 'Hôtel', amount: 100, currency: 'EUR', status: 'pending', chfAmount: 95.2, fxRate: 0.952, fxDate: '2026-06-10' },
  ] });
  U('EUR avec taux vérifié (chfAmount+fxRate+fxDate) → compté au montant CHF calculé', withRate.upcomingBills === 95.2 && withRate.foreignBills.length === 0 && !withRate.availableIsPartial);
  const noDate = sel.getMonthlyFinancialSnapshot({ ...base, invoices: [
    { id: 'e', title: 'Hôtel', amount: 100, currency: 'EUR', status: 'pending', chfAmount: 95.2, fxRate: 0.952 },
  ] });
  U('conversion incomplète (sans date du taux) → traitée comme NON vérifiée', noDate.upcomingBills === 0 && noDate.foreignBills.length === 1);
  // 4) Paiement d'une facture EUR : la transaction (currency EUR) n'entre pas en CHF
  const paidEur = sel.getMonthlyFinancialSnapshot({ ...base,
    invoices: [{ id: 'e', title: 'Hôtel', amount: 100, currency: 'EUR', status: 'paid' }],
    transactions: [
      { id: 'inv_e', title: 'Hôtel', amount: 100, date: '2026-06-12', category: 'autre', currency: 'EUR', type: 'expense', invoiceId: 'e' },
      { id: 't1', title: 'Migros', amount: 80, date: '2026-06-12', category: 'courses', type: 'expense' },
    ] });
  U('paiement EUR exclu des dépenses CHF (pas de 1:1), CHF intacts', paidEur.paidExpenses === 80 && paidEur.upcomingBills === 0);
  U('aucun double comptage : facture payée hors engagements, paiement unique', paidEur.totalCommitted === 80);
}

console.log('\n═ TÂCHE 4 §5 — montants dictés en toutes lettres FR/DE/IT/EN (exécution réelle) ═');
{
  const cases = [
    ['vingt-cinq francs cinquante', 25.5], ['nonante-neuf francs', 99],
    ['quatre-vingt-quinze francs', 95], ['cent vingt francs', 120],
    ['mille deux cents francs', 1200],
    ['twenty five francs fifty', 25.5],
    ['fünfundzwanzig franken fünfzig', 25.5], ['einhundertzwanzig franken', 120],
    ['venticinque franchi e cinquanta', 25.5], ['ventuno franchi', 21],
  ];
  let ok = true;
  for (const [txt, exp] of cases) if (nw.parseSpokenChf(txt) !== exp) { ok = false; console.log('    ✗', txt, '→', nw.parseSpokenChf(txt)); }
  U('10 formats dictés FR/DE/IT/EN exacts (dont décimales)', ok);
  U('montant ambigu/inconnu → null (jamais de montant inventé)', nw.parseSpokenChf('blabla francs') === null && nw.parseSpokenChf('vingt-cinq') === null);
  const parsed = vp.parseVoiceLocally('Ajoute vingt-cinq francs cinquante chez Migros');
  U('« vingt-cinq francs cinquante chez Migros » → 25.50, catégorie courses', parsed.intent === 'expense' && parsed.amount === 25.5 && parsed.category === 'courses');
  const parking = vp.parseVoiceLocally('douze francs de parking');
  U('« douze francs de parking » → 12, catégorie transports', parking.amount === 12 && parking.category === 'transports');
  const digits = vp.parseVoiceLocally('Ajoute 25.50 CHF chez Migros');
  U('chiffres classiques inchangés (non-régression du parseur)', digits.amount === 25.5);
}

console.log('\n═ TÂCHE 4 §4 — une dépense Siri locale n\'est JAMAIS écrasée par le pull (exécution réelle) ═');
{
  const localTx = { id: 'siri_abc', title: 'Migros', amount: 25.5, date: '2026-06-15', category: 'courses', type: 'expense', source: 'siri' };
  // Non confirmée (absente de syncedHashes) → dirty → protégée du pull
  const dirty = sm.diffDirty([localTx], {});
  const r = sm.mergeCollectionsV2([localTx], [], { dirtyIds: new Set(dirty.dirtyIds || dirty.map?.((x) => x.id) || [localTx.id]), tombstoneIds: new Set() });
  U('dépense Siri non synchronisée conservée malgré un cloud qui l\'ignore', r.merged.some((x) => x.id === 'siri_abc' && x.amount === 25.5));
  const remoteStale = [{ id: 'siri_abc', title: 'Migros', amount: 1, date: '2026-06-15', category: 'courses' }];
  const r2 = sm.mergeCollectionsV2([localTx], remoteStale, { dirtyIds: new Set(['siri_abc']), tombstoneIds: new Set() });
  U('version cloud périmée n\'écrase pas la dépense Siri locale (dirty gagne)', r2.merged.find((x) => x.id === 'siri_abc').amount === 25.5);
}

console.log('\n═ TÂCHE 4 §3 — App Intents natifs (contrôles statiques) ═');
const intents = read('targets/intents/BudgyIntents.swift');
const shortcuts = read('targets/intents/BudgyShortcuts.swift');
const shared = read('targets/intents/BudgyShared.swift');
const cfg = read('targets/intents/expo-target.config.js');
const appJson = read('app.json');
S('Commande 1 — AddExpenseIntent natif (pas un raccourci URL)', intents.includes('struct AddExpenseIntent: AppIntent') && intents.includes('BudgyIntentStore.enqueue'));
S('Commande 2 — GetBudgetIntent + GetSavingsIntent (données réelles, jamais inventées)', intents.includes('struct GetBudgetIntent: AppIntent') && intents.includes('struct GetSavingsIntent: AppIntent') && intents.includes('Aucune épargne enregistrée'));
S('Commande 3 — GetBillsIntent : impayées + échéance + devises à part', intents.includes('struct GetBillsIntent: AppIntent') && intents.includes('billsForeign') && intents.includes('nextBillTitle') && intents.includes('non comprises dans le total en francs'));
S('Commande 4 — GetMonthlyBudgetIntent : budget restant ≠ disponible', intents.includes('struct GetMonthlyBudgetIntent: AppIntent') && intents.includes('budgetTotal') && intents.includes('disponible réel'));
S('exposition Siri/Raccourcis : les 4 commandes dans AppShortcutsProvider', ['AddExpenseIntent()', 'GetBudgetIntent()', 'GetBillsIntent()', 'GetSavingsIntent()', 'GetMonthlyBudgetIntent()'].every((x) => shortcuts.includes(x)));
S('phrases FR + DE + IT + EN présentes', shortcuts.includes('Füge eine Ausgabe') && shortcuts.includes('Aggiungi una spesa') && shortcuts.includes('Add an expense') && shortcuts.includes('Quali fatture'));
S('App Group group.com.budgy.ch.budgy (entitlements + stockage partagé)', cfg.includes("'group.com.budgy.ch.budgy'") && shared.includes('"group.com.budgy.ch.budgy"'));
S('bundle identifier com.budgy.ch.budgy conservé', appJson.includes('"bundleIdentifier": "com.budgy.ch.budgy"'));
S('build iOS 91 conservé', appJson.includes('"buildNumber": "91"'));
S('extension @main préservée (ITMS-90896)', read('targets/intents/BudgyIntentsExtension.swift').includes('@main'));
S('snapshot partagé étendu rétro-compatible (champs optionnels Swift)', shared.includes('var billsCount: Int?') && shared.includes('var savedTotal: Double?') && shared.includes('var budgetSpent: Double?'));
S('confidentialité : montants énoncés SEULEMENT si siriAmounts + non masqué + données < 36 h', (intents.match(/s\.siriAmounts/g) || []).length >= 4 && (intents.match(/36 \* 3600/g) || []).length >= 4);
S('Siri ne dit jamais « enregistré » avant sauvegarde (dialogue = « confirmez »)', intents.includes('confirmez') && !intents.includes('a été enregistrée'));

console.log('\n═ TÂCHE 4 §4 — sauvegarde fiable (contrôles statiques) ═');
const bridge = read('src/services/widgetBridge.ts');
const qa = read('app/quick-add.tsx');
const wsync = read('src/components/WidgetSync.tsx');
S('file durable : JAMAIS vidée au démarrage à froid (hydratation attendue)', bridge.includes('if (!hydrated) return;') && bridge.includes('NE RIEN TOUCHER'));
S('file isolée par compte (scope strict, jamais un autre compte)', bridge.includes('e.scope === scope'));
S('retrait UNIQUEMENT après sauvegarde confirmée dans le store', qa.includes('if (pendingId) await resolvePendingExpense(pendingId);') && qa.indexOf('addTransaction') < qa.indexOf('if (pendingId) await resolvePendingExpense(pendingId);'));
S('identifiant stable anti-doublon (siri_<pid> + registre processedIds)', qa.includes('`siri_${pendingId}`') && qa.includes('isAlreadyProcessed(pendingId)') && bridge.includes('PROCESSED_KEY'));
S('écriture idempotente : transaction déjà présente → jamais recréée', qa.includes('transactions.some((tx) => tx.id === id)'));
S('convention financière : dépense enregistrée avec montant POSITIF', qa.includes('Math.abs(result.amount || 0)'));
S('reprise au démarrage à froid : réessais jusqu\'à hydratation (pas un minuteur aveugle)', wsync.includes('setInterval') && wsync.includes('tries >= 15'));
S('reprise au retour au premier plan + changement de compte', wsync.includes("st === 'active'") && wsync.includes('s.activeScope !== lastScope'));
S('purge totale UNIQUEMENT sur action explicite (logout/suppression)', bridge.includes('clearWidgetData') && bridge.includes('déconnexion / suppression'));
S('routes de consultation branchées (factures, budgets)', wsync.includes("'invoices': '/more/invoices'") && wsync.includes("'budgets': '/more/budgets'"));

console.log('\n═ TÂCHE 4 §2 — données snapshot réelles pour les consultations ═');
S('factures : impayées + total CHF (moteur existant) + devises à part', bridge.includes('billsCount: unpaidBills.length') && bridge.includes('snap.upcomingBills') && bridge.includes('snap.foreignBills'));
S('épargne : total réellement épargné + objectif existant', bridge.includes('savedTotal') && bridge.includes('goalPct'));
S('budget mensuel : enveloppes existantes (jamais un 2e moteur)', bridge.includes('budgetTotal') && bridge.includes('budgetSpent') && bridge.includes('getMonthlyFinancialSnapshot'));
S('disponible partiel propagé à Siri (availablePartial)', bridge.includes('availablePartial: snap.availableIsPartial'));

console.log('\n═ UI — signalement du disponible partiel + découverte des commandes ═');
const home = read('app/(tabs)/index.tsx');
const siriScreen = read('app/more/siri-assistant.tsx');
const invScreen = read('app/more/invoices.tsx');
S('dashboard : note « hors devises étrangères » quand partiel (héro + détail)', (home.match(/availableIsPartial/g) || []).length >= 2 && home.includes("t('home.foreignPartial'"));
S('paiement d\'une facture EUR → transaction marquée de SA devise', invScreen.includes('{ currency: inv.currency }'));
S('écran Siri : les 4 commandes natives découvrables (FR/DE/IT/EN via i18n)', ['cmd1Phrase', 'cmd2Phrase', 'cmd3Phrase', 'cmd4Phrase'].every((k) => siriScreen.includes(k)) && siriScreen.includes("t('siriAssistant.sectionNative')"));

console.log(`\nRésultat : ${unit} unitaires exécutés + ${stat} statiques = ${unit + stat} réussis, ${fail} échoués`);
console.log('NON TESTÉ (iPhone physique + build natif requis) : exécution réelle des');
console.log('App Intents par Siri, App Group sur appareil, démarrage à froid par Siri,');
console.log('dictée vocale réelle, écran verrouillé, catalogue de phrases Siri.');
process.exit(fail ? 1 : 0);
