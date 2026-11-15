// ─────────────────────────────────────────────────────────────
// TÂCHE 3 — Stockage PRIVÉ des pièces jointes dans Supabase Storage.
//  • Bucket privé `user-documents` (créé par docs/MIGRATION_TASK3_storage_prive.sql,
//    NON appliquée en production : tant que le bucket n'existe pas, l'envoi
//    échoue proprement et le fichier reste dans la file durable).
//  • Chemin : users/{uid}/{invoices|contracts|expense-receipts}/{documentId}/…
//    uid = session authentifiée (vérifié côté serveur par les policies).
//  • Accès en lecture : URLs signées TEMPORAIRES, jamais persistées.
//  • Idempotent : chemin fixe + upsert → aucune duplication après reprise.
//  • Aucun contenu de fichier n'est journalisé.
// ─────────────────────────────────────────────────────────────
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { getSupabase } from '../lib/supabase';
import { useStore } from '../stores/useStore';
import { storagePathFor } from '../lib/syncMerge';

export const DOCUMENTS_BUCKET = 'user-documents';
// Cohérent avec fileVault (8 Mo) et la limite backend (~9 Mo bruts).
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function b64ToBytes(b64: string): Uint8Array {
  const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = ABC.indexOf(clean[i]);
    const b = ABC.indexOf(clean[i + 1]);
    const c = ABC.indexOf(clean[i + 2]);
    const d = ABC.indexOf(clean[i + 3]);
    out[p++] = (a << 2) | (b >> 4);
    if (c >= 0) out[p++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[p++] = ((c & 3) << 6) | d;
  }
  return out.slice(0, p);
}

function extFor(mime?: string, uri?: string): string {
  const m = (mime || '').toLowerCase();
  if (m.includes('pdf')) return 'pdf';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('heic') || m.includes('heif')) return 'heic';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  const fromUri = (uri || '').split('?')[0].split('.').pop() || '';
  return /^[a-z0-9]{2,5}$/i.test(fromUri) ? fromUri.toLowerCase() : 'bin';
}

export type UploadResult = { ok: boolean; error?: string; permanent?: boolean };

/**
 * Envoie la pièce locale d'un document vers le stockage privé.
 * Ne marque remotePath/remoteUploadedAt QU'APRÈS confirmation du serveur :
 * aucune « copie cloud » n'est annoncée avant d'exister réellement.
 */
export async function uploadDocumentToCloud(docId: string): Promise<UploadResult> {
  const s = useStore.getState();
  const doc = s.documents.find((d) => d.id === docId);
  if (!doc) return { ok: false, error: 'not-found', permanent: true };
  const localUri = doc.pdfUri || doc.fileUri;
  if (!localUri) return { ok: false, error: 'no-file', permanent: true };

  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'supabase-unavailable' };
  const { data: sess } = await sb.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) return { ok: false, error: 'signed-out' };

  const path = storagePathFor(uid, doc.documentType, doc.id, `file.${extFor(doc.mimeType, localUri)}`);

  let body: ArrayBuffer | Blob;
  let size: number;
  try {
    if (Platform.OS === 'web') {
      const resp = await fetch(localUri);
      const blob = await resp.blob();
      body = blob;
      size = blob.size;
    } else {
      const info = await FileSystem.getInfoAsync(localUri, { size: true } as any);
      if (!info.exists || !(info as any).size) return { ok: false, error: 'local-missing', permanent: true };
      size = Number((info as any).size) || 0;
      if (size > MAX_UPLOAD_BYTES) return { ok: false, error: 'too-large', permanent: true };
      const b64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
      const bytes = b64ToBytes(b64);
      if (bytes.byteLength === 0) return { ok: false, error: 'local-empty', permanent: true };
      body = bytes.buffer as ArrayBuffer;
    }
  } catch {
    return { ok: false, error: 'read-failed' };
  }
  if (size > MAX_UPLOAD_BYTES) return { ok: false, error: 'too-large', permanent: true };

  const { error } = await sb.storage.from(DOCUMENTS_BUCKET).upload(path, body, {
    contentType: doc.mimeType || 'application/octet-stream',
    upsert: true, // idempotent : reprise après interruption sans doublon
  });
  if (error) return { ok: false, error: error.message }; // jamais de contenu dans les logs

  useStore.getState().updateDocument(doc.id, {
    remotePath: path,
    remoteUploadedAt: Date.now(),
    fileSize: size,
  } as any);
  useStore.getState().dequeueUpload(doc.id);
  return { ok: true };
}

/** URL signée TEMPORAIRE (jamais stockée comme référence permanente). */
export async function getSignedUrlForDocument(docId: string, expiresInSec = 300): Promise<string | null> {
  const doc = useStore.getState().documents.find((d) => d.id === docId);
  const remotePath = (doc as any)?.remotePath as string | undefined;
  if (!doc || !remotePath) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.storage.from(DOCUMENTS_BUCKET).createSignedUrl(remotePath, expiresInSec);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

let processing = false;

/**
 * File DURABLE (persistée dans le store) : traitée après chaque push et à la
 * reconnexion. Erreurs transitoires (hors-ligne, bucket absent avant
 * migration) → l'élément RESTE en file et sera retenté ; erreurs définitives
 * (fichier local disparu, trop volumineux) → retiré proprement.
 */
export async function processUploadQueue(): Promise<{ sent: number; left: number }> {
  if (processing) return { sent: 0, left: useStore.getState().pendingUploads.length };
  processing = true;
  let sent = 0;
  try {
    const ids = [...useStore.getState().pendingUploads];
    for (const id of ids) {
      const r = await uploadDocumentToCloud(id);
      if (r.ok) { sent += 1; continue; }
      if (r.permanent) { useStore.getState().dequeueUpload(id); continue; }
      break; // transitoire → on s'arrête, reprise au prochain cycle
    }
  } finally {
    processing = false;
  }
  return { sent, left: useStore.getState().pendingUploads.length };
}
