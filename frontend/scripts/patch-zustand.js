#!/usr/bin/env node
/* eslint-disable */
// Patch zustand to remove import.meta references that crash Metro web bundle.
const fs = require('fs');
const p = require('path');

const target = p.join(__dirname, '..', 'node_modules', 'zustand', 'esm', 'middleware.mjs');
try {
  if (!fs.existsSync(target)) {
    console.log('[patch-zustand] file not found, skip');
    process.exit(0);
  }
  let c = fs.readFileSync(target, 'utf8');
  if (c.includes('import.meta.env')) {
    c = c.replace(/import\.meta\.env \? import\.meta\.env\.MODE : void 0/g, '"production"');
    fs.writeFileSync(target, c);
    console.log('[patch-zustand] patched OK');
  } else {
    console.log('[patch-zustand] already patched');
  }
} catch (e) {
  console.error('[patch-zustand] error', e.message);
}
