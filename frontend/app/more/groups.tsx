/**
 * Deprecated route: `/more/groups` → `/more/family` (LaFamille).
 * Kept only as a silent redirect so deep-links from older builds still work.
 */
import { Redirect } from 'expo-router';
export default function GroupsRedirect() {
  return <Redirect href="/more/family" />;
}
