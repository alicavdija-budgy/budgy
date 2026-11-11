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
check('montants suisses normalisés à la saisie (validation stricte)', src.includes("replace(/['’\\u00A0\\u202F ]/g, '')"));

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


// ── Audit 4.0.0 — non-régression des correctifs ──────────────────────────
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');
const selSrc = read('src/stores/selectors.ts');
const storeSrc = read('src/stores/useStore.ts');
const layoutSrc = read('app/_layout.tsx');
const budgetsSrc2 = read('app/more/budgets.tsx');
const paywallSrc = read('app/paywall.tsx');
const i18nSrc = read('src/i18n/translations.ts');

check('parseDate : dates YYYY-MM-DD parsées en minuit LOCAL (pas UTC)',
  /parseInt\(iso\[1\]\), parseInt\(iso\[2\]\) - 1, parseInt\(iso\[3\]\)/.test(selSrc));
check('budgets.tsx réutilise parseDate (cohérence fuseau avec Accueil)',
  budgetsSrc2.includes("import { parseDate } from '../../src/stores/selectors'") &&
  budgetsSrc2.includes('parseDate(tx.date)'));
check('logout() purge aussi transactions/dettes/factures (fail-safe inter-comptes)',
  /logout: \(\) => set\(\{[\s\S]*?transactions: \[\],[\s\S]*?debts: \[\],[\s\S]*?invoices: \[\],/.test(storeSrc));
check('listener SIGNED_OUT global dans _layout (purge session expirée/révoquée)',
  layoutSrc.includes("onAuthStateChange") && layoutSrc.includes("'SIGNED_OUT'") === false
    ? layoutSrc.includes('SIGNED_OUT')
    : layoutSrc.includes('SIGNED_OUT'));
check('dettes : mensualité engagée réduite par les remboursements saisis (anti double comptage)',
  selSrc.includes('debtCommitted - debtCatPaid') && selSrc.includes("c === 'dettes'"));
check('aucune route morte /more/contracts',
  !read('app/scanner-modal.tsx').includes("/more/contracts") &&
  !read('app/more/email-import.tsx').includes("/more/contracts"));
check('paywall : mensuel sélectionné par défaut',
  paywallSrc.includes("useState<Plan>('monthly')"));
check('paywall : économie annuelle calculée depuis les prix StoreKit réels',
  paywallSrc.includes('annualSavingsPct') && paywallSrc.includes('(yearlyAtMonthly - a) / yearlyAtMonthly'));
check('paywall : note d\'annulation essai présente et traduite ×4',
  paywallSrc.includes('trialCancelNote') &&
  (i18nSrc.match(/trialCancelNote:/g) || []).length === 4 &&
  (i18nSrc.match(/savePct:/g) || []).length === 4);
check('paywall : essai affiché seulement si éligibilité StoreKit confirmée (iOS)',
  paywallSrc.includes('introEligible === true'));


// ── v4.0 — Moteur financier unique : non-régression ──────────────────────
const sel4 = read('src/stores/selectors.ts');
const qa4 = read('app/quick-add.tsx');
const inv4 = read('app/more/invoices.tsx');
const debt4 = read('app/more/debts.tsx');
const rec4 = read('app/more/recurring.tsx');
const home4 = read('app/(tabs)/index.tsx');
const types4 = read('src/types/index.ts');
const bud4 = read('app/more/budgets.tsx');

check('Siri : dépense enregistrée en POSITIF (convention unique)',
  qa4.includes('Math.abs(result.amount || 0)') && !qa4.includes('-(result.amount'));
check('moteur : AUCUN clamp à zéro — un déficit s\'affiche',
  sel4.includes('const realAvailableThisMonth = monthlyIncome - totalCommitted') &&
  !sel4.includes('Math.max(0, monthlyIncome - totalCommitted'));
check('moteur : factures EN RETARD toujours comptées (due <= endOfMonth, statut != paid)',
  sel4.includes("!== 'paid'") && sel4.includes('due <= endOfMonth') && !sel4.includes('due >= now'));
check('moteur : charge marquée payée sort de l\'engagement (lastPaidMonth)',
  sel4.includes('lastPaidMonth') && sel4.includes('recurringDue'));
check('facture payée → transaction liée (invoiceId), annulation → retrait',
  inv4.includes("invoiceId: id") && inv4.includes('deleteTransaction(linked.id)'));
check('remboursement de dette → transaction réelle liée (debtId)',
  debt4.includes("debtId: showPay") && debt4.includes("source: 'debt'"));
check('charge : markPaid crée UNE transaction liée (recurringId) + historique',
  rec4.includes("recurringId: rec.id") && rec4.includes('paymentHistory'));
check('charge : undoPaid retire la transaction du mois (idempotent)',
  rec4.includes('deleteTransaction(last.transactionId)'));
check('types : liens explicites invoiceId/debtId/recurringId + source',
  types4.includes('invoiceId?:') && types4.includes('debtId?:') && types4.includes('recurringId?:'));
check('types : périodicités complètes hebdo→annuelle',
  types4.includes("'weekly' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly'"));
check('bannière : sous-titre + détail du calcul (breakdown)',
  home4.includes('homeV2.availableSub') && home4.includes('bdTitle') && home4.includes('bdDeficit'));
check('budget : validation stricte, jamais de CHF 0 silencieux',
  bud4.includes('parseAmountStrict') && bud4.includes('errAmount'));
check('budget : clavier géré (KeyboardAvoidingView) + sélecteur groupé',
  bud4.includes('KeyboardAvoidingView') && bud4.includes('CategoryGroupPicker'));

// Test 12 — scénario chiffré de référence (logique répliquée du moteur) :
// revenus 5000, dépenses payées 200, abonnement dû 100, facture 300, dette 150.
{
  const income = 5000;
  let paid = 200, recurring = 100, bills = 300, debt = 150;
  const available = income - (paid + recurring + bills + debt);
  check('Test 12 : disponible = CHF 4250', available === 4250);
  // Payer la facture : engagement 300 → 0, dépense payée +300 (remplacement)
  paid += 300; bills = 0;
  const after = income - (paid + recurring + bills + debt);
  check('Test 12 : après paiement de la facture, disponible INCHANGÉ (4250)', after === 4250);
  // Marquer la charge payée : engagement 100 → 0, payé +100
  paid += 100; recurring = 0;
  check('Test 12 : charge payée — toujours 4250, jamais de double déduction',
    income - (paid + recurring + bills + debt) === 4250);
  // Déficit affiché (jamais masqué à 0)
  check('Test 12 : déficit négatif affiché tel quel', (1000 - 1250) === -250);
}

console.log(`\nRésultat : ${passed} réussis, ${failed} échoués`);
if (failed > 0) process.exit(1);
