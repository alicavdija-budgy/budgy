/**
 * GUARDIAN MONEY CHF - Global State Store
 * Using Zustand with MMKV persistence
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  User,
  UserPreferences,
  Transaction,
  ProExpense,
  Income,
  SavingsGoal,
  Budget,
  RecurringExpense,
  Contract,
  Debt,
  Investment,
  Notification,
  ChatMessage,
  Receipt,
  Invoice,
  SyncQueueItem,
  PersonalDocument,
  ExpenseGroup,
  GroupExpense,
  GroupSettlement,
  SecuritySettings,
} from '../types';
import { SEED_DATA } from '../data/seed-data';

interface AppState {
  // Auth
  user: User | null;
  isAuthenticated: boolean;
  
  // Preferences
  preferences: UserPreferences;
  
  // Financial data
  transactions: Transaction[];
  proExpenses: ProExpense[];
  incomes: Income[];
  savingsGoals: SavingsGoal[];
  budgets: Budget[];
  recurringExpenses: RecurringExpense[];
  contracts: Contract[];
  debts: Debt[];
  investments: Investment[];
  
  // Notifications & Chat
  notifications: Notification[];
  chatHistory: ChatMessage[];

  // Receipts (scanned tickets)
  receipts: Receipt[];

  // Invoices (factures from email/manual)
  invoices: Invoice[];

  // Offline sync queue
  syncQueue: SyncQueueItem[];
  isOnline: boolean;
  
  // UI state
  isPro: boolean;
  
  // Actions
  setUser: (user: User | null) => void;
  setPreferences: (prefs: Partial<UserPreferences>) => void;
  setPro: (isPro: boolean) => void;
  
  // Transaction actions
  addTransaction: (tx: Transaction) => void;
  updateTransaction: (id: string, tx: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
  
  // Pro expense actions
  addProExpense: (expense: ProExpense) => void;
  deleteProExpense: (id: string) => void;
  
  // Income actions
  addIncome: (income: Income) => void;
  updateIncome: (id: string, income: Partial<Income>) => void;
  deleteIncome: (id: string) => void;
  
  // Savings actions
  addSavingsGoal: (goal: SavingsGoal) => void;
  updateSavingsGoal: (id: string, goal: Partial<SavingsGoal>) => void;
  deleteSavingsGoal: (id: string) => void;
  depositToGoal: (id: string, amount: number) => void;
  
  // Budget actions
  addBudget: (budget: Budget) => void;
  updateBudget: (id: string, budget: Partial<Budget>) => void;
  deleteBudget: (id: string) => void;
  
  // Recurring expense actions
  addRecurringExpense: (expense: RecurringExpense) => void;
  updateRecurringExpense: (id: string, expense: Partial<RecurringExpense>) => void;
  toggleRecurringExpense: (id: string) => void;
  deleteRecurringExpense: (id: string) => void;
  
  // Contract actions
  addContract: (contract: Contract) => void;
  updateContract: (id: string, contract: Partial<Contract>) => void;
  deleteContract: (id: string) => void;
  
  // Debt actions
  addDebt: (debt: Debt) => void;
  updateDebt: (id: string, debt: Partial<Debt>) => void;
  deleteDebt: (id: string) => void;
  
  // Investment actions
  addInvestment: (investment: Investment) => void;
  updateInvestment: (id: string, investment: Partial<Investment>) => void;
  deleteInvestment: (id: string) => void;
  
  // Notification actions
  addNotification: (notification: Notification) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
  
  // Chat actions
  addChatMessage: (message: ChatMessage) => void;
  clearChatHistory: () => void;

  // Receipt actions
  addReceipt: (receipt: Receipt) => void;
  deleteReceipt: (id: string) => void;
  updateReceipt: (id: string, receipt: Partial<Receipt>) => void;

  // Invoice actions
  addInvoice: (invoice: Invoice) => void;
  updateInvoice: (id: string, invoice: Partial<Invoice>) => void;
  deleteInvoice: (id: string) => void;
  markInvoicePaid: (id: string) => void;

  // Sync queue
  enqueueSync: (item: Omit<SyncQueueItem, 'id' | 'createdAt' | 'retries'>) => void;
  removeFromQueue: (id: string) => void;
  setOnline: (online: boolean) => void;

  // Documents
  documents: PersonalDocument[];
  addDocument: (doc: PersonalDocument) => void;
  updateDocument: (id: string, doc: Partial<PersonalDocument>) => void;
  deleteDocument: (id: string) => void;

  // Groups
  groups: ExpenseGroup[];
  groupExpenses: GroupExpense[];
  groupSettlements: GroupSettlement[];
  addGroup: (group: ExpenseGroup) => void;
  updateGroup: (id: string, group: Partial<ExpenseGroup>) => void;
  deleteGroup: (id: string) => void;
  addGroupExpense: (expense: GroupExpense) => void;
  deleteGroupExpense: (id: string) => void;
  addGroupSettlement: (settlement: GroupSettlement) => void;
  markSettlementPaid: (id: string) => void;

  // Security
  security: SecuritySettings;
  setSecurity: (settings: Partial<SecuritySettings>) => void;
  isLocked: boolean;
  setLocked: (locked: boolean) => void;
  isDecoyMode: boolean;
  setDecoyMode: (decoy: boolean) => void;

  // Data management
  loadSeedData: () => void;
  clearAllData: () => void;
  logout: () => void;
}

const defaultPreferences: UserPreferences = {
  language: 'fr',
  currency: 'CHF',
  canton: 'VD',
  onboarded: false,
  theme: 'dark',
  biometricEnabled: false,
};

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      isAuthenticated: false,
      preferences: defaultPreferences,
      transactions: [],
      proExpenses: [],
      incomes: [],
      savingsGoals: [],
      budgets: [],
      recurringExpenses: [],
      contracts: [],
      debts: [],
      investments: [],
      notifications: [],
      chatHistory: [],
      receipts: [],
      invoices: [],
      syncQueue: [],
      isOnline: true,
      isPro: false,
      documents: [],
      groups: [],
      groupExpenses: [],
      groupSettlements: [],
      security: {
        appLockEnabled: false,
        biometricEnabled: false,
        autoLockSeconds: 60,
      },
      isLocked: false,
      isDecoyMode: false,
      
      // Auth actions
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      
      setPreferences: (prefs) => set((state) => ({
        preferences: { ...state.preferences, ...prefs },
      })),
      
      setPro: (isPro) => set({ isPro }),
      
      // Transaction actions
      addTransaction: (tx) => set((state) => ({
        transactions: [tx, ...state.transactions],
      })),
      
      updateTransaction: (id, tx) => set((state) => ({
        transactions: state.transactions.map((t) =>
          t.id === id ? { ...t, ...tx, updatedAt: Date.now() } : t
        ),
      })),
      
      deleteTransaction: (id) => set((state) => ({
        transactions: state.transactions.filter((t) => t.id !== id),
      })),
      
      // Pro expense actions
      addProExpense: (expense) => set((state) => ({
        proExpenses: [expense, ...state.proExpenses],
      })),
      
      deleteProExpense: (id) => set((state) => ({
        proExpenses: state.proExpenses.filter((e) => e.id !== id),
      })),
      
      // Income actions
      addIncome: (income) => set((state) => ({
        incomes: [income, ...state.incomes],
      })),
      
      updateIncome: (id, income) => set((state) => ({
        incomes: state.incomes.map((i) => (i.id === id ? { ...i, ...income } : i)),
      })),
      
      deleteIncome: (id) => set((state) => ({
        incomes: state.incomes.filter((i) => i.id !== id),
      })),
      
      // Savings actions
      addSavingsGoal: (goal) => set((state) => ({
        savingsGoals: [goal, ...state.savingsGoals],
      })),
      
      updateSavingsGoal: (id, goal) => set((state) => ({
        savingsGoals: state.savingsGoals.map((g) =>
          g.id === id ? { ...g, ...goal } : g
        ),
      })),
      
      deleteSavingsGoal: (id) => set((state) => ({
        savingsGoals: state.savingsGoals.filter((g) => g.id !== id),
      })),
      
      depositToGoal: (id, amount) => set((state) => ({
        savingsGoals: state.savingsGoals.map((g) =>
          g.id === id ? { ...g, saved: Math.min(g.saved + amount, g.target) } : g
        ),
      })),
      
      // Budget actions
      addBudget: (budget) => set((state) => ({
        budgets: [budget, ...state.budgets.filter((b) => b.category !== budget.category)],
      })),
      
      updateBudget: (id, budget) => set((state) => ({
        budgets: state.budgets.map((b) => (b.id === id ? { ...b, ...budget } : b)),
      })),
      
      deleteBudget: (id) => set((state) => ({
        budgets: state.budgets.filter((b) => b.id !== id),
      })),
      
      // Recurring expense actions
      addRecurringExpense: (expense) => set((state) => ({
        recurringExpenses: [expense, ...state.recurringExpenses],
      })),
      
      updateRecurringExpense: (id, expense) => set((state) => ({
        recurringExpenses: state.recurringExpenses.map((e) =>
          e.id === id ? { ...e, ...expense } : e
        ),
      })),
      
      toggleRecurringExpense: (id) => set((state) => ({
        recurringExpenses: state.recurringExpenses.map((e) =>
          e.id === id ? { ...e, active: !e.active } : e
        ),
      })),
      
      deleteRecurringExpense: (id) => set((state) => ({
        recurringExpenses: state.recurringExpenses.filter((e) => e.id !== id),
      })),
      
      // Contract actions
      addContract: (contract) => set((state) => ({
        contracts: [contract, ...state.contracts],
      })),
      
      updateContract: (id, contract) => set((state) => ({
        contracts: state.contracts.map((c) =>
          c.id === id ? { ...c, ...contract } : c
        ),
      })),
      
      deleteContract: (id) => set((state) => ({
        contracts: state.contracts.filter((c) => c.id !== id),
      })),
      
      // Debt actions
      addDebt: (debt) => set((state) => ({
        debts: [debt, ...state.debts],
      })),
      
      updateDebt: (id, debt) => set((state) => ({
        debts: state.debts.map((d) =>
          d.id === id ? { ...d, ...debt } : d
        ),
      })),
      
      deleteDebt: (id) => set((state) => ({
        debts: state.debts.filter((d) => d.id !== id),
      })),
      
      // Investment actions
      addInvestment: (investment) => set((state) => ({
        investments: [investment, ...state.investments],
      })),
      
      updateInvestment: (id, investment) => set((state) => ({
        investments: state.investments.map((i) =>
          i.id === id ? { ...i, ...investment } : i
        ),
      })),
      
      deleteInvestment: (id) => set((state) => ({
        investments: state.investments.filter((i) => i.id !== id),
      })),
      
      // Notification actions
      addNotification: (notification) => set((state) => ({
        notifications: [notification, ...state.notifications],
      })),
      
      markNotificationRead: (id) => set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n
        ),
      })),
      
      clearNotifications: () => set({ notifications: [] }),
      
      // Chat actions
      addChatMessage: (message) => set((state) => ({
        chatHistory: [...state.chatHistory, message],
      })),
      
      clearChatHistory: () => set({ chatHistory: [] }),

      // Receipt actions
      addReceipt: (receipt) => set((state) => ({
        receipts: [receipt, ...state.receipts],
      })),
      deleteReceipt: (id) => set((state) => ({
        receipts: state.receipts.filter((r) => r.id !== id),
      })),
      updateReceipt: (id, receipt) => set((state) => ({
        receipts: state.receipts.map((r) => (r.id === id ? { ...r, ...receipt } : r)),
      })),

      // Invoice actions
      addInvoice: (invoice) => set((state) => ({
        invoices: [invoice, ...state.invoices],
      })),
      updateInvoice: (id, invoice) => set((state) => ({
        invoices: state.invoices.map((i) => (i.id === id ? { ...i, ...invoice } : i)),
      })),
      deleteInvoice: (id) => set((state) => ({
        invoices: state.invoices.filter((i) => i.id !== id),
      })),
      markInvoicePaid: (id) => set((state) => ({
        invoices: state.invoices.map((i) =>
          i.id === id ? { ...i, status: 'paid' as const, paidAt: Date.now() } : i
        ),
      })),

      // Sync queue
      enqueueSync: (item) => set((state) => ({
        syncQueue: [
          ...state.syncQueue,
          {
            ...item,
            id: `sq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            createdAt: Date.now(),
            retries: 0,
          },
        ],
      })),
      removeFromQueue: (id) => set((state) => ({
        syncQueue: state.syncQueue.filter((q) => q.id !== id),
      })),
      setOnline: (online) => set({ isOnline: online }),

      // Documents
      addDocument: (doc) => set((s) => ({ documents: [doc, ...s.documents] })),
      updateDocument: (id, doc) =>
        set((s) => ({
          documents: s.documents.map((d) => (d.id === id ? { ...d, ...doc, updatedAt: Date.now() } : d)),
        })),
      deleteDocument: (id) =>
        set((s) => ({ documents: s.documents.filter((d) => d.id !== id) })),

      // Groups
      addGroup: (group) => set((s) => ({ groups: [group, ...s.groups] })),
      updateGroup: (id, group) =>
        set((s) => ({
          groups: s.groups.map((g) => (g.id === id ? { ...g, ...group } : g)),
        })),
      deleteGroup: (id) =>
        set((s) => ({
          groups: s.groups.filter((g) => g.id !== id),
          groupExpenses: s.groupExpenses.filter((e) => e.groupId !== id),
          groupSettlements: s.groupSettlements.filter((set) => set.groupId !== id),
        })),
      addGroupExpense: (expense) =>
        set((s) => ({ groupExpenses: [expense, ...s.groupExpenses] })),
      deleteGroupExpense: (id) =>
        set((s) => ({ groupExpenses: s.groupExpenses.filter((e) => e.id !== id) })),
      addGroupSettlement: (settlement) =>
        set((s) => ({ groupSettlements: [settlement, ...s.groupSettlements] })),
      markSettlementPaid: (id) =>
        set((s) => ({
          groupSettlements: s.groupSettlements.map((st) =>
            st.id === id ? { ...st, status: 'settled' as const, settledAt: Date.now() } : st
          ),
        })),

      // Security
      setSecurity: (settings) =>
        set((s) => ({ security: { ...s.security, ...settings } })),
      setLocked: (locked) => set({ isLocked: locked }),
      setDecoyMode: (decoy) => set({ isDecoyMode: decoy }),
      
      // Data management
      loadSeedData: () => set({
        transactions: SEED_DATA.transactions,
        proExpenses: SEED_DATA.proExpenses,
        incomes: SEED_DATA.incomes,
        savingsGoals: SEED_DATA.savingsGoals,
        budgets: SEED_DATA.budgets,
        recurringExpenses: SEED_DATA.recurringExpenses,
        contracts: SEED_DATA.contracts,
        debts: SEED_DATA.debts,
        investments: SEED_DATA.investments,
        notifications: SEED_DATA.notifications,
      }),
      
      clearAllData: () => set({
        user: null,
        isAuthenticated: false,
        preferences: defaultPreferences,
        transactions: [],
        proExpenses: [],
        incomes: [],
        savingsGoals: [],
        budgets: [],
        recurringExpenses: [],
        contracts: [],
        debts: [],
        investments: [],
        notifications: [],
        chatHistory: [],
        receipts: [],
        invoices: [],
        syncQueue: [],
        documents: [],
        groups: [],
        groupExpenses: [],
        groupSettlements: [],
        isPro: false,
      }),
      
      logout: () => set({
        user: null,
        isAuthenticated: false,
        isPro: false, // v3.9.0 Build 74: never leak Pro across accounts
        preferences: { ...get().preferences, onboarded: false },
      }),
    }),
    {
      name: 'guardian-money-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
