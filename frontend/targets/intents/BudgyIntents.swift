import AppIntents
import Foundation

/// « Dis Siri, ajoute une dépense de 4.50 pour un café dans Budgy »
/// Sécurité : la dépense est mise en file persistante avec un identifiant
/// unique, rattachée au compte actif, puis Budgy s'ouvre sur un formulaire
/// prérempli. Rien n'est enregistré ni annoncé comme enregistré avant la
/// confirmation dans l'app ; aucun solde affiché n'est modifié ici.
struct AddExpenseIntent: AppIntent {
    static let title: LocalizedStringResource = "Ajouter une dépense"
    static let description = IntentDescription("Prépare une dépense à confirmer dans Budgy.")
    static let openAppWhenRun: Bool = true

    @Parameter(title: "Montant (CHF)", requestValueDialog: "Quel montant en francs ?")
    var amount: Double

    @Parameter(title: "Description", default: "Dépense", requestValueDialog: "C'était pour quoi ?")
    var label: String

    static var parameterSummary: some ParameterSummary {
        Summary("Ajouter \(\.$amount) CHF pour \(\.$label)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard amount > 0, amount < 1_000_000 else {
            throw $amount.needsValueError("Quel montant en francs ?")
        }
        let cleanLabel = String(label.prefix(80))
        guard BudgyIntentStore.enqueue(amount: amount, label: cleanLabel) else {
            // Compte non identifiable ou file saturée : ouverture de Budgy pour
            // authentification et saisie manuelle — aucune écriture automatique.
            BudgyIntentStore.setRoute("quick-add")
            return .result(dialog: "Ouvrez Budgy pour vous authentifier et confirmer la dépense.")
        }
        BudgyIntentStore.setRoute("quick-add")
        return .result(dialog: "D'accord, confirmez \(BudgyIntentStore.chf(amount)) francs pour \(cleanLabel) dans Budgy.")
    }
}

/// « Dis Siri, combien me reste-t-il dans Budgy ? »
/// Confidentialité : Siri n'énonce un montant que si l'utilisateur a activé
/// explicitement « Montants via Siri » dans Budgy ET que le masquage est
/// inactif ET que les données sont fraîches (< 36 h). Sinon, Budgy s'ouvre.
struct GetBudgetIntent: AppIntent {
    static let title: LocalizedStringResource = "Mon budget"
    static let description = IntentDescription("Indique le budget disponible du mois.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let s = BudgyIntentStore.loadSnapshot(),
              s.widgetsEnabled,
              s.siriAmounts,
              !s.hide,
              Date().timeIntervalSince1970 - s.updatedAt < 36 * 3600
        else {
            BudgyIntentStore.setRoute("home")
            return .result(dialog: "Ouvrez Budgy pour voir votre budget en toute confidentialité.")
        }
        return .result(dialog: "Il vous reste \(BudgyIntentStore.chf(s.available)) francs ce mois-ci.")
    }
}

/// « Dis Siri, scanne une facture avec Budgy »
struct ScanBillIntent: AppIntent {
    static let title: LocalizedStringResource = "Scanner une facture"
    static let description = IntentDescription("Ouvre le scanner de factures Budgy (QR-facture suisse).")
    static let openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        BudgyIntentStore.setRoute("scanner-modal")
        return .result()
    }
}

/// « Dis Siri, ouvre Budgy »
struct OpenBudgyIntent: AppIntent {
    static let title: LocalizedStringResource = "Ouvrir Budgy"
    static let description = IntentDescription("Ouvre l'application Budgy.")
    static let openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        BudgyIntentStore.setRoute("home")
        return .result()
    }
}
