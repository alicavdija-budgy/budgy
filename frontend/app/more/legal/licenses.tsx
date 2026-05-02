/**
 * GUARDIAN MONEY CHF - Open Source Licenses
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BorderRadius, Spacing, FontSizes, FontWeights } from '../../../src/constants/theme';
import { useTheme } from '../../../src/hooks/useTheme';

const LIBS = [
  { name: 'React Native', license: 'MIT', url: 'https://reactnative.dev' },
  { name: 'Expo', license: 'MIT', url: 'https://expo.dev' },
  { name: 'Expo Router', license: 'MIT', url: 'https://expo.github.io/router' },
  { name: 'Zustand', license: 'MIT', url: 'https://github.com/pmndrs/zustand' },
  { name: 'Supabase JS', license: 'MIT', url: 'https://supabase.com' },
  { name: 'React Native Reanimated', license: 'MIT', url: 'https://docs.swmansion.com/react-native-reanimated' },
  { name: 'React Native SVG', license: 'MIT', url: 'https://github.com/software-mansion/react-native-svg' },
  { name: 'Expo Camera', license: 'MIT', url: 'https://docs.expo.dev/versions/latest/sdk/camera' },
  { name: 'Expo Local Authentication', license: 'MIT', url: 'https://docs.expo.dev/versions/latest/sdk/local-authentication' },
  { name: 'Expo Secure Store', license: 'MIT', url: 'https://docs.expo.dev/versions/latest/sdk/securestore' },
  { name: 'Ionicons', license: 'MIT', url: 'https://ionic.io/ionicons' },
  { name: 'AsyncStorage', license: 'MIT', url: 'https://github.com/react-native-async-storage/async-storage' },
  { name: 'FastAPI', license: 'MIT', url: 'https://fastapi.tiangolo.com' },
  { name: 'Pydantic', license: 'MIT', url: 'https://docs.pydantic.dev' },
];

export default function LicensesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useTheme();
  const styles = makeStyles(C);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={26} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Licences</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Budgy est construit avec des bibliothèques open source. Nous remercions leurs auteurs pour leur
          travail. Chaque bibliothèque est utilisée conformément à sa licence d’origine.
        </Text>

        {LIBS.map((lib, idx) => (
          <View key={idx} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{lib.name}</Text>
              <Text style={styles.url}>{lib.url}</Text>
            </View>
            <View style={styles.licenseBadge}>
              <Text style={styles.licenseText}>{lib.license}</Text>
            </View>
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const makeStyles = (C: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  content: { padding: Spacing.lg },
  intro: { color: C.textSecondary, fontSize: FontSizes.sm, lineHeight: 22, marginBottom: Spacing.lg },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: C.cardBorder,
  },
  name: { color: C.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  url: { color: C.textTertiary, fontSize: FontSizes.xs, marginTop: 2 },
  licenseBadge: {
    backgroundColor: `${C.primary}20`, paddingVertical: 4, paddingHorizontal: 10, borderRadius: BorderRadius.full,
  },
  licenseText: { color: C.primary, fontSize: FontSizes.xs, fontWeight: FontWeights.bold },
});
