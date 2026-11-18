/**
 * BUDGY — Auto-sync subscriber (v3.7.28)
 *
 * Problème résolu :
 *   Le push cloud n'arrivait jusque-là QUE quand l'app passait en background
 *   (event AppState 'background') ou au logout. Si l'utilisateur ajoutait
 *   une donnée puis force-quit l'app avant que iOS n'ait suspendu le bridge,
 *   la donnée n'était JAMAIS poussée sur Supabase → perdue à la reconnexion.
 *
 * Solution :
 *   Subscriber Zustand qui observe TOUTES les collections persistées et,
 *   à chaque mutation, programme un push debounced de 4 s. Ce push :
 *   - ne tourne que si l'utilisateur est connecté (Supabase session)
 *   - ne tourne que si en ligne
 *   - log les erreurs RLS clairement en mode DEV
 *
 * Démarrage : appelé une seule fois depuis app/_layout.tsx au bootstrap.
 */

import { AppState } from 'react-native';
import { useStore } from '../stores/useStore';
import { getSupabase, isSupabaseConfigured } from './supabase';
import { pushAllToCloud, resetSchemaProbes } from '../services/cloudSync';
import { computeHashes } from './syncMerge';

const TAG = '[auto-sync]';
const DEBOUNCE_MS = 4000;

let scheduled: any = null;
let lastPush = 0;
let lastSnapshot = '';
let started = false;

/**
 * TÂCHE 3 (audit §2) — détection FIABLE des mutations : hash de CONTENU de
 * chaque élément synchronisé (computeHashes), pas seulement compteurs/sommes.
 * Détecte renommages, dates, catégories, liens documentaires, pièces jointes…
 */
function buildSnapshot(s: any): string {
  // Build 92: private documents (and their record metadata) never trigger
  // Budgy Cloud synchronization. Other finance collections remain unchanged.
  const keys = ['transactions','incomes','savingsGoals','budgets','recurringExpenses',
    'debts','investments','groups','groupExpenses'];
  const parts: string[] = [];
  for (const k of keys) {
    const h = computeHashes(s[k] || []);
    parts.push(k + '=' + Object.keys(h).sort().map((id) => id + h[id]).join('|'));
  }
  // Document upload queue was retired; ignore legacy pending entries.
  return parts.join(';');
}

async function attemptPush() {
  scheduled = null;
  try {
    if (!isSupabaseConfigured()) return;
    const sb = getSupabase();
    if (!sb) return;
    const { data } = await sb.auth.getSession();
    if (!data.session?.user?.id) return;
    if (!useStore.getState().isOnline) {
      if (__DEV__) console.log(`${TAG} skipped (offline) — will retry on next mutation`);
      return;
    }
    if (Date.now() - lastPush < 1500) return; // anti-burst
    const r = await pushAllToCloud();
    lastPush = Date.now();
    // TÂCHE 3 — file durable des pièces jointes : traitée après chaque push
    // (idempotente ; en cas d'échec transitoire, le fichier reste en file).
    try {
      const { processUploadQueue } = await import('../services/documentStorage');
      processUploadQueue().catch(() => {});
    } catch {}
    if (__DEV__) {
      if (r.ok) {
        console.log(`${TAG} pushed ${r.pushed} items`);
      } else {
        console.warn(`${TAG} push failed:`, r.error);
      }
    }
  } catch (e: any) {
    if (__DEV__) console.warn(`${TAG} fatal:`, e?.message || e);
  }
}

/**
 * Démarre l'auto-sync. Idempotent (un seul subscriber).
 */
export function startAutoSync() {
  if (started) return;
  started = true;

  // Snapshot initial pour ne pas push immédiatement au boot
  lastSnapshot = buildSnapshot(useStore.getState());

  // TÂCHE 3 (audit §5) — REPRISE au démarrage : file d'envoi + éléments
  // « dirty » traités après hydratation du store et présence d'une session.
  setTimeout(() => { attemptPush(); }, 4000);
  // SÉCURITÉ — identité propriétaire mémorisée dès la session connue (même
  // hors ligne) : un logout avant la 1re synchro stashe sous le BON compte.
  setTimeout(async () => {
    try {
      const { getSupabase } = await import('./supabase');
      const sb = getSupabase();
      if (!sb) return;
      const { data } = await sb.auth.getSession();
      const uid = data.session?.user.id;
      if (uid && !useStore.getState().syncAccountId) useStore.getState().setSyncAccountId(uid);
    } catch {}
  }, 1500);
  // Retour du réseau → reprise immédiate.
  let wasOnline = useStore.getState().isOnline;
  useStore.subscribe((st) => {
    if (st.isOnline && !wasOnline) {
      wasOnline = true;
      resetSchemaProbes(); // reconnexion → re-vérification contrôlée du schéma
      attemptPush();
    } else if (!st.isOnline) {
      wasOnline = false;
    }
  });

  useStore.subscribe((state) => {
    const snap = buildSnapshot(state);
    if (snap === lastSnapshot) return;
    lastSnapshot = snap;

    // Schedule debounced push
    if (scheduled) clearTimeout(scheduled);
    scheduled = setTimeout(attemptPush, DEBOUNCE_MS);
  });

  // Quand l'app reprend la main, si un push était en attente, on l'exécute
  // immédiatement (au cas où l'app a été mise en background avant le debounce)
  AppState.addEventListener('change', (s) => {
    if (s === 'active' && scheduled) {
      clearTimeout(scheduled);
      attemptPush();
    }
  });

  if (__DEV__) console.log(`${TAG} started — debounce ${DEBOUNCE_MS}ms`);
}

/** Force un push immédiat — utile au logout. Ne throw pas. */
export async function forcePushNow() {
  resetSchemaProbes(); // synchro manuelle → re-vérification contrôlée du schéma
  if (scheduled) {
    clearTimeout(scheduled);
    scheduled = null;
  }
  await attemptPush();
}
