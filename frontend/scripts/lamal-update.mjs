#!/usr/bin/env node
/**
 * BUDGY — Service d'actualisation automatique des primes LAMal (CI).
 *
 * Usage : node scripts/lamal-update.mjs --data-dir <checkout branche lamal-data> [--force]
 *
 * Fonctionnement (une seule tâche partagée, aucun téléchargement côté client) :
 *  1. Lit les métadonnées officielles CKAN du jeu « Health insurance premiums »
 *     (opendata.swiss) : date de modification + URLs des ressources OFSP.
 *  2. Compare avec l'état précédent (<data-dir>/state.json : date + empreinte
 *     SHA-256 du Prämien_CH.csv). Rien n'a changé → sortie « UP_TO_DATE »,
 *     aucun téléchargement de données.
 *  3. Si changement : télécharge Prämien_CH.csv + Tarife.csv, détecte
 *     automatiquement le dernier millésime approuvé (max Geschäftsjahr avec
 *     un volume substantiel — AUCUN code spécifique par année), puis délègue
 *     la construction/validation stricte à build-lamal-data.mjs (seuils réels,
 *     26 cantons, ≥100k offres, assureurs officiels…) et la carte officielle
 *     commune→région à build-lamal-regions.py (praemienregionen-<année>.xlsx).
 *  4. Contrôles de cohérence vs la version précédente, puis publication
 *     ATOMIQUE dans <data-dir> : premiums-<année>.json, regions-<année>.json,
 *     manifest.json versionné, state.json. En cas d'échec à n'importe quelle
 *     étape : exit 1, le répertoire de données n'est PAS modifié — la dernière
 *     version validée reste servie (retour arrière = historique git).
 *
 * Sources officielles uniquement (pas de scraping fragile) :
 *  - https://opendata.swiss/api/3/action/package_show?id=health-insurance-premiums
 *  - fichiers OFSP servis par opendata.bagnet.ch (URLs publiées par CKAN)
 *  - https://www.priminfo.admin.ch/downloads/praemienregionen-<année>.xlsx
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CKAN = 'https://opendata.swiss/api/3/action/package_show?id=health-insurance-premiums';
const REGIONS_URL = (y) => `https://www.priminfo.admin.ch/downloads/praemienregionen-${y}.xlsx`;
const UA = { 'User-Agent': 'Budgy-LamalData/1.0 (+https://budgy.ch)' };

const args = process.argv.slice(2);
const dataDir = args[args.indexOf('--data-dir') + 1];
const force = args.includes('--force');
if (!dataDir || args.indexOf('--data-dir') === -1) {
  console.error('Usage: node scripts/lamal-update.mjs --data-dir <dir> [--force]');
  process.exit(1);
}
mkdirSync(dataDir, { recursive: true });
const statePath = resolve(dataDir, 'state.json');
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
const die = (msg) => { console.error(`❌ ${msg} — publication refusée, la version précédente reste en service.`); process.exit(1); };

const fetchOk = async (url, type = 'text') => {
  const res = await fetch(url, { headers: UA, redirect: 'follow' });
  if (!res.ok) die(`HTTP ${res.status} sur ${url}`);
  return type === 'buffer' ? Buffer.from(await res.arrayBuffer()) : res[type]();
};
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// ── 1. Métadonnées officielles ──────────────────────────────────────────────
const pkg = (await fetchOk(CKAN, 'json'))?.result;
if (!pkg?.resources?.length) die('Réponse CKAN invalide');
const modified = pkg.metadata_modified;
const resUrl = (name) => pkg.resources.find((r) => {
  const t = r.title; const n = typeof t === 'object' ? Object.values(t).join('') : String(t || r.name || '');
  return n.includes(name);
})?.url;
const premiumsUrl = resUrl('Prämien_CH.csv');
const tarifeUrl = resUrl('Tarife.csv');
if (!premiumsUrl || !tarifeUrl) die('Ressources officielles Prämien_CH.csv / Tarife.csv introuvables dans CKAN');

if (!force && state.metadataModified === modified && state.premiumsSha256) {
  console.log(`UP_TO_DATE — métadonnées officielles inchangées (${modified}), aucun téléchargement.`);
  // Trace de vérification sans republier les données
  writeFileSync(statePath, JSON.stringify({ ...state, checkedAt: new Date().toISOString() }, null, 2));
  process.exit(0);
}

// ── 2. Téléchargement + détection du changement réel ────────────────────────
console.log(`→ métadonnées modifiées (${state.metadataModified || 'jamais vérifié'} → ${modified}), téléchargement…`);
const premiumsBuf = await fetchOk(premiumsUrl, 'buffer');
const hash = sha256(premiumsBuf);
if (!force && hash === state.premiumsSha256) {
  console.log('UP_TO_DATE — Prämien_CH.csv identique (empreinte SHA-256 inchangée).');
  writeFileSync(statePath, JSON.stringify({ ...state, metadataModified: modified, checkedAt: new Date().toISOString() }, null, 2));
  process.exit(0);
}
const tarifeBuf = await fetchOk(tarifeUrl, 'buffer');

const tmp = resolve(tmpdir(), 'budgy-lamal');
mkdirSync(tmp, { recursive: true });
const premiumsCsv = resolve(tmp, 'Praemien_CH.csv');
const tarifeCsv = resolve(tmp, 'Tarife.csv');
writeFileSync(premiumsCsv, premiumsBuf);
writeFileSync(tarifeCsv, tarifeBuf);

// ── 3. Millésime : max Geschäftsjahr réellement substantiel (≥ 50k lignes) ──
const text = premiumsBuf.toString('utf8');
const header = text.slice(0, text.indexOf('\n')).replace(/^\uFEFF/, '').split(',');
const yearCol = header.indexOf('Geschäftsjahr');
if (yearCol === -1) die('Colonne Geschäftsjahr absente — structure officielle inattendue');
const counts = {};
for (const line of text.split('\n').slice(1)) {
  const y = line.split(',')[yearCol];
  if (/^20\d\d$/.test(y)) counts[y] = (counts[y] || 0) + 1;
}
const year = Number(Object.keys(counts).filter((y) => counts[y] >= 50000).sort().pop());
if (!year) die(`Aucun millésime substantiel détecté (${JSON.stringify(counts)})`);
// Jamais de retour en arrière : on ne republie pas un millésime plus ancien
// que celui déjà validé et servi.
if (state.year && year < state.year) die(`Millésime détecté ${year} < millésime publié ${state.year} (rétrogradation refusée)`);
console.log(`→ millésime officiel détecté : ${year} (${counts[year]} lignes)`);

// ── 4. Construction + validations strictes (échec = aucun fichier publié) ──
const run = (cmd, a) => execFileSync(cmd, a, { cwd: ROOT, stdio: 'inherit' });
run('node', ['scripts/build-lamal-data.mjs', premiumsCsv, tarifeCsv, 'src/data/lamal-insurers-source.json', String(year)]);

const regionsXlsx = resolve(tmp, `praemienregionen-${year}.xlsx`);
writeFileSync(regionsXlsx, await fetchOk(REGIONS_URL(year), 'buffer'));
run('python3', ['scripts/build-lamal-regions.py', regionsXlsx, String(year), resolve(tmp, `regions-${year}.json`)]);

// ── 5. Cohérence vs version précédente ──────────────────────────────────────
const premiums = JSON.parse(readFileSync(resolve(ROOT, `src/data/priminfo-${year}.json`), 'utf8'));
const regions = JSON.parse(readFileSync(resolve(tmp, `regions-${year}.json`), 'utf8'));
const prevPath = resolve(dataDir, `premiums-${state.year || year}.json`);
if (existsSync(prevPath)) {
  const prev = JSON.parse(readFileSync(prevPath, 'utf8'));
  const med = (d) => {
    const v = Object.entries(d.profiles).filter(([k]) => k.includes('|ERW|300|1')).map(([, o]) => o[0]?.[2]).filter(Boolean).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  };
  const drift = Math.abs(med(premiums) - med(prev)) / med(prev);
  if (drift > 0.4) die(`Dérive médiane suspecte vs version précédente : ${(drift * 100).toFixed(1)}%`);
  console.log(`→ cohérence vs ${prev.year} : dérive médiane ${(drift * 100).toFixed(1)}% (OK)`);
}
// Les régions publiées doivent correspondre aux régions du jeu de primes
for (const [canton, communes] of Object.entries(regions.cantons)) {
  const premiumRegs = new Set(Object.keys(premiums.profiles).filter((k) => k.startsWith(canton + '|')).map((k) => k.split('|')[1]));
  for (const [, r] of communes) {
    if (!premiumRegs.has(`R${r}`)) die(`Région R${r} (${canton}) absente du jeu de primes ${year}`);
  }
}

// ── 6. Publication atomique versionnée ──────────────────────────────────────
// Écritures via fichier temporaire + rename (atomique sur le même système de
// fichiers), manifest en DERNIER : une interruption ne laisse jamais un
// manifest pointant vers des fichiers incohérents. L'atomicité réelle côté
// consommateurs est garantie par git : le workflow ne pousse la branche
// lamal-data qu'après un script entièrement réussi (PUBLISHED).
const atomicWrite = (path, content) => {
  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, content);
  renameSync(tmpPath, path);
};
const now = new Date().toISOString();
const version = `${year}.${(modified || now).slice(0, 10).replace(/-/g, '')}`;
if (state.version === version && !force) console.log('⚠️ version identique republiée (données corrigées à date égale)');
atomicWrite(resolve(dataDir, `premiums-${year}.json`), readFileSync(resolve(ROOT, `src/data/priminfo-${year}.json`)));
atomicWrite(resolve(dataDir, `regions-${year}.json`), readFileSync(resolve(tmp, `regions-${year}.json`)));
atomicWrite(resolve(dataDir, 'manifest.json'), JSON.stringify({
  schema: 1,
  latestYear: year,
  version,
  publishedAt: modified,
  checkedAt: now,
  source: premiums.source,
  files: { premiums: `premiums-${year}.json`, regions: `regions-${year}.json` },
}, null, 2));
atomicWrite(statePath, JSON.stringify({
  metadataModified: modified, premiumsSha256: hash, year, version, checkedAt: now, publishedAt: now,
}, null, 2));
console.log(`PUBLISHED — primes ${year}, version ${version} (${premiums.stats.kept} offres, ${premiums.stats.insurers} assureurs, ${Object.keys(regions.cantons).length} cantons de régions).`);
