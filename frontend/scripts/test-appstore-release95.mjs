#!/usr/bin/env node
/**
 * Budgy 4.0.0 (95): deterministic static App Store release-candidate gate.
 * Checks source / config only. DO NOT imply native device tests, Apple
 * subscriptions, live API availability or App Review approval.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read=(p)=>readFileSync(resolve(process.cwd(),p),'utf8');
const app=JSON.parse(read('app.json')).expo;
const eas=JSON.parse(read('eas.json'));
const workflow=read('../.github/workflows/eas-build.yml');
const swift=read('targets/intents/_shared/BudgyShared.swift');
const intents=read('targets/intents/_shared/BudgyIntents.swift');
const bridge=read('src/services/widgetBridge.ts');
const sheet=read('src/components/WidgetSync.tsx');
const localSave=read('src/services/saveSiriExpense.ts');
const imports=read('app/more/email-import.tsx');
const privacy=read('src/lib/documentPrivacy.ts');
const translations=read('src/i18n/translations.ts');
const iap=read('src/services/iap.ts');
const release=read('../app-store-assets/RELEASE_4_0_0_BUILD_95.md');
const archived=read('../APP_STORE_SUBMISSION_FINAL.md');

assert.equal(app.name,'Budgy');
assert.equal(app.version,'4.0.0');
assert.equal(app.ios.buildNumber,'95');
assert.equal(app.ios.bundleIdentifier,'com.budgy.ch.budgy');
assert.equal(app.ios.appleTeamId,'N69NHCB9S3');
assert.equal(app.ios.infoPlist.ITSAppUsesNonExemptEncryption,false);
assert(app.ios.entitlements['com.apple.security.application-groups'].includes('group.com.budgy.ch.budgy'));
assert(app.ios.supportsTablet===true);

assert.equal(eas.cli.appVersionSource,'local');
const prod=eas.build.production;
const tf=eas.build.testflight;
assert.equal(prod.distribution,'store');
assert.equal(prod.channel,'production');
assert.equal(prod.environment,'production');
assert.equal(prod.ios.image,'sdk-54'); // Xcode 26, iOS 26 SDK (Apple 2026)
assert.equal(prod.ios.simulator,false);
assert.equal(prod.node,'22.23.3');
assert.equal(prod.yarn,'1.22.22');
assert.equal(prod.env.EXPO_PUBLIC_BACKEND_URL,'https://api.budgy.ch');
assert.equal(prod.env.EXPO_PUBLIC_SUPABASE_URL,'https://supabase.budgy.ch');
assert(!('APP_VARIANT' in prod.env));
assert.equal(tf.extends,'production');
assert.equal(tf.channel,'testflight');
assert.notEqual(tf.channel,prod.channel);
assert.equal(eas.submit.production.ios.ascAppId,'6767026949');
assert.equal(eas.submit.production.ios.appleTeamId,app.ios.appleTeamId);
assert.match(workflow,/workflow_dispatch:/);
assert.match(workflow,/a.ios\?\.buildNumber !== '95'/);
assert.match(workflow,/--id "\$BUILD_ID"/); // Exact EAS binary; never --latest.
assert.match(workflow,/--profile "\$PROFILE"/);

assert.match(bridge,/probe\(candidate\)/);
assert.match(bridge,/requireOptionalNativeModule\?\.\('ExtensionStorage'\)/);
assert.match(intents,/openAppWhenRun: Bool = true/);
assert.match(intents,/BudgyIntentStore.enqueue/);
assert.match(sheet,/testID="siri-expense-confirm"/);
assert.match(sheet,/testID="siri-expense-cancel"/);
assert.match(sheet,/setInterval\(consumeNative, 800\)/);
assert.match(localSave,/isAlreadyProcessed/);
assert.match(localSave,/amount: draft.amount/);
assert.match(localSave,/isLocked/);
assert.match(swift,/group.com.budgy.ch.budgy/);

assert.match(imports,/documentPrivacy\.ocrBody/);
assert.match(imports,/documentPrivacy\.ocrManual/);
assert.match(imports,/keepDocumentPrivate/);
assert.match(privacy,/PRIVATE_DOCUMENTS_LOCAL_ONLY = true/);
assert.match(privacy,/'documents'/);
assert.match(privacy,/'invoices'/);
assert.match(privacy,/'contracts'/);
assert.match(privacy,/'receipts'/);
assert.match(translations,/L\\'original reste sur votre appareil/);
assert(!translations.includes('Tout reste en local sur votre appareil — aucune donnée vendue'));
assert.match(iap,/com\.budgy\.ch\.budgy\.monthly/);
assert.match(iap,/com\.budgy\.ch\.budgy\.annual/);

for(const tag of ['Français (fr-FR)','Deutsch (de-DE)','Italiano (it-IT)','English (en-US / en-GB)']){
  assert(release.includes(tag),'Missing App Store release notes: '+tag);
}
assert(release.includes('Profile | `production`'));
assert(release.includes('TestFlight puis App Store'));
assert(archived.includes('ARCHIVE — v3.8.0 / build 70'));

for(const lang of ['fr','de','it','en']){
  for(const type of ['iphone-6.9','ipad']){
    const base=resolve(process.cwd(), '../app-store-assets/ios',lang,type);
    for(let k=1;k<=7;k++){
      const file=resolve(base,`${String(k).padStart(2,'0')}_budgy_${lang}_${type==='ipad'?'ipad_13':'iphone_6.9'}.png`);
      assert(existsSync(file),'Missing screenshot (not a freshness guarantee): '+file);
    }
  }
}

console.log('PASS: 4.0.0 (95) / production channel / Xcode 26 / Apple IDs / App Group / Siri / IAP / privacy consent / 4 locales / screenshot files / manual-release workflow');
console.log('MANUAL GATES REMAIN: TestFlight on iPhone + iPad, StoreKit purchases, real backend, privacy policy, App Store Connect age rating/DSA/review account.');
