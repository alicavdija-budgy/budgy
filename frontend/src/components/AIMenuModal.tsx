/**
 * BUDGY — AI Menu Modal
 *
 * Bottom-sheet style modal opened by the central Budgy AI button.
 * 5 actions per Session 2 spec:
 *   1. Analyse finances        → /more/ai-optimizer
 *   2. Scanner intelligent     → /scanner-modal
 *   3. Analyse abonnements     → /more/recurring (subscriptions)
 *   4. Conseils économies      → /more/predict   (AI Coach Predict)
 *   5. Analyse factures        → /more/email-import (3-method import)
 *
 * Pure presentational — keeps existing screens untouched.
 */
import React from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

const ACCENT = '#16E0C6';

interface ActionItem {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  route: string;
}

const ACTIONS: ActionItem[] = [
  {
    id: 'analyse-finances',
    icon: 'bar-chart',
    title: 'Analyse finances',
    subtitle: 'Vue complète de vos finances',
    route: '/more/ai-optimizer',
  },
  {
    id: 'scanner',
    icon: 'scan',
    title: 'Scanner intelligent',
    subtitle: 'Scan IA de factures & reçus',
    route: '/scanner-modal',
  },
  {
    id: 'abonnements',
    icon: 'sync-circle',
    title: 'Analyse abonnements',
    subtitle: 'Détecte vos abonnements',
    route: '/more/recurring',
  },
  {
    id: 'conseils',
    icon: 'bulb',
    title: 'Conseils économies',
    subtitle: 'Recommandations IA',
    route: '/more/predict',
  },
  {
    id: 'factures',
    icon: 'document-text',
    title: 'Analyse factures',
    subtitle: 'Extraction & insights IA',
    route: '/more/email-import',
  },
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function AIMenuModal({ visible, onClose }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleAction = (item: ActionItem) => {
    if (Platform.OS !== 'web') {
      try {
        Haptics.selectionAsync();
      } catch {}
    }
    onClose();
    // small delay so the sheet animates out before navigation
    setTimeout(() => {
      try {
        router.push(item.route as any);
      } catch (e) {
        console.warn('[AIMenuModal] navigation failed:', e);
      }
    }, 120);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) + 8 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.aiBadge}>
              <Text style={styles.aiBadgeB}>B</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Assistant IA Budgy</Text>
              <Text style={styles.subtitle}>Choisissez une action intelligente</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={14} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#888" />
            </Pressable>
          </View>

          <View style={styles.list}>
            {ACTIONS.map((item, idx) => (
              <Pressable
                key={item.id}
                onPress={() => handleAction(item)}
                style={({ pressed }) => [
                  styles.row,
                  idx === ACTIONS.length - 1 && { borderBottomWidth: 0 },
                  pressed && { backgroundColor: 'rgba(22,224,198,0.08)' },
                ]}
                accessibilityRole="button"
                accessibilityLabel={item.title}
              >
                <View style={styles.iconCircle}>
                  <Ionicons name={item.icon} size={20} color={ACCENT} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <Text style={styles.rowSub}>{item.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#555" />
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0F1115',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(22,224,198,0.18)',
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#2a2f3a',
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 18,
  },
  aiBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(22,224,198,0.12)',
    borderWidth: 1.5,
    borderColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  aiBadgeB: {
    color: ACCENT,
    fontSize: 22,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginTop: -2,
  },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  subtitle: {
    color: '#9aa0aa',
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1a1f2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(22,224,198,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(22,224,198,0.25)',
  },
  rowTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  rowSub: {
    color: '#7a808a',
    fontSize: 12,
    marginTop: 2,
  },
});
