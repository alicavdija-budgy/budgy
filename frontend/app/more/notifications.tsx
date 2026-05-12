/**
 * GUARDIAN MONEY CHF - Notifications Screen
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import type { ThemePalette } from '../../src/constants/palettes';
import { Card, EmptyState, Button } from '../../src/components/ui';
import { useStore } from '../../src/stores/useStore';

export default function NotificationsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { notifications, markNotificationRead, clearNotifications } = useStore();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        {notifications.length > 0 && (
          <TouchableOpacity onPress={clearNotifications}>
            <Text style={styles.clearBtn}>Tout effacer</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {notifications.length === 0 ? (
          <EmptyState
            icon="notifications-outline"
            title="Aucune notification"
            subtitle="Vous êtes à jour!"
          />
        ) : (
          notifications.map((notif) => (
            <TouchableOpacity
              key={notif.id}
              onPress={() => markNotificationRead(notif.id)}
            >
              <Card style={[styles.notifCard, !notif.read && styles.notifCardUnread]}>
                <Text style={styles.notifIcon}>{notif.icon}</Text>
                <View style={styles.notifContent}>
                  <Text style={styles.notifTitle}>{notif.title}</Text>
                  <Text style={styles.notifSubtitle}>{notif.subtitle}</Text>
                </View>
                {!notif.read && <View style={styles.unreadDot} />}
              </Card>
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const makeStyles = (Colors: ThemePalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold, marginLeft: Spacing.sm },
  clearBtn: { color: Colors.error, fontSize: FontSizes.sm },
  scroll: { flex: 1 },
  content: { padding: Spacing.lg },
  notifCard: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  notifCardUnread: { borderColor: Colors.primary, borderWidth: 1 },
  notifIcon: { fontSize: 28, marginRight: Spacing.md },
  notifContent: { flex: 1 },
  notifTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  notifSubtitle: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
});
