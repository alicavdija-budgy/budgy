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

/// « Dis Siri, quelles factures dois-je encore payer dans Budgy ? »
/// Données réelles uniquement : factures impayées, total CHF exact, prochaine
/// échéance connue ; les obligations en devise étrangère sans taux vérifié
/// sont énoncées À PART (jamais converties ni additionnées aux CHF).
struct GetBillsIntent: AppIntent {
    static let title: LocalizedStringResource = "Mes factures à payer"
    static let description = IntentDescription("Indique les factures impayées dans Budgy.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let s = BudgyIntentStore.loadSnapshot(),
              s.widgetsEnabled,
              s.siriAmounts,
              !s.hide,
              Date().timeIntervalSince1970 - s.updatedAt < 36 * 3600
        else {
            BudgyIntentStore.setRoute("invoices")
            return .result(dialog: "Ouvrez Budgy pour voir vos factures en toute confidentialité.")
        }
        let count = s.billsCount ?? 0
        if count == 0 {
            return .result(dialog: "Aucune facture en attente dans Budgy. Tout est payé.")
        }
        var msg = "Vous avez \(count) facture\(count > 1 ? "s" : "") à payer"
        if let total = s.billsTotal, total > 0 {
            msg += ", pour \(BudgyIntentStore.chf(total)) francs"
        }
        if let foreign = s.billsForeign, !foreign.isEmpty {
            msg += ", plus des factures en devise étrangère : \(foreign), non comprises dans le total en francs"
        }
        if let next = s.nextBillTitle, let due = s.nextBillDue {
            msg += ". Prochaine échéance : \(next), le \(due)"
        }
        return .result(dialog: "\(msg).")
    }
}

/// « Dis Siri, combien ai-je économisé dans Budgy ? »
/// Répond avec l'épargne réellement enregistrée et la progression du premier
/// objectif — jamais de progression inventée.
struct GetSavingsIntent: AppIntent {
    static let title: LocalizedStringResource = "Mon épargne"
    static let description = IntentDescription("Indique l'épargne et la progression des objectifs Budgy.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let s = BudgyIntentStore.loadSnapshot(),
              s.widgetsEnabled,
              s.siriAmounts,
              !s.hide,
              Date().timeIntervalSince1970 - s.updatedAt < 36 * 3600
        else {
            BudgyIntentStore.setRoute("home")
            return .result(dialog: "Ouvrez Budgy pour voir votre épargne en toute confidentialité.")
        }
        guard let saved = s.savedTotal, saved > 0 || s.goalName != nil else {
            return .result(dialog: "Aucune épargne enregistrée pour l'instant dans Budgy.")
        }
        var msg = "Vous avez économisé \(BudgyIntentStore.chf(saved)) francs"
        if let name = s.goalName, let pct = s.goalPct {
            msg += ". Votre objectif \(name) est à \(Int(pct)) pour cent"
        }
        return .result(dialog: "\(msg).")
    }
}

/// « Dis Siri, combien me reste-t-il dans mon budget ce mois-ci ? »
/// Distinction stricte : BUDGET restant (enveloppes) ≠ DISPONIBLE du mois.
struct GetMonthlyBudgetIntent: AppIntent {
    static let title: LocalizedStringResource = "Mon budget mensuel"
    static let description = IntentDescription("Indique le budget restant des enveloppes du mois.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let s = BudgyIntentStore.loadSnapshot(),
              s.widgetsEnabled,
              s.siriAmounts,
              !s.hide,
              Date().timeIntervalSince1970 - s.updatedAt < 36 * 3600
        else {
            BudgyIntentStore.setRoute("budgets")
            return .result(dialog: "Ouvrez Budgy pour voir votre budget en toute confidentialité.")
        }
        guard let total = s.budgetTotal, total > 0 else {
            // Pas d'enveloppes définies → on répond avec le DISPONIBLE réel,
            // en le nommant correctement (jamais présenté comme un budget).
            return .result(dialog: "Aucune enveloppe de budget définie. Votre disponible réel ce mois-ci est de \(BudgyIntentStore.chf(s.available)) francs.")
        }
        let remaining = total - (s.budgetSpent ?? 0)
        var msg = "Il reste \(BudgyIntentStore.chf(remaining)) francs sur vos budgets du mois, sur \(BudgyIntentStore.chf(total)) francs prévus"
        msg += ". Votre disponible réel est de \(BudgyIntentStore.chf(s.available)) francs"
        if s.availablePartial == true {
            msg += ", hors factures en devise étrangère"
        }
        return .result(dialog: "\(msg).")
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
