// The coach's look in public (owner, 2026-11-11: "coaches should be able to customize how their page
// appears publicly. So the edits need to work. This should also effect the marketplace card as well").
// The kit's bsCoachPagePalette turns the paper and accent picked in Edit profile → Appearance (or the
// app's Make it yours) into the colours of the coach's page (coachProfileWeb.jsx) and their card on the
// Coaches page (marketplace.jsx). This file pins the colours themselves:
//   · no pick is null, and both surfaces keep the Climb: no paper, the dark stock, the role's own accent;
//   · every text colour reads (4.5:1) on every surface of the stock, on every paper, accent and role;
//   · the booking keeps the role's colour on every paper;
//   · the climb backgrounds are the editor's, and a key that is not one is no wash.
// The mounted page is in tests/web-coach-climb.test.mjs, the mounted card in tests/marketplace-page.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const K = await import('../public/newdesign/coachProfileKit.mjs');
const PAPERS = Object.keys(K.BS_COACH_PAPERS);
const ACCENTS = Object.keys(K.BS_COACH_ACCENTS);

test('no pick is null: no paper, the dark stock, and the role\'s own accent leave the Climb as it is', () => {
  for (const look of [null, undefined, {}, 'dark', [], { paper: 'dark' }, { paper: 'dark', accent: 'teal' }, { accent: 'teal' }, { paper: 'nope', accent: 'nope' }]) {
    assert.equal(K.bsCoachPagePalette(look, 'trainer'), null, JSON.stringify(look));
  }
  assert.equal(K.bsCoachPagePalette({ paper: 'dark', accent: 'amber' }, 'nutritionist'), null, 'amber is a nutritionist\'s own');
  // The other role's own accent is a pick.
  assert.ok(K.bsCoachPagePalette({ accent: 'amber' }, 'trainer'));
  assert.ok(K.bsCoachPagePalette({ accent: 'teal' }, 'nutritionist'));
});

test('a picked paper brings its stock; an accent alone keeps the Climb\'s dark ground', () => {
  const light = K.bsCoachPagePalette({ paper: 'light', accent: 'blue' }, 'trainer');
  assert.equal(light.isLight, true);
  assert.equal(light.paperKey, 'light');
  assert.equal(light.PAPER, K.BS_COACH_PAPERS.light.paper);
  assert.equal(light.BG, K.BS_COACH_PAPERS.light.paper, 'a light page\'s ground is its paper');
  assert.equal(light.INK, K.BS_COACH_PAPERS.light.ink);
  assert.equal(light.HEAD, light.INK, 'the strong text is the paper\'s ink, never white on cream');
  assert.equal(light.ACCENT, K.BS_COACH_ACCENTS.blue.light);
  const forest = K.bsCoachPagePalette({ paper: 'forest' }, 'trainer');
  assert.equal(forest.isLight, false);
  assert.equal(forest.PAPER, K.BS_COACH_PAPERS.forest.paper);
  assert.equal(forest.accentKey, null);
  const rose = K.bsCoachPagePalette({ accent: 'rose' }, 'trainer');
  assert.equal(rose.paperKey, null);
  assert.equal(rose.BG, K.BS_CLIMB_GROUND.BG);
  assert.equal(rose.PAPER, K.BS_CLIMB_GROUND.PAPER);
  assert.equal(rose.ACCENT, K.BS_COACH_ACCENTS.rose.dark);
  // A black accent on a dark paper is white, as the app's is.
  assert.equal(K.bsCoachPagePalette({ paper: 'midnight', accent: 'black' }, 'trainer').ACCENT, '#ffffff');
});

test('every text colour reads on every surface, on every paper, accent and role', () => {
  const bad = [];
  for (const role of ['trainer', 'nutritionist']) for (const paper of [...PAPERS, undefined]) for (const accent of [...ACCENTS, undefined]) {
    const p = K.bsCoachPagePalette({ paper, accent }, role);
    if (!p) continue;
    const grounds = [p.PAPER, p.PAPER2, p.BG, p.DEEP, p.DEEP2, p.DEEP3];
    for (const [name, c] of [['ACCENT', p.ACCENT], ['CTA_TEXT', p.CTA_TEXT], ['INK', p.INK], ['INK_SOFT', p.INK_SOFT], ['INK_MUTED', p.INK_MUTED], ['HEAD', p.HEAD]]) {
      const low = Math.min(...grounds.map((g) => K.bsContrast(c, g)));
      if (low < 4.5) bad.push(`${role} ${paper}/${accent} ${name} ${c} ${low.toFixed(2)}`);
    }
    // The accent on a dark plate over a photo (the card's badge, the summit's label).
    if (K.bsContrast(p.ACCENT_DARK, '#06090f') < 4.5) bad.push(`${role} ${paper}/${accent} ACCENT_DARK ${p.ACCENT_DARK}`);
    // The drawing shows on the ground.
    if (K.bsContrast(p.DRAW, p.BG) < 1.6) bad.push(`${role} ${paper}/${accent} DRAW ${p.DRAW}`);
    // White or near-black on the accent's fill, whichever reads.
    if (K.bsContrast(p.ON_ACCENT, p.ACCENT) < 4.5) bad.push(`${role} ${paper}/${accent} ON_ACCENT ${p.ON_ACCENT} on ${p.ACCENT}`);
  }
  assert.deepEqual(bad, []);
});

test('the booking keeps the role\'s colour on every paper, a darker step on a light one', () => {
  for (const paper of PAPERS) for (const accent of ACCENTS) {
    const tr = K.bsCoachPagePalette({ paper, accent }, 'trainer');
    if (tr) assert.equal(tr.CTA, tr.isLight ? '#a8331b' : '#c0533b', `${paper}/${accent}`);
    const nu = K.bsCoachPagePalette({ paper, accent }, 'nutritionist');
    if (nu) {
      assert.equal(nu.CTA, nu.isLight ? '#8a6420' : '#d8a23a', `${paper}/${accent}`);
      assert.equal(nu.ON_CTA, nu.isLight ? '#ffffff' : '#16110a');
    }
  }
});

test('the climb backgrounds are the editor\'s, and a key that is not one is no wash', () => {
  const src = readFileSync(join(ROOT, 'public/newdesign/livingDesktop.jsx'), 'utf8');
  const block = /const DK_CLIMB_BGS = \[([\s\S]*?)\n\];/.exec(src)[1];
  const editor = Object.fromEntries([...block.matchAll(/key: "(\w+)", label: "[^"]+", css: "([^"]+)"/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(editor, { ...K.BS_CLIMB_BGS }, 'the editor and the kit name the same washes');
  for (const [key, css] of Object.entries(K.BS_CLIMB_BGS)) assert.equal(K.bsClimbWash(key), css);
  for (const key of ['', 'Dusk', '__proto__', 'constructor', 'toString', null, undefined, 3, {}]) assert.equal(K.bsClimbWash(key), null, String(key));
});

test('a metallic paper keeps its sheen apart, for a surface that lays the paper as its own layers (Codex on #2706)', () => {
  const steel = K.bsCoachPagePalette({ paper: 'steel', accent: 'blue' }, 'trainer');
  assert.equal(steel.PAPER_SHEEN, K.BS_METAL_SHEEN);
  assert.equal(steel.PAPER_BG, `${K.BS_METAL_SHEEN}, ${steel.PAPER}`, 'the page\'s ground is the sheen over the paper');
  for (const paper of PAPERS.filter((p) => !K.BS_COACH_PAPERS[p].metallic && p !== 'dark')) {
    assert.equal(K.bsCoachPagePalette({ paper }, 'trainer').PAPER_SHEEN, null, paper);
  }
  assert.equal(K.bsCoachPagePalette({ accent: 'rose' }, 'trainer').PAPER_SHEEN, null, 'an accent alone has no paper');
});

test('bsReadableOn steps toward the ink until the colour reads on every ground it is given', () => {
  assert.equal(K.bsReadableOn('#1c4ed8', '#f5f0e6', '#0f0e0c'), '#1c4ed8', 'a colour that reads is kept');
  const stepped = K.bsReadableOn('#34d6c5', '#f5f0e6', '#0f0e0c');
  assert.notEqual(stepped, '#34d6c5');
  assert.ok(K.bsContrast(stepped, '#f5f0e6') >= 4.5);
  const both = K.bsReadableOn('#a8331b', ['#f5f0e6', '#c2a466'], '#221806');
  assert.ok(K.bsContrast(both, '#f5f0e6') >= 4.5 && K.bsContrast(both, '#c2a466') >= 4.5);
  assert.equal(K.bsContrast('nope', '#ffffff'), 1);
});
