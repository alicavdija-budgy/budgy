#!/usr/bin/env node
/**
 * Budgy — Validation des primes officielles LAMal (src/data/priminfo-2027.json).
 * Contrôles d'intégrité + correspondance avec les échantillons bruts embarqués
 * lors de la génération depuis le Prämien_CH.csv officiel de l'OFSP.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const d = JSON.parse(readFileSync(resolve(root, 'src/data/priminfo-2027.json'), 'utf8'));

let passed = 0, failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
};

console.log('\n— Données officielles OFSP 2027 —');
check('année de validité 2027 (Geschäftsjahr)', d.year === 2027);
check('année de collecte 2026 (Erhebungsjahr)', d.surveyYear === 2026);
check('source officielle documentée', /OFSP|Priminfo/.test(d.source) && /Prämien_CH\.csv/.test(d.source));
check('26 cantons couverts', d.stats.cantons === 26);
check('≥ 30 assureurs reconnus', d.stats.insurers >= 30);
check('≥ 150 000 offres retenues', d.stats.kept >= 150000);
check('≥ 1 500 profils (canton×région×âge×franchise×accident)', d.stats.profiles >= 1500);
check('variantes de rabais exclues (sous-groupes non de base)', d.stats.discountVariantsExcluded > 0);

const keys = Object.keys(d.profiles);
const cantonSet = new Set(keys.map((k) => k.split('|')[0]));
check('tous les cantons présents dans les profils', cantonSet.size === 26);

console.log('\n— Cohérence des classements —');
let sortedOk = true, rangeOk = true, namesOk = true, dedupOk = true, capOk = true;
for (const k of keys) {
  const offers = d.profiles[k];
  if (offers.length > 20) capOk = false;
  const seen = new Set();
  for (let i = 0; i < offers.length; i++) {
    const [ins, tarif, premium] = offers[i];
    if (i > 0 && premium < offers[i - 1][2]) sortedOk = false;
    if (!(premium >= 20 && premium <= 1500)) rangeOk = false;
    if (!d.insurers[ins]) namesOk = false;
    if (seen.has(ins)) dedupOk = false;
    seen.add(ins);
    if (typeof tarif !== 'string' || !tarif) namesOk = false;
  }
}
check('classement croissant par prime (tous profils)', sortedOk);
check('primes mensuelles plausibles (20–1500 CHF)', rangeOk);
check('chaque assureur résolu vers son nom officiel', namesOk);
check('une seule offre (la moins chère) par assureur', dedupOk);
check('maximum 20 assureurs par profil', capOk);

console.log('\n— Franchises admissibles selon l\'âge —');
const frByAge = { KIN: new Set(), JUG: new Set(), ERW: new Set() };
for (const k of keys) {
  const [, , age, fr] = k.split('|');
  frByAge[age].add(Number(fr));
}
check('enfants : franchises 0–600 uniquement', [...frByAge.KIN].every((f) => f >= 0 && f <= 600));
check('adultes : franchises 300–2500 uniquement', [...frByAge.ERW].every((f) => f >= 300 && f <= 2500));
check('jeunes adultes : franchises 300–2500', [...frByAge.JUG].every((f) => f >= 300 && f <= 2500));

console.log('\n— Correspondance avec les échantillons bruts du CSV officiel —');
check('échantillons embarqués', Array.isArray(d.samples) && d.samples.length >= 1);
for (const s of d.samples || []) {
  const offers = d.profiles[s.key] || [];
  const mine = offers.find((o) => o[0] === s.insurer);
  // L'offre retenue pour cet assureur est la moins chère : jamais au-dessus
  // de la prime brute échantillonnée pour ce même profil.
  check(`échantillon ${s.insurerName} (${s.key}) ≤ ${s.premium}`,
    !mine || mine[2] <= s.premium + 0.001, mine ? `retenu ${mine[2]}` : 'assureur absent');
}

console.log('\n— Régions de primes officielles (commune → région) —');
const regions = JSON.parse(readFileSync(resolve(root, 'src/data/lamal-regions-2027.json'), 'utf8'));
check('fichier régions : année 2027', regions.year === 2027);
check('fichier régions : 26 cantons', Object.keys(regions.cantons).length === 26);
const communeCount = Object.values(regions.cantons).reduce((n, c) => n + c.length, 0);
check('≥ 2000 communes officielles', communeCount >= 2000, `${communeCount}`);
check('source officielle praemienregionen', /praemienregionen/.test(regions.source));
let regMatch = true;
for (const [canton, communes] of Object.entries(regions.cantons)) {
  const premiumRegs = new Set(keys.filter((k) => k.startsWith(canton + '|')).map((k) => k.split('|')[1]));
  for (const [, r] of communes) if (!premiumRegs.has(`R${r}`)) regMatch = false;
}
check('chaque région de commune existe dans le jeu de primes', regMatch);
// Contrôles ponctuels (source officielle A_COM 2027)
const zh = Object.fromEntries(regions.cantons.ZH);
check('Zürich (ville) → région 1', zh['Zürich'] === 1);
check('Aeugst am Albis → région 3', zh['Aeugst am Albis'] === 3);
check('canton GE à région unique (0)', regions.cantons.GE.every(([, r]) => r === 0));

console.log('\n— Intégration UI : un seul comparateur officiel —');
const comp = readFileSync(resolve(root, 'app/more/lamal-comparator.tsx'), 'utf8');
check('aucun import du classement modélisé 2026', !comp.includes('priminfo-2026'));
check('aucun assureur anonymisé « Assureur A/B/C »', !comp.includes('insurerAnonymous') && !comp.includes('anonInsurer'));
check('aucun bouton de réduction −10 % / −8 %', !comp.includes('INSURANCE_MODELS') && !comp.includes('discount'));
check('aucune économie fictive vs moyenne', !comp.includes('savingsVsAvg') && !comp.includes('SWISS_AVG'));
check('aucun classement des cantons modélisé', !comp.includes('getCantonRanking'));
check('source unique : service lamalData', comp.includes('loadLamalData') && comp.includes('refreshLamalData'));
check('recherche de commune officielle', comp.includes('commune-search') && comp.includes('regions?.cantons[canton]'));
check('sélection manuelle explicite de région', comp.includes('manualRegion'));
check('jamais de région implicite : profil incomplet → invite', comp.includes('profileComplete') && comp.includes('selectCommune'));
check('année affichée = année des données chargées', comp.includes('status?.year') && !comp.includes("'2027'") && !comp.includes('2027<'));
check('nom du modèle réel affiché', comp.includes('modelName(') );
check('écart vs offre la moins chère', comp.includes('premium - best[2]'));
check('aucun favoritisme (offres jamais réordonnées en UI)', !/offers\s*\.\s*sort/.test(comp));
check('état des données affiché (publication / vérification / hors ligne)', comp.includes('statusOffline') && comp.includes('publishedAt'));
check('lien Priminfo officiel', comp.includes('priminfo.admin.ch'));
check('subsides : écran dédié conservé (simulation explicite)', comp.includes('/more/lamal-subsidy'));
check('ancien composant 2027 supprimé (fusionné)', !existsSync(resolve(root, 'src/components/LamalOfficial2027.tsx')));
check('ancien jeu modélisé 2026 supprimé', !existsSync(resolve(root, 'src/data/priminfo-2026.ts')));

console.log('\n— Service de données (cache, hors ligne, validation client) —');
const svc = readFileSync(resolve(root, 'src/services/lamalData.ts'), 'utf8');
check('secours embarqué 2027 garanti', svc.includes("require('../data/priminfo-2027.json')") && svc.includes('lamal-regions-2027.json'));
check('validation stricte côté client (primes)', svc.includes('validatePremiums') && svc.includes('cantons !== 26'));
check('validation stricte côté client (régions)', svc.includes('validateRegions'));
check('mise à jour non bloquante avec délai', svc.includes('AbortController') && svc.includes('FETCH_TIMEOUT_MS'));
check('mise à jour invalide refusée (jamais de données douteuses)', svc.includes('lamal/remote-invalid') && svc.includes('lamal/manifest-invalid'));
check('état hors ligne signalé sans bloquer', svc.includes('offline: true'));
check('cache cohérent exigé (primes/régions/méta sur le même millésime)', svc.includes('regions.year === premiums.year') && svc.includes('meta.year === premiums.year'));
check('aucune rétrogradation automatique de millésime', svc.includes('manifest.latestYear < current.premiums.year'));
check('aucune promesse « temps réel »', !/temps réel|real.?time/i.test(svc) && !/temps réel|real.?time/i.test(comp));
check('nouveau millésime automatique (latestYear, aucun code par année)', svc.includes('manifest.latestYear') && !svc.includes('2028'));

console.log('\n— Service d\'actualisation automatique (CI) —');
const upd = readFileSync(resolve(root, 'scripts/lamal-update.mjs'), 'utf8');
check('métadonnées CKAN officielles (opendata.swiss)', upd.includes('opendata.swiss/api/3/action/package_show'));
check('détection de changement (date + empreinte SHA-256)', upd.includes('metadataModified') && upd.includes('sha256'));
check('téléchargement seulement si changement', upd.includes('UP_TO_DATE'));
check('millésime auto-détecté (max Geschäftsjahr substantiel)', upd.includes('Geschäftsjahr') && upd.includes('50000'));
check('régions officielles priminfo par millésime', upd.includes('praemienregionen-${y}.xlsx'));
check('cohérence vs version précédente (dérive médiane)', upd.includes('drift'));
check('échec = aucune publication partielle', upd.includes('publication refusée'));
check('publication atomique (tmp + rename, manifest en dernier)', upd.includes('atomicWrite') && upd.includes('renameSync'));
check('rétrogradation de millésime refusée côté publication', upd.includes('rétrogradation refusée'));
const wf = readFileSync(resolve(root, '../.github/workflows/lamal-data-update.yml'), 'utf8');
check('premier lancement : branche lamal-data créée proprement', wf.includes('ls-remote') && wf.includes('git init -b lamal-data'));
check('permissions GitHub Actions explicites (contents: write)', wf.includes('contents: write'));
check('le workflow exécute le code vérifié de budgy-smart-4.0', wf.includes('ref: budgy-smart-4.0'));
check('planification : hebdomadaire + quotidienne sept.–nov.', wf.includes('23 5 * * 1') && wf.includes('23 5 * 9-11 *'));
check('publication versionnée sur branche dédiée (retour arrière git)', wf.includes('lamal-data') && wf.includes('manifest.json'));

console.log('\n— Refus d\'un import invalide (test réel du pipeline) —');
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const tmp = mkdtempSync(join(tmpdir(), 'lamal-test-'));
const badCsv = join(tmp, 'bad.csv');
// CSV structurellement valide mais incomplet : doit être REFUSÉ (seuils réels)
writeFileSync(badCsv, 'Versicherer,Kanton,Hoheitsgebiet,Geschäftsjahr,Erhebungsjahr,Region,Altersklasse,Unfalleinschluss,Tarif,Tariftyp,Altersuntergruppe,Franchisestufe,Franchise,Prämie\n8,ZH,P_OKPCH,2027,2026,PR_REG_1,AKA_03_ERW,MIT_UNF,BASE,TAR_BASE,E1,FRA_01,FRA_01_E_0300,450.00\n');
const badTarife = join(tmp, 'tarife.csv');
writeFileSync(badTarife, 'Versicherer,Tarif,Kategorie,Geschäftsjahr,Tariftyp,Name_DE,Name_FR,Name_IT,Name_EN\n');
let refused = false;
try {
  execFileSync('node', ['scripts/build-lamal-data.mjs', badCsv, badTarife, 'src/data/lamal-insurers-source.json', '2027'], { cwd: root, stdio: 'pipe' });
} catch {
  refused = true;
}
check('import incomplet refusé par le pipeline (exit ≠ 0)', refused);
let missingCol = false;
writeFileSync(badCsv, 'Foo,Bar\n1,2\n');
try {
  execFileSync('node', ['scripts/build-lamal-data.mjs', badCsv, badTarife, 'src/data/lamal-insurers-source.json', '2027'], { cwd: root, stdio: 'pipe' });
} catch {
  missingCol = true;
}
check('structure officielle absente → import refusé', missingCol);

console.log('\n— i18n du comparateur (4 langues) —');
const tr = readFileSync(resolve(root, 'src/i18n/translations.ts'), 'utf8');
const sliceBlock = (src, fromIdx) => {
  const i = src.indexOf('{', fromIdx);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(i, j + 1);
  }
  return '';
};
const v2 = sliceBlock(tr, tr.indexOf('lamalV2: {'));
for (const lg of ['fr', 'en', 'de', 'it']) {
  const blk = sliceBlock(v2, v2.indexOf(`${lg}: {`));
  const need = ['title', 'subtitle', 'independent', 'communeLabel', 'manualRegion', 'selectCommune', 'bestOffer', 'statusOffline', 'publishedAt'];
  const missing = need.filter((k) => !blk.includes(`${k}:`));
  check(`lamalV2 complet en ${lg}`, missing.length === 0, missing.join(','));
}

console.log(`\nRésultat : ${passed} réussis, ${failed} échoués`);
if (failed > 0) process.exit(1);
