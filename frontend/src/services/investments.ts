/**
 * BUDGY — Investments local store & mock pricing engine
 *
 * Pure local logic — no remote API. Designed to feel "alive" with deterministic
 * pseudo-volatility so charts always look natural without burning crypto API
 * quotas.
 *
 * Asset types: cash | etf | crypto | stock
 * Persistence: AsyncStorage (single JSON blob, debounced).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState, useCallback } from 'react';

const KEY = '@budgy:investments:v1';

export type AssetType = 'cash' | 'etf' | 'crypto' | 'stock';

export interface Asset {
  id: string;
  type: AssetType;
  name: string;
  ticker?: string;
  /** Quantity (units / shares / coins). For cash = amount in account currency. */
  quantity: number;
  /** Average buy price per unit, in CHF. */
  avgPrice: number;
  /** Optional manual current price override (CHF). If absent, mock engine. */
  manualPrice?: number;
  currency?: 'CHF' | 'EUR' | 'USD';
  createdAt: number;
  /** Free-form note (e.g. broker name). */
  note?: string;
}

export interface ComputedAsset extends Asset {
  currentPrice: number;
  value: number;
  cost: number;
  pnl: number;
  pnlPct: number;
  /** 14-point sparkline values (most recent last). */
  spark: number[];
}

export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  totalPnl: number;
  totalPnlPct: number;
  /** 14-point synthetic timeline of total portfolio value. */
  spark: number[];
  /** Today's variation in CHF. */
  dayChange: number;
  dayChangePct: number;
  byType: Record<AssetType, number>;
  allocPct: Record<AssetType, number>;
  assets: ComputedAsset[];
}

// ── Mock pricing engine ─────────────────────────────────────────────────────
// Deterministic-ish hash based on a string (asset id) + time bucket
function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VOLATILITY: Record<AssetType, number> = {
  cash: 0,        // stable
  etf: 0.012,     // ±1.2% daily
  crypto: 0.045,  // ±4.5% daily
  stock: 0.025,   // ±2.5% daily
};
const DRIFT: Record<AssetType, number> = {
  cash: 0,
  etf: 0.0009,    // slight upward bias
  crypto: 0.0014,
  stock: 0.0011,
};

/**
 * Generate a 14-point series of "current price" history ending today.
 * Same input → same output (within the same UTC day).
 */
function priceSeries(asset: Asset, points = 14): number[] {
  const base = asset.manualPrice ?? asset.avgPrice;
  if (!base || base <= 0) return Array(points).fill(0);
  if (asset.type === 'cash') return Array(points).fill(base);

  const today = new Date();
  const dayBucket = `${today.getUTCFullYear()}-${today.getUTCMonth()}-${today.getUTCDate()}`;
  const seed = hashStr(asset.id + dayBucket);
  const rng = mulberry32(seed);
  const vol = VOLATILITY[asset.type];
  const drift = DRIFT[asset.type];

  const out: number[] = [];
  let v = base * (1 - drift * (points - 1)); // rewind start a bit
  for (let i = 0; i < points; i++) {
    // Box-Muller-ish gaussian-ish via 2 uniforms
    const u1 = rng();
    const u2 = rng();
    const noise = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-9))) *
                  Math.cos(2 * Math.PI * u2);
    v = Math.max(0.01, v * (1 + drift + vol * noise * 0.4));
    out.push(v);
  }
  return out;
}

export function computePortfolio(assets: Asset[]): PortfolioSummary {
  const computed: ComputedAsset[] = assets.map((a) => {
    const spark = priceSeries(a, 14);
    const currentPrice = spark[spark.length - 1] || a.avgPrice;
    const value = a.quantity * currentPrice;
    const cost = a.quantity * a.avgPrice;
    const pnl = value - cost;
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
    return { ...a, currentPrice, value, cost, pnl, pnlPct, spark };
  });

  const totalValue = computed.reduce((s, x) => s + x.value, 0);
  const totalCost = computed.reduce((s, x) => s + x.cost, 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  const byType: Record<AssetType, number> = { cash: 0, etf: 0, crypto: 0, stock: 0 };
  for (const c of computed) byType[c.type] += c.value;

  const allocPct: Record<AssetType, number> = { cash: 0, etf: 0, crypto: 0, stock: 0 };
  if (totalValue > 0) {
    for (const k of Object.keys(byType) as AssetType[]) {
      allocPct[k] = (byType[k] / totalValue) * 100;
    }
  }

  // Synthetic portfolio sparkline = sum of weighted asset sparklines.
  const spark: number[] = Array(14).fill(0);
  for (const c of computed) {
    for (let i = 0; i < 14; i++) spark[i] += c.spark[i] * c.quantity;
  }

  const last = spark[spark.length - 1] || totalValue;
  const prev = spark[spark.length - 2] || last;
  const dayChange = last - prev;
  const dayChangePct = prev > 0 ? (dayChange / prev) * 100 : 0;

  return {
    totalValue,
    totalCost,
    totalPnl,
    totalPnlPct,
    spark,
    dayChange,
    dayChangePct,
    byType,
    allocPct,
    assets: computed,
  };
}

// ── Insights (local, no LLM) ────────────────────────────────────────────────
export interface Insight {
  id: string;
  toneKey: 'positive' | 'info' | 'warning' | 'tip';
  iconKey: string; // ionicons name as string
  titleKey: string;
  titleParams?: Record<string, any>;
  subKey?: string;
  subParams?: Record<string, any>;
  weight: number;
  /** True if this insight is locked behind Pro. */
  pro?: boolean;
}

export function buildInsights(p: PortfolioSummary): Insight[] {
  const out: Insight[] = [];
  if (p.assets.length === 0) {
    out.push({
      id: 'empty', toneKey: 'tip', iconKey: 'sparkles',
      titleKey: 'invest.insEmptyTitle', subKey: 'invest.insEmptySub', weight: 100,
    });
    return out;
  }

  // Diversification
  const types = (Object.keys(p.byType) as AssetType[]).filter((k) => p.byType[k] > 0);
  if (types.length >= 3) {
    out.push({
      id: 'diversified', toneKey: 'positive', iconKey: 'shield-checkmark',
      titleKey: 'invest.insDiversified', subKey: 'invest.insDiversifiedSub',
      subParams: { n: types.length }, weight: 70,
    });
  } else if (types.length === 1) {
    out.push({
      id: 'mono', toneKey: 'warning', iconKey: 'warning',
      titleKey: 'invest.insMono', subKey: 'invest.insMonoSub', weight: 80,
    });
  }

  // Cash exposure
  if (p.allocPct.cash >= 40 && p.totalValue > 0) {
    out.push({
      id: 'cash-heavy', toneKey: 'info', iconKey: 'cash',
      titleKey: 'invest.insCash', titleParams: { p: Math.round(p.allocPct.cash) },
      subKey: 'invest.insCashSub', weight: 60,
    });
  }

  // Crypto volatility warning
  if (p.allocPct.crypto >= 25) {
    out.push({
      id: 'crypto-vol', toneKey: 'warning', iconKey: 'pulse',
      titleKey: 'invest.insCrypto', titleParams: { p: Math.round(p.allocPct.crypto) },
      subKey: 'invest.insCryptoSub', weight: 75,
    });
  }

  // PnL
  if (p.totalPnlPct >= 10) {
    out.push({
      id: 'pnl-good', toneKey: 'positive', iconKey: 'trending-up',
      titleKey: 'invest.insPnlGood', titleParams: { p: p.totalPnlPct.toFixed(1) },
      subKey: 'invest.insPnlGoodSub', weight: 90,
    });
  } else if (p.totalPnlPct <= -10) {
    out.push({
      id: 'pnl-bad', toneKey: 'warning', iconKey: 'trending-down',
      titleKey: 'invest.insPnlBad', titleParams: { p: Math.abs(p.totalPnlPct).toFixed(1) },
      subKey: 'invest.insPnlBadSub', weight: 85,
    });
  }

  // ── Pro-only deeper insights ─────────────────────────────────────────────
  if (types.length >= 2) {
    const sorted = (Object.entries(p.byType) as [AssetType, number][])
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
    const top = sorted[0];
    if (top && p.totalValue > 0) {
      const pct = Math.round((top[1] / p.totalValue) * 100);
      if (pct >= 60) {
        out.push({
          id: 'overweight', toneKey: 'info', iconKey: 'analytics',
          titleKey: 'invest.insOverweight', titleParams: { type: top[0], p: pct },
          subKey: 'invest.insOverweightSub', weight: 65, pro: true,
        });
      }
    }
  }
  // Projected 1Y if PnL trend continues
  if (p.totalPnlPct !== 0 && p.totalValue > 0) {
    const proj = p.totalValue * (1 + (p.totalPnlPct / 100));
    out.push({
      id: 'projection', toneKey: 'tip', iconKey: 'rocket',
      titleKey: 'invest.insProjection',
      titleParams: { v: Math.round(proj).toLocaleString('fr-CH') },
      subKey: 'invest.insProjectionSub', weight: 50, pro: true,
    });
  }

  return out.sort((a, b) => b.weight - a.weight);
}

// ── Persistence hook ────────────────────────────────────────────────────────
export function useInvestments() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (!cancelled && raw) {
          const parsed = JSON.parse(raw) as Asset[];
          setAssets(Array.isArray(parsed) ? parsed : []);
        }
      } catch {
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const persist = useCallback(async (next: Asset[]) => {
    try { await AsyncStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  }, []);

  const addAsset = useCallback((a: Omit<Asset, 'id' | 'createdAt'>) => {
    setAssets((prev) => {
      const next = [
        { ...a, id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, createdAt: Date.now() },
        ...prev,
      ];
      persist(next);
      return next;
    });
  }, [persist]);

  const removeAsset = useCallback((id: string) => {
    setAssets((prev) => {
      const next = prev.filter((x) => x.id !== id);
      persist(next);
      return next;
    });
  }, [persist]);

  const summary = useMemo(() => computePortfolio(assets), [assets]);
  const insights = useMemo(() => buildInsights(summary), [summary]);

  return { assets, addAsset, removeAsset, summary, insights, loading };
}
