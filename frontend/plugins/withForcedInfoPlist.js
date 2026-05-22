/**
 * withForcedInfoPlist
 *
 * Expo Config Plugin garantissant la présence des purpose strings iOS
 * MEME si un autre plugin (expo-camera, expo-image-picker, expo-audio, etc.)
 * écrase ou supprime des entrées d'Info.plist pendant le prebuild CNG.
 *
 * Ce plugin DOIT être déclaré EN DERNIER dans la section `plugins` de app.json
 * afin de s'exécuter après tous les autres plugins iOS.
 *
 * Empêche définitivement le rejet ITMS-90683 (NSMicrophoneUsageDescription manquant)
 * imposé par Apple lorsque le binaire référence des APIs audio (expo-audio,
 * expo-speech-recognition, expo-camera avec micro, etc.).
 */
const { withInfoPlist } = require('expo/config-plugins');

const REQUIRED_PURPOSE_STRINGS = {
  // ── In-use by the app ───────────────────────────────────────────────
  // Microphone — used by expo-speech-recognition + expo-audio + expo-camera (video)
  NSMicrophoneUsageDescription:
    'Dictate expenses and income with your voice to log transactions hands-free.',
  // Speech recognition — used by expo-speech-recognition
  NSSpeechRecognitionUsageDescription:
    'Convert your voice into expense and income transactions automatically.',
  // Camera — used by expo-camera + expo-image-picker
  NSCameraUsageDescription:
    'Scan paper receipts to log expenses automatically.',
  // Photo library (read) — used by expo-image-picker
  NSPhotoLibraryUsageDescription:
    'Attach photos of your receipts to track and prove expenses.',
  // Photo library (write) — used to save exported PDF reports
  NSPhotoLibraryAddUsageDescription:
    'Save exported budget reports and receipts to your photo library.',
  // Face ID — used by expo-local-authentication
  NSFaceIDUsageDescription:
    'Unlock Budgy securely using Face ID.',

  // NOTE: NSUserTrackingUsageDescription, NSContactsUsageDescription,
  // NSLocationWhenInUseUsageDescription, NSCalendarsUsageDescription,
  // NSRemindersUsageDescription INTENTIONALLY REMOVED.
  // Budgy is a privacy-first app and does NOT use those APIs.
  // Declaring unused permission strings risks an App Store rejection.
};

const withForcedInfoPlist = (config) => {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults = cfg.modResults || {};

    // FORCE l'écriture de TOUTES les purpose strings.
    // Si une clé existe déjà avec une valeur non-vide, on la conserve.
    // Sinon, on injecte la valeur par défaut.
    Object.entries(REQUIRED_PURPOSE_STRINGS).forEach(([key, defaultValue]) => {
      const current = cfg.modResults[key];
      if (
        typeof current !== 'string' ||
        current.trim().length === 0
      ) {
        cfg.modResults[key] = defaultValue;
      }
    });

    // Garanties additionnelles pour App Store
    cfg.modResults.ITSAppUsesNonExemptEncryption = false;

    if (!Array.isArray(cfg.modResults.UIBackgroundModes)) {
      cfg.modResults.UIBackgroundModes = ['fetch'];
    }

    return cfg;
  });
};

module.exports = withForcedInfoPlist;
