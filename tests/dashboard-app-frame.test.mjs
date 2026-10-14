import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

// Owner, 2026-10-14: "make it feel more like its own portal … more like a software or
// application", then, from three previews: "i like option B. Have that nav bar collapse to
// just that [icon] view, and then when you hover over, the full name of each page appears,
// like how A looks … I like the coaching and practice seperation on nav", and "have this
// update in dashboard apply to members as well".
const require = createRequire(import.meta.url);
const babel = require('next/dist/compiled/babel/core');
const preset = require('next/dist/compiled/babel/preset-react');
const read = (f) => readFileSync(new URL('../public/newdesign/' + f, import.meta.url), 'utf8');
const SHELL = read('pageShell.jsx');
const CHROME = read('trainerDashboard.jsx');
const TODAY = read('dashToday.jsx');
const CLIENT = read('dashClient.jsx');
const PROFILE = read('livingProfilePage.jsx');
const CLIENT_APP = read('ClientApp.html');
const CSS = read('dash.css').replace(/\/\*[\s\S]*?\*\//g, '');
const compile = (src) => babel.transformSync(src, { presets: [preset], babelrc: false, configFile: false }).code;
const body = (src, start, end) => {
  const a = src.indexOf(start);
  assert.ok(a >= 0, 'could not find ' + start);
  const b = src.indexOf(end, a + start.length);
  assert.ok(b > a, 'could not find the end of ' + start);
  return src.slice(a, b);
};

// ── the frame ───────────────────────────────────────────────────────────────
test('every dashboard frame is DashFrame, and none renders the site header or footer itself', () => {
  const sites = [
    ['DashPage', body(CHROME, 'function DashPage(', '\n}\n')],
    ['DashShell', body(CHROME, 'function DashShell(', '\nfunction Sparkline(')],
    ['ClientDashboardPage', body(CLIENT, 'function ClientDashboardPage(', '\nObject.assign(window')],
    ['the living profile in a shell', body(PROFILE, 'const wrapShell = ', ');\n')],
    ['ClientApp Settings', body(CLIENT_APP, 'function ClientSettingsPage(', '\n}\n')],
  ];
  for (const [name, src] of sites) {
    assert.match(src, /<DashFrame\b/, name + ' no longer renders inside DashFrame');
    assert.doesNotMatch(src, /<Header\b/, name + ' renders the site header itself — the frame already does, as the app bar');
    assert.doesNotMatch(src, /<Footer\b/, name + ' renders the site footer — the dashboard has none');
    assert.doesNotMatch(src, /<DashSidebar\b/, name + ' renders the rail outside the frame');
  }
  const frame = body(CHROME, 'function DashFrame(', '\n}\n');
  assert.equal((frame.match(/<Header \/>/g) || []).length, 1, 'the frame renders the header once, as its app bar');
  assert.match(frame, /<DashSidebar navItems=\{navItems\} payoutCard=\{payoutCard\} \/>/);
  assert.match(CHROME, /Object\.assign\(window, \{[^}]*\bDashFrame\b/, 'DashFrame is not exported for dashClient / livingProfilePage / ClientApp');
});

test('the app bar is the site header restyled, keyed on hooks the header still renders', () => {
  const header = body(SHELL, 'function Header({', 'function HeroBg(');
  assert.match(header, /className="shape-nav-logo"/, 'the logo lost the class the frame hides it by');
  assert.match(header, /<a className="shape-nav-dash" href=\{dashboardHref\(authUser\.role\)\} style=\{ctaBtn\}>Dashboard<\/a>/, 'the Dashboard button lost the class the frame hides it by');
  for (const hook of ['shape-nav-tabs', 'shape-nav-hi', 'shape-nav-logo', 'shape-nav-dash']) {
    assert.match(CSS, new RegExp('\\.dash-appbar \\.' + hook + '[^{]*\\{[^}]*display: none !important'), hook + ' is not hidden in the app bar');
  }
  assert.match(CSS, /\.dash-appbar \.shape-header \{[^}]*position: relative !important/, 'the header is still fixed inside the frame');
  assert.match(CSS, /\.dash-appbar \.shape-header-spacer \{ display: none !important; \}/, 'the header spacer still pushes the page down inside the frame');
});

test('the rail is a 64px column whose panel widens over the page, by hover or keyboard focus', () => {
  assert.match(CSS, /\.dash-app \{[^}]*grid-template-columns: 64px minmax\(0, 1fr\)/);
  assert.match(CSS, /\.dash-rail-panel \{[^}]*position: absolute;[^}]*width: 64px/, 'the panel must float, or the page reflows on every hover');
  assert.match(CSS, /\.dash-rail:hover \.dash-rail-panel, \.dash-rail:has\(:focus-visible\) \.dash-rail-panel \{\s*width: 240px/);
  // A phone keeps every tab: below 900px the rail is a row, and no rule hides it.
  const phone = CSS.slice(CSS.indexOf('@media (max-width: 900px)', CSS.indexOf('.dash-app {')));
  assert.match(phone, /\.dash-rail-panel[^{]*\{[^}]*flex-direction: row/);
  assert.doesNotMatch(phone.slice(0, phone.indexOf('\n}\n')), /\.dash-rail(-panel)? \{[^}]*display: none/);
});

test('the rail groups tabs into Coaching / Practice (Training / Progress for members), with the account pair at its foot', () => {
  const src = body(CHROME, 'const DASH_RAIL_GROUPS = {', '\n// The rail.');
  const dashRailGroups = new Function(compile(src) + '\nreturn dashRailGroups;')();
  const nav = (slugs) => slugs.map((slug) => ({ label: slug[0].toUpperCase() + slug.slice(1), slug }));
  const shape = (r) => [r.groups.map((g) => [g.label, g.items.map((n) => n.slug)]), r.foot.map((n) => n.slug)];
  assert.deepEqual(shape(dashRailGroups(nav(['today', 'week', 'schedule', 'clients', 'programs', 'business', 'playlists', 'goal', 'score', 'profile', 'settings']), 'trainer')),
    [[['Coaching', ['today', 'week', 'schedule', 'clients', 'programs', 'playlists']], ['Practice', ['business', 'goal', 'score']]], ['profile', 'settings']]);
  assert.deepEqual(shape(dashRailGroups(nav(['today', 'week', 'schedule', 'clients', 'plans', 'business', 'playlists', 'goal', 'score', 'profile', 'settings']), 'nutritionist'))[0][0],
    ['Coaching', ['today', 'week', 'schedule', 'clients', 'plans', 'playlists']]);
  assert.deepEqual(shape(dashRailGroups(nav(['today', 'progress', 'workouts', 'nutrition', 'library', 'team', 'score', 'habits', 'goal', 'profile', 'settings']), 'client')),
    [[['Training', ['today', 'workouts', 'nutrition', 'library', 'team']], ['Progress', ['progress', 'score', 'habits', 'goal']]], ['profile', 'settings']]);
  // A tab nobody listed joins the last group rather than disappearing.
  const extra = dashRailGroups(nav(['today', 'business', 'radio']), 'trainer');
  assert.deepEqual(extra.groups.map((g) => g.items.map((n) => n.slug)), [['today'], ['business', 'radio']]);
});

// ── Today as B ─────────────────────────────────────────────────────────────
function mount() {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/newdesign/TrainerApp.html#today' });
  const before = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.getElementById('root'));
  return {
    dom, root,
    render: (el) => act(async () => root.render(el)),
    text: () => document.getElementById('root').textContent,
    async done() {
      await act(async () => root.unmount()); dom.window.close();
      globalThis.window = before.window; globalThis.document = before.document; globalThis.IS_REACT_ACT_ENVIRONMENT = before.act;
    },
  };
}
const todayCode = compile(TODAY);
const useChoice = (store, key, allowed, fallback) => React.useState(fallback);
function today(win) {
  return new Function('React', 'window', 'useDashUnits', 'useRememberedChoice', 'serif', 'sans', 'mono', 'INK', 'TEAL_BRIGHT',
    todayCode + ';return { DashNowColumn, DashNeedsYou, dashCountdown };')(React, win, () => null, useChoice, 'serif', 'sans', 'monospace', '#f2ede4', '#2ee0c4');
}

test('the countdown reads in hours and minutes, and never says zero', () => {
  const { dashCountdown } = today({});
  assert.equal(dashCountdown(1), '1M');
  assert.equal(dashCountdown(59999), '1M');
  assert.equal(dashCountdown(45 * 60000), '45M');
  assert.equal(dashCountdown(60 * 60000), '1H');
  assert.equal(dashCountdown(130 * 60000), '2H 10M');
});

test('up next is the first session that has not ended: in progress, then the countdown, then a clear day', async () => {
  const m = mount();
  try {
    const { DashNowColumn } = today(m.dom.window);
    const at = (min) => new Date(Date.now() + min * 60000);
    const row = (who, start, len) => ({ at: at(start), end: at(start + len), time: 'hh:mm', who, sub: 'Intake' });
    const col = (rows, demoRows) => React.createElement(DashNowColumn, { rows, demoRows, clients: [], role: 'trainer', unit: 'session', onOpenCalendar: null });

    await m.render(col([row('Ended', -120, 60), row('Underway', -10, 45), row('Later', 130, 30)], null));
    assert.match(m.text(), /ON NOW · UNTIL/, 'a session in progress is the one up next');
    assert.match(m.text(), /UNTIL[^]*Underway/);

    await m.render(col([row('Ended', -120, 60), row('Later', 130 - 1 / 60, 30)], null));
    assert.match(m.text(), /UP NEXT · IN 2H 10M/);
    assert.match(m.text(), /NOW \d/, 'the timeline marks where the day is');

    await m.render(col([row('Ended', -120, 60)], null));
    assert.match(m.text(), /Done for today/);
    await m.render(col([], null));
    assert.match(m.text(), /Nothing booked today/);
    assert.match(m.text(), /Your schedule is clear/);

    // The preview has no clock: its NEXT row is up next, with no countdown.
    await m.render(col(null, [{ time: '07:00', who: 'Priya S.', sub: 'Lower pull', status: 'DONE' }, { time: '14:00', who: 'Sam O.', sub: 'Intake', status: 'NEXT' }]));
    assert.match(m.text(), /UP NEXT14:00Sam O\./);
    assert.doesNotMatch(m.text(), /UP NEXT · IN/);
  } finally { await m.done(); }
});

test('Needs you opens on its first tab, switches tabs, and says so when a tab has nothing to show', async () => {
  const m = mount();
  try {
    const { DashNeedsYou } = today(m.dom.window);
    const tabs = [
      { key: 'attention', label: 'Attention', empty: true, emptyText: 'No one needs your attention right now.', render: () => 'PULSE' },
      { key: 'replies', label: 'Replies', render: () => 'REPLIES PANEL' },
    ];
    await m.render(React.createElement(DashNeedsYou, { tabs, prefs: null, role: 'trainer' }));
    const tab = (name) => [...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent === name);
    assert.equal(tab('Attention').getAttribute('aria-selected'), 'true');
    assert.match(m.text(), /No one needs your attention right now\./);
    assert.doesNotMatch(m.text(), /PULSE/, 'an empty tab must not render its blank panel');
    await act(async () => tab('Replies').dispatchEvent(new m.dom.window.MouseEvent('click', { bubbles: true })));
    assert.equal(tab('Replies').getAttribute('aria-selected'), 'true');
    assert.match(m.text(), /REPLIES PANEL/);
  } finally { await m.done(); }
});

test('the coach Today leads its grid with Needs you, and the cards it replaced are optional', () => {
  const page = body(TODAY, 'function CoachDashboardPage(', '\nObject.assign(window');
  const arr = body(page, 'const gridWidgets = [', '\n  ];');
  assert.ok(arr.indexOf('{ key: "needs"') > 0 && arr.indexOf('{ key: "needs"') < arr.indexOf('{ key: "checkins"'), 'Needs you is not the first widget');
  for (const key of ['pulse', 'schedule', 'queue']) {
    const at = arr.indexOf('{ key: "' + key + '"');
    assert.ok(at > 0, key + ' is gone from the catalogue — it must stay addable');
    assert.match(arr.slice(at, arr.indexOf('render:', at)), /optional: true/, key + ' is still on every board beside the tab that replaced it');
  }
  assert.match(page, /nowColumn=\{\(openCalendar\) => <DashNowColumn /);
});

test('the member day column counts only logged meals as logged, and offers the next thing to do', async () => {
  const m = mount();
  try {
    const src = body(CLIENT, 'function dclMinutes(', '\nfunction ClientDashboardPage(');
    // A member's day is wall-clock minutes, so the column runs on a clock pinned to noon:
    // offsets of hours either side would otherwise wrap past midnight near the day's ends.
    const NOON = new Date(2026, 9, 14, 12, 0, 0).getTime();
    class Noon extends Date { constructor(...a) { if (a.length) super(...a); else super(NOON); } static now() { return NOON; } }
    const { DclNowColumn, dclMinutes } = new Function('React', 'Date', 'serif', 'INK', 'DCL_MONO', 'DCL_TEAL', 'DCL_INK50', 'dashShellHref', 'dashCountdown',
      compile(src) + ';return { DclNowColumn, dclMinutes };')(React, Noon, 'serif', '#f2ede4', 'monospace', '#2ee0c4', '#999', (h) => '#' + h, today({}).dashCountdown);
    assert.equal(dclMinutes('7:30 AM'), 450);
    assert.equal(dclMinutes('12:05 PM'), 725);
    assert.equal(dclMinutes('12:00 AM'), 0);
    assert.equal(dclMinutes(null), null);

    const fmt = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const at = (min) => fmt(new Date(NOON + min * 60000));
    const meals = [
      { id: 'a', slot: 'Breakfast', time: at(-300), title: 'Oats', kcal: 400 },
      { id: 'b', slot: 'Lunch', time: at(-120), title: 'Bowl', kcal: 600 },
      { id: 'c', slot: 'Snack', time: at(90), title: 'Yogurt', kcal: 240 },
    ];
    let loggedMeal = null;
    await m.render(React.createElement(DclNowColumn, { workout: { title: 'Lower Push', time: at(240), meta: '54 min', coach: 'Maya' }, meals, logged: { a: true }, onLog: (meal) => { loggedMeal = meal; }, live: true }));
    assert.match(m.text(), /1 of 3 meals logged/, 'a lunch nobody logged was counted as logged');
    assert.match(m.text(), /UP NEXT · IN 1H 30M1:30 PMYogurt/);
    assert.match(m.text(), /NOW 12:00 PM1:30 PMYogurt/, 'the now line sits before the next thing on the plan');
    const logIt = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Log it');
    await act(async () => logIt.dispatchEvent(new m.dom.window.MouseEvent('click', { bubbles: true })));
    assert.equal(loggedMeal && loggedMeal.id, 'c');

    await m.render(React.createElement(DclNowColumn, { workout: null, meals: [], logged: {}, onLog: () => {}, live: true }));
    assert.match(m.text(), /Nothing planned today/);
  } finally { await m.done(); }
});
