/**
 * Siri → Budgy 4.0 / iOS 95
 * One canonical, idempotent financial write for the native confirmation sheet.
 *
 * The App Intent NEVER writes a transaction. It only places a numeric draft in
 * the private App Group. We copy that exact number after explicit confirmation.
 * Nothing is sent to OCR, the backend or a speech parser.
 */
import { useStore } from '../stores/useStore';
import {
  isAlreadyProcessed,
  peekPendingExpenses,
  peekPendingRoute,
  refreshWidgetSnapshot,
  resolvePendingExpense,
} from './widgetBridge';

export type SiriCommitResult =
  | 'saved' | 'already' | 'unavailable' | 'unauthorized' | 'invalid';

export function swissLocalDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export async function saveConfirmedSiriExpense(
  id: string,
  editedLabel?: string,
): Promise<SiriCommitResult> {
  if (!id || id.length > 120) return 'invalid';

  const current = useStore.getState();
  if (!current.user?.id || !current.isAuthenticated || current.isLocked) {
    return 'unauthorized';
  }

  // A draft is visible only if it belongs to this user; an unscoped draft is
  // accepted ONLY on the explicit Siri route for up to 5 minutes.
  const draft = peekPendingExpenses(true).find((x) => x.id === id);
  if (!draft) return 'unavailable';
  const scope = `user:${current.user.id}`;
  const unscoped = draft.scope === 'unscoped' &&
    peekPendingRoute() === 'quick-add' &&
    Date.now() / 1000 - draft.createdAt >= 0 &&
    Date.now() / 1000 - draft.createdAt < 300;
  if (draft.scope !== scope && !unscoped) return 'unauthorized';
  if (!Number.isFinite(draft.amount) ||
      draft.amount <= 0 || draft.amount >= 1_000_000) return 'invalid';

  const transactionId = `siri_${id}`;
  if (await isAlreadyProcessed(id) ||
      useStore.getState().transactions.some((t) => t.id === transactionId)) {
    await resolvePendingExpense(id);
    return 'already';
  }

  const title = String(editedLabel ?? draft.label).trim().slice(0, 80) || 'Dépense';
  // ALWAYS positive in the store: display alone shows a negative debit.
  // The date must be LOCAL; ISO/UTC can assign a purchase after midnight
  // in Switzerland to the previous calendar day.
  useStore.getState().addTransaction({
    id: transactionId,
    title,
    amount: draft.amount,
    date: swissLocalDate(),
    category: 'other',
    type: 'expense',
    source: 'siri',
  } as any);

  // Only remove the draft after the financial store accepted the write.
  await resolvePendingExpense(id);
  void refreshWidgetSnapshot();
  return 'saved';
}
