/**
 * BUDGY - Internationalization (i18n)
 * Supports: French (fr), English (en), German (de), Italian (it)
 * Used via the useTranslation() hook which reacts to preferences.language.
 */

export type LangCode = 'fr' | 'en' | 'de' | 'it';

export const LANGUAGES: { code: LangCode; flag: string; label: string }[] = [
  { code: 'fr', flag: '🇫🇷', label: 'Français' },
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'de', flag: '🇩🇪', label: 'Deutsch' },
  { code: 'it', flag: '🇮🇹', label: 'Italiano' },
];

export const TRANSLATIONS = {
  // ─────────── Common ───────────
  common: {
    fr: { save: 'Enregistrer', cancel: 'Annuler', delete: 'Supprimer', edit: 'Modifier', close: 'Fermer', back: 'Retour', confirm: 'Confirmer', loading: 'Chargement...', success: 'Succès', error: 'Erreur', yes: 'Oui', no: 'Non', add: 'Ajouter', search: 'Rechercher', all: 'Tout', month: 'mois', year: 'an', months: 'mois', years: 'ans', perMonth: '/mois', perYear: '/an', day: 'jour', days: 'jours' },
    en: { save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit', close: 'Close', back: 'Back', confirm: 'Confirm', loading: 'Loading...', success: 'Success', error: 'Error', yes: 'Yes', no: 'No', add: 'Add', search: 'Search', all: 'All', month: 'month', year: 'year', months: 'months', years: 'years', perMonth: '/mo', perYear: '/yr', day: 'day', days: 'days' },
    de: { save: 'Speichern', cancel: 'Abbrechen', delete: 'Löschen', edit: 'Bearbeiten', close: 'Schließen', back: 'Zurück', confirm: 'Bestätigen', loading: 'Wird geladen...', success: 'Erfolg', error: 'Fehler', yes: 'Ja', no: 'Nein', add: 'Hinzufügen', search: 'Suchen', all: 'Alle', month: 'Monat', year: 'Jahr', months: 'Monate', years: 'Jahre', perMonth: '/Mt.', perYear: '/J.', day: 'Tag', days: 'Tage' },
    it: { save: 'Salva', cancel: 'Annulla', delete: 'Elimina', edit: 'Modifica', close: 'Chiudi', back: 'Indietro', confirm: 'Conferma', loading: 'Caricamento...', success: 'Successo', error: 'Errore', yes: 'Sì', no: 'No', add: 'Aggiungi', search: 'Cerca', all: 'Tutto', month: 'mese', year: 'anno', months: 'mesi', years: 'anni', perMonth: '/mese', perYear: '/anno', day: 'giorno', days: 'giorni' },
  },

  // ─────────── Tabs ───────────
  tabs: {
    fr: { home: 'Accueil', expenses: 'Dépenses', scan: 'Scanner', savings: 'Épargne', more: 'Plus' },
    en: { home: 'Home', expenses: 'Expenses', scan: 'Scan', savings: 'Savings', more: 'More' },
    de: { home: 'Start', expenses: 'Ausgaben', scan: 'Scannen', savings: 'Sparen', more: 'Mehr' },
    it: { home: 'Home', expenses: 'Spese', scan: 'Scansiona', savings: 'Risparmi', more: 'Altro' },
  },

  // ─────────── Home ───────────
  home: {
    fr: { hello: 'Bonjour', balance: 'Solde du mois', incomesShort: 'Revenus', expensesShort: 'Dépenses', savingsRate: 'Taux d\'épargne', netSavings: 'Économies nettes', recent: 'Activité récente', viewAll: 'Voir tout', noTx: 'Aucune transaction ce mois', addFirst: 'Ajoutez votre première transaction', quickActions: 'Actions rapides', addExpense: 'Ajouter dépense', addIncome: 'Ajouter revenu', viewBudgets: 'Voir budgets', scanReceipt: 'Scanner reçu' },
    en: { hello: 'Hello', balance: 'Monthly balance', incomesShort: 'Income', expensesShort: 'Expenses', savingsRate: 'Savings rate', netSavings: 'Net savings', recent: 'Recent activity', viewAll: 'View all', noTx: 'No transactions this month', addFirst: 'Add your first transaction', quickActions: 'Quick actions', addExpense: 'Add expense', addIncome: 'Add income', viewBudgets: 'View budgets', scanReceipt: 'Scan receipt' },
    de: { hello: 'Hallo', balance: 'Monatssaldo', incomesShort: 'Einkommen', expensesShort: 'Ausgaben', savingsRate: 'Sparquote', netSavings: 'Nettoeinsparung', recent: 'Letzte Aktivität', viewAll: 'Alle anzeigen', noTx: 'Keine Transaktionen diesen Monat', addFirst: 'Erste Transaktion hinzufügen', quickActions: 'Schnellaktionen', addExpense: 'Ausgabe hinzufügen', addIncome: 'Einkommen hinzufügen', viewBudgets: 'Budgets anzeigen', scanReceipt: 'Beleg scannen' },
    it: { hello: 'Ciao', balance: 'Saldo del mese', incomesShort: 'Entrate', expensesShort: 'Spese', savingsRate: 'Tasso di risparmio', netSavings: 'Risparmi netti', recent: 'Attività recente', viewAll: 'Vedi tutto', noTx: 'Nessuna transazione questo mese', addFirst: 'Aggiungi la prima transazione', quickActions: 'Azioni rapide', addExpense: 'Aggiungi spesa', addIncome: 'Aggiungi entrata', viewBudgets: 'Vedi budget', scanReceipt: 'Scansiona ricevuta' },
  },

  // ─────────── Savings ───────────
  savings: {
    fr: { title: 'Épargne', total: 'Total épargné', target: 'sur {{n}} visés', addGoal: 'Nouvel objectif', remaining: '{{n}} manque · {{p}}% atteint', achieved: '✨ Bravo ! Vous avez économisé {{c}} {{n}}', autoSave: 'Virements auto: {{c}} {{n}}/mois', noGoals: 'Aucun objectif', startNow: 'Créez votre premier objectif d\'épargne' },
    en: { title: 'Savings', total: 'Total saved', target: 'of {{n}} target', addGoal: 'New goal', remaining: '{{n}} left · {{p}}% reached', achieved: '✨ Great! You\'ve saved {{c}} {{n}}', autoSave: 'Auto-saves: {{c}} {{n}}/mo', noGoals: 'No goals', startNow: 'Create your first savings goal' },
    de: { title: 'Sparen', total: 'Gesamt gespart', target: 'von {{n}} Ziel', addGoal: 'Neues Ziel', remaining: '{{n}} fehlt · {{p}}% erreicht', achieved: '✨ Super! Sie haben {{c}} {{n}} gespart', autoSave: 'Auto-Sparen: {{c}} {{n}}/Mt.', noGoals: 'Keine Ziele', startNow: 'Erstellen Sie Ihr erstes Sparziel' },
    it: { title: 'Risparmi', total: 'Totale risparmiato', target: 'su {{n}} obiettivo', addGoal: 'Nuovo obiettivo', remaining: '{{n}} mancano · {{p}}% raggiunto', achieved: '✨ Bravo! Hai risparmiato {{c}} {{n}}', autoSave: 'Risparmi auto: {{c}} {{n}}/mese', noGoals: 'Nessun obiettivo', startNow: 'Crea il tuo primo obiettivo di risparmio' },
  },

  // ─────────── Expenses ───────────
  expenses: {
    fr: { title: 'Dépenses', daily: 'Quotidien', pro: 'Frais pro', contracts: 'Contrats', noTx: 'Aucune dépense', addExpense: 'Ajouter une dépense' },
    en: { title: 'Expenses', daily: 'Daily', pro: 'Business', contracts: 'Contracts', noTx: 'No expenses', addExpense: 'Add expense' },
    de: { title: 'Ausgaben', daily: 'Täglich', pro: 'Geschäftlich', contracts: 'Verträge', noTx: 'Keine Ausgaben', addExpense: 'Ausgabe hinzufügen' },
    it: { title: 'Spese', daily: 'Quotidiane', pro: 'Lavoro', contracts: 'Contratti', noTx: 'Nessuna spesa', addExpense: 'Aggiungi spesa' },
  },

  // ─────────── More menu ───────────
  more: {
    fr: { title: 'Plus', upgrade: 'Passer à Budgy Pro', upgradeSub: 'IA illimitée · Tax · Export · Cloud — 7 jours gratuits', trialActive: 'Essai gratuit actif · {{n}} jours restants', subscribe: 'S\'abonner', sectionFinance: '💰 Finances', sectionTools: '🛠️ Outils', sectionAccount: '👤 Compte', incomes: 'Mes revenus', incomesSub: 'Salaire · 13ème · Bonus · Locations', budgets: 'Budgets', budgetsSub: 'Enveloppes mensuelles', recurring: 'Charges récurrentes', recurringSub: 'Frais & abonnements', investments: 'Investissements', debts: 'Dettes', invoices: 'Factures', invoicesSub: 'QR-bills · paiements', lamal: 'LAMal & Subsides', lamalSub: '26 cantons · 15 assureurs', aiOptimizer: 'Économiseur IA', aiOptimizerSub: 'Trouve des économies concrètes', predict: 'Coach Predict', predictSub: 'Prédictions & conseils GPT', taxOpt: 'Optimiseur d\'impôts', taxOptSub: 'IFD + ICC', exportPdf: 'Export PDF', emailImport: 'Import email', documents: 'Mon classeur', settings: 'Paramètres', legal: 'Mentions légales', logout: 'Déconnexion' },
    en: { title: 'More', upgrade: 'Upgrade to Budgy Pro', upgradeSub: 'Unlimited AI · Tax · Export · Cloud — 7 days free', trialActive: 'Free trial active · {{n}} days left', subscribe: 'Subscribe', sectionFinance: '💰 Finance', sectionTools: '🛠️ Tools', sectionAccount: '👤 Account', incomes: 'My income', incomesSub: 'Salary · 13th · Bonus · Rent', budgets: 'Budgets', budgetsSub: 'Monthly envelopes', recurring: 'Recurring charges', recurringSub: 'Fees & subscriptions', investments: 'Investments', debts: 'Debts', invoices: 'Invoices', invoicesSub: 'QR-bills · payments', lamal: 'Health Insurance & Subsidies', lamalSub: '26 cantons · 15 insurers', aiOptimizer: 'AI Money Saver', aiOptimizerSub: 'Find concrete savings', predict: 'Predict Coach', predictSub: 'Predictions & GPT advice', taxOpt: 'Tax Optimizer', taxOptSub: 'Federal + Cantonal tax', exportPdf: 'Export PDF', emailImport: 'Email import', documents: 'My binder', settings: 'Settings', legal: 'Legal notices', logout: 'Log out' },
    de: { title: 'Mehr', upgrade: 'Auf Budgy Pro upgraden', upgradeSub: 'Unbegrenzt KI · Steuer · Export · Cloud — 7 Tage gratis', trialActive: 'Testphase aktiv · noch {{n}} Tage', subscribe: 'Abonnieren', sectionFinance: '💰 Finanzen', sectionTools: '🛠️ Werkzeuge', sectionAccount: '👤 Konto', incomes: 'Mein Einkommen', incomesSub: 'Lohn · 13. · Bonus · Miete', budgets: 'Budgets', budgetsSub: 'Monatliche Umschläge', recurring: 'Wiederkehrende Kosten', recurringSub: 'Gebühren & Abos', investments: 'Investments', debts: 'Schulden', invoices: 'Rechnungen', invoicesSub: 'QR-Rechnungen · Zahlungen', lamal: 'Krankenkasse & Prämienverbilligung', lamalSub: '26 Kantone · 15 Versicherer', aiOptimizer: 'KI-Sparassistent', aiOptimizerSub: 'Findet konkrete Einsparungen', predict: 'Predict Coach', predictSub: 'Vorhersagen & GPT-Tipps', taxOpt: 'Steueroptimierer', taxOptSub: 'Bund + Kanton', exportPdf: 'PDF-Export', emailImport: 'E-Mail-Import', documents: 'Mein Ordner', settings: 'Einstellungen', legal: 'Rechtliche Hinweise', logout: 'Abmelden' },
    it: { title: 'Altro', upgrade: 'Passa a Budgy Pro', upgradeSub: 'IA illimitata · Tasse · Export · Cloud — 7 giorni gratis', trialActive: 'Prova gratuita attiva · {{n}} giorni rimanenti', subscribe: 'Abbonati', sectionFinance: '💰 Finanze', sectionTools: '🛠️ Strumenti', sectionAccount: '👤 Account', incomes: 'I miei redditi', incomesSub: 'Stipendio · 13ma · Bonus · Affitti', budgets: 'Budget', budgetsSub: 'Buste mensili', recurring: 'Spese ricorrenti', recurringSub: 'Costi & abbonamenti', investments: 'Investimenti', debts: 'Debiti', invoices: 'Fatture', invoicesSub: 'QR-bill · pagamenti', lamal: 'Assicurazione malattia & Sussidi', lamalSub: '26 cantoni · 15 assicuratori', aiOptimizer: 'Risparmiatore IA', aiOptimizerSub: 'Trova risparmi concreti', predict: 'Coach Predict', predictSub: 'Previsioni & consigli GPT', taxOpt: 'Ottimizzatore tasse', taxOptSub: 'Federali + Cantonali', exportPdf: 'Export PDF', emailImport: 'Importa email', documents: 'Il mio classificatore', settings: 'Impostazioni', legal: 'Note legali', logout: 'Disconnetti' },
  },

  // ─────────── Settings ───────────
  settings: {
    fr: { title: 'Paramètres', language: 'Langue', currency: 'Devise', theme: 'Thème', appearance: 'Apparence', dark: 'Sombre', light: 'Clair', auto: 'Auto', themeHint: '"Auto" suit automatiquement le thème de votre appareil.', dataSection: 'Données', backup: 'Sauvegarde', backupValue: 'Temps réel · local', servers: 'Serveurs', serversValue: 'Aucun · 100% privé', version: 'Version', appStoreReady: 'App Store Ready', security: 'Sécurité', dataPrivacy: 'Données & confidentialité', clearData: 'Supprimer mes données', logout: 'Déconnexion', dangerZone: '⚠️ Zone dangereuse', dangerText: 'Supprime toutes vos données localement. Irréversible.', clearConfirmTitle: 'Tout supprimer ?', clearConfirm: 'Toutes vos données seront supprimées. Continuer ?', logoutConfirmTitle: 'Déconnexion', logoutConfirm: 'Voulez-vous vous déconnecter ?', currencyConverted: 'Tous les montants sont convertis en {{c}}', example: 'ex' },
    en: { title: 'Settings', language: 'Language', currency: 'Currency', theme: 'Theme', appearance: 'Appearance', dark: 'Dark', light: 'Light', auto: 'Auto', themeHint: '"Auto" follows your device theme automatically.', dataSection: 'Data', backup: 'Backup', backupValue: 'Real-time · local', servers: 'Servers', serversValue: 'None · 100% private', version: 'Version', appStoreReady: 'App Store Ready', security: 'Security', dataPrivacy: 'Data & privacy', clearData: 'Delete my data', logout: 'Log out', dangerZone: '⚠️ Danger zone', dangerText: 'Permanently deletes all your local data. Irreversible.', clearConfirmTitle: 'Delete everything?', clearConfirm: 'All your data will be deleted. Continue?', logoutConfirmTitle: 'Log out', logoutConfirm: 'Do you want to log out?', currencyConverted: 'All amounts are converted to {{c}}', example: 'e.g.' },
    de: { title: 'Einstellungen', language: 'Sprache', currency: 'Währung', theme: 'Design', appearance: 'Erscheinungsbild', dark: 'Dunkel', light: 'Hell', auto: 'Auto', themeHint: '"Auto" folgt automatisch dem Geräte-Design.', dataSection: 'Daten', backup: 'Sicherung', backupValue: 'Echtzeit · lokal', servers: 'Server', serversValue: 'Keine · 100% privat', version: 'Version', appStoreReady: 'App Store bereit', security: 'Sicherheit', dataPrivacy: 'Daten & Privatsphäre', clearData: 'Meine Daten löschen', logout: 'Abmelden', dangerZone: '⚠️ Gefahrenzone', dangerText: 'Löscht alle lokalen Daten unwiderruflich.', clearConfirmTitle: 'Alles löschen?', clearConfirm: 'Alle Ihre Daten werden gelöscht. Fortfahren?', logoutConfirmTitle: 'Abmelden', logoutConfirm: 'Möchten Sie sich abmelden?', currencyConverted: 'Alle Beträge werden in {{c}} umgerechnet', example: 'z.B.' },
    it: { title: 'Impostazioni', language: 'Lingua', currency: 'Valuta', theme: 'Tema', appearance: 'Aspetto', dark: 'Scuro', light: 'Chiaro', auto: 'Auto', themeHint: '"Auto" segue automaticamente il tema del dispositivo.', dataSection: 'Dati', backup: 'Backup', backupValue: 'Tempo reale · locale', servers: 'Server', serversValue: 'Nessuno · 100% privato', version: 'Versione', appStoreReady: 'Pronto per App Store', security: 'Sicurezza', dataPrivacy: 'Dati & privacy', clearData: 'Cancella i miei dati', logout: 'Disconnetti', dangerZone: '⚠️ Zona pericolosa', dangerText: 'Elimina tutti i dati locali. Irreversibile.', clearConfirmTitle: 'Cancellare tutto?', clearConfirm: 'Tutti i tuoi dati saranno eliminati. Continuare?', logoutConfirmTitle: 'Disconnetti', logoutConfirm: 'Vuoi disconnetterti?', currencyConverted: 'Tutti gli importi sono convertiti in {{c}}', example: 'es.' },
  },

  // ─────────── Paywall ───────────
  paywall: {
    fr: { title: 'Prenez le contrôle total de votre argent', subtitle: 'Budgy vous aide à économiser, prévoir et optimiser vos finances.', tryFree: 'Essayer gratuitement 7 jours', subDirect: 'ou s\'abonner directement', monthly: 'Mensuel', annual: 'Annuel', bestOffer: 'MEILLEURE OFFRE', noCommit: 'Sans engagement', cancelAny: 'Annulation à tout moment', securePay: 'Paiement sécurisé', restore: 'Restaurer' },
    en: { title: 'Take full control of your money', subtitle: 'Budgy helps you save, forecast and optimize your finances.', tryFree: 'Try free for 7 days', subDirect: 'or subscribe directly', monthly: 'Monthly', annual: 'Annual', bestOffer: 'BEST OFFER', noCommit: 'No commitment', cancelAny: 'Cancel anytime', securePay: 'Secure payment', restore: 'Restore' },
    de: { title: 'Übernehmen Sie die Kontrolle über Ihr Geld', subtitle: 'Budgy hilft Ihnen zu sparen, vorauszuplanen und Ihre Finanzen zu optimieren.', tryFree: '7 Tage kostenlos testen', subDirect: 'oder direkt abonnieren', monthly: 'Monatlich', annual: 'Jährlich', bestOffer: 'BESTES ANGEBOT', noCommit: 'Keine Bindung', cancelAny: 'Jederzeit kündbar', securePay: 'Sichere Zahlung', restore: 'Wiederherstellen' },
    it: { title: 'Prendi il controllo totale del tuo denaro', subtitle: 'Budgy ti aiuta a risparmiare, prevedere e ottimizzare le tue finanze.', tryFree: 'Prova gratis per 7 giorni', subDirect: 'o abbonati direttamente', monthly: 'Mensile', annual: 'Annuale', bestOffer: 'MIGLIORE OFFERTA', noCommit: 'Senza impegno', cancelAny: 'Annulla in qualsiasi momento', securePay: 'Pagamento sicuro', restore: 'Ripristina' },
  },

  // ─────────── Auth ───────────
  auth: {
    fr: { tagline: 'Vos finances, en toute sérénité 🇨🇭', login: 'Connexion', signup: 'Créer un compte', email: 'Email', password: 'Mot de passe', name: 'Prénom', loginCta: 'Se connecter', signupCta: 'Créer mon compte', noAccount: 'Pas encore de compte ?', haveAccount: 'Déjà un compte ?', forgotPwd: 'Mot de passe oublié ?', demoMode: 'Essayer en mode démo (Pro activé)', or: 'OU', emailPlaceholder: 'email@exemple.ch', passwordPlaceholder: 'Min. 6 caractères', namePlaceholder: 'Votre prénom', errEmail: 'Email invalide', errPassword: 'Mot de passe trop court', errName: 'Prénom requis' },
    en: { tagline: 'Your finances, in total peace of mind 🇨🇭', login: 'Sign in', signup: 'Sign up', email: 'Email', password: 'Password', name: 'First name', loginCta: 'Sign in', signupCta: 'Create account', noAccount: 'No account yet?', haveAccount: 'Already have an account?', forgotPwd: 'Forgot password?', demoMode: 'Try in demo mode (Pro enabled)', or: 'OR', emailPlaceholder: 'email@example.com', passwordPlaceholder: 'Min. 6 characters', namePlaceholder: 'Your first name', errEmail: 'Invalid email', errPassword: 'Password too short', errName: 'Name required' },
    de: { tagline: 'Ihre Finanzen, in vollkommener Ruhe 🇨🇭', login: 'Anmelden', signup: 'Konto erstellen', email: 'E-Mail', password: 'Passwort', name: 'Vorname', loginCta: 'Anmelden', signupCta: 'Konto erstellen', noAccount: 'Noch kein Konto?', haveAccount: 'Schon ein Konto?', forgotPwd: 'Passwort vergessen?', demoMode: 'Demo-Modus testen (Pro aktiv)', or: 'ODER', emailPlaceholder: 'email@beispiel.ch', passwordPlaceholder: 'Min. 6 Zeichen', namePlaceholder: 'Ihr Vorname', errEmail: 'Ungültige E-Mail', errPassword: 'Passwort zu kurz', errName: 'Vorname erforderlich' },
    it: { tagline: 'Le tue finanze, in totale tranquillità 🇨🇭', login: 'Accedi', signup: 'Registrati', email: 'Email', password: 'Password', name: 'Nome', loginCta: 'Accedi', signupCta: 'Crea account', noAccount: 'Non hai ancora un account?', haveAccount: 'Hai già un account?', forgotPwd: 'Password dimenticata?', demoMode: 'Prova in modalità demo (Pro attivo)', or: 'O', emailPlaceholder: 'email@esempio.ch', passwordPlaceholder: 'Min. 6 caratteri', namePlaceholder: 'Il tuo nome', errEmail: 'Email non valida', errPassword: 'Password troppo corta', errName: 'Nome richiesto' },
  },
} as const;

// Helper for parameterized strings: t('savings.target', { n: 1000 })
export function interpolate(template: string, params?: Record<string, any>): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(params[key] ?? ''));
}
