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
import { pushAllToCloud } from '../services/cloudSync';

const TAG = '[auto-sync]';
const DEBOUNCE_MS = 4000;

let scheduled: any = null;
let lastPush = 0;
let lastSnapshot = '';
let started = false;

/**
 * Hash léger des collections suivies — détecte une vraie mutation.
 * On évite de checker l'objet entier (preferences peuvent changer souvent
 * pour des champs non synchronisés comme `theme`).
 */
function buildSnapshot(s: any): string {
  return JSON.stringify({
    tx: s.transactions?.length || 0,
    pro: s.proExpenses?.length || 0,
    inc: s.incomes?.length || 0,
    sav: s.savingsGoals?.length || 0,
    bud: s.budgets?.length || 0,
    rec: s.recurringExpenses?.length || 0,
    ctr: s.contracts?.length || 0,
    deb: s.debts?.length || 0,
    inv: s.investments?.length || 0,
    rcp: s.receipts?.length || 0,
    invo: s.invoices?.length || 0,
    doc: s.documents?.length || 0,
    grp: s.groups?.length || 0,
    grpE: s.groupExpenses?.length || 0,
    // Aussi : sommes des amounts pour détecter UPDATE (pas juste add/delete)
    txSum: (s.transactions || []).reduce((a: number, t: any) => a + (t.amount || 0), 0),
    incSum: (s.incomes || []).reduce((a: number, i: any) => a + (i.amount || 0), 0),
    savSum: (s.savingsGoals || []).reduce((a: number, g: any) => a + (g.saved || 0), 0),
    debSum: (s.debts || []).reduce((a: number, d: any) => a + (d.paid || 0), 0),
    recSum: (s.recurringExpenses || []).reduce((a: number, r: any) => a + (r.amount || 0), 0),
  });
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
  if (scheduled) {
    clearTimeout(scheduled);
    scheduled = null;
  }
  await attemptPush();
}
