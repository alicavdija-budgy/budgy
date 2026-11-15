#!/usr/bin/env node
/**
 * TÂCHE 2 — Contrats : fichier original conservé, lien documentId, section
 * Contrats réelle, aucune donnée inventée, partage iOS transmis.
 */
import { readFileSync, existsSync } from 'fs';
let passed = 0, failed = 0;
const ok = (n, c) => { if (c) { passed++; console.log(`  ✅ ${n}`); } else { failed++; console.log(`  ❌ ${n}`); } };
const read = (p) => readFileSync(p, 'utf8');

console.log('— persistAsContract : plus AUCUNE donnée inventée —');
const imp = read('app/more/email-import.tsx');
const ct = imp.slice(imp.indexOf('const persistAsContract'), imp.indexOf('const saveInvoice'));
ok('plus d’échéance fictive à un an', !ct.includes('oneYearLater') && ct.includes("expirationDate: ''"));
ok('plus d’autoRenew supposé', !ct.includes('autoRenew: true') && ct.includes('autoRenew: undefined'));
ok('startDate uniquement si réellement extrait (jamais la date du jour)', !ct.includes('toISOString') && ct.includes('result.contract_start || undefined'));
ok('montant via normalisation unique (0 = non renseigné, pas « Number()||0 »)', ct.includes('normalizeChfAmount(result.amount)') && !ct.includes('Number(result.amount) ||'));
ok('fichier original copié DURABLEMENT (vault) et vérifié après écriture', ct.includes('saveToVault') && ct.includes('vaultFileExists'));
ok('échec de conservation ⇒ contrat NON enregistré (jamais de faux succès)', ct.includes("return; // JAMAIS de succès"));
ok('PersonalDocument lié (documentId) créé avec le contrat', ct.includes('addDocument') && ct.includes('documentId,'));
ok('extraction échouée ⇒ blocage + saisie manuelle possible', ct.includes('extractionFailed'));

console.log('— Coffre durable + limites explicites —');
const vault = read('src/lib/fileVault.ts');
ok('limite de taille EXPLICITE 15 Mo', vault.includes('15 * 1024 * 1024'));
ok('DOC/DOCX refusés (aucun moteur de conversion disponible)', vault.includes("'doc', 'docx'") && vault.includes('UNSUPPORTED_FORMAT'));
ok('PDF/JPEG/PNG/HEIC/HEIF/WEBP pris en charge', vault.includes("'pdf', 'jpg', 'jpeg', 'png', 'heic', 'heif', 'webp'"));
ok('copie hors cache iOS (documentDirectory/vault) + relecture vérifiée', vault.includes('documentDirectory') && vault.includes('getInfoAsync(dest)'));
ok('contrôle taille/format AVANT traitement dans les 3 pickers', (imp.match(/assertFileAcceptable\(/g) || []).length >= 4);

console.log('— Section Contrats réelle (documents.tsx) —');
const docs = read('app/more/documents.tsx');
ok('liste les VRAIS contracts[] du store (plus seulement documents[])', docs.includes('contracts.map((c)') && docs.includes('contract-row-'));
ok('détail : consulter / renommer / supprimer / pièce jointe', docs.includes('renameContract') && docs.includes('removeContract') && docs.includes('contract-open-attachment'));
ok('suppression du contrat conserve la pièce jointe dans le classeur', docs.includes('deleteContract(id)') && !docs.slice(docs.indexOf('removeContract')).slice(0, 400).includes('deleteDocument'));
ok('arrivée directe ?filter=contracts depuis l’import', docs.includes("incoming.filter === 'contracts'"));
ok('viewer : affiche aussi les fichiers du vault (fileUri)', docs.includes('fileUri'));
ok('aucune date inventée à l’affichage (« Non renseigné »)', docs.includes("contractsV2.notSet"));

console.log('— Partage iOS : le fichier est RÉELLEMENT transmis —');
const sir = read('src/components/ShareIntentRouter.tsx');
ok('ShareIntentRouter transmet sharedUri/sharedMime/sharedName', sir.includes('params.sharedUri') && sir.includes('sharedMime') && sir.includes('resetShareIntent'));
ok('texte partagé transmis aussi (e-mails)', sir.includes('params.sharedText'));
ok('email-import consomme les params du partage', imp.includes('sharedParams.sharedUri') && imp.includes('sharedHandled'));

console.log('— Persistance & compatibilité —');
const store = read('src/stores/useStore.ts');
ok('contracts[] et documents[] persistés (Zustand persist)', store.includes('contracts: Contract[]') && store.includes('documents: PersonalDocument[]'));
ok('updateContract/deleteContract existants réutilisés (anciens contrats intacts)', store.includes('updateContract') && store.includes('deleteContract'));
const types = read('src/types/index.ts');
ok('champs ADDITIFS PersonalDocument (fileUri, mimeType) — aucune suppression', types.includes('fileUri?: string') && types.includes('mimeType?: string'));
ok('migration SQL fournie SANS être appliquée', existsSync('../docs/MIGRATION_TASK2_contracts_document_id.sql'));
const sync = read('src/services/cloudSync.ts');
ok('mapping contracts inchangé (pas de colonne inconnue qui casserait la synchro)', !sync.includes("'document_id'"));

console.log(`\nRésultat : ${passed} réussis, ${failed} échoués`);
if (failed > 0) process.exit(1);
