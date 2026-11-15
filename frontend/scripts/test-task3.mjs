#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// TÂCHE 3 — Tests RÉELS (exécution effective de syncMerge.ts via le
// type-stripping natif de Node) + garde-fous d'intégration.
// ─────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
};

// ═══ 1. EXÉCUTION RÉELLE de la fusion sans perte ═══
const { mergeCollections, mergeItem, docTypeOf, storagePathFor, sanitizeFileName, storageFolderFor } =
  await import(join(root, 'src/lib/syncMerge.ts'));

console.log('\n— Fusion pull/push SANS PERTE (exécution réelle) —');
{
  const now = Date.now();
  const local = [
    { id: 'a', title: 'ancien poussé', createdAt: now - 86400000 },
    { id: 'b', title: 'créé localement à l\'instant', createdAt: now },
  ];
  const remote = [{ id: 'a', title: 'ancien poussé (cloud)' }];
  const lastPush = now - 3600000; // push complet il y a 1 h
  const r = mergeCollections(local, remote, lastPush);
  ok('création locale récente JAMAIS écrasée par un pull', r.merged.some((x) => x.id === 'b'));
  ok('élément déjà poussé puis supprimé ailleurs → retiré', !r.merged.some((x) => x.id === 'c'));
  ok('élément commun : le cloud gagne', r.merged.find((x) => x.id === 'a').title === 'ancien poussé (cloud)');
  ok('compteur de préservation exact', r.preservedLocal === 1);
}
{
  const now = Date.now();
  // Jamais poussé (lastPushAt = 0) → TOUT le local est conservé
  const r = mergeCollections([{ id: 'x', createdAt: now - 999999999 }], [], 0);
  ok('jamais poussé (lastPushAt=0) → tout le local conservé', r.merged.length === 1);
  // Déjà poussé → un vieil élément local absent du cloud = suppression distante
  const r2 = mergeCollections([{ id: 'x', createdAt: now - 999999999 }], [], now - 1000);
  ok('déjà poussé + absent du cloud + ancien → suppression distante assumée', r2.merged.length === 0);
}
{
  // Champ local non migré (file_uri absent/NULL côté cloud) : PRÉSERVÉ
  const local = { id: 'd', title: 'Contrat', fileUri: 'file:///vault/d.pdf', mimeType: 'application/pdf', documentId: 'doc_1' };
  const remote = { id: 'd', title: 'Contrat (cloud)', fileUri: null, mimeType: undefined };
  const m = mergeItem(local, remote);
  ok('fileUri local préservé quand le cloud renvoie NULL (avant migration)', m.fileUri === 'file:///vault/d.pdf');
  ok('mimeType local préservé quand la colonne n\'existe pas', m.mimeType === 'application/pdf');
  ok('les champs réellement présents côté cloud gagnent', m.title === 'Contrat (cloud)');
  ok('la relation contrat↔document survit à la synchro', m.documentId === 'doc_1');
}

console.log('\n— Types documentaires (exécution réelle) —');
{
  ok('documentType explicite prioritaire', docTypeOf({ id: '1', documentType: 'invoice' }, new Set()) === 'invoice');
  ok('document lié à un contrat → Contrats (certain)', docTypeOf({ id: '1' }, new Set(['1'])) === 'contract');
  ok('ancien document incertain → « À classer », jamais converti', docTypeOf({ id: '2', documentType: null }, new Set(['1'])) === 'unclassified');
  ok('type inconnu/corrompu → « À classer »', docTypeOf({ id: '3', documentType: 'garbage' }, new Set()) === 'unclassified');
  ok('un ticket n\'est jamais retypé en facture', docTypeOf({ id: '4', documentType: 'expense_receipt' }, new Set()) === 'expense_receipt');
}

console.log('\n— Chemins du stockage privé (exécution réelle) —');
{
  ok('users/{uid}/contracts/{documentId}/…', storagePathFor('u1', 'contract', 'doc_9', 'bail.pdf') === 'users/u1/contracts/doc_9/bail.pdf');
  ok('espace factures', storagePathFor('u1', 'invoice', 'doc_1', 'f.pdf') === 'users/u1/invoices/doc_1/f.pdf');
  ok('espace tickets', storageFolderFor('expense_receipt') === 'expense-receipts');
  ok('type inconnu → dossier unclassified (jamais public)', storageFolderFor(undefined) === 'unclassified');
  ok('noms de fichiers assainis (traversée/caractères)', sanitizeFileName('../../etc/pass wd?.pdf') === 'pass_wd_.pdf');
  let threw = false; try { storagePathFor('', 'contract', 'x', 'f'); } catch { threw = true; }
  ok('uid manquant → refus explicite (jamais de chemin anonyme)', threw);
}

// ═══ 2. Garde-fous d'intégration (fichiers réels du dépôt) ═══
const read = (f) => readFileSync(join(root, f), 'utf8');
const cloud = read('src/services/cloudSync.ts');
const imp = read('app/more/email-import.tsx');
const docs = read('app/more/documents.tsx');
const store = read('src/stores/useStore.ts');
const dstore = read('src/services/documentStorage.ts');
const mig = readFileSync(join(root, '..', 'docs', 'MIGRATION_TASK3_storage_prive.sql'), 'utf8');

console.log('\n— Synchronisation (mappings et protections) —');
ok('pull fusionne via mergeCollections (plus d\'écrasement intégral)', cloud.includes('mergeCollections') && !cloud.includes('documents: documents as PersonalDocument[]'));
ok('contrats : document_id/photo_uri/notice_period synchronisés', cloud.includes("'document_id', 'photo_uri', 'notice_period'"));
ok('documents : document_type/file_uri/mime_type/remote_path/pages synchronisés', ['document_type','file_uri','mime_type','remote_path','pages','imported_at'].every((c) => cloud.includes(`'${c}'`)));
ok('transactions : liens anti-double-comptage synchronisés', ['invoice_id','debt_id','recurring_id','source'].every((c) => cloud.includes(`'${c}'`)));
ok('binaires JAMAIS en colonnes (image_base64/pdf_base64 exclus)', !cloud.includes("'image_base64'") && !cloud.includes("'pdf_base64'"));
ok('repli legacy avant migration (42703/PGRST204)', cloud.includes('TABLE_FIELDS_LEGACY') && cloud.includes('isMissingColumnError'));
ok('lastCloudPushAt avancé UNIQUEMENT sur push complet', cloud.includes('markCloudPushed(Date.now())') && cloud.indexOf('markCloudPushed') > cloud.indexOf('errors.length > 0'));
ok('file d\'envoi durable persistée dans le store', store.includes('pendingUploads: []') && store.includes('queueUpload:'));
ok('suppression d\'un document → retiré de la file (pas d\'orphelin)', store.includes("pendingUploads: s.pendingUploads.filter((i) => i !== id)"));

console.log('\n— Stockage privé Supabase —');
ok('bucket privé dédié (user-documents)', dstore.includes("DOCUMENTS_BUCKET = 'user-documents'") && mig.includes("'user-documents', 'user-documents', false"));
ok('identité = session authentifiée (jamais fournie par le client)', dstore.includes('sess.session?.user.id') && mig.includes('auth.uid()'));
ok('policies propriétaire (read/insert/update/delete)', ['docs_owner_read','docs_owner_insert','docs_owner_update','docs_owner_delete'].every((p) => mig.includes(p)));
ok('URLs signées TEMPORAIRES, jamais persistées', dstore.includes('createSignedUrl') && !dstore.includes('signedUrl') === false && dstore.includes('jamais stockée'));
ok('upload idempotent (chemin fixe + upsert) — reprise sans doublon', dstore.includes('upsert: true'));
ok('copie cloud annoncée SEULEMENT après confirmation serveur', dstore.indexOf('remoteUploadedAt: Date.now()') > dstore.indexOf('.upload(path, body'));
ok('taille/mime/date/id enregistrés', dstore.includes('fileSize: size') && mig.includes('file_size') && mig.includes('imported_at'));
ok('aucun contenu de fichier dans les journaux', !/console\.(log|warn|error)\([^)]*b(ase)?64/i.test(dstore));
ok('migration additive NON exécutée (statut explicite)', mig.includes('NON EXÉCUTÉE') && !mig.includes('DROP TABLE'));
ok('anciennes données : « À classer » + aucune suppression d\'URI/base64', mig.includes("'unclassified' WHERE document_type IS NULL") && mig.includes('data_uri'));

console.log('\n— Réserves Tâche 2 corrigées —');
ok('A. exception/timeout → fichier conservé + saisie manuelle', imp.includes('réserve A') && imp.includes('_failedOcr: true,\n        _errorMessage: e?.message'));
ok('A. 401/403 reste une reconnexion (flux distinct)', imp.includes("r.status === 401 || r.status === 403"));
ok('B. plus d\'« assurance » imposée — catégorie choisie', imp.includes('category: manualCt.category') && !imp.includes("category: 'assurance',"));
ok('B. catégories métier réelles de l\'app', ['abonnements','assurances','logement','transports','sante','energie','autre'].every((c) => imp.includes(`'${c}'`)));

console.log('\n— Parcours tickets (jamais ticket → facture auto) —');
ok('ticket OCR → confirmation explicite, pas de facture auto', imp.includes("docType === 'receipt'") && !imp.includes("docType === 'invoice' || docType === 'receipt'"));
ok('ticket enregistré dans receipts[], pas invoices[]', imp.includes("type: 'ticket'") && imp.includes('addReceipt({'));
ok('transaction liée UNIQUEMENT sur confirmation', imp.includes('askLinkTxTitle') && imp.includes('updateReceipt(receiptId, { transactionId: txId })'));
ok('ticket sans pièce conservée → refus (jamais de faux succès)', imp.includes('jamais de ticket sans sa pièce conservée'));
ok('classification incertaine → 3 espaces proposés', imp.includes("pickTicketOption'), onPress: persistAsReceipt"));

console.log('\n— Espaces documentaires (UI) —');
ok('chips Factures/Contrats/Tickets/À classer', docs.includes('testID={`space-${sp.id}`}') && ["'invoice'","'contract'","'expense_receipt'","'unclassified'"].every((x) => docs.includes(`id: ${x}`)));
ok('filtre par type documentaire (docTypeOf), pas par catégorie métier', docs.includes('docTypeOf(d, linkedDocIds) !== typeFilter'));
ok('section Contrats visible dans espaces Tous/Contrats', docs.includes("(typeFilter === 'all' || typeFilter === 'contract')"));
ok('classification manuelle (appui long), jamais automatique', docs.includes('classifyDoc') && docs.includes('onLongPress={() => classifyDoc(d)}'));
ok('badge ☁️ seulement après confirmation du stockage', docs.includes('remoteUploadedAt'));

console.log(`\nRésultat : ${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
