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

    static func chf(_ v: Double) -> String {
        let n = Int(v.rounded())
        let digits = String(abs(n))
        var grouped = ""
        for (i, c) in digits.reversed().enumerated() {
            if i > 0 && i % 3 == 0 { grouped.append("\u{2019}") }
            grouped.append(c)
        }
        return (n < 0 ? "moins " : "") + String(grouped.reversed())
    }
}
