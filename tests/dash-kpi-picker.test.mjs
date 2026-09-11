// The KPI picker for the two coach Today stat strips (review 2026-09-09, R15).
//
// ⚠ THE POOL IS DRIVEN, NOT DESCRIBED. Every metric is a pure derivation in
// `dashSignals.js` over state Today already holds, so each one is executed here against
// real fixtures — the alternative, pinning the spellings in `dashToday.jsx`, would pass on
// a metric that computes the wrong number and fail on a correct rename.
//
// The rules this suite exists to hold:
//   · a metric that cannot be answered returns null WITH a reason — never 0;
//   · a measured zero IS a value and reads as one;
//   · an unreadable client is counted, not coerced, so MRR cannot silently under-report;
//   · choosing a metric already on the strip SWAPS the two — it never duplicates;
//   · a stored key this build does not know costs one slot, and never throws.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { stripComments } from './helpers/strip-comments.mjs';

const require = createRequire(import.meta.url);
const S = require('../public/newdesign/dashSignals.js');
const TODAY = stripComments(readFileSync(new URL('../public/newdesign/dashToday.jsx', import.meta.url), 'utf8'));
const GRID = stripComments(readFileSync(new URL('../public/newdesign/dashGrid.jsx', import.meta.url), 'utf8'));
const DATA = stripComments(readFileSync(new URL('../public/newdesign/dashData.jsx', import.meta.url), 'utf8'));

const KEYS = { week: 'sessionsThisWeek', upcoming: 'upcomingSessions', total: 'totalSessions' };
const ctx = (over) => Object.assign(
  { live: null, clients: [], triage: [], queue: [], schedule: [], role: 'trainer', kpiKeys: KEYS },
  over
);
const client = (over) => Object.assign({ profile: { id: 'c', name: 'C', isNew: false } }, over);

test('the pool is the one the module publishes, and every key resolves', () => {
  assert.ok(S.DASH_KPI_KEYS.length >= 8, 'the pool shrank to ' + S.DASH_KPI_KEYS.length);
  for (const k of S.DASH_KPI_KEYS) {
    assert.ok(S.dashKpiLabel(k, 'trainer'), k + ' has no trainer label');
    assert.ok(S.dashKpiLabel(k, 'nutritionist'), k + ' has no nutritionist label');
    const out = S.dashKpiValue(k, ctx());
    assert.ok(out && typeof out === 'object', k + ' resolved to nothing on an empty page');
  }
});

test('a metric that cannot be answered says WHY — it never resolves to zero', () => {
  // Live-only metrics on a page with no payload.
  for (const k of ['weekSessions', 'upcoming', 'totalSessions']) {
    const out = S.dashKpiValue(k, ctx());
    assert.equal(out.value, null, k + ' invented a figure with no payload');
    assert.match(out.why, /live only/);
  }
  // And a roster nobody shares money for.
  const unknown = S.dashKpiValue('mrr', ctx({ clients: [client({ payments: { mrrCents: null } })] }));
  assert.equal(unknown.value, null);
  assert.match(unknown.why, /not shared/);
});

test('a MEASURED zero is a value, and reads as one', () => {
  const zero = S.dashKpiValue('mrr', ctx({ clients: [client({ payments: { mrrCents: 0 } })] }));
  assert.equal(zero.value, 0, 'a client on no paid plan is $0, not unknown');
  assert.equal(zero.why, undefined);
  const noFlags = S.dashKpiValue('needsEyes', ctx({ triage: [{ severity: 'green' }, { severity: 'green' }] }));
  assert.equal(noFlags.value, 0);
  assert.match(noFlags.sub, /of 2 on the pulse/);
});

test('an unreadable client is COUNTED, not coerced — MRR cannot silently under-report', () => {
  // ⚠ `|| 0` HERE WOULD PUBLISH A SMALLER PRACTICE WITH NOTHING SAYING SO. The roster
  // route emits null for a client whose subscriptions read failed, and a coach reading
  // "Monthly recurring" has no way to know a row was dropped unless the strip says it.
  const rows = [
    client({ payments: { mrrCents: 10000 } }),
    client({ payments: { mrrCents: null } }),
    client({ payments: { mrrCents: 20000 } }),
  ];
  const out = S.dashKpiValue('mrr', ctx({ clients: rows }));
  assert.equal(out.value, 30000, 'the readable rows still sum');
  assert.match(out.sub, /2 of 3 shared/);
  // and a fully-readable roster says the plain count
  const all = S.dashKpiValue('mrr', ctx({ clients: [rows[0], rows[2]] }));
  assert.match(all.sub, /^2 clients$/);
});

test('the capped total is a FLOOR and says so — it is never labelled all-time', () => {
  const kpis = { totalSessions: 500, totalCapped: true };
  const capped = S.dashKpiValue('totalSessions', ctx({ live: { kpis } }));
  assert.equal(capped.value, 500);
  assert.equal(capped.capped, true);
  const open = S.dashKpiValue('totalSessions', ctx({ live: { kpis: { totalSessions: 12, totalCapped: false } } }));
  assert.equal(open.capped, false);
  assert.equal(open.sub, null);
  // and the label never claims a total
  for (const role of ['trainer', 'nutritionist']) {
    assert.doesNotMatch(S.dashKpiLabel('totalSessions', role), /all[- ]?time|total/i);
  }
});

test('the empty-schedule placeholder is not a session', () => {
  // cfg.emptySchedule carries an em-dash for its time; counting it would report one
  // session on a day the coach has none.
  const empty = S.dashKpiValue('todaySessions', ctx({ schedule: [{ time: '—', who: 'No sessions today' }] }));
  assert.equal(empty.value, 0);
  assert.match(empty.sub, /all done/);
  const two = S.dashKpiValue('todaySessions', ctx({ schedule: [{ time: '07:00' }, { time: '14:00', status: 'NEXT' }] }));
  assert.equal(two.value, 2);
  assert.match(two.sub, /next 14:00/);
});

test('monthlyNet is MRR after the one named fee rate — not a second spelling of it', () => {
  const rows = [client({ payments: { mrrCents: 100000 } })];
  const gross = S.dashKpiValue('mrr', ctx({ clients: rows })).value;
  const net = S.dashKpiValue('monthlyNet', ctx({ clients: rows })).value;
  assert.equal(net, Math.round(gross * S.PREVIEW_NET_RATE));
  // live takes the payload's own net rather than re-deriving it
  const live = S.dashKpiValue('monthlyNet', ctx({ live: { kpis: { monthlyNetCents: 4242 } } }));
  assert.equal(live.value, 4242);
});

test('the new-clients window is the 14 days `isNew` actually means', () => {
  const out = S.dashKpiValue('newClients', ctx({
    clients: [client({ profile: { id: 'a', isNew: true } }), client({ profile: { id: 'b', isNew: false } })],
  }));
  assert.equal(out.value, 1);
  assert.match(out.sub, /14d/);
  assert.doesNotMatch(out.sub, /month|30/i, 'the sub describes a window isNew does not use');
});

test('picking a metric already on the strip SWAPS the two — never duplicates, never drops', () => {
  assert.deepEqual(S.dashKpiPick(['a', 'b', 'c', 'd'], 0, 'c'), ['c', 'b', 'a', 'd']);
  // picking what is already there is a no-op
  assert.deepEqual(S.dashKpiPick(['a', 'b', 'c', 'd'], 1, 'b'), ['a', 'b', 'c', 'd']);
  // a metric not on the strip simply lands
  assert.deepEqual(S.dashKpiPick(['a', 'b', 'c', 'd'], 3, 'z'), ['a', 'b', 'c', 'z']);
  // every result is four distinct keys
  for (const [slot, key] of [[0, 'c'], [2, 'a'], [3, 'b'], [1, 'z']]) {
    const out = S.dashKpiPick(['a', 'b', 'c', 'd'], slot, key);
    assert.equal(out.length, 4);
    assert.equal(new Set(out).size, 4, 'a pick duplicated a metric: ' + out.join(','));
  }
  // an out-of-range slot changes nothing rather than growing the strip
  assert.deepEqual(S.dashKpiPick(['a', 'b'], 5, 'z'), ['a', 'b']);
});

test('a key this build does not recognise is a redaction, never a throw', () => {
  // ⚠ THERE IS NO ERROR BOUNDARY ANYWHERE IN public/newdesign, so a strip that throws on a
  // stored key from a later build takes the whole page to blank.
  assert.equal(S.dashKpiValue('retired-metric', ctx()), null);
  assert.equal(S.dashKpiLabel('retired-metric', 'trainer'), null);
  assert.doesNotThrow(() => S.dashKpiValue('mrr', { clients: null, triage: null, queue: null, schedule: null }));
  assert.doesNotThrow(() => S.dashKpiValue('needsEyes', {}));
  assert.doesNotThrow(() => S.dashKpiValue('todaySessions', { schedule: [null, undefined, {}] }));
});

// ── the strip, and where the ⚙ is offered ───────────────────────────────────
test('the OVERVIEW picker is offered only with a live payload; PRACTICE always', () => {
  // ⚠ The preview's Overview strip is the payout card's own preview, not a reading of any
  // account — a picker over it would let a visitor rearrange figures that describe nobody.
  assert.match(TODAY, /settings: live \? dashKpiSettings\(overviewKpis, role, setOverviewKpis\) : undefined/);
  assert.match(TODAY, /settings: dashKpiSettings\(practiceChosen, role, setPracticeKpis\)/);
  assert.match(TODAY, /const kpis = live \? overviewKpis\.map/);
  assert.match(TODAY, /: cfg\.mockKpis\(\)/, 'the preview stopped showing the payout preview');
});

test('the strip formats from the RAW value — the pure module never formats money', () => {
  const src = readFileSync(new URL('../public/newdesign/dashSignals.js', import.meta.url), 'utf8');
  const at = src.indexOf('var DASH_KPI_METRICS');
  const end = src.indexOf('var DASH_KPI_KEYS');
  assert.ok(at > 0 && end > at, 'the catalog moved');
  const pool = src.slice(at, end);
  assert.doesNotMatch(pool, /toLocaleString|\$"|'\$'/, 'the pure pool started formatting currency');
  // and the formatter is the one the rest of the page uses
  assert.match(TODAY, /out\.unit === "money" \? dashMoney\(n\)/);
  assert.match(TODAY, /out\.capped \? String\(n\) \+ "\+"/);
});

test('the strip is ONE hook over four per-role keys — a swap cannot half-persist', () => {
  // ⚠ RE-ANCHORED ON THE INVARIANT. This asserted four written-out
  // `useRememberedChoice` calls, which is the shape Codex found unsafe on #2046: a swap
  // moves two slots, and two hooks take that to the document as two whole-document
  // writes, so a first that lands beside a second that fails leaves the same metric in
  // both slots. Pinning the old spelling would have FAILED the fix. What this suite
  // actually cares about is one write for one arrangement, and one key per slot per role.
  const at = TODAY.indexOf('function useDashKpiStrip(');
  assert.ok(at > 0, 'useDashKpiStrip moved');
  const body = TODAY.slice(at, TODAY.indexOf('\n}\n', at));
  const slotHooks = body.match(/useRememberedChoice\(/g) || [];
  assert.equal(slotHooks.length, 0, 'a per-slot hook is back: a swap can half-persist again');
  assert.equal((body.match(/useRememberedSlots\(/g) || []).length, 1, 'the strip must go through exactly one hook');
  // per role, so a dual-role coach keeps two arrangements
  assert.match(body, /"kpi:" \+ role \+ ":" \+ strip \+ ":"/);
  // four slots, spelled out — a loop would make the hook count depend on data
  assert.match(body, /base \+ "0", base \+ "1", base \+ "2", base \+ "3"/);
  assert.doesNotMatch(body, /for \([^)]*\)\s*\{[^}]*useRemembered/, 'the keys went into a loop');
});

test('the slot hook writes every changed key in ONE apply', () => {
  // The atomicity lives in `dashData.jsx`, so it is asserted where it lives rather than
  // inferred from the caller. (Driven end to end in dashboard-remembered-choices.test.mjs.)
  const at = DATA.indexOf('function useRememberedSlots(');
  assert.ok(at > 0, 'useRememberedSlots moved');
  const body = DATA.slice(at, DATA.indexOf('\n}\n', at));
  assert.equal((body.match(/apply\(/g) || []).length, 1, 'more than one apply: the arrangement can half-land');
  assert.match(body, /for \(let i = 0; i < keys\.length; i\+\+\) \{\s*if \(want\[i\] === undefined\) delete out\[keys\[i\]\]; else out\[keys\[i\]\] = want\[i\];/,
    'the single apply no longer writes every key');
  // a value we would refuse to read back stops the WHOLE write, not just its own slot
  assert.match(body, /for \(let i = 0; i < chosen\.length; i\+\+\) if \(allowed\.indexOf\(chosen\[i\]\) < 0\) return;/);
});

test('a long settings group renders as a select, and hands back the option value', () => {
  // ⚠ ELEVEN CHIPS IN A 240px POPOVER IS FIVE ROWS, FOUR TIMES OVER. The threshold is the
  // panel's width, not a preference.
  assert.match(GRID, /const DG_SELECT_AT = \d+;/);
  assert.match(GRID, /g\.options\.length > DG_SELECT_AT \? \(/);
  // the DOM value is a string; the widget must get its own value back
  assert.match(GRID, /const picked = g\.options\.filter\(\(o\) => String\(o\.v\) === e\.target\.value\)\[0\];/);
  assert.match(GRID, /if \(picked\) g\.onPick\(picked\.v\);/);
  assert.doesNotMatch(GRID, /onChange=\{\(e\) => \{ e\.stopPropagation\(\); g\.onPick\(e\.target\.value\); \}\}/);
  // ⚠ `appearance: none` TAKES THE NATIVE ARROW WITH IT, so the chevron is drawn back —
  // otherwise the control is a plain box with nothing saying it opens. And the colour is a
  // background LAYER: a colour in any but the final layer voids the whole declaration,
  // which is how two page textures once made every page background transparent — so the
  // image goes in `backgroundImage` and the fill in `backgroundColor`, never one shorthand.
  const styleAt = GRID.indexOf('appearance: "none"');
  assert.ok(styleAt > 0, 'the select no longer suppresses the native control');
  const block = GRID.slice(GRID.lastIndexOf('style={{', styleAt), styleAt);
  assert.match(block, /backgroundImage: "url\(/, 'appearance:none with no chevron drawn back');
  assert.match(block, /backgroundColor: "rgba/, 'the fill moved into a shorthand beside the image');
  assert.doesNotMatch(block, /\bbackground: "/, 'the select went back to a background shorthand');
  assert.match(block, /padding: "6px 22px/, 'the text can run under the chevron');
  // and the pool really is over the threshold, or the select is dead code
  const at = GRID.indexOf('const DG_SELECT_AT = ');
  const threshold = Number(GRID.slice(at).match(/= (\d+);/)[1]);
  assert.ok(S.DASH_KPI_KEYS.length > threshold,
    'the pool (' + S.DASH_KPI_KEYS.length + ') no longer trips DG_SELECT_AT (' + threshold + ')');
});

test('the defaults are exactly what the strips showed before the picker existed', () => {
  // A coach who never opens the ⚙ must see no change at all — and because
  // `useRememberedChoice` deletes a key equal to its default, they store nothing either.
  assert.match(TODAY, /const DASH_OVERVIEW_DEFAULT = \["activeClients", "monthlyNet", "weekSessions", "upcoming"\];/);
  assert.match(TODAY, /const DASH_PRACTICE_DEFAULT = \["todaySessions", "due", "compliance", "mrr"\];/);
  for (const k of ['activeClients', 'monthlyNet', 'weekSessions', 'upcoming', 'todaySessions', 'due', 'compliance', 'mrr']) {
    assert.ok(S.DASH_KPI_KEYS.includes(k), k + ' is a default but not in the pool');
  }
});

test('the strips still say the words they said before the picker', () => {
  // ⚠ THE ROLE CONFIG NO LONGER CARRIES THESE LABELS — they live once in the catalog,
  // beside the derivation, because the ⚙ lists every metric by name and a second spelling
  // in `DASH_TODAY_ROLES` would disagree with the picker. This pins the continuity the
  // move has to preserve: a coach who never opens the gear sees the same four headings.
  assert.equal(S.dashKpiLabel('weekSessions', 'trainer'), 'Sessions this week');
  assert.equal(S.dashKpiLabel('weekSessions', 'nutritionist'), 'Consults this week');
  assert.equal(S.dashKpiLabel('upcoming', 'trainer'), 'Upcoming sessions');
  assert.equal(S.dashKpiLabel('upcoming', 'nutritionist'), 'Upcoming consults');
  assert.equal(S.dashKpiLabel('activeClients', 'trainer'), 'Active clients');
  assert.equal(S.dashKpiLabel('mrr', 'trainer'), 'Monthly recurring');
  assert.equal(S.dashKpiLabel('todaySessions', 'nutritionist'), 'Consults today');
  assert.equal(S.dashKpiLabel('due', 'nutritionist'), 'Plans due');
  // and the dead config really is gone, or the next reader will edit the wrong copy
  assert.doesNotMatch(TODAY, /weekLabel:/);
  assert.doesNotMatch(TODAY, /upcomingLabel:/);
});

// ── The settings panel escapes the card's clip box (Codex P1, #2046) ──────────
//
// ⚠ THE DEFECT WAS MEASURED, NOT REASONED ABOUT. `.dash-gridstack
// .grid-stack-item-content` is `overflow:hidden!important` and an absolutely-positioned
// child does not grow the box it hangs in, so on the KPI strip — a 110px card carrying a
// four-group panel — the slot pickers sat at y 59–86 / 112–139 / 165–192 / 218–245 and
// THREE OF FOUR fell outside the clip box. A coach could change the first slot and
// nothing else. Every element was in the DOM the whole time, which is exactly why
// counting them passed: only their geometry against the card said anything.
const dgPanelBox = (() => {
  const at = GRID.indexOf('function dgPanelBox(');
  assert.ok(at > 0, 'dgPanelBox moved');
  const body = GRID.slice(at, GRID.indexOf('\n}\n', at) + 3);
  const head = GRID.slice(GRID.indexOf('const DG_GUT'), GRID.indexOf('function dgPanelBox('));
  assert.match(head, /DG_PANEL_W/, 'the panel constants moved');
  return new Function(head + body + '\nreturn dgPanelBox;')();
})();
const gearAt = (right, top, h = 18) => ({ right, left: right - 18, top, bottom: top + h });

test('the panel is portaled out of the card, not positioned inside it', () => {
  assert.match(GRID, /ReactDOM\.createPortal\(/, 'the panel is back inside the clipped card');
  const at = GRID.indexOf('function DgCardSettings(');
  const body = GRID.slice(at, GRID.indexOf('\nfunction DashGrid(', at));
  assert.match(body, /ReactDOM\.createPortal\(/);
  assert.match(body, /document\.body\s*\n?\s*\)\}/, 'the portal target is no longer document.body');
  assert.match(body, /position: "fixed"/, 'a portaled panel positioned `absolute` lands relative to <body>, not the gear');
  assert.doesNotMatch(body, /position: "absolute", top: "100%"/, 'the old in-card placement is back');
});

test('the away test asks the PANEL as well as the gear — a portal breaks `contains`', () => {
  // With only the gear's wrapper tested, the first click inside the portaled panel reads
  // as a click outside it and closes the thing you are using.
  const at = GRID.indexOf('function DgCardSettings(');
  const body = GRID.slice(at, GRID.indexOf('\nfunction DashGrid(', at));
  assert.match(body, /panelRef\.current && panelRef\.current\.contains\(e\.target\)/);
  assert.match(body, /if \(!inGear && !inPanel\) setOpen\(false\);/);
});

test('the panel is inside both gutters at every width, including narrower than itself', () => {
  // ⚠ THE SWEEP HAS TO REACH BELOW EVERY CONSTANT'S BITE POINT, and it has now been
  // short of one twice. At 264 the panel plus two gutters exactly fills the viewport, so
  // above that an uncapped panel still fits and a mutation removing the cap SURVIVES —
  // which it did on the first round, with 320 as the narrowest case. Extending it to 240
  // caught that and still stopped short of **144**, where the old 120px minimum width
  // made the two-gutter interval EMPTY: at vw 128 the panel ran 16px past the right
  // gutter, growing as the viewport narrowed. A 640px phone at 500% zoom is 128 CSS px,
  // so this is an accessibility path, not a hypothetical. (Codex, #2046.)
  for (const vw of [40, 64, 100, 128, 144, 160, 200, 240, 264, 320, 360, 390, 430, 700, 900, 1024, 1200, 1440]) {
    for (const right of [24, 60, vw / 2, vw - 40, vw - 8, vw]) {
      const b = dgPanelBox(gearAt(right, 120), vw, 900);
      assert.ok(b.width > 0, `zero-width panel at vw=${vw}`);
      // Below 2× the gutter there is no interval at all, and the panel is 1px wide by
      // construction — a viewport that narrow has no layout to be right about. Every
      // width a browser can actually produce is above it.
      if (vw <= 12 * 2) continue;
      assert.ok(b.left >= 12 - 0.001, `left gutter crossed at vw=${vw} right=${right}: ${b.left}`);
      assert.ok(b.left + b.width <= vw - 12 + 0.001, `right gutter crossed at vw=${vw} right=${right}: ${b.left + b.width}`);
    }
  }
});

test('the panel right-aligns on the gear wherever there is room for it', () => {
  const b = dgPanelBox(gearAt(1357, 220), 1440, 1400);
  assert.equal(b.left + b.width, 1357, 'the panel no longer hangs from the gear');
  assert.equal(b.up, false);
  assert.equal(b.offset, 220 + 18 + 6, 'the panel does not sit under the gear');
});

test('a gear with no room below opens UPWARD, and only when there is more room there', () => {
  // 80px of screen under the gear, 600 above it.
  const up = dgPanelBox(gearAt(900, 700), 1200, 800);
  assert.equal(up.up, true);
  assert.equal(up.offset, 800 - 700 + 6, 'the upward panel is pinned to the gear, not to the viewport');
  assert.ok(up.maxHeight > 400);
  // Cramped BOTH ways — flipping would only turn a short panel upside down.
  const tight = dgPanelBox(gearAt(900, 150), 1200, 340);
  assert.equal(tight.up, false, 'flipped into less room than it came from');
});

test('the panel is capped to the room it has, so it scrolls rather than running off screen', () => {
  // ⚠ THE INVARIANT IS ORIENTATION-AGNOSTIC, and my first version of this test was not:
  // it restated the DOWNWARD arithmetic and then fed it a gear that legitimately flips up.
  // What the panel actually promises is that its own box stays inside both vertical
  // gutters, whichever way it hangs — so that is what is swept.
  const GUT = 12, FLOOR = 80;
  for (const vh of [340, 420, 600, 760, 900, 1400]) {
    for (const top of [0, 20, 120, Math.round(vh / 2), vh - 120, vh - 30]) {
      const g = gearAt(900, top);
      const b = dgPanelBox(g, 1200, vh);
      const boxTop = b.up ? vh - b.offset - b.maxHeight : b.offset;
      const boxBottom = b.up ? vh - b.offset : b.offset + b.maxHeight;
      assert.ok(b.maxHeight >= FLOOR, `no room left to scroll at vh=${vh} top=${top}`);
      // The floor wins on a viewport too small for anything: 80px of scrollable panel
      // beats a 30px sliver, and it is the only case allowed to cross a gutter.
      if (b.maxHeight > FLOOR) {
        assert.ok(boxTop >= GUT - 0.001, `top gutter crossed at vh=${vh} top=${top}: ${boxTop}`);
        assert.ok(boxBottom <= vh - GUT + 0.001, `bottom gutter crossed at vh=${vh} top=${top}: ${boxBottom}`);
        // and it never covers the control that opened it
        if (b.up) assert.ok(boxBottom <= g.top + 0.001, `the upward panel covers its own gear at vh=${vh} top=${top}`);
        else assert.ok(boxTop >= g.bottom - 0.001, `the panel covers its own gear at vh=${vh} top=${top}`);
      }
    }
  }
});
