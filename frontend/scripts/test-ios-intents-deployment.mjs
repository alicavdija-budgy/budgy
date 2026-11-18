#!/usr/bin/env node
// Native iOS compile guard for AppIntents shared between main app (iOS <16)
// and Siri extension (iOS >=17). These Swift APIs require iOS 16+.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const root = 'targets/intents/_shared/';
const intents = readFileSync(root + 'BudgyIntents.swift', 'utf8');
const shortcuts = readFileSync(root + 'BudgyShortcuts.swift', 'utf8');
const config = readFileSync('targets/intents/expo-target.config.js', 'utf8');
const definitions = [...intents.matchAll(/(?:^|\n)(@available\(iOS 16\.0, \*\)\n)?struct\s+(\w+)\s*:\s*AppIntent\s*\{/g)];
assert.equal(definitions.length, 7, 'Expected 7 AppIntents');
for (const m of definitions) {
  assert.equal(m[1], '@available(iOS 16.0, *)\n', m[2] + ' is shared into the main iOS target and requires iOS 16 availability');
}
assert.match(shortcuts, /@available\(iOS 16\.0, \*\)\nstruct BudgyShortcuts: AppShortcutsProvider \{/);
assert.match(config, /deploymentTarget:\s*['"]17\.0['"]/);
console.log('PASS: 7 native Siri AppIntents and provider gated to iOS 16+, extension iOS 17');
