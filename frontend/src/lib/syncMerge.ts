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
// Champs volatils locaux ignorés (ne doivent pas déclencher de push).
const VOLATILE_FIELDS = new Set(['synced']);

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
export function queueForAccount(entries: UploadEntry[], uid: string, localDocIds: Set<string>): UploadEntry[] {
  return (entries || []).filter((e) =>
    e.accountId === uid || (e.accountId === '' && localDocIds.has(e.docId)),
  );
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
