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
  NSMicrophoneUsageDescription:
    'Dictate expenses and income with your voice to log transactions hands-free.',
  NSSpeechRecognitionUsageDescription:
    'Convert your voice into expense and income transactions automatically.',
  NSCameraUsageDescription:
    'Scan paper receipts to log expenses automatically.',
  NSPhotoLibraryUsageDescription:
    'Attach photos of your receipts to track and prove expenses.',
  NSPhotoLibraryAddUsageDescription:
    'Save expense receipts and exported reports to your photo library.',
  NSFaceIDUsageDescription:
    'Unlock Budgy securely using Face ID.',
  NSContactsUsageDescription:
    'Quickly split expenses with the people in your contacts.',
  NSLocationWhenInUseUsageDescription:
    'Tag your expenses with the merchant location for better insights.',
  NSUserTrackingUsageDescription:
    'We do not track you. This permission is only declared for ad-related SDK compatibility.',
  NSCalendarsUsageDescription:
    'Add recurring bills and upcoming payments to your calendar.',
  NSRemindersUsageDescription:
    'Create reminders for upcoming bills and budget reviews.',
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
