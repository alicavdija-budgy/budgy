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
  // No decimal ambiguity or silently accepted negative values.
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
