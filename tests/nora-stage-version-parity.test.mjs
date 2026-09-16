// ONE MODULE, TWO DEPENDENCY PAIRS — AND THEY HAD SILENTLY STOPPED MATCHING.
//
// WHY THIS FILE EXISTS: on 2026-09-16 the owner said "the nora preview is not
// working". Driven in Chromium against the page's own pinned versions, the booth
// answered "The booth could not start on this device" on every open, with WebGL
// present and healthy. The thrown error — swallowed by RadioNora's catch, so it
// reached no console and no log — was:
//
//     TypeError: VRMUtils.combineSkeletons is not a function
//         at NoraStage.load (noraStage.mjs:53)
//
// public/newdesign/noraStage.mjs is compiled against TWO dependency pairs: Vite
// bundles it for the app against mobile-app/node_modules, and the import map in
// public/newdesign/Radio.html resolves it for the web off esm.sh. A bump moved the
// app to three 0.185.1 / three-vrm 3.5.5 and left the map on 0.169.0 / 3.1.6.
// `combineSkeletons` was added to three-vrm after 3.1.6 — measured: 0 occurrences
// in 3.1.6's bundle, 5 in 3.5.5's — so the call existed on the phone and not on the
// web. The app was fine throughout, which is exactly why nobody saw it.
//
// ⚠ AND A COMMENT IS WHAT HID IT. mobile-app/vite.config.ts asserted these were the
// "same versions as the web import-map — three@0.169.0 + @pixiv/three-vrm@3.1.6"
// while package.json said otherwise. Anyone who read it would believe the two were
// in sync. That comment is corrected; this file is what actually enforces it.
//
// The two assertions below chain into the claim that matters. On its own, checking
// the installed copy only proves the APP is safe — it is mobile's node_modules. It
// is version PARITY that carries the result across to the web:
//   (a) every VRMUtils member noraStage.mjs calls exists in the INSTALLED three-vrm
//   (b) the web import map pins the SAME versions the app installs
//   ⟹ every member exists on the web too.
// Drop either half and the web side is unproven again.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const HTML = readFileSync('public/newdesign/Radio.html', 'utf8');
const STAGE = readFileSync('public/newdesign/noraStage.mjs', 'utf8');
const PKG = JSON.parse(readFileSync('mobile-app/package.json', 'utf8'));
const DEPS = { ...(PKG.dependencies || {}), ...(PKG.devDependencies || {}) };

const VRM_MODULE = 'mobile-app/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';

test('the Radio import map pins the same three / three-vrm the app installs', () => {
  // The app's pins are the reference: that pair is what production traffic has been
  // running through Vite, so it is the better-tested of the two.
  const appThree = DEPS['three'];
  const appVrm = DEPS['@pixiv/three-vrm'];
  // ⚠ VACUITY: a package.json whose keys moved must FAIL here, not sail past with
  // two undefineds that then "match" two undefineds below.
  assert.match(String(appThree), /^\d+\.\d+\.\d+$/, 'mobile-app/package.json has no exact `three` pin');
  assert.match(String(appVrm), /^\d+\.\d+\.\d+$/, 'mobile-app/package.json has no exact `@pixiv/three-vrm` pin');

  const map = HTML.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  assert.ok(map, 'Radio.html has no import map — Nora’s booth cannot resolve three at all');
  const imports = JSON.parse(map[1]).imports || {};

  // ⚠ VACUITY: assert the three entries are PRESENT before asserting what they say,
  // so a renamed/removed key fails rather than passing on an absent value.
  for (const k of ['three', 'three/addons/', '@pixiv/three-vrm']) {
    assert.ok(imports[k], `the import map lost its "${k}" entry`);
  }

  const three = imports['three'].match(/three@([\d.]+)/);
  const addons = imports['three/addons/'].match(/three@([\d.]+)/);
  const vrm = imports['@pixiv/three-vrm'].match(/three-vrm@([\d.]+)/);
  const vrmDeps = imports['@pixiv/three-vrm'].match(/[?&]deps=three@([\d.]+)/);
  assert.ok(three && addons && vrm && vrmDeps, 'an import-map URL no longer carries a readable version');

  assert.equal(three[1], appThree,
    `the import map pins three@${three[1]} while the app installs ${appThree} — noraStage.mjs is compiled against both`);
  assert.equal(addons[1], appThree,
    `three/addons/ points at three@${addons[1]} while "three" points at ${appThree} — the addons would load against a different copy`);
  assert.equal(vrm[1], appVrm,
    `the import map pins three-vrm@${vrm[1]} while the app installs ${appVrm} — this is the exact drift that killed the booth`);
  assert.equal(vrmDeps[1], appThree,
    `three-vrm's ?deps= resolves three@${vrmDeps[1]}, not ${appThree} — three-vrm would bind a SECOND copy of three`);
});

test('every VRMUtils member noraStage.mjs calls exists in the installed three-vrm', async () => {
  const used = [...STAGE.matchAll(/VRMUtils\.([A-Za-z0-9_]+)\s*\(/g)].map((m) => m[1]);
  const uniq = [...new Set(used)];
  // ⚠ VACUITY: the whole point is the call sites. A pattern that stops matching must
  // fail here rather than report a clean sweep over an empty list.
  assert.ok(uniq.length >= 3, `found only ${uniq.length} VRMUtils call sites in noraStage.mjs — the sweep has stopped matching`);
  assert.ok(uniq.includes('combineSkeletons'),
    'combineSkeletons is gone from noraStage.mjs — if that is deliberate, re-point this guard; it is the call the outage was about');

  // ⚠ NOT A SILENT SKIP. If the app tree is not installed this guard cannot run, and
  // saying so out loud is the difference between "checked" and "passed".
  assert.ok(existsSync(VRM_MODULE),
    `${VRM_MODULE} is not installed, so the API half of this guard cannot run — install mobile-app deps`);

  const mod = await import(pathToFileURL(VRM_MODULE).href);
  assert.equal(typeof mod.VRMUtils, 'function', 'three-vrm no longer exports VRMUtils');
  for (const fn of uniq) {
    assert.equal(typeof mod.VRMUtils[fn], 'function',
      `noraStage.mjs calls VRMUtils.${fn}(), which does not exist in @pixiv/three-vrm@${DEPS['@pixiv/three-vrm']} — ` +
      'the booth will throw a TypeError inside load() and RadioNora will swallow it into "The booth could not start on this device"');
  }
});
