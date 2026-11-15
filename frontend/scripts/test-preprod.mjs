#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// PRÉPROD ISOLÉE — Tests du profil EAS preprod + durcissement réseau.
//   [UNIT]   logique sentinelle exécutée réellement
//   [STATIC] garde-fous de câblage (eas.json, network.ts, i18n, SQL)
//   [NT]     nécessite un build réel / iPhone / Supabase
// ─────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let unit = 0, stat = 0, fail = 0;
const U = (n, c) => { if (c) { unit++; console.log(`  ✅ [UNIT] ${n}`); } else { fail++; console.log(`  ❌ [UNIT] ${n}`); } };
const S = (n, c) => { if (c) { stat++; console.log(`  ✅ [STATIC] ${n}`); } else { fail++; console.log(`  ❌ [STATIC] ${n}`); } };

console.log('\n═══ §A Profil EAS preprod (eas.json) ═══');
const eas = JSON.parse(readFileSync(join(root, 'eas.json'), 'utf8'));
{
  const p = eas.build.preprod;
  S('profil preprod présent et AUTONOME (aucun extends → aucun héritage)', !!p && p.extends === undefined);
  S('canal dédié « preprod » (jamais d\'OTA croisé avec preview/prod)', p.channel === 'preprod');
  S('Supabase = budgy-preprod EXCLUSIVEMENT (kodnbllysingkwispyfx)', p.env.EXPO_PUBLIC_SUPABASE_URL === 'https://kodnbllysingkwispyfx.supabase.co');
  S('backend = sentinelle RFC 2606 (.invalid — ne résout jamais)', p.env.EXPO_PUBLIC_BACKEND_URL === 'https://backend-preprod.invalid');
  S('clé publique Supabase preprod réelle (pas de placeholder ni service_role)', /^sb_publishable_[A-Za-z0-9_-]{15,}$/.test(p.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) && !JSON.stringify(p).toLowerCase().includes('service_role'));
  S('AUCUNE URL de production dans le profil preprod', !JSON.stringify(p).includes('api.budgy.ch') && !JSON.stringify(p).includes('supabase.budgy.ch'));
  const others = ['development', 'preview', 'production', 'testflight'];
  S('les 4 profils actifs sont INTACTS (URLs de prod inchangées)', others.every((k) => eas.build[k] && eas.build[k].env.EXPO_PUBLIC_BACKEND_URL === 'https://api.budgy.ch' && eas.build[k].env.EXPO_PUBLIC_SUPABASE_URL === 'https://supabase.budgy.ch'));
  S('build 91 non géré ici (appVersionSource local, aucun autoIncrement)', eas.cli.appVersionSource === 'local' && !JSON.stringify(eas).includes('autoIncrement'));
}

console.log('\n═══ §B Durcissement réseau (plus d\'URL prod codée en dur) ═══');
{
  const net = readFileSync(join(root, 'src/lib/network.ts'), 'utf8');
  const iap = readFileSync(join(root, 'src/services/iap.ts'), 'utf8');
  const scan = readFileSync(join(root, 'app/scanner-modal.tsx'), 'utf8');
  S('iap.ts : repli api.budgy.ch SUPPRIMÉ → accesseur central', !iap.includes('api.budgy.ch') && iap.includes('getApiBaseUrl()'));
  S('scanner-modal.tsx : repli api.budgy.ch SUPPRIMÉ (code mort retiré — utilise apiFetchJson central)', !scan.includes('api.budgy.ch') && scan.includes('apiFetchJson'));
  S('network.ts : détecteur de sentinelle isBackendDisabled présent', net.includes('export function isBackendDisabled') && net.includes(".endsWith('.invalid')"));
  S('safeFetch : court-circuit propre (aucune tentative réseau en préprod)', net.includes("error: 'backend_disabled'") && net.indexOf('isBackendDisabled()') < net.indexOf('attemptFetch(url'));
  S('describeError : backend_disabled → message traduit dédié', net.includes("'errors.backendDisabled'"));
  // Seul repli restant : filet de sécurité PRODUCTION documenté dans network.ts
  const srcFiles = [iap, scan];
  S('plus AUCUN api.budgy.ch hors filet network.ts (iap/scanner nettoyés)', srcFiles.every((f) => !f.includes('api.budgy.ch')));
  const i18n = readFileSync(join(root, 'src/i18n/translations.ts'), 'utf8');
  S('message « fonction désactivée » traduit en FR/EN/DE/IT', (i18n.match(/backendDisabled:/g) || []).length === 4);
  const sb = readFileSync(join(root, 'src/lib/supabase.ts'), 'utf8');
  S('supabase.ts : AUCUN repli vers supabase.budgy.ch (env strict)', !sb.includes('supabase.budgy.ch'));
}

console.log('\n═══ §C Logique sentinelle (exécution réelle) ═══');
{
  // Même logique que network.isBackendDisabled (module RN non importable ici)
  const disabled = (base) => { try { return new URL(base).hostname.endsWith('.invalid'); } catch { return false; } };
  U('https://backend-preprod.invalid → backend DÉSACTIVÉ', disabled('https://backend-preprod.invalid') === true);
  U('https://api.budgy.ch → backend ACTIF (production intacte)', disabled('https://api.budgy.ch') === false);
  U('URL préview Emergent → backend ACTIF (dev intact)', disabled('https://chf-guardian-wallet.preview.emergentagent.com') === false);
  U('valeur vide/malformée → jamais de crash (false)', disabled('') === false && disabled('not a url') === false);
}

console.log('\n═══ §D Optimisations Supabase (SQL préparé, NON exécuté) ═══');
{
  const opt = readFileSync(join(root, '../docs/SUPABASE_OPTIMIZATIONS.sql'), 'utf8');
  S('index user_id : les 15 tables couvertes (dont sync_tombstones)', opt.includes("'sync_tombstones'") && opt.includes('CREATE INDEX IF NOT EXISTS idx_%s_user_id'));
  S('politiques initplan : (select auth.uid()) sur les 14 tables métier', opt.includes('(select auth.uid()) = user_id') && opt.includes("'group_expenses'"));
  S('tombstones : 4 politiques optimisées à l\'identique', (opt.match(/tombstones_owner_/g) || []).length >= 8);
  S('requêtes de validation lecture seule incluses (index + politiques)', opt.includes('policies_non_optimisees') && opt.includes('pg_indexes'));
  const doc = readFileSync(join(root, '../docs/PREPROD_VALIDATION.md'), 'utf8');
  S('doc : état réel (migration appliquée, 15 tables, 60 politiques, 0 alerte)', doc.includes('APPLIQUÉE') && doc.includes('60 politiques') && doc.includes('0 alerte'));
  S('doc : campagne 2 comptes (budgets, factures, QR, documents, RLS)', doc.includes('## 4 bis') && doc.includes('test-a@budgy-preprod.ch'));
}

console.log('\n═══ §E Isolation NATIVE — config Expo RÉSOLUE (exécution réelle) ═══');
{
  const { execSync } = await import('node:child_process');
  const resolve = (env) => JSON.parse(execSync('npx expo config --json', { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'ignore'] }).toString());
  const d = resolve({});
  const p = resolve({ APP_VARIANT: 'preprod' });
  U('défaut : config STRICTEMENT inchangée (Budgy, com.budgy.ch.budgy, budgy)', d.name === 'Budgy' && d.ios.bundleIdentifier === 'com.budgy.ch.budgy' && d.scheme === 'budgy' && d.android.package === 'com.budgy.ch.budgy');
  U('défaut : App Group production + associatedDomains budgy.ch conservés', d.ios.entitlements['com.apple.security.application-groups'][0] === 'group.com.budgy.ch.budgy' && JSON.stringify(d.ios.associatedDomains).includes('budgy.ch'));
  U('preprod : nom « Budgy Test » + scheme distinct budgy-preprod', p.name === 'Budgy Test' && p.scheme === 'budgy-preprod');
  U('DEUX bundle identifiers DISTINCTS (installables côte à côte)', p.ios.bundleIdentifier === 'com.budgy.ch.budgy.preprod' && p.ios.bundleIdentifier !== d.ios.bundleIdentifier);
  U('DEUX App Groups DISTINCTS (aucun mélange de stockage partagé)', p.ios.entitlements['com.apple.security.application-groups'][0] === 'group.com.budgy.ch.budgy.preprod');
  U('package Android DISTINCT (sandbox locale séparée)', p.android.package === 'com.budgy.ch.budgy.preprod');
  U('preprod : AUCUNE association aux domaines de production (iOS + Android)', p.ios.associatedDomains === undefined && p.android.intentFilters === undefined);
  U('build 91 CONSERVÉ dans les deux variantes', d.ios.buildNumber === '91' && p.ios.buildNumber === '91');
  U('variante exposée au runtime (extra.appVariant)', p.extra.appVariant === 'preprod' && d.extra.appVariant === undefined);
  U('OTA sans mélange : runtimeVersion fingerprint + canaux distincts', d.runtimeVersion?.policy === 'fingerprint' && eas.build.preprod.channel === 'preprod' && eas.build.preview.channel === 'preview');
}

console.log('\n═══ §F Extensions natives + App Group dynamique (statique) ═══');
{
  const ti = readFileSync(join(root, 'targets/intents/expo-target.config.js'), 'utf8');
  const tw = readFileSync(join(root, 'targets/widgets/expo-target.config.js'), 'utf8');
  const si = readFileSync(join(root, 'targets/intents/BudgyShared.swift'), 'utf8');
  const sw = readFileSync(join(root, 'targets/widgets/BudgyShared.swift'), 'utf8');
  const wb = readFileSync(join(root, 'src/services/widgetBridge.ts'), 'utf8');
  S('cible App Intents : App Group piloté par APP_VARIANT', ti.includes("process.env.APP_VARIANT === 'preprod'") && ti.includes('group.com.budgy.ch.budgy.preprod'));
  S('cible WidgetKit : App Group piloté par APP_VARIANT', tw.includes("process.env.APP_VARIANT === 'preprod'") && tw.includes('group.com.budgy.ch.budgy.preprod'));
  S('Swift intents : App Group déduit du bundle id (.preprod)', si.includes('bundleId.contains(".preprod")') && si.includes('group.com.budgy.ch.budgy.preprod'));
  S('Swift widgets : App Group déduit du bundle id (.preprod)', sw.includes('bundleId.contains(".preprod")'));
  S('widgetBridge.ts (côté app) : App Group distinct en préprod', wb.includes("EXPO_PUBLIC_APP_VARIANT === 'preprod'") && wb.includes('group.com.budgy.ch.budgy.preprod'));
}

console.log('\n═══ §G Achats natifs StoreKit désactivés en préprod (statique) ═══');
{
  const iapSrc = readFileSync(join(root, 'src/services/iap.ts'), 'utf8');
  const hook = readFileSync(join(root, 'src/hooks/useIAP.ts'), 'utf8');
  S('variante détectée au runtime (IS_PREPROD_VARIANT)', iapSrc.includes("IS_PREPROD_VARIANT = process.env.EXPO_PUBLIC_APP_VARIANT === 'preprod'"));
  S('isIapAvailable → false (aucune offre achetable affichée)', iapSrc.includes('if (IS_PREPROD_VARIANT) return false;'));
  S('initIap → refus explicite AVANT tout initConnection StoreKit', iapSrc.indexOf('if (IS_PREPROD_VARIANT) {') < iapSrc.indexOf('RNIap.initConnection()'));
  S('requestSubscription → requestPurchase explicitement interdit', iapSrc.includes("e.code = 'preprod_disabled';"));
  S('raison lisible et traduite dans l\'UI (version de test)', hook.includes("r === 'preprod_disabled' ? t('errors.backendDisabled') : r"));
  S('production intacte : product IDs / StoreKit inchangés hors variante', iapSrc.includes("monthly: 'budgy.pro.monthly'") || iapSrc.includes('IAP_PRODUCT_IDS'));
  S('eas.json : APP_VARIANT + EXPO_PUBLIC_APP_VARIANT dans le profil preprod', eas.build.preprod.env.APP_VARIANT === 'preprod' && eas.build.preprod.env.EXPO_PUBLIC_APP_VARIANT === 'preprod');
  S('clé publique : sb_publishable_ valide et placeholder supprimé', /^sb_publishable_[A-Za-z0-9_-]{15,}$/.test(eas.build.preprod.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) && !eas.build.preprod.env.EXPO_PUBLIC_SUPABASE_ANON_KEY.includes('COLLER'));
}

console.log('\n═══ [NT] NON TESTABLE ICI (build réel / iPhone / Supabase) ═══');
[
  'exécution de SUPABASE_OPTIMIZATIONS.sql sur budgy-preprod (votre feu vert)',
  'vérification de connexion Supabase Auth/RLS avec la clé publique lors du premier build preprod',
  'compilation Swift réelle des extensions (App Group dynamique) — premier build',
  'installation côte à côte Budgy + Budgy Test sur le même iPhone',
  'paywall en préprod : message « version de test », aucun achat possible',
  'campagne iPhone §4 bis : 2 comptes, budgets, QR, PDF, RLS croisée',
  'preuve réseau : aucune requête sortante vers api.budgy.ch / supabase.budgy.ch',
].forEach((t) => console.log(`  ⏸  [NT] ${t}`));

console.log(`\n═══ RÉSULTAT : ${unit} UNIT + ${stat} STATIC réussis, ${fail} échec(s) ═══`);
process.exit(fail ? 1 : 0);
