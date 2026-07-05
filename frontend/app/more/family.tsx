/**
 * BUDGY — Famille / Groupes (100% offline, Zustand-only)
 *
 * Fonctionnalités:
 *   - Création / édition / suppression de groupes (Famille, Amis, Coloc...)
 *   - Membres avec couleurs et avatars
 *   - Dépenses partagées (paidBy + split equal)
 *   - Calcul automatique "qui doit combien" (settlements)
 *   - Code d'invitation visuel à 8 caractères (local, partage natif)
 *   - Activité récente
 *
 * Aucun appel backend — fonctionne hors-ligne, App Store-safe.
 */

import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, Share, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import type { ThemePalette } from '../../src/constants/palettes';
import { useStore } from '../../src/stores/useStore';
import { Card, Button } from '../../src/components/ui';
import type { ExpenseGroup, GroupMember, GroupExpense } from '../../src/types';
import { publishInviteCode, joinByCode, makeSelfMember, leaveGroupCloud } from '../../src/services/familyCloud';
import { isSupabaseConfigured } from '../../src/lib/supabase';

// ─────────────────── Helpers ───────────────────
const MEMBER_COLORS = ['#34D399', '#60A5FA', '#A78BFA', '#FBBF24', '#F87171', '#F472B6', '#22D3EE', '#FB923C'];
const GROUP_EMOJIS = ['👨‍👩‍👧‍👦', '👫', '🏠', '🍕', '✈️', '🎉', '💼', '🐾'];

const fmt = (n: number) => `CHF ${Math.round(Math.abs(n)).toLocaleString('fr-CH').replace(/,/g, "'")}`;
const initial = (s: string) => (s || '?').trim().charAt(0).toUpperCase();
const genCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
};

/**
 * Algorithme de settlement: qui doit combien à qui.
 * Pour chaque membre on calcule le delta (payé - dû). Les positifs sont
 * créanciers, les négatifs débiteurs. On apparie greedy.
 */
function computeSettlements(group: ExpenseGroup, expenses: GroupExpense[]) {
  const balances: Record<string, number> = {};
  for (const m of group.members) balances[m.id] = 0;
  for (const e of expenses) {
    if (e.groupId !== group.id) continue;
    const memberIds = group.members.map((m) => m.id);
    const share = e.amount / memberIds.length;
    for (const mid of memberIds) balances[mid] = (balances[mid] || 0) - share;
    balances[e.paidBy] = (balances[e.paidBy] || 0) + e.amount;
  }
  // Round to 2 decimals
  for (const k of Object.keys(balances)) balances[k] = Math.round(balances[k] * 100) / 100;

  const debtors = Object.entries(balances).filter(([, v]) => v < -0.01)
    .map(([id, v]) => ({ id, v: -v })).sort((a, b) => b.v - a.v);
  const creditors = Object.entries(balances).filter(([, v]) => v > 0.01)
    .map(([id, v]) => ({ id, v })).sort((a, b) => b.v - a.v);

  const txs: { fromId: string; toId: string; amount: number }[] = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].v, creditors[j].v);
    txs.push({ fromId: debtors[i].id, toId: creditors[j].id, amount: Math.round(pay * 100) / 100 });
    debtors[i].v -= pay;
    creditors[j].v -= pay;
    if (debtors[i].v < 0.01) i++;
    if (creditors[j].v < 0.01) j++;
  }
  return { balances, settlements: txs };
}

// ─────────────────── Screen ───────────────────
type Mode = 'list' | 'detail' | 'create' | 'addMember' | 'addExpense';

export default function FamilyScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const {
    groups, groupExpenses, user,
    addGroup, deleteGroup, updateGroup,
    addGroupExpense, deleteGroupExpense,
  } = useStore();

  const [mode, setMode] = useState<Mode>('list');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [showJoinModal, setShowJoinModal] = useState(false);

  // Create-group form
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('👨‍👩‍👧‍👦');

  // Add-member form
  const [newMemberName, setNewMemberName] = useState('');

  // Add-expense form
  const [expTitle, setExpTitle] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expPaidBy, setExpPaidBy] = useState<string>('');

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) || null,
    [groups, selectedGroupId]
  );
  const selectedExpenses = useMemo(
    () => groupExpenses
      .filter((e) => e.groupId === selectedGroupId)
      .sort((a, b) => b.createdAt - a.createdAt),
    [groupExpenses, selectedGroupId]
  );
  const computed = useMemo(
    () => (selectedGroup ? computeSettlements(selectedGroup, selectedExpenses) : null),
    [selectedGroup, selectedExpenses]
  );

  // ────────── Actions ──────────
  const handleCreateGroup = () => {
    const name = newName.trim();
    if (!name) {
      Alert.alert('Nom manquant', 'Entrez un nom pour ce groupe.');
      return;
    }
    const meId = `m_${Date.now()}`;
    const group: ExpenseGroup = {
      id: `g_${Date.now()}`,
      name,
      emoji: newEmoji,
      color: MEMBER_COLORS[0],
      members: [{
        id: meId,
        name: user?.name || 'Moi',
        color: MEMBER_COLORS[0],
        isMe: true,
      }],
      currency: 'CHF',
      createdAt: Date.now(),
    };
    addGroup(group);
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    setNewName('');
    setNewEmoji('👨‍👩‍👧‍👦');
    setSelectedGroupId(group.id);
    setMode('detail');
  };

  const handleAddMember = () => {
    if (!selectedGroup) return;
    const name = newMemberName.trim();
    if (!name) {
      Alert.alert('Nom manquant', 'Entrez le prénom du membre.');
      return;
    }
    if (selectedGroup.members.length >= 8) {
      Alert.alert('Maximum atteint', '8 membres maximum par groupe.');
      return;
    }
    const usedColors = selectedGroup.members.map((m) => m.color);
    const color = MEMBER_COLORS.find((c) => !usedColors.includes(c)) || MEMBER_COLORS[selectedGroup.members.length % MEMBER_COLORS.length];
    const newMember: GroupMember = {
      id: `m_${Date.now()}`,
      name,
      color,
    };
    updateGroup(selectedGroup.id, { members: [...selectedGroup.members, newMember] });
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    setNewMemberName('');
    setMode('detail');
  };

  const handleAddExpense = () => {
    if (!selectedGroup) return;
    const t = expTitle.trim();
    const amt = parseFloat(expAmount.replace(',', '.'));
    if (!t) { Alert.alert('Titre manquant', 'Décrivez la dépense.'); return; }
    if (!amt || isNaN(amt) || amt <= 0) { Alert.alert('Montant invalide', 'Entrez un montant valide.'); return; }
    if (!expPaidBy) { Alert.alert('Payeur', 'Choisissez qui a payé.'); return; }

    const memberIds = selectedGroup.members.map((m) => m.id);
    const shares: Record<string, number> = {};
    for (const mid of memberIds) shares[mid] = 1;

    const expense: GroupExpense = {
      id: `ge_${Date.now()}`,
      groupId: selectedGroup.id,
      title: t,
      amount: amt,
      currency: selectedGroup.currency || 'CHF',
      paidBy: expPaidBy,
      splitMode: 'equal',
      shares,
      date: new Date().toISOString().slice(0, 10),
      createdAt: Date.now(),
    };
    addGroupExpense(expense);
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    setExpTitle('');
    setExpAmount('');
    setExpPaidBy('');
    setMode('detail');
  };

  const handleDeleteGroup = (id: string) => {
    Alert.alert(
      'Supprimer ce groupe ?',
      'Toutes les dépenses partagées seront aussi supprimées.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive', onPress: () => {
            deleteGroup(id);
            if (selectedGroupId === id) { setSelectedGroupId(null); setMode('list'); }
          },
        },
      ]
    );
  };

  const handleLeaveGroup = (group: ExpenseGroup) => {
    Alert.alert(
      'Quitter ce groupe ?',
      "Vous n'apparaîtrez plus dans ce groupe partagé. Vous pourrez le rejoindre à nouveau avec un nouveau code d'invitation.",
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Quitter',
          style: 'destructive',
          onPress: async () => {
            const res = await leaveGroupCloud(group.id);
            if (!res.ok && res.error === 'owner_cannot_leave') {
              Alert.alert(
                'Impossible de quitter',
                "Vous êtes le propriétaire de ce groupe. Utilisez « Supprimer » depuis l'en-tête pour le fermer définitivement pour tous les membres.",
              );
              return;
            }
            if (!res.ok) {
              Alert.alert('Erreur', `Impossible de quitter : ${res.error || 'erreur inconnue'}`);
              return;
            }
            // Success — clean up locally
            deleteGroup(group.id);
            try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
            setSelectedGroupId(null);
            setMode('list');
            Alert.alert('Groupe quitté', `Vous ne faites plus partie de « ${group.name} ».`);
          },
        },
      ]
    );
  };

  const handleShareCode = async (group: ExpenseGroup) => {
    let code = group.inviteCode;
    if (!code) {
      code = genCode();
      updateGroup(group.id, { inviteCode: code });
    }
    // v3.8.0 — publish the code to Supabase so other devices can join.
    // Fails silently if offline: the code is still shareable, will be
    // re-published on the next foreground sync.
    const pub = await publishInviteCode(group, code);
    const shareBase = `Rejoignez "${group.name}" sur Budgy 🎉\n\nCode d'invitation : ${code}\nLien : budgy://join/${code}\n\n(Ouvrir Budgy → Plus → Famille & Groupes → Rejoindre)`;
    const suffix = pub.ok
      ? ''
      : "\n\nℹ️ Vous êtes hors ligne : le code sera activé automatiquement à votre prochaine connexion.";
    const finalMsg = shareBase + suffix;

    // Try native Share first. On Expo Web (or unsupported envs) fall back to
    // clipboard so the code is still transmissible without crashing.
    try {
      await Share.share({ message: finalMsg });
    } catch {
      try {
        await Clipboard.setStringAsync(finalMsg);
        Alert.alert(
          'Message copié',
          "Le code et le lien d'invitation ont été copiés dans le presse-papiers. Vous pouvez maintenant les coller dans WhatsApp, Messages ou un e-mail.",
        );
      } catch {
        Alert.alert('Code d\'invitation', `Code : ${code}\n\nLien : budgy://join/${code}`);
      }
    }
  };

  const handleJoinByCode = async () => {
    const code = joinCodeInput.trim().toUpperCase();
    if (code.length !== 8) {
      Alert.alert('Code invalide', 'Le code doit faire 8 caractères.');
      return;
    }
    if (!isSupabaseConfigured()) {
      Alert.alert(
        'Connexion requise',
        "Pour rejoindre un groupe partagé, connectez-vous à votre compte Budgy dans les réglages.",
      );
      return;
    }

    setShowJoinModal(false);
    const res = await joinByCode(code);
    setJoinCodeInput('');

    if (!res.ok || !res.data) {
      const msg =
        res.error === 'invite_not_found' || res.error === 'not_found'
          ? "Code introuvable ou expiré. Demandez au propriétaire de partager un nouveau code."
          : res.error === 'not_authenticated'
          ? "Vous devez être connecté pour rejoindre un groupe."
          : `Impossible de rejoindre : ${res.error || 'erreur inconnue'}`;
      Alert.alert('Rejoindre le groupe', msg);
      return;
    }

    const { group: cloudGroup, expenses: cloudExpenses, alreadyMember } = res.data;

    // Add self as GroupMember if we're not already listed
    const self = await makeSelfMember(MEMBER_COLORS[cloudGroup.members.length % MEMBER_COLORS.length]);
    const meAlreadyInMembers =
      self && cloudGroup.members.some((m) => m.id === self.id || m.email === self.email);
    const finalGroup: ExpenseGroup = {
      ...cloudGroup,
      inviteCode: code,
      members: self && !meAlreadyInMembers
        ? [...cloudGroup.members, self]
        : cloudGroup.members,
    };

    // Merge into local store (updateGroup upserts by id in Zustand)
    const existing = groups.find((g) => g.id === finalGroup.id);
    if (existing) {
      updateGroup(finalGroup.id, {
        name: finalGroup.name,
        emoji: finalGroup.emoji,
        color: finalGroup.color,
        currency: finalGroup.currency,
        members: finalGroup.members,
        inviteCode: finalGroup.inviteCode,
      });
    } else {
      addGroup(finalGroup);
    }
    // Bring shared expenses locally (dedupe by id)
    for (const e of cloudExpenses) {
      const alreadyLocal = groupExpenses.some((x) => x.id === e.id);
      if (!alreadyLocal) addGroupExpense(e);
    }

    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    setSelectedGroupId(finalGroup.id);
    setMode('detail');
    Alert.alert(
      alreadyMember ? 'Groupe déjà rejoint' : 'Groupe rejoint 🎉',
      alreadyMember
        ? `Vous êtes déjà membre de « ${finalGroup.name} ». Ses ${cloudExpenses.length} dépenses partagées sont maintenant synchronisées sur cet appareil.`
        : `Bienvenue dans « ${finalGroup.name} » ! ${cloudExpenses.length} dépense${cloudExpenses.length > 1 ? 's' : ''} partagée${cloudExpenses.length > 1 ? 's' : ''} synchronisée${cloudExpenses.length > 1 ? 's' : ''}.`,
    );
  };

  // ────────── Renders ──────────
  const renderHeader = (title: string, onBack?: () => void, rightAction?: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) => (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack || (() => router.back())} style={styles.iconBtn}>
        <Ionicons name="chevron-back" size={26} color={theme.text} />
      </TouchableOpacity>
      <Text style={styles.title}>{title}</Text>
      {rightAction ? (
        <TouchableOpacity onPress={rightAction.onPress} style={styles.iconBtn}>
          <Ionicons name={rightAction.icon} size={22} color={theme.primary} />
        </TouchableOpacity>
      ) : (<View style={{ width: 40 }} />)}
    </View>
  );

  // ───── LIST MODE ─────
  if (mode === 'list') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]} testID="family-screen">
        {renderHeader('Famille & Groupes')}
        <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 120 }}>
          {groups.length === 0 ? (
            <View style={styles.heroSection}>
              <Text style={{ fontSize: 64 }}>👨‍👩‍👧‍👦</Text>
              <Text style={styles.heroTitle}>Partagez vos dépenses, simplement</Text>
              <Text style={styles.heroSub}>Créez un groupe pour suivre qui doit combien à qui. Fonctionne 100% hors-ligne.</Text>
            </View>
          ) : (
            groups.map((g) => {
              const exp = groupExpenses.filter((e) => e.groupId === g.id);
              const total = exp.reduce((s, e) => s + e.amount, 0);
              const c = computeSettlements(g, exp);
              const myMember = g.members.find((m) => m.isMe);
              const myBalance = myMember ? (c.balances[myMember.id] || 0) : 0;
              return (
                <TouchableOpacity
                  key={g.id}
                  style={styles.groupCard}
                  onPress={() => { setSelectedGroupId(g.id); setMode('detail'); }}
                  activeOpacity={0.85}
                >
                  <View style={styles.groupCardLeft}>
                    <Text style={{ fontSize: 36 }}>{g.emoji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.groupCardTitle}>{g.name}</Text>
                    <Text style={styles.groupCardSub}>
                      {g.members.length} membre{g.members.length > 1 ? 's' : ''} · {exp.length} dépense{exp.length > 1 ? 's' : ''} · {fmt(total)}
                    </Text>
                    {myMember && Math.abs(myBalance) > 0.01 && (
                      <View style={[styles.balanceBadge, { backgroundColor: myBalance > 0 ? `${theme.success}20` : `${theme.error}20` }]}>
                        <Ionicons name={myBalance > 0 ? 'arrow-down' : 'arrow-up'} size={12} color={myBalance > 0 ? theme.success : theme.error} />
                        <Text style={[styles.balanceBadgeTxt, { color: myBalance > 0 ? theme.success : theme.error }]}>
                          {myBalance > 0 ? `On vous doit ${fmt(myBalance)}` : `Vous devez ${fmt(myBalance)}`}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
                </TouchableOpacity>
              );
            })
          )}

          <TouchableOpacity style={styles.primaryCta} onPress={() => setMode('create')} activeOpacity={0.85}>
            <LinearGradient colors={[theme.primary, theme.primaryDark || theme.primary]} style={styles.primaryCtaGrad}>
              <Ionicons name="add-circle" size={22} color="#FFF" />
              <Text style={styles.primaryCtaTxt}>Créer un groupe</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryCta} onPress={() => setShowJoinModal(true)} activeOpacity={0.85}>
            <Ionicons name="enter-outline" size={22} color={theme.text} />
            <Text style={styles.secondaryCtaTxt}>Rejoindre avec un code</Text>
          </TouchableOpacity>

          <Card style={styles.tipCard}>
            <Ionicons name="cloud-done" size={18} color={theme.success} />
            <Text style={styles.tipTxt}>
              Le partage de groupes entre appareils est activé : générez un code depuis un groupe et invitez vos proches à le saisir sur leur propre compte Budgy.
            </Text>
          </Card>
        </ScrollView>

        {/* Join code modal */}
        <Modal visible={showJoinModal} transparent animationType="fade" onRequestClose={() => setShowJoinModal(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Rejoindre un groupe</Text>
              <Text style={styles.modalSub}>Entrez le code d'invitation à 8 caractères.</Text>
              <TextInput
                style={styles.codeInput}
                value={joinCodeInput}
                onChangeText={(t) => setJoinCodeInput(t.toUpperCase().slice(0, 8))}
                placeholder="XXXXXXXX"
                placeholderTextColor={theme.textTertiary}
                autoCapitalize="characters"
                maxLength={8}
              />
              <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg }}>
                <Button title="Annuler" variant="secondary" onPress={() => setShowJoinModal(false)} style={{ flex: 1 }} />
                <Button title="Rejoindre" onPress={handleJoinByCode} style={{ flex: 1 }} disabled={joinCodeInput.length !== 8} />
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ───── CREATE GROUP ─────
  if (mode === 'create') {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.container, { paddingTop: insets.top }]}
      >
        {renderHeader('Nouveau groupe', () => setMode('list'))}
        <ScrollView contentContainerStyle={{ padding: Spacing.lg }} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Choisissez un emoji</Text>
          <View style={styles.emojiRow}>
            {GROUP_EMOJIS.map((e) => (
              <TouchableOpacity
                key={e}
                style={[styles.emojiBtn, newEmoji === e && { borderColor: theme.primary, backgroundColor: `${theme.primary}15` }]}
                onPress={() => setNewEmoji(e)}
              >
                <Text style={{ fontSize: 28 }}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Nom du groupe</Text>
          <TextInput
            style={styles.input}
            value={newName}
            onChangeText={setNewName}
            placeholder="Famille Dupont, Coloc, Voyage Italie..."
            placeholderTextColor={theme.textTertiary}
            autoFocus
            maxLength={40}
          />

          <Button title="Créer le groupe" onPress={handleCreateGroup} fullWidth size="lg" icon="checkmark-circle" style={{ marginTop: Spacing.xl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ───── ADD MEMBER ─────
  if (mode === 'addMember' && selectedGroup) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.container, { paddingTop: insets.top }]}
      >
        {renderHeader('Ajouter un membre', () => setMode('detail'))}
        <ScrollView contentContainerStyle={{ padding: Spacing.lg }} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Prénom</Text>
          <TextInput
            style={styles.input}
            value={newMemberName}
            onChangeText={setNewMemberName}
            placeholder="ex: Sarah"
            placeholderTextColor={theme.textTertiary}
            autoFocus
            maxLength={30}
          />
          <Button title="Ajouter au groupe" onPress={handleAddMember} fullWidth size="lg" icon="person-add" style={{ marginTop: Spacing.xl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ───── ADD EXPENSE ─────
  if (mode === 'addExpense' && selectedGroup) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.container, { paddingTop: insets.top }]}
      >
        {renderHeader('Nouvelle dépense', () => setMode('detail'))}
        <ScrollView contentContainerStyle={{ padding: Spacing.lg }} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={styles.input}
            value={expTitle}
            onChangeText={setExpTitle}
            placeholder="Courses Migros, Restau, AirBnB..."
            placeholderTextColor={theme.textTertiary}
            autoFocus
            maxLength={60}
          />

          <Text style={styles.label}>Montant (CHF)</Text>
          <TextInput
            style={[styles.input, { fontSize: FontSizes.xl, fontWeight: '800' }]}
            value={expAmount}
            onChangeText={(t) => setExpAmount(t.replace(/[^0-9.,]/g, ''))}
            placeholder="0.00"
            placeholderTextColor={theme.textTertiary}
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>Payé par</Text>
          <View style={styles.memberChipRow}>
            {selectedGroup.members.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={[styles.memberChip, expPaidBy === m.id && { backgroundColor: `${m.color}25`, borderColor: m.color }]}
                onPress={() => setExpPaidBy(m.id)}
              >
                <View style={[styles.memberAvatarSm, { backgroundColor: m.color }]}>
                  <Text style={styles.memberAvatarTxt}>{initial(m.name)}</Text>
                </View>
                <Text style={[styles.memberChipTxt, expPaidBy === m.id && { color: m.color, fontWeight: '700' }]}>{m.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.splitInfo}>
            <Ionicons name="information-circle" size={16} color={theme.info} />
            <Text style={styles.splitInfoTxt}>
              Réparti équitablement entre les {selectedGroup.members.length} membre{selectedGroup.members.length > 1 ? 's' : ''} ({expAmount ? fmt(parseFloat(expAmount.replace(',', '.')) / selectedGroup.members.length) : 'CHF —'} chacun).
            </Text>
          </View>

          <Button title="Ajouter la dépense" onPress={handleAddExpense} fullWidth size="lg" icon="checkmark-circle" style={{ marginTop: Spacing.xl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ───── DETAIL MODE ─────
  if (mode === 'detail' && selectedGroup && computed) {
    const inviteCode = selectedGroup.inviteCode || '';
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {renderHeader(
          selectedGroup.name,
          () => { setSelectedGroupId(null); setMode('list'); },
          { icon: 'trash-outline', onPress: () => handleDeleteGroup(selectedGroup.id) }
        )}
        <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 140 }}>
          {/* Hero — group emoji + invite code */}
          <LinearGradient colors={[`${theme.primary}25`, `${theme.primary}08`]} style={styles.heroBlock}>
            <Text style={{ fontSize: 56 }}>{selectedGroup.emoji}</Text>
            <Text style={styles.heroTitle}>{selectedGroup.name}</Text>
            <TouchableOpacity onPress={() => handleShareCode(selectedGroup)} style={styles.inviteBtn} activeOpacity={0.85}>
              <Ionicons name="share-outline" size={18} color={theme.primary} />
              <Text style={styles.inviteBtnTxt}>
                {inviteCode ? `Code: ${inviteCode}` : 'Générer un code d\'invitation'}
              </Text>
            </TouchableOpacity>
          </LinearGradient>

          {/* Members */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Membres ({selectedGroup.members.length})</Text>
            <TouchableOpacity onPress={() => setMode('addMember')}>
              <Text style={styles.linkAdd}>+ Ajouter</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.membersGrid}>
            {selectedGroup.members.map((m) => {
              const bal = computed.balances[m.id] || 0;
              return (
                <View key={m.id} style={styles.memberTile}>
                  <View style={[styles.memberAvatar, { backgroundColor: m.color }]}>
                    <Text style={styles.memberAvatarTxt}>{initial(m.name)}</Text>
                  </View>
                  <Text style={styles.memberName} numberOfLines={1}>{m.isMe ? 'Moi' : m.name}</Text>
                  <Text style={[styles.memberBalance, {
                    color: Math.abs(bal) < 0.01 ? theme.textTertiary : bal > 0 ? theme.success : theme.error,
                  }]}>
                    {Math.abs(bal) < 0.01 ? 'À jour' : bal > 0 ? `+${fmt(bal)}` : `-${fmt(bal)}`}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Who owes whom */}
          {computed.settlements.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Qui doit combien</Text>
              </View>
              <View style={styles.settlementsCard}>
                {computed.settlements.map((s, i) => {
                  const from = selectedGroup.members.find((m) => m.id === s.fromId);
                  const to = selectedGroup.members.find((m) => m.id === s.toId);
                  if (!from || !to) return null;
                  return (
                    <View key={i} style={[styles.settlementRow, i === 0 && { borderTopWidth: 0 }]}>
                      <View style={[styles.dotAvatar, { backgroundColor: from.color }]}>
                        <Text style={styles.memberAvatarTxt}>{initial(from.name)}</Text>
                      </View>
                      <Text style={styles.settlementTxt}>{from.isMe ? 'Vous devez' : `${from.name} doit`}</Text>
                      <Text style={styles.settlementAmount}>{fmt(s.amount)}</Text>
                      <Text style={styles.settlementTxt}>{to.isMe ? 'à vous' : `à ${to.name}`}</Text>
                      <View style={[styles.dotAvatar, { backgroundColor: to.color }]}>
                        <Text style={styles.memberAvatarTxt}>{initial(to.name)}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {/* Activity */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Activité récente ({selectedExpenses.length})</Text>
            <TouchableOpacity onPress={() => { setExpPaidBy(selectedGroup.members.find(m => m.isMe)?.id || ''); setMode('addExpense'); }}>
              <Text style={styles.linkAdd}>+ Dépense</Text>
            </TouchableOpacity>
          </View>
          {selectedExpenses.length === 0 ? (
            <View style={styles.emptyExp}>
              <Ionicons name="receipt-outline" size={36} color={theme.textTertiary} />
              <Text style={styles.emptyExpTxt}>Aucune dépense partagée pour l'instant.</Text>
              <Text style={styles.emptyExpSub}>Ajoutez votre première dépense pour démarrer le calcul.</Text>
            </View>
          ) : (
            <View style={styles.activityList}>
              {selectedExpenses.slice(0, 20).map((e) => {
                const payer = selectedGroup.members.find((m) => m.id === e.paidBy);
                return (
                  <TouchableOpacity
                    key={e.id}
                    style={styles.activityRow}
                    onLongPress={() => {
                      Alert.alert('Supprimer cette dépense ?', e.title, [
                        { text: 'Annuler', style: 'cancel' },
                        { text: 'Supprimer', style: 'destructive', onPress: () => deleteGroupExpense(e.id) },
                      ]);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.dotAvatar, { backgroundColor: payer?.color || theme.primary }]}>
                      <Text style={styles.memberAvatarTxt}>{initial(payer?.name || '?')}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.activityTitle} numberOfLines={1}>{e.title}</Text>
                      <Text style={styles.activitySub}>
                        Payé par {payer?.isMe ? 'vous' : payer?.name || '—'} · {new Date(e.createdAt).toLocaleDateString('fr-CH', { day: '2-digit', month: 'short' })}
                      </Text>
                    </View>
                    <Text style={styles.activityAmount}>{fmt(e.amount)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Leave group (for joined members). Owner sees an inline hint. */}
          <TouchableOpacity
            style={styles.leaveBtn}
            onPress={() => handleLeaveGroup(selectedGroup)}
            activeOpacity={0.8}
            testID="family-leave-group"
          >
            <Ionicons name="exit-outline" size={18} color={theme.error} />
            <Text style={styles.leaveBtnTxt}>Quitter le groupe</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* FAB */}
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + 24 }]}
          onPress={() => { setExpPaidBy(selectedGroup.members.find(m => m.isMe)?.id || ''); setMode('addExpense'); }}
          activeOpacity={0.85}
        >
          <LinearGradient colors={[theme.primary, theme.primaryDark || theme.primary]} style={styles.fabGrad}>
            <Ionicons name="add" size={28} color="#FFF" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}

// ─────────────────── Styles ───────────────────
const makeStyles = (Colors: ThemePalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold, flex: 1, textAlign: 'center' },

  heroSection: { alignItems: 'center', marginVertical: Spacing.xl },
  heroTitle: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold, textAlign: 'center', marginTop: Spacing.md },
  heroSub: { color: Colors.textSecondary, fontSize: FontSizes.sm, textAlign: 'center', marginTop: Spacing.xs, maxWidth: 300, lineHeight: 19 },

  groupCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.card, borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.cardBorder,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  groupCardLeft: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  groupCardTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
  groupCardSub: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  balanceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', marginTop: 6,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },
  balanceBadgeTxt: { fontSize: 11, fontWeight: '700' },

  primaryCta: { marginTop: Spacing.lg, borderRadius: BorderRadius.xl, overflow: 'hidden' },
  primaryCtaGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: Spacing.md },
  primaryCtaTxt: { color: '#FFF', fontSize: FontSizes.md, fontWeight: FontWeights.bold },

  leaveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: Spacing.xl, paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.errorLight || Colors.error,
    backgroundColor: `${Colors.error}10`,
  },
  leaveBtnTxt: { color: Colors.error, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },

  secondaryCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: Spacing.sm, padding: Spacing.md,
    borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.cardBorder,
    backgroundColor: Colors.card,
  },
  secondaryCtaTxt: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },

  tipCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: `${Colors.info}10`,
    borderColor: `${Colors.info}30`,
    marginTop: Spacing.lg,
  },
  tipTxt: { flex: 1, color: Colors.textSecondary, fontSize: 12, lineHeight: 18 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: Spacing.lg },
  modalCard: { backgroundColor: Colors.card, borderRadius: BorderRadius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.cardBorder },
  modalTitle: { color: Colors.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
  modalSub: { color: Colors.textSecondary, fontSize: FontSizes.sm, marginTop: 4 },
  codeInput: {
    marginTop: Spacing.lg, backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: BorderRadius.lg,
    padding: Spacing.md, color: Colors.text,
    fontSize: FontSizes.xxl, fontWeight: '900', textAlign: 'center', letterSpacing: 6,
  },

  label: {
    color: Colors.textSecondary, fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    marginTop: Spacing.md, marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.lg, padding: Spacing.md,
    color: Colors.text, fontSize: FontSizes.md,
  },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  emojiBtn: {
    width: 56, height: 56, alignItems: 'center', justifyContent: 'center',
    borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.cardBorder,
    backgroundColor: Colors.card,
  },

  // detail
  heroBlock: {
    alignItems: 'center', padding: Spacing.xl, borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: `${Colors.primary}30`, marginBottom: Spacing.lg,
  },
  inviteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderRadius: 999, backgroundColor: `${Colors.primary}15`,
    borderWidth: 1, borderColor: `${Colors.primary}40`,
  },
  inviteBtnTxt: { color: Colors.primary, fontSize: FontSizes.sm, fontWeight: '700' },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.lg, marginBottom: Spacing.sm },
  sectionTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
  linkAdd: { color: Colors.primary, fontSize: FontSizes.sm, fontWeight: '700' },

  membersGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  memberTile: {
    width: 88, alignItems: 'center', padding: Spacing.sm,
    backgroundColor: Colors.card, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.cardBorder,
  },
  memberAvatar: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  memberAvatarSm: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  memberAvatarTxt: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  memberName: { color: Colors.text, fontSize: FontSizes.xs, fontWeight: '700', marginTop: 6, maxWidth: 76 },
  memberBalance: { fontSize: 11, fontWeight: '700', marginTop: 2 },

  memberChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  memberChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.card,
  },
  memberChipTxt: { color: Colors.textSecondary, fontSize: 13 },
  splitInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: Spacing.md, padding: Spacing.md, backgroundColor: `${Colors.info}10`, borderRadius: BorderRadius.md },
  splitInfoTxt: { flex: 1, color: Colors.textSecondary, fontSize: 12, lineHeight: 17 },

  settlementsCard: {
    backgroundColor: Colors.card, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.cardBorder, paddingHorizontal: Spacing.md,
  },
  settlementRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.cardBorder,
  },
  dotAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  settlementTxt: { color: Colors.textSecondary, fontSize: 13 },
  settlementAmount: { color: Colors.text, fontSize: 14, fontWeight: '800' },

  activityList: { gap: Spacing.sm },
  activityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.card, padding: Spacing.md,
    borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.cardBorder,
  },
  activityTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: '700' },
  activitySub: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  activityAmount: { color: Colors.text, fontSize: FontSizes.md, fontWeight: '800' },

  emptyExp: { alignItems: 'center', padding: Spacing.xl, gap: 6 },
  emptyExpTxt: { color: Colors.text, fontSize: FontSizes.sm, fontWeight: '700', marginTop: 8 },
  emptyExpSub: { color: Colors.textSecondary, fontSize: 12, textAlign: 'center' },

  fab: {
    position: 'absolute', right: 20, width: 60, height: 60, borderRadius: 30,
    overflow: 'hidden', elevation: 6,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
  fabGrad: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
});
