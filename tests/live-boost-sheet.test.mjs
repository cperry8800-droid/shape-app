// tests/live-boost-sheet.test.mjs
//
// The live Boost sheet (cheer someone on mid-workout or mid-cook), redrawn on 2026-11-04 (owner: "update to
// design for this pop up", "keep designs simple … modern, appealing, esay to navigate, not overwhelming, not
// analog. make them look really alive", then "reduce the coloring and and simplify UI more"), and moved out
// of iosAppBroadsheetClient.jsx into BSLiveBoost.jsx.
//
// What this holds: the look (the paper's own colour, no caps headline, no heavy rule, no square box; colour
// only on the live dot and a ready Send), every behaviour the old sheet had (a cheer sends, the field and its
// Send, the workout/cooking wording, Profile, the demo note, live vs demo, the toasts), the sent moment, and
// motion that stops under reduced motion. The sheet is driven through the client module, as the app renders
// it (the client imports it and re-exports it on window for the Pros bundle).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBroadsheet, drive, textOf, THEME, SRC, ROOT } from './helpers/broadsheet-mount.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const mod = await loadBroadsheet(['BSLiveBoostSheet']);
const BOOST_SRC = join(ROOT, 'mobile-app', 'src', 'broadsheet', 'BSLiveBoost.jsx');
const named = (name) => (n) => n && typeof n.type === 'function' && n.type.name === name;
const TEAL = '#0a8f87';   // the app's teal on a light paper (the harness THEME is light)
const attr = (nodes, a) => nodes.filter((n) => n && n.props && n.props[a] !== undefined);

// The sheet portals into the phone surface; with no document it renders nothing, so every render runs with one.
const withSurface = (fn) => {
  const saved = globalThis.document;
  globalThis.document = { getElementById: () => ({}), body: {} };
  try { return fn(); } finally { globalThis.document = saved; }
};
function driveBoost(person, extra = {}) {
  const calls = { closed: 0, profile: 0 };
  const props = { person, onClose() { calls.closed++; }, onOpenProfile() { calls.profile++; }, ...extra };
  const d = withSurface(() => drive(mod.BSLiveBoostSheet, props));
  const render = d.render;
  d.render = () => withSurface(render);
  d.calls = calls;
  return d;
}
// The app's toasts and its signed-in state, set for one test and put back after it.
function withApp({ signedIn = false, send = async () => ({ data: {} }) } = {}) {
  const saved = { auth: globalThis.ShapeAuth, msgs: globalThis.ShapeMessages, toast: globalThis.__bsToast };
  const toasts = []; const sent = [];
  globalThis.__bsToast = (msg, kind) => toasts.push([msg, kind]);
  globalThis.ShapeAuth = { getCachedState: () => ({ user: signedIn ? { id: 'me' } : null }) };
  globalThis.ShapeMessages = {
    getOrCreateMemberConversation: async ({ otherUserId }) => ({ data: `conv-${otherUserId}` }),
    sendMessage: async (a) => { sent.push(a); return send(a); },
  };
  return { toasts, sent, restore() { globalThis.ShapeAuth = saved.auth; globalThis.ShapeMessages = saved.msgs; globalThis.__bsToast = saved.toast; } };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
const cheersOf = (d) => attr(d.nodes(), 'data-boost-cheer');
const sendOf = (d) => attr(d.nodes(), 'data-boost-send')[0];

test('the sheet: the paper\'s own colour, the facet with a live dot, the name, what they\'re doing as a calm pill', () => {
  const d = driveBoost({ name: 'Priya Shah', activity: 'workout', tier: 'PEAK' });
  const nodes = d.nodes();
  const [sheet] = attr(nodes, 'data-boost-sheet');
  assert.equal(sheet.props.role, 'dialog');
  assert.equal(sheet.props['aria-modal'], 'true');
  assert.equal(sheet.props.style.background, THEME.PAPER, 'the sheet is the paper\'s own colour');
  assert.ok(!/gradient/.test(String(sheet.props.style.background) + String(sheet.props.style.backgroundImage || '')), 'no gradient panel');
  assert.equal(sheet.props.style.borderTopLeftRadius, 26);
  assert.match(String(sheet.props.style.boxShadow), /rgba/, 'soft depth under the sheet');
  // A member's face is the facet, in the magazine's flat cut framed in ink, with no dot of its own: the
  // sheet draws the live dot (and its pulse) at its corner.
  const av = nodes.find(named('BSFacetAvatar'));
  assert.ok(av, 'a member gets the facet avatar');
  assert.equal(av.props.flat, true);
  assert.equal(av.props.c, THEME.INK);
  assert.equal(av.props.online, false);
  const [dot] = attr(nodes, 'data-boost-dot');
  assert.equal(dot.props.style.background, TEAL, 'the live dot is teal mid-workout');
  const [pulse] = attr(nodes, 'data-boost-pulse');
  assert.match(pulse.props.style.animation, /^bsBoostPulse /, 'the dot breathes out a pulse');
  assert.equal(textOf(attr(nodes, 'data-boost-name')[0]), 'Priya Shah');
  const [status] = attr(nodes, 'data-boost-status');
  assert.equal(textOf(status).trim(), 'In a workout now');
  assert.equal(status.props.style.borderRadius, 99);
  assert.ok(!status.props.style.background, 'the status pill is calm: no tinted fill');
  // No caps headline, no heavy rule, no square corners anywhere.
  for (const n of nodes) {
    const st = (n.props && n.props.style) || {};
    assert.notEqual(st.textTransform, 'uppercase', 'a caps line is the old sheet');
    assert.ok(!(st.height === 3 && st.background === THEME.INK), 'the heavy ink rule is the old sheet');
    assert.notEqual(st.borderRadius, 0, 'a square box is the old sheet');
    assert.ok(!st.clipPath);
  }
  assert.ok(!/Boost Priya/i.test(d.text), 'the caps "Boost Priya" headline is gone');
  // The demo member's note, word for word.
  assert.equal(textOf(attr(nodes, 'data-boost-note')[0]).trim(), "Preview · demo member — boosts land in a real member's chat while they train.");
});

test('the cheers are calm round pills, 44px and up, in the paper\'s colour; Send lights teal only with words in the field', () => {
  const d = driveBoost({ name: 'Priya Shah', activity: 'workout' });
  const pills = cheersOf(d);
  assert.deepEqual(pills.map((p) => p.props.children), ["Let's go!", 'Nice!', 'One more rep.', 'Finish strong →', 'Respect the work.']);
  for (const p of pills) {
    assert.equal(p.type, 'button');
    assert.equal(p.props.className, 'bs-boost-pill', 'the pill takes the pressed pop');
    assert.equal(p.props.style.borderRadius, 99);
    assert.equal(p.props.style.minHeight, 44);
    assert.equal(p.props.style.background, THEME.PAPER, 'no tinted pill');
    assert.match(p.props.style.border, /^1px solid rgba\(/);
  }
  const input = d.nodes().find((n) => n.type === 'input');
  assert.equal(input.props.style.fontSize, 16, 'a 16px field never zooms iOS');
  assert.equal(input.props.style.minHeight, 44);
  assert.equal(input.props.placeholder, 'Cheer {name} on…', 'the harness tr leaves {name} as it is');
  assert.equal(input.props['aria-label'], input.props.placeholder);
  assert.equal(sendOf(d).props.disabled, true);
  assert.equal(sendOf(d).props.style.background, 'transparent', 'an empty Send is off and uncoloured');
  assert.equal(sendOf(d).props.style.minHeight, 44);
  input.props.onChange({ target: { value: 'Go get it' } });
  d.render();
  assert.equal(sendOf(d).props.disabled, false);
  assert.equal(sendOf(d).props.style.background, TEAL, 'a ready Send is lit teal');
  assert.equal(sendOf(d).props.style.color, '#ffffff');
  assert.match(sendOf(d).props.style.animation, /^bsBoostPop /, 'it pops as it lights');
  assert.match(textOf(sendOf(d)), /^Send/);
});

test('at the stove: the cooking wording, the cooking cheers and an amber dot', () => {
  const d = driveBoost({ name: 'Sam Ortiz', activity: 'cooking', userId: 'u-sam' });
  const nodes = d.nodes();
  assert.equal(textOf(attr(nodes, 'data-boost-status')[0]).trim(), 'Cooking now');
  assert.equal(attr(nodes, 'data-boost-dot')[0].props.style.background, THEME.AMBER);
  assert.equal(cheersOf(d)[0].props.children, 'What are you making?');
  assert.equal(cheersOf(d).length, 5);
  // A real member's note says where it lands, mid-cook.
  assert.equal(textOf(attr(nodes, 'data-boost-note')[0]).trim(), 'Lands in their chat right now — mid-cook, not after the post.');
});

test('Profile closes the sheet and opens the profile; with no profile to open (the coach\'s Home) it is not drawn', () => {
  const d = driveBoost({ name: 'Priya Shah', activity: 'workout' });
  const [profile] = attr(d.nodes(), 'data-boost-profile');
  assert.match(textOf(profile), /^Profile/);
  assert.ok(profile.props.style.minHeight >= 44 && profile.props.style.minWidth >= 44);
  profile.props.onClick();
  assert.deepEqual(d.calls, { closed: 1, profile: 1 });
  const coachHome = withSurface(() => drive(mod.BSLiveBoostSheet, { person: { name: 'Priya Shah', activity: 'cooking' }, onClose() {} }));
  assert.equal(attr(coachHome.nodes(), 'data-boost-profile').length, 0);
});

test('a coach on the rail gets a round face in the coach\'s colour, not the facet', () => {
  const d = driveBoost({ name: 'Maya Okafor', activity: 'workout', role: 'trainer' });
  const nodes = d.nodes();
  assert.equal(nodes.filter(named('BSFacetAvatar')).length, 0);
  const ring = nodes.find((n) => n.type === 'span' && n.props.style && n.props.style.borderRadius === '50%' && /c0533b/.test(String(n.props.style.border)));
  assert.ok(ring, 'a trainer\'s round face in rust');
});

// Toasts are a no-op app-wide (BSToastHost), so the sheet says it on itself too, in the note's place.
const noteOf = (d) => attr(d.nodes(), 'data-boost-note')[0];

test('signed out, a cheer says to join and sends nothing; a demo member says boosts reach real members', async () => {
  let app = withApp({ signedIn: false });
  try {
    const d = driveBoost({ name: 'Priya Shah', activity: 'workout' });
    assert.equal(noteOf(d).props['aria-live'], 'polite', 'what the sheet says back is announced');
    cheersOf(d)[0].props.onClick();
    await settle();
    d.render();
    assert.deepEqual(app.toasts, [['Join Shape to send live boosts', 'info']]);
    assert.equal(textOf(noteOf(d)).trim(), 'Join Shape to send live boosts', 'the sheet says it, not only a silent toast');
    assert.equal(noteOf(d).props.style.color, THEME.INK);
    assert.equal(app.sent.length, 0);
  } finally { app.restore(); }
  app = withApp({ signedIn: true });
  try {
    const d = driveBoost({ name: 'Priya Shah', activity: 'workout' });
    cheersOf(d)[1].props.onClick();
    await settle();
    d.render();
    assert.deepEqual(app.toasts, [["Demo member — boosts reach real members when they're live.", 'info']]);
    assert.equal(textOf(noteOf(d)).trim(), "Demo member — boosts reach real members when they're live.");
    assert.equal(app.sent.length, 0);
  } finally { app.restore(); }
});

test('a cheer to a real member sends a live_boost DM, then the sent moment shows and the sheet closes itself', async () => {
  const app = withApp({ signedIn: true });
  try {
    const d = driveBoost({ name: 'Priya Shah', activity: 'workout', userId: 'u-priya' });
    cheersOf(d)[0].props.onClick();
    d.render();
    assert.equal(cheersOf(d)[0].props.style.animation.split(' ')[0], 'bsBoostPop', 'the tapped pill pops');
    assert.equal(cheersOf(d)[1].props.disabled, true, 'the rest hold while it sends');
    await settle(); await settle();
    d.render();
    assert.deepEqual(app.sent, [{ conversationId: 'conv-u-priya', body: "Let's go!", metadata: { kind: 'live_boost', activity: 'workout' } }]);
    assert.deepEqual(app.toasts, [['Boost sent → {name}', 'ok']]);
    const [moment] = attr(d.nodes(), 'data-boost-sent');
    assert.ok(moment, 'no sent moment');
    assert.equal(moment.props.role, 'status');
    assert.match(textOf(moment), /Sent to \{name\}/);
    assert.match(textOf(moment), /“Let's go!”/);
    // The cheers and the field hold their place under it, hidden, so the sheet keeps its height.
    const [body] = attr(d.nodes(), 'data-boost-body');
    assert.equal(body.props.style.visibility, 'hidden');
    assert.equal(body.props['aria-hidden'], 'true');
    assert.ok(cheersOf(d).every((p) => p.props.disabled), 'a hidden cheer could still send');
    assert.equal(d.nodes().find((n) => n.type === 'input').props.disabled, true);
    assert.equal(sendOf(d).props.disabled, true);
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(d.calls.closed, 1, 'the sheet closes itself after the moment');
  } finally { app.restore(); }
});

test('the field sends its own words; a failed send says so and leaves the sheet as it was', async () => {
  const app = withApp({ signedIn: true, send: async () => { throw new Error('offline'); } });
  try {
    const d = driveBoost({ name: 'Priya Shah', activity: 'workout', userId: 'u-priya' });
    d.nodes().find((n) => n.type === 'input').props.onChange({ target: { value: '  Last set, go!  ' } });
    d.render();
    sendOf(d).props.onClick();
    d.render();
    assert.equal(sendOf(d).props.style.background, TEAL, 'Send holds its light while its words go');
    assert.equal(textOf(sendOf(d)), '…');
    await settle(); await settle();
    d.render();
    assert.equal(app.sent[0].body, 'Last set, go!', 'the words go trimmed');
    assert.deepEqual(app.toasts, [['Could not send — try again', 'err']]);
    assert.equal(textOf(noteOf(d)).trim(), 'Could not send — try again', 'the sheet says the send failed');
    assert.equal(attr(d.nodes(), 'data-boost-sent').length, 0);
    assert.equal(attr(d.nodes(), 'data-boost-body')[0].props.style, undefined, 'the cheers and field stay shown');
    assert.equal(cheersOf(d).length, 5);
    assert.equal(cheersOf(d)[0].props.disabled, false, 'the cheers are tappable again');
    assert.equal(d.nodes().find((n) => n.type === 'input').props.value, '  Last set, go!  ', 'the words stay in the field');
    // Enter in the field sends too.
    d.nodes().find((n) => n.type === 'input').props.onKeyDown({ key: 'Enter' });
    await settle(); await settle();
    assert.equal(app.sent.length, 2);
  } finally { app.restore(); }
});

test('under reduced motion nothing moves: no animation is set and the CSS backstop stops the rest', () => {
  const saved = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({ matches: /prefers-reduced-motion: reduce/.test(q) });
  try {
    const d = driveBoost({ name: 'Priya Shah', activity: 'workout' });
    d.nodes().find((n) => n.type === 'input').props.onChange({ target: { value: 'Go' } });
    d.render();
    const moving = d.nodes().filter((n) => n.props && n.props.style && n.props.style.animation);
    assert.deepEqual(moving.map((n) => n.props.style.animation), []);
    assert.equal(attr(d.nodes(), 'data-boost-pulse').length, 0, 'no pulse ring at all');
    assert.equal(attr(d.nodes(), 'data-boost-dot').length, 1, 'the dot still says live');
  } finally { globalThis.matchMedia = saved; }
  const src = stripComments(readFileSync(BOOST_SRC, 'utf8'));
  assert.match(src, /@media \(prefers-reduced-motion: reduce\) \{\n\s+\.bs-boost, \.bs-boost \* \{ animation: none !important; transition: none !important; \}/);
});

test('the module rules: its own translator, window globals read at call time, no import back into the client', () => {
  const src = stripComments(readFileSync(BOOST_SRC, 'utf8'));
  assert.match(src, /function useShapeTr\(\)/);
  assert.ok(!/from '\.\/iosAppBroadsheetClient/.test(src), 'a feature module never imports the client');
  assert.match(src, /export function BSLiveBoostSheet\(\{ person, onClose, onOpenProfile \}\) \{\n\s+const \{ useBS, BSFacetAvatar, bsInitials \} = window;/);
  // The client imports it and keeps the window global the Pros bundle opens it through.
  const client = readFileSync(SRC, 'utf8');
  assert.match(client, /^import \{ BSLiveBoostSheet \} from '\.\/BSLiveBoost\.jsx';$/m);
  assert.match(client, /^ {2}BSLiveBoostSheet,$/m);
  assert.ok(!/function BSLiveBoostSheet\(/.test(client), 'the old sheet is still in the client');
  // It portals into the phone surface.
  assert.match(src, /document\.getElementById\('bs-phone-surface'\) \|\| document\.body/);
  // Every word on it goes through the translator, in all thirteen catalogs (i18n-catalog-complete holds parity).
  const en = JSON.parse(readFileSync(join(ROOT, 'mobile-app', 'src', 'i18n', 'catalogs', 'en', 'feed.json'), 'utf8'));
  const keys = [...src.matchAll(/tr\('feed:(boost\.[\w.]+)'/g), ...src.matchAll(/\['feed:(boost\.[\w.]+)'/g)].map((m) => m[1]);
  assert.ok(keys.length >= 20, `only ${keys.length} boost keys read`);
  for (const k of keys) assert.ok(k in en, `feed:${k} is missing from en`);
  const authored = Object.keys(en).filter((k) => k.startsWith('boost.'));
  for (const k of authored) assert.ok(keys.includes(k), `feed:${k} is authored but nothing reads it`);
});
