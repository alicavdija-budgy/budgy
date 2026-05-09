/**
 * Cross-platform short beeps for the Voice modal.
 *
 *   - Web    : synthesized live with the Web Audio API (no asset, no IO).
 *   - Native : the embedded base64 WAVs are written once to the cache dir
 *              on first call, then played with expo-audio.
 *
 * Failures are silent — a missed beep should never break the UX.
 */
import { Platform } from 'react-native';
import { BEEP_START_B64, BEEP_STOP_B64 } from './beepData';

type Tone = 'start' | 'stop';

let nativeBeepUris: { start?: string; stop?: string } = {};
let webCtx: any = null;

async function ensureNativeFile(tone: Tone): Promise<string | null> {
  if (nativeBeepUris[tone]) return nativeBeepUris[tone]!;
  try {
    const FS = await import('expo-file-system');
    // expo-file-system exposes either .File or top-level helpers depending on version.
    const cacheDir = (FS as any).cacheDirectory || (FS as any).Paths?.cache?.uri || '';
    if (!cacheDir) return null;
    const uri = `${cacheDir}budgy_beep_${tone}.wav`;
    const data = tone === 'start' ? BEEP_START_B64 : BEEP_STOP_B64;
    // Write the base64 file (idempotent — overwriting is cheap)
    if ((FS as any).writeAsStringAsync) {
      await (FS as any).writeAsStringAsync(uri, data, {
        encoding: (FS as any).EncodingType?.Base64 || 'base64',
      });
    }
    nativeBeepUris[tone] = uri;
    return uri;
  } catch (e) {
    console.warn('[beeps] file write failed:', e);
    return null;
  }
}

async function playWeb(tone: Tone) {
  try {
    const AC: any =
      (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
    if (!AC) return;
    if (!webCtx) webCtx = new AC();
    if (webCtx.state === 'suspended') {
      try { await webCtx.resume(); } catch {}
    }
    const now = webCtx.currentTime;
    const osc = webCtx.createOscillator();
    const gain = webCtx.createGain();
    const freq = tone === 'start' ? 880 : 660;
    const dur = tone === 'start' ? 0.11 : 0.13;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.008);
    gain.gain.linearRampToValueAtTime(0, now + dur);
    osc.connect(gain).connect(webCtx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  } catch (e) {
    // ignore
  }
}

async function playNative(tone: Tone) {
  try {
    const Audio = await import('expo-audio');
    const uri = await ensureNativeFile(tone);
    if (!uri) return;
    // Audio.createAudioPlayer accepts { uri } or a string URI in 55.x
    const create = (Audio as any).createAudioPlayer;
    if (typeof create !== 'function') return;
    const player = create({ uri });
    if (!player) return;
    player.volume = 0.55;
    player.play?.();
    // Auto-release shortly after to free the audio session
    setTimeout(() => {
      try { player.remove?.(); } catch {}
    }, 600);
  } catch (e) {
    // ignore — beep is non-critical
  }
}

export function playBeep(tone: Tone) {
  if (Platform.OS === 'web') {
    void playWeb(tone);
  } else {
    void playNative(tone);
  }
}

/** Pre-warm web AudioContext on a user gesture (avoids first-tap latency). */
export async function primeBeeps() {
  if (Platform.OS === 'web') {
    try {
      const AC: any =
        (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
      if (AC && !webCtx) webCtx = new AC();
      if (webCtx && webCtx.state === 'suspended') await webCtx.resume();
    } catch {}
  }
}
