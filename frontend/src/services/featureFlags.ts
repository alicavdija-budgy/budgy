/**
 * BUDGY — Feature flags & freemium gating
 *
 * Lightweight, non-destructive layer that decides at RUNTIME whether a user
 * can access a given feature. Reads `user.isPro` from the Zustand store, plus
 * tracks monthly usage counters for limited free-tier features (e.g. Voice).
 *
 * Design principles
 *   • No breaking change : every screen keeps working today.
 *   • Soft gating only   : we never block a screen brutally.
 *   • Single source of truth for "what's free vs pro" → keep IAP wiring simple.
 *   • Counters reset monthly (calendar month, local time).
 *
 * Wiring later (when IAP is ready):
 *   `setPro(true)` from the store after a successful StoreKit purchase will
 *   automatically unlock everything — no other code change needed.
 */
import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore } from '../stores/useStore';
import { usePremiumStore } from '../stores/usePremiumStore';

// ── Catalogue ──────────────────────────────────────────────────────────────
export type FeatureFlag =
  | 'isPremium'
  | 'canUseVoiceAI'              // live mic + LLM parse
  | 'canUseAdvancedTimeline'     // > 2 insights cards
  | 'canUseUnlimitedOCR'
  | 'canUsePremiumPDF'           // multi-page, with attachments
  | 'canUseInvestments'
  | 'canUseAIOptimizer'
  | 'canUseSubscriptionAudit'
  | 'canUseAdvancedHealthScore'  // detailed breakdown beyond the score card
  | 'canUseAdvancedSync';        // multi-device, conflict resolution, snapshots

// ── Free-tier limits ───────────────────────────────────────────────────────
export const FREE_LIMITS = {
  voiceTriesPerMonth: 5,         // Voice modal calls /api/voice/parse
  ocrScansPerMonth: 8,
  timelineInsightsCap: 2,        // Free users see only top-2 insights
  pdfPagesPerExport: 3,
} as const;

// ── Storage keys
const KEY_USAGE = '@budgy:usage:v1';

interface UsageState {
  voiceTriesUsed: number;
  ocrScansUsed: number;
  monthKey: string;              // 'YYYY-MM'
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function readUsage(): Promise<UsageState> {
  try {
    const raw = await AsyncStorage.getItem(KEY_USAGE);
    if (!raw) return { voiceTriesUsed: 0, ocrScansUsed: 0, monthKey: currentMonthKey() };
    const parsed = JSON.parse(raw);
    // Auto-reset if month rolled over
    if (parsed?.monthKey !== currentMonthKey()) {
      const fresh: UsageState = { voiceTriesUsed: 0, ocrScansUsed: 0, monthKey: currentMonthKey() };
      await AsyncStorage.setItem(KEY_USAGE, JSON.stringify(fresh));
      return fresh;
    }
    return {
      voiceTriesUsed: Number(parsed.voiceTriesUsed) || 0,
      ocrScansUsed: Number(parsed.ocrScansUsed) || 0,
      monthKey: parsed.monthKey,
    };
  } catch {
    return { voiceTriesUsed: 0, ocrScansUsed: 0, monthKey: currentMonthKey() };
  }
}

async function writeUsage(u: UsageState) {
  try { await AsyncStorage.setItem(KEY_USAGE, JSON.stringify(u)); } catch {}
}

// ── Public hooks ───────────────────────────────────────────────────────────

/** Returns true if the user has Pro / Premium status.
 *  Source of truth: usePremiumStore.hasPremiumAccess() — includes:
 *   - confirmed Pro (after Apple validation OK)
 *   - active trial (trialEndsAt > now)
 *   - PROVISIONAL Pro (provisionalProUntil > now — granted after Apple
 *     receipt OK but backend still pending). This is what fixes the bug
 *     "Voice paywall affiché malgré essai gratuit 7 jours actif". */
export function useIsPremium(): boolean {
  // Subscribe to the primitive fields so that we re-render when ANY of them
  // change (Zustand selector returning the result of hasPremiumAccess() with
  // dependencies on multiple slices needs explicit subscription).
  const isPro = usePremiumStore((s) => s.isPro);
  const trialEndsAt = usePremiumStore((s) => s.trialEndsAt);
  const provisionalProUntil = usePremiumStore((s) => s.provisionalProUntil);
  const legacyPro = useStore((s) => Boolean(s.user?.isPro || s.isPro));
  const now = Date.now();
  return (
    isPro ||
    (!!trialEndsAt && trialEndsAt > now) ||
    (!!provisionalProUntil && provisionalProUntil > now) ||
    legacyPro
  );
}

/**
 * Pure feature-flag query.
 * Returns whether a feature is currently allowed for the user, plus an
 * optional friendly upgrade prompt.
 */
export function useFeatureFlag(flag: FeatureFlag): {
  enabled: boolean;
  upgradeReason?: string;
} {
  const isPremium = useIsPremium();

  switch (flag) {
    case 'isPremium':
      return { enabled: isPremium, upgradeReason: 'Activez Budgy Pro pour débloquer toutes les fonctionnalités' };
    case 'canUseVoiceAI':
      return isPremium
        ? { enabled: true }
        : { enabled: true, upgradeReason: `Limité à ${FREE_LIMITS.voiceTriesPerMonth} essais / mois` };
    case 'canUseAdvancedTimeline':
      return isPremium
        ? { enabled: true }
        : { enabled: false, upgradeReason: 'La Timeline IA complète est réservée aux membres Pro' };
    case 'canUseUnlimitedOCR':
      return isPremium
        ? { enabled: true }
        : { enabled: true, upgradeReason: `Limité à ${FREE_LIMITS.ocrScansPerMonth} scans / mois` };
    case 'canUsePremiumPDF':
      return isPremium
        ? { enabled: true }
        : { enabled: false, upgradeReason: 'Export PDF complet avec justificatifs — Pro' };
    case 'canUseInvestments':
      return isPremium
        ? { enabled: true }
        : { enabled: false, upgradeReason: 'Suivi du portefeuille — Pro' };
    case 'canUseAIOptimizer':
      return isPremium
        ? { enabled: true }
        : { enabled: false, upgradeReason: 'Conseils IA approfondis — Pro' };
    case 'canUseSubscriptionAudit':
      return isPremium
        ? { enabled: true }
        : { enabled: false, upgradeReason: 'Audit complet des abonnements — Pro' };
    case 'canUseAdvancedHealthScore':
      return isPremium
        ? { enabled: true }
        : { enabled: true, upgradeReason: 'Score détaillé complet en Pro' };
    case 'canUseAdvancedSync':
      return isPremium
        ? { enabled: true }
        : { enabled: false, upgradeReason: 'Sync multi-appareils — Pro' };
  }
}

/**
 * Hook for free-tier features that have a monthly counter (Voice, OCR…).
 * Exposes:
 *   - remaining: tries left this month (Infinity for premium)
 *   - canUse: whether the user can perform the action right now
 *   - consume(): returns true if the action was allowed; false if quota exhausted.
 *     For premium users, consume() always returns true and never increments.
 */
export function useUsageQuota(kind: 'voice' | 'ocr') {
  const isPremium = useIsPremium();
  const limit = kind === 'voice' ? FREE_LIMITS.voiceTriesPerMonth : FREE_LIMITS.ocrScansPerMonth;
  const [used, setUsed] = useState<number>(0);

  // Load on mount
  useEffect(() => {
    let cancelled = false;
    readUsage().then((u) => {
      if (cancelled) return;
      setUsed(kind === 'voice' ? u.voiceTriesUsed : u.ocrScansUsed);
    });
    return () => { cancelled = true; };
  }, [kind]);

  const remaining = isPremium ? Infinity : Math.max(0, limit - used);
  const canUse = isPremium || remaining > 0;

  const consume = useCallback(async () => {
    if (isPremium) return true;
    const u = await readUsage();
    const key = kind === 'voice' ? 'voiceTriesUsed' : 'ocrScansUsed';
    const cur = (u as any)[key] as number;
    if (cur >= limit) return false;
    const next = { ...u, [key]: cur + 1 } as UsageState;
    await writeUsage(next);
    setUsed(next[key as keyof UsageState] as number);
    return true;
  }, [isPremium, kind, limit]);

  return { canUse, remaining, used, limit, consume };
}

// ── Programmatic helpers (for non-React contexts) ──────────────────────────
export async function consumeVoiceTry(isPremium: boolean): Promise<boolean> {
  if (isPremium) return true;
  const u = await readUsage();
  if (u.voiceTriesUsed >= FREE_LIMITS.voiceTriesPerMonth) return false;
  await writeUsage({ ...u, voiceTriesUsed: u.voiceTriesUsed + 1 });
  return true;
}
