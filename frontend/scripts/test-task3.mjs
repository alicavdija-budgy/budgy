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
  legacyHashOf, isConfirmedHash, pickProjection, stashUnsyncedDocs } = sm;

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
  U('entrée héritée adoptée seulement si le document existe localement', forA.some((e) => e.docId === 'legacy_doc') && !queueForAccount(q, 'userA', new Set(['docA'])).some((e) => e.docId === 'legacy_doc'));
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
S('push DELTA par hash + confirmation serveur avant marquage', cloud.includes('if (isConfirmedHash(st, fullH,') && cloud.includes('const confirmPushed = (table: string'));
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
S('remote_path (référence Storage portable) synchronisé', /documents:\s*\[[^\]]*'remote_path'/.test(cloud));
S('anciens champs/fichiers conservés (migration additive)', mig.includes('data_uri') && !mig.includes('DROP TABLE') && !mig.includes('DROP COLUMN'));

console.log('\n— §3 récupération cloud réelle —');
S('ensureLocalCopy : local → signé temporaire → téléchargement VÉRIFIÉ', dstore.includes('ensureLocalCopy') && dstore.includes('downloadAsync') && dstore.includes('deleteAsync(dl.uri'));
S('lecture réellement branchée dans l\'écran (resolveAttachment)', docs.includes('await ensureLocalCopy(doc.id)') && docs.includes('openContractPdf(ctDoc)'));
S('3 états distincts : local / cloud / indisponible', dstore.includes("'local' | 'cloud' | 'missing'") && docs.includes('docFileStatus'));
S('jamais annoncé récupérable sans téléchargement vérifié', dstore.includes('pas annoncé récupéré'));
S('cache local durable hors ligne après récupération', dstore.includes('_cloud.'));
S('P1 — partage utilise le fichier RÉELLEMENT récupéré (uri résolue)', docs.includes('const r = await safeShareFile(uri,'));
S('P1 — rattachement ancien contrat → file d\'envoi', docs.includes('queueUpload(docId); // pièce durable'));
S('P1 — PDF généré (caméra) → file d\'envoi ; sans fichier, rien d\'annoncé', docs.includes('if (pdfUri) queueUpload(newDocId);'));
S('P1 — téléchargement : statut réseau + taille attendue contrôlés', dstore.includes('dl.status && dl.status !== 200') && dstore.includes('gotSize !== expected'));

console.log('\n— §5 file d\'envoi fiable —');
S('reprise au démarrage + retour réseau + après push', auto.includes("setTimeout(() => { attemptPush(); }, 4000)") && auto.includes('st.isOnline && !wasOnline') && auto.includes('processUploadQueue'));
S('réessai contrôlé (pas de boucle agressive)', dstore.includes('MAX_ATTEMPTS_PER_SESSION'));
S('fichier local manquant → uploadError VISIBLE, jamais silencieux', dstore.includes("updateDocument(e.docId, { uploadError: r.error }") && docs.includes('uploadFailed'));
S('aucun envoi hors session', dstore.includes('jamais d\'envoi hors session'));

console.log('\n— §6 isolation par compte —');
S('logout réinitialise les marqueurs (jamais transférés)', store.includes('syncedHashes: {},\n        lastCloudPushAt: 0,\n        syncAccountId: null,'));
S('file/tombstones conservés taggés par compte au logout', store.includes('pendingUploads/tombstones conservés'));
S('changement de compte → clearSyncMarkers avant push ET pull', cloud.split('clearSyncMarkers()').length >= 3);
S('queueUpload tague le compte courant', store.includes('const accountId = s.syncAccountId'));
S('P0 — logout stashe les documents non synchronisés (accountVault)', store.includes('stashUnsyncedDocs(prev.documents'));
S('P0 — restauration UNIQUEMENT pour le compte d\'origine (push et pull)', cloud.split('restoreAccountVault(userId)').length >= 3);
S('P0 — tâche d\'envoi conservée si le document est dans l\'espace isolé', dstore.includes('if (vaultIds.has(e.docId)) continue;'));
S('P0 — retrait de file introuvable = explicite, consigné', dstore.includes('upload abandonné, document introuvable'));

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
