/**
 * BUDGY — EntityEditModal
 *
 * @i18n-technical-file
 *
 * ⚠ Uses generic FR-CH default for switch hint ("Activé"/"Désactivé") and
 * submit label. Every caller passes its own translated `title` and can
 * override `submitLabel`. Multi-locale switch labels via i18n key
 * `common.enabled` / `common.disabled` — v3.9.1 backlog.
 *
 * Generic, schema-driven edit modal used for editing all 9 entity types:
 * investments, crypto, recurring, budgets, incomes, expenses, tickets, invoices, contracts.
 *
 * The caller passes an array of `EditField` definitions and an initial values
 * object; this component renders the inputs and returns the updated values via
 * `onSubmit(values)`. Avoids duplicating Modal + form boilerplate 9 times.
 *
 * NOTE: Use this for SIMPLE edit forms (text + number + date + dropdown).
 * For complex multi-step flows, keep a dedicated screen.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  Modal, Pressable, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import type { ThemePalette } from '../constants/palettes';
import { BorderRadius, Spacing, FontSizes, FontWeights } from '../constants/theme';
import { Button } from './ui';

export type EditFieldType = 'text' | 'number' | 'date' | 'select' | 'switch' | 'multiline';

export interface EditField {
  key: string;
  label: string;
  type: EditFieldType;
  placeholder?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Options for type='select' */
  options?: { value: string; label: string; color?: string; icon?: string }[];
  required?: boolean;
  /** For 'number' inputs — formatted as decimal */
  decimal?: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  fields: EditField[];
  initialValues: Record<string, any>;
  onSubmit: (values: Record<string, any>) => void;
  submitLabel?: string;
}

export function EntityEditModal({
  visible,
  onClose,
  title,
  fields,
  initialValues,
  onSubmit,
  submitLabel = 'Enregistrer',
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [values, setValues] = useState<Record<string, any>>(initialValues);

  // Sync when reopened with new entity
  useEffect(() => {
    if (visible) setValues(initialValues);
  }, [visible, initialValues]);

  const setField = (key: string, val: any) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleSubmit = () => {
    // Convert decimal strings to numbers
    const out: Record<string, any> = { ...values };
    for (const f of fields) {
      if (f.type === 'number' && typeof out[f.key] === 'string') {
        const n = parseFloat(String(out[f.key]).replace(',', '.'));
        out[f.key] = isNaN(n) ? 0 : n;
      }
    }
    onSubmit(out);
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
        <KeyboardAvoidingView
          style={styles.kavWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          >
            <View style={styles.handle} />

            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: Spacing.lg }}
            >
              {fields.map((f) => (
                <View key={f.key} style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>{f.label}{f.required ? ' *' : ''}</Text>

                  {f.type === 'switch' ? (
                    <View style={styles.switchRow}>
                      <Switch
                        value={!!values[f.key]}
                        onValueChange={(v) => setField(f.key, v)}
                        trackColor={{ false: theme.cardBorder, true: theme.primary }}
                      />
                      <Text style={styles.switchHint}>
                        {values[f.key] ? 'Activé' : 'Désactivé'}
                      </Text>
                    </View>
                  ) : f.type === 'select' && f.options ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={styles.chipRow}>
                        {f.options.map((opt) => {
                          const selected = values[f.key] === opt.value;
                          const c = opt.color || theme.primary;
                          return (
                            <TouchableOpacity
                              key={opt.value}
                              style={[
                                styles.chip,
                                selected && { backgroundColor: `${c}25`, borderColor: c },
                              ]}
                              onPress={() => setField(f.key, opt.value)}
                            >
                              {opt.icon ? (
                                <Ionicons name={opt.icon as any} size={14} color={c} />
                              ) : null}
                              <Text style={[styles.chipText, selected && { color: c }]}>
                                {opt.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>
                  ) : f.type === 'multiline' ? (
                    <TextInput
                      style={[styles.input, styles.multiline]}
                      multiline
                      value={String(values[f.key] ?? '')}
                      onChangeText={(t) => setField(f.key, t)}
                      placeholder={f.placeholder}
                      placeholderTextColor={theme.textTertiary}
                      textAlignVertical="top"
                    />
                  ) : (
                    <View style={styles.inputWrap}>
                      {f.icon ? (
                        <Ionicons name={f.icon} size={18} color={theme.textTertiary} />
                      ) : null}
                      <TextInput
                        style={styles.inputInline}
                        value={String(values[f.key] ?? '')}
                        onChangeText={(t) =>
                          setField(
                            f.key,
                            f.type === 'number' ? t.replace(/[^0-9.,]/g, '') : t
                          )
                        }
                        placeholder={f.placeholder}
                        placeholderTextColor={theme.textTertiary}
                        keyboardType={f.type === 'number' ? 'decimal-pad' : 'default'}
                      />
                    </View>
                  )}
                </View>
              ))}

              <Button
                title={submitLabel}
                onPress={handleSubmit}
                fullWidth
                size="lg"
                icon="checkmark-circle"
                style={{ marginTop: Spacing.lg }}
              />
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (Colors: ThemePalette) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  kavWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    maxHeight: '92%',
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.cardBorder,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  title: {
    color: Colors.text,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  fieldWrap: { marginBottom: Spacing.md },
  fieldLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    gap: 8,
  },
  inputInline: {
    flex: 1,
    color: Colors.text,
    fontSize: FontSizes.md,
    paddingVertical: Spacing.md,
  },
  input: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    color: Colors.text,
    fontSize: FontSizes.md,
  },
  multiline: { minHeight: 80 },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.card,
  },
  chipText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchHint: { color: Colors.textSecondary, fontSize: FontSizes.sm },
});

export default EntityEditModal;
