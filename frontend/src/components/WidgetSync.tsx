/**
 * BUDGY — Synchronisation des widgets iOS et de Siri.
 * Monté une fois dans le layout racine. Sans UI.
 *
 * - Republie l'instantané du widget quand les données changent réellement
 *   (transactions, revenus, factures, objectifs, charges, compte) ou au
 *   retour au premier plan (debounce, respect des limites WidgetKit).
 * - Consomme la route demandée par Siri / le widget et la file des dépenses
 *   dictées (une à la fois, via le formulaire de confirmation /quick-add).
 */
import { useEffect, useRef, useState } from 'react';
import {
  Alert, AppState, KeyboardAvoidingView, Modal, Platform, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../hooks/useTranslation';
import { useRouter, useRootNavigationState } from 'expo-router';
import { useStore } from '../stores/useStore';
import { useAlertsStore } from '../stores/useAlertsStore';
import {
  widgetBridgeAvailable, refreshWidgetSnapshot, peekPendingRoute, popPendingRoute,
  peekPendingExpenses, resolvePendingExpense, type PendingExpense,
} from '../services/widgetBridge';
import { saveConfirmedSiriExpense } from '../services/saveSiriExpense';

const ROUTES: Record<string, string> = {
  'home': '/',
  'quick-add': '/quick-add',
  'scanner-modal': '/scanner-modal',
  // TÂCHE 4 — cibles des commandes de consultation (repli confidentialité)
  'invoices': '/more/invoices',
  'budgets': '/more/budgets',
};

export default function WidgetSync() {
  const router = useRouter();
  const rootState = useRootNavigationState();
  const navReady = !!rootState?.key; // expo-router avale les push avant montage
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownPid = useRef<string | null>(null);
  const [draft, setDraft] = useState<PendingExpense | null>(null);
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [missingDraft, setMissingDraft] = useState(false);
  const waitingSince = useRef<number | null>(null);
  const busyRef = useRef(false);
  const theme = useTheme();
  const { t } = useTranslation();

  const discard = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      if (draft) await resolvePendingExpense(draft.id);
      if (peekPendingRoute() === 'quick-add') popPendingRoute();
      shownPid.current = null;
      setDraft(null);
      setMissingDraft(false);
    } finally { busyRef.current = false; }
  };

  const confirm = async () => {
    if (!draft || busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    try {
      const result = await saveConfirmedSiriExpense(draft.id, label);
      if (result === 'saved' || result === 'already') {
        if (peekPendingRoute() === 'quick-add') popPendingRoute();
        shownPid.current = null;
        setDraft(null);
        setMissingDraft(false);
        if (result === 'saved') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert(t('siriConfirm.savedTitle'), t('siriConfirm.savedBody'));
        }
      } else {
        Alert.alert(t('siriConfirm.checkTitle'), t('siriConfirm.checkBody'));
      }
    } catch {
      Alert.alert(t('siriConfirm.checkTitle'), t('siriConfirm.checkBody'));
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };

  useEffect(() => {
    if (Platform.OS !== 'ios' || !widgetBridgeAvailable() || !navReady) return;

    const schedule = () => {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => { refreshWidgetSnapshot(); }, 1500);
    };

    const consumeNative = () => {
      // Native App Intent may enqueue while its Siri overlay keeps AppState
      // "inactive". Read the App Group regardless, on the main JS thread.
      // A screen push can be swallowed by expo-router while the root Stack
      // is changing. The direct confirmation Modal has no route race.
      const hydrated = (useStore as any).persist?.hasHydrated?.() !== false;
      const account = useStore.getState();
      if (!hydrated || !account.user?.id || !account.isAuthenticated ||
          account.isLocked) return false;

      const route = peekPendingRoute();
      const pending = peekPendingExpenses(route === 'quick-add');
      if (pending.length > 0) {
        waitingSince.current = null;
        const e = pending[0];
        if (shownPid.current !== e.id) {
          shownPid.current = e.id;
          setLabel(e.label || t('quickAdd.defaultExpense'));
          setDraft(e);
          setMissingDraft(false);
        }
        // Deliberately do NOT remove native route yet: unscoped drafts need
        // it to remain verifiable until confirmation or cancellation.
        return true;
      }
      if (route === 'quick-add') {
        // If Swift reported no usable draft (e.g. queue full or native
        // storage could not be read), the user gets a real recovery action.
        // Do not quietly open an unfilled expense form and lose the intent.
        if (!waitingSince.current) waitingSince.current = Date.now();
        if (Date.now() - waitingSince.current > 4000 &&
            shownPid.current === null && !busyRef.current) {
          setMissingDraft(true);
        }
        return false;
      }
      waitingSince.current = null;
      if (route && ROUTES[route]) {
        popPendingRoute();
        router.push(ROUTES[route] as any);
        return true;
      }
      return false;
    };

    // App Intents execute independently of JS. Their write can finish after
    // app activation, with no new AppState event. Keep polling the small
    // shared record even while Siri's overlay is visible.
    refreshWidgetSnapshot();
    consumeNative();
    const boot = setInterval(consumeNative, 800);

    const appSub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        schedule();
        consumeNative();
      }
    });

    // Changements réels de données → republier. La signature couvre le
    // contenu (montants, dates, statuts, objectifs), pas seulement les
    // longueurs : modification, paiement ou suppression déclenchent aussi.
    const hash = (acc: number, s: string) => {
      for (let i = 0; i < s.length; i++) acc = (acc * 31 + s.charCodeAt(i)) | 0;
      return acc;
    };
    const sig = (s: ReturnType<typeof useStore.getState>) => {
      let a = 0;
      for (const t of s.transactions) a = hash(a, `${t.id}${t.amount}${t.date}${t.category}`);
      for (const i of s.incomes) a = hash(a, `${i.id}${i.amount}${(i as any).type || ''}`);
      for (const v of s.invoices) a = hash(a, `${v.id}${v.amount}${v.status}${v.dueDate || ''}`);
      for (const r of s.recurringExpenses) a = hash(a, `${r.id}${r.amount}${r.dayOfMonth}${r.active}`);
      for (const g of s.savingsGoals || []) a = hash(a, `${g.id}${(g as any).saved || 0}${(g as any).target || 0}`);
      return `${s.user?.id || ''}|${a}`;
    };
    let lastSig = sig(useStore.getState());
    const unsubStore = useStore.subscribe((s) => {
      const next = sig(s);
      if (next !== lastSig) {
        lastSig = next;
        schedule();
      }
    });
    // Changement de compte (scope) → republier immédiatement : les chiffres de
    // l'ancien compte sont écrasés ou purgés (fail-safe dans le bridge), et la
    // file Siri du nouveau compte est consommée (hydratation tardive couverte).
    let lastScope = useAlertsStore.getState().activeScope;
    const unsubScope = useAlertsStore.subscribe((s) => {
      if (s.activeScope !== lastScope) {
        lastScope = s.activeScope;
        refreshWidgetSnapshot();
        consumeNative();
      }
    });

    return () => {
      appSub.remove();
      unsubStore();
      unsubScope();
      clearInterval(boot);
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [router, navReady]);

  const visible = !!draft || missingDraft;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={() => { void discard(); }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.58)' }}
      >
        <View style={{
          backgroundColor: theme.backgroundSecondary,
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          borderWidth: 1, borderColor: theme.cardBorder,
          paddingTop: 18, paddingHorizontal: 24, paddingBottom: 42,
          gap: 15,
        }}>
          <View style={{ alignItems: 'center', marginBottom: 6 }}>
            <View style={{ width: 44, height: 4, borderRadius: 4, backgroundColor: theme.textTertiary }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="mic-circle" size={32} color={theme.primary} />
            <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800', flex: 1 }}>
              {t('siriConfirm.title')}
            </Text>
          </View>
          {draft ? (
            <>
              <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
                {t('siriConfirm.reviewHint')}
              </Text>
              <View style={{ backgroundColor: theme.card, padding: 20, borderRadius: 18 }}>
                <Text style={{ color: theme.textTertiary, fontSize: 13, textAlign: 'center' }}>
                  {t('siriConfirm.amountLabel')}
                </Text>
                <Text style={{ color: theme.text, fontSize: 34, fontWeight: '900', textAlign: 'center' }}>
                  CHF {draft.amount.toLocaleString('fr-CH', {
                    minimumFractionDigits: 2, maximumFractionDigits: 2,
                  })}
                </Text>
              </View>
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                {t('siriConfirm.descriptionLabel')}
              </Text>
              <TextInput
                value={label}
                onChangeText={(s) => setLabel(s.slice(0, 80))}
                placeholder={t('siriConfirm.descriptionPlaceholder')}
                placeholderTextColor={theme.textTertiary}
                style={{
                  borderRadius: 14, borderWidth: 1, borderColor: theme.inputBorder,
                  backgroundColor: theme.inputBackground, color: theme.text,
                  paddingHorizontal: 14, paddingVertical: 13, fontSize: 17,
                }}
              />
              <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                {t('siriConfirm.confirmNote')}
              </Text>
              <TouchableOpacity
                testID="siri-expense-confirm"
                disabled={saving}
                onPress={() => { void confirm(); }}
                style={{ backgroundColor: theme.primary, paddingVertical: 17, borderRadius: 17,
                  justifyContent: 'center', alignItems: 'center', opacity: saving ? 0.5 : 1 }}
              >
                <Text style={{ color: '#071A16', fontWeight: '800', fontSize: 17 }}>
                  {saving ? t('siriConfirm.saving') : t('siriConfirm.add')}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={{ color: theme.textSecondary, fontSize: 15 }}>
                {t('siriConfirm.missingBody')}
              </Text>
              <TouchableOpacity
                testID="siri-fallback-manual"
                onPress={() => {
                  if (peekPendingRoute() === 'quick-add') popPendingRoute();
                  setMissingDraft(false);
                  router.push('/quick-add' as any);
                }}
                style={{ backgroundColor: theme.primary, paddingVertical: 17, borderRadius: 17,
                  justifyContent: 'center', alignItems: 'center' }}
              >
                <Text style={{ color: '#071A16', fontWeight: '800', fontSize: 17 }}>
                  {t('siriConfirm.openManual')}
                </Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity
            testID="siri-expense-cancel"
            disabled={saving}
            onPress={() => { void discard(); }}
            style={{ alignItems: 'center', paddingVertical: 12 }}
          >
            <Text style={{ color: theme.textSecondary, fontSize: 16 }}>
              {t('siriConfirm.cancel')}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
