/** @type {import('@bacons/apple-targets/app.plugin').Config} */
// Extension App Intents Budgy (Siri, Raccourcis, bouton Action, Centre de
// contrôle via l'app Raccourcis). Générée au prebuild, survit à --clean.
module.exports = {
  type: 'app-intent',
  name: 'BudgyIntents',
  displayName: 'Budgy Siri',
  deploymentTarget: '17.0',
};
