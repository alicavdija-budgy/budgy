/**
 * BUDGY — Speech-to-text helper (cross-platform).
 *
 * Strategy:
 *   ▸ Web        : Web Speech API (Chrome/Edge/Safari) — built-in browser API
 *   ▸ Native (dev build / TestFlight): expo-speech-recognition (Apple SFSpeechRecognizer
 *                                       on iOS, Google on Android)
 *   ▸ Expo Go     : NOT supported — module is not bundled. We detect this and the
 *                   modal will surface a clear "Build natif requis" banner.
 *
 * The module is loaded LAZILY via `require()` inside try/catch so importing this
 * file never crashes when the native binding is missing (Expo Go).
 */
import { Platform } from 'react-native';

export type SttPhase = 'idle' | 'starting' | 'listening' | 'stopped' | 'error';

export interface SttCallbacks {
  onPartial?: (text: string) => void;   // interim transcript
  onFinal?: (text: string) => void;     // final transcript
  onState?: (phase: SttPhase) => void;  // lifecycle
  onError?: (msg: string) => void;
  onVolume?: (level: number) => void;   // 0..1 (only native; for waveform)
}

export interface SttSupport {
  /** A real microphone capture is wired and can be started. */
  available: boolean;
  /** Why STT is unavailable (e.g. "Expo Go"). null when available. */
  reason: string | null;
  /** Engine label for UI ("Apple Speech", "Web Speech API", etc.). */
  engine: string;
}

// ── Module-level state ─────────────────────────────────────────────────────
let active = false;
let subs: any[] = [];
let webRec: any = null;

// ── Lazy native module loader ──────────────────────────────────────────────
function loadNative(): { mod: any | null; reason: string | null } {
  try {
    // require() throws synchronously if the native binding is missing.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const m = require('expo-speech-recognition');
    if (!m || !m.ExpoSpeechRecognitionModule) {
      return { mod: null, reason: 'Module non disponible' };
    }
    return { mod: m, reason: null };
  } catch (e: any) {
    const msg = String(e?.message || e || '');
    if (/expo-speech-recognition/i.test(msg) || /TurboModule|NativeModule/i.test(msg)) {
      return { mod: null, reason: 'Expo Go (build natif requis)' };
    }
    return { mod: null, reason: msg };
  }
}

// ── Public: feature detection ──────────────────────────────────────────────
export function getSttSupport(): SttSupport {
  if (Platform.OS === 'web') {
    const SR: any =
      (globalThis as any).SpeechRecognition ||
      (globalThis as any).webkitSpeechRecognition;
    if (!SR) {
      return {
        available: false,
        reason: 'Web Speech API non supportée par ce navigateur',
        engine: '—',
      };
    }
    return { available: true, reason: null, engine: 'Web Speech API' };
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
}

// ── Public: ask runtime permissions (microphone + speech recognition) ──────
export async function requestSttPermissions(): Promise<{
  granted: boolean;
  reason?: string;
}> {
  if (Platform.OS === 'web') {
    // Browsers prompt automatically on rec.start(); nothing to do here.
    return { granted: true };
  }
  const { mod } = loadNative();
  if (!mod) return { granted: false, reason: 'Module non disponible' };
  try {
    const Module = mod.ExpoSpeechRecognitionModule;
    // Newer API (3.x): requestPermissionsAsync covers both
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

// ── Public: start listening ────────────────────────────────────────────────
export async function startSpeechRecognition(
  cb: SttCallbacks,
  opts: { lang?: string; continuous?: boolean; interim?: boolean } = {},
) {
  const { lang = 'fr-CH', continuous = true, interim = true } = opts;

  // ── WEB ──────────────────────────────────────────────────────────────
  if (Platform.OS === 'web') {
    const SR: any =
      (globalThis as any).SpeechRecognition ||
      (globalThis as any).webkitSpeechRecognition;
    if (!SR) {
      cb.onError?.('Web Speech API non supportée');
      cb.onState?.('error');
      return;
    }
    try {
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
      rec.start();
      webRec = rec;
      active = true;
    } catch (e: any) {
      cb.onError?.(String(e?.message || e));
      cb.onState?.('error');
    }
    return;
  }

  // ── NATIVE ───────────────────────────────────────────────────────────
  const { mod, reason } = loadNative();
  if (!mod) {
    cb.onError?.(reason || 'Module non disponible');
    cb.onState?.('error');
    return;
  }
  try {
    const Module = mod.ExpoSpeechRecognitionModule;
    const addListener = mod.ExpoSpeechRecognitionModuleEmitter?.addListener?.bind(
      mod.ExpoSpeechRecognitionModuleEmitter,
    ) || Module.addListener?.bind(Module);

    if (typeof addListener !== 'function') {
      cb.onError?.('addListener indisponible');
      cb.onState?.('error');
      return;
    }

    // Wire events
    subs = [];
    subs.push(
      addListener('start', () => cb.onState?.('listening')),
      addListener('end', () => {
        active = false;
        cb.onState?.('stopped');
        // detach
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
        // Native sends dB-ish values; clamp to 0..1
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

// ── Public: stop ───────────────────────────────────────────────────────────
export async function stopSpeechRecognition() {
  try {
    if (Platform.OS === 'web') {
      try { webRec?.stop?.(); } catch {}
      webRec = null;
      active = false;
      return;
    }
    const { mod } = loadNative();
    if (!mod) return;
    try { mod.ExpoSpeechRecognitionModule.stop(); } catch {}
    active = false;
  } catch {}
}

// ── Public: cancel without firing onFinal ──────────────────────────────────
export async function abortSpeechRecognition() {
  try {
    if (Platform.OS === 'web') {
      try { webRec?.abort?.(); } catch {}
      webRec = null;
      active = false;
      return;
    }
    const { mod } = loadNative();
    if (!mod) return;
    try { mod.ExpoSpeechRecognitionModule.abort?.(); } catch {}
    active = false;
  } catch {}
}

export function isListening() {
  return active;
}
