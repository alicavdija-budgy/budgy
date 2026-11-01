/**
 * BUDGY — Source unique des données LAMal du comparateur.
 *
 * Priorité de chargement :
 *  1. cache local validé (dernière version distante téléchargée) ;
 *  2. jeu officiel 2027 embarqué dans l'app (secours hors ligne garanti).
 *
 * Actualisation : au plus une vérification réseau par ouverture, NON bloquante.
 * L'app lit le manifest publié par le service d'actualisation (branche
 * `lamal-data`, GitHub Actions hebdomadaire / quotidien sept.–nov.) ; si une
 * version validée plus récente existe (y compris le millésime suivant —
 * aucun code par année), elle est téléchargée, REvalidée côté client
 * puis mise en cache. Toute réponse invalide est ignorée : on ne remplace
 * jamais des données validées par des données douteuses.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type LamalOffer = [number, string, number]; // [assureur, tarif, prime]
export type LamalPremiums = {
  year: number;
  surveyYear: number;
  source: string;
  generatedAt: string;
  stats: { kept: number; cantons: number; insurers: number; profiles: number };
  insurers: Record<string, string>;
  models: Record<string, { type: string; fr: string; de: string; it: string; en: string }>;
  profiles: Record<string, LamalOffer[]>;
};
export type LamalRegions = {
  year: number;
  release?: string;
  source: string;
  cantons: Record<string, [string, number][]>; // canton → [commune, région]
};
export type LamalStatus = {
  year: number;
  version: string;
  origin: 'bundled' | 'cache' | 'remote';
  publishedAt: string | null; // date de publication officielle (métadonnées OFSP)
  checkedAt: string | null;   // dernière vérification réseau réussie
  offline: boolean;           // la dernière vérification a échoué (réseau)
};
export type LamalData = { premiums: LamalPremiums; regions: LamalRegions; status: LamalStatus };

// Jeu officiel embarqué (secours garanti, aucune prime inventée)
const BUNDLED_PREMIUMS = require('../data/priminfo-2027.json') as LamalPremiums;
const BUNDLED_REGIONS = require('../data/lamal-regions-2027.json') as LamalRegions;
const BUNDLED_VERSION = `${BUNDLED_PREMIUMS.year}.bundled`;

// Données publiées par le service d'actualisation (branche lamal-data du dépôt).
// Une seule constante à changer si l'hébergement évolue.
const DATA_BASE_URL = 'https://raw.githubusercontent.com/alicavdija-budgy/budgy/lamal-data/data';

const K_PREMIUMS = 'budgy.lamal.premiums';
const K_REGIONS = 'budgy.lamal.regions';
const K_META = 'budgy.lamal.meta';
const FETCH_TIMEOUT_MS = 8000;

/** Validation stricte côté client : jamais de données douteuses affichées. */
export function validatePremiums(d: any): d is LamalPremiums {
  try {
    if (!d || !Number.isInteger(d.year) || d.year < 2026 || d.year > 2040) return false;
    if (d.stats?.cantons !== 26) return false;
    if (!d.insurers || Object.keys(d.insurers).length < 25) return false;
    const keys = Object.keys(d.profiles || {});
    if (keys.length < 1500) return false;
    // Échantillon : tuples valides, tri croissant, assureurs résolus
    for (const k of keys.slice(0, 50)) {
      const offers = d.profiles[k];
      if (!Array.isArray(offers) || offers.length === 0 || offers.length > 20) return false;
      for (let i = 0; i < offers.length; i++) {
        const [ins, tarif, premium] = offers[i];
        if (!d.insurers[ins] || typeof tarif !== 'string' || !(premium > 0 && premium < 3000)) return false;
        if (i > 0 && premium < offers[i - 1][2]) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function validateRegions(r: any): r is LamalRegions {
  try {
    if (!r || !Number.isInteger(r.year)) return false;
    const cantons = Object.keys(r.cantons || {});
    if (cantons.length !== 26) return false;
    let communes = 0;
    for (const c of cantons) {
      for (const e of r.cantons[c]) {
        if (typeof e[0] !== 'string' || !Number.isInteger(e[1]) || e[1] < 0 || e[1] > 5) return false;
        communes++;
      }
    }
    return communes >= 2000;
  } catch {
    return false;
  }
}

let memory: LamalData | null = null;

/** Charge les dernières données VALIDÉES disponibles (cache sinon embarqué). */
export async function loadLamalData(): Promise<LamalData> {
  if (memory) return memory;
  try {
    const [p, r, m] = await Promise.all([
      AsyncStorage.getItem(K_PREMIUMS),
      AsyncStorage.getItem(K_REGIONS),
      AsyncStorage.getItem(K_META),
    ]);
    if (p && r && m) {
      const premiums = JSON.parse(p);
      const regions = JSON.parse(r);
      const meta = JSON.parse(m);
      if (validatePremiums(premiums) && validateRegions(regions) && premiums.year >= BUNDLED_PREMIUMS.year) {
        memory = {
          premiums,
          regions,
          status: {
            year: premiums.year, version: meta.version, origin: 'cache',
            publishedAt: meta.publishedAt ?? null, checkedAt: meta.checkedAt ?? null, offline: false,
          },
        };
        return memory;
      }
    }
  } catch {
    // cache illisible → secours embarqué
  }
  memory = {
    premiums: BUNDLED_PREMIUMS,
    regions: BUNDLED_REGIONS,
    status: { year: BUNDLED_PREMIUMS.year, version: BUNDLED_VERSION, origin: 'bundled', publishedAt: null, checkedAt: null, offline: false },
  };
  return memory;
}

const fetchJson = async (url: string) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Vérifie SANS bloquer si une version validée plus récente existe et l'installe.
 * Retourne toujours un jeu utilisable (au minimum celui déjà chargé).
 */
export async function refreshLamalData(): Promise<LamalData> {
  const current = await loadLamalData();
  try {
    const manifest = await fetchJson(`${DATA_BASE_URL}/manifest.json`);
    const checkedAt = new Date().toISOString();
    if (
      manifest?.schema !== 1 || !Number.isInteger(manifest.latestYear) ||
      typeof manifest.version !== 'string' || !manifest.files?.premiums || !manifest.files?.regions
    ) throw new Error('lamal/manifest-invalid');

    if (manifest.version === current.status.version) {
      memory = { ...current, status: { ...current.status, checkedAt, publishedAt: manifest.publishedAt ?? current.status.publishedAt, offline: false } };
      return memory;
    }
    const [premiums, regions] = await Promise.all([
      fetchJson(`${DATA_BASE_URL}/${manifest.files.premiums}`),
      fetchJson(`${DATA_BASE_URL}/${manifest.files.regions}`),
    ]);
    // Revalidation complète côté client : une mise à jour invalide est refusée
    // et la dernière version validée (cache ou embarquée) reste affichée.
    if (!validatePremiums(premiums) || !validateRegions(regions) ||
        premiums.year !== manifest.latestYear || regions.year !== manifest.latestYear) {
      throw new Error('lamal/remote-invalid');
    }
    await Promise.all([
      AsyncStorage.setItem(K_PREMIUMS, JSON.stringify(premiums)),
      AsyncStorage.setItem(K_REGIONS, JSON.stringify(regions)),
      AsyncStorage.setItem(K_META, JSON.stringify({ version: manifest.version, publishedAt: manifest.publishedAt ?? null, checkedAt })),
    ]);
    memory = {
      premiums, regions,
      status: { year: premiums.year, version: manifest.version, origin: 'remote', publishedAt: manifest.publishedAt ?? null, checkedAt, offline: false },
    };
    return memory;
  } catch {
    // Hors ligne ou mise à jour refusée : signaler, ne jamais bloquer l'écran.
    memory = { ...current, status: { ...current.status, offline: true } };
    return memory;
  }
}
