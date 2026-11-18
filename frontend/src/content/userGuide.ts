/** Guide intégré — description prudente des possibilités existantes.
 * Aucune prétention à un classement « n°1 » ni économies garanties.
 * La disponibilité effective des modules dépend du plan et du build.
 */
export type UserGuideSection = {
  id: string; title: string; summary: string; steps: string; benefit: string; featureId: string | null;
};
export type UserGuideLocale = {
  title: string; eyebrow: string; lead: string; why: string; whyBody: string;
  winsTitle: string; wins: [string, string][];
  intro: string; stepsLabel: string; benefitLabel: string; openLabel: string;
  freeLabel: string; proLabel: string; footTitle: string; foot: string;
  sections: UserGuideSection[];
};
export const BUDGY_GUIDES: Record<'fr' | 'en' | 'de' | 'it', UserGuideLocale> = 
{
  "fr": {
    "title": "Découvrir Budgy",
    "eyebrow": "LE GUIDE POUR VOTRE QUOTIDIEN EN SUISSE",
    "lead": "Un seul endroit pour suivre votre budget, retrouver vos factures et contrats et décider plus sereinement.",
    "why": "Pourquoi utiliser Budgy ?",
    "whyBody": "Quand les dépenses, factures et contrats sont dispersés, il est difficile de voir ce qu’il reste réellement. Budgy les rassemble et met en évidence les engagements à surveiller.",
    "winsTitle": "Ce que vous pouvez gagner",
    "wins": [
      [
        "Du temps",
        "Moins de recherches de justificatifs et d'échéances."
      ],
      [
        "De la visibilité",
        "Une meilleure lecture de vos dépenses, budgets et charges à venir."
      ],
      [
        "Des économies possibles",
        "Des dépenses oubliées ou des contrats à comparer peuvent apparaître. Aucun gain n'est garanti."
      ]
    ],
    "intro": "Commencez avec vos revenus, puis vos dépenses et charges régulières. Ajoutez progressivement vos documents : mieux vaut des données complètes et vérifiées que des chiffres estimés.",
    "stepsLabel": "Comment faire",
    "benefitLabel": "Votre avantage",
    "openLabel": "Découvrir cette fonction",
    "freeLabel": "Inclus",
    "proLabel": "Budgy Pro",
    "footTitle": "À savoir",
    "foot": "Budgy n'est pas une banque : elle ne paie pas vos factures et ne garantit aucun rendement ni rabais. Vérifiez toujours montants, dates, QR et résultats comparatifs. Certaines fonctions demandent Budgy Pro, une connexion ou un appareil compatible.",
    "sections": [
      {
        "id": "revenus",
        "title": "1. Poser votre base financière",
        "summary": "Renseignez vos revenus pour connaître votre situation de départ.",
        "steps": "Plus → Revenus → Ajouter le salaire et les entrées ponctuelles. Actualisez après un changement.",
        "benefit": "Un budget cohérent avec vos ressources réelles.",
        "featureId": "incomes"
      },
      {
        "id": "budget",
        "title": "2. Suivre vos dépenses et budgets",
        "summary": "Enregistrez les dépenses par catégorie et fixez des limites mensuelles.",
        "steps": "Plus → Budgets → Créer un budget. Saisissez vos achats dans Dépenses et contrôlez les alertes à 80 et 100 %.",
        "benefit": "Repérer les postes qui dépassent vos prévisions.",
        "featureId": "budgets"
      },
      {
        "id": "charges",
        "title": "3. Anticiper les charges fixes et dettes",
        "summary": "Centralisez loyer, assurances, abonnements, mensualités et remboursements.",
        "steps": "Plus → Charges fixes ou Dettes → Ajoutez chaque engagement et vérifiez les échéances.",
        "benefit": "Limiter les oublis et éviter de compter deux fois une même dépense.",
        "featureId": "recurring"
      },
      {
        "id": "factures",
        "title": "4. Importer une facture et retrouver son QR",
        "summary": "Photographiez, scannez ou importez un PDF. La facture reste consultable dans Factures.",
        "steps": "Plus → Factures → Importer. Vérifiez l'extraction. Touchez la facture pour ouvrir le document, afficher ou partager son QR suisse.",
        "benefit": "Retrouver rapidement la facture pour la payer dans votre propre application bancaire.",
        "featureId": "invoices"
      },
      {
        "id": "contrats",
        "title": "5. Classer et retrouver vos contrats",
        "summary": "Conservez les contrats scannés par dossier : assurances, logement, télécoms, transport, santé, énergie, banque, travail et autres.",
        "steps": "Plus → Mon classeur → Scanner ou importer → Choisir le dossier → Enregistrer. Ouvrez ensuite le contrat pour consulter ou partager sa pièce jointe.",
        "benefit": "Retrouver vos documents et mieux anticiper renouvellements ou résiliations.",
        "featureId": "documents"
      },
      {
        "id": "epargne",
        "title": "6. Préparer vos objectifs d'épargne",
        "summary": "Suivez vos objectifs et votre progression sans mélanger épargne et dépenses.",
        "steps": "Ouvrez l'onglet Épargne, créez un objectif et ajustez ses montants à mesure que vous épargnez.",
        "benefit": "Donner une destination claire à votre argent.",
        "featureId": null
      },
      {
        "id": "suisse",
        "title": "7. Utiliser les outils utiles en Suisse",
        "summary": "Explorez le comparateur LAMal et les outils fiscaux, selon votre accès.",
        "steps": "Plus → Suisse → Comparateur LAMal ou Fiscalité. Vérifiez toujours les données et les sources officielles avant une décision.",
        "benefit": "Identifier des pistes de comparaison, sans rabais automatique ni conseil personnalisé.",
        "featureId": "lamal"
      },
      {
        "id": "intelligence",
        "title": "8. Comprendre votre dynamique financière",
        "summary": "Découvrez Budgy Twin (bêta) et les outils intelligents lorsqu'ils sont disponibles.",
        "steps": "Plus → Budgy Twin, ou les outils Pro. Vérifiez les suggestions plutôt que de les considérer comme des certitudes.",
        "benefit": "Repérer des habitudes et préparer de meilleures décisions.",
        "featureId": "twin"
      },
      {
        "id": "assistant",
        "title": "9. Utiliser Siri et les raccourcis",
        "summary": "Certaines commandes permettent d'ouvrir Budgy ou de préparer une action sur iPhone.",
        "steps": "Configurez les raccourcis Budgy dans iOS ; vérifiez toujours dans l'application qu'une dépense est bien enregistrée.",
        "benefit": "Saisir plus vite, lorsque la commande et la version iOS sont compatibles.",
        "featureId": null
      },
      {
        "id": "securite",
        "title": "10. Protéger vos documents",
        "summary": "Les documents importés sont conservés dans l'application ; des fonctions de synchronisation peuvent dépendre de votre compte et de la configuration du service.",
        "steps": "Plus → Sécurité et paramètres. Vérifiez la synchronisation et les sauvegardes avant de changer d'appareil.",
        "benefit": "Garder la maîtrise de vos données et retrouver vos justificatifs.",
        "featureId": "security"
      },
      {
        "id": "pro",
        "title": "11. Choisir les fonctions adaptées",
        "summary": "Les outils de base coexistent avec des fonctions Budgy Pro (analyse, fiscalité, exports, etc.).",
        "steps": "Ouvrez la page Budgy Pro pour voir l'accès, les conditions et le prix effectivement affichés.",
        "benefit": "Ne payer que pour les fonctions qui vous apportent une vraie utilité.",
        "featureId": "subscription"
      }
    ]
  },
  "en": {
    "title": "Explore Budgy",
    "eyebrow": "YOUR GUIDE TO MONEY IN SWITZERLAND",
    "lead": "One place for budgets, bills, contracts and clearer financial decisions.",
    "why": "Why use Budgy?",
    "whyBody": "When bills, spending and contracts are scattered, it is hard to see what remains. Budgy brings them together and helps surface obligations to review.",
    "winsTitle": "What you could gain",
    "wins": [
      [
        "Time",
        "Less searching for documents and due dates."
      ],
      [
        "Clarity",
        "A better view of spending, budgets and upcoming charges."
      ],
      [
        "Potential savings",
        "Spot forgotten spending or contracts worth comparing. Savings aren't guaranteed."
      ]
    ],
    "intro": "Start with income, spending and recurring charges. Add your documents gradually, and confirm extracted details.",
    "stepsLabel": "How to use it",
    "benefitLabel": "Potential benefit",
    "openLabel": "Explore this feature",
    "freeLabel": "Included",
    "proLabel": "Budgy Pro",
    "footTitle": "Important",
    "foot": "Budgy is not a bank: it does not pay your bills or guarantee savings. Verify amounts, deadlines, QR data and comparisons. Some features need Pro access, a connection or a compatible device.",
    "sections": [
      {
        "id": "revenus",
        "title": "1. Set up income",
        "summary": "Add income to build an accurate starting point.",
        "steps": "More → Income → Add regular and occasional income.",
        "benefit": "Budget against real resources.",
        "featureId": "incomes"
      },
      {
        "id": "budget",
        "title": "2. Track expenses and budgets",
        "summary": "Set monthly category limits and enter spending.",
        "steps": "More → Budgets → Create a budget. Add purchases under Expenses and review 80%/100% warnings.",
        "benefit": "See potential overspending sooner.",
        "featureId": "budgets"
      },
      {
        "id": "charges",
        "title": "3. Plan recurring bills and debt",
        "summary": "Track rent, insurance, subscriptions and repayments.",
        "steps": "More → Recurring charges or Debts → Add commitments and check deadlines.",
        "benefit": "Avoid surprises and double counting.",
        "featureId": "recurring"
      },
      {
        "id": "factures",
        "title": "4. Store bills and Swiss QR codes",
        "summary": "Scan, photograph or import a PDF bill.",
        "steps": "More → Invoices → Import. Confirm the data, then tap the bill to open or share its original document or Swiss QR.",
        "benefit": "Find bills to pay with your own banking app.",
        "featureId": "invoices"
      },
      {
        "id": "contrats",
        "title": "5. Organize contracts in folders",
        "summary": "Store scans under insurance, housing, telecom, transport, health, energy, banking, work or other.",
        "steps": "More → My Binder → Scan or import → Choose a folder. Reopen or share the attached original.",
        "benefit": "Find contracts and keep renewal dates in view.",
        "featureId": "documents"
      },
      {
        "id": "epargne",
        "title": "6. Set savings goals",
        "summary": "Track what you save without mixing it with spending.",
        "steps": "Open Savings, add a goal and update its progress.",
        "benefit": "See progress toward a goal.",
        "featureId": null
      },
      {
        "id": "suisse",
        "title": "7. Explore Swiss tools",
        "summary": "LAMal comparison and tax tools are available according to access.",
        "steps": "More → Switzerland → LAMal or Tax. Confirm information with official sources.",
        "benefit": "Explore possible comparisons; no guaranteed discount.",
        "featureId": "lamal"
      },
      {
        "id": "intelligence",
        "title": "8. Explore insights",
        "summary": "Budgy Twin (beta) and smart tools can suggest patterns.",
        "steps": "More → Budgy Twin or Pro tools. Review suggestions critically.",
        "benefit": "Find useful spending patterns.",
        "featureId": "twin"
      },
      {
        "id": "assistant",
        "title": "9. iPhone shortcuts",
        "summary": "Siri and Shortcuts can open or prepare Budgy actions.",
        "steps": "Configure Budgy shortcuts in iOS; confirm that each action actually appears in the app.",
        "benefit": "Faster entry when supported.",
        "featureId": null
      },
      {
        "id": "securite",
        "title": "10. Protect your data",
        "summary": "Stored documents remain in-app; cloud recovery depends on account and service setup.",
        "steps": "More → Security and Settings. Verify sync and backups before switching devices.",
        "benefit": "Keep control of your records.",
        "featureId": "security"
      },
      {
        "id": "pro",
        "title": "11. Choose your plan",
        "summary": "Core tools coexist with Pro analysis and exports.",
        "steps": "Open Budgy Pro to check current price, access and conditions.",
        "benefit": "Pay only for tools useful to you.",
        "featureId": "subscription"
      }
    ]
  },
  "de": {
    "title": "Budgy entdecken",
    "eyebrow": "IHR FINANZBEGLEITER FÜR DIE SCHWEIZ",
    "lead": "Ein Ort für Budget, Rechnungen, Verträge und bessere finanzielle Entscheidungen.",
    "why": "Warum Budgy?",
    "whyBody": "Verstreute Ausgaben, Rechnungen und Verträge erschweren die Übersicht. Budgy fasst sie zusammen und macht Verpflichtungen sichtbar.",
    "winsTitle": "Ihr möglicher Nutzen",
    "wins": [
      [
        "Zeit",
        "Weniger Suche nach Belegen und Terminen."
      ],
      [
        "Überblick",
        "Mehr Klarheit über Ausgaben und künftige Belastungen."
      ],
      [
        "Mögliche Ersparnisse",
        "Vergessene Kosten oder vergleichbare Verträge entdecken. Ohne Garantie."
      ]
    ],
    "intro": "Beginnen Sie mit Einkommen, Ausgaben und Fixkosten. Fügen Sie Dokumente schrittweise hinzu und prüfen Sie erkannte Angaben.",
    "stepsLabel": "So geht's",
    "benefitLabel": "Ihr Vorteil",
    "openLabel": "Funktion öffnen",
    "freeLabel": "Enthalten",
    "proLabel": "Budgy Pro",
    "footTitle": "Wichtig",
    "foot": "Budgy ist keine Bank und bezahlt keine Rechnungen. Ersparnisse sind nicht garantiert. Prüfen Sie Beträge, Fristen, QR-Angaben und Vergleiche. Manche Funktionen benötigen Pro, Internet oder kompatible Geräte.",
    "sections": [
      {
        "id": "revenus",
        "title": "1. Einkommen erfassen",
        "summary": "Einnahmen bilden die Grundlage des Budgets.",
        "steps": "Mehr → Einkommen → Regelmässige und einmalige Einnahmen erfassen.",
        "benefit": "Mit realistischen Mitteln planen.",
        "featureId": "incomes"
      },
      {
        "id": "budget",
        "title": "2. Ausgaben und Budget",
        "summary": "Monatsbudgets erstellen und Ausgaben kategorisieren.",
        "steps": "Mehr → Budgets → Limit festlegen, Ausgaben erfassen, Warnungen prüfen.",
        "benefit": "Überschreitungen früher erkennen.",
        "featureId": "budgets"
      },
      {
        "id": "charges",
        "title": "3. Fixkosten und Schulden",
        "summary": "Miete, Versicherungen, Abos und Raten verfolgen.",
        "steps": "Mehr → Fixkosten oder Schulden → Beträge und Termine erfassen.",
        "benefit": "Verpflichtungen besser planen.",
        "featureId": "recurring"
      },
      {
        "id": "factures",
        "title": "4. Rechnungen und QR",
        "summary": "Rechnungen fotografieren, scannen oder als PDF importieren.",
        "steps": "Mehr → Rechnungen → Importieren und prüfen. Danach Original oder QR öffnen/teilen.",
        "benefit": "Rechnungen für die eigene Banking-App finden.",
        "featureId": "invoices"
      },
      {
        "id": "contrats",
        "title": "5. Verträge in Ordnern",
        "summary": "Nach Versicherung, Wohnung, Telekom, Transport, Gesundheit, Energie, Bank, Arbeit usw. sortieren.",
        "steps": "Mehr → Mein Ordner → Scannen oder importieren → Ordner wählen.",
        "benefit": "Unterlagen und Ablauffristen wiederfinden.",
        "featureId": "documents"
      },
      {
        "id": "epargne",
        "title": "6. Sparziele",
        "summary": "Sparfortschritt getrennt von Ausgaben verfolgen.",
        "steps": "Im Tab Sparen ein Ziel anlegen und den Fortschritt erfassen.",
        "benefit": "Fortschritt sehen.",
        "featureId": null
      },
      {
        "id": "suisse",
        "title": "7. Schweizer Werkzeuge",
        "summary": "LAMal-Vergleich und Steuerwerkzeuge je nach Zugang.",
        "steps": "Mehr → Schweiz → LAMal oder Steuern. Mit offiziellen Quellen abgleichen.",
        "benefit": "Vergleichsmöglichkeiten entdecken.",
        "featureId": "lamal"
      },
      {
        "id": "intelligence",
        "title": "8. Finanzanalyse",
        "summary": "Budgy Twin (Beta) und intelligente Werkzeuge.",
        "steps": "Mehr → Budgy Twin oder Pro-Tools. Hinweise kritisch prüfen.",
        "benefit": "Muster erkennen.",
        "featureId": "twin"
      },
      {
        "id": "assistant",
        "title": "9. Siri und Kurzbefehle",
        "summary": "Unterstützte Aktionen auf dem iPhone öffnen.",
        "steps": "Kurzbefehle in iOS einrichten und Ergebnisse in der App kontrollieren.",
        "benefit": "Schnellere Eingabe, falls unterstützt.",
        "featureId": null
      },
      {
        "id": "securite",
        "title": "10. Daten schützen",
        "summary": "Dokumente in der App, Cloud-Wiederherstellung abhängig von Konto und Dienst.",
        "steps": "Mehr → Sicherheit/Einstellungen. Synchronisation und Backups prüfen.",
        "benefit": "Unterlagen unter Kontrolle halten.",
        "featureId": "security"
      },
      {
        "id": "pro",
        "title": "11. Passende Funktionen",
        "summary": "Grundfunktionen und zusätzliche Pro-Tools.",
        "steps": "Budgy Pro öffnen und Bedingungen sowie Preise prüfen.",
        "benefit": "Nur Nützliches abonnieren.",
        "featureId": "subscription"
      }
    ]
  },
  "it": {
    "title": "Scopri Budgy",
    "eyebrow": "LA GUIDA ALLE FINANZE IN SVIZZERA",
    "lead": "Un unico posto per budget, fatture, contratti e decisioni più chiare.",
    "why": "Perché usare Budgy?",
    "whyBody": "Quando spese, fatture e contratti sono sparsi, è difficile capire cosa rimane. Budgy li riunisce e rende visibili gli impegni.",
    "winsTitle": "Cosa puoi guadagnare",
    "wins": [
      [
        "Tempo",
        "Meno ricerca di documenti e scadenze."
      ],
      [
        "Controllo",
        "Una visione più chiara di spese, budget e costi futuri."
      ],
      [
        "Possibili risparmi",
        "Notare spese dimenticate o contratti da confrontare. Nessun risparmio garantito."
      ]
    ],
    "intro": "Inizia da entrate, spese e costi fissi. Aggiungi i documenti gradualmente e verifica i dati estratti.",
    "stepsLabel": "Come fare",
    "benefitLabel": "Il vantaggio",
    "openLabel": "Apri funzione",
    "freeLabel": "Incluso",
    "proLabel": "Budgy Pro",
    "footTitle": "Da sapere",
    "foot": "Budgy non è una banca e non paga fatture. Nessun risparmio è garantito. Verifica importi, scadenze, QR e confronti. Alcune funzioni richiedono Pro, Internet o un dispositivo compatibile.",
    "sections": [
      {
        "id": "revenus",
        "title": "1. Inserire le entrate",
        "summary": "Le entrate sono la base del budget.",
        "steps": "Altro → Entrate → Aggiungi entrate fisse e occasionali.",
        "benefit": "Pianificare con risorse reali.",
        "featureId": "incomes"
      },
      {
        "id": "budget",
        "title": "2. Gestire spese e budget",
        "summary": "Imposta limiti mensili e registra le spese.",
        "steps": "Altro → Budget → Crea un limite e controlla gli avvisi.",
        "benefit": "Individuare prima gli sforamenti.",
        "featureId": "budgets"
      },
      {
        "id": "charges",
        "title": "3. Costi fissi e debiti",
        "summary": "Segui affitto, assicurazioni, abbonamenti e rate.",
        "steps": "Altro → Spese ricorrenti o Debiti → Aggiungi impegni e scadenze.",
        "benefit": "Ridurre dimenticanze e duplicati.",
        "featureId": "recurring"
      },
      {
        "id": "factures",
        "title": "4. Fatture e QR svizzero",
        "summary": "Scansiona, fotografa o importa una fattura PDF.",
        "steps": "Altro → Fatture → Importa e verifica. Tocca la fattura per aprire o condividere originale e QR.",
        "benefit": "Ritrovare documenti per pagare nella tua banca.",
        "featureId": "invoices"
      },
      {
        "id": "contrats",
        "title": "5. Contratti nelle cartelle",
        "summary": "Classifica per assicurazione, casa, telecom, trasporti, salute, energia, banca, lavoro e altro.",
        "steps": "Altro → Il mio archivio → Scansiona o importa → Scegli cartella.",
        "benefit": "Ritrovare contratti e scadenze.",
        "featureId": "documents"
      },
      {
        "id": "epargne",
        "title": "6. Obiettivi di risparmio",
        "summary": "Segui i risparmi separatamente dalle spese.",
        "steps": "Apri Risparmio, crea un obiettivo e aggiorna il progresso.",
        "benefit": "Visualizzare i progressi.",
        "featureId": null
      },
      {
        "id": "suisse",
        "title": "7. Strumenti svizzeri",
        "summary": "Confronto LAMal e strumenti fiscali secondo il piano.",
        "steps": "Altro → Svizzera → LAMal o Fisco. Verifica sempre le fonti ufficiali.",
        "benefit": "Esplorare possibili confronti.",
        "featureId": "lamal"
      },
      {
        "id": "intelligence",
        "title": "8. Analisi finanziaria",
        "summary": "Budgy Twin (beta) e altri strumenti intelligenti.",
        "steps": "Altro → Budgy Twin o strumenti Pro. Verifica i consigli.",
        "benefit": "Notare schemi di spesa.",
        "featureId": "twin"
      },
      {
        "id": "assistant",
        "title": "9. Siri e Comandi Rapidi",
        "summary": "Apri azioni supportate su iPhone.",
        "steps": "Configura i comandi in iOS e verifica il risultato nell'app.",
        "benefit": "Inserimento più rapido, se compatibile.",
        "featureId": null
      },
      {
        "id": "securite",
        "title": "10. Proteggere i dati",
        "summary": "Documenti conservati nell'app; recupero cloud secondo account e configurazione.",
        "steps": "Altro → Sicurezza/Impostazioni. Verifica sincronizzazione e backup.",
        "benefit": "Mantenere controllo sui documenti.",
        "featureId": "security"
      },
      {
        "id": "pro",
        "title": "11. Scegliere il piano",
        "summary": "Funzioni base e strumenti Pro aggiuntivi.",
        "steps": "Apri Budgy Pro per prezzi e condizioni aggiornati.",
        "benefit": "Pagare solo per ciò che serve.",
        "featureId": "subscription"
      }
    ]
  }
};
