/**
 * GUARDIAN MONEY CHF - Lock Screen
 * Shown when app is locked (PIN + biometric).
 * Supports decoy/panic PIN that switches to fake clean state.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Vibration,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../src/constants/theme';
import { useTranslation } from '../src/hooks/useTranslation';
import { useStore } from '../src/stores/useStore';
import { verifyPin, requestBiometric } from '../src/services/security';

export default function LockScreen({
  onUnlock,
}: {
  onUnlock: (decoy: boolean) => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { security } = useStore();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);

  const tryBiometric = async () => {
    if (!security.biometricEnabled) return;
    const ok = await requestBiometric(t('smallUi.lockUnlock'));
    if (ok) onUnlock(false);
  };

  useEffect(() => {
    tryBiometric();
  }, []);

  const onDigit = async (d: string) => {
    if (pin.length >= 6) return;
    const next = pin + d;
    setPin(next);
    setError('');
    if (next.length === 6) {
      // Verify after 100ms (UX feedback)
      setTimeout(async () => {
        const okMain = await verifyPin(next, security.pinHash);
        if (okMain) {
          onUnlock(false);
          return;
        }
        const okDecoy = security.decoyPinHash
          ? await verifyPin(next, security.decoyPinHash)
          : false;
        if (okDecoy) {
          onUnlock(true);
          return;
        }
        setAttempts((a) => a + 1);
        setError('Code incorrect');
        if (Platform.OS !== 'web') {
          try { Vibration.vibrate(120); } catch {}
        }
        setTimeout(() => setPin(''), 250);
      }, 100);
    }
  };

  const onBackspace = () => {
    setPin((p) => p.slice(0, -1));
    setError('');
  };

  const dots = Array.from({ length: 6 }, (_, i) => i < pin.length);

  return (
    <LinearGradient
      colors={['#0B1020', Colors.background]}
      style={[styles.container, { paddingTop: insets.top + 60 }]}
    >
      <LinearGradient
        colors={Colors.gradientPrimary as [string, string]}
        style={styles.logo}
      >
        <Ionicons name="shield-checkmark" size={32} color={Colors.text} />
      </LinearGradient>
      <Text style={styles.title}>Budgy verrouillé</Text>
      <Text style={styles.subtitle}>Saisissez votre code à 6 chiffres</Text>

      <View style={styles.dotsRow}>
        {dots.map((filled, i) => (
          <View key={i} style={[styles.dot, filled && styles.dotFilled]} />
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : <View style={{ height: 18 }} />}

      <View style={styles.keypad}>
        {[
          ['1', '2', '3'],
          ['4', '5', '6'],
          ['7', '8', '9'],
          ['bio', '0', 'back'],
        ].map((row, ri) => (
          <View key={ri} style={styles.keyRow}>
            {row.map((k) => {
              if (k === 'bio') {
                return (
                  <TouchableOpacity
                    key="bio"
                    style={styles.key}
                    onPress={tryBiometric}
                    disabled={!security.biometricEnabled}
                  >
                    {security.biometricEnabled && (
                      <Ionicons name="finger-print" size={26} color={Colors.primaryLight} />
                    )}
                  </TouchableOpacity>
                );
              }
              if (k === 'back') {
                return (
                  <TouchableOpacity key="back" style={styles.key} onPress={onBackspace}>
                    <Ionicons name="backspace-outline" size={24} color={Colors.text} />
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity
                  key={k}
                  style={styles.key}
                  onPress={() => onDigit(k)}
                  activeOpacity={0.6}
                >
                  <Text style={styles.keyText}>{k}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {attempts >= 3 && (
        <Text style={styles.helpText}>
          Trop d’erreurs ? Fermez et rouvrez l’app.
        </Text>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', paddingHorizontal: Spacing.xl },
  logo: {
    width: 72, height: 72, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xl,
  },
  title: { color: Colors.text, fontSize: FontSizes.xxl, fontWeight: FontWeights.bold },
  subtitle: { color: Colors.textSecondary, fontSize: FontSizes.sm, marginTop: 6, marginBottom: Spacing.xxl },
  dotsRow: { flexDirection: 'row', gap: 14, marginBottom: 8 },
  dot: {
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 2, borderColor: Colors.cardBorder,
  },
  dotFilled: { backgroundColor: Colors.primaryLight, borderColor: Colors.primaryLight },
  error: { color: Colors.error, fontSize: FontSizes.sm, marginVertical: 6 },
  keypad: { gap: Spacing.md, marginTop: Spacing.lg },
  keyRow: { flexDirection: 'row', gap: Spacing.lg },
  key: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.cardBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  keyText: { color: Colors.text, fontSize: 28, fontWeight: FontWeights.bold },
  helpText: { color: Colors.textTertiary, fontSize: FontSizes.xs, marginTop: Spacing.lg, textAlign: 'center' },
});
