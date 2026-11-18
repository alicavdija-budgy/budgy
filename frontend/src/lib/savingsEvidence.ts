/** Evidence-only scenario builder for Budgy AI Optimizer.
 * No hypothetical LAMal/tax/3a savings, no prices invented, no records altered.
 * Monthly equivalents for active subscriptions, and actual expenses in last
 * three calendar months. Amounts are SCENARIOS, not verified offers.
 */
export interface SavingsEvidence {
  category: 'subscription' | 'telco' | 'food';
  currentMonthly: number;
  scenarioMonthly: number;
  observedTransactions: number;
}
const round2 = (v: number) => Math.round(v * 100) / 100;
const money = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
function monthlyAmount(r: any): number {
  const a = money(r.amount);
  const frequency = String(r.frequency || 'monthly').toLowerCase();
  return frequency === 'weekly' ? a * 52 / 12 :
    frequency === 'quarterly' ? a / 3 :
    frequency === 'semiannual' ? a / 6 :
    frequency === 'yearly' || frequency === 'annual' ? a / 12 :
    a;
}
export function buildSavingsEvidence(transactions: any[], recurring: any[], at: Date = new Date()): SavingsEvidence[] {
  const max = at.getTime();
  const min = max - 90 * 24 * 3600 * 1000;
  const bills = (Array.isArray(recurring) ? recurring : [])
    .filter(r => r && r.active !== false && money(r.amount) > 0);
  let subscriptions = 0, telco = 0;
  for (const r of bills) {
    const title = String(r.title || '').toLowerCase();
    const category = String(r.category || '').toLowerCase();
    const amount = monthlyAmount(r);
    if (/(telecom|communication|internet|téléphone)/i.test(category) ||
        /(swisscom|sunrise|salt mobile|wingo|yallo|lebara|mobile|internet)/i.test(title)) telco += amount;
    else if (/(abonn|subscription|stream|entertainment|loisir|media)/i.test(category) ||
      /(netflix|spotify|disney|youtube premium|prime video|apple music)/i.test(title)) subscriptions += amount;
  }
  let food = 0;
  let foodCount = 0;
  const months = new Set<string>();
  for (const tx of Array.isArray(transactions) ? transactions : []) {
    if (!tx || tx.type === 'income' || tx.type === 'transfer') continue;
    if (['recurring','invoice'].includes(String(tx.source || ''))) continue;
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(tx.date || ''))) continue;
    const dt = new Date(String(tx.date).slice(0, 10) + 'T12:00:00Z').getTime();
    if (!Number.isFinite(dt) || dt < min || dt > max) continue;
    const amount = money(tx.amount);
    if (!amount) continue;
    const cat = String(tx.category || '').toLowerCase();
    months.add(String(tx.date).slice(0, 7));
    if (/(courses|restaurant|aliment|food|café|cafe|repas)/i.test(cat)) {
      food += amount;
      foodCount++;
    }
  }
  const monthsObserved = Math.max(1, Math.min(3, months.size));
  const foodMonthly = food / monthsObserved;
  const groups: Array<[SavingsEvidence['category'], number, number, number]> = [
    ['subscription', subscriptions, 0.10, bills.length],
    ['telco', telco, 0.10, bills.length],
    ['food', foodMonthly, 0.05, foodCount],
  ];
  return groups
    .filter(([_, amount]) => amount >= 20)
    .map(([category, amount, rate, count]) => ({
      category,
      currentMonthly: round2(amount),
      scenarioMonthly: round2(amount * rate),
      observedTransactions: count,
    }));
}
