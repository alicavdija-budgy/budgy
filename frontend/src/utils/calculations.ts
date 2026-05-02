/**
 * GUARDIAN MONEY CHF - Financial Calculations
 * Swiss tax calculations, LAMal premiums, predictions
 */

import { CANTONS, INSURERS, PILLAR_3A_LIMITS, type CantonCode } from '../data/swiss-data';

// Format number Swiss style
export const formatNumber = (n: number = 0, decimals: number = 0): string => {
  return Number(n).toLocaleString('fr-CH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

export const formatCHF = (n: number = 0): string => `CHF ${formatNumber(n)}`;

// Percentage calculation
export const pct = (a: number, b: number): number => (b > 0 ? Math.min(Math.round((a / b) * 100), 100) : 0);

/**
 * Swiss Federal Tax (IFD) calculation - Source: ESTV 2025
 */
export function calculateIFD(taxableIncome: number, married: boolean = false): number {
  const income = taxableIncome;
  
  if (married) {
    // Married rates (splitting)
    if (income < 28800) return 0;
    if (income < 51000) return income * 0.0077;
    if (income < 106000) return income * 0.066;
    return income * 0.115;
  } else {
    // Single rates
    if (income < 17800) return 0;
    if (income < 78100) return income * 0.0077;
    if (income < 176000) return income * 0.066;
    return income * 0.1155;
  }
}

/**
 * Cantonal Tax (ICC) calculation - approximation ±8%
 */
export function calculateICC(taxableIncome: number, canton: CantonCode): number {
  const cantonData = CANTONS[canton];
  if (!cantonData) return 0;
  return taxableIncome * (cantonData.taxRate / 100) * 0.90;
}

/**
 * Calculate taxable income from gross income
 */
export function calculateTaxableIncome(
  grossIncome: number,
  pillar3aContribution: number = 0,
  married: boolean = false
): number {
  // Social deductions: AVS 5.5% + ALV 1.1% + LPP 6.5% = 13%
  const socialDeductions = grossIncome * 0.13;
  
  // Professional expenses: max(3% of income, 2000)
  const professionalExpenses = Math.max(grossIncome * 0.03, 2000);
  
  // LAMal deduction
  const lamalDeduction = married ? 5200 : 2600;
  
  // 3rd pillar contribution (capped)
  const pillar3a = Math.min(pillar3aContribution, PILLAR_3A_LIMITS.employee);
  
  return Math.max(0, grossIncome - socialDeductions - professionalExpenses - lamalDeduction - pillar3a);
}

/**
 * Calculate total tax savings from 3rd pillar contribution
 */
export function calculatePillar3aSavings(
  grossIncome: number,
  pillar3aContribution: number,
  canton: CantonCode,
  married: boolean = false
): number {
  // Calculate taxes without 3a contribution
  const taxableWithout = calculateTaxableIncome(grossIncome, 0, married);
  const ifdWithout = calculateIFD(taxableWithout, married);
  const iccWithout = calculateICC(taxableWithout, canton);
  const totalWithout = ifdWithout + iccWithout;
  
  // Calculate taxes with 3a contribution
  const taxableWith = calculateTaxableIncome(grossIncome, pillar3aContribution, married);
  const ifdWith = calculateIFD(taxableWith, married);
  const iccWith = calculateICC(taxableWith, canton);
  const totalWith = ifdWith + iccWith;
  
  return Math.round(totalWithout - totalWith);
}

/**
 * LAMal Premium calculation
 */
export function calculateLamalPremium(
  canton: CantonCode,
  insurerId: string,
  model: 'std' | 'hmo' | 'div',
  franchise: number,
  age: number
): number {
  const cantonData = CANTONS[canton];
  const insurer = INSURERS.find(i => i.id === insurerId);
  
  if (!cantonData || !insurer) return 0;
  
  const basePremium = cantonData.lamalPremium;
  const insurerFactor = insurer.priceIndex[model] || insurer.priceIndex.std;
  
  // Age factor
  const ageFactor = age < 19 ? 0.32 : age < 26 ? 0.58 : 1.0;
  
  // Franchise discount (approx 1.8% per 100 CHF above 300)
  const franchiseDiscount = Math.max(0, (franchise - 300) * 0.018);
  
  return Math.round(basePremium * insurerFactor * ageFactor - franchiseDiscount);
}

/**
 * LAMal Subsidy calculation
 */
export function calculateLamalSubsidy(
  canton: CantonCode,
  grossIncome: number,
  married: boolean = false,
  children: number = 0
): number {
  const cantonData = CANTONS[canton];
  if (!cantonData) return 0;
  
  const threshold = cantonData.subsidyThreshold * (married ? 1.6 : 1) + children * 8000;
  
  // No subsidy if income exceeds threshold by 30%
  if (grossIncome > threshold * 1.3) return 0;
  
  const refPremium = cantonData.lamalPremium;
  const maxContribution = grossIncome * (grossIncome < threshold * 0.7 ? 0.08 : 0.10);
  const subsidy = Math.max(0, refPremium * 12 - maxContribution);
  
  if (grossIncome > threshold) {
    return Math.round(subsidy * (1 - (grossIncome - threshold) / (threshold * 0.3)) / 12);
  }
  
  return Math.round(subsidy / 12);
}

/**
 * Annual cost calculation for LAMal
 */
export function calculateAnnualLamalCost(
  premium: number,
  franchise: number,
  expectedMedicalCosts: number,
  subsidy: number = 0
): { premiumYear: number; copay: number; franchiseCost: number; total: number } {
  const premiumYear = (premium - subsidy) * 12;
  const franchiseCost = Math.min(expectedMedicalCosts, franchise);
  const copay = Math.min(Math.max(0, expectedMedicalCosts - franchise), 700) * 0.1;
  
  return {
    premiumYear,
    copay,
    franchiseCost,
    total: premiumYear + copay + franchiseCost,
  };
}

/**
 * Budgy Predict IA - Prediction algorithm
 */
export function predictMonthlyExpenses(
  historicalData: { month: string; amount: number; category: string }[],
  currentMonthSpent: number,
  dayOfMonth: number
): {
  predicted: number;
  confidence: number;
  range: [number, number];
  trend: 'up' | 'down' | 'stable';
} {
  if (historicalData.length < 3) {
    // Not enough data, use simple projection
    const daysInMonth = 30;
    const dailyRate = currentMonthSpent / Math.max(dayOfMonth, 1);
    const predicted = Math.round(dailyRate * daysInMonth);
    return {
      predicted,
      confidence: 0.3,
      range: [Math.round(predicted * 0.7), Math.round(predicted * 1.3)],
      trend: 'stable',
    };
  }
  
  // Calculate mean and standard deviation
  const amounts = historicalData.map(d => d.amount);
  const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const variance = amounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / amounts.length;
  const std = Math.sqrt(variance);
  
  // Calculate trend (linear regression)
  const n = amounts.length;
  const xMean = (n - 1) / 2;
  const trend = amounts.reduce((sum, val, i) => sum + (i - xMean) * (val - mean), 0) /
    amounts.reduce((sum, _, i) => sum + Math.pow(i - xMean, 2), 0);
  
  // Calculate current rhythm
  const daysInMonth = 30;
  const progress = dayOfMonth / daysInMonth;
  const expectedAtThisPoint = mean * progress;
  const rhythm = expectedAtThisPoint > 0 ? currentMonthSpent / expectedAtThisPoint : 1;
  const clampedRhythm = Math.max(0.5, Math.min(2.0, rhythm));
  
  // Bayesian projection
  const remainingProjection = mean * (1 - progress) * clampedRhythm;
  const predicted = Math.round(currentMonthSpent + remainingProjection + trend);
  
  // Confidence based on data quality
  const confidence = Math.min(0.95, 0.3 + historicalData.length * 0.1);
  
  // Calculate range
  const range: [number, number] = [
    Math.round(predicted - std * 0.7),
    Math.round(predicted + std * 0.7),
  ];
  
  return {
    predicted: Math.max(currentMonthSpent, predicted),
    confidence,
    range,
    trend: trend > 50 ? 'up' : trend < -50 ? 'down' : 'stable',
  };
}

/**
 * Anomaly detection using z-score
 */
export function detectAnomaly(
  currentSpent: number,
  expectedMean: number,
  std: number,
  progress: number
): { isAnomaly: boolean; zScore: number; urgency: 'low' | 'medium' | 'high' } {
  const adjustedStd = std * Math.sqrt(progress);
  const zScore = adjustedStd > 0 ? (currentSpent - expectedMean * progress) / adjustedStd : 0;
  
  return {
    isAnomaly: Math.abs(zScore) > 1.8,
    zScore,
    urgency: Math.abs(zScore) > 2.5 ? 'high' : Math.abs(zScore) > 1.8 ? 'medium' : 'low',
  };
}

/**
 * Budgy Score calculation (0-100)
 */
export function calculateBudgyScore(
  savingsRate: number,
  budgetsRespected: number,
  totalBudgets: number,
  anomaliesCount: number,
  subscriptionsVsBudget: number
): number {
  // Savings rate score (0-25)
  const savingsScore = savingsRate < 10 ? 7.5 : savingsRate < 20 ? 15 : 22.5;
  
  // Budget respect score (0-25)
  const budgetScore = totalBudgets > 0 ? (budgetsRespected / totalBudgets) * 25 : 12.5;
  
  // Anomalies score (0-25)
  const anomalyScore = Math.max(0, 25 - anomaliesCount * 5);
  
  // Subscription control score (0-25)
  const subScore = subscriptionsVsBudget < 0.3 ? 25 : subscriptionsVsBudget < 0.5 ? 18 : 10;
  
  return Math.round(savingsScore + budgetScore + anomalyScore + subScore);
}
