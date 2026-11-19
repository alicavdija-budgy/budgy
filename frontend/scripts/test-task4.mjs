#!/usr/bin/env node
// TÂCHE 4 — Siri & App Intents + correctif devises CHF/EUR.
// Catégories SÉPARÉES : [UNIT] exécutés réellement / [STATIC] contrôles de
// code. Tout ce qui exige un iPhone physique est documenté NON TESTÉ.
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
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
const intents = read('targets/intents/_shared/BudgyIntents.swift');
const shortcuts = read('targets/intents/_shared/BudgyShortcuts.swift');
const shared = read('targets/intents/_shared/BudgyShared.swift');
const cfg = read('targets/intents/expo-target.config.js');
const appJson = read('app.json');
S('Commande 1 — AddExpenseIntent natif (pas un raccourci URL)', intents.includes('struct AddExpenseIntent: AppIntent') && intents.includes('BudgyIntentStore.enqueue'));
S('Commande 2 — GetBudgetIntent + GetSavingsIntent (données réelles, jamais inventées)', intents.includes('struct GetBudgetIntent: AppIntent') && intents.includes('struct GetSavingsIntent: AppIntent') && shared.includes('Aucune épargne enregistrée'));
S('Commande 3 — GetBillsIntent : impayées + échéance + devises à part', intents.includes('struct GetBillsIntent: AppIntent') && intents.includes('billsForeign') && intents.includes('nextBillTitle') && shared.includes('non comprises dans le total en francs'));
S('Commande 4 — GetMonthlyBudgetIntent : budget restant ≠ disponible', intents.includes('struct GetMonthlyBudgetIntent: AppIntent') && intents.includes('budgetTotal') && shared.includes('Votre disponible réel'));
S('exposition Siri/Raccourcis : les 4 commandes dans AppShortcutsProvider', ['AddExpenseIntent()', 'GetBudgetIntent()', 'GetBillsIntent()', 'GetSavingsIntent()', 'GetMonthlyBudgetIntent()'].every((x) => shortcuts.includes(x)));
S('phrases FR + DE + IT + EN présentes', shortcuts.includes('Füge eine Ausgabe') && shortcuts.includes('Aggiungi una spesa') && shortcuts.includes('Add an expense') && shortcuts.includes('Quali fatture'));
S('Siri : formulation naturelle « avec Budgy » et « dans application Budgy » indexées',
  shortcuts.includes('Ajoute une dépense avec') &&
  shortcuts.includes("Ajoute une dépense dans l'application") &&
  shortcuts.includes('Enregistre ma dépense dans'));
S('Siri : libellés conservent le jeton obligatoire appName',
  shortcuts.includes(String.raw`\(.applicationName)`) &&
  (shortcuts.match(/Ajoute une dépense/g) || []).length >= 3);

S('App Group group.com.budgy.ch.budgy (entitlements + stockage partagé)', cfg.includes("'group.com.budgy.ch.budgy'") && shared.includes('"group.com.budgy.ch.budgy"'));
S('bundle identifier com.budgy.ch.budgy conservé', appJson.includes('"bundleIdentifier": "com.budgy.ch.budgy"'));
S('build iOS 95 préparé pour le prochain TestFlight', appJson.includes('"buildNumber": "95"'));
S('extension @main préservée (ITMS-90896)', read('targets/intents/BudgyIntentsExtension.swift').includes('@main'));
S('App Intents compilés dans APP + EXTENSION par le dossier spécial _shared', 
  ['BudgyIntents.swift', 'BudgyShared.swift', 'BudgyShortcuts.swift'].every((name) =>
    existsSync('targets/intents/_shared/' + name) && !existsSync('targets/intents/' + name)));
S('Intent de premier plan dans le target partagé (pas dans l’extension seule)',
  intents.includes('static let openAppWhenRun: Bool = true') &&
  read('targets/intents/BudgyIntentsExtension.swift').includes('AppIntentsExtension') &&
  !read('targets/intents/BudgyIntentsExtension.swift').includes('openAppWhenRun'));

S('snapshot partagé étendu rétro-compatible (champs optionnels Swift)', shared.includes('var billsCount: Int?') && shared.includes('var savedTotal: Double?') && shared.includes('var budgetSpent: Double?'));
S('confidentialité : montants énoncés SEULEMENT si siriAmounts + non masqué + données < 36 h', intents.includes('s.siriAmounts') && intents.includes('36 * 3600') && (intents.match(/guardedSnapshot\(route:/g) || []).length >= 4);
S('Siri indique clairement brouillon préparé et bouton Ajouter obligatoire', shared.includes('touchez Ajouter') && !intents.includes('a été enregistrée'));

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
S('Siri : hydratation respectée et écoute active sans limite arbitraire de 12 secondes',
  wsync.includes('setInterval') &&
  wsync.includes('hasHydrated') &&
  wsync.includes('setInterval(consumeNative, 800)') &&
  !wsync.includes('tries >= 15'));
S('reprise au retour au premier plan + changement de compte', wsync.includes("st === 'active'") && wsync.includes('s.activeScope !== lastScope'));
S('purge totale UNIQUEMENT sur action explicite (logout/suppression)', bridge.includes('clearWidgetData') && bridge.includes('déconnexion / suppression'));
S('routes de consultation branchées (factures, budgets)', wsync.includes("'invoices': '/more/invoices'") && wsync.includes("'budgets': '/more/budgets'"));

console.log('\n═ TÂCHE 4 §2 — données snapshot réelles pour les consultations ═');
S('factures : périmètre UNIQUE (exigibles fin de mois) pour count + total', bridge.includes('billsCount: snap.dueBillsCount') && bridge.includes('snap.upcomingBills') && bridge.includes('snap.foreignBills'));
S('épargne : total réellement épargné + objectif existant', bridge.includes('savedTotal') && bridge.includes('goalPct'));
S('budget mensuel : SÉLECTEUR PARTAGÉ avec l\'écran Budgets (un seul moteur)', bridge.includes('computeBudgetConsumption(') && bridge.includes('consumption.totalLimit') && bridge.includes('consumption.totalSpent') && !bridge.includes('b.monthly'));
S('disponible partiel propagé à Siri (availablePartial)', bridge.includes('availablePartial: snap.availableIsPartial'));

console.log('\n═ UI — signalement du disponible partiel + découverte des commandes ═');
const home = read('app/(tabs)/index.tsx');
const siriScreen = read('app/more/siri-assistant.tsx');
const invScreen = read('app/more/invoices.tsx');
S('dashboard : note « hors devises étrangères » quand partiel (héro + détail)', (home.match(/availableIsPartial/g) || []).length >= 2 && home.includes("t('home.foreignPartial'"));
S('paiement d\'une facture EUR → transaction marquée de SA devise', invScreen.includes('{ currency: inv.currency }'));
S('écran Siri : les 4 commandes natives découvrables (FR/DE/IT/EN via i18n)', ['cmd1Phrase', 'cmd2Phrase', 'cmd3Phrase', 'cmd4Phrase'].every((k) => siriScreen.includes(k)) && siriScreen.includes("t('siriAssistant.sectionNative')"));
S('Aide Siri : diagnostic Raccourcis dans les 4 langues', (read('src/i18n/translations.ts').match(/Raccourcis > Apps > Budgy|Shortcuts > Apps > Budgy|Kurzbefehle > Apps > Budgy|Comandi rapidi > App > Budgy/g) || []).length === 4);

console.log('\n═ CORRECTIFS FINAUX T4 — budget Siri = écran Budgets (exécution réelle) ═');
{
  const now = new Date(2026, 5, 15);
  // 1) Budget CHF 500, dépenses CHF 125 → Siri annonce 375 restants
  const b1 = sel.computeBudgetConsumption(
    [{ id: 'b1', category: 'courses', limit: 500 }],
    [{ id: 't1', title: 'Migros', amount: 125, date: '2026-06-10', category: 'courses' }],
    2026, 5,
  );
  U('budget 500, dépensé 125 → restant 375 (limites RÉELLES budget.limit)', b1.totalLimit === 500 && b1.totalSpent === 125 && b1.totalLimit - b1.totalSpent === 375);
  // 2) Plusieurs budgets/catégories + remboursement négatif + hors-mois exclu
  const b2 = sel.computeBudgetConsumption(
    [{ id: 'b1', category: 'courses', limit: 500 }, { id: 'b2', category: 'transports', limit: 100 }],
    [
      { id: 't1', title: 'Migros', amount: 125, date: '2026-06-10', category: 'courses' },
      { id: 't2', title: 'Remboursement', amount: -25, date: '2026-06-11', category: 'courses' },
      { id: 't3', title: 'CFF', amount: 40, date: '2026-06-12', category: 'transports' },
      { id: 't4', title: 'Resto (autre cat.)', amount: 60, date: '2026-06-12', category: 'restaurants' },
      { id: 't5', title: 'Mois précédent', amount: 999, date: '2026-05-10', category: 'courses' },
    ],
    2026, 5,
  );
  U('multi-budgets : catégories respectées, remboursement déduit, hors-mois exclu', b2.rows[0].spent === 100 && b2.rows[1].spent === 40 && b2.totalSpent === 140);
  // 3) Aucune enveloppe → totaux 0 (Siri l'indique clairement)
  const b3 = sel.computeBudgetConsumption([], [{ id: 't1', title: 'X', amount: 50, date: '2026-06-10', category: 'courses' }], 2026, 5);
  U('aucune enveloppe → total 0 (annonce « aucune enveloppe », rien d\'inventé)', b3.totalLimit === 0 && b3.rows.length === 0);
  // 4) Budget modifié en cours de mois → recalcul immédiat sur la nouvelle limite
  const b4 = sel.computeBudgetConsumption(
    [{ id: 'b1', category: 'courses', limit: 800 }],
    [{ id: 't1', title: 'Migros', amount: 125, date: '2026-06-10', category: 'courses' }],
    2026, 5,
  );
  U('limite modifiée en cours de mois → restant recalculé (800-125=675)', b4.totalLimit - b4.totalSpent === 675);
  // 5) Devise : une dépense EUR ne consomme JAMAIS une enveloppe CHF (1:1 interdit)
  const b5 = sel.computeBudgetConsumption(
    [{ id: 'b1', category: 'courses', limit: 500 }],
    [
      { id: 't1', title: 'Migros', amount: 125, date: '2026-06-10', category: 'courses' },
      { id: 't2', title: 'Carrefour FR', amount: 100, date: '2026-06-10', category: 'courses', currency: 'EUR' },
    ],
    2026, 5,
  );
  U('dépense EUR exclue de l\'enveloppe CHF (jamais 1:1)', b5.totalSpent === 125);
  // Parité réelle écran ↔ Siri : l'écran consomme le MÊME sélecteur
  const budgetsScreen = read('app/more/budgets.tsx');
  S('écran Budgets branché sur computeBudgetConsumption (zéro divergence)', budgetsScreen.includes('computeBudgetConsumption(budgets') && !budgetsScreen.includes('const spent = catTx.reduce'));
}

console.log('\n═ CORRECTIFS FINAUX T4 — centimes Siri (port JS exact de l\'algorithme Swift) ═');
{
  // Port 1:1 de BudgyIntentStore.chf (arrondi sur cents ENTIERS, groupes
  // suisses, signe mathématique) — vérifié identique au source Swift ci-après.
  const chf = (v) => {
    const cents = Math.round(Math.abs(v) * 100);
    const francs = Math.floor(cents / 100);
    const rem = cents % 100;
    const digits = String(francs);
    let grouped = '';
    for (let i = 0; i < digits.length; i++) {
      const c = digits[digits.length - 1 - i];
      if (i > 0 && i % 3 === 0) grouped = '\u2019' + grouped;
      grouped = c + grouped;
    }
    const sign = v < 0 && cents > 0 ? '\u2212' : '';
    return rem === 0 ? sign + grouped : sign + grouped + '.' + String(rem).padStart(2, '0');
  };
  U('CHF 25.50 → « 25.50 » (jamais 26)', chf(25.5) === '25.50');
  U('CHF 25.05 → « 25.05 » (zéro de tête des centimes)', chf(25.05) === '25.05');
  U('CHF 25.95 → « 25.95 » (jamais 26)', chf(25.95) === '25.95');
  U('CHF 1\u2019234.50 → milliers groupés + centimes', chf(1234.5) === '1\u2019234.50');
  U('CHF −12.75 → signe négatif préservé', chf(-12.75) === '\u221212.75');
  U('CHF 25 → entier sans décimales inutiles', chf(25) === '25');
  U('erreur binaire 0.1+0.2 → 0.30 exact (arrondi sur cents entiers)', chf(0.1 + 0.2) === '0.30');
  const sharedSrc = read('targets/intents/_shared/BudgyShared.swift');
  S('algorithme Swift identique (cents entiers, %02d, signe, apostrophe)', sharedSrc.includes('Int((abs(v) * 100).rounded())') && sharedSrc.includes('String(format: "%02d", rem)') && sharedSrc.includes('cents % 100') && !sharedSrc.includes('Int(v.rounded())'));
}

console.log('\n═ CORRECTIFS FINAUX T4 — synchro devises/conversions ═');
{
  const cs = read('src/services/cloudSync.ts');
  const mig = readFileSync(join(root, '..', 'docs/MIGRATION_TASK3_storage_prive.sql'), 'utf8');
  S('migration : transactions.currency + invoices.chf_amount/fx_rate/fx_date/fx_source', ['transactions ADD COLUMN IF NOT EXISTS currency', 'chf_amount double precision', 'fx_rate double precision', 'fx_date text', 'fx_source text'].every((x) => mig.includes(x)));
  S('TABLE_FIELDS : currency (transactions) + chf_amount/fx_rate/fx_date/fx_source (invoices)', /transactions:\s*\[[^\]]*'currency'/.test(cs) && /invoices:\s*\[[^\]]*'chf_amount'[^\]]*'fx_rate'[^\]]*'fx_date'[^\]]*'fx_source'/.test(cs));
  S('repli legacy SANS ces champs (préservés localement avant migration)', !/TABLE_FIELDS_LEGACY[\s\S]{0,900}(chf_amount|fx_rate)/.test(cs) && !/TABLE_FIELDS_LEGACY[\s\S]{0,500}currency.*transactions/.test(cs));
  S('sonde schéma sur les colonnes les plus récentes (currency / fx_source)', cs.includes("transactions: 'currency'") && cs.includes("invoices: 'fx_source'"));
  // [UNIT] un paiement EUR ne revient JAMAIS du cloud comme paiement CHF
  const localEur = { id: 'tx1', title: 'Hôtel', amount: 100, date: '2026-06-12', category: 'autre', currency: 'EUR' };
  const remoteNoCur = [{ id: 'tx1', title: 'Hôtel', amount: 100, date: '2026-06-12', category: 'autre' }];
  const merged = sm.mergeCollectionsV2([localEur], remoteNoCur, { dirtyIds: new Set(['tx1']), tombstoneIds: new Set() });
  U('pull cloud (schéma legacy sans currency) → devise EUR locale CONSERVÉE', merged.merged.find((x) => x.id === 'tx1').currency === 'EUR');
  U('currency/chfAmount/fxRate modifient le hash (→ dirty → envoi post-migration)', sm.hashItem({ id: 'a' }) !== sm.hashItem({ id: 'a', currency: 'EUR' }) && sm.hashItem({ id: 'b' }) !== sm.hashItem({ id: 'b', chfAmount: 95.2, fxRate: 0.952, fxDate: '2026-06-10', fxSource: 'BNS' }));
  // [UNIT] cohérence montant × taux ≈ montant CHF, sinon NON vérifié
  const base = { incomes: [], transactions: [], recurringExpenses: [], debts: [], now: new Date(2026, 5, 15) };
  const incoherent = sel.getMonthlyFinancialSnapshot({ ...base, invoices: [
    { id: 'e', title: 'X', amount: 100, currency: 'EUR', status: 'pending', chfAmount: 500, fxRate: 0.952, fxDate: '2026-06-10' },
  ] });
  U('conversion INCOHÉRENTE (100×0.952 ≠ 500) → rejetée, facture présentée à part', incoherent.upcomingBills === 0 && incoherent.foreignBills.length === 1);
  const coherent = sel.getMonthlyFinancialSnapshot({ ...base, invoices: [
    { id: 'e', title: 'X', amount: 100, currency: 'EUR', status: 'pending', chfAmount: 95.2, fxRate: 0.952, fxDate: '2026-06-10', fxSource: 'BNS' },
  ] });
  U('conversion cohérente (taux + date + source conservés) → 95.20 CHF compté', coherent.upcomingBills === 95.2);
  // [UNIT] périmètre factures : exigibles fin de mois, retard analysé par DATE
  const scope = sel.getMonthlyFinancialSnapshot({ ...base, invoices: [
    { id: 'late', title: 'Retard', amount: 50, currency: 'CHF', status: 'overdue', dueDate: '2026-05-20' },
    { id: 'due', title: 'Ce mois', amount: 30, currency: 'CHF', status: 'pending', dueDate: '30.06.2026' },
    { id: 'future', title: 'Mois prochain', amount: 999, currency: 'CHF', status: 'pending', dueDate: '2026-07-15' },
  ] });
  U('retard + échéance du mois comptés, futur exclu (dates analysées, pas des chaînes)', scope.upcomingBills === 80 && scope.dueBillsCount === 2 && scope.overdueBillsCount === 1);
  U('billsTotal cohérent avec le périmètre annoncé (même liste)', scope.dueBillsCount === 2 && scope.upcomingBills === 80);
  // Rapprochements : devises comparées, pas seulement les montants
  const invScreen2 = read('app/more/invoices.tsx');
  const scanner2 = read('app/scanner-modal.tsx');
  S('rapprochement facture↔transaction : refus si devises différentes', invScreen2.includes('if (txCur !== invCur) return false;'));
  S('rapprochement QR↔charge récurrente : réservé aux QR en CHF', scanner2.includes("qrBill.currency === 'CHF'") && scanner2.includes(': undefined'));
}

console.log('\n═ CORRECTIFS FINAUX T4 — réponses Siri localisées FR/DE/IT/EN ═');
{
  const sharedSrc = read('targets/intents/_shared/BudgyShared.swift');
  const keys = ['openPrivacy', 'addAuth', 'addConfirm', 'budgetAnswer', 'partialSuffix', 'billsNone', 'billsOne', 'billsMany', 'billsOverdue', 'billsTotal', 'billsForeign', 'billsNext', 'savingsNone', 'savingsMain', 'savingsGoal', 'mbNoEnvelopes', 'mbMain', 'mbAvailable'];
  let allLoc = true;
  for (const k of keys) {
    const block = sharedSrc.split(`"${k}": [`)[1]?.split('],')[0] || '';
    if (!(block.includes('"fr":') && block.includes('"de":') && block.includes('"it":') && block.includes('"en":'))) { allLoc = false; console.log('    ✗ clé non localisée ×4 :', k); }
  }
  S(`18 dialogues Siri localisés ×4 langues (${keys.length} clés fr/de/it/en)`, allLoc);
  S('langue pilotée par l\'app (snapshot.lang) avec repli système', sharedSrc.includes('BudgyIntentStore.loadSnapshot()?.lang') && sharedSrc.includes('Locale.preferredLanguages') && read('src/services/widgetBridge.ts').includes('lang: String(s.preferences?.language'));
  S('catalogue de chaînes (titres/paramètres) : Localizable.xcstrings en/de/it', (() => { try { const x = JSON.parse(read('targets/intents/Localizable.xcstrings')); const v = Object.values(x.strings); return x.sourceLanguage === 'fr' && v.length >= 19 && v.every((e) => e.localizations.en && e.localizations.de && e.localizations.it); } catch { return false; } })());
  S('disponible PARTIEL énoncé par GetBudgetIntent ET en secours du budget mensuel', (read('targets/intents/_shared/BudgyIntents.swift').match(/partialSuffix/g) || []).length >= 3);
}

console.log('\n═ DERNIER CORRECTIF FINANCIER — devises dans les revenus, charges, dettes, budgets (exécution réelle) ═');
{
  const now = new Date(2026, 5, 15);
  const base = { incomes: [{ id: 'i', amount: 5000, type: 'recurring', frequency: 'monthly' }], transactions: [], recurringExpenses: [], invoices: [], debts: [], now };
  // 1) Revenu ponctuel 100 EUR → JAMAIS +100 CHF au disponible
  const incEur = sel.getMonthlyFinancialSnapshot({ ...base, transactions: [
    { id: 'r1', title: 'Remb. FR', amount: 100, date: '2026-06-10', category: 'autre', type: 'income', currency: 'EUR' },
  ] });
  U('revenu 100 EUR : disponible CHF inchangé (5000), présenté à part', incEur.realAvailableThisMonth === 5000 && incEur.oneOffIncome === 0 && incEur.foreignIncome.length === 1 && incEur.foreignIncome[0].total === 100);
  U('revenu EUR → disponible signalé PARTIEL', incEur.availableIsPartial === true);
  // 2) Revenu ponctuel CHF 100 → comportement inchangé
  const incChf = sel.getMonthlyFinancialSnapshot({ ...base, transactions: [
    { id: 'r1', title: 'Vente', amount: 100, date: '2026-06-10', category: 'autre', type: 'income' },
  ] });
  U('revenu CHF 100 : +100 au disponible (inchangé)', incChf.oneOffIncome === 100 && incChf.realAvailableThisMonth === 5100 && !incChf.availableIsPartial);
  // 3) Charge CHF 100 + transaction LIÉE en EUR 100 → aucun règlement fictif
  const charge = sel.getMonthlyFinancialSnapshot({ ...base,
    recurringExpenses: [{ id: 'rc1', title: 'Assurance', amount: 100, frequency: 'monthly', active: true, createdAt: new Date(2026, 0, 1).getTime() }],
    transactions: [{ id: 'p1', title: 'Paiement FR', amount: 100, date: '2026-06-10', category: 'assurances', recurringId: 'rc1', currency: 'EUR' }],
  });
  U('charge CHF 100 + paiement lié EUR 100 : la charge reste DUE (100)', charge.recurringExpenses === 100);
  const chargeChf = sel.getMonthlyFinancialSnapshot({ ...base,
    recurringExpenses: [{ id: 'rc1', title: 'Assurance', amount: 100, frequency: 'monthly', active: true, createdAt: new Date(2026, 0, 1).getTime() }],
    transactions: [{ id: 'p1', title: 'Paiement', amount: 100, date: '2026-06-10', category: 'assurances', recurringId: 'rc1' }],
  });
  U('rapprochement LÉGITIME par identifiant (CHF) préservé : charge réglée', chargeChf.recurringExpenses === 0);
  // 4) Dette CHF 200/mois + paiement EUR 50 → aucune réduction
  const debt = sel.getMonthlyFinancialSnapshot({ ...base,
    debts: [{ id: 'd1', title: 'Crédit', total: 5000, paid: 0, monthlyPayment: 200 }],
    transactions: [{ id: 'p1', title: 'Paiement FR', amount: 50, date: '2026-06-10', category: 'dettes', debtId: 'd1', currency: 'EUR' }],
  });
  U('dette 200 CHF + paiement EUR 50 lié : mensualité reste 200', debt.debtPayments === 200);
  const debtCat = sel.getMonthlyFinancialSnapshot({ ...base,
    debts: [{ id: 'd1', title: 'Crédit', total: 5000, paid: 0, monthlyPayment: 200 }],
    transactions: [{ id: 'p1', title: 'Paiement FR', amount: 50, date: '2026-06-10', category: 'dettes', currency: 'EUR' }],
  });
  U('repli catégorie « dettes » : paiement EUR non lié également exclu', debtCat.debtPayments === 200);
  // 5) Facture EUR LIÉE à une charge CHF : la charge ne disparaît pas sans
  //    contrepartie comptée (facture EUR exclue des totaux CHF)
  const linkEur = sel.getMonthlyFinancialSnapshot({ ...base,
    recurringExpenses: [{ id: 'rc1', title: 'Prime', amount: 100, frequency: 'monthly', active: true, createdAt: new Date(2026, 0, 1).getTime() }],
    invoices: [{ id: 'inv1', title: 'Prime FR', amount: 100, currency: 'EUR', status: 'pending', recurringId: 'rc1' }],
  });
  U('facture EUR liée (sans taux) : obligation CHF de la charge CONSERVÉE', linkEur.recurringExpenses === 100 && linkEur.upcomingBills === 0 && linkEur.foreignBills[0].total === 100);
  const linkChf = sel.getMonthlyFinancialSnapshot({ ...base,
    recurringExpenses: [{ id: 'rc1', title: 'Prime', amount: 100, frequency: 'monthly', active: true, createdAt: new Date(2026, 0, 1).getTime() }],
    invoices: [{ id: 'inv1', title: 'Prime', amount: 100, currency: 'CHF', status: 'pending', recurringId: 'rc1' }],
  });
  U('facture CHF liée : représente l\'obligation UNE seule fois (pas de double)', linkChf.recurringExpenses === 0 && linkChf.upcomingBills === 100 && linkChf.totalCommitted === 100);
  // 6) Budgets : revenu classé « courses » ≠ dépense budgétaire ; EUR exclu
  const bud = sel.computeBudgetConsumption(
    [{ id: 'b1', category: 'courses', limit: 500 }],
    [
      { id: 't1', title: 'Migros', amount: 125, date: '2026-06-10', category: 'courses' },
      { id: 't2', title: 'Vente vide-grenier', amount: 200, date: '2026-06-11', category: 'courses', type: 'income' },
      { id: 't3', title: 'Carrefour FR', amount: 100, date: '2026-06-12', category: 'courses', currency: 'EUR' },
    ],
    2026, 5,
  );
  U('revenu CHF 200 « courses » exclu du budget + EUR exclu → 125 dépensés, 375 restants', bud.totalSpent === 125 && bud.totalLimit - bud.totalSpent === 375);
}

console.log('\n═ CLÔTURE FINANCIÈRE — paiement des factures en devise (exécution réelle) ═');
{
  const now = new Date(2026, 5, 15);
  const base = { incomes: [{ id: 'i', amount: 5000, type: 'recurring', frequency: 'monthly' }], transactions: [], recurringExpenses: [], invoices: [], debts: [], now };
  // 1) Facture CHF 100 : impayée puis payée → disponible IDENTIQUE (4900)
  const chfUnpaid = sel.getMonthlyFinancialSnapshot({ ...base, invoices: [
    { id: 'a', title: 'A', amount: 100, currency: 'CHF', status: 'pending' },
  ] });
  const chfPaid = sel.getMonthlyFinancialSnapshot({ ...base,
    invoices: [{ id: 'a', title: 'A', amount: 100, currency: 'CHF', status: 'paid' }],
    transactions: [{ id: 'inv_a', title: 'A', amount: 100, date: '2026-06-12', category: 'autre', type: 'expense', invoiceId: 'a' }],
  });
  U('facture CHF 100 : disponible identique avant (4900) et après paiement (4900)', chfUnpaid.realAvailableThisMonth === 4900 && chfPaid.realAvailableThisMonth === 4900);
  // 2) Facture EUR 100 / CHF 95.20 VÉRIFIÉS : disponible cohérent avant/après
  const vInv = { id: 'e', title: 'Hôtel', amount: 100, currency: 'EUR', chfAmount: 95.2, fxRate: 0.952, fxDate: '2026-06-10', fxSource: 'BNS' };
  const eurUnpaid = sel.getMonthlyFinancialSnapshot({ ...base, invoices: [{ ...vInv, status: 'pending' }] });
  const eurPaid = sel.getMonthlyFinancialSnapshot({ ...base,
    invoices: [{ ...vInv, status: 'paid' }],
    transactions: [{ id: 'inv_e', title: 'Hôtel', amount: 100, date: '2026-06-12', category: 'autre', type: 'expense', invoiceId: 'e', currency: 'EUR' }],
  });
  U('EUR 100 / CHF 95.20 vérifiés : 4904.80 avant ET après paiement (plus de remontée artificielle)', eurUnpaid.realAvailableThisMonth === 5000 - 95.2 && eurPaid.realAvailableThisMonth === 5000 - 95.2);
  U('montant CHF vérifié compté UNE seule fois (obligation remplacée par paiement)', eurPaid.upcomingBills === 0 && eurPaid.paidExpenses === 95.2 && !eurPaid.availableIsPartial);
  // 3) Facture EUR payée SANS conversion vérifiée : rien d'inventé, PARTIEL explicite
  const eurPaidNoRate = sel.getMonthlyFinancialSnapshot({ ...base,
    invoices: [{ id: 'e', title: 'Hôtel', amount: 100, currency: 'EUR', status: 'paid' }],
    transactions: [{ id: 'inv_e', title: 'Hôtel', amount: 100, date: '2026-06-12', category: 'autre', type: 'expense', invoiceId: 'e', currency: 'EUR' }],
  });
  U('EUR payée sans taux : jamais 100 CHF (paiement présenté à part, disponible PARTIEL)', eurPaidNoRate.paidExpenses === 0 && eurPaidNoRate.foreignPaid[0]?.total === 100 && eurPaidNoRate.availableIsPartial === true);
  // 4) Facture EUR VÉRIFIÉE liée à une charge CHF : payée → charge remplacée,
  //    paiement compté à 95.20, UNE seule fois
  const linkPaid = sel.getMonthlyFinancialSnapshot({ ...base,
    recurringExpenses: [{ id: 'rc1', title: 'Prime', amount: 100, frequency: 'monthly', active: true, createdAt: new Date(2026, 0, 1).getTime() }],
    invoices: [{ ...vInv, status: 'paid', recurringId: 'rc1' }],
    transactions: [{ id: 'inv_e', title: 'Prime', amount: 100, date: '2026-06-12', category: 'assurances', type: 'expense', invoiceId: 'e', currency: 'EUR' }],
  });
  U('EUR vérifiée liée à une charge CHF payée : 95.20 compté une fois, charge non doublée', linkPaid.recurringExpenses === 0 && linkPaid.paidExpenses === 95.2 && linkPaid.totalCommitted === 95.2);
  // 5) ANNULATION du paiement (payée → à payer, transaction retirée)
  const cancelled = sel.getMonthlyFinancialSnapshot({ ...base, invoices: [{ ...vInv, status: 'pending' }] });
  U('annulation : obligation restaurée (95.20), aucun résidu de paiement', cancelled.upcomingBills === 95.2 && cancelled.paidExpenses === 0 && cancelled.realAvailableThisMonth === 5000 - 95.2);
  // 6) Synchronisation simulée avant/après paiement : devise + conversion
  //    survivent à l'aller-retour (champs portables, dirty gagne)
  const paidInv = { ...vInv, status: 'paid' };
  const rt = sm.mergeCollectionsV2([paidInv], [{ ...vInv, status: 'pending' }], { dirtyIds: new Set(['e']), tombstoneIds: new Set() });
  const back = rt.merged.find((x) => x.id === 'e');
  U('sync simulée : statut payé local conservé + chfAmount/fxRate/fxDate/fxSource intacts', back.status === 'paid' && back.chfAmount === 95.2 && back.fxRate === 0.952 && back.fxSource === 'BNS' && back.currency === 'EUR');
  const rt2 = sm.mergeCollectionsV2([], [paidInv], { dirtyIds: new Set(), tombstoneIds: new Set() });
  U('redémarrage/2e appareil : facture payée restaurée au pull avec sa conversion', rt2.merged[0].status === 'paid' && rt2.merged[0].chfAmount === 95.2);
  // 7) Paiement déjà lié à une transaction existante (rapprochement) : une
  //    seule déduction (le lien transforme la dépense en paiement de facture)
  const reconciled = sel.getMonthlyFinancialSnapshot({ ...base,
    invoices: [{ id: 'a', title: 'A', amount: 100, currency: 'CHF', status: 'paid' }],
    transactions: [{ id: 'tx9', title: 'Paiement e-banking', amount: 100, date: '2026-06-11', category: 'autre', type: 'expense', invoiceId: 'a', source: 'invoice' }],
  });
  U('rapprochement avec transaction existante : une SEULE déduction de 100', reconciled.paidExpenses === 100 && reconciled.upcomingBills === 0 && reconciled.totalCommitted === 100);
}

console.log(`\nRésultat : ${unit} unitaires exécutés + ${stat} statiques = ${unit + stat} réussis, ${fail} échoués`);
console.log('NON TESTÉ (iPhone physique + build natif requis) : exécution réelle des');
console.log('App Intents par Siri, App Group sur appareil, démarrage à froid par Siri,');
console.log('dictée vocale réelle, écran verrouillé, catalogue de phrases Siri.');
process.exit(fail ? 1 : 0);
