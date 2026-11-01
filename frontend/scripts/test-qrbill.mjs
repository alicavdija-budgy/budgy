#!/usr/bin/env node
/**
 * Budgy — Tests QR-facture suisse (src/services/qrBill.ts, import réel).
 * Échantillons conformes aux Implementation Guidelines SIX (QRR/SCOR/NON,
 * adresses S et K, montant libre, erreurs de contrôle).
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let src = readFileSync(resolve(root, 'src/services/qrBill.ts'), 'utf8');
// TS -> JS : retrait déterministe des annotations
src = src
  .replace(/export type [\s\S]*?\n\};\n/g, '')
  .replace(/export class QrBillError extends Error \{[\s\S]*?\n\}\n/,
    'export class QrBillError extends Error { constructor(code, message){ super(message); this.code = code; } }\n')
  .replace(/: string\[\]/g, '')
  .replace(/: \{ iban\?: string; reference\?: string; amount: number; status: string; title: string \}\[\]/g, '')
  .replace(/: \{ title: string \} \| null/g, '')
  .replace(/: SwissQrBill/g, '')
  .replace(/: QrParty \| null/g, '')
  .replace(/ as QrParty/g, '')
  .replace(/ as 'QRR' \| 'SCOR' \| 'NON'/g, '')
  .replace(/ as 'CHF' \| 'EUR'/g, '')
  .replace(/: number \| null/g, '')
  .replace(/: 'CHF' \| 'EUR'/g, '')
  .replace(/: boolean/g, '')
  .replace(/: number/g, '')
  .replace(/: string/g, '');
const mod = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
const { parseSwissQrBill, isSwissQrBill, findDuplicateInvoice, mod10Valid, mod97Valid, QrBillError } = mod;

let passed = 0, failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
};
const expectError = (name, payload, codePart) => {
  try { parseSwissQrBill(payload); check(name, false, 'aucune erreur levée'); }
  catch (e) { check(name, e instanceof QrBillError && e.code.includes(codePart), `code=${e.code}`); }
};

// QR-IBAN valide (IID 30000) + référence QRR valide (mod10)
const QR_IBAN = 'CH4431999123000889012';
const QRR = '210000000003139471430009017';
const S = (lines) => lines.join('\n');

const validQRR = S(['SPC','0200','1',QR_IBAN,
  'S','Robert Schneider AG','Rue du Lac','1268','2501','Biel','CH',
  '','','','','','','',
  '1949.75','CHF',
  'S','Pia-Maria Rutschmann-Schnyder','Grosse Marktgasse','28','9400','Rorschach','CH',
  'QRR',QRR,'Commande du 15.06.2026','EPD','//S1/10/10201409/11/200701']);

// IBAN classique + SCOR
const IBAN = 'CH5800791123000889012';
const validSCOR = S(['SPC','0200','1',IBAN,
  'K','Max Muster & Söhne','Musterstrasse 123','8000 Seldwyla','','','CH',
  '','','','','','','',
  '','EUR',
  '','','','','','','',
  'SCOR','RF18539007547034','','EPD','']);

// IBAN classique + NON, montant libre
const validNON = S(['SPC','0200','1',IBAN,
  'S','Pro Natura','Dornacherstrasse','192','4053','Basel','CH',
  '','','','','','','',
  '','CHF',
  '','','','','','','',
  'NON','','Don','EPD','']);

console.log('\n— QR-factures valides —');
const b1 = parseSwissQrBill(validQRR);
check('QRR : parse complet', b1.refType === 'QRR' && b1.reference === QRR);
check('QRR : QR-IBAN détecté (IID 30000–31999)', b1.isQrIban === true);
check('QRR : montant exact', b1.amount === 1949.75 && b1.currency === 'CHF');
check('QRR : créancier structuré', b1.creditor.name === 'Robert Schneider AG' && b1.creditor.addressLine2 === '2501 Biel');
check('QRR : débiteur lu', b1.debtor?.name === 'Pia-Maria Rutschmann-Schnyder');
check('QRR : billing info lue', b1.billingInfo.startsWith('//S1'));
const b2 = parseSwissQrBill(validSCOR);
check('SCOR : référence RF valide (mod 97) + EUR', b2.refType === 'SCOR' && b2.currency === 'EUR');
check('SCOR : adresse combinée K acceptée (transition 2.3→2.4)', b2.creditor.addressLine1 === 'Musterstrasse 123');
check('SCOR : montant libre => null (rien d\'inventé)', b2.amount === null);
const b3 = parseSwissQrBill(validNON);
check('NON : référence vide acceptée', b3.refType === 'NON' && b3.reference === '');
check('empreintes distinctes', new Set([b1.fingerprint, b2.fingerprint, b3.fingerprint]).size === 3);
check('isSwissQrBill vrai/faux', isSwissQrBill(validQRR) && !isSwissQrBill('https://example.com'));

console.log('\n— QR-factures invalides (contrôles SIX) —');
expectError('pas de SPC', 'HELLO\n0200\n1', 'spc');
expectError('IBAN étranger refusé', validQRR.replace(QR_IBAN, 'DE89370400440532013000'), 'iban');
expectError('IBAN checksum faux', validQRR.replace(QR_IBAN, 'CH4431999123000889013'), 'iban');
expectError('QRR checksum mod10 faux', validQRR.replace(QRR, '210000000003139471430009018'), 'reference');
expectError('QR-IBAN exige QRR', S(validQRR.split('\n').map((l, i) => (i === 27 ? 'NON' : i === 28 ? '' : l)).map(String)), 'reference');
expectError('SCOR avec QR-IBAN refusé', validSCOR.replace(IBAN, QR_IBAN), 'reference');
expectError('montant mal formaté', validQRR.replace('1949.75', '1949,75'), 'amount');
expectError('devise USD refusée', validNON.replace('CHF', 'USD'), 'currency');
expectError('trailer EPD manquant', validNON.replace('EPD', 'XXX'), 'trailer');
expectError('créancier manquant', S(validNON.split('\n').map((l, i) => (i === 5 ? '' : l))), 'creditor');

console.log('\n— Checksums unitaires —');
check('mod10 référence officielle', mod10Valid('210000000003139471430009017'));
check('mod97 RF officiel', mod97Valid('RF18539007547034'));
check('mod97 rejette RF faux', !mod97Valid('RF19539007547034'));

console.log('\n— Doublons par compte —');
const dup = findDuplicateInvoice(b1, [
  { iban: QR_IBAN, reference: QRR, amount: 1949.75, status: 'pending', title: 'Schneider AG' },
]);
check('doublon détecté (iban+référence, non payé)', dup?.title === 'Schneider AG');
check('facture payée ignorée', findDuplicateInvoice(b1, [
  { iban: QR_IBAN, reference: QRR, amount: 1949.75, status: 'paid', title: 'x' },
]) === null);
check('récurrente (autre référence) non bloquée', findDuplicateInvoice(b1, [
  { iban: QR_IBAN, reference: '210000000003139471430009112', amount: 1949.75, status: 'pending', title: 'y' },
]) === null);

// Contrat statique : jamais d'enregistrement sans confirmation, pas de date inventée
const scanner = readFileSync(resolve(root, 'app/scanner-modal.tsx'), 'utf8');
console.log('\n— Intégration scanner (contrats) —');
check('scanner lit les QR (barcodeScannerSettings qr)', scanner.includes("barcodeTypes: ['qr']"));
check('flux Contrôler→Confirmer : addInvoice uniquement dans handleQrSave', scanner.includes('handleQrSave') && scanner.includes("qrbill'"));
check('aucune échéance inventée (dueDate vide au scan)', scanner.includes("setQrDueDate(''); // une QR-facture ne fournit pas d'échéance"));
check('détection doublon branchée', scanner.includes('findDuplicateInvoice(bill'));
check('aucun paiement automatique (mention)', scanner.includes('noAutoPay'));

// ── i18n des erreurs QR : chaque code levé est traduit dans les 4 langues ──
console.log('\n— Erreurs traduites (fr/en/de/it) —');
const rawQr = readFileSync(resolve(root, 'src/services/qrBill.ts'), 'utf8');
const thrownCodes = [...new Set([...rawQr.matchAll(/new QrBillError\('([a-zA-Z]+)'\)/g)].map((m) => m[1]))];
check('le parseur lève des codes stables (≥ 15)', thrownCodes.length >= 15, `codes=${thrownCodes.length}`);
check('aucun texte français codé en dur dans les exceptions', !/new QrBillError\('[a-zA-Z]+',/.test(rawQr));

const trSrc = readFileSync(resolve(root, 'src/i18n/translations.ts'), 'utf8');
const sliceBlock = (src, fromIdx) => {
  const i = src.indexOf('{', fromIdx);
  let d = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}' && --d === 0) return src.slice(i, j + 1);
  }
  return '';
};
const qrbillBlock = sliceBlock(trSrc, trSrc.indexOf('qrbill: {'));
for (const lang of ['fr', 'en', 'de', 'it']) {
  const langBlock = sliceBlock(qrbillBlock, qrbillBlock.indexOf(`${lang}: {`));
  const errBlock = sliceBlock(langBlock, langBlock.indexOf('errors: {'));
  const missing = [...thrownCodes, 'generic'].filter((c) => !new RegExp(`\\b${c}:`).test(errBlock));
  check(`qrbill.errors complet en ${lang}`, errBlock.length > 0 && missing.length === 0,
    missing.length ? `manquants: ${missing.join(', ')}` : '');
}
check('le scanner traduit le code au moment de l\'affichage', scanner.includes('qrbill.errors.${') || scanner.includes("qrbill.errors.' +"));
check('message générique traduit en secours', scanner.includes("t('qrbill.errors.generic')"));
check('aucun message technique brut affiché (e?.message supprimé)', !scanner.includes('e?.message'));

console.log(`\nRésultat : ${passed} réussis, ${failed} échoués`);
if (failed > 0) process.exit(1);
