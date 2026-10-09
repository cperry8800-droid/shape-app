// Nora's booth on its two pages: the app's Radio screen (iosAppBroadsheetRadio.jsx) and the
// website's Radio page (radio.jsx). Both mount public/newdesign/booth/noraBooth.mjs; these pin
// the rules the review's Phase 1 asked of each mount, read from the shipped source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parse } from '@babel/parser';
import { stripComments } from './helpers/strip-comments.mjs';
import { BOOTH_LABEL_KEYS, BOOTH_LABEL_EN } from '../public/newdesign/booth/noraBoothState.mjs';
import { ACTIVE_LOCALES } from '../mobile-app/src/i18n/locales.mjs';

const APP_PATH = 'mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx';
const APP = readFileSync(APP_PATH, 'utf8');
const APP_BARE = stripComments(APP);
const WEB = readFileSync('public/newdesign/radio.jsx', 'utf8');
const WEB_BARE = stripComments(WEB);
const INSTRUMENT = readFileSync('public/newdesign/radioInstrument.jsx', 'utf8');
const HTML = readFileSync('public/newdesign/Radio.html', 'utf8');
const HOST = readFileSync('public/newdesign/booth/noraBooth.mjs', 'utf8');

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && walk(c, visit));
    else if (v && typeof v.type === 'string') walk(v, visit);
  }
}
const collect = (root, pred) => { const out = []; walk(root, (n) => { if (pred(n)) out.push(n); }); return out; };
const APP_AST = parse(APP, { sourceType: 'module', plugins: ['jsx'] });
const WEB_AST = parse(WEB, { sourceType: 'script', plugins: ['jsx'] });
const fnNamed = (ast, name) => collect(ast, (n) => n.type === 'FunctionDeclaration' && n.id && n.id.name === name)[0];

// ── three loads only when the booth opens ────────────────────────────────────
test('the app imports the booth on demand, never into the boot chunk', () => {
  const statics = APP_AST.program.body.filter((n) => n.type === 'ImportDeclaration').map((n) => n.source.value);
  for (const bad of ['three', '@pixiv/three-vrm']) assert.ok(!statics.some((s) => s === bad || s.startsWith(bad + '/')), `the radio module statically imports ${bad}`);
  assert.ok(!statics.some((s) => /noraBooth\.mjs$/.test(s) || /noraStage\.mjs$/.test(s)),
    'the radio module statically imports the booth — three rides the boot chunk again');
  const dyn = collect(APP_AST, (n) => n.type === 'ImportExpression' || (n.type === 'CallExpression' && n.callee.type === 'Import'))
    .map((n) => (n.source || n.arguments[0]).value);
  assert.ok(dyn.includes('../../../public/newdesign/booth/noraBooth.mjs'), 'the app no longer imports the booth at all');
  // The small, pure modules may load with the page.
  assert.ok(statics.includes('../../../public/newdesign/booth/noraBoothState.mjs'));
  assert.ok(statics.includes('../../../public/newdesign/booth/noraBoothKeeper.mjs'));
});

test('the website imports the booth on demand and its rules with the page', () => {
  const dyn = collect(WEB_AST, (n) => n.type === 'ImportExpression' || (n.type === 'CallExpression' && n.callee.type === 'Import'))
    .map((n) => (n.source || n.arguments[0]).value);
  assert.deepEqual(dyn, ['/newdesign/booth/noraBooth.mjs']);
  assert.match(HTML, /import \* as BS from "\/newdesign\/booth\/noraBoothState\.mjs\?v=[0-9a-f]{10}";/);
  assert.match(HTML, /import \* as BK from "\/newdesign\/booth\/noraBoothKeeper\.mjs\?v=[0-9a-f]{10}";/);
  assert.match(HTML, /window\.ShapeBoothState = BS; window\.ShapeBoothKeeper = BK;/);
  // ...and the import map, which must precede every module script, still precedes this one.
  assert.ok(HTML.indexOf('type="importmap"') < HTML.indexOf('noraBoothState.mjs'));
});

// ── the label ────────────────────────────────────────────────────────────────
test('the app never says LIVE for the booth: the label is one of the six, each keyed', () => {
  assert.ok(!/radio:nora\.liveLabel/.test(APP_BARE), 'the old LIVE label key is read again');
  assert.ok(!/· NORA/.test(APP_BARE), 'the hardcoded "· NORA" label is back');
  const fn = fnNamed(APP_AST, 'bsBoothLabelText');
  assert.ok(fn, 'bsBoothLabelText is gone');
  const calls = collect(fn, (n) => n.type === 'CallExpression' && n.callee.name === 'tr' && n.arguments[0] && n.arguments[0].type === 'StringLiteral');
  const keys = calls.map((c) => c.arguments[0].value);
  assert.deepEqual([...keys].sort(), BOOTH_LABEL_KEYS.map((k) => `radio:booth.label.${k}`).sort(), 'a label is missing its literal key');
  // Each default is the shared English (the guest one fills {dj} itself, so the raw default reads right).
  for (const c of calls) {
    const key = c.arguments[0].value.split('.').pop();
    const dv = c.arguments[1].properties.find((p) => p.key.name === 'defaultValue').value;
    if (key === 'guest') { assert.equal(dv.type, 'TemplateLiteral'); continue; }
    assert.equal(dv.value, BOOTH_LABEL_EN[key], `${key}'s default drifted from noraBoothState's English`);
  }
  assert.match(APP_BARE, /const label = boothLabel\(\{ example: !!\(snap && snap\.example\), station: \{ playing: stationPlaying, bpm: snap \? snap\.bpm : null, guest: guestDj \} \}\);/,
    'the app no longer derives its label from the booth snapshot and the station');
  assert.match(WEB_BARE, /S\.boothLabel\(\{ example: !!\(snap && snap\.example\), station: \{ playing: stationPlaying, bpm: snap \? snap\.bpm : null, guest: guestDj \} \}\)/,
    'the website no longer derives its label the same way');
});

test('every booth key the app reads is authored in all 13 locales, and none is authored unread', () => {
  const read = new Set([...APP_BARE.matchAll(/tr\('radio:(booth\.[A-Za-z.]+)'/g)].map((m) => m[1]));
  assert.ok(read.size >= 18, `only ${read.size} booth keys found — this guard has stopped reading the module`);
  for (const loc of ACTIVE_LOCALES) {
    const cat = JSON.parse(readFileSync(`mobile-app/src/i18n/catalogs/${loc}/radio.json`, 'utf8'));
    for (const k of read) assert.equal(typeof cat[k], 'string', `${loc}/radio.json lacks ${k}`);
    const orphans = Object.keys(cat).filter((k) => k.startsWith('booth.') && !read.has(k));
    assert.deepEqual(orphans, [], `${loc}/radio.json authors booth keys nothing reads`);
    assert.ok(!('nora.liveLabel' in cat) && !('nora.preview' in cat), `${loc} still carries the retired LIVE label's keys`);
  }
});

// ── who hears the example set ────────────────────────────────────────────────
test('both pages stop the example set the moment it is no longer the listener’s to hear', () => {
  assert.match(APP_BARE, /const allowed = exampleAllowed\(\{ prospect, stationConfigured, stationPlaying \}\);/);
  assert.match(APP_BARE, /useEffectBR\(\(\) => \{\s*if \(!allowed && boothRef\.current\) boothRef\.current\.stopExample\(\);\s*\}, \[allowed, status\]\);/);
  assert.match(WEB_BARE, /S\.exampleAllowed\(\{ prospect, stationConfigured, stationPlaying \}\)/);
  assert.match(WEB_BARE, /React\.useEffect\(\(\) => \{\s*if \(!allowed && boothRef\.current\) boothRef\.current\.stopExample\(\);\s*\}, \[allowed, state\]\);/);
  // The play control exists only while allowed.
  assert.match(APP_BARE, /\{allowed && \(playing/);
  assert.match(WEB_BARE, /\{allowed && \(playing/);
  // The app's inputs are the measured ones: a prospect is the shell's explicit false, the station
  // is configured only on a resolved read, and playing is the stamped clock, not the request.
  assert.match(APP_BARE, /const stationPlaying = r\.playingSince != null;/);
  assert.match(APP_BARE, /const stationConfigured = !!\(r\.sets && r\.sets\.real\);/);
  assert.match(APP_BARE, /prospect=\{previewSim\}/);
});

test('the website instrument publishes the station’s state on the channel the booth listens to', () => {
  const m = INSTRUMENT.match(/window\.__shapeRadioState = \{ signedIn, configured, playing \};\s*try \{ window\.dispatchEvent\(new CustomEvent\("([^"]+)"/);
  assert.ok(m, 'the instrument no longer publishes signedIn/configured/playing');
  assert.ok(WEB_BARE.includes(`window.addEventListener("${m[1]}"`), `the booth does not listen on ${m[1]}`);
  // A prospect is a MEASURED signed-out visitor; "not resolved yet" is not one.
  assert.match(WEB_BARE, /const prospect = radio\.signedIn === false;/);
  assert.match(WEB_BARE, /const stationConfigured = radio\.configured === true;/);
});

test('the station analyser is read only while the stream plays', () => {
  assert.match(APP_BARE, /const an = stationPlaying && window\.ShapeRadioLive\?\.analyser \? window\.ShapeRadioLive\.analyser\(\) : null;/,
    'the app reads (and so wires) the radio graph while nothing plays');
  assert.match(WEB_BARE, /analyser: graph && stationPlaying \? graph\.analyser : null/);
});

// ── a booth that stays loaded ────────────────────────────────────────────────
test('each mount acquires the kept booth and releases it in the same effect', () => {
  for (const [name, bare] of [['app', APP_BARE], ['website', WEB_BARE]]) {
    const acq = bare.indexOf('.acquire()');
    const rel = bare.indexOf('.release()', acq);
    assert.ok(acq > 0 && rel > acq, `${name}: no acquire/release pair`);
    // Detaching the canvas, not disposing the booth, is what keeps it for the next visit.
    const cleanup = bare.slice(acq, rel);
    assert.ok(/canvas\.parentNode\.removeChild\(booth\.canvas\)/.test(cleanup), `${name}: the canvas is not detached on unmount`);
    assert.ok(!/booth\.dispose\(\)|b\.dispose\(\)/.test(cleanup), `${name}: the mount disposes the kept booth itself`);
  }
  // The app remembers that it was open across the remount.
  assert.match(APP_BARE, /useStateBR\(\(\) => bsNoraWanted\)/);
  assert.match(APP_BARE, /bsNoraWanted = !v;/);
});

test('both mounts ask for WebGL 2 before downloading the booth', () => {
  const appCheck = APP_BARE.indexOf('if (!webgl2Available())');
  assert.ok(appCheck > 0 && appCheck < APP_BARE.indexOf('keeper.acquire()'));
  const webCheck = WEB_BARE.indexOf('if (!S.webgl2Available())');
  assert.ok(webCheck > 0 && webCheck < WEB_BARE.indexOf('rdKeeper().then('));
});

// ── the room never reads a negative bar ──────────────────────────────────────
test('a look chosen by the bar is never indexed below zero', () => {
  // The bar clock reads just below zero for the first tenth of a second of a set, and `%` keeps the
  // sign: `[white, white, accent][-1]` threw "reading 'r'" in Chromium. Every bar-chosen index in
  // the room goes through a positive modulo, and the host never hands the room a negative bar.
  for (const f of ['club.mjs', 'arenaStage.mjs']) {
    const src = stripComments(readFileSync(`public/newdesign/booth/${f}`, 'utf8'));
    const raw = [...src.matchAll(/Math\.floor\([^()]*\.bar\s*\/\s*8\)[^;\n]*?%\s*(?:3|palette\.length)/g)]
      .filter((m) => !/posMod\(|\+ 3\) % 3/.test(src.slice(m.index - 40, m.index + m[0].length + 10)));
    assert.deepEqual(raw.map((m) => m[0]), [], `${f} indexes a look with a signed modulo of the bar`);
  }
  const club = stripComments(readFileSync('public/newdesign/booth/club.mjs', 'utf8'));
  assert.equal((club.match(/posMod\(Math\.floor\(state\.bar \/ 8\)/g) || []).length, 3, 'club.mjs has fewer guarded look indexes than it had');
  assert.match(HOST, /const roomBar = Math\.max\(0, bar\);/);
  assert.match(HOST, /bar: Math\.floor\(roomBar\)/);
  assert.ok(existsSync('public/newdesign/booth/club.mjs'));
});
