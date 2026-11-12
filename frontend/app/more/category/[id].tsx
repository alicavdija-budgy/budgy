/**
 * BUDGY 4.0 — Ancienne rubrique intermédiaire du menu Plus (« Mes finances »,
 * etc.), supprimée par la refonte éditoriale : toutes les destinations sont
 * désormais listées directement dans l'onglet Plus. Cette route est conservée
 * uniquement pour la compatibilité des liens existants → redirection.
 */
import { Redirect } from 'expo-router';

export default function CategoryScreen() {
  return <Redirect href="/(tabs)/more" />;
}
