/**
 * BUDGY — Frontend OCR fallback regex for Swiss receipts
 *
 * When the backend OCR/IA returns low-quality extraction, we run these
 * locally on the rawText to RESCUE basic fields (merchant, total, date, category)
 * BEFORE giving up and forcing manual entry.
 *
 * Pure functions, no dependencies, never throws.
 */

const SWISS_MERCHANTS_KEYWORDS: Record<string, string[]> = {
  alimentation: ['migros', 'coop', 'denner', 'aldi', 'lidl', 'volg', 'manor food', 'spar'],
  pharmacie: ['pharmacie', 'apotheke', 'farmacia', 'amavita', 'sun store', 'topwell'],
  restaurant: ['restaurant', 'mcdonald', 'burger king', 'subway', 'starbucks', 'kebab', 'pizza'],
  transport: ['cff', 'sbb', 'tpg', 'tl', 'tpf', 'zvv', 'rbs', 'shell', 'bp ', 'agrola', 'tamoil', 'avia'],
  loisirs: ['cinema', 'pathé', 'arena', 'netflix', 'spotify'],
  shopping: ['manor', 'globus', 'h&m', 'zara', 'uniqlo', 'ikea', 'jumbo', 'media markt', 'fnac', 'interdiscount'],
  sante: ['hopital', 'clinique', 'médecin', 'dentiste', 'osteopathe', 'physio'],
  internet: ['swisscom', 'salt', 'sunrise', 'upc', 'wingo', 'yallo', 'iway'],
};

const MERCHANT_NAMES: Record<string, string> = {
  migros: 'Migros',
  coop: 'Coop',
  denner: 'Denner',
  aldi: 'Aldi',
  lidl: 'Lidl',
  volg: 'Volg',
  manor: 'Manor',
  globus: 'Globus',
  swisscom: 'Swisscom',
  salt: 'Salt',
  sunrise: 'Sunrise',
  cff: 'CFF',
  sbb: 'SBB',
  tpg: 'TPG',
  tl: 'TL',
  amavita: 'Amavita',
  starbucks: 'Starbucks',
  ikea: 'IKEA',
  netflix: 'Netflix',
  spotify: 'Spotify',
};

export interface FallbackResult {
  merchant?: string;
  total?: number;
  currency?: 'CHF';
  date?: string;
  category?: string;
  matched: boolean;
}

/** Heuristic Swiss receipt parser used as a fallback when AI extraction is poor. */
export function parseSwissReceiptText(rawText: string | null | undefined): FallbackResult {
  if (!rawText || typeof rawText !== 'string') return { matched: false };
  const text = rawText;
  const lower = text.toLowerCase();
  const result: FallbackResult = { matched: false };

  // ── 1. Merchant detection ────────────────────────────────────────────
  for (const [keyword, displayName] of Object.entries(MERCHANT_NAMES)) {
    if (lower.includes(keyword)) {
      result.merchant = displayName;
      result.matched = true;
      break;
    }
  }

  // ── 2. Category detection ────────────────────────────────────────────
  for (const [category, keywords] of Object.entries(SWISS_MERCHANTS_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) {
      result.category = category;
      result.matched = true;
      break;
    }
  }

  // ── 3. Total amount detection (looks for "TOTAL", "MONTANT", "TTC", "CHF") ─
  const amountPatterns = [
    // "TOTAL CHF 12.50" or "TOTAL: 12.50"
    /total[^0-9]{0,20}(\d{1,5}[.,]\d{2})/i,
    /montant[^0-9]{0,20}(\d{1,5}[.,]\d{2})/i,
    /ttc[^0-9]{0,20}(\d{1,5}[.,]\d{2})/i,
    // "CHF 12.50" anywhere
    /chf\s*(\d{1,5}[.,]\d{2})/i,
    /(\d{1,5}[.,]\d{2})\s*chf/i,
  ];
  for (const pat of amountPatterns) {
    const m = text.match(pat);
    if (m && m[1]) {
      const num = parseFloat(m[1].replace(',', '.'));
      if (!isNaN(num) && num > 0 && num < 100000) {
        result.total = num;
        result.currency = 'CHF';
        result.matched = true;
        break;
      }
    }
  }

  // ── 4. Date detection (DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD) ───────────
  const datePatterns = [
    // 30.04.2026 or 30/04/2026
    /\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/,
    // 2026-04-30
    /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/,
  ];
  for (const pat of datePatterns) {
    const m = text.match(pat);
    if (m) {
      try {
        let y: number, mo: number, d: number;
        if (m[1].length === 4) {
          y = parseInt(m[1], 10);
          mo = parseInt(m[2], 10);
          d = parseInt(m[3], 10);
        } else {
          d = parseInt(m[1], 10);
          mo = parseInt(m[2], 10);
          y = parseInt(m[3], 10);
        }
        if (
          y >= 2020 && y <= 2099 &&
          mo >= 1 && mo <= 12 &&
          d >= 1 && d <= 31
        ) {
          result.date = `${y.toString().padStart(4, '0')}-${mo
            .toString()
            .padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
          result.matched = true;
          break;
        }
      } catch {}
    }
  }

  return result;
}

/**
 * Merge an AI extraction with the regex fallback. AI values take precedence
 * unless they are empty/falsy; in that case the fallback fills the gap.
 */
export function mergeOcrWithFallback(
  ai: { merchant?: string; total_amount?: number | string; date?: string; category?: string },
  rawText?: string | null
): { merchant?: string; total_amount?: number; date?: string; category?: string; rescued: boolean } {
  const fb = parseSwissReceiptText(rawText);
  const aiAmount =
    typeof ai.total_amount === 'string'
      ? parseFloat(ai.total_amount.replace(',', '.'))
      : ai.total_amount;
  const out: any = {
    merchant: ai.merchant || fb.merchant,
    total_amount:
      typeof aiAmount === 'number' && !isNaN(aiAmount) && aiAmount > 0
        ? aiAmount
        : fb.total,
    date: ai.date || fb.date,
    category: ai.category || fb.category,
  };
  const rescued =
    (!ai.merchant && !!fb.merchant) ||
    (!aiAmount && !!fb.total) ||
    (!ai.date && !!fb.date) ||
    (!ai.category && !!fb.category);
  return { ...out, rescued };
}
