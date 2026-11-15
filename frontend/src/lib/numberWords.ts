/**
 * BUDGY — Montants dictés en toutes lettres (FR/DE/IT/EN).
 * @i18n-technical-file
 * Les chaînes de ce module sont des clés lexicales pour reconnaître des
 * nombres prononcés, PAS des messages d'interface à traduire via i18n.
 * Conserver les accents FR/DE/IT : les retirer casserait la reconnaissance.
 * 100 % pur (testable via Node). Utilisé par le parseur vocal local quand
 * aucun chiffre n'est présent : « vingt-cinq francs cinquante » → 25.50.
 * Règle stricte : en cas d'ambiguïté, retourner null (jamais de montant
 * inventé) — l'utilisateur confirmera dans /quick-add.
 */

const FR_WORDS: Record<string, number> = {
  'zero': 0, 'zéro': 0, 'un': 1, 'une': 1, 'deux': 2, 'trois': 3, 'quatre': 4,
  'cinq': 5, 'six': 6, 'sept': 7, 'huit': 8, 'neuf': 9, 'dix': 10,
  'onze': 11, 'douze': 12, 'treize': 13, 'quatorze': 14, 'quinze': 15,
  'seize': 16, 'vingt': 20, 'vingts': 20, 'trente': 30, 'quarante': 40,
  'cinquante': 50, 'soixante': 60,
  // Formes suisses romandes ET françaises
  'septante': 70, 'huitante': 80, 'octante': 80, 'nonante': 90,
};
const EN_WORDS: Record<string, number> = {
  'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6,
  'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10, 'eleven': 11, 'twelve': 12,
  'thirteen': 13, 'fourteen': 14, 'fifteen': 15, 'sixteen': 16,
  'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20,
  'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70,
  'eighty': 80, 'ninety': 90,
};
const DE_UNITS: Record<string, number> = {
  'null': 0, 'ein': 1, 'eins': 1, 'eine': 1, 'zwei': 2, 'drei': 3, 'vier': 4,
  'fuenf': 5, 'fünf': 5, 'sechs': 6, 'sieben': 7, 'acht': 8, 'neun': 9,
  'zehn': 10, 'elf': 11, 'zwoelf': 12, 'zwölf': 12, 'dreizehn': 13,
  'vierzehn': 14, 'fuenfzehn': 15, 'fünfzehn': 15, 'sechzehn': 16,
  'siebzehn': 17, 'achtzehn': 18, 'neunzehn': 19,
};
const DE_TENS: Record<string, number> = {
  'zwanzig': 20, 'dreissig': 30, 'dreißig': 30, 'vierzig': 40,
  'fuenfzig': 50, 'fünfzig': 50, 'sechzig': 60, 'siebzig': 70,
  'achtzig': 80, 'neunzig': 90,
};
const IT_UNITS: Record<string, number> = {
  'zero': 0, 'uno': 1, 'una': 1, 'un': 1, 'due': 2, 'tre': 3, 'quattro': 4,
  'cinque': 5, 'sei': 6, 'sette': 7, 'otto': 8, 'nove': 9, 'dieci': 10,
  'undici': 11, 'dodici': 12, 'tredici': 13, 'quattordici': 14,
  'quindici': 15, 'sedici': 16, 'diciassette': 17, 'diciotto': 18,
  'diciannove': 19,
};
const IT_TENS: Record<string, number> = {
  'venti': 20, 'trenta': 30, 'quaranta': 40, 'cinquanta': 50,
  'sessanta': 60, 'settanta': 70, 'ottanta': 80, 'novanta': 90,
};

/** Mot allemand composé : « fünfundzwanzig » → 25, « hundertzwanzig » → 120. */
function deWordValue(w: string): number | null {
  if (w in DE_UNITS) return DE_UNITS[w];
  if (w in DE_TENS) return DE_TENS[w];
  if (w === 'hundert') return 100;
  if (w === 'tausend') return 1000;
  // (ein)hundertX / (ein)tausendX
  for (const [mw, mv] of [['tausend', 1000], ['hundert', 100]] as [string, number][]) {
    const i = w.indexOf(mw);
    if (i >= 0) {
      const left = w.slice(0, i); const right = w.slice(i + mw.length);
      const lv = left ? deWordValue(left) : 1;
      const rv = right ? deWordValue(right.replace(/^und/, '')) : 0;
      if (lv !== null && rv !== null && lv > 0 && lv < mv) return lv * mv + rv;
    }
  }
  // Xund<ten> : fünfundzwanzig
  const i = w.indexOf('und');
  if (i > 0) {
    const unit = DE_UNITS[w.slice(0, i)];
    const ten = DE_TENS[w.slice(i + 3)];
    if (unit !== undefined && unit >= 1 && unit <= 9 && ten !== undefined) return ten + unit;
  }
  return null;
}

/** Mot italien composé : « venticinque » → 25, « ventuno » → 21, « cento » → 100. */
function itWordValue(w: string): number | null {
  if (w in IT_UNITS) return IT_UNITS[w];
  if (w in IT_TENS) return IT_TENS[w];
  if (w === 'cento') return 100;
  if (w === 'mille') return 1000;
  for (const [base, tv] of Object.entries(IT_TENS)) {
    const elided = base.slice(0, -1); // venti → vent (ventuno, ventotto)
    if (w.startsWith(base)) {
      const u = IT_UNITS[w.slice(base.length)];
      if (u !== undefined && u >= 1 && u <= 9) return tv + u;
    }
    if (w.startsWith(elided)) {
      const u = IT_UNITS[w.slice(elided.length)];
      if (u === 1 || u === 8) return tv + u; // ventuno / ventotto
    }
  }
  if (w.startsWith('cento')) {
    const r = itWordValue(w.slice(5));
    if (r !== null) return 100 + r;
  }
  return null;
}

const SKIP = new Set(['et', 'and', 'und', 'e', 'ed', 'de', 'di']);

/**
 * Parse un nombre dicté en toutes lettres (0–9999). Retourne null si un seul
 * mot n'est pas reconnu comme nombre (jamais d'approximation).
 */
export function parseAmountWords(text: string): number | null {
  const tokens = (text || '')
    .toLowerCase()
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !SKIP.has(w));
  if (tokens.length === 0) return null;
  let total = 0;
  let cur = 0;
  let any = false;
  for (const tok of tokens) {
    // Chiffres mélangés aux mots (« 25 francs ») acceptés tels quels
    if (/^\d{1,4}$/.test(tok)) { cur += parseInt(tok, 10); any = true; continue; }
    let v: number | null = null;
    if (tok in FR_WORDS) v = FR_WORDS[tok];
    else if (tok in EN_WORDS) v = EN_WORDS[tok];
    else v = deWordValue(tok) ?? itWordValue(tok);
    if (v === null || v === undefined) {
      if (tok === 'cent' || tok === 'cents' || tok === 'hundred') { cur = (cur || 1) * 100; any = true; continue; }
      if (tok === 'mille' || tok === 'thousand') { total += (cur || 1) * 1000; cur = 0; any = true; continue; }
      return null; // mot inconnu → AUCUNE devinette
    }
    // FR : « quatre vingt(s) » = 80 (multiplicatif, pas 4+20)
    if ((tok === 'vingt' || tok === 'vingts') && cur % 10 === 4 && cur >= 4) { cur = cur - 4 + 80; any = true; continue; }
    if (v >= 100) { total += (cur || 1) * (v === 100 ? 100 : v); cur = 0; any = true; continue; }
    cur += v;
    any = true;
  }
  const n = total + cur;
  return any && isFinite(n) && n >= 0 && n <= 999_999 ? n : null;
}

const CURRENCY_WORD = /\b(francs?|franken|franchi|franco|chf)\b/i;
const CENT_WORD = /\b(centimes?|rappen|centesimi|cents?)\b/gi;

/**
 * « vingt-cinq francs cinquante » → 25.50 — FR/DE/IT/EN.
 * Exige le mot « franc(s) » (ou équivalent) comme séparateur : sans lui et
 * sans chiffres, le texte est trop ambigu → null (confirmation manuelle).
 */
export function parseSpokenChf(text: string): number | null {
  const lower = (text || '').toLowerCase();
  const m = lower.match(CURRENCY_WORD);
  if (!m || m.index === undefined) return null;
  const before = lower.slice(0, m.index).trim();
  const after = lower.slice(m.index + m[0].length).replace(CENT_WORD, ' ').trim();
  // Partie entière : derniers mots avant « francs » qui forment un nombre
  const words = before.split(/\s+/).filter(Boolean);
  let whole: number | null = null;
  for (let i = Math.max(0, words.length - 6); i < words.length; i++) {
    const cand = parseAmountWords(words.slice(i).join(' '));
    if (cand !== null) { whole = cand; break; }
  }
  if (whole === null) return null;
  // Centimes éventuels juste après « francs » (0–99)
  let cents = 0;
  if (after) {
    const cw = after.split(/\s+/).filter((w) => w && !SKIP.has(w)).slice(0, 3);
    for (let len = Math.min(3, cw.length); len >= 1; len--) {
      const c = parseAmountWords(cw.slice(0, len).join(' '));
      if (c !== null && c >= 0 && c <= 99) { cents = c; break; }
    }
  }
  const amount = whole + cents / 100;
  return amount > 0 && amount < 1_000_000 ? Math.round(amount * 100) / 100 : null;
}
