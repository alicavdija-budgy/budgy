// BUDGY — Configuration Expo DYNAMIQUE (mécanisme officiel Expo, SDK 54).
//
// Par défaut (APP_VARIANT absent) : la configuration de app.json est renvoyée
// STRICTEMENT inchangée → les builds development / preview / production /
// testflight sont identiques à avant (bundle com.budgy.ch.budgy, build 91).
//
// APP_VARIANT=preprod (profil EAS `preprod` uniquement) : application de test
// TOTALEMENT distincte, installable À CÔTÉ de Budgy production :
//  • nom « Budgy Test », scheme `budgy-preprod` (aucun conflit de deep links) ;
//  • iOS bundleIdentifier com.budgy.ch.budgy.preprod → sandbox de stockage
//    local SÉPARÉE (AsyncStorage/SecureStore/Keychain jamais partagés) ;
//  • App Group distinct group.com.budgy.ch.budgy.preprod (widgets/Siri de test
//    ne lisent JAMAIS les données du Budgy installé) ;
//  • package Android distinct com.budgy.ch.budgy.preprod ;
//  • AUCUNE association aux domaines budgy.ch (associatedDomains et
//    intentFilters retirés : les liens universels restent à la prod) ;
//  • OTA : canal `preprod` (eas.json) + runtimeVersion « fingerprint »
//    (la config native différant, l'empreinte diffère → aucune mise à jour
//    croisée possible avec preview/production).
module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== 'preprod') return config;

  return {
    ...config,
    name: 'Budgy Test',
    scheme: 'budgy-preprod',
    ios: {
      ...config.ios,
      bundleIdentifier: 'com.budgy.ch.budgy.preprod',
      associatedDomains: undefined,
      entitlements: {
        ...config.ios.entitlements,
        'com.apple.security.application-groups': [
          'group.com.budgy.ch.budgy.preprod',
        ],
      },
    },
    android: {
      ...config.android,
      package: 'com.budgy.ch.budgy.preprod',
      intentFilters: undefined,
    },
    extra: {
      ...config.extra,
      appVariant: 'preprod',
    },
  };
};
