// The three Shape Score surfaces the page's own actions promised and never had, plus
// the check-in read-back (review 2026-09-09, C1 · R17 · R18).
//
// The pure pieces are brace-matched out of the SHIPPED modules and EXECUTED, so an
// equivalent rewrite passes and a real regression fails; a source pin could tell
// neither apart. What can only be asserted by reading — a wiring, an absence — is
// asserted on the invariant rather than on a spelling.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';

const SCORE = readFileSync(new URL('../public/newdesign/clientScore.jsx', import.meta.url), 'utf8');
const CSR = readFileSync(new URL('../public/newdesign/clientScoreRecord.jsx', import.meta.url), 'utf8');
const PROGRESS = readFileSync(new URL('../public/newdesign/dashProgress.jsx', import.meta.url), 'utf8');
const APP = readFileSync(new URL('../public/newdesign/ClientApp.html', import.meta.url), 'utf8');
const KIT = readFileSync(new URL('../src/app/api/client/checkin-kit/route.ts', import.meta.url), 'utf8');
const MIG = readFileSync(new URL('../supabase-migrations/2026-06-12-checkin-kit.sql', import.meta.url), 'utf8');
const LB_ROUTE = readFileSync(new URL('../src/app/api/leaderboard/route.ts', import.meta.url), 'utf8');
const LB_SQL = readFileSync(new URL('../supabase-migrations/2026-05-31-score-and-leaderboard.sql', import.meta.url), 'utf8');

// Pull a top-level `function NAME(` out of a module and evaluate it.
function fn(src, name, deps) {
  const at = src.indexOf('function ' + name + '(');
  assert.ok(at > 0, name + ' moved');
  let d = 0, seen = false, k = at;
  for (; k < src.length; k++) {
    const ch = src[k];
    if (ch === '{') { d++; seen = true; }
    else if (ch === '}') { d--; if (seen && d === 0) { k++; break; } }
  }
  const body = src.slice(at, k);
  const names = Object.keys(deps || {});
  return new Function(...names, body + '\nreturn ' + name + ';')(...names.map((n) => deps[n]));
}

// ── the record's own formatting, driven ─────────────────────────────────────
const csrSigned = fn(CSR, 'csrSigned');
const csrDay = fn(CSR, 'csrDay');

test('a signed delta reads as a gain, a loss, or neither — never "+0"', () => {
  assert.equal(csrSigned(24), '+24');
  assert.equal(csrSigned(-8), '−8');       // a real minus sign, not a hyphen
  assert.equal(csrSigned(0), '0');          // ⚠ zero is not a gain
  assert.equal(csrSigned(1284), '+1,284');
  assert.equal(csrSigned(null), '0');
  assert.equal(csrSigned(undefined), '0');
});

test('a ledger day is read in the member’s own timezone, not UTC', () => {
  // ⚠ `new Date("2026-09-08")` is midnight UTC, which is the PREVIOUS DAY for everyone
  // west of it — every row of a Los Angeles member's own history would have been dated
  // a day early. Driven against a real western offset rather than reasoned about.
  const prev = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  try {
    const out = csrDay('2026-09-08');
    assert.match(out, /Sep 8/, 'the day shifted: ' + out);
    assert.match(out, /Tue/, 'the weekday shifted: ' + out);
  } finally { process.env.TZ = prev; }
  assert.equal(csrDay(''), '');
  assert.equal(csrDay('not-a-date'), 'not-a-date');
});

test('the cumulative line survives the shapes a new member actually has', () => {
  // The shared Sparkline divides by `data.length - 1` and normalises against max
  // alone: one point yields NaN and a flat series draws on the floor. Both are
  // ordinary for someone who logged once.
  const geom = fn(CSR, 'csrLineGeometry');
  assert.equal(geom([], 90, 600), null, 'an empty series should draw nothing');
  for (const series of [
    [{ cumulative: 40 }],                                            // one point
    [{ cumulative: 40 }, { cumulative: 40 }, { cumulative: 40 }],     // flat
    [{ cumulative: 0 }, { cumulative: 120 }],                         // rising
    [{ cumulative: 120 }, { cumulative: 60 }],                        // falling
    [{ cumulative: -30 }, { cumulative: 10 }],                        // through zero
  ]) {
    const g = geom(series, 90, 600);
    const out = JSON.stringify(g);
    assert.ok(!/NaN|Infinity|null/.test(out), 'unplottable geometry for ' + JSON.stringify(series) + ': ' + out);
    // every point inside the box, or the line is drawn outside its own viewBox
    for (const n of g.path.match(/-?\d+(\.\d+)?/g).map(Number)) assert.ok(n >= -1 && n <= 601, 'point outside the box: ' + n);
  }
  // a single point sits in the middle rather than at x = NaN
  assert.match(geom([{ cumulative: 40 }], 90, 600).path, /^M300\.0 /);
});

// ── the wiring the review asked for ─────────────────────────────────────────
test('none of the Score page’s three actions is dead any more', () => {
  // ⚠ R18. "VIEW FULL LEDGER →" was `href="#"`; both header buttons had no handler at
  // all — while both routes behind them had shipped and were consumed by nothing.
  const src = stripComments(SCORE);
  assert.ok(!/<a href="#"/.test(src), 'a link still goes nowhere');
  // ⚠ ANCHORED ON REACHABILITY, NOT ON A CALL SHAPE. The first cut of this guard
  // pinned `setView("board")` and failed the correct code, which toggles through a
  // ternary — a guard about DEAD CONTROLS breaking on how a handler is spelled.
  const handlers = src.match(/onClick=\{[^}]*\}/g) || [];
  for (const view of ['record', 'board', 'how', 'standing']) {
    assert.ok(handlers.some((h) => h.includes('"' + view + '"')), 'no handler can reach the ' + view + ' view');
  }
  assert.match(src, /<ClientScoreRecord \/>/);
  assert.match(src, /<ClientLeaderboard \/>/);
  assert.match(src, /<ClientScoreHowItWorks tiers=\{tiers\} currentTier=\{currentTier\[0\]\}/);
  // the grid is REPLACED, not hidden behind a panel: a mounted GridStack keeps
  // reacting to resizes and persisting placement nobody can see
  const body = src.slice(src.indexOf('view === "record"'));
  assert.match(body.slice(0, 400), /: <DashGrid role="client" tab="score"/, 'the grid is no longer the fallback branch');
  assert.equal((src.match(/<DashGrid /g) || []).length, 1, 'the grid is mounted more than once');
});

test('the new module is loaded by every page that loads the Score page', () => {
  // A window-global consumed by a page that never loads its definer is React error
  // #130 at the moment someone presses the button.
  const hosts = ['ClientApp.html', 'ClientScore.html'];
  for (const h of hosts) {
    const html = readFileSync(new URL('../public/newdesign/' + h, import.meta.url), 'utf8');
    assert.ok(html.includes('src="clientScore.jsx'), h + ' no longer loads the Score page');
    assert.ok(html.includes('src="clientScoreRecord.jsx'), h + ' loads the Score page without its surfaces');
  }
  assert.match(APP, /clientScoreRecord\.jsx[\s\S]{0,200}clientScore\.jsx/, 'the surfaces load after their consumer');
  // every component the Score page names must actually be exported
  const exported = stripComments(CSR).slice(stripComments(CSR).lastIndexOf('Object.assign(window,'));
  for (const n of ['ClientScoreRecord', 'ClientLeaderboard', 'ClientScoreHowItWorks']) {
    assert.ok(exported.includes(n), n + ' is never put on window');
  }
});

test('the record and the board name their routes, and neither invents one', () => {
  const src = stripComments(CSR);
  // anchored on the URL, not on the call: the read goes through csrRead now, and a
  // guard about WHICH ROUTE should not break when the caller is refactored.
  assert.match(src, /"\/api\/client\/score-record"/);
  assert.match(src, /"\/api\/leaderboard\?period="/);
  // ⚠ THE FOUR STATES NOW LIVE IN csrStateNote AND ARE DRIVEN IN THEIR OWN TEST. What
  // belongs here is that each surface DEFERS to it before drawing anything — a surface
  // that renders its data first would show an empty ledger for a failed read.
  for (const surface of ['ClientScoreRecord', 'ClientLeaderboard']) {
    const at = src.indexOf('function ' + surface + '(');
    const body = src.slice(at, src.indexOf('\nfunction ', at + 10));
    const note = body.indexOf('csrStateNote(state.kind');
    assert.ok(note > -1, surface + ' writes its own state sentences again');
    const guard = body.indexOf('if (note)');
    assert.ok(guard > note, surface + ' computes a state note it never acts on');
    assert.ok(guard < body.indexOf('state.data'), surface + ' reads the payload before deciding there is one');
  }
  // no fabricated figure anywhere in the file — the Score page's own 1,284 fallback
  // is exactly what these panels exist not to repeat
  assert.ok(!/1,?284/.test(src), 'a demo figure reached the new surfaces');
});

// ── the check-in read-back ──────────────────────────────────────────────────
test('signed out is not "it broke", and neither is a membership gate', async () => {
  // ⚠ BOTH ROUTES ANSWER A SIGNED-OUT VISITOR WITH 401 (`requireMembership` /
  // `currentUser`) and a signed-in non-member with 402. The Score page is a MARKETING
  // page when signed out — so pressing these buttons told a visitor their record
  // "couldn't be read just now" and invited them to reload, which can never work.
  const note = fn(CSR, 'csrStateNote');
  assert.match(note('loading', 'your record'), /^Reading/);
  assert.match(note('anon', 'your record'), /^Sign in/);
  assert.ok(!/reload/i.test(note('anon', 'your record')), 'a signed-out visitor is told to reload');
  assert.match(note('gated', 'your record'), /membership/i);
  assert.ok(!/reload/i.test(note('gated', 'your record')), 'a non-member is told to reload');
  assert.match(note('error', 'your record'), /Couldn't read/);
  assert.equal(note('ready', 'your record'), null, 'a ready state must render data, not a sentence');
  // ⚠ AND THE READER IS DRIVEN, NOT GREPPED. A source check that the statuses are
  // NAMED stayed green under a mutation that made every non-2xx resolve `ready` with
  // an empty payload — which renders a 500 as "nothing on the ledger yet".
  const src = stripComments(CSR);
  const reply = (status, body) => ({
    status, ok: status >= 200 && status < 300,
    json: () => (body === undefined ? Promise.reject(new Error('bad json')) : Promise.resolve(body)),
  });
  const read = (r) => fn(CSR, 'csrRead', { fetch: () => (r instanceof Error ? Promise.reject(r) : Promise.resolve(r)) })('/x');
  assert.deepEqual(await read(reply(200, { lifetime: 9 })), { kind: 'ready', data: { lifetime: 9 } });
  assert.deepEqual(await read(reply(401)), { kind: 'anon' });
  assert.deepEqual(await read(reply(402)), { kind: 'gated' });
  assert.deepEqual(await read(reply(500)), { kind: 'error' }, 'a server error reads as an empty ledger');
  assert.deepEqual(await read(reply(404)), { kind: 'error' });
  assert.deepEqual(await read(reply(200)), { kind: 'error' }, 'unparseable JSON reads as data');
  assert.deepEqual(await read(new Error('offline')), { kind: 'error' }, 'a network failure reads as data');
  for (const surface of ['ClientScoreRecord', 'ClientLeaderboard']) {
    const at = src.indexOf('function ' + surface + '(');
    const body = src.slice(at, src.indexOf('\nfunction ', at + 10));
    assert.match(body, /csrRead\(/, surface + ' reads without the status map');
    assert.match(body, /csrStateNote\(state\.kind/, surface + ' writes its own sentences again');
  }
});

test('every new control clears the 24px tap-target floor', () => {
  // This repo's documented WCAG 2.5.8 AA floor. The ledger link was rebuilt as a button
  // with padding: 0, which is a text-height hit area on a phone.
  // ⚠ SCOPED TO THE CONTROLS THIS CHANGE ADDS. The first cut swept every button in
  // clientScore.jsx and flagged the commitment card's — pre-existing code this change
  // does not touch, which is a finding about someone else's diff.
  const NEW = [
    ['clientScoreRecord', (b) => true, CSR],
    ['clientScore', (b) => /setView\(/.test(b), SCORE],
  ];
  for (const [label, mine, src] of NEW) {
    // ⚠ A NON-GREEDY MATCH TO THE FIRST ">" STOPS INSIDE `onClick={() => …}` — the
    // arrow IS a ">". Take a fixed window after each tag instead.
    const clean = stripComments(src);
    const buttons = [];
    for (let k = clean.indexOf('<button'); k > -1; k = clean.indexOf('<button', k + 7)) buttons.push(clean.slice(k, k + 700));
    const mineOnly = buttons.filter(mine);
    assert.ok(mineOnly.length, label + ' has no new controls to check');
    for (const b of mineOnly) {
      const style = /style=\{\{([\s\S]*?)\}\}/.exec(b);
      if (!style) continue;
      const st = style[1];
      const ok = /minHeight:\s*(2[4-9]|[3-9]\d|\d{3})/.test(st) || /csScoreAction\(/.test(st);
      assert.ok(ok, label + ': a control declares no 24px floor -> ' + b.slice(0, 150));
    }
  }
});

test('a failed leaderboard read is never published as an empty board', () => {
  // ⚠ THE ROUTE ANSWERED 200 WITH `{entries: [], me: null}` ON AN RPC ERROR, and every
  // consumer reads that as settled — so an outage told members nobody had earned points
  // and that they were not ranked. Both are positive claims the route cannot make.
  // BOTH reads are covered: `me: null` is its own claim, one call further down.
  const src = stripComments(LB_ROUTE);
  assert.ok(!/if \(error\) return NextResponse\.json\(\{ period, entries: \[\], me: null \}\)/.test(src), 'the board read still swallows its error');
  const errs = src.match(/if \(\w*[eE]rror\) return NextResponse\.json\([^;]*\);/g) || [];
  assert.equal(errs.length, 2, 'one of the two RPC reads drops its error: ' + errs.join(' | '));
  for (const e of errs) assert.match(e, /status: 502/, 'a failed read answers 2xx: ' + e);
  // and the consumer maps a non-2xx to its own "couldn't read" state, not to data
  const read = fn(CSR, 'csrRead', { fetch: () => Promise.resolve({ status: 502, ok: false, json: () => Promise.resolve({}) }) });
  return read('/x').then((r) => assert.deepEqual(r, { kind: 'error' }));
});

test('the period labels name the windows the RPCs actually rank', () => {
  // ⚠ "week" IS ROLLING. Both RPCs define it as now() - interval '7 days', so early in
  // a calendar week the result is mostly the PREVIOUS one. "month" is a real calendar
  // month and "all" is since 1970 — those two labels were already accurate.
  assert.match(LB_SQL, /p_period = 'week' then now\(\) - interval '7 days'/);
  assert.match(LB_SQL, /else date_trunc\('month', now\(\)\)/);
  const src = stripComments(CSR);
  const periods = /const CSR_PERIODS = \[([\s\S]*?)\];/.exec(src);
  assert.ok(periods, 'CSR_PERIODS moved');
  assert.ok(!/"week", "This week"/.test(periods[1]), 'a rolling 7-day window is labelled as a calendar week');
  assert.match(periods[1], /"week", "Last 7 days"/);
  assert.match(periods[1], /"month", "This month"/);
});

test('an unranked member is not told a cause the data cannot establish', () => {
  // ⚠ `me === null` HAS TWO CAUSES. `shape_leaderboard_me` filters
  // `having sum(delta) > 0`, so a member who earned nothing in the window gets no row —
  // and the RPC also drops anyone opted out. An earlier draft asserted the opt-out and
  // sent them to Settings, which is wrong twice: NOTHING in this repository writes
  // `client_privacy_prefs`, on any surface, so it was advice nobody could follow.
  assert.match(LB_SQL, /having sum\(l\.delta\) > 0/, 'the zero-score filter is gone — re-check the copy');
  assert.match(LB_SQL, /client_privacy_prefs/);
  const src = stripComments(CSR);
  const at = src.indexOf('function ClientLeaderboard(');
  const body = src.slice(at, src.indexOf('\nfunction ', at + 10));
  assert.ok(!/opt-in|opt out|opted out/i.test(body), 'the copy asserts an opt-out it cannot establish');
  assert.ok(!/Settings/.test(body), 'the copy points at a control that exists on no surface');
});

test('the check-in history reads the weeks the route already sent', () => {
  // ⚠ NO NEW ROUTE. /api/client/checkin-kit has always returned the last EIGHT
  // check-ins and this page threw seven of them away.
  assert.match(KIT, /from\('client_checkins'\)[\s\S]{0,120}\.limit\(8\)/, 'the route no longer sends a history');
  const src = stripComments(PROGRESS);
  assert.match(src, /function DprCheckinHistory\(\{ kit \}\)/);
  assert.match(src, /<DprCheckinHistory kit=\{kit\} \/>/);
  assert.ok(!/fetch\([^)]*checkin-kit[^)]*\)[\s\S]{0,80}DprCheckinHistory/.test(src), 'the history added a second fetch');
  // the current week is the FORM's, so it must not also appear as history
  const at = src.indexOf('function DprCheckinHistory');
  const body = src.slice(at, src.indexOf('\nfunction ', at + 10));
  assert.match(body, /const rows = dprCheckinHistoryRows\(kit\)/);
  // ⚠ AND THE EMPTY GUARD LIVES IN THE COMPONENT, WHERE A PURE DRIVER CANNOT REACH
  // IT — measured: a mutation that neutered it survived the driven round below.
  // Anchored on the invariant (an early return, conditioned on `rows`, before
  // anything is drawn) rather than on how the condition is spelled.
  const guard = body.slice(0, body.indexOf('<Card'));
  assert.ok(guard.indexOf('<Card') === -1, 'the component draws before it decides');
  const early = /if\s*\(([^)]*)\)\s*return null;/.exec(guard);
  assert.ok(early, 'a member with one check-in is shown an empty history card');
  assert.match(early[1], /\brows\b/, 'the early return does not depend on there being rows: ' + early[1]);
});

test('the history lists every week EXCEPT the one the form is already showing', () => {
  // Driven, not read: which weeks appear, in what order, and whether the card exists
  // at all are the three things that can be wrong here.
  const rows = fn(PROGRESS, 'dprCheckinHistoryRows');
  const kit = { weekOf: '2026-09-07', checkins: [
    { week_of: '2026-08-24' }, { week_of: '2026-09-07' }, { week_of: '2026-08-31' },
  ] };
  assert.deepEqual(rows(kit).map((c) => c.week_of), ['2026-08-31', '2026-08-24'], 'this week is listed twice, or the order is wrong');
  // ⚠ A MEMBER WITH ONE CHECK-IN GETS NO CARD. The form already shows it, and an
  // empty "what you've sent before" promises a history nobody has yet.
  assert.deepEqual(rows({ weekOf: '2026-09-07', checkins: [{ week_of: '2026-09-07' }] }), []);
  assert.deepEqual(rows({ weekOf: '2026-09-07', checkins: [] }), []);
  assert.deepEqual(rows({}), []);
  assert.deepEqual(rows(null), []);
  assert.deepEqual(rows({ weekOf: '2026-09-07', checkins: [null, undefined, { week_of: '2026-08-31' }] }).length, 1);
});

test('the check-in widget keeps ONE observed card, or its history is clipped', () => {
  // DashGrid refits an item by observing `content.firstElementChild`. Two sibling
  // cards leave the second unobserved: expanding a row grows past the fitted height
  // and item-content's overflow:hidden eats it, silently.
  const src = stripComments(PROGRESS);
  const at = src.indexOf('key: "checkin"');
  const body = src.slice(at, src.indexOf('{ key: "phototimeline"', at));
  assert.ok(!/<React\.Fragment>/.test(body), 'the widget renders two sibling cards again');
  assert.match(body, /<div>[\s\S]*DprCheckinForm[\s\S]*DprCheckinHistory[\s\S]*<\/div>/);
});

test('no coach reply is promised, because the table cannot hold one', () => {
  // ⚠ REGISTERED, NOT FAKED. `client_checkins` is owner-write with a coach-READ
  // policy and has no reply column, so a reply needs a migration and a coach-side
  // write. An empty "your coach hasn't replied yet" would promise a channel that does
  // not exist — and the coach's Week note is explicitly PRIVATE, so it is not one.
  assert.ok(!/coach_reply|reply\s+text/.test(MIG), 'the table gained a reply column — wire the read-back');
  const src = stripComments(PROGRESS);
  const at = src.indexOf('function DprCheckinHistory');
  const body = src.slice(at, src.indexOf('\nfunction ', at + 10));
  assert.ok(!/repl(y|ied)/i.test(body), 'the history claims a coach reply it has no data for');
});
