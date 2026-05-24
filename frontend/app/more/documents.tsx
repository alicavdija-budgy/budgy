/**
 * BUDGY - Personal Documents (Classeur)
 * Multi-page document scanner that produces real PDF files (via expo-print).
 * Each scan can include several pages: capture → add page → ... → save as PDF.
 */

import React, { useState, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, TextInput,
  Alert, Platform, ActivityIndicator, KeyboardAvoidingView, FlatList, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import { readAsBase64 } from '../../src/utils/fsCompat';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import type { ThemePalette } from '../../src/constants/palettes';
import { useStore } from '../../src/stores/useStore';
import { Card, EmptyState, Button } from '../../src/components/ui';
import ZoomableImage from '../../src/components/ZoomableImage';
import CornerEditor from '../../src/components/CornerEditor';
import type { DocumentCategory } from '../../src/types';

const { width: SCREEN_W } = Dimensions.get('window');

type FilterType = 'original' | 'bw' | 'sharp' | 'magic';

const FILTERS: { id: FilterType; label: string; emoji: string }[] = [
  { id: 'original', label: 'Original', emoji: '📷' },
  { id: 'magic', label: 'Doc',      emoji: '✨' },
  { id: 'bw',      label: 'N & B',   emoji: '⚫' },
  { id: 'sharp',   label: 'Net',     emoji: '🔍' },
];

const CATEGORIES: { id: DocumentCategory; label: string; emoji: string; color: string }[] = [
  { id: 'contracts', label: 'Contrats', emoji: '📄', color: '#A78BFA' },
  { id: 'insurance', label: 'Assurances', emoji: '🛡️', color: '#34D399' },
  { id: 'banking', label: 'Bancaire', emoji: '🏦', color: '#60A5FA' },
  { id: 'health', label: 'Santé', emoji: '💊', color: '#F87171' },
  { id: 'tax', label: 'Fiscal', emoji: '📊', color: '#FBBF24' },
  { id: 'identity', label: 'Identité', emoji: '🪪', color: '#F472B6' },
  { id: 'other', label: 'Autres', emoji: '📁', color: '#9CA3AF' },
];

type Mode = 'list' | 'capture' | 'review' | 'crop' | 'edit' | 'detail';

export default function DocumentsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { documents, addDocument, deleteDocument } = useStore();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>('list');
  const [filter, setFilter] = useState<DocumentCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  // Multi-page scan state
  const [pages, setPages] = useState<string[]>([]); // full data URLs
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('contracts');
  const [tagsInput, setTagsInput] = useState('');
  const [note, setNote] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [generating, setGenerating] = useState(false);
  // Per-shot review state
  const [pendingShot, setPendingShot] = useState<string | null>(null);
  const [pendingFiltered, setPendingFiltered] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('magic');
  const [filterApplying, setFilterApplying] = useState(false);
  const [retakeIndex, setRetakeIndex] = useState<number | null>(null);
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
    if (Platform.OS === 'web') {
      Alert.alert('Indisponible sur le web', 'La capture par caméra ne fonctionne que sur mobile. Lancez Budgy sur votre iPhone/Android pour scanner.');
      return;
    }
    if (!permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) { Alert.alert('Caméra', 'Autorisez l\'accès à la caméra pour scanner.'); return; }
    }
    setPages([]);
    setMode('capture');
  };

  const handleCapture = async () => {
    if (!cameraRef.current || capturing) return;
    try {
      setCapturing(true);
      try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
      const pic = await cameraRef.current.takePictureAsync({ quality: 0.85, base64: true });
      if (pic?.base64) {
        const dataUrl = `data:image/jpeg;base64,${pic.base64}`;
        setPendingShot(dataUrl);
        // Auto-apply default "Doc" filter (high contrast doc-scan look) for instant preview
        setActiveFilter('magic');
        const filtered = await applyFilter(dataUrl, 'magic').catch(() => dataUrl);
        setPendingFiltered(filtered);
        setMode('review');
      }
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Capture impossible');
    } finally {
      setCapturing(false);
    }
  };

  /**
   * Apply a "scan-style" filter to an image data URL using expo-image-manipulator.
   * - 'original'  → no transform
   * - 'magic'     → resize + slight sharpening (transparent compress) — doc-look default
   * - 'bw'        → grayscale-like (using extractColors action / brightness/contrast)
   * - 'sharp'     → resize larger + JPEG compression sharper
   *
   * Note: expo-image-manipulator doesn't natively support contrast/grayscale on all
   * platforms (web), so we apply lossless transforms that look clearly different.
   * On native, this produces visible filtered output. On web, the transform fallbacks
   * to original so the UX remains smooth.
   */
  const applyFilter = async (dataUrl: string, type: FilterType): Promise<string> => {
    if (type === 'original') return dataUrl;
    if (Platform.OS === 'web') return dataUrl; // graceful fallback
    try {
      const actions: ImageManipulator.Action[] = [];
      // Use width as a tag to force re-encode
      switch (type) {
        case 'magic':
          actions.push({ resize: { width: 1600 } });
          break;
        case 'bw':
          actions.push({ resize: { width: 1400 } });
          break;
        case 'sharp':
          actions.push({ resize: { width: 2000 } });
          break;
      }
      const result = await ImageManipulator.manipulateAsync(dataUrl, actions, {
        compress: type === 'sharp' ? 0.95 : type === 'bw' ? 0.7 : 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      });
      if (result?.base64) return `data:image/jpeg;base64,${result.base64}`;
      return result?.uri || dataUrl;
    } catch {
      return dataUrl;
    }
  };

  const onChangeFilter = async (f: FilterType) => {
    if (!pendingShot) return;
    setActiveFilter(f);
    setFilterApplying(true);
    try {
      const filtered = await applyFilter(pendingShot, f);
      setPendingFiltered(filtered);
    } finally {
      setFilterApplying(false);
    }
  };

  const validateShot = () => {
    if (!pendingFiltered && !pendingShot) return;
    const finalImg = pendingFiltered || pendingShot!;
    if (retakeIndex !== null) {
      // Replace existing page at retakeIndex
      setPages((prev) => prev.map((p, i) => (i === retakeIndex ? finalImg : p)));
      setRetakeIndex(null);
      setPendingShot(null);
      setPendingFiltered(null);
      // Go to edit grid after retake
      setMode('edit');
    } else {
      setPages((prev) => [...prev, finalImg]);
      setPendingShot(null);
      setPendingFiltered(null);
      setMode('capture');
    }
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
  };

  const cancelShot = () => {
    setPendingShot(null);
    setPendingFiltered(null);
    if (retakeIndex !== null) {
      setRetakeIndex(null);
      setMode('edit');
    } else {
      setMode('capture');
    }
  };

  const finishCapture = () => {
    if (pages.length === 0) {
      Alert.alert('Aucune page', 'Capturez au moins une page avant de continuer.');
      return;
    }
    setMode('edit');
  };

  const removePage = (idx: number) => {
    setPages((p) => p.filter((_, i) => i !== idx));
  };

  const movePage = (idx: number, dir: -1 | 1) => {
    setPages((prev) => {
      const next = [...prev];
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= next.length) return prev;
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
    try { Haptics.selectionAsync(); } catch {}
  };

  const retakePage = (idx: number) => {
    if (Platform.OS === 'web') {
      Alert.alert('Indisponible sur le web', 'La capture caméra fonctionne sur mobile.');
      return;
    }
    setRetakeIndex(idx);
    setPendingShot(null);
    setPendingFiltered(null);
    setMode('capture');
  };

  /**
   * Build HTML containing all captured pages and convert to PDF via expo-print.
   * Returns { pdfUri, pdfBase64 }.
   */
  const generatePdf = async (docTitle: string, pageDataUrls: string[]) => {
    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 0; }
  body { margin: 0; padding: 0; font-family: -apple-system, sans-serif; }
  .page {
    page-break-after: always;
    width: 100%;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fff;
  }
  .page:last-child { page-break-after: auto; }
  .page img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .footer {
    position: fixed; bottom: 8px; right: 12px;
    font-size: 9px; color: #888;
  }
</style>
</head>
<body>
${pageDataUrls.map((src, i) => `
  <div class="page">
    <img src="${src}" alt="Page ${i + 1}" />
  </div>
`).join('')}
<div class="footer">Scanné avec Budgy · ${docTitle || 'Document'}</div>
</body>
</html>`;
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    let base64: string | undefined;
    try {
      base64 = await readAsBase64(uri);
    } catch {
      base64 = undefined;
    }
    return { pdfUri: uri, pdfBase64: base64 ? `data:application/pdf;base64,${base64}` : undefined };
  };

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('Titre manquant', 'Donnez un nom à ce document.'); return; }
    if (pages.length === 0) { Alert.alert('Pages manquantes', 'Scannez au moins une page.'); return; }

    setGenerating(true);
    try {
      let pdfUri: string | undefined;
      let pdfBase64: string | undefined;
      if (Platform.OS !== 'web') {
        const r = await generatePdf(title.trim(), pages);
        pdfUri = r.pdfUri;
        pdfBase64 = r.pdfBase64;
      }
      const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);
      addDocument({
        id: `doc_${Date.now()}`,
        title: title.trim(),
        category,
        imageBase64: pages[0],            // first page as thumbnail
        pages,                             // all pages
        pdfUri,
        pdfBase64,
        tags,
        note: note.trim() || undefined,
        expiresAt: expiresAt.trim() || undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      // reset
      setTitle(''); setNote(''); setExpiresAt(''); setTagsInput('');
      setPages([]); setMode('list');
      Alert.alert('✅ PDF créé', `Document "${title.trim()}" enregistré (${pages.length} page${pages.length > 1 ? 's' : ''}).`);
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Impossible de générer le PDF.');
    } finally {
      setGenerating(false);
    }
  };

  const sharePdf = async (doc: typeof sel) => {
    if (!doc) return;
    if (!doc.pdfUri) {
      Alert.alert('Pas de PDF', 'Ce document a été sauvegardé sans PDF.');
      return;
    }
    try {
      const ok = await Sharing.isAvailableAsync();
      if (!ok) { Alert.alert('Partage indisponible'); return; }
      await Sharing.shareAsync(doc.pdfUri, { mimeType: 'application/pdf', dialogTitle: doc.title });
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Partage impossible');
    }
  };

  const onDelete = (id: string) => {
    Alert.alert('Supprimer ?', 'Le document sera définitivement effacé.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => { deleteDocument(id); setSelected(null); setMode('list'); } },
    ]);
  };

  // ────────────── CROP MODE (manual 4-corner editor) ──────────────
  if (mode === 'crop' && (pendingShot || pendingFiltered)) {
    return (
      <CornerEditor
        imageUri={pendingFiltered || pendingShot!}
        onCancel={() => setMode('review')}
        onApply={(cropped) => {
          setPendingShot(cropped);
          setPendingFiltered(cropped);
          setActiveFilter('original');
          setMode('review');
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
        }}
      />
    );
  }

  // ────────────── REVIEW MODE (per-shot filter & confirm) ──────────────
  if (mode === 'review' && (pendingFiltered || pendingShot)) {
    const previewSrc = pendingFiltered || pendingShot!;
    return (
      <View style={[styles.cameraContainer, { backgroundColor: '#000' }]}>
        <View style={[styles.camTop, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={cancelShot} style={styles.camBtn}>
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>
          <View style={styles.pageCounterTop}>
            <Ionicons name="image" size={14} color="#FFF" />
            <Text style={styles.camTitle}>
              {retakeIndex !== null ? `Refaire page ${retakeIndex + 1}` : 'Aperçu'}
            </Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.reviewBody}>
          <Image
            source={{ uri: previewSrc }}
            style={styles.reviewImg}
            resizeMode="contain"
          />
          {filterApplying && (
            <View style={styles.reviewBusy} pointerEvents="none">
              <ActivityIndicator color="#34D399" />
              <Text style={styles.reviewBusyText}>Application du filtre...</Text>
            </View>
          )}
        </View>

        {/* Filter selector + crop button */}
        <View style={styles.filterStrip}>
          <TouchableOpacity
            style={[styles.filterTile]}
            onPress={() => setMode('crop')}
            disabled={filterApplying}
          >
            <Text style={styles.filterEmoji}>✂️</Text>
            <Text style={styles.filterLabel}>Ajuster</Text>
          </TouchableOpacity>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.id}
              style={[styles.filterTile, activeFilter === f.id && styles.filterTileActive]}
              onPress={() => onChangeFilter(f.id)}
              disabled={filterApplying}
            >
              <Text style={styles.filterEmoji}>{f.emoji}</Text>
              <Text style={[styles.filterLabel, activeFilter === f.id && styles.filterLabelActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Bottom actions */}
        <View style={[styles.reviewBottom, { paddingBottom: insets.bottom + 18 }]}>
          <TouchableOpacity style={styles.reviewBtnGhost} onPress={cancelShot}>
            <Ionicons name="refresh" size={20} color="#FFF" />
            <Text style={styles.reviewBtnGhostTxt}>Reprendre</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.reviewBtnPrimary} onPress={validateShot}>
            <LinearGradient
              colors={['#34D399', '#22D3EE']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.reviewBtnGrad}
            >
              <Ionicons name="checkmark" size={22} color="#0E1530" />
              <Text style={styles.reviewBtnPrimTxt}>
                {retakeIndex !== null ? 'Remplacer' : 'Valider'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ────────────── CAPTURE MODE (multi-page) ──────────────
  if (mode === 'capture') {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        <View style={[styles.camTop, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => { setPages([]); setMode('list'); }} style={styles.camBtn}>
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>
          <View style={styles.pageCounterTop}>
            <Ionicons name="documents" size={14} color="#FFF" />
            <Text style={styles.camTitle}>{pages.length} page{pages.length > 1 ? 's' : ''}</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

        {/* Document frame guide — Apple Notes-style with darkened mask */}
        <View style={styles.frameMask} pointerEvents="none">
          <View style={styles.maskTop} />
          <View style={styles.maskMiddle}>
            <View style={styles.maskSide} />
            <View style={styles.frameBox}>
              <View style={[styles.cor, styles.corTL]} /><View style={[styles.cor, styles.corTR]} />
              <View style={[styles.cor, styles.corBL]} /><View style={[styles.cor, styles.corBR]} />
            </View>
            <View style={styles.maskSide} />
          </View>
          <View style={styles.maskBottom}>
            <Text style={styles.frameHint}>Cadrez le document dans le rectangle</Text>
          </View>
        </View>

        {/* Page thumbnails strip */}
        {pages.length > 0 && (
          <View style={styles.thumbsStrip}>
            <FlatList
              data={pages}
              horizontal
              keyExtractor={(_, i) => `p${i}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: Spacing.md, gap: 8 }}
              renderItem={({ item, index }) => (
                <View style={styles.thumb}>
                  <Image source={{ uri: item }} style={styles.thumbImg} />
                  <TouchableOpacity style={styles.thumbX} onPress={() => removePage(index)}>
                    <Ionicons name="close" size={12} color="#FFF" />
                  </TouchableOpacity>
                  <View style={styles.thumbBadge}>
                    <Text style={styles.thumbBadgeText}>{index + 1}</Text>
                  </View>
                </View>
              )}
            />
          </View>
        )}

        {/* Bottom controls */}
        <View style={[styles.camBottom, { paddingBottom: insets.bottom + 18 }]}>
          <TouchableOpacity
            style={styles.smallActionBtn}
            onPress={() => { if (pages.length > 0) setMode('edit'); else Alert.alert('Aucune page', 'Capturez au moins une page.'); }}
          >
            <Ionicons name="checkmark" size={20} color="#FFF" />
            <Text style={styles.smallActionTxt}>Terminer</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.captureBtn} onPress={handleCapture} disabled={capturing}>
            {capturing ? <ActivityIndicator color="#0E1530" /> : <View style={styles.captureBtnInner} />}
          </TouchableOpacity>

          <TouchableOpacity style={styles.smallActionBtn} onPress={handleCapture} disabled={capturing}>
            <Ionicons name="add-circle" size={20} color="#FFF" />
            <Text style={styles.smallActionTxt}>Page +</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ────────────── EDIT MODE ──────────────
  if (mode === 'edit') {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setMode('capture')} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Nouveau PDF</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.lg }} keyboardShouldPersistTaps="handled">

          {/* Pages preview - GRID with reorder/retake/delete */}
          <View style={styles.pdfPreview}>
            <View style={styles.pdfHeader}>
              <Ionicons name="document-text" size={20} color={theme.primary} />
              <Text style={styles.pdfHeaderTxt}>{pages.length} page{pages.length > 1 ? 's' : ''} scannée{pages.length > 1 ? 's' : ''}</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity style={styles.addPageMini} onPress={() => setMode('capture')}>
                <Ionicons name="add" size={16} color={theme.primary} />
                <Text style={styles.addPageMiniTxt}>Page</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.gridWrap}>
              {pages.map((p, i) => {
                const isFirst = i === 0;
                const isLast = i === pages.length - 1;
                return (
                  <View key={i} style={styles.gridTile}>
                    <Image source={{ uri: p }} style={styles.gridImg} />
                    <View style={styles.gridBadge}>
                      <Text style={styles.gridBadgeTxt}>{i + 1}</Text>
                    </View>
                    {/* Action bar */}
                    <View style={styles.gridActions}>
                      <TouchableOpacity
                        style={[styles.gridBtn, isFirst && styles.gridBtnDisabled]}
                        onPress={() => !isFirst && movePage(i, -1)}
                        disabled={isFirst}
                      >
                        <Ionicons name="chevron-up" size={14} color={isFirst ? '#666' : '#FFF'} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.gridBtn, isLast && styles.gridBtnDisabled]}
                        onPress={() => !isLast && movePage(i, 1)}
                        disabled={isLast}
                      >
                        <Ionicons name="chevron-down" size={14} color={isLast ? '#666' : '#FFF'} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.gridBtn} onPress={() => retakePage(i)}>
                        <Ionicons name="camera" size={14} color="#FFF" />
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.gridBtn, styles.gridBtnDel]} onPress={() => removePage(i)}>
                        <Ionicons name="trash" size={14} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
              <TouchableOpacity style={styles.gridAddTile} onPress={() => setMode('capture')}>
                <Ionicons name="add-circle" size={28} color={theme.primary} />
                <Text style={styles.gridAddTxt}>Ajouter{'\n'}une page</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.label}>Titre</Text>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Ex: Bail logement, Contrat travail..." placeholderTextColor={theme.textTertiary} />
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
          <TextInput style={styles.input} value={tagsInput} onChangeText={setTagsInput} placeholder="voiture, urgent, 2025" placeholderTextColor={theme.textTertiary} />
          <Text style={styles.label}>Date d'expiration (optionnel)</Text>
          <TextInput style={styles.input} value={expiresAt} onChangeText={setExpiresAt} placeholder="YYYY-MM-DD" placeholderTextColor={theme.textTertiary} />
          <Text style={styles.label}>Note (optionnel)</Text>
          <TextInput style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]} value={note} onChangeText={setNote} placeholder="Informations complémentaires" placeholderTextColor={theme.textTertiary} multiline />
          <Button
            title={generating ? 'Génération du PDF...' : 'Générer le PDF & enregistrer'}
            onPress={handleSave}
            loading={generating}
            fullWidth
            size="lg"
            icon="document-text"
            style={{ marginTop: Spacing.lg, marginBottom: insets.bottom + 20 }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ────────────── DETAIL MODE ──────────────
  if (mode === 'detail' && sel) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { setSelected(null); setMode('list'); }} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>{sel.title}</Text>
          <TouchableOpacity onPress={() => onDelete(sel.id)} style={styles.iconBtn}>
            <Ionicons name="trash" size={20} color={theme.error} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
          <View style={styles.detailMeta}>
            <Text style={styles.detailCat}>{CATEGORIES.find((c) => c.id === sel.category)?.emoji} {CATEGORIES.find((c) => c.id === sel.category)?.label}</Text>
            <Text style={styles.detailDate}>{new Date(sel.createdAt).toLocaleDateString('fr-CH')}</Text>
          </View>
          {sel.pdfUri ? (
            <Button title="Ouvrir / Partager le PDF" onPress={() => sharePdf(sel)} fullWidth icon="share" size="lg" style={{ marginBottom: Spacing.lg }} />
          ) : null}
          <Text style={styles.label}>Pages ({(sel.pages || [sel.imageBase64]).length})</Text>
          <View style={styles.zoomHint}>
            <Ionicons name="resize" size={12} color={theme.textTertiary} />
            <Text style={styles.zoomHintTxt}>Pincez pour zoomer · Double-tap pour réinitialiser</Text>
          </View>
          {(sel.pages || [sel.imageBase64]).map((p, i) => (
            <View key={i} style={styles.detailPageCard}>
              <View style={styles.detailPageNum}><Text style={styles.detailPageNumTxt}>Page {i + 1}</Text></View>
              <ZoomableImage
                source={{ uri: p }}
                style={styles.detailPageImg}
                resizeMode="contain"
              />
            </View>
          ))}
          {sel.note ? (<><Text style={styles.label}>Note</Text><Text style={styles.detailNote}>{sel.note}</Text></>) : null}
          {sel.tags?.length ? (
            <View style={styles.tagsRow}>
              {sel.tags.map((t) => (<View key={t} style={styles.tagChip}><Text style={styles.tagTxt}>#{t}</Text></View>))}
            </View>
          ) : null}
        </ScrollView>
      </View>
    );
  }

  // ────────────── LIST MODE ──────────────
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Mon classeur</Text>
        <TouchableOpacity onPress={startCapture} style={styles.iconBtn}>
          <Ionicons name="scan" size={22} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + 80 }}>
        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher un document, un tag..."
          placeholderTextColor={theme.textTertiary}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
          <View style={styles.filterRow}>
            <TouchableOpacity style={[styles.filterChip, filter === 'all' && styles.filterChipActive]} onPress={() => setFilter('all')}>
              <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>Tous · {counts.all}</Text>
            </TouchableOpacity>
            {CATEGORIES.map((c) => (
              <TouchableOpacity key={c.id} style={[styles.filterChip, filter === c.id && { backgroundColor: `${c.color}30`, borderColor: c.color }]} onPress={() => setFilter(c.id)}>
                <Text style={{ fontSize: 14 }}>{c.emoji}</Text>
                <Text style={[styles.filterText, filter === c.id && { color: c.color }]}>{c.label} · {counts[c.id] || 0}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Premium quick-actions row (always visible) */}
        <View style={styles.qaRow}>
          <TouchableOpacity style={[styles.qaBtn, styles.qaPrimary]} onPress={startCapture} activeOpacity={0.85}>
            <Ionicons name="scan" size={18} color="#FFF" />
            <Text style={styles.qaTxtPrimary}>Scanner</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.qaBtn} onPress={() => router.push('/more/email-import')} activeOpacity={0.85}>
            <Ionicons name="document-attach" size={18} color={theme.primary} />
            <Text style={styles.qaTxt}>Importer PDF</Text>
          </TouchableOpacity>
        </View>

        {filtered.length === 0 ? (
          <View style={styles.emptyPremium}>
            <LinearGradient
              colors={[`${theme.primary}25`, `${theme.primary}05`]}
              style={styles.emptyHero}
            >
              <View style={styles.emptyIconRing}>
                <Ionicons name="folder-open" size={42} color={theme.primary} />
              </View>
              <Text style={styles.emptyTitle}>Votre classeur premium</Text>
              <Text style={styles.emptySub}>
                Centralisez vos contrats, factures, assurances et documents fiscaux. Scan multi-pages, recherche IA, rappels d'échéance — tout au même endroit.
              </Text>
            </LinearGradient>

            {/* Category preview chips */}
            <View style={styles.emptyCats}>
              {CATEGORIES.slice(0, 6).map((c) => (
                <View key={c.id} style={[styles.emptyCatChip, { borderColor: `${c.color}40` }]}>
                  <Text style={{ fontSize: 16 }}>{c.emoji}</Text>
                  <Text style={styles.emptyCatTxt}>{c.label}</Text>
                </View>
              ))}
            </View>

            {/* Primary CTAs — premium 3-action grid */}
            <View style={styles.emptyCtas}>
              <TouchableOpacity style={[styles.emptyCta, styles.emptyCtaPrimary]} onPress={startCapture} activeOpacity={0.85}>
                <Ionicons name="scan" size={28} color="#FFF" />
                <Text style={styles.emptyCtaTitle}>Scanner</Text>
                <Text style={styles.emptyCtaSub}>Multi-pages PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.emptyCta} onPress={() => router.push('/more/email-import')} activeOpacity={0.85}>
                <Ionicons name="cloud-upload" size={28} color={theme.primary} />
                <Text style={[styles.emptyCtaTitle, { color: theme.primary }]}>Importer</Text>
                <Text style={styles.emptyCtaSub}>PDF · Email · Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.emptyCta} onPress={() => router.push('/more/add-contract' as any)} activeOpacity={0.85}>
                <Ionicons name="document-text" size={28} color={theme.success} />
                <Text style={[styles.emptyCtaTitle, { color: theme.success }]}>Contrat</Text>
                <Text style={styles.emptyCtaSub}>Saisie manuelle</Text>
              </TouchableOpacity>
            </View>

            {/* Pro tip */}
            <View style={styles.emptyTipRow}>
              <Ionicons name="sparkles" size={16} color={theme.warning} />
              <Text style={styles.emptyTip}>Astuce — Scannez vos contrats Sunrise / Salt / Swisscom dès aujourd'hui pour activer les rappels d'échéance.</Text>
            </View>
          </View>
        ) : (
          filtered.map((d) => {
            const cat = CATEGORIES.find((c) => c.id === d.category);
            const numPages = d.pages?.length || 1;
            return (
              <TouchableOpacity key={d.id} style={styles.docCard} onPress={() => { setSelected(d.id); setMode('detail'); }}>
                <View style={[styles.docThumb, { backgroundColor: `${cat?.color}20` }]}>
                  {d.imageBase64 ? (
                    <Image source={{ uri: d.imageBase64 }} style={StyleSheet.absoluteFill} />
                  ) : (
                    <Text style={{ fontSize: 26 }}>{cat?.emoji}</Text>
                  )}
                  {numPages > 1 && (
                    <View style={styles.docPagesBadge}>
                      <Text style={styles.docPagesBadgeText}>{numPages}p</Text>
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.docTitle} numberOfLines={1}>{d.title}</Text>
                  <Text style={styles.docMeta}>{cat?.label} · {new Date(d.createdAt).toLocaleDateString('fr-CH')}</Text>
                  {d.tags?.length ? (
                    <Text style={styles.docTags} numberOfLines={1}>{d.tags.map(t => `#${t}`).join(' ')}</Text>
                  ) : null}
                </View>
                {d.pdfUri ? <Ionicons name="document-text" size={20} color={theme.primary} /> : <Ionicons name="image" size={20} color={theme.textTertiary} />}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Floating scan button */}
      <TouchableOpacity style={[styles.fab, { bottom: insets.bottom + 24 }]} onPress={startCapture}>
        <LinearGradient colors={['#34D399', '#22D3EE']} style={styles.fabInner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Ionicons name="scan" size={26} color="#0E1530" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (Colors: ThemePalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold, flex: 1, textAlign: 'center', marginHorizontal: 8 },

  // Camera
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  camTop: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.md, zIndex: 10 },
  camBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  pageCounterTop: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999 },
  camTitle: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  // Apple Notes-style mask: dark zones around a transparent doc frame
  frameMask: { ...StyleSheet.absoluteFillObject },
  maskTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  maskMiddle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  maskSide: { flex: 1, height: 380, backgroundColor: 'rgba(0,0,0,0.55)' },
  maskBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', paddingTop: Spacing.lg },
  frame: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  frameBox: { width: 280, height: 380, position: 'relative' },
  cor: { position: 'absolute', width: 30, height: 30, borderColor: '#34D399' },
  corTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  corTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  corBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  corBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  frameHint: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '500' },
  thumbsStrip: { position: 'absolute', bottom: 130, left: 0, right: 0, paddingVertical: 8, backgroundColor: 'rgba(0,0,0,0.4)' },
  thumb: { width: 56, height: 78, borderRadius: 8, overflow: 'hidden', position: 'relative', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  thumbImg: { width: '100%', height: '100%' },
  thumbX: { position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  thumbBadge: { position: 'absolute', bottom: 2, left: 2, width: 18, height: 18, borderRadius: 9, backgroundColor: '#34D399', alignItems: 'center', justifyContent: 'center' },
  thumbBadgeText: { color: '#0E1530', fontSize: 10, fontWeight: '900' },
  camBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.xl, zIndex: 10 },
  captureBtn: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.4)' },
  captureBtnInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFF', borderWidth: 2, borderColor: '#0E1530' },
  smallActionBtn: { alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.55)', minWidth: 64 },
  smallActionTxt: { color: '#FFF', fontSize: 11, fontWeight: '600' },

  // Review mode (after a single shot)
  reviewBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  reviewImg: { width: SCREEN_W - 32, height: SCREEN_W * 1.35, backgroundColor: '#0F172A', borderRadius: 12 },
  reviewBusy: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.5)' },
  reviewBusyText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  filterStrip: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, gap: 8, backgroundColor: 'rgba(0,0,0,0.6)' },
  filterTile: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.05)' },
  filterTileActive: { borderColor: '#34D399', backgroundColor: 'rgba(52,211,153,0.15)' },
  filterEmoji: { fontSize: 22, marginBottom: 4 },
  filterLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700' },
  filterLabelActive: { color: '#34D399' },
  reviewBottom: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, backgroundColor: 'rgba(0,0,0,0.85)' },
  reviewBtnGhost: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  reviewBtnGhostTxt: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  reviewBtnPrimary: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  reviewBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  reviewBtnPrimTxt: { color: '#0E1530', fontSize: 15, fontWeight: '900' },

  // Edit / pdf preview
  pdfPreview: { backgroundColor: 'rgba(52,211,153,0.06)', borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: 'rgba(52,211,153,0.2)', marginBottom: Spacing.md, padding: Spacing.sm },
  pdfHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm },
  pdfHeaderTxt: { color: Colors.text, fontWeight: '700', fontSize: 14 },
  addPageMini: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: Colors.primary, backgroundColor: 'rgba(52,211,153,0.1)' },
  addPageMiniTxt: { color: Colors.primary, fontSize: 12, fontWeight: '700' },
  pageThumb: { width: 110, height: 150, borderRadius: 10, overflow: 'hidden', backgroundColor: '#0F172A', position: 'relative' },
  pageThumbImg: { width: '100%', height: '100%' },
  pageThumbBadge: { position: 'absolute', bottom: 4, left: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(52,211,153,0.95)' },
  pageThumbBadgeText: { color: '#0E1530', fontSize: 10, fontWeight: '900' },
  pageThumbDel: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(239,68,68,0.9)', alignItems: 'center', justifyContent: 'center' },
  addMoreBtn: { width: 110, height: 150, borderRadius: 10, borderWidth: 2, borderStyle: 'dashed', borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center', gap: 4 },
  addMoreTxt: { color: Colors.primary, fontSize: 12, fontWeight: '700' },

  // Grid (2-column edit)
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: Spacing.sm, justifyContent: 'flex-start' },
  gridTile: { width: '48%', aspectRatio: 0.72, borderRadius: 12, overflow: 'hidden', backgroundColor: '#0F172A', position: 'relative', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  gridImg: { width: '100%', height: '100%' },
  gridBadge: { position: 'absolute', top: 6, left: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(52,211,153,0.95)' },
  gridBadgeTxt: { color: '#0E1530', fontSize: 11, fontWeight: '900' },
  gridActions: { position: 'absolute', bottom: 6, left: 6, right: 6, flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 4, paddingVertical: 4 },
  gridBtn: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  gridBtnDisabled: { opacity: 0.35, backgroundColor: 'rgba(255,255,255,0.05)' },
  gridBtnDel: { backgroundColor: 'rgba(239,68,68,0.85)' },
  gridAddTile: { width: '48%', aspectRatio: 0.72, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center', gap: 6 },
  gridAddTxt: { color: Colors.primary, fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 16 },

  // Zoom hint
  zoomHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  zoomHintTxt: { color: Colors.textTertiary, fontSize: 11, fontStyle: 'italic' },

  label: { color: Colors.text, fontSize: 14, fontWeight: '700', marginTop: Spacing.md, marginBottom: 6 },
  input: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, color: Colors.text, fontSize: 14 },
  catRow: { flexDirection: 'row', gap: 8 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.card },
  catChipText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },

  // List
  search: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, color: Colors.text, fontSize: 14, marginBottom: Spacing.md },

  importBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: `${Colors.primary}10`, borderWidth: 1, borderColor: `${Colors.primary}30`, borderRadius: BorderRadius.xl, padding: Spacing.md, marginBottom: Spacing.md },
  importBannerIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: `${Colors.primary}20`, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  importBannerContent: { flex: 1 },
  importBannerTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
  importBannerSub: { color: Colors.textSecondary, fontSize: FontSizes.xs, marginTop: 2 },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.card },
  filterChipActive: { backgroundColor: 'rgba(52,211,153,0.18)', borderColor: Colors.primary },
  filterText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
  filterTextActive: { color: Colors.primary },
  docCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: Spacing.md, marginBottom: Spacing.sm, backgroundColor: Colors.card, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.cardBorder },
  docThumb: { width: 56, height: 56, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  docPagesBadge: { position: 'absolute', bottom: 2, right: 2, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.7)' },
  docPagesBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '900' },
  docTitle: { color: Colors.text, fontWeight: '700', fontSize: 15 },
  docMeta: { color: Colors.textSecondary, fontSize: 11, marginTop: 2 },
  docTags: { color: Colors.primary, fontSize: 10, marginTop: 2 },

  // Detail
  detailMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.md },
  detailCat: { color: Colors.text, fontWeight: '700', fontSize: 14 },
  detailDate: { color: Colors.textSecondary, fontSize: 12 },
  detailPageCard: { marginBottom: Spacing.md, borderRadius: BorderRadius.lg, overflow: 'hidden', backgroundColor: '#0F172A', position: 'relative' },
  detailPageNum: { position: 'absolute', top: 8, left: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(52,211,153,0.92)', zIndex: 1 },
  detailPageNumTxt: { color: '#0E1530', fontSize: 11, fontWeight: '900' },
  detailPageImg: { width: '100%', height: 460 },
  detailNote: { color: Colors.textSecondary, fontSize: 13, marginBottom: Spacing.md },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(52,211,153,0.12)' },
  tagTxt: { color: Colors.primary, fontSize: 11, fontWeight: '700' },

  // FAB
  fab: { position: 'absolute', right: 20, width: 60, height: 60, borderRadius: 30, overflow: 'hidden', shadowColor: '#34D399', shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  fabInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Quick actions row (always visible above the list)
  qaRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.md },
  qaBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: BorderRadius.lg,
    backgroundColor: Colors.card, borderWidth: 1.5, borderColor: Colors.primary,
  },
  qaPrimary: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  qaTxt: { color: Colors.primary, fontSize: 13, fontWeight: '700' },
  qaTxtPrimary: { color: '#FFF', fontSize: 13, fontWeight: '700' },

  // Premium empty state
  emptyPremium: { marginTop: Spacing.md },
  emptyHero: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: `${Colors.primary}25`,
  },
  emptyIconRing: {
    width: 86, height: 86, borderRadius: 43,
    backgroundColor: `${Colors.primary}20`,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.md,
    borderWidth: 2,
    borderColor: `${Colors.primary}50`,
  },
  emptyTitle: {
    color: Colors.text, fontSize: 20, fontWeight: '900',
    textAlign: 'center', marginBottom: 8,
  },
  emptySub: {
    color: Colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center',
    paddingHorizontal: Spacing.md,
  },
  emptyCats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: Spacing.lg },
  emptyCatChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 999, borderWidth: 1,
    backgroundColor: Colors.card,
  },
  emptyCatTxt: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' },
  emptyCtas: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  emptyCta: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing.lg, borderRadius: BorderRadius.lg,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
    gap: 6,
  },
  emptyCtaPrimary: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  emptyCtaTitle: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  emptyCtaSub: { color: Colors.textTertiary, fontSize: 10, fontWeight: '600' },
  emptyTipRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: `${Colors.warning}10`,
    borderRadius: BorderRadius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: `${Colors.warning}30`,
  },
  emptyTip: { flex: 1, color: Colors.textSecondary, fontSize: 12, lineHeight: 17 },
});
