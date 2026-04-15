/**
 * GUARDIAN MONEY CHF - Scanner Placeholder
 * This is just a placeholder for the tab - actual scanner is in the modal
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSizes } from '../../src/constants/theme';

export default function ScannerScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Scanner</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
