#!/usr/bin/env node
/**
 * BUDGY — Import des primes officielles OFSP / Priminfo (AOS).
 *
 * Usage :
 *   node scripts/build-lamal-data.mjs <Prämien_CH.csv> <Tarife.csv> <insurers.json> <année>
 *
 * Sources officielles (jeu « Health insurance premiums », opendata.swiss,
 * fichiers servis par opendata.bagnet.ch — OFSP) :
 *   - Prämien_CH.csv  : toutes les primes AOS approuvées (année de validité =
 *     colonne Geschäftsjahr ; Erhebungsjahr = année de collecte, N-1).
 *   - Tarife.csv      : libellés officiels des modèles (FR/DE/IT/EN).
 *   - insurers.json   : n° OFSP → nom (extrait du « Verzeichnis der
 *     zugelassenen Krankenversicherer », priminfo.admin.ch).
 *
 * Structure réelle vérifiée (29.09.2026) : séparateur VIRGULE, BOM UTF-8,
 * colonnes : Versicherer,Kanton,Hoheitsgebiet,Geschäftsjahr,Erhebungsjahr,
 * Region,Altersklasse,Unfalleinschluss,Tarif,Tariftyp,Altersuntergruppe,
 * Franchisestufe,Franchise,Prämie,isBaseP,isBaseF,Tarifbezeichnung.
 * Le parseur est RFC 4180 (guillemets/virgules internes gérés).
 *
 * AUCUNE prime inventée : toute incohérence (année, canton, montant,
 * assureur inconnu) rejette la ligne, et des seuils réalistes rejettent un
 * import global incomplet. Trois échantillons bruts sont embarqués pour le
 * contrôle de correspondance avec Priminfo.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [, , premiumsPath, tarifePath, insurersPath, yearArg] = process.argv;
if (!premiumsPath || !tarifePath || !insurersPath || !yearArg) {
  console.error('Usage: node scripts/build-lamal-data.mjs <Prämien_CH.csv> <Tarife.csv> <insurers.json> <année>');
  process.exit(1);
}
const YEAR = Number(yearArg);
if (!Number.isInteger(YEAR) || YEAR < 2026 || YEAR > 2035) { console.error('Année invalide'); process.exit(1); }

/** Parseur CSV RFC 4180 (séparateur virgule, guillemets, BOM). */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const CANTONS = ['AG','AI','AR','BE','BL','BS','FR','GE','GL','GR','JU','LU','NE','NW','OW','SG','SH','SO','SZ','TG','TI','UR','VD','VS','ZG','ZH'];
const AGE = { AKA_01_KIN: 'KIN', AKA_02_JUG: 'JUG', AKA_03_ERW: 'ERW' };
const BASE_SUBGROUP = new Set(['E1', 'J1', 'K1']); // sans rabais supplémentaires
const insurers = JSON.parse(readFileSync(resolve(insurersPath), 'utf8')).insurers;

// --- Modèles officiels (Tarife.csv, Kategorie MOD) ---
const tarife = parseCsv(readFileSync(resolve(tarifePath), 'utf8'));
const th = tarife[0];
const ti = (n) => th.indexOf(n);
const models = {};
for (const r of tarife.slice(1)) {
  if (r[ti('Kategorie')] !== 'MOD' || Number(r[ti('Geschäftsjahr')]) !== YEAR) continue;
  const key = `${r[ti('Versicherer')]}|${r[ti('Tarif')]}`;
  models[key] = {
    type: r[ti('Tariftyp')],
    fr: r[ti('Name_FR')] || r[ti('Name_DE')],
    de: r[ti('Name_DE')], it: r[ti('Name_IT')] || r[ti('Name_DE')], en: r[ti('Name_EN')] || r[ti('Name_DE')],
  };
}

// --- Primes ---
const raw = readFileSync(resolve(premiumsPath), 'utf8');
const rows = parseCsv(raw);
const h = rows[0];
const col = Object.fromEntries(h.map((name, i) => [name.trim(), i]));
for (const req of ['Versicherer','Kanton','Hoheitsgebiet','Geschäftsjahr','Erhebungsjahr','Region','Altersklasse','Unfalleinschluss','Tarif','Tariftyp','Altersuntergruppe','Franchise','Prämie']) {
  if (!(req in col)) { console.error(`❌ Colonne officielle manquante: ${req}. Import refusé.`); process.exit(1); }
}

const best = new Map(); // profil -> Map(insurer -> {tarif, premium})
let kept = 0, rejected = 0, wrongYear = 0, otherTerritory = 0, subVariant = 0;
let surveyYear = null;
const samples = [];
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (r.length < h.length) { rejected++; continue; }
  if (r[col['Hoheitsgebiet']] !== 'P_OKPCH') { otherTerritory++; continue; }
  if (Number(r[col['Geschäftsjahr']]) !== YEAR) { wrongYear++; continue; }
  if (!BASE_SUBGROUP.has(r[col['Altersuntergruppe']])) { subVariant++; continue; }
  const canton = r[col['Kanton']];
  const age = AGE[r[col['Altersklasse']]];
  const insurer = Number(r[col['Versicherer']]);
  const premium = Number(r[col['Prämie']]);
  const frMatch = /_(\d{4})$/.exec(r[col['Franchise']]);
  const accident = r[col['Unfalleinschluss']] === 'MIT_UNF' ? 1 : r[col['Unfalleinschluss']] === 'OHN_UNF' ? 0 : null;
  if (!CANTONS.includes(canton) || !age || !frMatch || accident === null ||
      !Number.isFinite(premium) || premium <= 0 || premium > 3000 || !insurers[insurer]) {
    rejected++; continue;
  }
  surveyYear = surveyYear ?? Number(r[col['Erhebungsjahr']]);
  const franchise = Number(frMatch[1]);
  const region = r[col['Region']].replace('PR_REG_', 'R');
  const key = `${canton}|${region}|${age}|${franchise}|${accident}`;
  let perInsurer = best.get(key);
  if (!perInsurer) { perInsurer = new Map(); best.set(key, perInsurer); }
  const cur = perInsurer.get(insurer);
  if (!cur || premium < cur.premium) perInsurer.set(insurer, { tarif: r[col['Tarif']], premium });
  kept++;
  if (samples.length < 3 && kept % 50000 === 1) {
    samples.push({ key, insurer, insurerName: insurers[insurer], tarif: r[col['Tarif']], premium,
      raw: { Region: r[col['Region']], Altersklasse: r[col['Altersklasse']], Franchise: r[col['Franchise']], Unfall: r[col['Unfalleinschluss']] } });
  }
}

// --- Contrôles de cohérence sur la structure RÉELLE (219k lignes, 32 caisses) ---
const profiles = {};
for (const [key, perInsurer] of best) {
  profiles[key] = [...perInsurer.entries()]
    .map(([ins, o]) => [ins, o.tarif, o.premium])
    .sort((a, b) => a[2] - b[2])
    .slice(0, 20);
}
const cantonsSeen = new Set([...best.keys()].map((k) => k.split('|')[0]));
const insurersSeen = new Set([...best.values()].flatMap((m) => [...m.keys()]));
const fail = (msg) => { console.error(`❌ ${msg} — import refusé, aucune donnée partielle publiée.`); process.exit(1); };
if (kept < 100000) fail(`Seulement ${kept} offres ${YEAR} retenues (attendu ≈ 150 000+)`);
if (cantonsSeen.size !== 26) fail(`${cantonsSeen.size}/26 cantons présents`);
if (insurersSeen.size < 25) fail(`${insurersSeen.size} assureurs seulement`);
if (Object.keys(profiles).length < 1500) fail(`${Object.keys(profiles).length} profils seulement`);
if (surveyYear !== YEAR - 1) fail(`Erhebungsjahr=${surveyYear}, attendu ${YEAR - 1} (année de collecte)`);
for (const key of ['ZH|R1|ERW|300|1', 'GE|R0|ERW|2500|0', 'TI|R1|KIN|0|1']) {
  const k = Object.keys(profiles).find((p) => p === key || p.startsWith(key.split('|').slice(0, 3).join('|')));
  if (!k) fail(`Profil de contrôle absent: ${key}`);
}

const out = {
  year: YEAR,
  surveyYear,
  source: 'OFSP / Priminfo — primes AOS officielles approuvées (opendata.swiss « Health insurance premiums », fichiers OFSP opendata.bagnet.ch, Prämien_CH.csv du 29.09.2026)',
  generatedAt: new Date().toISOString(),
  stats: { kept, rejected, wrongYear, otherTerritory, discountVariantsExcluded: subVariant,
    cantons: cantonsSeen.size, insurers: insurersSeen.size, profiles: Object.keys(profiles).length },
  insurers,
  models,
  samples,
  profiles,
};
const outPath = resolve('src/data', `priminfo-${YEAR}.json`);
writeFileSync(outPath, JSON.stringify(out));
console.log(`✅ ${outPath}`);
console.log(`   ${kept} offres ${YEAR} (collecte ${surveyYear}) · ${cantonsSeen.size} cantons · ${insurersSeen.size} assureurs · ${Object.keys(profiles).length} profils`);
console.log(`   rejets: ${rejected} · autre territoire: ${otherTerritory} · autres années: ${wrongYear} · variantes rabais exclues: ${subVariant}`);
