/**
 * BUDGY v4.0 — Sélecteur de catégories groupé (ménages suisses).
 * Remplace les rangées horizontales qui débordaient de l'écran.
 * - Groupes nommés + recherche + catégories personnelles de l'utilisateur.
 * - Une seule taxonomie (EXPENSE_CATEGORIES) + customCategories du store.
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spacing, FontSizes, FontWeights, BorderRadius } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import type { ThemePalette } from '../constants/palettes';
import { useTranslation } from '../hooks/useTranslation';
import { useStore } from '../stores/useStore';
import { EXPENSE_CATEGORIES } from '../data/swiss-data';

const CUSTOM_COLORS = ['#34D399', '#60A5FA', '#F59E0B', '#F472B6', '#A78BFA', '#2DD4BF'];

export interface CategoryGroupPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (categoryId: string) => void;
  groups: { key: string; ids: string[] }[];
  /** ids à exclure (ex: catégories déjà budgétées) */
  excludeIds?: string[];
}

export function CategoryGroupPicker({ visible, onClose, onSelect, groups, excludeIds }: CategoryGroupPickerProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const customCategories = useStore((s) => s.customCategories);
  const addCustomCategory = useStore((s) => s.addCustomCategory);

  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const byId = useMemo(() => {
    const m = new Map<string, { id: string; name: string; icon: string; color: string }>();
    EXPENSE_CATEGORIES.forEach((c) => m.set(c.id, c as any));
    return m;
  }, []);

  const label = (id: string, fallback: string) => {
    // 'loyer' est partagé avec les revenus locatifs — contexte dépense ici.
    const key = id === 'loyer' ? 'categoryLabels.loyerExpense' : `categoryLabels.${id}`;
    const tr = t(key);
    return tr && tr !== key ? tr : fallback;
  };

  const excluded = useMemo(() => new Set(excludeIds || []), [excludeIds]);
  const q = query.trim().toLowerCase();

  const filteredGroups = useMemo(() => groups
    .map((g) => ({
      key: g.key,
      cats: g.ids
        .map((id) => byId.get(id))
        .filter((c): c is NonNullable<typeof c> => !!c && !excluded.has(c.id))
        .filter((c) => !q || label(c.id, c.name).toLowerCase().includes(q)),
    }))
    .filter((g) => g.cats.length > 0),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [groups, byId, excluded, q, t]);

  const filteredCustom = useMemo(() => customCategories
    .filter((c) => !excluded.has(c.id))
    .filter((c) => !q || c.name.toLowerCase().includes(q)),
  [customCategories, excluded, q]);

  const createCustom = () => {
    const name = newName.trim();
    if (!name) return;
    const id = `custom_${Date.now()}`;
    addCustomCategory({
      id, name,
      icon: 'pricetag',
      color: CUSTOM_COLORS[customCategories.length % CUSTOM_COLORS.length],
      createdAt: Date.now(),
    });
    setNewName('');
    setCreating(false);
    onSelect(id);
  };

  const Row = ({ id, name, icon, color }: { id: string; name: string; icon: string; color: string }) => (
    <TouchableOpacity style={styles.row} onPress={() => onSelect(id)} accessibilityRole="button" accessibilityLabel={name}>
      <View style={[styles.rowIcon, { backgroundColor: `${color}1C` }]}>
        <Ionicons name={icon as any} size={17} color={color} />
      </View>
      <Text style={styles.rowTxt} numberOfLines={1}>{name}</Text>
      <Ionicons name="chevron-forward" size={15} color={theme.textTertiary} />
    </TouchableOpacity>
  );

  // ARCHITECTURE (fix P0 iOS) : ce sélecteur n'est PAS un Modal natif.
  // Il se rend en calque absolu DANS le Modal parent (formulaire) : une seule
  // présentation native iOS, deux vues internes — plus aucun blocage lié à
  // l'empilement de deux fenêtres UIKit concurrentes.
  if (!visible) return null;
  return (
    <View style={styles.overlayRoot}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} accessibilityLabel="close-category-picker" />
      <KeyboardAvoidingView
        style={styles.kav}
        pointerEvents="box-none"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('catPicker.title')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={theme.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('catPicker.search')}
              placeholderTextColor={theme.textTertiary}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={theme.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            style={{ flexGrow: 0 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {filteredCustom.length > 0 && (
              <View style={styles.group}>
                <Text style={styles.groupTitle}>{t('catPicker.myCategories')}</Text>
                {filteredCustom.map((c) => <Row key={c.id} id={c.id} name={c.name} icon={c.icon} color={c.color} />)}
              </View>
            )}
            {filteredGroups.map((g) => (
              <View key={g.key} style={styles.group}>
                <Text style={styles.groupTitle}>{t(`catGroups.${g.key}`)}</Text>
                {g.cats.map((c) => <Row key={c.id} id={c.id} name={label(c.id, c.name)} icon={c.icon} color={c.color} />)}
              </View>
            ))}

            {/* Créer une catégorie personnelle */}
            {creating ? (
              <View style={styles.createRow}>
                <TextInput
                  style={styles.createInput}
                  placeholder={t('catPicker.newNamePlaceholder')}
                  placeholderTextColor={theme.textTertiary}
                  value={newName}
                  onChangeText={setNewName}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={createCustom}
                />
                <TouchableOpacity style={styles.createBtn} onPress={createCustom}>
                  <Ionicons name="checkmark" size={18} color="#07111F" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.addCustom} onPress={() => setCreating(true)}>
                <Ionicons name="add-circle-outline" size={18} color={theme.primary} />
                <Text style={styles.addCustomTxt}>{t('catPicker.createCustom')}</Text>
              </TouchableOpacity>
            )}
            <View style={{ height: 8 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (C: ThemePalette) => StyleSheet.create({
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
    zIndex: 1000,
    elevation: 24,
  },
  kav: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xxl, borderTopRightRadius: BorderRadius.xxl,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, maxHeight: '86%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  title: { color: C.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
    borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.md, marginBottom: Spacing.md,
  },
  searchInput: { flex: 1, paddingVertical: 10, color: C.text, fontSize: FontSizes.md },
  group: { marginBottom: Spacing.md },
  groupTitle: {
    color: C.textTertiary, fontSize: 11, fontWeight: FontWeights.black,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
    borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.md, paddingVertical: 11,
    marginBottom: 6, minHeight: 44,
  },
  rowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTxt: { flex: 1, color: C.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  addCustom: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 13, borderRadius: BorderRadius.lg, borderWidth: 1,
    borderColor: `${C.primary}50`, borderStyle: 'dashed', marginTop: 2, minHeight: 44,
  },
  addCustomTxt: { color: C.primary, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  createRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  createInput: {
    flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
    borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.md, paddingVertical: 11,
    color: C.text, fontSize: FontSizes.md,
  },
  createBtn: {
    width: 46, borderRadius: BorderRadius.lg, backgroundColor: C.primary,
    alignItems: 'center', justifyContent: 'center',
  },
});
