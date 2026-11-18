/** Budgy · 3a planning and tax documents (official AFC/OFAS 2026–2027).
 * This is a preparation aid, never a tax assessment or a bank product offer.
 * Source: https://www.estv.admin.ch/fr/taux-interet-deductions-maximales-pilier-3a-impot-federal-direct
 */
export type TaxYear = 2026 | 2027;
export type PensionMode = 'unknown' | 'with_lpp' | 'without_lpp';
export const YEAR_LIMITS = {
  2026: { with_lpp: 7258, without_lpp: 36288 },
  2027: { with_lpp: 7373, without_lpp: 36864 },
} as const;

export const TAX_DOCUMENT_KEYS = [
  'salary', 'bank', 'investments', 'debts', 'pension', 'pillar3a',
  'health', 'work', 'transport', 'training', 'childcare', 'donations',
  'property', 'family', 'otherIncome', 'previous',
] as const;
export type TaxDocumentKey = typeof TAX_DOCUMENT_KEYS[number];

export interface DossierState {
  checked: TaxDocumentKey[];
  pension: PensionMode;
  // User-confirmed payment to 3a during the selected tax year, not OCR guesses.
  paid3a: string;
  // AHV/AVS-liable income, required only if no occupational pension.
  avsIncome: string;
}
export const EMPTY_DOSSIER: DossierState = {
  checked: [], pension: 'unknown', paid3a: '', avsIncome: '',
};

/** Strictly parse optional non-negative CHF value (no partial parseFloat). */
export function optionalCHF(text: string): number | null {
  const v = text.trim();
  if (!v || /^0([.,]0{1,2})?$/.test(v)) return 0;
  // Grouping must be valid: 1’234.50 is accepted; 1’2’34 is not.
  // This keeps the manual planner from silently transforming mistyped CHF.
  if (/[’'\s]/.test(v) &&
      !/^\d{1,3}(?:[’'\u00a0\u202f ]\d{3})+(?:[.,]\d{1,2})?$/.test(v)) return null;
  const compact = v.replace(/[’']/g, '').replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(compact)) return null;
  const n = Number(compact);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export interface Pillar3APlan {
  year: TaxYear;
  cap: number | null;
  remaining: number | null;
  paid: number | null;
  overLimit: boolean;
  reason: 'choose_pension' | 'need_avs_income' | 'invalid_amount' | 'ok';
}
export function planPillar3a(
  year: TaxYear,
  pension: PensionMode,
  paidRaw: string,
  avsIncomeRaw: string,
): Pillar3APlan {
  const blank = { year, cap: null, remaining: null, paid: null, overLimit: false };
  if (pension === 'unknown') return { ...blank, reason: 'choose_pension' };
  const paid = optionalCHF(paidRaw);
  if (paid === null) return { ...blank, reason: 'invalid_amount' };
  const annual = YEAR_LIMITS[year];
  if (!annual) return { ...blank, reason: 'invalid_amount' };
  let cap: number;
  if (pension === 'with_lpp') cap = annual.with_lpp;
  else {
    if (!avsIncomeRaw.trim()) return { ...blank, reason: 'need_avs_income' };
    const eligibleIncome = optionalCHF(avsIncomeRaw);
    if (eligibleIncome === null || eligibleIncome <= 0) {
      return { ...blank, reason: 'invalid_amount' };
    }
    cap = Math.min(annual.without_lpp, Math.floor(eligibleIncome * 0.2 * 100) / 100);
  }
  return {
    year, cap, paid,
    remaining: Math.max(0, Math.round((cap - paid) * 100) / 100),
    overLimit: paid > cap,
    reason: 'ok',
  };
}

export function isValidDossier(input: unknown): input is DossierState {
  if (!input || typeof input !== 'object') return false;
  const d = input as Partial<DossierState>;
  return Array.isArray(d.checked) && d.checked.every(
    x => typeof x === 'string' && TAX_DOCUMENT_KEYS.includes(x as TaxDocumentKey)
  ) && ['unknown','with_lpp','without_lpp'].includes(String(d.pension))
     && typeof d.paid3a === 'string' && d.paid3a.length <= 40
     && typeof d.avsIncome === 'string' && d.avsIncome.length <= 40;
}

/** Local signals only. A matching expense is NOT necessarily tax deductible. */
export interface TaxPreparationSignal {
  document: TaxDocumentKey;
  count: number;
  observedCHF: number;
}
const TAX_CATEGORY_HINTS: Record<string, TaxDocumentKey> = {
  sante: 'health', soins: 'health', medical: 'health', pharmacie: 'health',
  garde: 'childcare', garde_enfants: 'childcare', childcare: 'childcare', creche: 'childcare',
  dons: 'donations', donation: 'donations', donations: 'donations',
  formation: 'training', perfectionnement: 'training', education: 'training',
  deplacement: 'transport', deplacements: 'transport', transport: 'transport',
  frais_professionnels: 'work',
};
export function findTaxPreparationSignals(
  transactions: ReadonlyArray<any> | null | undefined,
  year: TaxYear,
): TaxPreparationSignal[] {
  const acc = new Map<TaxDocumentKey, TaxPreparationSignal>();
  for (const tx of transactions || []) {
    if (!tx || (tx.type && tx.type !== 'expense')) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(tx.date || ''))) continue;
    if (Number(String(tx.date).slice(0, 4)) !== year) continue;
    if (tx.currency && String(tx.currency).toUpperCase() !== 'CHF') continue;
    if (/^(invoice|recurring|transfer)$/i.test(String(tx.source || ''))) continue;
    const cat = String(tx.category || '')
      .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[\s-]+/g, '_');
    const document = TAX_CATEGORY_HINTS[cat];
    const amount = Number(tx.amount);
    if (!document || !Number.isFinite(amount) || amount <= 0) continue;
    const prior = acc.get(document) || { document, count: 0, observedCHF: 0 };
    acc.set(document, {
      document, count: prior.count + 1,
      observedCHF: Math.round((prior.observedCHF + amount) * 100) / 100,
    });
  }
  return Array.from(acc.values()).sort((a, b) => b.observedCHF - a.observedCHF);
}
