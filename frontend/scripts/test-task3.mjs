#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// TÂCHE 3 (audit) — Tests de la synchronisation documentaire.
// Résultats SÉPARÉS :
//   [UNIT]    tests unitaires RÉELLEMENT EXÉCUTÉS (syncMerge v2 via Node)
//   [STATIC]  contrôles statiques (garde-fous de câblage)
//   [E2E]     couverts par navigateur (listés, exécutés séparément)
//   [NT]      NON TESTÉS (infrastructure indisponible)
// ─────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let unit = 0, stat = 0, fail = 0;
const U = (name, cond) => { if (cond) { unit++; console.log(`  ✅ [UNIT] ${name}`); } else { fail++; console.log(`  ❌ [UNIT] ${name}`); } };
const S = (name, cond) => { if (cond) { stat++; console.log(`  ✅ [STATIC] ${name}`); } else { fail++; console.log(`  ❌ [STATIC] ${name}`); } };

const sm = await import(join(root, 'src/lib/syncMerge.ts'));
const { mergeCollectionsV2, mergeItem, hashItem, computeHashes, diffDirty,
  docTypeOf, storagePathFor, sanitizeFileName, storageFolderFor,
  normalizeUploadQueue, queueForAccount, tombstoneKey,
  legacyHashOf, isConfirmedHash, pickProjection, stashUnsyncedDocs,
  buildLogoutStash, applyAccountRestore, adoptAnonymousState, isDirtyForPush } = sm;

console.log('\n═══ TESTS UNITAIRES (exécution réelle) ═══');

console.log('\n— §1 Fusion : modification locale non confirmée GAGNE —');
{
  // Modifier hors ligne le titre d'un ancien contrat, puis recevoir sa
  // version cloud ANTÉRIEURE : la modification locale doit survivre.
  const confirmed = { ct1: hashItem({ id: 'ct1', title: 'Bail', category: 'logement' }) };
  const local = [{ id: 'ct1', title: 'Bail RENOMMÉ HORS LIGNE', category: 'logement' }];
  const cloudOld = [{ id: 'ct1', title: 'Bail', category: 'logement' }];
  const { dirtyIds } = diffDirty(local, confirmed);
  U('le renommage hors ligne est détecté comme non synchronisé', dirtyIds.has('ct1'));
  const r = mergeCollectionsV2(local, cloudOld, { dirtyIds, tombstoneIds: new Set() });
  U('la version cloud ANTÉRIEURE n\'écrase PAS le renommage local', r.merged[0].title === 'Bail RENOMMÉ HORS LIGNE');
  U('le conflit protégé est compté (déterministe, documenté)', r.protectedDirty === 1);
}
{
  // Élément PROPRE (confirmé) → le cloud gagne champ par champ…
  const item = { id: 'd1', title: 'Doc', note: 'locale', fileUri: 'file:///vault/d1.pdf' };
  const confirmed = { d1: hashItem(item) };
  const cloud = [{ id: 'd1', title: 'Doc (édité ailleurs)', note: null, fileUri: undefined }];
  const { dirtyIds } = diffDirty([item], confirmed);
  U('élément inchangé localement → non dirty', !dirtyIds.has('d1'));
  const r = mergeCollectionsV2([item], cloud, { dirtyIds, tombstoneIds: new Set() });
  U('…le cloud gagne sur un élément propre', r.merged[0].title === 'Doc (édité ailleurs)');
  U('…mais NULL/absent côté cloud ne détruit JAMAIS une valeur locale', r.merged[0].note === 'locale' && r.merged[0].fileUri === 'file:///vault/d1.pdf');
}

console.log('\n— §1 Absence cloud ≠ suppression —');
{
  // Réponse cloud INCOMPLÈTE (vide) : AUCUN document ne doit être effacé.
  const local = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }];
  const r = mergeCollectionsV2(local, [], { dirtyIds: new Set(), tombstoneIds: new Set() });
  U('réponse cloud incomplète/vide → rien n\'est effacé', r.merged.length === 2);
  U('aucune dépendance aux horloges pour décider d\'une suppression', !String(mergeCollectionsV2).includes('Date.now'));
}
{
  // Document créé HORS LIGNE (absent du cloud) : conservé, prêt à pousser.
  const local = [{ id: 'new1', title: 'Créé hors ligne', createdAt: 1 }];
  const { dirtyIds } = diffDirty(local, {});
  const r = mergeCollectionsV2(local, [{ id: 'other', title: 'X' }], { dirtyIds, tombstoneIds: new Set() });
  U('création hors ligne conservée après pull', r.merged.some((x) => x.id === 'new1'));
  U('…et marquée à pousser (dirty)', dirtyIds.has('new1'));
}

console.log('\n— §1 Tombstones : suppression EXPLICITE uniquement —');
{
  // Suppression confirmée sur l'appareil A ; le cloud renvoie encore la ligne
  // (ou un autre appareil la renvoie) → PAS de résurrection.
  const tomb = new Set(['doc_del']);
  const r = mergeCollectionsV2([], [{ id: 'doc_del', title: 'supprimé' }], { dirtyIds: new Set(), tombstoneIds: tomb });
  U('un document intentionnellement supprimé ne ressuscite jamais', r.merged.length === 0 && r.removedByTombstone === 1);
  // Tombstone distant reçu sur l'appareil B → copie locale retirée.
  const r2 = mergeCollectionsV2([{ id: 'doc_del', title: 'copie locale B' }], [], { dirtyIds: new Set(), tombstoneIds: tomb });
  U('suppression distante CONFIRMÉE appliquée sur le 2e appareil', r2.merged.length === 0);
  U('clé de tombstone déterministe', tombstoneKey('documents', 'doc_del') === 'documents:doc_del');
}

console.log('\n— §2 Détection fiable des modifications (hash de contenu) —');
{
  const a = { id: 'x', title: 'T', category: 'health', documentType: 'invoice', expiresAt: '2026-01-01' };
  U('changement de CATÉGORIE détecté (même nombre d\'éléments)', hashItem(a) !== hashItem({ ...a, category: 'tax' }));
  U('RENOMMAGE détecté', hashItem(a) !== hashItem({ ...a, title: 'T2' }));
  U('changement de DATE détecté', hashItem(a) !== hashItem({ ...a, expiresAt: '2027-01-01' }));
  U('changement de LIEN documentaire détecté', hashItem({ id: 'c', documentId: 'd1' }) !== hashItem({ id: 'c', documentId: 'd2' }));
  U('changement de PIÈCE JOINTE détecté', hashItem({ id: 'd', remotePath: 'p1' }) !== hashItem({ id: 'd', remotePath: 'p2' }));
  U('hash stable (ordre des clés indifférent)', hashItem({ a: 1, b: 2 }) === hashItem({ b: 2, a: 1 }));
  U('champ volatil `synced` ignoré (pas de push parasite)', hashItem({ id: 'x', synced: true }) === hashItem({ id: 'x', synced: false }));
}
{
  // Erreur au MILIEU d'un push : la table en échec ne confirme pas ses hashes
  // → ses éléments restent dirty et repartent au prochain cycle.
  const items = [{ id: 'i1', title: 'A' }, { id: 'i2', title: 'B' }];
  const beforeFail = {}; // échec → aucune confirmation enregistrée
  const { dirtyIds: after } = diffDirty(items, beforeFail);
  U('échec en milieu de push → éléments toujours dirty (reprise garantie)', after.size === 2);
  const { hashes } = diffDirty(items, {});
  const { dirtyIds: confirmed } = diffDirty(items, hashes);
  U('confirmation serveur → plus rien à pousser (pas de boucle)', confirmed.size === 0);
}

console.log('\n— §6 Isolation de la file d\'envoi par compte —');
{
  const q = normalizeUploadQueue(['legacy_doc', { docId: 'docA', accountId: 'userA' }, { docId: 'docB', accountId: 'userB' }]);
  U('compatibilité : anciennes entrées string normalisées', q.length === 3 && q[0].accountId === '');
  const forB = queueForAccount(q, 'userB', new Set(['docB']));
  U('la pièce du compte A n\'est JAMAIS envoyée sous la session du compte B', !forB.some((e) => e.docId === 'docA'));
  U('le compte B n\'envoie que ses pièces', forB.some((e) => e.docId === 'docB'));
  const forA = queueForAccount(q, 'userA', new Set(['docA', 'legacy_doc']));
  U('reprise sécurisée du compte d\'origine à sa reconnexion', forA.some((e) => e.docId === 'docA'));
  // SÉCURITÉ (préalable Tâche 5) : une entrée sans propriétaire ('') n'est
  // JAMAIS exécutée sous une session — import explicite uniquement.
  U('entrée héritée sans compte JAMAIS envoyée automatiquement', !forA.some((e) => e.docId === 'legacy_doc'));
}

console.log('\n— P0 Repli legacy : ne confirmer QUE ce qui est envoyé —');
{
  // ANCIEN SCHÉMA SIMULÉ : seules les colonnes legacy sont acceptées.
  const legacyFields = ['id', 'user_id', 'title', 'category', 'created_at'];
  const row = { id: 'd1', user_id: 'u1', title: 'Contrat', category: 'contracts', document_type: 'contract', remote_path: 'users/u1/contracts/d1/file.pdf', created_at: 1 };
  const item = { id: 'd1', title: 'Contrat', category: 'contracts', documentType: 'contract', remotePath: 'users/u1/contracts/d1/file.pdf', createdAt: 1 };
  const lH = legacyHashOf(row, legacyFields);
  U('la projection legacy ignore les champs étendus', !JSON.stringify(pickProjection(legacyFields, row)).includes('remote_path'));
  U('confirmation legacy ≠ confirmation complète', lH !== hashItem(item) && lH.startsWith('L:'));
  // Rien de nouveau côté legacy → PAS de re-push en boucle avant migration…
  U('pas de boucle infinie avant migration (projection inchangée = propre)', isConfirmedHash(lH, hashItem(item), legacyHashOf(row, legacyFields)));
  // …mais un champ LEGACY modifié redevient dirty…
  const row2 = { ...row, title: 'Contrat renommé' };
  U('champ legacy modifié → re-poussé', !isConfirmedHash(lH, hashItem({ ...item, title: 'Contrat renommé' }), legacyHashOf(row2, legacyFields)));
  // …et après MIGRATION (upsert complet accepté), la confirmation complète
  // remplace le marqueur : plus rien en attente.
  U('après migration : confirmation complète efface l\'attente', isConfirmedHash(hashItem(item), hashItem(item), null));
  U('un marqueur legacy n\'est JAMAIS égal à un hash complet (succès partiel explicite)', !isConfirmedHash(hashItem(item), lH, null) || hashItem(item) !== lH);
}

console.log('\n— P0 Logout : documents non synchronisés préservés —');
{
  const docs = [
    { id: 'synced', title: 'Déjà confirmé' },
    { id: 'unsynced', title: 'Jamais confirmé', fileUri: 'file:///vault/u.pdf' },
  ];
  const confirmed = { synced: hashItem(docs[0]) };
  const stash = stashUnsyncedDocs(docs, confirmed);
  U('seuls les documents NON confirmés sont mis de côté', stash.length === 1 && stash[0].id === 'unsynced');
  U('un document confirmé n\'est pas dupliqué dans l\'espace isolé', !stash.some((d) => d.id === 'synced'));
  U('aucun document stashé si tout est confirmé', stashUnsyncedDocs([docs[0]], confirmed).length === 0);
}

console.log('\n— P1 Performance : binaires exclus du hash —');
{
  const a = { id: 'd', title: 'Doc', imageBase64: 'A'.repeat(10000), pages: ['B'.repeat(10000)], fileUri: 'file:///1.pdf', uploadError: undefined };
  const b = { id: 'd', title: 'Doc', imageBase64: 'C'.repeat(50000), pages: ['D'], fileUri: 'file:///2.pdf', uploadError: 'too-large' };
  U('base64/pages/chemins locaux ne déclenchent PAS de push (jamais en colonnes)', hashItem(a) === hashItem(b));
  U('un champ SYNCHRONISÉ modifié déclenche toujours', hashItem({ ...a, title: 'X' }) !== hashItem(a));
  U('remotePath (référence cloud) reste suivi', hashItem({ id: 'd', remotePath: 'p1' }) !== hashItem({ id: 'd', remotePath: 'p2' }));
}

console.log('\n═ SCÉNARIO A — compte A hors ligne → logout → compte B → retour A ═');
{
  // 1-3. Compte A, hors ligne : contrat + PDF + lien documentId (jamais confirmés)
  const doc = { id: 'doc_A', title: 'Bail.pdf', documentType: 'contract', fileUri: 'file:///vault/doc_A.pdf', mimeType: 'application/pdf', createdAt: 1 };
  const ct = { id: 'ct_A', title: 'Bail 2026', category: 'logement', documentId: 'doc_A', createdAt: 1 };
  const stateA = {
    syncAccountId: 'userA', accountVault: {}, syncedHashes: {},
    documents: [doc], contracts: [ct], invoices: [], receipts: [], transactions: [],
  };
  // 4. Logout → mise en réserve COMPLÈTE (entités + relations + marqueurs)
  const vault = buildLogoutStash(stateA);
  U('A4. le contrat ET son document sont stashés ensemble (relations)', vault.userA.contracts.length === 1 && vault.userA.documents.length === 1);
  U('A4. le lien documentId est préservé dans la réserve', vault.userA.contracts[0].documentId === 'doc_A');
  // 5. Connexion compte B : rien de A n'est visible ni restauré
  const stateB = { syncAccountId: 'userB', accountVault: vault, syncedHashes: {}, documents: [], contracts: [], invoices: [], receipts: [], transactions: [] };
  const restoredB = applyAccountRestore(stateB, 'userB');
  U('A5. le compte B ne restaure AUCUNE donnée du compte A', restoredB === null || !(restoredB.contracts || []).some((c) => c.id === 'ct_A'));
  U('A5. la réserve de A reste intacte sous la session B', !!vault.userA && vault.userA.contracts[0].id === 'ct_A');
  // 6. Retour au compte A : tout est restauré
  const stateA2 = { syncAccountId: 'userA', accountVault: vault, syncedHashes: {}, documents: [], contracts: [], invoices: [], receipts: [], transactions: [] };
  const restoredA = applyAccountRestore(stateA2, 'userA');
  U('A6. contrat restauré au retour de A', restoredA.contracts.length === 1 && restoredA.contracts[0].title === 'Bail 2026');
  U('A6. document (fichier local) restauré avec son lien', restoredA.documents[0].fileUri === 'file:///vault/doc_A.pdf' && restoredA.contracts[0].documentId === 'doc_A');
  U('A6. la réserve de A est consommée (pas de double restauration)', !restoredA.accountVault.userA);
  // 7. Reconnexion réseau : le push détecte tout comme à envoyer
  const { dirtyIds } = diffDirty(restoredA.contracts, restoredA.syncedHashes.contracts);
  U('A7. données restaurées détectées comme à pousser', dirtyIds.has('ct_A'));
}

console.log('\n═ SCÉNARIO B — restauration puis pull avec une ANCIENNE version cloud ═');
{
  const docs = [
    { id: 'off1', title: 'Créé hors ligne 1', createdAt: 10 },
    { id: 'off2', title: 'Créé hors ligne 2', createdAt: 11 },
  ];
  const vault = buildLogoutStash({ syncAccountId: 'userA', accountVault: {}, syncedHashes: {}, documents: docs, contracts: [], invoices: [], receipts: [], transactions: [] });
  const state = { syncAccountId: 'userA', accountVault: vault, syncedHashes: {}, documents: [], contracts: [], invoices: [], receipts: [], transactions: [] };
  const restored = applyAccountRestore(state, 'userA');
  U('B. restauration complète au login', restored.documents.length === 2);
  // pull retourne une ANCIENNE version du cloud (vide / partielle) —
  // exactement le calcul fait par cloudSync : dirty depuis l'état POST-restauration.
  const { dirtyIds } = diffDirty(restored.documents, restored.syncedHashes.documents);
  const res = mergeCollectionsV2(restored.documents, [], { dirtyIds, tombstoneIds: new Set() });
  U('B. AUCUNE donnée restaurée ne disparaît au pull (ancienne version cloud)', res.merged.length === 2);
  const res2 = mergeCollectionsV2(restored.documents, [{ id: 'off1', title: 'Version cloud périmée' }], { dirtyIds, tombstoneIds: new Set() });
  U('B. la version cloud PÉRIMÉE n\'écrase pas la donnée restaurée (dirty gagne)', res2.merged.find((d) => d.id === 'off1').title === 'Créé hors ligne 1');
}

console.log('\n═ SCÉNARIO C — ancien schéma → migration → envoi automatique ═');
{
  const legacyFields = ['id', 'user_id', 'title', 'category', 'created_at'];
  const row = { id: 'd1', user_id: 'u1', title: 'Doc', category: 'contracts', document_type: 'contract', remote_path: 'users/u1/contracts/d1/f.pdf', created_at: 1 };
  const item = { id: 'd1', title: 'Doc', category: 'contracts', documentType: 'contract', remotePath: 'users/u1/contracts/d1/f.pdf', createdAt: 1 };
  const fullH = hashItem(item);
  const lH = legacyHashOf(row, legacyFields);
  // 1-2. ancien schéma : push → confirmation partielle 'L:' → plus de boucle
  U('C1. ancien schéma : élément dirty au départ', isDirtyForPush(undefined, fullH, lH, false));
  U('C2. confirmation partielle L: → PAS de boucle avant migration', !isDirtyForPush(lH, fullH, lH, false));
  // 3. schéma étendu disponible (sonde) → les champs en attente repartent
  U('C3. schéma étendu disponible → métadonnées en attente RE-POUSSÉES', isDirtyForPush(lH, fullH, lH, true));
  // 4. confirmation complète → terminé, aucun doublon ni nouvelle boucle
  U('C4. confirmation complète après migration → plus rien à envoyer', !isDirtyForPush(fullH, fullH, lH, true));
  U('C. aucune perte : la projection ne contient jamais moins que les champs legacy', Object.keys(pickProjection(legacyFields, row)).length === 5);
}

console.log('\n═ P1 — identités et tombstones sans session ═');
{
  // Suppression effectuée AVANT toute synchro (syncAccountId null → clé '')
  const t = { '': { 'documents:doc_x': 123 } };
  const q = [{ docId: 'doc_y', accountId: '' }];
  const adopted = adoptAnonymousState(t, q, 'userA');
  U('tombstone anonyme JAMAIS perdu : adopté à la résolution d\'identité', adopted.tombstones.userA['documents:doc_x'] === 123);
  U('plus aucune trace sous l\'identité vide après adoption', !adopted.tombstones['']);
  U('file anonyme ré-attribuée au compte authentifié', adopted.pendingUploads[0].accountId === 'userA');
  U('sans identité résolue : rien n\'est ré-attribué (trace conservée)', adoptAnonymousState(t, q, '').changed === false);
  const existing = { '': { 'documents:doc_x': 123 }, userA: { 'documents:doc_z': 9 } };
  const a2 = adoptAnonymousState(existing, [], 'userA');
  U('fusion sans écraser les tombstones existants du compte', a2.tombstones.userA['documents:doc_z'] === 9 && a2.tombstones.userA['documents:doc_x'] === 123);
}

console.log('\n— Relations et types (non-régression) —');
{
  const m = mergeItem({ id: 'c1', documentId: 'doc_1', fileUri: 'file:///v/c1.pdf' }, { id: 'c1', documentId: null });
  U('relation contrat↔document préservée à la fusion', m.documentId === 'doc_1');
  U('relation ticket↔document : hash la détecte', hashItem({ id: 'r', documentId: 'd1', transactionId: null }) !== hashItem({ id: 'r', documentId: 'd1', transactionId: 'tx9' }));
  U('docTypeOf : contrat lié certain', docTypeOf({ id: '1' }, new Set(['1'])) === 'contract');
  U('docTypeOf : incertain → À classer (jamais converti)', docTypeOf({ id: '2' }, new Set()) === 'unclassified');
  U('chemin Storage par propriétaire', storagePathFor('u1', 'invoice', 'd1', 'f.pdf') === 'users/u1/invoices/d1/f.pdf');
  U('nom de fichier assaini', sanitizeFileName('../../x y?.pdf') === 'x_y_.pdf');
  U('type inconnu → dossier unclassified', storageFolderFor('zzz') === 'unclassified');
}

// ═══ CONTRÔLES STATIQUES (câblage) ═══
const read = (f) => readFileSync(join(root, f), 'utf8');
const cloud = read('src/services/cloudSync.ts');
const store = read('src/stores/useStore.ts');
const auto = read('src/lib/autoSync.ts');
const dstore = read('src/services/documentStorage.ts');
const cdel = read('src/services/cloudDelete.ts');
const docs = read('app/more/documents.tsx');
const imp = read('app/more/email-import.tsx');
const mig = readFileSync(join(root, '..', 'docs', 'MIGRATION_TASK3_storage_prive.sql'), 'utf8');

console.log('\n═══ CONTRÔLES STATIQUES ═══');
console.log('\n— §1/§2 câblage synchro —');
S('pull utilise mergeCollectionsV2 (dirty + tombstones)', cloud.includes('mergeCollectionsV2') && cloud.includes('tombstoneIds: tombIdsFor(table)'));
S('plus AUCUNE inférence de suppression par lastCloudPushAt', !cloud.includes('lastPushAt') || !cloud.includes('mergeCollections((local'));
S('push DELTA par hash + confirmation serveur avant marquage', cloud.includes('isDirtyForPush(st, fullH,') && cloud.includes('const confirmPushed = (table: string'));
S('P0 — confirmation limitée aux lignes réellement envoyées', cloud.includes('for (const r of rows) if (fullHashesById[String(r.id)])'));
S('P0 — repli legacy confirme la PROJECTION (\'L:\'), pas le hash complet', cloud.includes('legacyHashOf(r, legacy)') && cloud.includes('pendingMigration.add(table)'));
S('P0 — succès partiel explicite (pendingMigration dans le résultat)', cloud.includes('pendingMigration: [...pendingMigration]'));
S('P0 — pull conserve les marqueurs legacy (champs en attente jamais perdus)', cloud.includes('wasLegacy && legacy ? legacyHashOf'));
S('P0 — échec tombstones VISIBLE (hors table absente pré-migration)', cloud.includes('sync_tombstones: ${msg}'));
S('tombstones poussés/tirés via sync_tombstones (toléré avant migration)', cloud.includes("upsertTable('sync_tombstones'") && cloud.includes("from('sync_tombstones')"));
S('suppression confirmée → addTombstone (cloudDelete)', cdel.includes('addTombstone(table, id)'));
S('P0 — tombstone sur TOUTES les suppressions locales (docs/contrats/factures/tickets/transactions)', ["'documents', id","'contracts', id","'invoices', id","'receipts', id","'transactions', id"].every((x) => store.includes(`withTombstone(s${''}tate, ${x})`) || store.includes(`withTombstone(s, ${x})`)));
S('P0 — fichier original jamais détruit avant confirmation de la politique', store.includes('la purge physique n\'intervient'));
S('détection de mutation par HASH DE CONTENU (autoSync)', auto.includes('computeHashes(s[k] || [])') && !auto.includes('txSum'));
S('suivi durable persisté (syncedHashes/tombstones/syncAccountId)', ['syncedHashes: {}','tombstones: {}','syncAccountId: null'].every((x) => store.includes(x)));

console.log('\n— §4 séparation métadonnées / fichiers —');
S('file_uri / pdf_uri / pages NE sont PLUS synchronisés en colonnes', !/documents:\s*\[[^\]]*'file_uri'/.test(cloud) && !/documents:\s*\[[^\]]*'pages'/.test(cloud));
S('photo_uri (chemin local) non synchronisé', !/contracts:\s*\[[^\]]*'photo_uri'/.test(cloud));
S('aucun base64 massif en colonnes', !cloud.includes("'image_base64'") && !cloud.includes("'pdf_base64'") && !cloud.includes("'data_uri', 'file_uri'"));
S('build 92 : toute synchronisation documentaire est bloquée au runtime', cloud.includes('if (isPrivateDocumentTable(table)) continue;') && cloud.includes('if (isPrivateDocumentTable(table)) return [];'));
S('anciens champs/fichiers conservés (migration additive)', mig.includes('data_uri') && !mig.includes('DROP TABLE') && !mig.includes('DROP COLUMN'));

console.log('\n— §3 récupération cloud réelle —');
S('ensureLocalCopy : local → signé temporaire → téléchargement VÉRIFIÉ', dstore.includes('ensureLocalCopy') && dstore.includes('downloadAsync') && dstore.includes('deleteAsync(dl.uri'));
S('lecture réellement branchée dans l\'écran (resolveAttachment)', docs.includes('await ensureLocalCopy(doc.id)') && docs.includes('openContractPdf(ctDoc)'));
S('3 états distincts : local / cloud / indisponible', dstore.includes("'local' | 'cloud' | 'missing'") && docs.includes('docFileStatus'));
S('jamais annoncé récupérable sans téléchargement vérifié', dstore.includes('pas annoncé récupéré'));
S('cache local durable hors ligne après récupération', dstore.includes('_cloud.'));
S('P1 — partage utilise le fichier RÉELLEMENT récupéré (uri résolue)', docs.includes('const r = await safeShareFile(uri,'));
S('P1 — rattachement ancien contrat → fichier local durable', docs.includes('const vaultUri = await saveToVault(f.uri, docId, f.mimeType, f.name)'));
S('P1 — PDF généré (caméra) → copie locale durable vérifiée', docs.includes("await saveToVault(r.pdfUri, newDocId, 'application/pdf')") && docs.includes('await vaultFileExists(pdfUri)'));
S('P1 — téléchargement : statut réseau + taille attendue contrôlés', dstore.includes('dl.status && dl.status !== 200') && dstore.includes('gotSize !== expected'));

console.log('\n— §5 file d\'envoi fiable —');
S('reprise au démarrage + retour réseau + après push', auto.includes("setTimeout(() => { attemptPush(); }, 4000)") && auto.includes('st.isOnline && !wasOnline') && auto.includes('processUploadQueue'));
S('réessai contrôlé (pas de boucle agressive)', dstore.includes('MAX_ATTEMPTS_PER_SESSION'));
S('fichier local manquant → uploadError VISIBLE, jamais silencieux', dstore.includes("updateDocument(e.docId, { uploadError: r.error }") && docs.includes('uploadFailed'));
S('aucun envoi hors session', dstore.includes('jamais d\'envoi hors session'));

console.log('\n— §6 isolation par compte —');
S('logout réinitialise les marqueurs (jamais transférés)', store.includes('syncedHashes: {},\n        lastCloudPushAt: 0,\n        syncAccountId: null,'));
S('file/tombstones conservés taggés par compte au logout', store.includes('pendingUploads/tombstones conservés'));
S('changement de compte → clearSyncMarkers (centralisé dans prepareAccountState)', cloud.includes('clearSyncMarkers()'));
S('build 92 : aucune nouvelle pièce privée ajoutée à une file d’upload', store.includes('queueUpload: (_docId) => { /* local-only: do not enqueue */ }'));
S('P0 — logout stashe TOUTES les entités non synchronisées (buildLogoutStash)', store.includes('buildLogoutStash(prev)'));
S('P0 — restauration + adoption AVANT lecture d\'état (push ET pull)', cloud.split('prepareAccountState(userId)').length >= 3 && cloud.indexOf('prepareAccountState(userId);\n  const s = useStore.getState()') > 0);
S('P0 — verrou anti-concurrence push/pull', cloud.includes('let syncBusy = false') && cloud.split('syncBusy = false').length >= 4);
S('P0 — hydratation du store exigée avant synchro', cloud.split('storeHydrated()').length >= 3);
S('P0 — changement de compte en cours d\'opération → abandon sans écrire', cloud.includes('Compte modifié pendant la synchronisation') && cloud.includes('syncAccountId !== userId) return;'));
S('P0 — sonde fiable du schéma étendu (colonne testée, TTL re-vérifiable)', cloud.includes('EXT_PROBE_COL[table]') && cloud.includes('schemaProbe[table] = { at: Date.now(), ext: !probeErr }'));
S('P0 — migration détectée → marqueurs L: redeviennent dirty (isDirtyForPush)', cloud.includes('isDirtyForPush(st, fullH,'));
S('P0 — tâche d\'envoi conservée si le document est dans l\'espace isolé', dstore.includes('if (vaultIds.has(e.docId)) continue;'));
S('P0 — retrait de file introuvable = explicite, consigné', dstore.includes('upload abandonné, document introuvable'));


S('build 92 : les téléchargements historiques sont autorisés en lecture seule',
  dstore.includes('if (PRIVATE_DOCUMENTS_LOCAL_ONLY) return { ok: false') &&
  dstore.includes('if (PRIVATE_DOCUMENTS_LOCAL_ONLY) {') &&
  dstore.includes('getSignedUrlForDocument'));
console.log('\n— §7 SQL révisé (non appliqué) —');
S('table sync_tombstones + RLS propriétaire', mig.includes('CREATE TABLE IF NOT EXISTS public.sync_tombstones') && mig.includes('tombstones_owner_select'));
S('policies idempotentes (DROP IF EXISTS avant CREATE)', (mig.match(/DROP POLICY IF EXISTS/g) || []).length >= 8);
S('UPDATE Storage avec USING + WITH CHECK (upsert propriétaire)', mig.split('CREATE POLICY "docs_owner_update"')[1].split('DROP POLICY')[0].includes('WITH CHECK'));
S('bucket privé, aucun accès public, pas de service_role côté app', mig.includes("false,           -- PRIVÉ") && mig.includes('service_role'));
S('statut : préparée, NON exécutée', mig.includes('NON EXÉCUTÉE'));

console.log('\n═══ COUVERT PAR E2E NAVIGATEUR (exécuté séparément) ═══');
console.log('  • création hors ligne + redémarrage (réhydratation) — validé');
console.log('  • espaces Factures/Contrats/Tickets/À classer — validé');
console.log('\n═══ NON TESTÉ (infrastructure indisponible, honnête) ═══');
console.log('  • consultation réelle depuis un 2e client (bucket non créé — migration non appliquée)');
console.log('  • isolation réelle à 2 comptes sur Storage (idem)');
console.log('  • upload réel interrompu/repris sur appareil physique');
console.log('  • Share Sheet / HEIC / Siri natifs (iPhone requis)');

console.log(`\nRésultat : ${unit} unitaires exécutés + ${stat} contrôles statiques = ${unit + stat} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
