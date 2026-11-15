// ─────────────────────────────────────────────────────────────
// TÂCHE 3 (audit) — Synchronisation SANS PERTE, v2.
// Fonctions PURES (aucune dépendance RN/Supabase) : exécutées telles
// quelles par Node dans scripts/test-task3.mjs (vrais tests de comportement).
//
// Principes (déterministes, documentés) :
//  • SUIVI DURABLE : `syncedHashes` (persisté) contient le hash de la
//    dernière version de chaque élément CONFIRMÉE par le serveur.
//    dirty = hash local ≠ hash confirmé → modification non synchronisée.
//  • CONFLIT : un élément local « dirty » GAGNE TOUJOURS sur le cloud
//    (sa version sera poussée ensuite) ; un élément propre est mis à
//    jour champ par champ, un champ NULL/absent côté cloud n'écrasant
//    JAMAIS une valeur locale.
//  • SUPPRESSION : JAMAIS déduite de l'absence dans une réponse cloud.
//    Seuls des TOMBSTONES explicites (suppression confirmée) suppriment
//    ou empêchent la résurrection d'un élément.
//  • Aucune dépendance aux horloges des appareils pour décider d'une
//    suppression ou d'un conflit (les hashes remplacent lastPushAt).
// ─────────────────────────────────────────────────────────────

export type BudgyDocumentType = 'invoice' | 'contract' | 'expense_receipt' | 'unclassified';

type Row = Record<string, any> & { id?: string };

// ─── Hash stable de contenu ──────────────────────────────────
// (P1 performances/intégrité) Champs LOCAUX ou BINAIRES ignorés : ils ne
// sont jamais synchronisés en colonnes, ne doivent donc ni déclencher de
// push, ni être recalculés (base64 volumineux) à chaque mutation du store.
const VOLATILE_FIELDS = new Set([
  'synced',          // marqueur local
  'uploadError',     // état local d'envoi
  'imageBase64',     // binaires → jamais en colonnes SQL
  'pdfBase64',
  'pages',
  'fileUri',         // chemins locaux propres à l'appareil
  'pdfUri',
  'photoUri',
]);

export function stableStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined && !VOLATILE_FIELDS.has(k)).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** Hash djb2 du contenu — détecte renommages, catégories, liens, dates… */
export function hashItem(obj: any): string {
  const str = stableStringify(obj);
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + ':' + str.length.toString(36);
}

export function computeHashes(items: Row[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const it of items || []) if (it && it.id) out[String(it.id)] = hashItem(it);
  return out;
}

/** Éléments créés/modifiés localement et non encore confirmés par le serveur. */
export function diffDirty(items: Row[], syncedHashes: Record<string, string> | undefined):
  { dirtyIds: Set<string>; hashes: Record<string, string> } {
  const hashes = computeHashes(items);
  const synced = syncedHashes || {};
  const dirtyIds = new Set<string>();
  for (const id of Object.keys(hashes)) if (hashes[id] !== synced[id]) dirtyIds.add(id);
  return { dirtyIds, hashes };
}

// ─── Repli « legacy » avant migration (P0) ───────────────────
// Quand seules les anciennes colonnes sont acceptées par le serveur, on ne
// confirme QUE ce qui a réellement été envoyé : hash de la PROJECTION
// legacy, préfixé 'L:'. Les champs étendus restent explicitement « en
// attente de migration » et partiront après la migration additive, sans
// boucle de push infinie (la projection inchangée n'est pas re-poussée).
export function pickProjection(allowed: string[], row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of allowed) if (row[f] !== undefined) out[f] = row[f];
  return out;
}

export function legacyHashOf(snakeRow: Record<string, any>, legacyFields: string[]): string {
  return 'L:' + hashItem(pickProjection(legacyFields, snakeRow));
}

/** Un élément est « propre » si sa version complète OU sa projection legacy a été confirmée. */
export function isConfirmedHash(stored: string | undefined, fullHash: string, legacyHash?: string | null): boolean {
  if (!stored) return false;
  if (stored === fullHash) return true;
  return !!legacyHash && stored === legacyHash;
}

// ─── Espace local isolé par compte (P0 — logout) ─────────────
/**
 * Documents dont les métadonnées ne sont PAS confirmées par le serveur :
 * ils doivent être mis de côté (accountVault) au logout, jamais détruits.
 */
export function stashUnsyncedDocs<T extends Row>(documents: T[], confirmedHashes: Record<string, string> | undefined): T[] {
  const { dirtyIds } = diffDirty(documents || [], confirmedHashes);
  return (documents || []).filter((d) => d.id && dirtyIds.has(String(d.id)));
}

// ─── Espace isolé par compte : TOUTES les entités (P0) ───────
// Un contrat/facture/ticket/transaction non confirmé ne doit pas disparaître
// au logout alors que son PDF survit : on stashe TOUTES les entités non
// synchronisées et leurs relations, plus les marqueurs associés.
export const STASHED_COLLECTIONS = ['documents', 'contracts', 'invoices', 'receipts', 'transactions'] as const;
const STASH_TABLE: Record<string, string> = {
  documents: 'documents', contracts: 'contracts', invoices: 'invoices',
  receipts: 'receipts', transactions: 'transactions',
};

/**
 * Construit le nouvel accountVault au logout. uid vide ('') = première
 * synchronisation jamais réussie / hors session : trace durable ANONYME,
 * isolée, adoptée par le premier compte qui s'authentifie sur CET appareil
 * (résolution d'identité déterministe et documentée) — jamais perdue.
 */
export function buildLogoutStash(prev: any): Record<string, any> {
  const uid = prev.syncAccountId || '';
  const hashes = prev.syncedHashes || {};
  const entry: any = { savedAt: Date.now(), syncedHashes: hashes };
  let hasData = false;
  for (const key of STASHED_COLLECTIONS) {
    const unsynced = stashUnsyncedDocs(prev[key] || [], hashes[STASH_TABLE[key]]);
    entry[key] = unsynced;
    if (unsynced.length > 0) hasData = true;
  }
  if (!hasData) return prev.accountVault || {};
  return { ...(prev.accountVault || {}), [uid]: entry };
}

/**
 * Restaure l'espace isolé du compte authentifié + l'espace anonyme ''
 * (identité désormais résolue). Retourne null si rien à restaurer.
 * Les éléments existants ne sont jamais écrasés (dédupliqué par id) et les
 * marqueurs courants gardent priorité : rien n'est marqué synchronisé à tort.
 */
export function applyAccountRestore(state: any, uid: string): Record<string, any> | null {
  const vault = state.accountVault || {};
  // SÉCURITÉ (préalable Tâche 5) : SEUL l'espace du compte propriétaire est
  // restauré. Les données anonymes/invitées ('') restent isolées et ne sont
  // JAMAIS attribuées automatiquement au premier compte connecté — import
  // uniquement via l'action EXPLICITE importGuestData().
  const sources = [vault[uid]].filter(Boolean) as any[];
  if (sources.length === 0) return null;
  const updates: any = {};
  for (const key of STASHED_COLLECTIONS) {
    const existingIds = new Set((state[key] || []).map((x: any) => String(x.id)));
    const restored: any[] = [];
    for (const src of sources) {
      for (const it of src[key] || []) {
        if (it && it.id && !existingIds.has(String(it.id))) { restored.push(it); existingIds.add(String(it.id)); }
      }
    }
    if (restored.length > 0) updates[key] = [...restored, ...(state[key] || [])];
  }
  const mergedHashes: any = { ...(state.syncedHashes || {}) };
  for (const src of sources) {
    const h = src.syncedHashes || {};
    for (const t of Object.keys(h)) mergedHashes[t] = { ...(h[t] || {}), ...(mergedHashes[t] || {}) };
  }
  updates.syncedHashes = mergedHashes;
  const rest = { ...vault };
  delete rest[uid]; // l'espace anonyme '' est CONSERVÉ, jamais consommé ici
  updates.accountVault = rest;
  return updates;
}

/**
 * SÉCURITÉ (préalable Tâche 5) — cette fonction n'est PLUS appelée
 * automatiquement par la synchronisation : elle n'est exécutée que par
 * l'action EXPLICITE et volontaire de l'utilisateur (importGuestData).
 * Les traces anonymes ('') restent durables, isolées et récupérables tant
 * que l'utilisateur n'a pas confirmé l'import — jamais perdues, jamais
 * envoyées sous une identité vide, jamais attribuées en aveugle.
 */
export function adoptAnonymousState(
  tombstones: Record<string, Record<string, number>> | undefined,
  pendingUploads: any[] | undefined,
  uid: string,
): { tombstones: Record<string, Record<string, number>>; pendingUploads: UploadEntry[]; changed: boolean } {
  const t = tombstones || {};
  const q = normalizeUploadQueue(pendingUploads || []);
  if (!uid) return { tombstones: t, pendingUploads: q, changed: false };
  let changed = false;
  let outT = t;
  const anon = t[''] || {};
  if (Object.keys(anon).length > 0) {
    const cur = t[uid] || {};
    const { ['']: _drop, ...rest } = t;
    outT = { ...rest, [uid]: { ...anon, ...cur } };
    changed = true;
  }
  const outQ = q.map((e) => {
    if (e.accountId === '') { changed = true; return { ...e, accountId: uid }; }
    return e;
  });
  return { tombstones: outT, pendingUploads: outQ, changed };
}

/**
 * P0 — décision de push : une confirmation 'L:' reste valable tant que le
 * schéma étendu n'est PAS disponible ; dès qu'il l'est (sonde fiable), les
 * éléments 'L:' redeviennent dirty et leurs métadonnées en attente partent.
 */
export function isDirtyForPush(
  stored: string | undefined,
  fullHash: string,
  legacyHash: string | null,
  extendedSchemaAvailable: boolean,
): boolean {
  if (!stored) return true;
  if (stored === fullHash) return false;
  if (stored.startsWith('L:')) {
    if (extendedSchemaAvailable) return true; // migration dispo → envoyer les champs en attente
    return legacyHash ? stored !== legacyHash : true;
  }
  return true;
}

// ─── Tombstones (suppressions EXPLICITEMENT confirmées) ──────
export function tombstoneKey(table: string, id: string): string {
  return `${table}:${id}`;
}

// ─── Fusion pull SANS PERTE ──────────────────────────────────
/** Le distant gagne champ par champ, sauf NULL/absent : le local est préservé. */
export function mergeItem<T extends Row>(local: T, remote: T): T {
  const out: any = { ...local };
  for (const k of Object.keys(remote)) {
    const v = (remote as any)[k];
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out as T;
}

export function mergeCollectionsV2<T extends Row>(
  local: T[],
  remote: T[],
  opts: { dirtyIds: Set<string>; tombstoneIds: Set<string> },
): { merged: T[]; preservedLocal: number; protectedDirty: number; removedByTombstone: number } {
  const { dirtyIds, tombstoneIds } = opts;
  const localById = new Map<string, T>();
  for (const l of local || []) if (l && l.id) localById.set(String(l.id), l);
  const remoteIds = new Set<string>();

  let protectedDirty = 0;
  let removedByTombstone = 0;
  const merged: T[] = [];

  for (const r of remote || []) {
    const id = String(r.id);
    remoteIds.add(id);
    if (tombstoneIds.has(id)) { removedByTombstone++; continue; } // pas de résurrection
    const l = localById.get(id);
    if (!l) { merged.push(r); continue; }
    if (dirtyIds.has(id)) { merged.push(l); protectedDirty++; continue; } // local non confirmé → GAGNE
    merged.push(mergeItem(l, r));
  }

  // Éléments UNIQUEMENT locaux : TOUJOURS conservés (absence ≠ suppression),
  // sauf tombstone explicite (suppression confirmée appliquée localement).
  let preservedLocal = 0;
  const kept: T[] = [];
  for (const l of local || []) {
    if (!l || !l.id || remoteIds.has(String(l.id))) continue;
    if (tombstoneIds.has(String(l.id))) { removedByTombstone++; continue; }
    kept.push(l);
    preservedLocal++;
  }
  return { merged: [...kept, ...merged], preservedLocal, protectedDirty, removedByTombstone };
}

// ─── File d'envoi des pièces jointes (isolée par compte) ─────
export type UploadEntry = { docId: string; accountId: string };

/** Compatibilité : anciennes entrées `string` → entrée non attribuée (''). */
export function normalizeUploadQueue(raw: any[]): UploadEntry[] {
  const out: UploadEntry[] = [];
  for (const e of raw || []) {
    if (typeof e === 'string') out.push({ docId: e, accountId: '' });
    else if (e && typeof e.docId === 'string') out.push({ docId: e.docId, accountId: e.accountId || '' });
  }
  return out;
}

/**
 * Une pièce du compte A n'est JAMAIS envoyée sous la session du compte B.
 * Les entrées héritées sans compte ('') sont adoptées par le compte courant
 * UNIQUEMENT si le document existe encore localement (appareil mono-compte
 * d'avant le correctif) — comportement documenté et déterministe.
 */
export function queueForAccount(entries: UploadEntry[], uid: string, _localDocIds: Set<string>): UploadEntry[] {
  // STRICT : une entrée sans propriétaire ('') n'est JAMAIS envoyée sous une
  // session — elle attend l'import explicite (importGuestData).
  return (entries || []).filter((e) => e.accountId === uid);
}

// ─── Types documentaires (Factures / Contrats / Tickets) ─────
const VALID_TYPES: BudgyDocumentType[] = ['invoice', 'contract', 'expense_receipt', 'unclassified'];

/**
 * Type documentaire d'un document.
 *  • champ explicite → prioritaire ;
 *  • lié à un contrat (documentId) → 'contract' (certain) ;
 *  • ancien document au type incertain → 'unclassified' (« À classer »),
 *    jamais converti automatiquement.
 */
export function docTypeOf(
  doc: { id?: string; documentType?: string | null },
  linkedContractDocIds: Set<string> | string[],
): BudgyDocumentType {
  const explicit = (doc.documentType || '') as BudgyDocumentType;
  if (VALID_TYPES.includes(explicit)) return explicit;
  const set = linkedContractDocIds instanceof Set ? linkedContractDocIds : new Set(linkedContractDocIds);
  if (doc.id && set.has(doc.id)) return 'contract';
  return 'unclassified';
}

// ─── Chemins du stockage privé Supabase ──────────────────────
const TYPE_FOLDER: Record<BudgyDocumentType, string> = {
  invoice: 'invoices',
  contract: 'contracts',
  expense_receipt: 'expense-receipts',
  unclassified: 'unclassified',
};

export function storageFolderFor(type: string | undefined | null): string {
  return TYPE_FOLDER[(type as BudgyDocumentType) || 'unclassified'] || 'unclassified';
}

export function sanitizeFileName(name: string): string {
  const base = (name || 'file').split('/').pop() || 'file';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_{2,}/g, '_').slice(0, 80);
  return cleaned || 'file';
}

/** users/{uid}/{invoices|contracts|expense-receipts}/{documentId}/{fichier} */
export function storagePathFor(uid: string, type: string | undefined, documentId: string, fileName: string): string {
  if (!uid || !documentId) throw new Error('storagePathFor: uid et documentId requis');
  return `users/${uid}/${storageFolderFor(type)}/${documentId}/${sanitizeFileName(fileName)}`;
}
