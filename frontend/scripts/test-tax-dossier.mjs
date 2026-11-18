#!/usr/bin/env node
// Official year-specific 3a ceilings; execute REAL TypeScript implementation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

execFileSync('npx', ['tsc','src/lib/swissTaxDossier.ts','--outDir','/tmp/budgy-tax93',
  '--module','commonjs','--target','es2020','--skipLibCheck'],{stdio:'pipe'});
const require=createRequire(import.meta.url);
const {
  YEAR_LIMITS, TAX_DOCUMENT_KEYS, planPillar3a, optionalCHF, isValidDossier
} = require('/tmp/budgy-tax93/swissTaxDossier.js');

assert.equal(YEAR_LIMITS[2026].with_lpp,7258);
assert.equal(YEAR_LIMITS[2026].without_lpp,36288);
assert.equal(YEAR_LIMITS[2027].with_lpp,7373);
assert.equal(YEAR_LIMITS[2027].without_lpp,36864);
assert.equal(planPillar3a(2027,'with_lpp','3’000','').remaining,4373);
assert.equal(planPillar3a(2026,'with_lpp','3’000','').remaining,4258);
assert.equal(planPillar3a(2027,'without_lpp','', '100000').cap,20000);
assert.equal(planPillar3a(2027,'without_lpp','', '500000').cap,36864);
assert.equal(planPillar3a(2026,'without_lpp','', '500000').cap,36288);
assert.equal(planPillar3a(2027,'without_lpp','', '').reason,'need_avs_income');
assert.equal(planPillar3a(2027,'unknown','', '').cap,null);
assert.equal(planPillar3a(2027,'with_lpp','10000','').remaining,0);
assert.equal(planPillar3a(2027,'with_lpp','10000','').overLimit,true);
assert.equal(planPillar3a(2027,'with_lpp','abc','').reason,'invalid_amount');
assert.equal(optionalCHF('1’250.50'),1250.5);
assert.equal(optionalCHF('-5'),null);
assert.equal(optionalCHF('12abc'),null);
assert.equal(optionalCHF(''),0);
assert.equal(TAX_DOCUMENT_KEYS.length,16);
assert.equal(isValidDossier({checked:['pillar3a','salary'],pension:'with_lpp',paid3a:'2000',avsIncome:''}),true);
assert.equal(isValidDossier({checked:['bad_key'],pension:'with_lpp',paid3a:'2000',avsIncome:''}),false);
assert.equal(isValidDossier({checked:[],pension:'with_lpp',paid3a:null,avsIncome:''}),false);
const screen=readFileSync('app/more/tax-dossier.tsx','utf8');
const features=readFileSync('src/config/features.ts','utf8');
const tax=readFileSync('app/more/tax-optimizer.tsx','utf8');
assert.match(screen,/SecureStore.getItemAsync\(key\)/);
assert.match(screen,/SecureStore.setItemAsync\(key, JSON.stringify\(next\)\)/);
assert(!screen.includes('apiFetchJson'));
assert(!screen.includes('fetch('));
assert.match(screen,/OFFICIAL_3A/);
assert.match(screen,/OFFICIAL_BUYBACK/);
assert.match(features, /id: 'tax-dossier'.*tier: 'pro'/);
assert.match(tax,/router.push\('\/more\/tax-dossier'/);
console.log('PASS: 2026/2027 3a ceilings, AVS 20% cap, invalid CHF, 16 fiscal documents, local secure progress, paywall protection');
