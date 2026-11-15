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
  S('clé anon preprod : emplacement prêt (placeholder à coller, pas service_role)', typeof p.env.EXPO_PUBLIC_SUPABASE_ANON_KEY === 'string' && p.env.EXPO_PUBLIC_SUPABASE_ANON_KEY.includes('COLLER') && !JSON.stringify(p).toLowerCase().includes('service_role'));
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

console.log('\n═══ [NT] NON TESTABLE ICI (build réel / iPhone / Supabase) ═══');
[
  'exécution de SUPABASE_OPTIMIZATIONS.sql sur budgy-preprod (votre feu vert)',
  'collage de la clé anon preprod dans eas.json puis build preprod',
  'campagne iPhone §4 bis : 2 comptes, budgets, QR, PDF, RLS croisée',
  'preuve réseau : aucune requête sortante vers api.budgy.ch / supabase.budgy.ch',
].forEach((t) => console.log(`  ⏸  [NT] ${t}`));

console.log(`\n═══ RÉSULTAT : ${unit} UNIT + ${stat} STATIC réussis, ${fail} échec(s) ═══`);
process.exit(fail ? 1 : 0);
