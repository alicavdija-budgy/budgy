/**
 * BUDGY — Global share-intent router
 *
 * Listens at the app root for a share intent (file/photo/text shared from
 * Mail / Photos / Files / Safari to Budgy via the iOS Share Sheet) and
 * automatically routes the user to /more/email-import where the file will
 * be processed.
 *
 * Without this, iOS would open the app on its last screen (or home) and
 * the user would have to manually navigate to the import screen.
 *
 * Web / Expo Go safe: returns null if expo-share-intent is not linked.
 */
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useRouter, useSegments } from 'expo-router';

let useShareIntent: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useShareIntent = require('expo-share-intent').useShareIntent;
} catch {
  /* native module not linked (web / Expo Go) */
}

export default function ShareIntentRouter() {
  // Hook is only available on native builds
  if (!useShareIntent || Platform.OS === 'web') return null;
  return <ShareIntentInner />;
}

function ShareIntentInner() {
  const router = useRouter();
  const segments = useSegments();
  const lastHandled = useRef<string | null>(null);

  // The hook returns `{ hasShareIntent, shareIntent, resetShareIntent }`
  const intent = useShareIntent({ debug: false, resetOnBackground: true });

  useEffect(() => {
    if (!intent?.hasShareIntent) return;

    // Build a stable key so we don't re-route the same payload twice
    const payload = intent.shareIntent || {};
    const key =
      JSON.stringify({
        text: payload.text?.slice(0, 80),
        files: (payload.files || []).map((f: any) => f.path).join('|'),
        url: payload.webUrl,
      }) || String(Date.now());

    if (lastHandled.current === key) return;
    lastHandled.current = key;

    // Already on the import screen → let it consume the intent itself
    const onImport = (segments || []).join('/').includes('email-import');
    if (onImport) return;

    // Else, push the user to the import screen
    try {
      router.push('/more/email-import' as any);
    } catch (e) {
      console.warn('[ShareIntentRouter] navigation failed:', e);
    }
  }, [intent?.hasShareIntent, intent?.shareIntent]);

  return null;
}
