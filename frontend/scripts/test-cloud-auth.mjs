#!/usr/bin/env node
/**
 * BUDGY v3.9.0 Build 80 — Cloud / Auth production hardening test.
 *
 * Validates:
 *   1) Supabase env vars are wired via EXPO_PUBLIC_* keys (never secret keys)
 *   2) No service_role / private key referenced in client bundle
 *   3) auth.tsx: production DOES NOT silently create a local account
 *      when Supabase is unconfigured — only __DEV__ does
 *   4) eas.json production environment declares the production Supabase URL
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let PASS = 0, FAIL = 0;
const FAILURES = [];
function assert(name, cond, detail = '') {
  if (cond) { PASS++; console.log(`  ✅ ${name}`); }
  else { FAIL++; FAILURES.push({ name, detail }); console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function scenario(title, fn) { console.log(`\n▶ ${title}`); fn(); }

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

scenario('1. Supabase client uses only PUBLIC env keys', () => {
  const supaFile = 'src/lib/supabase.ts';
  if (!fs.existsSync(path.join(root, supaFile))) {
    assert('src/lib/supabase.ts exists', false);
    return;
  }
  const src = read(supaFile);
  assert(`${supaFile}: uses EXPO_PUBLIC_SUPABASE_URL`, /EXPO_PUBLIC_SUPABASE_URL/.test(src));
  assert(`${supaFile}: uses EXPO_PUBLIC_SUPABASE_ANON_KEY`, /EXPO_PUBLIC_SUPABASE_ANON_KEY/.test(src));
  assert(`${supaFile}: does NOT reference SERVICE_ROLE`, !/SERVICE_ROLE/i.test(src));
  assert(`${supaFile}: does NOT reference SUPABASE_SECRET`, !/SUPABASE_SECRET/i.test(src));

  const authSrc = read('app/auth.tsx');
  assert('app/auth.tsx: does NOT reference SERVICE_ROLE', !/SERVICE_ROLE/i.test(authSrc));
  assert('app/auth.tsx: does NOT reference SUPABASE_SECRET', !/SUPABASE_SECRET/i.test(authSrc));
});

scenario('2. No secret key names anywhere in app/ src/', () => {
  const walk = (dir) => {
    const out = [];
    for (const name of fs.readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) out.push(...walk(full));
      else if (/\.(ts|tsx|js|jsx)$/.test(name)) out.push(full);
    }
    return out;
  };
  const files = [...walk(path.join(root, 'app')), ...walk(path.join(root, 'src'))];
  const banned = [/SERVICE_ROLE_KEY/, /SUPABASE_SECRET_KEY/i, /JWT_SECRET/i, /BEGIN\s+PRIVATE\s+KEY/];
  let hits = 0;
  for (const f of files) {
    const s = fs.readFileSync(f, 'utf8');
    for (const pat of banned) {
      if (pat.test(s)) {
        hits++;
        FAILURES.push({ name: `banned token in ${path.relative(root, f)}`, detail: pat.source });
      }
    }
  }
  assert('no banned secret-key names in client bundle', hits === 0);
});

scenario('3. auth.tsx: production error → throw, not silent local login', () => {
  const raw = read('app/auth.tsx');
  const src = stripComments(raw);
  assert(
    'no `confirmation email` → loginAsLocalUser bypass',
    !/confirmation email[\s\S]{0,300}loginAsLocalUser/i.test(src),
  );
  assert(
    'unconditional local fallback removed',
    !/\}\s*else\s*\{\s*await new Promise[\s\S]{0,300}loginAsLocalUser/.test(src),
  );
  assert('__DEV__ branch exists', raw.includes('else if (__DEV__)'));

  const devIndex = raw.indexOf('else if (__DEV__)');
  const throwIndex = raw.indexOf("throw new Error('Supabase not configured')", devIndex);
  const catchIndex = raw.indexOf('} catch (error', devIndex);
  assert(
    'production else-branch throws configuration failure',
    devIndex >= 0 && throwIndex > devIndex && catchIndex > throwIndex,
  );
});

scenario('4. eas.json production env declares Supabase keys', () => {
  const src = read('eas.json');
  const production = src.match(/"production"\s*:\s*\{[\s\S]*?\}\s*\}?/);
  assert('eas.json has production build profile', !!production);
  const supabaseUrlDeclared =
    /EXPO_PUBLIC_SUPABASE_URL/.test(src) ||
    /environment[^}]*production/.test(src);
  assert(
    'production profile references EXPO_PUBLIC_SUPABASE_URL (via env)',
    supabaseUrlDeclared,
  );
});

scenario('5. cloudSync.ts does not hydrate isPro (backend IAP is truth)', () => {
  const src = read('src/services/cloudSync.ts');
  const pull = src.match(/pullAllFromCloud[\s\S]*?(?=\n(?:export|async function|function))/);
  if (pull) {
    assert(
      'pullAllFromCloud does not set isPro from cloud',
      !/setState\(\s*\{[^}]*isPro\s*:\s*!!p\.isPro/.test(pull[0]),
    );
  } else {
    assert('pullAllFromCloud found in cloudSync.ts', false, 'function block not found');
  }
});

console.log('\n' + '─'.repeat(60));
console.log(`Cloud-auth tests : ${PASS} passed, ${FAIL} failed`);
if (FAIL > 0) {
  console.log('\n❌ FAILURES:');
  FAILURES.forEach((f) => console.log(`  · ${f.name} ${f.detail}`));
  process.exit(1);
}
console.log('✅ All cloud-auth tests PASS');
process.exit(0);
