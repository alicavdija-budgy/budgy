/**
 * GUARDIAN MONEY CHF - Family Mode
 * Create/join family groups with 8-char invitation codes
 */

import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, Share, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import type { ThemePalette } from '../../src/constants/palettes';
import { useStore } from '../../src/stores/useStore';
import { Card, Button } from '../../src/components/ui';
import { safeFetchJson } from '../../src/lib/network';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface FamilyMember {
  id: string;
  name: string;
  role: string;
  joined: string;
}

interface FamilyGroup {
  code: string;
  name: string;
  owner_id: string;
  members: FamilyMember[];
}

export default function FamilyScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useStore();

  const [mode, setMode] = useState<'home' | 'create' | 'join'>('home');
  const [familyName, setFamilyName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [family, setFamily] = useState<FamilyGroup | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!familyName.trim()) { Alert.alert('Erreur', 'Entrez un nom de famille'); return; }
    setLoading(true);
    try {
      const r = await safeFetchJson<any>(`${BACKEND_URL}/api/family/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_id: user?.id || 'anon',
          owner_name: user?.name || 'User',
          family_name: familyName.trim(),
        }),
      }, { timeoutMs: 10000, retries: 1, silent: true });
      if (!r.ok || !r.data) {
        const human = r.offline
          ? 'Mode hors-ligne. Connectez-vous à Internet pour créer une famille.'
          : r.status >= 500
            ? 'Le service famille est momentanément indisponible. Réessayez dans quelques minutes.'
            : 'Création impossible. Vérifiez votre connexion et réessayez.';
        Alert.alert('Création impossible', human);
        return;
      }
      setFamily(r.data.family);
      setMode('home');
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Une erreur est survenue');
    } finally { setLoading(false); }
  };

  const handleJoin = async () => {
    if (joinCode.length !== 8) { Alert.alert('Erreur', 'Le code doit faire 8 caractères'); return; }
    setLoading(true);
    try {
      const r = await safeFetchJson<any>(`${BACKEND_URL}/api/family/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id || 'anon',
          user_name: user?.name || 'User',
          code: joinCode.toUpperCase(),
        }),
      }, { timeoutMs: 10000, retries: 1, silent: true });
      if (!r.ok || !r.data) {
        const human = r.offline
          ? 'Mode hors-ligne. Connectez-vous à Internet pour rejoindre une famille.'
          : r.status === 404
            ? 'Code d\'invitation invalide.'
            : r.status === 400
              ? (r.data?.detail || 'Impossible de rejoindre cette famille.')
              : 'Le service famille est momentanément indisponible.';
        Alert.alert('Connexion impossible', human);
        return;
      }
      setFamily(r.data.family);
      setMode('home');
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Une erreur est survenue');
    } finally { setLoading(false); }
  };

  const handleShare = async () => {
    if (!family) return;
    await Share.share({
      message: `Rejoignez ma famille "${family.name}" sur Budgy!\n\nCode d'invitation: ${family.code}\n\nTéléchargez l'app et entrez ce code dans Plus > Mode Famille.`,
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="family-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Mode Famille</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Family exists */}
        {family ? (
          <>
            <Card style={styles.familyCard}>
              <View style={styles.familyHeader}>
                <View style={styles.familyEmoji}>
                  <Text style={{ fontSize: 36 }}>👨‍👩‍👧‍👦</Text>
                </View>
                <View style={styles.familyInfo}>
                  <Text style={styles.familyName}>{family.name}</Text>
                  <Text style={styles.familyCount}>{family.members.length} membre{family.members.length > 1 ? 's' : ''}</Text>
                </View>
              </View>

              <View style={styles.codeBox}>
                <Text style={styles.codeLabel}>Code d'invitation</Text>
                <Text style={styles.codeValue}>{family.code}</Text>
                <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
                  <Ionicons name="share-outline" size={18} color={theme.primary} />
                  <Text style={styles.shareTxt}>Partager</Text>
                </TouchableOpacity>
              </View>
            </Card>

            <Text style={styles.sectionTitle}>Membres</Text>
            {family.members.map((m, idx) => (
              <Card key={m.id} style={styles.memberCard}>
                <View style={[styles.memberAvatar, { backgroundColor: idx === 0 ? `${theme.primary}20` : `${theme.success}20` }]}>
                  <Text style={styles.memberInitial}>{m.name[0]?.toUpperCase()}</Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{m.name}</Text>
                  <Text style={styles.memberRole}>{m.role === 'admin' ? 'Administrateur' : 'Membre'}</Text>
                </View>
                {m.role === 'admin' && <Ionicons name="shield-checkmark" size={20} color={theme.primary} />}
              </Card>
            ))}

            <Card style={styles.tipCard}>
              <Ionicons name="information-circle" size={18} color={theme.info} />
              <Text style={styles.tipTxt}>
                Partagez le code {family.code} avec votre famille. Chaque membre peut voir les statistiques communes et les objectifs partagés. Max 6 membres.
              </Text>
            </Card>
          </>
        ) : mode === 'create' ? (
          /* Create Family */
          <Card style={styles.formCard}>
            <View style={styles.formIcon}><Text style={{ fontSize: 48 }}>🏠</Text></View>
            <Text style={styles.formTitle}>Créer une famille</Text>
            <Text style={styles.formSub}>Un code de 8 caractères sera généré automatiquement</Text>

            <Text style={styles.inputLabel}>Nom de la famille</Text>
            <TextInput
              style={styles.input}
              value={familyName}
              onChangeText={setFamilyName}
              placeholder="ex: Famille Dupont"
              placeholderTextColor={theme.textTertiary}
              autoFocus
            />

            <Button title={loading ? "Création..." : "Créer la famille"} onPress={handleCreate} fullWidth size="lg" loading={loading} style={{ marginTop: Spacing.lg }} />
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setMode('home')}>
              <Text style={styles.cancelTxt}>Annuler</Text>
            </TouchableOpacity>
          </Card>
        ) : mode === 'join' ? (
          /* Join Family */
          <Card style={styles.formCard}>
            <View style={styles.formIcon}><Text style={{ fontSize: 48 }}>🔑</Text></View>
            <Text style={styles.formTitle}>Rejoindre une famille</Text>
            <Text style={styles.formSub}>Entrez le code de 8 caractères reçu</Text>

            <Text style={styles.inputLabel}>Code d'invitation</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              value={joinCode}
              onChangeText={(t) => setJoinCode(t.toUpperCase().slice(0, 8))}
              placeholder="XXXXXXXX"
              placeholderTextColor={theme.textTertiary}
              autoCapitalize="characters"
              maxLength={8}
              autoFocus
            />

            <Button title={loading ? "Connexion..." : "Rejoindre"} onPress={handleJoin} fullWidth size="lg" loading={loading} disabled={joinCode.length !== 8} style={{ marginTop: Spacing.lg }} />
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setMode('home')}>
              <Text style={styles.cancelTxt}>Annuler</Text>
            </TouchableOpacity>
          </Card>
        ) : (
          /* Home - Choose action */
          <>
            <View style={styles.heroSection}>
              <Text style={{ fontSize: 64 }}>👨‍👩‍👧‍👦</Text>
              <Text style={styles.heroTitle}>Gérez vos finances en famille</Text>
              <Text style={styles.heroSub}>Partagez vos objectifs, suivez les dépenses communes et épargnez ensemble.</Text>
            </View>

            <TouchableOpacity style={styles.actionCard} onPress={() => setMode('create')}>
              <View style={[styles.actionIcon, { backgroundColor: `${theme.primary}15` }]}>
                <Ionicons name="add-circle" size={28} color={theme.primary} />
              </View>
              <View style={styles.actionContent}>
                <Text style={styles.actionTitle}>Créer une famille</Text>
                <Text style={styles.actionSub}>Générez un code d'invitation unique</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionCard} onPress={() => setMode('join')}>
              <View style={[styles.actionIcon, { backgroundColor: `${theme.success}15` }]}>
                <Ionicons name="enter" size={28} color={theme.success} />
              </View>
              <View style={styles.actionContent}>
                <Text style={styles.actionTitle}>Rejoindre une famille</Text>
                <Text style={styles.actionSub}>Entrez un code de 8 caractères</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
            </TouchableOpacity>

            <Card style={styles.featuresCard}>
              <Text style={styles.featuresTitle}>Fonctionnalités famille</Text>
              {[
                { icon: 'people', label: 'Jusqu\'à 6 membres', color: theme.primary },
                { icon: 'bar-chart', label: 'Statistiques communes', color: theme.success },
                { icon: 'flag', label: 'Objectifs partagés', color: theme.warning },
                { icon: 'notifications', label: 'Alertes famille', color: theme.error },
              ].map((f, i) => (
                <View key={i} style={styles.featureRow}>
                  <Ionicons name={f.icon as any} size={18} color={f.color} />
                  <Text style={styles.featureTxt}>{f.label}</Text>
                </View>
              ))}
            </Card>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const makeStyles = (Colors: ThemePalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  scroll: { flex: 1 },
  content: { padding: Spacing.lg },
  heroSection: { alignItems: 'center', marginBottom: Spacing.xxl, paddingTop: Spacing.xl },
  heroTitle: { color: Colors.text, fontSize: FontSizes.xxl, fontWeight: FontWeights.bold, textAlign: 'center', marginTop: Spacing.lg },
  heroSub: { color: Colors.textSecondary, fontSize: FontSizes.md, textAlign: 'center', marginTop: Spacing.sm, maxWidth: 300 },
  actionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: BorderRadius.xl, padding: Spacing.lg, marginBottom: Spacing.md },
  actionIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  actionContent: { flex: 1 },
  actionTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  actionSub: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  featuresCard: { marginTop: Spacing.lg },
  featuresTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold, marginBottom: Spacing.md },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
  featureTxt: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  formCard: { alignItems: 'center', padding: Spacing.xxl },
  formIcon: { marginBottom: Spacing.md },
  formTitle: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  formSub: { color: Colors.textSecondary, fontSize: FontSizes.sm, textAlign: 'center', marginTop: Spacing.sm, marginBottom: Spacing.xl },
  inputLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm, alignSelf: 'flex-start', width: '100%', marginBottom: Spacing.sm },
  input: { width: '100%', backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: BorderRadius.lg, padding: Spacing.md, color: Colors.text, fontSize: FontSizes.md },
  codeInput: { fontSize: FontSizes.xxl, fontWeight: FontWeights.black, textAlign: 'center', letterSpacing: 6 },
  cancelBtn: { marginTop: Spacing.lg },
  cancelTxt: { color: Colors.textTertiary, fontSize: FontSizes.sm },
  familyCard: { marginBottom: Spacing.lg },
  familyHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.lg },
  familyEmoji: { marginRight: Spacing.md },
  familyInfo: { flex: 1 },
  familyName: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  familyCount: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  codeBox: { backgroundColor: Colors.card, borderRadius: BorderRadius.lg, padding: Spacing.lg, alignItems: 'center' },
  codeLabel: { color: Colors.textSecondary, fontSize: FontSizes.xs },
  codeValue: { color: Colors.primary, fontSize: FontSizes.xxxl, fontWeight: FontWeights.black, letterSpacing: 4, marginVertical: Spacing.sm },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.sm },
  shareTxt: { color: Colors.primary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  sectionTitle: { color: Colors.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold, marginBottom: Spacing.md },
  memberCard: { marginBottom: Spacing.sm, flexDirection: 'row', alignItems: 'center' },
  memberAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  memberInitial: { color: Colors.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
  memberInfo: { flex: 1 },
  memberName: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  memberRole: { color: Colors.textSecondary, fontSize: FontSizes.xs },
  tipCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginTop: Spacing.lg },
  tipTxt: { flex: 1, color: Colors.textSecondary, fontSize: FontSizes.sm, lineHeight: 20 },
});
