/**
 * BUDGY — Classement officiel des primes AOS (OFSP / Priminfo).
 * Données réelles embarquées : src/data/priminfo-2027.json (175'866 offres
 * approuvées, 26 cantons, 32 assureurs, généré par scripts/build-lamal-data.mjs
 * depuis Prämien_CH.csv + Tarife.csv + liste officielle des assureurs).
 * Jusqu'à 20 assureurs les moins chers pour le profil : offre admissible la
 * moins chère par assureur, nom du modèle affiché. Aucune caisse favorisée.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../hooks/useTranslation';

// Chargé une seule fois (755 Ko, parse unique au premier rendu du comparateur)

const DATA = require('../data/priminfo-2027.json') as {
  year: number; surveyYear: number; source: string;
  insurers: Record<string, string>;
  models: Record<string, { type: string; fr: string; de: string; it: string; en: string }>;
  profiles: Record<string, [number, string, number][]>;
};

const ADULT_FR = [300, 500, 1000, 1500, 2000, 2500];
const CHILD_FR = [0, 100, 200, 300, 400, 600];

type Props = {
  theme: any;
  canton: string;
  age: number;
  franchise: number;
  lang: string;
};

export default function LamalOfficial2027({ theme: T, canton, age, franchise, lang }: Props) {
  const { t } = useTranslation();
  const [accident, setAccident] = useState(true);
  const [region, setRegion] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const ageClass = age < 19 ? 'KIN' : age < 26 ? 'JUG' : 'ERW';
  const allowedFr = ageClass === 'KIN' ? CHILD_FR : ADULT_FR;
  // Franchise admissible selon l'âge (jamais une franchise adulte pour un enfant)
  const fr = allowedFr.includes(franchise) ? franchise : ageClass === 'KIN' ? 300 : 300;

  // Régions de prime réellement disponibles pour ce canton
  const regions = useMemo(() => {
    const set = new Set<string>();
    for (const key of Object.keys(DATA.profiles)) {
      if (key.startsWith(`${canton}|`)) set.add(key.split('|')[1]);
    }
    return [...set].sort();
  }, [canton]);
  const reg = region && regions.includes(region) ? region : regions[0];

  const offers = useMemo(() => {
    if (!reg) return [];
    return DATA.profiles[`${canton}|${reg}|${ageClass}|${fr}|${accident ? 1 : 0}`] || [];
  }, [canton, reg, ageClass, fr, accident]);

  const modelName = (ins: number, tarif: string) => {
    const m = DATA.models[`${ins}|${tarif}`];
    if (!m) return tarif === 'BASE' ? t('lamal2027.standardModel') : tarif;
    return (m as any)[lang] || m.fr;
  };

  const shown = expanded ? offers : offers.slice(0, 8);
  const styles = useMemo(() => makeStyles(T), [T]);

  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <Ionicons name="ribbon" size={16} color={T.primary} />
        <Text style={styles.title}>{t('lamal2027.title', { year: DATA.year })}</Text>
      </View>
      <Text style={styles.sub}>
        {t('lamal2027.profile', { canton, age: t(`lamal2027.age_${ageClass}`), fr: String(fr) })}
      </Text>

      {/* Région de prime + couverture accident */}
      <View style={styles.chipsRow}>
        {regions.map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.chip, reg === r && styles.chipOn]}
            onPress={() => setRegion(r)}
          >
            <Text style={[styles.chipTxt, reg === r && { color: T.primary }]}>
              {t('lamal2027.region')} {r.replace('R', '') || '0'}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[styles.chip, accident && styles.chipOn]} onPress={() => setAccident(!accident)}>
          <Text style={[styles.chipTxt, accident && { color: T.primary }]}>
            {accident ? t('lamal2027.withAccident') : t('lamal2027.withoutAccident')}
          </Text>
        </TouchableOpacity>
      </View>

      {offers.length === 0 ? (
        <Text style={styles.empty}>{t('lamal2027.noData')}</Text>
      ) : (
        <>
          {shown.map(([ins, tarif, premium], i) => (
            <View key={`${ins}-${tarif}`} style={[styles.row, i === 0 && styles.rowBest]}>
              <Text style={[styles.rank, i === 0 && { color: T.primary }]}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.insurer} numberOfLines={1}>{DATA.insurers[ins]}</Text>
                <Text style={styles.model} numberOfLines={1}>{modelName(ins, tarif)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.premium, i === 0 && { color: T.primary }]}>
                  {premium.toFixed(2)}
                </Text>
                {i > 0 && (
                  <Text style={styles.diff}>+{(premium - offers[0][2]).toFixed(2)}</Text>
                )}
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
        </>
      )}
      <Text style={styles.srcNote}>
        {t('lamal2027.sourceNote', { year: DATA.year, survey: DATA.surveyYear })}
      </Text>
    </View>
  );
}

const makeStyles = (T: any) =>
  StyleSheet.create({
    card: { backgroundColor: T.card, borderWidth: 1, borderColor: T.cardBorder, borderRadius: 16, padding: 14, marginTop: 14 },
    headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { color: T.text, fontSize: 14.5, fontWeight: '800', flex: 1 },
    sub: { color: T.textSecondary, fontSize: 12, marginTop: 4 },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 },
    chip: { borderWidth: 1, borderColor: T.cardBorder, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
    chipOn: { borderColor: T.primary, backgroundColor: `${T.primary}18` },
    chipTxt: { color: T.textSecondary, fontSize: 12, fontWeight: '700' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: T.cardBorder },
    rowBest: { borderTopWidth: 0 },
    rank: { width: 20, color: T.textSecondary, fontSize: 12.5, fontWeight: '800', textAlign: 'center' },
    insurer: { color: T.text, fontSize: 13.5, fontWeight: '700' },
    model: { color: T.textSecondary, fontSize: 11.5, marginTop: 1 },
    premium: { color: T.text, fontSize: 14.5, fontWeight: '800', fontVariant: ['tabular-nums'] },
    diff: { color: T.textSecondary, fontSize: 10.5, marginTop: 1 },
    empty: { color: T.textSecondary, fontSize: 12.5, paddingVertical: 10 },
    moreBtn: { alignItems: 'center', paddingVertical: 8 },
    moreTxt: { color: T.primary, fontSize: 12.5, fontWeight: '700' },
    srcNote: { color: T.textSecondary, fontSize: 10.5, lineHeight: 14, marginTop: 8 },
  });
