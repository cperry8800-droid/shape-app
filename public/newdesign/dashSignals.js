// Dash signal engine — dashboard-v2 roadmap Phase 2.3.
//
// PURE module: no React, no DOM, no fetch. Loads as a plain <script> in the
// browser (exposes window.DashSignals) and via require() in Node so the rules
// are unit-testable (tests/dash-signals.test.mjs).
//
// Input: unified client records (roadmap Phase 2.1 — built by dashData.jsx's
// useDashboard(role), from live APIs or the mock personas below). Every field
// is nullable: live data is partial today, and A RULE WHOSE INPUTS ARE MISSING
// IS SKIPPED — live accounts must never get false alarms from absent data.
//
// Unified client record shape:
//   {
//     profile:   { id, name, isNew?, status? },
//     trainingAdherence: { pct, done, planned } | null,
//     foodLogs:  { lastLoggedOn: 'YYYY-MM-DD'|null, daysLogged7d: n|null } | null,
//     shapeScoreHistory: [{ weekOf: 'YYYY-MM-DD', points: n }, … asc, ≤8] | null,
//     weighIns:  [{ on: 'YYYY-MM-DD', weight: n, unit }] | null,
//     streaks:   { current: n, best: n, lastActiveOn? } | null,
//     lastContact: { trainer: iso|null, nutritionist: iso|null } | null,
//     checkIn:   { lastWeekOf: 'YYYY-MM-DD'|null } | null,   // Monday keys
//     goal:      { target: n, unit, now: n|null } | null,     // body-comp goal
//     nutrition: { avgCalories, targetCalories, avgProtein, targetProtein } | null,
//     goalPhase: string | null,
//     program:   { name, week, weeks } | null,                 // current training block
//     coachNotes: [{ on: 'YYYY-MM-DD', text }] | null,         // trainer console notes
//     milestones: [{ key, kind: 'pr'|'workout_count'|'streak'|'goal', label, hitAt? }] | null,
//     totals:    { workouts: n } | null,                       // lifetime counts
//     payments:  { mrrCents, status?, lastSessionAt?, joinedAt? } | null,
//                // lastSessionAt = last consult/session; joinedAt = earliest subscription
//     recentLogs: [{ on: 'YYYY-MM-DD', kcal, protein }] | null,  // newest first, ≤3 (drawer)
//     goals:     [{ id, label, metric?, unit?, target, start?, startedOn?,
//                   setBy?, now?, history: [{on, value}] }] | null,
//                // ≤ MAX_GOALS visible — pros set them, clients view them.
//                // history drives the sparkline + the pace projection; a
//                // weight goal's history is the live weigh-in series.
//     recovery:  { sleepHours: { avg7?, lastNight?, target? }, recoveryScore?,
//                  restingHr? } | null,   // sleep/recovery — the cross-domain lever
//     coachDirective: { lever?, verdict?, reason?, severity?, action?:{label,kind},
//                  setBy?, at? } | null,  // a coach override of the directive (WINS)
//   }

(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.DashSignals = api;
})(typeof window !== "undefined" ? window : null, function () {
  var DAY = 86400000;

  // Every tunable in one place (roadmap: thresholds are named constants).
  // ⚠ `THRESHOLDS` IS THE EFFECTIVE SET AND IT IS MUTABLE; `DEFAULT_THRESHOLDS` is the
  // house policy it starts from. A coach may tune the POLICY ones from their office
  // settings (see TUNABLES below) — mutated IN PLACE rather than reassigned, so the
  // exported reference and every rule's closure keep seeing the same object, and
  // `DashSignals.THRESHOLDS` always reads as what the engine is actually applying.
  var THRESHOLDS = {
    SCORE_DROP_PTS: 5,        // wk/wk Shape Score drop that flags
    FOOD_GAP_DAYS: 3,         // days without a food log
    CONTACT_GAP_DAYS: 5,      // days without coach↔client contact
    STREAK_MIN_BEST: 3,       // only call a streak "broken" if one existed
    CHECKIN_RED_WEEKS: 2,     // missed weeks that escalate to red on their own
    CHECKIN_GRACE_DAYS: 3,    // don't nag "due this week" before Thu
    LEDGER_OVER_PCT: 10,      // avg kcal ≥ target+10% = ledger blown (nutritionist feed)
    PROTEIN_UNDER_PCT: 15,    // avg protein ≤ target−15% = under target (nutritionist feed)
    GOAL_SLIP_DAYS: 7,        // projected goal date moving ≥ this many days later wk/wk flags
    SLEEP_DEFICIT_H: 1.5,     // 7-day avg sleep MORE than this under target = severe deficit (triage flag)
    GOAL_RECENT_DAYS: 56,     // pace window — fit only the last 8 weeks of history
    GOAL_MIN_SPAN_DAYS: 7,    // need at least a week of history before projecting
    GOAL_FAR_DAYS: 365,       // past this, the ETA reads "1y+ at this pace", not a date
    // Check-in vitals (spec §3A). Every vitals rule gates on a MINIMUM of real
    // logged days — absence is never a signal, so a member who skips the daily
    // check-in is never flagged for skipping it.
    ENERGY_LOW_AVG: 4,        // 7-day avg energy (1-10) AT or under this flags (amber)
    ENERGY_MIN_DAYS: 3,       // real energy logs needed before the rule may fire
    HUNGER_HIGH_AVG: 8,       // 7-day avg hunger (1-10) AT or over this flags (under-fueling read)
    HUNGER_MIN_DAYS: 3,       // real hunger logs needed before the rule may fire
    HYDRATION_LOW_FRAC: 0.5,  // 7-day avg water STRICTLY under this fraction of target flags
    HYDRATION_MIN_DAYS: 4,    // real hydration logs needed before the rule may fire
  };

  var DEFAULT_THRESHOLDS = {};
  for (var _tk in THRESHOLDS) if (Object.prototype.hasOwnProperty.call(THRESHOLDS, _tk)) DEFAULT_THRESHOLDS[_tk] = THRESHOLDS[_tk];

  // ⚠ ONLY THE POLICY THRESHOLDS ARE TUNABLE, AND THE LINE IS PRINCIPLED RATHER THAN
  // ARBITRARY. These are questions a coach's practice can legitimately answer
  // differently — "how many days without a food log is a gap in MY practice". The ones
  // deliberately NOT here are the engine's own statistical machinery: the `*_MIN_DAYS`
  // evidence floors, `GOAL_RECENT_DAYS`, `GOAL_MIN_SPAN_DAYS`, `GOAL_FAR_DAYS`.
  // The floors in particular guarantee "absence is never a signal" — a member who skips
  // the daily check-in is never flagged for skipping it — and a coach who could lower
  // them to 0 would be manufacturing flags out of no data. A tuning knob that lets you
  // fabricate evidence is not a preference.
  //
  // ⚠ EVERY TUNABLE IS SHOWN TO EVERY ROLE, AND THE `role` FIELD THAT USED TO SCOPE
  // THEM IS GONE BECAUSE IT WAS A FICTION. The engine does not evaluate different rules
  // per role so much as ROUTE their flags: `ruleSleepRecovery` fires outside every
  // `disciplineForRole` branch, and `readOnlyFlags` deliberately runs `ruleLedgerBlown`,
  // `ruleProteinUnder` and `ruleHungerHigh` for the NON-nutrition role so a trainer
  // keeps full visibility of the under-fuelling read as routed context (dashToday
  // renders it). So all three "role-scoped" thresholds were read by both roles, and
  // hiding a row from one of them meant that role ran on a setting its panel could
  // neither display nor reset — twice, found one at a time. A threshold a role's
  // evaluation can move must be visible to that role.
  var TUNABLES = [
    { key: "FOOD_GAP_DAYS",      label: "Food-log gap",        unit: "days",  min: 1,  max: 14, step: 1,
      help: "Flag a client after this many days with no food log." },
    { key: "CONTACT_GAP_DAYS",   label: "Contact gap",         unit: "days",  min: 1,  max: 30, step: 1,
      help: "Flag when neither of you has written for this long." },
    { key: "CHECKIN_GRACE_DAYS", label: "Check-in grace",      unit: "days",  min: 0,  max: 6,  step: 1,
      help: "Days into the week before an unfiled check-in is called due." },
    { key: "CHECKIN_RED_WEEKS",  label: "Check-ins missed",    unit: "weeks", min: 1,  max: 8,  step: 1,
      help: "Consecutive missed check-ins that go red on their own." },
    { key: "SCORE_DROP_PTS",     label: "Score drop",          unit: "pts",   min: 1,  max: 50, step: 1,
      help: "Week-over-week Shape Score fall that flags." },
    { key: "GOAL_SLIP_DAYS",     label: "Goal slip",           unit: "days",  min: 1,  max: 60, step: 1,
      help: "How far a projected goal date may move later before it flags." },
    { key: "SLEEP_DEFICIT_H",    label: "Sleep deficit",       unit: "hours", min: 0.5, max: 4, step: 0.5,
      help: "7-day average sleep this far under target reads as a severe deficit." },
    { key: "LEDGER_OVER_PCT",    label: "Calories over",       unit: "%",     min: 1,  max: 50, step: 1,
      help: "Average intake this far above target counts the ledger blown. A trainer sees this as routed context." },
    { key: "PROTEIN_UNDER_PCT",  label: "Protein under",       unit: "%",     min: 1,  max: 50, step: 1,
      help: "Average protein this far below target flags. A trainer sees this as routed context." },
  ];
  var TUNABLE_BY_KEY = {};
  for (var _i = 0; _i < TUNABLES.length; _i++) TUNABLE_BY_KEY[TUNABLES[_i].key] = TUNABLES[_i];

  // Resolve a coach's overrides over the house defaults into a NEW object.
  // Returns what it applied and what it refused, so a caller can say so rather
  // than silently dropping input.
  //
  // ⚠ PURE, AND THAT IS NOT A STYLE CHOICE. An earlier cut mutated a module-level
  // effective set. This module is a UMD singleton and `src/lib/ai/notify-core.ts`
  // IMPORTS IT SERVER-SIDE (`import DashSignals from '../../../public/newdesign/
  // dashSignals.js'`) to build client_red / client_amber for the notify cron — so a
  // mutable global would be one Node process shared by every coach, and one
  // request's tuning would decide another coach's alerts. Thresholds travel as a
  // VALUE now; nothing is ever globally set.
  //
  // ⚠ AND THE TYPE CHECK IS ON THE RAW VALUE, NOT ON Number(). `Number(null)` is 0,
  // `Number(true)` is 1 and `Number("")` is 0 — all finite — so a stored document
  // holding `CHECKIN_GRACE_DAYS: null` would have been applied as 0, nagging a whole
  // roster from Monday morning. A stored document is untrusted input like any other.
  function resolveThresholds(overrides) {
    var applied = {}, refused = [];
    var src = (overrides && typeof overrides === "object") ? overrides : {};
    for (var k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      var spec = TUNABLE_BY_KEY[k];
      if (!spec) { refused.push({ key: k, why: "not tunable" }); continue; }
      var v = src[k];
      if (typeof v !== "number" || !isFinite(v)) { refused.push({ key: k, why: "not a number" }); continue; }
      // Refused, never clamped: clamping runs the engine at a number the coach never
      // chose while their panel shows the one they typed.
      if (v < spec.min || v > spec.max) { refused.push({ key: k, why: "out of range" }); continue; }
      applied[k] = v;
    }
    var out = {};
    for (var d in DEFAULT_THRESHOLDS) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_THRESHOLDS, d)) continue;
      out[d] = Object.prototype.hasOwnProperty.call(applied, d) ? applied[d] : DEFAULT_THRESHOLDS[d];
    }
    return { thresholds: out, applied: applied, refused: refused };
  }

  // Run `fn` with `t` as the effective set, then put back what was there.
  // ⚠ SYNCHRONOUS BY CONSTRUCTION. The fifteen rule functions read the closed-over
  // `THRESHOLDS`, and threading a parameter through all of them is a wide change with
  // a lot of places to get one wrong. This scopes it at the three entry points
  // instead — and because `fn` is synchronous, nothing can interleave between the
  // swap and the restore, so a server handling two coaches cannot mix them.
  function withThresholds(t, fn) {
    if (!t || typeof t !== "object") return fn();
    var prev = {};
    for (var k in DEFAULT_THRESHOLDS) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_THRESHOLDS, k)) continue;
      prev[k] = THRESHOLDS[k];
      if (Object.prototype.hasOwnProperty.call(t, k)) THRESHOLDS[k] = t[k];
    }
    try { return fn(); } finally {
      for (var r in prev) if (Object.prototype.hasOwnProperty.call(prev, r)) THRESHOLDS[r] = prev[r];
    }
  }


  function toDate(v) {
    if (v == null) return null;
    var d = v instanceof Date ? v : new Date(String(v).length === 10 ? v + "T00:00:00" : v);
    return isNaN(d.getTime()) ? null : d;
  }
  function daysBetween(a, b) { return Math.floor((b.getTime() - a.getTime()) / DAY); }
  function mondayOf(d) {
    var x = new Date(d.getTime());
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }
  function iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  // ── Goal projection (the Goals page core) ──────────────────────────────────
  // Pros set up to MAX_GOALS goals per client; clients view them. Each goal
  // carries a value history; the projection is a least-squares pace over the
  // RECENT window (an old hot streak can't promise a date the current pace
  // won't deliver), run forward from the latest point. Missing or too-short
  // history is reported as a state, never guessed.

  var MAX_GOALS = 3;
  function visibleGoals(goals) { return Array.isArray(goals) ? goals.slice(0, MAX_GOALS) : []; }

  // History points arrive in several live shapes ({on|date|d|logged_on} ×
  // {value|v|weight|kg|w}) — normalize, drop junk, sort ascending.
  function goalSeries(g, asOf) {
    var raw = g && Array.isArray(g.history) ? g.history : [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var p = raw[i];
      if (!p) continue;
      var on = toDate(p.on != null ? p.on : p.date != null ? p.date : p.d != null ? p.d : p.logged_on);
      var v = p.value != null ? p.value : p.v != null ? p.v : p.weight != null ? p.weight : p.kg != null ? p.kg : p.w;
      if (!on || v == null || !isFinite(Number(v))) continue;
      if (asOf && on.getTime() > asOf.getTime()) continue;
      out.push({ on: on, value: Number(v) });
    }
    out.sort(function (a, b) { return a.on - b.on; });
    return out;
  }

  // ── Weight-unit reconciliation (S3-2) ───────────────────────────────────────
  // A weigh-in series can arrive in a different unit than the goal target (e.g.
  // a kg-logged series against an lb goal). Reconcile to one canonical unit
  // BEFORE any to-go / pace / ETA / achieved math — otherwise the projection is
  // unit-blind (a 78 kg reading would "achieve" a 165 lb goal).
  function weightUnit(u) {
    u = String(u || "").toLowerCase();
    return (u === "kg" || u === "kgs" || u === "kilo" || u === "kilos" || u === "kilogram" || u === "kilograms") ? "kg" : "lb";
  }
  function toWeightUnit(value, from, to) {
    if (value == null || !isFinite(Number(value))) return value;
    from = weightUnit(from); to = weightUnit(to);
    if (from === to) return Number(value);
    return from === "kg" ? Number(value) * 2.2046226218 : Number(value) / 2.2046226218;
  }
  // A weigh-in array → sorted-ascending {on(ISO), value} points, each value
  // converted into `unit` using the point's own unit (defaults to `unit`).
  function weightSeriesIn(raw, unit) {
    var arr = Array.isArray(raw) ? raw : [];
    var pts = [];
    for (var i = 0; i < arr.length; i++) {
      var p = arr[i]; if (!p) continue;
      var on = toDate(p.on != null ? p.on : p.date != null ? p.date : p.d != null ? p.d : p.logged_on);
      var v = p.value != null ? p.value : p.v != null ? p.v : p.weight != null ? p.weight : p.kg != null ? p.kg : p.w;
      if (!on || v == null || !isFinite(Number(v))) continue;
      pts.push({ on: on, value: toWeightUnit(Number(v), p.unit || unit, unit) });
    }
    pts.sort(function (a, b) { return a.on - b.on; });
    return pts.map(function (p) { return { on: iso(p.on), value: p.value }; });
  }

  // Weigh-ins for a first-vs-last delta must be oldest→newest. The coach JSONB
  // path (overall.weighIns) and arbitrary callers carry no order guarantee, so
  // sort defensively (S3-3) — a newest-first array otherwise inverts the
  // gained/lost sign in the coach read + the AI evidence pack.
  function sortedWeighIns(w) {
    if (!Array.isArray(w)) return [];
    return w.slice().sort(function (a, b) {
      var da = toDate(a && (a.on != null ? a.on : a.date != null ? a.date : a.logged_on != null ? a.logged_on : a.d));
      var db = toDate(b && (b.on != null ? b.on : b.date != null ? b.date : b.logged_on != null ? b.logged_on : b.d));
      return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
    });
  }

  function goalDateLabel(v) {
    var d = toDate(v);
    return d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;
  }

  // projectGoal(goal, now, asOf?) ->
  //   { state: 'on-pace'|'achieved'|'stalled'|'far'|'stale'|'insufficient',
  //     lastValue, lastOn, toGo, pct|null, unit, direction,
  //     ratePerWeek?, daysOut?, projectedDate? (ISO), projectedLabel?, achievedOn? }
  // or null when the goal itself is unusable. `asOf` restricts history to
  // points on/before that date — the week-over-week slip check re-projects
  // with last week's knowledge. 'stale' = the pace math says they'd already
  // be there, but the series is too old to confirm (log to refresh).
  function projectGoal(g, now, asOf) {
    now = now || new Date();
    if (!g || g.target == null || !isFinite(Number(g.target))) return null;
    var target = Number(g.target);
    var pts = goalSeries(g, asOf || null);
    var lastValue = pts.length ? pts[pts.length - 1].value
      : g.now != null && isFinite(Number(g.now)) ? Number(g.now) : null;
    if (lastValue == null) return null;
    var lastOn = pts.length ? pts[pts.length - 1].on : null;
    var start = g.start != null && isFinite(Number(g.start)) ? Number(g.start) : (pts.length ? pts[0].value : null);
    var direction = start != null && start !== target ? (target < start ? "down" : "up") : (target < lastValue ? "down" : "up");
    var pct = null;
    if (start != null && start !== target) {
      pct = direction === "down" ? (start - lastValue) / (start - target) : (lastValue - start) / (target - start);
      pct = Math.max(0, Math.min(1, pct));
    }
    var base = {
      unit: g.unit || "", direction: direction, lastValue: lastValue,
      lastOn: lastOn ? iso(lastOn) : null,
      toGo: Math.round(Math.abs(lastValue - target) * 10) / 10, pct: pct,
    };
    var done = direction === "down" ? lastValue <= target : lastValue >= target;
    if (done) {
      var hit = lastOn;
      for (var c2 = 0; c2 < pts.length; c2++) {
        var crossed = direction === "down" ? pts[c2].value <= target : pts[c2].value >= target;
        if (crossed) { hit = pts[c2].on; break; }
      }
      base.state = "achieved"; base.pct = 1; base.achievedOn = hit ? iso(hit) : null;
      return base;
    }
    if (pts.length < 2) { base.state = "insufficient"; return base; }
    var winStart = lastOn.getTime() - THRESHOLDS.GOAL_RECENT_DAYS * DAY;
    var win = pts.filter(function (p) { return p.on.getTime() >= winStart; });
    if (win.length < 2 || win[win.length - 1].on.getTime() - win[0].on.getTime() < THRESHOLDS.GOAL_MIN_SPAN_DAYS * DAY) {
      base.state = "insufficient";
      return base;
    }
    // Least-squares slope over the window, in units/day.
    var n = win.length, st = 0, sv = 0;
    for (var j = 0; j < n; j++) { st += win[j].on.getTime(); sv += win[j].value; }
    var mt = st / n, mv = sv / n, num = 0, den = 0;
    for (var k2 = 0; k2 < n; k2++) {
      var dt = (win[k2].on.getTime() - mt) / DAY;
      num += dt * (win[k2].value - mv);
      den += dt * dt;
    }
    var slope = den ? num / den : 0;
    base.ratePerWeek = Math.round(slope * 7 * 100) / 100;
    var toward = direction === "down" ? slope < 0 : slope > 0;
    if (!toward || Math.abs(slope) < 1e-9) { base.state = "stalled"; return base; }
    var daysOut = Math.round(Math.abs(lastValue - target) / Math.abs(slope));
    base.daysOut = daysOut;
    if (daysOut > THRESHOLDS.GOAL_FAR_DAYS) { base.state = "far"; return base; }
    var projected = new Date(lastOn.getTime() + daysOut * DAY);
    base.projectedDate = iso(projected);
    base.projectedLabel = goalDateLabel(projected);
    var ref = asOf || now;
    base.state = projected.getTime() < ref.getTime() - DAY ? "stale" : "on-pace";
    return base;
  }

  // Week-over-week ETA movement in days. Positive = slipped later. Infinity =
  // there was an ETA a week ago and the pace has since flattened/reversed.
  // null = nothing to compare (no baseline ETA, or already achieved).
  function goalSlipDays(g, now) {
    now = now || new Date();
    var cur = projectGoal(g, now);
    if (!cur || cur.state === "achieved") return null;
    var prev = projectGoal(g, now, new Date(now.getTime() - 7 * DAY));
    if (!prev || !prev.projectedDate) return null;
    if (cur.projectedDate) {
      return Math.round((toDate(cur.projectedDate).getTime() - toDate(prev.projectedDate).getTime()) / DAY);
    }
    if (cur.state === "stalled" || cur.state === "far") return Infinity;
    return null;
  }

  // One-line goal proximity for the pre-session context line / schedule rows:
  //   '2.8 lb to "Goal weight" · pace Jul 17'  (+ the slip when it moved)
  function goalBrief(c, now) {
    now = now || new Date();
    var gs = visibleGoals(c && c.goals);
    if (!gs.length) return null;
    var g = gs[0];
    var p = projectGoal(g, now);
    if (!p) return null;
    if (p.state === "achieved") {
      return "“" + g.label + "” hit" + (p.achievedOn ? " " + goalDateLabel(p.achievedOn) : "") + " ✓";
    }
    var head = p.toGo + (p.unit ? " " + p.unit : "") + " to “" + g.label + "”";
    var tail = p.state === "on-pace" ? "pace " + p.projectedLabel
      : p.state === "stalled" ? "pace stalled"
      : p.state === "far" ? "1y+ at this pace"
      : p.state === "stale" ? "needs a fresh log"
      : null;
    var slip = goalSlipDays(g, now);
    if (slip != null && slip >= THRESHOLDS.GOAL_SLIP_DAYS) {
      tail = (tail ? tail + " " : "") + "(ETA " + (isFinite(slip) ? "+" + slip + "d" : "lost") + " this wk)";
    }
    return tail ? head + " · " + tail : head;
  }

  // Normalize every goal source into the record's goals[] (≤ MAX_GOALS, in
  // priority order):
  //   coach     — pro-set goals (client_programs.detail.goals)
  //   overall   — the legacy self-set body-comp goal (user_goals 'client_goals')
  //   weighIns  — live weigh-in series → the weight goal's history
  //   training / nutrition — legacy numeric self-goals (current vs target, no
  //               series → they render honestly without a projection)
  function goalsFromDoc(src) {
    src = src || {};
    var out = [];
    var coach = Array.isArray(src.coach) ? src.coach : [];
    for (var i = 0; i < coach.length; i++) {
      var g = coach[i];
      if (!g || !g.label || g.target == null || !isFinite(Number(g.target))) continue;
      out.push({
        id: g.id || "coach-" + i, label: String(g.label), metric: g.metric || "custom",
        unit: g.unit || "", target: Number(g.target),
        start: g.start != null && isFinite(Number(g.start)) ? Number(g.start) : null,
        startedOn: g.startedOn || null, setBy: g.setBy || "coach",
        now: g.now != null && isFinite(Number(g.now)) ? Number(g.now) : null,
        history: Array.isArray(g.history) ? g.history : [],
      });
    }
    var rawWeighIns = Array.isArray(src.weighIns) && src.weighIns.length ? src.weighIns : (src.overall && src.overall.weighIns) || [];
    var weightGoal = null;
    for (var w2 = 0; w2 < out.length; w2++) if (out[w2].metric === "weight") { weightGoal = out[w2]; break; }
    if (weightGoal) {
      // Adopt the live weigh-in series only when the goal lacks its own — and
      // convert it into the goal's unit so projectGoal compares like-for-like.
      var cseries = weightSeriesIn(rawWeighIns, weightGoal.unit || "lb");
      if (cseries.length && goalSeries(weightGoal).length < 2) weightGoal.history = cseries;
    } else if (src.overall && src.overall.target != null && isFinite(Number(src.overall.target))) {
      var o = src.overall;
      var oUnit = o.unit || "lb";
      out.push({
        id: "overall", label: o.title || "Goal weight", metric: "weight",
        unit: oUnit, target: Number(o.target),
        start: o.start != null && isFinite(Number(o.start)) ? Number(o.start) : null,
        startedOn: null, setBy: "you",
        now: o.now != null && isFinite(Number(o.now)) ? Number(o.now) : null,
        history: weightSeriesIn(rawWeighIns, oUnit),
      });
    }
    // Work-domain targets (spec 2026-07-13) ride the same self-set custom-goal
    // path as training/nutrition targets — no special engine treatment.
    var legacy = [].concat(Array.isArray(src.training) ? src.training : [], Array.isArray(src.nutrition) ? src.nutrition : [], Array.isArray(src.work) ? src.work : []);
    for (var l2 = 0; l2 < legacy.length; l2++) {
      var lg = legacy[l2];
      if (!lg || !lg.t || lg.tgt == null || !isFinite(Number(lg.tgt))) continue;
      out.push({
        id: "legacy-" + l2, label: String(lg.t), metric: "custom", unit: lg.unit || "",
        target: Number(lg.tgt), start: null, startedOn: null, setBy: "you",
        now: lg.cur != null && isFinite(Number(lg.cur)) ? Number(lg.cur) : null,
        history: [],
      });
    }
    return out.slice(0, MAX_GOALS);
  }

  // ── Rules ──────────────────────────────────────────────────────────────────
  // Each returns a flag { key, reason } or null. `now` is a Date.

  function ruleStreakBroken(c) {
    var s = c.streaks;
    if (!s || s.current == null || s.best == null) return null;
    if (s.current === 0 && s.best >= THRESHOLDS.STREAK_MIN_BEST) {
      return { key: "streak_broken", label: "Streak broken", reason: "Streak broken — was " + s.best + " days" };
    }
    return null;
  }

  // ── The one reading of a weekly-score series ───────────────────────────────
  // ⚠ A WEEK-OVER-WEEK DELTA MAY ONLY COMPARE COMPLETE WEEKS. The live series
  // carries the CURRENT week, flagged `partial` by the definer, and it holds
  // however many days have happened so far. Comparing Tuesday's two days
  // against last week's seven reads as a collapse: every actively-logging
  // client would go amber with "Score down 54" every Monday through Wednesday.
  // So `points` is the newest week (partial or not — it is a real, live number
  // and the coach should see it) while `delta` is computed from the two newest
  // COMPLETE weeks, and is null when there are not two of them.
  //
  // One function because three places read this series — ruleScoreDrop, the
  // roster's SCORE · WK cell and the drawer's score section — and a delta
  // defined differently in any of them is a number that disagrees with itself
  // on one screen.
  function scoreWeekReading(h) {
    if (!Array.isArray(h) || !h.length) return null;
    var weeks = [];
    for (var i = 0; i < h.length; i++) {
      if (h[i] && h[i].points != null && isFinite(Number(h[i].points))) weeks.push(h[i]);
    }
    if (!weeks.length) return null;
    var newest = weeks[weeks.length - 1];
    var complete = weeks.filter(function (w) { return !w.partial; });
    var delta = complete.length >= 2
      ? Number(complete[complete.length - 1].points) - Number(complete[complete.length - 2].points)
      : null;
    return {
      points: Number(newest.points),
      weekOf: newest.weekOf || null,
      partial: !!newest.partial,
      delta: delta,
      // The series a sparkline should draw — the partial week is a real point.
      series: weeks.map(function (w) { return Number(w.points); }),
    };
  }

  function ruleScoreDrop(c) {
    var r = scoreWeekReading(c.shapeScoreHistory);
    if (!r || r.delta == null) return null;
    var drop = -r.delta;
    if (drop >= THRESHOLDS.SCORE_DROP_PTS) {
      return { key: "score_drop", label: "Score \u2193" + drop, reason: "Shape Score down " + drop + " pts week-over-week" };
    }
    return null;
  }

  function ruleFoodGap(c, now) {
    var f = c.foodLogs;
    if (!f) return null;
    var last = toDate(f.lastLoggedOn);
    if (last) {
      var gap = daysBetween(last, now);
      if (gap >= THRESHOLDS.FOOD_GAP_DAYS) {
        return { key: "food_gap", label: "No logs " + gap + "d", reason: "No food logs in " + gap + " days" };
      }
      return null;
    }
    // Live rollups only expose days-logged-this-week today (no last-logged
    // date) — approximate: a fully empty week flags, anything else skips.
    // ⚠ AND THE APPROXIMATION CANNOT SUPPORT EVERY SETTING OF THE KNOB ABOVE IT. An
    // empty 7-day window establishes "at least 7 days with no log" and nothing more:
    // a coach who set the gap to 10 or 14 has asked a question this evidence cannot
    // answer, and flagging anyway made the control a decoration on exactly the shape
    // live accounts have — `lastLoggedOn` is null for a client with no snapshot rows
    // at all, i.e. every brand-new one. A threshold at or under the window is still
    // satisfied by it, so that half keeps flagging.
    if (f.daysLogged7d === 0 && THRESHOLDS.FOOD_GAP_DAYS <= 7) {
      return { key: "food_gap", label: "No logs 7d+", reason: "No food logs in the last week" };
    }
    return null;
  }

  // Returns { flag, missedWeeks } so severity can escalate on missedWeeks.
  function ruleCheckinOverdue(c, now) {
    var ci = c.checkIn;
    if (!ci) return null;
    var thisMonday = mondayOf(now);
    var last = toDate(ci.lastWeekOf);
    if (!last) {
      if (c.profile && c.profile.isNew) return null; // new clients get a pass
      return { key: "checkin_overdue", missedWeeks: 99, label: "No first check-in", reason: "Hasn't completed a first check-in" };
    }
    var missedWeeks = Math.max(0, Math.round(daysBetween(mondayOf(last), thisMonday) / 7));
    if (missedWeeks === 0) return null;
    // One missed week = "due" — only nag from Thu on (grace), so Monday
    // mornings aren't a wall of amber.
    var dayIntoWeek = (now.getDay() + 6) % 7; // Mon=0 … Sun=6
    if (missedWeeks === 1 && dayIntoWeek < THRESHOLDS.CHECKIN_GRACE_DAYS) return null;
    var label = missedWeeks === 1
      ? "Check-in due — last was week of " + iso(mondayOf(last))
      : "No check-in for " + missedWeeks + " weeks";
    return { key: "checkin_overdue", missedWeeks: missedWeeks, label: missedWeeks === 1 ? "Check-in due" : "Check-in " + missedWeeks + "w late", reason: label };
  }

  function ruleContactGap(c, now, role) {
    var lc = c.lastContact;
    if (!lc) return null;
    var ts;
    var disc = disciplineForRole(role);
    if (disc === "training") ts = lc.trainer;
    else if (disc === "nutrition") ts = lc.nutritionist;
    else {
      // Client view: most recent contact from ANY of their pros.
      var a = toDate(lc.trainer), b = toDate(lc.nutritionist);
      ts = a && b ? (a > b ? a : b) : (a || b);
    }
    var last = toDate(ts);
    if (!last) return null;
    var gap = daysBetween(last, now);
    if (gap >= THRESHOLDS.CONTACT_GAP_DAYS) {
      return { key: "contact_gap", label: "Quiet " + gap + "d", reason: "No contact in " + gap + " days" };
    }
    return null;
  }

  // Nutritionist-feed rules: intake quality vs the plan's targets. Both need
  // value AND target — live data carries averages today but no targets, so
  // these skip on live until targets reach the overview (no false alarms).
  function ruleLedgerBlown(c) {
    var n = c.nutrition;
    if (!n || n.avgCalories == null || n.targetCalories == null || !n.targetCalories) return null;
    var overPct = Math.round(((n.avgCalories - n.targetCalories) / n.targetCalories) * 100);
    if (overPct >= THRESHOLDS.LEDGER_OVER_PCT) {
      return { key: "ledger_blown", label: "Ledger +" + overPct + "%", reason: "Averaging " + n.avgCalories + " kcal vs a " + n.targetCalories + " kcal target" };
    }
    return null;
  }

  function ruleProteinUnder(c) {
    var n = c.nutrition;
    if (!n || n.avgProtein == null || n.targetProtein == null || !n.targetProtein) return null;
    var underPct = Math.round(((n.targetProtein - n.avgProtein) / n.targetProtein) * 100);
    if (underPct >= THRESHOLDS.PROTEIN_UNDER_PCT) {
      return { key: "protein_under", label: "Protein low", reason: "Averaging " + n.avgProtein + "g protein vs a " + n.targetProtein + "g target" };
    }
    return null;
  }

  // Goals-page rule: a projection slipping ≥ GOAL_SLIP_DAYS week-over-week
  // emits one amber-weight flag naming the worst goal. Both pro feeds see it
  // (either pro may have set the goal); skips cleanly when goals/history are
  // missing, and a goal that was ALWAYS stalled never had an ETA to slip.
  function ruleGoalSlip(c, now) {
    var gs = visibleGoals(c.goals);
    var worst = null, worstGoal = null;
    for (var i = 0; i < gs.length; i++) {
      var s = goalSlipDays(gs[i], now);
      if (s != null && s > 0 && (worst == null || s > worst)) { worst = s; worstGoal = gs[i]; }
    }
    if (worst == null || worst < THRESHOLDS.GOAL_SLIP_DAYS) return null;
    if (!isFinite(worst)) {
      return { key: "goal_slip", label: "Goal ETA lost", reason: "“" + worstGoal.label + "” lost its projected date — the pace flattened this week" };
    }
    return { key: "goal_slip", label: "Goal ETA +" + worst + "d", reason: "“" + worstGoal.label + "” slipped — the projected finish moved " + worst + " days later this week" };
  }

  // Recovery rule: a 7-day average sleep MORE than SLEEP_DEFICIT_H hours under
  // target (a severe chronic deficit — roughly under 6h for a 7.5h target) becomes a
  // first-class triage flag for the coach + the member's directive. A milder shortfall
  // is left to the gentle cross-domain "sleep is the lever" narrative (buildDirective
  // step 3), so this only escalates the genuinely concerning case — no alert fatigue.
  // Uses recoveryRead (needs rec.recovery); a single short night never flags.
  function ruleSleepRecovery(c) {
    var rr = recoveryRead(c);
    if (!rr || rr.avg == null) return null;
    if (rr.target - rr.avg <= THRESHOLDS.SLEEP_DEFICIT_H) return null;
    var avgR = Math.round(rr.avg * 10) / 10;
    return { key: "sleep_low", label: "Sleep low", reason: "Averaging " + avgR + "h sleep vs a " + rr.target + "h target — recovery is running down" };
  }

  // ── Check-in vitals rules (spec §3A) ──────────────────────────────────────
  // The record's `vitals` leg is built from the member's own daily check-ins
  // (signalsMap.vitalsFromProgress on the client; the widened roster-sleep read
  // on the coach side): { energy:{avg7,n}, hunger:{avg7,n},
  // hydration:{avg7L,targetL,n}, rested:{avg7,n} }. Every rule needs a real
  // average AND enough logged days (n ≥ the *_MIN_DAYS floor) — below the
  // floor, no flag, ever. Copy is observation + one concrete move, never blame.
  function vitalsLeg(c, key) {
    var v = c && c.vitals && typeof c.vitals === "object" ? c.vitals[key] : null;
    if (!v || typeof v !== "object") return null;
    var avg = v.avg7 != null && isFinite(Number(v.avg7)) ? Number(v.avg7) : null;
    var avgL = v.avg7L != null && isFinite(Number(v.avg7L)) ? Number(v.avg7L) : null;
    var n = v.n != null && isFinite(Number(v.n)) ? Number(v.n) : 0;
    return { avg: avg, avgL: avgL, n: n, targetL: v.targetL != null && isFinite(Number(v.targetL)) ? Number(v.targetL) : null };
  }
  function ruleEnergyLow(c) {
    var v = vitalsLeg(c, "energy");
    if (!v || v.avg == null || v.n < THRESHOLDS.ENERGY_MIN_DAYS) return null;
    if (!(v.avg <= THRESHOLDS.ENERGY_LOW_AVG)) return null;
    var avgR = Math.round(v.avg * 10) / 10;
    return { key: "energy_low", label: "Energy low", reason: "Energy has averaged " + avgR + "/10 this week — a lighter session still counts" };
  }
  function ruleHungerHigh(c) {
    var v = vitalsLeg(c, "hunger");
    if (!v || v.avg == null || v.n < THRESHOLDS.HUNGER_MIN_DAYS) return null;
    if (!(v.avg >= THRESHOLDS.HUNGER_HIGH_AVG)) return null;
    var avgR = Math.round(v.avg * 10) / 10;
    return { key: "hunger_high", label: "Hunger high", reason: "Hunger has averaged " + avgR + "/10 this week — the plan may be running light on fuel" };
  }
  // CLIENT DIRECTIVE ONLY (owner ruling): hydration never becomes a coach flag.
  // evaluateClient runs this rule only for the client role, so getTriageFeed
  // (always called with a coach role) never computes it — and the coach-side
  // roster read carries no targetL, so the rule could not fire there anyway.
  // A REAL stored target is required: no target → no flag (never a fabricated
  // default liters figure).
  function ruleHydrationLow(c) {
    var v = vitalsLeg(c, "hydration");
    if (!v || v.avgL == null || v.n < THRESHOLDS.HYDRATION_MIN_DAYS) return null;
    if (v.targetL == null || !(v.targetL > 0)) return null;
    if (!(v.avgL < v.targetL * THRESHOLDS.HYDRATION_LOW_FRAC)) return null;
    var avgR = Math.round(v.avgL * 10) / 10;
    var tgtR = Math.round(v.targetL * 10) / 10;
    return { key: "hydration_low", label: "Water low", reason: "Averaging " + avgR + "L of a " + tgtR + "L water target — a glass with each meal closes most of it" };
  }

  // ── Evaluation + triage ───────────────────────────────────────────────────

  // evaluateClient(record, now, role) -> { flags, severity }
  // severity: red = 2+ flags, or a check-in missed ≥ CHECKIN_RED_WEEKS weeks;
  //           amber = exactly 1 flag; green = clean.
  function evaluateClient(c, now, role, thresholds) {
    if (thresholds) return withThresholds(thresholds, function () { return evaluateClient(c, now, role); });
    now = now || new Date();
    var flags = [];
    var f;
    if ((f = ruleStreakBroken(c))) flags.push(f);
    if ((f = ruleScoreDrop(c))) flags.push(f);
    if ((f = ruleFoodGap(c, now))) flags.push(f);
    var ciFlag = ruleCheckinOverdue(c, now);
    if (ciFlag) flags.push(ciFlag);
    if ((f = ruleContactGap(c, now, role))) flags.push(f);
    if ((f = ruleGoalSlip(c, now))) flags.push(f);
    if ((f = ruleSleepRecovery(c))) flags.push(f);
    // energy_low is the RECOVERY discipline, and follows sleep_low's established
    // pattern exactly: pushed for every viewer.
    if ((f = ruleEnergyLow(c))) flags.push(f);
    // hunger_high is the NUTRITION discipline (FLAG_DISCIPLINE), so it must not
    // escalate a TRAINER's severity — severity is `flags.length >= 2 -> red`, and
    // it is computed BEFORE readOnlyFlags/tagFlag mark a non-owner's flag
    // read-only, so leaving it unconditional turned a trainer red on a
    // nutritionist's flag. Gated like its nutrition siblings ledger_blown /
    // protein_under, EXCEPT that the member's own view keeps it: 'general' is the
    // client/unknown viewer, and hunger_high has a client-facing lever + move
    // (DIRECTIVE_VERDICTS.hunger / DIRECTIVE_MOVES.hunger) that would otherwise be
    // unreachable. So: everyone except the trainer, whose severity it is not.
    // The trainer still SEES it — readOnlyFlags surfaces it as routed context.
    if (disciplineForRole(role) !== "training") {
      if ((f = ruleHungerHigh(c))) flags.push(f);
    }
    // Hydration is a CLIENT directive only (owner ruling) — never a coach flag.
    // disciplineForRole is 'general' exactly for the client/unknown viewer, so
    // a trainer/nutritionist/dietitian triage pass never evaluates it.
    if (disciplineForRole(role) === "general") {
      if ((f = ruleHydrationLow(c))) flags.push(f);
    }
    if (disciplineForRole(role) === "nutrition") {
      if ((f = ruleLedgerBlown(c))) flags.push(f);
      if ((f = ruleProteinUnder(c))) flags.push(f);
    }

    var severity = "green";
    if (flags.length >= 2) severity = "red";
    else if (ciFlag && ciFlag.missedWeeks >= THRESHOLDS.CHECKIN_RED_WEEKS) severity = "red";
    else if (flags.length === 1) severity = "amber";
    return { flags: flags, severity: severity };
  }

  // ── Discipline classification + routing (coach triage) ──────────────────────
  // Each signal belongs to a DISCIPLINE; the owning pro acts on it, the OTHER pro
  // sees it READ-ONLY. General signals (check-in / score / contact / goal / basic
  // food-logging) are owned by whoever is viewing. A client with a single pro →
  // that pro owns everything (nothing read-only). This is purely a routing layer:
  // severity is still exactly what evaluateClient computes — read-only context
  // flags never escalate the viewer.
  var FLAG_DISCIPLINE = {
    streak_broken: "training",
    sleep_low: "recovery",     // recovery → owned by the trainer (disciplineOwner)
    energy_low: "recovery",    // low energy → ease the load — trainer-owned, like sleep
    hunger_high: "nutrition",  // the under-fueling read — nutritionist-owned (a trainer gets it read-only, never in severity)
    hydration_low: "nutrition",// client-only directive (role-gated in evaluateClient — never reaches coach triage)
    ledger_blown: "nutrition",
    protein_under: "nutrition",
    food_gap: "general",       // basic logging adherence — either pro nudges it
    score_drop: "general",
    checkin_overdue: "general",
    contact_gap: "general",
    goal_slip: "general",
  };
  function flagDiscipline(key) { return FLAG_DISCIPLINE[key] || "general"; }
  function disciplineOwner(discipline) {
    if (discipline === "training" || discipline === "recovery") return "trainer";
    if (discipline === "nutrition") return "nutritionist";
    return null; // general — both pros own it
  }
  // A provider role → the discipline it OWNS. Dietitian (RD/RDN) and nutritionist
  // are both the NUTRITION owner — they share the nutritionist surfaces, write
  // path and routing; only the credential/label differs.
  function disciplineForRole(role) {
    if (role === "trainer") return "training";
    if (role === "nutritionist" || role === "dietitian") return "nutrition";
    return "general"; // client / unknown
  }
  // Is the pro of `proRole` on this client? Defaults to present (so the routing
  // shows) unless the record says otherwise via c.pros = {trainer, nutritionist}.
  function hasPro(c, proRole) {
    if (c && c.pros && typeof c.pros === "object" && proRole in c.pros) return !!c.pros[proRole];
    return true; // server populates c.pros; absent → assume present
  }
  function tagFlag(f, role, c) {
    var d = flagDiscipline(f.key);
    var owner = disciplineOwner(d);
    // Owned if general, the viewer's own discipline, or the owning pro isn't on
    // this client (single pro → everything routes to them). Compared by
    // DISCIPLINE so a dietitian owns nutrition flags exactly like a nutritionist.
    var owned = owner === null || disciplineForRole(owner) === disciplineForRole(role) || !hasPro(c, owner);
    return {
      key: f.key, label: f.label, reason: f.reason, missedWeeks: f.missedWeeks,
      discipline: d, owned: owned, routeTo: owner,
    };
  }
  // The OTHER discipline's flags this role doesn't already evaluate — surfaced as
  // routed context (a trainer/coach seeing the dietitian's macro flags). Each is
  // tagged owned/read-only: READ-ONLY when a nutritionist is on the client, OWNED
  // when the trainer is the only pro (everything routes to them). NOT counted
  // toward severity either way — severity stays exactly as evaluateClient says.
  function readOnlyFlags(c, now, role) {
    var out = [];
    if (disciplineForRole(role) !== "nutrition") {
      var f;
      if ((f = ruleLedgerBlown(c))) out.push(tagFlag(f, role, c));
      if ((f = ruleProteinUnder(c))) out.push(tagFlag(f, role, c));
      // hunger_high joins its nutrition siblings here: the trainer keeps full
      // visibility of the under-fuelling read as routed context, without it
      // counting toward their severity.
      if ((f = ruleHungerHigh(c))) out.push(tagFlag(f, role, c));
    }
    return out;
  }

  // getTriageFeed(role, clients, now) -> rows sorted red → amber → green,
  // most-flagged first within a band, name as the stable tiebreak. Each flag is
  // tagged with its discipline + owned/read-only routing; `readOnly` carries the
  // other discipline's context flags (not counted in severity).
  function getTriageFeed(role, clients, now, thresholds) {
    if (thresholds) return withThresholds(thresholds, function () { return getTriageFeed(role, clients, now); });
    now = now || new Date();
    var rank = { red: 2, amber: 1, green: 0 };
    return (clients || [])
      .map(function (c) {
        var r = evaluateClient(c, now, role);
        return {
          client: c,
          severity: r.severity,
          flags: r.flags.map(function (f) { return tagFlag(f, role, c); }),
          readOnly: readOnlyFlags(c, now, role),
          reasons: r.flags.map(function (x) { return x.reason; }),
          // The cross-domain directive (verdict + reason + the one action) + the
          // coach read, so every triage surface reuses ONE source for the reason.
          directive: buildDirective(c, now, role),
        };
      })
      .sort(function (a, b) {
        if (rank[b.severity] !== rank[a.severity]) return rank[b.severity] - rank[a.severity];
        if (b.flags.length !== a.flags.length) return b.flags.length - a.flags.length;
        return String(a.client.profile.name).localeCompare(String(b.client.profile.name));
      });
  }

  // ── Mock personas (roadmap Phase 2.2 fallback) ────────────────────────────
  // Dates are generated relative to `now` so the demo never goes stale, and
  // each persona deterministically exercises specific rules:
  //   red:   Marcus T. (streak broken + score drop), Sam R. (food gap +
  //          contact gap), Jonah W. (3 weeks no check-in — red on its own)
  //   amber: Aisha K. (contact gap), Elena R. (score drop), Deandre K. (food
  //          gap), Nadia P. (goal ETA slipped +15d week-over-week)
  //   green: Jordan M., Priya S.
  // Goals coverage: Jordan = on-pace (down + up) + one achieved; Marcus =
  // stalled-from-the-start (no ETA, never flags); Nadia = the slip case;
  // Tess = none set yet; everyone else = no goals (the honest empty state).
  function buildMockClients(now) {
    now = now || new Date();
    var ago = function (days) { var d = new Date(now.getTime() - days * DAY); return iso(d); };
    var thisMonday = mondayOf(now);
    var mondaysAgo = function (weeks) { var d = new Date(thisMonday.getTime() - weeks * 7 * DAY); return iso(d); };
    var history = function (deltas) {
      // deltas = weekly points, oldest first, length ≤ 8
      return deltas.map(function (pts, i) {
        return { weekOf: mondaysAgo(deltas.length - 1 - i), points: pts };
      });
    };
    // Goal history from [daysAgo, value] pairs (oldest first).
    var gh = function (pairs) {
      return pairs.map(function (p) { return { on: ago(p[0]), value: p[1] }; });
    };
    var person = function (id, name, over) {
      var base = {
        profile: { id: "demo-" + id, name: name, isNew: false, status: "ontrack" },
        trainingAdherence: { pct: 90, done: 18, planned: 20 },
        foodLogs: { lastLoggedOn: ago(1), daysLogged7d: 6 },
        shapeScoreHistory: history([54, 61, 58, 66, 70, 73, 71, 75]),
        weighIns: [
          { on: ago(21), weight: 176, unit: "lb" },
          { on: ago(7), weight: 173.5, unit: "lb" },
          { on: ago(1), weight: 172.8, unit: "lb" },
        ],
        streaks: { current: 9, best: 14, lastActiveOn: ago(0) },
        lastContact: { trainer: ago(1), nutritionist: ago(2) },
        checkIn: { lastWeekOf: mondaysAgo(0) },
        goal: { target: 170, unit: "lb", now: 172.8 },
        nutrition: { avgCalories: 2080, targetCalories: 2200, avgProtein: 142, targetProtein: 150 },
        goalPhase: "Build",
        program: { name: "Strength Block 3", week: 6, weeks: 12 },
        coachNotes: [{ on: ago(2), text: "Bar speed good at 185 — hold top sets, add a backoff." }],
        milestones: [
          { key: "m25", kind: "goal", label: "25% to goal", hitAt: ago(40) },
          { key: "m50", kind: "goal", label: "50% to goal", hitAt: ago(12) },
        ],
        totals: { workouts: 64 },
        payments: { mrrCents: 18000, status: "active", lastSessionAt: ago(2), joinedAt: ago(400) },
        recentLogs: [
          { on: ago(0), kcal: 2105, protein: 148 },
          { on: ago(1), kcal: 2210, protein: 139 },
          { on: ago(2), kcal: 1980, protein: 151 },
        ],
        goals: null,
      };
      Object.keys(over || {}).forEach(function (k) { base[k] = over[k]; });
      return base;
    };

    return [
      // green — the picture of health; just hit workout #100. His goals are
      // steady-pace (perfectly linear → zero week-over-week slip): a weight
      // cut, a strength climb, and a just-achieved 5k time.
      person(1, "Jordan M.", {
        totals: { workouts: 102 },
        milestones: [
          { key: "w100", kind: "workout_count", label: "100th workout", hitAt: ago(2) },
          { key: "m50", kind: "goal", label: "50% to goal", hitAt: ago(9) },
        ],
        goals: [
          { id: "g-weight", label: "Goal weight", metric: "weight", unit: "lb", target: 170, start: 184, startedOn: ago(98), setBy: "trainer",
            history: gh([[43, 176.1], [36, 175.55], [29, 175.0], [22, 174.45], [15, 173.9], [8, 173.35], [1, 172.8]]) },
          { id: "g-squat", label: "Back squat 1RM", metric: "strength", unit: "lb", target: 250, start: 215, startedOn: ago(84), setBy: "trainer",
            history: gh([[43, 234.5], [36, 235.75], [29, 237], [22, 238.25], [15, 239.5], [8, 240.75], [1, 242]]) },
          { id: "g-5k", label: "5k under 25:00", metric: "endurance", unit: "min", target: 25, start: 28.5, startedOn: ago(120), setBy: "trainer",
            history: gh([[36, 26.4], [22, 25.8], [8, 25.2], [1, 24.8]]) },
        ],
      }),
      // red — streak broken AND a 8-pt wk/wk score drop. His weight goal has
      // been flat for weeks: stalled BOTH weeks, so there was never an ETA to
      // slip — the card shows the honest "no ETA" state without a flag.
      person(2, "Marcus T.", {
        payments: { mrrCents: 18000, status: "active", lastSessionAt: ago(6), joinedAt: ago(96) },
        streaks: { current: 0, best: 12, lastActiveOn: ago(4) },
        foodLogs: { lastLoggedOn: ago(3), daysLogged7d: 3 },
        shapeScoreHistory: history([62, 65, 60, 68, 64, 70, 71, 63]),
        goalPhase: "Cut",
        program: { name: "Hypertrophy Reset", week: 2, weeks: 8 },
        coachNotes: [
          { on: ago(4), text: "Deload next week if bar speed stays slow." },
          { on: ago(10), text: "Knee niggle — swapped lunges for split squats." },
        ],
        goal: { target: 172, unit: "lb", now: 181.4 },
        weighIns: [
          { on: ago(21), weight: 181.5, unit: "lb" },
          { on: ago(7), weight: 181.4, unit: "lb" },
          { on: ago(1), weight: 181.4, unit: "lb" },
        ],
        goals: [
          { id: "g-weight", label: "Goal weight", metric: "weight", unit: "lb", target: 172, start: 184, startedOn: ago(70), setBy: "trainer",
            history: gh([[35, 181.4], [28, 181.2], [21, 181.5], [14, 181.3], [7, 181.4], [1, 181.4]]) },
        ],
      }),
      // amber — gone quiet: no coach contact in 6 days
      person(3, "Aisha K.", {
        lastContact: { trainer: ago(6), nutritionist: ago(6) },
        goalPhase: "Cut",
      }),
      // red — no food logs in 4 days + no contact in 7
      person(4, "Sam R.", {
        payments: { mrrCents: 18000, status: "active", lastSessionAt: ago(9), joinedAt: ago(730) },
        recentLogs: [],
        program: { name: "Foundations", week: 4, weeks: 8 },
        foodLogs: { lastLoggedOn: ago(4), daysLogged7d: 2 },
        lastContact: { trainer: ago(7), nutritionist: ago(7) },
        trainingAdherence: { pct: 64, done: 9, planned: 14 },
      }),
      // green for the trainer; amber on the nutritionist feed — protein is
      // running 36% under her cut target
      person(5, "Priya S.", {
        goalPhase: "Cut",
        program: { name: "Cut · Conditioning", week: 7, weeks: 10 },
        totals: { workouts: 86 },
        milestones: [
          { key: "pr-squat", kind: "pr", label: "Squat 245 lb PR", hitAt: ago(5) },
          { key: "m50", kind: "goal", label: "50% to goal", hitAt: ago(20) },
        ],
        nutrition: { avgCalories: 1840, targetCalories: 1900, avgProtein: 96, targetProtein: 150 },
        payments: { mrrCents: 22000, status: "active", lastSessionAt: ago(1), joinedAt: ago(210) },
        recentLogs: [
          { on: ago(0), kcal: 1815, protein: 92 },
          { on: ago(1), kcal: 1870, protein: 101 },
          { on: ago(2), kcal: 1790, protein: 95 },
        ],
      }),
      // amber — score slid 7 pts wk/wk, everything else fine
      person(6, "Elena R.", {
        shapeScoreHistory: history([48, 52, 55, 58, 61, 64, 66, 59]),
      }),
      // amber for the trainer (food gap); RED on the nutritionist feed — the
      // logs that do exist average 21% over the calorie target
      person(7, "Deandre K.", {
        payments: { mrrCents: 18000, status: "active", lastSessionAt: ago(4), joinedAt: ago(45) },
        foodLogs: { lastLoggedOn: ago(3), daysLogged7d: 4 },
        nutrition: { avgCalories: 2540, targetCalories: 2100, avgProtein: 138, targetProtein: 150 },
        recentLogs: [
          { on: ago(3), kcal: 2680, protein: 132 },
          { on: ago(4), kcal: 2515, protein: 141 },
          { on: ago(5), kcal: 2430, protein: 140 },
        ],
      }),
      // red — three weeks without a check-in (red on its own)
      person(8, "Jonah W.", {
        payments: { mrrCents: 18000, status: "active", lastSessionAt: ago(13), joinedAt: ago(18) },
        checkIn: { lastWeekOf: mondaysAgo(3) },
        trainingAdherence: { pct: 71, done: 10, planned: 14 },
      }),
      // green + NEW — joined this week; no first check-in yet (new-client
      // pass). No goals set yet either — the pro sees the "set the first
      // one" state.
      person(9, "Tess B.", {
        profile: { id: "demo-9", name: "Tess B.", isNew: true, status: "new" },
        payments: { mrrCents: 16000, status: "active", lastSessionAt: ago(1), joinedAt: ago(5) },
        goal: { target: 150, unit: "lb", now: 158 },
        trainingAdherence: { pct: 100, done: 2, planned: 2 },
        foodLogs: { lastLoggedOn: ago(0), daysLogged7d: 3 },
        shapeScoreHistory: history([12, 27]),
        weighIns: [{ on: ago(2), weight: 158, unit: "lb" }],
        streaks: { current: 2, best: 2, lastActiveOn: ago(0) },
        lastContact: { trainer: ago(0), nutritionist: null },
        checkIn: { lastWeekOf: null },
        goalPhase: "Build",
        program: { name: "Onboarding", week: 1, weeks: 4 },
        milestones: [],
        totals: { workouts: 2 },
        goals: [],
      }),
      // amber — the goal-slip case: a clean month of −1 lb/wk flattened over
      // the last two, so this week's projection lands 15 days later than last
      // week's. Everything else about her week is clean — the slip alone
      // turns the row amber.
      person(10, "Nadia P.", {
        goalPhase: "Cut",
        program: { name: "Cut · Block 2", week: 5, weeks: 10 },
        goal: { target: 165, unit: "lb", now: 172.8 },
        weighIns: [
          { on: ago(21), weight: 173.2, unit: "lb" },
          { on: ago(7), weight: 172.8, unit: "lb" },
          { on: ago(1), weight: 172.8, unit: "lb" },
        ],
        goals: [
          { id: "g-weight", label: "Goal weight", metric: "weight", unit: "lb", target: 165, start: 178, startedOn: ago(70), setBy: "nutritionist",
            history: gh([[56, 178], [49, 177], [42, 176], [35, 175], [28, 174], [21, 173.2], [14, 172.9], [7, 172.8], [1, 172.8]]) },
        ],
      }),
    ];
  }

  // ── Programming queue (step 4.2) ──────────────────────────────────────────
  // Who needs next week's plan written, derived from checkIn state:
  //   ready   — this week's check-in is in (the coach has what they need)
  //   blocked — waiting on this week's (or a first) check-in
  // Records with unknown check-in state (sparse live data) are excluded
  // rather than guessed. Sorted ready first, then blocked, name tiebreak.
  function buildProgrammingQueue(clients, now) {
    now = now || new Date();
    var thisMonday = iso(mondayOf(now));
    var rank = { ready: 0, blocked: 1 };
    return (clients || [])
      .filter(function (c) { return c.checkIn != null; })
      .map(function (c) {
        var last = c.checkIn.lastWeekOf || null;
        if (last === thisMonday) {
          return { client: c, state: "ready", reason: "Check-in reviewed — ready to program" };
        }
        var reason = !last
          ? "Waiting on their first check-in"
          : "Waiting on this week's check-in";
        return { client: c, state: "blocked", reason: reason };
      })
      .sort(function (a, b) {
        if (rank[a.state] !== rank[b.state]) return rank[a.state] - rank[b.state];
        return String(a.client.profile.name).localeCompare(String(b.client.profile.name));
      });
  }

  // ── Milestones (step 9.1) ─────────────────────────────────────────────────
  // Derives "what they earned" + "what's next" from the record. Pure; skips
  // anything whose inputs are missing (live coach-side data is sparse today).
  var STREAK_LANDMARKS = [7, 14, 30, 50, 100];
  var WORKOUT_LANDMARKS = [25, 50, 100, 150, 200, 300];
  function buildMilestones(c, now) {
    now = now || new Date();
    var recent = [];
    var next = [];
    var cutoff = now.getTime() - 30 * 86400000;
    for (var i = 0; i < (c.milestones || []).length; i++) {
      var m = c.milestones[i];
      var hit = toDate(m.hitAt);
      if (hit && hit.getTime() >= cutoff) recent.push({ kind: m.kind || "goal", label: m.label, hitAt: m.hitAt });
    }
    var s = c.streaks;
    if (s && s.current != null) {
      var crossed = null, upcoming = null;
      for (var j = 0; j < STREAK_LANDMARKS.length; j++) {
        if (s.current >= STREAK_LANDMARKS[j]) crossed = STREAK_LANDMARKS[j];
        else if (!upcoming) upcoming = STREAK_LANDMARKS[j];
      }
      if (crossed) recent.push({ kind: "streak", label: crossed + "-day streak", active: true });
      if (upcoming && s.current > 0) next.push({ kind: "streak", label: upcoming + "-day streak", detail: (upcoming - s.current) + " day" + (upcoming - s.current === 1 ? "" : "s") + " to go", progress: s.current / upcoming });
    }
    var w = c.totals && c.totals.workouts != null ? c.totals.workouts : null;
    if (w != null) {
      var wUp = null;
      for (var k2 = 0; k2 < WORKOUT_LANDMARKS.length; k2++) {
        if (w < WORKOUT_LANDMARKS[k2]) { wUp = WORKOUT_LANDMARKS[k2]; break; }
      }
      if (wUp) next.push({ kind: "workout_count", label: "Workout #" + wUp, detail: (wUp - w) + " away", progress: w / wUp });
    }
    // Goal proximity — goals[] (pro-set, with pace projections) leads the
    // "next" feed; the legacy single goal field keeps its old behavior.
    var gs = visibleGoals(c.goals);
    if (gs.length) {
      var goalNexts = [];
      for (var g2 = 0; g2 < gs.length; g2++) {
        var p = projectGoal(gs[g2], now);
        if (!p) continue;
        if (p.state === "achieved") {
          var hit2 = toDate(p.achievedOn);
          if (hit2 && hit2.getTime() >= cutoff) recent.push({ kind: "goal", label: gs[g2].label, hitAt: p.achievedOn });
          continue;
        }
        var detail = p.toGo + (p.unit ? " " + p.unit : "") + " away";
        if (p.state === "on-pace") detail += " · pace " + p.projectedLabel;
        else if (p.state === "stalled") detail += " · pace stalled";
        else if (p.state === "far") detail += " · 1y+ at this pace";
        goalNexts.push({ kind: "goal", label: gs[g2].label, detail: detail, progress: p.pct != null ? p.pct : undefined });
      }
      next = goalNexts.concat(next);
    } else if (c.goal && c.goal.target != null) {
      var nowW = c.goal.now != null ? c.goal.now : (Array.isArray(c.weighIns) && c.weighIns.length ? c.weighIns[c.weighIns.length - 1].weight : null);
      if (nowW != null) {
        var dist = Math.round(Math.abs(nowW - c.goal.target) * 10) / 10;
        next.push({ kind: "goal", label: "Goal weight", detail: dist + " " + (c.goal.unit || "lb") + " away" });
      }
    }
    // Freshest first; streak "active" entries sort after dated hits.
    recent.sort(function (a, b) { return String(b.hitAt || "").localeCompare(String(a.hitAt || "")); });
    return { recent: recent.slice(0, 4), next: next.slice(0, 3) };
  }

  // ── Joint attention (step 9.2) ────────────────────────────────────────────
  // A client slipping in BOTH domains — training (streak) AND nutrition
  // (logs/ledger/protein) — should get ONE coordinated message, not two
  // separate nudges. Evaluated with the nutritionist rule set (superset).
  var TRAINING_KEYS = { streak_broken: true };
  var NUTRITION_KEYS = { food_gap: true, ledger_blown: true, protein_under: true };
  function findJointAttention(clients, now, thresholds) {
    if (thresholds) return withThresholds(thresholds, function () { return findJointAttention(clients, now); });
    now = now || new Date();
    var out = [];
    for (var i = 0; i < (clients || []).length; i++) {
      var c = clients[i];
      var r = evaluateClient(c, now, "nutritionist");
      var training = r.flags.filter(function (f) { return TRAINING_KEYS[f.key]; });
      var nutrition = r.flags.filter(function (f) { return NUTRITION_KEYS[f.key]; });
      if (training.length && nutrition.length) {
        out.push({ client: c, trainingFlags: training, nutritionFlags: nutrition });
      }
    }
    return out;
  }

  // ── The directive ("one lead per page") ─────────────────────────────────────
  // buildDirective(record, now, role) -> the ONE thing: a verdict + a
  // cross-domain reason + a single action, plus a coach "read" (a 30-day summary
  // + the one thing now). It REASONS ACROSS DISCIPLINES — the lever may be sleep,
  // nutrition, or training — and is grounded ONLY in real signals from the
  // record (honest "—" when there's nothing). A coach override on the record
  // (record.coachDirective) WINS. Pure + deterministic — no model call, so it's
  // cacheable and never fabricates.
  //
  //   { source:'coach'|'engine', lever, severity, verdict, reason,
  //     action:{label,kind}|null, read:{ summary30d, oneThingNow }, cited:[…] }

  var DIRECTIVE_MOVES = {
    sleep: { kind: "log_sleep", label: "Log last night's sleep" },
    nutrition: { kind: "log_meal", label: "Log a meal today" },
    training: { kind: "open_session", label: "Open today's session" },
    checkin: { kind: "check_in", label: "Send your weekly check-in" },
    goal: { kind: "log_weighin", label: "Log a weigh-in" },
    score: { kind: "open_habits", label: "Grab a win today" },
    contact: { kind: "message", label: "Reach out today" },
    energy: { kind: "ease_load", label: "Take today lighter" },
    hunger: { kind: "log_meal", label: "Add a real meal today" },
    hydration: { kind: "log_water", label: "Log a glass of water" },
  };
  var DIRECTIVE_VERDICTS = {
    sleep: "Sleep is the lever", nutrition: "Tighten nutrition", training: "Train today",
    checkin: "Check-in due", goal: "Goal pace slipped", score: "Grab a win",
    contact: "Reconnect", energy: "Energy is running low", hunger: "Fuel is running short",
    hydration: "Water is behind", none: "On pace",
  };
  function directiveKeyToLever(key) {
    return ({
      checkin_overdue: "checkin", streak_broken: "training", food_gap: "nutrition",
      ledger_blown: "nutrition", protein_under: "nutrition", goal_slip: "goal",
      score_drop: "score", contact_gap: "contact", sleep_low: "sleep",
      energy_low: "energy", hunger_high: "hunger", hydration_low: "hydration",
    })[key] || null;
  }

  // The single directive must lead with the MOST URGENT flag, not whichever rule
  // ran first in push order (S3-5). A months-late check-in (a lost coaching
  // relationship) outranks a "grab a win" score dip. checkin_overdue escalates
  // further the longer it's been missed.
  var DIRECTIVE_PRIORITY = {
    checkin_overdue: 100, contact_gap: 80, goal_slip: 60, food_gap: 55,
    ledger_blown: 50, protein_under: 45, streak_broken: 40, sleep_low: 35,
    // The vitals flags rank BELOW sleep_low (a chronic sleep deficit outranks a
    // soft-gauge read) and above score_drop, in energy → hunger → hydration order.
    energy_low: 34, hunger_high: 33, hydration_low: 32,
    score_drop: 30,
  };
  function flagPriority(f) {
    if (!f) return 0;
    var base = DIRECTIVE_PRIORITY[f.key] || 10;
    if (f.key === "checkin_overdue" && f.missedWeeks != null && isFinite(Number(f.missedWeeks))) {
      base += Math.min(50, Number(f.missedWeeks) * 5);
    }
    return base;
  }
  function topFlag(flags) {
    if (!Array.isArray(flags) || !flags.length) return null;
    var best = flags[0], bestP = flagPriority(best);
    for (var i = 1; i < flags.length; i++) {
      var p = flagPriority(flags[i]);
      if (p > bestP) { best = flags[i]; bestP = p; }
    }
    return best;
  }
  function recoveryRead(rec) {
    var r = rec && rec.recovery;
    if (!r || !r.sleepHours) return null;
    var s = r.sleepHours;
    var avg = s.avg7 != null && isFinite(Number(s.avg7)) ? Number(s.avg7) : null;
    var target = s.target != null && isFinite(Number(s.target)) ? Number(s.target) : 7.5;
    var lastNight = s.lastNight != null && isFinite(Number(s.lastNight)) ? Number(s.lastNight) : null;
    // "low" if logged-but-short, OR last night not logged yet (nothing to act on).
    var low = (avg != null && avg < target - 0.5) || s.lastNight == null;
    return { avg: avg, target: target, lastNight: lastNight, low: low, hasData: avg != null || s.lastNight != null };
  }
  // "Deficit's fine" — nutrition is present and holding (≤ target+5%, no flag).
  function nutritionHolding(rec) {
    var n = rec && rec.nutrition;
    if (!n || n.avgCalories == null || n.targetCalories == null) return false;
    return Number(n.avgCalories) <= Number(n.targetCalories) * 1.05;
  }
  // The coach "read": a 30-day summary from real stats + the one thing now.
  function buildDirectiveRead(rec, reason) {
    var sum = [];
    var ta = rec.trainingAdherence;
    if (ta && ta.done != null && ta.planned != null) sum.push(ta.done + "/" + ta.planned + " sessions");
    var n = rec.nutrition;
    if (n && n.avgCalories != null) sum.push("avg " + Math.round(Number(n.avgCalories)) + " kcal");
    var w = sortedWeighIns(rec.weighIns);
    if (w.length >= 2) {
      var d = Number(w[w.length - 1].weight) - Number(w[0].weight);
      if (isFinite(d)) sum.push((d <= 0 ? "" : "+") + (Math.round(d * 10) / 10) + " " + (w[0].unit || "lb"));
    }
    return {
      summary30d: sum.length ? "30 days: " + sum.join(" · ") : "—",
      oneThingNow: reason && reason !== "—" ? reason : "Nothing urgent — keep the routine.",
    };
  }
  function onTrackReason(rec) {
    var bits = [];
    if (rec.streaks && rec.streaks.current >= 3) bits.push(rec.streaks.current + "-day streak");
    if (nutritionHolding(rec)) bits.push("deficit holding");
    var ta = rec.trainingAdherence;
    if (ta && ta.pct != null && Number(ta.pct) >= 80) bits.push("sessions on plan");
    return bits.length ? bits.join(", ") + " — keep it boring." : "—";
  }
  function buildDirective(rec, now, role) {
    now = now || new Date();
    rec = rec || {};

    // 1) Coach override wins.
    var ov = rec.coachDirective;
    if (ov && (ov.lever || ov.verdict || ov.reason || (ov.action && ov.action.label))) {
      var lever = ov.lever || "training";
      var action = ov.action && ov.action.label ? ov.action : (DIRECTIVE_MOVES[lever] || null);
      var rReason = ov.reason || onTrackReason(rec);
      return {
        source: "coach", lever: lever, severity: ov.severity || "amber",
        verdict: ov.verdict || DIRECTIVE_VERDICTS[lever] || "Your move",
        reason: rReason, action: action,
        read: buildDirectiveRead(rec, rReason), cited: ["coach override"],
      };
    }

    // 2) The top triage flag (already grounded + cross-discipline aware),
    //    chosen by urgency — not rule push-order (S3-5).
    var ev = evaluateClient(rec, now, role || "client");
    var top = topFlag(ev.flags);
    if (top) {
      var lever2 = directiveKeyToLever(top.key) || "training";
      return {
        source: "engine", lever: lever2, severity: ev.severity,
        verdict: DIRECTIVE_VERDICTS[lever2] || "Your move",
        reason: top.reason, action: DIRECTIVE_MOVES[lever2] || null,
        read: buildDirectiveRead(rec, top.reason), cited: [top.key],
      };
    }

    // 3) Cross-domain secondary — sleep is the lever when recovery is low while
    //    nutrition is holding. This is the differentiator: a single-vertical app
    //    can't say "the deficit's fine, the problem is sleep."
    var rr = recoveryRead(rec);
    if (rr && rr.low && rr.hasData) {
      var holding = nutritionHolding(rec);
      var tail = rr.lastNight == null ? "; log last night to confirm." : "; tonight, lights out by 11.";
      var sleepReason = (holding ? "Deficit's fine — " : "") + "sleep is stalling recovery" + tail;
      sleepReason = sleepReason.charAt(0).toUpperCase() + sleepReason.slice(1);
      return {
        source: "engine", lever: "sleep", severity: "amber",
        verdict: "Sleep is the lever", reason: sleepReason, action: DIRECTIVE_MOVES.sleep,
        read: buildDirectiveRead(rec, sleepReason),
        cited: holding ? ["recovery.sleepHours", "nutrition"] : ["recovery.sleepHours"],
      };
    }

    // 4) On track — honest. "—" when there's no real signal at all.
    var anySignal = !!(rec.trainingAdherence || rec.nutrition || (rec.weighIns && rec.weighIns.length) || rec.streaks);
    if (!anySignal) {
      return {
        source: "engine", lever: null, severity: "green", verdict: "—", reason: "—",
        action: null, read: { summary30d: "—", oneThingNow: "Not enough signal yet." }, cited: [],
      };
    }
    var okReason = onTrackReason(rec);
    return {
      source: "engine", lever: "none", severity: "green", verdict: "On pace",
      reason: okReason, action: DIRECTIVE_MOVES.nutrition,
      read: buildDirectiveRead(rec, okReason), cited: ["on-track"],
    };
  }

  // ── AI check-in drafting (grounded, cross-discipline) ───────────────────────
  // buildEvidencePack(record, role) -> the real, current signals a coach message
  // should cite, across BOTH disciplines, with anything missing OMITTED (never
  // invented). buildCheckinDraft turns the pack into a deterministic grounded
  // draft (the honest fallback + the demo); the server route hands the SAME pack
  // to the model for warmer phrasing, instructed to cite only these signals — so
  // a draft is specific to this client and never a templated mass-send.

  function _capFirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function buildEvidencePack(rec, role, now) {
    rec = rec || {};
    now = now || new Date();
    var sig = [];
    function push(domain, key, label, value, detail) {
      if (value == null || value === '') return;
      sig.push({ domain: domain, key: key, label: label, value: String(value), detail: detail || null });
    }
    var ta = rec.trainingAdherence;
    if (ta && ta.done != null && ta.planned != null) push('training', 'sessions', 'Sessions', ta.done + '/' + ta.planned, ta.pct != null ? ta.pct + '% of plan' : null);
    if (rec.streaks && rec.streaks.current != null && rec.streaks.current >= 1) push('training', 'streak', 'Streak', rec.streaks.current + '-day');
    var n = rec.nutrition;
    if (n) {
      if (n.avgCalories != null) push('nutrition', 'calories', 'Avg calories', Math.round(Number(n.avgCalories)) + ' kcal', n.targetCalories != null ? Math.round(Number(n.targetCalories)) + ' kcal target' : null);
      if (n.avgProtein != null) push('nutrition', 'protein', 'Avg protein', Math.round(Number(n.avgProtein)) + 'g', n.targetProtein != null ? Math.round(Number(n.targetProtein)) + 'g target' : null);
    }
    if (rec.foodLogs && rec.foodLogs.daysLogged7d != null) push('nutrition', 'logging', 'Days logged', rec.foodLogs.daysLogged7d + '/7');
    var w = sortedWeighIns(rec.weighIns);
    if (w.length >= 2) {
      var d = Math.round((Number(w[w.length - 1].weight) - Number(w[0].weight)) * 10) / 10;
      if (isFinite(d)) push('body', 'weight', 'Weight', (d <= 0 ? '' : '+') + d + ' ' + (w[0].unit || 'lb'), 'over ' + w.length + ' weigh-ins');
    }
    var gs = visibleGoals(rec.goals);
    if (gs.length) {
      var pj = projectGoal(gs[0], now);
      if (pj && pj.projectedLabel) push('goal', 'pace', (gs[0].label || 'Goal') + ' pace', 'on track for ' + pj.projectedLabel);
      else if (pj && pj.state === 'stalled') push('goal', 'pace', (gs[0].label || 'Goal') + ' pace', 'stalled');
    }
    if (rec.recovery && rec.recovery.sleepHours && rec.recovery.sleepHours.avg7 != null) push('recovery', 'sleep', 'Avg sleep', rec.recovery.sleepHours.avg7 + 'h');
    return {
      signals: sig,
      hasTraining: sig.some(function (s) { return s.domain === 'training'; }),
      hasNutrition: sig.some(function (s) { return s.domain === 'nutrition'; }),
    };
  }

  function _draftClause(s) {
    switch (s.key) {
      case 'sessions': return 'you logged ' + s.value + ' sessions' + (s.detail ? ' (' + s.detail + ')' : '');
      case 'streak': return "you're on a " + s.value + ' streak';
      case 'calories': return 'your intake averaged ' + s.value + (s.detail ? ' against a ' + s.detail : '');
      case 'protein': return 'protein came in at ' + s.value + (s.detail ? ' vs a ' + s.detail : '');
      case 'logging': return 'you logged food ' + s.value + ' days';
      case 'weight': return s.value.charAt(0) === '+' ? "you're up " + s.value.slice(1) : "you're down " + s.value.replace('-', '');
      case 'pace': return s.label.toLowerCase() + ' is ' + s.value;
      case 'sleep': return 'sleep averaged ' + s.value;
      default: return s.label.toLowerCase() + ' ' + s.value;
    }
  }

  // buildCheckinDraft(record, role, now) -> { text, cited:[{label,value}], evidence }
  // A grounded, editable check-in draft: leads with the coach's own discipline and
  // ALSO cites the OTHER discipline when present (the cross-discipline hook). Omits
  // any absent signal — never invents one. This is the fallback + the demo source.
  function buildCheckinDraft(rec, role, now) {
    rec = rec || {};
    var name = (rec.profile && rec.profile.name) ? String(rec.profile.name).split(' ')[0] : 'there';
    var pack = buildEvidencePack(rec, role, now);
    var sig = pack.signals;
    if (!sig.length) {
      return { text: 'Hi ' + name + ' — checking in on your week. How did training and nutrition go, and is anything getting in the way?', cited: [], evidence: pack };
    }
    var primaryDomain = disciplineForRole(role) === 'nutrition' ? 'nutrition' : 'training';
    var otherDomain = disciplineForRole(role) === 'nutrition' ? 'training' : 'nutrition';
    var pick = function (dom) { return sig.filter(function (s) { return s.domain === dom; })[0] || null; };
    var cited = [];
    var clauses = [];
    var add = function (s) { if (s) { clauses.push(_draftClause(s)); cited.push({ label: s.label, value: s.value }); } };
    add(pick(primaryDomain));   // the coach's own discipline
    add(pick(otherDomain));     // the OTHER discipline — what makes it non-generic
    if (clauses.length < 2) { add(pick('body')); add(pick('goal')); add(pick('recovery')); }
    var joined = clauses.join(', and ');
    var bodyText = joined ? _capFirst(joined) + '. ' : '';
    return {
      text: 'Hi ' + name + ' — quick check-in on your week. ' + bodyText + 'How did it feel, and where do you want to focus next week?',
      cited: cited,
      evidence: pack,
    };
  }

  // ── THE CROSSOVER (spec 2026-07-13) — training × work-habit reads ────────
  // The work-domain differentiator: does the member's work-habit completion
  // move with training and sleep? ONE implementation for all three consumers
  // (website <script>, mobile via window.DashSignals, Node tests) — the spec
  // named a crossover.mjs; it lives here so the surfaces can never drift.
  //
  // Input: pre-bucketed days [{ d:'YYYY-MM-DD', workHabitScheduled,
  // workHabitDone, trained, sleepHours }]. The exact statistic (deterministic
  // by spec):
  //  • only days with ≥1 scheduled work habit enter any comparison
  //  • completion rate p = Σdone / Σscheduled per side
  //  • training day = `trained` truthy; sleep bands short <6.5h / long ≥7h,
  //    days in [6.5, 7) EXCLUDED (separation band); missing/invalid sleep is
  //    excluded from the sleep comparison ONLY
  //  • gap = (pA − pB) in percentage points; SE = the two-proportion standard
  //    error with n = scheduled work-habit DAYS per side; the read fires only
  //    when |gap| ≥ 12 pp AND |gap| ≥ 1.65·SE
  //  • floors: span ≥ 21 days AND ≥ 8 scheduled days on EACH side
  // Returns { training: {gap,pA,pB,nA,nB}|null, sleep: {…}|null } — null
  // renders NOTHING (honest-absent; never a fabricated figure).
  function crossoverRead(days) {
    var list = (Array.isArray(days) ? days : []).filter(function (x) {
      return x && x.d && Number(x.workHabitScheduled) >= 1;
    });
    if (!list.length) return { training: null, sleep: null };
    // Loop min/max — Math.max.apply over a huge array can RangeError; this
    // is the one shared implementation, so don't assume callers cap `days`.
    var minT = Infinity, maxT = -Infinity;
    for (var i = 0; i < list.length; i++) {
      var t = new Date(list[i].d).getTime();
      if (isFinite(t)) { if (t < minT) minT = t; if (t > maxT) maxT = t; }
    }
    var spanDays = maxT >= minT ? Math.round((maxT - minT) / 86400000) + 1 : 0;
    var side = function (subset) {
      var sched = 0, done = 0;
      for (var j = 0; j < subset.length; j++) {
        var s = Number(subset[j].workHabitScheduled) || 0;
        done += Math.min(Number(subset[j].workHabitDone) || 0, s);
        sched += s;
      }
      return sched > 0 ? { p: done / sched, n: subset.length } : null;
    };
    var compare = function (a, b) {
      if (spanDays < 21 || !a || !b || a.n < 8 || b.n < 8) return null;
      var gap = (a.p - b.p) * 100;
      var se = Math.sqrt((a.p * (1 - a.p)) / a.n + (b.p * (1 - b.p)) / b.n) * 100;
      if (Math.abs(gap) < 12 || Math.abs(gap) < 1.65 * se) return null;
      return { gap: Math.round(gap), pA: Math.round(a.p * 100), pB: Math.round(b.p * 100), nA: a.n, nB: b.n };
    };
    var sleepOf = function (x) {
      if (x.sleepHours === null || x.sleepHours === undefined || x.sleepHours === '') return NaN;
      var h = Number(x.sleepHours);
      return isFinite(h) ? h : NaN;
    };
    return {
      training: compare(
        side(list.filter(function (x) { return !!x.trained; })),
        side(list.filter(function (x) { return !x.trained; }))
      ),
      sleep: compare(
        side(list.filter(function (x) { var h = sleepOf(x); return isFinite(h) && h >= 7; })),
        side(list.filter(function (x) { var h = sleepOf(x); return isFinite(h) && h < 6.5; }))
      ),
    };
  }

  // The card copy for a crossover read — the words AND the numbers come from
  // ONE place so web + mobile can never drift on wording (the same guarantee
  // crossoverRead gives the statistic). Never-shaming, observation + move;
  // either direction reports neutrally. Returns [{ k, text, sub }] — empty
  // when nothing fired (the caller renders nothing).
  function crossoverCopy(read) {
    var rows = [];
    if (read && read.training) {
      var tr = read.training;
      rows.push({
        k: 'Training',
        text: tr.gap > 0
          ? 'Your work habits land ' + Math.abs(tr.gap) + ' pts more often on days you train — protect the session.'
          : 'Your work habits land ' + Math.abs(tr.gap) + ' pts less often on days you train — leave room for the desk on session days.',
        sub: 'Training days ' + tr.pA + '% · rest days ' + tr.pB + '%',
      });
    }
    if (read && read.sleep) {
      var sl = read.sleep;
      // "They" only when the training row rendered above and introduced the
      // subject — a sleep-only read spells it out (no dangling pronoun).
      var subj = rows.length ? 'They' : 'Your work habits';
      rows.push({
        k: 'Sleep',
        text: sl.gap > 0
          ? subj + ' land ' + Math.abs(sl.gap) + ' pts more often after 7+ hours of sleep — guard the bedtime.'
          : subj + ' land ' + Math.abs(sl.gap) + ' pts more often on short-sleep days — worth watching over the next few weeks.',
        sub: '7h+ days ' + sl.pA + '% · short days ' + sl.pB + '%',
      });
    }
    return rows;
  }

  // ── THE PREVIEW'S MONEY, DERIVED FROM ONE NUMBER (review 2026-09-09, V5) ─────
  // The signed-out preview is what a prospective coach evaluates the product on, and it
  // used to contradict itself on a single screen: the sidebar said "$18,420 · Month to
  // date" while the practice strip beside it said "$1,820 monthly recurring" — from the
  // SAME ten demo clients — and the payouts strip said "$4,192 this month". Three answers
  // to one question, none of them derived from the roster on the page.
  //
  // ⚠ AND EVERY PAYOUT DATE WAS FROZEN IN APRIL, under a dateline that renders today.
  // "PAYOUT APR 30", "Apr 21", "in 3 days" — the last of which was fixed text, so it was
  // wrong even in April on every day but one.
  //
  // Everything now falls out of the roster's own MRR. Each figure means something
  // DIFFERENT, or it would just be the same number wearing four labels:
  //   monthly     Σ of what the demo clients pay — the anchor
  //   net         after the 15% platform fee, the rate dashToday already applies
  //   thisMonth   net accrued month-to-date
  //   balance     the settled part: accrued up to the 7-day holding period
  //   lifetime    net × the months since the LONGEST-TENURED client joined
  // ⚠ THE PREVIEW'S PLATFORM FEE HAS ONE DEFINITION, AND IT HAD TO, because this file
  // now applies it in TWO places — the current month (`demoPayouts`) and every past
  // month (`demoPayoutHistory`). Two copies of a rate is the disagreement this whole
  // block was written to remove, one layer down: change one and the history stops
  // reconciling with the month beside it, silently, on a page whose entire point is
  // that its figures agree. `dashToday.jsx` and `dashBusiness.jsx` still spell it
  // themselves — pre-existing, registered rather than swept, and pinned by a guard in
  // tests/demo-coherence.test.mjs that fails the day any of the four diverges.
  var PREVIEW_NET_RATE = 0.85;   // after the 15% platform fee

  function demoPayouts(clients, now) {
    const at = now instanceof Date ? now : new Date();
    const rows = Array.isArray(clients) ? clients : [];
    const monthlyCents = rows.reduce((sum, c) => sum + ((c && c.payments && c.payments.mrrCents) || 0), 0);
    const netCents = Math.round(monthlyCents * PREVIEW_NET_RATE);

    const daysInMonth = new Date(at.getFullYear(), at.getMonth() + 1, 0).getDate();
    const dayOfMonth = at.getDate();
    const thisMonthCents = Math.round((netCents * dayOfMonth) / daysInMonth);
    // The holding period is why a balance is not simply "this month": a payout processor
    // settles on a lag. Seven days, floored at zero for the first week of a month.
    const settledDays = Math.max(0, dayOfMonth - 7);
    const balanceCents = Math.round((netCents * settledDays) / daysInMonth);

    // Payouts land on the last day of the month, which is where "PAYOUT <date>" comes from.
    const payoutOn = new Date(at.getFullYear(), at.getMonth() + 1, 0);
    const daysToPayout = Math.max(0, Math.round((payoutOn - new Date(at.getFullYear(), at.getMonth(), dayOfMonth)) / 86400000));

    // ⚠ LIFETIME IS MEASURED, NOT PICKED. The demo roster carries joinedAt, so the
    // practice's age is a fact about the data on the page rather than a bigger-looking
    // number. A roster with no dates yields one month, never a fabricated history.
    let oldest = null;
    for (const c of rows) {
      const j = c && c.payments && c.payments.joinedAt ? new Date(c.payments.joinedAt) : null;
      if (j && !isNaN(j.getTime()) && (oldest == null || j < oldest)) oldest = j;
    }
    const months = oldest
      ? Math.max(1, (at.getFullYear() - oldest.getFullYear()) * 12 + (at.getMonth() - oldest.getMonth()))
      : 1;
    const lifetimeCents = netCents * months;

    return {
      monthlyCents, netCents, thisMonthCents, balanceCents, lifetimeCents,
      months, daysToPayout,
      payoutLabel: payoutOn.toLocaleDateString([], { month: "short", day: "numeric" }).toUpperCase(),
      payoutShort: payoutOn.toLocaleDateString([], { month: "short", day: "numeric" }),
    };
  }

  // The pulse's reading order once a coach has pinned somebody (review 2026-09-09, R15).
  //
  // ⚠ A PIN NEVER HIDES A FLAG, AND THAT IS THE ONLY REASON IT MAY SIT ABOVE ONE. The
  // pulse is a triage feed — its job is to surface who needs attention — so a pinned
  // client who is fine appearing above a client who is not looks like the engine being
  // overruled. It is not: the pinned row keeps its own severity dot and its own flags,
  // every unpinned at-risk row is still in the list directly underneath, and the band is
  // labelled as the coach's own picks rather than as a verdict. What the pin buys is
  // VISIBILITY on a long roster, which is the thing a coach actually loses when the two
  // people they are working with this week sort to the bottom as "on track".
  //
  // ⚠ A ROW APPEARS EXACTLY ONCE. Leaving a pinned at-risk client in both bands would
  // double-count the roster on the one card that exists to say how many need attention.
  //
  // ⚠ AND A PIN FOR SOMEBODY NOT IN `rows` YIELDS NOTHING RATHER THAN AN EMPTY ROW.
  // The feed is filtered and searched, so absence here is not evidence the pin is stale
  // — which is why this returns an order and never edits the pinned set.
  function pulseOrder(rows, pinned) {
    const list = Array.isArray(rows) ? rows : [];
    const ids = new Set((Array.isArray(pinned) ? pinned : []).filter((x) => typeof x === "string" && x));
    const idOf = (r) => (r && r.client && r.client.profile && r.client.profile.id) || null;
    // Within each band the triage order is preserved: the feed arrives sorted by
    // severity, so a red pin still sits above a green one.
    const atRisk = [], fresh = [], ok = [], pins = [];
    for (const r of list) {
      // ⚠ NO `id != null` CHECK, AND ITS ABSENCE IS THE GUARD. A mutation removing one
      // survived, which is the tell that it was dead: `ids` is built by filtering to
      // non-empty strings, so it can never hold the `null` that `idOf` returns for a row
      // with no readable id, and `Set.has(null)` is already false. The real protection is
      // that filter — without it a pinned list carrying a null would pin every anonymous
      // row. Dead code that reads as a guard is worse than none: the next reader trusts it.
      if (ids.has(idOf(r))) { pins.push(r); continue; }
      if (!r || r.severity !== "green") atRisk.push(r);
      else if (r.client && r.client.profile && r.client.profile.isNew) fresh.push(r);
      else ok.push(r);
    }
    return { pinned: pins, rest: atRisk.concat(fresh, ok) };
  }

  // The demo payout HISTORY (review 2026-09-09, V5 tail).
  //
  // ⚠ IT IS DERIVED FROM WHO HAD JOINED BY EACH MONTH, which is the only reason a series
  // of past payouts can exist at all without inventing one. The demo roster carries
  // `joinedAt` on every client, so "what did this practice bill in June" is a fact about
  // the data on the page rather than a number that looked plausible.
  //
  // What it replaces was four literals — $4,125 / $3,860 / $4,015 / $3,740 over 24 days —
  // summing to $15,740 against a roster whose own strip reads $1,820 monthly recurring.
  // That is roughly TWELVE TIMES the practice, on one screen, which is the same
  // tenfold-disagreement the sidebar payout card was fixed for and the same preview.
  //
  // A month with nobody yet joined yields NO ROW rather than a zero: a $0 payout is a
  // claim that a payout ran and paid nothing, which a processor does not do.
  function demoPayoutHistory(clients, now, count) {
    const at = now instanceof Date ? now : new Date();
    const rows = Array.isArray(clients) ? clients : [];
    const n = Math.max(0, Math.min(24, count == null ? 4 : count));
    const out = [];
    for (let i = 1; i <= n; i++) {
      // The last day of the month i months back — the cadence `demoPayouts` already
      // states with "PAYOUT <date>". The two must not describe different schedules.
      const end = new Date(at.getFullYear(), at.getMonth() - i + 1, 0);
      const endMs = end.getTime();
      let monthlyCents = 0;
      for (const c of rows) {
        const pay = c && c.payments;
        if (!pay || !pay.joinedAt) continue;
        const j = new Date(String(pay.joinedAt).length === 10 ? pay.joinedAt + "T00:00:00" : pay.joinedAt);
        const t = j.getTime();
        if (!isFinite(t) || t > endMs) continue;
        monthlyCents += pay.mrrCents || 0;
      }
      if (monthlyCents <= 0) continue;          // nobody had joined yet — no payout ran
      out.push({
        id: "demo-po-" + i,
        amountCents: Math.round(monthlyCents * PREVIEW_NET_RATE),
        status: "paid",
        arrivalDate: endMs,
        created: endMs - 2 * 86400000,
      });
    }
    return out;                                  // newest first, which is how the panel lists them
  }

  // The sidebar's demo payout card, strings and all (review 2026-09-09, V5).
  //
  // ⚠ IT RESOLVES HERE AND NOT IN `coachNav.jsx`, WHICH IS WHERE THE BUG WAS. That
  // module is loaded by ~20 pages and reached into THREE others to build this card:
  // `buildMockClients` here, `dashDemoPayouts` in dashData.jsx, `dashMoney` in
  // dashToday.jsx. Ten of those pages load none of the three, so the getters threw and
  // the broad catch reported a missing script as "PAYOUTS · —" — an honest-looking
  // empty standing in for a page that was simply built wrong. One pure function in the
  // module that owns the roster means one small plain <script> is the whole dependency.
  function demoPayoutCard(now) {
    const at = now instanceof Date ? now : new Date();
    const p = demoPayouts(buildMockClients(at), at);
    // A local formatter rather than a reach into dashToday.jsx: three lines of
    // Intl is a smaller price than the cross-module dependency that caused this.
    let amount;
    try { amount = "$" + Math.round((p.thisMonthCents || 0) / 100).toLocaleString(); }
    catch (e) { amount = "$0"; }
    const days = p.daysToPayout === 0 ? "pays out today"
      : "in " + p.daysToPayout + " day" + (p.daysToPayout === 1 ? "" : "s");
    return { label: "PAYOUT " + p.payoutLabel, amount: amount, sub: "Month to date · " + days };
  }

  return {
    THRESHOLDS: THRESHOLDS,
    DEFAULT_THRESHOLDS: DEFAULT_THRESHOLDS,
    TUNABLES: TUNABLES,
    resolveThresholds: resolveThresholds,
    MAX_GOALS: MAX_GOALS,
    evaluateClient: evaluateClient,
    buildDirective: buildDirective,
    buildEvidencePack: buildEvidencePack,
    buildCheckinDraft: buildCheckinDraft,
    flagDiscipline: flagDiscipline,
    disciplineOwner: disciplineOwner,
    disciplineForRole: disciplineForRole,
    buildMilestones: buildMilestones,
    findJointAttention: findJointAttention,
    getTriageFeed: getTriageFeed,
    buildProgrammingQueue: buildProgrammingQueue,
    buildMockClients: buildMockClients,
    visibleGoals: visibleGoals,
    projectGoal: projectGoal,
    goalSlipDays: goalSlipDays,
    goalBrief: goalBrief,
    goalsFromDoc: goalsFromDoc,
    goalDateLabel: goalDateLabel,
    scoreWeekReading: scoreWeekReading,
    crossoverRead: crossoverRead,
    crossoverCopy: crossoverCopy,
    PREVIEW_NET_RATE: PREVIEW_NET_RATE,
    pulseOrder: pulseOrder,
    demoPayouts: demoPayouts,
    demoPayoutHistory: demoPayoutHistory,
    demoPayoutCard: demoPayoutCard,
    _internals: { mondayOf: mondayOf, daysBetween: daysBetween, toDate: toDate },
  };
});
