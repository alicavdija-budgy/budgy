/**
 * GUARDIAN MONEY CHF - Category Icon Component
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../../data/swiss-data';
import { Colors, BorderRadius, Spacing } from '../../constants/theme';

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  courses: 'cart',
  loisirs: 'game-controller',
  sante: 'medkit',
  restaurant: 'restaurant',
  transport: 'bus',
  shopping: 'bag',
  abonnements: 'refresh',
  maison: 'home',
  education: 'school',
  sport: 'fitness',
  autre: 'ellipsis-horizontal',
  transport_pro: 'train',
  repas_affaires: 'wine',
  hebergement: 'bed',
  telecoms: 'call',
  loyer: 'business',
  salaire: 'briefcase',
  freelance: 'color-palette',
  dividendes: 'trending-up',
  bonus: 'gift',
};

const CATEGORY_COLORS: Record<string, string> = {
  courses: '#10B981',
  loisirs: '#8B5CF6',
  sante: '#EF4444',
  restaurant: '#F97316',
  transport: '#3B82F6',
  shopping: '#EC4899',
  abonnements: '#6B7280',
  maison: '#14B8A6',
  education: '#0EA5E9',
  sport: '#22C55E',
  autre: '#6B7280',
  transport_pro: '#6366F1',
  repas_affaires: '#F59E0B',
  hebergement: '#10B981',
  telecoms: '#0EA5E9',
  loyer: '#6366F1',
  salaire: '#10B981',
  freelance: '#F59E0B',
  dividendes: '#6366F1',
  bonus: '#EC4899',
};

interface CategoryIconProps {
  category: string;
  size?: 'sm' | 'md' | 'lg';
  showBackground?: boolean;
}

export function CategoryIcon({ category, size = 'md', showBackground = true }: CategoryIconProps) {
  const icon = CATEGORY_ICONS[category] || 'ellipsis-horizontal';
  const color = CATEGORY_COLORS[category] || Colors.textSecondary;
  
  const getSize = () => {
    switch (size) {
      case 'sm':
        return { iconSize: 16, containerSize: 32 };
      case 'lg':
        return { iconSize: 28, containerSize: 56 };
      default:
        return { iconSize: 20, containerSize: 40 };
    }
  };

  const { iconSize, containerSize } = getSize();

  if (!showBackground) {
    return <Ionicons name={icon} size={iconSize} color={color} />;
  }

  return (
    <View
      style={[
        styles.container,
        {
          width: containerSize,
          height: containerSize,
          borderRadius: containerSize / 2,
          backgroundColor: `${color}20`,
        },
      ]}
    >
      <Ionicons name={icon} size={iconSize} color={color} />
    </View>
  );
}

export function getCategoryName(categoryId: string): string {
  const expense = EXPENSE_CATEGORIES.find(c => c.id === categoryId);
  if (expense) return expense.name;
  
  const income = INCOME_CATEGORIES.find(c => c.id === categoryId);
  if (income) return income.name;
  
  return categoryId;
}

export function getCategoryColor(categoryId: string): string {
  return CATEGORY_COLORS[categoryId] || Colors.textSecondary;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
