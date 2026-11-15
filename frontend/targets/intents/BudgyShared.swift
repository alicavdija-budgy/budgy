import Foundation

/// Stockage partagé Budgy pour Siri / Raccourcis — règles strictes :
/// - aucun repli vers un stockage non partagé ;
/// - aucune valeur fictive ;
/// - la file des dépenses dictées n'est JAMAIS vidée ici : chaque entrée a un
///   identifiant unique et n'est retirée par l'app qu'après enregistrement
///   réellement confirmé dans le store Budgy (aucune perte, aucun doublon).
enum BudgyShared {
    static let appGroup = "group.com.budgy.ch.budgy"
    static let snapshotKey = "budgy.widget.snapshot"
    static let pendingKey = "budgy.widget.pendingExpenses"
    static let routeKey = "budgy.widget.pendingRoute"

    static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }
}

struct BudgySnapshot: Codable {
    var v: Int
    var scope: String
    var available: Double
    var spent: Double
    var income: Double
    var periodLabel: String
    var goalName: String?
    var goalPct: Double?
    var currency: String
    var hide: Bool
    var widgetsEnabled: Bool
    var lockAmounts: Bool
    var siriAmounts: Bool
    var updatedAt: Double
    // TÂCHE 4 — champs OPTIONNELS (rétro-compatibles) pour les commandes
    // Siri factures / épargne / budget. Données réelles uniquement.
    var billsCount: Int?
    var billsOverdue: Int?
    var billsTotal: Double?
    var billsForeign: String?
    var nextBillTitle: String?
    var nextBillDue: String?
    var savedTotal: Double?
    var budgetTotal: Double?
    var budgetSpent: Double?
    var availablePartial: Bool?
    /// Langue active de l'app (fr/de/it/en) — pilote la langue des dialogues.
    var lang: String?
}

/// TÂCHE 4 — Localisation des DIALOGUES App Intents (FR/DE/IT/EN).
/// La langue suit celle choisie DANS Budgy (snapshot partagé) ; à défaut,
/// la langue du système. Les phrases de déclenchement ne suffisent pas :
/// les réponses vocales elles-mêmes sont localisées ici.
enum BudgyL10n {
    static func lang() -> String {
        if let l = BudgyIntentStore.loadSnapshot()?.lang, ["fr", "de", "it", "en"].contains(l) { return l }
        let sys = String(Locale.preferredLanguages.first?.prefix(2) ?? "fr").lowercased()
        return ["fr", "de", "it", "en"].contains(sys) ? sys : "fr"
    }

    static func t(_ key: String) -> String {
        let l = lang()
        return TABLE[key]?[l] ?? TABLE[key]?["fr"] ?? key
    }

    /// Remplacement simple de marqueurs {x} (ordre libre, sûr pour la voix).
    static func t(_ key: String, _ vars: [String: String]) -> String {
        var s = t(key)
        for (k, v) in vars { s = s.replacingOccurrences(of: "{\(k)}", with: v) }
        return s
    }

    static let TABLE: [String: [String: String]] = [
        "openPrivacy": [
            "fr": "Ouvrez Budgy pour consulter vos chiffres en toute confidentialité.",
            "de": "Öffnen Sie Budgy, um Ihre Zahlen vertraulich einzusehen.",
            "it": "Apri Budgy per consultare i tuoi dati in tutta riservatezza.",
            "en": "Open Budgy to view your figures privately.",
        ],
        "addAuth": [
            "fr": "Ouvrez Budgy pour vous authentifier et confirmer la dépense.",
            "de": "Öffnen Sie Budgy, um sich anzumelden und die Ausgabe zu bestätigen.",
            "it": "Apri Budgy per autenticarti e confermare la spesa.",
            "en": "Open Budgy to sign in and confirm the expense.",
        ],
        "addConfirm": [
            "fr": "D'accord, confirmez {amt} francs pour {label} dans Budgy.",
            "de": "Alles klar — bestätigen Sie {amt} Franken für {label} in Budgy.",
            "it": "D'accordo, conferma {amt} franchi per {label} in Budgy.",
            "en": "Okay — confirm {amt} francs for {label} in Budgy.",
        ],
        "budgetAnswer": [
            "fr": "Il vous reste {amt} francs ce mois-ci.",
            "de": "Ihnen bleiben diesen Monat {amt} Franken.",
            "it": "Ti restano {amt} franchi questo mese.",
            "en": "You have {amt} francs left this month.",
        ],
        "partialSuffix": [
            "fr": " Ce montant ne tient pas compte de certaines obligations en devises étrangères.",
            "de": " Dieser Betrag berücksichtigt bestimmte Verpflichtungen in Fremdwährungen nicht.",
            "it": " Questo importo non tiene conto di alcuni obblighi in valuta estera.",
            "en": " This amount does not yet include some foreign-currency obligations.",
        ],
        "billsNone": [
            "fr": "Aucune facture à payer d'ici la fin du mois dans Budgy.",
            "de": "Keine Rechnungen bis Ende des Monats in Budgy fällig.",
            "it": "Nessuna fattura da pagare entro fine mese in Budgy.",
            "en": "No bills due by the end of the month in Budgy.",
        ],
        "billsOne": [
            "fr": "Vous avez 1 facture à payer d'ici la fin du mois",
            "de": "Sie haben 1 Rechnung, die bis Ende des Monats fällig ist",
            "it": "Hai 1 fattura da pagare entro fine mese",
            "en": "You have 1 bill due by the end of the month",
        ],
        "billsMany": [
            "fr": "Vous avez {n} factures à payer d'ici la fin du mois",
            "de": "Sie haben {n} Rechnungen, die bis Ende des Monats fällig sind",
            "it": "Hai {n} fatture da pagare entro fine mese",
            "en": "You have {n} bills due by the end of the month",
        ],
        "billsOverdue": [
            "fr": ", dont {n} déjà en retard",
            "de": ", davon {n} bereits überfällig",
            "it": ", di cui {n} già in ritardo",
            "en": ", including {n} already overdue",
        ],
        "billsTotal": [
            "fr": ", pour {amt} francs",
            "de": ", für {amt} Franken",
            "it": ", per {amt} franchi",
            "en": ", totalling {amt} francs",
        ],
        "billsForeign": [
            "fr": ", plus des factures en devise étrangère : {x}, non comprises dans le total en francs",
            "de": ", plus Rechnungen in Fremdwährung: {x}, nicht im Frankenbetrag enthalten",
            "it": ", più fatture in valuta estera: {x}, non incluse nel totale in franchi",
            "en": ", plus foreign-currency bills: {x}, not included in the franc total",
        ],
        "billsNext": [
            "fr": ". Prochaine échéance : {t}, le {d}",
            "de": ". Nächste Fälligkeit: {t}, am {d}",
            "it": ". Prossima scadenza: {t}, il {d}",
            "en": ". Next due: {t}, on {d}",
        ],
        "savingsNone": [
            "fr": "Aucune épargne enregistrée pour l'instant dans Budgy.",
            "de": "In Budgy sind noch keine Ersparnisse erfasst.",
            "it": "Nessun risparmio registrato per ora in Budgy.",
            "en": "No savings recorded yet in Budgy.",
        ],
        "savingsMain": [
            "fr": "Vous avez économisé {amt} francs",
            "de": "Sie haben {amt} Franken gespart",
            "it": "Hai risparmiato {amt} franchi",
            "en": "You have saved {amt} francs",
        ],
        "savingsGoal": [
            "fr": ". Votre objectif {g} est à {p} pour cent",
            "de": ". Ihr Ziel {g} steht bei {p} Prozent",
            "it": ". Il tuo obiettivo {g} è al {p} per cento",
            "en": ". Your goal {g} is at {p} percent",
        ],
        "mbNoEnvelopes": [
            "fr": "Aucune enveloppe de budget définie. Votre disponible réel ce mois-ci est de {amt} francs",
            "de": "Keine Budget-Umschläge definiert. Ihr tatsächlich verfügbarer Betrag diesen Monat ist {amt} Franken",
            "it": "Nessuna busta di budget definita. Il tuo disponibile reale questo mese è di {amt} franchi",
            "en": "No budget envelopes defined. Your real available amount this month is {amt} francs",
        ],
        "mbMain": [
            "fr": "Il reste {amt} francs sur vos budgets du mois, sur {tot} francs prévus",
            "de": "Von Ihren Monatsbudgets bleiben {amt} Franken von geplanten {tot} Franken",
            "it": "Restano {amt} franchi sui budget del mese, su {tot} franchi previsti",
            "en": "You have {amt} francs left across this month's budgets, out of {tot} francs planned",
        ],
        "mbAvailable": [
            "fr": ". Votre disponible réel est de {amt} francs",
            "de": ". Ihr tatsächlich verfügbarer Betrag ist {amt} Franken",
            "it": ". Il tuo disponibile reale è di {amt} franchi",
            "en": ". Your real available amount is {amt} francs",
        ],
    ]
}

/// Dépense dictée à Siri, en attente de confirmation DANS l'app.
struct PendingExpense: Codable, Identifiable {
    var id: String
    var amount: Double
    var label: String
    var scope: String
    var createdAt: Double
}

enum BudgyIntentStore {
    static func loadSnapshot() -> BudgySnapshot? {
        guard let d = BudgyShared.defaults,
              let json = d.string(forKey: BudgyShared.snapshotKey),
              let data = json.data(using: .utf8),
              let snap = try? JSONDecoder().decode(BudgySnapshot.self, from: data)
        else { return nil }
        return snap
    }

    static func pending() -> [PendingExpense] {
        guard let d = BudgyShared.defaults,
              let json = d.string(forKey: BudgyShared.pendingKey),
              let data = json.data(using: .utf8),
              let list = try? JSONDecoder().decode([PendingExpense].self, from: data)
        else { return [] }
        return list
    }

    /// Ajoute à la file (persistée, plafonnée) SANS toucher au solde affiché.
    /// REFUSE l'ajout si aucun compte n'est identifiable (pas de snapshot) :
    /// aucune dépense d'origine non vérifiable ne doit pouvoir être proposée
    /// à n'importe quel compte — Budgy s'ouvrira pour authentification.
    @discardableResult
    static func enqueue(amount: Double, label: String) -> Bool {
        guard let d = BudgyShared.defaults else { return false }
        guard let scope = loadSnapshot()?.scope, !scope.isEmpty else { return false }
        var list = pending()
        guard list.count < 20 else { return false }
        list.append(PendingExpense(
            id: UUID().uuidString,
            amount: amount,
            label: label,
            scope: scope,
            createdAt: Date().timeIntervalSince1970
        ))
        guard let data = try? JSONEncoder().encode(list),
              let json = String(data: data, encoding: .utf8) else { return false }
        d.set(json, forKey: BudgyShared.pendingKey)
        return true
    }

    static func setRoute(_ route: String) {
        BudgyShared.defaults?.set(route, forKey: BudgyShared.routeKey)
    }

    /// TÂCHE 4 — formatage VOCAL des montants : centimes PRÉSERVÉS
    /// (25.50 → « 25.50 », jamais 26), arrondi sur cents ENTIERS (évite les
    /// erreurs d'arrondi binaires de Double), milliers groupés à la suisse
    /// (1'234.50), signe moins mathématique pour les montants négatifs.
    /// Le montant réel conservé dans Budgy n'est JAMAIS modifié ici.
    static func chf(_ v: Double) -> String {
        let cents = Int((abs(v) * 100).rounded())
        let francs = cents / 100
        let rem = cents % 100
        var grouped = ""
        for (i, c) in String(francs).reversed().enumerated() {
            if i > 0 && i % 3 == 0 { grouped.append("\u{2019}") }
            grouped.append(c)
        }
        let intPart = String(grouped.reversed())
        let sign = (v < 0 && cents > 0) ? "\u{2212}" : ""
        return rem == 0 ? sign + intPart : sign + intPart + "." + String(format: "%02d", rem)
    }
}
