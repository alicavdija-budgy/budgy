/**
 * GUARDIAN MONEY CHF - Scanner Placeholder
 * This is just a placeholder for the tab - actual scanner is in the modal
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSizes } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import type { ThemePalette } from '../../src/constants/palettes';

export default function ScannerScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Scanner</Text>
    </View>
  );
}

const makeStyles = (Colors: ThemePalette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: Colors.textSecondary,
    fontSize: FontSizes.md,
  },
});
