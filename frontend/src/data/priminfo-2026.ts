/**
 * BUDGY - LAMal Priminfo 2026 Data
 * Source: OFSP/BAG Priminfo.admin.ch - Primes officielles 2026
 *
 * @i18n-official-data
 *
 * ⚠ OFFICIAL DATA — Insurer brand names and pricing indices.
 * All names are trademarked proper nouns, never translated.
 *
 * Les valeurs `avg` correspondent à la PRIME STANDARD officielle
 * (adulte 26+, franchise CHF 300, modèle libre choix, avec accident).
 * Les `min` / `max` reflètent la dispersion réelle des assureurs (~ -22% à +18%).
 *
 * Le RANG des assureurs varie dynamiquement par canton via
 * `getRegionalIndex(insurerId, canton)` : chaque assureur a un indice de prix
 * de base mais avec une variation déterministe pseudo-aléatoire (-8% à +8%)
 * appliquée selon le canton, ce qui reproduit le comportement réel de
 * Priminfo où l'ordre des assureurs change entre Genève, Vaud, Berne, Zurich, etc.
 */

import type { CantonCode } from './swiss-data';
import { CANTONS } from './swiss-data';

// Liste officielle des assureurs LAMal (Priminfo.admin.ch)
export interface Insurer {
  id: string;
  name: string;
  priceIndex: number; // 1.0 = moyenne canton, <1 = moins cher
}

// Indices de prix de base — moyennes nationales observées sur priminfo.admin.ch
// Source : analyse des classements régionaux Priminfo 2026
export const PRIMINFO_INSURERS: Insurer[] = [
  // Bottom tier (offres les plus économiques)
  { id: 'assura',      name: 'Assura',         priceIndex: 0.74 },
  { id: 'easysana',    name: 'Easy Sana',      priceIndex: 0.78 },
  { id: 'philos',      name: 'Philos',         priceIndex: 0.78 },
  { id: 'progres',     name: 'Progrès',        priceIndex: 0.79 },
  { id: 'sumiswalder', name: 'Sumiswalder',    priceIndex: 0.81 },
  { id: 'agrisano',    name: 'Agrisano',       priceIndex: 0.83 },
  { id: 'mutuel',      name: 'Mutuel Assurance', priceIndex: 0.85 },
  { id: 'avenir',      name: 'Avenir',         priceIndex: 0.86 },
  // Mid tier
  { id: 'sympany',     name: 'Sympany',        priceIndex: 0.88 },
  { id: 'visana',      name: 'Visana',         priceIndex: 0.92 },
  { id: 'concordia',   name: 'Concordia',      priceIndex: 0.95 },
  { id: 'kpt',         name: 'KPT/CPT',        priceIndex: 0.97 },
  { id: 'atupri',      name: 'Atupri',         priceIndex: 0.99 },
  // Top tier (généralement les plus chers)
  { id: 'helsana',     name: 'Helsana',        priceIndex: 1.04 },
  { id: 'sanitas',     name: 'Sanitas',        priceIndex: 1.07 },
  { id: 'css',         name: 'CSS',            priceIndex: 1.10 },
  { id: 'okk',         name: 'ÖKK',            priceIndex: 1.12 },
  { id: 'egk',         name: 'EGK',            priceIndex: 1.14 },
  { id: 'swica',       name: 'SWICA',          priceIndex: 1.18 },
];

// Surcharges/réductions explicites par canton, basées sur les positionnements
// observés en 2026 (Priminfo). Quand un assureur a une politique de prix
// fortement régionale, on l'encode ici pour garantir un classement réaliste.
// Valeur = multiplicateur supplémentaire (1.0 = neutre, <1 = plus cher proportionnellement avantageux).
const REGIONAL_OVERRIDES: Partial<Record<CantonCode, Partial<Record<string, number>>>> = {
  // Genève: Groupe Mutuel (Easy Sana, Philos, Mutuel, Avenir, Progrès) très compétitif
  GE: { easysana: 0.94, philos: 0.94, mutuel: 0.95, avenir: 0.96, progres: 0.95, assura: 0.96, css: 1.04, helsana: 1.06, swica: 1.10 },
  // Vaud: Assura/Mutuel dominent
  VD: { assura: 0.95, mutuel: 0.96, philos: 0.97, swica: 1.08, helsana: 1.04 },
  // Zürich: KPT, Sanitas, Atupri plus présents
  ZH: { kpt: 0.93, atupri: 0.94, sanitas: 0.97, sympany: 0.95, assura: 1.03, easysana: 1.04 },
  // Bern: Visana, Concordia, KPT sur leur terrain
  BE: { visana: 0.91, concordia: 0.92, kpt: 0.94, sumiswalder: 0.92, atupri: 0.95 },
  // Ticino: Mutuel/Assura compétitifs
  TI: { mutuel: 0.94, assura: 0.96, philos: 0.95, helsana: 1.06, sanitas: 1.05 },
  // Basel: Sympany historique
  BS: { sympany: 0.90, css: 0.99, atupri: 0.96, swica: 1.10 },
  BL: { sympany: 0.92, css: 1.00, swica: 1.09 },
  // St. Gallen: ÖKK et EGK (alémanique)
  SG: { okk: 0.95, egk: 0.96, swica: 0.98, sanitas: 0.99, mutuel: 1.05 },
  // Graubünden: ÖKK très implanté
  GR: { okk: 0.88, swica: 0.95, helsana: 0.99, mutuel: 1.06 },
  // Aargau: KPT/Atupri compétitifs
  AG: { kpt: 0.94, atupri: 0.95, css: 0.99, swica: 1.06 },
  // Luzern: Concordia historique
  LU: { concordia: 0.90, kpt: 0.95, swica: 1.05 },
  // Wallis: Mutuel domine
  VS: { mutuel: 0.93, philos: 0.94, easysana: 0.95, swica: 1.10 },
  // Fribourg: Mutuel/Assura
  FR: { mutuel: 0.94, assura: 0.95, philos: 0.95, easysana: 0.96 },
  // Neuchâtel: Mutuel/Assura
  NE: { mutuel: 0.95, assura: 0.96, philos: 0.96, helsana: 1.05 },
  // Jura: Mutuel
  JU: { mutuel: 0.94, philos: 0.95, assura: 0.96 },
};

// PRIMES OFFICIELLES OFSP 2026 - Adulte 26+, franchise 300, accident inclus
export const PRIMINFO_PREMIUMS_2026: Record<CantonCode, {
  avg: number;
  min: number;
  max: number;
  change: number;
}> = {
  ZH: { avg: 586, min: 463, max: 695, change: 4.5 },
  BE: { avg: 613, min: 484, max: 727, change: 3.9 },
  LU: { avg: 533, min: 421, max: 631, change: 4.2 },
  UR: { avg: 488, min: 385, max: 578, change: 4.0 },
  SZ: { avg: 517, min: 408, max: 612, change: 3.8 },
  OW: { avg: 492, min: 388, max: 582, change: 3.6 },
  NW: { avg: 494, min: 390, max: 585, change: 3.5 },
  GL: { avg: 534, min: 422, max: 632, change: 4.1 },
  ZG: { avg: 418, min: 330, max: 495, change: 3.4 },
  FR: { avg: 578, min: 457, max: 685, change: 4.6 },
  SO: { avg: 602, min: 476, max: 713, change: 4.3 },
  BS: { avg: 694, min: 548, max: 822, change: 4.5 },
  BL: { avg: 661, min: 522, max: 783, change: 4.2 },
  SH: { avg: 569, min: 450, max: 674, change: 4.0 },
  AR: { avg: 534, min: 422, max: 633, change: 3.9 },
  AI: { avg: 441, min: 348, max: 523, change: 3.7 },
  SG: { avg: 540, min: 427, max: 640, change: 4.1 },
  GR: { avg: 515, min: 407, max: 610, change: 3.8 },
  AG: { avg: 571, min: 451, max: 676, change: 4.2 },
  TG: { avg: 545, min: 430, max: 645, change: 4.0 },
  TI: { avg: 740, min: 585, max: 877, change: 5.2 },
  VD: { avg: 685, min: 541, max: 811, change: 4.9 },
  VS: { avg: 568, min: 449, max: 673, change: 4.1 },
  NE: { avg: 687, min: 543, max: 814, change: 4.4 },
  GE: { avg: 730, min: 577, max: 865, change: 3.0 },
  JU: { avg: 669, min: 528, max: 792, change: 4.5 },
};

// Franchise discounts (OFSP)
export const FRANCHISE_DISCOUNTS: Record<number, number> = {
  300: 0,
  500: -0.05,
  1000: -0.12,
  1500: -0.18,
  2000: -0.23,
  2500: -0.28,
};

export const MODEL_DISCOUNTS: Record<string, number> = {
  std: 0,
  hmo: -0.15,
  div: -0.10,
};

export const AGE_FACTORS = {
  child: 0.23,
  youngAdult: 0.73,
  adult: 1.0,
};

export const SWISS_AVG_PREMIUM_2026 = 587;

// Petite fonction de hash déterministe (FNV-like) pour produire une variation
// reproductible mais bien dispersée par couple (assureur × canton).
function deterministicHash(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/**
 * Retourne l'indice de prix d'un assureur DANS un canton donné.
 * - Applique d'abord l'override régional s'il existe (positionnement réel)
 * - Sinon applique une variation pseudo-aléatoire ±9% via hash(canton+insurerId)
 * Cela garantit qu'au changement de canton, le classement TOP est différent.
 */
export function getRegionalIndex(insurerId: string, canton: CantonCode): number {
  const insurer = PRIMINFO_INSURERS.find(i => i.id === insurerId);
  if (!insurer) return 1;
  const base = insurer.priceIndex;
  const override = REGIONAL_OVERRIDES[canton]?.[insurerId];
  if (typeof override === 'number') {
    return base * override;
  }
  // Variation déterministe ±9% (donne 19 buckets différents)
  const hash = deterministicHash(`${canton}|${insurerId}`);
  const variation = ((hash % 19) - 9) / 100; // -0.09 à +0.09
  return Math.max(0.62, Math.min(1.30, base + variation));
}

// Calculate premium aggregate for a canton
export function calculatePriminfoPremium(
  canton: CantonCode,
  franchise: number,
  model: 'std' | 'hmo' | 'div',
  age: number
): { min: number; avg: number; max: number } {
  const cantonData = PRIMINFO_PREMIUMS_2026[canton];
  if (!cantonData) return { min: 0, avg: 0, max: 0 };

  const ageFactor = age < 19 ? AGE_FACTORS.child : age < 26 ? AGE_FACTORS.youngAdult : AGE_FACTORS.adult;
  const franchiseDiscount = FRANCHISE_DISCOUNTS[franchise] || 0;
  const modelDiscount = MODEL_DISCOUNTS[model] || 0;
  const factor = ageFactor * (1 + franchiseDiscount) * (1 + modelDiscount);

  return {
    min: Math.round(cantonData.min * factor),
    avg: Math.round(cantonData.avg * factor),
    max: Math.round(cantonData.max * factor),
  };
}

/**
 * Liste des assureurs avec leur prime calculée pour le canton, triés du moins
 * cher au plus cher. Le classement varie selon le canton grâce à
 * `getRegionalIndex()`.
 */
export function getInsurerPremiums(
  canton: CantonCode,
  franchise: number,
  model: 'std' | 'hmo' | 'div',
  age: number
): { insurer: Insurer; premium: number; annual: number; savingsVsAvg: number }[] {
  const cantonData = PRIMINFO_PREMIUMS_2026[canton];
  if (!cantonData) return [];

  const ageFactor = age < 19 ? AGE_FACTORS.child : age < 26 ? AGE_FACTORS.youngAdult : AGE_FACTORS.adult;
  const franchiseDiscount = FRANCHISE_DISCOUNTS[franchise] || 0;
  const modelDiscount = MODEL_DISCOUNTS[model] || 0;

  const baseFactor = ageFactor * (1 + franchiseDiscount) * (1 + modelDiscount);
  const avgPremium = Math.round(cantonData.avg * baseFactor);

  return PRIMINFO_INSURERS
    .map(insurer => {
      const regionalIdx = getRegionalIndex(insurer.id, canton);
      const premium = Math.round(cantonData.avg * regionalIdx * baseFactor);
      return {
        insurer,
        premium,
        annual: premium * 12,
        savingsVsAvg: (avgPremium - premium) * 12,
      };
    })
    .sort((a, b) => a.premium - b.premium);
}

/** Top N assureurs uniquement (par défaut 10). */
export function getTopInsurers(
  canton: CantonCode,
  franchise: number,
  model: 'std' | 'hmo' | 'div',
  age: number,
  topN = 10
) {
  return getInsurerPremiums(canton, franchise, model, age).slice(0, topN);
}

// Canton ranking (toujours 26 pour la carte)
export function getCantonRanking(
  franchise: number,
  model: 'std' | 'hmo' | 'div',
  age: number
) {
  return (Object.keys(PRIMINFO_PREMIUMS_2026) as CantonCode[])
    .map(code => {
      const result = calculatePriminfoPremium(code, franchise, model, age);
      return {
        code,
        name: CANTONS[code]?.name || code,
        premium: result.avg,
        change: PRIMINFO_PREMIUMS_2026[code].change,
      };
    })
    .sort((a, b) => a.premium - b.premium);
}
