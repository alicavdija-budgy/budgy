/**
 * BUDGY — Réglages « Widgets et Siri » (iOS).
 * Confidentialité par défaut : montants écran verrouillé et montants via
 * Siri désactivés tant que l'utilisateur ne les active pas explicitement.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, Platform, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../src/hooks/useTheme';
import { useTranslation } from '../../src/hooks/useTranslation';
import {
  WIDGET_PREF_KEYS, refreshWidgetSnapshot, widgetBridgeAvailable,
} from '../../src/services/widgetBridge';

export default function WidgetsSettingsScreen() {
  const C: any = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [enabled, setEnabled] = useState(true);
  const [lockAmounts, setLockAmounts] = useState(false);
  const [siriAmounts, setSiriAmounts] = useState(false);

  useEffect(() => {
    (async () => {
      const [e, l, s] = await Promise.all([
        AsyncStorage.getItem(WIDGET_PREF_KEYS.enabled),
        AsyncStorage.getItem(WIDGET_PREF_KEYS.lockAmounts),
        AsyncStorage.getItem(WIDGET_PREF_KEYS.siriAmounts),
      ]);
      setEnabled(e !== '0');
      setLockAmounts(l === '1');
      setSiriAmounts(s === '1');
    })().catch(() => {});
  }, []);

  const save = (key: string, value: boolean, set: (v: boolean) => void) => {
    set(value);
    AsyncStorage.setItem(key, value ? '1' : '0')
      .then(() => refreshWidgetSnapshot())
      .catch(() => {});
  };

  const rows: { key: string; value: boolean; set: (v: boolean) => void; title: string; sub: string; icon: any }[] = [
    {
      key: WIDGET_PREF_KEYS.enabled, value: enabled, set: setEnabled,
      title: t('widgets.enable'), sub: t('widgets.enableSub'), icon: 'apps',
    },
    {
      key: WIDGET_PREF_KEYS.lockAmounts, value: lockAmounts, set: setLockAmounts,
      title: t('widgets.lockAmounts'), sub: t('widgets.lockAmountsSub'), icon: 'lock-closed',
    },
    {
      key: WIDGET_PREF_KEYS.siriAmounts, value: siriAmounts, set: setSiriAmounts,
      title: t('widgets.siriAmounts'), sub: t('widgets.siriAmountsSub'), icon: 'mic',
    },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('widgets.title')}</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 32, gap: 12 }}>
        {Platform.OS !== 'ios' ? (
          <View style={styles.infoCard}>
            <Ionicons name="logo-apple" size={18} color={C.textSecondary} />
            <Text style={styles.infoText}>{t('widgets.iosOnly')}</Text>
          </View>
        ) : !widgetBridgeAvailable() ? (
          <View style={styles.infoCard}>
            <Ionicons name="construct" size={18} color={C.textSecondary} />
            <Text style={styles.infoText}>{t('widgets.needsBuild')}</Text>
          </View>
        ) : null}

        {rows.map((r) => (
          <View key={r.key} style={styles.row}>
            <View style={styles.iconWrap}>
              <Ionicons name={r.icon} size={17} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{r.title}</Text>
              <Text style={styles.rowSub}>{r.sub}</Text>
            </View>
            <Switch
              value={r.value}
              onValueChange={(v) => save(r.key, v, r.set)}
              trackColor={{ true: C.primary }}
            />
          </View>
        ))}

        <View style={styles.privacyCard}>
          <Ionicons name="shield-checkmark" size={16} color={C.success} />
          <Text style={styles.privacyText}>{t('widgets.privacyNote')}</Text>
        </View>

        <View style={styles.privacyCard}>
          <Ionicons name="sparkles" size={16} color={C.primary} />
          <Text style={styles.privacyText}>{t('widgets.siriHint')}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 10,
    },
    headerTitle: { color: C.text, fontSize: 17, fontWeight: '800' },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
      borderRadius: 16, padding: 14,
    },
    iconWrap: {
      width: 34, height: 34, borderRadius: 10, backgroundColor: C.primary + '14',
      alignItems: 'center', justifyContent: 'center',
    },
    rowTitle: { color: C.text, fontSize: 14.5, fontWeight: '700' },
    rowSub: { color: C.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 16 },
    infoCard: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
      borderRadius: 14, padding: 12,
    },
    infoText: { flex: 1, color: C.textSecondary, fontSize: 12.5, lineHeight: 17 },
    privacyCard: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
      borderRadius: 14, padding: 12, backgroundColor: C.surfaceAlt || C.surface,
      borderWidth: 1, borderColor: C.border,
    },
    privacyText: { flex: 1, color: C.textSecondary, fontSize: 12, lineHeight: 17 },
  });
