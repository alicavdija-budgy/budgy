# Budgy 4.0 — Build iOS 92 — Documents privés & iCloud

**État : code préparé en pull request #4 ; aucun build TestFlight ni déploiement de production automatique.** Le numéro natif iOS est `92`. Cette procédure ne doit pas être confondue avec une certification légale ou un test de restauration réel.

## 1. Modèle de confidentialité confirmé

| Élément | Stockage build 92 | Point important |
|---|---|---|
| Photos et PDF de factures, contrats, tickets | Répertoire privé `Documents/vault` de Budgy, sur l'appareil | Aucune mise en file ni téléchargement automatique vers Supabase |
| Fiches factures, contrats, tickets et documents (titre, émetteur, échéance, QR SPC, liens) | État local de Budgy | Ne font plus partie des synchronisations Supabase push/pull |
| Données financières autres que les documents | Locales, avec synchronisation Budgy potentielle | Ce build **ne désactive pas** tous les échanges financiers avec Supabase |
| iCloud Backup | Sauvegarde iOS de l'appareil, si activée et si Budgy incluse | Les données ne sont visibles ni comme un dossier iCloud Drive ni en temps réel sur l'iPad |
| iCloud Drive | Copie choisie explicitement avec la feuille Partager > Enregistrer dans Fichiers | Pas de synchronisation iCloud Drive automatique et pas d'accès distant Budgy à l'iCloud personnel |
| Reconnaissance OCR distante | **Consentement explicite** avant envoi d'une photo, d'un PDF ou d'un texte pour analyse | Choisir saisie manuelle pour ne pas envoyer le contenu du document |
| Fichiers déjà hébergés avant build 92 | **Préservés sur le serveur en attendant un audit/migration** | Aucune suppression automatique ni garantie de purge déjà obtenue |

**Important :** l'extraction OCR distante est un traitement de document par un service externe, même si le document n'est plus conservé en Supabase Storage. Son traitement et sa rétention devront être vérifiés contractuellement. Il ne faut pas promettre une architecture entièrement hors ligne.

## 2. Activer la sauvegarde iCloud personnelle sur iPhone / iPad

1. Ouvrir **Réglages > [compte Apple] > iCloud > Sauvegarde iCloud** ; activer **Sauvegarder cet iPhone** / cet iPad.
2. Si proposé, toucher **Sauvegarder maintenant**. Rester connecté à Internet.
3. Dans les détails de la sauvegarde de l'appareil, vérifier que **Budgy** fait partie des applications sauvegardées (libellés iOS variables).
4. Vérifier la date de **dernière sauvegarde réussie** et que l'espace iCloud est suffisant.
5. **Ne pas effacer Budgy ni désinstaller l'application** pour effectuer ce contrôle.

iCloud Backup est destiné à **restaurer** l'appareil, pas à parcourir des fichiers depuis l'app Fichiers. Une restauration complète sur un appareil de test reste nécessaire pour valider le cas de perte/changement d'appareil.

## 3. Mettre une pièce dans son propre iCloud Drive

1. Dans Budgy, ouvrir **Plus > Factures** ou **Mon classeur** ou **Tickets et reçus**.
2. Toucher la pièce voulue et utiliser **Enregistrer dans Fichiers / iCloud Drive** (feuille de partage iOS).
3. Dans la feuille Apple, toucher **Enregistrer dans Fichiers**, puis **iCloud Drive**. Choisir un dossier, par exemple **Budgy/Factures**, **Budgy/Contrats** ou **Budgy/Tickets**.
4. Toucher **Enregistrer** ; ouvrir l'app **Fichiers > iCloud Drive** pour vérifier que le PDF/la photo s'ouvre.
5. Sur un iPad avec **le même compte Apple**, ouvrir Fichiers > iCloud Drive ; vérifier la copie après synchronisation Apple.

Cette exportation est **manuelle, pièce par pièce**. Elle n'implique ni synchronisation automatique de la base Budgy ni import automatique de la pièce dans Budgy sur le deuxième appareil.

## 4. Validation de la confidentialité sur iPhone (build 92)

1. Noter la version installée et vérifier qu'il s'agit bien de **Budgy 4.0.0 (92)**, pas le build 91.
2. En mode avion, créer un ticket et un contrat factice ; vérifier les originaux dans leurs espaces, puis fermer et relancer Budgy ; vérifier qu'ils s'ouvrent encore.
3. Désactiver le mode avion. Scanner une image ou importer un PDF factice, **refuser l'OCR distant**, terminer manuellement. Aucun téléchargement vers Supabase Storage ne doit être déclenché. Faire un test séparé en **acceptant** l'OCR et constater qu'une requête d'analyse est possible (consentement par document).
4. Vérifier une facture QR fictive, les champs identifiés et l'accès à l'original sans déclencher de paiement.
5. Vérifier l'export dans Fichiers/iCloud Drive d'une facture, d'un contrat PDF et d'un ticket image.
6. Vérifier que la synchronisation Budgy des données financières non documentaires continue de fonctionner selon sa configuration.
7. **Test de restauration iCloud réel** : uniquement sur un deuxième appareil de test / une procédure de restauration contrôlée avec copie de secours validée ; ne jamais effacer le téléphone principal juste pour tester.
8. Vérifier les anciens documents hébergés et leurs métadonnées : ils peuvent nécessiter une **récupération locale contrôlée et volontaire**, puis une demande de suppression séparée côté Budgy. Il ne faut pas promettre qu'ils ont déjà disparu du serveur.

## 5. Procédure réelle sur iPhone — deux PR, une construction, TestFlight privé

### Prérequis vérifiés dans GitHub

- **[PR #5 : workflow EAS sécurisé](https://github.com/alicavdija-budgy/budgy/pull/5)** : doit être validée puis fusionnée dans la branche par défaut **`main`** afin que l'interface GitHub Actions propose `testflight` et utilise le **build ID exact** à la soumission. Les définitions `workflow_dispatch` et leurs champs ne sont pas automatiquement actualisés depuis une branche différente de `main`.
- **[PR #4 : code applicatif build 92](https://github.com/alicavdija-budgy/budgy/pull/4)** : doit avoir une CI verte sur son dernier code et être fusionnée dans **`budgy-smart-4.0`**, jamais directement dans `main` pour ce lancement.
- Les secrets EAS et les autorisations de signature Apple doivent être disponibles côté GitHub/Expo. Ne jamais communiquer ces secrets dans un message.
- **Ne jamais supprimer l'application actuelle ni effacer les données** pour tester. Vérifier au préalable la sauvegarde iCloud personnelle.

### Une seule compilation iOS, avec envoi de CE binaire vers TestFlight

1. Sur l'iPhone : GitHub → **Pull requests** → valider puis **fusionner PR #5 dans `main`**. Cela ne déclenche pas de build.
2. Valider puis **fusionner PR #4 dans `budgy-smart-4.0`** une fois tous les tests verts. Noter le SHA final de cette branche.
3. GitHub → **Actions** → **EAS Build (iOS & Android)** → **Run workflow**. Rafraîchir la page après la fusion PR #5.
4. Dans **Branch**, choisir précisément **`budgy-smart-4.0`** (pas `main`).
5. Sélectionner **platform = `ios`**, **profile = `testflight`**, **submit = `true`**.
6. Vérifier une dernière fois ces paramètres, puis lancer **Run workflow**. La construction et la soumission passent par le même job et concernent le **build EAS exact produit par cette exécution** ; pas de `--latest`.
7. Dans les logs GitHub/Expo, confirmer le succès du **build natif**, le dépôt TestFlight, la version **4.0.0 (92)**, le bundle `com.budgy.ch.budgy` et la bonne branche source.
8. Ouvrir **TestFlight** sur l'iPhone lorsque le binaire apparaît dans le groupe de test interne. Installer la version 92 **sans désinstaller Budgy**.
9. **Tests manuels sur appareil réel obligatoires** (voir ci-dessous). Ne pas envoyer sur l'App Store public avant leur validation.

**Pourquoi `submit=true` directement ?** La commande interne de la PR #5 soumet le binaire testé par cette construction, sans lancer un deuxième build, puis Apple le rend disponible dans TestFlight après traitement. Ce n'est **pas** une publication sur l'App Store public.

Si GitHub affiche seulement `production` et pas `testflight`, **ne pas deviner et ne pas lancer** : la PR #5 n'est probablement pas encore fusionnée dans `main` ou l'interface Actions n'a pas été actualisée.

### Matrice obligatoire sur un véritable iPhone

| Cas à tester | Critère de validation |
|---|---|
| Premier lancement et compte | Compte personnel, Pro réel et navigation fonctionnent, sans perdre les données existantes |
| Siri « Ajouter une dépense » | Aucun message « erreur interne » ; prévisualisation, validation, une seule dépense et bon calcul du solde |
| Siri « Scanner une facture » et « Ouvrir Budgy » | L'application et le bon écran s'ouvrent sans erreur |
| Facture QR suisse fictive | Montant CHF/EUR, IBAN/référence, document original et QR bancaire affichés ; aucun paiement sans action de l'utilisateur |
| PDF, photo et facture sans montant | Original conservé ; facture consultable même en attente de montant |
| Contrat scanné | Classé dans le bon dossier de Mon classeur, réouverture et partage possibles |
| Ticket photographié et ticket ajouté manuellement | Image visible dans Tickets et reçus ; réouverture après fermeture de l'app |
| OCR : refuser / accepter | Refus : aucune analyse distante ; acceptation : traitement annoncé et saisie vérifiable |
| Local et hors ligne | Factures, contrats et tickets s'ouvrent sans réseau après redémarrage |
| Déconnexion puis reconnexion | Les fichiers et toutes leurs fiches personnelles sont restaurés pour le même compte, jamais pour un autre |
| Fichiers → iCloud Drive | PDF/image exportés volontairement, dossier choisi, document lisible depuis Fichiers |
| Restauration iCloud | Test effectué **sur appareil de test** avec sauvegarde réelle, jamais sur le téléphone principal sans copie validée |
| Budgets/Charges/Vie financière/Synchronisation | Aucun montant comptabilisé deux fois ; aucune donnée financière non documentaire perdue |
| Abonnement Apple et langues | Statut Pro depuis StoreKit ; affichages FR/DE/IT/EN cohérents |

### Bloquer le déploiement si

- un document disparaît après déconnexion/reconnexion ou réinstallation test ;
- Siri affiche une erreur interne ou annonce une dépense enregistrée alors qu'elle n'existe pas ;
- un PDF/une image n'est pas lisible depuis Factures, Mon classeur ou Tickets ;
- une analyse OCR est lancée sans consentement ;
- le build natif Swift/Intents échoue ou l'identité/bundle/version est incorrect(e).

**Important :** si le numéro **92** a déjà été envoyé et accepté par App Store Connect, une reconstruction corrigée doit utiliser le **build 93** (ou numéro ultérieur jamais soumis) : Apple n'autorise pas la réutilisation d'un build number pour une nouvelle soumission.

**Aucune action de fusion, construction, suppression ou soumission n'est réalisée automatiquement par ce document.**

## 6. Politique de migration des anciennes pièces cloud

N'effectuer aucun effacement automatique : inventorier par utilisateur les anciens objets Supabase Storage, les anciennes lignes `documents`, `invoices`, `contracts`, `receipts` et les éventuels liens QR ; vérifier la disponibilité des fichiers de chacun et la traçabilité de leur récupération locale. **Seulement après confirmation explicite de l'utilisateur concerné, contrôle des sauvegardes et validation des obligations légales**, prévoir une procédure séparée de suppression contrôlée. La sauvegarde serveur globale de l'opérateur n'est pas une sauvegarde iCloud personnelle de l'utilisateur.

## 7. Limites et publication

- L'usage de la protection de données de l'appareil ne signifie pas que Budgy fournit un chiffrement de bout en bout supplémentaire.
- La présence d'un dossier local dans la sauvegarde Apple dépend des réglages, de l'état de l'appareil et des règles iOS.
- L'automatisation iCloud Drive via CloudKit / iCloud Documents nécessite un **projet natif séparé**, les entitlements, la gestion des conflits et des tests sur plusieurs appareils. **Non fournie dans le build 92**.
- Relecture de la politique de confidentialité et des sous-traitants OCR conseillée avant publication grand public.
