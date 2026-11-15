# Mission limitée pour Claude — Budgy EXISTANTE, Coolify et Supabase auto-hébergée

Je veux terminer et fiabiliser **l'application Budgy existante** (iOS et Android), sans Emergent, sans nouveau projet Supabase, sans nouvelle application, sans souscrire à des services payants.

## Périmètre autorisé
- Dépôt GitHub existant : `alicavdija-budgy/budgy`
- Branche développée et testée : `budgy-smart-4.0` (pas `main` par défaut).
- App iOS : identifiant `com.budgy.ch.budgy`, version 4.0.0, build TestFlight **91** déjà créé.
- App Android : package `com.budgy.ch.budgy`, code version 82 actuellement dans le code ; commercialisation future.
- Infrastructure de production UNIQUEMENT : `https://api.budgy.ch` (FastAPI / Coolify) et `https://supabase.budgy.ch` (Supabase auto-hébergée).
- Ne **jamais** utiliser ni modifier le projet Supabase Cloud séparé `budgy-preprod`. Ne pas suggérer d'en créer un autre.
- Rien à redéployer, compiler, soumettre ou migrer automatiquement sans contrôle de sécurité et mon accord explicite sur l'opération de production.

## Constat REPRODUIT après mon redeploy du 15 novembre 2026
Un job GitHub Actions en lecture seule a contrôlé le serveur : https://github.com/alicavdija-budgy/budgy/actions/runs/43769061287
- API opérationnelle, `APP_VERSION` affiché = **3.7.29**. ATTENTION : cette valeur vient de l'environnement Coolify ; elle ne prouve pas à elle seule que le code est ancien.
- `/api/config/status` indique qu'une clé **OpenAI est configurée**, mais pas que les requêtes d'OCR aboutissent réellement.
- `/openapi.json` expose `OCRResponse.document_type` et `needs_user_confirmation`, mais **N'EXPOSE PAS `OCRResponse.swiss_qr_content`**.
- Sur GitHub, `backend/server.py` dans la branche `main` n'a PAS ce champ ; dans `budgy-smart-4.0` il EST présent. Il est possible que Coolify reconstruise `main` ou une révision ancienne.
- `https://supabase.budgy.ch/auth/v1/health` répond HTTP 401 à un GET sans clé : la passerelle est joignable, mais AUCUN accès SQL de production ni état des données n'est déduit de ce test.
- Dernier audit du code iOS et Android validé en GitHub Actions : https://github.com/alicavdija-budgy/budgy/actions/runs/43767387936. Des correctifs supplémentaires ont été commités APRÈS ce run ; prendre les résultats du dernier run au moment de l'analyse.

## TA MISSION, dans cet ordre strict

### 1. Diagnostiquer Coolify sans toucher au serveur
- Examiner le dépôt, la branche et le commit **réellement buildés** par l'application `api.budgy.ch`, son Dockerfile, son contexte de build et les logs de déploiement.
- Vérifier `backend/Dockerfile` et `backend/requirements.txt` et ne pas confondre répertoire racine du projet et contexte Docker `backend/`.
- Confirmer si le backend chargé correspond à `main` ou `budgy-smart-4.0` ; comparer le contrat OpenAPI réellement servi, pas seulement `APP_VERSION`.
- Vérifier sans afficher les valeurs des secrets : `SUPABASE_URL=https://supabase.budgy.ch`, présence des clés exigées, accès réseau au bon Supabase, configuration OpenAI et modèles, variables Apple IAP, CORS, anti-abus et journaux OCR. Ne communiquer que des indicateurs « présent/absent » et erreurs expurgées.
- Expliquer précisément quel commit/élément empêche `swiss_qr_content` d'être exposé.

### 2. Proposer une mise à niveau compatible du backend existant
- **NE PAS basculer aveuglément la branche de production.**
- Conserver un point de retour arrière (image/déploiement Coolify antérieur) et vérifier que les données/variables existantes ne sont pas écrasées.
- Vérifier sous un conteneur isolé, AVANT production, les routes OCR, Swiss QR, JPG/PNG/PDF, classification invoice/receipt/contract, absence de faux montant, auth Supabase JWT, disponibilité OpenAI, validation Apple IAP et erreurs réseau.
- Si une correction est nécessaire, proposer un **diff minimal** et/ou une Pull Request ciblée, puis me demander l'accord avant toute bascule du serveur.
- Le critère de succès est que `/openapi.json` expose le contrat Budgy 4 (dont `swiss_qr_content`), que les tests sur documents **fictifs** passent et qu'aucune donnée de production ne soit modifiée.

### 3. Examiner seulement MA Supabase auto-hébergée
- Utiliser le fichier SQL **lecture seule** :
  https://github.com/alicavdija-budgy/budgy/blob/budgy-smart-4.0/docs/PRODUCTION_SELFHOST_READONLY_AUDIT.sql
- Sur `supabase.budgy.ch` seulement, inspecter tables, colonnes, RLS, politiques, déclencheurs, Storage privé `user-documents`, synchro, clés étrangères et migrations existantes.
- **Ne faire aucune migration ni nettoyage sans sauvegarde vérifiée, diff de schéma et validation explicite.** Ne jamais exécuter le script de création complète sur une base déjà peuplée.
- Utiliser uniquement des comptes de test et des documents factices pour un test RLS à deux utilisateurs. Ne jamais lire ni exporter les transactions personnelles.

### 4. Assurer la compatibilité iOS / Android
- La même app Budgy doit être conservée (iOS bundle `com.budgy.ch.budgy`, Android package `com.budgy.ch.budgy`), sans « Budgy Test » public.
- Respecter les derniers correctifs GitHub sur les factures, contrats, tickets, stockage durable des scans, montants en CHF et devises étrangères, dates ISO locales, Siri et synchronisation.
- Les achats Android sont volontairement désactivés dans le code tant que Google Play Billing ne dispose pas d'une **validation côté backend** de purchase token + product + utilisateur + renouvellement/remboursement/restauration. Ne pas les réactiver prématurément.
- Préparer les conditions de tests natifs Android (APK interne) et iOS (TestFlight existant), mais **ne pas lancer de build ni incrémenter le numéro** sans instruction de ma part. Le futur build iOS devra être supérieur à 91.

## Règles essentielles
- Ne jamais demander de coller clés privées, mots de passe, jetons Expo/Apple/Google ou données bancaires dans un chat.
- Ne pas transmettre des documents privés à l'IA externe pour les tests ; fabriquer des exemples synthétiques.
- Ni nouvelle application, ni nouveau Supabase, ni fork remplaçant, ni achat Emergent.
- Pas de `git push --force`, pas d'édition directe de `main` si Coolify peut déployer automatiquement.
- Ne pas promettre des fonctions « validées » sans fournir les tests exécutés et leur résultat.

## Livrables attendus
1. Un **diagnostic factuel** : source Coolify/commit réel, version du schéma OCR réel, état du Supabase auto-hébergé accessible, cause racine.
2. Un **plan de correctifs minimal et priorisé** avec diff et tests, sans casser Budgy 91 ni Android.
3. Une procédure de **sauvegarde, déploiement prudent et rollback**, étape par étape depuis un iPhone si une action manuelle est indispensable.
4. Les preuves de tests exécutés ; les blocages non vérifiables clairement signalés.
5. Arrêt **avant** toute modification de la base de production, déploiement Coolify, compilation EAS ou soumission à une boutique, afin de me laisser valider la décision.
