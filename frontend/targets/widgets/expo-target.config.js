/** @type {import('@bacons/apple-targets/app.plugin').Config} */
// Cible WidgetKit Budgy — générée par @bacons/apple-targets au prebuild,
// survit à `expo prebuild --clean`. L'App Group est hérité automatiquement
// de app.json → ios.entitlements (com.apple.security.application-groups).
module.exports = {
  type: 'widget',
  name: 'BudgyWidget',
  displayName: 'Budgy',
  deploymentTarget: '17.0',
  colors: {
    $widgetBackground: { light: '#0B0E14', dark: '#0B0E14' },
    $accent: { light: '#34D399', dark: '#34D399' },
  },
};
