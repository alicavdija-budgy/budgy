#!/usr/bin/env node
/**
 * Build 92: privacy-specific regression checks.
 * All tests are OFFLINE: do not connect to or mutate personal cloud data.
 * Static integration checks complement on-device iCloud restore testing.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('../', import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), 'utf8');
const policy = await import(join(root, 'src/lib/documentPrivacy.ts'));
let checked = 0;
function check(name, yes) {
  assert.ok(yes, name);
  checked += 1;
  console.log('  ✓ ' + name);
}
console.log('Build 92 — no document cloud writes (offline audit)');
check('Document policy local-only by default', policy.PRIVATE_DOCUMENTS_LOCAL_ONLY);
for (const table of ['documents', 'invoices', 'contracts', 'receipts']) {
  check(table + ' is a private table', policy.isPrivateDocumentTable(table));
  check(table + ' tombstone private too', policy.isPrivateDocumentTombstone(table+':private-id'));
}
for (const table of ['transactions', 'budgets', 'recurring_expenses', 'savings_goals']) {
  check(table + ' remains separate from documents', !policy.isPrivateDocumentTable(table));
}
// Regression P0: a build 91 server-confirmed document must NOT disappear
// when build 92 logs out and back in (remote document pull is disabled).
const sync = await import(join(root, 'src/lib/syncMerge.ts'));
const oldDoc = { id: 'd91', title: 'Ancien contrat', fileUri: 'file:///Documents/vault/d91.pdf' };
const oldContract = { id: 'ct91', title: 'Assurance', documentId: 'd91' };
const owner = 'user-A';
const stateOld = {
  syncAccountId: owner,
  accountVault: {},
  syncedHashes: {
    documents: { d91: sync.hashItem(oldDoc) },
    contracts: { ct91: sync.hashItem(oldContract) },
  },
  tombstones: {},
  documents: [oldDoc], contracts: [oldContract],
  invoices: [], receipts: [], transactions: [],
};
const stashed = sync.buildLogoutStash(stateOld);
check('P0 old synced document survives logout', stashed[owner]?.documents?.some(d => d.id === 'd91'));
check('P0 linked old contract survives logout', stashed[owner]?.contracts?.some(d => d.documentId === 'd91'));
const restore = sync.applyAccountRestore({
  ...stateOld,
  documents: [], contracts: [], syncAccountId: owner, accountVault: stashed,
}, owner);
check('P0 documents and contracts restore for their original owner',
  restore?.documents?.some(d => d.id === 'd91') &&
  restore?.contracts?.some(d => d.documentId === 'd91'));
const other = sync.applyAccountRestore({
  ...stateOld, documents: [], contracts: [], syncAccountId: 'user-B', accountVault: stashed,
}, 'user-B');
check('P0 documents never leak across accounts', other === null || !other.documents?.some(d => d.id === 'd91'));

const cloud = read('src/services/cloudSync.ts');
check('push guard rejects every private table', cloud.includes('if (isPrivateDocumentTable(table)) continue;'));
check('remote fetch guard rejects every private table', cloud.includes('if (isPrivateDocumentTable(table)) return [];'));
for (const [key, name] of [['contracts','contracts'],['documents','documents'],['invoices','invoices'],['receipts','receipts']]) {
  check(name+' local values survive cloud pull', new RegExp(key+': cur\\.'+key+'[,}]').test(cloud));
}
check('tombstone filter rejects private records', cloud.includes('!isPrivateDocumentTombstone(key)'));
const storage = read('src/services/documentStorage.ts');
check('direct upload blocked', storage.includes("if (PRIVATE_DOCUMENTS_LOCAL_ONLY) return { ok: false, error: 'local-only'"));
check('queue processing blocked before auth/network', storage.includes('if (PRIVATE_DOCUMENTS_LOCAL_ONLY) {') &&
  storage.indexOf('if (PRIVATE_DOCUMENTS_LOCAL_ONLY) {', storage.indexOf('export async function processUploadQueue')) <
  storage.indexOf('const sb = getSupabase();', storage.indexOf('export async function processUploadQueue')));
check('legacy read-only recovery remains', storage.includes('getSignedUrlForDocument(docId, 300)') && storage.includes('const dl = await FileSystem.downloadAsync(signed, dest)'));
const store=read('src/stores/useStore.ts');
check('no document can enter pending uploads', store.includes('queueUpload: (_docId) => { /* local-only: do not enqueue */ }'));
const auto=read('src/lib/autoSync.ts');
check('document mutations not included in sync snapshot', !auto.includes("'contracts','debts','investments','receipts','invoices','documents'"));
const del=read('src/services/cloudDelete.ts');
check('invoice deletion is local', del.includes("if (table === 'invoices') {") &&
  del.indexOf("if (table === 'invoices') {") < del.indexOf('const res = await deleteFromCloud(table, id, deps);'));
const vault=read('src/lib/fileVault.ts');
check('originals in app Documents, not temporary cache', vault.includes('FileSystem.documentDirectory}vault/'));
check('relocated iOS sandbox file restored safely', vault.includes('export function resolveVaultUri(uri?: string)') &&
  storage.includes('resolveVaultUri(priorUri)'));
const scan=read('app/scanner-modal.tsx');
const imp=read('app/more/email-import.tsx');
check('camera OCR requires opt-in', scan.includes("t('documentPrivacy.ocrContinue')") && scan.includes("t('documentPrivacy.ocrManual')"));
check('file/pdf/email OCR requires opt-in', imp.includes('confirmRemoteOcr') &&
  imp.includes('if (!(await confirmRemoteOcr()))'));
check('decline PDF OCR preserves file locally', imp.includes('await keepDocumentPrivate(uriOrPath, mime, originalName)') &&
  imp.includes('const vaultUri = await saveToVault(uri, docId, mime, name)'));
check('camera receipts save their original locally', scan.includes('const vaultUri = await saveToVault(photo.uri, docId') && scan.includes('documentId: receiptDocId'));
const docs=read('app/more/documents.tsx');
const invoices=read('app/more/invoices.tsx');
const receipts=read('app/more/receipts.tsx');
check('contracts use iOS Save to Files', docs.includes("t('documentPrivacy.exportToFiles')"));
check('invoices use iOS Save to Files', invoices.includes("t('documentPrivacy.exportToFiles')"));
check('tickets use iOS Save to Files', receipts.includes('exportReceiptToFiles(sel)') && receipts.includes('safeShareFile(uri'));
const share=read('src/lib/safeShare.ts');
check('outgoing share copies are disposable cache files', share.includes('OUTGOING_DIR = (FileSystem.cacheDirectory') && share.includes('budgy-share/'));
check('incoming shared files are preserved in iCloud-backup-eligible Documents', share.includes('INCOMING_DIR = (FileSystem.documentDirectory') && share.includes('ensureDirectory(INCOMING_DIR, true)'));
check('outbound file sharing does NOT pass through incoming persistence', share.includes('copyVerified(uri, shareDir, opts)'));
check('manual camera/gallery tickets are saved in vault', read('app/more/add-receipt-manual.tsx').includes('await saveToVault(photoUri, docId'));
check('share validates created copy exists', share.includes('Number((stat as any).size)'));
const more=read('app/(tabs)/more.tsx');
check('privacy guide available inside Plus', more.includes("router.push('/more/document-privacy' as any)"));
check('iCloud copy described as manual', read('src/i18n/translations.ts').includes('export manuel, pas de synchronisation automatique'));
const app=JSON.parse(read('app.json')).expo;
check('build is 4.0.0 (94) preserving bundle ID', app.version === '4.0.0' &&
  app.ios?.buildNumber === '94' && app.ios.bundleIdentifier === 'com.budgy.ch.budgy');
console.log('\nPASS: '+checked+' local-only/iCloud guards. Native iCloud restoration requires physical iOS QA.');
