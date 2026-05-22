/**
 * BUDGY — Network Resilience Layer (offline-first)
 *
 * Provides:
 *   - safeFetch(): fetch with timeout, retry, exponential backoff, AbortController
 *   - subscribeNetwork(): native NetInfo listener (cross-platform, lazy load)
 *   - getNetworkState(): synchronous last-known state
 *
 * Designed so the app NEVER crashes or hangs because of a flaky network.
 * Every backend call is wrapped → graceful degradation, no UI freeze.
 */

import { Platform } from 'react-native';

// ── Types ───────────────────────────────────────────────────────────────────
export type NetworkType = 'unknown' | 'none' | 'wifi' | 'cellular' | 'other';

export interface NetworkState {
  isConnected: boolean;       // physical link
  isInternetReachable: boolean | null; // can actually reach the internet
  type: NetworkType;
}

export interface SafeFetchOptions {
  timeoutMs?: number;         // default 8000
  retries?: number;           // default 1
  retryBackoffMs?: number;    // default 600
  silent?: boolean;           // suppress console.warn
}

export interface SafeFetchResult<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  offline: boolean;
}

// ── NetInfo lazy load (web/Expo-Go safe) ────────────────────────────────────
let NetInfoModule: any = null;
let netInfoLoadError: boolean = false;

function loadNetInfo() {
  if (NetInfoModule || netInfoLoadError) return NetInfoModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    NetInfoModule = require('@react-native-community/netinfo').default;
  } catch {
    netInfoLoadError = true;
  }
  return NetInfoModule;
}

// ── State ───────────────────────────────────────────────────────────────────
let lastState: NetworkState = {
  isConnected: true,
  isInternetReachable: true,
  type: 'unknown',
};
const listeners = new Set<(s: NetworkState) => void>();

function normalize(raw: any): NetworkState {
  return {
    isConnected: !!raw?.isConnected,
    isInternetReachable:
      raw?.isInternetReachable === undefined ? null : !!raw.isInternetReachable,
    type: (raw?.type as NetworkType) || 'unknown',
  };
}

function emit(state: NetworkState) {
  lastState = state;
  listeners.forEach((cb) => {
    try {
      cb(state);
    } catch {}
  });
}

let started = false;

/** Start native NetInfo monitoring (idempotent). No-op on web. */
export function startNetworkMonitor() {
  if (started) return;
  if (Platform.OS === 'web') {
    // Use window.online/offline events on web
    if (typeof window !== 'undefined') {
      const update = () => {
        emit({
          isConnected: typeof navigator !== 'undefined' ? navigator.onLine : true,
          isInternetReachable: typeof navigator !== 'undefined' ? navigator.onLine : true,
          type: 'other',
        });
      };
      window.addEventListener('online', update);
      window.addEventListener('offline', update);
      update();
    }
    started = true;
    return;
  }
  const NetInfo = loadNetInfo();
  if (!NetInfo) {
    started = true;
    return; // gracefully no-op
  }
  try {
    NetInfo.fetch().then((raw: any) => emit(normalize(raw))).catch(() => {});
    NetInfo.addEventListener((raw: any) => emit(normalize(raw)));
  } catch {}
  started = true;
}

/** Subscribe to network state changes. Returns unsubscribe fn. */
export function subscribeNetwork(cb: (s: NetworkState) => void): () => void {
  listeners.add(cb);
  cb(lastState);
  return () => {
    listeners.delete(cb);
  };
}

export function getNetworkState(): NetworkState {
  return lastState;
}

export function isLikelyOnline(): boolean {
  // Treat "unknown" / first launch as online (optimistic)
  if (lastState.isInternetReachable === false) return false;
  return lastState.isConnected !== false;
}

// ── safeFetch ───────────────────────────────────────────────────────────────
async function attemptFetch(
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<{ ok: boolean; status: number; text: string; error: string | null }> {
  const ctrl =
    typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl
    ? setTimeout(() => {
        try {
          ctrl.abort();
        } catch {}
      }, timeoutMs)
    : null;
  try {
    const res = await fetch(url, {
      ...(init || {}),
      signal: ctrl ? (ctrl.signal as any) : undefined,
    });
    if (timer) clearTimeout(timer);
    const text = await res.text().catch(() => '');
    return { ok: res.ok, status: res.status, text, error: null };
  } catch (e: any) {
    if (timer) clearTimeout(timer);
    const msg = String(e?.message || e || 'network_error');
    return { ok: false, status: 0, text: '', error: msg };
  }
}

/**
 * Fetch wrapper with timeout, retry and graceful failure.
 * NEVER throws. Always returns a SafeFetchResult.
 */
export async function safeFetch<T = any>(
  url: string,
  init?: RequestInit,
  opts?: SafeFetchOptions
): Promise<SafeFetchResult<T>> {
  const {
    timeoutMs = 8000,
    retries = 1,
    retryBackoffMs = 600,
    silent = false,
  } = opts || {};

  // If we KNOW we're offline, skip the network attempt entirely
  if (lastState.isInternetReachable === false) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: 'offline',
      offline: true,
    };
  }

  let lastErr: string | null = null;
  let lastStatus = 0;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const r = await attemptFetch(url, init, timeoutMs);
    if (r.ok) {
      let data: any = null;
      try {
        data = r.text ? JSON.parse(r.text) : null;
      } catch {
        data = r.text as any;
      }
      return { ok: true, status: r.status, data, error: null, offline: false };
    }
    // Non-2xx with body — return for caller to inspect (don't retry on 4xx)
    if (r.status >= 400 && r.status < 500) {
      let data: any = null;
      try {
        data = r.text ? JSON.parse(r.text) : null;
      } catch {
        data = null;
      }
      return {
        ok: false,
        status: r.status,
        data,
        error: `http_${r.status}`,
        offline: false,
      };
    }
    lastErr = r.error || `http_${r.status}`;
    lastStatus = r.status;
    if (attempt < retries) {
      // Exponential backoff with small jitter
      const delay = retryBackoffMs * Math.pow(2, attempt) + Math.random() * 200;
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  if (!silent) {
    console.warn(`[safeFetch] ${url} failed: ${lastErr}`);
  }
  return {
    ok: false,
    status: lastStatus,
    data: null,
    error: lastErr || 'network_error',
    offline: !isLikelyOnline(),
  };
}

/** Quick HEAD/GET ping used to confirm reachability. */
export async function ping(
  url: string,
  timeoutMs = 4000
): Promise<boolean> {
  const r = await safeFetch(url, { method: 'GET' }, { timeoutMs, retries: 0, silent: true });
  return r.ok || (r.status >= 200 && r.status < 500);
}

/**
 * Safely parse a JSON string. NEVER throws. Returns a default if parsing fails
 * or if the input is not valid JSON (e.g. HTML / plain text from a proxy
 * returning a 500 error page).
 *
 * Use for any backend response where the server might misbehave.
 */
export function safeJsonParse<T = any>(input: any, fallback: T | null = null): T | null {
  if (input == null) return fallback;
  if (typeof input === 'object') return input as T;
  if (typeof input !== 'string') return fallback;
  const trimmed = input.trim();
  if (!trimmed) return fallback;
  // Quick guard: HTML/text responses
  if (trimmed.startsWith('<') || trimmed.toLowerCase().startsWith('<!doctype')) {
    return fallback;
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return fallback;
  }
}

/**
 * Convenience: fetch a JSON endpoint with full resilience (timeout, retry,
 * graceful parse, never throws). Returns `{ ok, data, error, status }`.
 */
export async function safeFetchJson<T = any>(
  url: string,
  init?: RequestInit,
  opts?: SafeFetchOptions
): Promise<SafeFetchResult<T>> {
  const r = await safeFetch<T>(url, init, opts);
  // safeFetch already attempts JSON.parse — but if the body was HTML/text we
  // may have stored it as a string. Re-parse defensively.
  if (r.ok && typeof r.data === 'string') {
    const parsed = safeJsonParse<T>(r.data);
    return {
      ...r,
      data: parsed,
      ok: parsed !== null,
      error: parsed === null ? 'invalid_json' : null,
    };
  }
  return r;
}

/**
 * Map a SafeFetchResult to a user-facing message (i18n-friendly key).
 * The component can pass this key to t() for translation.
 */
export function describeError(
  r: SafeFetchResult<any> | { ok: boolean; status: number; error?: string | null; offline?: boolean }
): string {
  if (r.offline) return 'network.noInternet';
  if (!r.error) return 'errors.unknown';
  if (r.status === 0 || r.error.includes('aborted')) return 'errors.timeout';
  if (r.status === 404) return 'errors.notFound';
  if (r.status === 401 || r.status === 403) return 'errors.unauthorized';
  if (r.status >= 500) return 'errors.serverError';
  if (r.error === 'invalid_json' || r.error?.includes('JSON')) return 'errors.invalidResponse';
  return 'errors.generic';
}
