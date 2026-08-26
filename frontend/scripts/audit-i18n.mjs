#!/usr/bin/env node
/**
 * Budgy — hardcoded user-visible strings auditor (v2)
 *
 * Scans .tsx/.ts files under `app/` and `src/` for strings likely visible
 * to end users but not routed through i18n. Emits a classified report:
 *   USER_VISIBLE      → must be translated
 *   REVIEW_MANUALLY   → possibly user-visible, needs a human look
 *   TECHNICAL         → ignored (whitelisted / imports / logs / URLs)
 *
 * Exits with code 1 if any USER_VISIBLE finding is not whitelisted.
 *
 * ── Directives ────────────────────────────────────────────────────────
 * File-level directives (must appear in the first 500 chars):
 *   @i18n-technical-file — the entire file is TECHNICAL. NEVER allowed
 *     under app/** (those are user-visible screens/routes). Only allowed
 *     under specific back-office locations declared in
 *     FILE_DIRECTIVE_ALLOWED_ROOTS below.
 *   @i18n-official-data — official/legal names (cantons, insurers, brand
 *     names). Same policy as technical-file (banned under app/**).
 *
 * Line-level directive:
 *   /* i18n-technical *\/ or // i18n-technical
 * Instructs the audit to classify strings on that line as TECHNICAL.
 * This is the ONLY escape hatch allowed under app/**.
 *
 * Fixture self-test:
 *   node scripts/audit-i18n.mjs --self-test
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
const selfTest = args.has('--self-test');

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

// File-level directive regex.
const FILE_DIRECTIVE_TECHNICAL = /@i18n-technical-file|@i18n-official-data/;

// Roots where file-level opt-out is allowed. app/ is DELIBERATELY EXCLUDED
// because everything under app/ is a route/screen. Technical concerns in a
// screen must be handled with LINE-level `// i18n-technical`.
const FILE_DIRECTIVE_ALLOWED_ROOTS = [
  'src/data/',
  'src/lib/',
  'src/services/',
  'src/utils/',
  'src/i18n/',
];

// Line-level directive.
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

/**
 * Returns true when the file-level @i18n-technical-file / @i18n-official-data
 * directive is allowed for `rel`.
 * Explicitly false when the file lives under `app/**` (user-visible routes).
 */
function fileDirectiveAllowed(rel) {
  if (rel.startsWith('app/')) return false;
  return FILE_DIRECTIVE_ALLOWED_ROOTS.some((root) => rel.startsWith(root));
}

function runAudit(fileList /* array of {rel, src} */) {
  const findings = {
    USER_VISIBLE: [],
    REVIEW_MANUALLY: [],
    TECHNICAL_COUNT: 0,
    IGNORED_DIRECTIVES: [], // file-level directives found under app/**
  };

  for (const { rel, src } of fileList) {
    if (FILE_ALLOWLIST.has(rel)) continue;
    if (PATH_ALLOWLIST_SUBSTR.some((s) => rel.includes(s))) continue;

    const firstChunk = src.slice(0, 500);
    const hasFileDirective = FILE_DIRECTIVE_TECHNICAL.test(firstChunk);

    if (hasFileDirective && fileDirectiveAllowed(rel)) {
      // Legitimate technical file: skip content scan.
      const strings = extractStrings(src);
      findings.TECHNICAL_COUNT += strings.length;
      continue;
    }

    if (hasFileDirective && !fileDirectiveAllowed(rel)) {
      // Directive is ILLEGAL under app/**. Record & scan normally.
      findings.IGNORED_DIRECTIVES.push(rel);
    }

    const strings = extractStrings(src);
    for (const e of strings) {
      // Line-level opt-out (only escape hatch under app/**)
      if (LINE_DIRECTIVE_TECHNICAL.test(e.raw)) {
        findings.TECHNICAL_COUNT += 1;
        continue;
      }
      const cls = classify(e, rel);
      if (cls === 'TECHNICAL') findings.TECHNICAL_COUNT += 1;
      else findings[cls].push({ file: rel, line: e.line, value: e.value });
    }
  }
  return findings;
}

// ─────────── Self-test fixtures ───────────
function selfTestRun() {
  const fixtures = [
    {
      rel: 'app/fake.tsx',
      src:
        '/**\n * @i18n-technical-file\n */\nimport React from "react";\n' +
        'export default function F(){ Alert.alert("Impossible de récupérer les données"); return null; }\n',
      expectUserVisibleMin: 1,
      expectIgnoredDirective: true,
    },
    {
      rel: 'src/lib/matchers.ts',
      src:
        '/** @i18n-technical-file */\nexport const patterns = [\n' +
        '  "confirmation email",\n' +
        '  "user not found",\n];\n',
      expectUserVisibleMin: 0,
      expectIgnoredDirective: false,
    },
    {
      rel: 'app/ok.tsx',
      src:
        'import { useTranslation } from "../src/hooks/useTranslation";\n' +
        'export default function F(){const {t}=useTranslation(); return t("home.hello");}\n',
      expectUserVisibleMin: 0,
      expectIgnoredDirective: false,
    },
    {
      rel: 'app/line-escape.tsx',
      src:
        'export function f(){\n' +
        '  throw new Error("Bonjour serveur"); // i18n-technical\n' +
        '}\n',
      expectUserVisibleMin: 0,
      expectIgnoredDirective: false,
    },
  ];

  let failed = 0;
  for (const fx of fixtures) {
    const f = runAudit([fx]);
    const uvCount = f.USER_VISIBLE.length;
    const hasIgnored = f.IGNORED_DIRECTIVES.includes(fx.rel);
    const okUV = uvCount >= fx.expectUserVisibleMin;
    const okIgn = hasIgnored === fx.expectIgnoredDirective;
    const status = okUV && okIgn ? 'PASS' : 'FAIL';
    if (status === 'FAIL') failed++;
    console.log(
      `[${status}] ${fx.rel} → USER_VISIBLE=${uvCount} (≥${fx.expectUserVisibleMin}), ` +
      `ignoredDirective=${hasIgnored} (expected ${fx.expectIgnoredDirective})`
    );
  }
  if (failed > 0) {
    console.error(`\n❌ ${failed} fixture(s) failed`);
    process.exit(1);
  }
  console.log('\n✅ All self-test fixtures pass');
  process.exit(0);
}

if (selfTest) {
  selfTestRun();
}

// ─────────── Full run ───────────
const files = [];
for (const d of SCAN_DIRS) {
  const abs = path.join(ROOT, d);
  if (fs.existsSync(abs)) walk(abs, files);
}

const fileList = files.map((f) => ({ rel: relPath(f), src: fs.readFileSync(f, 'utf8') }));
const findings = runAudit(fileList);

if (asJson) {
  console.log(JSON.stringify(findings, null, 2));
  process.exit(findings.USER_VISIBLE.length > 0 || findings.IGNORED_DIRECTIVES.length > 0 ? 1 : 0);
}

console.log(`Files scanned : ${files.length}`);
console.log(`Technical     : ${findings.TECHNICAL_COUNT}`);
console.log(`USER_VISIBLE  : ${findings.USER_VISIBLE.length}`);
console.log(`REVIEW_MANUALLY: ${findings.REVIEW_MANUALLY.length}`);

if (findings.IGNORED_DIRECTIVES.length > 0) {
  console.log('\n── ⚠ Illegal @i18n-technical-file directives under app/** ──');
  for (const f of findings.IGNORED_DIRECTIVES) console.log(`  ${f}`);
  console.log('These directives were IGNORED. File contents were scanned normally.');
}

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
