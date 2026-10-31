#!/usr/bin/env node
/**
 * BUDGY — Pipeline d'import des primes officielles OFSP / Priminfo.
 *
 * Usage : node scripts/build-lamal-data.mjs <chemin/Prämien_CH.csv> <année>
 *
 * Source officielle (données ouvertes OFSP) :
 *   https://opendata.swiss/fr/dataset/health-insurance-premiums
 *   (CSV « Prämien_CH » — publié chaque automne pour l'année suivante).
 * État vérifié : les CSV open data s'arrêtent à 2026 ; le fichier 2027
 * n'est pas encore publié. Ce script REFUSE toute donnée incomplète ou
 * d'une autre année : AUCUNE prime n'est inventée ni extrapolée.
 *
 * Sortie : src/data/priminfo-<année>.json
 *   { year, source, generatedAt, offers: { "<canton>|<region>|<ageClass>|<franchise>|<accident>":
 *       [{ insurer, model, premium }] } }
 * (offre admissible la moins chère conservée par assureur+modèle).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const [, , csvPath, yearArg] = process.argv;
if (!csvPath || !yearArg) {
  console.error('Usage: node scripts/build-lamal-data.mjs <Prämien_CH.csv> <année>');
  process.exit(1);
}
const YEAR = Number(yearArg);
if (!Number.isInteger(YEAR) || YEAR < 2026 || YEAR > 2035) {
  console.error(`Année invalide: ${yearArg}`);
  process.exit(1);
}
if (!existsSync(csvPath)) {
  console.error(`Fichier introuvable: ${csvPath}`);
  process.exit(1);
}

const raw = readFileSync(csvPath, 'utf8');
const sep = raw.includes(';') ? ';' : ',';
const lines = raw.split(/\r?\n/).filter(Boolean);
if (lines.length < 1000) {
  console.error(`❌ CSV suspect : ${lines.length} lignes seulement (attendu : >100 000). Import refusé.`);
  process.exit(1);
}
const header = lines[0].split(sep).map((h) => h.trim().toLowerCase());
const col = (...names) => {
  for (const n of names) {
    const i = header.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
};
// Colonnes du CSV officiel OFSP (noms allemands du jeu de données ouvert)
const C = {
  year: col('erhebungsjahr', 'jahr'),
  canton: col('kanton'),
  region: col('region', 'prämienregion', 'praemienregion'),
  insurer: col('versicherer', 'insurer'),
  ageClass: col('altersklasse', 'agegroup'),
  accident: col('unfalleinschluss', 'unfall'),
  franchise: col('franchise', 'franchisestufe'),
  model: col('tarifbezeichnung', 'tariftyp', 'tarif'),
  premium: col('prämie', 'praemie', 'premium'),
};
const missing = Object.entries(C).filter(([, i]) => i < 0).map(([k]) => k);
if (missing.length) {
  console.error(`❌ Colonnes manquantes dans le CSV officiel : ${missing.join(', ')}. Import refusé.`);
  process.exit(1);
}

const offers = {};
let rows = 0, skipped = 0, wrongYear = 0;
for (let i = 1; i < lines.length; i++) {
  const f = lines[i].split(sep);
  const y = Number(f[C.year]);
  if (y !== YEAR) { wrongYear++; continue; }
  const premium = Number(String(f[C.premium]).replace(',', '.'));
  const canton = (f[C.canton] || '').trim().toUpperCase();
  if (!canton || !Number.isFinite(premium) || premium <= 0) { skipped++; continue; }
  const key = [
    canton,
    (f[C.region] || '').trim(),
    (f[C.ageClass] || '').trim(),
    (f[C.franchise] || '').trim(),
    (f[C.accident] || '').trim(),
  ].join('|');
  const insurer = (f[C.insurer] || '').trim();
  const model = (f[C.model] || '').trim();
  if (!insurer) { skipped++; continue; }
  (offers[key] ||= []);
  const existing = offers[key].find((o) => o.insurer === insurer && o.model === model);
  if (!existing) offers[key].push({ insurer, model, premium });
  else if (premium < existing.premium) existing.premium = premium;
  rows++;
}

const keys = Object.keys(offers);
if (rows < 50000 || keys.length < 500) {
  console.error(`❌ Jeu de données incomplet (lignes ${YEAR}: ${rows}, profils: ${keys.length}). Import refusé — aucune région ne sera complétée artificiellement.`);
  process.exit(1);
}
for (const k of keys) offers[k].sort((a, b) => a.premium - b.premium);

const out = {
  year: YEAR,
  source: 'OFSP / Priminfo — données ouvertes officielles (opendata.swiss, jeu « Krankenversicherungsprämien »)',
  generatedAt: new Date().toISOString(),
  stats: { rows, skipped, wrongYear, profiles: keys.length },
  offers,
};
const outPath = resolve('src/data', `priminfo-${YEAR}.json`);
writeFileSync(outPath, JSON.stringify(out));
console.log(`✅ ${outPath} généré — ${rows} offres ${YEAR}, ${keys.length} profils (ignorées: ${skipped}, autres années: ${wrongYear}).`);
console.log('Prochaine étape : brancher ce fichier dans le comparateur (classement des ~20 assureurs les moins chers par profil, offre la moins chère par assureur, modèle affiché).');
