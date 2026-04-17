# Guardian Money CHF v3.5 Final - PRD

## Complete Feature Set (15+ modules)

### Core
1. **Auth** — Supabase email/password + local fallback + Demo mode + "Cloud sync activé"
2. **Onboarding** — 4 slides + 26 cantons grid + 7 currencies + 6 goals
3. **Dashboard** — Patrimoine, Guardian Score, SVG Donut chart, Bar chart, Budget rings, Quick actions, Notifications

### Financial Management
4. **Dépenses** — 3 tabs (Quotidien/Pro/Contrats), 10 payment methods (Apple Pay, TWINT, Google Pay, Samsung Pay, Carte, Cash, E-Banking, PostFinance, LSV/DD, Autre)
5. **Épargne** — 12 Swiss templates, auto-save, deposits, progress tracking
6. **Budgets** — Category-based envelopes with ring progress
7. **Récurrents** — Subscription management with toggle
8. **Dettes** — Debt tracking with repayment schedule
9. **Investissements** — Portfolio tracking (PRO)

### Swiss Modules
10. **Swiss Tax Optimizer** — IFD + ICC for 15 cantons, 3rd pillar max CHF 7'258, canton ranking
11. **Comparateur LAMal Priminfo 2026** — 15 real insurers, ALL 26 cantons grid, franchises 300-2500, subsidy calculator, canton ranking
12. **Export PDF A4** — Notes de frais avec en-tête Guardian, TVA 8.1%, mode employé/indépendant, signature

### AI & Social
13. **Guardian Predict IA** — 5 tabs: Predictions, Alerts, Cash Flow, Insights, **GPT-4o-mini Coach** (real LLM with financial context)
14. **Mode Famille** — 8-char invite codes, max 6 members, share via OS native
15. **Notifications Push** — Budget alerts (high/medium/low), goal milestones, monthly reminders, LAMal deadline (Nov 30)

### Settings & Pro
16. **Settings** — 8 languages, 7 currencies, logout, data deletion
17. **Subscription** — Freemium (5 tx) / Pro CHF 7.90/mois

## Backend API Endpoints
- GET /api/health
- POST /api/coach/chat (GPT-4o-mini)
- POST /api/export/pdf (HTML A4 generation)
- POST /api/family/create | /api/family/join | GET /api/family/{code}
- POST /api/alerts/check-budgets | GET /api/alerts/{user_id}

## Tech Stack
- Expo SDK 54 + React Native + Expo Router
- Supabase Auth + DB (self-hosted)
- FastAPI backend + GPT-4o-mini via Emergent LLM
- Zustand + AsyncStorage (offline-first)
- expo-notifications, expo-print, expo-sharing
- react-native-svg (custom charts)
- Priminfo 2026 official OFSP data
