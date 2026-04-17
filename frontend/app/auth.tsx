/**
 * GUARDIAN MONEY CHF - Auth Screen
 * Login and Register with Supabase Auth
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
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../src/constants/theme';
import { useStore } from '../src/stores/useStore';
import { Button } from '../src/components/ui';
import { supabase, isSupabaseConfigured } from '../src/lib/supabase';

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
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

    if (!email.includes('@')) {
      errs.email = 'Email invalide';
    }

    if (password.length < 6) {
      errs.password = 'Minimum 6 caractères';
    }

    if (mode === 'register') {
      if (!name.trim()) {
        errs.name = 'Nom requis';
      }
      if (password !== confirmPassword) {
        errs.confirmPassword = 'Mots de passe différents';
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      if (isSupabaseConfigured()) {
        // Use Supabase Auth
        if (mode === 'register') {
          const { data, error } = await supabase.auth.signUp({
            email: email.toLowerCase().trim(),
            password,
            options: { data: { name: name.trim() } },
          });
          if (error) throw error;
          
          const user = {
            id: data.user?.id || `user_${Date.now()}`,
            email: email.toLowerCase().trim(),
            name: name.trim(),
            createdAt: Date.now(),
            isPro: false,
          };
          setUser(user);
          loadSeedData();
          router.replace('/onboarding');
        } else {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: email.toLowerCase().trim(),
            password,
          });
          if (error) throw error;
          
          const user = {
            id: data.user?.id || `user_${Date.now()}`,
            email: data.user?.email || email.toLowerCase().trim(),
            name: data.user?.user_metadata?.name || email.split('@')[0],
            createdAt: Date.now(),
            isPro: false,
          };
          setUser(user);
          setPreferences({ onboarded: true });
          router.replace('/(tabs)');
        }
      } else {
        // Fallback to local auth
        await new Promise(r => setTimeout(r, 600));
        const user = {
          id: `user_${Date.now()}`,
          email: email.toLowerCase().trim(),
          name: mode === 'register' ? name.trim() : email.split('@')[0],
          createdAt: Date.now(),
          isPro: false,
        };
        setUser(user);
        loadSeedData();
        if (mode === 'login') {
          setPreferences({ onboarded: true });
          router.replace('/(tabs)');
        } else {
          router.replace('/onboarding');
        }
      }
    } catch (error: any) {
      const msg = error?.message || 'Une erreur est survenue';
      if (msg.includes('Invalid login')) {
        Alert.alert('Erreur', 'Email ou mot de passe incorrect.');
      } else if (msg.includes('already registered')) {
        Alert.alert('Erreur', 'Cet email est déjà utilisé. Connectez-vous.');
      } else {
        Alert.alert('Erreur', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDemoMode = async () => {
    setLoading(true);
    try {
      await new Promise(r => setTimeout(r, 400));
      const demoUser = {
        id: 'demo_user',
        email: 'demo@guardian.app',
        name: 'Marie Dupont',
        createdAt: Date.now(),
        isPro: true,
        isDemo: true,
      };
      setUser(demoUser);
      setPro(true);
      loadSeedData();
      setPreferences({ onboarded: true });
      router.replace('/(tabs)');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20 }]} testID="auth-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoContainer}>
            <LinearGradient
              colors={Colors.gradientPrimary as [string, string]}
              style={styles.logoGradient}
            >
              <Ionicons name="flash" size={40} color={Colors.text} />
            </LinearGradient>
            <Text style={styles.logoText}>GUARDIAN</Text>
            <Text style={styles.tagline}>Gérez votre argent intelligemment</Text>
          </View>

          {/* Mode Toggle */}
          <View style={styles.modeToggle}>
            {(['login', 'register'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                testID={`auth-mode-${m}`}
                style={[styles.modeButton, mode === m && styles.modeButtonActive]}
                onPress={() => { setMode(m); setErrors({}); }}
              >
                <Text style={[styles.modeButtonText, mode === m && styles.modeButtonTextActive]}>
                  {m === 'login' ? 'Connexion' : 'Créer un compte'}
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
                  <TextInput
                    testID="auth-name-input"
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Jean Dupont"
                    placeholderTextColor={Colors.textTertiary}
                    autoCapitalize="words"
                  />
                </View>
                {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={[styles.inputContainer, errors.email && styles.inputError]}>
                <Ionicons name="mail-outline" size={20} color={Colors.textTertiary} />
                <TextInput
                  testID="auth-email-input"
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="email@exemple.ch"
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Mot de passe</Text>
              <View style={[styles.inputContainer, errors.password && styles.inputError]}>
                <Ionicons name="lock-closed-outline" size={20} color={Colors.textTertiary} />
                <TextInput
                  testID="auth-password-input"
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={Colors.textTertiary}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={Colors.textTertiary}
                  />
                </TouchableOpacity>
              </View>
              {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
            </View>

            {mode === 'register' && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Confirmer le mot de passe</Text>
                <View style={[styles.inputContainer, errors.confirmPassword && styles.inputError]}>
                  <Ionicons name="lock-closed-outline" size={20} color={Colors.textTertiary} />
                  <TextInput
                    testID="auth-confirm-password"
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="••••••••"
                    placeholderTextColor={Colors.textTertiary}
                    secureTextEntry={!showPassword}
                  />
                </View>
                {errors.confirmPassword && (
                  <Text style={styles.errorText}>{errors.confirmPassword}</Text>
                )}
              </View>
            )}

            <Button
              title={mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
              onPress={handleSubmit}
              loading={loading}
              fullWidth
              size="lg"
              style={{ marginTop: Spacing.lg }}
            />
          </View>

          {/* Supabase indicator */}
          {isSupabaseConfigured() && (
            <View style={styles.cloudBadge}>
              <Ionicons name="cloud-done" size={14} color={Colors.success} />
              <Text style={styles.cloudText}>Cloud sync activé</Text>
            </View>
          )}

          {/* Demo Mode */}
          <TouchableOpacity
            testID="demo-mode-button"
            style={styles.demoButton}
            onPress={handleDemoMode}
            disabled={loading}
          >
            <Ionicons name="flash" size={16} color={Colors.primary} />
            <Text style={styles.demoButtonText}>Essayer en mode démo (Pro activé)</Text>
          </TouchableOpacity>

          {/* Privacy Note */}
          <Text style={styles.privacyNote}>
            {isSupabaseConfigured() 
              ? 'Données chiffrées · Sync cloud sécurisé'
              : 'Données stockées localement · 100% privé'}
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
  logoGradient: {
    width: 80, height: 80, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.lg,
  },
  logoText: { color: Colors.text, fontSize: FontSizes.xxl, fontWeight: FontWeights.black, letterSpacing: 2 },
  tagline: { color: Colors.textSecondary, fontSize: FontSizes.md, marginTop: Spacing.sm },
  modeToggle: {
    flexDirection: 'row', backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg, padding: 4, marginBottom: Spacing.xxl,
  },
  modeButton: { flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, alignItems: 'center' },
  modeButtonActive: { backgroundColor: Colors.primary },
  modeButtonText: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  modeButtonTextActive: { color: Colors.text },
  form: { marginBottom: Spacing.xl },
  inputGroup: { marginBottom: Spacing.lg },
  label: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, marginBottom: Spacing.sm },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md, gap: Spacing.md,
  },
  inputError: { borderColor: Colors.error },
  input: { flex: 1, color: Colors.text, fontSize: FontSizes.md, paddingVertical: Spacing.md },
  errorText: { color: Colors.error, fontSize: FontSizes.xs, marginTop: Spacing.xs },
  cloudBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, marginBottom: Spacing.md,
  },
  cloudText: { color: Colors.success, fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
  demoButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.md, marginBottom: Spacing.lg,
  },
  demoButtonText: { color: Colors.primary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  privacyNote: { color: Colors.textTertiary, fontSize: FontSizes.xs, textAlign: 'center' },
});
