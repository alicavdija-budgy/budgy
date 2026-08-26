#!/usr/bin/env node
/**
 * Budgy — hardcoded user-visible strings auditor
 *
 * Scans .tsx/.ts files under `app/` and `src/` for strings likely visible
 * to end users but not routed through i18n. Emits a classified report:
 *   USER_VISIBLE      → must be translated
 *   REVIEW_MANUALLY   → possibly user-visible, needs a human look
 *   TECHNICAL         → ignored (whitelisted / imports / logs / URLs)
 *
 * Exits with code 1 if any USER_VISIBLE finding is not whitelisted.
 *
 * Usage:
 *   node scripts/audit-i18n.mjs
 *   node scripts/audit-i18n.mjs --json > audit.json
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['app', 'src'];
const IGNORE_DIRS = new Set(['node_modules', '.expo', '.metro-cache', 'dist', 'build']);

const args = new Set(process.argv.slice(2));
const asJson = args.has('--json');

// Files & lines that are explicitly allowed to contain non-i18n text.
const FILE_ALLOWLIST = new Set([
  'src/i18n/translations.ts',
  'src/hooks/useTranslation.ts',
]);
const PATH_ALLOWLIST_SUBSTR = [
  '/tests/',
  '.test.',
  '.spec.',
  '/__tests__/',
  '/scripts/',
];

// File-level directives (place near the top of the file):
//   @i18n-technical-file — the entire file is TECHNICAL/OFFICIAL_DATA (matching
//     keywords, brand names, official label maps used only for matching or
//     computation). Contents are not shown as UI text.
//   @i18n-official-data — the file holds official/legal names (cantons,
//     insurers, brands) that must not be translated arbitrarily.
const FILE_DIRECTIVE_TECHNICAL = /@i18n-technical-file|@i18n-official-data/;

// Line-level directive:
//   /* i18n-technical */ or // i18n-technical
// Instructs the audit to classify strings on that line as TECHNICAL.
const LINE_DIRECTIVE_TECHNICAL = /i18n-technical/;

// Regex applied to string literal contents to decide the class.
const RX_USER_VISIBLE_FR = /[àâçéèêëîïôùûüÿœæÀÂÇÉÈÊËÎÏÔÙÛÜŸŒÆ]|( d')|(l')|(qu')|(n')|(s')|(c'est)/i;
const RX_USER_VISIBLE_DE = /[äöüßÄÖÜ]|\b(und|nicht|Sie|Ihre|nur|wieder|erneut|erfolgreich)\b/;
const RX_USER_VISIBLE_IT = /\b(non|questo|prezzo|abbonamento|riprova|scegli|conferma)\b/i;
const RX_HUMAN_SENTENCE = /^[A-ZÀ-Ý].{6,}[.!?…]?$/;

// Pure technical patterns to strip.
const RX_TECHNICAL_LITERAL = new RegExp(
  [
    '^https?://',
    '^mailto:',
    '^tel:',
    '^data:',
    '^blob:',
    '^file:',
    '^[a-z0-9_-]+$',            // single identifier
    '^\\$\\{',                    // template placeholder edge
    '^\\/',                       // paths
    '^#[0-9a-fA-F]+$',           // hex color
    '^rgba?\\(',                  // css color
    '^\\s*$',                    // whitespace
    '^[a-zA-Z_$][\\w.$-]*\\/',   // route path
  ].join('|')
);

// Regex to extract quoted strings from source code.
function extractStrings(source) {
  const results = [];
  const lines = source.split('\n');
  const rx = /(['"])((?:\\.|(?!\1).)*?)\1/g;
  lines.forEach((line, idx) => {
    // Skip full-line comments
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    let m;
    rx.lastIndex = 0;
    while ((m = rx.exec(line)) !== null) {
      const val = m[2];
      if (!val || val.length < 3) continue;
      results.push({ value: val, line: idx + 1, raw: line.trim() });
    }
  });
  return results;
}

function classify(entry, filePath) {
  const { value, raw } = entry;
  const v = value.trim();

  // Fast technical filter
  if (RX_TECHNICAL_LITERAL.test(v)) return 'TECHNICAL';
  // Import / require paths
  if (/^(from|import|require)\s+['"]/.test(raw)) return 'TECHNICAL';
  if (/require\(['"]/.test(raw) && raw.indexOf(v) > raw.indexOf('require(')) return 'TECHNICAL';
  // Console / logging
  if (/console\.(log|warn|error|info|debug)\(/.test(raw)) return 'TECHNICAL';
  // testID / accessibility identifiers that are pure identifiers
  if (/testID\s*[:=]/.test(raw) && !/[ .!?]/.test(v)) return 'TECHNICAL';
  if (/accessibilityRole\s*[:=]/.test(raw) && !/[ .]/.test(v)) return 'TECHNICAL';
  // Icon names, style keys, colors
  if (/name\s*=\s*['"][a-z0-9-]+['"]/.test(raw)) return 'TECHNICAL';
  if (/color\s*[:=]/.test(raw) && /^#/.test(v)) return 'TECHNICAL';
  if (/style\s*=/.test(raw) && /^[a-zA-Z_-]+$/.test(v)) return 'TECHNICAL';
  // Emojis-only strings
  if (/^[\p{Extended_Pictographic}\s\u200D\uFE0F]+$/u.test(v)) return 'TECHNICAL';
  // Currency codes / cantons
  if (/^(CHF|EUR|USD|GBP|CAD|VD|GE|ZH|BE|VS|FR|TI|BS|BL|SG|LU|AG|SO|SH|NE|JU|OW|NW|GL|GR|TG|UR|SZ|AI|AR)$/.test(v)) return 'TECHNICAL';
  // Brand
  if (v === 'Budgy' || v === 'BUDGY') return 'TECHNICAL';
  // Numeric formatters keys
  if (/^(fr|en|de|it|fr-CH|en-GB|de-CH|it-CH)$/.test(v)) return 'TECHNICAL';
  // Object keys that are single-word identifiers used as IDs
  if (/^\s*['"][a-z][a-zA-Z0-9_]*['"]\s*:/.test(raw) && /^[a-z][a-zA-Z0-9_]*$/.test(v)) return 'TECHNICAL';
  // AsyncStorage keys
  if (/AsyncStorage\.(get|set|remove)Item/.test(raw)) return 'TECHNICAL';
  // Env variables
  if (/process\.env\./.test(raw)) return 'TECHNICAL';
  // Alert.alert titles are user-visible; keep them
  // Regex literals
  if (/new RegExp\(/.test(raw)) return 'TECHNICAL';
  // Query params / API paths (starting with /api)
  if (/^\/api\//.test(v)) return 'TECHNICAL';

  // Definitely user-visible if it contains an accented FR/DE/IT letter
  if (RX_USER_VISIBLE_FR.test(v) || RX_USER_VISIBLE_DE.test(v) || RX_USER_VISIBLE_IT.test(v)) {
    return 'USER_VISIBLE';
  }
  // English-like sentences of ≥ 3 words with a leading capital
  const words = v.split(/\s+/);
  if (words.length >= 3 && RX_HUMAN_SENTENCE.test(v) && !/^[A-Z_]+$/.test(v)) {
    return 'USER_VISIBLE';
  }

  // Short strings that look like UI labels but are ambiguous
  if (words.length >= 2 && /[a-zA-Zà-ÿ]/i.test(v)) return 'REVIEW_MANUALLY';

  return 'TECHNICAL';
}

function walk(dir, acc) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (IGNORE_DIRS.has(name)) continue;
    const s = fs.statSync(p);
    if (s.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(p);
  }
}

function relPath(abs) {
  return path.relative(ROOT, abs).replace(/\\/g, '/');
}

const files = [];
for (const d of SCAN_DIRS) {
  const abs = path.join(ROOT, d);
  if (fs.existsSync(abs)) walk(abs, files);
}

const findings = { USER_VISIBLE: [], REVIEW_MANUALLY: [], TECHNICAL_COUNT: 0 };

for (const f of files) {
  const rel = relPath(f);
  if (FILE_ALLOWLIST.has(rel)) continue;
  if (PATH_ALLOWLIST_SUBSTR.some((s) => rel.includes(s))) continue;

  const src = fs.readFileSync(f, 'utf8');
  // File-level opt-out: treat every literal as TECHNICAL.
  const firstChunk = src.slice(0, 500);
  if (FILE_DIRECTIVE_TECHNICAL.test(firstChunk)) {
    // Count strings but classify as TECHNICAL.
    const strings = extractStrings(src);
    findings.TECHNICAL_COUNT += strings.length;
    continue;
  }
  const strings = extractStrings(src);
  for (const e of strings) {
    // Line-level opt-out
    if (LINE_DIRECTIVE_TECHNICAL.test(e.raw)) {
      findings.TECHNICAL_COUNT += 1;
      continue;
    }
    const cls = classify(e, f);
    if (cls === 'TECHNICAL') findings.TECHNICAL_COUNT += 1;
    else findings[cls].push({ file: rel, line: e.line, value: e.value });
  }
}

if (asJson) {
  console.log(JSON.stringify(findings, null, 2));
  process.exit(findings.USER_VISIBLE.length > 0 ? 1 : 0);
}

console.log(`Files scanned : ${files.length}`);
console.log(`Technical     : ${findings.TECHNICAL_COUNT}`);
console.log(`USER_VISIBLE  : ${findings.USER_VISIBLE.length}`);
console.log(`REVIEW_MANUALLY: ${findings.REVIEW_MANUALLY.length}`);

if (findings.USER_VISIBLE.length > 0) {
  console.log('\n── USER_VISIBLE (must be i18n) ─────────');
  const byFile = {};
  for (const f of findings.USER_VISIBLE) {
    (byFile[f.file] = byFile[f.file] || []).push(f);
  }
  for (const [file, arr] of Object.entries(byFile)) {
    console.log(`\n${file}  (${arr.length})`);
    for (const f of arr.slice(0, 12)) console.log(`  L${f.line}: ${f.value.slice(0, 90)}`);
    if (arr.length > 12) console.log(`  … +${arr.length - 12} more`);
  }
  process.exit(1);
}
console.log('\n✅ No USER_VISIBLE hardcoded strings detected');
