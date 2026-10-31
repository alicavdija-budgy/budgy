import WidgetKit
import SwiftUI

// MARK: - Timeline

struct BudgyEntry: TimelineEntry {
    let date: Date
    let state: BudgySnapshotState
    let lockScreen: Bool
}

struct BudgyProvider: TimelineProvider {
    let lockScreen: Bool

    func placeholder(in context: Context) -> BudgyEntry {
        BudgyEntry(date: Date(), state: .unavailable, lockScreen: lockScreen)
    }

    func getSnapshot(in context: Context, completion: @escaping (BudgyEntry) -> Void) {
        completion(BudgyEntry(date: Date(), state: BudgyStore.load(forLockScreen: lockScreen), lockScreen: lockScreen))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BudgyEntry>) -> Void) {
        let entry = BudgyEntry(date: Date(), state: BudgyStore.load(forLockScreen: lockScreen), lockScreen: lockScreen)
        // Rafraîchissement passif ~1 h ; l'app force un reload à chaque changement réel.
        let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date().addingTimeInterval(3600)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// MARK: - Palette Budgy Smart

private enum UI {
    static let ink = Color(red: 0.043, green: 0.055, blue: 0.078)      // noir encre
    static let mint = Color(red: 0.204, green: 0.827, blue: 0.600)     // vert menthe
    static let textDim = Color.white.opacity(0.55)
    static let hairline = Color.white.opacity(0.10)
}

private struct StaleDot: View {
    let state: BudgySnapshotState
    var body: some View {
        if state.isStale {
            HStack(spacing: 3) {
                Circle().fill(Color.orange).frame(width: 5, height: 5)
                Text("Non à jour").font(.system(size: 9, weight: .medium)).foregroundColor(UI.textDim)
            }
        }
    }
}

private struct MaskedAmount: View {
    var size: CGFloat = 24
    var body: some View {
        Text("•••••")
            .font(.system(size: size, weight: .bold, design: .rounded))
            .foregroundColor(.white)
    }
}

private struct EmptyBudgy: View {
    var body: some View {
        VStack(spacing: 6) {
            Text("Budgy").font(.system(size: 14, weight: .heavy, design: .rounded)).foregroundColor(UI.mint)
            Text("Ouvrez l'app pour activer le widget")
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(UI.textDim)
                .multilineTextAlignment(.center)
        }
    }
}

// MARK: - Petit widget

struct BudgySmallView: View {
    let entry: BudgyEntry
    var body: some View {
        Group {
            switch entry.state {
            case .unavailable:
                EmptyBudgy()
            case .masked(let s):
                content(s, masked: true)
            case .visible(let s):
                content(s, masked: false)
            }
        }
        .containerBackground(for: .widget) { UI.ink }
        .widgetURL(URL(string: "budgy://home"))
    }

    private func content(_ s: BudgySnapshot, masked: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("Budgy").font(.system(size: 12, weight: .heavy, design: .rounded)).foregroundColor(UI.mint)
                Spacer()
                StaleDot(state: entry.state)
            }
            Spacer(minLength: 0)
            Text("Disponible").font(.system(size: 10, weight: .semibold)).foregroundColor(UI.textDim)
            if masked {
                MaskedAmount(size: 22)
            } else {
                Text(BudgyStore.chf(s.available))
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .foregroundColor(s.available < 0 ? Color(red: 1.0, green: 0.42, blue: 0.42) : .white)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
            }
            Text("\(s.currency) · \(s.periodLabel)")
                .font(.system(size: 9.5, weight: .medium)).foregroundColor(UI.textDim)
        }
    }
}

struct BudgySmallWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "BudgySmall", provider: BudgyProvider(lockScreen: false)) { entry in
            BudgySmallView(entry: entry)
        }
        .configurationDisplayName("Budget disponible")
        .description("Votre budget disponible du mois, en CHF.")
        .supportedFamilies([.systemSmall])
    }
}

// MARK: - Widget moyen

struct BudgyMediumView: View {
    let entry: BudgyEntry
    var body: some View {
        Group {
            switch entry.state {
            case .unavailable:
                EmptyBudgy()
            case .masked(let s):
                content(s, masked: true)
            case .visible(let s):
                content(s, masked: false)
            }
        }
        .containerBackground(for: .widget) { UI.ink }
    }

    private func content(_ s: BudgySnapshot, masked: Bool) -> some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text("Budgy").font(.system(size: 12, weight: .heavy, design: .rounded)).foregroundColor(UI.mint)
                    StaleDot(state: entry.state)
                }
                Spacer(minLength: 0)
                Text("Disponible · \(s.periodLabel)").font(.system(size: 10, weight: .semibold)).foregroundColor(UI.textDim)
                if masked {
                    MaskedAmount(size: 24)
                } else {
                    Text("\(BudgyStore.chf(s.available)) \(s.currency)")
                        .font(.system(size: 25, weight: .bold, design: .rounded))
                        .foregroundColor(s.available < 0 ? Color(red: 1.0, green: 0.42, blue: 0.42) : .white)
                        .minimumScaleFactor(0.6).lineLimit(1)
                }
                Text(masked ? "Dépensé : •••••" : "Dépensé : \(BudgyStore.chf(s.spent)) \(s.currency)")
                    .font(.system(size: 10.5, weight: .medium)).foregroundColor(UI.textDim)
                if let name = s.goalName, let pct = s.goalPct {
                    HStack(spacing: 5) {
                        ProgressView(value: min(max(pct / 100, 0), 1))
                            .progressViewStyle(.linear).tint(UI.mint).frame(width: 54)
                        Text("\(name) · \(Int(pct.rounded())) %")
                            .font(.system(size: 9.5, weight: .medium)).foregroundColor(UI.textDim).lineLimit(1)
                    }
                }
            }
            Spacer(minLength: 0)
            VStack(spacing: 8) {
                Link(destination: URL(string: "budgy://quick-add")!) {
                    actionChip(icon: "plus.circle.fill", label: "Dépense")
                }
                Link(destination: URL(string: "budgy://scanner-modal")!) {
                    actionChip(icon: "qrcode.viewfinder", label: "Scanner")
                }
            }
        }
    }

    private func actionChip(icon: String, label: String) -> some View {
        VStack(spacing: 3) {
            Image(systemName: icon).font(.system(size: 16, weight: .semibold)).foregroundColor(UI.mint)
            Text(label).font(.system(size: 9, weight: .semibold)).foregroundColor(.white)
        }
        .frame(width: 62, height: 48)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color.white.opacity(0.06)))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(UI.hairline, lineWidth: 1))
    }
}

struct BudgyMediumWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "BudgyMedium", provider: BudgyProvider(lockScreen: false)) { entry in
            BudgyMediumView(entry: entry)
        }
        .configurationDisplayName("Tableau de bord")
        .description("Disponible, dépenses du mois et actions rapides.")
        .supportedFamilies([.systemMedium])
    }
}

// MARK: - Écran verrouillé (confidentiel par défaut)

struct BudgyLockView: View {
    let entry: BudgyEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        Group {
            switch entry.state {
            case .unavailable:
                Text("Budgy").font(.system(size: 12, weight: .bold, design: .rounded))
            case .masked:
                lockContent(amount: nil)
            case .visible(let s):
                lockContent(amount: "\(BudgyStore.chf(s.available)) \(s.currency)")
            }
        }
        .containerBackground(for: .widget) { Color.clear }
        .widgetURL(URL(string: "budgy://home"))
    }

    @ViewBuilder
    private func lockContent(amount: String?) -> some View {
        if family == .accessoryInline {
            Text(amount.map { "Budgy · \($0)" } ?? "Budgy · •••••")
        } else {
            VStack(alignment: .leading, spacing: 1) {
                Text("Budgy").font(.system(size: 11, weight: .heavy, design: .rounded))
                Text(amount ?? "•••••").font(.system(size: 15, weight: .bold, design: .rounded))
                Text("Disponible").font(.system(size: 9, weight: .medium)).opacity(0.7)
            }
        }
    }
}

struct BudgyLockWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "BudgyLock", provider: BudgyProvider(lockScreen: true)) { entry in
            BudgyLockView(entry: entry)
        }
        .configurationDisplayName("Budgy (écran verrouillé)")
        .description("Montants masqués par défaut ; activez-les dans Réglages Budgy.")
        .supportedFamilies([.accessoryInline, .accessoryRectangular])
    }
}

// MARK: - Bundle

@main
struct BudgyWidgetBundle: WidgetBundle {
    var body: some Widget {
        BudgySmallWidget()
        BudgyMediumWidget()
        BudgyLockWidget()
    }
}
