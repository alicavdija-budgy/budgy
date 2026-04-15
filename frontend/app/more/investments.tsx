/**
 * GUARDIAN MONEY CHF - Placeholder screens
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { Card } from '../../src/components/ui';

export default function InvestmentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Investissements</Text>
        <View style={{ width: 40 }} />
      </View>
      
      <View style={styles.content}>
        <Card style={styles.card}>
          <Ionicons name="trending-up" size={48} color={Colors.success} />
          <Text style={styles.cardTitle}>Portefeuille</Text>
          <Text style={styles.cardText}>Suivez vos ETF, actions et crypto.</Text>
          <Text style={styles.comingSoon}>Bientôt disponible avec Supabase sync</Text>
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  content: { flex: 1, padding: Spacing.lg, justifyContent: 'center' },
  card: { alignItems: 'center', padding: Spacing.xxl },
  cardTitle: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold, marginTop: Spacing.md },
  cardText: { color: Colors.textSecondary, fontSize: FontSizes.md, textAlign: 'center', marginTop: Spacing.sm },
  comingSoon: { color: Colors.primary, fontSize: FontSizes.sm, marginTop: Spacing.lg },
});
