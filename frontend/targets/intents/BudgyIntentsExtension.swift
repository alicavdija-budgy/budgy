import AppIntents

/// Point d'entrée OBLIGATOIRE de l'extension App Intents (BudgyIntents.appex).
///
/// Sans `@main`, le binaire de l'extension ne contient pas de section
/// `__swift5_entry` et Apple rejette l'archive (ITMS-90896). Ne JAMAIS
/// supprimer ce fichier ni retirer l'attribut `@main`.
/// (Restauré — correspond au correctif distant 485328f0.)
@main
struct BudgyIntentsExtension: AppIntentsExtension {
}
