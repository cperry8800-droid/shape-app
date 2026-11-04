// The member's workout flow in the glass look (owner, 2026-11-04: "new design for this" of the workout
// page, "new design for not this specific page, but the focus page, workout log, and guided coach",
// then, of three designs offered for the four, "B for all of them", "the training ones i mean").
// Carved out of iosAppBroadsheetClient.jsx: the detail page whole (BSWorkoutDetail.jsx), the live
// session's drawing (BSWorkoutSession.jsx) with BSSession keeping every value and handler.
//
// What it pins:
//   · THE SEAM. Each module imports only React, react-dom and its look siblings (never the client),
//     reads no window global while it evaluates (React #130 otherwise), names its globals on its
//     first line and carries its own translator; the client renders the detail page at its two doors
//     and BSSession returns the view, and none of the old player's markup is left in the client.
//   · THE DETAIL PAGE, driven: the masthead and ← Back, the raised day with its four figures, the
//     coach's note on glass with the trainer's monogram, the plan as one glass list, Save / Move
//     session / Remind me as glass keys, the soundtrack, Begin session held above the tab bar.
//   · THE SESSION, driven through the real BSSession: Focus's raised card, the log's glass cards with
//     the current one raised and no queue, Guided's two steps, the rest card, and every control
//     (typing a figure, Log set, +30 sec, Skip rest, Previous / Next, the queue, Exercise details,
//     Quick Log / Timed sets, Add / Remove set, Done in the log, Change view, End workout early, an open
//     session's name and Add move, the form clip, a live heart rate). Every control is a 44px target.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { IntlMessageFormat } from 'intl-messageformat';
import { stripComments } from './helpers/strip-comments.mjs';
import { loadBroadsheet, loadCarved, drive, textOf, flatten } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';

const DETAIL = 'mobile-app/src/broadsheet/BSWorkoutDetail.jsx';
const SESSION = 'mobile-app/src/broadsheet/BSWorkoutSession.jsx';
const CLIENT = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const detailSrc = stripComments(fs.readFileSync(DETAIL, 'utf8'));
const sessionSrc = stripComments(fs.readFileSync(SESSION, 'utf8'));
const client = stripComments(fs.readFileSync(CLIENT, 'utf8'));

// The app's translator over the shipped English catalogs: a key missing from them fails here.
const CAT = new Map();
const catalog = (ns) => {
  if (!CAT.has(ns)) CAT.set(ns, JSON.parse(fs.readFileSync(`mobile-app/src/i18n/catalogs/en/${ns}.json`, 'utf8')));
  return CAT.get(ns);
};
globalThis.ShapeI18n = {
  t: (key, opts = {}) => {
    const [ns, k] = String(key).split(':');
    const raw = catalog(ns)[k];
    assert.ok(raw != null, `${key} is not in the English ${ns} catalog`);
    return new IntlMessageFormat(raw, 'en').format(opts);
  },
};
globalThis.__VITE_ENV__ = { BASE_URL: '/m/', MODE: 'test' };

const minH = (n) => Number((n.props.style && (n.props.style.minHeight || n.props.style.height)) || 0);
const ofData = (nodes, attr, value) => nodes.filter((n) => n.props && n.props[attr] !== undefined && (value === undefined || n.props[attr] === value));
const buttons = (nodes) => nodes.filter((n) => n.type === 'button');
const labelled = (nodes, label) => nodes.find((n) => n.props && n.props['aria-label'] === label);

// ── The seam ─────────────────────────────────────────────────────────────────────────────────────

test('each module exports what it draws, imports no host module, and carries its own translator', () => {
  assert.deepEqual([...detailSrc.matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1]), ['BSWorkoutDetail']);
  assert.deepEqual([...sessionSrc.matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1]), ['BSWorkoutSession']);
  const importsOf = (src) => [...src.matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]);
  assert.deepEqual(importsOf(detailSrc), ['react', 'react-dom', '../services/videoComponents.mjs', './bsCleanType.jsx', './BSMemberBento.jsx', './BSProInstrument.jsx']);
  assert.deepEqual(importsOf(sessionSrc), ['react', 'react-dom', './bsCleanType.jsx', './BSMemberBento.jsx', './BSProInstrument.jsx']);
  for (const src of [detailSrc, sessionSrc]) {
    assert.match(src, /^function useShapeTr\(\) \{/m);
    assert.equal((src.match(/window\.ShapeI18n/g) || []).length, 1, 'window.ShapeI18n is read only inside useShapeTr()');
  }
  // Each component names its window globals on its first line, the theme hook among them.
  assert.match(detailSrc, /^export function BSWorkoutDetail\(\{[^\n]*\}\) \{\n  const \{ useBS, BSPage, BSMastRow, BSBackRow, BSMeCorner, BSFooter, BSPlaylistCard, useBSLibrary, bsLibToggle, bsDateLocale \} = window;/m);
  assert.match(sessionSrc, /^export function BSWorkoutSession\(\{ session: S \}\) \{\n  const \{ useBS, BSPage, bsSdReduced \} = window;/m);
});

// Pinned by EVALUATING each module under a window that records every read (the goals module's lesson:
// a top-level read spelled any other way passes a regex).
test('evaluating either module by itself reads NO window global', async () => {
  for (const file of [DETAIL, SESSION]) {
    const reads = [];
    const recorder = new Proxy({}, {
      get: (_t, prop) => { reads.push(String(prop)); return undefined; },
      has: (_t, prop) => { reads.push(String(prop)); return false; },
    });
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { value: recorder, configurable: true, writable: true });
    try {
      await loadRealModule(path.resolve(file), { registry: new Map([['react-dom', { createPortal: (n) => n }]]) });
    } finally {
      if (saved) Object.defineProperty(globalThis, 'window', saved); else delete globalThis.window;
    }
    assert.deepEqual(reads, [], `${file} read window.${reads.join(', window.')} while it was being evaluated`);
  }
});

test('the client opens the detail page at both doors, BSSession returns the view, and the old player is gone', () => {
  assert.match(client, /^import \{ BSWorkoutDetail \} from '\.\/BSWorkoutDetail\.jsx';$/m);
  assert.match(client, /^import \{ BSWorkoutSession \} from '\.\/BSWorkoutSession\.jsx';$/m);
  assert.equal((client.match(/<BSWorkoutDetail\b/g) || []).length, 2, 'Home (Your move and Team) and the Library');
  assert.doesNotMatch(client, /BSHomeWorkoutPreview/, 'the old detail page is gone, not kept behind a flag');
  assert.doesNotMatch(client, /__workoutLook/);
  // The view takes BSSession's own state and handlers.
  const player = client.slice(client.indexOf('function BSSession('), client.indexOf('const BS_GROCERY_DEFAULT'));
  assert.equal((player.match(/<BSWorkoutSession session=\{\{/g) || []).length, 1);
  assert.match(player, /coachCue: <BSWorkoutCoachCue identity=\{identity\} \/>/);
  assert.match(player, /primaryLabel, primaryAction: activeIdx != null \? primarySetAction : nextOrFinish,/);
  // What the old player drew is the view's now: none of its words are read in the client any more.
  for (const key of ['bandCounts', 'queue', 'upNext', 'view.details', 'view.hrHelp', 'plus30', 'addSetAria', 'colDone', 'restAfter', 'nextNamed', 'endEarly'])
    assert.doesNotMatch(client, new RegExp(`tr\\('session:player\\.${key.replace('.', '\\.')}'`), `the client still draws session:player.${key}`);
  // The detail page's pieces it reads from the client are published, read at call time.
  assert.match(client, /\n  useBSLibrary, bsLibToggle, BSPlaylistCard,\n/);
});

// ── The detail page, driven ──────────────────────────────────────────────────────────────────────

await loadBroadsheet(['BSSession']);
const { BSWorkoutDetail } = await loadCarved('BSWorkoutDetail.jsx');
globalThis.BSMastRow = function BSMastRow() { return null; };
globalThis.BSPlaylistCard = function BSPlaylistCard() { return null; };
let LIB = [];
const toggled = [];
globalThis.useBSLibrary = () => LIB;
globalThis.bsLibToggle = (item) => { toggled.push(item); LIB = LIB.some((x) => x.id === item.id) ? [] : [item]; };

const detailPage = (props = {}) => {
  const calls = { back: 0, move: 0, start: 0, message: 0 };
  const d = drive(BSWorkoutDetail, { onBack: () => { calls.back += 1; }, onMove: () => { calls.move += 1; }, onStart: () => { calls.start += 1; }, onMessage: () => { calls.message += 1; }, ...props });
  return { d, calls };
};

test('the detail page: ← Back under the masthead, the raised day with its four figures, the note, the plan', () => {
  LIB = [];
  const { d, calls } = detailPage();
  const rows = d.nodes().filter((n) => typeof n.type === 'function' && n.type.name === 'BSBackRow');
  assert.equal(rows.length, 1, 'one ← Back, through BSBackRow');
  assert.match(textOf({ props: { children: rows[0].props.trailing } }), /^PreviewMessage$/);
  d.back();
  assert.equal(calls.back, 1);
  // The day on a raised card: the date, the title with its teal full stop, four tiles.
  const hero = ofData(d.nodes(), 'data-wd-hero')[0];
  assert.match(textOf(hero), /^Today · \w{3} \w{3} \d{1,2} · 9:00 AMUpper Pull — Peak\./);
  assert.match(hero.props.style.boxShadow, /inset/, 'raised');
  assert.deepEqual(ofData(d.nodes(), 'data-wd-stat').map((n) => textOf(n)), ['52min', '6moves', '8RPE', '~420kcal']);
  // The coach's note on glass, the trainer's monogram in rust.
  const note = ofData(d.nodes(), 'data-wd-note')[0];
  assert.match(textOf(note), /^JCJordan Chen · Trainer · notes“Peak week — tempo matters more than load\./);
  // The plan: its count, six numbered moves, each load a pill (the progression's + in teal).
  assert.match(d.text, /Plan6 moves/);
  const moves = ofData(d.nodes(), 'data-wd-move');
  assert.equal(moves.length, 6);
  assert.equal(textOf(moves[0]), '01Pull-up4 × 6-8 · 3 min rest“Dead hang. Chest to bar.”42 lb +');
  assert.equal(textOf(moves[4]), '05Incline curl3 × 12 · 60s rest“Full stretch. 3s eccentric.”27.5 lb');
  // The soundtrack, then the footer.
  assert.match(d.text, /SoundtrackPre-workout/);
  assert.equal(d.nodes().filter((n) => typeof n.type === 'function' && n.type.name === 'BSPlaylistCard').length, 1);
});

test('the detail page\'s keys: Save toggles the library, Remind me sets, Move session and Message hand off', () => {
  LIB = []; toggled.length = 0;
  const { d, calls } = detailPage();
  const keys = () => buttons(flatten(ofData(d.nodes(), 'data-wd-actions')[0].props.children));
  assert.deepEqual(keys().map((b) => textOf(b)), ['♡ Save', 'Move session', 'Remind me']);
  d.click('♡ Save');
  assert.equal(toggled.length, 1);
  assert.equal(toggled[0].id, 'workout:upper-pull-peak');
  assert.deepEqual(keys().map((b) => textOf(b)), ['✓ Saved', 'Move session', 'Remind me'], 'a saved workout reads Saved');
  d.click('Remind me');
  assert.equal(textOf(keys()[2]), '✓ Reminder set');
  d.click('Move session');
  assert.equal(calls.move, 1);
  d.click('Message');
  assert.equal(calls.message, 1);
  for (const b of keys()) assert.ok(minH(b) >= 44, `${textOf(b)} is under 44px`);
});

test('Begin session is held above the tab bar and starts the workout', () => {
  const { d, calls } = detailPage();
  const bar = ofData(d.nodes(), 'data-wd-start')[0];
  assert.equal(bar.props.style.position, 'absolute');
  const begin = buttons(flatten(bar.props.children))[0];
  assert.equal(textOf(begin), 'Begin session →');
  assert.ok(minH(begin) >= 44);
  begin.props.onClick();
  assert.equal(calls.start, 1);
});

test('a live workout reads its own day: its title, figures, note and moves', () => {
  const workout = { title: 'Lower — Build', time: '17:45', detail: { meta: '40 min · 3 moves · RPE 7', note: 'Own the bottom.', moves: [{ name: 'Back squat', scheme: '4 × 5 · 3 min rest', load: '100 kg', cue: '' }, { name: 'RDL', scheme: '3 × 8', load: '' }, { name: 'Plank', scheme: '3 × 40s' }] } };
  const { d } = detailPage({ workout });
  assert.match(textOf(ofData(d.nodes(), 'data-wd-hero')[0]), /5:45 PMLower — Build\./);
  assert.deepEqual(ofData(d.nodes(), 'data-wd-stat').map((n) => textOf(n)), ['40min', '3moves', '7RPE']);
  assert.match(textOf(ofData(d.nodes(), 'data-wd-note')[0]), /“Own the bottom\.”$/);
  const moves = ofData(d.nodes(), 'data-wd-move');
  assert.deepEqual(moves.map((n) => textOf(n)), ['01Back squat4 × 5 · 3 min rest220 lb', '02RDL3 × 8', '03Plank3 × 40s'], 'a load in the reader\'s unit; no load, no pill');
});

// ── The session, driven through the real BSSession ───────────────────────────────────────────────

const { BSSession } = await loadBroadsheet(['BSSession']);
const ROWS = new Map();
globalThis.localStorage = { getItem: (k) => ROWS.get(k) ?? null, setItem: (k, v) => ROWS.set(k, String(v)), removeItem: (k) => ROWS.delete(k) };
globalThis.ShapeAuth = { getCachedState: () => ({ user: { id: 'member-b' } }) };
globalThis.ShapeLiveProgress = { clear() {}, push() {} };
globalThis.bsFeedIcon = undefined;

const MOVES = () => [
  { m: 'Back squat', s: '3 × 5 · 3 min rest', l: '225 lb', reps: '5', sets: 3, rpe: '8', restSeconds: 180, cue: 'Brace, then sit.' },
  { m: 'Barbell row', s: '2 × 8', l: '155 lb', reps: '8', sets: 2, restSeconds: 90 },
  { m: 'Plank', s: '2 × 40 s', l: '', reps: '40 s', sets: 2 },
];
// A session in a view: the client's player, and the view it returns drawn.
function session(view, props = {}) {
  ROWS.clear();
  ROWS.set('shapeClientWorkoutView:member-b', view);
  const left = [];
  const p = drive(BSSession, { moves: MOVES(), onBack: () => left.push(true), ...props });
  const root = () => p.nodes()[0];
  const v = () => {
    assert.equal(root().type.name, 'BSWorkoutSession', `BSSession drew ${root().type.name || root().type}, not the view`);
    return drive(root().type, root().props);
  };
  // Press a control in the drawn view, then let the player re-render.
  const press = (pick) => { const n = pick(v().nodes()); assert.ok(n, 'no such control'); n.props.onClick({ preventDefault() {}, stopPropagation() {} }); p.render(); };
  const byText = (label) => (nodes) => buttons(nodes).find((b) => textOf(b).trim() === label);
  const type = (label, value) => { const el = labelled(v().nodes(), label); assert.ok(el, `no field ${label}`); el.props.onChange({ target: { value } }); p.render(); };
  return { p, root, v, press, byText, type, left };
}

test('Focus: the glass top, the view and Change view, the strip, then the raised card with the set\'s figures', () => {
  const s = session('focus');
  const n = s.v().nodes();
  assert.match(s.v().text, /^Pause & exitElapsed0:\d\dFocusLive sessionChange viewEx 1\/3 · Sets 0\/70% complete/, 'the glass top, the view row, the counts');
  assert.equal(n.filter((x) => x.props && x.props['data-ws-seg'] !== undefined).length, 3, 'one segment per exercise');
  const card = ofData(n, 'data-ws-card')[0];
  assert.match(card.props.style.boxShadow, /inset/, 'the card is raised');
  assert.equal(textOf(card), 'Back squat3 × 5 · 3 min rest · Target RPE 8Brace, then sit.Set 01 · UpLoadRepsRPE');
  const fields = ofData(n, 'data-ws-field');
  assert.deepEqual(fields.map((f) => f.props['data-ws-field']), ['load', 'reps', 'rpe']);
  assert.equal(labelled(n, 'Set 1 Load').props.value, '225 lb');
  // Exercise details folded, Previous / Next, the queue, the heart-rate line, the session's own ends.
  assert.equal(n.filter((x) => x.type === 'details')[0].props.open, false);
  assert.equal(buttons(flatten(ofData(n, 'data-ws-queue')[0].props.children)).length, 3);
  assert.match(textOf(ofData(n, 'data-ws-hr')[0]), /No heart-rate monitor connectedConnect HR monitor/);
  assert.ok(s.byText('End workout early')(n));
  assert.ok(s.byText('Discard workout')(n));
  assert.equal(textOf(buttons(flatten(ofData(n, 'data-ws-action')[0].props.children))[0]), 'Log set 1 · 5 reps');
  for (const b of buttons(n)) assert.ok(minH(b) >= 44, `${JSON.stringify(textOf(b))} is under 44px`);
});

test('Focus: a typed figure is the set\'s, Log set starts the rest, +30 sec and Skip rest drive it', () => {
  const s = session('focus');
  s.type('Set 1 Load', '235 lb');
  assert.equal(labelled(s.v().nodes(), 'Set 1 Load').props.value, '235 lb');
  s.press(s.byText('Log set 1 · 5 reps'));
  let rest = ofData(s.v().nodes(), 'data-ws-rest')[0];
  assert.ok(rest, 'the rest card');
  assert.match(textOf(rest), /^Rest · set 1 done3:00 \/ 3:00/);
  assert.match(s.v().text, /Ex \d\/3 · Sets 1\/7/);
  assert.equal(textOf(buttons(flatten(ofData(s.v().nodes(), 'data-ws-action')[0].props.children))[0]), 'Skip rest →', 'the one action skips the rest');
  s.press(s.byText('+30 sec'));
  rest = ofData(s.v().nodes(), 'data-ws-rest')[0];
  assert.match(textOf(rest), /\/ 3:30/);
  s.press((n) => buttons(flatten(ofData(n, 'data-ws-rest')[0].props.children)).find((b) => /^Skip rest/.test(textOf(b))));
  assert.equal(ofData(s.v().nodes(), 'data-ws-rest').length, 0, 'skipped');
  // The logged set reads ✓ in the set's row, and the card has moved on to set 2.
  assert.match(textOf(ofData(s.v().nodes(), 'data-ws-card')[0]), /Set 02 · Up/);
});

test('Focus: Next and Previous move through the exercises, and the queue jumps', () => {
  const s = session('focus');
  s.press(s.byText('Next: Barbell row →'));
  assert.match(textOf(ofData(s.v().nodes(), 'data-ws-card')[0]), /^Barbell row/);
  assert.match(s.v().text, /Ex 2\/3 · Sets 0\/7/);
  s.press(s.byText('← Previous'));
  assert.match(textOf(ofData(s.v().nodes(), 'data-ws-card')[0]), /^Back squat/);
  s.press((n) => buttons(flatten(ofData(n, 'data-ws-queue')[0].props.children))[2]);
  assert.match(textOf(ofData(s.v().nodes(), 'data-ws-card')[0]), /^Plank2 × 40 s/);
  assert.equal(textOf(buttons(flatten(ofData(s.v().nodes(), 'data-ws-action')[0].props.children))[0]), 'Log set 1 · 40 s', 'a hold is named as written');
});

test('Exercise details: Quick Log | Timed sets, the target, Add and Remove set', () => {
  const s = session('focus');
  const det = () => s.v().nodes().filter((x) => x.type === 'details')[0];
  assert.match(textOf(det()), /^Exercise details & set log/);
  assert.match(textOf(det()), /Target · 225 lb/);
  s.press((n) => buttons(n).find((b) => b.props['aria-pressed'] === false && textOf(b) === 'Timed sets'));
  assert.equal(buttons(s.v().nodes()).find((b) => textOf(b) === 'Timed sets').props['aria-pressed'], true);
  assert.equal(textOf(buttons(flatten(ofData(s.v().nodes(), 'data-ws-action')[0].props.children))[0]), 'Start set 1');
  s.press((n) => buttons(n).find((b) => textOf(b) === 'Quick Log'));
  const sets = () => s.v().nodes().filter((x) => x.props && x.props['data-ws-set'] !== undefined).length;
  assert.equal(sets(), 3);
  s.press((n) => labelled(n, 'Add a set to this exercise'));
  assert.equal(sets(), 4);
  s.press((n) => labelled(n, 'Remove a set from this exercise'));
  assert.equal(sets(), 3);
});

test('Workout log: no card and no queue; a glass card per exercise, the current one raised; Done logs that row', () => {
  const s = session('log');
  const n = s.v().nodes();
  assert.equal(ofData(n, 'data-ws-card').length, 0, 'the log has no card');
  assert.equal(ofData(n, 'data-ws-queue').length, 0, 'and no queue: the log is the list');
  assert.equal(n.filter((x) => x.type === 'details')[0].props.open, true);
  const sections = n.filter((x) => x.type === 'section');
  assert.equal(sections.length, 3);
  assert.deepEqual(sections.map((x) => x.props['data-ws-move']), ['now', '', '']);
  assert.match(sections[0].props.style.boxShadow, /inset 0 1px 0/, 'the current exercise is raised');
  assert.equal(textOf(flatten(sections[1].props.children).find((x) => x.type === 'button')), 'Barbell row2 × 8 · 155 lb');
  // Done on the row's own set logs it, and the row reads ✓.
  s.press((nodes) => nodes.filter((x) => x.type === 'section')[1] && flatten(nodes.filter((x) => x.type === 'section')[1].props.children).find((x) => x.props && x.props['aria-label'] === 'Mark set 1 done'));
  const row = flatten(s.v().nodes().filter((x) => x.type === 'section')[1].props.children);
  assert.ok(row.some((x) => x.props && x.props['aria-label'] === 'Set 1 done'), 'logged');
  assert.match(s.v().text, /Ex \d\/3 · Sets 1\/7/);
  for (const b of buttons(s.v().nodes())) assert.ok(minH(b) >= 44, `${JSON.stringify(textOf(b))} is under 44px`);
});

test('Guided coach: 01 Prepare raised, 02 folded; Ready for this set raises 02 and folds 01 with a ✓', () => {
  const s = session('guided');
  const steps = () => s.v().nodes().filter((x) => x.props && x.props['data-ws-step'] !== undefined);
  assert.deepEqual(steps().map((x) => [x.props['data-ws-step'], x.props['data-ws-step-on'] !== undefined]), [['prepare', true], ['perform', false]]);
  assert.equal(textOf(steps()[0]), '01 · PrepareBrace, then sit.5 · 225 lb · Target RPE 8 · Rest 3:00', 'the cue, then the set\'s target');
  assert.equal(textOf(steps()[1]), '02 · Perform & log');
  s.press(s.byText('Ready for this set'));
  assert.deepEqual(steps().map((x) => [x.props['data-ws-step'], x.props['data-ws-step-on'] !== undefined]), [['prepare', false], ['perform', true]]);
  assert.equal(textOf(steps()[0]), '01 · Prepare✓');
  assert.match(textOf(steps()[1]), /^02 · Perform & logComplete your set/);
  assert.equal(textOf(buttons(flatten(ofData(s.v().nodes(), 'data-ws-action')[0].props.children))[0]), 'Log set 1 · 5 reps');
});

test('Change view opens the chooser, and End workout early the finish step', () => {
  const s = session('focus');
  s.press(s.byText('Change view'));
  assert.notEqual(s.root().type.name, 'BSWorkoutSession');
  assert.match(textOf({ props: { children: s.p.nodes() } }), /Choose your workout view/);
  const e = session('focus');
  e.press(e.byText('End workout early'));
  assert.match(textOf({ props: { children: e.p.nodes() } }), /How hard was that\?/);
});

test('an open session names its move, offers the swap names, and adds a move', () => {
  const s = session('focus', { moves: [] });
  const n = s.v().nodes();
  const name = n.find((x) => x.type === 'input' && x.props.list === 'bs-session-move-names');
  assert.ok(name, 'the name field');
  assert.ok(n.some((x) => x.type === 'datalist' && x.props.id === 'bs-session-move-names'));
  name.props.onChange({ target: { value: 'Goblet squat' } });
  s.p.render();
  assert.equal(s.v().nodes().find((x) => x.type === 'input' && x.props.list === 'bs-session-move-names').props.value, 'Goblet squat');
  s.press((nodes) => labelled(nodes, 'Add another move'));
  assert.equal(s.v().nodes().filter((x) => x.props && x.props['data-ws-seg'] !== undefined).length, 2);
});

test('a coach\'s form clip opens from the card; a live heart rate rides beside the clock', () => {
  const s = session('focus', { moves: [{ ...MOVES()[0], video: 'https://example.com/squat.mp4' }] });
  s.press((n) => buttons(n).find((b) => /^▶ /.test(textOf(b))));
  assert.ok(s.v().nodes().some((x) => x.props && x.props.role === 'dialog'), 'the clip sheet');
  // A fresh reading: the same view, with BSSession's heart-rate figure in it.
  const props = s.root().props;
  const live = drive(s.root().type, { session: { ...props.session, hrNow: 128 } });
  assert.match(textOf(ofData(live.nodes(), 'data-ws-hr-live')[0]), /128 bpm/);
  assert.match(textOf(ofData(live.nodes(), 'data-ws-hr')[0]), /128 bpm · Live/);
});
