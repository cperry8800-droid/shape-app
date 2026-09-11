// The Wall — the record board in the app's chat page (review 2026-09-10 §7).
//
// ⚠ THE SURFACE IS DRIVEN, NOT GREPPED. `BSWallYourBest` is mounted through the
// shared broadsheet harness and its rendered text is what the assertions read,
// so an equivalent rewrite passes and a real regression fails. A source-text pin
// cannot tell those two apart — the lesson this repo has now paid for four
// times in one wave.
//
// ⚠ AND DRIVING A COMPONENT IS NOT EVIDENCE THE APP RENDERS IT. `loadBroadsheet`
// appends its own export to the source, so every test here passed for three
// weeks against a Wall segment #2036 had already unmounted. See 'every Wall
// component this suite drives is actually rendered by the app'.
//
// The data layer cannot be imported (shapeBackend.js is a classic browser
// script), so its three Wall functions are brace-matched out of the shipped
// file and evaluated against stubs — the tests/radio-ask-gate.test.mjs method.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadBroadsheet, drive, SHIM, THEME, SRC, textOf } from './helpers/broadsheet-mount.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

// BSPlate is destructured off `window` when the module evaluates, so the stub
// has to stand before the load. It is a frame, and this suite is about what the
// frame CONTAINS.
globalThis.BSPlate = ({ children }) => SHIM.createElement('div', null, children);
globalThis.window.ShapeAuth = { getCachedState: () => ({ user: null }) };

const {
  BSWallYourBest, BSActivityCard, bsActivityKey, bsWallGain, bsWallNum,
  bsWallBulletinPick, BS_WALL_UNITS, bsWallTrace, COMMUNITY_ACTIVITIES, bsWallYourBest,
} = await loadBroadsheet([
  'BSWallYourBest', 'BSActivityCard', 'bsActivityKey', 'bsWallGain', 'bsWallNum',
  'bsWallBulletinPick', 'BS_WALL_UNITS', 'bsWallTrace', 'COMMUNITY_ACTIVITIES',
  'bsWallYourBest',
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

test('both ways to post are offered to a member, never to a preview visitor', () => {
  // ⚠ TWO CONTROLS, AND THE SECOND IS THE ONE A WATCH-MISSED SESSION NEEDS.
  // "Post a PR" writes one number to the ledger and the server refuses it unless
  // it beats their stored best; "Post an activity" publishes a whole session to
  // the feed and their profile and claims nothing. A member who ran without the
  // app has no record to declare — they have a session — so offering only the
  // first leaves them with a control that will reject them.
  const out = drive(BSWallYourBest, { loggedIn: true, onLogActivity() {} }).text;
  assert.ok(out.includes('Post a PR'), 'the record path');
  assert.ok(out.includes('Post an activity'), 'the session path');

  const signedOut = drive(BSWallYourBest, { loggedIn: false, onLogActivity() {} }).text;
  assert.ok(!signedOut.includes('Post a PR') && !signedOut.includes('Post an activity'));
  const prospect = previewingSignedIn(() => drive(BSWallYourBest, { loggedIn: true, onLogActivity() {} }).text);
  assert.ok(!prospect.includes('Post a PR') && !prospect.includes('Post an activity'),
    'a signed-in prospect is not a member — neither control writes anything they own');
});

test('the activity button calls the publisher, it does not open the PR sheet', () => {
  // ⚠ DRIVEN, NOT GREPPED, because the two buttons sit side by side and wiring
  // them to the same handler is the easy mistake: a member reaching for "my
  // watch missed this run" would land in a form that asks for a lift and a
  // one-rep max. The handler is the parent's — the SAME BSLogActivitySheet the
  // composer's icon opens — so the session lands on the feed and the profile.
  let opened = 0;
  const d = drive(BSWallYourBest, { loggedIn: true, onLogActivity: () => { opened += 1; } });
  const btn = d.nodes().find((n) => n.type === 'button' && textOf(n).includes('Post an activity'));
  assert.ok(btn, 'the activity control is a button');
  btn.props.onClick();
  assert.equal(opened, 1, 'it calls the publisher the parent passed');
});

// A prospect who tapped PREVIEW THE APP FIRST from the paywall: signed in, and
// not a member. `window.ShapeCanChat` is the shell's own member signal.
function previewingSignedIn(fn) {
  const prev = globalThis.window.ShapeCanChat;
  globalThis.window.ShapeCanChat = false;
  try { return fn(); } finally { globalThis.window.ShapeCanChat = prev; }
}

test('a signed-in prospect is invited to join, not told to sign in', () => {
  // Naming the one step they have already taken is the #2005 defect.
  const out = previewingSignedIn(() => drive(BSWallYourBest, { loggedIn: true, onLogActivity() {} }).text);
  assert.ok(out.includes('Join Shape'), 'invited to join');
  assert.ok(!out.includes('Sign in'), 'never told to sign in');
  const signedOut = drive(BSWallYourBest, { loggedIn: false, onLogActivity() {} }).text;
  assert.ok(signedOut.includes('Sign in'), 'a genuinely signed-out visitor still is');
});

test('the unit choice carries no translatable copy', () => {
  // lb / kg are symbols. Keying them would ship thirteen identical values a
  // translator must not touch; hardcoding them in JSX would land the sheet in
  // the i18n ratchet's PARTIAL set. A constant is neither.
  assert.deepEqual(BS_WALL_UNITS, ['lb', 'kg']);
});

// ── the segment's place in the page ─────────────────────────────────────────

test('the Wall is NOT a segment — it is the activity sub-tab', () => {
  // ⚠ THIS TEST ASSERTED THE OPPOSITE YESTERDAY, AND THE ASSERTION WAS THE
  // DEFECT. A fifth segment beside the Feed rendered the same BSActivityCard
  // with a variant flag, so the two read as one thing wearing two hats — with
  // four rows of scope controls between them and "Following" duplicated
  // verbatim. Owner: "the wall and feed are the same thing" / "the wall is
  // supposed to be a redesign of the shape feed". The Wall IS the activity
  // feed, and the segment row is back to what it was before.
  const line = bare.split('\n').find((l) => l.includes('.map(([k, l, b])'));
  assert.ok(line, 'the pill row was not found — has it been restructured?');
  const keys = [...line.matchAll(/\['([a-z]+)', tr\('feed:tab\./g)].map((m) => m[1]);
  assert.deepEqual(keys, ['feed', 'teams', 'channels', 'support'],
    'the Wall must not be a segment of its own — it IS the activity feed');
  // The grid's column count tracks the pill count, or the last pill is clipped
  // off a 375px phone.
  const grid = bare.split('\n').find((l) => l.includes('gridTemplateColumns') && l.includes('1px solid ' + String.fromCharCode(36) + '{hair}') && l.includes('borderRadius: 12'));
  assert.ok(grid, 'the pill row container was not found');
  assert.match(grid, new RegExp('repeat\\(' + keys.length + ', 1fr\\)'));
});

test("every Wall component this suite drives is actually rendered by the app", () => {
  // ⚠ THE GUARD THIS SUITE DID NOT HAVE, AND THE REASON IT NEEDS ONE.
  // `loadBroadsheet` appends its OWN `export { … }` to the source and compiles
  // it, so it reaches a component whether or not a single line of the app
  // renders one. #2036 deleted the Wall segment's only mount and every test
  // here kept passing — including one asserting that a signed-in member is
  // offered "Post a PR", which for three weeks no member could see. A suite
  // that cannot tell a mounted surface from an unmounted one is not reporting
  // on the app; it is reporting on itself.
  //
  // The corpus is DERIVED from this file's own import list, so a component
  // added to the drive set later is covered without anyone remembering this
  // test exists — and a sweep that finds nothing to check fails rather than
  // passing vacuously.
  const imports = readFileSync(new URL(import.meta.url), 'utf8');
  const list = imports.match(/await loadBroadsheet\(\[([\s\S]*?)\]\)/);
  assert.ok(list, "this test cannot find the suite's own import list");
  // COMPONENTS only: PascalCase, which by this file's convention means an
  // initial capital AND a lowercase letter, no underscore. `BS_WALL_UNITS` and
  // `COMMUNITY_ACTIVITIES` are constants — nothing renders a constant, and a
  // guard that demanded it would be noise the next reader learns to ignore.
  const driven = [...list[1].matchAll(/'([A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*)'/g)].map((m) => m[1]);
  assert.ok(driven.length >= 2, `expected the suite to drive several components, found ${driven.length}`);

  for (const name of driven) {
    // Rendered somewhere: as JSX (`<Name`) at a site that is not its own
    // declaration. `bare` is the comment-stripped source, so a component named
    // only in prose cannot satisfy this.
    const mounted = new RegExp('<' + name + '[\\s/>]').test(bare);
    assert.ok(mounted, `${name} is driven by this suite but nothing in the app renders it — either mount it or stop testing it as though it ships`);
  }
});

test('every profile activity feed renders the wall design too', () => {
  // Owner, 2026-09-11: "the new wall designs needs to match the profile activity
  // feed as well". A record read on a profile and the same record read on the
  // Wall must not be two different objects — so the variant is asserted at EVERY
  // profile feed rather than at the two this change happened to touch.
  //
  // The corpus is derived: every BSActivityCard render that hands it the profile
  // ctx is a profile feed by construction, so a third one added later is covered
  // without anyone remembering this test exists.
  const sites = bare.split('\n').filter((l) => l.includes('<BSActivityCard') && l.includes('ctx={profileCtx}'));
  assert.ok(sites.length >= 2, `expected the member and coach profile feeds, found ${sites.length}`);
  for (const line of sites) {
    assert.match(line, /variant="wall"/,
      'a profile activity feed is still rendering the old feed card: ' + line.trim().slice(0, 90));
  }
});

test('the activity sub-tab is labelled Wall and renders the wall design', () => {
  // The label moved off "Shape" onto the Wall; the KEY stays COMMUNITY, because
  // renaming it would touch every filter comparison in the component.
  assert.match(bare, /k === 'COMMUNITY' \? tr\('feed:tab\.wall'/,
    'the activity sub-tab must be labelled Wall');
  // ⚠ THE DESIGN IS THE VARIANT, NOT A SECOND COMPONENT. variant="wall" draws
  // the dot-matrix hero figure, the wall facts, the stat grid, the HR zones and
  // the trace — so the feed's own cards must ask for it.
  const card = bare.split('\n').find((l) => l.includes('cards.map((a, i)') && l.includes('BSActivityCard'));
  assert.ok(card, 'the activity card render was not found');
  assert.match(card, /variant="wall"/, 'the activity feed must render the wall design');
});

test('there is no second Wall — the retired segment is gone from every path', () => {
  // ⚠ REMOVING THE PILL WAS NOT ENOUGH. Home's "On the wall" card fires
  // shape:goWall, which set tab='wall' — so a SECOND Wall stayed alive with no
  // pill, reachable only from Home, carrying its own lift dropdown and scope
  // chips. Owner: "don't need 2 wall tabs". The deep link lands on the activity
  // sub-tab, which IS the Wall.
  assert.ok(!/setTab\('wall'\)/.test(bare), 'nothing may route to a wall segment');
  assert.ok(!/tab === 'wall'/.test(bare), 'no branch may render a wall segment');
  // And the deep link still arrives somewhere real, rather than being dropped.
  const idx = bare.indexOf('openRequest.wall');
  assert.ok(idx > 0, "the Home deep-link branch was removed — it should RETARGET, not vanish");
  const branch = bare.slice(idx, idx + 900);
  assert.match(branch, /setTab\('feed'\)/, 'the wall deep link must land on the feed segment');
  assert.match(branch, /setFilter\('COMMUNITY'\)/, 'and select the activity sub-tab, which is the Wall');
  // ⚠ AND THE LENS. Codex on #2036: `feedMode` is persisted per device while
  // BSHomeWallBulletin picks its record from the everyone-scoped
  // ShapePRWall.list(), so a member who last chose FOLLOWING would land on a
  // feed that cannot hold the record Home just advertised.
  assert.match(branch, /setFeedMode\('universal'\)/, 'and reset the lens to the scope the bulletin read from');
  // setFeedMode, never switchFeedMode: a navigation must not overwrite the
  // member's own standing choice of lens.
  assert.ok(!/switchFeedMode/.test(branch), 'the deep link must not persist the lens over the member\'s choice');
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
    // ⚠ ASKED OF THE LIVE PRIMITIVE. The plate's own header formatter carried
    // this check and died with the plate; `bsWallGain` is what the card's wall
    // pill reads, so the question — "is there a previous best to improve on?" —
    // is now asked of the code that actually runs.
    assert.equal(bsWallGain(res.data[0].best, res.data[0].prev), null, 'no previous best, so no gain to quote');
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
  // ⚠ `_liftToLb` IS LIFTED FROM THE SOURCE, NOT STUBBED — and its absence was
  // INVISIBLE rather than loud: `announcePRsFromSetLogs` wraps its whole body
  // in a best-effort catch, so a ReferenceError for a missing helper announced
  // nothing at all and the assertion failed as "no such lift" instead of as
  // "the harness is incomplete". A scope that omits part of the unit under
  // test is a broken instrument, and a swallowing catch hides which one it is.
  const body = [
    'const LB_TO_KG_BACKEND = 0.45359237;',
    extractFn('function _liftToLb('),
    extractFn('async function announcePRsFromSetLogs('),
    'return announcePRsFromSetLogs;',
  ].join('\n');
  // eslint-disable-next-line no-new-func
  const announce = new Function('postPRToWall', '_setLogUnit', body)(
    async (a) => { posted.push(a); },
    // the shipped writer's own rule, extracted rather than restated
    new Function('return ' + extractFn('function _setLogUnit(entry)') + '; ')(),
  );
  return announce([
    // ⚠ THE FIRST ONE IS THE CASE THE FIRST FIX MISSED. The live set logger
    // stores the number and the unit in SEPARATE fields, so the load string
    // carries no "kg" to sniff and every metric set was filed as lb.
    { moveName: 'Back squat', actualLoad: 100, unit: 'kg', actualReps: 3, completed: true },
    { moveName: 'Bench press', actualLoad: '225 lb', actualReps: 5, completed: true },
    { moveName: 'Back squat', actualLoad: 90, unit: 'kg', actualReps: 5, completed: true },
    { moveName: 'Front squat', actualLoad: '80', loadUnit: 'kg', actualReps: 3, completed: true },
    // ⚠ ONE MOVE, TWO UNITS IN ONE SESSION — the case `_liftToLb` exists for.
    // 100 kg is 220.5 lb, so it is the heavier set; comparing the bare numbers
    // put it BEHIND the 200 lb one and announced the lighter lift as the PR.
    { moveName: 'Deadlift', actualLoad: 200, unit: 'lb', actualReps: 1, completed: true },
    { moveName: 'Deadlift', actualLoad: 100, unit: 'kg', actualReps: 1, completed: true },
  ]).then(() => {
    const by = Object.fromEntries(posted.map((x) => [x.lift, x]));
    assert.equal(by['Deadlift'].value, 100, 'the 100 kg set is the heavier one');
    assert.equal(by['Deadlift'].unit, 'kg', 'and it is announced in the unit it was lifted in');
    assert.equal(by['Back squat'].unit, 'kg', 'the explicit field wins');
    assert.equal(by['Back squat'].value, 100, 'the heaviest completed set of that move');
    assert.equal(by['Front squat'].unit, 'kg', 'under any of its spellings');
    assert.equal(by['Bench press'].unit, 'lb', 'and the string sniff still covers the old shape');
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

test("Home's record line prefers a stamped record but never vanishes without one", () => {
  // The wall read is a capped, newest-first WINDOW. A strict co-sign filter
  // finds nothing once enough unstamped records are newer than the latest
  // stamped one, and the Home line disappears while a co-signed record exists.
  const stamped = { name: 'Priya', post: { cosign: { name: 'Dana' } } };
  const plain = (n) => ({ name: n, post: { cosign: null } });
  assert.equal(bsWallBulletinPick([plain('a'), stamped, plain('b')]), stamped, 'the stamped one wins');
  assert.equal(bsWallBulletinPick([plain('a'), plain('b')]).name, 'a', 'else the newest');
  assert.equal(bsWallBulletinPick([{ name: 'c', post: null }]).name, 'c', 'a bare record still counts');
  assert.equal(bsWallBulletinPick([]), null, 'an empty wall has no line');
  assert.equal(bsWallBulletinPick(null), null, 'and neither does an unreadable one');
});

// ── the plate's preview of the session ──────────────────────────────────────

const cardText = (act, variant) =>
  drive(BSActivityCard, { a: act, ctx: feedCtx(), isLast: true, pagePad: 0, variant }).text;

const demoBy = (who) => COMMUNITY_ACTIVITIES.find((a) => a.who === who);

test('the preview is the WALL variant only — the feed card is untouched', () => {
  // The variant exists so the two surfaces cannot drift; if the feed started
  // rendering the preview, that promise is broken in the other direction.
  const priya = demoBy('Priya Shah');
  assert.match(cardText(priya, 'wall'), /HR zones/i, 'the wall previews the session');
  assert.doesNotMatch(cardText(priya, 'feed'), /HR zones/i, 'the feed still does not');
  assert.doesNotMatch(cardText(priya, 'feed'), /New PR ·/i, 'and carries no record pill');
});

test('the preview shows what the activity carries, not a fixed set of rows', () => {
  // ⚠ THIS IS THE "depending on the workout, these plates appear" PROMISE, and
  // it holds with no per-kind branch in the plate: the stat set is derived
  // upstream per activity type, so the plate just renders what came.
  const ride = cardText(demoBy('Marcus Bell'), 'wall');
  assert.match(ride, /Avg power/i);
  assert.match(ride, /Max power/i);
  const lift = cardText(demoBy('Priya Shah'), 'wall');
  assert.match(lift, /Volume/i);
  assert.doesNotMatch(lift, /Avg power/i, 'a lift brings no power figures');
  const swim = cardText(demoBy('Lena Fischer'), 'wall');
  assert.match(swim, /Avg pace/i, 'and a swim brings its own');
  assert.doesNotMatch(swim, /Volume/i);
  // ⚠ THE PREVIEW IS THE FIRST SIX, WHICH IS THE POINT OF IT BEING A PREVIEW.
  // The swim carries SWOLF eighth, so it is NOT here — it is behind Session
  // details, with everything else the activity holds. An assertion that looked
  // for it would be asking the preview to be the whole readout.
  assert.doesNotMatch(swim, /SWOLF/i, 'the eighth stat is behind Session details');
  assert.equal(
    drive(BSActivityCard, { a: demoBy('Lena Fischer'), ctx: feedCtx(), isLast: true, pagePad: 0, variant: 'wall' })
      .nodes().filter((n) => n.type === 'div' && n.props.style && n.props.style.gridTemplateColumns === 'repeat(3, minmax(0, 1fr))').length,
    1, 'one preview grid, three across',
  );
});

test('an activity with no zones and no trace renders neither, never an empty axis', () => {
  // Theo's rest day carries three stats and nothing else.
  const rest = demoBy('Theo Nakamura');
  assert.ok(rest && !rest.zones && !rest.trace, 'the fixture is the honest-empty one');
  const text = cardText(rest, 'wall');
  assert.doesNotMatch(text, /HR zones/i);
  assert.doesNotMatch(text, /Heart rate/i);
  assert.match(text, /Readiness/i, 'but what it does carry is previewed');
});

test('the trace scales to its own range, and refuses to draw a line from one point', () => {
  // A fixed 0-200 axis flattens every real session into the same ripple; the
  // shape of the effort is the point, and the figures beside it carry the
  // absolute numbers.
  assert.equal(bsWallTrace([140], '#0f766e'), null, 'one point is not a line');
  assert.equal(bsWallTrace([], '#0f766e'), null);
  assert.equal(bsWallTrace(null, '#0f766e'), null);
  const svg = bsWallTrace([100, 150, 100], '#0f766e', 100, 30);
  const pts = svg.props.children.props.points.split(' ').map((s) => s.split(',').map(Number));
  assert.equal(pts.length, 3);
  assert.ok(pts[1][1] < pts[0][1], 'the peak sits above the floor');
  assert.ok(Math.abs(pts[0][1] - pts[2][1]) < 0.01, 'equal values sit at the same height');
  // a flat trace must not divide by zero
  const flat = bsWallTrace([120, 120, 120], '#0f766e', 100, 30);
  assert.ok(flat, 'a flat session still draws');
  assert.ok(flat.props.children.props.points.split(' ').every((s) => Number.isFinite(Number(s.split(',')[1]))));
});

// ── Your best: their own logged record against what the wall carries ────────

test('an unposted record is the difference between their logs and the wall', () => {
  // ⚠ THE TWO NUMBERS ARE DIFFERENT THINGS. Owner: "PR is best on their last
  // logged weight. irrelevant if it was posted on wall or not." So a member who
  // has lifted 245 while the wall carries 225 is sitting on a 20 lb record, and
  // that gap is what the box exists to show.
  const rows = bsWallYourBest(
    [{ liftKey: 'deadlift', liftLabel: 'Deadlift', best: 245, unit: 'lb', reps: 3 }],
    [{ liftKey: 'deadlift', liftLabel: 'Deadlift', best: 225, unit: 'lb', postedAt: '2026-09-01T00:00:00Z' }],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].best, 245, 'their own best leads');
  assert.equal(rows[0].posted, 225);
  assert.equal(rows[0].gap, 20);
  assert.equal(rows[0].unposted, true);
});

test('a record already on the wall is a fact, not an action', () => {
  const rows = bsWallYourBest(
    [{ liftKey: 'squat', liftLabel: 'Squat', best: 315, unit: 'lb' }],
    [{ liftKey: 'squat', liftLabel: 'Squat', best: 315, unit: 'lb', postedAt: '2026-09-01T00:00:00Z' }],
  );
  assert.equal(rows[0].gap, null, 'nothing to close');
  assert.equal(rows[0].unposted, false);
});

test('a lift logged but never posted is unposted, with no gap to quote', () => {
  const rows = bsWallYourBest([{ liftKey: 'bench', liftLabel: 'Bench', best: 185, unit: 'lb' }], []);
  assert.equal(rows[0].unposted, true, 'it belongs on the wall');
  assert.equal(rows[0].gap, null, 'but there is no previous value to measure against');
  assert.equal(rows[0].posted, null);
});

test('a lift posted but never logged in-app still shows, and asks for nothing', () => {
  // They set it elsewhere and posted it by hand; there is no log to compare.
  const rows = bsWallYourBest([], [{ liftKey: 'clean', liftLabel: 'Clean', best: 135, unit: 'lb', postedAt: 'x' }]);
  assert.equal(rows[0].best, 135);
  assert.equal(rows[0].unposted, false);
  assert.equal(rows[0].gap, null);
});

test('a gap is never computed across units', () => {
  // ⚠ THE NUMBERS HAVE TO BE THE WRONG WAY ROUND FOR THIS TO TEST ANYTHING.
  // A first version used 100 kg against 225 lb, where the naive subtraction is
  // negative and yields null anyway — so it passed with the unit check removed.
  // 250 kg against 225 lb is the case that matters: unguarded it would announce
  // a confident "25 lb to the wall" out of a conversion that never happened.
  const rows = bsWallYourBest(
    [{ liftKey: 'deadlift', liftLabel: 'Deadlift', best: 250, unit: 'kg' }],
    [{ liftKey: 'deadlift', liftLabel: 'Deadlift', best: 225, unit: 'lb', postedAt: 'x' }],
  );
  assert.equal(rows[0].gap, null, 'no cross-unit arithmetic');
  assert.equal(rows[0].unposted, false, 'and no claim that it beats the wall');
  // the same pair in ONE unit is a real gap, so the guard is not just refusing
  assert.equal(bsWallYourBest(
    [{ liftKey: 'deadlift', liftLabel: 'Deadlift', best: 250, unit: 'lb' }],
    [{ liftKey: 'deadlift', liftLabel: 'Deadlift', best: 225, unit: 'lb', postedAt: 'x' }],
  )[0].gap, 25);
});

// ── the member's own logged best, out of their set logs ─────────────────────

function bestLifts({ rows = [], error = null, kgError = null, lbError = null, acts = [], actError = null, uid = 'me' } = {}) {
  const calls = [];
  // ⚠ THE SET-LOG READ IS SPLIT BY `load_unit`, so the stub has to FILTER — two
  // pages that both return every row would hand the code each set twice and
  // make a duplicate-tolerant max look like a passing test of a split it never
  // performed. `ilike` selects the metric page; `not(..., 'ilike', ...)` the
  // imperial one, matching the shipped query.
  const isKg = (r) => /kg/i.test(String(r.load_unit || 'lb'));
  const make = (data, err) => {
    let rowFilter = null;
    const q = {
      select: (...a) => { calls.push(['select', ...a]); return q; },
      eq: (...a) => { calls.push(['eq', ...a]); return q; },
      ilike: (...a) => { calls.push(['ilike', ...a]); rowFilter = isKg; return q; },
      not: (...a) => {
        calls.push(['not', ...a]);
        if (a[1] === 'ilike') rowFilter = (r) => !isKg(r);
        return q;
      },
      order: (...a) => { calls.push(['order', ...a]); return q; },
      limit: (n) => {
        const rowsOut = rowFilter ? (data || []).filter(rowFilter) : data;
        // ⚠ A PER-PAGE ERROR IS THE CASE THE FIX IS ABOUT. With one shared
        // error both pages fail together and `||` and `&&` are indistinguishable
        // — which is exactly how the "swallow a failed page" mutation survived.
        const pageErr = err
          || (rowFilter === isKg ? kgError : (rowFilter ? lbError : null));
        return { data: rowsOut && rowsOut.slice(0, n), error: pageErr };
      },
    };
    return q;
  };
  const supabase = { from: (tbl) => { calls.push(['from', tbl]); return tbl === 'activities' ? make(acts, actError) : make(rows, error); } };
  // ⚠ `_liftToLb` IS PART OF THE UNIT OF CODE UNDER TEST, so it is lifted from
  // the source too rather than stubbed. `myBestLifts` compares sets in POUNDS
  // via that helper (a 100 kg set must beat a 200 lb one), and a stub here
  // would be testing the stub's arithmetic instead of the shipped conversion.
  const body = [
    'const LB_TO_KG_BACKEND = 0.45359237;',
    extractFn('function _liftToLb('),
    extractFn('async function myBestLifts('),
    'return { myBestLifts, calls };',
  ].join('\n');
  // eslint-disable-next-line no-new-func
  const mod = new Function('supabase', 'state', 'calls', body)(supabase, { user: { id: uid } }, calls);
  return { run: mod.myBestLifts, calls };
}

test('the best is the HEAVIEST completed set, not the most recent', () => {
  // A "best" that tracked the last session would fall every time they deloaded,
  // and a deload week is not a lost PR.
  const { run } = bestLifts({ rows: [
    { move_name: 'Deadlift', actual_load: 205, actual_reps: 5, load_unit: 'lb', created_at: '2026-09-09' },
    { move_name: 'Deadlift', actual_load: 245, actual_reps: 3, load_unit: 'lb', created_at: '2026-09-02' },
    { move_name: 'deadlift', actual_load: 225, actual_reps: 3, load_unit: 'lb', created_at: '2026-08-26' },
  ] });
  return run().then((res) => {
    assert.equal(res.stored, 'supabase');
    assert.equal(res.data.length, 1, 'one row per lift, however it was capitalised');
    assert.equal(res.data[0].best, 245);
    assert.equal(res.data[0].reps, 3, 'the reps of the heaviest set, not of the latest');
  });
});

test('a set with no load is not a lift, and a failed read is not an empty log', () => {
  const { run } = bestLifts({ rows: [
    { move_name: 'Plank', actual_load: null, load_unit: 'lb', created_at: 'x' },
    { move_name: 'Squat', actual_load: 0, load_unit: 'lb', created_at: 'x' },
    { move_name: 'Squat', actual_load: 315, load_unit: 'kg', created_at: 'x' },
  ] });
  return run().then((res) => {
    assert.deepEqual(res.data.map((r) => r.liftKey), ['squat']);
    assert.equal(res.data[0].unit, 'kg', 'the unit comes off the row');
    return bestLifts({ error: { message: 'boom' } }).run();
  }).then((res) => {
    assert.equal(res.stored, 'local');
    assert.deepEqual(res.data, []);
    assert.ok(res.error, 'an empty list would claim they have logged nothing');
  });
});

test('the read is scoped to the caller and to completed sets', () => {
  const { run, calls } = bestLifts({ rows: [] });
  return run().then(() => {
    assert.ok(calls.some((c) => c[0] === 'from' && c[1] === 'workout_set_logs'));
    assert.ok(calls.some((c) => c[0] === 'eq' && c[1] === 'client_id' && c[2] === 'me'), 'their own rows');
    assert.ok(calls.some((c) => c[0] === 'eq' && c[1] === 'completed' && c[2] === true), 'completed sets only');
  });
});

test('the best is not decided by a recency cap', () => {
  // ⚠ THE READ ORDERED BY `created_at` AND CAPPED AT 2000, so a member past
  // that many completed loaded sets lost every older row and a heavier set
  // logged before the window vanished from "Your best". The cap is a property
  // of the query, so it has to be asserted on the query.
  const { run, calls } = bestLifts({ rows: [] });
  return run().then(() => {
    const orders = calls.filter((c) => c[0] === 'order');
    const setLogOrders = orders.filter((c) => c[1] === 'actual_load' || c[1] === 'created_at');
    assert.ok(setLogOrders.length, 'the set-log read does not order at all');
    for (const o of setLogOrders) {
      assert.equal(o[1], 'actual_load',
        'a capped read that answers a MAXIMUM must be ordered by the value it maximises, not by recency');
      assert.equal(o[2] && o[2].ascending, false, 'descending, or the cap keeps the lightest sets');
    }
  });
});

test('the capped read is split by unit, so kg rows are not truncated first', () => {
  // Ordering by a raw `actual_load` that mixes lb and kg puts a 100 kg set
  // (220.5 lb) BELOW a 150 lb one, so a metric member's heaviest rows are the
  // first ones the cap discards — the unit blindness, moved into the sort.
  const { run, calls } = bestLifts({ rows: [] });
  return run().then(() => {
    const metric = calls.filter((c) => c[0] === 'ilike' && c[1] === 'load_unit');
    const imperial = calls.filter((c) => c[0] === 'not' && c[1] === 'load_unit' && c[2] === 'ilike');
    assert.equal(metric.length, 1, 'no metric page');
    assert.equal(imperial.length, 1, 'no imperial page');
    assert.match(String(metric[0][2]), /kg/i);
    assert.match(String(imperial[0][3]), /kg/i);
  });
});

test('a heavier OLD set still wins, and a kg page is read alongside the lb one', () => {
  // Driven rather than asserted on the query: the heavier set is the OLDEST
  // row and is in the other unit, which is both failure modes at once.
  const { run } = bestLifts({ rows: [
    { move_name: 'Deadlift', actual_load: 225, actual_reps: 1, load_unit: 'lb', created_at: '2026-09-09' },
    { move_name: 'Deadlift', actual_load: 105, actual_reps: 1, load_unit: 'kg', created_at: '2024-01-01' },
  ] });
  return run().then((res) => {
    const dl = res.data.find((r) => r.liftKey === 'deadlift');
    assert.equal(dl.best, 105, '105 kg is 231.5 lb — heavier than 225 lb and years older');
    assert.equal(dl.unit, 'kg', 'and it keeps the unit it was lifted in');
  });
});

test('a failed page fails the whole answer rather than half of it', () => {
  // Merging one good page with one missing one would report a confident best
  // taken over half the member's log — so EACH page is failed on its own, not
  // both together.
  const rows = [
    { move_name: 'Deadlift', actual_load: 225, actual_reps: 1, load_unit: 'lb', created_at: 'a' },
    { move_name: 'Deadlift', actual_load: 105, actual_reps: 1, load_unit: 'kg', created_at: 'b' },
  ];
  const only = (opts) => bestLifts({ rows, ...opts }).run();
  return Promise.all([only({ kgError: { message: 'kg page down' } }), only({ lbError: { message: 'lb page down' } })])
    .then(([kgDown, lbDown]) => {
      for (const [label, res] of [['metric page', kgDown], ['imperial page', lbDown]]) {
        assert.ok(res.error, `${label} failed and the error was swallowed`);
        assert.deepEqual(res.data, [], `${label} failed and a partial best was still emitted`);
      }
    });
});

test('the actionable rows lead', () => {
  const rows = bsWallYourBest(
    [{ liftKey: 'row', liftLabel: 'Row', best: 135, unit: 'lb' }],
    [{ liftKey: 'squat', liftLabel: 'Squat', best: 405, unit: 'lb', postedAt: 'x' }],
  );
  assert.equal(rows[0].liftKey, 'row', 'the unposted 135 outranks the posted 405');
});

test('a PR is not only a lift — every activity type brings its own record', () => {
  // Owner: "this should apply to all workouts where a PR happens, not just
  // deadlift, etc." Strength comes from the set logs, endurance from the
  // activities table's distance column.
  const { run } = bestLifts({
    rows: [{ move_name: 'Deadlift', actual_load: 245, actual_reps: 3, load_unit: 'lb', created_at: 'x' }],
    acts: [
      { activity_type: 'run', distance_km: 18.2, started_at: 'a' },
      { activity_type: 'run', distance_km: 12.0, started_at: 'b' },
      { activity_type: 'ride', distance_km: 40.4, started_at: 'c' },
      { activity_type: 'swim', distance_km: 2.0, started_at: 'd' },
    ],
  });
  return run().then((res) => {
    const by = Object.fromEntries(res.data.map((r) => [r.liftKey, r]));
    assert.equal(by['deadlift'].kind, 'lift');
    assert.equal(by['distance:run'].best, 18.2, 'the longest run, not the latest');
    assert.equal(by['distance:run'].liftLabel, 'Longest run');
    assert.equal(by['distance:run'].unit, 'km');
    assert.equal(by['distance:ride'].best, 40.4);
    assert.equal(by['distance:swim'].best, 2);
    assert.equal(Object.keys(by).length, 4, 'one record per move and per activity type');
  });
});

test('a failed endurance read does not take the lifts down with it', () => {
  // Their lifts are still true; the answer degrades to "no endurance records
  // known", which is what an empty activities table would mean anyway.
  const { run } = bestLifts({
    rows: [{ move_name: 'Squat', actual_load: 315, load_unit: 'lb', created_at: 'x' }],
    actError: { message: 'boom' },
  });
  return run().then((res) => {
    assert.equal(res.stored, 'supabase');
    assert.deepEqual(res.data.map((r) => r.liftKey), ['squat']);
  });
});

test('an activity with no distance is not a distance record', () => {
  const { run } = bestLifts({ rows: [], acts: [
    { activity_type: 'yoga', distance_km: null, started_at: 'a' },
    { activity_type: 'run', distance_km: 0, started_at: 'b' },
  ] });
  return run().then((res) => assert.deepEqual(res.data, []));
});
