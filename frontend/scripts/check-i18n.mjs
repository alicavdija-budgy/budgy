#!/usr/bin/env node
/**
 * Budgy — i18n key parity checker
 *
 * Ensures every namespace in src/i18n/translations.ts has the exact same
 * keys across fr / en / de / it. Fails with exit code 1 if any key is
 * missing, extra, empty or literally equal to its dot-key (placeholder).
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const FILE = path.resolve(__dirname, '..', 'src', 'i18n', 'translations.ts');

const src = fs.readFileSync(FILE, 'utf8');
// Extract the TRANSLATIONS object. The file ends with the object closer
// followed by a semicolon on its own or preceded by whitespace.
const startIdx = src.indexOf('export const TRANSLATIONS');
if (startIdx < 0) {
  console.error('❌ Cannot locate TRANSLATIONS declaration');
  process.exit(1);
}
const braceStart = src.indexOf('{', startIdx);
// Walk with a brace counter to find the matching closer
let depth = 0;
let end = -1;
for (let i = braceStart; i < src.length; i += 1) {
  const c = src[i];
  if (c === '{') depth += 1;
  else if (c === '}') {
    depth -= 1;
    if (depth === 0) { end = i; break; }
  }
}
if (end < 0) {
  console.error('❌ Cannot find end of TRANSLATIONS object');
  process.exit(1);
}
const tsBlock = src.slice(braceStart, end + 1);

let TR;
try {
  // eslint-disable-next-line no-new-func
  TR = new Function('return ' + tsBlock)();
} catch (e) {
  console.error('❌ Failed to parse TRANSLATIONS object:', e.message);
  process.exit(1);
}

const LANGS = ['fr', 'en', 'de', 'it'];
let errors = 0;
let warnings = 0;
const stats = { namespaces: 0, keys: 0 };

for (const [ns, byLang] of Object.entries(TR)) {
  stats.namespaces += 1;
  const perLang = {};
  for (const lang of LANGS) {
    perLang[lang] = new Set(Object.keys(byLang[lang] || {}));
  }
  const union = new Set();
  for (const s of Object.values(perLang)) for (const k of s) union.add(k);
  stats.keys += union.size;

  for (const key of union) {
    for (const lang of LANGS) {
      const v = byLang[lang]?.[key];
      if (v === undefined) {
        console.error(`❌ [${ns}.${key}] MISSING in ${lang}`);
        errors += 1;
      } else if (v === '' || v === null) {
        console.error(`❌ [${ns}.${key}] EMPTY in ${lang}`);
        errors += 1;
      } else if (typeof v === 'string' && v.trim() === `${ns}.${key}`) {
        console.error(`❌ [${ns}.${key}] equals its dot-key in ${lang} (placeholder)`);
        errors += 1;
      }
    }
  }
}

console.log('');
console.log(`Namespaces : ${stats.namespaces}`);
console.log(`Total keys : ${stats.keys}`);
console.log(`Errors     : ${errors}`);
console.log(`Warnings   : ${warnings}`);
if (errors > 0) {
  console.log('\n❌ i18n parity check FAILED');
  process.exit(1);
}
console.log('\n✅ i18n parity PASS (fr/en/de/it complete)');
