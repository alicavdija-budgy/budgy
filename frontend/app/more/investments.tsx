/**
 * BUDGY — Investments Premium Screen
 * Inspired by Revolut Wealth · Apple Stocks · Copilot Money.
 * Local data, deterministic mock pricing engine, dark/light aware.
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, TextInput, Modal,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import Svg, { Circle, Path, Defs, LinearGradient as SvgGrad, Stop } from 'react-native-svg';
import { Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme, useThemeMode } from '../../src/hooks/useTheme';
import { useTranslation } from '../../src/hooks/useTranslation';
import { useFeatureFlag } from '../../src/services/featureFlags';
import { useInvestments, AssetType, ComputedAsset } from '../../src/services/investments';
import { ProLockCard } from '../../src/components/ProLockCard';
import { EntityActionsSheet, type EntityActionsContext } from '../../src/components/EntityActionsSheet';
import { EntityEditModal, type EditField } from '../../src/components/EntityEditModal';

const ACCENT = '#16E0C6';
const ACCENT_SOFT = '#7BFCE3';

const TYPE_META: Record<AssetType, { color: string; iconKey: keyof typeof Ionicons.glyphMap }> = {
  cash:   { color: '#74B2FF', iconKey: 'cash' },
  etf:    { color: '#16E0C6', iconKey: 'analytics' },
  crypto: { color: '#FF7A8A', iconKey: 'logo-bitcoin' },
  stock:  { color: '#BE99FF', iconKey: 'trending-up' },
};

function fmtCHF(n: number): string {
  if (Math.abs(n) >= 1000) return n.toLocaleString('fr-CH', { maximumFractionDigits: 0 });
  return n.toLocaleString('fr-CH', { maximumFractionDigits: 2 });
}

// ── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({
  data, width = 110, height = 36, color = ACCENT,
}: { data: number[]; width?: number; height?: number; color?: string }) {
  if (!data || data.length < 2) return <View style={{ width, height }} />;
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const stepX = width / (data.length - 1);
  const norm = (v: number) => height - ((v - min) / span) * (height - 4) - 2;
  let line = `M0 ${norm(data[0])}`;
  for (let i = 1; i < data.length; i++) line += ` L${i * stepX} ${norm(data[i])}`;
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgGrad id="spark" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.30" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </SvgGrad>
      </Defs>
      <Path d={area} fill="url(#spark)" />
      <Path d={line} stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── Donut ────────────────────────────────────────────────────────────────────
function AllocDonut({
  byType, allocPct, isLight,
}: { byType: Record<AssetType, number>; allocPct: Record<AssetType, number>; isLight: boolean }) {
  const SIZE = 100, STROKE = 11;
  const R = (SIZE - STROKE) / 2, C = 2 * Math.PI * R;
  const slices = (Object.keys(byType) as AssetType[])
    .filter((k) => allocPct[k] > 0.5)
    .map((k) => ({ key: k, pct: allocPct[k], color: TYPE_META[k].color }));

  if (slices.length === 0) {
    return (
      <Svg width={SIZE} height={SIZE}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={R}
          stroke={isLight ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.08)'}
          strokeWidth={STROKE} fill="none" />
      </Svg>
    );
  }

  let offset = 0;
  return (
    <Svg width={SIZE} height={SIZE} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={SIZE / 2} cy={SIZE / 2} r={R}
        stroke={isLight ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.06)'}
        strokeWidth={STROKE} fill="none" />
      {slices.map((s) => {
        const len = (s.pct / 100) * C;
        const dash = `${len},${C - len}`;
        const node = (
          <Circle key={s.key}
            cx={SIZE / 2} cy={SIZE / 2} r={R}
            stroke={s.color} strokeWidth={STROKE}
            strokeDasharray={dash} strokeDashoffset={-offset}
            strokeLinecap="round" fill="none" />
        );
        offset += len;
        return node;
      })}
    </Svg>
  );
}

// ── Add Sheet ────────────────────────────────────────────────────────────────
function AddSheet({
  visible, onClose, onSubmit, theme, isLight, t,
}: {
  visible: boolean; onClose: () => void;
  onSubmit: (a: { type: AssetType; name: string; ticker?: string; quantity: number; avgPrice: number }) => void;
  theme: any; isLight: boolean; t: any;
}) {
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<AssetType>('etf');
  const [name, setName] = useState('');
  const [ticker, setTicker] = useState('');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const styles = makeStyles(theme, isLight);

  const reset = () => { setName(''); setTicker(''); setQty(''); setPrice(''); setType('etf'); };

  const submit = () => {
    const q = parseFloat(qty.replace(',', '.'));
    const p = type === 'cash' ? 1 : parseFloat(price.replace(',', '.'));
    if (!name.trim() || !isFinite(q) || q <= 0 || !isFinite(p) || p <= 0) {
      try { if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      Alert.alert(t('invest.addErrTitle'), t('invest.addErrBody'));
      return;
    }
    try { if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    onSubmit({ type, name: name.trim(), ticker: ticker.trim() || undefined, quantity: q, avgPrice: p });
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]}
      >
        <View style={styles.handle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{t('invest.addTitle')}</Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.sheetClose}>
            <Ionicons name="close" size={18} color={theme.text} />
          </Pressable>
        </View>

        <View style={styles.typeRow}>
          {(['cash', 'etf', 'crypto', 'stock'] as AssetType[]).map((k) => (
            <Pressable
              key={k}
              onPress={() => setType(k)}
              style={[
                styles.typeChip,
                type === k && { borderColor: TYPE_META[k].color, backgroundColor: `${TYPE_META[k].color}22` },
              ]}
            >
              <Ionicons name={TYPE_META[k].iconKey} size={13} color={type === k ? TYPE_META[k].color : theme.textSecondary} />
              <Text style={[styles.typeChipTxt, { color: type === k ? TYPE_META[k].color : theme.textSecondary }]}>
                {t(`invest.type${k.charAt(0).toUpperCase() + k.slice(1)}`)}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t('invest.fieldName')}</Text>
          <TextInput
            value={name} onChangeText={setName}
            placeholder={type === 'crypto' ? 'Bitcoin' : type === 'cash' ? t('investmentsUi.savingsAccount') : 'Vanguard S&P 500'}
            placeholderTextColor={theme.textTertiary} style={styles.input}
          />
        </View>
        {type !== 'cash' && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t('invest.fieldTicker')}</Text>
            <TextInput
              value={ticker} onChangeText={setTicker}
              placeholder={type === 'crypto' ? 'BTC' : 'VOO'}
              placeholderTextColor={theme.textTertiary}
              style={styles.input} autoCapitalize="characters"
            />
          </View>
        )}
        <View style={styles.fieldRow}>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={styles.fieldLabel}>{type === 'cash' ? t('invest.fieldAmount') : t('invest.fieldQty')}</Text>
            <TextInput
              value={qty} onChangeText={setQty}
              placeholder={type === 'crypto' ? '0.05' : '10'}
              placeholderTextColor={theme.textTertiary}
              style={styles.input} keyboardType="decimal-pad"
            />
          </View>
          {type !== 'cash' && (
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>{t('invest.fieldAvgPrice')}</Text>
              <TextInput
                value={price} onChangeText={setPrice} placeholder="450"
                placeholderTextColor={theme.textTertiary}
                style={styles.input} keyboardType="decimal-pad"
              />
            </View>
          )}
        </View>

        <Pressable onPress={submit} style={styles.submitWrap}>
          <LinearGradient
            colors={[ACCENT_SOFT, ACCENT]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.submitInner}
          >
            <Ionicons name="checkmark" size={16} color="#0F1115" />
            <Text style={styles.submitTxt}>{t('invest.addCta')}</Text>
          </LinearGradient>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────
export default function InvestmentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const themeMode = useThemeMode();
  const isLight = themeMode === 'light';
  const { t } = useTranslation();
  const advanced = useFeatureFlag('canUseInvestments');
  const { addAsset, removeAsset, updateAsset, summary, insights } = useInvestments();
  const [showAdd, setShowAdd] = useState(false);
  const styles = makeStyles(theme, isLight);

  // CRUD: actions sheet & edit modal
  const [actionsCtx, setActionsCtx] = useState<EntityActionsContext | null>(null);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const editingAsset = useMemo(
    () => summary.assets.find((a) => a.id === editingAssetId) || null,
    [editingAssetId, summary.assets]
  );
  const ASSET_EDIT_FIELDS: EditField[] = useMemo(() => [
    { key: 'name', label: 'Nom', type: 'text', icon: 'pricetag-outline', placeholder: 'Vanguard FTSE All-World', required: true },
    { key: 'ticker', label: 'Ticker (optionnel)', type: 'text', icon: 'code-outline', placeholder: 'VWRL' },
    { key: 'type', label: 'Type', type: 'select', options: [
      { value: 'etf', label: 'ETF', color: TYPE_META.etf.color },
      { value: 'stock', label: 'Action', color: TYPE_META.stock.color },
      { value: 'crypto', label: 'Crypto', color: TYPE_META.crypto.color },
      { value: 'cash', label: 'Cash', color: TYPE_META.cash.color },
    ] },
    { key: 'quantity', label: t('investmentsUi.quantity'), type: 'number', icon: 'layers-outline', placeholder: '10', required: true },
    { key: 'avgPrice', label: 'Prix moyen d\'achat (CHF)', type: 'number', icon: 'cash-outline', placeholder: '100', required: true },
    { key: 'manualPrice', label: 'Prix actuel manuel (optionnel)', type: 'number', icon: 'pulse-outline', placeholder: 'auto' },
  ], []);
  const handleEditAssetSubmit = (values: Record<string, any>) => {
    if (!editingAsset) return;
    const qty = parseFloat(String(values.quantity).replace(',', '.')) || editingAsset.quantity;
    const avg = parseFloat(String(values.avgPrice).replace(',', '.')) || editingAsset.avgPrice;
    const manualRaw = String(values.manualPrice || '').trim();
    const manual = manualRaw ? parseFloat(manualRaw.replace(',', '.')) : undefined;
    updateAsset(editingAsset.id, {
      name: String(values.name || '').trim() || editingAsset.name,
      ticker: String(values.ticker || '').trim() || undefined,
      type: (values.type as AssetType) || editingAsset.type,
      quantity: qty,
      avgPrice: avg,
      manualPrice: manual && !isNaN(manual) ? manual : undefined,
    });
    setEditingAssetId(null);
  };

  const visibleInsights = advanced.enabled
    ? insights
    : insights.filter((i) => !i.pro).slice(0, 2);
  const lockedInsightsCount = insights.length - visibleInsights.length;

  const handleAdd = (a: { type: AssetType; name: string; ticker?: string; quantity: number; avgPrice: number }) => addAsset(a);
  const handleRemove = (id: string, name: string) => {
    Alert.alert(t('invest.removeTitle'), t('invest.removeBody', { name }), [
      { text: t('invest.cancel'), style: 'cancel' },
      { text: t('invest.remove'), style: 'destructive', onPress: () => removeAsset(id) },
    ]);
  };

  const grouped: Record<AssetType, ComputedAsset[]> = useMemo(() => {
    const out: Record<AssetType, ComputedAsset[]> = { cash: [], etf: [], crypto: [], stock: [] };
    for (const a of summary.assets) out[a.type].push(a);
    return out;
  }, [summary.assets]);

  const dayPositive = summary.dayChangePct >= 0;
  const totalPositive = summary.totalPnl >= 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.topTitle}>{t('invest.title')}</Text>
        <Pressable onPress={() => setShowAdd(true)} hitSlop={12} style={styles.addBtn}>
          <Ionicons name="add" size={22} color={ACCENT} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <Animated.View entering={FadeInDown.duration(420)} style={styles.heroCard}>
          <LinearGradient
            colors={isLight
              ? ['rgba(22,224,198,0.10)', 'rgba(34,211,238,0.04)']
              : ['rgba(22,224,198,0.14)', 'rgba(34,211,238,0.06)']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill as any}
          />
          <View style={styles.heroSheen} pointerEvents="none" />
          <Text style={styles.heroEyebrow}>{t('invest.totalValue')}</Text>
          <View style={styles.heroValueRow}>
            <Text style={styles.heroValue}>CHF {fmtCHF(summary.totalValue)}</Text>
            <Sparkline data={summary.spark.length ? summary.spark : [1, 1, 1]}
              width={92} height={32}
              color={dayPositive ? ACCENT : '#FF7A8A'} />
          </View>
          <View style={styles.heroDeltaRow}>
            <View style={[styles.heroDelta, {
              backgroundColor: (dayPositive ? '#16E0C6' : '#FF7A8A') + '22',
              borderColor: (dayPositive ? '#16E0C6' : '#FF7A8A') + '60',
            }]}>
              <Ionicons name={dayPositive ? 'arrow-up' : 'arrow-down'} size={11} color={dayPositive ? ACCENT : '#FF7A8A'} />
              <Text style={[styles.heroDeltaTxt, { color: dayPositive ? ACCENT : '#FF7A8A' }]}>
                {dayPositive ? '+' : ''}{summary.dayChangePct.toFixed(2)}%
              </Text>
            </View>
            <Text style={styles.heroDeltaSub}>
              {dayPositive ? '+' : ''}CHF {fmtCHF(Math.abs(summary.dayChange))} {t('invest.today')}
            </Text>
          </View>
          {summary.totalCost > 0 && (
            <View style={styles.heroPnlRow}>
              <Text style={styles.heroPnlLabel}>{t('invest.totalPnl')}</Text>
              <Text style={[styles.heroPnlValue, { color: totalPositive ? ACCENT : '#FF7A8A' }]}>
                {totalPositive ? '+' : ''}CHF {fmtCHF(summary.totalPnl)} ({summary.totalPnlPct.toFixed(1)}%)
              </Text>
            </View>
          )}
        </Animated.View>

        {/* Allocation */}
        {summary.totalValue > 0 && (
          <Animated.View entering={FadeInDown.duration(420).delay(80)} style={styles.allocCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardEyebrow}>{t('invest.allocation')}</Text>
              <View style={{ marginTop: 10, gap: 8 }}>
                {(Object.keys(summary.byType) as AssetType[])
                  .filter((k) => summary.byType[k] > 0)
                  .sort((a, b) => summary.byType[b] - summary.byType[a])
                  .map((k) => (
                    <View key={k} style={styles.allocRow}>
                      <View style={[styles.allocDot, { backgroundColor: TYPE_META[k].color }]} />
                      <Text style={styles.allocLabel}>{t(`invest.type${k.charAt(0).toUpperCase() + k.slice(1)}`)}</Text>
                      <Text style={styles.allocPct}>{summary.allocPct[k].toFixed(0)}%</Text>
                    </View>
                  ))}
              </View>
            </View>
            <AllocDonut byType={summary.byType} allocPct={summary.allocPct} isLight={isLight} />
          </Animated.View>
        )}

        {/* Empty state — Premium tutorial */}
        {summary.assets.length === 0 && (
          <Animated.View entering={FadeIn.duration(420)} style={styles.emptyCard}>
            <View style={styles.emptyOrb}>
              <Ionicons name="trending-up" size={28} color={ACCENT} />
            </View>
            <Text style={styles.emptyTitle}>{t('invest.emptyTitle')}</Text>
            <Text style={styles.emptySub}>{t('invest.emptySub')}</Text>

            {/* Tutorial mini-cards */}
            <View style={styles.tutoRow}>
              {[
                { emoji: '📈', label: 'ETF', sub: 'Vanguard, iShares' },
                { emoji: '🏢', label: 'Actions', sub: t('investmentsUi.stocksPh') },
                { emoji: '₿', label: 'Crypto', sub: t('investmentsUi.cryptoPh') },
                { emoji: '🥇', label: t('investmentsUi.metalsPh'), sub: 'Or, argent' },
              ].map((x) => (
                <View key={x.label} style={styles.tutoCard}>
                  <Text style={styles.tutoEmoji}>{x.emoji}</Text>
                  <Text style={styles.tutoLabel}>{x.label}</Text>
                  <Text style={styles.tutoSub}>{x.sub}</Text>
                </View>
              ))}
            </View>

            {/* How it works */}
            <View style={styles.howRow}>
              <View style={styles.howStep}>
                <View style={styles.howNum}><Text style={styles.howNumTxt}>1</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.howTitle}>Choisissez un type</Text>
                  <Text style={styles.howSub}>ETF, action, crypto ou cash</Text>
                </View>
              </View>
              <View style={styles.howStep}>
                <View style={styles.howNum}><Text style={styles.howNumTxt}>2</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.howTitle}>Indiquez quantité & prix moyen d'achat</Text>
                  <Text style={styles.howSub}>Ex : 10 parts à CHF 100 chacune</Text>
                </View>
              </View>
              <View style={styles.howStep}>
                <View style={styles.howNum}><Text style={styles.howNumTxt}>3</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.howTitle}>Prix actuel : auto ou manuel</Text>
                  <Text style={styles.howSub}>Cours réel pour ETF/crypto · sinon saisissez la valeur</Text>
                </View>
              </View>
            </View>

            <Pressable onPress={() => setShowAdd(true)} style={styles.emptyCta}>
              <LinearGradient colors={[ACCENT_SOFT, ACCENT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill as any} />
              <Ionicons name="add" size={16} color="#0F1115" />
              <Text style={styles.emptyCtaTxt}>{t('invest.addFirst')}</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Assets grouped */}
        {(['etf', 'stock', 'crypto', 'cash'] as AssetType[]).map((kind) => {
          const list = grouped[kind];
          if (!list.length) return null;
          return (
            <Animated.View
              key={kind}
              entering={FadeInDown.duration(380).delay(120)}
              style={{ marginTop: Spacing.lg }}
            >
              <View style={styles.groupHeader}>
                <Ionicons name={TYPE_META[kind].iconKey} size={14} color={TYPE_META[kind].color} />
                <Text style={[styles.groupTitle, { color: TYPE_META[kind].color }]}>
                  {t(`invest.type${kind.charAt(0).toUpperCase() + kind.slice(1)}`).toUpperCase()}
                </Text>
              </View>
              {list.map((a) => (
                <Pressable
                  key={a.id}
                  onLongPress={() => setActionsCtx({
                    id: a.id,
                    title: a.name,
                    subtitle: `${a.ticker ? a.ticker + ' · ' : ''}${a.quantity.toLocaleString('fr-CH', { maximumFractionDigits: 4 })} × CHF ${fmtCHF(a.currentPrice)}`,
                    accent: TYPE_META[kind].color,
                  })}
                  style={styles.assetCard}
                >
                  <View style={[styles.assetIconWrap, {
                    backgroundColor: TYPE_META[kind].color + '22',
                    borderColor: TYPE_META[kind].color + '40',
                  }]}>
                    <Ionicons name={TYPE_META[kind].iconKey} size={16} color={TYPE_META[kind].color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.assetName} numberOfLines={1}>{a.name}</Text>
                    <Text style={styles.assetMeta} numberOfLines={1}>
                      {a.ticker ? `${a.ticker} · ` : ''}
                      {a.quantity.toLocaleString('fr-CH', { maximumFractionDigits: 4 })} × CHF {fmtCHF(a.currentPrice)}
                    </Text>
                  </View>
                  <Sparkline data={a.spark} width={64} height={28} color={a.pnl >= 0 ? ACCENT : '#FF7A8A'} />
                  <View style={{ alignItems: 'flex-end', marginLeft: 6, minWidth: 86 }}>
                    <Text style={styles.assetValue}>CHF {fmtCHF(a.value)}</Text>
                    <Text style={[styles.assetPnl, { color: a.pnl >= 0 ? ACCENT : '#FF7A8A' }]}>
                      {a.pnl >= 0 ? '+' : ''}{a.pnlPct.toFixed(1)}%
                    </Text>
                  </View>
                </Pressable>
              ))}
            </Animated.View>
          );
        })}

        {/* Insights */}
        {insights.length > 0 && (
          <Animated.View entering={FadeInDown.duration(420).delay(200)} style={{ marginTop: Spacing.xl }}>
            <Text style={styles.cardEyebrow}>{t('invest.insightsEyebrow')}</Text>
            <View style={{ marginTop: 10, gap: 8 }}>
              {visibleInsights.map((ins) => (
                <View key={ins.id} style={styles.insightRow}>
                  <View style={[styles.insightDot, {
                    backgroundColor:
                      ins.toneKey === 'positive' ? '#16E0C622'
                      : ins.toneKey === 'warning' ? '#FFCB6B22'
                      : ins.toneKey === 'tip' ? '#BE99FF22' : '#74B2FF22',
                  }]}>
                    <Ionicons
                      name={ins.iconKey as any} size={13}
                      color={
                        ins.toneKey === 'positive' ? ACCENT
                        : ins.toneKey === 'warning' ? '#FFCB6B'
                        : ins.toneKey === 'tip' ? '#BE99FF' : '#74B2FF'
                      }
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.insightTitle}>{t(ins.titleKey, ins.titleParams)}</Text>
                    {ins.subKey && (
                      <Text style={styles.insightSub}>{t(ins.subKey, ins.subParams)}</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
            {lockedInsightsCount > 0 && (
              <View style={{ marginTop: 12 }}>
                <ProLockCard
                  kind="invest"
                  title={t('invest.proInsightsTitle', { n: lockedInsightsCount })}
                  subtitle={t('invest.proInsightsSub')}
                  compact
                />
              </View>
            )}
          </Animated.View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      <AddSheet
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onSubmit={handleAdd}
        theme={theme}
        isLight={isLight}
        t={t}
      />

      {/* CRUD: actions sheet + edit modal */}
      <EntityActionsSheet
        ctx={actionsCtx}
        onClose={() => setActionsCtx(null)}
        onEdit={() => {
          const id = actionsCtx?.id;
          setActionsCtx(null);
          if (id) setEditingAssetId(id);
        }}
        onDelete={() => {
          const id = actionsCtx?.id;
          setActionsCtx(null);
          if (id) removeAsset(id);
        }}
        deleteConfirmTitle={t('investmentsUi.deleteConfirmTitle')}
      />
      <EntityEditModal
        visible={!!editingAsset}
        onClose={() => setEditingAssetId(null)}
        title={t('investmentsUi.editTitle')}
        fields={ASSET_EDIT_FIELDS}
        initialValues={{
          name: editingAsset?.name || '',
          ticker: editingAsset?.ticker || '',
          type: editingAsset?.type || 'etf',
          quantity: editingAsset?.quantity?.toString() || '',
          avgPrice: editingAsset?.avgPrice?.toString() || '',
          manualPrice: editingAsset?.manualPrice?.toString() || '',
        }}
        onSubmit={handleEditAssetSubmit}
      />
    </View>
  );
}

const makeStyles = (theme: any, isLight: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: isLight ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  topTitle: { color: theme.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold as any },
  addBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(22,224,198,0.14)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(22,224,198,0.40)',
  },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  heroCard: {
    borderRadius: 22, padding: 18, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isLight ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.10)',
    backgroundColor: isLight ? '#fff' : 'rgba(255,255,255,0.025)',
    ...Platform.select({
      ios: {
        shadowColor: '#16E0C6',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: isLight ? 0.10 : 0.18,
        shadowRadius: 22,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  heroSheen: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 1,
    backgroundColor: isLight ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.10)',
  },
  heroEyebrow: { color: theme.textTertiary, fontSize: 11, fontWeight: '700' as any, letterSpacing: 1.4, marginBottom: 4 },
  heroValueRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  heroValue: { color: theme.text, fontSize: 30, fontWeight: '900' as any, letterSpacing: -1 },
  heroDeltaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  heroDelta: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  heroDeltaTxt: { fontSize: 11, fontWeight: '800' as any, letterSpacing: 0.2 },
  heroDeltaSub: { color: theme.textSecondary, fontSize: 11.5 },
  heroPnlRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 14, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: isLight ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.06)',
  },
  heroPnlLabel: { color: theme.textSecondary, fontSize: 12, fontWeight: '600' as any },
  heroPnlValue: { fontSize: 13, fontWeight: '800' as any, letterSpacing: -0.2 },
  allocCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    marginTop: Spacing.lg, padding: 16, borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isLight ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.08)',
    backgroundColor: isLight ? '#fff' : 'rgba(255,255,255,0.025)',
  },
  cardEyebrow: { color: theme.textTertiary, fontSize: 10.5, fontWeight: '700' as any, letterSpacing: 1.3 },
  allocRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  allocDot: { width: 8, height: 8, borderRadius: 4 },
  allocLabel: { color: theme.text, fontSize: 12.5, flex: 1, fontWeight: '500' as any },
  allocPct: { color: theme.textSecondary, fontSize: 12, fontWeight: '700' as any },
  emptyCard: {
    marginTop: Spacing.lg, padding: 24, alignItems: 'center', gap: 10,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isLight ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.08)',
    backgroundColor: isLight ? '#fff' : 'rgba(255,255,255,0.025)',
  },
  emptyOrb: {
    width: 56, height: 56, borderRadius: 18,
    backgroundColor: 'rgba(22,224,198,0.14)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(22,224,198,0.40)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { color: theme.text, fontSize: 17, fontWeight: '800' as any, letterSpacing: -0.3, textAlign: 'center' },
  emptySub: { color: theme.textSecondary, fontSize: 13, lineHeight: 18, textAlign: 'center', maxWidth: 280 },
  emptyCta: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
    overflow: 'hidden', marginTop: 8,
  },
  emptyCtaTxt: { color: '#0F1115', fontSize: 13, fontWeight: '800' as any, letterSpacing: 0.2 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingHorizontal: 4 },
  groupTitle: { fontSize: 10, fontWeight: '900' as any, letterSpacing: 1.6 },
  assetCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: 16, marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isLight ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.06)',
    backgroundColor: isLight ? '#fff' : 'rgba(255,255,255,0.018)',
  },
  assetIconWrap: {
    width: 36, height: 36, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  assetName: { color: theme.text, fontSize: 13.5, fontWeight: '700' as any, letterSpacing: -0.2 },
  assetMeta: { color: theme.textSecondary, fontSize: 11, marginTop: 1 },
  assetValue: { color: theme.text, fontSize: 13, fontWeight: '700' as any, letterSpacing: -0.2 },
  assetPnl: { fontSize: 11, fontWeight: '800' as any, marginTop: 1 },
  insightRow: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    padding: 12, borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isLight ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.05)',
    backgroundColor: isLight ? '#fff' : 'rgba(255,255,255,0.018)',
  },
  insightDot: {
    width: 28, height: 28, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  insightTitle: { color: theme.text, fontSize: 13, fontWeight: '700' as any, letterSpacing: -0.1 },
  insightSub: { color: theme.textSecondary, fontSize: 11.5, marginTop: 2, lineHeight: 16 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: isLight ? '#fff' : '#0F1418',
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    paddingHorizontal: 18, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: isLight ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.10)',
  },
  handle: {
    alignSelf: 'center', width: 38, height: 4, borderRadius: 2,
    backgroundColor: isLight ? 'rgba(15,23,42,0.18)' : 'rgba(255,255,255,0.18)',
    marginBottom: 14,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sheetTitle: { color: theme.text, fontSize: 17, fontWeight: '800' as any, letterSpacing: -0.3 },
  sheetClose: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: isLight ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isLight ? 'rgba(15,23,42,0.10)' : 'rgba(255,255,255,0.10)',
    backgroundColor: isLight ? 'rgba(15,23,42,0.03)' : 'rgba(255,255,255,0.03)',
  },
  typeChipTxt: { fontSize: 12, fontWeight: '700' as any, letterSpacing: 0.2 },
  field: { marginBottom: 12 },
  fieldRow: { flexDirection: 'row', gap: 10 },
  fieldLabel: {
    color: theme.textSecondary, fontSize: 11, fontWeight: '700' as any,
    letterSpacing: 0.6, marginBottom: 5, textTransform: 'uppercase' as any,
  },
  input: {
    color: theme.text, fontSize: 14, fontWeight: '600' as any,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isLight ? 'rgba(15,23,42,0.10)' : 'rgba(255,255,255,0.10)',
    backgroundColor: isLight ? 'rgba(15,23,42,0.03)' : 'rgba(255,255,255,0.04)',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11,
  },
  submitWrap: { height: 48, borderRadius: 14, overflow: 'hidden', marginTop: 6 },
  submitInner: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  submitTxt: { color: '#0F1115', fontSize: 14, fontWeight: '900' as any, letterSpacing: 0.3 },

  // Tutorial empty state — premium onboarding
  tutoRow: {
    flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center',
  },
  tutoCard: {
    width: '23%', alignItems: 'center',
    padding: 10, borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isLight ? 'rgba(15,23,42,0.10)' : 'rgba(255,255,255,0.10)',
    backgroundColor: isLight ? 'rgba(15,23,42,0.03)' : 'rgba(255,255,255,0.03)',
  },
  tutoEmoji: { fontSize: 22 },
  tutoLabel: { color: theme.text, fontSize: 11, fontWeight: '800' as any, marginTop: 4 },
  tutoSub: { color: theme.textTertiary, fontSize: 9, marginTop: 2, textAlign: 'center' },
  howRow: { width: '100%', gap: 10, marginTop: 18 },
  howStep: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingVertical: 8, paddingHorizontal: 4,
  },
  howNum: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(22,224,198,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  howNumTxt: { color: '#16E0C6', fontSize: 11, fontWeight: '900' as any },
  howTitle: { color: theme.text, fontSize: 12.5, fontWeight: '700' as any, lineHeight: 16 },
  howSub: { color: theme.textSecondary, fontSize: 11, marginTop: 2, lineHeight: 15 },
});
