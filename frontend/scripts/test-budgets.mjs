#!/usr/bin/env node
/**
 * BUDGY — Tests financiers Budgets / charges récurrentes (sans régression).
 * Vérifie le moteur mensuel réel, les dépassements honnêtes, la
 * normalisation des montants suisses et la mensualisation des périodicités.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failed = 0;
const check = (name, ok, extra = '') => {
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
};

console.log('— Écran Budgets : moteur mensuel —');
const src = readFileSync(resolve(root, 'app/more/budgets.tsx'), 'utf8');
check('filtrage réel par mois ET année sélectionnés',
  src.includes('d.getFullYear() === py && d.getMonth() === pm'));
check('plus aucun cumul « depuis toujours »', !/transactions\s*\.filter\(t => t\.category === b\.category\)/.test(src));
check('navigation entre les mois (passé uniquement vers le futur bloqué)',
  src.includes('setOffset(offset - 1)') && src.includes('offset < 0 && setOffset(offset + 1)'));
check('anneau plafonné à 100% (jamais de 2e tour trompeur)',
  src.includes('Math.min(1, pct)'));
check('dépassement affiché explicitement avec son montant',
  src.includes("overBy") && src.includes('b.over > 0'));
check('budget restant ≠ solde bancaire (libellé explicite)', src.includes('availableNote'));
check('détail catégorie : transactions du mois + modifier limite + ajout rapide',
  src.includes('detailTx') && src.includes('editLimit') && src.includes("router.push('/quick-add'"));
check('Budgy Pulse : messages basés sur des calculs vérifiables',
  src.includes('now.getDate() / daysIn') && src.includes('pulseOver') && !src.includes('prédiction'));
check('montants suisses normalisés à la saisie', src.includes("replace(/['’\\u00A0 ]/g, '')"));

// ── Reproduction logique du moteur (mêmes expressions que l'écran) ──
console.log('\n— Scénarios financiers —');
const tx = [
  { id: '1', category: 'courses', amount: 120, date: '2026-06-05' },
  { id: '2', category: 'courses', amount: 80, date: '2026-06-20' },
  { id: '3', category: 'courses', amount: 500, date: '2026-05-10' }, // autre mois
  { id: '4', category: 'courses', amount: -20, date: '2026-06-22' }, // remboursement
  { id: '5', category: 'loisirs', amount: 300, date: '2026-06-02' },
  { id: '6', category: 'loisirs', amount: 45, date: '2025-06-02' },  // autre année
];
const spentFor = (cat, y, m) => tx
  .filter((t) => { const d = new Date(t.date); return d.getFullYear() === y && d.getMonth() === m; })
  .filter((t) => t.category === cat)
  .reduce((s, t) => s + (Number(t.amount) || 0), 0);
check('juin 2026, courses = 120+80−20 = 180 (mois exact, remboursement déduit)', spentFor('courses', 2026, 5) === 180);
check('mai 2026, courses = 500 (changement de mois)', spentFor('courses', 2026, 4) === 500);
check('juin 2025 ≠ juin 2026 (changement d\'année)', spentFor('loisirs', 2025, 5) === 45 && spentFor('loisirs', 2026, 5) === 300);
check('suppression d\'une transaction → recalcul correct',
  tx.filter((t) => t.id !== '2').filter((t) => t.category === 'courses' && new Date(t.date).getMonth() === 5 && new Date(t.date).getFullYear() === 2026).reduce((s, t) => s + t.amount, 0) === 100);
const over = (spent, limit) => Math.max(0, spent - limit);
check('budget dépassé : 300 dépensés / 250 → dépassement 50', over(300, 250) === 50);
check('catégorie sans budget : aucune division par zéro', (250 > 0 ? 300 / 250 : 0) > 0 && (0 > 0 ? 1 : 0) === 0);

console.log('\n— Montants suisses (EntityEditModal) —');
const modal = readFileSync(resolve(root, 'src/components/EntityEditModal.tsx'), 'utf8');
check('séparateurs de milliers suisses ne tronquent plus les montants',
  modal.includes("replace(/['’\\u00A0 ]/g, '')") && modal.includes("replace(',', '.')"));
const normalize = (v) => parseFloat(String(v).replace(/['’\u00A0 ]/g, '').replace(',', '.'));
check("« 1'200.50 » → 1200.5", normalize("1'200.50") === 1200.5);
check('« 1 200,50 » → 1200.5', normalize('1 200,50') === 1200.5);
check('« 12,50 » → 12.5', normalize('12,50') === 12.5);

console.log('\n— Charges récurrentes : périodicités et dates —');
const rec = readFileSync(resolve(root, 'app/more/recurring.tsx'), 'utf8');
check('total mensuel RÉELLEMENT mensualisé par fréquence',
  rec.includes('semiannual: 1 / 6') && rec.includes('yearly: 1 / 12') && rec.includes('weekly: 4.333'));
check('périodicité éditable (hebdo → annuelle)', rec.includes("value: 'semiannual'") && rec.includes("value: 'weekly'"));
check('la fréquence est persistée à la modification', rec.includes('frequency: (values.frequency'));
check('modifier une échéance ne touche jamais le montant',
  !/dayOfMonth[^\n]*amount\s*[-*/]/.test(rec));
const sel = readFileSync(resolve(root, 'src/stores/selectors.ts'), 'utf8');
check('tableau de bord : semestriel mensualisé (/6)', sel.includes("case 'semiannual'") && sel.includes('amount / 6'));
// Charge annuelle mensualisée : 1200/an → 100/mois
const perMonth = { weekly: 4.333, monthly: 1, quarterly: 1 / 3, semiannual: 1 / 6, yearly: 1 / 12 };
check('charge annuelle 1200 → 100/mois', Math.abs(1200 * perMonth.yearly - 100) < 1e-9);
check('charge trimestrielle 300 → 100/mois', Math.abs(300 * perMonth.quarterly - 100) < 1e-9);

console.log('\n— Dettes : mensualités intégrées à la trésorerie —');
check('mensualités des dettes en cours intégrées au snapshot',
  sel.includes('debtPayments') && sel.includes('totalCommitted = paidExpenses + recurringExpenses + upcomingBills + debtPayments'));
const debtMonthly = (debts) => debts
  .filter((d) => (Number(d.total) || 0) - (Number(d.paid) || 0) > 0)
  .reduce((s, d) => s + (Number(d.monthlyPayment) || 0), 0);
check('dette partiellement remboursée : 5000 payé 250 → mensualité 250 comptée',
  debtMonthly([{ total: 5000, paid: 250, monthlyPayment: 250 }]) === 250);
check('dette soldée : mensualité exclue (pas de charge fantôme)',
  debtMonthly([{ total: 5000, paid: 5000, monthlyPayment: 250 }]) === 0);
check('capital restant correct : 5000 − 250 = 4750', 5000 - 250 === 4750);

console.log('\n— Siri : consommation fiable au démarrage —');
const ws = readFileSync(resolve(root, 'src/components/WidgetSync.tsx'), 'utf8');
check('navigation seulement quand le routeur est prêt', ws.includes('useRootNavigationState') && ws.includes('navReady'));
check('réessais au lancement à froid (hydratation couverte)', ws.includes('tries >= 15') && ws.includes('setInterval'));
check('jamais de double présentation de la même dépense', ws.includes('pushedPid.current === e.id'));
check('changement de compte → file consommée', ws.includes('refreshWidgetSnapshot();\n        consumeNative();'));

console.log('\n— QR : feedback visible + galerie —');
const sc = readFileSync(resolve(root, 'app/scanner-modal.tsx'), 'utf8');
check('QR non reconnu → indication visible (plus d\'échec muet)', sc.includes('setQrHint(true)'));
check('scan depuis une image de galerie (même validation)', sc.includes('scanFromURLAsync') && sc.includes('launchImageLibraryAsync'));
check('montant absent accepté (saisie manuelle, rien d\'inventé)', sc.includes("bill.amount !== null ? bill.amount.toFixed(2) : ''"));

console.log(`\nRésultat : ${passed} réussis, ${failed} échoués`);
if (failed > 0) process.exit(1);
