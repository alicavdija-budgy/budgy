import AppIntents
import Foundation

/// « Dis Siri, ajoute une dépense de 25.50 pour un café dans Budgy »
/// Sécurité : la dépense est mise en file persistante avec un identifiant
/// unique, rattachée au compte actif, puis Budgy s'ouvre sur un formulaire
/// prérempli. Rien n'est enregistré ni annoncé comme enregistré avant la
/// confirmation dans l'app ; aucun solde affiché n'est modifié ici.
/// Les montants décimaux (25.50) sont préservés tels quels.
@available(iOS 16.0, *)
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
            return .result(dialog: "\(BudgyL10n.t("addAuth"))")
        }
        BudgyIntentStore.setRoute("quick-add")
        return .result(dialog: "\(BudgyL10n.t("addConfirm", ["amt": BudgyIntentStore.chf(amount), "label": cleanLabel]))")
    }
}

/// Garde de confidentialité commune aux 4 consultations : montants énoncés
/// UNIQUEMENT si « Montants via Siri » est actif, masquage inactif et
/// données fraîches (< 36 h). Sinon, ouverture de Budgy (réponse localisée).
private func guardedSnapshot(route: String) -> BudgySnapshot? {
    guard let s = BudgyIntentStore.loadSnapshot(),
          s.widgetsEnabled,
          s.siriAmounts,
          !s.hide,
          Date().timeIntervalSince1970 - s.updatedAt < 36 * 3600
    else {
        BudgyIntentStore.setRoute(route)
        return nil
    }
    return s
}

/// « Dis Siri, combien me reste-t-il dans Budgy ? »
@available(iOS 16.0, *)
struct GetBudgetIntent: AppIntent {
    static let title: LocalizedStringResource = "Mon budget"
    static let description = IntentDescription("Indique le budget disponible du mois.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let s = guardedSnapshot(route: "home") else {
            return .result(dialog: "\(BudgyL10n.t("openPrivacy"))")
        }
        var msg = BudgyL10n.t("budgetAnswer", ["amt": BudgyIntentStore.chf(s.available)])
        // Disponible PARTIEL : certaines obligations en devises étrangères
        // (sans taux vérifié) ne sont pas comprises — Siri le précise.
        if s.availablePartial == true { msg += BudgyL10n.t("partialSuffix") }
        return .result(dialog: "\(msg)")
    }
}

/// « Dis Siri, quelles factures dois-je encore payer dans Budgy ? »
/// Périmètre ÉNONCÉ : factures exigibles d'ici la fin du mois (y compris
/// déjà en retard). billsCount et billsTotal portent sur ce même périmètre ;
/// les devises étrangères sont énoncées À PART (jamais converties).
@available(iOS 16.0, *)
struct GetBillsIntent: AppIntent {
    static let title: LocalizedStringResource = "Mes factures à payer"
    static let description = IntentDescription("Indique les factures impayées dans Budgy.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let s = guardedSnapshot(route: "invoices") else {
            return .result(dialog: "\(BudgyL10n.t("openPrivacy"))")
        }
        let count = s.billsCount ?? 0
        if count == 0 {
            return .result(dialog: "\(BudgyL10n.t("billsNone"))")
        }
        var msg = count == 1
            ? BudgyL10n.t("billsOne")
            : BudgyL10n.t("billsMany", ["n": String(count)])
        if let overdue = s.billsOverdue, overdue > 0 {
            msg += BudgyL10n.t("billsOverdue", ["n": String(overdue)])
        }
        if let total = s.billsTotal, total > 0 {
            msg += BudgyL10n.t("billsTotal", ["amt": BudgyIntentStore.chf(total)])
        }
        if let foreign = s.billsForeign, !foreign.isEmpty {
            msg += BudgyL10n.t("billsForeign", ["x": foreign])
        }
        if let next = s.nextBillTitle, let due = s.nextBillDue {
            msg += BudgyL10n.t("billsNext", ["t": next, "d": due])
        }
        return .result(dialog: "\(msg).")
    }
}

/// « Dis Siri, combien ai-je économisé dans Budgy ? »
/// Répond avec l'épargne réellement enregistrée et la progression du premier
/// objectif — jamais de progression inventée.
@available(iOS 16.0, *)
struct GetSavingsIntent: AppIntent {
    static let title: LocalizedStringResource = "Mon épargne"
    static let description = IntentDescription("Indique l'épargne et la progression des objectifs Budgy.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let s = guardedSnapshot(route: "home") else {
            return .result(dialog: "\(BudgyL10n.t("openPrivacy"))")
        }
        guard let saved = s.savedTotal, saved > 0 || s.goalName != nil else {
            return .result(dialog: "\(BudgyL10n.t("savingsNone"))")
        }
        var msg = BudgyL10n.t("savingsMain", ["amt": BudgyIntentStore.chf(saved)])
        if let name = s.goalName, let pct = s.goalPct {
            msg += BudgyL10n.t("savingsGoal", ["g": name, "p": String(Int(pct))])
        }
        return .result(dialog: "\(msg).")
    }
}

/// « Dis Siri, combien me reste-t-il dans mon budget ce mois-ci ? »
/// Distinction stricte : BUDGET restant (enveloppes réelles, mêmes chiffres
/// que l'écran Budgets via le sélecteur partagé) ≠ DISPONIBLE du mois.
@available(iOS 16.0, *)
struct GetMonthlyBudgetIntent: AppIntent {
    static let title: LocalizedStringResource = "Mon budget mensuel"
    static let description = IntentDescription("Indique le budget restant des enveloppes du mois.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let s = guardedSnapshot(route: "budgets") else {
            return .result(dialog: "\(BudgyL10n.t("openPrivacy"))")
        }
        guard let total = s.budgetTotal, total > 0 else {
            // AUCUNE enveloppe définie : annoncé clairement, avec le
            // DISPONIBLE réel en secours — nommé correctement, et précision
            // « partiel » si des devises étrangères sont exclues.
            var msg = BudgyL10n.t("mbNoEnvelopes", ["amt": BudgyIntentStore.chf(s.available)])
            if s.availablePartial == true { msg += BudgyL10n.t("partialSuffix") }
            return .result(dialog: "\(msg).")
        }
        let remaining = total - (s.budgetSpent ?? 0)
        var msg = BudgyL10n.t("mbMain", ["amt": BudgyIntentStore.chf(remaining), "tot": BudgyIntentStore.chf(total)])
        msg += BudgyL10n.t("mbAvailable", ["amt": BudgyIntentStore.chf(s.available)])
        if s.availablePartial == true { msg += BudgyL10n.t("partialSuffix") }
        return .result(dialog: "\(msg).")
    }
}

/// « Dis Siri, scanne une facture avec Budgy »
@available(iOS 16.0, *)
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
@available(iOS 16.0, *)
struct OpenBudgyIntent: AppIntent {
    static let title: LocalizedStringResource = "Ouvrir Budgy"
    static let description = IntentDescription("Ouvre l'application Budgy.")
    static let openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        BudgyIntentStore.setRoute("home")
        return .result()
    }
}
