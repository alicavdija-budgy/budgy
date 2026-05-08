/**
 * BUDGY — Online/Offline detection + Sync queue flusher.
 *
 * Strategy: ping BOTH Supabase REST and our FastAPI backend in parallel.
 * If either responds → online. This way a flaky preview tunnel doesn't
 * lock the app in offline mode.
 */

import { Platform } from 'react-native';
import { useStore } from '../stores/useStore';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';

let pingInterval: any = null;
let consecutiveOfflineChecks = 0;

async function fetchWithTimeout(url: string, ms = 4000): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    const res = await fetch(url, { signal: ctrl.signal as any });
    clearTimeout(timer);
    return res.ok || res.status === 401 || res.status === 404;
  } catch {
    return false;
  }
}

export async function pingBackend(): Promise<boolean> {
  return fetchWithTimeout(`${BACKEND_URL}/api/health`);
}

export async function pingSupabase(): Promise<boolean> {
  if (!SUPABASE_URL) return false;
  // /auth/v1/health is a public endpoint that responds without auth
  return fetchWithTimeout(`${SUPABASE_URL}/auth/v1/health`);
}

/**
 * Check connectivity by pinging multiple sources in parallel.
 * Online if ANY succeeds (resilient to single-endpoint outages).
 */
export async function checkOnline(): Promise<boolean> {
  const checks = await Promise.all([pingSupabase(), pingBackend()]);
  return checks.some(Boolean);
}

export function startSyncMonitor() {
  if (pingInterval) return;
  const check = async () => {
    const online = await checkOnline();
    const { isOnline, setOnline, syncQueue } = useStore.getState();

    // Debounce: require 2 failed checks to flip to offline (avoids flicker)
    if (!online) {
      consecutiveOfflineChecks += 1;
      if (consecutiveOfflineChecks < 2 && isOnline) {
        return; // ignore first miss
      }
    } else {
      consecutiveOfflineChecks = 0;
    }

    if (online !== isOnline) setOnline(online);
    if (online && syncQueue.length > 0) {
      flushQueue().catch(() => {});
    }
  };
  // Check immediately, then every 15s
  check();
  pingInterval = setInterval(check, 15000);
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
    if (Platform.OS !== 'web') {
      // Real sync handled by cloudSync.ts; here we just clear the queue
    }
    removeFromQueue(item.id);
  }
}

/**
 * Bootstrap: try to restore a Supabase session at app start so the user
 * stays logged in across launches.
 */
export async function bootstrapSession(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const sb = getSupabase();
    if (!sb) return false;
    const { data } = await sb.auth.getSession();
    return !!data.session;
  } catch {
    return false;
  }
}
