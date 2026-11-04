// Tune the program / Tune the plan (a client's file → ADJUST), redesigned and carved out of
// iosAppBroadsheetPros.jsx into BSProAdjust.jsx (the WORKLOG rule: a PR that touches a self-contained
// screen moves it). Owner, 2026-11-04: "update design here as well" ("keep designs simple … modern,
// appealing, esay to navigate, not overwhelming, not analog … really alive"), then, of the redesigns that
// day, "reduce the coloring and and simplify UI more".
//
// What it pins:
//   · THE SEAM. The module imports only React and the clean type, reads no window global while it
//     evaluates (React #130 otherwise), names its globals on the page's first line, carries its own
//     translator, and the coach module imports it and declares none of it.
//   · THE PAGE, mounted for real (jsdom) in both papers and both roles: no capitals over a section; the
//     intensity as three cards with what it does to the week's volume; steppers that keep their limits;
//     the focus and the restrictions as pills; the days as rows that cycle; every control a 44px target
//     and every box 16px; colour only on the picked intensity and the one button that sends.
//   · WHAT IS SAVED AND SENT, unchanged by the redesign: the program record and the note to the thread.
//     The guardrail's held-for-review path is broadsheet-render.test.mjs's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NEW = join(ROOT, 'mobile-app/src/broadsheet/BSProAdjust.jsx');
const PROS = join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
const view = stripComments(readFileSync(NEW, 'utf8'));
const pros = stripComments(readFileSync(PROS, 'utf8'));
const CATALOGS = join(ROOT, 'mobile-app/src/i18n/catalogs');

// ── The seam ─────────────────────────────────────────────────────────────────────────────────────
// First, before anything puts a window on globalThis: evaluating the module records every read.
test('evaluating the module by itself reads NO window global, whatever the spelling', async () => {
  const reads = [];
  const recorder = new Proxy({}, {
    get: (_t, prop) => { reads.push(String(prop)); return undefined; },
    has: (_t, prop) => { reads.push(String(prop)); return false; },
  });
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: recorder, configurable: true, writable: true });
  let mod;
  try {
    mod = await loadRealModule(NEW, { registry: new Map([['react', require_('react')]]) });
  } finally {
    if (saved) Object.defineProperty(globalThis, 'window', saved); else delete globalThis.window;
  }
  assert.equal(typeof mod.default, 'function');
  assert.deepEqual(reads, [], `the module read window.${reads.join(', window.')} while it was being evaluated (React #130 on first open)`);
});

test('the module imports only React and the clean type; the coach module imports it and declares none of it', () => {
  const imports = [...view.matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['react', './bsCleanType.jsx']);
  assert.match(view, /^function useShapeTr\(\) \{/m, 'its own translator');
  assert.match(view, /^export default function BSProAdjustProgram\(\{ client, role = 'trainer', clientUid, onBack \}\) \{\n {2}const \{ BSPage, BSFooter, BSBackRow, BSMastRow, BSFacetAvatar, BS_MAST_TOP_CSS = [^}]+\} = window;$/m,
    'the page names its window globals on its first line, at call time');
  assert.match(pros, /^import BSProAdjustProgram from '\.\/BSProAdjust\.jsx';$/m);
  assert.doesNotMatch(pros, /^function BSProAdjustProgram\(/m, 'the old page is back in the coach module');
  assert.equal((pros.match(/<BSProAdjustProgram\b/g) || []).length, 1, 'the case file opens it, once');
  // No capitals over a section and no mono: the old overline helper is gone from the page.
  assert.doesNotMatch(view, /textTransform: 'uppercase'|bsProOverline|fontFamily: t\.MONO/);
  // Gentle motion, every bit of it off under reduced motion.
  assert.match(view, /@media \(prefers-reduced-motion:reduce\)\{\[data-pro-adjust\],\[data-pro-adjust\] \*\{animation:none!important;transition:none!important\}/);
});

test('the words the redesign added are in all 13 catalogs, and the ones it retired are in none', () => {
  const ADDED = ['caloriesLabel', 'deltaSame', 'deltaSet', 'fromMacrosLabel', 'mealsLabel', 'pickAny', 'sessionsLabel', 'tapDay', 'volNow', 'volThisWeek', 'weeksLabel'];
  const RETIRED = ['eyebrowTrainer', 'eyebrowNutri', 'thisWeek', 'structure', 'emphasis', 'weeklySplit', 'tapToChange', 'message', 'energy', 'macros', 'constraints', 'sessionsWeek', 'weeksRemaining', 'dailyCalories', 'mealsDay', 'fromMacros'];
  const locales = readdirSync(CATALOGS);
  assert.equal(locales.length, 13);
  for (const l of locales) {
    const cat = JSON.parse(readFileSync(join(CATALOGS, l, 'coach.json'), 'utf8'));
    for (const k of ADDED) assert.ok(typeof cat[`adjust.${k}`] === 'string' && cat[`adjust.${k}`].trim(), `${l}: adjust.${k}`);
    for (const k of RETIRED) assert.ok(!(`adjust.${k}` in cat), `${l}: adjust.${k} is authored but nothing reads it`);
  }
  for (const k of ADDED) assert.match(view, new RegExp(`tr\\('coach:adjust\\.${k}'`), `adjust.${k} is not read`);
  for (const k of RETIRED) assert.ok(!readdirSync(join(ROOT, 'mobile-app/src/broadsheet')).some((f) => readFileSync(join(ROOT, 'mobile-app/src/broadsheet', f), 'utf8').includes(`coach:adjust.${k}'`)), `adjust.${k} is still read`);
});

// ── The page, mounted ───────────────────────────────────────────────────────────────────────────
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
const W = dom.window;
globalThis.window = W;
globalThis.document = W.document;
Object.defineProperty(globalThis, 'navigator', { value: W.navigator, configurable: true, writable: true });
globalThis.__VITE_ENV__ = { BASE_URL: '/m/', MODE: 'test' };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require_('react');
const ReactDOMClient = require_('react-dom/client');
const { IntlMessageFormat } = require_('intl-messageformat');
const EN = JSON.parse(readFileSync(join(CATALOGS, 'en', 'coach.json'), 'utf8'));
const MISSING = new Set();
W.ShapeI18n = {
  t: (key, opts = {}) => {
    if (!key.startsWith('coach:')) return undefined;
    const msg = EN[key.slice(6)];
    if (msg == null) { MISSING.add(key); return undefined; }
    return new IntlMessageFormat(msg, 'en').format(opts);
  },
  intlLocale: () => 'en',
};
const LIGHT = { isLight: true, inkRGB: '15,14,12', PAPER: '#f5f0e6', PAPER2: '#ede6d6', INK: '#0f0e0c', INK70: 'rgba(15,14,12,0.7)', INK50: 'rgba(15,14,12,0.5)', RULE: 'rgba(15,14,12,0.18)', HAIR: 'rgba(15,14,12,0.08)', AMBER: '#c8881a', RUST: '#a8331b', padX: 18 };
const DARK = { isLight: false, inkRGB: '245,240,230', PAPER: '#0f0e0c', PAPER2: '#181612', INK: '#f5f0e6', INK70: 'rgba(245,240,230,0.7)', INK50: 'rgba(245,240,230,0.5)', RULE: 'rgba(245,240,230,0.2)', HAIR: 'rgba(245,240,230,0.1)', AMBER: '#e3a544', RUST: '#e06547', padX: 18 };
let theme = LIGHT;
W.useBS = () => theme;
W.BSPage = ({ children }) => React.createElement('div', { 'data-page': '' }, children);
W.BSFooter = () => null;
W.BSBackRow = ({ onBack }) => React.createElement('div', { 'data-bs-back-row': '' }, React.createElement('button', { type: 'button', 'data-bs-back': '', onClick: onBack, style: { minHeight: 44 } }, '← Back'));
W.BSFacetAvatar = ({ initial }) => React.createElement('span', { 'data-facet': '' }, initial);

const mod = await loadRealModule(NEW, { registry: new Map([['react', React], ['react-dom', { createPortal: (n) => n }]]) });
const Page = mod.default;
const CLIENT = { n: 'Devon Pierce', i: 'D', c: '#c0533b', prog: 'Strength' };

async function mount(props) {
  const host = W.document.createElement('div');
  W.document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => { root.render(React.createElement(Page, { client: CLIENT, role: 'trainer', onBack: () => {}, ...props })); });
  // Let the seed read (ShapeProgramApi.get) land.
  await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  const q = (sel) => host.querySelector(sel);
  const all = (sel) => [...host.querySelectorAll(sel)];
  // A press, then everything it started (Apply's awaits) before the next look.
  const press = async (el) => { assert.ok(el, 'nothing to press'); await React.act(async () => { el.dispatchEvent(new W.MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); }); };
  const byLabel = (label) => q(`button[aria-label="${label}"]`);
  const button = (re) => all('button').find((b) => re.test(b.textContent));
  return { host, q, all, press, byLabel, button, close: () => React.act(async () => { root.unmount(); host.remove(); }) };
}
const num = (btn) => btn.parentElement.querySelector('[data-adj-num]').textContent;
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };

for (const [paper, th] of [['light', LIGHT], ['dark', DARK]]) {
  test(`trainer (${paper}): the head, the intensity cards and what they do, every control a 44px target`, async () => {
    theme = th;
    const p = await mount({});
    try {
      assert.equal(p.q('h1').textContent, 'Tune the program');
      assert.match(p.q('[data-pro-client-mini]').textContent, /^DDevon PierceStrength$/);
      // The sections are heads alone: no capitals anywhere on the page.
      const heads = p.all('[data-pro-action-sec] h2').map((h) => h.textContent);
      assert.deepEqual(heads, ['Intensity', 'Frequency & block', 'Focus', 'Training days', 'Note to Devon']);
      assert.deepEqual(p.all('*').filter((e) => e.style.textTransform === 'uppercase'), []);
      // Intensity: three cards, one checked, its effect shown as now against this week.
      const radios = p.all('[role="radiogroup"] [role="radio"]');
      assert.deepEqual(radios.map((r) => [r.textContent, r.getAttribute('aria-checked')]), [['Deload', 'false'], ['Maintain', 'false'], ['Progress', 'true']]);
      const vol = () => p.q('[data-adj-volume]').textContent;
      assert.match(vol(), /^NowThis week\+1 setAdd a set to main lifts/);
      await p.press(radios[0]);
      assert.equal(p.all('[role="radio"]')[0].getAttribute('aria-checked'), 'true');
      assert.match(vol(), /^NowThis week-40%Pull volume back ~40%/);
      assert.equal(p.all('[data-adj-volume] [data-adj-bar]')[1].style.width, '52%', 'deload: this week is 60% of now');
      assert.match(p.q('textarea').value, /deloading this week/, 'the note follows the controls');
      await p.press(p.all('[role="radio"]')[1]);
      assert.match(vol(), /^NowThis weekSame/);
      // Colour only as a signal: the picked card and the send button, never an unpicked card.
      const accent = rgb('#c0533b');
      const cards = p.all('[role="radio"]');
      assert.ok(cards[1].style.border.includes(accent), cards[1].style.border);
      assert.ok(!cards[0].style.border.includes(accent), cards[0].style.border);
      assert.equal(p.button(/Apply & Send/).style.background, accent);
      // Every control a 44px target; every box 16px.
      for (const b of p.all('button')) {
        const h = parseFloat(b.style.minHeight || b.style.height || '0');
        assert.ok(h >= 44, `"${b.getAttribute('aria-label') || b.textContent}" is ${h}px tall`);
      }
      for (const box of p.all('textarea')) assert.equal(box.style.fontSize, '16px');
    } finally { await p.close(); }
  });
}

test('trainer: the steppers keep their limits, the pills and the days still do what they did', async () => {
  theme = DARK;
  const p = await mount({});
  try {
    const plus = p.byLabel('+ Sessions a week'), minus = p.byLabel('− Sessions a week');
    assert.equal(num(plus), '4');
    for (let i = 0; i < 5; i++) await p.press(p.byLabel('+ Sessions a week'));
    assert.equal(num(p.byLabel('+ Sessions a week')), '7', 'sessions stop at 7');
    assert.equal(p.byLabel('+ Sessions a week').disabled, true);
    for (let i = 0; i < 9; i++) await p.press(p.byLabel('− Sessions a week'));
    assert.equal(num(minus), '1', 'and at 1');
    assert.equal(p.byLabel('− Sessions a week').disabled, true);
    for (let i = 0; i < 12; i++) await p.press(p.byLabel('+ Weeks left'));
    assert.equal(num(p.byLabel('+ Weeks left')), '16', 'weeks stop at 16');
    assert.match(p.q('textarea').value, /^Adjusting your block: 1×\/week/);
    // A number that changed rolls the way it moved; one that did not, stays still.
    assert.match(p.byLabel('+ Weeks left').parentElement.querySelector('[data-adj-num]').style.animation, /bsadj-up/);
    // Focus: pills, pressed or not.
    const pill = (name) => p.all('button[aria-pressed]').find((b) => b.textContent === name);
    assert.deepEqual(p.all('button[aria-pressed]').map((b) => [b.textContent, b.getAttribute('aria-pressed')]), [['Strength', 'true'], ['Hypertrophy', 'true'], ['Conditioning', 'false'], ['Mobility', 'false'], ['Power', 'false']]);
    await p.press(pill('Hypertrophy'));
    await p.press(pill('Power'));
    assert.match(p.q('textarea').value, /Focus stays on strength \+ power\./);
    // Days: a tap cycles the day, Monday first, in the app's language.
    const day = (i) => p.q(`[data-adj-day="${i}"]`);
    assert.equal(day(0).textContent, 'MonPush day');
    assert.equal(day(3).textContent, 'ThuRest');
    await p.press(day(3));
    assert.equal(day(3).textContent, 'ThuPush day', 'Rest cycles round to Push day');
  } finally { await p.close(); }
});

test('nutritionist: calories in 50s within 1,000–5,000, the macros, the refeed switch, the restrictions', async () => {
  theme = LIGHT;
  const p = await mount({ role: 'nutritionist' });
  try {
    assert.equal(p.q('h1').textContent, 'Tune the plan');
    assert.deepEqual(p.all('[data-pro-action-sec] h2').map((h) => h.textContent), ['Calorie target', 'Daily split', 'Meals & refeeds', 'Restrictions', 'Note to Devon']);
    assert.equal(num(p.byLabel('+ Daily calories')), '2,100');
    await p.press(p.byLabel('+ Daily calories'));
    assert.equal(num(p.byLabel('+ Daily calories')), '2,150');
    assert.equal(num(p.byLabel('+ Protein')), '170g');
    await p.press(p.byLabel('− Fat'));
    assert.equal(num(p.byLabel('− Fat')), '60g', 'fat steps by 2');
    // 170 g × 4 + 190 g × 4 + 60 g × 9 = 1,980 kcal, against the 2,150 set above.
    assert.match(p.q('[data-adj-macros]').textContent, /^From macros1,980 kcal · -170 vs target$/);
    const sw = p.q('[role="switch"]');
    assert.equal(sw.getAttribute('aria-checked'), 'true');
    assert.match(p.q('textarea').value, /Keeping the weekend refeed/);
    await p.press(sw);
    assert.equal(p.q('[role="switch"]').getAttribute('aria-checked'), 'false');
    assert.doesNotMatch(p.q('textarea').value, /refeed/);
    assert.deepEqual(p.all('button[aria-pressed="true"]').map((b) => b.textContent), ['Dairy-light']);
    assert.equal(p.button(/Apply & Send/).style.background, rgb('#a07a2e'), 'gold on a light paper');
    assert.equal(p.button(/Apply & Send/).style.color, 'rgb(20, 17, 13)', 'ink on gold, which reads better than white');
    assert.match(p.host.textContent, /Demo client · applies once linked to a live member/);
  } finally { await p.close(); }
});

test('Apply & Send / Apply & Notify still save the record and send the note, as before', async () => {
  theme = LIGHT;
  const written = [], sent = [], regen = [];
  W.bsAskConfirm = async () => true;
  W.ShapeAdjustRegen = { apply: async (body) => { regen.push(body); return { changed: true, gen: 4 }; } };
  W.ShapeProgramApi = { get: async () => ({ detail: { training: { intensity: 'deload', sessions: 3, weeks: 5, focus: ['mobility'], days: ['Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Pull day'] } } }), set: async (d) => { written.push(d); } };
  W.ShapeMessages = { getOrCreateMemberConversation: async () => ({ data: 'conv-1' }), sendMessage: async (m) => { sent.push(m); } };
  W.__bsToast = () => {};
  const p = await mount({ clientUid: '11111111-2222-4333-8444-555555555555' });
  try {
    // Reopened, it shows what is in effect.
    assert.equal(p.all('[role="radio"]')[0].getAttribute('aria-checked'), 'true');
    assert.equal(num(p.byLabel('+ Sessions a week')), '3');
    assert.match(p.host.textContent, /On apply · updates Devon's Train tab \+ sends this note/);
    await p.press(p.button(/Apply & Notify/));
    assert.deepEqual(regen[0], { clientId: '11111111-2222-4333-8444-555555555555', adjustment: { intensity: 'deload', sessions: 3, weeks: 5, days: ['Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Pull day'] }, acknowledgment: null });
    const tr = written[0].detail.training;
    assert.deepEqual({ ...tr, updatedAt: undefined }, { intensity: 'deload', sessions: 3, weeks: 5, focus: ['mobility'], days: ['Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Pull day'], note: p.q('textarea').value, gen: 4, updatedAt: undefined });
    assert.equal(sent[0].conversationId, 'conv-1');
    assert.deepEqual(sent[0].metadata, { kind: 'program_update', notify: true });
    assert.equal(p.button(/Sent ✓/).disabled, true);
  } finally {
    await p.close();
    for (const k of ['bsAskConfirm', 'ShapeAdjustRegen', 'ShapeProgramApi', 'ShapeMessages', '__bsToast']) delete W[k];
  }
});

test('every word the page asked the catalog for is there', () => {
  assert.deepEqual([...MISSING], []);
});
