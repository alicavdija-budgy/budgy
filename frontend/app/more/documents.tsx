/**
 * GUARDIAN MONEY CHF - Personal Documents (Classeur)
 */

import React, { useState, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, TextInput,
  Modal, Alert, Platform, ActivityIndicator, KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useStore } from '../../src/stores/useStore';
import { Card, EmptyState, Button } from '../../src/components/ui';
import type { DocumentCategory } from '../../src/types';

const CATEGORIES: { id: DocumentCategory; label: string; emoji: string; color: string }[] = [
  { id: 'contracts', label: 'Contrats', emoji: '📄', color: '#A78BFA' },
  { id: 'insurance', label: 'Assurances', emoji: '🛡️', color: '#34D399' },
  { id: 'banking', label: 'Bancaire', emoji: '🏦', color: '#60A5FA' },
  { id: 'health', label: 'Santé', emoji: '💊', color: '#F87171' },
  { id: 'tax', label: 'Fiscal', emoji: '📊', color: '#FBBF24' },
  { id: 'identity', label: 'Identité', emoji: '🪪', color: '#F472B6' },
  { id: 'other', label: 'Autres', emoji: '📁', color: '#9CA3AF' },
];

type Mode = 'list' | 'capture' | 'edit';

export default function DocumentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { documents, addDocument, deleteDocument } = useStore();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>('list');
  const [filter, setFilter] = useState<DocumentCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoB64, setPhotoB64] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('contracts');
  const [tagsInput, setTagsInput] = useState('');
  const [note, setNote] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);

  const filtered = useMemo(() => documents.filter((d) => {
    if (filter !== 'all' && d.category !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!d.title.toLowerCase().includes(q) && !(d.tags || []).some((t) => t.toLowerCase().includes(q)) && !(d.note || '').toLowerCase().includes(q)) return false;
    }
    return true;
  }), [documents, filter, search]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: documents.length };
    for (const c of CATEGORIES) m[c.id] = 0;
    for (const d of documents) m[d.category] = (m[d.category] || 0) + 1;
    return m;
  }, [documents]);

  const sel = documents.find((d) => d.id === selected);

  const startCapture = async () => {
    if (Platform.OS === 'web') { setMode('edit'); setPhotoUri(null); setPhotoB64(null); return; }
    if (!permission?.granted) { const r = await requestPermission(); if (!r.granted) return; }
    setMode('capture');
  };

  const handleCapture = async () => {
    if (!cameraRef.current || capturing) return;
    try {
      setCapturing(true);
      const pic = await cameraRef.current.takePictureAsync({ quality: 0.7, base64: true });
      if (pic?.uri) { setPhotoUri(pic.uri); setPhotoB64(pic.base64 || null); setMode('edit'); }
    } catch (e: any) { Alert.alert('Erreur', e?.message || 'Capture impossible'); }
    finally { setCapturing(false); }
  };

  const handleSave = () => {
    if (!title.trim()) { Alert.alert('Titre manquant', 'Donnez un nom à ce document.'); return; }
    if (!photoB64) { Alert.alert('Photo manquante', 'Scannez le document avant d’enregistrer.'); return; }
    const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);
    addDocument({
      id: `doc_${Date.now()}`, title: title.trim(), category,
      imageBase64: `data:image/jpeg;base64,${photoB64}`,
      tags, note: note.trim() || undefined, expiresAt: expiresAt.trim() || undefined,
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    setTitle(''); setNote(''); setExpiresAt(''); setTagsInput('');
    setPhotoUri(null); setPhotoB64(null); setMode('list');
  };

  const onDelete = (id: string) => {
    Alert.alert('Supprimer ?', 'Le document sera définitivement effacé.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => { deleteDocument(id); setSelected(null); } },
    ]);
  };

  if (mode === 'capture') {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        <View style={[styles.camTop, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => setMode('list')} style={styles.camBtn}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.camTitle}>Scanner un document</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.frame} pointerEvents="none">
          <View style={styles.frameBox}>
            <View style={[styles.cor, styles.corTL]} /><View style={[styles.cor, styles.corTR]} />
            <View style={[styles.cor, styles.corBL]} /><View style={[styles.cor, styles.corBR]} />
          </View>
        </View>
        <View style={[styles.camBottom, { paddingBottom: insets.bottom + 24 }]}>
          <TouchableOpacity style={styles.captureBtn} onPress={handleCapture} disabled={capturing}>
            {capturing ? <ActivityIndicator color={Colors.background} /> : <Ionicons name="document" size={32} color={Colors.background} />}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (mode === 'edit') {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setMode('list')} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Nouveau document</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.lg }} keyboardShouldPersistTaps="handled">
          {photoUri ? (
            <View style={styles.photoCard}>
              <Image source={{ uri: photoUri }} style={styles.photoImg} resizeMode="contain" />
              <TouchableOpacity style={styles.retakeBtn} onPress={() => { setPhotoUri(null); setPhotoB64(null); startCapture(); }}>
                <Ionicons name="refresh" size={16} color={Colors.text} />
                <Text style={styles.retakeTxt}>Reprendre</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.scanCta} onPress={startCapture}>
              <Ionicons name="scan" size={32} color={Colors.primaryLight} />
              <Text style={styles.scanCtaText}>Scanner le document</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.label}>Titre</Text>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Ex: Bail logement, Contrat travail..." placeholderTextColor={Colors.textTertiary} />
          <Text style={styles.label}>Catégorie</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.catRow}>
              {CATEGORIES.map((c) => (
                <TouchableOpacity key={c.id} style={[styles.catChip, category === c.id && { backgroundColor: `${c.color}30`, borderColor: c.color }]} onPress={() => setCategory(c.id)}>
                  <Text style={{ fontSize: 18 }}>{c.emoji}</Text>
                  <Text style={[styles.catChipText, category === c.id && { color: c.color }]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <Text style={styles.label}>Tags (séparés par virgules)</Text>
          <TextInput style={styles.input} value={tagsInput} onChangeText={setTagsInput} placeholder="voiture, urgent, 2025" placeholderTextColor={Colors.textTertiary} />
          <Text style={styles.label}>Date d’expiration (optionnel)</Text>
          <TextInput style={styles.input} value={expiresAt} onChangeText={setExpiresAt} placeholder="YYYY-MM-DD" placeholderTextColor={Colors.textTertiary} />
          <Text style={styles.label}>Note (optionnel)</Text>
          <TextInput style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]} value={note} onChangeText={setNote} placeholder="Informations complémentaires" placeholderTextColor={Colors.textTertiary} multiline />
          <Button title="Enregistrer" onPress={handleSave} fullWidth size="lg" icon="checkmark-circle" style={{ marginTop: Spacing.lg, marginBottom: insets.bottom + 20 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Mon Classeur</Text>
        <TouchableOpacity onPress={startCapture} style={styles.iconBtn}>
          <Ionicons name="add-circle" size={28} color={Colors.primary} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + 40 }}>
        <LinearGradient colors={Colors.gradientPrimary as [string, string]} style={styles.hero}>
          <Ionicons name="folder-open" size={32} color={Colors.text} />
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>{documents.length} documents</Text>
            <Text style={styles.heroSub}>Sur votre appareil • 100% privé</Text>
          </View>
          <TouchableOpacity style={styles.heroBtn} onPress={startCapture}>
            <Ionicons name="scan" size={20} color={Colors.text} />
          </TouchableOpacity>
        </LinearGradient>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={Colors.textTertiary} />
          <TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="Rechercher par titre, tag..." placeholderTextColor={Colors.textTertiary} />
        </View>
        <View style={styles.catGrid}>
          <TouchableOpacity style={[styles.catCard, filter === 'all' && styles.catCardActive]} onPress={() => setFilter('all')}>
            <Text style={{ fontSize: 24 }}>📑</Text>
            <Text style={styles.catCardLabel}>Tous</Text>
            <Text style={styles.catCardCount}>{counts.all}</Text>
          </TouchableOpacity>
          {CATEGORIES.map((c) => (
            <TouchableOpacity key={c.id} style={[styles.catCard, filter === c.id && { backgroundColor: `${c.color}25`, borderColor: c.color }]} onPress={() => setFilter(c.id)}>
              <Text style={{ fontSize: 24 }}>{c.emoji}</Text>
              <Text style={styles.catCardLabel}>{c.label}</Text>
              <Text style={[styles.catCardCount, filter === c.id && { color: c.color }]}>{counts[c.id] || 0}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {filtered.length === 0 ? (
          <EmptyState icon="folder-open-outline" title={documents.length === 0 ? 'Aucun document' : 'Aucun résultat'} subtitle={documents.length === 0 ? 'Scannez vos contrats, assurances, papiers d’identité.' : 'Modifiez la recherche ou le filtre.'} />
        ) : (
          <View style={styles.docList}>
            {filtered.map((d) => {
              const cat = CATEGORIES.find((c) => c.id === d.category);
              return (
                <TouchableOpacity key={d.id} style={styles.docItem} onPress={() => setSelected(d.id)} activeOpacity={0.7}>
                  <Image source={{ uri: d.imageBase64 }} style={styles.docThumb} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.docTitle} numberOfLines={1}>{d.title}</Text>
                    <View style={styles.docMeta}>
                      <Text style={[styles.docCat, { color: cat?.color || Colors.textTertiary }]}>{cat?.emoji} {cat?.label || d.category}</Text>
                      {d.expiresAt && <Text style={styles.docExp}>⏰ {d.expiresAt}</Text>}
                    </View>
                    {d.tags.length > 0 && (
                      <View style={styles.tagRow}>
                        {d.tags.slice(0, 3).map((t) => (<View key={t} style={styles.tagChip}><Text style={styles.tagText}>#{t}</Text></View>))}
                      </View>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
      <Modal visible={!!sel} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {sel && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{sel.title}</Text>
                  <TouchableOpacity onPress={() => setSelected(null)}>
                    <Ionicons name="close" size={26} color={Colors.text} />
                  </TouchableOpacity>
                </View>
                <ScrollView style={{ maxHeight: 500 }}>
                  <Image source={{ uri: sel.imageBase64 }} style={styles.modalImage} resizeMode="contain" />
                  {sel.tags.length > 0 && (
                    <View style={styles.tagRow}>
                      {sel.tags.map((t) => (<View key={t} style={styles.tagChip}><Text style={styles.tagText}>#{t}</Text></View>))}
                    </View>
                  )}
                  {sel.note && <Card style={{ padding: Spacing.md, marginTop: Spacing.md }}><Text style={styles.noteText}>{sel.note}</Text></Card>}
                  {sel.expiresAt && (
                    <View style={styles.expBadge}>
                      <Ionicons name="alarm" size={16} color={Colors.warning} />
                      <Text style={styles.expText}>Expire le {sel.expiresAt}</Text>
                    </View>
                  )}
                </ScrollView>
                <Button title="Supprimer" variant="danger" onPress={() => onDelete(sel.id)} fullWidth icon="trash-outline" style={{ marginTop: Spacing.lg }} />
              </>
            )}
          </View>
        </View>
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
  heroBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.md, gap: Spacing.sm, marginBottom: Spacing.md },
  searchInput: { flex: 1, color: Colors.text, fontSize: FontSizes.md, paddingVertical: Spacing.md },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  catCard: { flexBasis: '30%', flexGrow: 1, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: BorderRadius.lg, padding: Spacing.md, alignItems: 'center' },
  catCardActive: { backgroundColor: `${Colors.primary}20`, borderColor: Colors.primary },
  catCardLabel: { color: Colors.text, fontSize: FontSizes.xs, fontWeight: FontWeights.semibold, marginTop: 4 },
  catCardCount: { color: Colors.textTertiary, fontSize: FontSizes.lg, fontWeight: FontWeights.bold, marginTop: 2 },
  docList: { gap: Spacing.sm },
  docItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: BorderRadius.lg, padding: Spacing.md },
  docThumb: { width: 60, height: 60, borderRadius: BorderRadius.md, backgroundColor: Colors.background },
  docTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  docMeta: { flexDirection: 'row', gap: Spacing.md, marginTop: 4 },
  docCat: { fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
  docExp: { color: Colors.warning, fontSize: FontSizes.xs },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  tagChip: { backgroundColor: Colors.backgroundSecondary, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm },
  tagText: { color: Colors.textSecondary, fontSize: 10, fontWeight: FontWeights.semibold },
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  camTop: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 5 },
  camBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  camTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  frame: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frameBox: { width: '85%', aspectRatio: 0.75, position: 'relative' },
  cor: { position: 'absolute', width: 32, height: 32, borderColor: Colors.primaryLight },
  corTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 12 },
  corTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 12 },
  corBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 12 },
  corBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 12 },
  camBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', paddingTop: Spacing.md, backgroundColor: 'rgba(0,0,0,0.4)' },
  captureBtn: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.text, borderWidth: 4, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center' },
  photoCard: { backgroundColor: Colors.card, borderRadius: BorderRadius.xl, overflow: 'hidden', marginBottom: Spacing.lg, position: 'relative' },
  photoImg: { width: '100%', height: 200, backgroundColor: '#000' },
  retakeBtn: { position: 'absolute', top: Spacing.md, right: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: Spacing.xs, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full },
  retakeTxt: { color: Colors.text, fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
  scanCta: { backgroundColor: Colors.card, borderWidth: 2, borderColor: Colors.primary, borderStyle: 'dashed', borderRadius: BorderRadius.xl, padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.lg },
  scanCtaText: { color: Colors.primaryLight, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  label: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, marginBottom: Spacing.sm, marginTop: Spacing.md },
  input: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, color: Colors.text, fontSize: FontSizes.md },
  catRow: { flexDirection: 'row', gap: Spacing.sm },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: BorderRadius.full, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md },
  catChipText: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: Colors.backgroundSecondary, borderTopLeftRadius: BorderRadius.xxl, borderTopRightRadius: BorderRadius.xxl, padding: Spacing.lg, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  modalTitle: { color: Colors.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold, flex: 1 },
  modalImage: { width: '100%', height: 280, backgroundColor: '#000', borderRadius: BorderRadius.lg },
  noteText: { color: Colors.textSecondary, fontSize: FontSizes.sm, lineHeight: 20 },
  expBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${Colors.warning}20`, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, marginTop: Spacing.md, alignSelf: 'flex-start' },
  expText: { color: Colors.warning, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
});
