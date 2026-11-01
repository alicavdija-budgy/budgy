import AppIntents

/// Point d'entrée de l'extension Siri / Raccourcis Budgy.
/// Sans ce @main, Xcode compile la cible mais App Store Connect rejette
/// BudgyIntents.appex (ITMS-90896 : section Mach-O __swift5_entry absente).
/// Laisser les AppIntent existants et AppShortcutsProvider dans leurs fichiers.
@main
struct BudgyIntentsExtension: AppIntentsExtension {}
