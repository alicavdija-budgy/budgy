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

S('un toucher sur toute facture ouvre son détail consultable', inv.includes('onPress={() => openInvoiceDetails(inv.id)}') && inv.includes('testID={`invoice-details-${inv.id}`}'));
S('facture sans montant consultable AVANT complétion', inv.includes('onPress={() => openPendingDetails(d.id)}') && inv.includes('invoice-detail-complete-amount'));
S('détail donne accès au PDF/photo et au partage natif', inv.includes('invoice-detail-open-original') && inv.includes('invoice-detail-share-original') && inv.includes('openDetailOriginal') && inv.includes('shareDetailOriginal'));
S('détail affiche le QR bancaire du SPC original sans paiement automatique', inv.includes('invoice-detail-show-qr') && inv.includes('parseSwissQrBill(String(payload))') && inv.includes('invoiceDocs.paymentReminder'));
S('QR disponible sur autre téléphone ET export PNG sur le même téléphone', inv.includes('getRef={(ref: any)') && inv.includes('toDataURL((data: string)') && inv.includes('FileSystem.writeAsStringAsync(dest, pngB64') && inv.includes('safeShareFile(dest, { mime:'));
S('partage PDF/photo utilise le paramètre MIME réel et vérifie le résultat', inv.includes('await safeShareFile(res.uri, { mime:') && inv.includes('if (!shared.ok)'));
S('iOS : fermer la fiche AVANT d’afficher une seconde modale ou partager', inv.includes('closeDetails();') && inv.includes('setTimeout(() => showQr(inv), 300)') && inv.includes('setTimeout(() => { void openOriginal(inv); }, 300)'));
S('scanner galerie QR conserve l’image d’origine dans le vault', scan.includes('sourceUri: uri') && scan.includes('setQrSource(sourceUri ?') && scan.includes('await saveToVault(qrSource.uri, docId, qrSource.mime)'));
S('scanner photo QR OCR conserve également le cliché d’origine', scan.includes('runOcr(norm.base64, norm.uri)') && scan.includes('sourceUri: originalUri'));
S('scanner image QR ne crée pas de facture si conservation de l’image impossible', scan.includes('if (!(await vaultFileExists(vaultUri)))') && scan.includes('const item = await buildInvoice(recurringId);') && scan.includes('addInvoice(item as any)'));


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

console.log('\n═ CORRECTIFS FINAUX P0 — synchronisation des liens QR ═');
const cs = read('src/services/cloudSync.ts');
const mig = readFileSync(join(root, '..', 'docs/MIGRATION_TASK3_storage_prive.sql'), 'utf8');
S('migration additive : invoices.document_id + qr_payload', mig.includes('ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS document_id text') && mig.includes('ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS qr_payload text'));
S('migration additive : documents.spc_payload', mig.includes('ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS spc_payload text'));
S('TABLE_FIELDS invoices transmet document_id + qr_payload', /invoices:\s*\[[^\]]*'document_id'[^\]]*'qr_payload'[^\]]*\]/.test(cs));
S('TABLE_FIELDS documents transmet spc_payload', /documents:\s*\[[^\]]*'spc_payload'[^\]]*\]/.test(cs));
S('aucun binaire en colonne (pas de base64/file_uri dans TABLE_FIELDS)', !/TABLE_FIELDS[^;]*'(image_base64|pdf_base64|file_uri|pdf_uri|pages)'/s.test(cs));
S('repli legacy SANS les nouveaux champs (compatible ancien schéma)', !/TABLE_FIELDS_LEGACY[\s\S]{0,900}qr_payload/.test(cs) && !/TABLE_FIELDS_LEGACY[\s\S]{0,900}spc_payload/.test(cs));
S('sonde schéma sur les colonnes les PLUS récentes (migration partielle → reste en L:)', cs.includes("invoices: 'fx_source'") && cs.includes("documents: 'spc_payload'"));
{
  // [UNIT] Les 3 champs participent au hash de contenu → mutation détectée,
  // envoi après migration via le mécanisme L:/dirty.
  const base = { id: 'i1', title: 'Assura', amount: 10 };
  U('qrPayload modifie le hash (dirty → push)', sm.hashItem(base) !== sm.hashItem({ ...base, qrPayload: 'SPC…' }));
  U('documentId modifie le hash (dirty → push)', sm.hashItem(base) !== sm.hashItem({ ...base, documentId: 'doc1' }));
  U('spcPayload modifie le hash (dirty → push)', sm.hashItem({ id: 'd1' }) !== sm.hashItem({ id: 'd1', spcPayload: 'SPC…' }));
  // [UNIT] Projection legacy : les champs Tâche 5 sont RETIRÉS du payload
  // pré-migration mais CONSERVÉS en local ; la confirmation partielle 'L:'
  // reste détectable (isConfirmedHash) → renvoi après migration.
  const snakeRow = { id: 'i1', user_id: 'u', title: 'Assura', amount: 10, document_id: 'doc1', qr_payload: 'SPC…', created_at: 1 };
  const legacyFields = ['id', 'user_id', 'title', 'amount', 'created_at'];
  const proj = sm.pickProjection(legacyFields, snakeRow);
  U('projection legacy exclut document_id/qr_payload (ancien schéma)', !('document_id' in proj) && !('qr_payload' in proj));
  const lh = sm.legacyHashOf(snakeRow, legacyFields);
  U('confirmation partielle L: reconnue (pas une confirmation pleine)', lh.startsWith('L:') && sm.isConfirmedHash(lh, sm.hashItem(snakeRow), lh) && !sm.isConfirmedHash(lh, sm.hashItem(snakeRow), null));
  // [UNIT] Pull depuis un 2e client : la facture cloud (documentId/qrPayload)
  // et le document (spcPayload) arrivent intacts sur un état local vide.
  const pulled = sm.mergeCollectionsV2([], [{ id: 'i1', title: 'Assura', amount: 10, documentId: 'doc1', qrPayload: 'SPC…' }], { dirtyIds: new Set(), tombstoneIds: new Set() });
  const got = pulled.merged.find((x) => x.id === 'i1');
  U('2e client : documentId + qrPayload restaurés au pull', !!got && got.documentId === 'doc1' && got.qrPayload === 'SPC…');
  const pulledDoc = sm.mergeCollectionsV2([], [{ id: 'd1', title: 'Assura', spcPayload: 'SPC…' }], { dirtyIds: new Set(), tombstoneIds: new Set() });
  const gd = pulledDoc.merged.find((x) => x.id === 'd1');
  U('2e client : spcPayload du document restauré au pull', !!gd && gd.spcPayload === 'SPC…');
}

console.log('\n═ CORRECTIFS FINAUX P0 — scanner : confirmation des doublons ═');
S('doublon re-vérifié À L\'ENREGISTREMENT (logique centralisée)', scan.includes('findInvoiceDuplicate(invoices as any') && scan.includes('const proceed = ()'));
S('titre de la facture existante affiché + 3 choix (voir/annuler/importer)', scan.includes("t('invoiceDocs.dupView')") && scan.includes("t('common.cancel')") && scan.includes("t('invoiceDocs.dupConfirm'), style: 'destructive', onPress: proceed"));
S('aucune création sans confirmation (return avant addInvoice)', /if \(dup\) \{[\s\S]*?return;\s*\}\s*proceed\(\);/.test(scan));
S('rapprochement charge récurrente PRÉSERVÉ (dans proceed)', /const proceed = \(\) => \{[\s\S]*?recurringExpenses\.find/.test(scan));

console.log('\n═ CORRECTIFS FINAUX P0 — complétion : devise réelle + idempotence ═');
S('devise relue du payload SPC (CHF ou EUR, jamais convertie)', inv.includes('currency = b.currency') && !inv.includes("currency: 'CHF',\n      iban"));
S('devise AFFICHÉE avant confirmation', inv.includes("t('invoiceDocs.completeCurrency', { currency: completingCurrency })"));
S('facture déjà liée au document → aucune re-création', inv.includes('storeInvoices.find((i: any) => i.documentId === d.id)') && inv.includes("t('invoiceDocs.alreadyLinked'"));
S('doublon recherché AVANT la création (jamais montant seul)', inv.includes('findInvoiceDuplicate(storeInvoices as any, { reference, iban, issuer, amount: amt })'));
S('double appui → UNE seule facture (verrou completingBusy)', inv.includes('if (completingBusy.current) return;') && inv.includes('completingBusy.current = true;'));
S('toComplete retiré APRÈS enregistrement confirmé', /completingBusy\.current = true;[\s\S]*?addInvoice\(\{[\s\S]*?\} as any\);[\s\S]*?filter\(\(x\) => x !== 'toComplete'\)/.test(inv));

console.log('\n═ CORRECTIF FINAL P1 — import des données invitées accessible ═');
const cloudSrc = read('app/more/cloud-sync.tsx');
S('carte visible quand des données invitées existent', cloudSrc.includes("accountVault?.['']") && cloudSrc.includes("t('guestImport.cardTitle')"));
S('contenu listé avant import (quantités par type)', cloudSrc.includes('guestList') && cloudSrc.includes("t('guestImport.cardBody', { list: guestList })"));
S('confirmation explicite + annulation sans perte', cloudSrc.includes("t('guestImport.confirmTitle')") && cloudSrc.includes("style: 'cancel' }, // annulation SANS perte"));
S('import uniquement via action explicite importGuestData()', cloudSrc.includes('store.importGuestData()'));
S('journal technique sans données financières', cloudSrc.includes("console.log('[guestImport] import explicite effectué')"));
{
  // [UNIT] importGuestData ne touche JAMAIS le vault d'un autre compte
  // identifié : seul l'espace anonyme '' est déplacé vers le compte courant.
  const vault = { '': { documents: [{ id: 'g1', title: 'Invité' }], syncedHashes: {} }, userX: { documents: [{ id: 'x1', title: 'De X' }], syncedHashes: {} } };
  const moved = { ...vault, userB: vault[''] };
  delete moved[''];
  const r = sm.applyAccountRestore({ syncAccountId: 'userB', accountVault: moved, syncedHashes: {}, documents: [], contracts: [], invoices: [], receipts: [], transactions: [] }, 'userB');
  U('import invité → données dans le compte courant uniquement', !!r && (r.documents || []).some((d) => d.id === 'g1') && !(r.documents || []).some((d) => d.id === 'x1'));
  U('le vault du compte X reste intact (jamais fusionné)', !!r.accountVault && !!r.accountVault.userX && r.accountVault.userX.documents[0].id === 'x1');
}

console.log(`\nRésultat : ${unit} unitaires exécutés + ${stat} statiques = ${unit + stat} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
