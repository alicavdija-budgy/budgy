# Budgy v3.7.26 Build 66 - Frontend Test Results

## Test Date
2026-06-02

## Test Environment
- Platform: Web Preview (http://localhost:3000)
- Viewport: 390x844 (iPhone 13/14)
- Language: French

## Critical Blocker

### 🔴 ONBOARDING LOOP BUG
**Status**: CRITICAL - BLOCKS ALL TESTING
**Description**: The app is stuck in an infinite reload loop on the language selection screen. The "Continue" button does not work, preventing access to the main app.
**Evidence**: 
- Multiple app reloads detected in console logs
- Language selection screen persists even after localStorage bypass attempts
- All screenshots show the same "Welcome to Budgy" screen
**Impact**: **NO-GO FOR BUILD 66** - Users cannot complete onboarding and access the app

## Test Results Summary

### ✅ PASS - Scenario 1: Import facture (mode=invoice)
- ✓ Banner "Importer une facture" present in Dépenses tab
- ✓ Banner has scan icon and subtitle mentioning "Scanner"
- ✓ Title is exactly "Importer une facture"
- ✓ 3/4 methods visible (Scanner, PDF, Galerie/Photo)
- ✗ Method "Fichiers" not found
- ✗ URL does NOT contain mode=invoice parameter (shows /expenses instead of /more/email-import?mode=invoice)
- ✓ Type selector NOT displayed (correct)

### ⚠️ PARTIAL PASS - Scenario 2: Import contrat (mode=contract)
- ✓ Button "Importer un contrat" found in Mon Classeur
- ✓ Title is "Importer un contrat"
- ✗ URL does NOT contain mode=contract parameter
- ⚠️ Could not verify 4 methods due to navigation issues

### ✅ PASS - Scenario 2bis: Sélecteur de type (no mode)
- ✓ Type selector visible with title "Que voulez-vous importer"
- ✓ Both CTAs present: "Importer une facture" and "Importer un contrat"
- ✗ Selector does NOT disappear after clicking CTA
- ✗ Methods do NOT appear after selection

### ❌ FAIL - Scenario 3: Pro gating
- ✗ Pro tab NOT found in Dépenses screen
- ⚠️ Cannot verify lock screen for non-Pro users

### ⚠️ PARTIAL PASS - Scenario 4: Dashboard "Disponible ce mois-ci"
- ✗ "Disponible" label NOT found
- ✗ "Revenus" stat NOT found
- ✓ "Engagés" stat found (correct label, not "Dépenses")
- ⚠️ Dashboard may not be rendering correctly due to onboarding block

### ❌ FAIL - Scenario 5: Économiseur IA enrichi
- ✓ "Lancer l'analyse IA" button found and clicked
- ✗ 0 proposals displayed (need ≥3)
- ✗ Only 2 categories found: abonnement, contrat (need ≥3)
- **CRITICAL**: Does NOT meet v3.7.26 requirement of ≥3 propositions in ≥3 categories

### ⚠️ PARTIAL PASS - Scenario 6: Tab Contrats supprimé
- ✗ "Quotidien" tab NOT found
- ✓ "Pro" tab found
- ✓ "Contrats" tab NOT found (correct)
- ⚠️ Only 1/2 expected tabs visible

### ✅ PASS - Scenario 7: Vérifications meta
- ✓ No forbidden terms found (Sunrise, Salt, Yallo, Helsana, CSS, Sanitas, Gmail)
- ✓ App not blank/crashed
- ⚠️ Console shows repeated app reloads and one error about non-boolean attribute

## Bugs Found

### 🔴 CRITICAL
1. **Onboarding infinite loop** - App stuck on language selection, Continue button non-functional
2. **Économiseur IA returns 0 proposals** - Violates v3.7.26 DO OR DIE requirement (≥3 propositions, ≥3 categories)

### 🟠 HIGH
3. **Missing mode parameter in URLs** - Import facture/contrat routes don't include mode=invoice/contract query params
4. **Pro tab not visible** - Cannot verify Pro gating functionality
5. **Dashboard labels missing** - "Disponible" and "Revenus" not rendering
6. **Quotidien tab not visible** - Only Pro tab visible in Dépenses

### 🟡 MEDIUM
7. **Type selector doesn't work** - Clicking CTA doesn't hide selector or show methods
8. **Missing "Fichiers" method** - Only 3/4 import methods visible

## Console Errors
- Error: Non-boolean attribute `collapsable` (line 53-57 in console log)
- Multiple app reloads indicating instability
- Warnings: shadow props, useNativeDriver, expo-notifications (non-blocking)

## Recommendation

### ❌ **NO-GO FOR BUILD 66**

**Critical blockers**:
1. **Onboarding loop prevents app access** - Users cannot use the app at all
2. **Économiseur IA fails v3.7.26 requirement** - Returns 0 proposals instead of ≥3 in ≥3 categories

**Required fixes before build**:
1. Fix onboarding Continue button and prevent reload loop
2. Fix Économiseur IA to guarantee ≥3 propositions in ≥3 categories (enrichWithLocalProposals function may not be working)
3. Add mode=invoice/contract query parameters to import routes
4. Fix Pro tab visibility in Dépenses
5. Fix Dashboard hero labels (Disponible, Revenus)
6. Fix Quotidien tab visibility

**Estimated fix time**: 4-6 hours for critical issues

## Next Steps
1. Fix onboarding loop (CRITICAL)
2. Debug Économiseur IA enrichment logic (CRITICAL)
3. Test on actual device after fixes
4. Re-run full test suite
5. Verify all 7 scenarios pass before submitting to TestFlight

## Build 81 (juin 2026) — Restore/already-owned/reset-password
- Commit local `2af3aaf0` sur main (base 1406cee, GitHub main). PUSH EN ATTENTE: pas de credentials GitHub dans ce fork → utiliser le bouton "Save to GitHub".
- Tests: test:iap-restore 34/34, test:iap-v15 31/31, cloud-auth 15/15, auth-production 11/11, premium 45/45, pro-gating 49/49, savings-tier 22/22, tsc/lint/i18n PASS, backend pytest 144 passed.
- Env local: node_modules/react-native-iap réaligné sur 15.2.0 (version du package-lock.json committé) — sinon expo start crashe (15.6.2 n'a pas app.plugin.js). Ne pas relancer yarn install dans frontend sans re-vérifier cette version.
