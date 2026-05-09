/**
 * BUDGY — Reset Password Screen
 *
 * Entry point: opened via the deep link sent by Supabase
 *   budgy://reset-password?code=XXXX                (PKCE flow)
 *   budgy://reset-password#access_token=YYY&type=recovery&...   (implicit)
 *
 * Flow:
 *   1) Parse incoming URL (route params + URL hash fallback)
 *   2) Exchange code OR setSession to obtain a recovery session
 *   3) Show two password inputs + visibility toggle
 *   4) supabase.auth.updateUser({ password }) → success toast → /(tabs)
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import {
  Colors,
  BorderRadius,
  Spacing,
  FontSizes,
  FontWeights,
} from '../src/constants/theme';
import { supabase, isSupabaseConfigured } from '../src/lib/supabase';
import { useTranslation } from '../src/hooks/useTranslation';

type Phase = 'verifying' | 'ready' | 'invalid' | 'updating' | 'done';

function parseHashFragment(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const i = url.indexOf('#');
  if (i < 0) return out;
  const frag = url.slice(i + 1);
  for (const part of frag.split('&')) {
    const [k, v] = part.split('=');
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v || '');
  }
  return out;
}

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    code?: string;
    access_token?: string;
    refresh_token?: string;
    type?: string;
  }>();

  const [phase, setPhase] = useState<Phase>('verifying');
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [show, setShow] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);

  const score = useMemo(() => {
    let s = 0;
    if (pwd.length >= 8) s += 1;
    if (/[A-Z]/.test(pwd)) s += 1;
    if (/[0-9]/.test(pwd)) s += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) s += 1;
    return s; // 0..4
  }, [pwd]);

  // ── Parse the deep link & establish a recovery session ─────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!isSupabaseConfigured()) {
          if (!cancelled) {
            setPhase('invalid');
            setErrMsg(t('reset.errNoSupabase'));
          }
          return;
        }

        // 1) PKCE: code in route query
        if (params.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(
            String(params.code)
          );
          if (!error && !cancelled) {
            setPhase('ready');
            return;
          }
          if (error) console.warn('[reset] exchangeCodeForSession:', error.message);
        }

        // 2) Implicit: tokens in route query (after manual hash → params parsing)
        if (params.access_token && params.refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: String(params.access_token),
            refresh_token: String(params.refresh_token),
          });
          if (!error && !cancelled) {
            setPhase('ready');
            return;
          }
          if (error) console.warn('[reset] setSession (params):', error.message);
        }

        // 3) Implicit: tokens in URL hash → parse manually
        const initial = await Linking.getInitialURL();
        if (initial) {
          const frag = parseHashFragment(initial);
          if (frag.access_token && frag.refresh_token) {
            const { error } = await supabase.auth.setSession({
              access_token: frag.access_token,
              refresh_token: frag.refresh_token,
            });
            if (!error && !cancelled) {
              setPhase('ready');
              return;
            }
            if (error) console.warn('[reset] setSession (hash):', error.message);
          }
        }

        // 4) Already authenticated? (e.g. user came from settings while logged in)
        const { data } = await supabase.auth.getSession();
        if (data?.session && !cancelled) {
          setPhase('ready');
          return;
        }

        if (!cancelled) {
          setPhase('invalid');
          setErrMsg(t('reset.errInvalidLink'));
        }
      } catch (e: any) {
        if (!cancelled) {
          setPhase('invalid');
          setErrMsg(e?.message || t('reset.errGeneric'));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpdate = async () => {
    setValidation(null);
    if (pwd.length < 8) {
      setValidation(t('reset.errLength'));
      try { if (Platform.OS !== 'web') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      return;
    }
    if (pwd !== pwd2) {
      setValidation(t('reset.errMismatch'));
      try { if (Platform.OS !== 'web') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      return;
    }
    setPhase('updating');
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
      try { if (Platform.OS !== 'web') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      setPhase('done');
      setTimeout(() => {
        Alert.alert(
          t('reset.successTitle'),
          t('reset.successMsg'),
          [{ text: 'OK', onPress: () => router.replace('/(tabs)' as any) }]
        );
      }, 200);
    } catch (e: any) {
      setPhase('ready');
      setValidation(e?.message || t('reset.errGeneric'));
      try { if (Platform.OS !== 'web') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  if (phase === 'verifying') {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#34D399" />
        <Text style={styles.verifyText}>{t('reset.verifying')}</Text>
      </View>
    );
  }

  if (phase === 'invalid') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => router.replace('/auth' as any)}
            hitSlop={14}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>{t('reset.headerTitle')}</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={[styles.content, styles.center]}>
          <View style={[styles.iconWrap, { borderColor: 'rgba(244,63,94,0.3)' }]}>
            <Ionicons name="alert-circle" size={36} color={Colors.error} />
          </View>
          <Text style={styles.title}>{t('reset.invalidTitle')}</Text>
          <Text style={styles.subtitle}>
            {errMsg || t('reset.errInvalidLink')}
          </Text>
          <TouchableOpacity
            onPress={() => router.replace('/forgot-password' as any)}
            style={[styles.cta, { marginTop: Spacing.xl, alignSelf: 'stretch' }]}
          >
            <LinearGradient
              colors={['#34D399', '#22D3EE']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ctaInner}
            >
              <Ionicons name="refresh" size={18} color="#0E1530" />
              <Text style={styles.ctaText}>{t('reset.requestNew')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}
      testID="reset-password-screen"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => router.replace('/auth' as any)}
            hitSlop={14}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>{t('reset.headerTitle')}</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <LinearGradient
              colors={['rgba(52,211,153,0.18)', 'rgba(34,211,238,0.12)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconWrap}
            >
              <Ionicons name="key" size={36} color="#22D3EE" />
            </LinearGradient>
            <Text style={styles.title}>{t('reset.title')}</Text>
            <Text style={styles.subtitle}>{t('reset.sub')}</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('reset.newPwd')}</Text>
            <View style={styles.inputContainer}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={Colors.textTertiary}
              />
              <TextInput
                testID="reset-pwd-input"
                style={styles.input}
                value={pwd}
                onChangeText={(v) => {
                  setPwd(v);
                  if (validation) setValidation(null);
                }}
                placeholder="••••••••"
                placeholderTextColor={Colors.textTertiary}
                secureTextEntry={!show}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                editable={phase !== 'updating'}
              />
              <TouchableOpacity onPress={() => setShow((s) => !s)} hitSlop={10}>
                <Ionicons
                  name={show ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={Colors.textTertiary}
                />
              </TouchableOpacity>
            </View>

            {/* Strength meter */}
            {pwd.length > 0 && (
              <View style={styles.strengthRow}>
                {[0, 1, 2, 3].map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.strengthBar,
                      i < score && styles.strengthBarFilled,
                      i < score && score >= 3 && { backgroundColor: '#34D399' },
                      i < score && score === 2 && { backgroundColor: '#F59E0B' },
                      i < score && score === 1 && { backgroundColor: '#F43F5E' },
                    ]}
                  />
                ))}
                <Text style={styles.strengthText}>
                  {score >= 3
                    ? t('reset.strong')
                    : score === 2
                    ? t('reset.medium')
                    : t('reset.weak')}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('reset.confirmPwd')}</Text>
            <View
              style={[
                styles.inputContainer,
                pwd2.length > 0 && pwd !== pwd2 ? styles.inputError : null,
              ]}
            >
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={Colors.textTertiary}
              />
              <TextInput
                testID="reset-pwd2-input"
                style={styles.input}
                value={pwd2}
                onChangeText={(v) => {
                  setPwd2(v);
                  if (validation) setValidation(null);
                }}
                placeholder="••••••••"
                placeholderTextColor={Colors.textTertiary}
                secureTextEntry={!show}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleUpdate}
                editable={phase !== 'updating'}
              />
            </View>
            {validation ? (
              <Text style={styles.errorText}>{validation}</Text>
            ) : null}
          </View>

          <TouchableOpacity
            onPress={handleUpdate}
            disabled={phase === 'updating'}
            activeOpacity={0.85}
            style={[styles.cta, phase === 'updating' && { opacity: 0.7 }]}
            testID="reset-submit-cta"
          >
            <LinearGradient
              colors={['#34D399', '#22D3EE']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ctaInner}
            >
              {phase === 'updating' ? (
                <ActivityIndicator color="#0E1530" />
              ) : (
                <>
                  <Ionicons name="shield-checkmark" size={18} color="#0E1530" />
                  <Text style={styles.ctaText}>{t('reset.cta')}</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.helper}>{t('reset.securityNote')}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  verifyText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    marginTop: Spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  hero: { alignItems: 'center', marginTop: Spacing.lg, marginBottom: Spacing.xxl },
  iconWrap: {
    width: 84,
    height: 84,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  title: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
  },
  inputGroup: { marginBottom: Spacing.lg },
  label: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    marginBottom: Spacing.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  inputError: { borderColor: Colors.error },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: FontSizes.md,
    paddingVertical: Spacing.md,
  },
  errorText: {
    color: Colors.error,
    fontSize: FontSizes.xs,
    marginTop: Spacing.xs,
  },
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.sm,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  strengthBarFilled: { backgroundColor: '#22D3EE' },
  strengthText: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 8,
  },
  cta: { borderRadius: BorderRadius.lg, overflow: 'hidden' },
  ctaInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  ctaText: {
    color: '#0E1530',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  helper: {
    color: Colors.textTertiary,
    fontSize: FontSizes.xs,
    textAlign: 'center',
    marginTop: Spacing.lg,
    lineHeight: 17,
  },
});
