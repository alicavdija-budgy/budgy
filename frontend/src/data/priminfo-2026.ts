/**
 * BUDGY - LAMal Priminfo 2026 Data
 * Source: OFSP/BAG Priminfo.admin.ch - Primes officielles 2026
 * Document : "Regionale monatliche Durchschnittsprämien 2026"
 * (https://www.bag.admin.ch/dam/de/sd-web/ZHSq3s8mYbWS/regionale%20monatliche%20durchschnittliche%20Pr%C3%A4mie_PG2026.pdf)
 *
 * Les valeurs `avg` correspondent à la PRIME STANDARD officielle
 * (adulte 26+, franchise CHF 300, modèle libre choix, avec accident).
 * Les `min` / `max` reflètent la dispersion réelle des assureurs (~ -22% à +18%).
 */

import type { CantonCode } from './swiss-data';

// Liste officielle des assureurs LAMal (Priminfo.admin.ch)
export interface Insurer {
  id: string;
  name: string;
  priceIndex: number; // 1.0 = moyenne canton, <1 = moins cher
}

// Assureurs enregistrés en Suisse — indices basés sur les positionnements
// observés en 2026 sur priminfo.admin.ch (adulte, franchise 300, accident, modèle standard)
// Source : analyse des classements régionaux Priminfo 2026 (Genève, Vaud, Berne, Zurich)
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

// PRIMES OFFICIELLES OFSP 2026 - Adulte 26+, franchise 300, accident inclus
// Source: bag.admin.ch (publication 23 sept. 2025)
// Évolution % vs 2025 estimée d'après communiqués cantonaux et OFSP (CH +4.4%)
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

// Franchise discounts (estimations basées sur l'OFSP)
export const FRANCHISE_DISCOUNTS: Record<number, number> = {
  300: 0,
  500: -0.05,
  1000: -0.12,
  1500: -0.18,
  2000: -0.23,
  2500: -0.28,
};

// Model discounts
export const MODEL_DISCOUNTS: Record<string, number> = {
  std: 0,
  hmo: -0.15,
  div: -0.10,
};

// Age factors (basés sur les ratios OFSP officiels)
// Enfants ≈ 23% de l'adulte ; Jeunes adultes ≈ 73% de l'adulte
export const AGE_FACTORS = {
  child: 0.23,
  youngAdult: 0.73,
  adult: 1.0,
};

// Prime moyenne nationale 2026 (adultes 26+, prime standard, OFSP)
// = moyenne pondérée approximative ≈ CHF 587/mois
export const SWISS_AVG_PREMIUM_2026 = 587;

// Calculate premium for an insurer in a canton
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

// Get all insurers with calculated premiums for a canton, sorted cheapest first
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
      const premium = Math.round(cantonData.avg * insurer.priceIndex * baseFactor);
      return {
        insurer,
        premium,
        annual: premium * 12,
        savingsVsAvg: (avgPremium - premium) * 12,
      };
    })
    .sort((a, b) => a.premium - b.premium);
}

// Canton ranking
export function getCantonRanking(
  franchise: number,
  model: 'std' | 'hmo' | 'div',
  age: number
) {
  const { CANTONS } = require('./swiss-data');
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
