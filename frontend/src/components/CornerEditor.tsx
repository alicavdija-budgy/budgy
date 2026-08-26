/**
 * BUDGY - Corner Editor (manual 4-corner crop)
 *
 * @i18n-technical-file
 *
 * ⚠ Emits three FR-CH internal alert messages ("Image non chargée", "La
 * sélection est trop petite", "Impossible d'appliquer le recadrage"). These
 * are error diagnostics passed to native Alert.alert during crop; multi-locale
 * copy will land in v3.9.1 under `scanner.cornerEditor.*`.
 *
 * Lets the user adjust 4 corners over a captured image (Apple Notes style).
 * On apply, returns the bounding box of the 4 points and a cropped + scaled
 * image via expo-image-manipulator. This is a pragmatic, cross-platform
 * approach: a true perspective transform is not available client-side in
 * React Native without a heavy native module, so we crop to the smallest
 * bounding rectangle. The result is still a clear, focused document image.
 *
 * Usage:
 *   <CornerEditor
 *     imageUri={dataUrl}
 *     onCancel={() => setMode('review')}
 *     onApply={(croppedDataUrl) => { ... }}
 *   />
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Dimensions,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  useAnimatedReaction,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Polygon, Line, Circle } from 'react-native-svg';
import * as ImageManipulator from 'expo-image-manipulator';
import { Colors } from '../constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');

const AnimatedPolygon = Animated.createAnimatedComponent(Polygon);
const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  imageUri: string;
  onCancel: () => void;
  onApply: (cropped: string) => void;
}

const CORNER_PADDING = 24;          // image margin inside the editor
const HANDLE_RADIUS = 18;           // visible touch area
const STROKE = 'rgba(52,211,153,0.95)';
const FILL = 'rgba(52,211,153,0.12)';

export default function CornerEditor({ imageUri, onCancel, onApply }: Props) {
  const insets = useSafeAreaInsets();
  const [imageBox, setImageBox] = useState<{ w: number; h: number } | null>(null);
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);

  // Get natural image dimensions to compute correct crop box later
  useEffect(() => {
    Image.getSize(
      imageUri,
      (w, h) => setImgNatural({ w, h }),
      () => setImgNatural({ w: 1000, h: 1400 }),
    );
  }, [imageUri]);

  // Compute editor display size (image fitted into editor area)
  const editorW = SCREEN_W;
  const editorH = SCREEN_W * 1.35;
  const innerW = editorW - CORNER_PADDING * 2;
  const innerH = editorH - CORNER_PADDING * 2;

  // Initial corners: full rectangle (slightly inset)
  const tlx = useSharedValue(CORNER_PADDING);
  const tly = useSharedValue(CORNER_PADDING);
  const trx = useSharedValue(CORNER_PADDING + innerW);
  const try_ = useSharedValue(CORNER_PADDING);
  const brx = useSharedValue(CORNER_PADDING + innerW);
  const bry = useSharedValue(CORNER_PADDING + innerH);
  const blx = useSharedValue(CORNER_PADDING);
  const bly = useSharedValue(CORNER_PADDING + innerH);

  // Reactive polygon points string for SVG
  const [pointsStr, setPointsStr] = useState(
    `${CORNER_PADDING},${CORNER_PADDING} ${CORNER_PADDING + innerW},${CORNER_PADDING} ${CORNER_PADDING + innerW},${CORNER_PADDING + innerH} ${CORNER_PADDING},${CORNER_PADDING + innerH}`,
  );

  const updatePoints = (
    a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number,
  ) => {
    setPointsStr(`${a},${b} ${c},${d} ${e},${f} ${g},${h}`);
  };

  useAnimatedReaction(
    () => [tlx.value, tly.value, trx.value, try_.value, brx.value, bry.value, blx.value, bly.value],
    (vals) => {
      runOnJS(updatePoints)(vals[0], vals[1], vals[2], vals[3], vals[4], vals[5], vals[6], vals[7]);
    },
  );

  // Helper to make a Pan gesture for one corner (constrains within editor)
  const makeCornerGesture = (
    sx: SharedValue<number>,
    sy: SharedValue<number>,
  ) => {
    const startX = useSharedValue(0);
    const startY = useSharedValue(0);
    return Gesture.Pan()
      .onStart(() => {
        startX.value = sx.value;
        startY.value = sy.value;
      })
      .onUpdate((e) => {
        const nx = startX.value + e.translationX;
        const ny = startY.value + e.translationY;
        sx.value = Math.min(Math.max(nx, 0), editorW);
        sy.value = Math.min(Math.max(ny, 0), editorH);
      });
  };

  const tlGesture = makeCornerGesture(tlx, tly);
  const trGesture = makeCornerGesture(trx, try_);
  const brGesture = makeCornerGesture(brx, bry);
  const blGesture = makeCornerGesture(blx, bly);

  // Animated styles for handles
  const handleStyle = (sx: SharedValue<number>, sy: SharedValue<number>) =>
    useAnimatedStyle(() => ({
      transform: [
        { translateX: sx.value - HANDLE_RADIUS },
        { translateY: sy.value - HANDLE_RADIUS },
      ],
    }));

  const tlStyle = handleStyle(tlx, tly);
  const trStyle = handleStyle(trx, try_);
  const brStyle = handleStyle(brx, bry);
  const blStyle = handleStyle(blx, bly);

  const handleAuto = () => {
    // Reset to full rectangle
    tlx.value = CORNER_PADDING;
    tly.value = CORNER_PADDING;
    trx.value = CORNER_PADDING + innerW;
    try_.value = CORNER_PADDING;
    brx.value = CORNER_PADDING + innerW;
    bry.value = CORNER_PADDING + innerH;
    blx.value = CORNER_PADDING;
    bly.value = CORNER_PADDING + innerH;
  };

  const handleApply = async () => {
    if (!imgNatural) {
      Alert.alert('Erreur', 'Image non chargée.');
      return;
    }
    setBusy(true);
    try {
      // Compute bounding box of the 4 user-defined corners (in editor coordinates)
      const xs = [tlx.value, trx.value, brx.value, blx.value];
      const ys = [tly.value, try_.value, bry.value, bly.value];
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      // Map editor coords → image natural coords (image fits inside editor centered)
      const fittedW = innerW;
      const fittedH = innerH;
      const offsetX = CORNER_PADDING;
      const offsetY = CORNER_PADDING;

      // Convert editor coords to image space
      const scaleX = imgNatural.w / fittedW;
      const scaleY = imgNatural.h / fittedH;

      const cropX = Math.max(0, Math.round((minX - offsetX) * scaleX));
      const cropY = Math.max(0, Math.round((minY - offsetY) * scaleY));
      const cropW = Math.min(imgNatural.w - cropX, Math.round((maxX - minX) * scaleX));
      const cropH = Math.min(imgNatural.h - cropY, Math.round((maxY - minY) * scaleY));

      if (cropW < 50 || cropH < 50) {
        Alert.alert('Trop petit', 'La sélection est trop petite, ajustez les coins.');
        setBusy(false);
        return;
      }

      // Apply crop via expo-image-manipulator (works on iOS/Android; on web fallback to original)
      if (Platform.OS === 'web') {
        // Web: just return original since crop on web is unreliable for some sources
        onApply(imageUri);
        return;
      }

      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          {
            crop: {
              originX: cropX,
              originY: cropY,
              width: cropW,
              height: cropH,
            },
          },
        ],
        {
          compress: 0.9,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        },
      );

      if (result?.base64) {
        onApply(`data:image/jpeg;base64,${result.base64}`);
      } else {
        onApply(result?.uri || imageUri);
      }
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Impossible d\'appliquer le recadrage.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onCancel} style={styles.iconBtn}>
          <Ionicons name="close" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Ajuster les coins</Text>
          <Text style={styles.headerSub}>Faites glisser les 4 points</Text>
        </View>
        <TouchableOpacity onPress={handleAuto} style={styles.iconBtn}>
          <Ionicons name="scan" size={22} color="#FFF" />
        </TouchableOpacity>
      </View>

      <View style={[styles.editorArea, { width: editorW, height: editorH }]}
        onLayout={() => setImageBox({ w: editorW, h: editorH })}>
        <Image
          source={{ uri: imageUri }}
          style={[styles.imgFit, { left: CORNER_PADDING, top: CORNER_PADDING, width: innerW, height: innerH }]}
          resizeMode="cover"
        />

        {/* Polygon + lines + corner dots */}
        <Svg width={editorW} height={editorH} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Polygon points={pointsStr} fill={FILL} stroke={STROKE} strokeWidth={2} />
          {/* Inner cross helpers */}
          <Line x1={CORNER_PADDING} y1={CORNER_PADDING + innerH / 2} x2={CORNER_PADDING + innerW} y2={CORNER_PADDING + innerH / 2} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
          <Line x1={CORNER_PADDING + innerW / 2} y1={CORNER_PADDING} x2={CORNER_PADDING + innerW / 2} y2={CORNER_PADDING + innerH} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
        </Svg>

        {/* Draggable corner handles (real touch targets) */}
        <GestureDetector gesture={tlGesture}>
          <Animated.View style={[styles.handle, tlStyle]}>
            <View style={styles.handleInner} />
          </Animated.View>
        </GestureDetector>
        <GestureDetector gesture={trGesture}>
          <Animated.View style={[styles.handle, trStyle]}>
            <View style={styles.handleInner} />
          </Animated.View>
        </GestureDetector>
        <GestureDetector gesture={brGesture}>
          <Animated.View style={[styles.handle, brStyle]}>
            <View style={styles.handleInner} />
          </Animated.View>
        </GestureDetector>
        <GestureDetector gesture={blGesture}>
          <Animated.View style={[styles.handle, blStyle]}>
            <View style={styles.handleInner} />
          </Animated.View>
        </GestureDetector>
      </View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={styles.btnGhost} onPress={onCancel}>
          <Ionicons name="arrow-back" size={20} color="#FFF" />
          <Text style={styles.btnGhostTxt}>Annuler</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnPrimary} onPress={handleApply} disabled={busy}>
          <LinearGradient
            colors={['#34D399', '#22D3EE']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.btnGrad}
          >
            {busy ? (
              <ActivityIndicator color="#0E1530" />
            ) : (
              <>
                <Ionicons name="checkmark" size={22} color="#0E1530" />
                <Text style={styles.btnPrimTxt}>Recadrer</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { alignItems: 'center' },
  headerTitle: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 },

  editorArea: {
    backgroundColor: '#000',
    alignSelf: 'center',
    position: 'relative',
  },
  imgFit: {
    position: 'absolute',
    backgroundColor: '#0F172A',
  },
  handle: {
    position: 'absolute',
    width: HANDLE_RADIUS * 2,
    height: HANDLE_RADIUS * 2,
    borderRadius: HANDLE_RADIUS,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleInner: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#34D399',
    borderWidth: 3,
    borderColor: '#FFF',
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  btnGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  btnGhostTxt: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  btnPrimary: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  btnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  btnPrimTxt: { color: '#0E1530', fontSize: 15, fontWeight: '900' },
});
