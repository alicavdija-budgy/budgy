# Budgy 4.0.0 — iOS build 95 · dossier de publication App Store

**Statut : candidat à publier, PAS encore soumis à App Review.**
**Référence fonctionnelle :** branche `budgy-smart-4.0`, PR #13 fusionnée, 95 uniquement.
**Important :** ce dossier remplace les notices v3.8.0/build 70 archivées dans `APP_STORE_SUBMISSION_FINAL.md`.

## Binaire unique : TestFlight puis App Store

- Compiler **une seule fois** `4.0.0 (95)` avec **Build profile = production**, **Platform = ios**, **Submit = true** dans GitHub Actions / EAS Build.
- Le profil `production` comporte `distribution=store`, `channel=production`, Xcode **26.0** (`image=sdk-54`), Node 22 et Yarn 1. Le même .ipa est envoyé à App Store Connect et apparaît dans TestFlight.
- Ne **pas** utiliser le profil `testflight` pour le binaire App Store définitif : celui-ci inscrit un canal OTA `testflight`, distinct de `production`. Changer ce canal après construction demanderait normalement un autre binaire.
- Quand Apple a terminé de traiter l'archive, **sélectionner la version 4.0.0, build 95** dans App Store Connect > App Store, **sans reconstruire**. Apple exige ensuite une soumission App Review distincte de `eas submit`.
- Avant la soumission à App Review, tester **le même binaire 95** sur iPhone et iPad, ne pas désinstaller la version existante sans sauvegarder les documents locaux. En cas de bug bloquant, NE PAS publier, même si le coût est un futur build 96.
- Release option recommandée : **manual release after approval**, non automatique. Permet de choisir la date et d'éviter une publication non contrôlée.

### Paramètres GitHub Actions après fusion

| Champ | Valeur |
|---|---|
| Workflow | `.github/workflows/eas-build.yml` |
| Branch | `budgy-smart-4.0` |
| Platform | `ios` |
| Profile | `production` |
| Submit | `true` |
| iOS version | `4.0.0 (95)` |
| Bundle Identifier | `com.budgy.ch.budgy` |
| Apple team | `N69NHCB9S3` |
| App Store Connect app ID | `6767026949` |

**Ne pas** confondre `submit=true` (téléversement du binaire vers App Store Connect/TestFlight) avec « Submit for Review » (envoi de la mise à jour en révision Apple), qui reste manuel.

## Texte « Nouveautés » à coller — 4 langues

### Français (fr-FR)

Budgy 4.0.0 : une nouvelle expérience pour gérer vos finances en Suisse.

• Importation des factures QR suisses et des contrats PDF avec vérification des informations avant enregistrement.
• Classement des documents et conservation de leurs originaux sur votre appareil.
• Saisie des dépenses par Siri : formulaire de confirmation avant tout enregistrement.
• Nouveau dossier fiscal 2026/2027 et planificateur du pilier 3a, avec renvois aux sources officielles.
• Économiseur amélioré, basé sur vos dépenses et charges enregistrées.
• Améliorations de la navigation, de la sécurité et de la stabilité.

Les suggestions fiscales restent indicatives. Vos documents sont analysés à distance uniquement si vous autorisez la reconnaissance automatique.

### Deutsch (de-DE)

Budgy 4.0.0: Ihre Schweizer Finanzen noch einfacher im Blick.

• Schweizer QR-Rechnungen und PDF-Verträge importieren und Angaben vor dem Speichern prüfen.
• Dokumente übersichtlich ablegen; Originale bleiben auf Ihrem Gerät.
• Ausgaben mit Siri erfassen und vor dem Speichern ausdrücklich bestätigen.
• Neues Steuerdossier 2026/2027 mit Säule-3a-Planer und offiziellen Quellen.
• Verbesserter Sparassistent auf Basis Ihrer erfassten Ausgaben und Fixkosten.
• Verbesserte Navigation, Sicherheit und Stabilität.

Steuerhinweise sind unverbindlich. Eine Online-Dokumentenanalyse erfolgt nur mit Ihrer Zustimmung.

### Italiano (it-IT)

Budgy 4.0.0: più controllo sulle tue finanze in Svizzera.

• Importa QR-fatture svizzere e contratti PDF verificando i dati prima del salvataggio.
• Organizza i documenti e conserva gli originali sul dispositivo.
• Registra spese con Siri dopo una conferma esplicita.
• Nuovo dossier fiscale 2026/2027 e pianificatore del pilastro 3a con fonti ufficiali.
• Assistente al risparmio migliorato basato sulle spese e sui costi fissi registrati.
• Miglioramenti alla navigazione, alla sicurezza e alla stabilità.

I suggerimenti fiscali sono indicativi. L'analisi remota dei documenti richiede il tuo consenso.

### English (en-US / en-GB)

Budgy 4.0.0: a clearer way to manage your money in Switzerland.

• Import Swiss QR invoices and PDF contracts, with confirmation before saving.
• Organize documents and keep the original files on your device.
• Add expenses with Siri, then confirm the details before saving.
• New 2026/2027 tax dossier and pillar 3a planner with links to official sources.
• Savings assistant improved with insights from your recorded spending and recurring bills.
• Navigation, security and stability refinements.

Tax suggestions are indicative. Remote document analysis requires your consent.

## Notes App Review (en anglais)

Budgy is a Swiss personal budgeting and document-organizing application. This update adds Swiss QR invoice import, PDF contract classification, a 2026/2027 tax preparation checklist, pillar 3a contribution planning, and an improved Siri App Intent for manual expense confirmation. It does not move money or execute payments. Tax savings are estimates, not official filings or professional advice.

**Testing as guest:** Open Budgy and use the guest/local experience for basic budgets, expense entry, document storage, and scanning if available. Some features require sign-in and/or Budgy Pro.

**Siri on a physical iPhone:** Invoke the Budgy "Ajouter une dépense" App Intent, enter CHF 10.50. Budgy opens a confirmation sheet; verify the amount, then tap "Ajouter la dépense". It saves once and does not execute an automatic payment. Requires a logged-in and unlocked Budgy account.

**Swiss invoice PDF:** Select "Importer une facture" > "Choisir un PDF". The scanner recognizes Swiss QR content locally when possible; the imported document may require explicit confirmation of bank details, and unknown documents can still be kept without OCR. No payment occurs.

**Privacy:** Stored original documents remain on the customer's device. Automatic OCR may temporarily transmit the selected content to a remote service only after an in-app consent prompt. Other account/financial data may sync if the user enables cloud synchronization.

**Subscriptions:** Budgy Pro offers monthly and annual auto-renewing subscriptions through Apple In-App Purchase. Localized prices and any 7-day introductory free trial are rendered from StoreKit and depend on the customer's eligibility. "Restore Purchases" is available from the subscription experience.

**App Review access:** Make sure App Review can test restricted Pro/login experiences: either provide a fully functional review account (directly in App Store Connect's private App Review Information, never in GitHub) or provide precise review instructions and approved StoreKit test setup. Do not include user passwords, personal Swiss invoices, IBANs or private QR content in this repository.

Links:
- Privacy: https://budgy.ch/privacy
- Support: https://budgy.ch/support
- Account deletion: https://budgy.ch/delete-account
- EULA: https://budgy.ch/terms (verify this URL is accessible in production)

## Contrôle public obligatoire AVANT « Submit for Review »

### Conditions non vérifiables depuis le dépôt GitHub

- [ ] **TestFlight build 95 bien affiché dans App Store Connect**, traitement Apple terminé, pas de warning ITMS.
- [ ] **iPhone réel:** Siri dépense 10, 10.50, 10'000.25, ouverture depuis veille, app déjà ouverte, Face ID verrouillé/déverrouillé ; confirmation, annulation, double appui et aucun doublon.
- [ ] **Évolution des données:** installer 95 PAR-DESSUS la version publique ; vérifier revenus, dépenses, factures, contrats, pièces jointes, favoris, budgets et absence de perte après redémarrage.
- [ ] **Restauration iCloud:** restaurer un appareil test, distinguer iCloud Backup de iCloud Drive ; aucune promesse de synchronisation documentaire automatique.
- [ ] **PDF réels:** import QR suisse avec IBAN alphanumérique, PDF sans QR, contrat multi-page, image floue ; confirmer les données avant enregistrement. Ne pas utiliser de véritables coordonnées bancaires en pièces jointes de review.
- [ ] **Abonnements:** les deux SKU existent et sont en vente, prix affichés correspondent à StoreKit, 7 jours affichés seulement si éligible ; achat Sandbox, restauration, désabonnement, expiration, changement de compte, droits Pro cohérents.
- [ ] **Backend api.budgy.ch:** endpoints compatibles avec le build 95 ; contrôles authentification et Supabase auto-hébergée (sans migration/déploiement non approuvé).
- [ ] **Confidentialité:** publier la politique à jour ; en particulier ne pas dire que les originaux sont automatiquement stockés sur le cloud ou que *tout* le contenu reste local si l'utilisateur déclenche l'OCR distant. Vérifier que les App Privacy Details dans App Store Connect correspondent aux flux réels et aux SDK tiers.
- [ ] **Conformité Apple 2026:** Xcode 26 / iOS 26 SDK, questionnaire d'âge 2026, statut trader DSA si distribution UE, accords commerciaux et informations bancaires/fiscales si abonnement payant.
- [ ] **Informations App Store:** description, « Nouveautés » quatre langues, catégorie Finance, contact, lien support, politique, EULA, compte de démonstration et note App Review accessibles.
- [ ] **Captures:** remplacer ou revoir visuellement les anciennes captures de 3.8/70 pour qu'elles décrivent réellement 4.0.0 ; pas de fausses fonctionnalités ou prix incrustés.
- [ ] **Release control:** manuelle après validation Apple, vérifier la fiche publique sans supprimer l'ancien état de l'application.

### Points connus à ne pas exagérer

- Les tests GitHub (TypeScript, i18n, exports Metro iOS/Android, Python, conteneur Docker, Siri simulé) ne démontrent pas à eux seuls le fonctionnement réel de Siri, de StoreKit ou de la caméra.
- Le dépôt ne confirme pas l'état des abonnements, accords Apple ni du questionnaire de confidentialité **dans App Store Connect**.
- Les documents `APP_STORE_SUBMISSION_FINAL.md` anciens (3.8.0/build 70) sont archivés et ne doivent PAS être copiés dans la mise à jour 4.0.0.
- Les tests natifs, l'état du backend public et l'examen Apple sont des étapes bloquantes de l'autorisation de sortie. Un échec critique signifie ne pas publier le binaire, même si cela implique une compilation corrective.

## Références officielles

- Apple : https://developer.apple.com/app-store/review/guidelines/
- Apple SDK & age rating : https://developer.apple.com/news/upcoming-requirements/
- Expo Submit : https://docs.expo.dev/submit/ios/
- Expo canal OTA : https://docs.expo.dev/eas-update/deployment/
