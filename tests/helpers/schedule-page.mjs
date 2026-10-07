// tests/helpers/schedule-page.mjs
//
// Mount the SHIPPED coach Schedule page (public/newdesign/dashSchedule.jsx) in JSDOM, the way
// the browser runs it: compiled by Babel as a classic script, its page globals handed in, and
// window.ShapeScheduleRules set to the real scheduleRules.mjs (which the host page loads as a
// module before Babel runs). Every fetch is recorded and answered by the caller.
//
// ⚠ THE CLOCK IS PINNED. The page refuses a move or a booking into the past and draws a now
// line, so a fixture dated October 2026 would start failing on its own the day it went stale.
// `now` replaces the global Date for the mount (and is restored by `unmount`), so "today" is
// the fixture's today however long after it the suite runs.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(ROOT, 'package.json'));
const babel = require('next/dist/compiled/babel/core');
const presetReact = require('next/dist/compiled/babel/preset-react');
export const SCHEDULE_SRC = readFileSync(join(ROOT, 'public/newdesign/dashSchedule.jsx'), 'utf8');
export const RULES_URL = pathToFileURL(join(ROOT, 'public/newdesign/scheduleRules.mjs')).href;

function pinnedDate(RealDate, fixed) {
  class PinnedDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(fixed); }
    static now() { return fixed; }
  }
  return PinnedDate;
}

export async function mountSchedule({
  role = 'trainer',
  fetch,
  params = {},
  now = Date.parse('2026-10-07T15:00:00Z'),
  triage = [],
  live = true,
  narrow = false,
  drawer = null,
} = {}) {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://shape.test/newdesign/TrainerApp.html#schedule' });
  const before = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT, fetch: globalThis.fetch, Date: globalThis.Date };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.Date = pinnedDate(before.Date, now);
  dom.window.ShapeScheduleRules = await import(RULES_URL);
  dom.window.matchMedia = (q) => ({ matches: narrow && /max-width/.test(q), media: q, addEventListener() {}, removeEventListener() {} });
  if (drawer) dom.window.DashClientDrawer = drawer;
  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const act = React.act;
  const calls = [];
  // Every write the page makes to a remembered choice, as [key, value].
  const remembered = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return fetch(new URL(String(url), 'https://shape.test'), init);
  };
  const code = babel.transformSync(SCHEDULE_SRC, { presets: [presetReact], babelrc: false, configFile: false, sourceType: 'script' }).code;
  const Plain = ({ children }) => React.createElement('div', null, children);
  const { CoachSchedulePage } = new Function(
    'React', 'window', 'useDashboard', 'useRememberedChoices', 'useRememberedChoice', 'dashRouteParam', 'DashDemoBand', 'DashPage',
    'dashTabHref', 'trainerNavItems', 'nutriNavItems', 'trainerPayoutCard', 'nutriPayoutCard', 'serif', 'DashClientDrawer',
    code + '\nreturn { CoachSchedulePage };',
  )(
    React, dom.window,
    () => ({ triage, today: live ? { user: { firstName: 'Coach' } } : null, source: live ? 'live' : 'demo' }),
    () => ({}),
    (_prefs, key, allowed, def) => {
      const [v, set] = React.useState(def);
      return [v, (x) => { remembered.push([key, x, allowed]); set(x); }];
    },
    (k) => (k in params ? params[k] : null),
    () => null, Plain, () => '#', () => [], () => [], null, null, 'serif', drawer || undefined,
  );
  const root = createRoot(dom.window.document.getElementById('root'));
  const doc = dom.window.document;
  const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
  await act(async () => root.render(React.createElement(CoachSchedulePage, { role })));
  await settle();
  const buttons = () => [...doc.querySelectorAll('button')];
  const api = {
    dom, doc, act, calls, remembered, React, settle,
    text: () => doc.body.textContent,
    button: (name) => buttons().find((b) => b.textContent === name || b.getAttribute('aria-label') === name),
    buttonMatching: (re, scope = doc) => [...scope.querySelectorAll('button')].find((b) => re.test(b.textContent)),
    async click(el) {
      if (!el) throw new Error('nothing to click');
      await act(async () => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: el.__x ?? 0, clientY: el.__y ?? 0 })));
      await settle();
    },
    async clickAt(el, clientX, clientY) {
      await act(async () => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX, clientY })));
      await settle();
    },
    // JSDOM has no layout, so the grid's geometry is given: the columns container and each
    // column report a box, and everything else reports zeros.
    layout({ left = 100, top = 0, colWidth = 100 } = {}) {
      const cols = doc.querySelector('[data-dsc-cols]');
      if (!cols) throw new Error('no grid on screen');
      const n = cols.querySelectorAll('[data-col-date]').length;
      cols.getBoundingClientRect = () => ({ left, top, width: n * colWidth, height: 1000, right: left + n * colWidth, bottom: top + 1000, x: left, y: top });
      [...cols.querySelectorAll('[data-col-date]')].forEach((c, i) => {
        c.getBoundingClientRect = () => ({ left: left + i * colWidth, top, width: colWidth, height: 1000, right: left + (i + 1) * colWidth, bottom: top + 1000, x: left + i * colWidth, y: top });
      });
      return { left, top, colWidth };
    },
    // A pointer drag: down on the element, moves on the window, up on the window.
    async drag(el, path, { release = true } = {}) {
      const ev = (type, x, y) => Object.assign(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }), { pointerId: 1 });
      await act(async () => el.dispatchEvent(ev('pointerdown', path[0][0], path[0][1])));
      for (const [x, y] of path.slice(1)) await act(async () => dom.window.dispatchEvent(ev('pointermove', x, y)));
      if (release) await act(async () => dom.window.dispatchEvent(ev('pointerup', path[path.length - 1][0], path[path.length - 1][1])));
      await settle();
    },
    async key(k) { await act(async () => dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true }))); await settle(); },
    toast: () => { const t = doc.querySelector('[data-toast]'); return t ? t.textContent : ''; },
    async unmount() {
      // The toast clears itself on a 2.6 s timer; one still showing is waited OUT (polled until
      // it is gone, not a fixed sleep) so its timer fires while a window still exists.
      for (let i = 0; i < 80 && doc.querySelector('[data-toast]'); i++) await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
      try { await act(async () => root.unmount()); } finally {
        dom.window.close();
        Object.assign(globalThis, { window: before.window, document: before.document, IS_REACT_ACT_ENVIRONMENT: before.act, fetch: before.fetch, Date: before.Date });
      }
    },
  };
  return api;
}

// A JSON answer for the recorded fetch.
export const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
