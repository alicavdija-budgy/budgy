/**
 * GUARDIAN MONEY CHF - Security Settings
 * - App lock toggle
 * - Set/change/remove PIN
 * - Biometric toggle
 * - Decoy/panic PIN
 * - Auto-lock timing
 */

import React, { useState, useEffect } from 'react';
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
import { useStore } from '../../src/stores/useStore';
import { Card, Button } from '../../src/components/ui';
import { setPin, setDecoyPin, isBiometricAvailable, requestBiometric } from '../../src/services/security';

type PinModalKind = 'main-set' | 'main-change' | 'decoy' | null;

export default function SecurityScreen() {
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
    Alert.alert('Désactiver le verrouillage ?', 'Vos données ne seront plus protégées par PIN.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Désactiver', style: 'destructive', onPress: () => {
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
            Alert.alert('Codes différents', 'Recommencez.');
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
      Alert.alert('Biométrie indisponible', 'Configurez Face ID / Touch ID dans les réglages système.');
      return;
    }
    const ok = await requestBiometric('Vérifier votre identité');
    if (ok) setSecurity({ biometricEnabled: true });
  };

  const dots = Array.from({ length: 6 }, (_, i) => i < pin.length);
  const dataCount = transactions.length + receipts.length + documents.length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Sécurité</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + 40 }}>
        <LinearGradient colors={['#10B981', '#059669']} style={styles.hero}>
          <Ionicons name="shield-checkmark" size={36} color={Colors.text} />
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Vos données sont protégées</Text>
            <Text style={styles.heroSub}>{dataCount} éléments stockés localement • Aucun partage tiers</Text>
          </View>
        </LinearGradient>

        <Text style={styles.section}>Verrouillage</Text>
        <Card style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="lock-closed" size={22} color={Colors.primaryLight} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>App lock</Text>
              <Text style={styles.rowSub}>{security.appLockEnabled ? 'Actif • PIN configuré' : 'Inactif'}</Text>
            </View>
            <Switch
              value={security.appLockEnabled}
              onValueChange={(v) => {
                if (v) openSetMain();
                else removePin();
              }}
              thumbColor={security.appLockEnabled ? Colors.primary : '#9CA3AF'}
              trackColor={{ true: `${Colors.primary}80`, false: '#374151' }}
            />
          </View>
          {security.appLockEnabled && (
            <>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.row} onPress={openSetMain}>
                <Ionicons name="key-outline" size={22} color={Colors.text} />
                <Text style={[styles.rowTitle, { flex: 1 }]}>Changer le code PIN</Text>
                <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
              </TouchableOpacity>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Ionicons name="finger-print" size={22} color={Colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Face ID / Touch ID</Text>
                  <Text style={styles.rowSub}>{bioAvail ? (security.biometricEnabled ? 'Activé' : 'Disponible') : 'Indisponible sur cet appareil'}</Text>
                </View>
                <Switch
                  value={security.biometricEnabled}
                  onValueChange={(v) => v ? enableBiometric() : setSecurity({ biometricEnabled: false })}
                  disabled={!bioAvail}
                  thumbColor={security.biometricEnabled ? Colors.success : '#9CA3AF'}
                  trackColor={{ true: `${Colors.success}80`, false: '#374151' }}
                />
              </View>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Ionicons name="timer-outline" size={22} color={Colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Verrouillage auto</Text>
                  <Text style={styles.rowSub}>Après {security.autoLockSeconds}s en arrière-plan</Text>
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
            <Text style={styles.section}>Mode panique 🚨</Text>
            <Card style={styles.card}>
              <View style={styles.row}>
                <Ionicons name="swap-horizontal" size={22} color={Colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Code de décoy</Text>
                  <Text style={styles.rowSub}>
                    {security.decoyPinHash ? 'Configuré • ouvre une app vide' : 'Inactif'}
                  </Text>
                </View>
                {security.decoyPinHash ? (
                  <Button title="Retirer" variant="danger" size="sm" onPress={removeDecoy} />
                ) : (
                  <Button title="Configurer" size="sm" onPress={openDecoy} />
                )}
              </View>
              <View style={styles.divider} />
              <Text style={styles.helperText}>
                En cas de contrainte (ex: réquisition forcée), saisir ce code ouvre une version vide de Budgy, sans vos vraies données.
              </Text>
            </Card>
          </>
        )}

        <Text style={styles.section}>Stockage</Text>
        <Card style={styles.card}>
          <View style={styles.statRow}>
            <Ionicons name="phone-portrait-outline" size={20} color={Colors.primaryLight} />
            <Text style={styles.statLabel}>Appareil (chiffré)</Text>
            <Text style={styles.statValue}>{dataCount} items</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.statRow}>
            <Ionicons name="cloud-offline-outline" size={20} color={Colors.textTertiary} />
            <Text style={styles.statLabel}>Backend</Text>
            <Text style={styles.statValueDim}>0 (privé)</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.statRow}>
            <Ionicons name="server-outline" size={20} color={Colors.success} />
            <Text style={styles.statLabel}>Supabase (auth)</Text>
            <Text style={styles.statValue}>Configuré</Text>
          </View>
        </Card>

        <Text style={styles.helperText}>
          ⚡ Toutes vos données financières restent sur votre téléphone. L’IA OCR reçoit uniquement les images de reçus et ne stocke rien.
        </Text>
      </ScrollView>

      {/* PIN Modal */}
      <Modal visible={!!pinModal} transparent animationType="fade" onRequestClose={() => setPinModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pinCard}>
            <Text style={styles.pinTitle}>
              {pinModal === 'decoy' ? 'Code de panique' : (security.appLockEnabled ? 'Nouveau code' : 'Créer un code')}
            </Text>
            <Text style={styles.pinSubtitle}>
              {pinStep === 'first' ? 'Saisissez 6 chiffres' : 'Confirmez le code'}
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
                          <Ionicons name="backspace-outline" size={22} color={Colors.text} />
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
            <Button title="Annuler" variant="ghost" onPress={() => setPinModal(null)} fullWidth />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
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
