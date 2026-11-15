/** @type {import('@bacons/apple-targets/app.plugin').Config} */
// Extension App Intents Budgy (Siri, Raccourcis, bouton Action, Centre de
// contrôle via l'app Raccourcis). Générée au prebuild, survit à --clean.
// Isolation préprod : avec APP_VARIANT=preprod, App Group DISTINCT — les
// intents de test ne lisent jamais les données du Budgy de production.
const APP_GROUP = process.env.APP_VARIANT === 'preprod'
  ? 'group.com.budgy.ch.budgy.preprod'
  : 'group.com.budgy.ch.budgy';

module.exports = {
  type: 'app-intent',
  name: 'BudgyIntents',
  displayName: 'Budgy Siri',
  deploymentTarget: '17.0',
  entitlements: {
    'com.apple.security.application-groups': [APP_GROUP],
  },
};
