#!/usr/bin/env node
/**
 * Build 94 regression gate for the two real-world failures reported on iPhone.
 * Never uses user documents or Apple credentials in CI.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(p)=>readFileSync(p, 'utf8');
const bridge=read('src/services/widgetBridge.ts');
const widget=read('src/components/WidgetSync.tsx');
const swift=read('targets/intents/_shared/BudgyShared.swift');
const add=read('app/quick-add.tsx');
const shortcut=read('targets/intents/_shared/BudgyShortcuts.swift');
const imp=read('app/more/email-import.tsx');
const tr=read('src/i18n/translations.ts');
const pdf=read('../backend/pdf_preview.py');
const api=read('../backend/server.py');
const app=JSON.parse(read('app.json')).expo;
const wf=read('../.github/workflows/eas-build.yml');

assert.equal(app.ios.buildNumber, '94');
assert.equal(app.ios.bundleIdentifier, 'com.budgy.ch.budgy');
assert.match(wf,/a.ios\?\.buildNumber !== '94'/);

// Native route must be inspected non-destructively until the store is ready.
assert.match(bridge,/export function peekPendingRoute\(\)/);
assert.match(widget,/peekPendingRoute\(\)/);
assert.match(widget,/hasHydrated/);
assert.match(widget,/if \(!hasHydrated\) return false/);
assert.match(widget,/AppState.currentState === 'active'/);
assert(!widget.includes('tries >= 15'));
assert.match(widget,/popPendingRoute\(\)/);
assert.match(widget,/pushedPid.current === e.id/);
assert.match(widget,/peekPendingExpenses\(route === 'quick-add'\)/);

// A Siri amount is an exact native number, not a text/LLM approximation.
assert.match(add,/source === 'siri' && pendingId/);
assert.match(add,/amount: draft.amount/);
assert.match(add,/peekPendingExpenses\(true\)\.find\(\(e\) => e.id === pendingId\)/);
assert.match(add,/isAlreadyProcessed\(pendingId\)/);
assert.match(add,/transactions\.some\(\(tx\) => tx.id === id\)/);
assert.match(add,/if \(pendingId\) await resolvePendingExpense\(pendingId\)/);
assert.match(swift,/touchez Ajouter pour l'enregistrer/);
assert.match(shortcut,/Note une dépense dans/);

// Missing OCR is a neutral review flow, not a false claim the PDF is blurry.
assert.match(imp,/document-text-outline/);
assert.match(imp,/reviewInvoiceTitle/);
assert.match(imp,/reviewContractTitle/);
assert.match(imp,/document-preserve-without-ocr/);
assert.match(imp,/keepDocumentPrivate\(/);
assert.match(imp,/qrInvalidBody/);
assert(!imp.includes("Alert.alert(t('importErrors.qrInvalidTitle')"));
assert(!imp.includes("{t('importErrors.extractFailedTitle')}"));
for(const key of ['reviewInvoiceTitle','reviewContractTitle','reviewCta','keepOriginal','siriDraftUnavailable']) {
  assert.equal((tr.match(new RegExp(key + ':', 'g')) || []).length, 4, 'i18n FR/EN/DE/IT: ' + key);
}

// A PDF with a text layer is useful even when QR/LLM is missing.
assert.match(pdf,/def extract_pdf_preview/);
assert.match(pdf,/needs_user_confirmation": True/);
assert.match(pdf,/return \{\}/);
assert.match(api,/extract_pdf_preview\(full\)/);
assert.match(api,/if pdf_preview:/);
assert(api.indexOf('if pdf_preview:') < api.indexOf('if not EMERGENT_LLM_KEY:', api.indexOf('async def scanner_ocr')));
assert.match(api,/swiss_qr_content=qr_payload/);

console.log('PASS: Siri handoff, idempotency, 4-language document review, secure offline PDF fallback, iOS 94');
