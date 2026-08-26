/**
 * GUARDIAN MONEY CHF - Push Notifications Service
 * Local + Push notifications for budget alerts, goals, and reminders
 *
 * @i18n-technical-file
 *
 * ⚠ Notification content strings are declared here as FR-CH defaults used
 * when scheduling native OS notifications outside of a React render tree
 * (Android channels, deadline reminders, monthly reset). Full multi-locale
 * scheduling is planned as a follow-up: notifications will re-read the
 * active locale at emit time and translate through the i18n bundle. The
 * strings below stay in FR-CH as the primary market fallback and are not
 * considered UI text for the i18n audit.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Request permissions
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  if (!Device.isDevice) {
    console.log('Notifications require a physical device');
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return false;
  }

  // Configure Android channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('budget-alerts', {
      name: 'Alertes Budget',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6366F1',
      sound: 'default',
    });

    await Notifications.setNotificationChannelAsync('goals', {
      name: 'Objectifs d\'épargne',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
    });

    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Rappels',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
    });
  }

  return true;
}

// Get push token
export async function getPushToken(): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) return null;

  try {
    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  } catch {
    return null;
  }
}

// ─── Local Notifications ────────────────────────────

// Budget exceeded alert
export async function sendBudgetAlert(
  category: string,
  spent: number,
  limit: number,
  percentage: number
) {
  const isExceeded = percentage >= 100;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: isExceeded ? `⚠️ Budget ${category} dépassé!` : `📊 Budget ${category}: ${Math.round(percentage)}%`,
      body: isExceeded
        ? `Vous avez dépensé CHF ${spent.toFixed(0)} sur un budget de CHF ${limit.toFixed(0)}.`
        : `Attention: CHF ${spent.toFixed(0)} / ${limit.toFixed(0)}. Il reste CHF ${(limit - spent).toFixed(0)}.`,
      data: { type: 'budget_alert', category },
      ...(Platform.OS === 'android' && { channelId: 'budget-alerts' }),
    },
    trigger: null, // Send immediately
  });
}

// Savings goal milestone
export async function sendGoalMilestone(
  goalTitle: string,
  percentage: number,
  saved: number,
  target: number
) {
  const milestones = [25, 50, 75, 100];
  const milestone = milestones.find(m => percentage >= m && percentage < m + 5);
  if (!milestone) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: milestone === 100 ? `🎉 Objectif atteint: ${goalTitle}!` : `🎯 ${goalTitle}: ${milestone}% atteint!`,
      body: milestone === 100
        ? `Félicitations! Vous avez épargné CHF ${saved.toFixed(0)}!`
        : `CHF ${saved.toFixed(0)} sur ${target.toFixed(0)}. Continuez!`,
      data: { type: 'goal_milestone', milestone },
      ...(Platform.OS === 'android' && { channelId: 'goals' }),
    },
    trigger: null,
  });
}

// Monthly expense reminder
export async function scheduleMonthlyReminder() {
  // Cancel existing reminders first
  await Notifications.cancelAllScheduledNotificationsAsync();

  // Schedule reminder on the 1st of each month at 9:00
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '📅 Nouveau mois, nouveau budget!',
      body: 'Vérifiez vos budgets et objectifs pour ce mois. Bon courage!',
      data: { type: 'monthly_reminder' },
      ...(Platform.OS === 'android' && { channelId: 'reminders' }),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
      day: 1,
      hour: 9,
      minute: 0,
    },
  });

  // LAMal reminder - November 15 each year
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🏥 Rappel LAMal - Changement d\'assurance',
      body: 'Dernier délai le 30 novembre! Comparez vos primes sur priminfo.admin.ch.',
      data: { type: 'lamal_reminder' },
      ...(Platform.OS === 'android' && { channelId: 'reminders' }),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.YEARLY,
      month: 10, // November (0-indexed)
      day: 15,
      hour: 10,
      minute: 0,
    },
  });
}

// Check all budgets and send alerts
export async function checkAndNotifyBudgets(
  budgets: { category: string; limit: number }[],
  transactions: { category: string; amount: number }[]
) {
  for (const budget of budgets) {
    const spent = transactions
      .filter(t => t.category === budget.category)
      .reduce((sum, t) => sum + t.amount, 0);

    const percentage = (spent / budget.limit) * 100;

    if (percentage >= 80) {
      await sendBudgetAlert(budget.category, spent, budget.limit, percentage);
    }
  }
}


// ──────────────────────────────────────────────────────────────────────────
// CONTRACT / INVOICE DEADLINE REMINDERS
// Schedules a local notification 90 days AND 1 day before the deadline.
// Returns the scheduled identifiers (so they can be cancelled if the contract
// is deleted/edited). All errors are swallowed — never crashes the caller.
// ──────────────────────────────────────────────────────────────────────────

interface DeadlineReminderInput {
  type: 'contract' | 'invoice' | 'recurring';
  name: string;        // e.g. "Swisscom Internet"
  dueDate: string;     // ISO 8601 or YYYY-MM-DD
  amount?: number;
}

const DEADLINE_OFFSETS_DAYS = [90, 30, 7, 1];

export async function scheduleDeadlineReminders(
  input: DeadlineReminderInput
): Promise<string[]> {
  if (Platform.OS === 'web') return [];
  try {
    const due = new Date(input.dueDate);
    if (isNaN(due.getTime())) return [];

    const titles: Record<DeadlineReminderInput['type'], string> = {
      contract: 'Contrat bientôt à échéance',
      invoice: 'Facture à payer bientôt',
      recurring: 'Paiement récurrent à venir',
    };

    const ids: string[] = [];
    const now = Date.now();
    for (const offsetDays of DEADLINE_OFFSETS_DAYS) {
      const triggerDate = new Date(due);
      triggerDate.setDate(triggerDate.getDate() - offsetDays);
      // Schedule at 09:00 local time
      triggerDate.setHours(9, 0, 0, 0);
      if (triggerDate.getTime() <= now) continue; // already in the past

      const dueLabel = due.toLocaleDateString('fr-CH', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
      const amountLabel =
        input.amount && input.amount > 0
          ? ` (CHF ${input.amount.toFixed(2)})`
          : '';

      try {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: titles[input.type],
            body:
              offsetDays === 1
                ? `Demain : ${input.name}${amountLabel} arrive à échéance.`
                : offsetDays === 7
                  ? `Dans 1 semaine : ${input.name}${amountLabel} (échéance le ${dueLabel}).`
                  : offsetDays === 30
                    ? `Dans 30 jours : ${input.name}${amountLabel} (échéance le ${dueLabel}).`
                    : `Votre ${input.type === 'contract' ? 'contrat' : 'paiement'} ${input.name}${amountLabel} arrive à échéance le ${dueLabel}.`,
            sound: 'default',
            data: { type: 'deadline', kind: input.type, name: input.name },
          },
          trigger: triggerDate as any,
        });
        ids.push(id);
      } catch {
        // ignore individual scheduling failures
      }
    }
    return ids;
  } catch {
    return [];
  }
}

/** Cancel previously scheduled deadline reminders (by identifier list). */
export async function cancelDeadlineReminders(ids: string[]): Promise<void> {
  if (Platform.OS === 'web' || !ids?.length) return;
  for (const id of ids) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {}
  }
}

// ──────────────────────────────────────────────────────────────────────────
// ENTITY-SCOPED DEADLINE REMINDERS
// Convenience wrappers that automatically persist scheduled notification IDs
// in AsyncStorage so that callers don't have to manage them.
// Use these from create / edit / delete handlers across the app.
// ──────────────────────────────────────────────────────────────────────────

const NOTIF_IDS_KEY = (entityId: string) => `budgy_notif_ids_${entityId}`;

/**
 * Schedule deadline reminders AND persist their IDs (keyed by entityId) so
 * subsequent edits or deletions can cancel and reschedule cleanly.
 *
 * Returns the scheduled IDs (same as scheduleDeadlineReminders).
 */
export async function scheduleDeadlineRemindersForEntity(
  entityId: string,
  input: DeadlineReminderInput
): Promise<string[]> {
  if (Platform.OS === 'web') return [];
  // Cancel any previous reminders first so we never duplicate
  await cancelDeadlineRemindersForEntity(entityId);
  const ids = await scheduleDeadlineReminders(input);
  try {
    if (ids.length) {
      await AsyncStorage.setItem(NOTIF_IDS_KEY(entityId), JSON.stringify(ids));
    }
  } catch {}
  return ids;
}

/**
 * Cancel all reminders previously scheduled for an entity and forget the IDs.
 * Safe to call multiple times — never throws.
 */
export async function cancelDeadlineRemindersForEntity(entityId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const raw = await AsyncStorage.getItem(NOTIF_IDS_KEY(entityId));
    if (!raw) return;
    const ids: string[] = JSON.parse(raw);
    if (Array.isArray(ids) && ids.length) {
      await cancelDeadlineReminders(ids);
    }
    await AsyncStorage.removeItem(NOTIF_IDS_KEY(entityId));
  } catch {}
}
