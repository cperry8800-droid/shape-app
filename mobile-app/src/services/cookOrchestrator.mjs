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

export const BS_ORCH = {
  activeStepMin: 3, // assumed hands-on minutes per active step (the injected clock)
  minPassive: 4,    // a passive step must be at least this long to host a detour
};

const STATIONS_EXCLUSIVE = ['oven', 'stove', 'board']; // 'off' (rest/chill) ties up nothing

const posInt = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback);
const realMin = (m) => (m && typeof m.min === 'number' && Number.isFinite(m.min) && m.min > 0 ? m.min : null);

// A step is an interleave-hosting WINDOW only with all three authored signals.
const isWindow = (m, minPassive) => !!m && m.passive === true && m.station != null && (realMin(m) ?? 0) >= minPassive;

const cleanRecipes = (recipes) =>
  (Array.isArray(recipes) ? recipes : [])
    .filter((r) => r && Array.isArray(r.steps) && r.steps.length)
    .map((r) => ({ key: r.key, title: r.title, steps: r.steps, meta: Array.isArray(r.stepMeta) ? r.stepMeta : [] }));

const evt = (r, i, at) => {
  const m = r.meta[i] || {};
  const passive = m.passive === true;
  const min = realMin(m);
  return { recipe: r.key, title: r.title, stepIndex: i, text: r.steps[i], at, min, passive, station: m.station ?? null };
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
export function bsOrchestrate(recipes, opts = {}) {
  const activeMin = posInt(opts.activeStepMin, BS_ORCH.activeStepMin);
  const minPassive = posInt(opts.minPassive, BS_ORCH.minPassive);
  const rs = cleanRecipes(recipes);

  // Interleaving needs ≥2 recipes AND at least one real passive window to host it.
  const canInterleave = rs.length >= 2 && rs.some((r) => (r.meta || []).some((m) => isWindow(m, minPassive)));
  if (!canInterleave) return { timeline: serialTimeline(rs, activeMin), serial: true };

  const st = rs.map((r) => ({ ...r, ptr: 0, freeAt: 0 }));
  const holds = []; // { key, station, endAt } — running passive windows occupying a station
  const stationBusy = (station) => station != null && STATIONS_EXCLUSIVE.includes(station) && holds.some((h) => h.station === station);

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
    if (holds.some((h) => h.key !== ready.key)) interleaved = true; // acting while another recipe holds a window
    timeline.push(evt(ready, i, now));
    ready.ptr++;

    if (window) {
      // Start the window: occupy the station + block this recipe until it ends,
      // but DON'T spend the clock — starting a timer is instant, so the very next
      // ready recipe fills the gap at the same moment.
      holds.push({ key: ready.key, station: m.station, endAt: now + realMin(m) });
      ready.freeAt = now + realMin(m);
    } else {
      // Active step (or a sub-window passive wait) consumes hands-on time.
      now += m.passive === true && realMin(m) ? realMin(m) : activeMin;
    }
  }

  return { timeline, serial: !interleaved };
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
    // Have we come back to this recipe (its continuation performed at/before the cursor)?
    const nextSame = timeline.findIndex((x, k) => k > j && x && x.recipe === e.recipe);
    if (nextSame !== -1 && nextSame <= cursorIndex) continue; // returned → window done
    if (cur && typeof cur.at === 'number' && e.at + e.min <= cur.at) continue; // elapsed by the clock
    holds.push({ recipe: e.recipe, title: e.title, text: e.text, station: e.station, min: e.min, startedAt: e.at, endsAt: e.at + e.min });
  }
  return holds;
}
