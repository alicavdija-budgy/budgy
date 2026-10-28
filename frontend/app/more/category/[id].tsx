/**
 * BUDGY Smart 4.0 — Écran de rubrique du menu Plus.
 *
 * Affiche les fonctionnalités d'une des 5 rubriques (finances, documents,
 * intelligence, suisse, account). Simple regroupement visuel : toutes les
 * routes et les droits Gratuit/Pro existants sont réutilisés tels quels via
 * MenuList (défini dans l'onglet Plus).
 */
import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, Redirect } from 'expo-router';
import { useTheme } from '../../../src/hooks/useTheme';
import { useTranslation } from '../../../src/hooks/useTranslation';
import { usePremiumStore } from '../../../src/stores/usePremiumStore';
import { Spacing, FontWeights } from '../../../src/constants/theme';
import {
  CATEGORY_BY_ID,
  FEATURE_BY_ID,
  type BudgyFeature,
} from '../../../src/config/features';
import { MenuList, makeStyles, SAVINGS_ROUTE } from '../../(tabs)/more';

export default function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useTheme();
  const { t } = useTranslation();
  const isPro = usePremiumStore(
    (s) => s.isPro || (s.trialEndsAt !== null && s.trialEndsAt > Date.now())
  );
  const styles = useMemo(() => makeStyles(C), [C]);

  const category = CATEGORY_BY_ID[id ?? ''];

  const items: BudgyFeature[] = useMemo(() => {
    if (!category) return [];
    const list = category.featureIds
      .map((fid) => FEATURE_BY_ID[fid])
      .filter(Boolean);
    // L'épargne reste accessible en tête de "Mes finances"
    return category.id === 'finances' ? [SAVINGS_ROUTE, ...list] : list;
  }, [category]);

  if (!category) return <Redirect href="/(tabs)/more" />;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 6 }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* En-tête : retour + titre */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: Spacing.md }}>
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              backgroundColor: C.card,
              borderWidth: 1,
              borderColor: C.cardBorder,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="chevron-back" size={20} color={C.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontSize: 22, fontWeight: FontWeights.black, letterSpacing: -0.5 }} numberOfLines={1}>
              {t(category.titleKey)}
            </Text>
            <Text style={{ color: C.textSecondary, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
              {t(category.subtitleKey)}
            </Text>
          </View>
        </View>

        <MenuList items={items} isPro={isPro} C={C} t={t} router={router} styles={styles} />

        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
  );
}
