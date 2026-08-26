/**
 * GUARDIAN MONEY CHF - Security Settings
 * - App lock toggle
 * - Set/change/remove PIN
 * - Biometric toggle
 * - Decoy/panic PIN
 * - Auto-lock timing
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Modal,
  Alert,
  Vibration,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import type { ThemePalette } from '../../src/constants/palettes';
import { useStore } from '../../src/stores/useStore';
import { Card, Button } from '../../src/components/ui';
import { setPin, setDecoyPin, isBiometricAvailable, requestBiometric } from '../../src/services/security';
import { useTranslation } from '../../src/hooks/useTranslation';

type PinModalKind = 'main-set' | 'main-change' | 'decoy' | null;

export default function SecurityScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { security, setSecurity, transactions, receipts, documents } = useStore();
  const [bioAvail, setBioAvail] = useState(false);
  const [pinModal, setPinModal] = useState<PinModalKind>(null);
  const [pin, setPinValue] = useState('');
  const [pinStep, setPinStep] = useState<'first' | 'confirm'>('first');
  const [firstPin, setFirstPin] = useState('');

  useEffect(() => {
    isBiometricAvailable().then(setBioAvail);
  }, []);

  const openSetMain = () => {
    setFirstPin('');
    setPinValue('');
    setPinStep('first');
    setPinModal('main-set');
  };

  const openDecoy = () => {
    setFirstPin('');
    setPinValue('');
    setPinStep('first');
    setPinModal('decoy');
  };

  const removePin = () => {
    Alert.alert(t('security.disableLockTitle'), t('security.disableLockBody'), [
      { text: t('security.cancel'), style: 'cancel' },
      {
        text: t('security.disable'), style: 'destructive', onPress: () => {
          setSecurity({ appLockEnabled: false, pinHash: undefined, biometricEnabled: false });
        }
      }
    ]);
  };

  const removeDecoy = () => {
    setDecoyPin(null).then(() => setSecurity({ decoyPinHash: undefined }));
  };

  const onDigit = async (d: string) => {
    if (pin.length >= 6) return;
    const next = pin + d;
    setPinValue(next);
    if (next.length === 6) {
      setTimeout(async () => {
        if (pinStep === 'first') {
          setFirstPin(next);
          setPinValue('');
          setPinStep('confirm');
        } else {
          // confirm
          if (next !== firstPin) {
            if (Platform.OS !== 'web') Vibration.vibrate(120);
            Alert.alert(t('security.pinMismatch'), t('security.pinMismatchBody'));
            setPinValue('');
            setFirstPin('');
            setPinStep('first');
            return;
          }
          if (pinModal === 'main-set' || pinModal === 'main-change') {
            const h = await setPin(next);
            setSecurity({ appLockEnabled: true, pinHash: h });
          } else if (pinModal === 'decoy') {
            const h = await setDecoyPin(next);
            if (h) setSecurity({ decoyPinHash: h });
          }
          setPinModal(null);
        }
      }, 100);
    }
  };

  const onBack = () => {
    setPinValue((p) => p.slice(0, -1));
  };

  const enableBiometric = async () => {
    if (!bioAvail) {
      Alert.alert(t('security.biometricUnavailable'), t('security.biometricSetup'));
      return;
    }
    const ok = await requestBiometric(t('security.verifyIdentity'));
    if (ok) setSecurity({ biometricEnabled: true });
  };

  const dots = Array.from({ length: 6 }, (_, i) => i < pin.length);
  const dataCount = transactions.length + receipts.length + documents.length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('security.title')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + 40 }}>
        <LinearGradient colors={['#10B981', '#059669']} style={styles.hero}>
          <Ionicons name="shield-checkmark" size={36} color={theme.text} />
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>{t('security.heroTitle')}</Text>
            <Text style={styles.heroSub}>{t('security.heroSub', { n: dataCount })}</Text>
          </View>
        </LinearGradient>

        <Text style={styles.section}>{t('security.sectionLock')}</Text>
        <Card style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="lock-closed" size={22} color={theme.primaryLight} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{t('security.appLock')}</Text>
              <Text style={styles.rowSub}>{security.appLockEnabled ? t('security.activeLockPin') : t('security.inactive')}</Text>
            </View>
            <Switch
              value={security.appLockEnabled}
              onValueChange={(v) => {
                if (v) openSetMain();
                else removePin();
              }}
              thumbColor={security.appLockEnabled ? theme.primary : '#9CA3AF'}
              trackColor={{ true: `${theme.primary}80`, false: '#374151' }}
            />
          </View>
          {security.appLockEnabled && (
            <>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.row} onPress={openSetMain}>
                <Ionicons name="key-outline" size={22} color={theme.text} />
                <Text style={[styles.rowTitle, { flex: 1 }]}>{t('security.changePin')}</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
              </TouchableOpacity>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Ionicons name="finger-print" size={22} color={theme.success} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Face ID / Touch ID</Text>
                  <Text style={styles.rowSub}>{bioAvail ? (security.biometricEnabled ? t('security.enabled') : t('security.available')) : t('security.unavailableDevice')}</Text>
                </View>
                <Switch
                  value={security.biometricEnabled}
                  onValueChange={(v) => v ? enableBiometric() : setSecurity({ biometricEnabled: false })}
                  disabled={!bioAvail}
                  thumbColor={security.biometricEnabled ? theme.success : '#9CA3AF'}
                  trackColor={{ true: `${theme.success}80`, false: '#374151' }}
                />
              </View>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Ionicons name="timer-outline" size={22} color={theme.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{t('security.autoLock')}</Text>
                  <Text style={styles.rowSub}>{t('security.autoLockSub', { n: security.autoLockSeconds })}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[15, 60, 300].map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.timeChip, security.autoLockSeconds === s && styles.timeChipActive]}
                      onPress={() => setSecurity({ autoLockSeconds: s })}
                    >
                      <Text style={[styles.timeChipText, security.autoLockSeconds === s && styles.timeChipTextActive]}>
                        {s < 60 ? `${s}s` : `${s/60}m`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </>
          )}
        </Card>

        {security.appLockEnabled && (
          <>
            <Text style={styles.section}>{t('security.sectionPanic')}</Text>
            <Card style={styles.card}>
              <View style={styles.row}>
                <Ionicons name="swap-horizontal" size={22} color={theme.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{t('security.decoyCode')}</Text>
                  <Text style={styles.rowSub}>
                    {security.decoyPinHash ? t('security.panicConfigured') : t('security.inactive')}
                  </Text>
                </View>
                {security.decoyPinHash ? (
                  <Button title={t('security.remove')} variant="danger" size="sm" onPress={removeDecoy} />
                ) : (
                  <Button title={t('security.configure')} size="sm" onPress={openDecoy} />
                )}
              </View>
              <View style={styles.divider} />
              <Text style={styles.helperText}>
                {t('security.panicHelper')}
              </Text>
            </Card>
          </>
        )}

        <Text style={styles.section}>{t('security.sectionStorage')}</Text>
        <Card style={styles.card}>
          <View style={styles.statRow}>
            <Ionicons name="phone-portrait-outline" size={20} color={theme.primaryLight} />
            <Text style={styles.statLabel}>{t('security.storageDevice')}</Text>
            <Text style={styles.statValue}>{t('security.storageItems', { n: dataCount })}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.statRow}>
            <Ionicons name="cloud-offline-outline" size={20} color={theme.textTertiary} />
            <Text style={styles.statLabel}>{t('security.storageBackend')}</Text>
            <Text style={styles.statValueDim}>{t('security.storageBackendValue')}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.statRow}>
            <Ionicons name="server-outline" size={20} color={theme.success} />
            <Text style={styles.statLabel}>{t('security.storageSupabase')}</Text>
            <Text style={styles.statValue}>{t('security.storageConfigured')}</Text>
          </View>
        </Card>

        <Text style={styles.helperText}>
          {t('security.storageHelper')}
        </Text>
      </ScrollView>

      {/* PIN Modal */}
      <Modal visible={!!pinModal} transparent animationType="fade" onRequestClose={() => setPinModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pinCard}>
            <Text style={styles.pinTitle}>
              {pinModal === 'decoy' ? t('security.pinPanicTitle') : (security.appLockEnabled ? t('security.pinNew') : t('security.pinCreate'))}
            </Text>
            <Text style={styles.pinSubtitle}>
              {pinStep === 'first' ? t('security.pinEnter6') : t('security.pinConfirm')}
            </Text>
            <View style={styles.dotsRow}>
              {dots.map((filled, i) => (
                <View key={i} style={[styles.dot, filled && styles.dotFilled]} />
              ))}
            </View>
            <View style={styles.keypad}>
              {[['1','2','3'],['4','5','6'],['7','8','9'],['', '0', 'back']].map((row, ri) => (
                <View key={ri} style={styles.keyRow}>
                  {row.map((k, ki) => {
                    if (k === '') return <View key={ki} style={styles.key} />;
                    if (k === 'back') {
                      return (
                        <TouchableOpacity key="back" style={styles.key} onPress={onBack}>
                          <Ionicons name="backspace-outline" size={22} color={theme.text} />
                        </TouchableOpacity>
                      );
                    }
                    return (
                      <TouchableOpacity key={k} style={styles.key} onPress={() => onDigit(k)}>
                        <Text style={styles.keyText}>{k}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
            <Button title={t('security.cancel')} variant="ghost" onPress={() => setPinModal(null)} fullWidth />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (Colors: ThemePalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  hero: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: BorderRadius.xl, padding: Spacing.lg, marginBottom: Spacing.lg,
  },
  heroTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: FontSizes.xs, marginTop: 2 },
  section: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.bold, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  card: { padding: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  rowTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  rowSub: { color: Colors.textTertiary, fontSize: FontSizes.xs, marginTop: 2 },
  divider: { height: 1, backgroundColor: Colors.cardBorder },
  helperText: { color: Colors.textTertiary, fontSize: FontSizes.xs, padding: Spacing.md, lineHeight: 18 },

  timeChip: {
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.cardBorder,
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: BorderRadius.md,
  },
  timeChipActive: { backgroundColor: `${Colors.warning}25`, borderColor: Colors.warning },
  timeChipText: { color: Colors.textSecondary, fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
  timeChipTextActive: { color: Colors.warning },

  statRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  statLabel: { flex: 1, color: Colors.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  statValue: { color: Colors.success, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  statValueDim: { color: Colors.textTertiary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },

  // PIN Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  pinCard: {
    backgroundColor: Colors.backgroundSecondary, borderRadius: BorderRadius.xxl,
    padding: Spacing.xl, width: '100%', maxWidth: 360, alignItems: 'center',
  },
  pinTitle: { color: Colors.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold, marginBottom: 6 },
  pinSubtitle: { color: Colors.textSecondary, fontSize: FontSizes.sm, marginBottom: Spacing.lg },
  dotsRow: { flexDirection: 'row', gap: 12, marginBottom: Spacing.lg },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: Colors.cardBorder },
  dotFilled: { backgroundColor: Colors.primaryLight, borderColor: Colors.primaryLight },
  keypad: { gap: Spacing.sm, marginBottom: Spacing.lg },
  keyRow: { flexDirection: 'row', gap: Spacing.md },
  key: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  keyText: { color: Colors.text, fontSize: 26, fontWeight: FontWeights.bold },
});
