#!/usr/bin/env node
/**
 * Budgy Smart 4.0 — Tests du tableau de bord bento (écran Plus).
 *
 * 1. Tests numériques réels de src/services/bentoMetrics.ts (TS simple
 *    transformé en JS par retrait des annotations, importé via data-URL —
 *    même technique déterministe que test-twin.mjs).
 * 2. Contrats statiques : masquage réactif Accueil → Plus → Accueil,
 *    droits Pro via la source canonique hasPremiumAccess(), aucune
 *    duplication locale de la logique d'essai.
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

// ─── 1. Import réel de bentoMetrics.ts ─────────────────────────────────────
let src = read('src/services/bentoMetrics.ts');
src = src
  .replace(/export interface [\s\S]*?\n\}\n/g, '')
  .replace(/^type .*$/gm, '')
  .replace(/: NextCharge \| null/g, '')
  .replace(/: RecurringLike\[\]/g, '')
  .replace(/: InvoiceLike\[\]/g, '')
  .replace(/: \(s: string\) => Date \| null/g, '')
  .replace(/: \(d: Date, now: Date\) => number/g, '')
  .replace(/: number \| null/g, '')
  .replace(/: Date = new Date\(\)/g, ' = new Date()');
const mod = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
const { nextMonthlyChargeInDays, nearestPendingInvoiceDays } = mod;

console.log('\n— Charges fixes : prochaine échéance réelle —');
const R = (dayOfMonth, extra = {}) => ({ title: `d${dayOfMonth}`, dayOfMonth, active: true, frequency: 'monthly', ...extra });
const jan20 = new Date(2026, 0, 20); // janvier = 31 jours
check('échéance aujourd\'hui => 0 jour', nextMonthlyChargeInDays([R(20)], jan20)?.inDays === 0);
check('échéance plus tard ce mois => J+5', nextMonthlyChargeInDays([R(25)], jan20)?.inDays === 5);
check('passage au mois suivant (le 1er depuis le 20.01) => J+12',
  nextMonthlyChargeInDays([R(1)], jan20)?.inDays === 12);
check('la plus proche gagne (1er du mois suivant vs 22 du mois courant)',
  nextMonthlyChargeInDays([R(1), R(22)], jan20)?.title === 'd22');
const feb27 = new Date(2026, 1, 27); // février 2026 = 28 jours
check('jour 31 borné à la longueur du mois (février => le 28, J+1)',
  nextMonthlyChargeInDays([R(31)], feb27)?.inDays === 1);
const jan31 = new Date(2026, 0, 31);
check('31.01 → charge du 31 => due aujourd\'hui (J+0)',
  nextMonthlyChargeInDays([R(31)], jan31)?.inDays === 0);
check('31.01 → charge du 30 déjà passée => clamp 28 février (J+28)',
  nextMonthlyChargeInDays([R(30)], jan31)?.inDays === 28);
check('inactive ignorée', nextMonthlyChargeInDays([R(21, { active: false })], jan20) === null);
check('fréquence non mensuelle ignorée', nextMonthlyChargeInDays([R(21, { frequency: 'yearly' })], jan20) === null);
check('liste vide => null (état explicite, pas de valeur inventée)', nextMonthlyChargeInDays([], jan20) === null);

console.log('\n— Factures : prochaine échéance / retard explicite —');
const parseISO = (s) => { const d = new Date(s + 'T00:00:00'); return isNaN(d.getTime()) ? null : d; };
const daysUntil = (d, now) => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
const now = new Date(2026, 5, 15);
const inv = (dueDate) => ({ dueDate });
check('échéance future la plus proche', nearestPendingInvoiceDays([inv('2026-06-20'), inv('2026-06-17')], parseISO, daysUntil, now) === 2);
check('échéance aujourd\'hui => 0', nearestPendingInvoiceDays([inv('2026-06-15')], parseISO, daysUntil, now) === 0);
check('uniquement en retard => valeur négative (libellé « En retard »)',
  nearestPendingInvoiceDays([inv('2026-06-10'), inv('2026-05-01')], parseISO, daysUntil, now) === -5);
check('future prioritaire sur retard', nearestPendingInvoiceDays([inv('2026-06-10'), inv('2026-06-18')], parseISO, daysUntil, now) === 3);
check('date non exploitable => null', nearestPendingInvoiceDays([inv('n/a')], parseISO, daysUntil, now) === null);
check('aucune facture => null', nearestPendingInvoiceDays([], parseISO, daysUntil, now) === null);

// ─── 2. Contrats statiques Bento ────────────────────────────────────────────
const bento = read('src/components/BentoPlus.tsx');
const more = read('app/(tabs)/more.tsx');
const home = read('app/(tabs)/index.tsx');
const i18n = read('src/i18n/translations.ts');

console.log('\n— Masquage des montants : Accueil → Plus → Accueil —');
check('l\'Accueil persiste budgy.hideAmounts', home.includes("budgy.hideAmounts"));
check('BentoPlus lit la même clé budgy.hideAmounts', bento.includes("budgy.hideAmounts"));
check('BentoPlus resynchronise à CHAQUE focus (pas seulement au montage)',
  bento.includes('useFocusEffect'));
check('aucun flash de montants réels : cache de dernière valeur connue',
  bento.includes('lastKnownHide'));
check('plus de lecture unique au montage ([]) via useEffect',
  !/useEffect\(\(\) => \{\s*AsyncStorage.getItem\('budgy.hideAmounts'\)/.test(bento));

console.log('\n— Droits Pro : source canonique —');
check('BentoPlus utilise hasPremiumAccess()', bento.includes('s.hasPremiumAccess()'));
check('more.tsx (en-tête/avatar) utilise hasPremiumAccess()', more.includes('s.hasPremiumAccess()'));
check('plus de duplication trialEndsAt > Date.now() dans BentoPlus',
  !bento.includes('trialEndsAt'));
check('verrou Pro des outils redirige vers /pro',
  bento.includes("tier === 'pro' && !isPro") && bento.includes("router.push('/pro'"));

console.log('\n— Calculs & états explicites —');
check('charges fixes via métrique pure testée', bento.includes('nextMonthlyChargeInDays(recurringExpenses)'));
check('factures via métrique pure testée', bento.includes('nearestPendingInvoiceDays(pendingInvoices'));
check('retard affiché explicitement (plusV2.overdue)', bento.includes("t('plusV2.overdue')"));
check('budgets : dépenses du mois courant uniquement',
  bento.includes('d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()'));
check('revenus mensualisés via le moteur snapshot', bento.includes('snapshot.monthlyIncome'));
check('santé financière : composant canonique réutilisé', bento.includes('<FinancialHealthScore />'));
check('aucune valeur fictive (pas de 840 CHF, 96, +4 pts)',
  !/840|'96'|\+4 ?pts/.test(bento));
for (const lang of ['fr', 'en', 'de', 'it']) {
  const block = i18n.split('plusV2:')[1]?.split('moreHub:')[0] || '';
  check(`i18n plusV2.overdue présent (${lang})`, new RegExp(`${lang}: \\{[\\s\\S]*?overdue:`).test(block));
}

console.log(`\nRésultat : ${passed} réussis, ${failed} échoués`);
if (failed > 0) process.exit(1);
