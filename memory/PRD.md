# Guardian Money CHF v3.2 - PRD

## App Overview
Swiss personal finance app for iOS/Android with Expo + React Native.
Supabase integration for auth and cloud sync.

## Key Updates v3.2
- Supabase Auth (email/password) with cloud sync ready
- LAMal Comparator with 15 real insurer names from Priminfo 2026 (OFSP/BAG)
- Payment methods: Carte, Cash, TWINT, E-Banking, PostFinance, LSV/DD
- Neutral insurer presentation (no advertising)

## Modules
1. Auth - Supabase Auth + local fallback + Demo mode
2. Onboarding - 4 slides + canton + currency + goals
3. Dashboard - Patrimoine, Guardian Score, notifications, quick actions
4. Dépenses - Daily/Pro/Contracts with payment method tracking
5. Épargne - 12 templates, auto-save, deposits
6. Swiss Tax Optimizer - IFD + ICC for 15 cantons, 3rd pillar
7. Comparateur LAMal Priminfo 2026 - 15 assureurs, 26 cantons, subsidies
8. Guardian Predict IA - Predictions, alerts, coach
9. Budgets, Récurrents, Dettes, Settings, Subscription

## Payment Methods
- Carte bancaire, Cash, TWINT, E-Banking, PostFinance, LSV/DD, Autre

## Supabase Config
- URL: https://srv1597561.hstgr.cloud
- Tables: user_preferences, transactions, incomes, savings_goals, budgets, recurring_expenses, contracts, debts, investments
- RLS enabled on all tables
