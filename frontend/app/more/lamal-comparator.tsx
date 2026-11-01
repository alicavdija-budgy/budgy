/**
 * BUDGY — Comparateur LAMal officiel (OFSP / Priminfo).
 *
 * UNE seule source de tarifs : les primes AOS officielles approuvées, servies
 * par src/services/lamalData.ts (cache validé → secours embarqué 2027), avec
 * actualisation automatique non bloquante (manifest versionné publié par le
 * service GitHub Actions — aucun nouveau build par millésime).
 *
 * Supprimé définitivement : modèles « HMO −10% / Telmed −8% », remises
 * théoriques, « Assureur A/B/C », top 10 modélisé 2026, économies vs moyenne,
 * classement des cantons modélisé. Le moteur choisit automatiquement l'offre
 * admissible la moins chère de chaque assureur (modèle réel affiché).
 *
 * Région de prime : déterminée par la COMMUNE officielle (praemienregionen,
 * clé n° OFS) — jamais « première région du canton » par défaut. Sélection
 * manuelle explicite en secours. Profil incomplet → aucun classement présenté
 * comme personnel.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Spacing, FontSizes, FontWeights, BorderRadius } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import type { ThemePalette } from '../../src/constants/palettes';
import { Card } from '../../src/components/ui';
import { useTranslation } from '../../src/hooks/useTranslation';
import { loadLamalData, refreshLamalData, type LamalData } from '../../src/services/lamalData';

const ALL_CANTONS = [
  'ZH', 'BE', 'LU', 'UR', 'SZ', 'OW', 'NW', 'GL', 'ZG', 'FR',
  'SO', 'BS', 'BL', 'SH', 'AR', 'AI', 'SG', 'GR', 'AG', 'TG',
  'TI', 'VD', 'VS', 'NE', 'GE', 'JU',
];
const ADULT_FR = [300, 500, 1000, 1500, 2000, 2500];
const CHILD_FR = [0, 100, 200, 300, 400, 600];
type AgeClass = 'KIN' | 'JUG' | 'ERW';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export default function LamalComparatorScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, lang } = useTranslation();

  const [data, setData] = useState<LamalData | null>(null);
  const [canton, setCanton] = useState('VD');
  const [communeQuery, setCommuneQuery] = useState('');
  const [commune, setCommune] = useState<{ name: string; region: number } | null>(null);
  const [manualRegion, setManualRegion] = useState<string | null>(null);
  const [ageClass, setAgeClass] = useState<AgeClass>('ERW');
  const [franchise, setFranchise] = useState(300);
  const [accident, setAccident] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    // 1. Dernières données validées (cache/embarqué) — immédiat.
    loadLamalData().then((d) => { if (alive) setData(d); });
    // 2. Vérification distante non bloquante (manifest versionné).
    refreshLamalData().then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);

  const premiums = data?.premiums;
  const regions = data?.regions;

  // Régions de prime réellement présentes dans le jeu officiel pour ce canton
  const cantonRegions = useMemo(() => {
    if (!premiums) return [];
    const set = new Set<string>();
    for (const key of Object.keys(premiums.profiles)) {
      if (key.startsWith(`${canton}|`)) set.add(key.split('|')[1]);
    }
    return [...set].sort();
  }, [premiums, canton]);
  const singleRegion = cantonRegions.length === 1;

  const communes = regions?.cantons[canton] || [];
  const matches = useMemo(() => {
    if (singleRegion || commune || communeQuery.trim().length < 2) return [];
    const q = norm(communeQuery.trim());
    return communes.filter(([name]) => norm(name).includes(q)).slice(0, 8);
  }, [communes, communeQuery, commune, singleRegion]);

  // Jamais de région implicite : commune officielle, sinon choix manuel explicite.
  const region = singleRegion
    ? cantonRegions[0]
    : commune ? `R${commune.region}`
    : manualRegion && cantonRegions.includes(manualRegion) ? manualRegion
    : null;
  const profileComplete = region !== null;

  const allowedFr = ageClass === 'KIN' ? CHILD_FR : ADULT_FR;
  const fr = allowedFr.includes(franchise) ? franchise : allowedFr[0];

  const offers = useMemo(() => {
    if (!premiums || !region) return [];
    return premiums.profiles[`${canton}|${region}|${ageClass}|${fr}|${accident ? 1 : 0}`] || [];
  }, [premiums, canton, region, ageClass, fr, accident]);
  const best = offers[0];
  const shown = expanded ? offers : offers.slice(0, 8);

  const modelName = (ins: number, tarif: string) => {
    const m = premiums?.models[`${ins}|${tarif}`];
    if (!m) return tarif === 'BASE' ? t('lamal2027.standardModel') : tarif;
    return (m as any)[lang] || m.fr;
  };

  const pickCanton = (c: string) => {
    setCanton(c); setCommune(null); setCommuneQuery(''); setManualRegion(null); setExpanded(false);
  };
  const pickAge = (a: AgeClass) => {
    setAgeClass(a);
    setFranchise(a === 'KIN' ? 0 : 300);
  };
  const fmtDate = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString();
  };

  const status = data?.status;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="lamal-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="back-button">
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>{t('lamalV2.title')}</Text>
          <Text style={styles.subtitle}>{t('lamalV2.subtitle', { year: status?.year ?? '' })}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Indépendance + état réel des données (aucune promesse non prouvée) */}
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Ionicons name="shield-checkmark" size={14} color={theme.success} />
            <Text style={styles.statusOfficial}>{t('lamalV2.independent')}</Text>
          </View>
          <View style={styles.statusRow}>
            <Ionicons
              name={status?.offline ? 'cloud-offline' : status?.origin === 'bundled' ? 'archive' : 'cloud-done'}
              size={13}
              color={status?.offline ? theme.warning : theme.textSecondary}
            />
            <Text style={[styles.statusTxt, status?.offline && { color: theme.warning }]}>
              {status?.offline
                ? t('lamalV2.statusOffline')
                : status?.origin === 'bundled'
                  ? t('lamalV2.statusBundled', { year: status.year })
                  : t('lamalV2.statusChecked', { date: fmtDate(status?.checkedAt ?? null) ?? '—' })}
            </Text>
          </View>
        </View>

        {/* ── Profil ── */}
        <Card style={styles.card}>
          <Text style={styles.label}>{t('lamalComparator.cantonLabel')}</Text>
          <View style={styles.cantonGrid}>
            {ALL_CANTONS.map((c) => (
              <TouchableOpacity key={c} style={[styles.chip, canton === c && styles.chipOn]} onPress={() => pickCanton(c)}>
                <Text style={[styles.chipTxt, canton === c && styles.chipTxtOn]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Commune → région officielle (clé OFS), jamais de région implicite */}
          <Text style={styles.label}>{t('lamalV2.communeLabel')}</Text>
          {singleRegion ? (
            <View style={styles.singleRegionRow}>
              <Ionicons name="location" size={14} color={theme.success} />
              <Text style={styles.singleRegionTxt}>{t('lamalV2.singleRegion')}</Text>
            </View>
          ) : commune ? (
            <View style={styles.communeSelRow}>
              <Ionicons name="location" size={15} color={theme.primary} />
              <Text style={styles.communeSelTxt}>
                {commune.name} — {t('lamal2027.region')} {commune.region}
              </Text>
              <TouchableOpacity onPress={() => { setCommune(null); setCommuneQuery(''); }} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder={t('lamalV2.communePlaceholder')}
                placeholderTextColor={theme.textTertiary}
                value={communeQuery}
                onChangeText={(v) => { setCommuneQuery(v); setManualRegion(null); }}
                autoCorrect={false}
                testID="commune-search"
              />
              {matches.map(([name, reg]) => (
                <TouchableOpacity key={name} style={styles.matchRow} onPress={() => setCommune({ name, region: reg })}>
                  <Text style={styles.matchName}>{name}</Text>
                  <Text style={styles.matchRegion}>{t('lamal2027.region')} {reg}</Text>
                </TouchableOpacity>
              ))}
              {communeQuery.trim().length >= 2 && matches.length === 0 && (
                <Text style={styles.noMatch}>{t('lamalV2.communeNone')}</Text>
              )}
              {/* Secours explicite : choix manuel de la région officielle */}
              <Text style={styles.manualLabel}>{t('lamalV2.manualRegion')}</Text>
              <View style={styles.rowWrap}>
                {cantonRegions.map((r) => (
                  <TouchableOpacity key={r} style={[styles.chip, manualRegion === r && styles.chipOn]} onPress={() => setManualRegion(r)}>
                    <Text style={[styles.chipTxt, manualRegion === r && styles.chipTxtOn]}>
                      {t('lamal2027.region')} {r.replace('R', '')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <Text style={styles.label}>{t('lamal.age')}</Text>
          <View style={styles.rowWrap}>
            {(['KIN', 'JUG', 'ERW'] as AgeClass[]).map((a) => (
              <TouchableOpacity key={a} style={[styles.chip, ageClass === a && styles.chipOn]} onPress={() => pickAge(a)}>
                <Text style={[styles.chipTxt, ageClass === a && styles.chipTxtOn]}>{t(`lamal2027.age_${a}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>{t('lamal.franchise')}</Text>
          <View style={styles.rowWrap}>
            {allowedFr.map((f) => (
              <TouchableOpacity key={f} style={[styles.chip, fr === f && styles.chipOn]} onPress={() => setFranchise(f)}>
                <Text style={[styles.chipTxt, fr === f && styles.chipTxtOn]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.rowWrap}>
            {[true, false].map((v) => (
              <TouchableOpacity key={String(v)} style={[styles.chip, accident === v && styles.chipOn]} onPress={() => setAccident(v)}>
                <Text style={[styles.chipTxt, accident === v && styles.chipTxtOn]}>
                  {v ? t('lamal2027.withAccident') : t('lamal2027.withoutAccident')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {!profileComplete ? (
          /* Profil incomplet : aucun classement présenté comme personnel */
          <Card style={styles.promptCard}>
            <Ionicons name="pin" size={22} color={theme.primary} />
            <Text style={styles.promptTxt}>{t('lamalV2.selectCommune')}</Text>
          </Card>
        ) : offers.length === 0 ? (
          <Card style={styles.promptCard}>
            <Ionicons name="alert-circle" size={22} color={theme.warning} />
            <Text style={styles.promptTxt}>{t('lamal2027.noData')}</Text>
          </Card>
        ) : (
          <>
            {/* ── Meilleure offre officielle ── */}
            <Card style={styles.bestCard}>
              <Text style={styles.bestLabel} testID="best-offer">{t('lamalV2.bestOffer')}</Text>
              <View style={styles.bestRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bestInsurer}>{premiums!.insurers[best[0]]}</Text>
                  <Text style={styles.bestModel}>{modelName(best[0], best[1])}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.bestAmt}>{best[2].toFixed(2)}</Text>
                  <Text style={styles.bestUnit}>CHF {t('lamal.perMonth')}</Text>
                </View>
              </View>
              <Text style={styles.bestProfile}>
                {t('lamal2027.profile', { canton, age: t(`lamal2027.age_${ageClass}`), fr: String(fr) })}
              </Text>
            </Card>

            {/* ── Classement officiel (≤ 20 assureurs, prime croissante) ── */}
            <Text style={styles.secTitle}>{t('lamal2027.title', { year: premiums!.year })}</Text>
            <Card style={styles.listCard}>
              {shown.map(([ins, tarif, premium], i) => (
                <View key={`${ins}-${tarif}`} style={[styles.row, i === 0 && styles.rowFirst]}>
                  <Text style={[styles.rank, i === 0 && { color: theme.primary }]}>{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.insurer} numberOfLines={1}>{premiums!.insurers[ins]}</Text>
                    <Text style={styles.model} numberOfLines={1}>{modelName(ins, tarif)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.premium, i === 0 && { color: theme.primary }]}>{premium.toFixed(2)}</Text>
                    {i > 0 && <Text style={styles.diff}>+{(premium - best[2]).toFixed(2)}</Text>}
                  </View>
                </View>
              ))}
              {offers.length > 8 && (
                <TouchableOpacity style={styles.moreBtn} onPress={() => setExpanded(!expanded)}>
                  <Text style={styles.moreTxt}>
                    {expanded ? t('lamal2027.showLess') : t('lamal2027.showAll', { n: offers.length })}
                  </Text>
                </TouchableOpacity>
              )}
            </Card>
          </>
        )}

        {/* ── Subsides (écran dédié, simulation explicitement indicative) ── */}
        <TouchableOpacity style={styles.subsidyLink} onPress={() => router.push('/more/lamal-subsidy' as any)}>
          <Ionicons name="heart" size={16} color={theme.success} />
          <Text style={styles.subsidyTxt}>{t('lamalV2.subsidyLink')}</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
        </TouchableOpacity>

        {/* ── Sources, état des données, résiliation ── */}
        <View style={styles.srcCard}>
          <View style={styles.srcInfoRow}>
            <Ionicons name="library" size={15} color={theme.primary} />
            <Text style={styles.srcTitle}>{t('lamalInfo.sourcesTitle')}</Text>
          </View>
          <Text style={styles.srcText}>{t('lamalInfo.sourcesBody', { year: status?.year ?? '' })}</Text>
          {!!fmtDate(status?.publishedAt ?? null) && (
            <Text style={styles.srcText}>{t('lamalV2.publishedAt', { date: fmtDate(status!.publishedAt) })}</Text>
          )}
          {!!fmtDate(status?.checkedAt ?? null) && (
            <Text style={styles.srcText}>{t('lamalV2.checkedAt', { date: fmtDate(status!.checkedAt) })}</Text>
          )}
          <Text style={styles.srcText}>{t('lamalInfo.limitsBody')}</Text>
          <TouchableOpacity
            style={styles.priminfoBtn}
            onPress={() => Linking.openURL('https://www.priminfo.admin.ch')}
          >
            <Ionicons name="open-outline" size={15} color={theme.primary} />
            <Text style={styles.priminfoTxt}>{t('lamalV2.openPriminfo')}</Text>
          </TouchableOpacity>
          <View style={[styles.srcInfoRow, { marginTop: 10 }]}>
            <Ionicons name="calendar" size={15} color={theme.warning} />
            <Text style={styles.srcTitle}>{t('lamalInfo.cancelTitle')}</Text>
          </View>
          <Text style={styles.srcText}>{t('lamalInfo.cancelBody1')}</Text>
          <Text style={styles.srcText}>{t('lamalInfo.cancelBody2')}</Text>
          <Text style={[styles.srcText, { fontStyle: 'italic' }]}>{t('lamalInfo.lcaNote')}</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const makeStyles = (C: ThemePalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  title: { color: C.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  subtitle: { color: C.success, fontSize: FontSizes.xs, fontWeight: FontWeights.bold, marginTop: 1 },
  content: { padding: Spacing.lg },
  statusCard: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
    borderRadius: 14, padding: 12, gap: 6, marginBottom: Spacing.md,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  statusOfficial: { color: C.success, fontSize: 11.5, fontWeight: FontWeights.bold, flex: 1 },
  statusTxt: { color: C.textSecondary, fontSize: 11.5, flex: 1 },
  card: { marginBottom: Spacing.md },
  label: { color: C.textSecondary, fontSize: FontSizes.sm, marginBottom: Spacing.sm, marginTop: Spacing.md },
  cantonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
  },
  chipOn: { backgroundColor: `${C.primary}20`, borderColor: C.primary },
  chipTxt: { color: C.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  chipTxtOn: { color: C.primary },
  input: {
    backgroundColor: C.background, borderWidth: 1, borderColor: C.cardBorder, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 10, color: C.text, fontSize: FontSizes.sm,
  },
  matchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 9, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.cardBorder,
  },
  matchName: { color: C.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, flex: 1 },
  matchRegion: { color: C.primary, fontSize: FontSizes.xs, fontWeight: FontWeights.bold },
  noMatch: { color: C.textTertiary, fontSize: FontSizes.xs, marginTop: Spacing.sm },
  manualLabel: { color: C.textTertiary, fontSize: FontSizes.xs, marginTop: Spacing.md, marginBottom: Spacing.sm },
  communeSelRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${C.primary}12`, borderWidth: 1, borderColor: `${C.primary}40`,
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 10,
  },
  communeSelTxt: { color: C.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, flex: 1 },
  singleRegionRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  singleRegionTxt: { color: C.textSecondary, fontSize: FontSizes.sm },
  promptCard: { alignItems: 'center', gap: 8, paddingVertical: Spacing.xl, marginBottom: Spacing.md },
  promptTxt: { color: C.textSecondary, fontSize: FontSizes.sm, textAlign: 'center', lineHeight: 20, paddingHorizontal: Spacing.md },
  bestCard: { backgroundColor: `${C.success}08`, borderColor: `${C.success}30`, marginBottom: Spacing.md },
  bestLabel: { color: C.success, fontSize: FontSizes.xs, fontWeight: FontWeights.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  bestRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm },
  bestInsurer: { color: C.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
  bestModel: { color: C.textSecondary, fontSize: FontSizes.sm, marginTop: 2 },
  bestAmt: { color: C.success, fontSize: FontSizes.xxxl, fontWeight: FontWeights.black, fontVariant: ['tabular-nums'] },
  bestUnit: { color: C.textSecondary, fontSize: FontSizes.xs },
  bestProfile: { color: C.textTertiary, fontSize: FontSizes.xs, marginTop: Spacing.sm, lineHeight: 16 },
  secTitle: { color: C.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold, marginBottom: Spacing.sm },
  listCard: { marginBottom: Spacing.md },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.cardBorder,
  },
  rowFirst: { borderTopWidth: 0 },
  rank: { width: 22, color: C.textSecondary, fontSize: 12.5, fontWeight: FontWeights.black, textAlign: 'center' },
  insurer: { color: C.text, fontSize: 13.5, fontWeight: FontWeights.bold },
  model: { color: C.textSecondary, fontSize: 11.5, marginTop: 1 },
  premium: { color: C.text, fontSize: 14.5, fontWeight: FontWeights.black, fontVariant: ['tabular-nums'] },
  diff: { color: C.textSecondary, fontSize: 10.5, marginTop: 1 },
  moreBtn: { alignItems: 'center', paddingVertical: 8 },
  moreTxt: { color: C.primary, fontSize: 12.5, fontWeight: FontWeights.bold },
  subsidyLink: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
    borderRadius: 14, paddingHorizontal: Spacing.md, paddingVertical: 12, marginBottom: Spacing.md,
  },
  subsidyTxt: { color: C.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, flex: 1 },
  srcCard: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
    borderRadius: 16, padding: 14, gap: 6,
  },
  srcInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  srcTitle: { color: C.text, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  srcText: { color: C.textSecondary, fontSize: 12, lineHeight: 17 },
  priminfoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: `${C.primary}50`, borderRadius: BorderRadius.md,
    paddingVertical: 10, marginTop: 6,
  },
  priminfoTxt: { color: C.primary, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
});
