// Schedule step 4 (2026-10-07): the app books THROUGH THE SERVER.
//
// ⚠ TWO APP PATHS WROTE AROUND IT. A member's intro inserted its own `requested` row (no open
// hours, no notice to the coach, no invite), and a coach's "Book a session" saved a NOTE on the
// client's calendar instead of a session, so it never reached the website's Schedule, held no
// time, and gave the client nothing to join. The intro side is driven in
// tests/schedule-step3.test.mjs and the route in tests/schedule-step2.test.mjs; this file
// drives the shipped coach screen and pins the profile's "Book intro" hand-off.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, SHIM, THEME, drive, flatten, textOf } from './helpers/broadsheet-mount.mjs';

const require_ = createRequire(import.meta.url);
const babel = require_('next/dist/compiled/babel/core');
const presetReact = require_('next/dist/compiled/babel/preset-react');
const PROS = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx'), 'utf8');
const tick = () => new Promise((r) => setImmediate(r));

// 10:00 on 7 Oct 2026 on the runner's own clock, so "already gone today" is the same times in
// any runner zone (the screen reads the device's clock, as the phone does).
const NOW = new Date(2026, 9, 7, 10, 0, 0).getTime();
class PinnedDate extends Date {
  constructor(...a) { if (a.length) super(...a); else super(NOW); }
  static now() { return NOW; }
}

function loadScreen(win, now = NOW) {
  class AtDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(now); }
    static now() { return now; }
  }
  const start = PROS.indexOf('function BSProScheduleSession(');
  const end = PROS.indexOf('\nfunction BSProAssignPage(', start);
  assert.ok(start > 0 && end > start, 'the coach booking screen must stay where this harness reads it');
  const { code } = babel.transformSync(PROS.slice(start, end) + '\nthis.Screen = BSProScheduleSession;', { presets: [presetReact], babelrc: false, configFile: false });
  const pass = ({ children }) => SHIM.createElement('div', null, children);
  const tr = (k, o = {}) => String(o.defaultValue ?? k).replace(/\{(\w+)\}/g, (m, n) => (n in o ? String(o[n]) : m));
  const ctx = {
    React: SHIM, window: win, Date: AtDate, Intl, setTimeout: () => 0,
    useBS: () => THEME, useShapeTr: () => tr, useBSProClientHeat: () => '#c0533b', useStateBSP: SHIM.useState,
    BSPage: pass, BSFooter: () => null, BSProActionHead: () => null, BSProClientMini: () => null, BSProActionSec: () => null,
    // The chips and the segment are the module's own components; the tests pick through their onPick.
    BSProChips: (p) => SHIM.createElement('div', p), BSProSegment: (p) => SHIM.createElement('div', p),
  };
  vm.runInNewContext(code, ctx);
  return ctx.Screen;
}
const pick = (d, key, value) => {
  const el = flatten(d.nodes()).find((n) => n.props && Array.isArray(n.props.options) && n.props.options.some((o) => o.k === key));
  assert.ok(el, 'no picker offering ' + key);
  el.props.onPick(value ?? key);
  d.render();
};

test('app coach: "Book a session" books a real, confirmed session through the server', async () => {
  const calls = [];
  const notes = [];
  const win = {
    // A plain copy: the screen runs in its own realm, so its objects carry that realm's prototype.
    ShapeSessions: { createCoachSession: async (b) => { calls.push(JSON.parse(JSON.stringify(b))); return { ok: true, session: { id: 's-1' } }; } },
    ShapeCalendar: { create: async (b) => { notes.push(b); return {}; } },
  };
  const Screen = loadScreen(win);
  const d = drive(Screen, { client: { n: 'Priya Shah' }, role: 'trainer', clientUid: 'member-1', onBack() {} });
  // The times gone today can't be picked.
  const btn = (label) => d.buttons().find((b) => b.label === label);
  assert.equal(btn('9:00').disabled, true, '9:00 has passed at 10:00');
  assert.equal(btn('11:30').disabled, false);
  assert.ok(!d.text.includes('Open slots'), 'a fixed list of times is not "open slots"');
  d.click('11:30');
  d.click('Add to calendar');
  await tick(); await tick();
  assert.equal(notes.length, 0, 'a calendar note was written instead of a session');
  assert.equal(calls.length, 1);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  assert.deepEqual(calls[0], { role: 'trainer', clientId: 'member-1', date: '2026-10-07', time: '11:30', tz: zone, durationMin: 45, type: 'video', topic: 'Session' });

  // Booked, the screen says so and goes back; it does not book twice.
  d.render();
  assert.equal(btn('Added ✓').disabled, true);

  // The mode picks the session's type; a gym session is in person, and says where. A fresh
  // screen each time, as the coach would open it.
  const book = async (picks, time) => {
    const s = drive(Screen, { client: { n: 'Priya Shah' }, role: 'trainer', clientUid: 'member-1', onBack() {} });
    for (const [k, v] of picks) pick(s, k, v);
    s.click(time);
    s.click('Add to calendar');
    await tick(); await tick();
    return calls[calls.length - 1];
  };
  const gym = await book([['gym'], ['checkin']], '14:00');
  assert.equal(gym.type, 'inperson');
  assert.equal(gym.topic, 'Check-in · Gym');
  assert.equal(gym.time, '14:00');
  assert.equal((await book([['call']], '16:00')).type, 'phone');
  assert.equal((await book([['inperson']], '16:00')).topic, 'Session', 'only the gym is named; "in person" is the type');
  assert.equal((await book([[60, 60]], '18:30')).durationMin, 60);
});

test('app coach: a refusal is shown in the route\'s own words, and a demo client books nothing', async () => {
  const win = { ShapeSessions: { createCoachSession: async () => { throw new Error('That overlaps Marcus T. at 11:30 AM. Pick another time.'); } } };
  const Screen = loadScreen(win);
  const d = drive(Screen, { client: { n: 'Priya Shah' }, role: 'trainer', clientUid: 'member-1', onBack() {} });
  d.click('11:30');
  d.click('Add to calendar');
  await tick(); await tick();
  d.render();
  assert.ok(d.text.includes('That overlaps Marcus T. at 11:30 AM. Pick another time.'), d.text.slice(-300));

  let called = 0;
  const demo = loadScreen({ ShapeSessions: { createCoachSession: async () => { called += 1; } } });
  const dd = drive(demo, { client: { n: 'Demo' }, role: 'trainer', clientUid: null, onBack() {} });
  dd.click('11:30');
  dd.click('Add to calendar');
  await tick(); await tick();
  assert.equal(called, 0, 'a demo client is never booked');
});

test('app coach: the screen opens on a time still ahead, and never sends one already gone', async () => {
  // Codex, #2233: opened after 9:00 it sat on 9:00, disabled but selected, and the first Add was refused.
  const calls = [];
  const win = { ShapeSessions: { createCoachSession: async (b) => { calls.push(JSON.parse(JSON.stringify(b))); return { ok: true }; } } };
  const pressed = (d) => d.nodes().filter((n) => n.type === 'button' && /1c$/.test(String(n.props.style && n.props.style.background))).map((n) => textOf(n).trim());
  const at10 = drive(loadScreen(win), { client: { n: 'Priya Shah' }, role: 'trainer', clientUid: 'member-1', onBack() {} });
  assert.deepEqual(pressed(at10), ['WED7', '11:30'], 'at 10:00 it opens today at 11:30');
  at10.click('Add to calendar');
  await tick(); await tick();
  assert.equal(calls[0].time, '11:30');
  assert.equal(calls[0].date, '2026-10-07');
  // At 19:00 every time today has gone: it opens tomorrow at the first time.
  const at19 = drive(loadScreen(win, new Date(2026, 9, 7, 19, 0, 0).getTime()), { client: { n: 'Priya Shah' }, role: 'trainer', clientUid: 'member-1', onBack() {} });
  assert.deepEqual(pressed(at19), ['THU8', '7:00']);
  // Back on today, the gone time is held but Add is off.
  at19.click('WED7');
  assert.equal(at19.buttons().find((x) => x.label === 'Add to calendar →').disabled, true);
  at19.click('THU8');
  assert.equal(at19.buttons().find((x) => x.label === 'Add to calendar →').disabled, false);
});

test('the listing\'s main "Book the intro" holds the coach\'s next PROJECTED time, never the preview pattern', () => {
  // Codex, #2233: both primary intro buttons booked a preview row, which has no instant and no
  // coach clock, so the server path refused every one.
  const listing = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx'), 'utf8');
  const fn = listing.slice(listing.indexOf('const openIntro = () => {'), listing.indexOf('const openMessage = () => {'));
  assert.match(fn, /if \(realAvail != null\) \{\s*const s = realAvail\[0\];\s*if \(!s\) \{ setShowCal\(true\); return; \}\s*nextOpen = \{ \.\.\.projSlotRow\(s\), coachDate: s\.coachDate, coachTime: s\.coachTime \};/);
  const iLive = fn.indexOf('realAvail != null'), iPreview = fn.indexOf('p.availability');
  assert.ok(iLive > 0 && iPreview > iLive, 'the preview pattern is reached before the live slots');
});

test('the profile\'s "Book intro" opens the listing\'s own calendar instead of booking with no time', () => {
  // It used to call submitConsultationBooking with no slot, which refuses ("Choose a valid
  // consultation time"), so the button failed every time it was pressed.
  const client = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
  const fn = client.slice(client.indexOf('const doBookIntro = async () => {'), client.indexOf('const doBookOneTime'));
  const iHand = fn.indexOf("if (commerce && typeof commerce.bookIntro === 'function') { commerce.bookIntro(); return; }");
  const iBook = fn.indexOf('submitConsultationBooking');
  assert.ok(iHand > 0 && iBook > iHand, 'the profile books before handing over to the listing calendar');
  const listing = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx'), 'utf8');
  assert.match(listing, /commerce: \{ coach, role: saleProviderRole, packages: p\.packages, bookIntro: \(\) => \{ setShowProfile\(false\); setShowCal\(true\); \} \}/,
    'the listing does not hand its calendar to the profile');
});
