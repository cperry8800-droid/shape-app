// The Cook Mode orchestration layer (spec 2026-07-21 §6). A Prep Session cooks
// several recipes in one sitting; a naive session runs them back-to-back. This
// pure, deterministic, injected-clock interleaver does better ONLY where the
// recipe honestly allows it: during recipe A's authored PASSIVE window (hands-off,
// a real duration, a known station — e.g. "roast 30 minutes", oven), it surfaces
// recipe B's active steps, so "while the chicken roasts, start tomorrow's rice."
//
// Owner constraint (binding): no fabricated parallelism. Interleaving requires
// EXPLICIT structured metadata — `passive === true` + a station + `min ≥ minPassive`
// — never a merely-parsed duration (a "simmer 20 min, stirring" is not hands-off).
// A recipe (or a whole session) lacking such windows falls back to SERIAL: the
// board never claims a HOLDING lane it can't back with a real running timer.
//
// Output is ORDER + timing only; the live HOLDING countdowns are the UI's real
// timers. No Date/random — `at` is a relative minute offset from an injected clock,
// so timelines are pinnable in tests.

// The cook's answer to "together or one at a time?", asked before a session starts.
export const BS_COOK_MODE = {
  AUTO: 'auto',          // historical behaviour: interleave when the data allows
  TOGETHER: 'together',  // weave to save total time (dishes finish when they finish)
  SEQUENCE: 'sequence',  // one dish, then the next
  SERVE: 'serve',        // land every dish at ONE serve time (guests; nothing goes cold)
};

// Why a timeline came back serial. The UI shows this as the REASON beside a disabled
// "Together", because "unavailable" with no explanation reads as a broken feature.
export const BS_SERIAL_REASON = {
  SINGLE: 'single',        // only one dish — nothing to interleave with
  NO_WINDOW: 'no-window',  // no dish has an authored passive window to host a detour
  STATIONS: 'stations',    // windows exist, but every detour was blocked by its station
  CHOSEN: 'chosen',        // the cook asked for one-at-a-time
};

// SERVE mode only. Why a plan could not put every dish on the table at once.
export const BS_SERVE_ISSUE = {
  TOO_SOON: 'too-soon',    // the serve time is earlier than the longest dish can be cooked
  STATIONS: 'stations',    // an exclusive station forced a dish to finish early
};

export const BS_ORCH = {
  activeStepMin: 3, // assumed hands-on minutes per active step (the injected clock)
  minPassive: 4,    // a passive step must be at least this long to host a detour
};

const STATIONS_EXCLUSIVE = ['oven', 'stove', 'board']; // 'off' (rest/chill) ties up nothing

// How many dishes a station can hold AT ONCE. The engine used to assume one of
// everything, which is right for an oven and wrong for a hob: a cook with four burners
// was told three stove dishes could not be served together when their own kitchen could
// do it comfortably. The recipes are untouched by this -- a step already carries its
// station; only the CAPACITY of that station is a fact about the kitchen, not the food.
// Defaults are deliberately the old behaviour, so an unconfigured kitchen schedules
// exactly as before rather than quietly promising a hob nobody owns.
export const BS_KITCHEN_DEFAULT = { stove: 1, oven: 1, board: 1 };

const capacityOf = (station, kitchen) => {
  const raw = kitchen && kitchen[station];
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : NaN;
  // A junk or absent figure falls back to the conservative default; a kitchen claiming
  // zero burners is treated as one, because refusing to schedule at all is worse than
  // scheduling as we always did.
  return Number.isFinite(n) && n >= 1 ? n : (BS_KITCHEN_DEFAULT[station] || 1);
};

// Is this station full for the window [from, to)? Measures PEAK SIMULTANEOUS occupancy
// against the station's real capacity, and returns the backwards pull that clears the
// first full instant, or null when there is room.
//
// ⚠ Counting the holds that merely INTERSECT [from, to) is not the same question and
// gets it wrong above capacity 1: on two burners, existing holds [0,5) and [5,10) tile
// the window without ever running at once, so a proposed [0,10) peaks at two burners,
// not three, and fits. Intersection-counting called that full and pushed an attainable
// 10-minute plan out to 15 with a spurious 'stations' issue (Codex, round 1).
//
// Occupancy is piecewise-constant and only ever rises at a hold's START, so those
// boundaries plus `from` are the only instants worth sampling.
const stationPull = (holds, station, from, to, kitchen) => {
  if (station == null || !STATIONS_EXCLUSIVE.includes(station)) return null;
  const mine = holds.filter((h) => h.station === station && from < h.to && h.from < to);
  if (!mine.length) return null;
  const cap = capacityOf(station, kitchen);
  const points = [from, ...mine.map((h) => h.from).filter((f) => f > from && f < to)].sort((a, b) => a - b);
  for (const t of points) {
    const busy = mine.reduce((n, h) => n + (h.from <= t && t < h.to ? 1 : 0), 0);
    // The proposal would be one more pan on that station at instant t.
    if (busy + 1 > cap) return Math.max(1, to - t);
  }
  return null;
};

const posInt = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback);
const realMin = (m) => (m && typeof m.min === 'number' && Number.isFinite(m.min) && m.min > 0 ? m.min : null);

// A step is an interleave-hosting WINDOW only with all three authored signals.
const isWindow = (m, minPassive) => !!m && m.passive === true && m.station != null && (realMin(m) ?? 0) >= minPassive;

const cleanRecipes = (recipes) =>
  (Array.isArray(recipes) ? recipes : [])
    .filter((r) => r && Array.isArray(r.steps) && r.steps.length)
    .map((r, iid) => ({ iid, key: r.key, title: r.title, steps: r.steps, meta: Array.isArray(r.stepMeta) ? r.stepMeta : [] }));

const evt = (r, i, at) => {
  const m = r.meta[i] || {};
  const passive = m.passive === true;
  const min = realMin(m);
  // `iid` = the internal per-input instance id. Two selected instances of the
  // SAME recipe share a display `recipe` key but must never cross-clear each
  // other's hold / merge their steps (CodeRabbit) — scheduling keys on `iid`,
  // `recipe` stays the catalog/display key the UI reads.
  return { recipe: r.key, iid: r.iid, title: r.title, stepIndex: i, text: r.steps[i], at, min, passive, station: m.station ?? null };
};

// Serial: every recipe's steps in order, back-to-back. A passive step still
// "costs" its own duration on the clock (you wait it out); active steps cost the
// injected active-step minutes. Honest fallback — no HOLDING lanes form.
const serialTimeline = (rs, activeMin) => {
  const timeline = [];
  let at = 0;
  for (const r of rs) {
    for (let i = 0; i < r.steps.length; i++) {
      const e = evt(r, i, at);
      timeline.push(e);
      at += e.passive && e.min ? e.min : activeMin;
    }
  }
  return timeline;
};

// The greedy discrete-event interleaver. Deterministic tie-break: input order.
// SERVE-TOGETHER scheduling — the dinner-party objective, and a DIFFERENT one from
// interleaving. `together` starts everything as early as it can, which minimises the
// total session but scatters the finishes: measured on this catalog, two dishes land
// 21 minutes apart and the first one sits going cold. Here the target is the opposite —
// every dish plates at the SAME moment — so the schedule is built BACKWARDS from the
// serve time: a dish does not wait to be eaten, it waits to be started.
//
// Longest dish first, each placed as late as it can be. When an exclusive station
// (oven/stove/board) is already held, the dish is pulled EARLIER by the smallest amount
// that clears the clash — which means it finishes early, and that is reported rather
// than hidden. `off` (rest/chill) holds nothing and never forces a pull.
const durationOf = (r, activeMin) => r.steps.reduce((n, _s, i) => n + (realMin(r.meta[i]) ?? activeMin), 0);

// ⚠ ONE COOK, TWO HANDS. Station capacity says nothing about the PERSON. Two dishes can
// each want three minutes of chopping in the same three minutes with no station contended,
// so the placement called that feasible and reported `spread: 0` — a plan where everything
// lands together, that nobody can actually perform. Measured across the catalog, 1,688 of
// 1,770 pairs were scheduled that way, and the board then presents those steps one after
// the other, so the second dish finishes after the time the plan promised.
//
// This matters most to the mode whose whole point is the saving. Cooking two dishes back to
// back means waiting out the first before starting the second; overlapping them is the
// saving, and the saving is REAL only when dish B's hands-on work sits inside dish A's HOLD
// rather than on top of dish A's hands-on work. Modelling the cook makes the promised finish
// achievable instead of merely arithmetic — and shrinks the claimed saving to the true one.
//
// A hold needs no hands, which is exactly why it can host another dish. Deliberately kept
// local to serve placement: `bsOrchestrate`'s interleaver advances one recipe at a time and
// so has always serialised the cook implicitly.
const HANDS_CAPACITY = 1;
const needsHands = (m) => m.passive !== true;
const handsPull = (busy, from, to) => {
  const mine = busy.filter((h) => from < h.to && h.from < to);
  if (mine.length + 1 <= HANDS_CAPACITY) return null;
  // Pull the dish earlier by enough to finish this step before the earliest step it hits.
  return Math.max(1, to - Math.min(...mine.map((h) => h.from)));
};

function placeAt(rs, activeMin, T, kitchen, orderIdx) {
  // Place every dish to END at T, pulling a dish earlier when an exclusive station is
  // already held OR the cook is already busy. Returns feasible:false when a dish still clashes after being pulled
  // all the way to t=0 — that is not a schedule to be shown, it is proof that T is too
  // early for these dishes TOGETHER.
  // `orderIdx` places the dishes in a given order; without it, longest first as before.
  const order = orderIdx
    ? orderIdx.map((k) => ({ r: rs[k], dur: durationOf(rs[k], activeMin), i: k }))
    : rs.map((r, i) => ({ r, dur: durationOf(r, activeMin), i })).sort((a, b) => b.dur - a.dur || a.i - b.i);
  const holds = [];
  const hands = [];
  const placed = [];
  let pulled = false;
  let deficit = 0;

  for (const { r, dur } of order) {
    let start = T - dur;
    let clash = 0;
    for (let guard = 0; guard <= rs.length * (r.steps.length + 1) + 8; guard++) {
      let at = start;
      clash = 0;
      for (let i = 0; i < r.steps.length && !clash; i++) {
        const m = r.meta[i] || {};
        const len = realMin(m) ?? activeMin;
        const st = m.station ?? null;
        // Both resources are tested and the LARGER pull taken, so one pass clears both
        // rather than ping-ponging the dish between a station and the cook.
        const pull = Math.max(
          stationPull(holds, st, at, at + len, kitchen) || 0,
          needsHands(m) ? (handsPull(hands, at, at + len) || 0) : 0,
        );
        if (pull) clash = pull;
        at += len;
      }
      if (!clash) break;
      if (start - clash < 0) break;   // cannot pull further — T itself is too early
      start -= clash;
      pulled = true;
    }
    if (clash) {
      // Infeasible at this T. The shortfall is how much later T must be for this dish
      // to clear the station it is blocked on.
      deficit = Math.max(deficit, clash - start);
      return { feasible: false, deficit: Math.max(1, deficit) };
    }
    let at = start;
    for (let i = 0; i < r.steps.length; i++) {
      const m = r.meta[i] || {};
      const len = realMin(m) ?? activeMin;
      const st = m.station ?? null;
      if (st != null && STATIONS_EXCLUSIVE.includes(st)) holds.push({ station: st, from: at, to: at + len });
      if (needsHands(m)) hands.push({ from: at, to: at + len });
      placed.push({ ...evt(r, i, at), _end: at + len });
      at += len;
    }
  }
  return { feasible: true, placed, pulled };
}

// ⚠ ONE ORDER IS NOT THE EARLIEST. `placeAt` is a greedy heuristic: it fixes the placement
// order — longest dish first — and the search above it only pushes T later until THAT order
// fits. A different order can fit sooner. Three dishes from the catalog (one-pan chicken and
// rice, the salmon sheet-pan, the halloumi traybake) report 57 minutes longest-first, while
// placing the salmon last tiles the single oven at 6–26, 26–36 and 36–48 and serves at 51.
// 57 was being labelled "Get it all done soonest" when the ordinary interleaved plan already
// finished in 55 — so the one promise this mode makes was the thing it broke.
//
// Sessions are small, so the orders are ENUMERATED rather than optimised. Longest-first is
// tried first and returned untouched whenever it fits, so every schedule that already worked
// is unchanged. Past ORDER_SEARCH_MAX dishes the permutations stop being cheap and longest-
// first is the only order tried — the previous behaviour, and still an honest schedule, just
// not a proven-earliest one.
const ORDER_SEARCH_MAX = 5;

const permutationsOf = (n) => {
  if (n < 2 || n > ORDER_SEARCH_MAX) return [];
  const out = [];
  const walk = (left, acc) => {
    if (!left.length) { out.push(acc); return; }
    for (let i = 0; i < left.length; i++) walk([...left.slice(0, i), ...left.slice(i + 1)], [...acc, left[i]]);
  };
  walk([...Array(n).keys()], []);
  return out;
};

// Can these dishes serve at T under ANY placement order? The first order that fits is taken.
// Ranking the feasible orders by how tightly the dishes land was tried and removed: across
// 15,652 catalog triples it never once chose differently from taking the first, so it was a
// branch no input exercised and a claim nothing backed. If a case is ever found where the
// orders genuinely differ in quality, rank them THEN, with that case pinned as the reason.
function bestPlacement(rs, activeMin, T, kitchen) {
  const longestFirst = placeAt(rs, activeMin, T, kitchen);
  if (longestFirst.feasible) return longestFirst;
  let deficit = longestFirst.deficit;
  for (const ord of permutationsOf(rs.length)) {
    const r = placeAt(rs, activeMin, T, kitchen, ord);
    if (r.feasible) return r;
    deficit = Math.min(deficit, r.deficit);
  }
  return { feasible: false, deficit: Math.max(1, deficit) };
}

function serveTimeline(rs, activeMin, serveAt, kitchen) {
  const durs = rs.map((r) => durationOf(r, activeMin));
  const longest = durs.length ? Math.max(...durs) : 0;

  // ⚠ The earliest serve time is NOT simply the longest dish. Three dishes that all
  // want the stove cannot be cooked in the time the longest one takes, however the
  // clock is arranged. The true earliest is found by pushing T later until a placement
  // with NO overlapping exclusive holds exists. An earlier version returned the longest
  // duration and clamped clashing dishes to t=0, which produced a plan showing two pots
  // on one stove for the same 18 minutes -- reported as spread 8 with issues:['stations'],
  // so it read as handled rather than impossible.
  let earliest = longest;
  let feas = bestPlacement(rs, activeMin, earliest, kitchen);
  for (let guard = 0; guard < 512 && !feas.feasible; guard++) {
    earliest += feas.deficit;
    feas = bestPlacement(rs, activeMin, earliest, kitchen);
  }

  const wanted = Number.isFinite(serveAt) && serveAt > 0 ? serveAt : earliest;
  const tooSoon = wanted < earliest;
  const T = tooSoon ? earliest : wanted;
  const run = T === earliest ? feas : bestPlacement(rs, activeMin, T, kitchen);
  const placed = (run.feasible ? run.placed : feas.placed) || [];

  const timeline = placed.map(({ _end, ...e }) => e).sort((a, b) => (a.at - b.at) || (a.iid - b.iid));
  const ends = {};
  for (const e of placed) ends[e.iid] = Math.max(ends[e.iid] || 0, e._end);
  const vals = Object.values(ends);
  const spread = vals.length ? Math.max(...vals) - Math.min(...vals) : 0;
  const issues = [];
  if (tooSoon) issues.push(BS_SERVE_ISSUE.TOO_SOON);
  if (run.pulled || feas.pulled) issues.push(BS_SERVE_ISSUE.STATIONS);
  return { timeline, serveAt: T, earliestServe: earliest, spread, issues };
}

// How far through the COOKING a cook actually is, weighted by how long each step
// takes. Counting steps is the obvious thing and it lies: three of six steps done
// reads as halfway, but if one of the remaining three is a 30-minute roast the cook is
// nowhere near halfway. The question this answers is "where do I stand until it is
// finished", so it is measured in minutes, not in list items.
//
// `mins` is per-step duration; `done` is either a COUNT of completed leading steps
// (the board walks a timeline in order) or a per-step boolean map (a single recipe can
// skip). Returns a whole number 0-100 — never NaN for an empty or zero-length recipe,
// because a progress readout that shows NaN is worse than one that shows nothing.
// `unearnedMins` debits minutes that COUNT as stepped-past but have not actually
// elapsed — a passive window whose timer is still running. On an interleaved board,
// starting a 30-minute roast advances the cursor to the other dish immediately, so
// without the debit the bar credits all 30 minutes at the moment the roast goes in and
// can read close to 100% while the food still has half an hour to go (Codex, round 1).
// Defaults to 0, so every caller that has no running holds is unchanged.
export function bsProgressPct(mins, done, unearnedMins = 0) {
  const arr = Array.isArray(mins) ? mins.filter((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0) : [];
  const total = arr.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  let d = 0;
  for (let i = 0; i < arr.length; i++) {
    const isDone = typeof done === 'number' ? i < done : !!(done && done[i]);
    if (isDone) d += arr[i];
  }
  const debit = typeof unearnedMins === 'number' && Number.isFinite(unearnedMins) && unearnedMins > 0 ? unearnedMins : 0;
  return Math.max(0, Math.min(100, Math.round(((d - debit) / total) * 100)));
}

export function bsOrchestrate(recipes, opts = {}) {
  const activeMin = posInt(opts.activeStepMin, BS_ORCH.activeStepMin);
  const minPassive = posInt(opts.minPassive, BS_ORCH.minPassive);
  // The cook's OWN choice, asked before a session begins (owner ruling 2026-08-18:
  // "ask if you want to cook these at the same time for timing purposes or one at a
  // time"). 'auto' preserves the historical behaviour for every existing caller.
  // ⚠ SEQUENCE is a real instruction, not a hint: a cook who asked for one-at-a-time
  // gets it even when the data COULD interleave. TOGETHER is a request, never a
  // promise — it can still come back serial, because parallelism the recipes do not
  // actually support cannot be invented (see `canInterleave`).
  // ⚠ Allow-list every real mode. An earlier version of this line listed only
  // TOGETHER and SEQUENCE, so SERVE fell silently through to AUTO and returned a
  // perfectly valid interleaved plan under the wrong name — no error, just the wrong
  // answer. Adding a mode means adding it HERE too.
  const MODES = [BS_COOK_MODE.TOGETHER, BS_COOK_MODE.SEQUENCE, BS_COOK_MODE.SERVE];
  const mode = MODES.includes(opts.mode) ? opts.mode : BS_COOK_MODE.AUTO;
  const rs = cleanRecipes(recipes);

  // Interleaving needs ≥2 recipes AND at least one real passive window to host it.
  // ⚠ This is a fact about the DATA and is deliberately computed BEFORE `mode` is
  // consulted, so the UI can offer or disable "Together" honestly without having to
  // run a throwaway orchestration in a different mode to find out.
  const canInterleave = rs.length >= 2 && rs.some((r) => (r.meta || []).some((m) => isWindow(m, minPassive)));
  const single = rs.length < 2;

  if (mode === BS_COOK_MODE.SERVE) {
    const sv = serveTimeline(rs, activeMin, opts.serveAt, opts.kitchen);
    return {
      timeline: sv.timeline, serial: false, canInterleave, mode, reason: null,
      serveAt: sv.serveAt, earliestServe: sv.earliestServe, spread: sv.spread, issues: sv.issues,
    };
  }
  if (mode === BS_COOK_MODE.SEQUENCE) {
    return { timeline: serialTimeline(rs, activeMin), serial: true, canInterleave, mode, reason: BS_SERIAL_REASON.CHOSEN };
  }
  if (!canInterleave) {
    return {
      timeline: serialTimeline(rs, activeMin), serial: true, canInterleave, mode,
      reason: single ? BS_SERIAL_REASON.SINGLE : BS_SERIAL_REASON.NO_WINDOW,
    };
  }

  const st = rs.map((r) => ({ ...r, ptr: 0, freeAt: 0 }));
  const holds = []; // { key, station, endAt } — running passive windows occupying a station
  // Capacity-aware: a hob with four burners is busy only when four dishes are on it.
  const stationBusy = (station) => station != null && STATIONS_EXCLUSIVE.includes(station)
    && holds.filter((h) => h.station === station).length >= capacityOf(station, opts.kitchen);

  const timeline = [];
  let now = 0;
  let interleaved = false;
  const cap = st.reduce((n, s) => n + s.steps.length, 0) * 4 + 16; // runaway backstop

  for (let guard = 0; guard < cap; guard++) {
    if (!st.some((s) => s.ptr < s.steps.length) && !holds.length) break;

    // Retire windows that have finished by `now` (frees their station).
    for (let i = holds.length - 1; i >= 0; i--) if (holds[i].endAt <= now) holds.splice(i, 1);

    // Pick the first recipe (input order) whose next step can be done now:
    // it isn't blocked by its own running window, and its station is free.
    // Longest-remaining-work first, not input order. Input order is arbitrary — it is
    // whatever `bsPrepOrder` handed over — and picking arbitrarily lengthens the whole
    // session, because the dish with the most work left is the one that decides when
    // dinner is. Measured: on the same 231 recipe pairs, first-ready-in-input-order was
    // never faster than the backward-packed serve plan, which made "as fast as possible"
    // a claim this mode could not keep. Ties break on input order so the schedule stays
    // deterministic.
    const remaining = (s) => {
      let n = 0;
      for (let i = s.ptr; i < s.steps.length; i++) n += realMin(s.meta[i]) ?? activeMin;
      return n;
    };
    const readyNow = st.filter((s) => s.ptr < s.steps.length && now >= s.freeAt && !stationBusy((s.meta[s.ptr] || {}).station));
    const ready = readyNow.length
      ? readyNow.reduce((best, s) => (remaining(s) > remaining(best) ? s : best), readyNow[0])
      : undefined;

    if (!ready) {
      // Nobody can act — jump the clock to the next thing that frees up. Strictly
      // increasing (every candidate is > now), so this always terminates.
      const nexts = [];
      for (const h of holds) nexts.push(h.endAt);
      for (const s of st) if (s.ptr < s.steps.length && s.freeAt > now) nexts.push(s.freeAt);
      if (!nexts.length) break;
      now = Math.min(...nexts);
      continue;
    }

    const i = ready.ptr;
    const m = ready.meta[i] || {};
    const window = isWindow(m, minPassive);
    if (holds.some((h) => h.iid !== ready.iid)) interleaved = true; // acting while another instance holds a window
    timeline.push(evt(ready, i, now));
    ready.ptr++;

    if (window) {
      // Start the window: occupy the station + block this instance until it ends,
      // but DON'T spend the clock — starting a timer is instant, so the very next
      // ready recipe fills the gap at the same moment.
      holds.push({ iid: ready.iid, station: m.station, endAt: now + realMin(m) });
      ready.freeAt = now + realMin(m);
    } else {
      // Active step (or a sub-window passive wait) consumes hands-on time.
      now += m.passive === true && realMin(m) ? realMin(m) : activeMin;
    }
  }

  // Windows existed, but nothing actually overlapped — every candidate detour was
  // blocked by an exclusive station (two oven dishes cannot share the oven). That is
  // a different answer from "these recipes have no windows", and the cook is told so.
  return { timeline, serial: !interleaved, canInterleave, mode, reason: interleaved ? null : BS_SERIAL_REASON.STATIONS };
}

// The board's HOLDING lanes at a given cursor (the step being performed =
// timeline[cursorIndex]): the passive windows started earlier whose recipe we
// haven't returned to yet AND whose duration hasn't elapsed on the planned clock.
// Pure/structural — the live countdown is the UI's real timer; this pairs each
// running window to its recipe + labels it (recipe tag · what's cooking · station).
export function bsHoldingAt(timeline, cursorIndex) {
  if (!Array.isArray(timeline)) return [];
  const cur = timeline[cursorIndex];
  const holds = [];
  for (let j = 0; j < cursorIndex; j++) {
    const e = timeline[j];
    if (!e || !e.passive || e.station == null || !(e.min > 0)) continue;
    // Have we come back to this instance (its continuation performed at/before the
    // cursor)? Compare on `iid` so two instances of one recipe stay independent.
    const nextSame = timeline.findIndex((x, k) => k > j && x && (x.iid != null && e.iid != null ? x.iid === e.iid : x.recipe === e.recipe));
    if (nextSame !== -1 && nextSame <= cursorIndex) continue; // returned → window done
    if (cur && typeof cur.at === 'number' && e.at + e.min <= cur.at) continue; // elapsed by the clock
    holds.push({ recipe: e.recipe, title: e.title, text: e.text, station: e.station, min: e.min, startedAt: e.at, endsAt: e.at + e.min });
  }
  return holds;
}
