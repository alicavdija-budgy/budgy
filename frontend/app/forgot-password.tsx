/**
 * BUDGY — Forgot Password Screen
 * Sends a password-reset email via Supabase Auth.
 * Deep link redirect: budgy://reset-password
 */

import React, { useState } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { getPasswordResetRedirectUrl } from '../src/lib/authRedirects';
import {
  Colors,
  BorderRadius,
  Spacing,
  FontSizes,
  FontWeights,
} from '../src/constants/theme';
import { supabase, isSupabaseConfigured } from '../src/lib/supabase';
import { useTranslation } from '../src/hooks/useTranslation';

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    setError(null);
    const clean = email.trim().toLowerCase();
    if (!clean.includes('@') || clean.length < 5) {
      setError(t('forgot.errEmail'));
      try { if (Platform.OS !== 'web') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      return;
    }
    setLoading(true);
    try {
      if (!isSupabaseConfigured()) {
        setError(t('forgot.errNoSupabase'));
        return;
      }
      // Centralized redirect — always a public app deep link, never an
      // internal Supabase/Docker hostname (see src/lib/authRedirects.ts).
      const redirectTo = getPasswordResetRedirectUrl();
      const { error: e } = await supabase.auth.resetPasswordForEmail(clean, {
        redirectTo,
      });
      if (e) {
        // v3.7.27 — On affiche un message UX clair. On n'expose JAMAIS
        // le code Supabase brut ("Unauthorized" / "401" / "SMTP" / etc.).
        // On garde la confidentialité (pas de "ce compte n'existe pas")
        // en utilisant des messages génériques côté UX.
        const { humanizeAuthError } = await import('../src/lib/authErrors');
        const h = humanizeAuthError(e, 'resetPassword');
        setError(h.hintKey ? `${t(h.messageKey)}\n\n${t(h.hintKey)}` : t(h.messageKey));
        try { if (Platform.OS !== 'web') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
        return;
      }
      try { if (Platform.OS !== 'web') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      setSent(true);
    } catch (e: any) {
      const { humanizeAuthError } = await import('../src/lib/authErrors');
      const h = humanizeAuthError(e, 'resetPassword');
      setError(h.hintKey ? `${t(h.messageKey)}\n\n${t(h.hintKey)}` : t(h.messageKey));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}
      testID="forgot-password-screen"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={14}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>{t('forgot.headerTitle')}</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={styles.hero}>
            <LinearGradient
              colors={['rgba(52,211,153,0.18)', 'rgba(34,211,238,0.12)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconWrap}
            >
              <Ionicons
                name={sent ? 'mail-open' : 'mail-outline'}
                size={36}
                color={sent ? '#34D399' : '#22D3EE'}
              />
            </LinearGradient>
            <Text style={styles.title}>
              {sent ? t('forgot.sentTitle') : t('forgot.title')}
            </Text>
            <Text style={styles.subtitle}>
              {sent
                ? t('forgot.sentSub', { email: email.toLowerCase().trim() })
                : t('forgot.sub')}
            </Text>
          </View>

          {!sent ? (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('forgot.email')}</Text>
                <View
                  style={[
                    styles.inputContainer,
                    error ? styles.inputError : null,
                  ]}
                >
                  <Ionicons
                    name="mail-outline"
                    size={20}
                    color={Colors.textTertiary}
                  />
                  <TextInput
                    testID="forgot-email-input"
                    style={styles.input}
                    value={email}
                    onChangeText={(v) => {
                      setEmail(v);
                      if (error) setError(null);
                    }}
                    placeholder={t('auth.emailPlaceholder')}
                    placeholderTextColor={Colors.textTertiary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    returnKeyType="send"
                    onSubmitEditing={handleSend}
                    editable={!loading}
                  />
                </View>
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
              </View>

              <TouchableOpacity
                onPress={handleSend}
                disabled={loading}
                activeOpacity={0.85}
                style={[styles.cta, loading && { opacity: 0.7 }]}
                testID="forgot-send-cta"
              >
                <LinearGradient
                  colors={['#34D399', '#22D3EE']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.ctaInner}
                >
                  {loading ? (
                    <ActivityIndicator color="#0E1530" />
                  ) : (
                    <>
                      <Ionicons name="paper-plane" size={18} color="#0E1530" />
                      <Text style={styles.ctaText}>{t('forgot.cta')}</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <Text style={styles.helper}>{t('forgot.helper')}</Text>
            </>
          ) : (
            <>
              <View style={styles.successCard}>
                <View style={styles.successRow}>
                  <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
                  <Text style={styles.successText}>{t('forgot.checkInbox')}</Text>
                </View>
                <Text style={styles.successHint}>
                  {t('forgot.spamHint')}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => {
                  setSent(false);
                  setEmail('');
                }}
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryBtnText}>{t('forgot.resend')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.replace('/auth' as any)}
                style={[styles.cta, { marginTop: Spacing.md }]}
              >
                <LinearGradient
                  colors={['#34D399', '#22D3EE']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.ctaInner}
                >
                  <Ionicons name="arrow-back" size={18} color="#0E1530" />
                  <Text style={styles.ctaText}>{t('forgot.backToLogin')}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
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
  successCard: {
    backgroundColor: 'rgba(52,211,153,0.1)',
    borderColor: 'rgba(52,211,153,0.3)',
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  successText: {
    color: Colors.success,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    flex: 1,
  },
  successHint: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    lineHeight: 17,
  },
  secondaryBtn: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: Colors.text,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    textDecorationLine: 'underline',
  },
});
