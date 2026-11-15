/** @type {import('@bacons/apple-targets/app.plugin').Config} */
// Cible WidgetKit Budgy — générée par @bacons/apple-targets au prebuild,
// survit à `expo prebuild --clean`.
// Isolation préprod : avec APP_VARIANT=preprod, App Group DISTINCT — les
// widgets de test ne lisent jamais les données du Budgy de production.
const APP_GROUP = process.env.APP_VARIANT === 'preprod'
  ? 'group.com.budgy.ch.budgy.preprod'
  : 'group.com.budgy.ch.budgy';

module.exports = {
  type: 'widget',
  name: 'BudgyWidget',
  displayName: 'Budgy',
  deploymentTarget: '17.0',
  entitlements: {
    'com.apple.security.application-groups': [APP_GROUP],
  },
  colors: {
    $widgetBackground: { light: '#0B0E14', dark: '#0B0E14' },
    $accent: { light: '#34D399', dark: '#34D399' },
  },
};
