/**
 * GUARDIAN MONEY CHF - Terms of Use (CGU)
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Spacing, FontSizes, FontWeights } from '../../../src/constants/theme';
import { useTheme } from '../../../src/hooks/useTheme';

export default function TermsScreen() {
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
        <Text style={styles.title}>CGU</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>Conditions générales d’utilisation</Text>
        <Text style={styles.meta}>En vigueur au {new Date().toLocaleDateString('fr-CH')}</Text>

        <Text style={styles.h2}>Article 1 – Objet</Text>
        <Text style={styles.p}>
          Les présentes CGU régissent l’utilisation de l’application mobile « Guardian Money CHF » (ci-après « l’application »),
          outil d’assistance budgétaire personnelle à destination des particuliers résidant en Suisse.
        </Text>

        <Text style={styles.h2}>Article 2 – Acceptation</Text>
        <Text style={styles.p}>
          En créant un compte ou en utilisant l’application, vous acceptez sans réserve les présentes CGU. Si vous n’êtes pas
          d’accord, vous devez cesser immédiatement l’utilisation et désinstaller l’application.
        </Text>

        <Text style={styles.h2}>Article 3 – Service fourni</Text>
        <Text style={styles.p}>
          L’application propose des outils d’aide à la décision : saisie de budget, suivi des dépenses, estimations fiscales
          et d’assurance-maladie, recommandations générées par intelligence artificielle, import de reçus, etc. Elle ne fournit
          aucun <Text style={styles.b}>conseil financier réglementé</Text>, aucune gestion de fortune ni aucune transaction bancaire.
        </Text>

        <Text style={styles.h2}>Article 4 – Nature non-commerciale & usage privé</Text>
        <Text style={styles.p}>
          L’application est développée à titre de <Text style={styles.b}>projet personnel</Text> et d’usage privé. Aucune
          publicité n’est diffusée. Les éventuels abonnements « Pro » servent exclusivement à couvrir les frais de
          fonctionnement (hébergement, API d’intelligence artificielle, comptes développeur Apple/Google).
        </Text>

        <Text style={styles.h2}>Article 5 – Compte utilisateur</Text>
        <Text style={styles.p}>
          Vous vous engagez à fournir des informations exactes lors de l’inscription et à garder votre mot de passe confidentiel.
          Vous êtes responsable de toutes les actions effectuées depuis votre compte. En cas de compromission, prévenez immédiatement
          l’éditeur.
        </Text>

        <Text style={styles.h2}>Article 6 – Abonnement Pro</Text>
        <Text style={styles.p}>
          L’abonnement Pro (CHF 7.90/mois ou prix affiché) est souscrit via l’App Store Apple ou le Play Store Google. Le renouvellement
          est automatique sauf annulation au plus tard 24 heures avant la fin de la période en cours, directement depuis les
          paramètres de votre compte Apple ou Google. Les conditions de remboursement sont celles des stores.
        </Text>

        <Text style={styles.h2}>Article 7 – Propriété intellectuelle</Text>
        <Text style={styles.p}>
          Le nom « Guardian Money CHF », le logo, les écrans et le code source appartiennent à leur auteur. Toute reproduction,
          distribution ou modification sans autorisation écrite est interdite.
        </Text>

        <Text style={styles.h2}>Article 8 – Limitation de responsabilité</Text>
        <Text style={styles.p}>
          L’application est fournie « en l’état », sans garantie d’exactitude, d’exhaustivité ou de disponibilité ininterrompue.
          L’éditeur ne peut être tenu responsable des décisions financières, fiscales ou assurantielles prises sur la base des
          informations affichées (voir également la page « Avertissement »). Les données publiques ré-utilisées (Priminfo, OFSP,
          AFC, BNS) restent la propriété de leurs auteurs respectifs.
        </Text>

        <Text style={styles.h2}>Article 9 – Suspension / Résiliation</Text>
        <Text style={styles.p}>
          L’éditeur se réserve le droit de suspendre un compte en cas d’abus, d’usage frauduleux ou de non-respect des CGU.
          Vous pouvez vous désinscrire à tout moment depuis les Paramètres.
        </Text>

        <Text style={styles.h2}>Article 10 – Droit applicable & juridiction</Text>
        <Text style={styles.p}>
          Les présentes CGU sont soumises au droit suisse. Tout litige sera soumis à la compétence exclusive des tribunaux du
          for du domicile du défendeur en Suisse, sous réserve des dispositions impératives de protection du consommateur.
        </Text>

        <Text style={styles.h2}>Article 11 – Contact</Text>
        <Text style={styles.p}>
          Pour toute question : <Text style={styles.b}>support@guardianmoney.ch</Text>
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
  b: { color: C.text, fontWeight: FontWeights.bold },
});
