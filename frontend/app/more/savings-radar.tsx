/**
 * BUDGY — Radar d'économies (neutral savings analyzer)
 *
 * Analyse les charges récurrentes / contrats / dépenses pour identifier
 * les postes où une économie est probable, **sans jamais recommander une
 * société, un partenaire, un sponsor ou un lien d'affiliation**.
 *
 * Catégories analysées :
 *   - Assurances (auto, ménage, RC, maladie)
 *   - Téléphone mobile
 *   - Internet fixe
 *   - Banque (frais)
 *   - Énergie (électricité, gaz)
 *   - Abonnements (streaming, services en ligne)
 *
 * Pour chaque poste détecté, le module estime une fourchette d'économie
 * potentielle annuelle basée sur les écarts de marché typiques en Suisse,
 * sans nommer d'acteur. Le conseil reste générique :
 *   « Comparez plusieurs offres avant le prochain renouvellement. »
 */
import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import type { ThemePalette } from '../../src/constants/palettes';
import { useStore } from '../../src/stores/useStore';
import type { Contract, RecurringExpense, Transaction } from '../../src/types';
import { Card } from '../../src/components/ui';

// ─────────── Types ───────────
type SavingBucket =
  | 'insurance_auto'
  | 'insurance_health'
  | 'insurance_home'
  | 'telecom_mobile'
  | 'telecom_internet'
  | 'banking_fees'
  | 'energy'
  | 'subscriptions';

interface BucketDef {
  id: SavingBucket;
  label: string;
  emoji: string;
  // Yearly-saving range expressed as a percentage of the yearly spend
  minPct: number;
  maxPct: number;
  // Default tip — always neutral, never names a company
  tip: string;
}

interface BucketEntry {
  bucket: BucketDef;
  yearly: number;
  source: 'contract' | 'recurring' | 'transaction';
  refIds: string[];
}

interface BucketAnalysis {
  bucket: BucketDef;
  currentYearly: number;
  minSaving: number;
  maxSaving: number;
}

// ─────────── Conservative Swiss market ranges ───────────
const BUCKETS: Record<SavingBucket, BucketDef> = {
  insurance_auto: {
    id: 'insurance_auto', label: 'Assurance auto', emoji: '🚗',
    minPct: 0.12, maxPct: 0.22,
    tip: 'Comparez plusieurs offres avant le prochain renouvellement. Une franchise plus haute ou un changement de couverture peut aussi réduire la prime.',
  },
  insurance_health: {
    id: 'insurance_health', label: 'Assurance maladie', emoji: '🏥',
    minPct: 0.08, maxPct: 0.18,
    tip: 'En Suisse, la prime LAMal varie selon la caisse et la franchise. Comparez plusieurs caisses chaque automne avant le 30 novembre.',
  },
  insurance_home: {
    id: 'insurance_home', label: 'Assurance ménage / RC', emoji: '🏠',
    minPct: 0.15, maxPct: 0.25,
    tip: 'Vérifiez les doublons (RC entreprise + ménage) et comparez plusieurs offres tous les 3 ans.',
  },
  telecom_mobile: {
    id: 'telecom_mobile', label: 'Téléphone mobile', emoji: '📱',
    minPct: 0.20, maxPct: 0.40,
    tip: 'Les forfaits en Suisse varient fortement. Comparez votre usage réel (data, appels) avec les offres actuelles.',
  },
  telecom_internet: {
    id: 'telecom_internet', label: 'Internet fixe', emoji: '🌐',
    minPct: 0.15, maxPct: 0.30,
    tip: 'Les promotions « nouveau client » sont fréquentes. Renégociez tous les 12 à 24 mois.',
  },
  banking_fees: {
    id: 'banking_fees', label: 'Frais bancaires', emoji: '🏦',
    minPct: 0.30, maxPct: 0.60,
    tip: 'Plusieurs banques en ligne suisses proposent des comptes sans frais. Comparez votre paquet actuel.',
  },
  energy: {
    id: 'energy', label: 'Électricité / gaz', emoji: '⚡',
    minPct: 0.08, maxPct: 0.20,
    tip: 'Vérifiez le tarif et la classification (heures pleines/creuses). De petits gestes (LED, veille) impactent aussi.',
  },
  subscriptions: {
    id: 'subscriptions', label: 'Abonnements', emoji: '🎬',
    minPct: 0.25, maxPct: 0.50,
    tip: 'Listez tous vos abonnements et désactivez ceux que vous n\'utilisez pas chaque mois.',
  },
};

// ─────────── Detection from titles / categories ───────────
function bucketFor(title: string, category?: string): SavingBucket | null {
  const t = `${title} ${category || ''}`.toLowerCase();

  if (/assurance.*auto|auto.*assurance|leasing|axa.*auto|allianz.*auto|carrosserie/.test(t)) return 'insurance_auto';
  if (/lamal|maladie|caisse.*maladie|css|sanitas|helsana|swica|atupri|concordia|krankenkasse/.test(t)) return 'insurance_health';
  if (/assurance.*menage|menage.*assurance|rc.*priv|responsabilit|assurance.*habit|home.*insurance|hausrat/.test(t)) return 'insurance_home';
  if (/swisscom.*mobile|sunrise.*mobile|salt.*mobile|wingo|yallo|m-?budget.*mobile|abonnement.*mobile|forfait.*mobile|abo.*natel|natel/.test(t)) return 'telecom_mobile';
  if (/internet|fibre|adsl|vdsl|wifi.*domicile|abonnement.*internet|swisscom.*box|sunrise.*box|init7|quickline/.test(t)) return 'telecom_internet';
  if (/frais.*bancaire|frais.*compte|frais.*carte|annual.*card.*fee|tenue.*compte|abonnement.*carte|maintenance.*compte/.test(t)) return 'banking_fees';
  if (/electricit|gaz|chauffage|romande.*energie|iwb|sig|bkw|ewz|axpo|alpiq|compteur/.test(t)) return 'energy';
  if (/netflix|spotify|apple.*music|apple.*tv|disney|youtube.*prem|amazon.*prime|hbo|paramount|peacock|adobe|microsoft.*365|office.*365|icloud|google.*one|notion|chatgpt|midjourney|gym|fitness|streaming|premium/.test(t)) return 'subscriptions';

  return null;
}

// ─────────── Normalize a charge to yearly amount ───────────
function yearlyFromRecurring(r: RecurringExpense): number {
  return r.frequency === 'monthly' ? r.amount * 12 : r.amount;
}
function yearlyFromContract(c: Contract): number {
  // Contracts in Budgy store the *yearly* amount as `amount` (see add-contract wizard)
  return c.amount;
}
function yearlyFromTransactions(txs: Transaction[]): number {
  // Sum the last 12 months of transactions and project
  const now = Date.now();
  const cutoff = now - 365 * 24 * 3600 * 1000;
  return txs
    .filter((t) => {
      const ts = new Date(t.date).getTime();
      return !isNaN(ts) && ts >= cutoff;
    })
    .reduce((s, t) => s + Math.abs(t.amount), 0);
}

// ─────────── Build per-bucket entries from store data ───────────
function buildEntries(
  contracts: Contract[],
  recurring: RecurringExpense[],
  transactions: Transaction[],
): BucketEntry[] {
  const entries: BucketEntry[] = [];

  for (const c of contracts) {
    const b = bucketFor(c.title, c.category);
    if (!b) continue;
    entries.push({ bucket: BUCKETS[b], yearly: yearlyFromContract(c), source: 'contract', refIds: [c.id] });
  }
  for (const r of recurring) {
    if (!r.active) continue;
    const b = bucketFor(r.title, r.category);
    if (!b) continue;
    entries.push({ bucket: BUCKETS[b], yearly: yearlyFromRecurring(r), source: 'recurring', refIds: [r.id] });
  }

  // Aggregate transactions by detected bucket (12-month window)
  const txByBucket: Record<string, { yearly: number; ids: string[] }> = {};
  for (const tx of transactions) {
    const b = bucketFor(tx.title, tx.category);
    if (!b) continue;
    if (!txByBucket[b]) txByBucket[b] = { yearly: 0, ids: [] };
    txByBucket[b].yearly += Math.abs(tx.amount);
    txByBucket[b].ids.push(tx.id);
  }
  for (const [b, agg] of Object.entries(txByBucket)) {
    // Only add transaction-derived entries if no contract/recurring already covers that bucket
    if (entries.some((e) => e.bucket.id === b)) continue;
    if (agg.yearly < 50) continue; // ignore noise
    entries.push({ bucket: BUCKETS[b as SavingBucket], yearly: agg.yearly, source: 'transaction', refIds: agg.ids });
  }
  return entries;
}

function aggregate(entries: BucketEntry[]): BucketAnalysis[] {
  const map: Record<string, BucketAnalysis> = {};
  for (const e of entries) {
    const k = e.bucket.id;
    if (!map[k]) {
      map[k] = { bucket: e.bucket, currentYearly: 0, minSaving: 0, maxSaving: 0 };
    }
    map[k].currentYearly += e.yearly;
  }
  for (const k of Object.keys(map)) {
    const a = map[k];
    a.minSaving = Math.round(a.currentYearly * a.bucket.minPct);
    a.maxSaving = Math.round(a.currentYearly * a.bucket.maxPct);
  }
  return Object.values(map).sort((a, b) => b.maxSaving - a.maxSaving);
}

// ─────────── Formatting helpers ───────────
const fmt = (n: number) => `CHF ${Math.round(n).toLocaleString('fr-CH').replace(/,/g, "'")}`;

// ─────────── Screen ───────────
export default function SavingsRadarScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const contracts = useStore((s) => s.contracts);
  const recurring = useStore((s) => s.recurringExpenses);
  const transactions = useStore((s) => s.transactions);

  const analysis = useMemo(() => {
    const entries = buildEntries(contracts || [], recurring || [], transactions || []);
    return aggregate(entries);
  }, [contracts, recurring, transactions]);

  const totalMin = analysis.reduce((s, a) => s + a.minSaving, 0);
  const totalMax = analysis.reduce((s, a) => s + a.maxSaving, 0);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="savings-radar">
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Radar d'économies</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 80 }}>
        {/* Hero — total savings card (gold + teal) */}
        <LinearGradient
          colors={[`${theme.gold}30`, `${theme.primary}20`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroBadge}>
            <Ionicons name="radio" size={14} color={theme.gold} />
            <Text style={styles.heroBadgeTxt}>BUDGY · RADAR</Text>
          </View>
          <Text style={styles.heroTitle}>Économie potentielle annuelle</Text>
          <Text style={styles.heroAmount}>
            jusqu'à <Text style={{ color: theme.gold }}>{fmt(totalMax)}</Text>
          </Text>
          <Text style={styles.heroSub}>
            {totalMin > 0
              ? `Fourchette estimée : ${fmt(totalMin)} – ${fmt(totalMax)} / an`
              : 'Ajoutez vos contrats et abonnements pour activer le radar.'}
          </Text>
          <View style={styles.heroDivider} />
          <View style={styles.heroNeutral}>
            <Ionicons name="shield-checkmark" size={14} color={theme.primary} />
            <Text style={styles.heroNeutralTxt}>
              Budgy reste 100 % neutre · Aucun partenaire, aucun affilié.
            </Text>
          </View>
        </LinearGradient>

        {/* Detected buckets */}
        {analysis.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={{ fontSize: 48 }}>📡</Text>
            <Text style={styles.emptyTitle}>Aucune charge analysable détectée</Text>
            <Text style={styles.emptySub}>
              Importez vos contrats (assurances, télécom, énergie) ou vos abonnements pour que Budgy puisse identifier des économies potentielles.
            </Text>
          </Card>
        ) : (
          analysis.map((a) => (
            <View key={a.bucket.id} style={styles.bucketCard}>
              <View style={styles.bucketHeader}>
                <Text style={{ fontSize: 28 }}>{a.bucket.emoji}</Text>
                <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                  <Text style={styles.bucketLabel}>{a.bucket.label}</Text>
                  <Text style={styles.bucketCurrent}>
                    Charge actuelle : <Text style={{ color: theme.text, fontWeight: '700' }}>{fmt(a.currentYearly)}/an</Text>
                  </Text>
                </View>
              </View>

              <View style={styles.savingRow}>
                <View>
                  <Text style={styles.savingLabel}>Économie potentielle</Text>
                  <Text style={styles.savingAmount}>
                    {fmt(a.minSaving)} – {fmt(a.maxSaving)} / an
                  </Text>
                </View>
                <View style={styles.savingBadge}>
                  <Ionicons name="trending-down" size={14} color={theme.gold} />
                  <Text style={styles.savingBadgePct}>
                    -{Math.round(a.bucket.minPct * 100)} à {Math.round(a.bucket.maxPct * 100)}%
                  </Text>
                </View>
              </View>

              <View style={styles.tipBlock}>
                <Ionicons name="bulb" size={14} color={theme.primary} style={{ marginTop: 2 }} />
                <Text style={styles.tipTxt}>{a.bucket.tip}</Text>
              </View>
            </View>
          ))
        )}

        {/* Footer disclaimer */}
        <View style={styles.footer}>
          <Ionicons name="information-circle" size={16} color={theme.textTertiary} />
          <Text style={styles.footerTxt}>
            Les économies indiquées sont des estimations basées sur les écarts typiques du marché suisse. Budgy ne reçoit aucune commission et ne recommande aucune marque.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─────────── Styles ───────────
const makeStyles = (C: ThemePalette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    },
    iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    title: { color: C.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold, flex: 1, textAlign: 'center' },

    // Hero
    heroCard: {
      borderRadius: BorderRadius.xl,
      padding: Spacing.lg,
      borderWidth: 1,
      borderColor: `${C.gold}55`,
      marginBottom: Spacing.lg,
    },
    heroBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: `${C.gold}80`,
      backgroundColor: `${C.gold}15`,
      marginBottom: Spacing.sm,
    },
    heroBadgeTxt: { color: C.gold, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
    heroTitle: { color: C.textSecondary, fontSize: FontSizes.sm, fontWeight: '600' },
    heroAmount: {
      color: C.text,
      fontSize: 28,
      fontWeight: '900',
      marginTop: 4,
      lineHeight: 34,
    },
    heroSub: { color: C.textSecondary, fontSize: 13, marginTop: 6 },
    heroDivider: {
      height: 1,
      backgroundColor: `${C.gold}30`,
      marginVertical: Spacing.md,
    },
    heroNeutral: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    heroNeutralTxt: { color: C.textSecondary, fontSize: 12, flex: 1 },

    // Empty
    emptyCard: { alignItems: 'center', padding: Spacing.xl, gap: 6 },
    emptyTitle: { color: C.text, fontSize: FontSizes.md, fontWeight: '700', marginTop: 12 },
    emptySub: { color: C.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 4 },

    // Bucket
    bucketCard: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: C.cardBorder,
      padding: Spacing.md,
      marginBottom: Spacing.sm,
    },
    bucketHeader: { flexDirection: 'row', alignItems: 'center' },
    bucketLabel: { color: C.text, fontSize: FontSizes.md, fontWeight: '700' },
    bucketCurrent: { color: C.textSecondary, fontSize: 12, marginTop: 2 },

    savingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: Spacing.md,
      padding: Spacing.sm,
      backgroundColor: `${C.gold}10`,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: `${C.gold}30`,
    },
    savingLabel: { color: C.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
    savingAmount: { color: C.gold, fontSize: FontSizes.md, fontWeight: '900', marginTop: 2 },
    savingBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: `${C.gold}20`,
    },
    savingBadgePct: { color: C.gold, fontSize: 11, fontWeight: '800' },

    tipBlock: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginTop: Spacing.sm,
      paddingHorizontal: 2,
    },
    tipTxt: { color: C.textSecondary, fontSize: 12, lineHeight: 17, flex: 1 },

    // Footer
    footer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginTop: Spacing.lg,
      paddingHorizontal: Spacing.sm,
    },
    footerTxt: { color: C.textTertiary, fontSize: 11, lineHeight: 16, flex: 1 },
  });
