/**
 * BUDGY — Local Voice Parser (fallback)
 *
 * Parsing local simple en français pour ajouter une dépense / revenu / charge
 * récurrente quand le backend IA est indisponible. Couvre les phrases courantes :
 *
 *   "ajoute 25 francs dépense à Migros"
 *   "j'ai dépensé 12.50 CHF au restaurant"
 *   "salaire 6500 CHF reçu"
 *   "abonnement Netflix 17.90 par mois"
 *
 * Pas d'IA, juste regex + heuristiques — garantit que Voice IA fonctionne
 * TOUJOURS, même si le serveur est down.
 */

export type VoiceIntent = 'expense' | 'income' | 'recurring' | 'unknown';

export interface ParsedVoice {
  intent: VoiceIntent;
  amount?: number;
  currency: 'CHF';
  merchant?: string;   // for expense
  source?: string;     // for income
  category?: string;
  title?: string;      // for recurring
  raw: string;
}

const CATEGORY_KEYWORDS: { cat: string; words: string[] }[] = [
  { cat: 'courses', words: ['migros', 'coop', 'denner', 'lidl', 'aldi', 'manor', 'épicerie', 'supermarché', 'courses'] },
  { cat: 'restaurants', words: ['restaurant', 'resto', 'pizzeria', 'café', 'starbucks', 'mcdo', 'mcdonald', 'kebab', 'bar', 'midi', 'déjeuner', 'dîner', 'souper'] },
  { cat: 'transports', words: ['cff', 'tpg', 'tpf', 'sbb', 'bus', 'train', 'tram', 'taxi', 'uber', 'parking', 'essence', 'station-service', 'shell', 'agrola', 'migrol'] },
  { cat: 'sante', words: ['pharmacie', 'médecin', 'docteur', 'dentiste', 'hôpital', 'amavita', 'sun store'] },
  { cat: 'logement', words: ['loyer', 'régie', 'hypothèque', 'charges'] },
  { cat: 'energie', words: ['électricité', 'gaz', 'sig', 'services industriels', 'chauffage'] },
  { cat: 'abonnements', words: ['netflix', 'spotify', 'apple', 'sunrise', 'salt', 'swisscom', 'youtube', 'icloud', 'amazon prime', 'disney'] },
  { cat: 'assurances', words: ['assurance', 'axa', 'helsana', 'css', 'visana', 'mutuelle', 'sympany', 'concordia'] },
  { cat: 'loisirs', words: ['cinéma', 'pathé', 'jeu', 'sport', 'salle', 'fitness'] },
];

const INCOME_KEYWORDS = ['salaire', 'reçu', 'paie', 'paye', 'remboursement', 'bonus', 'prime', 'dividende', 'loyer reçu'];
const RECURRING_KEYWORDS = ['par mois', 'mensuel', 'tous les mois', 'chaque mois', 'abonnement'];

function extractAmount(text: string): number | undefined {
  // CHF 25.50 / 25.50 CHF / 25 francs / fr. 25 / 25.- / 25,50
  const patterns = [
    /(\d{1,5}[.,]\d{1,2})\s*(?:chf|francs?|fr\.?|sfr)/i,
    /(?:chf|fr\.?|sfr)\s*(\d{1,5}[.,]\d{1,2})/i,
    /(\d{1,5})\s*(?:chf|francs?|fr\.?)/i,
    /(?:chf|fr\.?|sfr)\s*(\d{1,5})/i,
    /(\d{1,5}[.,]\d{2})\s*\.\-/i, // 25.50.-
    /(\d{1,5}[.,]\d{2})/,         // 25.50 plain
    /\b(\d{2,5})\b/,              // 25 plain integer
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) {
      const n = parseFloat(m[1].replace(',', '.'));
      if (!isNaN(n) && n > 0 && n < 1_000_000) return n;
    }
  }
  return undefined;
}

function detectCategory(text: string): { cat?: string; merchant?: string } {
  const lower = text.toLowerCase();
  for (const c of CATEGORY_KEYWORDS) {
    for (const w of c.words) {
      if (lower.includes(w)) {
        // Capitalize merchant name as shown
        const merchant = w.charAt(0).toUpperCase() + w.slice(1);
        return { cat: c.cat, merchant };
      }
    }
  }
  // Try "à/chez X" pattern
  const at = text.match(/(?:à|chez|au|aux|de)\s+([A-Z][A-Za-zÀ-ÿ\s-]{1,30})/);
  if (at && at[1]) return { merchant: at[1].trim() };
  return {};
}

/**
 * Parse a voice/text utterance locally. Returns a ParsedVoice or
 * { intent:'unknown', raw } if nothing identifiable was found.
 *
 * Safe: never throws.
 */
export function parseVoiceLocally(input: string): ParsedVoice {
  const raw = (input || '').trim();
  if (!raw) return { intent: 'unknown', currency: 'CHF', raw };
  const lower = raw.toLowerCase();

  const amount = extractAmount(raw);
  const { cat, merchant } = detectCategory(raw);

  const isIncome = INCOME_KEYWORDS.some((k) => lower.includes(k));
  const isRecurring = RECURRING_KEYWORDS.some((k) => lower.includes(k));

  if (isRecurring && amount) {
    return {
      intent: 'recurring',
      amount,
      currency: 'CHF',
      category: cat || 'abonnements',
      title: merchant || 'Abonnement',
      raw,
    };
  }
  if (isIncome && amount) {
    return {
      intent: 'income',
      amount,
      currency: 'CHF',
      source: merchant || (lower.includes('salaire') ? 'Salaire' : 'Revenu'),
      raw,
    };
  }
  if (amount) {
    return {
      intent: 'expense',
      amount,
      currency: 'CHF',
      merchant: merchant || 'Dépense',
      category: cat || 'autre',
      raw,
    };
  }
  return { intent: 'unknown', currency: 'CHF', raw };
}
