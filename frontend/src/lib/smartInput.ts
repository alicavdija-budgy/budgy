/**
 * BUDGY — Smart Input Service
 *
 * Single entry point for adding any operation (expense, income, subscription)
 * regardless of the source channel. The UI (Ajout Intelligent / dictation /
 * Siri Shortcut / Android App Action) just sends text + source; this service
 * does the rest:
 *
 *   1. Try local regex parser (`voiceLocalParser`) — instant, offline.
 *   2. If confident enough, returns the parsed operation.
 *   3. Otherwise, fall back to the backend `/api/voice/parse` for LLM parsing.
 *
 * The service does NOT mutate the Zustand store — it just RETURNS a typed
 * `SmartInputResult`. The screen decides whether to confirm/save.
 *
 * ─── Source channels (architecture-ready, integrations come later) ───────
 *
 *   • 'text'             — user typed in the modal
 *   • 'keyboard_voice'   — iOS/Android native dictation via system keyboard
 *   • 'siri'             — App Intents / Siri Shortcuts (iOS 16+)
 *   • 'google_assistant' — Android App Actions / Assistant intents
 *
 * For Siri/Google Assistant we keep the surface tiny: callers just pass the
 * resolved utterance string + `source: 'siri' | 'google_assistant'` and the
 * pipeline is identical. Siri Shortcut / App Intent code lives in the
 * `ios/` / `android/` native modules added later via EAS prebuild.
 */
import { apiFetchJson } from './network';
import { parseVoiceLocally } from './voiceLocalParser';

function parseLocally(text: string) {
  const r = parseVoiceLocally(text) as any;
  if (!r || r.intent === 'unknown') return null;
  // Map ParsedVoice → uniform shape
  return {
    success: !!(r.amount && r.merchant),
    type: r.intent === 'recurring' ? 'subscription' : (r.intent === 'income' ? 'income' : 'expense'),
    amount: r.amount,
    currency: r.currency || 'CHF',
    merchant: r.merchant,
    category: r.category,
    confidence: r.confidence || 0,
  };
}

export type SmartInputSource =
  | 'text'
  | 'keyboard_voice'
  | 'siri'
  | 'google_assistant';

export interface SmartInputResult {
  ok: boolean;
  source: SmartInputSource;
  /** 'local' = regex parser; 'backend' = /api/voice/parse; 'failed' = both KO */
  resolvedBy: 'local' | 'backend' | 'failed';
  type?: 'expense' | 'income' | 'subscription';
  amount?: number;
  currency?: string;
  merchant?: string;
  category?: string;
  confidence?: number;
  rawText: string;
  error?: string;
}

/** Minimum confidence at which we skip the network call entirely. */
const LOCAL_CONFIDENCE_THRESHOLD = 0.7;

export async function smartInput(
  text: string,
  source: SmartInputSource = 'text'
): Promise<SmartInputResult> {
  const clean = (text || '').trim();
  if (!clean) {
    return { ok: false, source, resolvedBy: 'failed', rawText: '', error: 'empty' };
  }

  // 1) Local regex parser — works offline, no LLM round-trip
  try {
    const local = parseLocally(clean);
    if (local?.success && (local.confidence ?? 0) >= LOCAL_CONFIDENCE_THRESHOLD) {
      return {
        ok: true,
        source,
        resolvedBy: 'local',
        type: local.type as any,
        amount: local.amount,
        currency: local.currency,
        merchant: local.merchant,
        category: local.category,
        confidence: local.confidence,
        rawText: clean,
      };
    }
  } catch (e) {
    console.warn('[smartInput] local parser threw', e);
  }

  // 2) Backend LLM parser — gives much better merchant/category extraction
  try {
    const r = await apiFetchJson<{
      success: boolean;
      type?: 'expense' | 'income' | 'subscription';
      amount?: number;
      currency?: string;
      merchant?: string;
      category?: string;
      confidence?: number;
    }>('/api/voice/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: clean, source }),
    }, { timeoutMs: 25000, retries: 1, silent: true });
    if (r.ok && r.data?.success) {
      return {
        ok: true,
        source,
        resolvedBy: 'backend',
        type: r.data.type,
        amount: r.data.amount,
        currency: r.data.currency,
        merchant: r.data.merchant,
        category: r.data.category,
        confidence: r.data.confidence,
        rawText: clean,
      };
    }
  } catch (e: any) {
    console.warn('[smartInput] backend parser failed', e?.message);
  }

  // 3) Last-resort: degraded local match (whatever confidence we got)
  try {
    const fallback = parseLocally(clean);
    if (fallback?.success) {
      return {
        ok: true,
        source,
        resolvedBy: 'local',
        type: fallback.type as any,
        amount: fallback.amount,
        currency: fallback.currency,
        merchant: fallback.merchant,
        category: fallback.category,
        confidence: fallback.confidence,
        rawText: clean,
      };
    }
  } catch {}

  return {
    ok: false,
    source,
    resolvedBy: 'failed',
    rawText: clean,
    error: 'Impossible de comprendre cette phrase. Réessayez avec un montant et un commerçant.',
  };
}
