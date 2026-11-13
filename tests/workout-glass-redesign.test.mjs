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
//     session's name and Add move, a live heart rate). Every control is a 44px target.
//   · THE HOW-TO CLIPS (owner, 2026-11-13: "show the videos on the workout exercise modules in all 3
//     views"): every exercise module draws its clip above its sets, the coach's own over the stock one,
//     and the frame plays a file in place, loads an embed only when tapped, and opens anything else
//     outside.
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
  assert.deepEqual(importsOf(sessionSrc), ['react', 'react-dom', './bsCleanType.jsx', './BSMemberBento.jsx', './BSProInstrument.jsx', '../services/videoComponents.mjs', '../services/exerciseDemo.mjs']);
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
  // BSSession returns the view with the finish pop-up beside it (null until the workout ends).
  const named = (name) => p.nodes().find((n) => typeof n.type === 'function' && n.type.name === name);
  const root = () => named('BSWorkoutSession');
  const v = () => {
    assert.ok(root(), `BSSession drew ${String(p.nodes()[0] && (p.nodes()[0].type.name || p.nodes()[0].type))}, not the view`);
    return drive(root().type, root().props);
  };
  // Press a control in the drawn view, then let the player re-render.
  const press = (pick) => { const n = pick(v().nodes()); assert.ok(n, 'no such control'); n.props.onClick({ preventDefault() {}, stopPropagation() {} }); p.render(); };
  const byText = (label) => (nodes) => buttons(nodes).find((b) => textOf(b).trim() === label);
  const type = (label, value) => { const el = labelled(v().nodes(), label); assert.ok(el, `no field ${label}`); el.props.onChange({ target: { value } }); p.render(); };
  return { p, root, named, v, press, byText, type, left };
}

// Focus is the owner's C with every set on the card (2026-11-04: "Do C but have all required sets appear at same
// time so client can see what weight may change or reps, and then user get customize and edit results/outcome
// appropriately", "if a specfic exercies has multiple sets").
test('Focus: the glass top, the view and Change view, the lit readouts, then the raised card with every set', () => {
  const s = session('focus');
  const n = s.v().nodes();
  assert.match(s.v().text, /^Pause & exitElapsed0:\d\dFocusLive sessionChange viewExercise1\/3Sets0\/7Done0%/, 'the glass top, the view row, the readouts');
  assert.equal(n.filter((x) => x.props && x.props['data-ws-seg'] !== undefined).length, 0, 'the readouts stand in for the strip');
  assert.deepEqual(ofData(n, 'data-focus-readout').map((r) => r.props['data-focus-readout']), ['exercise', 'sets', 'done']);
  const card = ofData(n, 'data-ws-card')[0];
  assert.match(card.props.style.boxShadow, /inset/, 'the card is raised');
  assert.match(textOf(card), /^Back squat3 × 5 · 3 min rest · Target RPE 8Brace, then sit\.Set 01 · UpSetLoadRepsRPEDone01/);
  // Every set at once, each a row of its own load, reps and RPE, the one up lit.
  const rows = ofData(n, 'data-ws-set');
  assert.deepEqual(rows.map((r) => r.props['data-ws-set']), ['now', '', '']);
  assert.deepEqual(ofData(n, 'data-focus-field').map((f) => f.props['data-focus-field']), ['load', 'reps', 'rpe', 'load', 'reps', 'rpe', 'load', 'reps', 'rpe']);
  assert.equal(labelled(n, 'Set 1 Load').props.value, '225 lb');
  // A set to come shows what it asks for, the coach's target, until the member writes what they did.
  const later = labelled(n, 'Set 3 Load');
  assert.ok(later.props.value === '225 lb' || later.props.placeholder === '225 lb', 'set 3 does not show its target');
  assert.ok(labelled(n, 'Mark set 3 done'), 'each set has its own ✓');
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
  assert.equal(textOf(ofData(s.v().nodes(), 'data-focus-readout')[1]), 'Sets1/7');
  assert.equal(textOf(buttons(flatten(ofData(s.v().nodes(), 'data-ws-action')[0].props.children))[0]), 'Skip rest →', 'the one action skips the rest');
  s.press(s.byText('+30 sec'));
  rest = ofData(s.v().nodes(), 'data-ws-rest')[0];
  assert.match(textOf(rest), /\/ 3:30/);
  s.press((n) => buttons(flatten(ofData(n, 'data-ws-rest')[0].props.children)).find((b) => /^Skip rest/.test(textOf(b))));
  assert.equal(ofData(s.v().nodes(), 'data-ws-rest').length, 0, 'skipped');
  // The logged set reads ✓ in the set's row and stays editable, and the card has moved on to set 2.
  assert.match(textOf(ofData(s.v().nodes(), 'data-ws-card')[0]), /Set 02 · Up/);
  assert.deepEqual(ofData(s.v().nodes(), 'data-ws-set').map((r) => r.props['data-ws-set']), ['done', 'now', '']);
  assert.ok(labelled(s.v().nodes(), 'Set 1 done'), 'the logged set reads done');
  s.type('Set 1 Reps', '4');
  assert.equal(labelled(s.v().nodes(), 'Set 1 Reps').props.value, '4', 'a logged set\'s figure is corrected in place');
});

test('Focus: a slot the member clears reads "—", not the coach\'s target, so what shows is what saves (Codex P2 on #2610)', () => {
  const s = session('focus');
  s.type('Set 1 Load', '');
  const cleared = labelled(s.v().nodes(), 'Set 1 Load');
  assert.equal(cleared.props.value, '');
  assert.equal(cleared.props.placeholder, '—', 'a cleared slot shows the target again');
});

test('Focus: a set further down the card is logged from its own ✓, with what was typed into it', () => {
  const s = session('focus');
  s.type('Set 2 Load', '245 lb');
  s.press((n) => labelled(n, 'Mark set 2 done'));
  assert.deepEqual(ofData(s.v().nodes(), 'data-ws-set').map((r) => r.props['data-ws-set']).filter((x) => x === 'done').length, 1);
  assert.equal(labelled(s.v().nodes(), 'Set 2 Load').props.value, '245 lb');
});

test('Focus: Next and Previous move through the exercises, and the queue jumps', () => {
  const s = session('focus');
  s.press(s.byText('Next: Barbell row →'));
  assert.match(textOf(ofData(s.v().nodes(), 'data-ws-card')[0]), /^Barbell row/);
  assert.equal(textOf(ofData(s.v().nodes(), 'data-focus-readout')[0]), 'Exercise2/3');
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
  // Every set is on the card, so Exercise details keeps its tools and not the set log it would repeat.
  assert.equal(flatten(det().props.children).filter((x) => x.props && x.props['data-ws-set'] !== undefined).length, 0, 'the details repeat the set log');
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
  // And says so in words, not by its lift alone (session:player.now, which the old log drew there too).
  assert.deepEqual(sections.map((x) => ofData(flatten(x.props.children), 'data-ws-now').map(textOf)), [['NOW'], [], []]);
  assert.equal(textOf(flatten(sections[1].props.children).find((x) => x.type === 'button')), 'Barbell row2 × 8 · 155 lb');
  // Done on the row's own set logs it, and the row reads ✓.
  s.press((nodes) => nodes.filter((x) => x.type === 'section')[1] && flatten(nodes.filter((x) => x.type === 'section')[1].props.children).find((x) => x.props && x.props['aria-label'] === 'Mark set 1 done'));
  const row = flatten(s.v().nodes().filter((x) => x.type === 'section')[1].props.children);
  assert.ok(row.some((x) => x.props && x.props['aria-label'] === 'Set 1 done'), 'logged');
  assert.equal(textOf(ofData(s.v().nodes(), 'data-focus-readout')[1]), 'Sets1/7');
  // In C (owner, 2026-11-04): each set a row of lit slots with its own ✓, as on Focus.
  assert.ok(ofData(s.v().nodes(), 'data-focus-field').length >= 21, 'every set of every exercise has its three slots');
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
  assert.equal(s.root(), undefined, 'the chooser replaces the view');
  assert.match(textOf({ props: { children: s.p.nodes() } }), /Choose your workout view/);
  // End early opens the finish pop-up OVER the view, which stays drawn under it.
  const e = session('focus');
  assert.equal(e.named('BSSessionFinish'), undefined, 'no pop-up while the workout runs');
  e.press(e.byText('End workout early'));
  assert.ok(e.root(), 'the view is still drawn');
  const finish = e.named('BSSessionFinish');
  assert.ok(finish, 'the finish pop-up');
  assert.match(drive(finish.type, finish.props).text, /How hard was that\?/);
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
  assert.equal(textOf(ofData(s.v().nodes(), 'data-focus-readout')[0]), 'Exercise2/2', 'the move added is the one in hand');
});

// The catalog's stock clips, as window.ShapeExerciseDemos hands them over (the read never settles here,
// so what the view draws is what `cached` already held).
const STOCK = [
  { name: 'Back squat', aliases: ['Squat'], demo_url: 'https://cdn.example.com/stock-squat.mp4' },
  { name: 'Barbell row', aliases: ['Bent-over row', 'BB row'], demo_url: 'https://cdn.example.com/stock-row.mp4' },
];
const COACH_CLIP = 'https://example.com/coach-squat.mp4';
const frames = (nodes) => nodes.filter((x) => typeof x.type === 'function' && x.type.name === 'BSExerciseDemoFrame');
const withStock = (fn) => {
  globalThis.ShapeExerciseDemos = { cached: () => STOCK, load: () => new Promise(() => {}) };
  try { return fn(); } finally { delete globalThis.ShapeExerciseDemos; }
};
// The clip of one module, and whether it sits above that module's sets.
const clipAbove = (module, setsAttr) => {
  const inside = flatten(module.props.children);
  const f = frames(inside);
  assert.ok(f.length <= 1, 'one clip per module');
  if (!f.length) return null;
  const sets = inside.findIndex((x) => x.props && x.props[setsAttr] !== undefined);
  assert.ok(sets > inside.indexOf(f[0]), `${f[0].props.name}: the clip is not above its sets`);
  return f[0].props.url;
};

test('every exercise module carries its how-to clip above its sets, in all three views; the coach\'s clip wins', () => withStock(() => {
  const moves = [{ ...MOVES()[0], video: COACH_CLIP }, MOVES()[1], MOVES()[2]];
  // Focus: the card's clip is the coach's, not the stock squat; the old pop-up sheet is gone.
  let n = session('focus', { moves }).v().nodes();
  assert.equal(clipAbove(ofData(n, 'data-ws-card')[0], 'data-focus-sets'), COACH_CLIP);
  assert.ok(!n.some((x) => x.props && x.props.role === 'dialog'), 'no clip sheet: the clip is in the module');
  // Workout log: every exercise's card has its own; Barbell row's is the stock one, Plank has none.
  n = session('log', { moves }).v().nodes();
  assert.deepEqual(ofData(n, 'data-ws-move').map((m) => clipAbove(m, 'data-focus-sets')), [COACH_CLIP, 'https://cdn.example.com/stock-row.mp4', null]);
  // Guided coach: the card's clip, above the step in hand and the set.
  const g = session('guided', { moves });
  const card = ofData(g.v().nodes(), 'data-ws-card')[0];
  assert.equal(clipAbove(card, 'data-ws-step'), COACH_CLIP);
  // Next exercise: the card follows the move in hand, to its stock clip.
  g.press((nodes) => buttons(nodes).find((b) => b.props['data-focus-step'] === 'next'));
  assert.equal(frames(flatten(ofData(g.v().nodes(), 'data-ws-card')[0].props.children))[0].props.url, 'https://cdn.example.com/stock-row.mp4');
}));

test('no clip and no stock: no frame; an unsafe clip never reaches a frame', () => {
  const n = session('log', { moves: [{ ...MOVES()[0], video: 'javascript:alert(1)' }, MOVES()[1]] }).v().nodes();
  assert.deepEqual(frames(n), [], 'no stock read yet, no coach clip that plays');
});

test('the frame: a file plays in place, an embed loads only when tapped, anything else opens outside', () => withStock(() => {
  const [proto] = frames(session('focus').v().nodes());
  assert.ok(proto, 'the stock squat\'s frame');
  const frame = (url) => drive(proto.type, { ...proto.props, url });
  // A file: the device's own controls, inline, its first frame as the still.
  let f = frame(COACH_CLIP);
  const video = f.nodes().find((x) => x.type === 'video');
  assert.equal(video.props.src, COACH_CLIP + '#t=0.1');
  assert.ok(video.props.controls && video.props.playsInline);
  assert.equal(video.props['aria-label'], 'Back squat demonstration');
  assert.equal(ofData(f.nodes(), 'data-ws-demo')[0].props['data-ws-demo'], 'file');
  // YouTube: a ▶ frame, and no player until it is tapped; then the privacy-mode embed.
  f = frame('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.ok(!f.nodes().some((x) => x.type === 'iframe'), 'no third-party player before a tap');
  const tile = f.nodes().find((x) => x.type === 'button');
  assert.equal(tile.props['aria-label'], 'How-to · Back squat · YouTube', 'its name carries the word it shows');
  assert.ok(minH(tile) >= 44);
  f.click('▶');
  const iframe = f.nodes().find((x) => x.type === 'iframe');
  assert.match(iframe.props.src, /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);
  assert.equal(iframe.props.title, 'Back squat demonstration — YouTube');
  // A page that is not a video: never framed, opened outside.
  f = frame('https://example.com/how-to-squat');
  assert.ok(!f.nodes().some((x) => x.type === 'iframe' || x.type === 'video'));
  const away = f.nodes().find((x) => x.type === 'button');
  assert.equal(textOf(away), '▶Open externally ↗');
  assert.equal(away.props['aria-label'], 'How-to · Back squat · Open externally ↗');
  // A file this device cannot play: the same way out, never a blank frame.
  f = frame(COACH_CLIP);
  f.nodes().find((x) => x.type === 'video').props.onError();
  f.render();
  assert.ok(!f.nodes().some((x) => x.type === 'video'));
  assert.equal(textOf(f.nodes().find((x) => x.type === 'button')), '▶Open externally ↗');
  // Nothing resolve refuses is drawn at all.
  assert.deepEqual(frame('data:video/mp4;base64,AAAA').nodes(), []);
}));

test('a live heart rate rides beside the clock', () => {
  const s = session('focus');
  // A fresh reading: the same view, with BSSession's heart-rate figure in it.
  const props = s.root().props;
  const live = drive(s.root().type, { session: { ...props.session, hrNow: 128 } });
  assert.match(textOf(ofData(live.nodes(), 'data-ws-hr-live')[0]), /128 bpm/);
  assert.match(textOf(ofData(live.nodes(), 'data-ws-hr')[0]), /128 bpm · Live/);
});
