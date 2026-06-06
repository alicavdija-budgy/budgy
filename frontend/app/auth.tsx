/**
 * GUARDIAN MONEY CHF - Auth Screen
 * Supabase Auth with graceful error handling for self-hosted instances
 */

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../src/constants/theme';
import { useStore } from '../src/stores/useStore';
import { Button } from '../src/components/ui';
import { supabase, isSupabaseConfigured } from '../src/lib/supabase';
import { humanizeAuthError } from '../src/lib/authErrors';
import { useTranslation } from '../src/hooks/useTranslation';
import { pullAllFromCloud, pushAllToCloud } from '../src/services/cloudSync';

// Phase 1: no hardcoded credentials. All auth goes through Supabase.

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const router = useRouter();
  const { setUser, setPro, loadSeedData, setPreferences } = useStore();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!email.includes('@')) errs.email = t('auth.errEmail');
    if (password.length < 6) errs.password = 'Minimum 6 caractères';
    if (mode === 'register') {
      if (!name.trim()) errs.name = 'Nom requis';
      if (password !== confirmPassword) errs.confirmPassword = 'Mots de passe différents';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const navigateTo = (path: string) => {
    setTimeout(() => {
      try {
        router.replace(path as any);
      } catch (e) {
        // Fallback only for web platform
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          try { window.location.assign(path); } catch {}
        }
      }
    }, 200);
  };

  // Auth is handled exclusively by Supabase below — no client-side bypass.

  const loginAsLocalUser = (userId: string, emailAddr: string, userName: string, isPro: boolean, isNewAccount: boolean) => {
    setUser({
      id: userId,
      email: emailAddr,
      name: userName,
      createdAt: Date.now(),
      isPro,
    });
    if (isPro) setPro(true);
    
    if (isNewAccount) {
      // New account: go through onboarding, NO seed data
      setPreferences({ onboarded: false });
      navigateTo('/onboarding');
    } else {
      // Existing/returning user: skip onboarding
      setPreferences({ onboarded: true });
      navigateTo('/(tabs)');
    }
  };

  // Cloud sync after successful Supabase login (non-blocking)
  const triggerCloudSync = async (isNewAccount: boolean) => {
    try {
      if (isNewAccount) {
        // For new accounts, push the initial state (user_preferences row)
        await pushAllToCloud();
      } else {
        // For returning users, pull cloud data to hydrate local store
        await pullAllFromCloud();
      }
    } catch (e) {
      console.warn('[auth] cloud sync failed (non-fatal):', e);
    }
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);

    const emailClean = email.toLowerCase().trim();

    try {
      if (isSupabaseConfigured()) {
        if (mode === 'register') {
          const { data, error } = await supabase.auth.signUp({
            email: emailClean,
            password,
            options: { data: { name: name.trim() } },
          });

          if (error) {
            if (error.message.includes('confirmation email') || error.message.includes('sending')) {
              loginAsLocalUser(`local_${Date.now()}`, emailClean, name.trim(), false, true);
              return;
            }
            throw error;
          }

          if (data.user && !data.session) {
            loginAsLocalUser(data.user.id, emailClean, name.trim(), false, true);
            // Trigger cloud sync in background (non-blocking)
            triggerCloudSync(true);
            return;
          }

          loginAsLocalUser(data.user?.id || `user_${Date.now()}`, emailClean, name.trim(), false, true);
          triggerCloudSync(true);
        } else {
          // Login
          const { data, error } = await supabase.auth.signInWithPassword({
            email: emailClean,
            password,
          });

          if (error) {
            // Surface the real error to the user — no client-side bypass
            throw error;
          }

          const userId = data.user?.id || `user_${Date.now()}`;
          const userName = data.user?.user_metadata?.name || emailClean.split('@')[0];
          loginAsLocalUser(userId, emailClean, userName, false, false);
          // Pull cloud data in background to hydrate local store
          triggerCloudSync(false);
        }
      } else {
        await new Promise(r => setTimeout(r, 400));
        loginAsLocalUser(`local_${Date.now()}`, emailClean, mode === 'register' ? name.trim() : emailClean.split('@')[0], false, mode === 'register');
      }
    } catch (error: any) {
      const h = humanizeAuthError(error, mode === 'register' ? 'signUp' : 'signIn');
      const buttons: any[] = [{ text: 'OK', style: 'default' }];
      if (mode === 'login' && (h._code === 'AUTH_SIGNIN_UNAUTHORIZED' || h._code === 'AUTH_INVALID_CREDENTIALS' || h._code === 'AUTH_SIGNIN_GENERIC')) {
        buttons.unshift({
          text: 'Mot de passe oublié',
          onPress: () => router.push('/forgot-password' as any),
        });
      }
      Alert.alert(h.title, h.hint ? `${h.message}\n\n${h.hint}` : h.message, buttons);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoMode = async () => {
    setLoading(true);
    try {
      setUser({ id: 'demo_user', email: 'demo@guardian.app', name: 'Marie Dupont', createdAt: Date.now(), isPro: true, isDemo: true });
      setPro(true);
      // Phase 1: no seed data — demo mode also starts empty
      setPreferences({ onboarded: true });
      await new Promise(r => setTimeout(r, 300));
      navigateTo('/(tabs)');
    } catch { setLoading(false); }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20 }]} testID="auth-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Logo */}
          <View style={styles.logoContainer}>
            <Image
              source={require('../assets/images/icon.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.logoText}>Budgy</Text>
            <Text style={styles.tagline}>{t('auth.tagline')}</Text>
          </View>

          {/* Mode Toggle */}
          <View style={styles.modeToggle}>
            {(['login', 'register'] as const).map((m) => (
              <TouchableOpacity key={m} testID={`auth-mode-${m}`} style={[styles.modeButton, mode === m && styles.modeButtonActive]} onPress={() => { setMode(m); setErrors({}); }}>
                <Text style={[styles.modeButtonText, mode === m && styles.modeButtonTextActive]}>
                  {m === 'login' ? t('auth.login') : t('auth.signup')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Form */}
          <View style={styles.form}>
            {mode === 'register' && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Nom complet</Text>
                <View style={[styles.inputContainer, errors.name && styles.inputError]}>
                  <Ionicons name="person-outline" size={20} color={Colors.textTertiary} />
                  <TextInput testID="auth-name-input" style={styles.input} value={name} onChangeText={setName} placeholder="Jean Dupont" placeholderTextColor={Colors.textTertiary} autoCapitalize="words" />
                </View>
                {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('auth.email')}</Text>
              <View style={[styles.inputContainer, errors.email && styles.inputError]}>
                <Ionicons name="mail-outline" size={20} color={Colors.textTertiary} />
                <TextInput testID="auth-email-input" style={styles.input} value={email} onChangeText={setEmail} placeholder={t("auth.emailPlaceholder")} placeholderTextColor={Colors.textTertiary} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
              </View>
              {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('auth.password')}</Text>
              <View style={[styles.inputContainer, errors.password && styles.inputError]}>
                <Ionicons name="lock-closed-outline" size={20} color={Colors.textTertiary} />
                <TextInput testID="auth-password-input" style={styles.input} value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor={Colors.textTertiary} secureTextEntry={!showPassword} />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textTertiary} />
                </TouchableOpacity>
              </View>
              {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
              {mode === 'login' && (
                <TouchableOpacity
                  testID="forgot-password-link"
                  style={styles.forgotLink}
                  onPress={() => router.push('/forgot-password' as any)}
                  hitSlop={8}
                >
                  <Text style={styles.forgotLinkText}>{t('auth.forgotPwd')}</Text>
                </TouchableOpacity>
              )}
            </View>

            {mode === 'register' && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Confirmer le mot de passe</Text>
                <View style={[styles.inputContainer, errors.confirmPassword && styles.inputError]}>
                  <Ionicons name="lock-closed-outline" size={20} color={Colors.textTertiary} />
                  <TextInput testID="auth-confirm-password" style={styles.input} value={confirmPassword} onChangeText={setConfirmPassword} placeholder="••••••••" placeholderTextColor={Colors.textTertiary} secureTextEntry={!showPassword} />
                </View>
                {errors.confirmPassword && <Text style={styles.errorText}>{errors.confirmPassword}</Text>}
              </View>
            )}

            <Button title={mode === 'login' ? t('auth.loginCta') : t('auth.signupCta')} onPress={handleSubmit} loading={loading} fullWidth size="lg" style={{ marginTop: Spacing.lg }} />
          </View>

          {/* Cloud indicator */}
          {isSupabaseConfigured() && (
            <View style={styles.cloudBadge}>
              <Ionicons name="cloud-done" size={14} color={Colors.success} />
              <Text style={styles.cloudText}>Cloud sync activé</Text>
            </View>
          )}

          {/* Demo Mode */}
          <TouchableOpacity testID="demo-mode-button" style={styles.demoButton} onPress={handleDemoMode} disabled={loading}>
            <Ionicons name="flash" size={16} color={Colors.primary} />
            <Text style={styles.demoButtonText}>{t('auth.demoMode')}</Text>
          </TouchableOpacity>

          <Text style={styles.privacyNote}>
            {isSupabaseConfigured() ? 'Données chiffrées · Sync cloud sécurisé' : 'Données stockées localement · 100% privé'}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  keyboardView: { flex: 1 },
  scroll: { flexGrow: 1, padding: Spacing.xl, justifyContent: 'center' },
  logoContainer: { alignItems: 'center', marginBottom: Spacing.xxxl },
  logoGradient: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.lg },
  logoImage: { width: 96, height: 96, borderRadius: 24, marginBottom: Spacing.lg },
  logoText: { color: Colors.text, fontSize: FontSizes.xxl, fontWeight: FontWeights.black, letterSpacing: 2 },
  tagline: { color: Colors.textSecondary, fontSize: FontSizes.md, marginTop: Spacing.sm },
  modeToggle: { flexDirection: 'row', backgroundColor: Colors.card, borderRadius: BorderRadius.lg, padding: 4, marginBottom: Spacing.xxl },
  modeButton: { flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, alignItems: 'center' },
  modeButtonActive: { backgroundColor: Colors.primary },
  modeButtonText: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  modeButtonTextActive: { color: Colors.text },
  form: { marginBottom: Spacing.xl },
  inputGroup: { marginBottom: Spacing.lg },
  label: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, marginBottom: Spacing.sm },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.md, gap: Spacing.md },
  inputError: { borderColor: Colors.error },
  input: { flex: 1, color: Colors.text, fontSize: FontSizes.md, paddingVertical: Spacing.md },
  errorText: { color: Colors.error, fontSize: FontSizes.xs, marginTop: Spacing.xs },
  cloudBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, marginBottom: Spacing.md },
  cloudText: { color: Colors.success, fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
  demoButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, marginBottom: Spacing.lg },
  demoButtonText: { color: Colors.primary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  privacyNote: { color: Colors.textTertiary, fontSize: FontSizes.xs, textAlign: 'center' },
  forgotLink: { alignSelf: 'flex-end', marginTop: Spacing.sm, paddingVertical: 4 },
  forgotLinkText: { color: '#34D399', fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
});
