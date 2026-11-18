/**
 * Budgy build 92 — ownership of private documents.
 *
 * PDFs, photos, scanned tickets, QR payloads and their private metadata must
 * stay on the user's device / personally chosen Apple storage, NOT in the
 * Budgy-hosted Supabase database or Storage bucket.
 *
 * A document's attachment and record are both local; sync of other financial
 * records remains a separate feature with its own privacy disclosures.
 *
 * iOS backs up eligible app Documents via device iCloud Backup if enabled.
 * Saving to iCloud Drive is an EXPLICIT user action via the iOS Files share
 * sheet. iCloud Backup and iCloud Drive are different Apple services.
 *
 * No deletion of previously uploaded server data is attempted here.
 */
export const PRIVATE_DOCUMENTS_LOCAL_ONLY = true as const;
export const PRIVATE_DOCUMENT_TABLES = [
  'documents',
  'invoices',
  'contracts',
  'receipts',
] as const;

export function isPrivateDocumentTable(table: string): boolean {
  return (PRIVATE_DOCUMENT_TABLES as readonly string[]).includes(table);
}

/** Tombstones for documents must never be transmitted to Budgy cloud. */
export function isPrivateDocumentTombstone(key: string): boolean {
  const table = key.split(':', 1)[0];
  return isPrivateDocumentTable(table);
}
