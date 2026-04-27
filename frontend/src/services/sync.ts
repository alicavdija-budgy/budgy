/**
 * GUARDIAN MONEY CHF - Offline Sync Service
 * Watches network state and flushes the sync queue when back online.
 */

import { Platform } from 'react-native';
import { useStore } from '../stores/useStore';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

let pingInterval: any = null;

export async function pingBackend(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${BACKEND_URL}/api/health`, { signal: ctrl.signal as any });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

export function startSyncMonitor() {
  if (pingInterval) return;
  const check = async () => {
    const online = await pingBackend();
    const { isOnline, setOnline, syncQueue } = useStore.getState();
    if (online !== isOnline) setOnline(online);
    if (online && syncQueue.length > 0) {
      flushQueue();
    }
  };
  // Check immediately and then every 20s
  check();
  pingInterval = setInterval(check, 20000);
}

export function stopSyncMonitor() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}

export async function flushQueue() {
  const { syncQueue, removeFromQueue } = useStore.getState();
  for (const item of syncQueue) {
    // For MVP we just acknowledge and remove. Real impl would POST to a sync endpoint.
    if (Platform.OS !== 'web') {
      // best-effort processing
    }
    removeFromQueue(item.id);
  }
}
