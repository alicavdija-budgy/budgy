/**
 * Budgy PRO — Dossier fiscal intelligent 2026/2027
 * Private user-checked preparation checklist, not a tax filing service.
 * Small non-file checklist state is stored in iOS Keychain / Android Keystore
 * via expo-secure-store, scoped by account and tax year. No API calls.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useStore } from '../../src/stores/useStore';
import { useTheme } from '../../src/hooks/useTheme';
import { useTranslation } from '../../src/hooks/useTranslation';
import {
  TAX_DOCUMENT_KEYS, EMPTY_DOSSIER,
  isValidDossier, planPillar3a, findTaxPreparationSignals,
  type TaxYear, type PensionMode, type DossierState, type TaxDocumentKey
} from '../../src/lib/swissTaxDossier';

const OFFICIAL_3A = 'https://www.estv.admin.ch/fr/taux-interet-deductions-maximales-pilier-3a-impot-federal-direct';
const OFFICIAL_TAX = 'https://www.estv.admin.ch/fr/simulateur-fiscal-calculer-vos-impots';
const OFFICIAL_BUYBACK = 'https://www.bsv.admin.ch/fr/le-troisieme-pilier';
const fmt = (x: number) => x.toLocaleString('fr-CH', { maximumFractionDigits: 2, minimumFractionDigits: 0 }).replace(/\u00a0/g, ' ');

export default function TaxDossierScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const C = useTheme();
  const { t } = useTranslation();
  const owner = useStore((s) => s.user?.id);
  const transactions = useStore((s) => s.transactions);
  const [year, setYear] = useState<TaxYear>(2026);
  const [record, setRecord] = useState<{ key: string; data: DossierState } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const current = useRef<DossierState>({ ...EMPTY_DOSSIER });
  const writes = useRef<Promise<void>>(Promise.resolve());
  const key = useMemo(() =>
    `budgy.tax.dossier.${year}.${String(owner || 'guest').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80)}`,
    [year, owner]);
  const ready = !loadError && record?.key === key;
  const data = ready ? record!.data : EMPTY_DOSSIER;
  const plan = planPillar3a(year, data.pension, data.paid3a, data.avsIncome);
  const signals = useMemo(() => findTaxPreparationSignals(transactions, year), [transactions, year]);
  const done = data.checked.length;
  const pct = Math.round(done / TAX_DOCUMENT_KEYS.length * 100);

  useEffect(() => {
    let alive = true;
    setLoadError(false);
    setSaveError(false);
    // Never persist old-account checklist into the new account during switch.
    void SecureStore.getItemAsync(key).then(raw => {
      if (!alive) return;
      let parsed: DossierState = { ...EMPTY_DOSSIER };
      if (raw) {
        try {
          const v: unknown = JSON.parse(raw);
          if (isValidDossier(v)) parsed = v;
        } catch { /* malformed older local state: refuse, keep original in Keychain */ }
      }
      current.current = parsed;
      setRecord({ key, data: parsed });
    }).catch(() => {
      if (alive) { setLoadError(true); setRecord(null); }
    });
    return () => { alive = false; };
  }, [key]);

  const save = (next: DossierState) => {
    if (!ready) return;
    current.current = next;
    setRecord({ key, data: next });
    // Serialized writes avoid race conditions on rapid checkbox taps.
    writes.current = writes.current.catch(() => {}).then(async () => {
      await SecureStore.setItemAsync(key, JSON.stringify(next));
    }).catch(() => { setSaveError(true); });
  };
  const patch = (p: Partial<DossierState>) => save({ ...current.current, ...p });
  const toggle = (id: TaxDocumentKey) => {
    if (!ready) return;
    const checked = current.current.checked;
    patch({ checked: checked.includes(id) ? checked.filter(x => x !== id) : [...checked, id] });
  };
  const open = (url: string) => { void Linking.openURL(url).catch(() => {}); };

  const styles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.background },
    top: { flexDirection: 'row', paddingHorizontal: 20, alignItems: 'center', gap: 12, marginTop: 10, marginBottom: 18 },
    title: { color: C.text, fontSize: 23, fontWeight: '800', flex: 1 },
    body: { paddingHorizontal: 20, paddingBottom: insets.bottom + 50 },
    card: { borderRadius: 22, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, padding: 18, marginBottom: 16 },
    section: { color: C.text, fontSize: 18, fontWeight: '800', marginBottom: 10 },
    desc: { color: C.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 10 },
    item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.cardBorder },
    itemText: { color: C.text, fontSize: 15, flex: 1, lineHeight: 21 },
    chip: { paddingHorizontal: 15, paddingVertical: 11, borderRadius: 13, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.background },
    input: { borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.background, borderRadius: 13,
      color: C.text, padding: 14, fontSize: 18, fontWeight: '600', marginBottom: 13 },
    label: { color: C.textSecondary, fontSize: 13, marginBottom: 6 },
    link: { color: C.primary, fontWeight: '700', paddingVertical: 8, lineHeight: 20 },
    note: { color: C.textSecondary, fontSize: 12, lineHeight: 18 },
  }), [C, insets.bottom]);

  const yearButton = (candidate: TaxYear) => (
    <TouchableOpacity accessibilityRole="button" onPress={() => setYear(candidate)}
      style={[styles.chip, { flex: 1, alignItems: 'center' },
        year === candidate && { borderColor: C.primary, backgroundColor: C.primary + '22' }]}>
      <Text style={{ color: year === candidate ? C.primary : C.text, fontWeight: '800' }}>{candidate}</Text>
    </TouchableOpacity>
  );
  const pensionButton = (id: PensionMode, text: string) => (
    <TouchableOpacity accessibilityRole="button" disabled={!ready} onPress={() => patch({ pension: id })}
      style={[styles.chip, { flex: 1, alignItems: 'center' },
        data.pension === id && { borderColor: C.primary, backgroundColor: C.primary + '22' }]}>
      <Text style={{ color: data.pension === id ? C.primary : C.text, fontWeight: '700', fontSize: 12, textAlign: 'center' }}>{text}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel={t('common.back')} accessibilityRole="button">
          <Ionicons name="chevron-back" size={27} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('taxDossier.title')}</Text>
        <Ionicons name="shield-checkmark-outline" size={24} color={C.primary} />
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.section}>{t('taxDossier.yearTitle')}</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            {yearButton(2026)}{yearButton(2027)}
          </View>
          <Text style={styles.desc}>{t('taxDossier.yearExplanation', { year })}</Text>
          <Text style={styles.note}>{t('taxDossier.privacy')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>{t('taxDossier.pillarTitle')}</Text>
          <Text style={styles.desc}>{t('taxDossier.pillarExplanation')}</Text>
          <View style={{ flexDirection: 'row', gap: 7, marginBottom: 15 }}>
            {pensionButton('with_lpp', t('taxDossier.withLpp'))}
            {pensionButton('without_lpp', t('taxDossier.withoutLpp'))}
            {pensionButton('unknown', t('taxDossier.notSure'))}
          </View>
          {data.pension === 'without_lpp' && (
            <>
              <Text style={styles.label}>{t('taxDossier.avsIncome')}</Text>
              <TextInput value={data.avsIncome} editable={!!ready}
                onChangeText={v => patch({ avsIncome: v })}
                style={styles.input} placeholder={t('taxDossier.amountPlaceholder')}
                placeholderTextColor={C.textTertiary} keyboardType="decimal-pad"/>
            </>
          )}
          <Text style={styles.label}>{t('taxDossier.paidThisYear', { year })}</Text>
          <TextInput value={data.paid3a} editable={!!ready}
            onChangeText={v => patch({ paid3a: v })}
            style={styles.input} placeholder={t('taxDossier.amountPlaceholder')}
            placeholderTextColor={C.textTertiary} keyboardType="decimal-pad"/>
          {plan.reason === 'ok' ? (
            <View style={{ gap: 5, paddingVertical: 8 }}>
              <Text style={{ color: C.textSecondary }}>{t('taxDossier.maxCap')}</Text>
              <Text style={{ color: C.primary, fontSize: 30, fontWeight: '900' }}>CHF {fmt(plan.cap!)}</Text>
              <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{t('taxDossier.remaining')}: CHF {fmt(plan.remaining!)}</Text>
              {plan.overLimit && <Text style={{ color: C.error }}>{t('taxDossier.exceedLimit')}</Text>}
            </View>
          ) : <Text style={styles.desc}>{t(`taxDossier.${plan.reason}`)}</Text>}
          <Text style={styles.note}>{t('taxDossier.capDisclaimer')}</Text>
          <TouchableOpacity accessibilityRole="link" onPress={() => open(OFFICIAL_3A)}>
            <Text style={styles.link}>{t('taxDossier.official3a')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>{t('taxDossier.buybackTitle')}</Text>
          <Text style={styles.desc}>{t('taxDossier.buybackExplanation')}</Text>
          <TouchableOpacity accessibilityRole="link" onPress={() => open(OFFICIAL_BUYBACK)}>
            <Text style={styles.link}>{t('taxDossier.buybackSource')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>{t('taxDossier.signalsTitle')}</Text>
          <Text style={styles.desc}>{t('taxDossier.signalsIntro', { year })}</Text>
          {signals.length === 0 ? (
            <Text style={styles.desc}>{t('taxDossier.signalsEmpty')}</Text>
          ) : signals.map((signal) => (
            <View key={signal.document} style={styles.item}>
              <Ionicons name="search-outline" size={22} color={C.primary}/>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemText}>{t(`taxDossier.docs.${signal.document}`)}</Text>
                <Text style={styles.note}>{t('taxDossier.signalsCount', { n: signal.count })}</Text>
              </View>
              <Text style={{ color: C.text, fontSize: 13, fontWeight: '700' }}>CHF {fmt(signal.observedCHF)}</Text>
            </View>
          ))}
          <Text style={[styles.note, { marginTop: 12 }]}>{t('taxDossier.signalsDisclaimer')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>{t('taxDossier.checklistTitle')}</Text>
          <Text style={styles.desc}>{t('taxDossier.checklistSub')}</Text>
          <Text style={{ color: C.primary, fontSize: 26, fontWeight: '800', marginBottom: 8 }}>{pct}%</Text>
          <View style={{ backgroundColor: C.cardBorder, height: 7, borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
            <View style={{ backgroundColor: C.primary, height: '100%', width: `${pct}%` }}/>
          </View>
          {TAX_DOCUMENT_KEYS.map((id, index) => (
            <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: data.checked.includes(id) }}
              key={id} disabled={!ready} onPress={() => toggle(id)} style={[styles.item,
                index === TAX_DOCUMENT_KEYS.length - 1 && { borderBottomWidth: 0 }]}>
              <Ionicons name={data.checked.includes(id) ? 'checkmark-circle' : 'ellipse-outline'}
                size={24} color={data.checked.includes(id) ? C.primary : C.textTertiary}/>
              <Text style={styles.itemText}>{t(`taxDossier.docs.${id}`)}</Text>
            </TouchableOpacity>
          ))}
          <Text style={[styles.note, { marginTop: 12 }]}>{t('taxDossier.checklistDisclaimer')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>{t('taxDossier.nextSteps')}</Text>
          <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/more/documents' as any)}>
            <Text style={styles.link}>{t('taxDossier.openBinder')}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="link" onPress={() => open(OFFICIAL_TAX)}>
            <Text style={styles.link}>{t('taxDossier.openOfficialCalculator')}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/more/tax-optimizer' as any)}>
            <Text style={styles.link}>{t('taxDossier.openEstimate')}</Text>
          </TouchableOpacity>
          <Text style={styles.note}>{t('taxDossier.notFiled')}</Text>
        </View>
        {loadError && <Text style={{ color: C.error }}>{t('taxDossier.storageError')}</Text>}
        {saveError && <Text style={{ color: C.error }}>{t('taxDossier.saveError')}</Text>}
        {!ready && !loadError && <Text style={styles.desc}>{t('taxDossier.loading')}</Text>}
      </ScrollView>
    </View>
  );
}
