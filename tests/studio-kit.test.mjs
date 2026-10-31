// The studio kit (mobile-app/src/services/studioKit.mjs): every piece draws, every starting
// layout is a valid stored studio, and the kit and the stored-type list never drift.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STUDIO_KIT, STUDIO_TEMPLATES, STUDIO_WORDS, STUDIO_ROOMS, STUDIO_COACH_KINDS, STUDIO_GROUPS,
  bsStudioSvg, bsStudioFromTemplate, bsStudioSpot, bsStudioDrawOrder, bsStudioTypesIn, bsStudioGroupOf,
} from '../mobile-app/src/services/studioKit.mjs';
import { BS_STUDIO_TYPES, BS_STUDIO_KINDS, BS_STUDIO_W, BS_STUDIO_H, bsProfileStudio, bsStudioItem } from '../mobile-app/src/services/profileCustom.mjs';

const decode = (uri) => decodeURIComponent(uri.replace('data:image/svg+xml,', ''));

test('the kit and the stored types are the same list', () => {
  assert.deepEqual(Object.keys(STUDIO_KIT).sort(), [...BS_STUDIO_TYPES].sort());
  for (const [t, [name, group, w, h]] of Object.entries(STUDIO_KIT)) {
    assert.ok(name && group, t);
    assert.ok(w >= 4 && w <= BS_STUDIO_W && h >= 4 && h <= BS_STUDIO_H, `${t} default size fits the plan`);
  }
});

test('every piece draws in both looks, upright and turned, with no NaN', () => {
  for (const t of BS_STUDIO_TYPES) {
    const [, , w, h] = STUDIO_KIT[t];
    for (const [W, H] of [[w, h], [h, w]]) {
      for (const opts of [{}, { light: true }, { accent: '#34d6c5' }, { line: true }, { line: true, light: true }]) {
        const svg = decode(bsStudioSvg(t, W, H, opts));
        assert.match(svg, /^<svg [^>]*width="\d+" height="\d+"/, t);
        assert.doesNotMatch(svg, /NaN|undefined/, `${t} ${W}×${H} ${JSON.stringify(opts)}`);
      }
    }
  }
});

test('a station takes the coach\'s accent; other pieces take the paper\'s ink', () => {
  assert.match(decode(bsStudioSvg('rack', 78, 46, { accent: '#a8331b' })), /rgba\(168,51,27,/);
  assert.doesNotMatch(decode(bsStudioSvg('rack', 78, 46, { ink: '26,22,14' })), /168,51,27/);
  assert.match(decode(bsStudioSvg('rack', 78, 46, { ink: '26,22,14', light: true })), /rgba\(26,22,14,0\.15\)/);
});

test('every starting layout is a valid stored studio, unchanged by the normalizer', () => {
  for (const kind of STUDIO_COACH_KINDS) {
    assert.ok(BS_STUDIO_KINDS.includes(kind), kind);
    assert.ok(STUDIO_ROOMS[kind], `${kind} has a room`);
    const items = bsStudioFromTemplate(kind);
    if (kind === 'blank') { assert.equal(items.length, 0); continue; }
    for (const p of items) assert.deepEqual(bsStudioItem(p), p, `${kind}: ${JSON.stringify(p)} survives the normalizer as it is`);
    const stored = bsProfileStudio({ kind, items });
    assert.equal(stored.items.length, items.length, kind);
    assert.ok(items.some((p) => p.st), `${kind} has stations`);
    for (const p of items) {
      const [sx, sy] = bsStudioSpot(p);
      assert.ok(sx >= 0 && sx <= BS_STUDIO_W && sy >= 0 && sy <= BS_STUDIO_H, `${kind}: a station number on the plan`);
    }
  }
});

test('layout words are all known, and a translator is used for every one', () => {
  for (const pieces of Object.values(STUDIO_TEMPLATES)) {
    for (const p of pieces) for (const k of [p.st, p.label, p.tag].filter(Boolean)) assert.ok(STUDIO_WORDS[k], k);
  }
  const seen = [];
  const items = bsStudioFromTemplate('gym', (k) => { seen.push(k); return 'T:' + k; });
  assert.ok(items.every((p) => !p.st || p.st.title.startsWith('T:')));
  assert.ok(items.every((p) => !p.st || p.st.note === ''), 'notes start empty: they are the coach\'s to write');
  assert.ok(seen.length > 5);
});

test('zones draw first; the groups list every coach piece once', () => {
  const items = [{ t: 'rack' }, { t: 'zone' }, { t: 'bench' }, { t: 'zone' }];
  assert.deepEqual(bsStudioDrawOrder(items).map((i) => items[i].t), ['zone', 'zone', 'rack', 'bench']);
  const listed = STUDIO_GROUPS.flatMap(([slug]) => bsStudioTypesIn(slug));
  assert.equal(new Set(listed).size, listed.length);
  for (const t of ['rack', 'dumbbells', 'treadmill', 'legpress', 'turf', 'reformer', 'ring', 'desk']) assert.ok(listed.includes(t), t);
  assert.equal(bsStudioGroupOf('counter'), 'kitchen', 'kitchen pieces are not in a coach group');
});

// Owner, 2026-10-31: "coaches should be able to add custom additional eqipment or kitchen stations".
test('a piece of the coach\'s own is stored with its name, cleaned, and drawn in every size', async () => {
  const { BS_STUDIO_OWN_SIZES } = await import('../mobile-app/src/services/studioKit.mjs');
  assert.ok(BS_STUDIO_TYPES.includes('custom'), 'a stored type');
  const it = bsStudioItem({ t: 'custom', x: 40, y: 50, w: 64, h: 40, label: '  Sandbag wall ' });
  assert.deepEqual(it, { t: 'custom', x: 40, y: 50, w: 64, h: 40, label: 'Sandbag wall' }, 'its name is its label, trimmed');
  assert.equal(bsStudioItem({ t: 'custom', x: 0, y: 0, w: 36, h: 36, label: 'x'.repeat(60) }).label.length <= 24, true, 'a name too long is cut to the label limit');
  assert.ok(bsStudioItem({ t: 'custom', x: 0, y: 0, w: 36, h: 36 }), 'a nameless one still draws (the page names it "Your own piece")');
  const st = bsProfileStudio({ kind: 'gym', where: '', items: [{ t: 'custom', x: 10, y: 10, w: 110, h: 64, label: 'Sled track', st: { title: 'Sled track', note: 'Push, then pull.' } }] });
  assert.equal(st.items[0].st.title, 'Sled track', 'and it can be a station');
  assert.deepEqual(BS_STUDIO_OWN_SIZES.map(([k]) => k), ['s', 'm', 'l']);
  for (const [, , w, h] of BS_STUDIO_OWN_SIZES) {
    assert.ok(w <= BS_STUDIO_W && h <= BS_STUDIO_H);
    for (const opts of [{}, { light: true }, { accent: '#34d6c5' }, { line: true }]) assert.doesNotMatch(decode(bsStudioSvg('custom', w, h, opts)), /NaN|undefined/);
  }
});
