/**
 * GUARDIAN MONEY CHF - Disclaimer & Limitation of Liability (FR)
 * Critical for protecting against claims (LAMal/tax calculations etc.)
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BorderRadius, Spacing, FontSizes, FontWeights } from '../../../src/constants/theme';
import { useTheme } from '../../../src/hooks/useTheme';

export default function DisclaimerScreen() {
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
        <Text style={styles.title}>Avertissement</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.warningBox}>
          <Ionicons name="warning" size={28} color={C.warning} />
          <Text style={styles.warningText}>
            Les informations affichées dans cette application sont fournies à titre purement indicatif et
            éducatif. Elles ne constituent en aucun cas un conseil financier, fiscal, juridique ou
            assurantiel.
          </Text>
        </View>

        <Text style={styles.h1}>Clause de non-responsabilité</Text>

        <Text style={styles.h2}>1. Nature de l’application</Text>
        <Text style={styles.p}>
          Budgy est un outil d’assistance budgétaire personnel. Il n’est ni une banque, ni un
          intermédiaire financier au sens de la LSFin, ni un conseiller en placements agréé par la FINMA,
          ni un comparateur officiel d’assurances au sens de l’article 40 LSA.
        </Text>

        <Text style={styles.h2}>2. Usage privé et non-commercial</Text>
        <Text style={styles.p}>
          L’application est développée par un particulier à titre de <Text style={styles.b}>projet personnel éducatif</Text>.
          Aucune publicité n’est diffusée. Les éventuels revenus d’abonnement servent uniquement à couvrir
          les frais d’infrastructure. Aucun bénéfice commercial n’est recherché.
        </Text>

        <Text style={styles.h2}>3. Calculs d’impôts (Swiss Tax Optimizer)</Text>
        <Text style={styles.p}>
          Les estimations d’impôts (IFD + ICC) sont des <Text style={styles.b}>simulations simplifiées</Text> établies
          à partir de barèmes publics. Elles ne tiennent pas compte de l’intégralité des déductions, particularités
          communales, situation patrimoniale ou statut spécifique. Pour un calcul officiel, adressez-vous à
          l’Administration fiscale cantonale ou à un expert fiduciaire.
        </Text>

        <Text style={styles.h2}>4. Primes et subsides LAMal</Text>
        <Text style={styles.p}>
          Les primes d’assurance-maladie et calculs de subsides affichés s’appuient sur des données publiques
          publiées par l’Office fédéral de la santé publique (OFSP) et son portail Priminfo. Ces chiffres sont
          susceptibles d’évoluer et peuvent différer de la prime réelle qui vous est proposée par un assureur
          après souscription.
        </Text>
        <Text style={styles.p}>
          L’application <Text style={styles.b}>n’est pas affiliée</Text> à l’OFSP, à Priminfo ni à aucune caisse-maladie. Les noms
          d’assureurs cités sont des marques déposées de leurs propriétaires respectifs et ne sont mentionnés que
          pour permettre la comparaison. Pour souscrire une assurance, consultez directement l’assureur concerné
          ou le site officiel <Text style={styles.b}>priminfo.ch</Text>.
        </Text>

        <Text style={styles.h2}>5. Recommandations de l’IA</Text>
        <Text style={styles.p}>
          Les conseils générés par le Coach IA, l’Économiseur et la reconnaissance de reçus sont produits par
          des modèles statistiques qui peuvent contenir des erreurs, hallucinations ou d’omissions. Ces suggestions
          ne remplacent en aucun cas l’avis d’un professionnel qualifié.
        </Text>

        <Text style={styles.h2}>6. Décisions de l’utilisateur</Text>
        <Text style={styles.p}>
          Toute décision financière, fiscale ou contractuelle prise à partir des informations fournies par l’application
          reste de l’entière responsabilité de l’utilisateur. L’éditeur décline toute responsabilité en cas de
          préjudice direct ou indirect découlant de l’utilisation de l’application.
        </Text>

        <Text style={styles.h2}>7. Exactitude des données</Text>
        <Text style={styles.p}>
          Bien que l’éditeur fasse de son mieux pour mettre à jour les barèmes et données officielles, aucune
          garantie d’exhaustivité ou d’actualité n’est fournie. En cas de divergence entre l’application et
          les sources officielles (OFSP, AFC, Assureurs, BNS), ce sont ces dernières qui font foi.
        </Text>

        <Text style={styles.h2}>8. Disponibilité</Text>
        <Text style={styles.p}>
          L’application peut être indisponible ponctuellement (maintenance, incidents, coupures réseau). L’éditeur
          n’offre aucune garantie de disponibilité continue.
        </Text>

        <Text style={styles.h2}>9. Signaler une erreur</Text>
        <Text style={styles.p}>
          Si vous constatez une donnée inexacte ou une recommandation problématique, merci de nous contacter :
          <Text style={styles.b}> support@budgy.ch</Text>.
        </Text>

        <Text style={styles.h2}>10. Acceptation</Text>
        <Text style={styles.p}>
          En utilisant l’application, vous reconnaissez avoir lu, compris et accepté le présent avertissement ainsi que
          l’ensemble des limitations de responsabilité qu’il contient.
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
  warningBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: `${C.warning}15`, padding: Spacing.lg, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: `${C.warning}40`,
    marginBottom: Spacing.xl,
  },
  warningText: { flex: 1, color: C.text, fontSize: FontSizes.sm, lineHeight: 20, fontWeight: FontWeights.semibold },
  h1: { color: C.text, fontSize: FontSizes.xxl, fontWeight: FontWeights.black, marginBottom: Spacing.sm },
  h2: { color: C.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold, marginTop: Spacing.xl, marginBottom: Spacing.sm },
  p: { color: C.textSecondary, fontSize: FontSizes.sm, lineHeight: 22, marginBottom: Spacing.xs },
  b: { color: C.text, fontWeight: FontWeights.bold },
});
