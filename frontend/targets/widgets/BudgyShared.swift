import Foundation

/// Lecture sécurisée du snapshot partagé Budgy (App Group).
/// Règles de confidentialité :
/// - AUCUN fallback vers UserDefaults.standard : si l'App Group est
///   inaccessible, on n'affiche rien de financier.
/// - AUCUNE valeur de démonstration : pas de snapshot => état « Ouvrez Budgy ».
/// - Les montants ne sont affichés que si l'utilisateur a activé les widgets
///   et n'a pas activé le masquage (budgy.hideAmounts), et uniquement sur
///   l'écran verrouillé si `lockAmounts` est explicitement vrai.
enum BudgyShared {
    static let appGroup = "group.com.budgy.ch.budgy"
    static let snapshotKey = "budgy.widget.snapshot"

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

enum BudgySnapshotState {
    /// Pas de données partagées (pas connecté, widgets désactivés, App Group absent).
    case unavailable
    /// Données présentes mais montants masqués (préférence utilisateur).
    case masked(BudgySnapshot)
    /// Données affichables.
    case visible(BudgySnapshot)

    var snapshot: BudgySnapshot? {
        switch self {
        case .unavailable: return nil
        case .masked(let s), .visible(let s): return s
        }
    }

    /// Les données datent de plus de 36 h : signaler qu'elles sont peut-être obsolètes.
    var isStale: Bool {
        guard let s = snapshot else { return false }
        return Date().timeIntervalSince1970 - s.updatedAt > 36 * 3600
    }
}

enum BudgyStore {
    static func load(forLockScreen: Bool = false) -> BudgySnapshotState {
        guard let defaults = BudgyShared.defaults,
              let json = defaults.string(forKey: BudgyShared.snapshotKey),
              let data = json.data(using: .utf8),
              let snap = try? JSONDecoder().decode(BudgySnapshot.self, from: data),
              snap.widgetsEnabled
        else { return .unavailable }
        if snap.hide { return .masked(snap) }
        if forLockScreen && !snap.lockAmounts { return .masked(snap) }
        return .visible(snap)
    }

    static func chf(_ v: Double) -> String {
        let n = Int(v.rounded())
        let digits = String(abs(n))
        var grouped = ""
        for (i, c) in digits.reversed().enumerated() {
            if i > 0 && i % 3 == 0 { grouped.append("\u{2019}") }
            grouped.append(c)
        }
        return (n < 0 ? "\u{2212}" : "") + String(grouped.reversed())
    }
}
