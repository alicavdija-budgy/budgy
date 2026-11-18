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

## 5. Procédure GitHub/EAS pour construire le build 92

### Prérequis
- Examiner la **[pull request #4](https://github.com/alicavdija-budgy/budgy/pull/4)** et s'assurer que la CI iOS/Android, TypeScript, langues et tests documentaires est verte **sur le dernier SHA**.
- Conserver les données de TestFlight déjà installées et une sauvegarde personnelle vérifiée.
- Ne pas exécuter de migration Supabase ou de redéploiement Coolify pour cette modification de stockage, tant qu'aucun besoin technique distinct n'est attesté.

### Étapes depuis un iPhone, sans terminal
1. Ouvrir GitHub, dépôt **alicavdija-budgy/budgy**, onglet **Pull requests** → **#4**, examiner les différences et résultats des tests.
2. **Après validation seulement**, fusionner la PR dans `budgy-smart-4.0` ; vérifier que les modifications sont dans la branche utilisée par le build et noter son SHA final.
3. GitHub → **Actions** → **EAS Build (iOS & Android)** → **Run workflow**.
4. Sélectionner la branche **budgy-smart-4.0** (ou la branche finalisée contenant bien le code du build 92), paramètres :
   - **platform :** `ios`
   - **profile :** `testflight`
   - **submit :** `false` pour le premier contrôle.
5. Lancer l'action ; ouvrir ses logs et le détail du build EAS pour confirmer **status FINISHED**, `4.0.0 (92)`, bundle `com.budgy.ch.budgy` et SHA source attendu.
6. Après les contrôles techniques, pour envoyer **ce** build dans TestFlight, utiliser le mécanisme de soumission lié à son **identifiant EAS exact**. La procédure existante propose `submit=true` à la relance du workflow, mais cela **reconstruit un nouveau binaire**, qu'il faut suivre séparément. Éviter toute soumission automatique « dernier build » non identifiée.
7. Ouvrir **TestFlight** sur l'iPhone ; actualiser et installer la version **4.0.0 (92)** quand elle est disponible. Vérifier les scénarios de l'étape 4.

**Aucune de ces actions de fusion, construction ou soumission n'est effectuée par la rédaction de ce guide.**

## 6. Politique de migration des anciennes pièces cloud

N'effectuer aucun effacement automatique : inventorier par utilisateur les anciens objets Supabase Storage, les anciennes lignes `documents`, `invoices`, `contracts`, `receipts` et les éventuels liens QR ; vérifier la disponibilité des fichiers de chacun et la traçabilité de leur récupération locale. **Seulement après confirmation explicite de l'utilisateur concerné, contrôle des sauvegardes et validation des obligations légales**, prévoir une procédure séparée de suppression contrôlée. La sauvegarde serveur globale de l'opérateur n'est pas une sauvegarde iCloud personnelle de l'utilisateur.

## 7. Limites et publication

- L'usage de la protection de données de l'appareil ne signifie pas que Budgy fournit un chiffrement de bout en bout supplémentaire.
- La présence d'un dossier local dans la sauvegarde Apple dépend des réglages, de l'état de l'appareil et des règles iOS.
- L'automatisation iCloud Drive via CloudKit / iCloud Documents nécessite un **projet natif séparé**, les entitlements, la gestion des conflits et des tests sur plusieurs appareils. **Non fournie dans le build 92**.
- Relecture de la politique de confidentialité et des sous-traitants OCR conseillée avant publication grand public.
