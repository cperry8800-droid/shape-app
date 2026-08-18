// tests/case-presence-heading.test.mjs
//
// WHY THIS FILE EXISTS: the coach Case File's sleep card is implemented TWICE —
// mobile in mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx, web in
// public/newdesign/coachClientDetail.jsx — and the two drifted on the SAME
// presence model twice inside one review cycle:
//
//   1. mobile's device predicate omitted `latency` and `stages`, so an Oura
//      night reporting only sleep-onset latency read as no-device on mobile
//      while the web twin counted it;
//   2. web's heading recombined `hasDevice` at the render site, so an
//      hours-only client was headed "DAILY CHECK-IN" on web and
//      "SLEEP · RECOVERY" on mobile.
//
// Both were caught by eye, in review, after shipping. Eyes do not scale to two
// files four thousand lines apart, so this is the gate: it MOUNTS both shipping
// cards, feeds each the same presence vectors, and asserts the two agree.
//
// ⚠ Nothing here re-implements the rule. A test carrying its own copy of the
// predicate would pass forever while both surfaces rotted — it would only be
// asserting that the test file agrees with itself. Every expectation below is a
// literal per-vector table entry, and every observation is read out of rendered
// DOM produced by the real modules (compiled in memory; no production file is
// edited or copied — only the browser and the chrome around the card are
// supplied).
//
// The model both surfaces must implement:
//
//   hasDevice  = efficiency|rhr|hrv|latency|respiratory|stages non-null  (MEASURED)
//   hasHours   = latest|avg7 non-null   (source UNKNOWABLE — gates NEITHER claim)
//   hasRested  = rested non-null        (ENTERED)
//   hasVitals  = an energy|hunger|hydration leg is present  (ENTERED)
//   hasEntered = hasRested || hasVitals
//   heading    = !hasDevice && hasEntered ? "DAILY CHECK-IN" : "SLEEP · RECOVERY"
//   content    = hasDevice || hasHours || hasRested || hasVitals
//
// The two surfaces spell "no content" differently ON PURPOSE, and that is not
// drift: web omits the card entirely (absence, never a padlock), mobile keeps
// the station head and prints its redact lines. Both are asserted, each in its
// own idiom.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MOBILE_SRC = join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetPros.jsx');
const WEB_SRC = join(ROOT, 'public', 'newdesign', 'coachClientDetail.jsx');

const CLIENT_UID = '11111111-2222-3333-4444-555555555555';

// ── the browser ─────────────────────────────────────────────────────────────
// Both cards hydrate from promises, so this is a real client mount (jsdom +
// react-dom/client + React.act), not renderToString. The URL carries ?id=
// because the web page reads its client id off location.search before it will
// fetch anything at all.
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: `https://shape.test/newdesign/TrainerClient.html?id=${CLIENT_UID}`,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
// Node 24 ships a read-only `navigator` getter; its descriptor is configurable,
// so redefine rather than assign (the error-boundary mount hit this first).
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.location = dom.window.location;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
globalThis.__VITE_ENV__ = { BASE_URL: '/m/', MODE: 'test' };
// React 19: without this every act() call logs a console.error of its own.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = require_('react');
const ReactDOMClient = require_('react-dom/client');

// ── mobile: the real Case File page ─────────────────────────────────────────
// The broadsheet reads its chrome off `window` by destructuring AT MODULE LOAD,
// so every name has to exist before the module is compiled. These stand-ins are
// chrome only — the card, its predicates and its labels are the shipping code.
const W = dom.window;
const theme = {
  MONO: 'mono', DISPLAY: 'display', BODY: 'body', PAPER: '#fff', PAPER2: '#eee',
  INK: '#111', INK50: '#777', INK70: '#555', HAIR: '#ddd', RULE: '#ccc',
  AMBER: '#d8b25a', RUST: '#c0533b', padX: 18, isLight: true,
};
W.useBS = () => theme;
W.BSPage = ({ children }) => React.createElement('div', null, children);
W.BSFooter = ({ left, right }) => React.createElement('footer', null, left, right);
for (const chrome of ['BSMasthead', 'BSPageHeader', 'BSBackButton', 'BSAvatar', 'BSFacetAvatar',
  'BSEyebrow', 'BSSection', 'BSPlate', 'BSSlab', 'BSCell', 'BSTag', 'BSRow', 'BSHeadlineNumber',
  'BSHalftone', 'BSTabBar', 'BSSheetProvider', 'BSCalendarScreen', 'BSRadioPrompt', 'BSRadioScreen',
  'BSNowPlaying', 'BSClientChat', 'BSSettings', 'BSShapeScorePage', 'BSShapeStorePage',
  'BSContactPage', 'BSTermsPage', 'BSPublicProfile']) {
  W[chrome] = ({ children }) => React.createElement('div', { 'data-chrome': chrome }, children);
}
// The two chrome primitives this card actually speaks through. Tagged so the
// sleep station can be located by STRUCTURE rather than by scraping page text —
// the station wrapper is the head's parent element, which scopes every read
// below to this one card.
W.BSTStationHead = ({ label }) => React.createElement('div', { 'data-station-head': String(label) }, String(label));
W.BSTRedact = ({ label }) => React.createElement('div', { 'data-redact': String(label) }, String(label));

const MOBILE = await loadRealModule(MOBILE_SRC, {
  registry: new Map([['react', React], ['react-dom', { createPortal: (n) => n }]]),
  appendExports: 'export { BSProClientFullProfilePage };',
});

// ── web: the real coach client-detail page ──────────────────────────────────
// coachClientDetail.jsx ships as a CLASSIC script (TrainerClient.html loads it
// with <script type="text/babel">) — no imports, no exports, and its four
// externals come from sibling scripts in the same global scope. So it is
// compiled the way the browser compiles it (JSX only, no module transform) and
// evaluated inside a function whose parameters supply exactly those externals.
// The page component is handed back by a single appended `return`; the shipping
// source above it is byte-for-byte untouched.
const babel = require_('next/dist/compiled/babel/core');
const presetReact = require_('next/dist/compiled/babel/preset-react');
const webCompiled = babel.transformSync(readFileSync(WEB_SRC, 'utf8'), {
  presets: [presetReact], babelrc: false, configFile: false, filename: WEB_SRC, sourceType: 'script',
}).code;
const Card = ({ children, style }) => React.createElement('div', { 'data-card': true, style }, children);
const DashPage = ({ children }) => React.createElement('div', { 'data-dashpage': true }, children);
const { CoachClientDetailPage } = new Function(
  'React', 'Card', 'DashPage', 'trainerNavItems', 'nutriNavItems', 'trainerPayoutCard', 'nutriPayoutCard',
  `${webCompiled}\n;return { CoachClientDetailPage };`,
)(React, Card, DashPage, () => [], () => [], null, null);

// ── vectors ─────────────────────────────────────────────────────────────────
// ONE payload builder feeds BOTH surfaces, because both read the same route
// (/api/clients/:id/shared-overview). If the vector had to be spelled twice the
// test could itself drift, which is the bug it exists to catch.
const DEVICE_FIELDS = {
  efficiency: { efficiency: 92 },
  rhr: { rhr: 48 },
  hrv: { hrv: 71 },
  latency: { latency: 12 },
  respiratory: { respiratory: 14.2 },
  stages: { stages: { deep: 96, rem: 84, light: 214 } },
};
function payload({ device = null, hours = false, rested = false, vitals = false }) {
  const sleep = Object.assign({},
    device ? DEVICE_FIELDS[device] : null,
    hours ? { latest: 7.5, avg7: 7.1 } : null,
    rested ? { rested: 8 } : null);
  return {
    // Neither surface may see a `sleep` object it did not earn: an empty {} is
    // not what the route sends for a client with no sleep leg, and shipping one
    // here would test a payload production never produces.
    sleep: Object.keys(sleep).length ? sleep : null,
    vitals: vitals ? { energy: { avg7: 6, n: 5 } } : null,
  };
}

// The card's own cell labels — identical on both surfaces, which is why one
// table reads both. Each stands for one leg of the presence model.
const L = {
  HOURS: 'LAST NIGHT',
  DEVICE: 'EFFICIENCY',
  RESTED: 'RESTED',
  VITALS: 'DAILY ENERGY · 7D',
};
const HEAD_SLEEP = 'SLEEP · RECOVERY';
const HEAD_CHECKIN = 'DAILY CHECK-IN';
const MOBILE_SLEEP_REDACT = 'SLEEP · RECOVERY · NOT SYNCED';
const MOBILE_VITALS_REDACT = 'DAILY CHECK-IN · NOT ON RECORD';
const WEB_DEVICE_BADGE = 'Objective · device-synced';

// Leaf text nodes only: a cell's label div and its value div are both leaves,
// so an exact-match set over leaves distinguishes the LABEL "RESTED" from any
// ancestor whose textContent merely contains it.
function leafText(scope) {
  return new Set([...scope.querySelectorAll('div')].filter((d) => d.children.length === 0).map((d) => d.textContent));
}

async function mount(el) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => { root.render(el); });
  // Both pages hydrate from a promise (mobile: ShapeCareTeam.overview; web:
  // fetch then r.json() then setData), so the microtask queue is drained across
  // several ticks before anything is read.
  await React.act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
  return { host, root };
}
async function unmount({ host, root }) {
  await React.act(async () => { root.unmount(); });
  host.remove();
}

// ── mobile read ─────────────────────────────────────────────────────────────
async function readMobile(vec) {
  const p = payload(vec);
  W.ShapeCareTeam = { overview: async () => ({ careTeam: [], sleep: p.sleep, vitals: p.vitals }) };
  const m = await mount(React.createElement(MOBILE.BSProClientFullProfilePage, {
    client: { id: CLIENT_UID, userId: CLIENT_UID, n: 'Ada Lovelace', s: 'ok' },
    onBack: () => {},
    role: 'trainer',
  }));
  const heads = [...m.host.querySelectorAll('[data-station-head]')]
    .filter((e) => e.getAttribute('data-station-head') === HEAD_SLEEP || e.getAttribute('data-station-head') === HEAD_CHECKIN);
  // The station head renders unconditionally on mobile, so ZERO of them means
  // the page failed to mount rather than that the card chose to say nothing.
  // Without this guard every "absent" expectation below would pass vacuously.
  assert.equal(heads.length, 1, 'exactly one SLEEP/CHECK-IN station head must render on mobile');
  const station = heads[0].parentElement;
  const labels = leafText(station);
  const redacts = new Set([...station.querySelectorAll('[data-redact]')].map((e) => e.getAttribute('data-redact')));
  const out = {
    heading: heads[0].getAttribute('data-station-head'),
    device: labels.has(L.DEVICE),
    hours: labels.has(L.HOURS),
    rested: labels.has(L.RESTED),
    vitals: labels.has(L.VITALS),
    sleepRedact: redacts.has(MOBILE_SLEEP_REDACT),
    vitalsRedact: redacts.has(MOBILE_VITALS_REDACT),
  };
  await unmount(m);
  return out;
}

// ── web read ────────────────────────────────────────────────────────────────
async function readWeb(vec) {
  const p = payload(vec);
  const body = {
    me: { trainerId: 7 }, client: { name: 'Ada Lovelace' }, careTeam: [], sessions: [],
    stats: {}, lifts: {}, goals: {}, sleep: p.sleep, vitals: p.vitals,
  };
  globalThis.fetch = async () => ({ ok: true, json: async () => body });
  W.fetch = globalThis.fetch;
  const m = await mount(React.createElement(CoachClientDetailPage));
  // The page renders a Loading / could-not-load shell until the fetch lands. If
  // the stub ever stopped resolving, every "the card is absent" expectation
  // would pass for the wrong reason — so prove the real page body is on screen.
  assert.ok(!/Loading client overview/.test(m.host.textContent), 'web page must have left its loading state');
  assert.ok(!/Try refreshing/.test(m.host.textContent), 'web page must not be in its error state');
  const headEl = [...m.host.querySelectorAll('div')]
    .find((d) => d.children.length === 0 && (d.textContent === HEAD_SLEEP || d.textContent === HEAD_CHECKIN));
  const card = headEl ? headEl.closest('[data-card]') : null;
  const labels = card ? leafText(card) : new Set();
  const out = {
    present: !!card,
    heading: headEl ? headEl.textContent : null,
    device: labels.has(L.DEVICE),
    hours: labels.has(L.HOURS),
    rested: labels.has(L.RESTED),
    vitals: labels.has(L.VITALS),
    badge: !!card && card.textContent.includes(WEB_DEVICE_BADGE),
  };
  await unmount(m);
  return out;
}

// ── the 16 combinations ─────────────────────────────────────────────────────
// (device, hours, rested, vitals). `head` and `content` are written out per row
// rather than computed, so this table is a specification and not a second copy
// of the implementation.
const GRID = [
  { d: 0, h: 0, r: 0, v: 0, head: HEAD_SLEEP, content: false },
  { d: 0, h: 0, r: 0, v: 1, head: HEAD_CHECKIN, content: true },
  { d: 0, h: 0, r: 1, v: 0, head: HEAD_CHECKIN, content: true },
  { d: 0, h: 0, r: 1, v: 1, head: HEAD_CHECKIN, content: true },
  // Hours alone head SLEEP · RECOVERY: their source is unknowable, so they may
  // claim neither a device nor a check-in. This row IS the round-5 defect.
  { d: 0, h: 1, r: 0, v: 0, head: HEAD_SLEEP, content: true },
  { d: 0, h: 1, r: 0, v: 1, head: HEAD_CHECKIN, content: true },
  { d: 0, h: 1, r: 1, v: 0, head: HEAD_CHECKIN, content: true },
  { d: 0, h: 1, r: 1, v: 1, head: HEAD_CHECKIN, content: true },
  // Any measured evidence at all takes the card back to SLEEP · RECOVERY,
  // whatever the member also entered.
  { d: 1, h: 0, r: 0, v: 0, head: HEAD_SLEEP, content: true },
  { d: 1, h: 0, r: 0, v: 1, head: HEAD_SLEEP, content: true },
  { d: 1, h: 0, r: 1, v: 0, head: HEAD_SLEEP, content: true },
  { d: 1, h: 0, r: 1, v: 1, head: HEAD_SLEEP, content: true },
  { d: 1, h: 1, r: 0, v: 0, head: HEAD_SLEEP, content: true },
  { d: 1, h: 1, r: 0, v: 1, head: HEAD_SLEEP, content: true },
  { d: 1, h: 1, r: 1, v: 0, head: HEAD_SLEEP, content: true },
  { d: 1, h: 1, r: 1, v: 1, head: HEAD_SLEEP, content: true },
];
const vname = (c) => `device=${c.d} hours=${c.h} rested=${c.r} vitals=${c.v}`;

for (const c of GRID) {
  test(`presence ${vname(c)} → ${c.head}${c.content ? '' : ' (no card)'}`, async () => {
    const vec = { device: c.d ? 'efficiency' : null, hours: !!c.h, rested: !!c.r, vitals: !!c.v };
    const web = await readWeb(vec);
    const mob = await readMobile(vec);

    // ── the heading, on both surfaces ──
    assert.equal(mob.heading, c.head, 'mobile heading');
    if (c.content) {
      assert.equal(web.heading, c.head, 'web heading');
      // The all-empty vector is the one row where the two legitimately differ
      // in SHAPE: web has no card to head, mobile still heads its station.
      // Everywhere else, comparing them is the whole point of this file.
      assert.equal(mob.heading, web.heading, 'the two Case Files must head the same client identically');
    }

    // ── the card's existence ──
    // Web: absent outright.
    assert.equal(web.present, c.content, 'web card present');
    // Mobile: the station head always renders, so its empty state is the redact
    // pair — the same predicate in a different idiom.
    assert.equal(mob.sleepRedact, !c.content, 'mobile NOT SYNCED redact fires only with nothing at all');
    assert.equal(mob.vitalsRedact, !(c.r || c.v), 'mobile check-in redact fires only with no ENTERED data');
    const anyCell = mob.device || mob.hours || mob.rested || mob.vitals;
    assert.equal(anyCell, c.content, 'mobile renders cells exactly when the web twin renders a card');

    // ── which legs actually rendered, on both surfaces ──
    // A heading that agrees over a card showing different data is still drift.
    const want = { device: !!c.d, hours: !!c.h, rested: !!c.r, vitals: !!c.v };
    for (const leg of ['device', 'hours', 'rested', 'vitals']) {
      assert.equal(mob[leg], want[leg], `mobile ${leg} cells`);
      assert.equal(web[leg], want[leg], `web ${leg} cells`);
    }
    // The "Objective · device-synced" badge is web-only, and it is the claim
    // that must never sit over member-entered gauges.
    assert.equal(web.badge, !!c.d, 'web device-synced badge');
  });
}

// ── device evidence, field by field ─────────────────────────────────────────
// The round-3 defect lived in ONE term of the device predicate, so a grid that
// only ever sends `efficiency` would not have caught it. Each measured field
// must be device evidence by itself, on both surfaces — and each is paired with
// vitals, because that is the vector where a dropped term flips the HEADING
// (no device + entered data = DAILY CHECK-IN) rather than merely hiding cells.
for (const field of Object.keys(DEVICE_FIELDS)) {
  test(`${field} alone is device evidence on both surfaces`, async () => {
    const alone = { device: field, hours: false, rested: false, vitals: false };
    const webA = await readWeb(alone);
    const mobA = await readMobile(alone);
    assert.equal(webA.present, true, 'web card exists on measured evidence alone');
    assert.equal(webA.badge, true, `web must badge ${field} as device-synced`);
    assert.equal(webA.device, true, 'web renders the measured cells');
    assert.equal(mobA.device, true, `mobile must count ${field} as device evidence`);
    assert.equal(mobA.sleepRedact, false, 'a device that reported is not a failed sync');
    assert.equal(mobA.heading, HEAD_SLEEP, 'mobile heading on measured evidence alone');
    assert.equal(webA.heading, HEAD_SLEEP, 'web heading on measured evidence alone');

    // Same field, with the member's own gauges alongside: a surface that has
    // dropped this term from its predicate now heads the card DAILY CHECK-IN
    // while its twin still says SLEEP · RECOVERY.
    const withVitals = { device: field, hours: false, rested: false, vitals: true };
    const webV = await readWeb(withVitals);
    const mobV = await readMobile(withVitals);
    assert.equal(mobV.heading, HEAD_SLEEP, `mobile: ${field} must suppress the check-in heading`);
    assert.equal(webV.heading, HEAD_SLEEP, `web: ${field} must suppress the check-in heading`);
    assert.equal(mobV.heading, webV.heading, 'the two Case Files must agree with vitals alongside');
    assert.equal(webV.badge, true, 'web badges the device even with vitals alongside');
    assert.equal(mobV.device, true, 'mobile keeps its measured cells with vitals alongside');
  });
}

// ── the full cross-product, surface against surface ─────────────────────────
// The grid above pins each surface to a written-down expectation; this pins the
// two to EACH OTHER over every vector at once (6 device fields x 16 rows). It
// carries no expectation of its own, so it survives any future change to the
// rule and still fails the moment the twins disagree.
test('mobile and web agree on every (device-field x presence) vector', async () => {
  const disagreements = [];
  for (const field of Object.keys(DEVICE_FIELDS)) {
    for (const c of GRID) {
      const vec = { device: c.d ? field : null, hours: !!c.h, rested: !!c.r, vitals: !!c.v };
      const web = await readWeb(vec);
      const mob = await readMobile(vec);
      const anyCell = mob.device || mob.hours || mob.rested || mob.vitals;
      const label = `${c.d ? field : 'no-device'} ${vname(c)}`;
      if (web.present !== anyCell) disagreements.push(`${label}: web card=${web.present} vs mobile cells=${anyCell}`);
      if (web.present && web.heading !== mob.heading) disagreements.push(`${label}: web "${web.heading}" vs mobile "${mob.heading}"`);
      for (const leg of ['device', 'hours', 'rested', 'vitals']) {
        if (web[leg] !== mob[leg]) disagreements.push(`${label}: ${leg} web=${web[leg]} vs mobile=${mob[leg]}`);
      }
    }
  }
  assert.deepEqual(disagreements, [], disagreements.join('\n'));
});

// ── the chokepoint itself ───────────────────────────────────────────────────
// Behaviour catches a recombination only once it has already produced a wrong
// heading. This catches the recombination. Round 5 was exactly that: the model
// was derived correctly and then the render site rebuilt the claim out of
// `hasDevice` again, so the derived flag and the rendered heading disagreed.
//
// Scoped to the heading's OWN expression — bounded by the syntax that opens and
// closes it, not by a line count, because mobile's spans three lines and the
// very next line legitimately reads `caseHasDevice` (it gates the card body).
// A window that drifted one line would fail on correct code.
function headingExpression(src, anchor, open, close) {
  const lines = src.split('\n');
  const at = lines.findIndex((l) => anchor.test(l));
  assert.ok(at >= 0, `heading anchor ${anchor} not found — the render site moved`);
  let start = at;
  while (start > 0 && !open.test(lines[start])) start -= 1;
  let end = at;
  while (end < lines.length - 1 && !close.test(lines[end])) end += 1;
  return lines.slice(start, end + 1).join('\n');
}

test('neither surface rebuilds the heading claim at the render site', () => {
  const mobileHead = headingExpression(
    readFileSync(MOBILE_SRC, 'utf8'),
    /coach:case\.dailyCheckin/, /label=\{/, /coach:case\.sleepRecovery/,
  );
  assert.match(mobileHead, /caseCheckinHeading/, 'mobile heading must read the pre-derived flag');
  assert.doesNotMatch(mobileHead, /caseHasDevice|caseHasEntered|caseHasHours|caseHasRested/,
    'mobile heading must not recombine the presence booleans');

  const webHead = headingExpression(
    readFileSync(WEB_SRC, 'utf8'),
    /<CKSecHead>.*DAILY CHECK-IN/, /<CKSecHead>/, /<\/CKSecHead>/,
  );
  assert.match(webHead, /checkinHeading/, 'web heading must read the pre-derived flag');
  assert.doesNotMatch(webHead, /hasDevice|hasEntered|hasHours|hasRested/,
    'web heading must not recombine the presence booleans');
});
