# Budgy — App Store Screenshots Checklist (v3.8.0 / Milestone A)

> Objectif : capturer les visuels finaux Apple App Store + Google Play + site marketing.
> À réaliser **par toi** depuis simulateur Xcode ou vrai device après le build TestFlight (Build 70).
> Emergent Web Preview n'est PAS acceptable pour les captures définitives (viewport approximatif, statut réseau différent, sécurité RN-Web).

---

## 1. Devices requis (Apple App Store 2025)

Apple exige des captures pour **au moins 2 tailles d'écran**. Recommandation Budgy :

| Device | Résolution portrait requise | Note |
|---|---|---|
| **iPhone 6.9"** (16 Pro Max / 15 Pro Max) | **1290 × 2796 px** | Obligatoire depuis 2024 |
| **iPhone 6.5"** (11 Pro Max / XS Max) | **1284 × 2778 px** | Recommandé (compatibilité descendante) |
| **iPad 12.9"** (Pro 6ᵉ gen) | **2048 × 2732 px** | Optionnel (mais recommandé si iPad marketing) |

Sur simulateur Xcode : `Device → iPhone 16 Pro Max` → `Command + S` pour capturer.

---

## 2. Langues (4)

- 🇫🇷 Français (Suisse)
- 🇩🇪 Deutsch (Schweiz)
- 🇬🇧 English (UK)
- 🇮🇹 Italiano

Pour chaque langue :
1. Changer la langue dans **Plus → Préférences → Langue**
2. Kill l'app + relance (pour appliquer les strings partout)
3. Prendre les 8 screenshots ci-dessous

---

## 3. Screenshots à capturer (8 par device × 4 langues = 32 par device)

Ordre imposé pour l'App Store (le premier = celui qui vend le plus) :

| # | Écran | Route Expo | Message marketing suggéré (à intégrer via Figma) |
|---|---|---|---|
| **1** | **Accueil / Dashboard** | `/(tabs)/index` | « Vos finances en un coup d'œil » |
| **2** | **Ajout Intelligent Siri** | `/more/siri-assistant` | « Ajoute une dépense à la voix » |
| **3** | **Économiseur IA** | `/more/ai-optimizer` (avec résultats) | « L'IA trouve où vous économisez » |
| **4** | **Score Budgy** | `/more/score` ou dashboard section | « Comprends ton score financier » |
| **5** | **Famille & Groupes** | `/more/family` (avec 1 groupe créé) | « Partage des dépenses simplement » |
| **6** | **Mon Classeur** (Contrats + Documents) | `/more/documents` | « Tous tes contrats en sécurité » |
| **7** | **Paywall Pro** | `/paywall` | « Débloque tout, essai 7 jours » |
| **8** | **Cloud Sync / Sécurité** | `/more/settings` (section Cloud) | « Sync 🇨🇭 · Chiffré · Privé » |

---

## 4. Données de démonstration à saisir avant capture

Pour que les screenshots soient **remplis** (pas vides) :

- Revenu : `Salaire · 5'800 CHF`
- 3-4 récurrentes : `Loyer 1650, Assurance 320, Netflix 18, Swisscom 89`
- 6-8 transactions du mois : `Migros 87, Coop 45, TPG 70, Restaurant 32, Coiffeur 55, Pharmacie 18, Essence 60, Amazon 42`
- 1 objectif épargne : `Vacances Italie · 1'200 sur 3'000 · 15.08`
- 1 dette : `Prêt auto · 8'400 sur 15'000 · 3.5% · 250/mois`
- 1 groupe famille : `Vacances Coloc · 2 membres · 3 dépenses partagées`
- 1 contrat : `Assurance voiture Zurich · 950/an · renouvellement 2027`

Ces données rendent le dashboard, l'optimizer et Famille visuellement crédibles.

---

## 5. Ressources marketing hors App Store

| Asset | Dimensions | Emplacement |
|---|---|---|
| Icône App Store | 1024 × 1024 px | `/app/frontend/assets/images/icon.png` (déjà présente, vérifier qu'elle est carrée sans transparence) |
| Bannière feature graphic Google Play | 1024 × 500 px | À créer |
| Bannière site budgy.ch (hero) | 2400 × 1200 px | Site marketing |
| Open Graph (partage réseaux) | 1200 × 630 px | Site marketing |
| TestFlight cover | 1024 × 1024 px | App Store Connect > TestFlight |

---

## 6. Textes App Store à préparer (par langue)

### Nom (30 caractères max)
- FR : `Budgy · Budget & Économies`
- DE : `Budgy · Budget & Sparen`
- EN : `Budgy · Smart Budget CH`
- IT : `Budgy · Budget & Risparmi`

### Sous-titre (30 caractères max)
- FR : `Vos finances suisses, en clair`
- DE : `Ihre Finanzen einfach klar`
- EN : `Your Swiss finances, clear`
- IT : `Le tue finanze svizzere`

### Mots-clés (100 caractères max, virgules)
- FR : `budget,dépenses,épargne,facture,QR,assurance,LAMal,famille,IA,scanner`
- DE : `Budget,Ausgaben,Sparen,Rechnung,QR,Versicherung,KVG,Familie,KI,Scanner`
- EN : `budget,expenses,savings,receipt,QR,insurance,family,AI,scanner,swiss`
- IT : `budget,spese,risparmi,fattura,QR,assicurazione,famiglia,IA,scanner`

### Description promo (170 caractères pour Promotional Text)
- FR : `Budgy analyse vos dépenses, détecte les économies possibles et sécurise vos documents. 100 % suisse, chiffré. Essai Pro gratuit 7 jours.`

### Description longue (4000 chars max)
À rédiger séparément dans un doc marketing. Points obligatoires à inclure :
- Fonctionnement 100 % offline-first
- Sync chiffrée Suisse (Supabase Zurich)
- Aucune connexion bancaire externe (Apple Review compliance)
- Apple In-App Purchase uniquement
- Essai gratuit 7 jours, résiliation à tout moment
- Support de 4 langues

---

## 7. Compliance Apple à vérifier avant soumission

- [ ] `Privacy Policy URL` renseigné dans App Store Connect (`https://budgy.ch/privacy`)
- [ ] `Support URL` renseigné (`https://budgy.ch/support` ou email)
- [ ] `Marketing URL` renseigné (`https://budgy.ch`)
- [ ] Prix des abonnements affichés dans l'app (via StoreKit, pas hardcodé)
- [ ] Bouton "Restaurer les achats" présent
- [ ] Bouton "Conditions d'utilisation" présent (paywall)
- [ ] Bouton "Politique de confidentialité" présent (paywall)
- [ ] Aucun paiement externe (Stripe, PayPal, crypto) mentionné dans l'app
- [ ] `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription` avec explication utilisateur clair
- [ ] Compte test pour Apple Review (peut être laissé vide si signup ouvert)

---

## 8. Automatisation possible (optionnelle, v3.9)

Fastlane snapshot peut automatiser la génération de ces 32+ captures :
```
fastlane snapshot
```
Nécessite :
- `Snapfile` config
- UI Tests Xcode qui naviguent + `snapshot("01_home")` à chaque écran
- Prebuild EAS obligatoire (non fait pour Milestone A)

À implémenter dans Milestone C ou v3.9 uniquement.
