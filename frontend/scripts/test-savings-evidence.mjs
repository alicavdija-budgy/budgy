#!/usr/bin/env node
// Evidence engine: execute real TypeScript code, not a duplicate algorithm.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
execFileSync('npx',['tsc','src/lib/savingsEvidence.ts','--outDir','/tmp/budgy-optimizer93','--module','commonjs','--target','es2020','--skipLibCheck'],{stdio:'pipe'});
const require=createRequire(import.meta.url);
const {buildSavingsEvidence}=require('/tmp/budgy-optimizer93/savingsEvidence.js');
const at=new Date('2026-11-18T12:00:00Z');
const out=buildSavingsEvidence([
 {type:'expense',category:'courses',amount:90,date:'2026-11-04',source:'manual'},
 {type:'expense',category:'courses',amount:110,date:'2026-10-04',source:'manual'},
 {type:'income',category:'courses',amount:600,date:'2026-11-10'},
 {type:'expense',category:'courses',amount:700,date:'2025-09-10'},
 {type:'expense',category:'courses',amount:800,date:'2026-11-10',source:'recurring'},
 {type:'expense',category:'courses',amount:800,date:'2026-11-10',source:'invoice'},
 ],[
 {title:'Netflix',category:'abonnements',amount:18,frequency:'monthly',active:true},
 {title:'Swisscom',category:'telecom',amount:60,frequency:'quarterly',active:true},
 {title:'Expired',category:'abonnements',amount:100,frequency:'monthly',active:false},
 ],at);
assert.equal(out.find(x=>x.category==='subscription').currentMonthly,18);
assert.equal(out.find(x=>x.category==='telco').currentMonthly,20);
assert.equal(out.find(x=>x.category==='food').currentMonthly,100);
assert.equal(out.find(x=>x.category==='food').scenarioMonthly,5);
assert.equal(buildSavingsEvidence([],[],at).length,0);
assert.equal(buildSavingsEvidence([],[{title:'Assurance',amount:1000,category:'assurance',active:true}],at).length,0);
const ai=readFileSync('app/more/ai-optimizer.tsx','utf8');
assert.match(ai,/buildSavingsEvidence\(store.transactions, store.recurringExpenses\)/);
assert.match(ai,/Backend LLM suggestions are NOT used as CHF savings/);
assert(!ai.includes('title: tx.title'));
assert(!ai.includes('issuer: inv.issuer'));
assert(!ai.includes('name: d.name'));
assert(!ai.includes('title: c.title'));
assert.match(ai,/genericCategory\(tx.category\)/);
const tax=readFileSync('app/more/tax-optimizer.tsx','utf8');
assert.match(tax,/gross_salary: ''/);
assert.match(tax,/normalizeChfAmount\(form.gross_salary\)/);
assert.match(tax,/estimateDisclaimer/);
assert.match(tax,/officialCalculator/);
assert.match(tax,/pillarCap2026/);
console.log('PASS: real expense evidence, recurrence, no fictional 3a or insurance savings, safe Swiss tax UI');
