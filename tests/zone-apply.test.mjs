// One clock per person, part 2 (P9, owner 2026-11-05): "all time zones should be set by user", and
// times from another person "should automatically update to their own timezone".
//
// Every surface part 2 put on the viewer's zone, driven for one viewer: an account set to Tokyo on a
// device whose clock is New York's. Each surface prints Tokyo's day and time; without shapeZone.mjs
// (window.ShapeZone) the website surfaces keep this device's clock, as before. Coach Today's rows
// keep the zone the route cut the day in (`dayZone`), which is someone's day on purpose.
process.env.TZ = 'America/New_York';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const Z = await import(pathToFileURL(join(ROOT, 'mobile-app/src/services/shapeZone.mjs')).href);
const TOKYO = 'Asia/Tokyo', NY = 'America/New_York';

// Thursday 5 November 2026, 10:30 in New York, is Friday 6 November, 00:30 in Tokyo.
const NOW = Date.parse('2026-11-05T15:30:00Z');
function atNow(fn) {
  const real = Date.now;
  Date.now = () => NOW;
  try { return fn(); } finally { Date.now = real; }
}
function asTokyo(fn) {
  Z.setAccountZone(TOKYO);
  try { return fn(); } finally { Z.clearAccountZone(); }
}
const lift = (src, from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to, a + from.length);
  assert.ok(a >= 0 && b > a, 'could not lift ' + from);
  return src.slice(a, b);
};

test('the device really is New York and the account really is Tokyo', () => {
  assert.equal(Z.deviceZone(), NY);
  asTokyo(() => assert.equal(Z.viewerZone(), TOKYO));
  assert.equal(Z.viewerZone(), NY, 'with no account zone, the device stands in');
});

// ── Coach Today, the week ahead and capacity (dashToday.jsx) ────────────────────────────────────
const babel = require('next/dist/compiled/babel/core'), preset = require('next/dist/compiled/babel/preset-react');
const shared = read('public/newdesign/dashData.jsx');
const todayCode = shared.slice(shared.indexOf('function dashCheckinReviewed('), shared.indexOf('// The unit a bound metric'))
  + babel.transformSync(read('public/newdesign/dashToday.jsx'), { presets: [preset] }).code;
const today = (win) => new Function('window', 'serif', 'sans', todayCode + ';return { dashFmtTime, dashCalDate, dashCalTime, dashCapacity, dashViewerToday, dashDayKeyFrom };')(win, 'serif', 'sans');

test('coach Today: the calendar prints on the viewer\'s clock, Today\'s rows on the day\'s own zone', () => {
  const on = today({ ShapeZone: Z }), off = today({});
  const iso = '2026-11-05T16:00:00Z';   // 11:00 Thursday in New York, 01:00 Friday in Tokyo
  asTokyo(() => {
    assert.equal(on.dashCalDate(iso), '2026-11-06');
    assert.equal(on.dashCalTime(iso), '01:00');
    assert.equal(on.dashFmtTime(iso), '01:00', 'no zone: the viewer\'s');
    assert.equal(on.dashFmtTime(iso, NY), '11:00', 'Today\'s rows keep the zone the route cut the day in');
    assert.equal(on.dashFmtTime(iso, 'Not/AZone'), '01:00', 'an unreadable zone prints the viewer\'s');
    const t = atNow(() => on.dashViewerToday());
    assert.deepEqual([t.getFullYear(), t.getMonth() + 1, t.getDate()], [2026, 11, 6], 'the week ahead starts on Tokyo\'s Friday');
    assert.equal(atNow(() => on.dashDayKeyFrom(TOKYO, -1)), '2026-11-05');
  });
  // Without shapeZone.mjs: this device's clock, as before.
  assert.equal(off.dashCalDate(iso), '2026-11-05');
  assert.equal(off.dashCalTime(iso), '11:00');
  assert.equal(off.dashFmtTime(iso), '11:00');
});

test('coach Today: capacity walks the account\'s days and clock, not this browser\'s', () => {
  const on = today({ ShapeZone: Z }), off = today({});
  // Open Friday 9:00 to 11:00 in Tokyo; a 30-minute session at 9:30 Tokyo time.
  const slots = [{ weekday: 5, start_minute: 540, duration_min: 120 }];
  const events = [{ kind: 'SESSION', scheduledAt: '2026-11-06T00:30:00Z', durationMin: 30 }];
  const out = asTokyo(() => on.dashCapacity(events, slots, new Date(NOW), TOKYO));
  assert.equal(out.days[0].date, '2026-11-06', 'today is Tokyo\'s Friday');
  assert.equal(out.available, 120);
  assert.equal(out.booked, 30);
  assert.deepEqual(out.days[0].free, [[540, 570], [600, 660]], 'the free time reads on Tokyo\'s clock');
  // The browser's walk, as before: Thursday first, and Friday 9:00 is New York's.
  const local = off.dashCapacity(events, slots, new Date(NOW), TOKYO);
  assert.equal(local.days[0].date, '2026-11-05');
  assert.notDeepEqual(local.days[1].free, out.days[0].free);
  // And a clock-change day stays exact on the zone's own clock (New York, 1 November 2026).
  const fall = on.dashCapacity([{ kind: 'SESSION', scheduledAt: '2026-11-01T01:30:00-04:00', durationMin: 90 }], [{ weekday: 0, start_minute: 0, duration_min: 240 }], new Date(Date.parse('2026-11-01T04:00:00Z')), NY);
  assert.equal(fall.available, 300);
  assert.equal(fall.booked, 90);
  assert.equal(fall.days[0].clockChange, true);
  // The panel compares the saved hours' zone with the account's, and says which is which.
  const panel = lift(read('public/newdesign/dashToday.jsx'), 'function DashCapacityPanel(', '\n}\n');
  assert.match(panel, /const zone = Z \? Z\.viewerZone\(\)/);
  assert.match(panel, /dashCapacity\(read\.data\[0\]\.events,read\.data\[1\]\.slots,new Date\(\),zone\)/);
  assert.doesNotMatch(panel, /this browser's time zone/);
  assert.match(panel, /"Your working hours are saved in " \+ label\(hoursZone\) \+ ", not your time zone \("/);
});

// ── Coach Week and Schedule ─────────────────────────────────────────────────────────────────────
test('coach Week: "this week" is the week on the coach\'s own calendar', () => {
  const src = read('public/newdesign/dashWeek.jsx');
  const fns = lift(src, 'function dwkIso(', 'function dwkFmt(');
  // Sunday 8 November, 20:00 in New York, is Monday 9 November in Tokyo.
  const sunday = Date.parse('2026-11-09T01:00:00Z');
  const make = (win) => new Function('window', fns + ';return () => dwkIso(dwkMonday(dwkToday()));')(win);
  const real = Date.now;
  Date.now = () => sunday;
  try {
    asTokyo(() => assert.equal(make({ ShapeZone: Z })(), '2026-11-09', 'Tokyo is already in the new week'));
  } finally { Date.now = real; }
  assert.match(src, /const thisMonday = dwkIso\(dwkMonday\(dwkToday\(\)\)\);/);
});

test('coach Schedule: the hours editor names the account\'s zone as Settings does', () => {
  const fn = lift(read('public/newdesign/dashSchedule.jsx'), 'function dscZoneLabel(', '// This browser\'s IANA zone.');
  const label = (win, live, stored) => new Function('window', 'dscBrowserZone', fn + ';return dscZoneLabel;')(win, () => NY)(live, stored);
  asTokyo(() => {
    assert.equal(label({ ShapeZone: Z }, true, TOKYO), 'times in ' + Z.zoneLabel(TOKYO) + ', your time zone');
    assert.equal(label({ ShapeZone: Z }, true, null), 'times will be saved in ' + Z.zoneLabel(TOKYO), 'before the first save: the account\'s, not the browser\'s');
    assert.equal(label({ ShapeZone: Z }, false, TOKYO), '', 'the preview names no zone');
  });
  assert.equal(label({}, true, null), 'times will be saved in ' + NY, 'without shapeZone.mjs, the browser\'s, as before');
});

// ── Booking slots (bookingSlots.js) and the pages that list them ────────────────────────────────
test('booking slots print and group on the member\'s own clock', () => {
  const B = require('../public/newdesign/bookingSlots.js');
  const iso = '2026-11-06T00:30:00Z';   // 9:30 Friday in Tokyo, 7:30 PM Thursday in New York
  globalThis.ShapeZone = Z;
  try {
    asTokyo(() => {
      assert.equal(B.slotLabel(iso, 'en-US'), '9:30 AM');
      assert.equal(B.dayLabel(iso, 'en-US'), 'Fri, Nov 6');
      assert.deepEqual(B.groupByDay([{ iso }, { iso: '2026-11-05T14:00:00Z' }], 'en-US').map((g) => g.day), ['Fri, Nov 6', 'Thu, Nov 5']);
      assert.equal(B.slotLabel(iso, 'en-US', NY), '7:30 PM', 'a caller that names a zone gets it');
    });
  } finally { delete globalThis.ShapeZone; }
  assert.equal(B.slotLabel(iso, 'en-US'), '7:30 PM', 'without shapeZone.mjs, the device\'s, as before');
  assert.equal(B.dayLabel(iso, 'en-US'), 'Thu, Nov 5');
});

test('the marketplace\'s next open time reads "Today" and the time on the member\'s clock', () => {
  const fn = lift(read('public/newdesign/marketplace.jsx'), 'function mkSlotText(', 'function mkWithinWeek(');
  const make = (win) => new Function('window', fn + ';return mkSlotText;')(win);
  const slot = { ms: Date.parse('2026-11-06T14:30:00Z') };   // 23:30 Friday Tokyo, 9:30 Friday New York
  atNow(() => {
    asTokyo(() => assert.match(make({ ShapeZone: Z })(slot), /^Today · 11:30/));
    assert.match(make({})(slot), /^Tomorrow · 9:30/, 'without shapeZone.mjs, the device\'s day and clock');
  });
});

test('a coach\'s Day tab lays its days out on the viewer\'s midnights', async () => {
  const K = await import(pathToFileURL(join(ROOT, 'public/newdesign/coachProfileKit.mjs')).href);
  const B = require('../public/newdesign/bookingSlots.js');
  const start = Date.parse(B.isoForSlot('2026-11-06', 0, TOKYO)), end = Date.parse(B.isoForSlot('2026-11-07', 0, TOKYO));
  const open = [{ iso: '2026-11-06T00:30:00Z', ms: Date.parse('2026-11-06T00:30:00Z') }, { iso: '2026-11-06T16:00:00Z', ms: Date.parse('2026-11-06T16:00:00Z') }];
  const day = new Date(2026, 10, 6, 12);
  const zoned = K.bsCoachDayRows({ open, busy: [], day, now: NOW, start, end });
  assert.deepEqual(zoned.map((r) => r.at), [open[0].ms], 'Tokyo\'s Friday holds 9:30 and not Saturday 1:00');
  const local = K.bsCoachDayRows({ open, busy: [], day, now: NOW });
  assert.deepEqual(local.map((r) => r.at), [open[1].ms], 'without bounds, the device\'s Friday, as before');
  const tab = lift(read('public/newdesign/coachProfileWeb.jsx'), 'function CpwDayTab(', '\n  let body;');
  assert.match(tab, /K\.bsCoachDayRows\(\{ open, busy: avail\.busy, day: picked, now, \.\.\.boundsOf\(picked\) \}\)/);
  assert.match(tab, /toLocaleTimeString\(undefined, \{ hour: "numeric", minute: "2-digit", \.\.\.\(vz \? \{ timeZone: vz \} : \{\}\) \}\)/);
  assert.match(tab, /const today = \(\(\) => \{ const p = Z \? Z\.partsInZone\(Date\.now\(\), vz\) : null;/);
});

test('the member\'s booking sheet names the zone its times are in', () => {
  const src = read('public/newdesign/clientTeam.jsx');
  assert.match(src, /const zoneName = \(\(\) => \{ try \{ const Z = window\.ShapeZone; return Z && Z\.zoneLabel \? Z\.zoneLabel\(Z\.viewerZone\(\)\) : ""; \}/);
  assert.match(src, /"Times are shown in your time zone, " \+ zoneName \+ "\."/);
  assert.doesNotMatch(src, /Times are shown in your timezone\./);
});

test('the coach directory and the profile page load shapeZone.mjs, on the same key as the Settings pages', () => {
  const TAG = /<script type="module">import \* as TZ from "\/newdesign\/shapeZone\.mjs\?v=(\d{8}[a-z]*)"; window\.ShapeZone = TZ;<\/script>/;
  const key = TAG.exec(read('public/newdesign/TrainerApp.html'))[1];
  for (const page of ['Coaches.html', 'MemberProfile.html']) {
    const html = read('public/newdesign/' + page);
    const m = TAG.exec(html);
    assert.ok(m, page + ' does not load shapeZone.mjs');
    assert.equal(m[1], key, page + ' asks for another copy of shapeZone.mjs');
    assert.ok(m.index < html.indexOf('<script type="text/babel"'), page + ' loads the zone after the scripts that read it');
  }
});

test('website quiet hours and reminders are kept in the account\'s zone', () => {
  const coach = read('public/newdesign/coachSettings.jsx'), member = read('public/newdesign/clientMeSettings.jsx');
  const cstTz = new Function('window', lift(coach, 'function cstTz()', '\nfunction ') + ';return cstTz;');
  const remTz = new Function('window', lift(member, 'function remTz()', '\nfunction ') + ';return remTz;');
  asTokyo(() => {
    assert.equal(cstTz({ ShapeZone: Z })(), TOKYO);
    assert.equal(remTz({ ShapeZone: Z })(), TOKYO);
  });
  assert.equal(cstTz({})(), NY, 'without shapeZone.mjs, the browser\'s');
  assert.equal(remTz({})(), NY);
  assert.match(member, /const tz = remTz;/, 'the member\'s quiet hours write the same zone as reminders');
});

// ── The app ─────────────────────────────────────────────────────────────────────────────────────
test('the app\'s session list prints each session on the member\'s own clock, in the app\'s language', () => {
  const src = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  const fn = lift(src, 'function _bsFormatSessionWhen(', '\n}\n') + '\n}';
  const make = (locale) => new Function('bsDateLocale', 'bsZoneFormatDate', 'bsZoneFormatTime', fn + ';return _bsFormatSessionWhen;')(() => locale, Z.formatDate, Z.formatTime);
  const iso = '2026-11-06T00:30:00Z';
  asTokyo(() => {
    assert.equal(make('en-US')(iso).replace(/\u202f/g, ' '), 'Nov 6 · 9:30 AM');
    assert.equal(make('de')(iso), '6. Nov. · 09:30');
  });
  assert.equal(make('en-US')(iso).replace(/\u202f/g, ' '), 'Nov 5 · 7:30 PM', 'with no account zone, the device\'s');
  assert.equal(make('en-US')('not a time'), '');
  // A screen that stays mounted reprints when the zone lands or changes.
  assert.match(src, /React\.useEffect\(\(\) => bsOnZoneChange\(\(\) => setZoneTick\(\(n\) => n \+ 1\)\), \[\]\);/);
});

test('the app\'s projected open times are keyed on the member\'s calendar and clock', async () => {
  const { bsProjectAvailability } = await import(pathToFileURL(join(ROOT, 'mobile-app/src/services/coachAvailability.mjs')).href);
  // A New York coach open Monday 10:00 (EST): 15:00Z, which is 00:00 Tuesday in Tokyo.
  const args = { slots: [{ weekday: 1, start_minute: 600, duration_min: 60 }], weeks: 1, now: new Date(NOW), zone: NY, sessionMin: 60 };
  const tokyo = asTokyo(() => bsProjectAvailability(args));
  assert.equal(tokyo.length, 1);
  assert.equal(tokyo[0].at, Date.parse('2026-11-09T15:00:00Z'));
  assert.deepEqual([tokyo[0].iso, tokyo[0].weekday, tokyo[0].time], ['2026-11-10', 2, '00:00']);
  assert.deepEqual([tokyo[0].coachDate, tokyo[0].coachTime], ['2026-11-09', '10:00'], 'the coach\'s own wall clock is unchanged');
  const device = bsProjectAvailability(args);
  assert.deepEqual([device[0].iso, device[0].weekday, device[0].time], ['2026-11-09', 1, '10:00'], 'no account zone: the device\'s, as before');
  assert.equal(bsProjectAvailability({ ...args, viewZone: TOKYO })[0].time, '00:00', 'a caller may name the viewer\'s zone');
});

test('the app sends the account\'s zone for the calendar, the coach\'s hours, quiet hours and reminders', () => {
  const backend = read('mobile-app/src/services/shapeBackend.js');
  const viewer = () => TOKYO;
  const cal = new Function('viewerZone', lift(backend, 'function calendarTimeZone()', 'async function listCalendar(') + ';return calendarTimeZone;')(viewer);
  const hours = new Function('viewerZone', lift(backend, 'function coachHoursZone()', 'window.ShapeCoachHours = {') + ';return coachHoursZone;')(viewer);
  const quiet = new Function('viewerZone', lift(backend, 'function _accountTz()', '// The device\'s LOCAL calendar day') + ';return _accountTz;')(viewer);
  assert.equal(cal(), TOKYO);
  assert.equal(hours(), TOKYO);
  assert.equal(quiet(), TOKYO);
  assert.doesNotMatch(backend, /_deviceTz\(\)|deviceTimeZone\(\)/, 'a device-zone write is left');
  assert.match(backend, /qs\.set\('tz', calendarTimeZone\(\)\);/);
  assert.match(backend, /const row = \{ user_id: state\.user\.id, tz: _accountTz\(\),/);
});

test('the app\'s hours page names the account\'s zone and previews times on it', () => {
  const src = read('mobile-app/src/broadsheet/BSCoachHours.jsx');
  assert.match(src, /const zoneName = \(z\) => zoneLabel\(z\) \|\| z;/);
  assert.match(src, /tr\('coach:hours\.zone', \{ defaultValue: 'Times in \{zone\}', zone: zoneName\(zone\) \}\)/);
  assert.match(src, /hour: 'numeric', minute: '2-digit', timeZone: viewerZone\(\) \}\)/);
  assert.match(src, /Set your time zone in Settings to fix it\./);
  const profile = read('mobile-app/src/broadsheet/BSTrainerProfile.jsx');
  assert.match(profile, /const fmtTime = \(ms\) => \{ try \{ return new Date\(ms\)\.toLocaleTimeString\(locale, \{ hour: 'numeric', minute: '2-digit', timeZone: vz \}\);/);
  const market = read('mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx');
  assert.match(market, /const today = \(\(\) => \{ const p = partsInZone\(Date\.now\(\), viewerZone\(\)\);/);
});

test('the copy that said "device" or "this phone" now says the account, in all 13 languages', () => {
  const LOCALES = ['de', 'en', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi'];
  const seen = { toSub: new Set(), noZone: new Set() };
  for (const l of LOCALES) {
    const s = JSON.parse(read(`mobile-app/src/i18n/catalogs/${l}/settings.json`));
    const c = JSON.parse(read(`mobile-app/src/i18n/catalogs/${l}/coach.json`));
    assert.ok(s['notifyPrefs.toSub'] && c['hours.previewNoZone'], l + ' is missing a string');
    seen.toSub.add(s['notifyPrefs.toSub']); seen.noZone.add(c['hours.previewNoZone']);
  }
  assert.equal(seen.toSub.size, 13, 'two locales share a string: one is untranslated');
  assert.equal(JSON.parse(read('mobile-app/src/i18n/catalogs/en/settings.json'))['notifyPrefs.toSub'], "Uses your account's time zone");
  assert.equal(seen.noZone.size, 13);
  for (const v of seen.noZone) assert.doesNotMatch(v, /this phone|from this phone|diesem Telefon|ce téléphone|este teléfono|questo telefono|ponsel ini|bu telefondan|deste celular|wannan wayar|этого телефона|цього телефона|điện thoại này/i);
});
