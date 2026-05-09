/**
 * BUDGY — Speech-to-text helper (cross-platform, crash-proof on Expo Go)
 *
 * Strategy
 *   ▸ Web        : Web Speech API (Chrome/Edge/Safari).
 *   ▸ Native (dev/EAS build) : expo-speech-recognition.
 *   ▸ Expo Go     : NEVER attempts to import the native module — we detect
 *                    `Constants.appOwnership === 'expo'` first and short-circuit.
 *                    The UI shows a yellow banner explaining a TestFlight build
 *                    is required for live mic capture. The keyboard-dictation
 *                    fallback remains available.
 *
 * IMPORTANT — bullet-proofing:
 *   ✗ No top-level `import` of expo-speech-recognition (would crash Metro).
 *   ✗ No top-level `require` either.
 *   ✓ Module is loaded lazily ONLY when we are sure we're not in Expo Go.
 *   ✓ Every load attempt is wrapped in an extra try/catch.
 *   ✓ Detection is cached — we never re-try a failed load.
 */
import { Platform } from 'react-native';

let _isExpoGo: boolean | null = null;
function isExpoGo(): boolean {
  if (_isExpoGo !== null) return _isExpoGo;
  if (Platform.OS === 'web') {
    _isExpoGo = false;
    return false;
  }
  try {
    // Lazy require — expo-constants is always available.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants').default;
    // appOwnership === 'expo' on Expo Go, 'standalone' or null on dev/EAS builds
    _isExpoGo = Constants?.appOwnership === 'expo';
  } catch {
    _isExpoGo = false; // assume not Expo Go if we cannot tell
  }
  return _isExpoGo!;
}

export type SttPhase = 'idle' | 'starting' | 'listening' | 'stopped' | 'error';

export interface SttCallbacks {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onState?: (phase: SttPhase) => void;
  onError?: (msg: string) => void;
  onVolume?: (level: number) => void;
}

export interface SttSupport {
  available: boolean;
  reason: string | null;
  engine: string;
}

// ── Module-level state ─────────────────────────────────────────────────────
let active = false;
let subs: any[] = [];
let webRec: any = null;
let _nativeModCache: any | undefined; // undefined = not tried, null = tried & failed
let _nativeReason: string | null = null;

// ── Lazy native module loader (NEVER called in Expo Go) ────────────────────
function loadNative(): { mod: any | null; reason: string | null } {
  if (_nativeModCache !== undefined) {
    return { mod: _nativeModCache, reason: _nativeReason };
  }
  // Hard guard: never even try in Expo Go
  if (isExpoGo()) {
    _nativeModCache = null;
    _nativeReason = 'Expo Go (build TestFlight requis)';
    return { mod: null, reason: _nativeReason };
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const m = require('expo-speech-recognition');
    if (!m || !m.ExpoSpeechRecognitionModule) {
      _nativeModCache = null;
      _nativeReason = 'Module non disponible';
      return { mod: null, reason: _nativeReason };
    }
    // Quick sanity probe on a property — some modules throw lazily on first access.
    try {
      const _probe = m.ExpoSpeechRecognitionModule;
      void _probe;
    } catch (probeErr) {
      _nativeModCache = null;
      _nativeReason = 'Module natif inaccessible';
      return { mod: null, reason: _nativeReason };
    }
    _nativeModCache = m;
    _nativeReason = null;
    return { mod: m, reason: null };
  } catch (e: any) {
    const msg = String(e?.message || e || '');
    _nativeModCache = null;
    if (/expo-speech-recognition/i.test(msg) || /native module/i.test(msg)) {
      _nativeReason = 'Build natif requis';
    } else {
      _nativeReason = msg || 'Module indisponible';
    }
    return { mod: null, reason: _nativeReason };
  }
}

// ── Public: feature detection ──────────────────────────────────────────────
export function getSttSupport(): SttSupport {
  try {
    if (Platform.OS === 'web') {
      const SR: any =
        (globalThis as any).SpeechRecognition ||
        (globalThis as any).webkitSpeechRecognition;
      if (!SR) {
        return { available: false, reason: 'Web Speech API non supportée', engine: '—' };
      }
      return { available: true, reason: null, engine: 'Web Speech API' };
    }

    if (isExpoGo()) {
      return {
        available: false,
        reason: 'Expo Go — build TestFlight requis',
        engine: Platform.OS === 'ios' ? 'Apple Speech (build natif)' : 'Google Speech (build natif)',
      };
    }

    const { mod, reason } = loadNative();
    if (!mod) {
      return {
        available: false,
        reason: reason || 'Module non disponible',
        engine: Platform.OS === 'ios' ? 'Apple Speech (build natif)' : 'Google Speech (build natif)',
      };
    }
    return {
      available: true,
      reason: null,
      engine: Platform.OS === 'ios' ? 'Apple Speech' : 'Google Speech',
    };
  } catch (e: any) {
    // Last-resort safety net — never crash the modal
    return { available: false, reason: String(e?.message || 'inconnu'), engine: '—' };
  }
}

// ── Public: ask runtime permissions ────────────────────────────────────────
export async function requestSttPermissions(): Promise<{ granted: boolean; reason?: string }> {
  try {
    if (Platform.OS === 'web') return { granted: true };
    if (isExpoGo()) return { granted: false, reason: 'Build TestFlight requis' };

    const { mod } = loadNative();
    if (!mod) return { granted: false, reason: 'Module non disponible' };

    const Module = mod.ExpoSpeechRecognitionModule;
    const fn =
      Module.requestPermissionsAsync?.bind(Module) ||
      Module.getPermissionsAsync?.bind(Module);
    if (!fn) return { granted: false, reason: 'API permissions manquante' };

    const res = await fn();
    const granted =
      !!res?.granted ||
      res?.status === 'granted' ||
      res?.permissions?.recordAudio?.granted === true;
    return { granted, reason: granted ? undefined : 'Permission refusée' };
  } catch (e: any) {
    return { granted: false, reason: String(e?.message || e) };
  }
}

// ── Public: start ──────────────────────────────────────────────────────────
export async function startSpeechRecognition(
  cb: SttCallbacks,
  opts: { lang?: string; continuous?: boolean; interim?: boolean } = {},
) {
  try {
    const { lang = 'fr-CH', continuous = true, interim = true } = opts;

    // ── WEB ────────────────────────────────────────────────────────────
    if (Platform.OS === 'web') {
      const SR: any =
        (globalThis as any).SpeechRecognition ||
        (globalThis as any).webkitSpeechRecognition;
      if (!SR) {
        cb.onError?.('Web Speech API non supportée');
        cb.onState?.('error');
        return;
      }
      const rec = new SR();
      rec.lang = lang;
      rec.continuous = continuous;
      rec.interimResults = interim;
      let finalText = '';
      rec.onstart = () => cb.onState?.('listening');
      rec.onerror = (ev: any) => {
        cb.onError?.(String(ev?.error || 'erreur'));
        cb.onState?.('error');
      };
      rec.onend = () => {
        active = false;
        webRec = null;
        cb.onState?.('stopped');
        if (finalText) cb.onFinal?.(finalText.trim());
      };
      rec.onresult = (ev: any) => {
        let interimTxt = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          const txt = r[0]?.transcript || '';
          if (r.isFinal) finalText += (finalText ? ' ' : '') + txt;
          else interimTxt += txt;
        }
        const composed = (finalText + ' ' + interimTxt).trim();
        cb.onPartial?.(composed);
      };
      cb.onState?.('starting');
      try {
        rec.start();
        webRec = rec;
        active = true;
      } catch (e: any) {
        cb.onError?.(String(e?.message || e));
        cb.onState?.('error');
      }
      return;
    }

    // ── EXPO GO — never proceed
    if (isExpoGo()) {
      cb.onError?.('Build TestFlight requis');
      cb.onState?.('error');
      return;
    }

    // ── NATIVE BUILD ───────────────────────────────────────────────────
    const { mod, reason } = loadNative();
    if (!mod) {
      cb.onError?.(reason || 'Module non disponible');
      cb.onState?.('error');
      return;
    }
    const Module = mod.ExpoSpeechRecognitionModule;
    const addListener =
      mod.ExpoSpeechRecognitionModuleEmitter?.addListener?.bind(mod.ExpoSpeechRecognitionModuleEmitter) ||
      Module.addListener?.bind(Module);
    if (typeof addListener !== 'function') {
      cb.onError?.('addListener indisponible');
      cb.onState?.('error');
      return;
    }
    subs = [];
    subs.push(
      addListener('start', () => cb.onState?.('listening')),
      addListener('end', () => {
        active = false;
        cb.onState?.('stopped');
        subs.forEach((s) => { try { s.remove?.(); } catch {} });
        subs = [];
      }),
      addListener('error', (ev: any) => {
        const msg = ev?.error || ev?.message || 'erreur';
        cb.onError?.(String(msg));
        cb.onState?.('error');
      }),
      addListener('result', (ev: any) => {
        const txt = ev?.results?.[0]?.transcript ?? '';
        if (!txt) return;
        if (ev?.isFinal) cb.onFinal?.(String(txt).trim());
        else cb.onPartial?.(String(txt).trim());
      }),
      addListener('volumechange', (ev: any) => {
        const v = typeof ev?.value === 'number' ? ev.value : 0;
        const norm = Math.max(0, Math.min(1, (v + 2) / 12));
        cb.onVolume?.(norm);
      }),
    );
    cb.onState?.('starting');
    Module.start({
      lang,
      continuous,
      interimResults: interim,
      maxAlternatives: 1,
      requiresOnDeviceRecognition: false,
      addsPunctuation: true,
      volumeChangeEventOptions: { enabled: true, intervalMillis: 250 },
    });
    active = true;
  } catch (e: any) {
    cb.onError?.(String(e?.message || e));
    cb.onState?.('error');
  }
}

// ── Public: stop / abort ───────────────────────────────────────────────────
export async function stopSpeechRecognition() {
  try {
    if (Platform.OS === 'web') {
      try { webRec?.stop?.(); } catch {}
      webRec = null;
      active = false;
      return;
    }
    if (isExpoGo()) return;
    const { mod } = loadNative();
    if (!mod) return;
    try { mod.ExpoSpeechRecognitionModule.stop(); } catch {}
    active = false;
  } catch {}
}

export async function abortSpeechRecognition() {
  try {
    if (Platform.OS === 'web') {
      try { webRec?.abort?.(); } catch {}
      webRec = null;
      active = false;
      return;
    }
    if (isExpoGo()) return;
    const { mod } = loadNative();
    if (!mod) return;
    try { mod.ExpoSpeechRecognitionModule.abort?.(); } catch {}
    active = false;
  } catch {}
}

export function isListening() {
  return active;
}
