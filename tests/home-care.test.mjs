// tests/home-care.test.mjs
//
// HOME, BY WHO THE MEMBER HAS HIRED (owner, 2026-11-17: "ok make new home screens live", "build those.
// Please make it look like the preview", "on the app", then "just make sure look and design is same as
// preview"). Home reads one of three ways, no coach, one coach, or a team (a trainer and a nutritionist):
//   · the goal plate's title, the trails into the start of the climb and the coaches at its foot;
//   · with exactly one coach, the open seat and the invitation under the goal ("i like this"), which names
//     no partner and promises no joint review (a coach cannot yet name one), and "Not now" for a fortnight;
//   · the line under This week that says whose bars are whose;
//   · Home's type (Saira and the app's mono) and its plate.
// The state is services/homeCare.mjs's, pure; the views are BSHomeCare.jsx's and BSHomeDeck.jsx's, drawn
// here from known coaches. The goal's figures and Today's plan are tests/home-deck-team.test.mjs's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { drive, textOf, flatten, SHIM, ROOT, THEME } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { stripComments } from './helpers/strip-comments.mjs';
import { IntlMessageFormat } from 'intl-messageformat';
import * as HC from '../mobile-app/src/services/homeCare.mjs';
import * as C from '../mobile-app/src/services/homeClimb.mjs';

// The app's translator with no catalog: each string is its English default, formatted as ICU.
globalThis.ShapeI18n = { t: (key, opts = {}) => new IntlMessageFormat(String(opts.defaultValue ?? key), 'en').format(opts) };

const REG = { registry: new Map([['react', { ...SHIM, useContext: (c) => c._currentValue }], ['react-dom', { createPortal: (n) => n }]]) };
const CARE = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSHomeCare.jsx'), REG);
const D = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSHomeDeck.jsx'), REG);

const JORDAN = { role: 'trainer', name: 'Jordan Chen', conversationId: 'c-j', providerId: 7, photo: 'https://cdn.example/jordan.jpg' };
const MAYA = { role: 'nutritionist', name: 'Dr. Maya Patel', conversationId: 'c-m', providerId: 3, photo: null };
const SAM = { role: 'trainer', name: 'Sam Strong', conversationId: 'c-s', providerId: 8, photo: null };
const fn = (name) => (n) => typeof n.type === 'function' && n.type.name === name;
const by = (d, k) => d.nodes().filter((n) => n.props && n.props[k] != null);
// A dark paper, as the owner compares the approved Home on.
const DARK = { ...Object.fromEntries(['MONO', 'DISPLAY', 'ACCENT'].map((k) => [k, THEME[k]])), isLight: false, INK: '#f5f0e6', PAPER: '#0f0e0c', inkRGB: '245,240,230' };
const withTheme = (t, run) => { const prev = globalThis.useBS; globalThis.useBS = () => t; try { return run(); } finally { globalThis.useBS = prev; } };

// ── Who the member has hired ─────────────────────────────────────────────────

test('a coach\'s first name skips a title: "Dr. Maya Patel" is Maya', () => {
  assert.equal(HC.bsCareFirstName('Jordan Chen'), 'Jordan');
  assert.equal(HC.bsCareFirstName('Dr. Maya Patel'), 'Maya');
  assert.equal(HC.bsCareFirstName('  dr Rae  Lin '), 'Rae');
  assert.equal(HC.bsCareFirstName('Prof. Ana'), 'Ana');
  assert.equal(HC.bsCareFirstName('Dra. Luz Marín'), 'Luz');
  assert.equal(HC.bsCareFirstName('Maya'), 'Maya');
  assert.equal(HC.bsCareFirstName('Dr.'), 'Dr.', 'a title alone is all there is to say');
  assert.equal(HC.bsCareFirstName(''), '');
  assert.equal(HC.bsCareFirstName(null), '');
  // Their initials, for a portrait with no photo, skip the title too.
  assert.equal(HC.bsCareInitials('Dr. Maya Patel'), 'MP');
  assert.equal(HC.bsCareInitials('jordan chen lee'), 'JC');
  assert.equal(HC.bsCareInitials('Maya'), 'M');
  assert.equal(HC.bsCareInitials('Dr.'), 'D');
  assert.equal(HC.bsCareInitials(''), '');
});

test('Home\'s three states: no coach, one coach, or a team (a trainer and a nutritionist)', () => {
  const none = HC.bsHomeCare([]);
  assert.deepEqual([none.kind, none.openRole, none.seat, none.invite, none.only], ['none', null, false, false, null]);
  assert.equal(HC.bsHomeCare(null).kind, 'none');
  assert.equal(HC.bsHomeCare(undefined).kind, 'none');
  // One coach: the other discipline is the open seat, and Home may invite.
  const trainerOnly = HC.bsHomeCare([JORDAN]);
  assert.deepEqual([trainerOnly.kind, trainerOnly.openRole, trainerOnly.seat, trainerOnly.invite], ['one', 'nutritionist', true, true]);
  assert.equal(trainerOnly.only, JORDAN);
  const nutriOnly = HC.bsHomeCare([MAYA]);
  assert.deepEqual([nutriOnly.kind, nutriOnly.openRole, nutriOnly.seat, nutriOnly.invite], ['one', 'trainer', true, true]);
  // A team: a trainer and a nutritionist, in either order, with nothing open. The trainers lead.
  for (const list of [[JORDAN, MAYA], [MAYA, JORDAN], [MAYA, JORDAN, SAM]]) {
    const team = HC.bsHomeCare(list);
    assert.deepEqual([team.kind, team.openRole, team.seat, team.invite, team.only], ['team', null, false, false, null]);
    assert.equal(team.coaches[0].role, 'trainer');
    assert.equal(team.coaches[team.coaches.length - 1], MAYA);
  }
  // Two coaches of one discipline (rare): the other is still open, but the seat and the invitation are for
  // a member with exactly one coach.
  const two = HC.bsHomeCare([JORDAN, SAM]);
  assert.deepEqual([two.kind, two.openRole, two.seat, two.invite, two.only], ['coaches', 'nutritionist', false, false, null]);
  // A role that is not 'nutritionist' is a trainer's, as everywhere on Home.
  assert.equal(HC.bsHomeCare([{ role: 'coach', name: 'X' }]).openRole, 'nutritionist');
  assert.equal(HC.bsHomeCare([null, JORDAN, undefined]).kind, 'one', 'holes in the list are not coaches');
});

test('the goal\'s title by state: Your goal, Your goal with {first name}, Your team\'s goal', () => {
  assert.equal(HC.bsCareGoalTitle(HC.bsHomeCare([])), 'yours');
  assert.equal(HC.bsCareGoalTitle(HC.bsHomeCare([JORDAN])), 'with');
  assert.equal(HC.bsCareGoalTitle(HC.bsHomeCare([MAYA])), 'with');
  assert.equal(HC.bsCareGoalTitle(HC.bsHomeCare([JORDAN, MAYA])), 'team');
  assert.equal(HC.bsCareGoalTitle(HC.bsHomeCare([JORDAN, SAM])), 'coaches');
  assert.equal(HC.bsCareGoalTitle(HC.bsHomeCare([{ role: 'trainer', name: null, providerId: 9 }])), 'coach', 'a coach whose name could not be read');
  assert.equal(HC.bsCareGoalTitle(null), 'yours');
});

const GOAL = (coaches, over = {}) => ({
  data: { primary: 'fat_loss', overall: { title: 'Lean by August', unit: 'kg', start: 80, target: 75 }, weighIns: [{ d: '2026-08-27', kg: 80 }, { d: '2026-10-15', kg: 78 }, { d: '2026-10-22', kg: 77.6 }] },
  docKg: (v) => (v == null || v === '' ? null : Number(v)), isWeightGoal: () => true, goalWords: (id) => id, todayIso: '2026-10-22', coaches, ...over,
});
const titleOf = (d) => textOf(d.nodes().find(fn('BSHomePlateLabel')));

test('the goal plate says who is on the goal: its title, and the plate\'s own name', () => {
  const cases = [
    [[], 'none', 'Your goal'],
    [[JORDAN], 'one', 'Your goal, with Jordan'],
    [[MAYA], 'one', 'Your goal, with Maya'],
    [[JORDAN, MAYA], 'team', 'Your team’s goal'],
    [[JORDAN, SAM], 'coaches', 'Your goal, with your coaches'],
    [[{ role: 'trainer', name: null, providerId: 9 }], 'one', 'Your goal, with your coach'],
  ];
  for (const [coaches, kind, title] of cases) {
    const d = drive(D.BSHomeClimbView, GOAL(coaches));
    assert.equal(d.nodes()[0].props['data-bs-home-goal'], kind);
    assert.equal(titleOf(d), title);
    assert.equal(d.nodes()[0].props['aria-label'], title, 'a screen reader hears the plate by its title');
    // The goal in the member's words stays the plate's tag in every state.
    assert.equal(d.nodes().find(fn('BSHomePlateLabel')).props.note, 'Lean by August');
  }
  // Still reading: the title is already the right one.
  assert.equal(titleOf(drive(D.BSHomeClimbView, GOAL([JORDAN, MAYA], { data: null }))), 'Your team’s goal');
});

// ── The trails into the start of the climb ───────────────────────────────────

test('a trail a discipline leads into the start of the climb: solid with a coach on it, dashed where the seat is open, none with no coach', () => {
  assert.deepEqual(HC.bsCareTrails(HC.bsHomeCare([])), [], 'no coach: no trail');
  assert.deepEqual(HC.bsCareTrails(null), []);
  const open = (coaches) => HC.bsCareTrails(HC.bsHomeCare(coaches)).map((t) => [t.role, t.open]);
  assert.deepEqual(open([JORDAN, MAYA]), [['trainer', false], ['nutritionist', false]], 'a team: both solid');
  assert.deepEqual(open([JORDAN]), [['trainer', false], ['nutritionist', true]], 'a trainer only: food is open');
  assert.deepEqual(open([MAYA]), [['trainer', true], ['nutritionist', false]], 'a nutritionist only: training is open');
  assert.deepEqual(open([JORDAN, SAM]), [['trainer', false], ['nutritionist', true]]);
  // Both end on the route's first point.
  const foot = C.bsClimbPoint(0);
  for (const t of HC.bsCareTrails(HC.bsHomeCare([JORDAN, MAYA]))) assert.ok(t.d.endsWith(` ${foot.x},${foot.y}`), `${t.role}'s trail misses the start`);
  assert.notEqual(HC.BS_CARE_TRAIL.trainer, HC.BS_CARE_TRAIL.nutritionist, 'they come in from two sides');
});

test('the chart draws the trails in the roles\' colours: rust for training, gold for food', () => withTheme(DARK, () => {
  const trails = (coaches, over) => by(drive(D.BSHomeClimbView, GOAL(coaches, over)), 'data-climb-trail');
  assert.equal(trails([]).length, 0, 'no coach: the climb alone');
  const team = trails([JORDAN, MAYA]);
  assert.deepEqual(team.map((p) => [p.props['data-climb-trail'], p.props.d, p.props.stroke, p.props.strokeDasharray]), [
    ['trainer', HC.BS_CARE_TRAIL.trainer, '#e0694f', undefined],
    ['nutritionist', HC.BS_CARE_TRAIL.nutritionist, '#d3a64b', undefined],
  ]);
  assert.ok(team.every((p) => p.props.fill === 'none' && p.props['data-climb-trail-open'] === undefined));
  // One coach: theirs solid, the other discipline's dashed and a step thinner.
  const solo = trails([JORDAN]);
  assert.deepEqual(solo.map((p) => [p.props['data-climb-trail'], p.props['data-climb-trail-open'], p.props.strokeDasharray, p.props.strokeWidth]), [
    ['trainer', undefined, undefined, 3], ['nutritionist', '', '3 5', 2],
  ]);
  assert.deepEqual(trails([MAYA]).map((p) => [p.props['data-climb-trail'], p.props['data-climb-trail-open']]), [['trainer', ''], ['nutritionist', undefined]]);
  // The trails are the coaches', not the goal's: they stand whatever the goal says, but not while it reads.
  assert.equal(trails([JORDAN, MAYA], { data: { primary: '', overall: {}, weighIns: [] } }).length, 2);
  assert.equal(trails([JORDAN, MAYA], { data: null }).length, 0);
}));

test('the roles\' colours, as the approved Home pairs them: a solid mark and lighter words on a dark paper, darker words on a light one', () => {
  assert.deepEqual(HC.bsCareRoleInk(false, 'trainer'), { mark: '#c0533b', bar: '#c0533b', line: '#e0694f', text: '#ec8a6f' });
  assert.deepEqual(HC.bsCareRoleInk(false, 'nutritionist'), { mark: '#d3a64b', bar: '#a07a2e', line: '#d3a64b', text: '#d3a64b' });
  assert.deepEqual(HC.bsCareRoleInk(true, 'trainer'), { mark: '#c0533b', bar: '#c0533b', line: '#c0533b', text: '#9c3b26' });
  assert.deepEqual(HC.bsCareRoleInk(true, 'nutritionist'), { mark: '#a07a2e', bar: '#a07a2e', line: '#a07a2e', text: '#7a5a1e' });
  assert.deepEqual(HC.bsCareRoleInk(false, undefined), HC.bsCareRoleInk(false, 'trainer'), 'a role that is not a nutritionist\'s is a trainer\'s');
});

// ── The coaches on the goal ──────────────────────────────────────────────────

test('the goal\'s coaches row: each coach\'s portrait, first name and discipline; Data opens the goal', () => {
  const went = [];
  const d = drive(CARE.BSHomeCoachesRow, { care: HC.bsHomeCare([JORDAN, MAYA]), onCoach: (c) => went.push(c.name), onData: () => went.push('data') });
  assert.equal(d.nodes()[0].props['data-home-goal-coaches'], 'team');
  const cells = by(d, 'data-home-goal-coach');
  assert.deepEqual(cells.map((c) => [c.type, c.props['data-home-goal-coach'], textOf(c)]), [['button', 'trainer', 'JordanTraining'], ['button', 'nutritionist', 'MayaFuel']]);
  assert.deepEqual(cells.map((c) => c.props['aria-label']), ['Jordan Chen’s page · Training', 'Dr. Maya Patel’s page · Fuel']);
  assert.ok(cells.every((c) => c.props.style.minHeight >= 44), 'a coach is a 44 px target');
  cells[1].props.onClick();
  assert.deepEqual(went, ['Dr. Maya Patel'], 'a coach opens their own page');
  // The portraits: a photo ringed in the role's colour, else initials on it, and initials when the photo fails.
  const faces = d.nodes().filter(fn('BSHomeCoachFace'));
  assert.deepEqual(faces.map((f) => [f.props.photo, f.props.role]), [[JORDAN.photo, 'trainer'], [null, 'nutritionist']]);
  const photo = drive(faces[0].type, faces[0].props);
  const img = photo.nodes()[0];
  assert.deepEqual([img.type, img.props['data-home-face'], img.props.src, img.props.alt], ['img', 'photo', JORDAN.photo, '']);
  assert.equal(img.props.style.border, '2px solid #c0533b', 'a trainer\'s ring is rust');
  assert.equal(img.props.style.borderRadius, '26%', 'a soft square, as the approved Home\'s portraits');
  img.props.onError();
  photo.render();
  assert.deepEqual([photo.nodes()[0].props['data-home-face'], photo.text], ['initials', 'JC']);
  assert.equal(drive(faces[1].type, faces[1].props).text, 'MP', 'Dr. Maya Patel is MP, not DM');
  // No open seat beside a team; Data is the door to the goal's page.
  assert.equal(by(d, 'data-home-goal-seat').length, 0);
  const data = by(d, 'data-home-goal-data')[0];
  assert.equal(textOf(data), 'Data →');
  assert.ok(data.props.style.minHeight >= 44);
  data.props.onClick();
  assert.deepEqual(went, ['Dr. Maya Patel', 'data']);
});

test('with exactly one coach, the other discipline is an open seat, dashed in its role\'s colour, and opens the coaches of that discipline', () => {
  const asked = [];
  const d = drive(CARE.BSHomeCoachesRow, { care: HC.bsHomeCare([JORDAN]), onCoach: () => {}, onSeat: (role) => asked.push(role), onData: () => {} });
  assert.deepEqual(by(d, 'data-home-goal-coach').map(textOf), ['JordanTraining']);
  const [seat] = by(d, 'data-home-goal-seat');
  assert.equal(seat.type, 'button');
  assert.equal(seat.props['data-home-goal-seat'], 'nutritionist');
  assert.equal(textOf(seat), 'Open seatFood');
  assert.equal(seat.props['aria-label'], 'Open seat · Find a nutritionist');
  assert.equal(seat.props.style.border, '1.5px dashed #a07a2e', 'dashed, in the nutritionist\'s gold');
  assert.ok(seat.props.style.minHeight >= 44);
  seat.props.onClick();
  assert.deepEqual(asked, ['nutritionist']);
  assert.equal(by(d, 'data-home-goal-data').length, 0, 'the seat takes Data\'s place, as the approved Home');
  // A nutritionist only: the open seat is training's, in rust.
  const n = drive(CARE.BSHomeCoachesRow, { care: HC.bsHomeCare([MAYA]), onSeat: (role) => asked.push(role) });
  const [trainSeat] = by(n, 'data-home-goal-seat');
  assert.equal(textOf(trainSeat), 'Open seatTraining');
  assert.equal(trainSeat.props['aria-label'], 'Open seat · Find a trainer');
  assert.equal(trainSeat.props.style.border, '1.5px dashed #c0533b');
  trainSeat.props.onClick();
  assert.deepEqual(asked, ['nutritionist', 'trainer']);
  // No seat with no coach, with a team, or with several coaches of one discipline.
  assert.equal(drive(CARE.BSHomeCoachesRow, { care: HC.bsHomeCare([]) }).nodes().length, 0, 'no coach: no row at all');
  for (const coaches of [[JORDAN, MAYA], [JORDAN, SAM]]) assert.equal(by(drive(CARE.BSHomeCoachesRow, { care: HC.bsHomeCare(coaches), onSeat: () => {} }), 'data-home-goal-seat').length, 0);
  // With no door handed in, nothing is drawn as a button that leads nowhere.
  const still = drive(CARE.BSHomeCoachesRow, { care: HC.bsHomeCare([JORDAN]) });
  assert.ok(!still.nodes().some((x) => x.type === 'button'), 'a button with nothing behind it');
  assert.equal(by(still, 'data-home-goal-seat')[0].type, 'div');
  // A coach whose name could not be read is their role.
  assert.deepEqual(by(drive(CARE.BSHomeCoachesRow, { care: HC.bsHomeCare([{ role: 'nutritionist', name: null, providerId: 3 }]) }), 'data-home-goal-coach').map(textOf), ['NutritionistFuel']);
});

// ── The invitation ───────────────────────────────────────────────────────────

test('the invitation is drawn only for a member with exactly one coach', () => {
  for (const coaches of [[], [JORDAN, MAYA], [JORDAN, SAM], [MAYA, JORDAN, SAM]]) {
    assert.equal(drive(CARE.BSHomeInviteView, { care: HC.bsHomeCare(coaches), shown: true }).nodes().length, 0, `${coaches.length} coaches: an invitation`);
  }
  assert.equal(drive(CARE.BSHomeInviteView, { care: HC.bsHomeCare([JORDAN]), shown: false }).nodes().length, 0, 'put away: nothing drawn');
  assert.equal(drive(CARE.BSHomeInviteView, { care: null }).nodes().length, 0);
  const d = drive(CARE.BSHomeInviteView, { care: HC.bsHomeCare([JORDAN]), shown: true });
  assert.equal(d.nodes()[0].type, 'section');
  assert.equal(d.nodes()[0].props['data-bs-home-invite'], 'nutritionist');
});

test('the invitation says what is true today: the coach has one half, a coach of the other brings both the plan, the schedule, the progress and a thread; it names no partner and promises no review', () => {
  const found = [];
  let later = 0;
  const d = drive(CARE.BSHomeInviteView, { care: HC.bsHomeCare([JORDAN]), shown: true, onFind: (role) => found.push(role), onLater: () => { later += 1; } });
  assert.equal(d.text, [
    'The other half',
    'Jordan has your training. Food is the other half.',
    'Add a nutritionist and both coaches see your plan, your schedule and your progress, with a thread of their own to work from.',
    'Find a nutritionist', 'Not now',
    'Nothing changes with Jordan either way.',
  ].join(''));
  // ⚠ No pairing exists in the data: nobody is named but the member's own coach, and no joint review, no
  // price and nothing "free" is promised.
  assert.doesNotMatch(d.text, /review|Saturday|works with|free|\$|price|Meet /i);
  const find = by(d, 'data-home-invite-find')[0];
  const notNow = by(d, 'data-home-invite-later')[0];
  // The filled button and the outlined one beside it, each 48px tall.
  assert.equal(find.props.style.background, THEME.INK);
  assert.equal(find.props.style.color, THEME.PAPER);
  assert.equal(notNow.props.style.background, 'transparent');
  assert.match(notNow.props.style.border, /^1px solid /);
  assert.ok([find, notNow].every((b) => b.props.style.minHeight === 48 && b.props.style.borderRadius === 14));
  find.props.onClick();
  assert.deepEqual(found, ['nutritionist'], 'it opens the coaches of the missing discipline');
  notNow.props.onClick();
  assert.equal(later, 1);
  // A nutritionist only: the other half is training.
  const n = drive(CARE.BSHomeInviteView, { care: HC.bsHomeCare([MAYA]), shown: true, onFind: (role) => found.push(role) });
  assert.equal(n.nodes()[0].props['data-bs-home-invite'], 'trainer');
  assert.match(n.text, /Maya has your food\. Training is the other half\./);
  assert.match(n.text, /Add a trainer and both coaches see your plan, your schedule and your progress/);
  assert.match(n.text, /Nothing changes with Maya either way\./);
  by(n, 'data-home-invite-find')[0].props.onClick();
  assert.deepEqual(found, ['nutritionist', 'trainer']);
  assert.equal(textOf(by(n, 'data-home-invite-find')[0]), 'Find a trainer');
  // A coach whose name could not be read.
  const anon = drive(CARE.BSHomeInviteView, { care: HC.bsHomeCare([{ role: 'trainer', name: null, providerId: 9 }]), shown: true });
  assert.match(anon.text, /Your trainer has your training\. Food is the other half\./);
  assert.match(anon.text, /Nothing changes with your coach either way\./);
  // The plate is tinted in the missing role's colour, on its border too.
  assert.match(d.nodes()[0].props.style.border, /^1px solid rgba\(160,122,46,0\.5\)$/);
  assert.match(n.nodes()[0].props.style.border, /^1px solid rgba\(192,83,59,0\.5\)$/);
  // What it will say once coach pairing ships is written beside it.
  const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSHomeCare.jsx'), 'utf8');
  assert.match(src, /When coach pairing ships, this plate names the coach's partner/);
});

test('"Not now" puts the invitation away for a fortnight, for this account and this coach, and never for good', () => {
  const care = HC.bsHomeCare([JORDAN]);
  const shown = (over) => HC.bsCareInviteShown({ care, uid: 'u1', day: '2026-11-17', stamp: null, ...over });
  assert.equal(shown(), true, 'never put away: shown');
  const stamp = HC.bsCareInviteStamp({ uid: 'u1', coach: JORDAN, day: '2026-11-17' });
  assert.equal(stamp, 'u1|t:7|2026-11-17');
  assert.equal(shown({ stamp }), false, 'the day of the tap');
  assert.equal(shown({ stamp, day: '2026-11-30' }), false, '13 days on');
  assert.equal(shown({ stamp, day: '2026-12-01' }), true, 'a fortnight on, it is back');
  assert.equal(HC.BS_CARE_INVITE_DAYS, 14);
  // Another coach, or another account on this device: not this plate's "Not now".
  assert.equal(HC.bsCareInviteShown({ care: HC.bsHomeCare([SAM]), uid: 'u1', day: '2026-11-18', stamp }), true);
  assert.equal(HC.bsCareInviteShown({ care: HC.bsHomeCare([MAYA]), uid: 'u1', day: '2026-11-18', stamp }), true);
  assert.equal(shown({ stamp, uid: 'u2', day: '2026-11-18' }), true);
  // A stamp from a day ahead (a clock set back), or one that cannot be read, hides nothing.
  assert.equal(shown({ stamp, day: '2026-11-10' }), true);
  for (const bad of ['', 'nonsense', 'u1|t:7|', 'u1|t:7|soon', '|']) assert.equal(shown({ stamp: bad }), true, `"${bad}" hid the plate`);
  // Signed out (the Preview): its own stamp.
  assert.equal(HC.bsCareInviteStamp({ uid: null, coach: MAYA, day: '2026-11-17' }), 'preview|n:3|2026-11-17');
  assert.equal(HC.bsCareInviteShown({ care, uid: null, day: '2026-11-18', stamp: HC.bsCareInviteStamp({ uid: null, coach: JORDAN, day: '2026-11-17' }) }), false);
  // Only ever for a member with exactly one coach, whatever the stamp says.
  for (const coaches of [[], [JORDAN, MAYA], [JORDAN, SAM]]) assert.equal(HC.bsCareInviteShown({ care: HC.bsHomeCare(coaches), uid: 'u1', day: '2026-11-17', stamp: null }), false);
  assert.equal(HC.bsCareInviteShown(), false);
});

test('the device keeps a "Not now" an account and coach, so one never wipes another (Codex P2 on #2750)', () => {
  const a = { uid: 'u1', coach: JORDAN }, b = { uid: 'u2', coach: MAYA };
  let stored = HC.bsCareInviteWrite(null, a, '2026-11-17');
  stored = HC.bsCareInviteWrite(stored, b, '2026-11-20');
  assert.equal(HC.bsCareInviteRead(stored, a), 'u1|t:7|2026-11-17');
  assert.equal(HC.bsCareInviteRead(stored, b), 'u2|n:3|2026-11-20');
  // The first account comes back inside its fortnight: still put away.
  assert.equal(HC.bsCareInviteShown({ care: HC.bsHomeCare([JORDAN]), uid: 'u1', day: '2026-11-21', stamp: HC.bsCareInviteRead(stored, a) }), false);
  // Nobody else's stamp is this account and coach's.
  assert.equal(HC.bsCareInviteRead(stored, { uid: 'u1', coach: MAYA }), null);
  assert.equal(HC.bsCareInviteRead(stored, { uid: 'u3', coach: JORDAN }), null);
  // A stamp past its fortnight is dropped at the next write; one still inside it is kept.
  stored = HC.bsCareInviteWrite(stored, { uid: 'u3', coach: JORDAN }, '2026-12-02');
  assert.deepEqual(Object.keys(JSON.parse(stored)).sort(), ['u2|n:3', 'u3|t:7']);
  // Nothing held, or something that cannot be read: no stamp, and a write starts afresh.
  for (const bad of [null, '', 'nonsense', '[]', '"x"', 'u1|t:7|2026-11-17']) {
    assert.equal(HC.bsCareInviteRead(bad, a), null, `read a stamp out of ${JSON.stringify(bad)}`);
    assert.deepEqual(JSON.parse(HC.bsCareInviteWrite(bad, a, '2026-11-17')), { 'u1|t:7': '2026-11-17' });
  }
});

test('Home\'s invitation remembers "Not now" on the device, as the past-due row remembers its ×', () => {
  const store = new Map();
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); } } });
  globalThis.ShapeAuth = { getCachedState: () => ({ user: { id: 'member-1' } }) };
  try {
    const d = drive(CARE.BSHomeInvite, { coaches: [JORDAN], onFind: () => {} });
    const view = () => d.nodes().find(fn('BSHomeInviteView'));
    assert.equal(view().props.shown, true);
    assert.equal(view().props.care.kind, 'one');
    view().props.onLater();
    d.render();
    assert.equal(view().props.shown, false, 'put away at once');
    const kept = JSON.parse(store.get(HC.BS_CARE_INVITE_KEY));
    assert.deepEqual(Object.keys(kept), ['member-1|t:7']);
    assert.match(kept['member-1|t:7'], /^\d{4}-\d{2}-\d{2}$/);
    // A new visit reads the stamp: still put away for this coach, shown again for another.
    assert.equal(drive(CARE.BSHomeInvite, { coaches: [JORDAN] }).nodes().find(fn('BSHomeInviteView')).props.shown, false);
    assert.equal(drive(CARE.BSHomeInvite, { coaches: [SAM] }).nodes().find(fn('BSHomeInviteView')).props.shown, true);
    // A team never sees it.
    assert.equal(drive(CARE.BSHomeInvite, { coaches: [JORDAN, MAYA] }).nodes().find(fn('BSHomeInviteView')).props.shown, false);
    // Another account on this device puts its own away: the first account's fortnight is kept (Codex P2 on #2750).
    globalThis.ShapeAuth = { getCachedState: () => ({ user: { id: 'member-2' } }) };
    const other = drive(CARE.BSHomeInvite, { coaches: [MAYA] });
    assert.equal(other.nodes().find(fn('BSHomeInviteView')).props.shown, true);
    other.nodes().find(fn('BSHomeInviteView')).props.onLater();
    other.render();
    assert.equal(other.nodes().find(fn('BSHomeInviteView')).props.shown, false);
    globalThis.ShapeAuth = { getCachedState: () => ({ user: { id: 'member-1' } }) };
    assert.equal(drive(CARE.BSHomeInvite, { coaches: [JORDAN] }).nodes().find(fn('BSHomeInviteView')).props.shown, false, 'the second account\'s "Not now" wiped the first\'s');
    assert.deepEqual(Object.keys(JSON.parse(store.get(HC.BS_CARE_INVITE_KEY))).sort(), ['member-1|t:7', 'member-2|n:3']);
    // Storage that throws (private mode): put away for this visit all the same.
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } } });
    const priv = drive(CARE.BSHomeInvite, { coaches: [MAYA] });
    assert.equal(priv.nodes().find(fn('BSHomeInviteView')).props.shown, true);
    priv.nodes().find(fn('BSHomeInviteView')).props.onLater();
    priv.render();
    assert.equal(priv.nodes().find(fn('BSHomeInviteView')).props.shown, false);
  } finally {
    delete globalThis.ShapeAuth;
    if (prev) Object.defineProperty(globalThis, 'localStorage', prev); else delete globalThis.localStorage;
  }
});

// ── This week says whose bars are whose ──────────────────────────────────────

const GRID = {
  week: ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'],
  today: 3,
  sessions: ['hit', 'rest', 'miss', 'ahead', 'ahead', 'ahead', 'ahead'],
  food: ['hit', 'hit', 'miss', 'hit', 'ahead', 'ahead', 'ahead'],
  protein: ['hit', 'miss', 'hit', 'ahead', 'ahead', 'ahead', 'ahead'],
  steps: ['miss', 'hit', 'miss', 'ahead', 'ahead', 'ahead', 'ahead'],
  mornings: ['hit', 'miss', 'hit', 'ahead', 'ahead', 'ahead', 'ahead'],
};

test('under This week, the two coloured bars are named: each coach on theirs, the open seat with one coach, the names alone with none', () => {
  const whose = (coaches) => {
    const d = drive(D.BSHomeWeekBarsView, { w: { grid: GRID }, checkinsOn: true, coaches, onDay: () => {}, onMonth: () => {}, onSteps: () => {} });
    return { d, line: by(d, 'data-bs-home-week-whose')[0], said: by(d, 'data-week-whose').map((n) => [textOf(n), n.props['data-week-whose-open'] === '']) };
  };
  const team = whose([JORDAN, MAYA]);
  assert.equal(team.line.props['data-bs-home-week-whose'], 'team');
  assert.deepEqual(team.said, [['▌Train · Jordan', false], ['▌Fuel · Maya', false]]);
  assert.deepEqual(whose([JORDAN]).said, [['▌Train · Jordan', false], ['┆ Food · Open seat', true]]);
  assert.deepEqual(whose([MAYA]).said, [['┆ Train · Open seat', true], ['▌Fuel · Maya', false]]);
  assert.deepEqual(whose([]).said, [['▌Train', false], ['▌Food', false]], 'no coach: the bars\' names alone');
  assert.deepEqual(whose([JORDAN, SAM]).said, [['▌Train · Jordan', false], ['▌Food', false]], 'the seat is for a member with one coach');
  // In the roles' colours, and it takes no tap: the date's → and Steps reach down over it.
  const spans = by(team.d, 'data-week-whose');
  assert.deepEqual(spans.map((n) => n.props.style.color), ['#9c3b26', '#7a5a1e']);
  assert.equal(team.line.props.style.pointerEvents, 'none');
  assert.ok(!flatten(team.line).some((n) => n.type === 'button'), 'a door under the date\'s →');
  // The strip keeps what it said: every bar, the picked day's line and the plate around them.
  assert.match(team.d.text, /○ Train · ✓ Food · ○ Protein · ○ Steps · ○ Check-in/);
  assert.equal(team.d.nodes()[0].props.style.borderRadius, 18, 'This week is a plate of its own');
});

// ── Home's type and its plate ────────────────────────────────────────────────

test('Home is set in Saira, with the app\'s mono for its small capitals: no Geist, no Inter Tight', () => {
  let t = null;
  drive(() => { t = CARE.useBSHomeType(); return null; }, {});
  assert.match(CARE.BS_HOME_FACE, /^'Saira',/);
  assert.deepEqual([t.DISPLAY, t.BODY, t.HEAD], [CARE.BS_HOME_FACE, CARE.BS_HOME_FACE, CARE.BS_HOME_FACE], 'every word face of Home\'s theme');
  assert.equal(t.MONO, THEME.MONO, 'the mono is the app\'s own');
  assert.equal(t.INK, THEME.INK, 'the rest of the theme is the paper\'s');
  assert.equal(CARE.bsHomeMono(t).fontFamily, THEME.MONO);
  assert.deepEqual([CARE.bsHomeMono(t).letterSpacing, CARE.bsHomeMono(t).textTransform, CARE.bsHomeMono(t).fontSize], ['0.16em', 'uppercase', 10]);
  // The Home modules name neither of the coach pages' faces.
  for (const f of ['BSHomeCare', 'BSHomeDeck', 'BSHomeTeam', 'BSHomeSections']) {
    const src = stripComments(readFileSync(join(ROOT, `mobile-app/src/broadsheet/${f}.jsx`), 'utf8'));
    assert.doesNotMatch(src, /Geist|Inter Tight|BS_CLEAN_HEAD|BS_CLEAN_SANS/, `${f}.jsx sets a word in the coach pages' type`);
  }
  // Home reads that theme and hands it to everything under its top bars, its weights as written.
  const client = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
  const home = client.slice(client.indexOf('function BSClientHome('), client.indexOf('// ─── helper: tweaks-backed widget list'));
  assert.match(home, /const t = useBSHomeType\(\);/);
  assert.doesNotMatch(home, /useBSClean\(\)|<BSCleanType/, 'Home is back in the coach pages\' type');
  assert.ok(home.indexOf('<BSHomeType t={t}>') > home.indexOf('<BSHomeScoreQuote') && home.indexOf('<BSHomeType t={t}>') < home.indexOf('<BSHomeDeck radio='), 'Home\'s type starts under the score line');
  assert.ok(home.indexOf('</BSHomeType>') > home.indexOf('<BSHomeShortcutList') && home.indexOf('</BSHomeType>') < home.indexOf('<BSFooter'), 'and ends before the footer');
  const type = drive(CARE.BSHomeType, { t, children: 'x' }).nodes()[0];
  assert.equal(type.type.name, 'BSCleanType', 'the box that keeps a weight as it is written');
  assert.equal(type.props.t, t);
});

test('Home\'s plate: an 18px corner, the dot grid and a hairline; flat on a dark paper, glass on a light one', () => {
  const dark = CARE.bsHomePlate(DARK);
  assert.equal(dark.borderRadius, 18);
  assert.equal(dark.backgroundColor, 'rgba(245,240,230,0.055)', 'the paper\'s ink at a few percent, no sheen');
  assert.equal(dark.backgroundImage, 'radial-gradient(rgba(245,240,230,0.055) 1px, transparent 1px)', 'the faint dot grid');
  assert.equal(dark.backgroundSize, '14px 14px');
  assert.equal(dark.border, '1px solid rgba(245,240,230,0.12)', 'a hairline round it');
  assert.equal(dark.boxShadow, 'none');
  // On a light paper it is the member profile's pane (BSMemberBento.jsx's bsMpGlass), at Home's corner.
  const light = CARE.bsHomePlate(THEME);
  assert.equal(light.borderRadius, 18);
  assert.match(light.backgroundImage, /^radial-gradient\(/, 'the dot grid on a light paper too');
  assert.equal(light.backgroundSize, '14px 14px, auto');
  assert.match(light.border, /^1px solid /);
  assert.match(stripComments(readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSHomeCare.jsx'), 'utf8')), /bsMpGlass\(t, t\.INK, \{ grid: true, radius: 18 \}\)/, 'the plate is the profile\'s pane, not a second one');
  // The plate's controls: a 48px square with a 12px corner, a 48px button with a 14px one; filled in the
  // paper's ink (cream on a dark paper), or an outline.
  const sq = CARE.bsHomeSquare(DARK, true);
  assert.deepEqual([sq.width, sq.height, sq.borderRadius, sq.background, sq.color, sq.border], [48, 48, 12, '#f5f0e6', '#0f0e0c', 0]);
  const out = CARE.bsHomeSquare(DARK, false);
  assert.deepEqual([out.background, out.color, out.border], ['transparent', '#f5f0e6', '1px solid rgba(245,240,230,0.3)']);
  assert.equal(CARE.bsHomeSquare(DARK, false, 44).minHeight, 44);
  const btn = CARE.bsHomeButton(DARK, true);
  assert.deepEqual([btn.minHeight, btn.borderRadius, btn.background, btn.color], [48, 14, '#f5f0e6', '#0f0e0c']);
  // A plate's label: a small dot, the words, and a pill tag.
  const label = drive(CARE.BSHomePlateLabel, { t: DARK, dot: '#e2ac44', note: 'Lean by August', children: 'Your team’s goal' });
  assert.equal(label.text, 'Your team’s goalLean by August');
  const dot = label.nodes().find((n) => n.props && n.props['aria-hidden'] === 'true');
  assert.deepEqual([dot.props.style.width, dot.props.style.height, dot.props.style.background], [7, 7, '#e2ac44']);
  assert.equal(by(label, 'data-home-plate-tag')[0].props.style.borderRadius, 999, 'a pill');
  assert.equal(by(drive(CARE.BSHomePlateLabel, { t: DARK, children: 'Your goal' }), 'data-home-plate-tag').length, 0, 'no tag without words');
});

// ── Home, in the approved order ──────────────────────────────────────────────

test('Home reads top to bottom as the approved Home: Shape Radio, This week, the goal, the invitation, Today\'s plan, the morning\'s plate, the shortcuts', () => {
  const client = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
  const home = client.slice(client.indexOf('function BSClientHome('), client.indexOf('// ─── helper: tweaks-backed widget list'));
  const at = (s) => { const i = home.indexOf(s); assert.ok(i > 0, `${s} is gone from Home`); return i; };
  const order = ['<BSHomeScoreQuote ', '<BSHomeDeck radio={<BSNowPlaying onOpen={goRadio} />}>', '<BSHomeWeekBars', '<BSHomeClimb tour="hero-goal"', '</BSHomeDeck>',
    '<BSHomeInvite coaches={teamCoaches}', '<BSHomeTeam tour="hero-home"', '<BSMorningPanel>', '<BSHomeShortcutList'].map(at);
  assert.deepEqual(order, order.slice().sort((a, b) => a - b), 'Home is out of the approved order');
  // The same coaches reach every section that speaks of them.
  assert.match(home, /coaches=\{teamCoaches\} picked=\{pickedDay\} onPick=\{setPickedDay\} \/>/, 'This week does not know the coaches');
  assert.match(home, /coaches=\{teamCoaches\} onCoach=\{openCoach\} onSeat=\{\(role\) => goMarket\?\.\(role\)\} \/>/, 'the goal does not know the coaches');
  assert.match(home, /<BSHomeInvite coaches=\{teamCoaches\} onFind=\{\(role\) => goMarket\?\.\(role\)\} \/>/, 'the invitation opens the coaches of the missing discipline');
  assert.match(home, /<BSHomeTeam tour="hero-home" coaches=\{teamCoaches\} notes=\{notes\}/);
  // A coach's own page is Coaches opened on their listing; with no listing to open, Coaches itself.
  assert.match(home, /new CustomEvent\('shape:openMarket', \{ detail: \{ role: c\.role === 'nutritionist' \? 'nutritionist' : 'trainer', coachId: id \} \}\)/);
  // ⚠ The Preview's sample member has a team: a trainer and a nutritionist.
  const sample = home.slice(home.indexOf('const teamCoaches = sample'), home.indexOf(': planCoaches;'));
  assert.match(sample, /\{ role: 'trainer', name: 'Jordan Chen'/);
  assert.match(sample, /\{ role: 'nutritionist', name: 'Dr\. Maya Patel'/);
  // The shortcuts keep their four, then the member's coach (their page) or their team.
  const list = home.slice(home.indexOf('<BSHomeShortcutList'), home.indexOf(']} />', home.indexOf('<BSHomeShortcutList')));
  assert.deepEqual([...list.matchAll(/\{ key: '([a-z]+)'/g)].map((m) => m[1]), ['score', 'progress', 'grocery', 'devices', 'coach', 'team']);
  assert.match(list, /homeCare\.kind === 'one'\s*\? \[\{ key: 'coach', label: tr\('home:shortcut\.coach', \{ defaultValue: 'Your coach' \}\)[^\n]*onOpen: \(\) => openCoach\(homeCare\.only\) \}\]/);
  assert.match(list, /: homeCare\.kind !== 'none'\s*\? \[\{ key: 'team', label: homeCare\.kind === 'team' \? tr\('home:shortcut\.team', \{ defaultValue: 'Your team' \}\)[^\n]*onOpen: \(\) => goMarket\?\.\(\) \}\]\s*: \[\]\),/);
  // ⚠ Nothing backs them yet, so Home draws none of them: a weekly review from both coaches, a named
  // partner, a team price.
  for (const f of ['BSHomeCare', 'BSHomeDeck', 'BSHomeTeam', 'BSHomeSections']) {
    const src = stripComments(readFileSync(join(ROOT, `mobile-app/src/broadsheet/${f}.jsx`), 'utf8'));
    assert.doesNotMatch(src, /Weekly review|review is ready|signed by both|team price|Meet \{/i, `${f}.jsx draws something nothing backs yet`);
  }
});
