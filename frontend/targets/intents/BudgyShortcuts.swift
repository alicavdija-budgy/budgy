import AppIntents

/// Raccourcis Budgy — visibles dans l'app Raccourcis, utilisables par Siri,
/// le bouton Action et le Centre de contrôle (contrôle « Raccourci »).
/// Phrases principales en français (exigence minimale vérifiable) ; les
/// localisations EN/DE/IT pourront être ajoutées via un catalogue de chaînes.
struct BudgyShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddExpenseIntent(),
            phrases: [
                "Ajoute une dépense dans \(.applicationName)",
                "Nouvelle dépense \(.applicationName)",
            ],
            shortTitle: "Dépense",
            systemImageName: "plus.circle"
        )
        AppShortcut(
            intent: GetBudgetIntent(),
            phrases: [
                "Combien me reste-t-il dans \(.applicationName)",
                "Mon budget \(.applicationName)",
            ],
            shortTitle: "Budget",
            systemImageName: "banknote"
        )
        AppShortcut(
            intent: ScanBillIntent(),
            phrases: [
                "Scanne une facture avec \(.applicationName)",
                "Scanner une facture \(.applicationName)",
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
