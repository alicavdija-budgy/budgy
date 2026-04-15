/**
 * GUARDIAN MONEY CHF - Seed Data
 * Pre-loaded demo data for new users
 */

import type {
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
} from '../types';

const NOW = Date.now();
const DAY = 86400000;

export const SEED_DATA = {
  transactions: [
    { id: 'd1', title: 'Migros Lausanne', amount: 87.40, date: '12.04.2025', category: 'courses', note: '', createdAt: NOW - DAY * 2, updatedAt: NOW - DAY * 2, synced: false },
    { id: 'd2', title: 'Netflix Premium', amount: 17.90, date: '11.04.2025', category: 'abonnements', note: '', createdAt: NOW - DAY * 3, updatedAt: NOW - DAY * 3, synced: false },
    { id: 'd3', title: 'Coop Pronto', amount: 23.50, date: '10.04.2025', category: 'courses', note: '', createdAt: NOW - DAY * 4, updatedAt: NOW - DAY * 4, synced: false },
    { id: 'd4', title: 'Pharmacie Amavita', amount: 34.50, date: '09.04.2025', category: 'sante', note: '', createdAt: NOW - DAY * 5, updatedAt: NOW - DAY * 5, synced: false },
    { id: 'd5', title: 'Restaurant Japonais', amount: 45.00, date: '08.04.2025', category: 'restaurant', note: '', createdAt: NOW - DAY * 6, updatedAt: NOW - DAY * 6, synced: false },
    { id: 'd6', title: 'Zalando', amount: 89.00, date: '07.04.2025', category: 'shopping', note: '', createdAt: NOW - DAY * 7, updatedAt: NOW - DAY * 7, synced: false },
  ] as Transaction[],
  
  proExpenses: [
    { id: 'p1', title: 'SBB CFF ZH→BE', amount: 124.00, date: '11.04.2025', category: 'transport_pro', justification: 'Réunion Helvetia SA', tva: 8.1, note: '', createdAt: NOW - DAY * 3, updatedAt: NOW - DAY * 3, synced: false },
    { id: 'p2', title: 'Swisscom Business', amount: 59.90, date: '09.04.2025', category: 'telecoms', justification: 'Abonnement pro mensuel', tva: 8.1, note: '', createdAt: NOW - DAY * 5, updatedAt: NOW - DAY * 5, synced: false },
    { id: 'p3', title: 'Restaurant La Coupole', amount: 187.50, date: '07.04.2025', category: 'repas_affaires', justification: 'Déjeuner client UBS', tva: 8.1, note: '', createdAt: NOW - DAY * 7, updatedAt: NOW - DAY * 7, synced: false },
  ] as ProExpense[],
  
  incomes: [
    { id: 'i1', title: 'Salaire UBS SA', amount: 6800, type: 'recurring', frequency: 'monthly', category: 'salaire', color: '#10B981', icon: 'briefcase', createdAt: NOW - DAY * 12 },
    { id: 'i2', title: 'Freelance Design', amount: 1200, type: 'occasional', frequency: undefined, category: 'freelance', color: '#F59E0B', icon: 'color-palette', createdAt: NOW - DAY * 6 },
    { id: 'i3', title: 'Dividendes SwissRe', amount: 340, type: 'occasional', frequency: 'quarterly', category: 'dividendes', color: '#6366F1', icon: 'trending-up', createdAt: NOW - DAY * 20 },
  ] as Income[],
  
  savingsGoals: [
    { id: 's1', title: 'Appartement Lausanne', emoji: '🏠', target: 80000, saved: 23400, color: '#6366F1', category: 'Immobilier', deadline: '2027', autoSave: 800, tip: 'Apport 20% requis en Suisse', createdAt: NOW - DAY * 60 },
    { id: 's2', title: 'Voyage Japon', emoji: '🗾', target: 4200, saved: 1860, color: '#F59E0B', category: 'Voyage', deadline: '2025-10', autoSave: 300, tip: 'Vol dès CHF 780 · Sakura mars-avril', createdAt: NOW - DAY * 30 },
    { id: 's3', title: "Fonds d'urgence", emoji: '🛡️', target: 15000, saved: 9800, color: '#EF4444', category: 'Sécurité', deadline: '2025-09', autoSave: 400, tip: '3 mois de salaire recommandé', createdAt: NOW - DAY * 45 },
    { id: 's4', title: 'Tesla Model 3', emoji: '⚡', target: 18000, saved: 5200, color: '#10B981', category: 'Véhicule', deadline: '2026', autoSave: 500, tip: 'Bonus écologique cantonal disponible', createdAt: NOW - DAY * 15 },
  ] as SavingsGoal[],
  
  budgets: [
    { id: 'bg1', category: 'courses', limit: 400, color: '#10B981', createdAt: NOW - DAY * 30 },
    { id: 'bg2', category: 'loisirs', limit: 200, color: '#8B5CF6', createdAt: NOW - DAY * 30 },
    { id: 'bg3', category: 'restaurant', limit: 150, color: '#F97316', createdAt: NOW - DAY * 30 },
    { id: 'bg4', category: 'shopping', limit: 250, color: '#EC4899', createdAt: NOW - DAY * 30 },
  ] as Budget[],
  
  recurringExpenses: [
    { id: 'r1', title: 'Netflix Premium', amount: 17.90, category: 'abonnements', frequency: 'monthly', dayOfMonth: 8, color: '#EF4444', active: true, createdAt: NOW - DAY * 90 },
    { id: 'r2', title: 'Spotify Family', amount: 16.90, category: 'abonnements', frequency: 'monthly', dayOfMonth: 15, color: '#1DB954', active: true, createdAt: NOW - DAY * 90 },
    { id: 'r3', title: 'Loyer appartement', amount: 1450, category: 'loyer', frequency: 'monthly', dayOfMonth: 1, color: '#6366F1', active: true, createdAt: NOW - DAY * 365 },
    { id: 'r4', title: 'Swisscom Mobile', amount: 45.00, category: 'telecoms', frequency: 'monthly', dayOfMonth: 5, color: '#0EA5E9', active: true, createdAt: NOW - DAY * 180 },
  ] as RecurringExpense[],
  
  contracts: [
    { id: 'c1', title: 'CSS Assurance Maladie', amount: 289.00, expirationDate: '31.12.2025', urgent: true, category: 'Santé', createdAt: NOW - DAY * 200 },
    { id: 'c2', title: 'Sunrise UPC Pro', amount: 49.90, expirationDate: '15.06.2025', urgent: false, category: 'Télécoms', createdAt: NOW - DAY * 100 },
  ] as Contract[],
  
  debts: [
    { id: 'db1', title: 'Prêt Auto Migros Bank', total: 12000, paid: 4800, interestRate: 3.9, monthlyPayment: 350, color: '#F97316', createdAt: NOW - DAY * 365 },
  ] as Debt[],
  
  investments: [
    { id: 'inv1', title: 'iShares SMI ETF', type: 'ETF', quantity: 12, buyPrice: 145.20, currentPrice: 158.40, currency: 'CHF', color: '#10B981', createdAt: NOW - DAY * 180 },
    { id: 'inv2', title: 'Nestlé SA', type: 'Stock', quantity: 5, buyPrice: 94.80, currentPrice: 88.20, currency: 'CHF', color: '#EF4444', createdAt: NOW - DAY * 120 },
    { id: 'inv3', title: 'Bitcoin BTC', type: 'Crypto', quantity: 0.08, buyPrice: 38000, currentPrice: 41200, currency: 'USD', color: '#F59E0B', createdAt: NOW - DAY * 90 },
    { id: 'inv4', title: 'Vanguard S&P500', type: 'ETF', quantity: 8, buyPrice: 420.50, currentPrice: 456.80, currency: 'USD', color: '#6366F1', createdAt: NOW - DAY * 200 },
  ] as Investment[],
  
  notifications: [
    { id: 'n1', type: 'urgent', title: 'CSS expire bientôt', subtitle: 'Comparez sur Priminfo.ch', icon: '⚠️', read: false, createdAt: NOW - 3600000 * 2 },
    { id: 'n2', type: 'tip', title: 'Économie détectée', subtitle: 'Netflix+Spotify: offre bundle?', icon: '💡', read: false, createdAt: NOW - 3600000 * 5 },
    { id: 'n3', type: 'goal', title: 'Épargne Japon: 44%!', subtitle: "Encore CHF 2'340", icon: '🗾', read: true, createdAt: NOW - DAY },
  ] as Notification[],
};
