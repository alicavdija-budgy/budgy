#!/usr/bin/env node
/**
 * Budgy — Validation des primes officielles LAMal (src/data/priminfo-2027.json).
 * Contrôles d'intégrité + correspondance avec les échantillons bruts embarqués
 * lors de la génération depuis le Prämien_CH.csv officiel de l'OFSP.
 */
import { readFileSync } from 'node:fs';
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

console.log('\n— Intégration UI —');
const comp = readFileSync(resolve(root, 'app/more/lamal-comparator.tsx'), 'utf8');
const ui = readFileSync(resolve(root, 'src/components/LamalOfficial2027.tsx'), 'utf8');
check('classement officiel branché dans le comparateur', comp.includes('LamalOfficial2027'));
check('nom du modèle affiché avec l\'assureur', ui.includes('modelName(ins, tarif)'));
check('écart vs moins cher affiché', ui.includes('premium - offers[0][2]'));
check('source et année affichées', ui.includes('sourceNote'));
check('aucun favoritisme (les offres ne sont jamais réordonnées en UI)', !/offers\s*\.\s*sort/.test(ui));

console.log(`\nRésultat : ${passed} réussis, ${failed} échoués`);
if (failed > 0) process.exit(1);
