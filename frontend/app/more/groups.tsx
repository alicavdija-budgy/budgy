/**
 * GUARDIAN MONEY CHF - Group expenses (Splitwise-like) list
 */

import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Modal, Alert, Platform, KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useStore } from '../../src/stores/useStore';
import { EmptyState, Button } from '../../src/components/ui';
import { formatNumber } from '../../src/utils/calculations';
import type { GroupMember } from '../../src/types';

const PRESET_EMOJIS = ['💼', '🏠', '✈️', '🍽️', '🏖️', '👯', '⚽', '🎉'];
const PRESET_COLORS = ['#A78BFA', '#34D399', '#60A5FA', '#F472B6', '#FBBF24', '#F87171', '#22D3EE', '#84CC16'];

export default function GroupsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, groups, groupExpenses, addGroup } = useStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(PRESET_EMOJIS[0]);
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [memberInput, setMemberInput] = useState('');
  const [members, setMembers] = useState<GroupMember[]>([]);

  const openModal = () => {
    setMembers([{ id: 'me', name: user?.name || 'Moi', color: '#0EA5E9', isMe: true }]);
    setModalOpen(true);
  };

  const addMember = () => {
    const n = memberInput.trim();
    if (!n) return;
    setMembers((m) => [...m, { id: `m_${Date.now()}_${m.length}`, name: n, color: PRESET_COLORS[(m.length + 1) % PRESET_COLORS.length] }]);
    setMemberInput('');
  };

  const removeMember = (id: string) => setMembers((m) => m.filter((x) => x.id !== id || x.isMe));

  const handleCreate = () => {
    if (!name.trim()) { Alert.alert('Nom manquant', 'Donnez un nom au groupe.'); return; }
    if (members.length < 2) { Alert.alert('Membres', 'Ajoutez au moins une autre personne.'); return; }
    addGroup({
      id: `grp_${Date.now()}`,
      name: name.trim(), emoji, color, members,
      currency: 'CHF', createdAt: Date.now(),
    });
    setName(''); setMembers([]); setMemberInput(''); setModalOpen(false);
  };

  const groupStats = useMemo(() => groups.map((g) => {
    const exps = groupExpenses.filter((e) => e.groupId === g.id);
    const total = exps.reduce((s, e) => s + e.amount, 0);
    const myMember = g.members.find((m) => m.isMe);
    let myBalance = 0;
    if (myMember) {
      for (const e of exps) {
        const myShare = e.amount / g.members.length;
        if (e.paidBy === myMember.id) myBalance += e.amount - myShare;
        else myBalance -= myShare;
      }
    }
    return { group: g, total, count: exps.length, myBalance };
  }), [groups, groupExpenses]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Groupes & Amis</Text>
        <TouchableOpacity onPress={openModal} style={styles.iconBtn}>
          <Ionicons name="add-circle" size={28} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + 40 }}>
        <LinearGradient colors={Colors.gradientPrimary as [string, string]} style={styles.hero}>
          <Ionicons name="people" size={32} color={Colors.text} />
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Partagez vos dépenses</Text>
            <Text style={styles.heroSub}>Bureau, coloc, voyage — Guardian calcule qui doit quoi.</Text>
          </View>
        </LinearGradient>

        {groupStats.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="Aucun groupe"
            subtitle="Créez un groupe pour partager vos dépenses entre amis ou colocataires."
            actionLabel="+ Créer un groupe"
            onAction={openModal}
          />
        ) : (
          <View style={{ gap: Spacing.md }}>
            {groupStats.map(({ group, total, count, myBalance }) => (
              <TouchableOpacity
                key={group.id}
                style={[styles.groupCard, { borderColor: `${group.color}55` }]}
                onPress={() => router.push({ pathname: '/more/group-detail', params: { groupId: group.id } })}
                activeOpacity={0.8}
              >
                <LinearGradient colors={[`${group.color}30`, `${group.color}10`]} style={styles.groupGrad}>
                  <View style={styles.groupTop}>
                    <View style={[styles.groupEmojiBox, { backgroundColor: `${group.color}40` }]}>
                      <Text style={{ fontSize: 26 }}>{group.emoji}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.groupName}>{group.name}</Text>
                      <Text style={styles.groupMembers}>
                        {group.members.length} membres • {count} dépenses
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={22} color={group.color} />
                  </View>
                  <View style={styles.groupRow}>
                    <View>
                      <Text style={styles.smallLabel}>Total</Text>
                      <Text style={styles.totalText}>CHF {formatNumber(total)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.smallLabel}>Mon solde</Text>
                      <Text style={[styles.balanceText, { color: myBalance >= 0 ? Colors.success : Colors.error }]}>
                        {myBalance >= 0 ? '+' : ''}CHF {formatNumber(Math.abs(myBalance))}
                      </Text>
                    </View>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouveau groupe</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <Ionicons name="close" size={26} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 600 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Nom du groupe</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ex: Bureau Lausanne" placeholderTextColor={Colors.textTertiary} />

              <Text style={styles.label}>Emoji</Text>
              <View style={styles.emojiRow}>
                {PRESET_EMOJIS.map((e) => (
                  <TouchableOpacity key={e} style={[styles.emojiBtn, emoji === e && styles.emojiBtnActive]} onPress={() => setEmoji(e)}>
                    <Text style={{ fontSize: 22 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Couleur</Text>
              <View style={styles.colorRow}>
                {PRESET_COLORS.map((c) => (
                  <TouchableOpacity key={c} style={[styles.colorBtn, { backgroundColor: c }, color === c && styles.colorBtnActive]} onPress={() => setColor(c)} />
                ))}
              </View>

              <Text style={styles.label}>Membres ({members.length})</Text>
              <View style={styles.memberAddRow}>
                <TextInput style={[styles.input, { flex: 1 }]} value={memberInput} onChangeText={setMemberInput} placeholder="Ajouter un membre (prénom)" placeholderTextColor={Colors.textTertiary} onSubmitEditing={addMember} />
                <TouchableOpacity style={styles.addBtn} onPress={addMember}>
                  <Ionicons name="add" size={24} color={Colors.text} />
                </TouchableOpacity>
              </View>
              <View style={styles.membersList}>
                {members.map((m) => (
                  <View key={m.id} style={[styles.memberChip, { borderColor: m.color }]}>
                    <View style={[styles.memberAvatar, { backgroundColor: m.color }]}>
                      <Text style={styles.memberAvatarText}>{m.name[0]?.toUpperCase()}</Text>
                    </View>
                    <Text style={styles.memberName}>{m.name}{m.isMe ? ' (moi)' : ''}</Text>
                    {!m.isMe && (
                      <TouchableOpacity onPress={() => removeMember(m.id)}>
                        <Ionicons name="close-circle" size={18} color={Colors.error} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            </ScrollView>
            <Button title="Créer le groupe" onPress={handleCreate} fullWidth icon="checkmark" size="lg" style={{ marginTop: Spacing.lg }} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  hero: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: BorderRadius.xl, padding: Spacing.lg, marginBottom: Spacing.lg },
  heroTitle: { color: Colors.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: FontSizes.xs, marginTop: 2 },
  groupCard: { borderRadius: BorderRadius.xl, borderWidth: 1, overflow: 'hidden' },
  groupGrad: { padding: Spacing.lg },
  groupTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
  groupEmojiBox: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  groupName: { color: Colors.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
  groupMembers: { color: Colors.textSecondary, fontSize: FontSizes.xs, marginTop: 2 },
  groupRow: { flexDirection: 'row', justifyContent: 'space-between' },
  smallLabel: { color: Colors.textTertiary, fontSize: FontSizes.xs },
  totalText: { color: Colors.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold, marginTop: 2 },
  balanceText: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: Colors.backgroundSecondary, borderTopLeftRadius: BorderRadius.xxl, borderTopRightRadius: BorderRadius.xxl, padding: Spacing.lg, maxHeight: '92%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  modalTitle: { color: Colors.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
  label: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, marginBottom: Spacing.sm, marginTop: Spacing.md },
  input: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, color: Colors.text, fontSize: FontSizes.md },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  emojiBtn: { width: 50, height: 50, borderRadius: BorderRadius.md, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, alignItems: 'center', justifyContent: 'center' },
  emojiBtnActive: { backgroundColor: `${Colors.primary}25`, borderColor: Colors.primary },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  colorBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent' },
  colorBtnActive: { borderColor: Colors.text },
  memberAddRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  addBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  membersList: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
  memberChip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.card, borderWidth: 1, borderRadius: BorderRadius.full, paddingVertical: Spacing.xs, paddingHorizontal: Spacing.sm },
  memberAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  memberAvatarText: { color: Colors.text, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  memberName: { color: Colors.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
});
