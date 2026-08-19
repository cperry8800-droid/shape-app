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

// Is this station full for the window [from, to)? Counts CONCURRENT holds against the
// station's real capacity instead of asking "is anything there at all". Returns the
// SMALLEST backwards pull that frees a slot, or null when there is room.
// Pulling earlier clears the latest-starting occupier first, so that is the one to miss.
const stationPull = (holds, station, from, to, kitchen) => {
  if (station == null || !STATIONS_EXCLUSIVE.includes(station)) return null;
  const overlapping = holds.filter((h) => h.station === station && from < h.to && h.from < to);
  if (overlapping.length < capacityOf(station, kitchen)) return null;
  const latestFrom = overlapping.reduce((mx, h) => (h.from > mx ? h.from : mx), -Infinity);
  return Math.max(1, to - latestFrom);
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

function placeAt(rs, activeMin, T, kitchen) {
  // Place every dish to END at T, longest first, pulling a dish earlier only when an
  // exclusive station is already held. Returns feasible:false when a dish still clashes
  // after being pulled all the way to t=0 — that is not a schedule to be shown, it is
  // proof that T is too early for these dishes TOGETHER.
  const order = rs.map((r, i) => ({ r, dur: durationOf(r, activeMin), i })).sort((a, b) => b.dur - a.dur || a.i - b.i);
  const holds = [];
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
        const pull = stationPull(holds, st, at, at + len, kitchen);
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
      placed.push({ ...evt(r, i, at), _end: at + len });
      at += len;
    }
  }
  return { feasible: true, placed, pulled };
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
  let feas = placeAt(rs, activeMin, earliest, kitchen);
  for (let guard = 0; guard < 512 && !feas.feasible; guard++) {
    earliest += feas.deficit;
    feas = placeAt(rs, activeMin, earliest, kitchen);
  }

  const wanted = Number.isFinite(serveAt) && serveAt > 0 ? serveAt : earliest;
  const tooSoon = wanted < earliest;
  const T = tooSoon ? earliest : wanted;
  const run = T === earliest ? feas : placeAt(rs, activeMin, T, kitchen);
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
    const ready = st.find((s) => s.ptr < s.steps.length && now >= s.freeAt && !stationBusy((s.meta[s.ptr] || {}).station));

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
