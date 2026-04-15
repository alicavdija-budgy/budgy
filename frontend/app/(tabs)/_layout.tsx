/**
 * GUARDIAN MONEY CHF - Tab Layout
 * 5 main tabs: Home, Expenses, Savings, Analysis, More
 * Central floating scanner button
 */

import React, { useState } from 'react';
import { Tabs } from 'expo-router';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useStore } from '../../src/stores/useStore';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const [scannerVisible, setScannerVisible] = useState(false);
  const { transactions, addTransaction, isPro } = useStore();

  const handleScan = () => {
    // Simulate OCR scan - adds a random expense
    const stores = [
      { title: 'Migros', category: 'courses', min: 20, max: 120 },
      { title: 'Coop', category: 'courses', min: 15, max: 80 },
      { title: 'Denner', category: 'courses', min: 10, max: 60 },
      { title: 'Pharmacie', category: 'sante', min: 15, max: 80 },
      { title: 'Restaurant', category: 'restaurant', min: 25, max: 100 },
    ];
    const store = stores[Math.floor(Math.random() * stores.length)];
    const amount = Math.round((Math.random() * (store.max - store.min) + store.min) * 100) / 100;
    const now = new Date();
    
    addTransaction({
      id: `tx_${Date.now()}`,
      title: store.title,
      amount,
      date: now.toLocaleDateString('fr-CH'),
      category: store.category,
      note: 'Ajouté via scan',
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
      synced: false,
    });
    
    setScannerVisible(false);
  };

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: Colors.backgroundSecondary,
            borderTopColor: Colors.cardBorder,
            borderTopWidth: 1,
            height: 70 + insets.bottom,
            paddingBottom: insets.bottom,
            paddingTop: 8,
          },
          tabBarActiveTintColor: Colors.primary,
          tabBarInactiveTintColor: Colors.textTertiary,
          tabBarLabelStyle: {
            fontSize: FontSizes.xs,
            fontWeight: FontWeights.semibold,
            marginTop: 2,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Accueil',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="expenses"
          options={{
            title: 'Dépenses',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'arrow-down-circle' : 'arrow-down-circle-outline'} size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="scanner"
          options={{
            title: '',
            tabBarButton: () => (
              <View style={styles.scannerButtonContainer}>
                <TouchableOpacity
                  onPress={() => setScannerVisible(true)}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={Colors.gradientPrimary as [string, string]}
                    style={styles.scannerButton}
                  >
                    <Ionicons name="scan" size={28} color={Colors.text} />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="savings"
          options={{
            title: 'Épargne',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'flag' : 'flag-outline'} size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: 'Plus',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'grid' : 'grid-outline'} size={24} color={color} />
            ),
          }}
        />
      </Tabs>

      {/* Scanner Modal */}
      <Modal
        visible={scannerVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setScannerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.scannerModal}>
            <View style={styles.scannerHeader}>
              <Text style={styles.scannerTitle}>Scanner un ticket</Text>
              <TouchableOpacity onPress={() => setScannerVisible(false)}>
                <Ionicons name="close" size={28} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.scannerPreview}>
              <View style={styles.scannerFrame}>
                <View style={[styles.corner, styles.topLeft]} />
                <View style={[styles.corner, styles.topRight]} />
                <View style={[styles.corner, styles.bottomLeft]} />
                <View style={[styles.corner, styles.bottomRight]} />
              </View>
              <Text style={styles.scannerHint}>Placez votre ticket dans le cadre</Text>
            </View>

            <View style={styles.scannerActions}>
              <TouchableOpacity
                style={styles.captureButton}
                onPress={handleScan}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={Colors.gradientPrimary as [string, string]}
                  style={styles.captureGradient}
                >
                  <Ionicons name="camera" size={32} color={Colors.text} />
                </LinearGradient>
              </TouchableOpacity>
              <Text style={styles.captureHint}>Appuyez pour capturer</Text>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scannerButtonContainer: {
    position: 'absolute',
    top: -20,
    left: '50%',
    marginLeft: -30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'flex-end',
  },
  scannerModal: {
    backgroundColor: Colors.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    padding: Spacing.xl,
    paddingBottom: Platform.OS === 'ios' ? 40 : Spacing.xl,
  },
  scannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  scannerTitle: {
    color: Colors.text,
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
  },
  scannerPreview: {
    aspectRatio: 4 / 3,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
    overflow: 'hidden',
  },
  scannerFrame: {
    width: '70%',
    aspectRatio: 1.5,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: Colors.primary,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 8,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 8,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 8,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 8,
  },
  scannerHint: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    marginTop: Spacing.xl,
  },
  scannerActions: {
    alignItems: 'center',
  },
  captureButton: {
    marginBottom: Spacing.md,
  },
  captureGradient: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureHint: {
    color: Colors.textTertiary,
    fontSize: FontSizes.sm,
  },
});
