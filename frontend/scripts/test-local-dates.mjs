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

// Execute the real Swiss amount parser. parseFloat("1'234.50") returns 1,
// which previously corrupted both daily and professional expense inputs.
const amtSrc=readFileSync(resolve(root,'src/utils/amount.ts'),'utf8');
const amtMod={exports:{}};
const amtJs=ts.transpileModule(amtSrc,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
}).outputText;
vm.runInNewContext(amtJs,{exports:amtMod.exports,module:amtMod,Number,String,RegExp,parseFloat});
const parseAmount=amtMod.exports.normalizeChfAmount;
assert.equal(parseAmount("1'234.50"),1234.5);
assert.equal(parseAmount('1 234,50'),1234.5);
assert.equal(parseAmount('123,45 CHF'),123.45);
assert.equal(parseAmount('12abc'),null);
assert.equal(parseAmount('-100'),null);
const expenses=readFileSync(resolve(root,'app/(tabs)/expenses.tsx'),'utf8');
assert.ok(expenses.includes('amount: validatedAmount,'),'Expense creation must use normalized CHF');
assert.ok(expenses.includes('const amt = normalizeChfAmount(values.amount ?? editingTx.amount);'),'Expense editing must validate Swiss amounts');
assert.ok(expenses.includes('const parseTxDate = (s: string): Date | null => parseFinancialDate(s);'),'List and budget must use same calendar parser');
const scanner=readFileSync(resolve(root,'app/scanner-modal.tsx'),'utf8');
assert.ok(scanner.includes('qrHandled = handleBarcodeScanned({ data: data.swiss_qr_content });'),'Backend Swiss QR must reach native QR review UI');
assert.ok(scanner.includes("if (!qrHandled) setStage('edit');"),'QR review must not be overwritten by receipt editor');
console.log('PASS: real Swiss amount parser, two ledger forms, timezone-safe ISO, backend Swiss QR routing');

