#!/usr/bin/env node
/**
 * BUDGY 4.0 — Tests de stabilisation (P0 sélecteurs, P0 Siri, P1 menu Plus,
 * protections Apple). Garde-fous de régression : chaque test correspond à un
 * bug réellement observé sur iPhone ou à un correctif à ne jamais reperdre.
 */
import { readFileSync, existsSync } from 'fs';

let passed = 0, failed = 0;
const ok = (name, cond) => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
};
const read = (p) => readFileSync(p, 'utf8');

console.log('— P0 Sélecteur de catégories (conflit de Modals natifs iOS) —');
const picker = read('src/components/CategoryGroupPicker.tsx');
ok('CategoryGroupPicker ne crée AUCUN Modal natif', !picker.includes('<Modal') && !/,\s*Modal\s*,/.test(picker));
ok('CategoryGroupPicker est un calque absolu (overlayRoot + absoluteFill)', picker.includes('overlayRoot') && picker.includes('absoluteFillObject'));
ok('CategoryGroupPicker retourne null quand invisible', picker.includes('if (!visible) return null'));
for (const f of ['app/more/budgets.tsx', 'app/more/recurring.tsx']) {
  const s = read(f);
  const pi = s.indexOf('<CategoryGroupPicker');
  const closeAfter = s.indexOf('</Modal>', pi);
  const openBetween = s.slice(pi, closeAfter).includes('<Modal');
  ok(`${f} : sélecteur rendu DANS le Modal du formulaire (une seule fenêtre native)`, pi !== -1 && closeAfter !== -1 && !openBetween);
}

console.log('— P0 Siri : la file ne doit JAMAIS être purgée au démarrage à froid —');
const bridge = read('src/services/widgetBridge.ts');
const refreshBody = bridge.slice(bridge.indexOf('export async function refreshWidgetSnapshot'), bridge.indexOf('function clearWidgetDataSync'));
ok('refreshWidgetSnapshot n’appelle PLUS clearWidgetDataSync', !refreshBody.includes('clearWidgetDataSync'));
ok('refreshWidgetSnapshot ne retire NI la file NI la route Siri', !refreshBody.includes('PENDING_KEY') && !refreshBody.includes('ROUTE_KEY'));
ok('refreshWidgetSnapshot attend l’hydratation du store (cold start Siri)', refreshBody.includes('hasHydrated'));
ok('Sans session hydratée : seuls les CHIFFRES (snapshot) sont retirés', refreshBody.includes('storage.remove(SNAPSHOT_KEY)'));
ok('La purge totale reste disponible sur action explicite (clearWidgetData)', bridge.includes('export async function clearWidgetData') && bridge.includes('clearWidgetDataSync()'));
const sync = read('src/components/WidgetSync.tsx');
ok('WidgetSync libère pushedPid quand la file est vide (annulation/traitement)', sync.includes('pushedPid.current = null'));
const qa = read('app/quick-add.tsx');
ok('Annulation quick-add : la commande Siri en attente est retirée de la file', /onPress=\{async \(\) => \{[\s\S]*?resolvePendingExpense\(pendingId\)[\s\S]*?router\.back\(\)/.test(qa));
ok('Dépense Siri : montant POSITIF (convention moteur) + source siri', qa.includes("source === 'siri' ? 'siri' : 'manual'") && !/amount:\s*-/.test(qa));
ok('Anti-doublon absolu : id siri_<pid> + isAlreadyProcessed', qa.includes('siri_${pendingId}') && qa.includes('isAlreadyProcessed'));

console.log('— Protections Apple (ITMS-90896 / builds) —');
ok('BudgyIntentsExtension.swift présent', existsSync('targets/intents/BudgyIntentsExtension.swift'));
const ext = existsSync('targets/intents/BudgyIntentsExtension.swift') ? read('targets/intents/BudgyIntentsExtension.swift') : '';
ok('@main struct BudgyIntentsExtension: AppIntentsExtension', ext.includes('@main') && ext.includes('BudgyIntentsExtension: AppIntentsExtension'));
const appJson = JSON.parse(read('app.json'));
ok('Version marketing 4.0.0', appJson.expo.version === '4.0.0');
ok('Build iOS ≥ 89 (jamais réutiliser un numéro consommé)', parseInt(appJson.expo.ios.buildNumber, 10) >= 89);
const dialog = read('targets/intents/BudgyIntents.swift');
ok('Siri demande CONFIRMATION (jamais « c’est fait » avant enregistrement)', dialog.includes('confirmez') && !dialog.toLowerCase().includes("c'est fait"));

console.log('— P1 Menu Plus (structure éditoriale, 17 destinations réelles) —');
const more = read('app/(tabs)/more.tsx');
const wanted = ['budgets','incomes','recurring','invoices','debts','calendar','receipts','documents','export-pdf','twin','budgy-score','lamal','tax','subscription','security','settings','notifications'];
for (const id of wanted) ok(`ligne « ${id} » présente`, more.includes(`id: '${id}'`));
const features = read('src/config/features.ts');
const routeOf = (id) => (features.match(new RegExp(`id: '${id}'[^\\n]*route: '([^']+)'`)) || [])[1];
let allRoutes = true;
for (const id of wanted) {
  const r = routeOf(id);
  if (!r) { allRoutes = false; console.log(`     route manquante pour ${id}`); continue; }
  const file = r === '/pro' ? 'app/pro.tsx' : `app${r}.tsx`;
  if (!existsSync(file)) { allRoutes = false; console.log(`     fichier manquant: ${file}`); }
}
ok('les 17 routes existent réellement dans app/', allRoutes);
const secOrder = ['finances','documents','intelligence','suisse','account'];
let last = -1, ordered = true;
for (const k of secOrder) { const i = more.indexOf(`key: '${k}'`); if (i < last) ordered = false; last = i; }
ok('ordre exact des 5 sections', ordered && last > 0);
ok('lignes sans icônes ni sous-titres (chevron uniquement)', !more.includes('subtitleKey') && (more.match(/Ionicons name="/g) || []).length <= 2);
ok('garde FREE/PRO conservée (tier pro → /pro)', more.includes("f.tier === 'pro' && !isPro") && more.includes("router.push('/pro'"));
ok('statut Pro réel (StoreKit), badge ACTIF jamais codé en dur', more.includes('hasPremiumAccess') && more.includes('isPro &&'));
ok('prénom/initiales depuis la session (jamais codés en dur)', more.includes('user?.name'));
ok('pas de seconde barre de navigation locale', !more.includes('TabBar') && !more.includes('tabBar'));

console.log(`\nRésultat : ${passed} réussis, ${failed} échoués`);
if (failed > 0) process.exit(1);
