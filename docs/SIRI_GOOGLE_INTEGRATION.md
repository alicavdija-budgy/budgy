# Budgy — Siri Shortcuts & Google Assistant integration guide

Budgy ships with a universal **Quick-Add** route (`budgy://quick-add`) that any
external assistant can use to add an operation in one round-trip. The route
runs `smartInput()` (offline regex parser → backend LLM fallback) and shows a
confirmation preview before writing to the local Zustand store.

---

## 1 · The quick-add deep link

| Pattern | Effect |
|---|---|
| `budgy://quick-add` | Opens the Ajout Intelligent screen empty |
| `budgy://quick-add?text=…` | Opens the screen pre-filled and auto-parses |
| `budgy://quick-add?text=…&source=siri` | Same, but the source badge shows "Siri Shortcut" |
| `budgy://quick-add?text=…&source=google_assistant` | Same, "Google Assistant" badge |
| `https://budgy.ch/quick-add?text=…` | Universal Link variant (after `apple-app-site-association` is published) |

The `text` parameter accepts free-form French/English sentences. Examples that
parse 100% offline today thanks to the regex parser:

```
Ajoute 25 CHF chez Migros
Salaire 3200 CHF
Netflix 18 CHF
Facture Swisscom 89 CHF
Assurance voiture 95 CHF
```

For anything more complex (multi-merchant, ambiguous dates) the route falls
back to `POST /api/voice/parse` on the backend.

---

## 2 · iOS — Siri Shortcuts (zero native code)

This works **today** with the existing managed Expo build — no `eas prebuild`
needed. The user creates the shortcut once, then it's available via "Dis Siri".

### User instructions (to put in onboarding / settings page)

1. Open the **Raccourcis** (Shortcuts) app on iPhone.
2. Tap **+** → **Ajouter une action** → search "URL".
3. Set the URL to:
   ```
   budgy://quick-add?text=Demander&source=siri
   ```
4. Add an action **Demander une saisie** (Ask for Input) before the URL
   action, and reference its value in the `text` parameter:
   ```
   budgy://quick-add?text=[Saisie demandée]&source=siri
   ```
5. Name the shortcut **"Ajouter une dépense Budgy"**.
6. Done — say "Dis Siri, ajouter une dépense Budgy" → Siri prompts for the
   sentence → Budgy opens on Ajout Intelligent with the dictated text.

### Optional later (full App Intents, requires `expo prebuild`)

For a richer experience (Siri reads back the parsed operation, "Add to
Shortcuts" suggestions), an `AppIntent` extension must be added natively in
Swift. This requires:

* `npx expo prebuild` to eject to a custom dev client
* Add the `BudgyAddIntent.swift` file (template in `docs/siri/`)
* Configure `Info.plist > NSUserActivityTypes`
* Submit a new build to TestFlight

The current `quick-add` route is the cheapest reliable path until you decide
to invest in App Intents.

---

## 3 · Android — Google Assistant App Actions (after `eas prebuild`)

Once you run `expo prebuild`, add the following to
`android/app/src/main/AndroidManifest.xml` inside the main `<activity>` tag:

```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="budgy" android:host="quick-add" />
</intent-filter>
```

Add a `shortcuts.xml` resource with the BII (Built-In Intent) for
`actions.intent.CREATE_MONEY_TRANSFER` mapping to:

```
budgy://quick-add?text={text}&source=google_assistant
```

Then say "Hey Google, ajoute 25 francs Migros dans Budgy".

---

## 4 · Normalised payload contract

Whatever source produces the text, `smartInput()` always returns a uniform
shape (see `frontend/src/lib/smartInput.ts`):

```ts
interface SmartInputResult {
  ok: boolean;
  source: 'text' | 'keyboard_voice' | 'siri' | 'google_assistant';
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
```

The `/quick-add` screen consumes this directly: preview card with merchant,
amount, type badge, then a single **Ajouter** button.

---

## 5 · Why we don't expose a "Ajouter avec Siri" button in production yet

Per the brief: only display assistant buttons that are **actually functional**.
The "Add with Siri" donation API (`INVoiceShortcutCenter`) requires native
code that we haven't shipped yet. Until then, users discover the Shortcut
manually via the Reglages › Siri page or the in-app guide referenced above.

When `expo prebuild` is done, we can re-enable a "Activer Siri" button on
the onboarding screen that calls `INUIAddVoiceShortcutViewController` natively.
