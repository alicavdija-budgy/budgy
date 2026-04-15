/**
 * GUARDIAN MONEY CHF - Type Definitions
 */

import type { CantonCode } from '../data/swiss-data';

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: number;
  isPro: boolean;
  isDemo?: boolean;
}

export interface UserPreferences {
  language: 'fr' | 'de' | 'en' | 'it' | 'es' | 'ru' | 'bs' | 'pt';
  currency: 'CHF' | 'EUR' | 'USD' | 'GBP' | 'RUB' | 'BAM' | 'BRL';
  canton: CantonCode;
  onboarded: boolean;
  theme: 'dark' | 'light';
  biometricEnabled: boolean;
}

export interface Transaction {
  id: string;
  title: string;
  amount: number;
  date: string;
  category: string;
  note?: string;
  receipt?: string; // Base64 image
  createdAt: number;
  updatedAt: number;
  synced: boolean;
}

export interface ProExpense extends Transaction {
  justification: string;
  tva: number;
  client?: string;
}

export interface Income {
  id: string;
  title: string;
  amount: number;
  type: 'recurring' | 'occasional';
  frequency?: 'monthly' | 'quarterly' | 'yearly';
  category: string;
  color: string;
  icon: string;
  createdAt: number;
}

export interface SavingsGoal {
  id: string;
  title: string;
  emoji: string;
  target: number;
  saved: number;
  color: string;
  category: string;
  deadline?: string;
  autoSave: number; // Monthly auto-save amount
  tip?: string;
  createdAt: number;
}

export interface Budget {
  id: string;
  category: string;
  limit: number;
  color: string;
  createdAt: number;
}

export interface RecurringExpense {
  id: string;
  title: string;
  amount: number;
  category: string;
  frequency: 'monthly' | 'yearly';
  dayOfMonth: number;
  color: string;
  active: boolean;
  createdAt: number;
}

export interface Contract {
  id: string;
  title: string;
  amount: number;
  expirationDate: string;
  urgent: boolean;
  category: string;
  createdAt: number;
}

export interface Debt {
  id: string;
  title: string;
  total: number;
  paid: number;
  interestRate: number;
  monthlyPayment: number;
  color: string;
  createdAt: number;
}

export interface Investment {
  id: string;
  title: string;
  type: 'ETF' | 'Stock' | 'Crypto' | 'Bond' | 'Fund' | 'Other';
  quantity: number;
  buyPrice: number;
  currentPrice: number;
  currency: string;
  color: string;
  createdAt: number;
}

export interface Notification {
  id: string;
  type: 'urgent' | 'tip' | 'goal' | 'alert';
  title: string;
  subtitle: string;
  icon: string;
  read: boolean;
  createdAt: number;
}

export interface PredictionResult {
  category: string;
  predicted: number;
  confidence: number;
  range: [number, number];
  trend: 'up' | 'down' | 'stable';
}

export interface Alert {
  id: string;
  type: 'budget_exceeded' | 'anomaly' | 'goal_reached' | 'contract_expiring';
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  createdAt: number;
  dismissed: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}
