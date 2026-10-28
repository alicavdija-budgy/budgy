/**
 * BUDGY ALERTS — synchronisation du scope avec le compte actif (Phase 4).
 *
 * Garantit qu'aucune alerte (nom de facture, info financière) d'un compte
 * ne peut apparaître dans un autre compte sur le même appareil :
 * - invité / non connecté → scope 'guest'
 * - mode démo             → scope 'demo'
 * - compte réel           → scope 'user:<id supabase>'
 *
 * Initialisé une fois au démarrage (app/_layout.tsx). S'appuie sur le store
 * utilisateur existant — aucun changement d'authentification ni de Supabase.
 */

import { useStore } from '../stores/useStore';
import { useAlertsStore } from '../stores/useAlertsStore';

export function scopeForUser(user: { id?: string; isDemo?: boolean } | null | undefined): string {
  if (!user || !user.id) return 'guest';
  if (user.isDemo) return 'demo';
  return `user:${user.id}`;
}

/** Applique le scope courant et s'abonne aux changements de compte. */
export function initAlertsScopeSync(): () => void {
  const apply = (user: any) => {
    try {
      useAlertsStore.getState().setActiveScope(scopeForUser(user));
    } catch {}
  };
  apply(useStore.getState().user);
  return useStore.subscribe((state, prev) => {
    if (state.user?.id !== prev.user?.id || state.user?.isDemo !== prev.user?.isDemo) {
      apply(state.user);
    }
  });
}
