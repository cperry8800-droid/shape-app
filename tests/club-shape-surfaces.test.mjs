// Club Shape's two doors: the website's Radio page (public/newdesign/radio.jsx RadioClub) and the
// app's Radio screen (mobile-app/src/broadsheet/BSClubShape.jsx). Owner, 2026-11-16: "improve the
// graphics and flow of club shape on website and app", then "make it look like the pictures, more
// real". Both show the same pictures through clubViews.mjs (tests/booth-clubViews.test.mjs holds the
// pictures and the film); this holds what each page does with them: one way in, the same rooms under
// the same names in every language, the live 3D room behind "Look around in 3D", and nothing that
// calls a picture live or offers a table, a room or a court.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLUB_VIEWS } from '../public/newdesign/booth/clubViews.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const LOCALES = ['en', 'es', 'fr', 'de', 'it', 'pt-BR', 'ru', 'uk', 'tr', 'id', 'vi', 'pcm', 'ha'];
const catalog = (loc) => JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/radio.json`));

const APP = read('mobile-app/src/broadsheet/BSClubShape.jsx');
const APP_RADIO = read('mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx');
const WEB = read('public/newdesign/radio.jsx');
const WEB_HTML = read('public/newdesign/Radio.html');
const WEB_STRIP = read('public/newdesign/radioInstrument.jsx');

/** The source of one top-level function, from its `function name(` to the next top-level `function `. */
function fnSource(src, name) {
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} is in the file`);
  const next = src.indexOf('\nfunction ', at + 1);
  return src.slice(at, next < 0 ? src.length : next);
}

/** Every `tr('radio:<key>', { defaultValue: '<text>' })` in a source, key → English default. */
function trDefaults(src) {
  const out = new Map();
  for (const m of src.matchAll(/tr\('radio:([\w.-]+)',\s*\{\s*defaultValue:\s*'((?:[^'\\]|\\.)*)'/g)) out.set(m[1], m[2]);
  return out;
}

// What a page would have to say to turn scenery into an offer, or a picture into a feed.
const OFFER = /\b(book|booking|reserve|reservation|price|pricing|available|availability|buy|order)\b|[$€£]\s?\d/i;

// ── the app: one name for a room, in every language ──────────────────────────
test('the app names and describes every room exactly as clubViews.mjs does', () => {
  const said = trDefaults(APP);
  const en = catalog('en');
  for (const v of CLUB_VIEWS) {
    assert.equal(said.get(`club.view.${v.id}`), v.label, `${v.id}: the screen's English name is the module's`);
    assert.equal(said.get(`club.alt.${v.id}`), v.alt, `${v.id}: the screen's English description is the module's`);
    assert.equal(en[`club.view.${v.id}`], v.label, `${v.id}: the English catalogue's name is the module's`);
    assert.equal(en[`club.alt.${v.id}`], v.alt, `${v.id}: the English catalogue's description is the module's`);
  }
  // No room the module doesn't have: a stale name would be a chip that opens nothing.
  const ids = new Set(CLUB_VIEWS.map((v) => v.id));
  for (const key of said.keys()) {
    const m = /^club\.(?:view|alt)\.(.+)$/.exec(key);
    if (m) assert.ok(ids.has(m[1]), `${key} names a room the club has`);
  }
});

test('every English line the club screen and its door card say is in the English catalogue, word for word', () => {
  const en = catalog('en');
  const said = new Map([...trDefaults(APP), ...[...trDefaults(APP_RADIO)].filter(([k]) => k.startsWith('club.') || k === 'strip.club')]);
  const club = [...said.keys()].filter((k) => k.startsWith('club.') || k === 'strip.club');
  assert.ok(club.length >= 48, `the screen reads its copy from the catalogue (${club.length} keys)`);
  for (const key of club) assert.equal(en[key], said.get(key), `${key}: the catalogue's English is the screen's`);
  // And nothing in the catalogue the screens no longer say.
  for (const key of Object.keys(en).filter((k) => k.startsWith('club.'))) assert.ok(said.has(key), `${key} is still said by a screen`);
});

test('all 13 languages carry every club line, and keep the club and Nora by name', () => {
  const en = catalog('en');
  const keys = Object.keys(en).filter((k) => k.startsWith('club.') || k === 'strip.club');
  assert.equal(keys.length, 50);
  for (const loc of LOCALES) {
    const cat = catalog(loc);
    for (const key of keys) {
      const v = cat[key];
      assert.ok(typeof v === 'string' && v.trim().length > 0, `${loc} ${key}: has its line`);
      if (en[key].includes('Club Shape')) assert.ok(v.includes('Club Shape'), `${loc} ${key}: the club keeps its name`);
      if (en[key].includes('Nora')) assert.ok(v.includes('Nora'), `${loc} ${key}: Nora keeps her name`);
      if (en[key].includes('Shape Radio')) assert.ok(v.includes('Shape Radio'), `${loc} ${key}: the station keeps its name`);
    }
    // A room's name sits on a chip and over the picture: it has to stay short in every language.
    for (const v of CLUB_VIEWS) assert.ok(cat[`club.view.${v.id}`].length <= 26, `${loc} club.view.${v.id}: fits a chip (${cat[`club.view.${v.id}`]})`);
    // The lines the old "Watch Nora (preview)" key and strip used are gone with them.
    for (const gone of ['nora.djPreview', 'nora.hide', 'nora.watch', 'strip.nora']) assert.equal(cat[gone], undefined, `${loc} ${gone}: went with the old key`);
  }
});

test('the pictures are never called live, and nothing in the club is offered, in any language’s English source', () => {
  const en = catalog('en');
  for (const [key, text] of Object.entries(en).filter(([k]) => k.startsWith('club.'))) {
    assert.ok(!OFFER.test(text), `${key}: scenery, not an offer (${text})`);
  }
  // The one place the word "live" belongs is the live 3D room's own note, and the honest line that
  // says the pictures are not a feed.
  const live = Object.entries(en).filter(([k, v]) => k.startsWith('club.') && /\blive\b/i.test(v)).map(([k]) => k).sort();
  assert.deepEqual(live, ['club.liveNote', 'club.note']);
  assert.match(en['club.note'], /made with AI/);
  assert.match(en['club.note'], /not a live feed/);
  assert.match(en['club.note'], /nothing in them is for sale/);
  for (const v of CLUB_VIEWS) {
    assert.ok(!OFFER.test(v.label) && !OFFER.test(v.alt), `${v.id}: the module's own words offer nothing`);
  }
});

// ── the app: the screen ──────────────────────────────────────────────────────
test('the club screen is its own module: nothing imported back from the Radio screen or the client', () => {
  const imports = [...APP.matchAll(/^import\s.+?from\s+'([^']+)';$/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['react', '../../../public/newdesign/booth/clubViews.mjs']);
  assert.ok(!/BSNoraBooth|noraBoothKeeper|from 'three'/.test(APP.replace(/^\s*\/\/.*$/gm, '')), 'the live room is handed in, never loaded here');
  // Window globals are read inside the component, not as the module loads (React #130).
  const top = APP.slice(0, APP.indexOf('export function BSClubShape('));
  assert.ok(!/=\s*window\b(?!\.matchMedia)/.test(top.replace(/^\s*\/\/.*$/gm, '').replace(/function useShapeTr\(\)[\s\S]*?\n}\n/, '').replace(/export function bsClubBase\(\)[\s\S]*?\n}\n/, '')), 'no window global read at module top');
  assert.match(APP, /const \{ useBS, BSLogo, BSMastBackSlot, BSBackRow[^}]*\} = window;/);
  // Its own translator, as every feature module carries.
  assert.match(APP, /function useShapeTr\(\)/);
});

test('the club screen has the one Back, a door, the rooms, a tour and the 3D room behind its own button', () => {
  assert.match(APP, /\{BSMastBackSlot \? <BSMastBackSlot \/> : null\}/);
  assert.match(APP, /\{BSBackRow \? <BSBackRow onBack=\{onBack\} ink=\{CREAM\} \/> : null\}/);
  assert.equal((APP.match(/data-club-enter/g) || []).length, 1, 'one way in');
  assert.match(APP, /film\.show\(roomRef\.current \|\| CLUB_DOOR\)/, 'the screen opens on the door');
  assert.match(APP, /const enter = \(\) => \{ setEntered\(true\); go\(CLUB_FIRST\); \};/);
  assert.match(APP, /clubRooms\(\)\.map\(\(r\) => \(\s*<button key=\{r\.id\} type="button" data-club-room=\{r\.id\} aria-pressed=\{snap\.id === r\.id\}/);
  // Picking a room, or stepping to one, stops the tour: the picture a member chose stays.
  assert.match(APP, /const pick = \(id\) => \{ stay\(\); go\(id\); \};/);
  assert.match(APP, /const step = \(n\) => \{ stay\(\); go\(nextClubView\(snap\.id, n\)\); \};/);
  assert.match(APP, /data-club-live-open onClick=\{\(\) => look\(true\)\}/);
  // The live room is what the Radio screen hands in, shown in place of the pictures, with a way back.
  assert.match(APP, /\{typeof renderLive === 'function' \? renderLive\(\) : null\}/);
  assert.match(APP, /onClick=\{\(\) => look\(false\)\}/);
  // The film is torn down while the live room has the stage, and rebuilt on the room left.
  assert.match(APP, /if \(live \|\| !hostRef\.current\) return undefined;/);
  assert.match(APP, /return \(\) => \{ window\.removeEventListener\('resize', fit\); film\.destroy\(\); filmRef\.current = null; \};/);
  // Tempo only from the station, and only while it plays.
  assert.match(APP, /const tempo = stationPlaying && bpm \? bpm : null;/);
  // Reduced motion is the member's setting, read once and given to the film.
  assert.match(APP, /reducedMotion: reduced/);
  // Coming back from the live room lands on the room that was on screen, picked or toured to.
  assert.match(APP, /if \(s\.status === 'shown'\) \{ setSeen\(true\); roomRef\.current = s\.id; \}/);
  assert.match(WEB, /if \(s\.status === "shown"\) \{ setSeen\(true\); roomRef\.current = s\.id; \}/);
});

test('on a phone the picture comes before the words, so the rooms sit above the tab bar', () => {
  const stage = APP.indexOf('data-club-stage');
  const intro = APP.indexOf("tr('radio:club.intro'");
  const rail = APP.indexOf('ref={railRef}');
  assert.ok(stage > 0 && rail > stage && intro > rail, 'title, picture, rooms, then the paragraph');
  assert.match(APP, /aspectRatio: '9 \/ 14', maxHeight: 'max\(58vh, 420px\)'/);
});

test('the door shows the club’s own picture and adds only the way in', () => {
  // The street picture carries the club's mark and its sign: a logo laid over it said the name a
  // third time, across the building.
  const door = APP.slice(APP.indexOf('{!entered && ('), APP.indexOf('{film && ('));
  assert.ok(!/<img\b/.test(door), 'the app’s door lays no logo over the picture');
  const webDoor = WEB.slice(WEB.indexOf('{mode === "door" && ('), WEB.indexOf('data-club-enter') + 400);
  assert.ok(!/<img\b/.test(webDoor), 'the website’s door lays no logo over the picture');
  assert.ok(!/RD_CLUB_MARK|bsClubMark/.test(WEB + APP));
});

// ── the app: the Radio screen's door ─────────────────────────────────────────
test('the Radio screen has one door to the club, and the booth is only what it hands the club', () => {
  assert.equal((APP_RADIO.match(/data-radio-club-door/g) || []).length, 1);
  assert.match(APP_RADIO, /import \{ BSClubShape, bsClubBase \} from '\.\/BSClubShape\.jsx';/);
  assert.match(APP_RADIO, /\{ key: 'club', on: false, label: tr\('radio:strip\.club', \{ defaultValue: 'Club Shape' \}\), go: \(\) => setShowClub\(true\) \}/);
  // The club stays open across the Radio screen's remounts (a tab away and back), as Sets does.
  assert.match(APP_RADIO, /let bsClubWanted = false;/);
  assert.match(APP_RADIO, /const setShowClub = \(v\) => \{ bsClubWanted = !!v; setShowClubState\(!!v\); \};/);
  const at = APP_RADIO.indexOf('if (showClub) return (');
  assert.ok(at > 0);
  const block = APP_RADIO.slice(at, APP_RADIO.indexOf('\n  );', at));
  // Back leaves the club, live room and all: the next visit starts at the door.
  assert.match(block, /<BSClubShape onBack=\{\(\) => \{ if \(noraOn\) toggleNora\(\); setShowClub\(false\); \}\} onSets=\{\(\) => setShowSets\(true\)\}/);
  assert.match(block, /stationPlaying=\{stationPlaying\}/);
  assert.match(block, /bpm=\{noraNow \? noraNow\.bpm : null\}/);
  assert.match(block, /live=\{noraOn\}/);
  assert.match(block, /renderLive=\{\(\) => \(\s*<BSNoraBooth /);
  // Shape Sets is checked first, so Back from Sets lands in the club it was opened from.
  assert.ok(APP_RADIO.indexOf('if (showSets) return') < at, 'Sets opens over the club');
  // The booth is mounted nowhere else on the Radio screen.
  assert.equal((APP_RADIO.match(/<BSNoraBooth /g) || []).length, 1);
});

// ── the website ──────────────────────────────────────────────────────────────
test('the Radio page has one Club Shape section, after the player, with Shape Sets inside it', () => {
  const page = fnSource(WEB, 'RadioPage');
  assert.equal((page.match(/<RadioClub \/>/g) || []).length, 1);
  assert.ok(page.indexOf('<RadioInstrument />') < page.indexOf('<RadioClub />'), 'the player first, then the club');
  assert.ok(!/<RadioNora|<RadioShapeSets|<RdWhatsOn/.test(page), 'the booth and Sets are the club’s, not loose blocks on the page');
  const club = fnSource(WEB, 'RadioClub');
  assert.equal((club.match(/<section id="club"/g) || []).length, 1);
  assert.equal((club.match(/<RdWhatsOn \/>/g) || []).length, 1);
  assert.match(fnSource(WEB, 'RdWhatsOn'), /<div id="sets"/);
  assert.ok(!/RadioShapeSets/.test(WEB), 'the old Sets card is gone');
  // The strip under the player links to both, by the ids above.
  assert.match(WEB_STRIP, /\[\["Live", null\], \["Club Shape", "#club"\], \["Shape Sets", "#sets"\]\]/);
});

test('the website’s club opens on the door, shows the module’s rooms, and keeps 3D behind one button', () => {
  const club = fnSource(WEB, 'RadioClub');
  assert.match(club, /const V = window\.ShapeClubViews;/);
  assert.match(WEB_HTML, /import \* as CV from "\/newdesign\/booth\/clubViews\.mjs\?v=[0-9a-f]{10}"; window\.ShapeClubViews = CV;/);
  assert.equal((club.match(/data-club-enter/g) || []).length, 1);
  assert.match(club, /data-club-room=\{r\.id\} aria-pressed=\{snap\.id === r\.id\}/);
  assert.match(club, /data-club-live-open onClick=\{\(\) => setMode\("live"\)\}/);
  assert.equal((club.match(/<RadioNora /g) || []).length, 1);
  assert.match(club, /<RadioNora onExit=\{\(\) => setMode\("film"\)\} \/>/);
  // A page whose module didn't load says so, and its door can't be pressed into nothing.
  assert.match(club, /The club couldn’t open on this page\. Reload to try again\./);
  assert.match(club, /data-club-enter onClick=\{enter\} disabled=\{!V\}/);
  // Reduced motion is the visitor's setting.
  assert.match(club, /reducedMotion: RD_REDUCED/);
});

test('the website says what the pictures are, and never calls them live or offers anything', () => {
  const club = fnSource(WEB, 'RadioClub').replace(/^\s*\/\/.*$/gm, '');
  assert.match(club, /The rooms and grounds are pictures of Club Shape, made with AI from its 3D room, Nora’s portrait and the club’s own pictures\. They are not a live feed, and nothing in them is for sale\./);
  // Text a visitor reads: string literals and JSX text. "LIVE" would be a claim about a still.
  const shown = [...club.matchAll(/"([^"\n]*)"|>([^<>{}\n]+)</g)].map((m) => m[1] || m[2] || '').filter((s) => /[A-Za-z]{3}/.test(s));
  for (const s of shown) {
    assert.ok(!/\bLIVE\b|\bon air\b/i.test(s) || /not a live feed|live 3D room|setMode|"live"/.test(s) || s === 'live', `nothing in the club claims to be live: ${s}`);
    assert.ok(!OFFER.test(s), `scenery, not an offer: ${s}`);
  }
  // The one line about what is playing is the station's own state, read off the page's player.
  assert.match(club, /window\.__shapeRadioState/);
  assert.match(club, /Shape Radio is playing/);
});

test('the header band and wall still the pictures replaced are gone, files and all', () => {
  for (const gone of ['public/nora-stage.webp', 'public/club-shape-bg.webp', 'prototypes/nora-booth/nora-wall-still.cjs', 'tests/nora-stage-header.test.mjs']) {
    assert.ok(!existsSync(path.join(ROOT, gone)), `${gone} went with the band`);
  }
  assert.ok(!/nora-stage\.webp|club-shape-bg\.webp|RD_NORA_STAGE|RD_CLUB_BG/.test(WEB + APP_RADIO + APP));
});
