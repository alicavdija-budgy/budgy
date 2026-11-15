#!/usr/bin/env node
// TÂCHE 5 — QR-factures : doublons (exécution réelle) + conservation (statique)
// + préalables de sécurité. Catégories séparées : [UNIT] exécutés / [STATIC].
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let unit = 0, stat = 0, fail = 0;
const U = (n, c) => { if (c) { unit++; console.log(`  ✅ [UNIT] ${n}`); } else { fail++; console.log(`  ❌ [UNIT] ${n}`); } };
const S = (n, c) => { if (c) { stat++; console.log(`  ✅ [STATIC] ${n}`); } else { fail++; console.log(`  ❌ [STATIC] ${n}`); } };
const read = (f) => readFileSync(join(root, f), 'utf8');

const { findInvoiceDuplicate } = await import(join(root, 'src/lib/invoiceDocs.ts'));
const sm = await import(join(root, 'src/lib/syncMerge.ts'));

console.log('\n═ PRÉALABLE 1 — données anonymes JAMAIS attribuées automatiquement ═');
{
  // Compte A hors ligne AVANT 1re synchro → stash anonyme '' → compte B
  const vault = sm.buildLogoutStash({ syncAccountId: null, accountVault: {}, syncedHashes: {}, documents: [{ id: 'dA', title: 'Doc de A' }], contracts: [], invoices: [], receipts: [], transactions: [] });
  U('données pré-synchro stashées (jamais perdues)', vault[''].documents.length === 1);
  const rB = sm.applyAccountRestore({ syncAccountId: 'userB', accountVault: vault, syncedHashes: {}, documents: [], contracts: [], invoices: [], receipts: [], transactions: [] }, 'userB');
  U('le compte B ne voit NI ne reçoit RIEN des données anonymes', rB === null || !(rB.documents || []).some((d) => d.id === 'dA'));
  U('l\'espace anonyme reste conservé (récupérable)', !!vault['']);
  const q = sm.queueForAccount([{ docId: 'dA', accountId: '' }], 'userB', new Set(['dA']));
  U('file anonyme JAMAIS exécutée sous une session', q.length === 0);
  // Import EXPLICITE uniquement (fonction appelée par importGuestData)
  const a = sm.adoptAnonymousState({ '': { 'documents:dA': 1 } }, [{ docId: 'dA', accountId: '' }], 'userB');
  U('adoption possible UNIQUEMENT via l\'action explicite', a.tombstones.userB['documents:dA'] === 1);
}

console.log('\n═ TÂCHE 5 §7 — doublons (exécution réelle) ═');
{
  const existing = [
    { id: 'i1', title: 'Assura SA', issuer: 'Assura SA', amount: 389.6, iban: 'CH4431999123000889012', reference: '210000000003139471430009017', status: 'pending' },
    { id: 'i2', title: 'Payée', issuer: 'Swisscom', amount: 80, iban: 'CH11', reference: 'RF18539007547034', status: 'paid' },
  ];
  U('référence QRR identique → doublon détecté', !!findInvoiceDuplicate(existing, { reference: '21 00000 00003 13947 14300 09017' }));
  U('référence SCOR identique mais facture PAYÉE → pas bloquant', !findInvoiceDuplicate(existing, { reference: 'RF18 5390 0754 7034' }));
  U('IBAN + créancier + montant identiques → doublon probable', !!findInvoiceDuplicate(existing, { iban: 'CH44 3199 9123 0008 8901 2', issuer: 'assura sa', amount: 389.6 }));
  U('MONTANT SEUL identique → JAMAIS un doublon', !findInvoiceDuplicate(existing, { amount: 389.6 }));
  U('IBAN identique mais créancier différent → pas un doublon', !findInvoiceDuplicate(existing, { iban: 'CH4431999123000889012', issuer: 'Autre SA', amount: 389.6 }));
  U('aucun signal fiable → pas de doublon', !findInvoiceDuplicate(existing, { issuer: 'Assura SA' }));
}

const imp = read('app/more/email-import.tsx');
const scan = read('app/scanner-modal.tsx');
const inv = read('app/more/invoices.tsx');
const cloud = read('src/services/cloudSync.ts');
const auto = read('src/lib/autoSync.ts');
const types = read('src/types/index.ts');
const smSrc = read('src/lib/syncMerge.ts');
const storeSrc = read('src/stores/useStore.ts');

console.log('\n═ PRÉALABLE 2 — re-vérification contrôlée du schéma ═');
S('résultat négatif NON définitif (TTL 6 h)', cloud.includes('SCHEMA_PROBE_TTL_MS = 6 * 60 * 60 * 1000') && cloud.includes('Date.now() - probe.at > SCHEMA_PROBE_TTL_MS'));
S('re-sonde à la reconnexion réseau', auto.includes('resetSchemaProbes(); // reconnexion'));
S('re-sonde sur synchro manuelle', auto.includes('resetSchemaProbes(); // synchro manuelle'));
S('pas de boucle : 1 sonde max par table et par cycle', cloud.includes('const probeStale = !probe ||'));
S('L: envoyés dès schéma dispo (isDirtyForPush conservé)', cloud.includes("schemaProbe[table]?.ext === true"));
S('aucune adoption automatique dans la synchro', !cloud.includes('adoptAnonymousState'));
S('import invité = action store EXPLICITE', storeSrc.includes('importGuestData: () =>'));
S('restauration limitée au compte propriétaire', smSrc.includes('const sources = [vault[uid]].filter(Boolean)'));

console.log('\n═ TÂCHE 5 §3/§5 — conservation de l\'original ═');
S('email-import : original en vault + document lié + queueUpload', imp.includes('saveInvoiceDocument') && imp.includes('doc_inv_') && imp.includes('if (vaultUri) queueUpload(docId)'));
S('payload SPC BRUT conservé (spcPayload) séparé des champs extraits', types.includes('spcPayload?: string') && imp.includes('spcPayload: qrRaw'));
S('facture liée au document (documentId + qrPayload)', types.includes('documentId?: string') && imp.includes('documentId,') && imp.includes('qrPayload: result._qrRaw'));
S('date d\'import / MIME conservés', imp.includes('importedAt: now') && imp.includes('mimeType: hasFile ? result._mime'));
S('échec de conservation → PAS de facture (jamais de faux succès)', imp.includes("return; // l'original n'a pas pu être conservé"));
S('scanner : payload SPC conservé + document lié', scan.includes('setQrRaw(String(data') && scan.includes('spcPayload: qrRaw'));
S('QR reconstitué JAMAIS présenté comme original', inv.includes('qrRebuiltNote') && inv.includes("t('invoiceDocs.qrKept')") && inv.includes("t('invoiceDocs.originalDoc')"));

console.log('\n═ TÂCHE 5 §4 — consultation ═');
S('ouverture original : local → récupération cloud VÉRIFIÉE → erreur claire', inv.includes('await ensureLocalCopy(d.id)') && inv.includes("t('docSpaces.recoverFailed')"));
S('partage/export de l\'original (uri résolue)', inv.includes('await safeShareFile(res.uri'));
S('QR affiché depuis le payload conservé', inv.includes('<QRCode value={qrView.payload}'));
S('visionneuse PDF (WebView) + photo (Image)', inv.includes('<WebView source={{ uri: docView.uri }}') && inv.includes('resizeMode="contain"'));

console.log('\n═ TÂCHE 5 §6 — factures sans montant ═');
S('JAMAIS de facture CHF 0 (montant absent → document « à compléter »)', imp.includes("toComplete: true") && !imp.includes('amount: 0,'));
S('scanner : conserver sans montant (document seul)', scan.includes("tags: ['invoice', 'qr', 'toComplete']"));
S('obligation créée UNIQUEMENT au montant confirmé', inv.includes('const amt = normalizeChfAmount(completeAmt)') && inv.includes("amt === null || amt <= 0"));
S('complétion : IBAN/référence repris du payload SPC (jamais inventés)', inv.includes('parseSwissQrBill(payload)') && inv.includes('} catch {}'));
S('section « Montant à compléter » visible dans Factures', inv.includes('pendingAmountDocs.map'));

console.log('\n═ TÂCHE 5 §7/§9 — doublons et format ═');
S('doublon → confirmation (facture connue affichée), jamais silencieux', imp.includes('findInvoiceDuplicate(invoices,') && imp.includes("t('invoiceDocs.dupConfirm'), onPress: doPersist"));
S('normalisation CHF conservée (aucun parseFloat sur montant QR)', scan.includes('normalizeChfAmount(qrAmount)') && !scan.includes('parseFloat(qrAmount'));
S('synchro : documentId/qrPayload… via architecture Tâche 3 (hash contenu)', smSrc.includes("'pdfUri'") && types.includes('qrPayload?: string'));

console.log(`\nRésultat : ${unit} unitaires exécutés + ${stat} statiques = ${unit + stat} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
