// Nora's first hint on the member's Home (owner, 2026-10-29: "Users may not know that's how to get to Nora";
// option C, with the masthead's ✦ left a bare glyph). A teal note under the ✦ says who she is and what to ask
// her, once per device: it goes for good on Got it, or when Nora is opened by any door.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, THEME, drive, loadCarved } from './helpers/broadsheet-mount.mjs';

const DIR = join(ROOT, 'mobile-app/src/broadsheet');
const HINT = readFileSync(join(DIR, 'BSNoraHint.jsx'), 'utf8');
const CLIENT = readFileSync(join(DIR, 'iosAppBroadsheetClient.jsx'), 'utf8');
const mod = await loadCarved('BSNoraHint.jsx');

function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, m };
}

test('the device remembers the hint; storage it can\'t read counts as seen', () => {
  const s = memoryStorage();
  assert.equal(mod.bsNoraHintSeen(s), false);
  mod.bsMarkNoraHintSeen(s);
  assert.equal(s.m.get(mod.BS_NORA_HINT_KEY), '1');
  assert.equal(mod.bsNoraHintSeen(s), true);
  assert.equal(mod.bsNoraHintSeen(null), true, 'no storage: a note that could never be put away');
  assert.equal(mod.bsNoraHintSeen({ getItem() { throw new Error('blocked'); } }), true);
  assert.doesNotThrow(() => mod.bsMarkNoraHintSeen({ setItem() { throw new Error('full'); } }));
});

test('the note sits 8px under the ✦, its arrow under the ✦\'s centre', () => {
  // A 375px page with an 18px gutter; the ✦ is the 34px square at x 290..324, its bottom 70px down,
  // and the note hangs from a box 130px down: the note rises 52px, over the masthead's title.
  const place = mod.bsNoraHintPlace({ left: 290, width: 34, bottom: 70 }, { top: 130, right: 375 }, 18);
  assert.deepEqual(place, { top: -52, arrowRight: 375 - 18 - 307 - 6 });
  // The page's scroll moves both boxes alike, so the place doesn't change.
  assert.deepEqual(mod.bsNoraHintPlace({ left: 290, width: 34, bottom: -230 }, { top: -170, right: 375 }, 18), place);
  // An arrow never runs past the note's rounded corner.
  assert.equal(mod.bsNoraHintPlace({ left: 350, width: 34, bottom: 70 }, { top: 130, right: 375 }, 18).arrowRight, 10);
  assert.equal(mod.bsNoraHintPlace({ left: 0, width: 0, bottom: 0 }, { top: 0, right: 0 }, 18), null, 'a ✦ not laid out');
  assert.equal(mod.bsNoraHintPlace(null, { top: 0, right: 0 }, 18), null);
});

test('a new device sees the note until Got it, and never again', () => {
  const prev = globalThis.window;
  const storage = memoryStorage();
  globalThis.window = Object.assign(prev || {}, { localStorage: storage });
  try {
    const api = drive(mod.BSNoraHint, { t: THEME });
    assert.match(api.text, /Meet Nora\./);
    assert.match(api.text, /Tap ✦ any time to ask her about your plan, your food or the app\./);
    const note = api.nodes().find((n) => n.props && n.props.role === 'note');
    assert.equal(note.props.style.visibility, 'hidden', 'not shown before it has found the ✦');
    assert.equal(note.props.style.background, '#0a8f87', 'the light paper\'s teal');
    api.click('Got it');
    assert.equal(storage.m.get(mod.BS_NORA_HINT_KEY), '1');
    assert.equal(api.nodes().length, 0, 'gone once put away');
    assert.equal(drive(mod.BSNoraHint, { t: THEME }).nodes().length, 0, 'and on the next launch');
  } finally { globalThis.window = prev; }
});

test('opening Nora by any door puts the note away; it is placed by measuring the page\'s own ✦', () => {
  assert.match(HINT, /window\.addEventListener\('shape:openNora', close\)/);
  assert.match(HINT, /const close = React\.useCallback\(\(\) => \{\s*bsMarkNoraHintSeen\(deviceStorage\(\)\);\s*setShown\(false\);/);
  // The page's masthead ✦, inside the scroller; the pinned bar's sits outside it.
  assert.match(HINT, /box\.closest\('\.bs-scroll'\)/);
  assert.match(HINT, /scroller\.querySelector\('\[data-nora-corner\]'\)/);
  assert.match(CLIENT, /<button data-nora-corner onClick=/);
});

test('Home places the note right under its masthead', () => {
  const home = CLIENT.slice(CLIENT.indexOf('function BSClientHome('));
  const mast = home.indexOf('<BSMasthead');
  const hint = home.indexOf('<BSNoraHint t={t} />');
  const dateline = home.indexOf('{/* DATELINE');
  assert.ok(mast > 0 && hint > mast && hint < dateline, 'between the masthead and the dateline');
  assert.match(CLIENT, /^import \{ BSNoraHint \} from '\.\/BSNoraHint\.jsx';$/m);
});

test('the note\'s words are in all 13 languages, each naming the ✦', () => {
  const cats = join(ROOT, 'mobile-app/src/i18n/catalogs');
  const langs = readdirSync(cats);
  assert.equal(langs.length, 13);
  for (const l of langs) {
    const d = JSON.parse(readFileSync(join(cats, l, 'home.json'), 'utf8'));
    for (const k of ['noraHint.title', 'noraHint.body', 'noraHint.gotIt']) assert.ok(d[k], `${l} ${k}`);
    assert.ok(d['noraHint.body'].includes('✦'), `${l}: the body names the ✦`);
  }
});
