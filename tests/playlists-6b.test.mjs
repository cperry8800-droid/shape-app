// Coach review step 6b (2026-11-09): the coach Playlists page (trainerPlaylistsPage.jsx) as three
// tool views: Library, Attach and Builder. These mount the SHIPPED page in jsdom with the real
// sample playlists (trainerPlaylists.jsx / nutritionistPlaylists.jsx), the real tier marks
// (dashToday.jsx), the real program tags (dashBuilderCore.js) and the real tier module, over a
// stubbed fetch and roster, and read what a coach reads:
//   1. the sample playlists only in the signed-out preview (401), under the band; a signed-in read
//      that failed says so and shows nothing in their place;
//   2. a card says only what its row holds: no made-up counts, no ▶, no listen counts;
//   3. who hears it: program days and their clients, and an unread client count never 0;
//   4. the brief and the days with no music, raised and flagged;
//   5. the Attach writes: a program day set in every week, held to the revision read; a send with
//      the entry members read, reverted when it fails; one write per program at a time;
//   6. the roster for sends only when read live, each name with its tier mark;
//   7. the Builder: one Save, Delete through ShapeConfirm;
//   8. a playlist's sample tracks listed once each, with the real count said;
//   9. the pure helpers.
// Compares booleans and strings, never DOM nodes (tests/assert-dom-value.test.mjs).
import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const ND = (f) => fileURLToPath(new URL('../public/newdesign/' + f, import.meta.url));
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/newdesign/TrainerApp.html#playlists', pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, Event: dom.window.Event, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
const React = require_('react');
globalThis.React = React;
const { createRoot } = require_('react-dom/client');
const DashSignals = require_('../public/newdesign/dashSignals.js');
const DashBuilder = require_('../public/newdesign/dashBuilderCore.js');
const ShapeZone = await import('../public/newdesign/shapeZone.mjs');
const ShapeClientColors = await import('../public/newdesign/clientColors.mjs');
const U = await import('../public/newdesign/unitText.mjs');
Object.assign(window, { ShapeZone, ShapeClientColors, DashBuilder });
Object.assign(globalThis, {
  DashSignals, serif: 'serif', sans: 'sans-serif', mono: 'monospace', INK: '#f2ede4', TEAL: '#0ac5a8', TEAL_BRIGHT: '#2ee0c4', PAPER: '#1a1612', ink50: 'rgba(0,0,0,.5)',
  ssAlpha: (c, a) => 'rgba(0,0,0,' + a + ')',
});

const { loadRealModule } = await import('./helpers/load-real-module.mjs');
const share = (mod) => {
  for (const [k, v] of Object.entries(mod)) globalThis[k] = v;
  for (const k of Object.keys(window)) if (!(k in globalThis)) { try { globalThis[k] = window[k]; } catch (e) { /* read-only */ } }
};
// dashData.jsx before dashToday.jsx, as the pages load them.
share(await loadRealModule(ND('dashData.jsx'), { registry: new Map([['/newdesign/unitText.mjs', U]]), appendExports: 'export { useSignedIn };' }));
share(await loadRealModule(ND('dashToday.jsx'), { appendExports: 'export { DashClientGem, dashRecordTier, dashTierMark };' }));
share(await loadRealModule(ND('trainerPlaylists.jsx'), { appendExports: 'export { TRAINER_PLAYLISTS, TRAINER_WORKOUTS, ProviderMark };' }));
share(await loadRealModule(ND('nutritionistPlaylists.jsx'), { appendExports: 'export { NUTRI_PLAYLISTS, NUTRI_ATTACH_TARGETS };' }));
Object.assign(globalThis, {
  DashPage: ({ title, eyebrow, actions, children }) => React.createElement('main', null, React.createElement('p', { 'data-eyebrow': '' }, eyebrow), React.createElement('h1', null, title), React.createElement('nav', { 'data-actions': '' }, actions), children),
  DashDemoBand: () => React.createElement('b', { 'data-band': '' }, 'PREVIEW'),
  Card: ({ style, children }) => React.createElement('div', { style }, children),
});
const P = await loadRealModule(ND('trainerPlaylistsPage.jsx'), {
  appendExports: 'export { PlaylistPage, plDupNames, plClearPlaylist, plDaySlots, plSetDayPlaylist, plDayHas, plMusicCoverage, plProgramsModel, plProgramDays, plWhoHears, plWhoHearsText, plToggleSent, plRosterFrom, plTrackListNote, soundtrackToWeb };',
});
const { TRAINER_PLAYLISTS, TRAINER_WORKOUTS, NUTRI_PLAYLISTS, NUTRI_ATTACH_TARGETS } = globalThis;
// window.confirm is never the delete gate.
window.confirm = () => { throw new Error('window.confirm used'); };

// ── Fixtures ──────────────────────────────────────────────────────────────────
const id = (n) => '0f8fad5b-d9cb-469f-a165-70867728950' + n;
const ADA = { profile: { id: id(1), name: 'Ada L.' }, rankPoints: 5180 };
const BEN = { profile: { id: id(2), name: 'Ben K.' }, rankPoints: null };
const SAMPLE_CLIENTS = ['Sample Sam', 'Demo Dana'];
const LEG = { id: 'st-1', name: 'Leg Day', provider: 'spotify', tag: 'Heavy', url: 'https://open.spotify.com/playlist/leg', tracks: 24, duration: '1h 30m', bpm: '120–140', attached: [], role: null };
const QUIET = { id: 'st-2', name: 'Quiet', provider: 'apple', tag: '', url: '', tracks: 0, duration: '—', bpm: '—', attached: [], role: null };
const day = (dayId, name, playlist) => ({ id: dayId, name, playlist: playlist || null, blocks: [] });
// "Strength Block": two weeks of Lower (Leg Day every week) and Upper (no music). "Unused": nobody on it.
const STRENGTH = () => ({ id: 'p1', kind: 'program', name: 'Strength Block', detail: { revision: 3, builder: { tags: ['strength'], weeks: [0, 1].map(() => ({ days: [day('d-lo', 'Lower', { name: 'Leg Day', meta: '24 tracks' }), day('d-up', 'Upper', null)] })) } } });
const UNUSED = () => ({ id: 'p2', kind: 'program', name: 'Unused', detail: { revision: 1, builder: { tags: [], weeks: [{ days: [day('d-x', 'Solo', null)] }] } } });
const ok = (body) => ({ status: 200, body });

// The fetch router: each test hands its own handlers; every request is logged.
function makeFetch(handlers) {
  const log = [];
  const fetch = async (url, opts = {}) => {
    const method = (opts.method || 'GET').toUpperCase();
    const body = opts.body ? JSON.parse(opts.body) : null;
    log.push({ method, url, body });
    const h = handlers[method + ' ' + url.split('?')[0]];
    const out = h ? await h({ url, body, log }) : { status: 404, body: {} };
    if (out === 'throw') throw new TypeError('Failed to fetch');
    return { status: out.status, ok: out.status >= 200 && out.status < 300, json: async () => JSON.parse(JSON.stringify(out.body)) };
  };
  return { fetch, log };
}
function trainerLive(over = {}) {
  return {
    'GET /api/coach/soundtracks': () => ok({ soundtracks: [LEG, QUIET] }),
    'GET /api/coach/plans': () => ok({ plans: [STRENGTH(), UNUSED()] }),
    'GET /api/coach/plans/usage': () => ok({ usage: { p1: { clients: 4 } }, capped: false }),
    'PATCH /api/coach/plans': ({ body }) => ok({ plan: { ...STRENGTH(), detail: { ...body.detail, revision: body.expectedRevision + 1 } } }),
    'PATCH /api/coach/soundtracks': ({ body }) => ok({ soundtrack: { ...[LEG, QUIET].find((r) => r.id === body.id), ...body } }),
    'DELETE /api/coach/soundtracks': () => ok({ ok: true }),
    ...over,
  };
}
const liveRoster = (clients = [ADA, BEN]) => ({ loading: false, source: 'live', clients });
const TRAINER_CTX = { role: 'trainer', playlists: TRAINER_PLAYLISTS, attachTargets: TRAINER_WORKOUTS, navItems: () => [], payoutCard: null };
const NUTRI_CTX = { role: 'nutritionist', playlists: NUTRI_PLAYLISTS, attachTargets: NUTRI_ATTACH_TARGETS, navItems: () => [], payoutCard: null };

const roots = new Set();
afterEach(async () => { for (const close of [...roots]) { try { await close(); } catch (e) { /* gone */ } } delete window.ShapeConfirm; });
after(() => { dom.window.close(); });
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await React.act(async () => { await new Promise((r) => setTimeout(r, 2)); }); };
async function page({ role = 'trainer', handlers = trainerLive(), dash = liveRoster(), ctx } = {}) {
  localStorage.clear();
  const net = makeFetch(handlers);
  globalThis.fetch = net.fetch;
  globalThis.useDashboard = () => dash;
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  const close = async () => { roots.delete(close); await React.act(async () => root.unmount()); div.remove(); };
  roots.add(close);
  await React.act(async () => root.render(React.createElement(P.PlaylistPage, { ctx: ctx || (role === 'nutritionist' ? NUTRI_CTX : TRAINER_CTX) })));
  await settle();
  const q = (sel) => div.querySelector(sel);
  const all = (sel) => [...div.querySelectorAll(sel)];
  const text = (el) => {
    if (!el) return '';
    const out = [], walk = document.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) out.push(n.nodeValue);
    return out.join(' ').replace(/\s+/g, ' ').trim();
  };
  const click = async (el) => { await React.act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); await settle(); };
  const type = async (el, value) => React.act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, value);
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  return {
    div, q, all, text, click, type, close, log: net.log,
    page: () => text(div),
    tab: (t) => click(q(`[data-pl-tab="${t}"]`)),
    card: (cid) => q(`[data-pl-card="${cid}"]`),
    cell: (key) => q(`[data-pl-cell="${key}"]`),
    on: (key) => (q(`[data-pl-cell="${key}"]`) ? q(`[data-pl-cell="${key}"]`).getAttribute('data-on') : null),
    reqs: (method, path) => net.log.filter((r) => r.method === method && r.url.split('?')[0] === path),
  };
}
const NO_PLAY = (p, where) => {
  assert.equal(p.page().includes('▶'), false, 'no ▶ ' + where);
  assert.equal(/listens?\b/i.test(p.page()), false, 'no listen count ' + where);
};

// ── 1. Signed out, signed in, and a read that failed ─────────────────────────
for (const role of ['trainer', 'nutritionist']) {
  const SAMPLE = (role === 'trainer' ? TRAINER_PLAYLISTS : NUTRI_PLAYLISTS).map((s) => s.name);
  test(`${role}: the sample playlists only signed out (401), under the band`, async () => {
    const p = await page({ role, handlers: { 'GET /api/coach/soundtracks': () => ({ status: 401, body: {} }) }, dash: { loading: false, source: 'demo', clients: [] } });
    assert.equal(!!p.q('[data-band]'), true);
    assert.equal(p.all('[data-pl-card]').length, SAMPLE.length);
    assert.equal(SAMPLE.every((n) => p.page().includes(n)), true);
    assert.equal(p.reqs('GET', '/api/coach/plans').length + p.reqs('GET', '/api/coach/plans/usage').length, 0, 'no programs read for a signed-out preview');
    NO_PLAY(p, 'in the preview library');
    await p.tab('matrix'); NO_PLAY(p, 'in the preview Attach');
    await p.tab('builder'); NO_PLAY(p, 'in the preview Builder');
  });
  for (const [label, h] of [['a 500', () => ({ status: 500, body: { error: 'x' } })], ['a network error', () => 'throw'], ['a body without soundtracks', () => ok({ rows: [] })]]) {
    test(`${role}: signed in with ${label}, "couldn't be read" and no sample playlists`, async () => {
      const p = await page({ role, handlers: { 'GET /api/coach/soundtracks': h } });
      assert.equal(p.text(p.q('[data-pl-state="unread"]')), "Your playlists couldn't be read.");
      assert.equal(SAMPLE.some((n) => p.page().includes(n)), false, 'no sample names');
      assert.equal(!!p.q('[data-band]'), false, 'no demo band');
      assert.equal(p.all('[data-pl-card]').length, 0);
      assert.equal(p.reqs('GET', '/api/coach/plans').length, 0, 'no programs read while unread');
      assert.equal(p.text(p.q('[data-eyebrow]')), "PLAYLISTS · COULDN'T BE READ");
    });
  }
}

test('Try again reads the playlists again', async () => {
  let fail = true;
  const p = await page({ handlers: trainerLive({ 'GET /api/coach/soundtracks': () => (fail ? { status: 500, body: {} } : ok({ soundtracks: [LEG] })) }) });
  assert.equal(!!p.q('[data-pl-state="unread"]'), true);
  fail = false;
  await p.click([...p.div.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Try again'));
  assert.equal(!!p.q('[data-pl-state="unread"]'), false);
  assert.equal(!!p.card('st-1'), true);
});

// ── 2. Live cards: only what the rows hold ───────────────────────────────────
test('live cards show the row\'s tracks, length and tempo, and nothing made up', async () => {
  const p = await page();
  assert.equal(!!p.q('[data-band]'), false);
  assert.equal(p.all('[data-pl-card]').length, 2);
  assert.equal(p.text(p.card('st-1').querySelector('[data-pl-facts]')), '24 tracks · 1h 30m · 120–140 BPM');
  assert.equal(p.text(p.card('st-2').querySelector('[data-pl-facts]')), 'Open it to add tracks, length and tempo');
  assert.equal(/\b0 tracks|—/.test(p.text(p.card('st-2'))), false, 'no 0 tracks and no dash for a row that holds none');
  assert.equal(p.text(p.card('st-2')).includes('On Apple Music'), true);
  assert.equal(TRAINER_PLAYLISTS.some((s) => p.page().includes(s.name)), false);
  NO_PLAY(p, 'in the library');
  await p.tab('matrix'); NO_PLAY(p, 'in Attach');
  await p.tab('builder'); NO_PLAY(p, 'in the Builder');
  assert.equal(p.text(p.q('[data-pl-stat="tracks"]')), '24');
  await p.click(p.q('[data-pl-pick="st-2"]'));
  assert.deepEqual(['tracks', 'length', 'tempo'].map((k) => p.text(p.q(`[data-pl-stat="${k}"]`))), ['—', '—', '—'], 'what the row lacks is a dash, never 0');
});

test('nutritionist: live cards and no program reads', async () => {
  const p = await page({ role: 'nutritionist', handlers: trainerLive({ 'GET /api/coach/soundtracks': () => ok({ soundtracks: [{ ...LEG, attached: [{ id: 'client:' + id(1), kind: 'client', clientId: id(1), name: 'Ada L.' }] }, QUIET] }) }) });
  assert.equal(p.text(p.card('st-1').querySelector('[data-pl-facts]')), '24 tracks · 1h 30m · 120–140 BPM');
  assert.equal(p.text(p.card('st-1').querySelector('[data-pl-who]')), 'Sent to 1 client');
  assert.equal(p.text(p.card('st-2').querySelector('[data-pl-who]')), 'Not playing anywhere yet');
  assert.equal(p.reqs('GET', '/api/coach/plans').length + p.reqs('GET', '/api/coach/plans/usage').length, 0);
  assert.equal(NUTRI_PLAYLISTS.some((s) => p.page().includes(s.name)), false);
  NO_PLAY(p, 'in the nutritionist library');
});

// ── 3. Who hears it ──────────────────────────────────────────────────────────
test('who hears it: the program days a playlist plays on and the clients on them', async () => {
  const p = await page();
  assert.equal(p.text(p.card('st-1').querySelector('[data-pl-who]')), '1 program day · 4 clients');
  assert.equal(p.text(p.card('st-2').querySelector('[data-pl-who]')), 'Not playing anywhere yet');
  assert.match(p.reqs('GET', '/api/coach/plans/usage')[0].url, /\?today=\d{4}-\d{2}-\d{2}$/);
  assert.equal(p.reqs('GET', '/api/coach/plans')[0].url, '/api/coach/plans?kind=program');
  await p.tab('matrix');
  const head = p.text(p.q('[data-pl-program="p1"] th'));
  assert.equal(head.includes('4 clients') && head.includes('Strength'), true, head);
  assert.equal(p.text(p.q('[data-pl-program="p2"] th')).includes('0 clients'), true, 'a measured nobody is 0');
  assert.equal(p.text(p.q('[data-pl-program="p2"] th')).includes('No type'), true);
});

test('who hears it with the usage unread: no client count, never 0', async () => {
  for (const usage of [() => ({ status: 500, body: {} }), () => 'throw']) {
    const p = await page({ handlers: trainerLive({ 'GET /api/coach/plans/usage': usage }) });
    assert.equal(p.text(p.card('st-1').querySelector('[data-pl-who]')), '1 program day');
    assert.equal(/\b0 clients?\b/.test(p.page()), false);
    // The brief counts every program's days when nobody's program could be read.
    assert.equal(p.text(p.q('[data-pl-brief-text]')), '1 of 3 program days have music.');
    assert.equal(p.text(p.q('[data-pl-raised]')).includes('(') , false, 'no client count on the raised day');
    await p.tab('matrix');
    for (const pid of ['p1', 'p2']) assert.equal(p.text(p.q(`[data-pl-program="${pid}"] th`)).includes("clients couldn't be read"), true);
    assert.equal(/\b0 clients?\b/.test(p.page()), false);
    assert.equal(p.q('[data-pl-day="p2:0"]').getAttribute('data-needs'), '1', 'unread is not nobody: the day still needs music');
    await p.close();
  }
});

test('the programs unread: said in the brief and in Attach', async () => {
  const p = await page({ handlers: trainerLive({ 'GET /api/coach/plans': () => ({ status: 500, body: {} }) }) });
  assert.equal(p.text(p.q('[data-pl-brief-text]')), "Your programs couldn't be read, so this page can't say which days have music.");
  await p.tab('matrix');
  assert.equal(!!p.q('[data-pl-programs-unread]'), true);
});

// ── 4. The brief ─────────────────────────────────────────────────────────────
test('trainer brief: days with music out of the days clients are on, and the one missing raised', async () => {
  const p = await page();
  assert.equal(p.text(p.q('[data-pl-brief-text]')), '1 of 2 program days your clients are on have music.');
  assert.equal(p.text(p.q('[data-pl-raised]')), 'No music Strength Block · Upper has no music (4 clients).');
  assert.equal(p.text(p.q('[data-pl-tab-flag]')), '1 no music');
  await p.click(p.q('[data-pl-brief-action]'));
  assert.equal(p.q('[data-pl-tab="matrix"]').getAttribute('aria-selected'), 'true', 'Attach opens');
  const up = p.q('[data-pl-day="p1:1"]');
  assert.equal(up.getAttribute('data-needs'), '1');
  assert.equal(p.text(up.querySelector('[data-pl-no-music]')), 'No music · 4 clients');
  assert.equal(p.q('[data-pl-day="p1:0"]').getAttribute('data-needs'), '0');
  assert.equal(p.q('[data-pl-day="p2:0"]').getAttribute('data-needs'), '0', 'a program nobody is on needs nothing');
  assert.equal(!!p.q('[data-pl-day="p2:0"] [data-pl-no-music]'), false);
  assert.equal(p.on('p1:0:st-1'), '1');
  assert.equal(p.text(p.cell('p1:0:st-1')), '✓ 4');
});

test('nutritionist brief: clients who get a cooking playlist, and an unread roster said', async () => {
  const rows = () => ok({ soundtracks: [{ ...LEG, attached: [{ id: 'client:' + id(1), kind: 'client', clientId: id(1), name: 'Ada L.' }] }, QUIET] });
  const p = await page({ role: 'nutritionist', handlers: trainerLive({ 'GET /api/coach/soundtracks': rows }) });
  assert.equal(p.text(p.q('[data-pl-brief-text]')), '1 of 2 clients get a cooking playlist.');
  assert.equal(p.text(p.q('[data-pl-brief-action]')), 'Send to clients');
  assert.equal(!!p.q('[data-pl-tab-flag]'), false);
  await p.close();
  const u = await page({ role: 'nutritionist', handlers: trainerLive({ 'GET /api/coach/soundtracks': rows }), dash: { loading: false, source: 'demo', clients: [] } });
  assert.equal(u.text(u.q('[data-pl-brief-text]')), "Your clients couldn't be read, so this page can't say who gets a playlist.");
  await u.close();
  const all = await page({ role: 'nutritionist', handlers: trainerLive({ 'GET /api/coach/soundtracks': () => ok({ soundtracks: [{ ...LEG, attached: [{ id: 'all_clients', kind: 'all_clients', name: 'All my clients' }] }] }) }) });
  assert.equal(all.text(all.q('[data-pl-brief-text]')), 'Every client gets a cooking playlist on their Eat page.');
});

// ── 5. Attach writes ─────────────────────────────────────────────────────────
test('a program-day cell writes the day in every week, held to the revision read', async () => {
  const p = await page();
  await p.tab('matrix');
  assert.equal(p.on('p1:1:st-1'), '0');
  await p.click(p.cell('p1:1:st-1'));
  const w = p.reqs('PATCH', '/api/coach/plans');
  assert.equal(w.length, 1);
  assert.equal(w[0].body.id, 'p1');
  assert.equal(w[0].body.expectedRevision, 3);
  const weeks = w[0].body.detail.builder.weeks;
  assert.equal(weeks.length, 2);
  for (const wk of weeks) {
    assert.deepEqual(wk.days[1].playlist, { id: 'st-1', name: 'Leg Day', meta: '24 tracks' }, 'every week, by id');
    assert.deepEqual(wk.days[0].playlist, { name: 'Leg Day', meta: '24 tracks' }, 'the other day kept');
  }
  assert.deepEqual(w[0].body.detail.builder.tags, ['strength'], 'the rest of the program kept');
  assert.equal(p.on('p1:1:st-1'), '1');
  assert.equal(p.q('[data-pl-day="p1:1"]').getAttribute('data-needs'), '0');
  // Taking it off clears every week too, held to the new revision.
  await p.click(p.cell('p1:1:st-1'));
  const w2 = p.reqs('PATCH', '/api/coach/plans');
  assert.equal(w2.length, 2);
  assert.equal(w2[1].body.expectedRevision, 4);
  assert.deepEqual(w2[1].body.detail.builder.weeks.map((wk) => wk.days[1].playlist), [null, null]);
});

test('a program changed elsewhere (409) is named, and the cell stays as it was', async () => {
  const p = await page({ handlers: trainerLive({ 'PATCH /api/coach/plans': () => ({ status: 409, body: { error: 'stale' } }) }) });
  await p.tab('matrix');
  await p.click(p.cell('p1:1:st-2'));
  assert.equal(p.reqs('PATCH', '/api/coach/plans').length, 1);
  assert.equal(p.text(p.q('[data-pl-note]')).includes('“Strength Block” changed somewhere else'), true, p.text(p.q('[data-pl-note]')));
  assert.equal(p.on('p1:1:st-2'), '0');
});

test('one write per program at a time: a second day of the same program waits', async () => {
  let release;
  const held = new Promise((r) => { release = r; });
  const base = trainerLive();
  const p = await page({ handlers: { ...base, 'PATCH /api/coach/plans': async (a) => { await held; return base['PATCH /api/coach/plans'](a); } } });
  await p.tab('matrix');
  await p.click(p.cell('p1:1:st-1'));
  assert.equal(p.cell('p1:0:st-2').disabled, true, 'the program\'s other cells wait');
  await p.click(p.cell('p1:0:st-2'));
  assert.equal(p.reqs('PATCH', '/api/coach/plans').length, 1, 'one PATCH until the first resolves');
  assert.equal(p.cell('p2:0:st-1').disabled, false, 'another program is free');
  release();
  await settle();
  assert.equal(p.cell('p1:0:st-2').disabled, false);
  await p.click(p.cell('p1:0:st-2'));
  const w = p.reqs('PATCH', '/api/coach/plans');
  assert.equal(w.length, 2);
  assert.equal(w[1].body.expectedRevision, 4, 'the second write is held to the revision the first left');
  assert.deepEqual(w[1].body.detail.builder.weeks[0].days[1].playlist, { id: 'st-1', name: 'Leg Day', meta: '24 tracks' }, 'and keeps the first write');
});

test('a send cell writes the entry members read, and leaves the row\'s role alone', async () => {
  for (const role of ['trainer', 'nutritionist']) {
    const rows = () => ok({ soundtracks: [LEG, QUIET].map((r) => ({ ...r, role })) });
    const p = await page({ role, handlers: trainerLive({ 'GET /api/coach/soundtracks': rows }) });
    await p.tab('matrix');
    await p.click(p.cell('all:st-1'));
    let w = p.reqs('PATCH', '/api/coach/soundtracks');
    assert.equal(w.length, 1);
    // No role: an edit never re-stamps the row's own role (Codex P2 on #2644).
    assert.deepEqual(w[0].body, { id: 'st-1', attached: [{ id: 'all_clients', kind: 'all_clients', name: 'All my clients' }] });
    assert.equal(p.on('all:st-1'), '1');
    // A second send, after the first landed, keeps both entries.
    await p.click(p.cell(id(1) + ':st-1'));
    w = p.reqs('PATCH', '/api/coach/soundtracks');
    assert.equal(w.length, 2);
    assert.deepEqual(w[1].body.attached, [{ id: 'all_clients', kind: 'all_clients', name: 'All my clients' }, { id: 'client:' + id(1), kind: 'client', clientId: id(1), name: 'Ada L.' }]);
    assert.equal(p.on(id(1) + ':st-1'), '1');
    assert.equal(p.on(id(2) + ':st-1'), '0');
    // Stopping a send takes only that entry off.
    await p.click(p.cell('all:st-1'));
    w = p.reqs('PATCH', '/api/coach/soundtracks');
    assert.deepEqual(w[2].body.attached, [{ id: 'client:' + id(1), kind: 'client', clientId: id(1), name: 'Ada L.' }]);
    await p.close();
  }
});

test('a send that fails reverts the cell and says so', async () => {
  for (const fail of [() => ({ status: 500, body: { error: 'Couldn\'t save that send.' } }), () => 'throw']) {
    const p = await page({ handlers: trainerLive({ 'PATCH /api/coach/soundtracks': fail }) });
    await p.tab('matrix');
    await p.click(p.cell(id(1) + ':st-1'));
    assert.equal(p.reqs('PATCH', '/api/coach/soundtracks').length, 1);
    assert.equal(p.on(id(1) + ':st-1'), '0', 'reverted');
    assert.equal(/Couldn't save/.test(p.text(p.q('[data-pl-note]'))), true);
    await p.click(p.q('[data-pl-tab="library"]'));
    assert.equal(p.text(p.card('st-1').querySelector('[data-pl-who]')), '1 program day · 4 clients', 'no send claimed');
    await p.close();
  }
});

// ── 6. The roster ────────────────────────────────────────────────────────────
for (const role of ['trainer', 'nutritionist']) {
  test(`${role}: the roster lists clients read live, each with a tier mark`, async () => {
    const p = await page({ role });
    await p.tab('matrix');
    const ada = p.q(`[data-pl-send="${id(1)}"]`), ben = p.q(`[data-pl-send="${id(2)}"]`);
    assert.equal(p.text(ada).startsWith('Ada L.'), true);
    const mark = ada.querySelector('.sh-tier-mark');
    assert.equal(!!mark && mark.getAttribute('data-tier') === ShapeClientColors.clientTier(5180).key, true);
    assert.equal(!!ben.querySelector('[data-tier-unknown]') && !ben.querySelector('.sh-tier-mark'), true, 'an unknown tier is hollow');
    assert.equal(!!p.q('[data-pl-roster-unread]'), false);
  });
  for (const source of ['demo', 'error', undefined]) {
    test(`${role}: a signed-in coach's roster with source ${source} couldn't be read, and no sample clients`, async () => {
      const p = await page({ role, dash: { loading: false, source, clients: SAMPLE_CLIENTS.map((name, i) => ({ profile: { id: id(7 + i), name }, rankPoints: 100 })) } });
      await p.tab('matrix');
      assert.equal(p.text(p.q('[data-pl-roster-unread]')), "Your clients couldn't be read, so one-by-one sends aren't shown.");
      assert.equal(SAMPLE_CLIENTS.some((n) => p.page().includes(n)), false);
      assert.equal(p.all('[data-pl-send]').map((r) => r.getAttribute('data-pl-send')).join(','), 'all', 'only Every client');
    });
  }
}

test('the signed-out preview lists the sample roster useDashboard gives it', async () => {
  const p = await page({ handlers: { 'GET /api/coach/soundtracks': () => ({ status: 401, body: {} }) }, dash: { loading: false, source: 'demo', clients: [{ profile: { id: 'demo-1', name: 'Sample Sam' }, rankPoints: 100 }] } });
  await p.tab('matrix');
  assert.equal(!!p.q('[data-pl-send="demo-1"]'), true);
  // A preview send stays on the page.
  await p.click(p.cell('demo-1:pl-heavy'));
  assert.equal(p.on('demo-1:pl-heavy'), '1');
  assert.equal(p.log.filter((r) => r.method !== 'GET').length, 0, 'the preview writes nothing');
});

// ── 7. The Builder ───────────────────────────────────────────────────────────
test('Builder: Save waits for a change, then sends the edited fields', async () => {
  const p = await page();
  await p.tab('builder');
  const save = () => p.q('[data-pl-save]');
  assert.equal(save().disabled, true, 'nothing changed');
  const inputs = () => [...p.q('[data-pl-builder="st-1"]').querySelectorAll('input')];
  assert.deepEqual(inputs().map((i) => i.value), ['Leg Day', '120–140', '1h 30m', 'Heavy', 'https://open.spotify.com/playlist/leg']);
  assert.equal(!!p.q('[data-pl-rename-note]'), false);
  await p.type(inputs()[0], 'Leg Day II');
  assert.equal(save().disabled, false);
  assert.equal(p.q('[data-pl-rename-note]').textContent, '1 program day shows it as “Leg Day” and keeps that name until you attach it again.');
  await p.type(inputs()[1], '130');
  await p.type(inputs()[2], '1h 10m');
  await p.type(inputs()[3], 'Go hard');
  await p.type(inputs()[4], 'https://open.spotify.com/playlist/leg2');
  await p.click(save());
  const w = p.reqs('PATCH', '/api/coach/soundtracks');
  assert.equal(w.length, 1);
  assert.deepEqual(w[0].body, { id: 'st-1', name: 'Leg Day II', bpm: '130', duration: '1h 10m', tag: 'Go hard', url: 'https://open.spotify.com/playlist/leg2' });
  assert.equal(p.text(p.q('[data-pl-save-msg]')), 'Saved.');
  assert.equal(save().disabled, true, 'saved: nothing left to save');
  // A field changed back is no change.
  await p.type(inputs()[1], '131');
  assert.equal(save().disabled, false);
  await p.type(inputs()[1], '130');
  assert.equal(save().disabled, true);
});

test('Builder: a failed save says so', async () => {
  const p = await page({ handlers: trainerLive({ 'PATCH /api/coach/soundtracks': () => ({ status: 500, body: { error: 'Nope, try again.' } }) }) });
  await p.tab('builder');
  await p.type(p.q('[data-pl-builder="st-1"] input'), 'Other');
  await p.click(p.q('[data-pl-save]'));
  assert.equal(p.text(p.q('[data-pl-save-msg]')), 'Nope, try again.');
});

test('Builder: Delete goes through ShapeConfirm, never window.confirm', async () => {
  const asked = [];
  let answer = false;
  window.ShapeConfirm = { open: async (o) => { asked.push(o); return answer; } };
  const p = await page();
  await p.tab('builder');
  await p.click(p.q('[data-pl-more]'));
  await p.click(p.q('[data-pl-delete]'));
  assert.equal(asked.length, 1);
  assert.equal(asked[0].name, 'Leg Day');
  assert.equal(p.reqs('DELETE', '/api/coach/soundtracks').length, 0, 'cancelled: nothing deleted');
  assert.equal(!!p.q('[data-pl-pick="st-1"]'), true);
  answer = true;
  await p.click(p.q('[data-pl-more]'));
  await p.click(p.q('[data-pl-delete]'));
  const d = p.reqs('DELETE', '/api/coach/soundtracks');
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].body, { id: 'st-1' });
  assert.equal(!!p.q('[data-pl-pick="st-1"]'), false, 'the playlist is gone');
  assert.equal(!!p.q('[data-pl-builder="st-2"]'), true, 'on to the next one');
  await p.tab('library');
  assert.equal(!!p.card('st-1'), false);
});

test('Builder: without ShapeConfirm nothing is deleted; a failed delete keeps the playlist', async () => {
  const p = await page();
  await p.tab('builder');
  await p.click(p.q('[data-pl-more]'));
  await p.click(p.q('[data-pl-delete]'));
  assert.equal(p.reqs('DELETE', '/api/coach/soundtracks').length, 0);
  await p.close();
  window.ShapeConfirm = { open: async () => true };
  const f = await page({ handlers: trainerLive({ 'DELETE /api/coach/soundtracks': () => ({ status: 500, body: { error: 'Couldn\'t delete. Try again.' } }) }) });
  await f.tab('builder');
  await f.click(f.q('[data-pl-more]'));
  await f.click(f.q('[data-pl-delete]'));
  assert.equal(f.reqs('DELETE', '/api/coach/soundtracks').length, 1);
  assert.equal(!!f.q('[data-pl-pick="st-1"]'), true);
  assert.equal(f.text(f.q('[data-pl-save-msg]')), "Couldn't delete. Try again.");
});

// ── 8. The track list ────────────────────────────────────────────────────────
test('the Builder lists a sample playlist\'s five tracks once each, and says it holds 28', async () => {
  const p = await page({ handlers: { 'GET /api/coach/soundtracks': () => ({ status: 401, body: {} }) }, dash: { loading: false, source: 'demo', clients: [] } });
  await p.tab('builder');
  await p.click(p.q('[data-pl-pick="pl-heavy"]'));
  const pane = p.q('[data-pl-builder="pl-heavy"]');
  const rows = [...pane.querySelectorAll('[data-pl-track]')];
  const heavy = TRAINER_PLAYLISTS.find((x) => x.id === 'pl-heavy');
  assert.equal(heavy.trackCount, 28);
  assert.equal(rows.length, 5);
  const titles = rows.map((r) => r.children[1].children[0].textContent);
  assert.deepEqual(titles, heavy.sampleTracks.map((t) => t[1]));
  assert.equal(new Set(titles).size, 5, 'distinct');
  assert.equal(p.text(pane.querySelector('[data-track-note]')), '5 of 28 tracks shown. The full list is in Spotify.');
  // A live row holds no track list: the note alone, with its real count.
  await p.close();
  const l = await page();
  await l.tab('builder');
  assert.equal(l.all('[data-pl-track]').length, 0);
  assert.equal(l.text(l.q('[data-track-note]')), '24 tracks in this playlist. The full list is in Spotify.');
});

// ── 9. Pure helpers ──────────────────────────────────────────────────────────
test('plSetDayPlaylist sets the day in every week, and returns null when nothing changes', () => {
  const plan = STRENGTH();
  const b = P.plSetDayPlaylist(plan, 'name:upper', { name: 'Quiet', meta: '' });
  assert.deepEqual(b.weeks.map((w) => w.days[1].playlist), [{ name: 'Quiet', meta: '' }, { name: 'Quiet', meta: '' }]);
  assert.deepEqual(b.weeks.map((w) => w.days[0].playlist.name), ['Leg Day', 'Leg Day']);
  assert.deepEqual(b.tags, ['strength']);
  assert.equal(plan.detail.builder.weeks[0].days[1].playlist, null, 'the plan read is not changed in place');
  // Replaces the one a day had; clears with null.
  assert.deepEqual(P.plSetDayPlaylist(plan, 'name:lower', { name: 'Quiet' }).weeks.map((w) => w.days[0].playlist), [{ name: 'Quiet', meta: '' }, { name: 'Quiet', meta: '' }]);
  assert.deepEqual(P.plSetDayPlaylist(plan, 'name:lower', null).weeks.map((w) => w.days[0].playlist), [null, null]);
  // Set in only one week: the write fills the other.
  const half = STRENGTH();
  half.detail.builder.weeks[1].days[0].playlist = null;
  assert.deepEqual(P.plSetDayPlaylist(half, 'name:lower', { name: 'Leg Day', meta: '24 tracks' }).weeks.map((w) => w.days[0].playlist && w.days[0].playlist.name), ['Leg Day', 'Leg Day']);
  // Nothing to change.
  assert.equal(P.plSetDayPlaylist(plan, 'name:lower', { name: 'Leg Day', meta: 'x' }), null);
  assert.equal(P.plSetDayPlaylist(plan, 'name:upper', null), null);
  assert.equal(P.plSetDayPlaylist(plan, 'name:nope', { name: 'Leg Day' }), null, 'no such day');
  assert.equal(P.plSetDayPlaylist({ detail: {} }, 'name:lower', { name: 'Leg Day' }), null);
});

test('plDayHas: every week, some weeks, or not at all', () => {
  const half = STRENGTH();
  half.detail.builder.weeks[1].days[0].playlist = null;
  const [lower, upper] = P.plProgramDays(half);
  assert.equal(lower.weeks, 2);
  const leg = { id: 'st-1', name: 'Leg Day' }, quiet = { id: 'st-2', name: 'Quiet' };
  assert.equal(P.plDayHas(lower, leg), 'some');
  assert.equal(P.plDayHas(P.plProgramDays(STRENGTH())[0], leg), true);
  assert.equal(P.plDayHas(upper, leg), false);
  assert.equal(P.plDayHas(lower, quiet), false);
});

test('plMusicCoverage counts the programs clients are on when that was read, every program when not', () => {
  const mk = (pid, clients, days) => ({ id: pid, name: pid, clients, days: days.map((m, i) => ({ index: i, name: 'D' + i, weeks: 1, playlists: m ? [{ name: 'X', weeksWith: 1 }] : [] })) });
  const read = P.plMusicCoverage([mk('a', 3, [true, false]), mk('b', 0, [false, false]), mk('c', 9, [false])]);
  assert.deepEqual([read.usageRead, read.total, read.covered, read.missing.length], [true, 3, 1, 2]);
  assert.equal(read.missing[0].program.id, 'c', 'the missing day on the program most clients are on is raised');
  const unread = P.plMusicCoverage([mk('a', 3, [true, false]), mk('b', null, [false, false])]);
  assert.deepEqual([unread.usageRead, unread.total, unread.covered], [false, 4, 1]);
  // A day set only in some weeks has no music.
  const some = P.plMusicCoverage([{ id: 'a', clients: 1, days: [{ index: 0, weeks: 2, playlists: [{ name: 'X', weeksWith: 1 }] }] }]);
  assert.deepEqual([some.total, some.covered], [1, 0]);
});

test('plProgramsModel: unread usage is null, a capped answer is null for the unlisted, else 0', () => {
  const plans = [STRENGTH(), UNUSED(), { id: 'm', kind: 'meal_plan', name: 'Meals', detail: {} }];
  assert.deepEqual(P.plProgramsModel(plans, null).map((x) => x.clients), [null, null], 'meal plans are left out');
  assert.deepEqual(P.plProgramsModel(plans, { byId: { p1: { clients: 4 } }, capped: false }).map((x) => x.clients), [4, 0]);
  assert.deepEqual(P.plProgramsModel(plans, { byId: { p1: { clients: 4 } }, capped: true }).map((x) => x.clients), [4, null]);
  assert.deepEqual(P.plProgramsModel(plans, null).map((x) => x.revision), [3, 1]);
  assert.deepEqual(P.plProgramsModel([STRENGTH()], null)[0].type, { label: 'Strength', color: '#c0533b' }, 'the type from the program\'s own tag');
});

test('soundtrackToWeb keeps only what the row holds; the client entry is the app\'s', () => {
  const q = P.soundtrackToWeb(QUIET);
  assert.deepEqual([q.trackCount, q.duration, q.bpm], [null, null, null]);
  assert.deepEqual(P.plToggleSent({ attached: [] }, { id: id(1), name: 'Ada L.' }), [{ id: 'client:' + id(1), kind: 'client', clientId: id(1), name: 'Ada L.' }]);
  assert.deepEqual(P.plRosterFrom({ loading: false, source: 'demo', clients: [ADA] }, false), { state: 'unread', clients: null });
  assert.equal(P.plRosterFrom({ loading: false, source: 'demo', clients: [ADA] }, true).state, 'ready');
  assert.equal(P.plRosterFrom({ loading: true }, false).state, 'loading');
});

test('a day with music in only some weeks says how many, never "No music"', async () => {
  const half = () => { const s = STRENGTH(); s.detail.builder.weeks[1].days[0].playlist = null; s.detail.builder.weeks[0].days[1].playlist = null; return s; };
  const p = await page({ handlers: trainerLive({ 'GET /api/coach/plans': () => ok({ plans: [half()] }) }) });
  assert.equal(p.text(p.q('[data-pl-brief-text]')), '0 of 2 program days your clients are on have music.');
  // The raised day is the first missing on the busiest program: Lower, partial.
  assert.equal(p.text(p.q('[data-pl-raised]')), 'Some weeks Strength Block · Lower has music in only 1 of 2 weeks (4 clients).');
  await p.tab('matrix');
  assert.equal(p.text(p.q('[data-pl-day="p1:0"] [data-pl-no-music]')), 'Music in 1 of 2 weeks · 4 clients');
  assert.equal(p.text(p.q('[data-pl-day="p1:1"] [data-pl-no-music]')), 'No music · 4 clients');
  assert.equal(p.text(p.cell('p1:0:st-1')), '✓ some weeks');
});

// ── Codex on #2644 ───────────────────────────────────────────────────────────
test('a day is matched across weeks by its slot, never its position (P1)', async () => {
  // Week 2 lost its Lower day: its first day is Upper. Writing Lower must not touch it.
  const shifted = () => { const s = STRENGTH(); s.detail.builder.weeks[1].days = [day('d-up2', 'Upper', null)]; return s; };
  const rows = P.plProgramDays(shifted());
  assert.deepEqual(rows.map((r) => [r.name, r.weeks]), [['Lower', 1], ['Upper', 2]]);
  const b = P.plSetDayPlaylist(shifted(), 'name:upper', { name: 'Quiet', meta: '' });
  assert.deepEqual(b.weeks.map((w) => w.days.map((d) => d.name + '=' + (d.playlist ? d.playlist.name : '-'))), [['Lower=Leg Day', 'Upper=Quiet'], ['Upper=Quiet']]);
  // A weekday is the slot when there is one; a repeat in one week is its second occurrence.
  assert.deepEqual(P.plDaySlots([{ name: 'A', weekday: 1 }, { name: 'B', weekday: 1 }, { name: 'Lower' }, { name: 'lower ' }]), ['wd:1', 'wd:1#2', 'name:lower', 'name:lower#2']);
  // Through the page: the matrix cell writes Upper in both weeks, Lower untouched.
  const p = await page({ handlers: trainerLive({ 'GET /api/coach/plans': () => ok({ plans: [shifted()] }) }) });
  await p.tab('matrix');
  await p.click(p.cell('p1:1:st-2'));
  const w = p.reqs('PATCH', '/api/coach/plans')[0].body.detail.builder.weeks;
  assert.deepEqual(w.map((wk) => wk.days.map((d) => d.name + '=' + (d.playlist ? d.playlist.name : '-'))), [['Lower=Leg Day', 'Upper=Quiet'], ['Upper=Quiet']]);
});

test('each page lists only its own role\'s playlists, and legacy ones with none (P2)', async () => {
  const rows = () => ok({ soundtracks: [{ ...LEG, role: 'trainer' }, { ...QUIET, id: 'st-n', name: 'Cooking', role: 'nutritionist' }, { ...QUIET, id: 'st-old', name: 'Old', role: null }] });
  for (const [role, want] of [['trainer', ['st-1', 'st-old']], ['nutritionist', ['st-n', 'st-old']]]) {
    const p = await page({ role, handlers: trainerLive({ 'GET /api/coach/soundtracks': rows }) });
    assert.deepEqual(p.all('[data-pl-card]').map((c) => c.getAttribute('data-pl-card')), want);
    await p.close();
  }
});

test('the usage read asks for today on the account\'s clock (P2)', async () => {
  window.ShapeZone = { ...ShapeZone, dayKey: () => '2031-02-03' };
  try {
    const p = await page();
    assert.match(p.reqs('GET', '/api/coach/plans/usage')[0].url, /\?today=2031-02-03$/);
  } finally { window.ShapeZone = ShapeZone; }
});

test('two playlists with one name: a day matches by id, and a name-only day claims neither (P1)', async () => {
  const twin = { ...LEG, id: 'st-9', provider: 'apple', url: 'https://music.apple.com/x' };
  const byId = () => { const s = STRENGTH(); s.detail.builder.weeks.forEach((w) => { w.days[0].playlist = { id: 'st-9', name: 'Leg Day', meta: '' }; }); return s; };
  const dup = P.plDupNames([{ name: 'Leg Day' }, { name: 'Leg Day' }, { name: 'Quiet' }]);
  assert.deepEqual([...dup], ['Leg Day']);
  const days = P.plProgramDays(byId());
  assert.equal(P.plDayHas(days[0], { id: 'st-9', name: 'Leg Day' }, dup), true);
  assert.equal(P.plDayHas(days[0], { id: 'st-1', name: 'Leg Day' }, dup), false, 'the other Leg Day is not on it');
  const legacy = P.plProgramDays(STRENGTH());
  assert.equal(P.plDayHas(legacy[0], { id: 'st-1', name: 'Leg Day' }, dup), false, 'ambiguous: neither claims it');
  assert.equal(P.plDayHas(legacy[0], { id: 'st-1', name: 'Leg Day' }, new Set()), true, 'unique: the name is enough');
  // Switching between the twins is a change, written with the id.
  const sw = P.plSetDayPlaylist(byId(), 'name:lower', { id: 'st-1', name: 'Leg Day', meta: '' });
  assert.deepEqual(sw.weeks.map((w) => w.days[0].playlist.id), ['st-1', 'st-1']);
  // Through the page: only the twin the day names is on.
  const p = await page({ handlers: trainerLive({ 'GET /api/coach/soundtracks': () => ok({ soundtracks: [LEG, twin] }), 'GET /api/coach/plans': () => ok({ plans: [byId()] }) }) });
  await p.tab('matrix');
  assert.deepEqual([p.on('p1:0:st-1'), p.on('p1:0:st-9')], ['0', '1']);
  await p.click(p.cell('p1:0:st-1'));
  assert.deepEqual(p.reqs('PATCH', '/api/coach/plans')[0].body.detail.builder.weeks.map((w) => w.days[0].playlist.id), ['st-1', 'st-1']);
});

test('deleting a playlist takes it off its program days first, and stops if that fails (P2)', async () => {
  window.ShapeConfirm = { open: async () => true };
  const p = await page();
  await p.tab('builder');
  await p.click(p.q('[data-pl-more]'));
  await p.click(p.q('[data-pl-delete]'));
  const w = p.reqs('PATCH', '/api/coach/plans');
  assert.equal(w.length, 1);
  assert.equal(w[0].body.expectedRevision, 3);
  assert.deepEqual(w[0].body.detail.builder.weeks.map((wk) => wk.days[0].playlist), [null, null]);
  const order = p.log.filter((r) => r.method !== 'GET').map((r) => r.method + ' ' + r.url);
  assert.deepEqual(order, ['PATCH /api/coach/plans', 'DELETE /api/coach/soundtracks'], 'the days first, then the playlist');
  await p.close();
  const f = await page({ handlers: trainerLive({ 'PATCH /api/coach/plans': () => ({ status: 409, body: {} }) }) });
  await f.tab('builder');
  await f.click(f.q('[data-pl-more]'));
  await f.click(f.q('[data-pl-delete]'));
  assert.equal(f.reqs('DELETE', '/api/coach/soundtracks').length, 0, 'not deleted');
  assert.equal(/changed somewhere else.*wasn't deleted/.test(f.text(f.q('[data-pl-save-msg]'))), true);
  await f.close();
  // The programs unread: it can't know which days play it, so it doesn't delete.
  const u = await page({ handlers: trainerLive({ 'GET /api/coach/plans': () => ({ status: 500, body: {} }) }) });
  await u.tab('builder');
  await u.click(u.q('[data-pl-more]'));
  await u.click(u.q('[data-pl-delete]'));
  assert.equal(u.reqs('DELETE', '/api/coach/soundtracks').length, 0);
  assert.equal(/programs couldn't be read/.test(u.text(u.q('[data-pl-save-msg]'))), true);
});

test('a playlist picked from the library keeps its track count in the save (P2)', async () => {
  const p = await page({ handlers: trainerLive({
    'GET /api/integrations/spotify/playlists': () => ok({ playlists: [{ id: 'sp1', name: 'Picked', url: 'https://open.spotify.com/playlist/sp1', tracks: 31 }] }),
    'POST /api/coach/soundtracks': ({ body }) => ok({ soundtrack: { id: 'st-new', ...body } }),
  }) });
  await p.click([...p.div.querySelectorAll('[data-actions] button')][0]);
  const btn = (t) => [...document.querySelectorAll('[data-pl-new] button')].find((b) => b.textContent.includes(t));
  await p.click(btn('Pick from your Spotify'));
  await p.click(btn('Picked'));
  await p.click(btn('Save playlist'));
  const post = p.reqs('POST', '/api/coach/soundtracks');
  assert.equal(post.length, 1);
  assert.equal(post[0].body.tracks, 31);
  assert.equal(post[0].body.name, 'Picked');
});
