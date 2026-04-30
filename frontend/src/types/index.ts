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

export type HouseholdType = 'single' | 'couple' | 'family' | 'single_parent';

export interface UserPreferences {
  language: 'fr' | 'de' | 'en' | 'it' | 'es' | 'ru' | 'bs' | 'pt';
  currency: 'CHF' | 'EUR' | 'USD' | 'GBP' | 'RUB' | 'BAM' | 'BRL';
  canton: CantonCode;
  onboarded: boolean;
  theme: 'dark' | 'light';
  themeMode?: 'dark' | 'light' | 'system';  // NEW: user-selected theme mode
  biometricEnabled: boolean;
  monthlyIncome?: number;          // Net monthly income (CHF)
  household?: HouseholdType;        // Situation familiale
  children?: number;                // Nombre d'enfants
  goals?: string[];                 // Objectifs sélectionnés
  employmentType?: 'employee' | 'self_employed' | 'student' | 'retired' | 'other';
}

export type PaymentMethod = 'cash' | 'card' | 'twint' | 'ebanking' | 'postfinance' | 'lsv' | 'other';

export interface Transaction {
  id: string;
  title: string;
  amount: number;
  date: string;
  category: string;
  paymentMethod?: PaymentMethod;
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

export type ReceiptType = 'ticket' | 'remboursement';

export interface Receipt {
  id: string;
  imageBase64: string;            // data URL
  merchant: string;
  amount: number;
  currency: string;
  date: string;                   // YYYY-MM-DD or display date
  category: string;
  type: ReceiptType;
  items?: string[];
  note?: string;
  transactionId?: string;         // linked transaction id
  createdAt: number;
}

export interface Invoice {
  id: string;
  title: string;
  issuer: string;
  amount: number;
  currency: string;
  dueDate?: string;
  invoiceDate?: string;
  iban?: string;
  reference?: string;
  category?: string;
  status: 'pending' | 'paid' | 'overdue';
  source: 'manual' | 'email' | 'scan';
  createdAt: number;
  paidAt?: number;
}

export interface SyncQueueItem {
  id: string;
  type: 'transaction' | 'income' | 'savings' | 'invoice' | 'receipt';
  action: 'add' | 'update' | 'delete';
  payload: any;
  createdAt: number;
  retries: number;
}

// ─── Documents Classeur ────────────────────────────────
export type DocumentCategory =
  | 'contracts'
  | 'insurance'
  | 'banking'
  | 'health'
  | 'tax'
  | 'identity'
  | 'other';

export interface PersonalDocument {
  id: string;
  title: string;
  category: DocumentCategory;
  imageBase64: string;        // data URL
  tags: string[];
  note?: string;
  expiresAt?: string;          // YYYY-MM-DD optional expiration
  createdAt: number;
  updatedAt: number;
}

// ─── Groups (shared expenses, Splitwise-like) ──────────
export interface GroupMember {
  id: string;
  name: string;
  color: string;
  email?: string;
  isMe?: boolean;
}

export type SplitMode = 'equal' | 'shares' | 'percentages' | 'exact';

export interface GroupExpense {
  id: string;
  groupId: string;
  title: string;
  amount: number;
  currency: string;
  paidBy: string;             // memberId
  splitMode: SplitMode;
  shares: Record<string, number>; // memberId → number (interpretation depends on splitMode)
  date: string;
  category?: string;
  note?: string;
  createdAt: number;
}

export type GroupSettlementStatus = 'pending' | 'settled';

export interface GroupSettlement {
  id: string;
  groupId: string;
  fromMember: string;
  toMember: string;
  amount: number;
  currency: string;
  status: GroupSettlementStatus;
  createdAt: number;
  settledAt?: number;
}

export interface ExpenseGroup {
  id: string;
  name: string;
  emoji: string;
  color: string;
  members: GroupMember[];
  currency: string;
  createdAt: number;
}

// ─── Security ──────────────────────────────────────────
export interface SecuritySettings {
  appLockEnabled: boolean;
  pinHash?: string;            // sha256 of PIN
  decoyPinHash?: string;       // panic code
  biometricEnabled: boolean;
  autoLockSeconds: number;     // background timeout
  lastUnlockAt?: number;
}
