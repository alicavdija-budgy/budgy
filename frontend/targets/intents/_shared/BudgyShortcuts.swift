import AppIntents

/// Raccourcis Budgy — visibles dans l'app Raccourcis, utilisables par Siri,
/// le bouton Action et le Centre de contrôle (contrôle « Raccourci »).
/// TÂCHE 4 — phrases FR/EN/DE/IT fournies comme variantes littérales (les
/// quatre langues de Budgy) ; la correspondance Siri est littérale.
@available(iOS 16.0, *)
struct BudgyShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddExpenseIntent(),
            phrases: [
                "Ajoute une dépense dans \(.applicationName)",
                "Enregistre une dépense dans \(.applicationName)",
                "Nouvelle dépense \(.applicationName)",
                "Ajoute une dépense avec \(.applicationName)",
                "Ajoute une dépense dans l'application \(.applicationName)",
                "Enregistre ma dépense dans \(.applicationName)",
                "Note une dépense dans \(.applicationName)",
                "Saisis une dépense dans \(.applicationName)",
                "Add an expense in \(.applicationName)",
                "Füge eine Ausgabe in \(.applicationName) hinzu",
                "Aggiungi una spesa in \(.applicationName)",
            ],
            shortTitle: "Dépense",
            systemImageName: "plus.circle"
        )
        AppShortcut(
            intent: GetBudgetIntent(),
            phrases: [
                "Combien me reste-t-il dans \(.applicationName)",
                "Quel est mon solde disponible dans \(.applicationName)",
                "Mon budget \(.applicationName)",
                "What is my available balance in \(.applicationName)",
                "Wie viel bleibt mir in \(.applicationName)",
                "Quanto mi resta in \(.applicationName)",
            ],
            shortTitle: "Budget",
            systemImageName: "banknote"
        )
        AppShortcut(
            intent: GetBillsIntent(),
            phrases: [
                "Quelles factures dois-je payer dans \(.applicationName)",
                "Mes factures \(.applicationName)",
                "Which bills do I still need to pay in \(.applicationName)",
                "Welche Rechnungen muss ich in \(.applicationName) noch bezahlen",
                "Quali fatture devo ancora pagare in \(.applicationName)",
            ],
            shortTitle: "Factures",
            systemImageName: "doc.text"
        )
        AppShortcut(
            intent: GetSavingsIntent(),
            phrases: [
                "Combien ai-je économisé dans \(.applicationName)",
                "Où en est mon objectif d'épargne dans \(.applicationName)",
                "How much have I saved in \(.applicationName)",
                "Wie viel habe ich in \(.applicationName) gespart",
                "Quanto ho risparmiato in \(.applicationName)",
            ],
            shortTitle: "Épargne",
            systemImageName: "chart.line.uptrend.xyaxis"
        )
        AppShortcut(
            intent: GetMonthlyBudgetIntent(),
            phrases: [
                "Combien me reste-t-il dans mon budget ce mois-ci dans \(.applicationName)",
                "Mon budget mensuel \(.applicationName)",
                "How much is left in my monthly budget in \(.applicationName)",
                "Wie viel bleibt in meinem Monatsbudget in \(.applicationName)",
                "Quanto resta nel mio budget mensile in \(.applicationName)",
            ],
            shortTitle: "Budget mensuel",
            systemImageName: "calendar"
        )
        AppShortcut(
            intent: ScanBillIntent(),
            phrases: [
                "Scanne une facture avec \(.applicationName)",
                "Scanner une facture \(.applicationName)",
                "Scan a bill with \(.applicationName)",
            ],
            shortTitle: "Scanner",
            systemImageName: "qrcode.viewfinder"
        )
        AppShortcut(
            intent: OpenBudgyIntent(),
            phrases: [
                "Ouvre \(.applicationName)",
            ],
            shortTitle: "Ouvrir",
            systemImageName: "arrow.up.forward.app"
        )
    }

    static var shortcutTileColor: ShortcutTileColor { .teal }
}
