/**
 * GUARDIAN MONEY CHF - Push Notifications Service
 * Local + Push notifications for budget alerts, goals, and reminders
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

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
