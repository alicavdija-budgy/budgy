/**
 * BUDGY — Online/Offline detection (offline-first).
 *
 * Strategy (multi-layer):
 *   1. NetInfo native signal as PRIMARY truth (fast, accurate).
 *   2. Light HTTP ping (Supabase OR backend) as FALLBACK only if NetInfo
 *      is unknown OR reports connected-but-uncertain.
 *
 * The app stays usable even if the backend URL is unreachable: we ONLY flip
 * to "offline" when there's truly no internet. A flaky backend will NOT
 * lock the app in offline mode.
 */

import { Platform } from 'react-native';
import { useStore } from '../stores/useStore';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import {
  startNetworkMonitor,
  subscribeNetwork,
  ping,
  isLikelyOnline,
  type NetworkState,
} from '../lib/network';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';

let pingInterval: any = null;
let netInfoUnsub: (() => void) | null = null;
let consecutiveOfflineChecks = 0;

async function pingBackendQuick(): Promise<boolean> {
  if (!BACKEND_URL) return false;
  return ping(`${BACKEND_URL}/api/health`, 3500);
}

async function pingSupabaseQuick(): Promise<boolean> {
  if (!SUPABASE_URL) return false;
  return ping(`${SUPABASE_URL}/auth/v1/health`, 3500);
}

/**
 * Confirm reachability via a light HTTP ping.
 * Only called when NetInfo signal is ambiguous.
 */
async function confirmInternet(): Promise<boolean> {
  const checks = await Promise.all([pingSupabaseQuick(), pingBackendQuick()]);
  return checks.some(Boolean);
}

function applyOnlineState(online: boolean) {
  const { isOnline, setOnline, syncQueue } = useStore.getState();

  // Debounce flipping to offline (avoid flicker on transient drops)
  if (!online) {
    consecutiveOfflineChecks += 1;
    if (consecutiveOfflineChecks < 2 && isOnline) return;
  } else {
    consecutiveOfflineChecks = 0;
  }

  if (online !== isOnline) setOnline(online);
  if (online && syncQueue.length > 0) {
    flushQueue().catch(() => {});
  }
}

/**
 * Bootstrap the offline-first network layer.
 * Idempotent: safe to call multiple times.
 */
export function startSyncMonitor() {
  if (pingInterval) return;

  // 1) Start native NetInfo monitor (no-op on web/Expo Go without module)
  startNetworkMonitor();

  // 2) Subscribe to NetInfo changes — primary source of truth
  netInfoUnsub = subscribeNetwork(async (state: NetworkState) => {
    // Optimistic: NetInfo says connected → trust it
    if (state.isConnected && state.isInternetReachable !== false) {
      applyOnlineState(true);
      return;
    }
    // NetInfo says NOT connected → confirm with a quick ping before flipping
    if (!state.isConnected || state.isInternetReachable === false) {
      const confirmed = await confirmInternet();
      applyOnlineState(confirmed);
    }
  });

  // 3) Light periodic safety-net (every 30s) — catches edge cases
  const check = async () => {
    if (isLikelyOnline()) {
      // NetInfo trusts the link; only ping if we're flagged offline locally
      const { isOnline } = useStore.getState();
      if (!isOnline) {
        const confirmed = await confirmInternet();
        applyOnlineState(confirmed);
      }
      return;
    }
    const confirmed = await confirmInternet();
    applyOnlineState(confirmed);
  };
  // Run once at startup, then every 30s (was 15s — less aggressive)
  check();
  pingInterval = setInterval(check, 30000);
}

export function stopSyncMonitor() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  if (netInfoUnsub) {
    netInfoUnsub();
    netInfoUnsub = null;
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
 * stays logged in across launches. Never throws.
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

// Re-export legacy names for backward compatibility
export const pingBackend = pingBackendQuick;
export const pingSupabase = pingSupabaseQuick;
export const checkOnline = confirmInternet;
