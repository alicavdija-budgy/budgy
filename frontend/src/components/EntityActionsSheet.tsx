/**
 * BUDGY — EntityActionsSheet
 *
 * Reusable bottom sheet that surfaces Edit / Delete actions for any list item
 * (transactions, invoices, contracts, recurring, receipts, investments, etc.).
 *
 * Why? Avoids duplicating Modal + Alert boilerplate across 9+ screens and keeps
 * UX 100% consistent everywhere (animation, haptics, confirmation, dark/light).
 *
 * Usage:
 *   const [actions, setActions] = useState<EntityActionsContext | null>(null);
 *
 *   <EntityActionsSheet
 *     ctx={actions}
 *     onClose={() => setActions(null)}
 *     onEdit={() => { setActions(null); openEditForm(actions!.id); }}
 *     onDelete={() => { setActions(null); deleteFromStore(actions!.id); }}
 *   />
 *
 *   // To open:
 *   <TouchableOpacity onLongPress={() => setActions({ id, title, subtitle })}>
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Modal, Pressable, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../hooks/useTheme';
import type { ThemePalette } from '../constants/palettes';
import { BorderRadius, Spacing, FontSizes, FontWeights } from '../constants/theme';

export interface EntityActionsContext {
  id: string;
  title: string;
  subtitle?: string;
  /** Optional accent color for the leading dot (matches category) */
  accent?: string;
  /** Hide edit button if this entity does not support edit (rare) */
  editable?: boolean;
}

interface Props {
  ctx: EntityActionsContext | null;
  onClose: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  /** Custom title to display on the delete confirmation alert */
  deleteConfirmTitle?: string;
  deleteConfirmMessage?: string;
}

export function EntityActionsSheet({
  ctx,
  onClose,
  onEdit,
  onDelete,
  deleteConfirmTitle = 'Supprimer cet élément ?',
  deleteConfirmMessage = 'Cette action est irréversible.',
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const visible = !!ctx;

  const handleEdit = () => {
    if (Platform.OS !== 'web') {
      try { Haptics.selectionAsync(); } catch {}
    }
    onEdit?.();
  };

  const handleDelete = () => {
    if (Platform.OS !== 'web') {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
    }
    Alert.alert(
      deleteConfirmTitle,
      deleteConfirmMessage,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            if (Platform.OS !== 'web') {
              try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
            }
            onDelete();
          },
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
        >
          <View style={styles.handle} />

          {/* Header */}
          {ctx && (
            <View style={styles.headerRow}>
              {ctx.accent ? (
                <View style={[styles.accentDot, { backgroundColor: ctx.accent }]} />
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>{ctx.title}</Text>
                {ctx.subtitle ? (
                  <Text style={styles.subtitle} numberOfLines={1}>{ctx.subtitle}</Text>
                ) : null}
              </View>
            </View>
          )}

          {/* Actions */}
          {(ctx?.editable ?? true) && onEdit && (
            <TouchableOpacity style={styles.actionRow} onPress={handleEdit} activeOpacity={0.7}>
              <View style={[styles.iconWrap, { backgroundColor: `${theme.primary}18` }]}>
                <Ionicons name="create-outline" size={22} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionLabel}>Modifier</Text>
                <Text style={styles.actionHint}>Changer les informations</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.actionRow} onPress={handleDelete} activeOpacity={0.7}>
            <View style={[styles.iconWrap, { backgroundColor: `${theme.error}18` }]}>
              <Ionicons name="trash-outline" size={22} color={theme.error} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionLabel, { color: theme.error }]}>Supprimer</Text>
              <Text style={styles.actionHint}>L'élément sera retiré définitivement</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
          </TouchableOpacity>

          {/* Cancel */}
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.cancelTxt}>Annuler</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (Colors: ThemePalette) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.cardBorder,
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
    paddingBottom: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.cardBorder,
    marginBottom: Spacing.sm,
  },
  accentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  title: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: Spacing.md,
    paddingHorizontal: 4,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
  actionHint: {
    color: Colors.textTertiary,
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  cancelBtn: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.card,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  cancelTxt: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
});

export default EntityActionsSheet;
