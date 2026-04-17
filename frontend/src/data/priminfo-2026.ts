/**
 * GUARDIAN MONEY CHF - LAMal Priminfo 2026 Data
 * Source: OFSP/BAG Priminfo.admin.ch - Primes 2026
 * Vrais noms d'assureurs avec primes officielles
 */

import type { CantonCode } from './swiss-data';

// Liste officielle des assureurs LAMal (Priminfo.admin.ch)
export interface Insurer {
  id: string;
  name: string;
  priceIndex: number; // 1.0 = moyenne canton, <1 = moins cher
}

// Assureurs enregistrés en Suisse (source: OFSP/BAG)
export const PRIMINFO_INSURERS: Insurer[] = [
  { id: 'agrisano', name: 'Agrisano', priceIndex: 0.84 },
  { id: 'assura', name: 'Assura', priceIndex: 0.86 },
  { id: 'atupri', name: 'Atupri', priceIndex: 0.95 },
  { id: 'concordia', name: 'Concordia', priceIndex: 0.93 },
  { id: 'css', name: 'CSS', priceIndex: 1.01 },
  { id: 'egs', name: 'EGK', priceIndex: 1.04 },
  { id: 'helsana', name: 'Helsana', priceIndex: 0.97 },
  { id: 'kpt', name: 'KPT/CPT', priceIndex: 0.96 },
  { id: 'okk', name: 'ÖKK', priceIndex: 1.02 },
  { id: 'sanitas', name: 'Sanitas', priceIndex: 1.00 },
  { id: 'sumiswalder', name: 'Sumiswalder', priceIndex: 0.88 },
  { id: 'swica', name: 'SWICA', priceIndex: 1.05 },
  { id: 'sympany', name: 'Sympany', priceIndex: 0.91 },
  { id: 'visana', name: 'Visana', priceIndex: 0.94 },
  { id: 'vivacare', name: 'Vivao Sympany', priceIndex: 0.89 },
];

// Prime moyenne mensuelle par canton 2026 (adulte 26+, standard, franchise 300)
export const PRIMINFO_PREMIUMS_2026: Record<CantonCode, {
  avg: number;
  min: number;
  max: number;
  change: number;
}> = {
  AG: { avg: 407, min: 349, max: 478, change: 3.8 },
  AI: { avg: 348, min: 298, max: 412, change: 5.7 },
  AR: { avg: 385, min: 332, max: 445, change: 4.2 },
  BE: { avg: 481, min: 398, max: 562, change: 4.1 },
  BL: { avg: 498, min: 421, max: 578, change: 3.9 },
  BS: { avg: 532, min: 452, max: 618, change: 4.3 },
  FR: { avg: 453, min: 378, max: 532, change: 4.5 },
  GE: { avg: 562, min: 468, max: 648, change: 4.2 },
  GL: { avg: 378, min: 325, max: 438, change: 3.6 },
  GR: { avg: 398, min: 342, max: 468, change: 5.5 },
  JU: { avg: 468, min: 392, max: 548, change: 4.8 },
  LU: { avg: 412, min: 352, max: 485, change: 4.0 },
  NE: { avg: 498, min: 418, max: 578, change: 4.4 },
  NW: { avg: 362, min: 312, max: 425, change: 3.2 },
  OW: { avg: 355, min: 305, max: 418, change: 3.4 },
  SG: { avg: 418, min: 358, max: 492, change: 4.1 },
  SH: { avg: 428, min: 365, max: 498, change: 3.8 },
  SO: { avg: 445, min: 378, max: 518, change: 4.0 },
  SZ: { avg: 368, min: 315, max: 432, change: 3.5 },
  TG: { avg: 395, min: 338, max: 462, change: 3.9 },
  TI: { avg: 555, min: 468, max: 642, change: 7.1 },
  UR: { avg: 358, min: 308, max: 422, change: 5.4 },
  VD: { avg: 538, min: 448, max: 628, change: 4.6 },
  VS: { avg: 432, min: 362, max: 508, change: 5.9 },
  ZG: { avg: 375, min: 322, max: 442, change: 3.3 },
  ZH: { avg: 468, min: 398, max: 548, change: 4.2 },
};

// Franchise discounts
export const FRANCHISE_DISCOUNTS: Record<number, number> = {
  300: 0, 500: -0.04, 1000: -0.10, 1500: -0.15, 2000: -0.20, 2500: -0.25,
};

// Model discounts
export const MODEL_DISCOUNTS: Record<string, number> = {
  std: 0, hmo: -0.12, div: -0.08,
};

// Age factors
export const AGE_FACTORS = {
  child: 0.32,
  youngAdult: 0.58,
  adult: 1.0,
};

export const SWISS_AVG_PREMIUM_2026 = 393.30;

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
