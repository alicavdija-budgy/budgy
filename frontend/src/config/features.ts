/**
 * BUDGY v3.9.0 Build 74 — Central Feature Catalog (single source of truth).
 *
 * This file replaces scattered per-screen tier assumptions. Every navigation
 * item, every route guard, every gate should consult this table.
 *
 * Contract:
 *   - `tier: 'free'`  → open route (no paywall, no gate)
 *   - `tier: 'pro'`   → FREE user must hit paywall; PRO user opens route
 *
 * Apple Guideline 2.1(b) compliance: there is NO middle ground. No "1 free
 * usage" bypass. A Pro feature is Pro. Period.
 */

import type { Ionicons } from '@expo/vector-icons';

export type FeatureTier = 'free' | 'pro';

export type FeatureGroup =
  | 'tools'         // IA, Score, Predict, Radar
  | 'finance'       // Incomes, budgets, debts, invoices
  | 'documents'    // Receipts, binder, sharing
  | 'account'      // Cloud, security, prefs, notifications
  | 'help';        // Subscription, help, legal

export interface BudgyFeature {
  id: string;
  route: string;
  tier: FeatureTier;
  titleKey: string;
  subtitleKey?: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** UI accent color key (looked up in theme) — keeps palette centralised */
  accent: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' | 'pink' | 'gold' | 'purple' | 'teal' | 'cyan' | 'orange';
  group: FeatureGroup;
  /** Optional badge shown next to the title (NEW / BETA / PRO) */
  badge?: 'NEW' | 'BETA';
}

// ── Catalogue ────────────────────────────────────────────────────────────

export const FEATURES: BudgyFeature[] = [
  // Tools intelligents (PRO)
  { id: 'ai-optimizer',   route: '/more/ai-optimizer',        tier: 'pro',  titleKey: 'more.aiOptimizer',      subtitleKey: 'more.aiOptimizerSub',    icon: 'sparkles',            accent: 'pink',    group: 'tools' },
  { id: 'savings-radar',  route: '/more/savings-radar',       tier: 'pro',  titleKey: 'moreExt.savingsRadar',  subtitleKey: 'moreExt.savingsRadarSub', icon: 'radio',              accent: 'gold',    group: 'tools' },
  { id: 'budgy-score',    route: '/more/budgy-score',         tier: 'pro',  titleKey: 'moreExt.budgyScoreTitle',                                        icon: 'speedometer',         accent: 'gold',    group: 'tools' },
  { id: 'predict',        route: '/more/predict',             tier: 'pro',  titleKey: 'more.predict',           subtitleKey: 'more.predictSub',       icon: 'analytics',           accent: 'secondary', group: 'tools' },
  { id: 'calendar',       route: '/more/financial-calendar',  tier: 'pro',  titleKey: 'moreExt.calendarTitle',                                          icon: 'calendar',           accent: 'info',    group: 'tools' },
  { id: 'tax',            route: '/more/tax-optimizer',       tier: 'pro',  titleKey: 'more.taxOpt',            subtitleKey: 'more.taxOptSub',        icon: 'calculator',          accent: 'primary', group: 'tools' },
  { id: 'budgets',        route: '/more/budgets',             tier: 'pro',  titleKey: 'more.budgets',           subtitleKey: 'more.budgetsSub',       icon: 'wallet',              accent: 'warning', group: 'tools' },
  { id: 'investments',    route: '/more/investments',         tier: 'pro',  titleKey: 'more.investments',                                              icon: 'trending-up',        accent: 'success', group: 'tools' },
  { id: 'export-pdf',     route: '/more/export-pdf',          tier: 'pro',  titleKey: 'more.exportPdf',                                                icon: 'document-text',      accent: 'teal',    group: 'tools' },
  { id: 'email-import',   route: '/more/email-import',        tier: 'pro',  titleKey: 'more.emailImport',       subtitleKey: 'more.emailImportSub',   icon: 'mail-open',          accent: 'purple',  group: 'tools' },

  // Mes finances (FREE)
  { id: 'incomes',        route: '/more/incomes',             tier: 'free', titleKey: 'more.incomes',           subtitleKey: 'more.incomesSub',       icon: 'cash',                accent: 'success', group: 'finance' },
  { id: 'recurring',      route: '/more/recurring',           tier: 'free', titleKey: 'more.recurring',         subtitleKey: 'more.recurringSub',     icon: 'refresh',             accent: 'purple',  group: 'finance' },
  { id: 'debts',          route: '/more/debts',               tier: 'free', titleKey: 'more.debts',                                                    icon: 'card',                accent: 'error',   group: 'finance' },
  { id: 'invoices',       route: '/more/invoices',            tier: 'free', titleKey: 'more.invoices',          subtitleKey: 'more.invoicesSub',      icon: 'receipt',             accent: 'orange',  group: 'finance' },
  { id: 'lamal',          route: '/more/lamal-comparator',    tier: 'free', titleKey: 'moreExt.lamalTitle',     subtitleKey: 'moreExt.lamalSub',      icon: 'shield-checkmark',    accent: 'cyan',    group: 'finance' },

  // Documents & partage (mixed — FREE base, PRO family & OCR)
  { id: 'receipts',       route: '/more/receipts',            tier: 'free', titleKey: 'more.receipts',                                                 icon: 'images',              accent: 'purple',  group: 'documents' },
  { id: 'documents',      route: '/more/documents',           tier: 'free', titleKey: 'more.documents',                                                icon: 'folder-open',         accent: 'primary', group: 'documents' },
  { id: 'family',         route: '/more/family',              tier: 'pro',  titleKey: 'moreExt.familyTitle',    subtitleKey: 'moreExt.familySub',     icon: 'people-circle',       accent: 'pink',    group: 'documents' },

  // Compte & sécurité
  { id: 'cloud-sync',     route: '/more/cloud-sync',          tier: 'pro',  titleKey: 'more.cloudSync',         subtitleKey: 'more.cloudSyncSub',     icon: 'cloud-done',          accent: 'info',    group: 'account' },
  { id: 'security',       route: '/more/security',            tier: 'free', titleKey: 'more.security',          subtitleKey: 'more.securitySub',      icon: 'shield-checkmark',    accent: 'success', group: 'account' },
  { id: 'settings',       route: '/more/settings',            tier: 'free', titleKey: 'more.preferences',       subtitleKey: 'more.preferencesSub',   icon: 'settings',            accent: 'primary', group: 'account' },
  { id: 'notifications',  route: '/more/notifications',       tier: 'free', titleKey: 'featuresCatalog.notifications',                                icon: 'notifications',      accent: 'warning', group: 'account' },

  // Aide & informations
  { id: 'subscription',   route: '/paywall',                  tier: 'free', titleKey: 'more.subscription',                                             icon: 'flash',              accent: 'secondary', group: 'help' },
  { id: 'legal',          route: '/more/legal',               tier: 'free', titleKey: 'more.legal',             subtitleKey: 'more.legalSub',         icon: 'shield-half',         accent: 'info',    group: 'help' },
];

// ── Helpers ──────────────────────────────────────────────────────────────

export const FEATURE_BY_ID: Record<string, BudgyFeature> =
  Object.fromEntries(FEATURES.map((f) => [f.id, f]));

export const FEATURE_BY_ROUTE: Record<string, BudgyFeature> =
  Object.fromEntries(FEATURES.map((f) => [f.route, f]));

export function isProRoute(route: string): boolean {
  const f = FEATURE_BY_ROUTE[route];
  return !!f && f.tier === 'pro';
}

export function featuresByGroup(group: FeatureGroup): BudgyFeature[] {
  return FEATURES.filter((f) => f.group === group);
}
