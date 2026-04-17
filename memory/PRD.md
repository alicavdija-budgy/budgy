# Guardian Money CHF v3.1 - PRD

## App Overview
Swiss personal finance app for iOS/Android with Expo + React Native.
Supabase integration for auth and cloud sync.

## Key Updates v3.1
- Supabase Auth (email/password registration + login)
- Cloud sync ready (tables schema provided)
- LAMal Comparator uses official Priminfo 2026 data (OFSP/BAG)
- No insurer advertising - neutral data presentation
- Top 10 cheapest premiums view

## Modules
1. Auth & Onboarding - Supabase Auth + local fallback
2. Dashboard - Patrimoine, Guardian Score, notifications
3. Dépenses - Daily/Pro/Contracts with TVA 8.1%
4. Épargne - 12 templates, auto-save, deposits
5. Swiss Tax Optimizer - IFD + ICC for 15 cantons, 3rd pillar
6. Comparateur LAMal Priminfo 2026 - 26 cantons, all franchises, subsidy calculator
7. Guardian Predict IA - Predictions, alerts, coach
8. Budgets, Récurrents, Dettes, Settings, Subscription

## Tech Stack
- React Native + Expo SDK 54 (Expo Router)
- Supabase (Auth + Database)
- Zustand + AsyncStorage for offline state
- Official BAG/OFSP Priminfo 2026 data

## Supabase Tables (to create via SQL editor)
- user_preferences
- transactions
- incomes
- savings_goals
- budgets
- recurring_expenses
All with RLS policies (users see only their own data)
