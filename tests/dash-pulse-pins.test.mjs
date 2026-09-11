// Pinned clients on the coach's Client pulse (review 2026-09-09, R15).
//
// ⚠ THE PULSE IS A TRIAGE FEED, so a pin is the one control on it that can argue with the
// engine. The rules that keep it honest are all here and all DRIVEN: a pinned row keeps
// its own severity and flags, every unpinned at-risk row is still in the list, a row
// appears exactly once, and a pin for somebody who is not on screen yields nothing rather
// than an empty row — it is never evidence that the pin is stale.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { stripComments } from './helpers/strip-comments.mjs';

const require_ = createRequire(import.meta.url);
const DS = require_('../public/newdesign/dashSignals.js');
const TODAY = readFileSync(new URL('../public/newdesign/dashToday.jsx', import.meta.url), 'utf8');
const DATA = readFileSync(new URL('../public/newdesign/dashData.jsx', import.meta.url), 'utf8');

const row = (id, severity, isNew = false) => ({
  severity,
  flags: severity === 'green' ? [] : [{ label: 'Score drop', owned: true }],
  client: { profile: { id, name: id, isNew } },
});
// the feed arrives severity-sorted, which pulseOrder relies on rather than re-sorting
const FEED = [row('red1', 'red'), row('amb1', 'amber'), row('new1', 'green', true), row('ok1', 'green'), row('ok2', 'green')];
const ids = (list) => list.map((r) => r.client.profile.id);

test('with nothing pinned the order is exactly what it always was', () => {
  const o = DS.pulseOrder(FEED, []);
  assert.deepEqual(o.pinned, []);
  assert.deepEqual(ids(o.rest), ['red1', 'amb1', 'new1', 'ok1', 'ok2']);
  // and the same for every shape of "no pins at all"
  for (const p of [null, undefined, 'nope', [null, '', 7]]) {
    assert.deepEqual(ids(DS.pulseOrder(FEED, p).rest), ['red1', 'amb1', 'new1', 'ok1', 'ok2']);
  }
});

test('a pinned row lifts out of the list — it never appears twice', () => {
  const o = DS.pulseOrder(FEED, ['ok2']);
  assert.deepEqual(ids(o.pinned), ['ok2']);
  assert.deepEqual(ids(o.rest), ['red1', 'amb1', 'new1', 'ok1']);
  // ⚠ THE COUNT IS THE INVARIANT. Leaving a pinned at-risk client in both bands would
  // double-count the roster on the one card that exists to say how many need attention.
  assert.equal(o.pinned.length + o.rest.length, FEED.length);
});

test('an at-risk client can be pinned, and pinning does not erase the flag', () => {
  const o = DS.pulseOrder(FEED, ['red1']);
  assert.deepEqual(ids(o.pinned), ['red1']);
  assert.equal(o.pinned[0].severity, 'red');
  assert.equal(o.pinned[0].flags.length, 1, 'the pin stripped the row of its flags');
  // and the remaining at-risk row is still in the list, in place
  assert.deepEqual(ids(o.rest), ['amb1', 'new1', 'ok1', 'ok2']);
});

test('the pinned band keeps triage order among itself', () => {
  // a red pin sits above a green one — the pin decides visibility, not severity
  const o = DS.pulseOrder(FEED, ['ok1', 'red1']);
  assert.deepEqual(ids(o.pinned), ['red1', 'ok1'], 'the pinned band re-sorted or reversed');
});

test('a pin for somebody not on screen yields nothing, and is never treated as stale', () => {
  // The feed is filtered and searched, so absence is not evidence. pulseOrder returns an
  // ORDER and has no way to edit the pinned set — which is the point.
  const o = DS.pulseOrder(FEED, ['ghost']);
  assert.deepEqual(o.pinned, []);
  assert.deepEqual(ids(o.rest), ['red1', 'amb1', 'new1', 'ok1', 'ok2'], 'an absent pin disturbed the list');
  // ⚠ A ROW WITH NO READABLE ID CANNOT BE PINNED, AND THIS IS THE CASE THAT PROVES IT.
  // `idOf` returns null for such a row, so a pinned list carrying a null would match it
  // and pin every anonymous row at once — the filter to non-empty strings is the whole
  // protection, and a `ghost` fixture never exercises it. (A mutation deleting that
  // filter survived until this line existed, while a redundant `id != null` check sat
  // beside it looking like the guard.)
  const anon = [{ severity: 'green', flags: [], client: { profile: {} } }];
  assert.equal(DS.pulseOrder(anon, [null]).pinned.length, 0, 'a null pin captured an anonymous row');
  assert.equal(DS.pulseOrder(anon, [null]).rest.length, 1, 'the anonymous row stopped rendering');
  assert.equal(DS.pulseOrder(anon, ['ghost']).rest.length, 1);
  assert.equal(DS.pulseOrder(null, ['x']).rest.length, 0);
  // ⚠ AND IT MAY NOT THROW ON A MALFORMED FEED. There is no error boundary anywhere in
  // public/newdesign, so an ordering function that throws does not lose a row — it takes
  // the whole page to blank. It orders what it can and leaves the rest to the renderer.
  assert.doesNotThrow(() => DS.pulseOrder([null, undefined, {}, { client: null }], ['x']));
});

test('the pulse renders one band from one order, and the pin is on the row', () => {
  const t = stripComments(TODAY);
  assert.match(t, /const order = DashSignals\.pulseOrder\(feed, pinned\);/);
  // ⚠ NOT THREE FILTERS. The old shape (atRisk/fresh/ok filtered here) is what the pure
  // function replaced, and re-introducing it is how a row starts appearing twice.
  assert.doesNotMatch(t, /const atRisk = feed\.filter/, 'the pulse went back to filtering in the component');
  // one renderer for both bands, so a pinned row cannot drift from an unpinned one
  assert.match(t, /const renderRow = \(r, i\) =>/);
  assert.match(t, /\{pinnedRows\.map\(\(r, i\) => renderRow\(r, i\)\)\}/);
  assert.match(t, /\{rows\.map\(\(r, i\) => renderRow\(r, i\)\)\}/);
  // the band says whose choice it is
  assert.match(t, /Pinned · \{pinnedRows\.length\}/);
  // the control is a real toggle with state a screen reader can read
  assert.match(t, /aria-pressed=\{pinSet\.has\(c\.profile\.id\)\}/);
  assert.match(t, /onTogglePin\(c\.profile\.id\)/);
  // and it does not open the drawer on its way
  const at = t.indexOf('onTogglePin(c.profile.id)');
  assert.ok(at > 0);
  const open = t.lastIndexOf('onClick=', at);
  assert.match(t.slice(open, at), /e\.stopPropagation\(\)/, 'the pin opens the drilldown too');
});

test('the pinned set is remembered per ACCOUNT and per ROLE', () => {
  const t = stripComments(TODAY);
  assert.match(t, /useRememberedChoices\(source === "live"\)/);
  // ⚠ PER ROLE. One auth user can own a trainer row AND a nutritionist row, and the two
  // Todays show different rosters — a shared key puts a nutrition client at the top of
  // the training pulse.
  assert.match(t, /useRememberedSet\(prefs, "pulsePinned:" \+ role, 12\)/);
  // both mount sites get it, or the card behaves differently in the grid than in the shell
  assert.equal((t.match(/pinned=\{pinned\} onTogglePin=\{togglePin\}/g) || []).length, 2);
});

test('the set store validates SHAPE and never membership', () => {
  const d = stripComments(DATA);
  const at = d.indexOf('function useRememberedSet(');
  assert.ok(at > 0, 'useRememberedSet moved');
  const body = d.slice(at, d.indexOf('\n}', at));
  // ⚠ THE DIFFERENCE THAT FORCES A SECOND HOOK. useRememberedChoice checks a stored value
  // against a fixed `allowed` list; here the members are client ids and the roster is
  // filtered, searched and paged, so "not on screen" is not evidence a pin is stale.
  assert.doesNotMatch(body, /allowed/, 'the set store grew an allow-list, which would unpin filtered clients');
  assert.match(body, /typeof v !== "string"/);
  assert.match(body, /out\.indexOf\(v\) >= 0/);          // deduped
  assert.match(body, /out\.length >= cap/);              // capped
  // an empty set is "no preference" — the same rule as choosing a default back
  assert.match(body, /const want = chosen\.length \? chosen : undefined;/);
  assert.match(body, /if \(want === undefined\) delete out\[key\]/);
  // one attempt per chosen set, or a rolled-back optimistic paint loops forever
  assert.match(body, /if \(askedRef\.current === chosenKey\) return;/);
  // a different account gets a clean slate
  assert.match(body, /if \(acct != null && knownRef\.current != null && acct !== knownRef\.current\)/);
  // ⚠ AND THE UPDATER COMPOSES OFF `prev`: two toggles in one tick both reading a captured
  // array would silently discard the first.
  assert.match(body, /setChosen\(\(prev\) => \{/);
  assert.match(body, /const cur = prev != null \? prev : storedRef\.current;/);
});
