#!/usr/bin/env node
/**
 * Budgy Build 80 — production authentication contract.
 * Static checks only. SMTP delivery must still be verified end-to-end on
 * TestFlight against the production self-hosted Supabase stack.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const supabaseSrc = read('src/lib/supabase.ts');
const authErrorsSrc = read('src/lib/authErrors.ts');
const authSrc = read('app/auth.tsx');
const forgotSrc = read('app/forgot-password.tsx');
const resetSrc = read('app/reset-password.tsx');
const eas = JSON.parse(read('eas.json'));
const app = JSON.parse(read('app.json'));

let passed = 0;
let failed = 0;
const ok = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e?.stack || e}`); }
};

console.log('\n[test-auth-production] Build 80 auth contract\n');

ok('Supabase client requires public URL + anon key', () => {
  assert.match(supabaseSrc, /EXPO_PUBLIC_SUPABASE_URL/);
  assert.match(supabaseSrc, /EXPO_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(supabaseSrc, /supabaseUrl\s*&&\s*supabaseAnonKey/);
});

ok('production EAS environment is selected explicitly', () => {
  assert.equal(eas.build.production.environment, 'production');
  assert.equal(eas.build.production.env.EXPO_PUBLIC_SUPABASE_URL, 'https://supabase.budgy.ch');
  assert.equal(eas.build.production.env.EXPO_PUBLIC_BACKEND_URL, 'https://api.budgy.ch');
});

ok('anon key is not committed into eas.json', () => {
  assert.equal(eas.build.production.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, undefined);
});

ok('Budgy deep-link scheme is configured', () => {
  assert.equal(app.expo.scheme, 'budgy');
});

ok('forgot-password sends through Supabase Auth', () => {
  assert.match(forgotSrc, /resetPasswordForEmail\s*\(/);
  assert.match(forgotSrc, /reset-password/);
});

ok('reset-password supports PKCE recovery and password update', () => {
  assert.match(resetSrc, /exchangeCodeForSession\s*\(/);
  assert.match(resetSrc, /updateUser\(\{\s*password/);
});

ok('auth has no production local fallback', () => {
  assert.match(authSrc, /else if \(__DEV__\)/);
  assert.match(authSrc, /throw new Error\('supabase_config_missing'\)/);
});

ok('signup without a Supabase session does not create a local authenticated user', () => {
  const start = authSrc.indexOf('if (!data.session)');
  const end = authSrc.indexOf('loginAsLocalUser(data.user.id', start);
  assert.ok(start >= 0 && end > start, 'email-confirmation/session guard missing');
  const block = authSrc.slice(start, end);
  assert.doesNotMatch(block, /loginAsLocalUser\s*\(/);
  assert.match(block, /setMode\('login'\)/);
});

ok('successful sign-in requires both user and session', () => {
  assert.match(authSrc, /if \(!data\.user \|\| !data\.session\) throw new Error\('signin_missing_session'\)/);
});

ok('configuration failure is not presented as bad credentials', () => {
  const configIndex = authErrorsSrc.indexOf("lower.includes('supabase_config_missing')");
  const credentialsIndex = authErrorsSrc.indexOf("lower.includes('invalid login')");
  assert.ok(configIndex >= 0 && credentialsIndex > configIndex);
  assert.match(authErrorsSrc, /AUTH_SERVICE_UNAVAILABLE/);
});

ok('Build 80 identity is active', () => {
  assert.equal(app.expo.ios.buildNumber, '80');
  assert.equal(app.expo.android.versionCode, 80);
});

console.log(`\n[test-auth-production] ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
