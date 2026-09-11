// The canonical newdesign coach profile learns capacity + the waiting list.
//
// The app has carried the storefront gate since #1498, and so do the LEGACY website
// pages — `public/newdesign/livingShared.jsx`, the profile the site actually ships,
// never got it. These guards pin the invariants that made the gap a defect rather
// than a missing feature: a Subscribe button that opened a chat, a provider row
// resolved by guessing a role, and an entry id read under the wrong name.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const RAW_WEB = read('../public/newdesign/livingShared.jsx');
const WEB = stripComments(RAW_WEB);
const MKT = stripComments(read('../mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx'));
const SIGNAL = stripComments(read('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'));
const CAP_TS = read('../src/lib/capacity.ts');
const CHECKOUT = stripComments(read('../src/app/api/stripe/checkout-session/route.ts'));

// Lift a `const NAME = async (...) => { … }` body by brace-matching from the arrow's
// own brace. ⚠ It starts at the brace AFTER `=>`, never at the first `{` following
// the name: a destructured parameter opens and closes on the parameter list, which
// is how a sibling guard in this repo came to assert against a 47-character
// signature and pass vacuously. Asserts it got a body, for the same reason.
function arrowBody(src, name) {
  const at = src.indexOf('const ' + name + ' = ');
  assert.ok(at > 0, name + ' moved');
  const arrow = src.indexOf('=>', at);
  assert.ok(arrow > 0, name + ' is not an arrow function');
  const open = src.indexOf('{', arrow);
  assert.ok(open > 0, name + ' has no body');
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) {
      const body = src.slice(open + 1, i);
      assert.ok(body.length > 120, name + ' body came back too short to be the function (' + body.length + ' chars)');
      return body;
    } }
  }
  throw new Error(name + ' body never closed');
}

test('the profile reads capacity from the row it already fetches', () => {
  // Every column the gate needs, in the ONE select that was already going out for
  // the offer and the STUDIO — so capacity costs no extra round trip. Dropping any
  // one of them disables the gate silently rather than failing.
  const m = /cl\.from\(providerTable\)\.select\("([^"]+)"\)/.exec(WEB);
  assert.ok(m, 'the provider select moved');
  const cols = m[1].split(',').map((s) => s.trim());
  for (const need of ['id', 'at_capacity', 'capacity_resume_at', 'monthly_offer', 'listing_media']) {
    assert.ok(cols.includes(need), 'the provider select dropped ' + need);
  }
});

test('the capacity reading agrees with the server, driven rather than matched', () => {
  // ⚠ BOTH EXPRESSIONS ARE EXECUTED OVER THE SAME VECTORS. A source match would pass
  // on any rewrite that merely looks similar, and the whole risk here is a client
  // reading that disagrees with the server's on some edge — after which the profile
  // shows a storefront the checkout then refuses, or a waiting list for a coach with
  // room. Parity is the invariant; the spelling is not.
  const wm = /atCapacity: (!!r\.data\.at_capacity[^}]+?) \}\);/.exec(WEB);
  assert.ok(wm, 'the capacity expression moved');
  const web = new Function('r', 'resume', 'return (' + wm[1] + ');');

  const body = CAP_TS.slice(CAP_TS.indexOf('): boolean {') + '): boolean {'.length, CAP_TS.lastIndexOf('}'));
  assert.ok(body.includes('at_capacity'), 'capacity.ts body did not lift');
  const srv = new Function('provider', body);

  const future = new Date(Date.now() + 864e5).toISOString();
  const past = new Date(Date.now() - 864e5).toISOString();
  const VECTORS = [
    { at_capacity: false, capacity_resume_at: null },
    { at_capacity: false, capacity_resume_at: future },
    { at_capacity: true, capacity_resume_at: null },
    { at_capacity: true, capacity_resume_at: future },
    { at_capacity: true, capacity_resume_at: past },
    { at_capacity: true, capacity_resume_at: 'not-a-date' },
    { at_capacity: true, capacity_resume_at: '' },
    { at_capacity: null, capacity_resume_at: null },
    { at_capacity: undefined, capacity_resume_at: undefined },
  ];
  for (const v of VECTORS) {
    assert.equal(
      !!web({ data: v }, v.capacity_resume_at), !!srv(v),
      'the profile and src/lib/capacity.ts disagree on ' + JSON.stringify(v));
  }
  // Positive control — without it this passes on two expressions that both return
  // false for everything, which is exactly the "nobody is ever at capacity" defect.
  assert.equal(srv({ at_capacity: true, capacity_resume_at: null }), true, 'the control vector is not at capacity');
  assert.equal(web({ data: { at_capacity: true } }, null), true, 'the profile never reports at capacity');
});

test('the checkout provider is the role-correct row, never the plan RPC’s guess', () => {
  // `get_coach_sale_plans_by_user` derives each row's role from the PLAN's kind,
  // newest-first, so `rows[0]` is whatever the coach published last. For a dual-role
  // coach that is arbitrary relative to the listing being viewed, and for a coach
  // with no published plans there is no row at all. The checkout body must carry the
  // row this page actually read.
  const body = arrowBody(WEB, 'subscribe');
  assert.match(body, /provider_id: provId/, 'the checkout no longer sends the row’s own id');
  assert.match(body, /provider_role: listingRole/, 'the checkout no longer sends the listing’s role');
  assert.doesNotMatch(body, /provider\.id|provider\.role/, 'the checkout is back on the RPC-derived provider');
  assert.doesNotMatch(WEB, /setProvider\(/, 'the RPC-derived provider state is back');
});

test('no failure path from Subscribe opens the chat', () => {
  // ⚠ THE INVARIANT IS THAT A CONTROL NAMING ONE OUTCOME CANNOT PRODUCE ANOTHER,
  // not that any particular sentence is present. Every failure — a null provider, a
  // throw, an unparseable body, 401/404/409/503 — used to reach openChat(), so the
  // member got a chat window under a button that says Subscribe, with nothing saying
  // the subscription had not happened.
  const body = arrowBody(WEB, 'subscribe');
  assert.doesNotMatch(body, /openChat\(\)/, 'Subscribe can still fall through to the chat');
  assert.match(body, /setBuyErr\(/, 'Subscribe no longer reports what happened');
  // openChat still exists and is still wired — to the control that actually means it.
  assert.match(WEB, /onClick=\{openChat\}/, 'Book intro lost its handler');
});

test('the at-capacity refusal is read off a FLAG, never the server’s prose', () => {
  // Two different 409s leave the checkout route — at capacity, and Stripe onboarding
  // incomplete — and only the sentence separated them. Sniffing /capacity/i would put
  // the copy into the contract, the defect this repo post-mortems on an /account/i
  // match against "Your account is over its usage limits".
  assert.match(CHECKOUT, /reason: 'at_capacity'/, 'the route dropped its at_capacity flag');
  const body = arrowBody(WEB, 'subscribe');
  assert.match(body, /reason === "at_capacity"/, 'the profile no longer reads the flag');
  assert.doesNotMatch(body, /\/capacity\/i|test\(String\(j\.error/, 'the profile is sniffing the error prose again');
});

test('every surface reads the waitlist entry id as `id` from /mine', () => {
  // ⚠ /mine RETURNS `id`; ONLY /join CALLS IT `entryId`. Reading the wrong one yields
  // undefined, the withdraw guard bails, and "Leave the list" is dead from the next
  // reload onward — a member who joined can never get off the list on that surface.
  // Three surfaces read this shape and they must agree.
  for (const [name, src] of [['the website profile', WEB], ['the app marketplace listing', MKT], ['the app Signal profile', SIGNAL]]) {
    const hits = src.match(/entryId: mine[A-Za-z]*\.[A-Za-z]+/g) || [];
    assert.ok(hits.length > 0, name + ' no longer reads an entry id out of /mine');
    for (const h of hits) {
      assert.ok(/\.id$/.test(h), name + ' reads the entry id as "' + h + '" — /mine returns `id`');
    }
  }
});

test('a position we do not have is never rendered as a rank', () => {
  // `queue_position` is nullable and /join falls back to 0 — and `Number(null)` is 0
  // AND finite, so a truthiness or isFinite check alone prints "You're #0 in line",
  // a place nobody holds. A real FIFO position starts at 1.
  const m = /typeof wl\.position === "number"([^?]*)\?/.exec(WEB);
  assert.ok(m, 'the position guard moved');
  const guard = new Function('wl', 'return !!(typeof wl.position === "number"' + m[1] + ');');
  assert.equal(guard({ position: 3 }), true, 'a real position is refused');
  assert.equal(guard({ position: 1 }), true, 'the first place is refused');
  assert.equal(guard({ position: 0 }), false, '#0 renders as a rank');
  assert.equal(guard({ position: null }), false, 'a null position renders as a rank');
  assert.equal(guard({ position: undefined }), false, 'an absent position renders as a rank');
});

test('a signed-out visitor is offered sign-in, never a Join button that 401s', () => {
  // The waitlist routes answer 401 to an anonymous caller, so a live Join button
  // there is the dead control one layer down. The hydrate also must not run.
  assert.match(RAW_WEB, /acct === null \? \(/, 'the signed-out branch moved');
  assert.match(RAW_WEB, /Sign in to join the list/, 'the sign-in line is gone');
  assert.match(WEB, /\|\| !acct\) return undefined;/, 'the /mine hydrate no longer requires a resolved account');
});

test('an unresolved account renders NEITHER control', () => {
  // ⚠ Falling either way is wrong for one of the two audiences: a premature Join
  // button 401s for a visitor, and a premature sign-in link tells a member to do
  // what they have already done — the #2005 defect. Three states, not two.
  assert.match(WEB, /acct === undefined \? \(\s*null\s*\) : acct === null \? \(/,
    'the unresolved state no longer withholds both controls');
});

test('THE WAITLIST HYDRATE IS KEYED ON THE ACCOUNT, so an A→B switch discards A\'s answer', () => {
  // ⚠ CodeRabbit's one blocking finding on this PR, and the class this repo has now
  // paid for five times. The identity used to be a BOOLEAN: an A→B switch leaves it
  // `true`, so the effect never re-runs, its cleanup never fires, and A's in-flight
  // /mine response calls setWl on B's screen — B is shown A's queue position or A's
  // invite. The invariant is not a spelling: WHATEVER IDENTITY GATES THE FETCH MUST
  // ALSO BE A DEPENDENCY, because that is precisely what makes the switch re-run the
  // effect and the cleanup drop the stale answer.
  const at = WEB.indexOf('fetch("/api/waitlist/mine"');
  assert.ok(at > 0, 'the /mine hydrate moved');
  const head = WEB.lastIndexOf('React.useEffect(', at);
  const deps = /\}, \[([^\]]*)\]\);/.exec(WEB.slice(at));
  assert.ok(head > 0 && deps, 'could not read the hydrate effect and its deps');
  const gate = /\|\| !([A-Za-z_$][\w$]*)\) return undefined;/.exec(WEB.slice(head, at));
  assert.ok(gate, 'the hydrate no longer gates on an identity at all');
  assert.ok(deps[1].split(',').map((x) => x.trim()).includes(gate[1]),
    'the identity gating the /mine fetch (' + gate[1] + ') is NOT in the effect deps — an account switch cannot discard the stale response');
});

test('the account is subscribed, and an auth event outranks a read already in flight', () => {
  // Resolving once is the other half of the same defect: a sign-in AFTER first paint
  // never reaches the page. And the generation must bump BEFORE the state is set, or
  // the sequence "read observes A · B signs in · read resolves" puts A back.
  assert.match(WEB, /onAuthStateChange\(/, 'the account is resolved once and never subscribed');
  const cb = WEB.slice(WEB.indexOf('onAuthStateChange('));
  const bump = cb.indexOf('authGenRef.current += 1');
  const set = cb.indexOf('setAcct(');
  assert.ok(bump > 0 && set > 0 && bump < set, 'the generation must bump BEFORE setAcct');
  // And the read itself must honour it, or the bump guards nothing.
  // ⚠ EVERY ARM, NOT ANY ARM. The initial read sets the account from TWO places — the
  // resolve arm and the catch arm — and a first version of this asserted the pattern
  // merely EXISTS, so a mutation stripping the check from the resolve arm survived on
  // the strength of the catch arm still carrying it. A guard on one of two call sites
  // is a guard on half the rule.
  const readBlk = WEB.slice(WEB.indexOf('db.getUser()'), WEB.indexOf('let sub = null'));
  const sets = readBlk.split('setAcct(').length - 1;
  assert.ok(sets >= 2, 'the initial read no longer sets the account from both arms');
  assert.equal(
    readBlk.split('gen === authGenRef.current').length - 1, sets,
    'an arm of the initial read sets the account WITHOUT checking the generation — a read that resolves after an auth event would put the old account back');
});

test('the waiting list replaces the coupon rather than sitting beside it', () => {
  // A live Subscribe button under an "isn't taking new clients" notice is the
  // mislabelled control again, and the checkout would refuse it anyway. The INVITED
  // state carries Subscribe deliberately — the server's invite gate allows a
  // first-dibs purchase, and the coupon is hidden at capacity.
  assert.match(WEB, /\{!owner && !atCapacity && \(/, 'the storefront is no longer gated on capacity');
  assert.match(WEB, /\{!owner && atCapacity && \(/, 'the waiting room is no longer gated on capacity');
  // Both blocks are owner-gated: a coach must never be shown their own waiting list.
  const room = WEB.slice(WEB.indexOf('{!owner && atCapacity && ('));
  assert.match(room.slice(0, 4000), /onClick=\{wlJoin\}/, 'the join control is gone');
  assert.match(room.slice(0, 4000), /onClick=\{wlLeave\}/, 'the leave control is gone');
});

test('a same-mount coach swap cannot leak the previous coach\u2019s gate state', () => {
  // The provider effect already cleared the offer and the STUDIO for this reason.
  // `capSrv` is the same kind of state and worse left standing: a 409 about coach A
  // would present coach B as paused and their storefront would never render.
  const m = /setOffer\(null\); setStudio\(\[\]\);([^\n]*)/.exec(WEB);
  assert.ok(m, 'the per-coach reset moved');
  for (const s of ['setProw(null)', 'setCapSrv(false)', 'setBuyErr("")', 'setWlErr("")']) {
    assert.ok(m[1].includes(s), 'the per-coach reset no longer clears ' + s);
  }
});

test('at capacity with no provider id never renders a control that cannot act', () => {
  // ⚠ `atCapacity` CAN BE TRUE WITH `provId` NULL — the checkout's 409 sets the flag
  // while an unreadable provider row leaves the id null. A Join button there would do
  // nothing at all, in silence, which is the dead control this whole change removes.
  const room = WEB.slice(WEB.indexOf('{!owner && atCapacity && ('));
  assert.match(room.slice(0, 5000), /\{!provId \? \(/, 'the no-provider branch is gone');
  // And the handler says so too, rather than folding it into the in-flight lock where
  // it returns silently.
  const join = arrowBody(WEB, 'wlJoin');
  assert.doesNotMatch(join, /if \(busy\.current \|\| !provId\) return;/, 'the no-provider case is silent again');
  assert.match(join, /if \(!provId\) \{ setWlErr\(/, 'wlJoin no longer reports a missing provider');
});
