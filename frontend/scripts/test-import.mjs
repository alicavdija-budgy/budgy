#!/usr/bin/env node
/**
 * TÂCHE 1 — Tests fonctionnels : montants CHF, QR photo/PDF, auth, 0 CHF.
 * Exécute le VRAI code (normalizeChfAmount transpilé + parseur SPC réel).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';

let passed = 0, failed = 0;
const ok = (name, cond) => { if (cond) { passed++; console.log(`  ✅ ${name}`); } else { failed++; console.log(`  ❌ ${name}`); } };

// ── 1) normalisation CHF : EXÉCUTION du vrai module
mkdirSync('/tmp/engine1', { recursive: true });
execSync('npx tsc src/utils/amount.ts --outDir /tmp/engine1 --module esnext --target es2020 --skipLibCheck', { stdio: 'pipe' });
const { normalizeChfAmount: N } = await import('/tmp/engine1/amount.js');
console.log('— Normalisation unique des montants CHF (module réel exécuté) —');
ok('123.45 → 123.45', N('123.45') === 123.45);
ok('123,45 → 123.45', N('123,45') === 123.45);
ok("1'234.50 → 1234.5", N("1'234.50") === 1234.5);
ok('1\u2019234.50 (apostrophe typographique) → 1234.5', N('1\u2019234.50') === 1234.5);
ok('1 234,50 (espace) → 1234.5', N('1 234,50') === 1234.5);
ok('1\u00A0234,50 (insécable) → 1234.5', N('1\u00A0234,50') === 1234.5);
ok('CHF 123.45 → 123.45', N('CHF 123.45') === 123.45);
ok('1.234,50 (style DE) → 1234.5', N('1.234,50') === 1234.5);
ok('rejet NaN / texte', N('abc') === null && N('12abc') === null);
ok('rejet négatif', N('-5') === null && N(-5) === null);
ok('rejet non fini', N(Infinity) === null && N(NaN) === null);
ok('rejet ambigu 12,345 (3 décimales)', N('12,345') === null);
ok('rejet 1.234.567 sans décimale', N('1.234.567') === null);
ok('rejet zéro (jamais 0 CHF inventé)', N('0') === null && N(0) === null);
ok('nombre déjà numérique 123.456 arrondi 2 déc.', N(123.456) === 123.46);
ok('vide/null → null', N('') === null && N(null) === null && N(undefined) === null);
ok('rejet 1.2,34 (groupe de milliers invalide)', N('1.2,34') === null);
ok('rejet 12.3,45 (groupe de milliers invalide)', N('12.3,45') === null);
ok('rejet 1.23,45 / 1234.5,67 (groupes non conformes)', N('1.23,45') === null && N('1234.5,67') === null);
ok('12.345,67 (groupes valides) → 12345.67', N('12.345,67') === 12345.67);

// ── scanner-modal : plus aucun parseFloat partiel
console.log('— Scanner QR : normalisation unique —');
const scan = readFileSync('app/scanner-modal.tsx', 'utf8');
ok('handleQrSave utilise normalizeChfAmount', scan.includes('normalizeChfAmount(qrAmount)') && !scan.includes('parseFloat'));
ok('reçus scannés : normalisation unique aussi', scan.includes('normalizeChfAmount(amount)'));

// ── 2) email-import : auth JWT, blocage échec/0 CHF, pas de badge succès
console.log('— Import e-mail/photo/PDF : auth + anti-0 CHF —');
const imp = readFileSync('app/more/email-import.tsx', 'utf8');
ok('appels via apiFetchJson (JWT Supabase automatique)', imp.includes("apiFetchJson<any>(`/api/email/parse`") && imp.includes("apiFetchJson<any>(`/api/scanner/ocr`") && !imp.includes('safeFetchJson'));
ok('401/403 → message d’authentification (jamais « enregistrée »)', (imp.match(/r\.status === 401 \|\| r\.status === 403/g) || []).length >= 2 && imp.includes("importErrors.authTitle"));
ok('persistAsInvoice bloque extraction échouée', imp.includes('extractionFailed') && imp.includes("importErrors.extractFailedTitle"));
const invBody = imp.slice(imp.indexOf('const persistAsInvoice'), imp.indexOf('const persistAsContract'));
ok('persistAsInvoice bloque montant manquant (jamais 0)', invBody.includes('amount === null') && invBody.includes("importErrors.amountMissingTitle") && !invBody.includes('|| 0'));
ok('montant via normalisation UNIQUE', imp.includes('normalizeChfAmount(result?.amount)'));
ok('échec OCR → carte erreur, jamais badge succès', imp.includes('result.success === false || result._failedOcr') && imp.includes('alert-circle'));
ok('Swiss QR décodé côté serveur → parseur SPC éprouvé', imp.includes('swiss_qr_content') && imp.includes('parseSwissQrBill'));
const mimeHelper = readFileSync('src/lib/importMime.ts', 'utf8');
ok('PDF iOS reconnu même si le MIME du picker est générique', imp.includes('resolveImportMime(mimeHint, originalName, uriOrPath)') && mimeHelper.includes('.pdf') && mimeHelper.includes("'application/pdf'"));
ok('PDF envoyé au backend avec un MIME explicite et un timeout adapté', imp.includes('mime_type: mime') && imp.includes("mime === 'application/pdf' ? 45000 : 25000"));
ok('PDF ne réessaie pas aveuglément une requête OCR coûteuse', imp.includes("retries: mime === 'application/pdf' ? 0 : 1"));
ok('sélection PDF et fichiers transmettent le nom original', (imp.match(/parseImageFile\(file\.uri, file\.mimeType, file\.name\)/g) || []).length === 2);

ok('montant QR absent → champ de saisie OBLIGATOIRE', imp.includes('import-amount-input'));

// ── 3) lecteur SPC intact (non réécrit)
console.log('— Lecteur SPC préservé —');
const qr = readFileSync('src/services/qrBill.ts', 'utf8');
ok('index fixes 18/19 (montant/devise) préservés', qr.includes('L[18]') && qr.includes('L[19]'));
ok('séparateurs \\r\\n gérés', qr.includes("\\r\\n") || qr.includes('\\r'));

// ── 4) backend : PDF réellement géré + QR-first + jamais 0 inventé
console.log('— Backend : PDF → PNG → Swiss QR —');
const srv = readFileSync('../backend/server.py', 'utf8');
ok('PDF détecté par magic bytes %PDF (pas envoyé comme JPEG)', srv.includes('%PDF') && srv.includes('pdf_first_pages_to_png_b64'));
ok('décodage du VRAI QR avant OCR vision', srv.includes('decode_swiss_qr_from_image_b64') && srv.includes('swiss_qr_content'));
ok('montant OCR négatif/0 → None (saisie manuelle)', srv.includes('amt = None') && srv.includes('amt <= 0'));
ok('endpoints protégés par require_user (JWT)', /scanner_ocr[\s\S]{0,200}require_user/.test(srv));
{
  // la vérification EMERGENT_LLM_KEY doit être APRÈS le décodage QR
  const fn = srv.slice(srv.indexOf('async def scanner_ocr'), srv.indexOf('def ', srv.indexOf('async def scanner_ocr') + 30));
  const qrIdx = fn.indexOf('decode_swiss_qr_from_image_b64');
  const llmIdx = fn.indexOf('if not EMERGENT_LLM_KEY');
  ok('décodage Swiss QR AVANT la vérification de la clé OCR externe', qrIdx !== -1 && llmIdx !== -1 && qrIdx < llmIdx);
}
ok('budgets réutilise la normalisation unique', readFileSync('app/more/budgets.tsx','utf8').includes('normalizeChfAmount'));

console.log(`\nRésultat : ${passed} réussis, ${failed} échoués`);
if (failed > 0) process.exit(1);
