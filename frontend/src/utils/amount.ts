/**
 * TÂCHE 1 — Normalisation UNIQUE des montants CHF (toute l'app).
 *
 * Accepte : 123.45 · 123,45 · 1'234.50 · 1\u2019234.50 · 1 234,50 ·
 * 1\u00A0234,50 · "CHF 123.45". Refuse : NaN, négatifs, non finis, formats
 * ambigus (plus de 2 décimales, double séparateur décimal). Jamais de
 * parseFloat partiel ("12abc" → rejeté), jamais de 0 inventé.
 */
export function normalizeChfAmount(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? Math.round(raw * 100) / 100 : null;
  }
  let s = String(raw).trim();
  if (!s) return null;
  // Préfixe/suffixe devise tolérés ("CHF 123.45", "123.45 CHF", "Fr. 12")
  s = s.replace(/^(CHF|Fr\.?|SFr\.?)\s*/i, '').replace(/\s*(CHF|Fr\.?|SFr\.?)$/i, '').trim();
  // Séparateurs de MILLIERS suisses : apostrophes (droite/typographique) et
  // espaces (normale, insécable, fine) — uniquement entre groupes de chiffres.
  s = s.replace(/(\d)[\u0027\u2019\u00A0\u202F ](?=\d{3}(\D|$))/g, '$1');
  if (/[\u0027\u2019\u00A0\u202F ]/.test(s)) return null; // séparateur mal placé → ambigu
  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;
  if (dots + commas > 1) {
    // Deux séparateurs (ex. 1.234,50) : le DERNIER est décimal, les autres
    // doivent former des GROUPES DE MILLIERS stricts (1 à 3 chiffres, puis
    // groupes de 3). 1.2,34 ou 12.3,45 → AMBIGU, rejeté (jamais converti
    // silencieusement).
    if (dots >= 1 && commas >= 1) {
      const dec = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
      const intRaw = s.slice(0, dec);
      if (!/^\d{1,3}([.,]\d{3})*$/.test(intRaw)) return null;
      s = `${intRaw.replace(/[.,]/g, '')}.${s.slice(dec + 1)}`;
    } else {
      return null; // 1.234.567 sans décimale identifiable → ambigu
    }
  } else {
    s = s.replace(',', '.');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const v = parseFloat(s);
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
}
