# Guardian Money CHF v3.4 - PRD

## Nouvelles fonctionnalités v3.4
1. **Export PDF A4** — Notes de frais professionnelles avec en-tête Guardian, TVA 8.1%, modes employé/indépendant
2. **Coach IA GPT** — GPT-4o-mini powered, conseils financiers suisses personnalisés, contexte utilisateur, questions rapides
3. **Mode Famille** — Code invitation 8 chars, max 6 membres, statistiques communes, partage
4. **Alertes Budget** — Détection dépassement/rythme élevé, sévérité high/medium/low

## Backend Endpoints
- POST /api/coach/chat — Coach IA conversationnel (GPT-4o-mini via Emergent)
- POST /api/export/pdf — Génération HTML A4 pour notes de frais
- POST /api/family/create — Créer famille avec code 8 chars
- POST /api/family/join — Rejoindre avec code
- GET /api/family/{code} — Info famille
- POST /api/alerts/check-budgets — Vérification des alertes budget
- GET /api/alerts/{user_id} — Récupérer alertes

## Frontend Screens
- /more/predict — 5 onglets: Prédictions, Alertes, Cash Flow, Insights, Coach IA
- /more/family — Mode Famille (créer/rejoindre)
- All existing screens maintained
