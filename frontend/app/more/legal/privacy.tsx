/**
 * GUARDIAN MONEY CHF - Privacy Policy (FR)
 * Compliant with Apple App Store & Google Play requirements + nLPD/RGPD.
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Spacing, FontSizes, FontWeights } from '../../../src/constants/theme';
import { useTheme } from '../../../src/hooks/useTheme';

export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useTheme();
  const styles = makeStyles(C);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={26} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Confidentialité</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>Politique de confidentialité</Text>
        <Text style={styles.meta}>Dernière mise à jour : {new Date().toLocaleDateString('fr-CH')}</Text>

        <Text style={styles.p}>
          La présente politique décrit comment Budgy (« l’application ») collecte, utilise et protège
          vos données personnelles. Elle est conforme à la Loi fédérale suisse sur la protection des données (nLPD, en
          vigueur depuis le 1ᵉʳ septembre 2023) ainsi qu’au Règlement général européen sur la protection des données (RGPD).
        </Text>

        <Text style={styles.h2}>1. Éditeur</Text>
        <Text style={styles.p}>
          L’application est éditée par un particulier domicilié en Suisse, à titre de projet personnel non commercial.
          Aucun revenu publicitaire n’est perçu. Les abonnements « Pro éventuels » couvrent uniquement les frais
          d’infrastructure (hébergement, API d’IA, stores).
        </Text>

        <Text style={styles.h2}>2. Données collectées</Text>
        <Text style={styles.p}>
          L’application est conçue selon le principe « privacy-by-design ». Les données suivantes peuvent être
          traitées uniquement dans le cadre strict du fonctionnement de l’application :
        </Text>
        <Text style={styles.li}>• <Text style={styles.b}>Compte utilisateur</Text> : adresse e-mail, nom d’affichage, mot de passe chiffré (hash).</Text>
        <Text style={styles.li}>• <Text style={styles.b}>Données financières saisies manuellement</Text> : transactions, budgets, objectifs, revenus, dettes.</Text>
        <Text style={styles.li}>• <Text style={styles.b}>Préférences</Text> : canton, devise, langue, thème, notifications.</Text>
        <Text style={styles.li}>• <Text style={styles.b}>Documents privés</Text> : factures, contrats, tickets, photographies et PDF conservés sur l'appareil ; le build 92 n'envoie plus automatiquement leurs fichiers ou métadonnées documentaires vers Supabase. Des copies historiques déjà envoyées peuvent subsister.</Text>
        <Text style={styles.li}>• <Text style={styles.b}>Identifiants biométriques</Text> : aucun — nous utilisons uniquement l’API système Apple/Google qui garde ces données localement sur votre appareil.</Text>

        <Text style={styles.h2}>3. Finalités du traitement</Text>
        <Text style={styles.li}>• Fournir les fonctionnalités de gestion budgétaire demandées par l’utilisateur.</Text>
        <Text style={styles.li}>• Synchroniser certaines données financières hors documents si la synchronisation Budgy est activée. Les factures, contrats, tickets et documents ne font pas partie de cette synchronisation.</Text>
        <Text style={styles.li}>• Exécuter les analyses d’IA que vous déclenchez manuellement (Coach, Scanner OCR, Économiseur, etc.).</Text>
        <Text style={styles.li}>• Vous envoyer des notifications locales (rappels mensuels) si vous l’autorisez.</Text>

        <Text style={styles.h2}>4. Stockage et localisation</Text>
        <Text style={styles.p}>
          Les documents sont conservés dans le stockage privé de Budgy sur votre iPhone, iPad ou appareil Android.
          Sur iOS, ils peuvent faire partie de la sauvegarde iCloud personnelle de l'appareil si celle-ci est activée.
          Pour placer une copie consultable dans iCloud Drive, l'utilisateur choisit volontairement
          « Enregistrer dans Fichiers » et son propre iCloud Drive ; ce n'est pas une synchronisation automatique.
          Les autres données financières peuvent être synchronisées avec le serveur Budgy suivant la configuration
          et les paramètres de l'application. Le stockage local bénéficie des protections du système et du verrouillage
          de l'appareil, sans garantie de chiffrement de bout en bout propre à Budgy.
        </Text>

        <Text style={styles.h2}>5. Analyses par IA (Coach, Scanner, Économiseur)</Text>
        <Text style={styles.p}>
          Lorsque vous choisissez expressément l'analyse OCR distante, la photo ou le PDF est envoyé
          temporairement à une API de traitement. Le document peut contenir des noms, adresses,
          numéros de référence et autres données personnelles : il ne doit pas être considéré comme anonymisé.
          Vous pouvez refuser cet envoi et utiliser la saisie manuelle. Les services de traitement et leurs
          conditions de conservation doivent être vérifiés séparément avant toute publication de nouvelles garanties.
        </Text>

        <Text style={styles.h2}>6. Partage de données</Text>
        <Text style={styles.p}>
          Aucune donnée personnelle n’est vendue, louée ou partagée à des fins publicitaires. Les seuls transferts
          possibles sont :
        </Text>
        <Text style={styles.li}>• Supabase (synchronisation des données non documentaires selon les fonctionnalités ; anciens documents déjà envoyés avant build 92 non effacés automatiquement).</Text>
        <Text style={styles.li}>• Emergent / OpenAI / Google (API d’IA, ponctuellement à votre demande).</Text>
        <Text style={styles.li}>• Apple / Google (paiements in-app via RevenueCat, conformément aux CGV des stores).</Text>

        <Text style={styles.h2}>7. Durée de conservation</Text>
        <Text style={styles.p}>
          Les pièces locales restent sur votre appareil jusqu'à leur suppression dans Budgy, à la suppression
          des données locales ou à la restauration/effacement de l'appareil selon iOS ou Android.
          Les copies incluses dans une sauvegarde iCloud sont régies par les paramètres de sauvegarde Apple.
          Des données déjà synchronisées vers Budgy avant build 92 doivent faire l'objet d'une vérification
          et d'une suppression distinctes ; le build ne les supprime pas automatiquement.
        </Text>

        <Text style={styles.h2}>8. Vos droits</Text>
        <Text style={styles.p}>
          Conformément à la nLPD et au RGPD, vous disposez des droits d’accès, de rectification, de suppression, de
          limitation, de portabilité et d’opposition. Ces droits peuvent être exercés directement depuis l’application
          (Paramètres → Supprimer mes données) ou par e-mail à : <Text style={styles.b}>support@budgy.ch</Text>.
        </Text>

        <Text style={styles.h2}>9. Sécurité</Text>
        <Text style={styles.p}>
          Des mesures techniques sont mises en place : chiffrement TLS, verrou d’application PIN/Face ID, hash SHA-256
          des codes sensibles, stockage dans le keychain iOS / Keystore Android. Vous êtes également responsable de la
          sécurité de votre appareil (verrouillage, mise à jour système).
        </Text>

        <Text style={styles.h2}>10. Mineurs</Text>
        <Text style={styles.p}>
          L’application n’est pas destinée aux personnes de moins de 16 ans. Aucune donnée n’est sciemment collectée
          auprès de mineurs.
        </Text>

        <Text style={styles.h2}>11. Modifications</Text>
        <Text style={styles.p}>
          Cette politique peut être mise à jour. La version la plus récente sera toujours disponible depuis le menu
          « Informations légales » de l’application.
        </Text>

        <Text style={styles.h2}>12. Contact</Text>
        <Text style={styles.p}>
          Pour toute question concernant vos données personnelles :{'\n'}
          <Text style={styles.b}>support@budgy.ch</Text>
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const makeStyles = (C: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  content: { padding: Spacing.lg },
  h1: { color: C.text, fontSize: FontSizes.xxl, fontWeight: FontWeights.black, marginBottom: Spacing.xs },
  meta: { color: C.textTertiary, fontSize: FontSizes.xs, marginBottom: Spacing.xl },
  h2: { color: C.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold, marginTop: Spacing.xl, marginBottom: Spacing.sm },
  p: { color: C.textSecondary, fontSize: FontSizes.sm, lineHeight: 22 },
  li: { color: C.textSecondary, fontSize: FontSizes.sm, lineHeight: 22, marginTop: 6 },
  b: { color: C.text, fontWeight: FontWeights.bold },
});
