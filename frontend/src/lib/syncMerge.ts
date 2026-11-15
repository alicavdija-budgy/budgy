// ─────────────────────────────────────────────────────────────
// TÂCHE 3 — Fusion de synchronisation SANS PERTE + types documentaires.
// Fonctions PURES (aucune dépendance RN/Supabase) : testables en vrai
// via Node (exécution réelle dans scripts/test-task3.mjs).
//
// Stratégie de conflit EXPLICITE :
//  • élément présent des deux côtés → le cloud gagne champ par champ,
//    MAIS un champ absent/NULL côté cloud n'écrase JAMAIS une valeur
//    locale (ex: file_uri avant migration, pièces locales non migrées) ;
//  • élément UNIQUEMENT local → conservé s'il est plus récent que le
//    dernier push COMPLET réussi (jamais écrasé par un pull), supprimé
//    seulement s'il avait déjà été poussé (= suppression distante) ;
//  • lastPushAt = 0 (jamais poussé) → TOUT le local est conservé.
// ─────────────────────────────────────────────────────────────

export type BudgyDocumentType = 'invoice' | 'contract' | 'expense_receipt' | 'unclassified';

// Marge de sécurité : un élément créé juste avant le push est considéré
// comme potentiellement non poussé (horloges/debounce).
const PUSH_MARGIN_MS = 60_000;

type Row = Record<string, any> & { id?: string; createdAt?: number; updatedAt?: number };

/** Le distant gagne, sauf quand il est null/undefined : le local est préservé. */
export function mergeItem<T extends Row>(local: T, remote: T): T {
  const out: any = { ...local };
  for (const k of Object.keys(remote)) {
    const v = (remote as any)[k];
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out as T;
}

function itemTs(it: Row): number {
  return Math.max(Number(it.updatedAt) || 0, Number(it.createdAt) || 0);
}

export function mergeCollections<T extends Row>(
  local: T[],
  remote: T[],
  lastPushAt: number,
): { merged: T[]; preservedLocal: number } {
  const localById = new Map<string, T>();
  for (const l of local || []) if (l && l.id) localById.set(String(l.id), l);
  const remoteIds = new Set<string>();

  const merged: T[] = (remote || []).map((r) => {
    const id = String(r.id);
    remoteIds.add(id);
    const l = localById.get(id);
    return l ? mergeItem(l, r) : r;
  });

  let preservedLocal = 0;
  const kept: T[] = [];
  for (const l of local || []) {
    if (!l || !l.id || remoteIds.has(String(l.id))) continue;
    const neverPushed = !lastPushAt || lastPushAt <= 0;
    const newerThanPush = itemTs(l) > lastPushAt - PUSH_MARGIN_MS;
    if (neverPushed || newerThanPush) {
      kept.push(l);
      preservedLocal += 1;
    }
    // sinon : déjà poussé puis absent du cloud → suppression distante assumée
  }
  return { merged: [...kept, ...merged], preservedLocal };
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
