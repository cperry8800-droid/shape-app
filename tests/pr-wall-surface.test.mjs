// The Wall — the record board in the app's chat page (review 2026-09-10 §7).
//
// ⚠ THE SURFACE IS DRIVEN, NOT GREPPED. `BSWall` is mounted through the shared
// broadsheet harness and its rendered text is what the assertions read, so an
// equivalent rewrite passes and a real regression fails. A source-text pin
// cannot tell those two apart — the lesson this repo has now paid for four
// times in one wave.
//
// The data layer cannot be imported (shapeBackend.js is a classic browser
// script), so its three Wall functions are brace-matched out of the shipped
// file and evaluated against stubs — the tests/radio-ask-gate.test.mjs method.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadBroadsheet, drive, SHIM, THEME, SRC } from './helpers/broadsheet-mount.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

// BSPlate is destructured off `window` when the module evaluates, so the stub
// has to stand before the load. It is a frame, and this suite is about what the
// frame CONTAINS.
globalThis.BSPlate = ({ children }) => SHIM.createElement('div', null, children);
globalThis.window.ShapeAuth = { getCachedState: () => ({ user: null }) };

const {
  BSWall, BSWallPlate, BSActivityCard, bsActivityKey, bsWallGain, bsWallNum, bsWallHeader,
  bsWallLifts, bsWallDemoRows, BS_WALL_DEMO, BS_WALL_UNITS,
} = await loadBroadsheet([
  'BSWall', 'BSWallPlate', 'BSActivityCard', 'bsActivityKey', 'bsWallGain', 'bsWallNum',
  'bsWallHeader', 'bsWallLifts', 'bsWallDemoRows', 'BS_WALL_DEMO', 'BS_WALL_UNITS',
]);

const src = readFileSync(SRC, 'utf8');
const bare = stripComments(src);

// ── the reading ─────────────────────────────────────────────────────────────

test('a gain exists only against a real previous best', () => {
  assert.equal(bsWallGain(245, 235), 10);
  assert.equal(bsWallGain(18.2, 16.4), 1.8);
  // ⚠ EVERY ONE OF THESE MUST BE null, NOT 0. The header branches on `gain ==
  // null` to say "first on the wall"; a 0 would render "↑ +0 lb over last best"
  // at a member who has never posted this lift.
  assert.equal(bsWallGain(245, null), null, 'no previous best');
  assert.equal(bsWallGain(245, undefined), null, 'absent previous best');
  assert.equal(bsWallGain(245, 245), null, 'equalling a best is not beating it');
  assert.equal(bsWallGain(235, 245), null, 'a regression is never a gain');
  assert.equal(bsWallGain(null, 235), null, 'no current value');
  assert.equal(bsWallGain('heavy', 235), null, 'an unparseable value');
});

test('the figure drops a trailing zero and keeps a real decimal', () => {
  assert.equal(bsWallNum(245), '245');
  assert.equal(bsWallNum(245.0), '245');
  assert.equal(bsWallNum(18.2), '18.2');
  assert.equal(bsWallNum(2000), '2000');
  assert.equal(bsWallNum(null), '');
  assert.equal(bsWallNum('x'), '');
});

test('"first" is whether a previous best exists, not whether a gain computed', () => {
  // ⚠ THIS TEST USED TO ASSERT `first === (gain == null)`, WHICH PINNED A
  // DEFECT: any record whose improvement failed to produce a number was then
  // announced as the member's first while the ledger held a prior best. The
  // two are different questions.
  assert.equal(bsWallHeader({ best: 245, prev: null }).first, true);
  assert.equal(bsWallHeader({ best: 245, prev: undefined }).first, true);
  assert.equal(bsWallHeader({ best: 245, prev: 235 }).first, false);
  assert.equal(bsWallHeader({ best: 245, prev: 245 }).first, false, 'a stored best is a stored best');
  // A first record has nothing to be better than, so it can never carry a gain.
  for (const rec of [{ best: 245, prev: null }, { best: 1, prev: undefined }]) {
    assert.equal(bsWallHeader(rec).gain, null);
  }
});

test('an improvement too small to round away is still reported as one', () => {
  // The RPC accepts any value strictly greater than the stored best, so
  // 245 → 245.02 IS a record. At one decimal place its gain rounded to 0 and
  // the plate read it as no change at all.
  const h = bsWallHeader({ best: 245.02, prev: 245 });
  assert.equal(h.first, false, 'a previous best exists');
  assert.ok(h.gain > 0, `a beaten best always reports a gain (got ${h.gain})`);
  assert.equal(bsWallNum(h.gain), '0.02');
});

test('the header falls back to the lift KEY, never to an empty label', () => {
  assert.equal(bsWallHeader({ liftKey: 'back squat', best: 247 }).label, 'back squat');
  assert.equal(bsWallHeader({ liftKey: 'back squat', liftLabel: 'Back Squat', best: 247 }).label, 'Back Squat');
});

test('reps show only when they describe a set of more than one', () => {
  // "245 lb × 1" is how every single is written down and reads as noise on a
  // board; the number alone already says it.
  assert.equal(bsWallHeader({ best: 245, reps: 3 }).reps, 3);
  assert.equal(bsWallHeader({ best: 245, reps: 1 }).reps, null);
  assert.equal(bsWallHeader({ best: 245, reps: null }).reps, null);
  assert.equal(bsWallHeader({ best: 245 }).reps, null);
});

test('the lift filter offers each loaded lift once, in the order it appears', () => {
  const rows = [
    { liftKey: 'deadlift', liftLabel: 'Deadlift' },
    { liftKey: 'squat', liftLabel: 'Squat' },
    { liftKey: 'deadlift', liftLabel: 'Deadlift' },
    { liftKey: '', liftLabel: 'nothing' },
    null,
  ];
  assert.deepEqual(bsWallLifts(rows), [
    { key: 'deadlift', label: 'Deadlift' },
    { key: 'squat', label: 'Squat' },
  ]);
  assert.deepEqual(bsWallLifts(null), []);
});

// ── the demo board ──────────────────────────────────────────────────────────

test('every sample record resolves to a real demo activity', () => {
  // A row whose activity does not exist is dropped by bsWallDemoRows, so a
  // typo'd name would silently shrink the preview rather than fail. Assert the
  // count as well as the shape.
  const rows = bsWallDemoRows();
  assert.equal(rows.length, BS_WALL_DEMO.length, 'no sample record lost its activity');
  for (const r of rows) {
    assert.ok(r.act, `${r.name} has an activity`);
    assert.equal(r.act.who, r.name);
    assert.ok(r.ago, `${r.name} carries a time`);
  }
});

test('the preview shows both a first record and one beaten', () => {
  const rows = bsWallDemoRows();
  assert.ok(rows.some((r) => bsWallGain(r.best, r.prev) == null), 'a first-on-the-wall plate');
  assert.ok(rows.some((r) => bsWallGain(r.best, r.prev) != null), 'a beaten-best plate');
});

test('the preview shows a stamped record and an unstamped one', () => {
  // ⚠ The co-sign is read from the demo ACTIVITY, never authored beside the
  // record. Inventing one here would make the same record read differently on
  // the Wall and the Feed, which is exactly what wrapping the card prevents.
  const rows = bsWallDemoRows();
  assert.ok(rows.some((r) => r.act.cosign), 'a co-signed plate');
  assert.ok(rows.some((r) => !r.act.cosign), 'an unstamped plate');
});

// ── the rendered board ──────────────────────────────────────────────────────

const feedCtx = () => ({
  t: THEME, cardInk: '#111', muted: '#777', hair: '#ddd', card: {},
  actLikes: {}, actComments: {}, actCmtOpen: null, actDetailsOpen: {}, actCoSign: {}, actExpr: {},
  exprOpenKey: null, setExprOpenKey() {}, lpTimerRef: { current: null }, lpFiredRef: { current: false },
  tierByUser: {}, avatarByUser: {}, feedAvatars: {}, myRole: 'client', coachClientIds: null,
  myFollowingSet: new Map(),
  setOpenProfile() {}, setActivityDetail() {}, setLikerSheetFor() {}, setSendPostFor() {},
  feedApplyReaction() {},
});

// The real bsSubTab is a closure inside BSClientFeed, so the segment takes it as
// ctx. The stub keeps the shape a driver needs: a keyed button carrying its own
// label and handler.
const subTab = ({ key, on, onClick, label }) =>
  SHIM.createElement('button', { key, 'aria-pressed': !!on, onClick }, label);

const wallCtx = (over = {}) => ({
  feedCtx: feedCtx(), loggedIn: false, myRole: 'client', bsSubTab: subTab,
  hair: '#ddd', muted: '#777', cardInk: '#111', ...over,
});

// Fill the defaultValue placeholders the way the shipped translator would, so a
// delta line can be read as the member reads it. Substitutes only from params
// the component actually passed — a placeholder it forgot still shows as {gain}
// and the assertion fails rather than quietly matching.
function withCopyValues(fn) {
  const prev = globalThis.window.ShapeI18n;
  globalThis.window.ShapeI18n = {
    t(key, opts) {
      const raw = opts && opts.defaultValue;
      if (typeof raw !== 'string') return null;
      return raw.replace(/\{(\w+)\}/g, (m, name) => (opts && opts[name] != null ? String(opts[name]) : m));
    },
  };
  try { return fn(); } finally { globalThis.window.ShapeI18n = prev; }
}

test('signed out, the board renders every sample record without an effect', () => {
  // The preview has nothing to fetch, so it must not depend on an effect having
  // run — the harness no-ops effects, and this passing IS the evidence.
  //
  // ⚠ COUNT THE PLATES, DO NOT MATCH THE LIFT NAMES. An earlier version of this
  // test asserted the rendered text contained every liftLabel, and it passed
  // with the plates rendering NOTHING — the labels it was matching came from
  // the lift-filter <option> list a few lines above them. A guard that reports
  // a pass is a broken instrument until you know which line satisfied it.
  const d = drive(BSWall, { ctx: wallCtx() });
  assert.ok(!d.text.includes('Reading the wall'), 'a preview visitor never waits on a read');
  const plates = d.nodes().filter((n) => n.type === BSWallPlate);
  assert.equal(plates.length, BS_WALL_DEMO.length, 'one plate per sample record');
  assert.deepEqual(plates.map((n) => n.props.rec.liftLabel), BS_WALL_DEMO.map((r) => r.liftLabel));
  assert.deepEqual(plates.map((n) => !!n.props.newest), [true, false, false, false, false, false],
    'only the newest record gets the live tick');
});

test('a plate wraps the feed\'s own card rather than re-implementing the record', () => {
  // The owner asked for "all of the information that is currently displayed".
  // The way that stays true as the feed grows is that the Wall renders the SAME
  // component — so the assertion is that the element is there, with the record
  // as its activity.
  const rec = bsWallDemoRows()[0];
  const card = drive(BSWallPlate, { rec, ctx: wallCtx(), newest: true })
    .nodes().find((n) => n.type === BSActivityCard);
  assert.ok(card, 'the plate renders BSActivityCard');
  assert.equal(card.props.a, rec.act, 'with this record\'s activity');
  assert.equal(card.props.isLast, true, 'no trailing feed rule inside a framed plate');
  assert.equal(card.props.pagePad, 0, 'so its media bleed stays inside the plate');
});

test('a record with no linked post renders as a bare record', () => {
  // Older ledger rows, and anything posted from outside the app, have no post.
  // The number is still true; there is simply nothing to react to.
  const rec = { ...bsWallDemoRows()[0], act: null };
  const d = drive(BSWallPlate, { rec, ctx: wallCtx(), newest: false });
  assert.equal(d.nodes().filter((n) => n.type === BSActivityCard).length, 0);
  assert.ok(!d.text.includes('Not yet stamped'), 'nothing to stamp is not the same as unstamped');
  assert.ok(d.text.includes(rec.liftLabel), 'but the record itself is still stated');
});

const plateText = (rec) => drive(BSWallPlate, { rec, ctx: wallCtx(), newest: false }).text;

test('the delta line states the gain, or says it is a first', () => {
  withCopyValues(() => {
    const by = Object.fromEntries(bsWallDemoRows().map((r) => [r.name, r]));
    assert.match(plateText(by['Priya Shah']), /↑ \+10 lb over last best/, "Priya's 245 over 235");
    assert.match(plateText(by['Drew Oyelaran']), /↑ \+1\.8 mi over last best/, "Drew's 18.2 over 16.4");
    assert.match(plateText(by['Quinn Harper']), /First on the wall/, "Quinn's first back squat");
    for (const r of bsWallDemoRows()) {
      assert.doesNotMatch(plateText(r), /\{gain\}|\{unit\}/, 'no placeholder reaches the screen');
    }
  });
});

test('the figure and its unit are stated on every plate', () => {
  withCopyValues(() => {
    const by = Object.fromEntries(bsWallDemoRows().map((r) => [r.name, r]));
    assert.match(plateText(by['Priya Shah']), /245.*lb/s);
    assert.match(plateText(by['Priya Shah']), /× 3/, 'a set of three says so');
    assert.match(plateText(by['Drew Oyelaran']), /18\.2.*mi/s);
    assert.doesNotMatch(plateText(by['Drew Oyelaran']), /×/, 'a run has no reps');
  });
});

test('an unstamped record says so and a co-signed one does not', () => {
  const rows = bsWallDemoRows();
  const stamped = rows.filter((r) => r.act.cosign);
  const unstamped = rows.filter((r) => !r.act.cosign);
  assert.ok(stamped.length > 0 && unstamped.length > 0, 'the preview covers both states');
  for (const r of stamped) assert.ok(!plateText(r).includes('Not yet stamped'), `${r.name} is stamped`);
  for (const r of unstamped) assert.ok(plateText(r).includes('Not yet stamped'), `${r.name} is not`);
});

test('a coach co-signing in this session clears the plate\'s unstamped foot', () => {
  // The card reads an optimistic co-sign out of ctx the moment the coach taps;
  // a foot that kept saying "not yet stamped" underneath it would contradict
  // the line right above it.
  const rec = bsWallDemoRows().find((r) => !r.act.cosign);
  const ctx = wallCtx();
  assert.ok(drive(BSWallPlate, { rec, ctx, newest: false }).text.includes('Not yet stamped'));
  // ⚠ THE KEY IS DERIVED, NOT READ OFF `.key`. A demo activity carries none, so
  // an earlier version of this test wrote the map under `undefined` — and the
  // plate, which also read `a.key`, found it there. Both were wrong together,
  // which is exactly the shape a test cannot catch by agreeing with the code.
  const k = bsActivityKey(rec.act);
  assert.ok(k && k !== 'undefined|undefined', 'a demo card still has an identity');
  ctx.feedCtx.actCoSign = { [k]: { name: 'You', role: 'trainer' } };
  assert.ok(!drive(BSWallPlate, { rec, ctx, newest: false }).text.includes('Not yet stamped'));
});

test('choosing a lift narrows the board to that lift', () => {
  // The filter was unguarded until a mutation that ignored it outright survived
  // the suite — every other test looks at the unfiltered board.
  const d = drive(BSWall, { ctx: wallCtx() });
  const all = d.nodes().filter((n) => n.type === BSWallPlate).length;
  assert.ok(all > 1, 'the preview has several lifts to narrow from');
  const select = d.nodes().find((n) => n.type === 'select' && typeof n.props.onChange === 'function');
  assert.ok(select, 'the board offers a lift filter');
  select.props.onChange({ target: { value: 'deadlift' } });
  d.render();
  const shown = d.nodes().filter((n) => n.type === BSWallPlate);
  assert.equal(shown.length, 1, 'one lift, one plate');
  assert.equal(shown[0].props.rec.liftKey, 'deadlift');
});

test('the scope sub-tabs name the coach side by who is asking', () => {
  const asMember = drive(BSWall, { ctx: wallCtx({ loggedIn: true }) }).text;
  const asCoach = drive(BSWall, { ctx: wallCtx({ loggedIn: true, myRole: 'trainer' }) }).text;
  assert.ok(asMember.includes("Coach's clients") && !asMember.includes('My clients'));
  assert.ok(asCoach.includes('My clients') && !asCoach.includes("Coach's clients"));
});

test('a preview visitor is offered no scope it cannot be answered on', () => {
  // The scopes are resolved from the caller's own follows and coach links.
  // Signed out there are none, so three tabs would highlight and change
  // nothing — and filtering the sample cast by an invented "following" would
  // be a fabrication.
  const text = drive(BSWall, { ctx: wallCtx() }).text;
  for (const label of ['Everyone', 'Following', "Coach's clients", 'My clients']) {
    assert.ok(!text.includes(label), `${label} is not offered in the preview`);
  }
  assert.ok(text.includes('All lifts'), 'but the lift filter is, because it works');
});

test('a lift the loaded rows do not carry cannot empty the board', () => {
  // Picking a lift on one scope and switching to another left the selection in
  // place: the board went empty over rows that existed, and with one lift or
  // none in the new scope the <select> is not rendered, so there was no way
  // back.
  const d = drive(BSWall, { ctx: wallCtx() });
  const before = d.nodes().filter((n) => n.type === BSWallPlate).length;
  const select = d.nodes().find((n) => n.type === 'select' && typeof n.props.onChange === 'function');
  select.props.onChange({ target: { value: 'a-lift-nobody-has' } });
  d.render();
  assert.equal(d.nodes().filter((n) => n.type === BSWallPlate).length, before, 'the board is unchanged');
  const after = d.nodes().find((n) => n.type === 'select');
  assert.equal(after.props.value, 'all', 'and the control says so');
});

test('a bare record still names the member it belongs to', () => {
  // The attribution a plate usually shows lives inside the wrapped card, so a
  // row with no readable post was an anonymous number on a board of other
  // people's records.
  const rec = { ...bsWallDemoRows()[0], act: null };
  const text = drive(BSWallPlate, { rec, ctx: wallCtx(), newest: false }).text;
  assert.ok(text.includes(rec.name), 'the member is named');
  assert.ok(text.includes(rec.liftLabel), 'beside their record');
});

test('signed in with the read still in flight, the board says it is reading', () => {
  // Not an empty board: "no records" is the positive claim that nobody has set
  // one, and a wall that says it while still loading is asserting something it
  // has not read.
  const text = drive(BSWall, { ctx: wallCtx({ loggedIn: true }) }).text;
  assert.ok(text.includes('Reading the wall'));
  assert.ok(!text.includes('No records on the wall yet'));
});

test('signed in, the sample cast never appears', () => {
  // ⚠ ASSERT ON THE PLATES, NOT ON THE TEXT. A demo name is only ever painted
  // INSIDE a plate, and the driver does not render child components — so a text
  // assertion here passed even with the demo board leaking to a signed-in
  // account. Mutation-proven: `rows || bsWallDemoRows()` survived it.
  const d = drive(BSWall, { ctx: wallCtx({ loggedIn: true }) });
  assert.equal(d.nodes().filter((n) => n.type === BSWallPlate).length, 0, 'no plate before a read resolves');
  assert.ok(!d.text.includes('Sample records'), 'and no preview note');
});

test('Post a PR is offered to a member, never to a preview visitor', () => {
  assert.ok(!drive(BSWall, { ctx: wallCtx() }).text.includes('Post a PR'));
  assert.ok(drive(BSWall, { ctx: wallCtx({ loggedIn: true }) }).text.includes('Post a PR'));
  assert.ok(!previewingSignedIn(() => drive(BSWall, { ctx: wallCtx({ loggedIn: true }) }).text).includes('Post a PR'));
});

// A prospect who tapped PREVIEW THE APP FIRST from the paywall: signed in, and
// not a member. `window.ShapeCanChat` is the shell's own member signal.
function previewingSignedIn(fn) {
  const prev = globalThis.window.ShapeCanChat;
  globalThis.window.ShapeCanChat = false;
  try { return fn(); } finally { globalThis.window.ShapeCanChat = prev; }
}

test('a signed-in prospect previewing the app still sees the sample board', () => {
  // ⚠ THE WALL ASKED "SIGNED IN?" WHEN THE QUESTION IS "IS THIS A MEMBER?".
  // Someone previewing from the paywall may well be signed in, and for them the
  // live read comes back honest and EMPTY — leaving the one surface in Chat
  // that shows a prospect nothing at all.
  const live = drive(BSWall, { ctx: wallCtx({ loggedIn: true }) });
  assert.equal(live.nodes().filter((n) => n.type === BSWallPlate).length, 0, 'a member waits on the read');

  const d = previewingSignedIn(() => drive(BSWall, { ctx: wallCtx({ loggedIn: true }) }));
  assert.equal(d.nodes().filter((n) => n.type === BSWallPlate).length, BS_WALL_DEMO.length, 'a prospect sees the board');
  assert.ok(d.text.includes('Sample records'), 'labelled as samples');
  assert.ok(!d.text.includes('No records on the wall yet'), 'and never an empty claim');
});

test('a signed-in prospect is invited to join, not told to sign in', () => {
  // Naming the one step they have already taken is the #2005 defect.
  const out = previewingSignedIn(() => drive(BSWall, { ctx: wallCtx({ loggedIn: true }) }).text);
  assert.ok(out.includes('Join Shape'), 'invited to join');
  assert.ok(!out.includes('Sign in'), 'never told to sign in');
  const signedOut = drive(BSWall, { ctx: wallCtx() }).text;
  assert.ok(signedOut.includes('Sign in'), 'a genuinely signed-out visitor still is');
});

test('a member whose wall is empty is told so, not shown strangers', () => {
  // The feed falls back to its demo cast whenever its live read is empty, which
  // shows a paying member a cast of strangers with nothing saying so. This does
  // not copy that: the sample board is for people who cannot have a wall yet.
  const src = bare.slice(bare.indexOf('function BSWall({ ctx })'));
  assert.match(src, /const rowsEff = previewing \? bsWallDemoRows\(\) : rows;/,
    'the sample board is gated on previewing, never on the read coming back empty');
});

test('the unit choice carries no translatable copy', () => {
  // lb / kg are symbols. Keying them would ship thirteen identical values a
  // translator must not touch; hardcoding them in JSX would land the sheet in
  // the i18n ratchet's PARTIAL set. A constant is neither.
  assert.deepEqual(BS_WALL_UNITS, ['lb', 'kg']);
});

// ── the segment's place in the page ─────────────────────────────────────────

test('the Wall is the second segment, between Feed and Team', () => {
  // Order is the invariant (the owner asked for a fourth segment BESIDE Feed),
  // so the keys are read out of the shipped pill row rather than its wording.
  const line = bare.split('\n').find((l) => l.includes('.map(([k, l, b])'));
  assert.ok(line, 'the pill row was not found — has it been restructured?');
  const keys = [...line.matchAll(/\['([a-z]+)', tr\('feed:tab\./g)].map((m) => m[1]);
  assert.deepEqual(keys, ['feed', 'wall', 'teams', 'channels', 'support']);
  // The grid must gain a column with the segment, or five pills share four
  // slots and the last one is clipped off a 375px phone.
  const grid = bare.split('\n').find((l) => l.includes('gridTemplateColumns') && l.includes(`1px solid ${'$'}{hair}`) && l.includes('borderRadius: 12'));
  assert.ok(grid, 'the pill row container was not found');
  assert.match(grid, new RegExp(`repeat\\(${keys.length}, 1fr\\)`));
});

test('the masthead title follows the Wall like every other segment', () => {
  assert.ok(/tab === 'wall' \? tr\('feed:masthead\.titleWall'/.test(bare));
});

// ── the data layer ──────────────────────────────────────────────────────────

const BACKEND = new URL('../mobile-app/src/services/shapeBackend.js', import.meta.url);
const backendSrc = readFileSync(BACKEND, 'utf8');

function extractFn(marker) {
  const at = backendSrc.indexOf(marker);
  assert.notEqual(at, -1, `marker not found in shapeBackend.js: ${marker}`);
  assert.equal(backendSrc.indexOf(marker, at + 1), -1, `marker is ambiguous: ${marker}`);
  // ⚠ THE BODY BRACE IS NOT THE FIRST BRACE. `async function f({ a } = {}) {`
  // opens with a DESTRUCTURING brace, so a naive indexOf('{') matched it and the
  // depth walk ended at the end of the parameter list — handing back a fragment
  // that is not a function. Track parens and take the first `{` outside them.
  let paren = 0;
  let open = -1;
  for (let i = backendSrc.indexOf('(', at); i < backendSrc.length; i++) {
    const c = backendSrc[i];
    if (c === '(') paren++;
    else if (c === ')') paren--;
    else if (c === '{' && paren === 0) { open = i; break; }
  }
  assert.ok(open > 0, `no body found for ${marker}`);
  let depth = 0;
  for (let i = open; i < backendSrc.length; i++) {
    if (backendSrc[i] === '{') depth++;
    else if (backendSrc[i] === '}' && --depth === 0) return backendSrc.slice(at, i + 1);
  }
  throw new Error(`unbalanced braces after ${marker}`);
}

// A live copy of the two reads over an injected supabase + session.
function backend({ rpc, posts, ledger, uid = 'me' } = {}) {
  const from = (table) => {
    const q = {
      select: () => q, eq: () => q, order: () => q, limit: () => q,
      in: () => (table === 'community_posts' ? posts : ledger),
      then: undefined,
    };
    // pr_wall_posts resolves at the end of its chain; community_posts at .in().
    q.limit = () => ledger;
    return q;
  };
  const supabase = { rpc: async () => rpc, from };
  const body = [
    "const COMMUNITY_POST_SELECT = '*';",
    'const communityPostFromRow = (r) => ({ id: r.id, name: r.author_name, cosign: r.cosign || null });',
    extractFn('function bsPRWallRow(r, byId)'),
    extractFn('async function listPRWall('),
    extractFn('async function myPRLedger('),
    'return { bsPRWallRow, listPRWall, myPRLedger };',
  ].join('\n');
  // eslint-disable-next-line no-new-func
  return new Function('supabase', 'state', body)(supabase, { user: { id: uid } });
}

const WALL_ROW = {
  user_id: 'u1', full_name: 'Ada', avatar_url: '', role: 'client',
  lift_key: 'bench press', lift_label: 'Bench Press', best_value: '235', prev_value: '225',
  unit: 'lb', reps: '2', posted_at: '2026-09-10T00:00:00Z', post_id: 'p1',
};

test('a failed wall read is an error, never an empty board', () => {
  // An empty list is the positive claim "nobody has a record". A read that
  // failed has made no claim at all, and the surface branches on the two.
  const b = backend({ rpc: { data: null, error: { message: 'boom' } } });
  return b.listPRWall({}).then((res) => {
    assert.equal(res.stored, 'local');
    assert.deepEqual(res.data, []);
    assert.ok(res.error, 'the error travels with it');
  });
});

test('a wall row is mapped whole, with numbers as numbers', () => {
  const b = backend({ rpc: { data: [WALL_ROW], error: null }, posts: { data: [], error: null } });
  return b.listPRWall({}).then((res) => {
    assert.equal(res.stored, 'supabase');
    const r = res.data[0];
    assert.equal(r.name, 'Ada');
    assert.equal(r.liftLabel, 'Bench Press');
    // PostgREST hands numerics back as strings; a header that formats them has
    // to be given numbers or "235" - "225" is a NaN.
    assert.strictEqual(r.best, 235);
    assert.strictEqual(r.prev, 225);
    assert.strictEqual(r.reps, 2);
    assert.equal(bsWallGain(r.best, r.prev), 10);
  });
});

test('a null previous best survives the mapping as null, not as zero', () => {
  const b = backend({
    rpc: { data: [{ ...WALL_ROW, prev_value: null, reps: null }], error: null },
    posts: { data: [], error: null },
  });
  return b.listPRWall({}).then((res) => {
    assert.strictEqual(res.data[0].prev, null);
    assert.strictEqual(res.data[0].reps, null);
    assert.equal(bsWallHeader(res.data[0]).first, true);
  });
});

test('the record carries its post when the caller can read it', () => {
  const b = backend({
    rpc: { data: [WALL_ROW], error: null },
    posts: { data: [{ id: 'p1', author_name: 'Ada', cosign: { name: 'Dana', role: 'trainer' } }], error: null },
  });
  return b.listPRWall({}).then((res) => {
    assert.ok(res.data[0].post, 'the post is attached');
    assert.equal(res.data[0].post.cosign.name, 'Dana');
  });
});

test('a post the caller cannot read degrades to a bare record, not to a failed read', () => {
  // RLS decides whether a post is visible; the definer only returns its id. A
  // missing post means the number is still true and simply has no evidence.
  const b = backend({ rpc: { data: [WALL_ROW], error: null }, posts: { data: null, error: { message: 'rls' } } });
  return b.listPRWall({}).then((res) => {
    assert.equal(res.stored, 'supabase', 'the wall itself read fine');
    assert.equal(res.data.length, 1);
    assert.equal(res.data[0].post, null);
  });
});

test('your own ledger reports a failed read the same way', () => {
  const b = backend({ ledger: { data: null, error: { message: 'boom' } } });
  return b.myPRLedger().then((res) => {
    assert.equal(res.stored, 'local');
    assert.deepEqual(res.data, []);
    assert.ok(res.error);
  });
});

test('a post id is forwarded only when it is one', () => {
  // PostgREST rejects the whole call on a malformed uuid, which would lose the
  // record itself and not just its link — so the shape is checked before it is
  // sent. The RPC remains the authority on OWNERSHIP.
  const m = backendSrc.match(/const BS_UUID_RE = (\/.*\/i);/);
  assert.ok(m, 'the uuid guard was not found');
  // eslint-disable-next-line no-eval
  const re = eval(m[1]);
  assert.ok(re.test('3f2504e0-4f89-11d3-9a0c-0305e82c3301'));
  assert.ok(!re.test('p1'));
  assert.ok(!re.test(''));
  assert.ok(!re.test('3f2504e0-4f89-11d3-9a0c-0305e82c3301; drop table'));
});

test('a session PR is never linked to the session post', () => {
  // A session can hold several PRs and there is ONE post for it, so linking it
  // to each would point every ledger row at the same activity: the Wall would
  // render that card two or three times, and the card files reactions,
  // comments and open-state under the post's id — so tapping comment on one
  // plate would open the composer on all of them.
  // ⚠ stripComments FIRST — the comment explaining WHY there is no post id
  // names it, and an unstripped body matched its own rationale.
  const fn = stripComments(extractFn('async function announcePRsFromSetLogs('));
  assert.doesNotMatch(fn, /postId/, 'no post id reaches the announce');
  assert.doesNotMatch(bare_backend(), /announcePRsFromSetLogs\(setLogs,/, 'and none is passed at the call site');
});

test('a set-logged PR records the unit it was lifted in', () => {
  // This hardcoded 'lb', which was invisible while a PR was only a line of chat
  // text. The Wall prints the unit beside the number and computes a delta
  // against the stored best, so a kg lifter's 100 kg was headlined "100 lb".
  const posted = [];
  const body = [
    extractFn('async function announcePRsFromSetLogs('),
    'return announcePRsFromSetLogs;',
  ].join('\n');
  // eslint-disable-next-line no-new-func
  const announce = new Function('postPRToWall', body)(async (a) => { posted.push(a); });
  return announce([
    { moveName: 'Back squat', actualLoad: '100 kg', actualReps: 3, completed: true },
    { moveName: 'Bench press', actualLoad: '225 lb', actualReps: 5, completed: true },
    { moveName: 'Back squat', actualLoad: '90 kg', actualReps: 5, completed: true },
  ]).then(() => {
    const by = Object.fromEntries(posted.map((x) => [x.lift, x]));
    assert.equal(by['Back squat'].unit, 'kg');
    assert.equal(by['Back squat'].value, 100, 'the heaviest completed set of that move');
    assert.equal(by['Bench press'].unit, 'lb');
    assert.ok(posted.every((x) => x.postId === undefined), 'and no post is linked');
  });
});

test('the route omits the post id when there is none, and falls back when the migration has not run', () => {
  // The 5-argument signature DROPS the 4-argument one, so between a deploy and
  // an apply — in either order — one shape is wrong, and PostgREST answers an
  // unknown signature with PGRST202 which the app surfaces as a silent
  // { ok: false }.
  const route = stripComments(readFileSync(new URL('../src/app/api/community/pr-wall/route.ts', import.meta.url), 'utf8'));
  assert.match(route, /postId \? \{ \.\.\.base, p_post_id: postId \} : base/, 'omitted when absent');
  assert.match(route, /PGRST202/, 'and retried without it when the signature is unknown');
});

test('the PR is announced AFTER the post exists, carrying its id', () => {
  // Announcing first left every ledger row pointing at nothing, and a failed
  // insert advanced the ledger for a record that was never posted.
  const insert = backendSrc.indexOf(".insert(payload)");
  const announce = backendSrc.indexOf("window.ShapePRWall.post({ lift: _lift");
  assert.ok(insert > 0 && announce > 0);
  assert.ok(announce > insert, 'the announce follows the insert');
  assert.ok(/window\.ShapePRWall\.post\(\{ lift: _lift, value: _loadNum, unit: _unit, postId: data\?\.id \|\| null \}\)/.test(bare_backend()));
});

function bare_backend() { return stripComments(backendSrc); }
