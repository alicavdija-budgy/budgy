#!/usr/bin/env node
/**
 * BUDGY v4.0 — TESTS FONCTIONNELS DU MOTEUR FINANCIER RÉEL.
 * Transpile src/stores/selectors.ts (tsc) puis EXÉCUTE getMonthlyFinancialSnapshot
 * sur des scénarios chiffrés — aucune formule recopiée dans le test.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failed = 0;
const check = (name, ok, extra = '') => {
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
};

execSync(
  'npx tsc src/stores/selectors.ts --outDir /tmp/budgy-engine --module esnext --target es2020 --moduleResolution bundler --skipLibCheck --noResolve 2>/dev/null || true',
  { cwd: root, stdio: 'ignore' },
);
const { getMonthlyFinancialSnapshot } = await import('/tmp/budgy-engine/selectors.js');

const NOW = new Date(2026, 10, 15); // 15 novembre 2026
const D = (day, m = 10, y = 2026) => `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const snap = (i) => getMonthlyFinancialSnapshot({ incomes: [], transactions: [], recurringExpenses: [], invoices: [], debts: [], now: NOW, ...i });
const inc5000 = [{ id: 'i1', title: 'Salaire', amount: 5000, type: 'recurring', frequency: 'monthly' }];

console.log('— Scénario de référence (Test 12) —');
const base = {
  incomes: inc5000,
  transactions: [{ id: 't1', title: 'Courses', amount: 200, date: D(3), category: 'courses' }],
  recurringExpenses: [{ id: 'r1', title: 'Abo', amount: 100, category: 'abonnements', frequency: 'monthly', dayOfMonth: 1, active: true, createdAt: new Date(2026, 0, 1).getTime() }],
  invoices: [{ id: 'f1', title: 'Facture', amount: 300, status: 'pending', dueDate: D(25), createdAt: 1 }],
  debts: [{ id: 'd1', title: 'Crédit A', total: 5000, paid: 1000, monthlyPayment: 150 }],
};
let s = snap(base);
check('disponible initial = 4250', s.realAvailableThisMonth === 4250, `(${s.realAvailableThisMonth})`);

// Payer la facture → transaction liée + statut paid : disponible INCHANGÉ
s = snap({ ...base,
  transactions: [...base.transactions, { id: 'tf', title: 'Facture', amount: 300, date: D(16), invoiceId: 'f1', source: 'invoice' }],
  invoices: [{ ...base.invoices[0], status: 'paid' }],
});
check('facture payée → toujours 4250 (remplacement)', s.realAvailableThisMonth === 4250, `(${s.realAvailableThisMonth})`);

// Payer l'abonnement (occurrence) → toujours 4250
const paidAbo = { ...base.recurringExpenses[0], paymentHistory: [{ date: D(16), amount: 100, transactionId: 'tr1' }] };
s = snap({ ...base,
  transactions: [...base.transactions, { id: 'tr1', title: 'Abo', amount: 100, date: D(16), recurringId: 'r1', source: 'recurring' }],
  recurringExpenses: [paidAbo],
});
check('abonnement payé → toujours 4250', s.realAvailableThisMonth === 4250, `(${s.realAvailableThisMonth})`);

// Rembourser la dette (lié debtId) → toujours 4250
s = snap({ ...base,
  transactions: [...base.transactions, { id: 'td', title: 'Crédit A', amount: 150, date: D(16), debtId: 'd1', source: 'debt', category: 'dettes' }],
});
check('dette remboursée → toujours 4250', s.realAvailableThisMonth === 4250, `(${s.realAvailableThisMonth})`);

// Dépense Siri 25 (positive) → 4225
s = snap({ ...base, transactions: [...base.transactions, { id: 'ts', title: 'Migros', amount: 25, date: D(16), source: 'siri', type: 'expense' }] });
check('dépense Siri 25 → 4225', s.realAvailableThisMonth === 4225, `(${s.realAvailableThisMonth})`);

// Revenu ponctuel 500 reçu → 4750
s = snap({ ...base, transactions: [...base.transactions, { id: 'ti', title: 'Prime', amount: 500, date: D(16), type: 'income' }] });
check('revenu ponctuel +500 → 4750 (5000+500 ressources)', s.realAvailableThisMonth === 4750, `(${s.realAvailableThisMonth})`);

console.log('— Charges annuelles / semestrielles : exigible ≠ moyenne —');
const annual = { id: 'ra', title: 'Assurance', amount: 1200, category: 'assurances', frequency: 'yearly', dayOfMonth: 15, active: true, createdAt: new Date(2026, 0, 15).getTime() };
s = snap({ incomes: inc5000, recurringExpenses: [annual], now: new Date(2026, 10, 15) }); // novembre ≠ mois d'échéance
check('annuelle 1200 : 0 exigible hors mois d\'échéance (dispo 5000)', s.realAvailableThisMonth === 5000, `(${s.realAvailableThisMonth})`);
check('annuelle 1200 : moyenne budgétaire = 100', Math.abs(s.recurringMonthlyAvg - 100) < 0.01, `(${s.recurringMonthlyAvg})`);
s = snap({ incomes: inc5000, recurringExpenses: [annual], now: new Date(2027, 0, 20) }); // janvier = échéance
check('annuelle 1200 : 1200 exigible SON mois (dispo 3800)', s.realAvailableThisMonth === 3800, `(${s.realAvailableThisMonth})`);
const semi = { ...annual, id: 'rs', frequency: 'semiannual', amount: 600 };
s = snap({ incomes: inc5000, recurringExpenses: [semi], now: new Date(2026, 6, 10) }); // juillet = +6 mois
check('semestrielle 600 exigible à +6 mois (dispo 4400)', s.realAvailableThisMonth === 4400, `(${s.realAvailableThisMonth})`);

console.log('— Hebdomadaire : occurrences individuelles —');
const weekly = { id: 'rw', title: 'Femme de ménage', amount: 50, category: 'maison', frequency: 'weekly', dayOfMonth: 1, active: true, createdAt: new Date(2026, 0, 1).getTime() };
s = snap({ incomes: inc5000, recurringExpenses: [weekly] });
check('hebdo 50 : 4 occurrences dues = 200 (dispo 4800)', s.realAvailableThisMonth === 4800, `(${s.realAvailableThisMonth})`);
const weeklyPaid1 = { ...weekly, paymentHistory: [{ date: D(2), amount: 50, transactionId: 'w1' }] };
s = snap({ incomes: inc5000, recurringExpenses: [weeklyPaid1], transactions: [{ id: 'w1', title: 'Ménage', amount: 50, date: D(2), recurringId: 'rw', source: 'recurring' }] });
check('hebdo : 1 occurrence payée → 3 restent dues (dispo 4800 inchangé)', s.realAvailableThisMonth === 4800, `(${s.realAvailableThisMonth})`);
check('hebdo : PAS considérée payée pour tout le mois après 1 paiement', s.recurringExpenses === 150, `(${s.recurringExpenses})`);

console.log('— Dettes multiples : par identifiant —');
const debts2 = [
  { id: 'dA', title: 'Crédit A', total: 10000, paid: 0, monthlyPayment: 300 },
  { id: 'dB', title: 'Crédit B', total: 5000, paid: 0, monthlyPayment: 150 },
];
s = snap({ incomes: inc5000, debts: debts2 });
check('2 dettes : 450 engagés (dispo 4550)', s.realAvailableThisMonth === 4550, `(${s.realAvailableThisMonth})`);
s = snap({ incomes: inc5000, debts: debts2, transactions: [{ id: 'pA', title: 'Crédit A', amount: 300, date: D(10), debtId: 'dA', source: 'debt', category: 'dettes' }] });
check('payer A (300) ne règle PAS B : reste 150 dû (dispo 4550)', s.realAvailableThisMonth === 4550 && s.debtPayments === 150, `(dispo ${s.realAvailableThisMonth}, dettes ${s.debtPayments})`);

console.log('— Factures en retard / déficit / rapprochement —');
s = snap({ incomes: inc5000, invoices: [{ id: 'fo', title: 'Retard', amount: 300, status: 'pending', dueDate: D(5, 8), createdAt: 1 }] }); // échue en septembre
check('facture en RETARD (sept.) toujours due en novembre (dispo 4700)', s.realAvailableThisMonth === 4700, `(${s.realAvailableThisMonth})`);
s = snap({ incomes: [{ id: 'i2', title: 'Salaire', amount: 1000, type: 'recurring', frequency: 'monthly' }], invoices: [{ id: 'fd', title: 'Grosse facture', amount: 1250, status: 'pending', dueDate: D(20), createdAt: 1 }] });
check('déficit négatif affiché tel quel (−250)', s.realAvailableThisMonth === -250, `(${s.realAvailableThisMonth})`);
// Facture LIÉE à une charge (recurringId confirmé) → obligation comptée UNE fois
const lamal = { id: 'rl', title: 'LAMal', amount: 385, category: 'lamal', frequency: 'monthly', dayOfMonth: 28, active: true, createdAt: new Date(2026, 0, 1).getTime() };
s = snap({ incomes: inc5000, recurringExpenses: [lamal], invoices: [{ id: 'fl', title: 'LAMal', amount: 385, status: 'pending', dueDate: D(28), createdAt: 1, recurringId: 'rl' }] });
check('facture QR liée à la charge LAMal : 385 compté UNE fois (dispo 4615)', s.realAvailableThisMonth === 4615, `(${s.realAvailableThisMonth})`);
s = snap({ incomes: inc5000, recurringExpenses: [lamal], invoices: [{ id: 'fl2', title: 'LAMal', amount: 385, status: 'pending', dueDate: D(28), createdAt: 1 }] });
check('facture NON liée (non confirmée) : comptée séparément (dispo 4230)', s.realAvailableThisMonth === 4230, `(${s.realAvailableThisMonth})`);

console.log('— Navigation de mois / annulation —');
s = snap({ ...base, now: new Date(2026, 11, 10) }); // décembre : facture nov. impayée reste due, tx nov. hors mois
check('mois suivant : facture impayée reste due, dépenses nov. sorties (5000−100−300−150=4450)', s.realAvailableThisMonth === 4450, `(${s.realAvailableThisMonth})`);
s = snap({ ...base, now: new Date(2026, 9, 10) }); // octobre : facture nov. pas encore due ce mois... due <= endOfMonth(oct)=non
check('mois précédent : facture de novembre PAS due en octobre (5000−100−150=4750)', s.realAvailableThisMonth === 4750, `(${s.realAvailableThisMonth})`);
// Annulation d'un paiement d'occurrence : l'engagement revient
s = snap({ incomes: inc5000, recurringExpenses: [weekly], transactions: [] });
check('annulation du paiement hebdo : engagement 200 rétabli (dispo 4800)', s.realAvailableThisMonth === 4800, `(${s.realAvailableThisMonth})`);
// Héritage lastPaidMonth (anciennes données, sans historique)
const legacy = { ...base.recurringExpenses[0], lastPaidMonth: '2026-11' };
s = snap({ incomes: inc5000, recurringExpenses: [legacy], transactions: [{ id: 'tl', title: 'Abo', amount: 100, date: D(2), recurringId: 'r1' }] });
check('migration lastPaidMonth : charge payée exclue, paiement compté (4900)', s.realAvailableThisMonth === 4900, `(${s.realAvailableThisMonth})`);

console.log(`\nRésultat moteur : ${passed} réussis, ${failed} échoués`);
if (failed > 0) process.exit(1);
