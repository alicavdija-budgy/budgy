#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// P0 BUDGETS + SÉCURITÉ — Tests réels (Node) du correctif de
// synchronisation des budgets et contrôles statiques de sécurité.
//   [UNIT]    exécution réelle (syncMerge.ts + selectors.ts purs)
//   [STATIC]  garde-fous de câblage (cloudSync.ts, fichiers SQL)
//   [NT]      nécessite une vraie base Supabase ou un iPhone
// ─────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let unit = 0, stat = 0, fail = 0;
const U = (name, cond) => { if (cond) { unit++; console.log(`  ✅ [UNIT] ${name}`); } else { fail++; console.log(`  ❌ [UNIT] ${name}`); } };
const S = (name, cond) => { if (cond) { stat++; console.log(`  ✅ [STATIC] ${name}`); } else { fail++; console.log(`  ❌ [STATIC] ${name}`); } };

const sm = await import(join(root, 'src/lib/syncMerge.ts'));
const { mapOutboundRow, mapInboundRow, fullHashFor, hashItem, isConfirmedHash,
  mergeCollectionsV2, mergeItem, legacyHashOf } = sm;
const sel = await import(join(root, 'src/stores/selectors.ts'));
const { computeBudgetConsumption } = sel;

// Mêmes conversions que cloudSync.ts (vérifiées par [STATIC] plus bas)
const snake = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase()), v]));
const camel = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));
// Liste blanche budgets (doit être IDENTIQUE à cloudSync.ts — contrôle [STATIC])
const BUDGET_FIELDS = ['id', 'user_id', 'category', 'monthly', 'spent', 'created_at', 'name', 'color', 'alerts_enabled'];
const pick = (allowed, row) => Object.fromEntries(Object.entries(row).filter(([k, v]) => allowed.includes(k) && v !== undefined));

console.log('\n═══ §A BUDGETS — création, push, restauration ═══');
{
  const b = { id: 'b1', category: 'courses', limit: 500, color: '#22c55e', createdAt: 1000, name: 'Courses', alertsEnabled: true };
  const out = mapOutboundRow('budgets', snake(b));
  U('CHF 500 : limit → colonne historique `monthly`', out.monthly === 500 && out.limit === undefined);
  const row = pick(BUDGET_FIELDS, { ...out, user_id: 'uA' });
  U('la limite SURVIT à la liste blanche (bug corrigé : plus de filtrage)', row.monthly === 500);
  U('catégorie + personnalisation envoyées (name/color/alerts_enabled)', row.category === 'courses' && row.name === 'Courses' && row.color === '#22c55e' && row.alerts_enabled === true);
  // Pull sur un 2e appareil (ligne cloud → forme locale)
  const cloud = { ...row, spent: null };
  const back = mapInboundRow('budgets', camel(cloud));
  delete back.userId;
  U('restauration 2e appareil : monthly → limit 500, clé monthly/spent retirées', back.limit === 500 && back.monthly === undefined && back.spent === undefined);
  U('budget restauré IDENTIQUE (catégorie, nom, couleur, alertes, date)', back.category === b.category && back.name === b.name && back.color === b.color && back.alertsEnabled === true && back.createdAt === 1000);
}

console.log('\n═══ §B BUDGETS — modification CHF 650 + 2 sessions ═══');
{
  const b500 = { id: 'b1', category: 'courses', limit: 500, createdAt: 1000 };
  const b650 = { ...b500, limit: 650 };
  const confirmed = fullHashFor('budgets', b500);
  U('CHF 500 confirmé → propre (pas de re-push inutile)', isConfirmedHash(confirmed, fullHashFor('budgets', b500), null));
  U('passage à CHF 650 → détecté dirty → re-push', !isConfirmedHash(confirmed, fullHashFor('budgets', b650), null));
  // Session 2 (propre, à 500) reçoit la ligne cloud 650
  const remote = mapInboundRow('budgets', camel(pick(BUDGET_FIELDS, { ...mapOutboundRow('budgets', snake(b650)), user_id: 'uA' })));
  delete remote.userId;
  const r = mergeCollectionsV2([b500], [remote], { dirtyIds: new Set(), tombstoneIds: new Set() });
  U('session 2 : limite mise à jour 500 → 650, catégorie conservée', r.merged.length === 1 && r.merged[0].limit === 650 && r.merged[0].category === 'courses');
  U('aucun budget dupliqué après fusion', r.merged.filter((x) => x.id === 'b1').length === 1);
}

console.log('\n═══ §C BUDGETS — jamais 0/NULL, anciennes lignes, resync forcé ═══');
{
  // Ancienne ligne PostgreSQL (app antérieure) : monthly renseigné
  const old = mapInboundRow('budgets', camel({ id: 'b9', category: 'loisirs', monthly: 300, spent: 120, created_at: 5 }));
  U('ancienne ligne (monthly=300) → limit 300 restaurée', old.limit === 300);
  // Ligne cloud dégradée (monthly NULL — écrite par la version boguée)
  const broken = mapInboundRow('budgets', camel({ id: 'b1', category: 'courses', monthly: null, spent: null, created_at: 1000 }));
  U('monthly NULL → PAS de limit:0 (clé absente)', !('limit' in broken) || broken.limit !== 0 && broken.limit !== null);
  const local = { id: 'b1', category: 'courses', limit: 650, createdAt: 1000 };
  const merged = mergeItem(local, broken);
  U('fusion : une limite locale VALIDE n\'est JAMAIS écrasée par NULL', merged.limit === 650);
  // Resync forcé : ancienne confirmation (hash non préfixé) → dirty
  const oldConfirm = hashItem(local);
  U('ancienne confirmation (pré-correctif) invalidée → re-push UNIQUE forcé', !isConfirmedHash(oldConfirm, fullHashFor('budgets', local), null));
  U('nouvelle confirmation stable (pas de boucle de push)', isConfirmedHash(fullHashFor('budgets', local), fullHashFor('budgets', local), null));
  // Repli legacy AVANT migration : la limite part quand même via monthly
  const LEGACY = ['id', 'user_id', 'category', 'monthly', 'spent', 'created_at'];
  const lh = legacyHashOf({ ...mapOutboundRow('budgets', snake(local)), user_id: 'uA' }, LEGACY);
  U('avant migration (repli legacy) : le hash legacy inclut monthly=650', lh.startsWith('L:') && lh !== legacyHashOf({ ...mapOutboundRow('budgets', snake({ ...local, limit: 500 })), user_id: 'uA' }, LEGACY));
}

console.log('\n═══ §D BUDGETS — consommation 80 % / 100 % / dépassement ═══');
{
  const budgets = [{ id: 'b1', category: 'courses', limit: 500, color: '#fff', createdAt: 1 }];
  const tx = (amount, extra = {}) => ({ id: 'tx' + amount + Math.random(), title: 't', amount, category: 'courses', date: '2026-06-10', ...extra });
  const at = (list) => computeBudgetConsumption(budgets, list, 2026, 5);
  U('80 % : 400/500 détecté exactement', at([tx(400)]).rows[0].spent === 400 && at([tx(400)]).rows[0].limit === 500);
  U('100 % : 500/500 détecté exactement', at([tx(250), tx(250)]).rows[0].spent === 500);
  U('dépassement : 600/500 (120 %)', at([tx(600)]).rows[0].spent === 600);
  U('un REVENU ne consomme jamais une enveloppe', at([tx(400, { type: 'income' })]).rows[0].spent === 0);
  U('une dépense EUR ne consomme JAMAIS une enveloppe CHF à 1:1', at([tx(400, { currency: 'EUR' })]).rows[0].spent === 0);
}

console.log('\n═══ §E INVESTISSEMENTS + RÉCURRENCES — restauration sans perte ═══');
{
  const inv = { id: 'i1', title: 'MSCI World', type: 'ETF', quantity: 12, buyPrice: 95.5, currentPrice: 110, currency: 'CHF', createdAt: 2 };
  const out = mapOutboundRow('investments', snake(inv));
  U('investissement : title/quantity/buy_price → name/shares/avg_cost', out.name === 'MSCI World' && out.shares === 12 && out.avg_cost === 95.5 && out.title === undefined);
  const back = mapInboundRow('investments', camel({ ...out, symbol: null }));
  U('retour : quantité + prix d\'achat + titre restaurés à l\'identique', back.title === 'MSCI World' && back.quantity === 12 && back.buyPrice === 95.5 && back.name === undefined && back.symbol === undefined);
  const rec = { id: 'r1', title: 'Loyer', amount: 1500, category: 'logement', frequency: 'monthly', dayOfMonth: 1, active: true, createdAt: 3, lastPaidMonth: '2026-06', paymentHistory: [{ date: '2026-06-01', amount: 1500, transactionId: 'tx1' }] };
  const rrow = snake(rec); // pas de renommage nécessaire (colonnes homonymes)
  const rback = camel(rrow);
  U('charge récurrente : lastPaidMonth + paymentHistory survivent au cycle', rback.lastPaidMonth === '2026-06' && rback.paymentHistory[0].transactionId === 'tx1' && rback.dayOfMonth === 1);
  U('récurrences/épargne : resync forcé actif (hash R2:)', fullHashFor('recurring_expenses', rec).startsWith('R2:') && fullHashFor('savings_goals', { id: 's' }).startsWith('R2:'));
  U('transactions/factures : hash INCHANGÉ (aucun re-push massif)', fullHashFor('transactions', rec) === hashItem(rec) && fullHashFor('invoices', rec) === hashItem(rec));
}

console.log('\n═══ §F CÂBLAGE cloudSync.ts (statique) ═══');
{
  const cs = readFileSync(join(root, 'src/services/cloudSync.ts'), 'utf8');
  S('liste blanche budgets = monthly + name/color/alerts_enabled (PAS limit)', cs.includes("budgets:            ['id', 'user_id', 'category', 'monthly', 'spent', 'created_at', 'name', 'color', 'alerts_enabled']"));
  S('mapping appliqué au PUSH (mapOutboundRow avant liste blanche)', cs.includes('toRow(mapOutboundRow(table, snake(it)), userId)'));
  S('mapping inverse appliqué au PULL (mapInboundRow)', cs.includes('mapInboundRow(table, cleanCamel(r))'));
  S('hash versionné utilisé push + pull (fullHashFor)', (cs.match(/fullHashFor\(table, /g) || []).length >= 3);
  S('repli legacy budgets/récurrences/épargne/investissements présent', cs.includes("budgets:            ['id', 'user_id', 'category', 'monthly', 'spent', 'created_at']") && cs.includes("investments:        ['id', 'user_id', 'symbol', 'shares', 'avg_cost', 'current_price', 'name', 'type', 'created_at']"));
  S('sondes de migration (alerts_enabled, payment_history, auto_save, currency)', cs.includes("budgets: 'alerts_enabled'") && cs.includes("recurring_expenses: 'payment_history'") && cs.includes("savings_goals: 'auto_save'") && cs.includes("investments: 'currency'"));
  S('conversions snake/camel identiques à celles testées ici', cs.includes("k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())") && cs.includes("k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())"));
}

console.log('\n═══ §G SÉCURITÉ SQL (statique) ═══');
{
  const fix = readFileSync(join(root, '../docs/SECURITY_FIX_set_user_id.sql'), 'utf8');
  const sch = readFileSync(join(root, '../docs/SUPABASE_SCHEMA.sql'), 'utf8');
  const mig = readFileSync(join(root, '../docs/MIGRATION_TASK3_storage_prive.sql'), 'utf8');
  const vsi = readFileSync(join(root, '../docs/VERIFY_SCHEMA_INITIAL.sql'), 'utf8');
  S('correctif : SECURITY INVOKER (plus de DEFINER inutile)', fix.includes('security invoker') && !fix.replace(/--[^\n]*/g, '').includes('security definer'));
  S("correctif : search_path épinglé ('')", fix.includes("set search_path = ''"));
  S('correctif : EXECUTE retiré à public + anon + authenticated', ['from public;', 'from anon;', 'from authenticated;'].every((s) => fix.includes(s)));
  S('correctif : comportement conservé (user_id manquant → auth.uid())', fix.includes('new.user_id := auth.uid()'));
  S('SUPABASE_SCHEMA.sql durci (réinstallation future sans faiblesse)', sch.includes('security invoker') && sch.includes("set search_path = ''") && sch.includes('revoke execute on function public.set_user_id_default() from anon'));
  S('migration : colonnes A ter budgets/récurrences/épargne/investissements', ['budgets ADD COLUMN IF NOT EXISTS alerts_enabled', 'recurring_expenses ADD COLUMN IF NOT EXISTS payment_history', 'savings_goals ADD COLUMN IF NOT EXISTS auto_save', 'investments ADD COLUMN IF NOT EXISTS currency'].every((s) => mig.includes(s)));
  S('migration : notice_period numérique (plus de dérive de type)', mig.includes('notice_period numeric'));
  S('vérification initiale : 13 déclencheurs attendus (commentaire corrigé)', vsi.includes('13 triggers') && !vsi.includes('14 triggers'));
  S('vérification initiale : contrôle sécurité de la fonction (7bis)', vsi.includes('prosecdef') && vsi.includes('proacl'));
}

console.log('\n═══ [NT] NON TESTABLE ICI (vraie base / iPhone requis) ═══');
[
  'exécution réelle de SECURITY_FIX + validations V1/V2 sur budgy-preprod',
  'insert via trigger : user_id auto-rempli pour un VRAI compte authentifié',
  'refus RLS réel entre les comptes test A et B (jetons utilisateur, jamais service_role)',
  'migration A ter réelle + Section B de VERIFY_MIGRATION.sql',
  'synchro budgets entre deux appareils physiques (iPhone)',
].forEach((t) => console.log(`  ⏸  [NT] ${t}`));

console.log(`\n═══ RÉSULTAT : ${unit} UNIT + ${stat} STATIC réussis, ${fail} échec(s) ═══`);
process.exit(fail ? 1 : 0);
