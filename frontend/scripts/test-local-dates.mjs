#!/usr/bin/env node
// Executable regression: calendar days MUST NOT depend on language/UTC midnight.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const source = readFileSync(resolve(root,'src/utils/localDate.ts'),'utf8');
const compiled = ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
}).outputText;
const mod = {exports:{}};
vm.runInNewContext(compiled,{exports:mod.exports,module:mod,Date,RangeError,Number,String});
const {formatLocalISODate} = mod.exports;

const oldTz=process.env.TZ;
try {
  process.env.TZ='Europe/Zurich';
  const midnightSwiss = new Date(2026,10,15,0,15);
  assert.equal(formatLocalISODate(midnightSwiss),'2026-11-15');
  assert.equal(midnightSwiss.toISOString().slice(0,10),'2026-11-14');

  process.env.TZ='America/Los_Angeles';
  const midnightPacific = new Date(2026,10,15,23,30);
  assert.equal(formatLocalISODate(midnightPacific),'2026-11-15');
  assert.equal(midnightPacific.toISOString().slice(0,10),'2026-11-16');

  process.env.TZ='Europe/Zurich';
  const normal = new Date(2026,10,15,14,30);
  assert.equal(formatLocalISODate(normal),'2026-11-15');
  assert.throws(()=>formatLocalISODate(new Date(NaN)),/Invalid calendar date/);
} finally {if(oldTz===undefined) delete process.env.TZ;else process.env.TZ=oldTz;}

for(const path of ['app/(tabs)/expenses.tsx','app/scanner-modal.tsx']){
  const content=readFileSync(resolve(root,path),'utf8');
  assert.ok(content.includes('date: formatLocalISODate(now),'),path+' must save local ISO');
  assert.ok(!content.includes('date: now.toLocaleDateString('),path+' must not store locale formatted dates');
}
console.log('PASS: real local ISO date formatter + CHF ledger save paths; both timezones and locales guarded');
