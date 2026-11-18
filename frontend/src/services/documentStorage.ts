// ─────────────────────────────────────────────────────────────
// HISTORIQUE (<= build 91) — Supabase Storage. Build 92: upload désactivé ; récupération lecture-seule d'anciennes pièces conservée.
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
import { PRIVATE_DOCUMENTS_LOCAL_ONLY } from '../lib/documentPrivacy';
import { resolveVaultUri } from '../lib/fileVault';
import { useStore } from '../stores/useStore';
import { storagePathFor, normalizeUploadQueue, queueForAccount } from '../lib/syncMerge';

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
  // Build 92: no binary or base64 leaves the user's private vault.
  // Keeping legacy read-only recovery below protects earlier synced files.
  if (PRIVATE_DOCUMENTS_LOCAL_ONLY) return { ok: false, error: 'local-only', permanent: true };
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
// Réessai contrôlé par session (évite les boucles agressives sur une erreur
// transitoire persistante ; la file DURABLE garantit la reprise au prochain
// démarrage/retour réseau).
const attemptCount: Record<string, number> = {};
const MAX_ATTEMPTS_PER_SESSION = 5;

/**
 * File DURABLE (persistée, isolée PAR COMPTE) : traitée au démarrage (après
 * hydratation+session), au retour du réseau et après chaque push.
 *  • une pièce du compte A n'est JAMAIS envoyée sous la session du compte B ;
 *  • erreur transitoire (hors-ligne, bucket absent avant migration) →
 *    l'élément RESTE en file, réessai contrôlé ;
 *  • fichier local manquant/trop volumineux → retiré de la file MAIS le
 *    document est marqué `uploadError` (visible, jamais silencieux).
 */
export async function processUploadQueue(): Promise<{ sent: number; left: number }> {
  if (PRIVATE_DOCUMENTS_LOCAL_ONLY) {
    // Old queued uploads (from build <= 91) are cancelled locally. Nothing
    // remotely stored is deleted and no network access is performed.
    if (useStore.getState().pendingUploads.length) useStore.setState({ pendingUploads: [] });
    return { sent: 0, left: 0 };
  }
  const left = () => useStore.getState().pendingUploads.length;
  if (processing) return { sent: 0, left: left() };
  processing = true;
  let sent = 0;
  try {
    const sb = getSupabase();
    if (!sb) return { sent: 0, left: left() };
    const { data: sess } = await sb.auth.getSession();
    const uid = sess.session?.user.id;
    if (!uid) return { sent: 0, left: left() }; // jamais d'envoi hors session
    const st = useStore.getState();
    const activeIds = new Set(st.documents.map((d) => d.id));
    const vaultIds = new Set((st.accountVault[uid]?.documents || []).map((d) => d.id));
    const entries = queueForAccount(
      normalizeUploadQueue(st.pendingUploads as any[]),
      uid,
      activeIds,
    );
    for (const e of entries) {
      // P0 — document absent du store ACTIF mais présent dans l'espace isolé
      // du compte (logout/relogin en cours) : la tâche d'envoi N'EST PAS
      // supprimée, elle reprendra après restauration.
      if (!activeIds.has(e.docId)) {
        if (vaultIds.has(e.docId)) continue;
        // introuvable partout → retrait EXPLICITE (consigné, pas silencieux)
        console.warn('[documentStorage] upload abandonné, document introuvable:', e.docId);
        useStore.getState().dequeueUpload(e.docId);
        continue;
      }
      if ((attemptCount[e.docId] || 0) >= MAX_ATTEMPTS_PER_SESSION) continue;
      attemptCount[e.docId] = (attemptCount[e.docId] || 0) + 1;
      const r = await uploadDocumentToCloud(e.docId);
      if (r.ok) { sent += 1; delete attemptCount[e.docId]; continue; }
      if (r.permanent) {
        // Jamais silencieux : l'échec définitif est enregistré sur le document.
        useStore.getState().updateDocument(e.docId, { uploadError: r.error } as any);
        useStore.getState().dequeueUpload(e.docId);
        continue;
      }
      break; // transitoire → arrêt, reprise au prochain cycle (file conservée)
    }
  } finally {
    processing = false;
  }
  return { sent, left: left() };
}

// ─── Récupération cloud sur un AUTRE appareil (audit §3) ─────
export type LocalFileStatus = 'local' | 'cloud' | 'missing';

/** Statut d'affichage : fichier local / synchronisé (récupérable) / indisponible. */
export function docFileStatus(doc: { fileUri?: string; pdfUri?: string; remotePath?: string }): LocalFileStatus {
  if (doc.pdfUri || doc.fileUri) return 'local';
  if (doc.remotePath) return 'cloud';
  return 'missing';
}

/**
 * Garantit une copie LOCALE lisible du document :
 *  1. fichier local présent → retourné tel quel ;
 *  2. sinon remote_path → URL signée temporaire → téléchargement vérifié
 *     (taille > 0) dans le coffre local = cache durable hors ligne ;
 *  3. sinon → null (« indisponible », jamais annoncé récupérable sans
 *     téléchargement vérifié).
 * L'URI locale d'un AUTRE appareil n'est jamais utilisée comme chemin valide.
 */
export async function ensureLocalCopy(docId: string): Promise<{ uri: string; from: LocalFileStatus } | null> {
  const doc = useStore.getState().documents.find((d) => d.id === docId);
  if (!doc) return null;
  const priorUri = doc.pdfUri || doc.fileUri;
  const localUri = resolveVaultUri(priorUri);
  if (localUri) {
    try {
      if (Platform.OS === 'web') {
        if (localUri.startsWith('data:')) return { uri: localUri, from: 'local' };
      } else {
        const info = await FileSystem.getInfoAsync(localUri, { size: true } as any);
        if (info.exists && Number((info as any).size) > 0) {
          // Repair stale app-container UUID after iCloud device restore.
          if (localUri !== priorUri) useStore.getState().updateDocument(docId,
            (doc.pdfUri ? { pdfUri: localUri } : { fileUri: localUri }) as any);
          return { uri: localUri, from: 'local' };
        }
      }
    } catch {}
    // URI locale invalide (ex: chemin d'un autre appareil) → tentative cloud.
  }
  const remotePath = (doc as any).remotePath as string | undefined;
  if (!remotePath) return null;
  const signed = await getSignedUrlForDocument(docId, 300);
  if (!signed) return null;
  if (Platform.OS === 'web') return { uri: signed, from: 'cloud' }; // lecture directe (pas de cache durable web)
  try {
    const isPdf = (doc.mimeType || '').includes('pdf') || remotePath.toLowerCase().endsWith('.pdf');
    const ext = isPdf ? 'pdf' : (remotePath.split('.').pop() || 'bin');
    const dir = `${FileSystem.documentDirectory}vault/`;
    try { await FileSystem.makeDirectoryAsync(dir, { intermediates: true }); } catch {}
    const dest = `${dir}${docId}_cloud.${ext}`;
    const dl = await FileSystem.downloadAsync(signed, dest);
    if (dl.status && dl.status !== 200) {
      try { await FileSystem.deleteAsync(dl.uri, { idempotent: true }); } catch {}
      return null; // réponse réseau invalide
    }
    const info = await FileSystem.getInfoAsync(dl.uri, { size: true } as any);
    const gotSize = Number((info as any).size) || 0;
    if (!info.exists || gotSize === 0) {
      try { await FileSystem.deleteAsync(dl.uri, { idempotent: true }); } catch {}
      return null; // téléchargement NON vérifié → pas annoncé récupéré
    }
    // (P1 intégrité) taille attendue connue → un fichier incomplet/corrompu
    // est REFUSÉ et supprimé ; l'original local éventuel reste intouché.
    const expected = Number((doc as any).fileSize) || 0;
    if (expected > 0 && gotSize !== expected) {
      try { await FileSystem.deleteAsync(dl.uri, { idempotent: true }); } catch {}
      return null;
    }
    // Cache local durable pour la lecture hors ligne.
    useStore.getState().updateDocument(docId, (isPdf ? { pdfUri: dest } : { fileUri: dest }) as any);
    return { uri: dest, from: 'cloud' };
  } catch {
    return null;
  }
}
