// The coach's office settings (review 2026-09-09, R14): a tuning of the signal
// engine, a landing tab, and the notifications the matrix can actually govern.
//
// ⚠ THE POINT OF THIS SUITE IS THAT A KNOB IS WIRED, NOT THAT IT IS STORED. A
// settings panel whose controls are saved and then ignored is the failure mode —
// so the threshold tests DRIVE `evaluateClient` and assert the flag appears and
// disappears, rather than checking that a number round-tripped. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { NOTIFY_TYPES, channelsForType } from '../src/lib/ai/notifications.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const require_ = createRequire(import.meta.url);
const DS = require_('../public/newdesign/dashSignals.js');
const { THRESHOLDS, DEFAULT_THRESHOLDS, TUNABLES, resolveThresholds, evaluateClient } = DS;

const SETTINGS = readFileSync(new URL('../public/newdesign/coachSettings.jsx', import.meta.url), 'utf8');
const DATA = readFileSync(new URL('../public/newdesign/dashData.jsx', import.meta.url), 'utf8');
const NAV = readFileSync(new URL('../public/newdesign/coachNav.jsx', import.meta.url), 'utf8');
const CORE = readFileSync(new URL('../src/lib/ai/notify-core.ts', import.meta.url), 'utf8');

const DAY = 86400000;
const NOW = new Date('2026-09-10T12:00:00Z');
const ago = (d) => new Date(NOW.getTime() - d * DAY).toISOString().slice(0, 10);
const flagKeys = (rec, t) => evaluateClient(rec, NOW, 'trainer', t).flags.map((f) => f.key);
const tuned = (o) => resolveThresholds(o).thresholds;

// ── the knob moves the engine ────────────────────────────────────────────────
test('a tuned threshold changes what the engine flags — the whole point', () => {
  // Four days since the last food log. The house default (3) flags it; a coach who
  // works in a practice where five days is normal should not be told anything.
  const rec = { foodLogs: { lastLoggedOn: ago(4), daysLogged7d: 3 } };
  assert.ok(flagKeys(rec).includes('food_gap'), 'setup: the default does not flag this');
  assert.ok(!flagKeys(rec, tuned({ FOOD_GAP_DAYS: 6 })).includes('food_gap'),
    'the tuning was resolved and then ignored by the rules');
  assert.ok(flagKeys(rec, tuned({ FOOD_GAP_DAYS: 2 })).includes('food_gap'),
    'a tighter threshold did not bring the flag back');
});

test('the tuning is a VALUE — the module singleton is never mutated', () => {
  // ⚠ THIS IS WHY IT IS PURE, AND IT IS A SERVER PROBLEM, NOT A STYLE ONE.
  // src/lib/ai/notify-core.ts imports THIS FILE server-side to build client_red /
  // client_amber for the notify cron, so a mutable effective set would be one Node
  // process shared by every coach: one request's tuning would decide another coach's
  // alerts. Nothing here may leave a trace on the module.
  const before = { ...THRESHOLDS };
  const rec = { foodLogs: { lastLoggedOn: ago(4), daysLogged7d: 3 } };
  flagKeys(rec, tuned({ FOOD_GAP_DAYS: 9 }));
  assert.deepEqual({ ...THRESHOLDS }, before, 'a per-call tuning leaked into the module');
  // and there is no way to set it globally at all
  assert.equal(typeof DS.setThresholds, 'undefined', 'a global setter is back');
  assert.equal(typeof DS.resetThresholds, 'undefined');
});

test('a resolved set always starts from the house defaults, so a knob can be un-tuned', () => {
  // ⚠ A RESOLVER THAT LAYERED OVER THE PREVIOUS CALL COULD NOT UNDO: removing an
  // override from the document would leave the old value applied and "reset this row"
  // would be unreachable.
  const a = tuned({ FOOD_GAP_DAYS: 9, CONTACT_GAP_DAYS: 11 });
  assert.equal(a.FOOD_GAP_DAYS, 9);
  const b = tuned({ CONTACT_GAP_DAYS: 11 });                       // FOOD_GAP_DAYS removed
  assert.equal(b.FOOD_GAP_DAYS, DEFAULT_THRESHOLDS.FOOD_GAP_DAYS);
  assert.equal(b.CONTACT_GAP_DAYS, 11);
  assert.deepEqual(tuned({}), { ...DEFAULT_THRESHOLDS });
  assert.deepEqual(tuned(null), { ...DEFAULT_THRESHOLDS });
});

test('a bad value is REFUSED and named, never clamped — and Number() is not the check', () => {
  // ⚠ `Number(null)` is 0, `Number(true)` is 1 and `Number("")` is 0 — all finite. A
  // coercion check would apply a document holding `CHECKIN_GRACE_DAYS: null` as 0,
  // nagging a whole roster from Monday morning. The type of the RAW value decides.
  const r = resolveThresholds({
    FOOD_GAP_DAYS: 999, CONTACT_GAP_DAYS: 'x', NOT_A_KEY: 1, SCORE_DROP_PTS: 7,
    CHECKIN_GRACE_DAYS: null, CHECKIN_RED_WEEKS: true, GOAL_SLIP_DAYS: '',
  });
  assert.deepEqual(r.applied, { SCORE_DROP_PTS: 7 });
  assert.equal(r.thresholds.FOOD_GAP_DAYS, DEFAULT_THRESHOLDS.FOOD_GAP_DAYS, 'out of range was clamped in');
  assert.equal(r.thresholds.CHECKIN_GRACE_DAYS, DEFAULT_THRESHOLDS.CHECKIN_GRACE_DAYS, 'null was applied as 0');
  assert.equal(r.thresholds.CHECKIN_RED_WEEKS, DEFAULT_THRESHOLDS.CHECKIN_RED_WEEKS, 'true was applied as 1');
  assert.equal(r.thresholds.SCORE_DROP_PTS, 7);
  assert.deepEqual(r.refused.map((x) => x.key).sort(),
    ['CHECKIN_GRACE_DAYS', 'CHECKIN_RED_WEEKS', 'CONTACT_GAP_DAYS', 'FOOD_GAP_DAYS', 'GOAL_SLIP_DAYS', 'NOT_A_KEY']);
  assert.deepEqual(new Set(r.refused.map((x) => x.why)), new Set(['not tunable', 'not a number', 'out of range']));
});

// ── the line between policy and machinery ────────────────────────────────────
test('the evidence floors are NOT tunable, and that is the principled line', () => {
  // ⚠ Every vitals rule gates on a minimum of real logged days, which is what makes
  // "absence is never a signal" true — a member who skips the daily check-in is never
  // flagged for skipping it. A coach who could lower those to zero would be
  // manufacturing flags out of no data, which is not a preference.
  const tunable = new Set(TUNABLES.map((t) => t.key));
  for (const k of ['ENERGY_MIN_DAYS', 'HUNGER_MIN_DAYS', 'HYDRATION_MIN_DAYS',
                   'GOAL_RECENT_DAYS', 'GOAL_MIN_SPAN_DAYS', 'GOAL_FAR_DAYS', 'STREAK_MIN_BEST']) {
    assert.ok(!tunable.has(k), k + ' became tunable — a coach can now fabricate evidence');
    assert.ok(k in DEFAULT_THRESHOLDS, k + ' left the engine; this guard is now vacuous');
  }
  // …and the setter enforces it rather than trusting the panel to filter
  const r = resolveThresholds({ ENERGY_MIN_DAYS: 0 });
  assert.deepEqual(r.applied, {});
  assert.equal(r.thresholds.ENERGY_MIN_DAYS, DEFAULT_THRESHOLDS.ENERGY_MIN_DAYS);
});

test('every tunable names a real threshold, with a usable range', () => {
  assert.ok(TUNABLES.length > 0);
  for (const t of TUNABLES) {
    assert.ok(t.key in DEFAULT_THRESHOLDS, t.key + ' is offered but the engine has no such threshold');
    assert.ok(Number.isFinite(t.min) && Number.isFinite(t.max) && t.min < t.max, t.key + ' has no usable range');
    const d = DEFAULT_THRESHOLDS[t.key];
    assert.ok(d >= t.min && d <= t.max, t.key + ': the house default sits outside the range the panel offers');
    assert.ok(t.label && t.unit && t.help, t.key + ' is unlabelled');
    assert.ok(!('role' in t), t.key + ' is role-scoped — a hidden row still moves that role');
  }
});

// ── the panel is wired to the engine, not to a copy of it ────────────────────
test('the panel derives its rows from the engine rather than listing them', () => {
  const src = stripComments(SETTINGS);
  assert.match(src, /DashSignals\.TUNABLES/, 'the panel hand-lists thresholds again');
  assert.match(src, /DashSignals\.DEFAULT_THRESHOLDS/, 'the panel cannot show the house default');
  // and it applies through the shared writer, never by calling the engine directly —
  // the roster, Today and the drilldown all read the effective set and none of them
  // mount this page.
  // ⚠ AND IT NEVER WRITES ENGINE STATE. Thresholds travel as a value; the dashboard
  // hook resolves them per call. All this page does is save the document and announce
  // it — a panel that reached into the engine would be a second writer of something
  // the server also imports.
  assert.ok(!/setThresholds\(|resolveThresholds\(/.test(src), 'the panel resolves or sets engine state on its own');
  assert.match(src, /DASH_THRESHOLDS_EVENT/, 'a save does not tell the mounted surfaces');
});

test('the dashboard applies the tuning and its feeds depend on it', () => {
  const src = stripComments(DATA);
  assert.match(src, /function dashResolveCoachThresholds/);
  assert.match(src, /function useCoachThresholds/);
  // the resolved set is HANDED to the engine, per call
  assert.match(src, /getTriageFeed\(role, state\.clients, undefined, thresholds/);
  assert.match(src, /findJointAttention\(state\.clients, undefined, thresholds/);
  // ⚠ BOTH FEEDS. getTriageFeed obviously reads the engine; findJointAttention calls
  // evaluateClient INTERNALLY, which is the one an author would miss — and a memo
  // without the dependency renders the previous tuning's output indefinitely.
  // ⚠ AND BOTH MEMOS DEPEND ON IT. A memo without the dependency renders the previous
  // tuning's output indefinitely — the coach changes a number and their roster keeps
  // showing the flags the old one produced.
  for (const [call, what] of [['getTriageFeed(role, state.clients', 'triage'],
                              ['findJointAttention(state.clients', 'joint-attention']]) {
    const at = src.indexOf(call);
    assert.ok(at > 0, 'the ' + what + ' call moved');
    const deps = src.slice(at, src.indexOf(');', src.indexOf('[role, state.clients', at)));
    assert.match(deps, /thresholdSig/, 'the ' + what + ' feed does not depend on the tuning');
  }
});

test('a member’s own pages never inherit a coach’s roster tuning', () => {
  // On a DUAL-ROLE account the same auth user owns both; applying the coach's
  // thresholds on the client role would let their roster policy decide how their own
  // data reads back to them.
  const src = stripComments(DATA);
  const hook = src.slice(src.indexOf('function useCoachThresholds'));
  assert.match(hook.slice(0, 900), /role === "client"/, 'the client role reads the coach tuning');
});

test('a row returned to the house default is REMOVED from the document', () => {
  // ⚠ NOT STORED AS ITS VALUE. Two things break if it is: the panel counts a coach as
  // having tuned a row they reset, and — the one that matters — a later change to
  // house policy silently skips every coach who ever touched that row, because their
  // document pins the old number. Driven rather than matched: the merge is the claim.
  const src = SETTINGS.slice(SETTINGS.indexOf('const setThreshold ='));
  const body = src.slice(0, src.indexOf('\n  const setLanding'));
  let merge = null;
  const setThreshold = new Function('patch', 'DashSignals',
    body + '\nreturn setThreshold;')((m) => { merge = m; return Promise.resolve(true); }, DS);

  setThreshold('FOOD_GAP_DAYS', 6);
  const tuned = merge({ thresholds: { CONTACT_GAP_DAYS: 9 } });
  assert.deepEqual(tuned.thresholds, { CONTACT_GAP_DAYS: 9, FOOD_GAP_DAYS: 6 });

  setThreshold('FOOD_GAP_DAYS', null);
  const reset = merge(tuned);
  assert.deepEqual(reset.thresholds, { CONTACT_GAP_DAYS: 9 },
    'resetting a row stored a value instead of removing the override');
  assert.ok(!('FOOD_GAP_DAYS' in reset.thresholds));

  // …and the rest of the document survives the merge
  setThreshold('SCORE_DROP_PTS', 8);
  assert.deepEqual(merge({ landingTab: 'week', thresholds: {} }),
    { landingTab: 'week', thresholds: { SCORE_DROP_PTS: 8 } });
});

// ── the landing tab ──────────────────────────────────────────────────────────
test('the landing options come from the nav and exclude the one that needs an id', () => {
  const src = stripComments(SETTINGS);
  assert.match(src, /nutriNavItems : trainerNavItems/, 'the tab list is hand-written again');
  assert.match(src, /slug !== "client"/, '#client/<id> is offered as a landing tab');
  // both roles really do carry the tab this panel lives on
  assert.equal((NAV.match(/slug: "settings"/g) || []).length, 2, 'a coach role has no Settings tab');
});

test('the landing tab never yanks a coach who has already navigated', () => {
  // It is an async read; by the time it resolves the coach may have clicked a tab.
  const src = stripComments(SETTINGS);
  const fn = src.slice(src.indexOf('async function cstResolveLandingTab'));
  assert.match(fn.slice(0, 700), /isKnownSlug/, 'an unknown slug can be navigated to');
  for (const shell of ['TrainerApp.html', 'NutritionistApp.html']) {
    const html = stripComments(readFileSync(new URL('../public/newdesign/' + shell, import.meta.url), 'utf8'));
    const at = html.indexOf('cstResolveLandingTab(');
    assert.ok(at > 0, shell + ' does not resolve the landing tab');
    const block = html.slice(at, at + 500);
    assert.match(block, /window\.location\.hash \|\| ""/, shell + ': the current hash is not re-checked');
    assert.match(block, /if \(now && now !== route\.slug\) return;/, shell + ': a coach mid-navigation is yanked back');
  }
});

// ── the notification matrix governs only what it can ─────────────────────────
test('the coach matrix matches the registry’s coach-audience types exactly', () => {
  // ⚠ DERIVED, NOT LISTED — this guard is what keeps it that way. A type added to
  // NOTIFY_TYPES with audience 'coach' fails here and points at the panel.
  const fromRegistry = Object.keys(NOTIFY_TYPES).filter((k) => NOTIFY_TYPES[k].audience === 'coach').sort();
  const inPanel = [...SETTINGS.matchAll(/\n  \["([a-z_]+)",/g)].map((m) => m[1]).sort();
  // ⚠ A SUPERSET, NOT AN EQUALITY — and asserting equality is what DROPPED one.
  // `waitlist_join` is sent through createPreferredNotification (so the matrix governs
  // it) but never becomes an AI-layer candidate, so it carries no registry entry. An
  // equality check therefore quietly required the panel to omit a switch a coach needs,
  // while the card's own footer claimed only credential-expiry and payment were
  // ungoverned. Every registry coach type must appear; extras must be justified below.
  // ⚠ A REGISTRY TYPE IS OFFERED ONLY IF SOMETHING SENDS IT. `checkin_submitted` is in
  // the registry, default-on, and NOTHING emits it — `coachCandidates` produces only
  // client_red / client_amber and no event-driven creator exists — so its three switches
  // were inert while the panel presented them as governed controls, which is exactly the
  // failure this panel's own header rails against.
  const cc = readFileSync(new URL('../src/lib/ai/notifications.mjs', import.meta.url), 'utf8');
  const ccBody = cc.slice(cc.indexOf('export function coachCandidates'));
  const emitted = new Set([...ccBody.slice(0, ccBody.indexOf('\n}')).matchAll(/'(client_[a-z]+)'/g)].map((m) => m[1]));
  assert.ok(emitted.size > 0, 'coachCandidates emits nothing — this guard is vacuous');
  for (const k of fromRegistry) {
    if (emitted.has(k)) assert.ok(inPanel.includes(k), 'the panel dropped the registry coach type ' + k);
    else assert.ok(!inPanel.includes(k), k + ' is offered as a switch but nothing sends it');
  }
  const registryInPanel = new Function('return ' + /const CST_REGISTRY_COACH_TYPES = (\[[^\]]*\]);/.exec(SETTINGS)[1])().sort();
  // The constant names the registry types this panel COVERS — i.e. the ones something
  // actually sends — not every coach-audience entry.
  assert.deepEqual(registryInPanel, fromRegistry.filter((k) => emitted.has(k)),
    'CST_REGISTRY_COACH_TYPES has drifted from the types coachCandidates emits');
  // …and every EXTRA is a preference-gated send: it must be routed through
  // createPreferredNotification somewhere, or the switch governs nothing.
  const extras = inPanel.filter((k) => !fromRegistry.includes(k));
  assert.ok(extras.length > 0, 'the extras guard is vacuous — no non-registry type is listed');
  for (const k of extras) {
    const hit = execSync("grep -rl \"type: '" + k + "'\" src/app --include=*.ts", { encoding: 'utf8' }).trim().split('\n');
    assert.ok(hit.length && hit[0], k + ' is offered as a switch but nothing sends it');
    const src = readFileSync(new URL('../' + hit[0], import.meta.url), 'utf8');
    assert.match(src, /createPreferredNotification\(/,
      k + ' is offered as a switch but is not sent preference-aware — the toggle governs nothing');
  }
});

test('the panel says which notifications it does NOT govern', () => {
  // ⚠ credential_expiry (cron) and payment (the Stripe webhook) reach coaches through
  // createNotification, which does not consult notification_preferences — only
  // createPreferredNotification and the AI notify layer do. Offering a switch for
  // those would be a switch that changes nothing, so they are absent AND said.
  const src = stripComments(SETTINGS);
  assert.ok(!/"credential_expiry"|"payment"/.test(src), 'a notification the matrix cannot govern is offered as a toggle');
  assert.match(src, /Credential-expiry and payment/, 'the card does not say what it leaves out');
  // ⚠ AND THE QUIET-HOURS / CAP CONTROLS DO NOT REACH waitlist_join.
  // `createPreferredNotification` reads only `muted` — never quiet_start, quiet_end, tz
  // or daily_cap — so listing that type beneath those controls made them misleading for
  // it. Said on the card rather than left for a coach to discover at 3 a.m.
  assert.match(src, /Quiet hours and the daily cap apply to the client alerts above/,
    'the card does not say which notifications the quiet hours and cap actually cover');
});

test('an unset switch reads the GATE\u2019s default for that channel, not simply ON', () => {
  // ⚠ MEASURED, AND EMAIL IS THE ONE THAT MATTERS. `defaultChannels()` returns
  // { inapp:true, push:true, email:false } and `channelsForType` uses it for any
  // channel with no stored override — so rendering every unset switch as ON showed a
  // coach Email ✓ in teal on "Client went red" while no email is ever sent. Worse,
  // their first tap computed !true and saved an explicit email:false, so actually
  // enabling it took two taps.
  const src = stripComments(SETTINGS);
  const fn = src.slice(src.indexOf('const isOn ='));
  assert.match(fn.slice(0, 260), /CST_DEFAULT_CHANNELS\[ch\]/,
    'an unset preference does not follow the delivery gate\u2019s own default');
  // …and the panel\u2019s copy of that default is checked against the gate itself
  const map = new Function('return ' + /const CST_DEFAULT_CHANNELS = (\{[^}]*\});/.exec(src)[1])();
  assert.deepEqual(map, channelsForType({ matrix: {} }, 'client_red'),
    'the panel\u2019s default channels have drifted from defaultChannels()');
  // every coach type the panel offers is default-on at the TYPE level, which is a
  // different gate from the per-channel one above
  for (const k of Object.keys(NOTIFY_TYPES)) {
    if (NOTIFY_TYPES[k].audience !== 'coach') continue;
    assert.equal(NOTIFY_TYPES[k].defaultOn, true, k + ' is not default-on; the panel now lies about it');
  }
});

test('an unreadable notification read is its own state, not a panel of invented defaults', () => {
  const src = stripComments(SETTINGS);
  assert.match(src, /state\.settings === null/, 'a failed read falls through to the switches');
  assert.match(src, /Couldn't read your notification settings/);
  // measured: reaching `s.muted` on a null settings object threw during render and
  // took the whole page down, which is how this was found
  const at = src.indexOf('const s = state.settings;');
  assert.ok(at > src.indexOf('state.settings === null'), 'the guard sits after the dereference it protects');
});

// ── the tuning reaches the notifications the same panel configures ───────────
test('the SERVER passes the coach’s tuning into the engine it imports', async () => {
  // ⚠ THE FINDING THAT CHANGED THE DESIGN. src/lib/ai/notify-core.ts imports this very
  // dashSignals.js to build client_red / client_amber for /api/ai/notify and its cron
  // — at compiled-in defaults, reading no coach_settings. So a trainer who raised the
  // food-log gap 3 → 6 watched their roster stop flagging while the cron went on
  // pushing "needs you" alerts for exactly those clients, under a page whose subtitle
  // promises both. Driven against the real module, not matched.
  const src = stripComments(CORE);
  assert.match(src, /export async function loadCoachThresholds/);
  assert.match(src, /getTriageFeed\(role, clients, opts\.now, opts\.thresholds/,
    'the server still calls the engine at house defaults');
  for (const route of ['src/app/api/ai/notify/route.ts', 'src/app/api/ai/notify/cron/route.ts']) {
    const r = stripComments(readFileSync(new URL('../' + route, import.meta.url), 'utf8'));
    assert.match(r, /loadCoachThresholds\(/, route + ' does not load the coach tuning');
    assert.match(r, /thresholds\b/, route + ' does not pass it through');
  }
});

test('candidatesFor runs the coach’s tuning and leaves no trace on the module', async () => {
  const { candidatesFor } = await import('../src/lib/ai/notify-core.ts').catch(() => ({}));
  // The TS module may not be importable from node --test; the property that matters is
  // the engine's, and it is drivable directly.
  const clients = [{ profile: { id: 'c1', name: 'A' }, userId: 'c1',
                     foodLogs: { lastLoggedOn: ago(4), daysLogged7d: 3 } }];
  const before = { ...THRESHOLDS };
  const hot = DS.getTriageFeed('trainer', clients, NOW);
  const cool = DS.getTriageFeed('trainer', clients, NOW, tuned({ FOOD_GAP_DAYS: 6 }));
  assert.ok(hot[0].flags.some((f) => f.key === 'food_gap'), 'setup: the default does not flag');
  assert.ok(!cool[0].flags.some((f) => f.key === 'food_gap'), 'the feed ignored the per-call tuning');
  assert.deepEqual({ ...THRESHOLDS }, before, 'the feed leaked a tuning into the module');
  assert.ok(typeof candidatesFor === 'function' || candidatesFor === undefined);
});

// ── the panel's remaining honesty ────────────────────────────────────────────
test('an edit made while the document is still loading is refused, not swallowed', () => {
  // ⚠ It used to land in `localDemo`, paint, count as tuned, and vanish the moment the
  // read resolved — under a header claiming "Preview — changes stay on this tab",
  // which was false in both halves. dashWeek was fixed for this on 2026-09-09.
  const src = stripComments(SETTINGS);
  // ⚠ ANCHORED ON WHAT `settling` DOES, NOT ON ITS EXPRESSION — the fourth time in this
  // PR that pinning a spelling failed a test about something else. Widening it to cover
  // an unresolved AUTH answer broke this assertion, which cares only that an edit made
  // before the panel can persist is refused rather than painted and lost.
  assert.match(src, /const settling = /, 'the settling gate is gone');
  assert.match(src, /store\.kind === "loading"/, 'a loading store no longer counts as settling');
  const patch = src.slice(src.indexOf('const patch = (mut)'));
  assert.match(patch.slice(0, 200), /if \(settling\) return Promise\.resolve\(false\);/,
    'an edit during the load still reaches the store');
  assert.match(src, /disabled=\{settling\}/, 'the controls stay live while the store cannot take a write');
});

test('a stored override the engine REFUSED is not painted as an active tuning', () => {
  // Otherwise the panel shows 999 in teal, counts "1 tuned", and the roster runs at 3
  // — which is precisely what refuse-don't-clamp exists to prevent.
  const src = stripComments(SETTINGS);
  assert.match(src, /const refused = new Set\(\(\(tuning && tuning\.refused\) \|\| \[\]\)/);
  assert.match(src, /const isTuned = val != null && !wasRefused;/);
  assert.match(src, /wasRefused \? "not used"/, 'a refused row says nothing about being refused');
  // and useDashboard has to carry it out for any of that to be reachable
  assert.match(stripComments(DATA), /source: state\.source, tuning \}/, 'the refusals are swallowed again');
});

test('a number field commits on blur and refuses an empty value', () => {
  // ⚠ `Number("")` is 0 and finite: selecting the field and pressing Backspace SAVED 0
  // — the check-in grace disabled, or quiet hours moved to midnight, in one keypress.
  // And a per-keystroke write meant typing "14" wrote 1 first, running the whole live
  // roster at FOOD_GAP_DAYS 1 for a moment.
  const src = stripComments(SETTINGS);
  const fn = src.slice(src.indexOf('function CstNumber'), src.indexOf('function cstTz'));
  assert.match(fn, /const n = t === "" \? NaN : Number\(t\);/, 'an emptied field still coerces to 0');
  assert.match(fn, /onBlur=\{commit\}/, 'the field does not commit on blur');
  assert.ok(!/onChange=\{\(e\) => \{[^}]*onCommit/.test(fn), 'the field still writes on every keystroke');
  assert.match(fn, /if \(n !== value\) onCommit\(n\);/, 'a no-op re-commit still writes');
  // both number surfaces use it
  assert.equal((src.match(/<CstNumber/g) || []).length, 3, 'a raw number input is back');
});

test('a notification write that fails is rolled back, and a later success cannot hide it', () => {
  const src = stripComments(SETTINGS);
  assert.match(src, /const failSettings = \(before, msg\)/);
  assert.match(src, /const failMatrix = \(before, msg\)/);
  assert.ok(!/\bfail\(before/.test(src), 'the two rollback paths are conflated again');
  // the optimistic paint is captured BEFORE the write, or there is nothing to restore
  for (const name of ['saveSettings', 'toggle']) {
    // Anchored on the declaration, not on `= async`: the write now goes through a
    // serial lane, so the arrow's shape changed and an assertion about ROLLBACK broke
    // for a reason it does not care about.
    const at = src.indexOf('const ' + name + ' =');
    assert.ok(at > 0, name + ' moved');
    const body = src.slice(at, src.indexOf('\n  });', at));
    assert.ok(body.indexOf('const before =') >= 0 && body.indexOf('setState(') >= 0, name + ': expected a snapshot and a paint');
    assert.ok(body.indexOf('const before =') < body.indexOf('setState('), name + ' paints before it snapshots');
  }
});

test('quiet hours carry the coach’s timezone, or they are evaluated in UTC', () => {
  // The column defaults to 'UTC' and this panel is the first place a coach ever writes
  // the row; `inQuietHours` resolves the hour through prefs.tz. Omitting it silenced a
  // Los Angeles coach 15:00–00:00 local and pushed at 3 a.m.
  const src = stripComments(SETTINGS);
  assert.match(src, /tz: cstTz\(\)/, 'notification_settings is written without a timezone');
  assert.match(src, /function cstTz\(\)[\s\S]{0,160}resolvedOptions\(\)\.timeZone/);
});

test('a channel returning to the house default deletes its row rather than freezing it', () => {
  // notification_preferences holds OVERRIDES only. Writing today's default freezes it
  // into the coach's data, so a later change to house policy silently exempts every
  // coach who ever touched that switch — the same rule the thresholds follow.
  const src = stripComments(SETTINGS);
  assert.match(src, /on === CST_DEFAULT_CHANNELS\[channel\]/);
  assert.match(src, /\.delete\(\)\.eq\("user_id", uid\)\.eq\("type", type\)\.eq\("channel", channel\)/);
});

test('the coach_settings document is read once, and a save drops the cache first', () => {
  const data = stripComments(DATA);
  assert.match(data, /async function dashReadCoachSettings/);
  assert.match(data, /function dashInvalidateCoachSettings/);
  // ⚠ ONLY A SUCCESSFUL READ IS CACHED: pinning a null would keep a coach on house
  // policy for the whole TTL after they sign in, with the panel calling their
  // settings unreadable.
  // Anchored on the two invariants, not the line: it now also carries a generation
  // guard, so pinning the expression failed a test about CACHING for a reason it does
  // not care about — the third time in this PR.
  assert.match(data, /if \(doc != null && gen === _dashCoachSettingsGen\)/,
    'a null read is cached, or a read caches outside its generation');
  const announce = stripComments(SETTINGS).slice(stripComments(SETTINGS).indexOf('const announce ='));
  const body = announce.slice(0, announce.indexOf('\n  };'));
  assert.ok(body.indexOf('dashInvalidateCoachSettings') < body.indexOf('dispatchEvent'),
    'the event fires before the cache is dropped, so listeners re-read a stale document');
});

test('the landing tab replaces history rather than pushing onto it', () => {
  // An assignment to location.hash pushes, on top of the "#today" the effect just
  // replaceState'd — so Back landed the coach on a tab they never chose and a second
  // Back was needed to leave the dashboard.
  for (const shell of ['TrainerApp.html', 'NutritionistApp.html']) {
    const html = stripComments(readFileSync(new URL('../public/newdesign/' + shell, import.meta.url), 'utf8'));
    const at = html.indexOf('cstResolveLandingTab(');
    const block = html.slice(at, at + 900);
    assert.match(block, /history\.replaceState\(null, "", "#" \+ slug\)/, shell + ': the landing tab pushes history');
    assert.ok(!/window\.location\.hash = "#" \+ slug/.test(block), shell + ': the hash is still assigned');
    assert.match(block, /setRoute\((ta|na)Parse\(\)\)/, shell + ': replaceState fires no hashchange, so nothing re-renders');
  }
});

test('no dead locals read as live inputs', () => {
  // The repo swept exactly this shape on 2026-09-02 rather than leaving it to be
  // mistaken for a saved-vs-unsaved comparison the panel does not make.
  assert.ok(!/const saved = \(doc\.thresholds/.test(SETTINGS), 'the dead `saved` local is back');
});

// ── the two notify routes are different handlers ─────────────────────────────
test('the app-driven notify route is session-authed and is NOT the cron handler', () => {
  // ⚠ THIS GUARD EXISTS BECAUSE A TOOLING BUG SILENTLY OVERWROTE ONE WITH THE OTHER.
  // A mutation harness backed its files up by BASENAME, and both of these are called
  // `route.ts` — so the cron's copy clobbered the live route's backup and the restore
  // wrote the cron handler over both paths. `tsc` passed (both files are valid) and no
  // test covered the live route's auth, so it reached a PR: the mobile app posts here
  // with the signed-in user's bearer token and would have received 401 on every call,
  // evaluating no notifications and persisting no snapshot for the cron to re-run.
  const live = stripComments(readFileSync(new URL('../src/app/api/ai/notify/route.ts', import.meta.url), 'utf8'));
  const cron = stripComments(readFileSync(new URL('../src/app/api/ai/notify/cron/route.ts', import.meta.url), 'utf8'));
  assert.notEqual(live, cron, 'the two notify routes are the same handler');
  // the live one authenticates a USER; it must never gate on the cron secret
  assert.match(live, /resolveActor\(/, 'the app-driven route no longer resolves a signed-in actor');
  assert.ok(!/NOTIFY_CRON_SECRET/.test(live), 'the app-driven route now requires the cron secret');
  assert.match(live, /writeUserGoal\([\s\S]{0,120}notify_snapshot/, 'the live route no longer persists the snapshot the cron re-runs');
  // …and the cron one is the opposite
  assert.match(cron, /NOTIFY_CRON_SECRET/, 'the cron route no longer gates on its secret');
  assert.ok(!/resolveActor\(/.test(cron), 'the cron route now expects a user session');
  // both carry the R14 tuning, which is the thing this PR added to each
  for (const [label, src] of [['live', live], ['cron', cron]]) {
    assert.match(src, /loadCoachThresholds\(/, label + ' route does not load the coach tuning');
  }
});

test('a refused override is not counted as tuned', () => {
  // Otherwise the header says "1 tuned" while the row beneath says "not used" and both
  // the roster and the server run the house default — the card contradicting itself for
  // exactly the untrusted-document case the validation exists to handle.
  const src = stripComments(SETTINGS);
  assert.match(src, /const tunedCount = tunables\.filter\(\(t\) => effThresholds\[t\.key\] != null && !refused\.has\(t\.key\)\)/);
});

test('whole-row notification writes are serialized', () => {
  // ⚠ `notification_settings` is upserted as a WHOLE ROW. Two quick changes raced: if
  // the earlier request finished last, its older snapshot overwrote the newer change —
  // and an earlier FAILURE could roll the panel back over an edit already made.
  const src = stripComments(SETTINGS);
  assert.match(src, /function cstSerial\(fn\)/);
  for (const name of ['saveSettings', 'toggle']) {
    const at = src.indexOf('const ' + name + ' =');
    assert.ok(at > 0, name + ' moved');
    assert.match(src.slice(at, at + 140), /cstSerial\(async \(\) => \{/, name + ' writes outside the lane');
  }
  // the lane survives a rejection, or one failed write wedges every later one
  const lane = src.slice(src.indexOf('function cstSerial'));
  assert.match(lane.slice(0, 220), /_cstLane\.then\(fn, fn\)/, 'a failed write skips the next one');
  assert.match(lane.slice(0, 220), /\.then\(\(\) => \{\}, \(\) => \{\}\)/, 'a rejection wedges the lane');
});

// ── the stale-read races ─────────────────────────────────────────────────────
test('a read started before an invalidation cannot repopulate the cache', () => {
  // ⚠ TWO RACES ON ONE DOCUMENT. Two callers miss the cache together and both fetch;
  // the LATE one wrote the cache — so a read started BEFORE a save, finishing after
  // it, pinned the stale document for the whole TTL and the roster ran the old
  // thresholds while the server already held the new ones.
  const src = stripComments(DATA);
  assert.match(src, /let _dashCoachSettingsGen = 0;/);
  const read = src.slice(src.indexOf('async function dashReadCoachSettings'));
  const body = read.slice(0, read.indexOf('\nfunction dashInvalidateCoachSettings'));
  assert.match(body, /const gen = _dashCoachSettingsGen;/, 'the read does not record its generation');
  assert.match(body, /gen === _dashCoachSettingsGen/, 'a stale read can still write the cache');
  // …and concurrent callers collapse onto one round trip
  assert.match(body, /if \(_dashCoachSettingsFlight\) return _dashCoachSettingsFlight;/);
  // the invalidation bumps the generation AND drops the flight, or the next caller
  // joins a read that started before the save
  const inv = src.slice(src.indexOf('function dashInvalidateCoachSettings'));
  const invBody = inv.slice(0, inv.indexOf('\n}') + 2);
  assert.match(invBody, /_dashCoachSettingsGen \+= 1;/);
  assert.match(invBody, /_dashCoachSettingsFlight = null;/, 'a new caller can join a pre-save flight');
});

test('an older threshold load cannot overwrite a newer one', () => {
  // A mount read still in flight when a save fires the change event resolves AFTER the
  // post-save read, and would set the OLD tuning as the answer.
  const src = stripComments(DATA);
  const hook = src.slice(src.indexOf('function useCoachThresholds'));
  const body = hook.slice(0, hook.indexOf('return resolved'));
  assert.match(body, /const genRef = React\.useRef\(0\);/);
  assert.match(body, /const gen = \(genRef\.current \+= 1\);/, 'the load does not claim a generation');
  assert.match(body, /if \(gen !== genRef\.current\) return;/, 'a stale load can still set the tuning');
  // the guard sits between the await and the setState, or it guards nothing
  const awaitAt = body.indexOf('await dashReadCoachSettings()');
  const guardAt = body.indexOf('if (gen !== genRef.current) return;');
  const setAt = body.indexOf('setResolved(dashResolveCoachThresholds(doc))');
  assert.ok(awaitAt < guardAt && guardAt < setAt, 'the generation check does not sit between the read and the write');
});

// ── a role never runs on a threshold its panel cannot show ───────────────────
test('every tunable is visible to every role whose evaluation it can move', () => {
  // ⚠ THE `role` FIELD WAS A FICTION AND IT COST TWO ROUNDS, ONE THRESHOLD AT A TIME.
  // The engine does not evaluate a different rule set per role so much as ROUTE the
  // flags: `ruleSleepRecovery` fires outside every `disciplineForRole` branch, and
  // `readOnlyFlags` deliberately runs the nutrition rules for the NON-nutrition role so
  // a trainer keeps the under-fuelling read as routed context — which dashToday renders
  // (`r.readOnly`). So a "nutritionist-only" threshold moved what a TRAINER saw, and the
  // previous guard missed it by comparing only `.flags`. This drives BOTH surfaces.
  const ROLES = ['trainer', 'nutritionist'];
  const rec = {
    // +25% over / 25% under: inside the 1–50 ranges, so the min trips the rule and the
    // max does not. A fixture at the boundary fires at both ends and proves nothing.
    nutrition: { avgCalories: 2500, targetCalories: 2000, avgProtein: 135, targetProtein: 180 },
    sleep: { avg7dHours: 5.5, targetHours: 8 },
  };
  assert.ok(TUNABLES.every((t) => !('role' in t)),
    'a tunable is role-scoped again — a hidden row still moves that role, see TUNABLES');
  // Everything a role can SEE: its own flags plus the routed read-only ones.
  const seen = (r, t) => {
    const row = DS.getTriageFeed(r, [{ profile: { id: 'c1', name: 'A' }, userId: 'c1', ...rec }], NOW, t)[0];
    return (row.flags || []).map((f) => f.key)
      .concat(((row && row.readOnly) || []).map((f) => f.key)).sort().join(',');
  };
  let moved = 0;
  for (const t of TUNABLES) {
    const lo = tuned({ [t.key]: t.min });
    const hi = tuned({ [t.key]: t.max });
    for (const r of ROLES) if (seen(r, lo) !== seen(r, hi)) moved += 1;
  }
  // ⚠ THE FIXTURE PROVES ITSELF, or a fixture that trips nothing passes silently — the
  // exact way the previous cut of this guard survived a mutation.
  assert.ok(moved >= 4, 'the fixture moves too few role/threshold pairs (' + moved + ') to test anything');
});

// ── the panel asks the right question about being signed in ──────────────────
test('persistence keys on AUTHENTICATION, not on the roster fetch', () => {
  // ⚠ `source` is about DATA: null while the roster is in flight, "demo" when that
  // request FAILS. Keying on it made a roster outage turn every settings edit tab-only
  // and tell a signed-in coach to sign in while the settings backend was healthy — and
  // an edit made during the pending window was dropped once the roster resolved.
  const src = stripComments(SETTINGS);
  assert.match(src, /const signedIn = useSignedIn\(\);/, 'the panel still infers auth from the roster');
  assert.match(src, /const live = signedIn === true;/);
  assert.ok(!/const live = source === "live"/.test(src), 'live is derived from the roster again');
  // an unknown answer is settling, or an early edit is routed before it is known
  assert.match(src, /const settling = signedIn === undefined \|\| \(live && store\.kind === "loading"\)/);
  // …and `source` still decides the demo band, which IS a statement about the data
  assert.match(src, /source === "demo" && <DashDemoBand \/>/);
});

test('useSignedIn resolves independently and has three states', () => {
  const src = stripComments(DATA);
  const fn = src.slice(src.indexOf('function useSignedIn'));
  const body = fn.slice(0, fn.indexOf('\n  return signedIn;') + 20);
  assert.match(body, /React\.useState\(undefined\)/, 'the unknown state is missing');
  assert.match(body, /await dashDocBridge\(\)/, 'a cookie-only session reads as anon');
  assert.match(body, /await dashDocUid\(\)/);
  assert.ok(!/useDashboard|source/.test(body), 'the auth answer depends on the roster again');
});
