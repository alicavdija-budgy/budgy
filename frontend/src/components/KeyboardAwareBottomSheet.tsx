/**
 * BUDGY — KeyboardAwareBottomSheet
 *
 * A reusable bottom-sheet style wrapper that:
 *   - Keeps form buttons visible above the iOS keyboard
 *   - Lets users scroll the content if the form is long
 *   - Tap-outside-to-dismiss-keyboard behaviour
 *   - Subtle drag-handle for premium feel
 *
 * Usage:
 *   <KeyboardAwareBottomSheet visible={open} onClose={() => setOpen(false)}>
 *     ... form content ...
 *   </KeyboardAwareBottomSheet>
 */
import React from 'react';
import {
  Modal,
  View,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  StyleSheet,
  TouchableWithoutFeedback,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, BorderRadius, Spacing } from '../constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /**
   * Maximum height of the sheet relative to the screen height.
   * Default: 0.92 (92%). Lower this if the form is short.
   */
  maxHeightRatio?: number;
}

export function KeyboardAwareBottomSheet({
  visible,
  onClose,
  children,
  maxHeightRatio = 0.92,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      // iOS: present as form sheet style for native feel
      presentationStyle="overFullScreen"
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <KeyboardAvoidingView
          style={styles.kavWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          // Slight offset so buttons sit just above the keyboard
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          {/* Stop the press from bubbling up and closing the sheet */}
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.sheet,
              {
                maxHeight: `${Math.round(maxHeightRatio * 100)}%` as any,
                paddingBottom: Math.max(insets.bottom, 16),
              },
            ]}
          >
            <View style={styles.handle} />
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.scrollContent}
                style={styles.scroll}
              >
                {children}
              </ScrollView>
            </TouchableWithoutFeedback>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  kavWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.cardBorder,
    marginBottom: Spacing.md,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingBottom: Spacing.xl,
  },
});

export default KeyboardAwareBottomSheet;
