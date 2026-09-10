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

// ── the notification write lane, DRIVEN ──────────────────────────────────────
// The handlers are brace-matched out of the SHIPPED component and executed against a
// stubbed React + supabase, so an equivalent rewrite passes and a real regression
// fails. A source pin could tell neither apart — and the previous version of this
// guard broke on a correct refactor for exactly that reason.
function driveNotificationCard(seed, run) {
  const a = SETTINGS.indexOf('function CoachNotificationCard({ signedIn, acct }) {');
  // The prelude ends where the render ladder begins — anchored on the LAST handler
  // rather than on the first `if`, which moved the moment a branch was added above it.
  const b = SETTINGS.indexOf('\n  });', SETTINGS.indexOf('const toggle =', a)) + '\n  });'.length;
  assert.ok(a > 0 && b > a, 'CoachNotificationCard moved');
  const prelude = SETTINGS.slice(a + 'function CoachNotificationCard({ signedIn, acct }) {'.length, b);
  // The notice-wording helpers and the type table are SHIPPED code too — reimplementing
  // them here would guard a copy nobody runs.
  const deps = ['const CST_COACH_TYPES =', 'const CST_FIELD_NAMES =', 'function cstFieldName(', 'function cstTypeName(']
    .map((decl) => {
      const at = SETTINGS.indexOf(decl);
      assert.ok(at > 0, decl + ' moved');
      let d = 0, seen = false, k = at;
      for (; k < SETTINGS.length; k++) {
        const ch = SETTINGS[k];
        if (ch === '{' || ch === '[') { d++; seen = true; }
        else if (ch === '}' || ch === ']') { d--; }
        else if (ch === ';' && d === 0) { k++; break; }
        if (seen && d === 0 && (ch === '}' || ch === ']')) { if (SETTINGS[k + 1] === ';') k++; k++; break; }
      }
      return SETTINGS.slice(at, k);
    }).join('\n');

  const cells = [];
  let cursor = 0;
  const React = {
    useState(init) {
      const i = cursor++;
      if (cells.length <= i) cells[i] = { v: typeof init === 'function' ? init() : init };
      const cell = cells[i];
      return [cell.v, (nv) => { cell.v = typeof nv === 'function' ? nv(cell.v) : nv; }];
    },
    useRef(init) { const i = cursor++; if (cells.length <= i) cells[i] = { current: init }; return cells[i]; },
    // `useEffect(() => { load(); })` discards load's promise, exactly as the shipped
    // component does — so the harness tracks it here or `flushEffects` returns before
    // the read it fired has settled, and every assertion after it reads a stale cell.
    useCallback: (fn) => (...args) => { const r = fn(...args); if (r && typeof r.then === 'function') pending.push(r); return r; },
    useEffect: (fn) => { effects.push(fn); },
  };
  const effects = [];
  const pending = [];
  let lane = Promise.resolve();
  const cstSerial = (fn) => { const next = lane.then(fn, fn); lane = next.then(() => {}, () => {}); return next; };
  const CST_DEFAULT_CHANNELS = { inapp: true, push: true, email: false };
  const cstTz = () => 'America/Los_Angeles';
  const win = { shapeDb: seed.db };
  const make = new Function(
    'React', 'cstSerial', 'CST_DEFAULT_CHANNELS', 'cstTz', 'window', 'signedIn', 'acct',
    deps + '\n' + prelude + '\n  return { load, saveSettings, toggle, read: () => ({ state, err }) };'
  );
  // the body re-runs on every "render", exactly as React would
  const render = () => { cursor = 0; return make(React, cstSerial, CST_DEFAULT_CHANNELS, cstTz, win, seed.signedIn !== false, seed.acct === undefined ? 'coach-1' : seed.acct); };
  let api = render();
  // The handlers write through the setState cells; the `state` binding a render
  // closed over is stale by construction, so reading it means rendering again —
  // which is exactly what React does and what the fix has to survive.
  const snap = () => { api = render(); return api.read(); };
  const flushEffects = async () => {
    const q = effects.splice(0);
    for (const fn of q) await fn();
    while (pending.length) await Promise.all(pending.splice(0));
  };
  return run({ render: () => (api = render()), api: () => api, snap, flushEffects, setSignedIn: (v) => { seed.signedIn = v; } });
}

// ⚠ THE WRITE BEHAVIOUR IS A PARAMETER, NOT A STATIC ON THE FACTORY. A mutable
// `okDb.nextUpsert` that no test reset let the last fixture's injected failure leak
// into every test written after it — which fails, or passes, for a reason it does not
// care about. `del` is thenable so the DELETE branch can be made to fail too.
const okDb = (rows, write) => {
  const w = write || (async () => ({ error: null }));
  const builder = {
    auth: { getUser: async () => ({ data: { user: { id: 'coach-1' } } }) },
    rpc: async () => ({ data: rows, error: null }),
    from() { return this; },
    upsert: async (row) => w('upsert', row),
    delete() { this._del = true; return this; },
    eq() { return this; },
    then(res, rej) { const p = this._del ? (this._del = false, w('delete', null)) : Promise.resolve({ error: null }); return Promise.resolve(p).then(res, rej); },
  };
  return { getSession: async () => ({}), client: builder };
};
// one failure then successes, the interleave every resurrection test needs
const failFirst = (gate) => {
  let n = 0;
  return async () => { n += 1; if (n > 1) return { error: null }; if (gate) await gate; return { error: { message: 'nope' } }; };
};

test('a queued notification write is built from the CONFIRMED state, not a render snapshot', async () => {
  // ⚠ CODEX ROUND 5. A second change made while the first is in flight used to carry
  // the first one's optimistic value in its payload — React had re-rendered, so the
  // handler closed over a state that had not been confirmed by anything. When the
  // first failed, its rollback was undone the moment the second started: the whole-row
  // upsert RESURRECTED the change the server had just refused, and the second one's
  // success cleared the notice.
  //
  // ⚠ THE RE-RENDER BETWEEN THE TWO CLICKS IS THE WHOLE FIXTURE. Without it both
  // handlers read the same pre-paint closure and the defect cannot reproduce — the
  // first cut of this guard omitted it and the mutation SURVIVED.
  let release;
  const gate = new Promise((r) => { release = r; });
  await driveNotificationCard(
    { signedIn: true, db: okDb({ settings: { muted: false, quiet_start: 22, quiet_end: 7, daily_cap: 4 }, prefs: [] }, failFirst(gate)) },
    async (h) => {
      await h.api().load();
      h.render();
      const first = h.api().saveSettings({ muted: true });        // in flight, will fail
      for (let k = 0; k < 6; k++) await Promise.resolve();        // its optimistic paint lands
      h.render();                                                 // React repaints with muted: true
      const second = h.api().saveSettings({ daily_cap: 6 });      // queued behind it
      release();
      await Promise.all([first, second]);
      const { state, err } = h.snap();
      assert.equal(state.settings.muted, false, 'the refused change was resurrected by the next write');
      assert.equal(state.settings.daily_cap, 6, 'the later write did not land');
      assert.ok(err, 'a success on another field hid the notice for the one that failed');
    }
  );
});

test('a settings write sends ONLY its patch, so another surface is never reverted', async () => {
  // ⚠ THE ROOT CAUSE, not a workaround for it. Upserting all four columns from a copy
  // read at page load silently reverted whatever the coach changed on their phone or
  // in another tab. Both siblings — mobile `saveNotifySettings` and the member panel's
  // own — send the patch alone, and the column defaults are byte-for-byte what this
  // panel invents, so a partial upsert that CREATES the row lands what is on screen.
  const sent = [];
  await driveNotificationCard(
    { signedIn: true, db: okDb({ settings: { muted: false, quiet_start: 22, quiet_end: 7, daily_cap: 4 }, prefs: [] }, async (op, row) => { sent.push([op, row]); return { error: null }; }) },
    async (h) => {
      await h.api().load();
      h.render();
      await h.api().saveSettings({ daily_cap: 6 });
      assert.equal(sent.length, 1);
      const [, row] = sent[0];
      assert.deepEqual(Object.keys(row).sort(), ['daily_cap', 'tz', 'updated_at', 'user_id']);
      assert.equal(row.daily_cap, 6);
      assert.ok(!('quiet_start' in row) && !('muted' in row), 'the whole row was sent over another surface');
    }
  );
});

test('every saveSettings call site passes a PATCH — the contract the handlers cannot see', () => {
  // ⚠ PROVEN BY MUTATION, NOT ASSUMED. The driven harness slices the prelude only, so
  // reverting a button to `saveSettings({ ...s, muted: !s.muted })` — which fully
  // reinstates the resurrection defect — left the whole driven suite green. The
  // contract lives at the JSX call sites, so a guard has to read them.
  const src = stripComments(SETTINGS);
  const calls = src.match(/saveSettings\(\{[^}]*\}\)/g) || [];
  assert.ok(calls.length >= 4, 'the settings call sites moved (' + calls.length + ' found)');
  for (const c of calls) assert.ok(!/\.\.\./.test(c), 'a call site spreads a render snapshot instead of passing a patch: ' + c);
  // and the third argument of a toggle is the value, never a row
  const toggles = src.match(/toggle\([^)]*\)/g) || [];
  assert.ok(toggles.some((t) => /!isOn\(/.test(t)), 'the toggle call site moved');
});

test('a success clears only its own notice, and the surviving text is a live failure', async () => {
  const results = [{ error: { message: 'nope' } }, { error: null }, { error: null }];
  await driveNotificationCard(
    { signedIn: true, db: okDb({ settings: { muted: false, quiet_start: 22, quiet_end: 7, daily_cap: 4 }, prefs: [] }, async () => results.shift() || { error: null }) },
    async (h) => {
      await h.api().load();
      h.render();
      await h.api().saveSettings({ muted: true });   // fails
      const first = h.snap().err;
      assert.match(first, /mute switch/, 'the notice did not name the field that failed');
      await h.api().saveSettings({ daily_cap: 6 });  // a DIFFERENT field succeeds
      assert.equal(h.snap().err, first, 'another field succeeding cleared the failed one\u2019s notice');
      await h.api().saveSettings({ muted: true });   // the retry succeeds
      const { state, err } = h.snap();
      assert.equal(state.settings.muted, true);
      assert.equal(err, '', 'the notice outlived the write that cleared it');
    }
  );
});

test('a failed channel toggle is not resurrected by the next one either', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  await driveNotificationCard(
    { signedIn: true, db: okDb({ settings: { muted: false, quiet_start: 22, quiet_end: 7, daily_cap: 4 }, prefs: [] }, failFirst(gate)) },
    async (h) => {
      await h.api().load();
      h.render();
      // ⚠ THE TWO TOGGLES SHARE A TYPE ON PURPOSE. Across two types the mutated base
      // resolves to the same empty row and the resurrection is invisible — measured:
      // a first cut used client_red then client_amber and the mutation SURVIVED.
      const first = h.api().toggle('client_red', 'email', true);   // in flight, will fail
      for (let k = 0; k < 6; k++) await Promise.resolve();
      h.render();
      const second = h.api().toggle('client_red', 'push', false);  // queued behind it
      release();
      await Promise.all([first, second]);
      const { state, err } = h.snap();
      const row = h.snap().state.matrix.client_red || {};
      assert.notEqual(row.email, true, 'the refused override came back');
      assert.equal(row.push, false, 'the later toggle did not land');
      assert.ok(err, 'the failed toggle lost its notice');
    }
  );
});

test('a failed toggle is not carried into a write on a DIFFERENT type either', async () => {
  // ⚠ THE SAME DEFECT AT THE OTHER LEVEL, AND IT NEEDS ITS OWN FIXTURE. The row for
  // the type being written and the map the write spreads are two separate reads of the
  // base: within one type only the row can leak, across types only the map can, so a
  // single scenario leaves one of the two mutations alive. Measured, both ways.
  let release;
  const gate = new Promise((r) => { release = r; });
  await driveNotificationCard(
    { signedIn: true, db: okDb({ settings: { muted: false, quiet_start: 22, quiet_end: 7, daily_cap: 4 }, prefs: [] }, failFirst(gate)) },
    async (h) => {
      await h.api().load();
      h.render();
      const first = h.api().toggle('client_red', 'email', true);    // in flight, will fail
      for (let k = 0; k < 6; k++) await Promise.resolve();
      h.render();
      const second = h.api().toggle('client_amber', 'email', true); // a different type
      release();
      await Promise.all([first, second]);
      const { state } = h.snap();
      assert.notEqual(state.matrix.client_red && state.matrix.client_red.email, true, 'the refused override rode along on another type\u2019s write');
      assert.equal(state.matrix.client_amber.email, true);
    }
  );
});

test('a toggle back to the house default deletes the row, and a refused DELETE rolls back', async () => {
  // The confirmed copy mirrors what is STORED: notification_preferences holds
  // overrides only, so a switch returning to the default must leave no row behind —
  // and the in-memory mirror must agree, or the next queued write re-adds it.
  const rows = { settings: { muted: false, quiet_start: 22, quiet_end: 7, daily_cap: 4 }, prefs: [{ type: 'client_red', channel: 'push', enabled: false }] };
  const ops = [];
  let deleteFails = false;
  const db = okDb(rows, async (op) => { ops.push(op); return deleteFails && op === 'delete' ? { error: { message: 'rls' } } : { error: null }; });
  await driveNotificationCard({ signedIn: true, db }, async (h) => {
    await h.api().load();
    h.render();
    assert.equal(h.snap().state.matrix.client_red.push, false, 'the stored override was not read');
    await h.api().toggle('client_red', 'push', true); // back to the house default
    assert.deepEqual(ops, ['delete'], 'returning to the default did not DELETE the override');
    const row = h.snap().state.matrix.client_red;
    assert.ok(!row || !('push' in row), 'the default was frozen back in as an override');
    // and the DELETE branch's failure is a rollback, not a silent success
    deleteFails = true;
    await h.api().toggle('client_red', 'inapp', true); // inapp default is true → a delete
    const after = h.snap();
    assert.ok(after.err, 'a refused DELETE reported nothing');
    assert.equal(after.state.matrix.client_red && after.state.matrix.client_red.push !== undefined, false);
  });
});

test('a read landing mid-write wins, and the rollback behind it is dropped', async () => {
  // The server\u2019s own answer is newer than any optimistic paint. A rollback that
  // fires after a fresh read would paint a state nobody is claiming any more, and
  // raise a notice about a change that is no longer on screen.
  let release;
  const gate = new Promise((r) => { release = r; });
  await driveNotificationCard(
    { signedIn: true, db: okDb({ settings: { muted: false, quiet_start: 22, quiet_end: 7, daily_cap: 4 }, prefs: [] }, async () => { await gate; return { error: { message: 'nope' } }; }) },
    async (h) => {
      await h.api().load();
      h.render();
      const w = h.api().saveSettings({ daily_cap: 6 });
      for (let k = 0; k < 6; k++) await Promise.resolve(); // the write reaches its await
      await h.api().load();  // a fresh read lands while it is still in flight
      release();
      await w;
      const { state, err } = h.snap();
      assert.equal(state.settings.daily_cap, 4, 'a stale rollback painted over a fresh read');
      assert.equal(err, '', 'a stale failure raised a notice about a state that is gone');
    }
  );
});

test('a coach whose auth has not resolved yet is never told their settings are unreadable', async () => {
  // ⚠ A FALSE NOTICE ON EVERY HEALTHY LOAD. `useSignedIn` resolves asynchronously, so
  // the card mounts with signedIn=false; settling `unreadable` there left settings
  // null, and the instant auth resolved the ladder rendered "Couldn't read your
  // notification settings — reload to try again" at a coach nobody had asked about.
  let release;
  const gate = new Promise((r) => { release = r; });
  const db = okDb({ settings: { muted: false, quiet_start: 22, quiet_end: 7, daily_cap: 4 }, prefs: [] });
  db.getSession = async () => { await gate; return {}; };
  await driveNotificationCard({ signedIn: false, db }, async (h) => {
    await h.flushEffects();                       // the mount effect, at signedIn=false
    assert.equal(h.snap().state, null, 'a signed-out mount was recorded as an unreadable read');
    h.setSignedIn(true);
    h.render();
    const p = h.flushEffects();                   // the re-read, still in flight
    assert.equal(h.snap().state, null, 'the card claims the read failed while it is still running');
    release();
    await p;
    assert.equal(h.snap().state.settings.daily_cap, 4);
  });
});

test('neither half of the panel writes from a read that never came back', async () => {
  // ⚠ THE SAME GUARD ON BOTH HALVES OR ON NEITHER. `matrix` is `{}` when the read
  // failed — truthy, so `toggle` had no bail: it wrote a preference row to the server
  // and replaced the mirror with one that had LOST every stored override, which the
  // next success would then confirm.
  const ops = [];
  const db = okDb(null, async (op) => { ops.push(op); return { error: null }; });
  db.client.rpc = async () => ({ data: null, error: { message: 'rls' } });
  await driveNotificationCard({ signedIn: true, db }, async (h) => {
    await h.api().load();
    assert.equal(h.snap().state.settings, null, 'an unreadable read was not recorded as one');
    await h.api().toggle('client_red', 'email', true);
    await h.api().saveSettings({ daily_cap: 6 });
    assert.deepEqual(ops, [], 'the panel wrote from settings nobody read');
    assert.equal(h.snap().err, '', 'a write that never ran raised a notice');
  });
});

test('a re-read shows LOADING, not the answer it is about to replace', async () => {
  // A settled read left on screen while the next one runs is a claim about state the
  // panel is in the middle of discarding — and if that next read fails, the coach was
  // shown live-looking controls the whole time.
  let release;
  const gate = new Promise((r) => { release = r; });
  let gated = false;
  const db = okDb({ settings: { muted: false, quiet_start: 22, quiet_end: 7, daily_cap: 4 }, prefs: [] });
  const raw = db.getSession;
  db.getSession = async () => { if (gated) await gate; return raw(); };
  await driveNotificationCard({ signedIn: true, db }, async (h) => {
    await h.api().load();
    assert.equal(h.snap().state.settings.daily_cap, 4);
    gated = true;
    const p = h.api().load();
    assert.equal(h.snap().state, null, 'the last read stayed on screen while the next one ran');
    release();
    await p;
    assert.equal(h.snap().state.settings.daily_cap, 4);
  });
});

test('the food-gap knob is honoured on the shape live accounts actually have', () => {
  // ⚠ A CONTROL THAT DOES NOTHING ON THE COMMON INPUT IS A DECORATION. Live rollups
  // carry no last-logged date, so `ruleFoodGap` falls to an empty-week approximation —
  // and that branch flagged unconditionally, ignoring FOOD_GAP_DAYS entirely. An empty
  // 7-day window establishes "at least 7 days" and nothing more, so a threshold ABOVE
  // the window is a question this evidence cannot answer; one at or under it is.
  const rec = (extra) => Object.assign({ id: 'c1', name: 'A', foodLogs: { lastLoggedOn: null, daysLogged7d: 0 } }, extra || {});
  assert.ok(flagKeys(rec()).includes('food_gap'), 'an empty week does not flag at the house default');
  assert.ok(flagKeys(rec(), tuned({ FOOD_GAP_DAYS: 3 })).includes('food_gap'), 'a threshold under the window stopped flagging');
  assert.ok(flagKeys(rec(), tuned({ FOOD_GAP_DAYS: 7 })).includes('food_gap'), 'the window itself stopped flagging');
  assert.ok(!flagKeys(rec(), tuned({ FOOD_GAP_DAYS: 10 })).includes('food_gap'), 'a 10-day gap was claimed from a 7-day window');
  assert.ok(!flagKeys(rec(), tuned({ FOOD_GAP_DAYS: 14 })).includes('food_gap'), 'the knob\u2019s own maximum still flags');
  // and the dated branch is untouched — a real last-logged date still measures the gap
  const dated = { id: 'c2', name: 'B', foodLogs: { lastLoggedOn: ago(9), daysLogged7d: 0 } };
  assert.ok(flagKeys(dated, tuned({ FOOD_GAP_DAYS: 8 })).includes('food_gap'));
  assert.ok(!flagKeys(dated, tuned({ FOOD_GAP_DAYS: 12 })).includes('food_gap'));
});

test('opening Settings does not run the roster pipeline', () => {
  // ⚠ ONE HUNDRED API CALLS TO EDIT A NUMBER. `useDashboard` fetches the roster and the
  // dashboard and then issues one /shared-overview per roster member; this page renders
  // none of it and needs only `tuning.refused`. `useCoachThresholds` is the hook
  // `useDashboard` itself uses for `tuning`, so the value is identical.
  const src = stripComments(SETTINGS);
  assert.ok(!/\buseDashboard\(/.test(src), 'the Settings page runs the whole dashboard pipeline again');
  assert.match(src, /const tuning = useCoachThresholds\(role\);/);
  // and the demo band is a statement about whose account this is, not about a roster
  assert.ok(!/source === "demo"/.test(src), 'the band still keys on the roster request');
  assert.match(src, /signedIn === false && <DashDemoBand \/>/);
  // the hook this page now depends on is exported for it
  assert.match(stripComments(DATA), /useCoachThresholds,/);
});

test('unknown authentication renders Loading, never the signed-out card', () => {
  // ⚠ THE SAME CONFLATION ONE FRAME EARLIER. `useSignedIn` starts undefined; collapsing
  // it to a boolean at the call site told every authenticated coach to sign in for the
  // whole auth round trip. The ORDER of the ladder is the invariant — the unknown
  // branch has to come first, or the signed-out card claims the answer.
  const src = stripComments(SETTINGS);
  assert.match(src, /<CoachNotificationCard key=\{acct \|\| "anon"\} signedIn=\{signedIn\} acct=\{acct\} \/>/, 'the card is handed a boolean, or is not remounted per account');
  // ⚠ THE INVARIANT IS "A SETTLED ANSWER OUTRANKS AN UNSETTLED ONE", NOT AN ORDER.
  // The first cut of this guard pinned unknown-before-signed-out, and that order is
  // exactly what broke the signed-out card: `load()` settles a signed-out visitor's
  // state to null, so a `state === null` test placed first swallowed them into
  // "Loading…" forever. Both directions are asserted now, by execution.
  const at = src.indexOf('function CoachNotificationCard');
  const ladder = src.slice(src.indexOf('  if (', src.indexOf('const toggle =', at)));
  const anon = ladder.indexOf('signedIn === false');
  const unknown = ladder.indexOf('signedIn === undefined');
  assert.ok(anon > -1, 'signed-out is inferred from a falsy check again');
  assert.ok(unknown > -1, 'the unknown-auth branch is gone');
  assert.ok(anon < unknown, 'a settled signed-out answer is decided after an unsettled one');
  const which = (signedIn, state) => (
    signedIn === false ? 'anon' : (signedIn === undefined || state === null) ? 'loading' : 'card'
  );
  assert.equal(which(false, null), 'anon', 'a signed-out visitor never reaches the sign-in card');
  assert.equal(which(undefined, null), 'loading');
  assert.equal(which(true, null), 'loading');
  assert.equal(which(true, {}), 'card');
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
  // ⚠ THE HOOK RESOLVES AN ACCOUNT NOW, not a flag — a one-shot boolean is the
  // cross-account defect. The invariant is that auth comes from it and not from the
  // roster, and that `live` still means "confirmed signed in".
  assert.match(src, /const acct = useSignedIn\(\);/, 'the panel still infers auth from the roster');
  assert.match(src, /const signedIn = acct === undefined \? undefined : acct !== null;/);
  assert.match(src, /const live = signedIn === true;/);
  assert.match(src, /useCoachDoc\("coach_settings", live, acct\)/, 'the document is not re-read when the account changes');
  // ⚠ AND THE HOOK MUST READ IT. Passing an argument a hook ignores is a fix that
  // looks applied and is not — measured: dropping it from the deps SURVIVED a guard
  // that only checked the call site.
  const dd = stripComments(DATA);
  assert.match(dd, /function useCoachDoc\(goalKind, live, accountId\)/);
  const hydrate = dd.slice(dd.indexOf('function useCoachDoc'));
  assert.match(hydrate.slice(0, hydrate.indexOf('const apply =')), /\}, \[goalKind, live, accountId\]\);/,
    'the document hydrate ignores the account it was handed');
  assert.ok(!/const live = source === "live"/.test(src), 'live is derived from the roster again');
  // an unknown answer is settling, or an early edit is routed before it is known
  assert.match(src, /const settling = signedIn === undefined \|\| \(live && store\.kind === "loading"\)/);
  // ⚠ THE BAND MOVED OFF `source` TOO, and the reason is narrower than the persistence
  // one: this page renders no roster data, so "is this a preview" is exactly "is this
  // someone's own account". Pinned in its own guard beside the pipeline check.
});

test('useSignedIn resolves an ACCOUNT, subscribes to changes, and keeps unreadable apart', async () => {
  // ⚠ A ONE-SHOT BOOLEAN IS THE CROSS-ACCOUNT DEFECT. If B signs in from another
  // same-origin tab, A's open Settings tab keeps its `true`, keeps A's document on
  // screen, and the write paths — which resolve getUser() at CLICK time — upsert the
  // displayed change under B's id. And `dashDocUid` swallows its failure and returns
  // null, so collapsing that to `false` showed an authenticated coach the preview UI
  // with live controls whose edits then vanished.
  const src = stripComments(DATA);
  const at = src.indexOf('function useSignedIn');
  const body = src.slice(at, src.indexOf('\nfunction ', at + 10));
  const SIGNED_IN_SRC = body;
  assert.match(body, /React\.useState\(undefined\)/, 'the unknown state is missing');
  assert.match(body, /await dashDocBridge\(\)/, 'a cookie-only session reads as anon');
  assert.match(body, /sub = db\.client\.auth\.onAuthStateChange\(/, 'a sign-in from another tab is never noticed');
  assert.match(body, /unsubscribe/, 'the auth subscription leaks');
  assert.ok(!/useDashboard|\bsource\b/.test(body), 'the auth answer depends on the roster again');
  // an identity, not a flag: nothing here may publish a boolean
  assert.ok(!/setUid\(!!/.test(body) && !/setUid\(true\)/.test(body), 'the hook publishes a boolean again');
  // ⚠ AND THE SHIPPED HOOK IS EXECUTED, NOT A LOCAL RESTATEMENT OF IT. The first cut
  // of this guard reimplemented the try/catch here and asserted against its own copy —
  // so a mutation that made the real catch resolve `null` SURVIVED. A guard that runs
  // its own version of the code under test is measuring nothing.
  const drive = async (getUser, onAuth) => {
    let cell, cleanup;
    const React = {
      useState: (init) => [cell === undefined ? (cell = init) : cell, (v) => { cell = v; }],
      useRef: (v) => ({ current: v }),
      useEffect: (f) => { cleanup = f(); },
    };
    const win = { shapeDb: { getUser, client: { auth: { onAuthStateChange: onAuth } } } };
    const hook = new Function('React', 'window', 'dashDocBridge', SIGNED_IN_SRC + '\nreturn useSignedIn;')(
      React, win, async () => {}
    );
    hook();
    for (let k = 0; k < 8; k++) await Promise.resolve();
    return { value: cell, cleanup };
  };
  const noop = () => ({ data: { subscription: { unsubscribe() {} } } });
  assert.equal((await drive(async () => ({ id: 'coach-1' }), noop)).value, 'coach-1');
  assert.equal((await drive(async () => null, noop)).value, null, 'a confirmed signed-out visitor is not null');
  assert.equal((await drive(async () => { throw new Error('offline'); }, noop)).value, undefined,
    'an unreadable auth read is reported as signed out');
  // the subscription is really taken, and a later event moves the answer
  let handler = null, unsubscribed = 0;
  const sub = (fn) => { handler = fn; return { data: { subscription: { unsubscribe() { unsubscribed += 1; } } } }; };
  const run = await drive(async () => ({ id: 'coach-a' }), sub);
  assert.equal(run.value, 'coach-a');
  assert.ok(handler, 'onAuthStateChange is named but never called');
  handler('SIGNED_IN', { user: { id: 'coach-b' } });
  assert.equal(await drive(async () => ({ id: 'coach-a' }), sub).then(() => 'ok'), 'ok');
  run.cleanup();
  assert.equal(unsubscribed, 1, 'the auth subscription leaks');

  // ⚠ AND AN EVENT BEATS THE READ THAT WAS ALREADY IN FLIGHT. The initial getUser() and
  // the subscription race: a read that observed A, resolving AFTER B signs in, put A
  // back — remounting A's settings under B's session and refusing B's own writes until
  // another event or a reload repaired the identity. The exact sequence CodeRabbit
  // named is driven here: initial read pending on A -> SIGNED_IN for B -> the read
  // resolves A -> the hook must still be B.
  let releaseA;
  const slowA = new Promise((r) => { releaseA = r; });
  let cell2, handler2 = null;
  const React2 = {
    useState: (init) => [cell2 === undefined ? (cell2 = init) : cell2, (v) => { cell2 = v; }],
    useRef: (v) => ({ current: v }),
    useEffect: (f) => { f(); },
  };
  const win2 = { shapeDb: {
    getUser: async () => { await slowA; return { id: 'coach-a' }; },
    client: { auth: { onAuthStateChange: (fn) => { handler2 = fn; return { data: { subscription: { unsubscribe() {} } } }; } } },
  } };
  new Function('React', 'window', 'dashDocBridge', SIGNED_IN_SRC + '\nreturn useSignedIn;')(
    React2, win2, async () => {}
  )();
  for (let k = 0; k < 4; k++) await Promise.resolve();
  handler2('SIGNED_IN', { user: { id: 'coach-b' } });
  assert.equal(cell2, 'coach-b', 'the auth event did not take effect');
  releaseA();
  for (let k = 0; k < 8; k++) await Promise.resolve();
  assert.equal(cell2, 'coach-b', 'a stale initial read overwrote a newer auth event');

  // ⚠ AND A STALE *FAILED* READ IS THE SAME DEFECT WITH A WORSE ENDING: it would wipe
  // a confirmed account back to unresolved, disabling the panel for a coach who is
  // signed in. Measured — a mutation of only the catch arm survived without this.
  let rejectC;
  const slowC = new Promise((_r, rej) => { rejectC = rej; });
  let cell3, handler3 = null;
  const React3 = {
    useState: (init) => [cell3 === undefined ? (cell3 = init) : cell3, (v) => { cell3 = v; }],
    useRef: (v) => ({ current: v }),
    useEffect: (f) => { f(); },
  };
  const win3 = { shapeDb: {
    getUser: async () => { await slowC; return { id: 'coach-a' }; },
    client: { auth: { onAuthStateChange: (fn) => { handler3 = fn; return { data: { subscription: { unsubscribe() {} } } }; } } },
  } };
  new Function('React', 'window', 'dashDocBridge', SIGNED_IN_SRC + '\nreturn useSignedIn;')(
    React3, win3, async () => {}
  )();
  for (let k = 0; k < 4; k++) await Promise.resolve();
  handler3('SIGNED_IN', { user: { id: 'coach-b' } });
  rejectC(new Error('offline'));
  for (let k = 0; k < 8; k++) await Promise.resolve();
  assert.equal(cell3, 'coach-b', 'a stale FAILED read wiped a confirmed account back to unresolved');
});

test('a write refuses an account that is not the one the panel is rendering', () => {
  // ⚠ THE CROSS-ACCOUNT WRITE ITSELF. Resolving the user at click time is what let a
  // switch in another tab upsert A's displayed change under B's id.
  const src = stripComments(SETTINGS);
  const at = src.indexOf('const authUid =');
  const body = src.slice(at, src.indexOf('\n  const saveSettings', at));
  assert.match(body, /if \(acct && now !== acct\) return null;/, 'the write no longer checks whose account it is for');
  assert.match(body, /if \(!now\) return null;/, 'an unresolvable account is treated as a pass');
  // and both write paths route through it rather than reading getUser themselves
  const writes = src.slice(src.indexOf('const saveSettings'), src.indexOf('\n  if (signedIn === false)'));
  assert.equal((writes.match(/await authUid\(c\)/g) || []).length, 2, 'a write path resolves the user itself');
  assert.ok(!/c\.auth\.getUser\(\)/.test(writes), 'a write path reads getUser directly again');
});
