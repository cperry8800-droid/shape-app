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
//     rankPoints: n | null,   // Shape Score rank points (the tier colour); the website's, no rule reads it
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
//     payments:  { mrrCents, status?, lastSessionAt?, joinedAt?, feeCents?, origin? } | null,
//                // lastSessionAt = last consult/session; joinedAt = earliest subscription;
//                // feeCents = the platform fee the rows STORE (coach-roster.ts), origin = who
//                // brought the client (coach_link / coach_invite / marketplace)
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
  // exported reference and every rule's closure keep seeing the same object.
  // ⚠ OUTSIDE AN ENTRY POINT'S SCOPE IT HOLDS THE HOUSE POLICY, NOT A COACH'S (F10, the engine
  // audit): withThresholds puts the house values back when a call returns, and a React render never
  // sits inside one. A surface that compares against a coach's line takes that coach's resolved set
  // (useCoachThresholds on the website) rather than reading `DashSignals.THRESHOLDS`.
  var THRESHOLDS = {
    SCORE_DROP_PTS: 5,        // wk/wk Shape Score drop that flags on the MEMBER's own view (not a coach tunable)
    SCORE_DROP_PCT: 20,       // a coach's: wk/wk fall as a share of the week before, shown as context only
    SCORE_DROP_MIN_PREV: 30,  // points the week before needs before a relative drop may speak (evidence floor)
    FOOD_GAP_DAYS: 3,         // days without a food log (a trainer's house default is ROLE_DEFAULTS')
    FOOD_LOG_DAYS: 3,         // a nutritionist's: food logged on fewer of the last 7 days than this flags
    NUTRITION_MIN_DAYS: 4,    // logged days in the last 7 the calorie and protein averages need (evidence floor)
    CONTACT_GAP_DAYS: 7,      // days without coach↔client contact
    STREAK_MIN_BEST: 3,       // only call a streak "broken" if one existed
    CHECKIN_RED_WEEKS: 2,     // missed weeks that escalate to red on their own
    CHECKIN_GRACE_DAYS: 3,    // don't nag "due this week" before Thu
    LEDGER_OVER_PCT: 10,      // avg kcal ≥ target+10% = ledger blown (nutritionist feed)
    PROTEIN_UNDER_PCT: 15,    // avg protein ≤ target−15% = under target (nutritionist feed)
    GOAL_SLIP_DAYS: 7,        // projected goal date moving ≥ this many days later wk/wk flags
    SLEEP_DEFICIT_H: 1.5,     // 7-day avg sleep MORE than this under target = severe deficit (triage flag)
    SLEEP_MIN_NIGHTS: 3,      // logged nights the sleep average needs before sleep_low or the sleep lever may speak
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
    // ── The coach signals added with the coach-action table (P2, 2026-11-05) ──
    MISSED_SESSIONS: 3,       // booked sessions in the 42-day window not completed that flag (trainer)
    MISSED_MIN_PLANNED: 4,    // booked sessions the window needs before missed_sessions may speak (evidence floor)
    CHECKIN_RATING_LOW: 4,    // a 1-10 weekly rating at or under this is low (every question: 10 is good)
    REPLY_WAIT_HOURS: 24,     // a client's message unanswered this long flags
    PROGRAM_END_DAYS: 7,      // a program ending within this many days, with nothing lined up next, flags
    PROGRAM_ENDED_DAYS: 14,   // …and one that ended up to this many days ago (after that the leg is stale)
    RECOVERY_LOW: 33,         // a wearable's 7-day recovery / readiness average at or under this flags (0-100)
    RECOVERY_MIN_DAYS: 3,     // device readings the recovery average needs (evidence floor)
    PLAN_END_DAYS: 14,        // a cancelled plan ending within this many days flags (the field arrives with P3)
    // ── The trainer alerts (the 2026-11-11 coach-alerts plan, PR 1) ──
    WORKOUT_DONE_PCT: 50,     // under this share of the assigned workouts due in the window done flags (workouts_missed)
    WORKOUT_MISSED_ROW: 2,    // …or the last this many due in a row missed
    WORKOUT_MIN_DUE: 4,       // assigned workouts due in the window before either may speak
    WORKOUT_WINDOW_DAYS: 28,  // the window: past days only, today never counts (engine policy)
    COMPLETION_DROP_PCT: 20,  // the last 2 weeks' completion this many points under the 2 weeks before flags (completion_drop)
    COMPLETION_HALF_MIN: 3,   // assigned workouts due in each 2-week half before the drop may speak (evidence floor)
    QUIET_DAYS: 7,            // days with nothing from the client (workout, food log, check-in, message, a Score day): gone_quiet
    NOT_STARTED_DAYS: 3,      // days after joining with no first workout, meal or check-in: not_started
    NOT_STARTED_UNTIL: 30,    // …read only in the client's first days (after them, gone quiet speaks): engine policy
    NO_BOOKING_DAYS: 14,      // days since the last session kept with this coach, none booked: no_booking
    LOAD_SPIKE_X: 1.5,        // this week's training load (RPE × minutes) over this multiple of the 4-week weekly average (context)
    LOAD_MIN_SESSIONS: 4,     // rated runs the 4-week baseline needs (evidence floor)
    STEPS_DROP_PCT: 30,       // this week's average steps this far under the 4-week average (context; an estimate)
    STEPS_MIN_DAYS: 4,        // days with steps this week needs (evidence floor)
    STEPS_BASE_MIN_DAYS: 14,  // days with steps the 4-week baseline needs (evidence floor)
    // ── The nutritionist's weight alerts (the coach-alerts plan, PR 2). Weigh-ins the client shares
    // with their goals; a client who shares none is silent, with no notice. ──
    LOSS_FAST_PCT: 1,         // a weight-loss goal's 2-week trend losing more than this % of body weight a week: weight_fast
    LOSS_SAFETY_KG: 1,        // …a loss of this many kg a week or more, each of LOSS_SAFETY_WEEKS weeks in a row,
    LOSS_SAFETY_WEEKS: 2,     //    with high hunger or low energy, is red on its own: weight_unsafe
    WEIGHIN_GAP_DAYS: 14,     // days with no weigh-in, for a client who weighed in weekly before: weighin_gap
    SLOW_START_EARLY_PCT: 2,  // a weight-loss goal under this % lost by week 4…
    SLOW_START_LATE_PCT: 3,   // …or under this % by week 8: slow_start
    GAIN_FAST_PCT: 0.5,       // a weight-gain goal's 2-week trend gaining more than this % a week: gain_fast
    // Engine policy, not tunable: the evidence the trend needs, and the GLP-1 lines.
    WEIGH_TREND_DAYS: 21,     // the trend reads the weigh-ins of the last 3 weeks…
    WEIGH_MIN_POINTS: 3,      // …at least this many…
    WEIGH_MIN_SPAN_DAYS: 14,  // …spanning at least 2 weeks
    WEIGH_FROM_DAY: 14,       // the loss and gain paces speak from week 3 of the goal (day 14)
    GLP1_FAST_PCT: 1.5,       // on a GLP-1 medication, the fast-loss line (an estimate: the drugs' trials lose about 1% a week early)
    GLP1_SLOW_PCT: 5,         // …and the slow start: under 5% by week 12 (the drugs' own stopping rule)
    GLP1_TOTAL_PCT: 14,       // …14% or more lost in 3 to 4 months shows as context
    GLP1_PROTEIN_G_KG: 1.2,   // …protein under 1.2 g per kg a day shows as context (1.2–1.6 is advised)
  };

  var DEFAULT_THRESHOLDS = {};
  for (var _tk in THRESHOLDS) if (Object.prototype.hasOwnProperty.call(THRESHOLDS, _tk)) DEFAULT_THRESHOLDS[_tk] = THRESHOLDS[_tk];

  // ⚠ A ROLE'S OWN HOUSE DEFAULTS, OVER THE HOUSE POLICY (owner, 2026-11-10: "make sure these are
  // relevant to each coach. Trainer vs nutritionist", with the coach-alerts research). A food-log gap
  // is the nutritionist's question at 3 days; a trainer owns it only as the client's one coach, and
  // then at 5, which still leaves under 3 logged days in the week. Keyed by DISCIPLINE, so a dietitian
  // reads the nutritionist's. A coach's own tuning still wins over both (resolveThresholds).
  var ROLE_DEFAULTS = {
    training: { FOOD_GAP_DAYS: 5 },
  };
  // The house defaults a role's evaluation starts from: a NEW object, never the shared set.
  function defaultsForRole(role) {
    var out = {};
    for (var k in DEFAULT_THRESHOLDS) if (Object.prototype.hasOwnProperty.call(DEFAULT_THRESHOLDS, k)) out[k] = DEFAULT_THRESHOLDS[k];
    var over = ROLE_DEFAULTS[disciplineForRole(role)];
    if (over) for (var r in over) if (Object.prototype.hasOwnProperty.call(over, r)) out[r] = over[r];
    return out;
  }

  // ⚠ ONLY THE POLICY THRESHOLDS ARE TUNABLE, AND THE LINE IS PRINCIPLED RATHER THAN
  // ARBITRARY. These are questions a coach's practice can legitimately answer
  // differently — "how many days without a food log is a gap in MY practice". The ones
  // deliberately NOT here are the engine's own statistical machinery: the `*_MIN_DAYS`
  // evidence floors (NUTRITION_MIN_DAYS and SCORE_DROP_MIN_PREV among them), `GOAL_RECENT_DAYS`,
  // `GOAL_MIN_SPAN_DAYS`, `GOAL_FAR_DAYS`.
  // The floors in particular guarantee "absence is never a signal" — a member who skips
  // the daily check-in is never flagged for skipping it — and a coach who could lower
  // them to 0 would be manufacturing flags out of no data. A tuning knob that lets you
  // fabricate evidence is not a preference. SCORE_DROP_PTS is the member's own view's and no
  // coach's: a coach's score drop is SCORE_DROP_PCT, so a stored SCORE_DROP_PTS is refused.
  //
  // ⚠ A THRESHOLD A ROLE'S EVALUATION CAN MOVE IS SHOWN TO THAT ROLE. The engine does not
  // evaluate different rules per role so much as ROUTE their flags: `ruleSleepRecovery` fires
  // outside every `disciplineForRole` branch, and `readOnlyFlags` deliberately runs
  // `ruleLedgerBlown`, `ruleProteinUnder` and `ruleHungerHigh` for the NON-nutrition role so a
  // trainer keeps full visibility of the under-fuelling read as routed context. A `role` field
  // that hid those rows was a fiction, and was removed: a role ran on a setting its panel could
  // neither display nor reset. `roles` names the disciplines that read a threshold, only where
  // that is true: FOOD_LOG_DAYS is read by the nutrition evaluation alone
  // (tests/coach-flags-by-role.test.mjs holds a trainer's feed still while it moves).
  // `byRole` words a row for one discipline: a nutritionist's program is a plan.
  var TUNABLES = [
    { key: "FOOD_GAP_DAYS",      label: "Food-log gap",        unit: "days",  min: 1,  max: 14, step: 1,
      help: "Days with no food log before it flags.",
      byRole: { training: { help: "Days with no food log before it flags. Yours when you're their only coach; with a nutritionist on, you see it as theirs." } } },
    { key: "FOOD_LOG_DAYS",      label: "Logging days",        unit: "days",  min: 2,  max: 7,  step: 1, roles: ["nutrition"],
      help: "Flag a client who logged food on fewer than this many of the last 7 days." },
    { key: "CONTACT_GAP_DAYS",   label: "Contact gap",         unit: "days",  min: 1,  max: 30, step: 1,
      help: "Flag when neither of you has written for this long." },
    { key: "CHECKIN_GRACE_DAYS", label: "Check-in grace",      unit: "days",  min: 0,  max: 6,  step: 1,
      help: "Days into the week before an unfiled check-in is called due." },
    { key: "CHECKIN_RED_WEEKS",  label: "Check-ins missed",    unit: "weeks", min: 1,  max: 8,  step: 1,
      help: "Consecutive missed check-ins that go red on their own." },
    { key: "SCORE_DROP_PCT",     label: "Score drop",          unit: "%",     min: 5,  max: 60, step: 1,
      help: "A week's Shape Score this far under the week before shows on the client. It never colours the row or sends an alert." },
    { key: "GOAL_SLIP_DAYS",     label: "Goal slip",           unit: "days",  min: 1,  max: 60, step: 1,
      help: "How far a projected goal date may move later before it flags. A weight goal is the nutritionist's; a strength or endurance goal is the trainer's." },
    { key: "SLEEP_DEFICIT_H",    label: "Sleep deficit",       unit: "hours", min: 0.5, max: 4, step: 0.5,
      help: "7-day average sleep this far under target reads as a severe deficit.",
      byRole: { nutrition: { help: "7-day average sleep this far under target reads as a severe deficit. The trainer's when one is on; yours when you're their only coach." } } },
    { key: "LEDGER_OVER_PCT",    label: "Calories over",       unit: "%",     min: 1,  max: 50, step: 1,
      help: "Average intake this far above target flags, once at least 4 days of the week are logged.",
      byRole: { training: { help: "Average intake this far above target. Yours only when you're their only coach, and then it never turns a row red: share general guidance or suggest a dietitian." } } },
    { key: "PROTEIN_UNDER_PCT",  label: "Protein under",       unit: "%",     min: 1,  max: 50, step: 1,
      help: "Average protein this far below target flags, once at least 4 days of the week are logged.",
      byRole: { training: { help: "Average protein this far below target. Yours only when you're their only coach, and then it never turns a row red: share general guidance or suggest a dietitian." } } },
    { key: "MISSED_SESSIONS",    label: "Missed sessions",     unit: "sessions", min: 1, max: 10, step: 1,
      help: "Your booked sessions with them in the last six weeks not marked completed before it flags." },
    { key: "REPLY_WAIT_HOURS",   label: "Reply wait",          unit: "hours", min: 2,  max: 72, step: 1,
      help: "How long a client's message may wait for your reply before it flags." },
    { key: "PROGRAM_END_DAYS",   label: "Program ending",      unit: "days",  min: 1,  max: 21, step: 1,
      help: "Flag a program this many days before it ends when nothing is lined up next.",
      // ⚠ NOT LIVE FOR A NUTRITIONIST YET, AND THE ROW SAYS SO (F8, the engine audit): their program
      // leg reads coach_program_assignments, which no page writes (coach-client-legs.mjs), so the flag
      // never fires on a live client. Reading published meal plans' end dates is a War Room item.
      byRole: { nutrition: { label: "Plan ending", help: "Not live yet: Shape can't read when a meal plan ends, so this doesn't flag for now. Once it can, it flags a plan this many days before it ends when nothing is lined up next." } } },
    // ── The trainer alerts (the 2026-11-11 coach-alerts plan, PR 1). Workout completion is read by the
    // trainer's evaluation alone (a nutritionist sees it in joint attention, at the trainer's line). ──
    { key: "WORKOUT_DONE_PCT",   label: "Workout completion",  unit: "%",     min: 10, max: 90, step: 5, roles: ["training"],
      help: "Flag when fewer than this share of the workouts you assigned, due in the last 4 weeks, were done." },
    { key: "WORKOUT_MISSED_ROW", label: "Workouts missed in a row", unit: "workouts", min: 1, max: 6, step: 1, roles: ["training"],
      help: "Flag when this many of your assigned workouts in a row were missed." },
    { key: "WORKOUT_MIN_DUE",    label: "Workouts due first",  unit: "workouts", min: 2, max: 12, step: 1, roles: ["training"],
      help: "Assigned workouts due in the last 4 weeks before completion may flag. Workouts they added themselves never count." },
    { key: "COMPLETION_DROP_PCT", label: "Completion drop",    unit: "points", min: 5, max: 60, step: 5, roles: ["training"],
      help: "Flag when the last 2 weeks' workout completion falls this many points under the 2 weeks before, so a slide from 95% to 70% is caught." },
    { key: "QUIET_DAYS",         label: "Quiet after",         unit: "days",  min: 3,  max: 30, step: 1,
      help: "Days with nothing from them (no workout, food log, check-in, message or Shape Score day) before it flags. It takes the place of the food-log and contact gaps." },
    { key: "NOT_STARTED_DAYS",   label: "Not started by",      unit: "days",  min: 1,  max: 14, step: 1,
      help: "Days after joining with no first workout, meal or check-in before it flags." },
    { key: "NO_BOOKING_DAYS",    label: "No booking after",    unit: "days",  min: 5,  max: 60, step: 1,
      help: "Days since your last session with them, with nothing booked, before it flags. Clients who only follow a program never get it." },
    { key: "LOAD_SPIKE_X",       label: "Training load spike", unit: "×",     min: 1.1, max: 3, step: 0.1, roles: ["training"],
      help: "This week's effort (rating × minutes) over this multiple of their 4-week weekly average shows on the client. It never colours the row or sends an alert." },
    { key: "STEPS_DROP_PCT",     label: "Steps falling",       unit: "%",     min: 10, max: 70, step: 5, roles: ["training"],
      help: "This week's average steps this far under their own 4-week average shows on the client. It never colours the row or sends an alert. 30% is an estimate." },
    // ── The nutritionist's weight alerts (PR 2): Plans & progress. The gain pace is both coaches'. ──
    { key: "LOSS_FAST_PCT",      label: "Losing fast",         unit: "% a week", min: 0.5, max: 3, step: 0.1,
      help: "Flag a weight-loss goal whose 2-week trend loses more than this share of body weight a week, from week 3 of the goal. On a GLP-1 medication the line is 1.5%.",
      byRole: { training: { help: "The nutritionist's: you see a client losing fast as context, on the client and never counted, as their only coach too." } } },
    { key: "LOSS_SAFETY_KG",     label: "Safety loss",         unit: "kg a week", min: 0.5, max: 3, step: 0.1,
      help: "A loss of this much a week or more, for the safety weeks in a row, with high hunger or low energy, is red on its own.",
      byRole: { training: { help: "With a nutritionist on, theirs, and you see it as context. Without one, it's yours, and red on its own." } } },
    { key: "LOSS_SAFETY_WEEKS",  label: "Safety weeks",        unit: "weeks", min: 1,  max: 6,  step: 1,
      help: "Weeks in a row the safety loss needs.",
      byRole: { training: { help: "Weeks in a row the safety loss needs." } } },
    { key: "WEIGHIN_GAP_DAYS",   label: "Weigh-in gap",        unit: "days",  min: 5,  max: 30, step: 1,
      help: "Days with no weigh-in before it flags, for a client with a weight goal who weighed in weekly over the 4 weeks before.",
      byRole: { training: { help: "Days with no weigh-in before it flags, for a client with a weight goal who weighed in weekly. The nutritionist's when one is on; yours when you're their only coach." } } },
    { key: "SLOW_START_EARLY_PCT", label: "Slow start, week 4", unit: "%",    min: 0.5, max: 5, step: 0.5,
      help: "Flag a weight-loss goal that has lost less than this by week 4. On a GLP-1 medication the slow start is under 5% by week 12.",
      byRole: { training: { help: "A weight-loss goal with less than this lost by week 4 flags. The nutritionist's when one is on; yours when you're their only coach." } } },
    { key: "SLOW_START_LATE_PCT", label: "Slow start, week 8", unit: "%",     min: 1,  max: 8,  step: 0.5,
      help: "…or less than this by week 8.",
      byRole: { training: { help: "…or less than this by week 8." } } },
    { key: "GAIN_FAST_PCT",      label: "Gaining fast",        unit: "% a week", min: 0.1, max: 2, step: 0.05,
      help: "Flag a weight-gain goal whose 2-week trend gains more than this share of body weight a week. The evidence supports 0.25 to 0.5%. A trend that isn't gaining flags too." },
    { key: "RECOVERY_LOW",       label: "Low recovery",        unit: "/100",  min: 10, max: 70, step: 1,
      help: "A wearable's recovery or readiness averaging at or under this over the week flags.",
      byRole: { nutrition: { help: "A wearable's recovery or readiness averaging at or under this over the week flags. The trainer's when one is on; yours when you're their only coach." } } },
  ];
  var TUNABLE_BY_KEY = {};
  for (var _i = 0; _i < TUNABLES.length; _i++) TUNABLE_BY_KEY[TUNABLES[_i].key] = TUNABLES[_i];

  // The rows one role's Settings shows: the tunables that role's evaluation reads (`roles`), in its
  // own words (`byRole`), each with that role's house value (`house`, from defaultsForRole).
  // Without a role, every row in the shared words with the house policy's values.
  function tunablesFor(role) {
    var disc = role ? disciplineForRole(role) : null;
    var house = role ? defaultsForRole(role) : DEFAULT_THRESHOLDS;
    var out = [];
    for (var i = 0; i < TUNABLES.length; i++) {
      var t = TUNABLES[i];
      if (disc && Array.isArray(t.roles) && t.roles.indexOf(disc) < 0) continue;
      var words = disc && t.byRole && t.byRole[disc] ? t.byRole[disc] : {};
      out.push({ key: t.key, label: words.label || t.label, unit: t.unit, min: t.min, max: t.max, step: t.step, help: words.help || t.help, house: house[t.key] });
    }
    return out;
  }

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
  // ⚠ AND THE HOUSE VALUES ARE THE ROLE'S (ROLE_DEFAULTS): pass the role the set is for. A caller
  // without one gets the house policy, as before; every coach caller passes it (the website's
  // useCoachThresholds, notify-core's loadCoachThresholds, coachToday, the app's shapeSignals).
  function resolveThresholds(overrides, role) {
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
    var house = role ? defaultsForRole(role) : DEFAULT_THRESHOLDS;
    var out = {};
    for (var d in house) {
      if (!Object.prototype.hasOwnProperty.call(house, d)) continue;
      out[d] = Object.prototype.hasOwnProperty.call(applied, d) ? applied[d] : house[d];
    }
    return { thresholds: out, applied: applied, refused: refused };
  }

  // Run `fn` with `t` as the effective set, then put back what was there.
  // ⚠ SYNCHRONOUS BY CONSTRUCTION. The fifteen rule functions read the closed-over
  // `THRESHOLDS`, and threading a parameter through all of them is a wide change with
  // a lot of places to get one wrong. This scopes it at the three entry points
  // instead — and because `fn` is synchronous, nothing can interleave between the
  // swap and the restore, so a server handling two coaches cannot mix them.
  // ⚠ A CALL WITH NO SET RUNS ON ITS ROLE'S HOUSE DEFAULTS, ONCE. An entry point handed no
  // thresholds (nothing tuned, or a caller that never reads them) scopes `defaultsForRole(role)`
  // itself (inScope), so a trainer's food-log gap is 5 days with or without a coach document. Inside
  // a scope, a nested entry point (getTriageFeed's evaluateClient, buildDirective's) keeps the set it
  // is in: re-scoping there would put the house value back over a coach's own tuning.
  var _scopes = 0;
  function inScope() { return _scopes > 0; }
  function withThresholds(t, fn) {
    if (!t || typeof t !== "object") return fn();
    var prev = {};
    for (var k in DEFAULT_THRESHOLDS) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_THRESHOLDS, k)) continue;
      prev[k] = THRESHOLDS[k];
      if (Object.prototype.hasOwnProperty.call(t, k)) THRESHOLDS[k] = t[k];
    }
    _scopes++;
    try { return fn(); } finally {
      _scopes--;
      for (var r in prev) if (Object.prototype.hasOwnProperty.call(prev, r)) THRESHOLDS[r] = prev[r];
    }
  }


  // ── The reader's own day (F2, the engine audit of 2026-11-11) ─────────────
  // Every rule reads days off the process's local clock (mondayOf, getDay, a "YYYY-MM-DD" read as
  // local midnight). On a device that is the person's own zone; on the server it is UTC, so the push
  // and Nora's Today counted a Los Angeles coach's week from 4 pm Sunday: red "No check-in for 2
  // weeks" on Sunday evening while their screen read amber. inZone(zone, now, fn) runs `fn` on the
  // zone's WALL CLOCK: `now` and every instant a rule parses (toDate of a time written with Z or an
  // offset) are moved to a local Date that reads the zone's date and hour, so day counts, Mondays
  // and weekdays come out as the person's own. A date with no time is a day already and stays put.
  // ⚠ SYNCHRONOUS, AS withThresholds IS: one scope at a time, put back before anything else runs.
  // ⚠ A FLAG'S SIGNATURE NEVER CARRIES A MOVED INSTANT (instantKey): a coach's dismissal is matched
  // on the signature the device wrote, and a shifted one would let a dismissed flag push again.
  // ⚠ AND ELAPSED TIME IS MEASURED BETWEEN REAL INSTANTS (Codex on #2703): the wall clock gains or
  // loses an hour across a daylight-saving change, so a reply that had waited 2.5 hours on the
  // fall-back night read 1.5 and a 2-hour alert never fired. A reply's hours and a snooze's end compare
  // instants (instantNow, parseDate); only days, weeks and weekdays read the wall clock.
  var _zone = null;
  var _zoneAt = null;
  var _zoneFmt = {};
  function zoneFormatter(zone) {
    if (typeof zone !== "string" || !zone) return null;
    if (Object.prototype.hasOwnProperty.call(_zoneFmt, zone)) return _zoneFmt[zone];
    var f = null;
    try {
      f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    } catch (e) { f = null; }
    _zoneFmt[zone] = f;
    return f;
  }
  // A local Date whose date and hour read what a clock in `zone` read at instant `d`.
  function wallClock(d, zone) {
    var f = zoneFormatter(zone);
    if (!f || !(d instanceof Date) || isNaN(d.getTime())) return d;
    var p = {};
    var parts = f.formatToParts(d);
    for (var i = 0; i < parts.length; i++) p[parts[i].type] = parts[i].value;
    var x = new Date(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second, d.getMilliseconds());
    return isNaN(x.getTime()) ? d : x;
  }
  function inZone(zone, now, fn) {
    var at = now instanceof Date && !isNaN(now.getTime()) ? now : new Date();
    // Inside a scope already, or no zone this engine can read: the clock as it is.
    if (_zone || !zoneFormatter(zone)) return fn(at);
    _zone = zone;
    _zoneAt = at;
    try { return fn(wallClock(at, zone)); } finally { _zone = null; _zoneAt = null; }
  }
  // The real instant behind a scope's wall clock, for elapsed time; outside a scope, `now` itself.
  function instantNow(now) { return _zone && _zoneAt ? _zoneAt : now; }
  // A time written with its zone (Z or an offset): an instant, which a scope moves to the wall clock.
  var EXPLICIT_ZONE = /(?:[zZ]|[+-]\d\d(?::?\d\d)?)$/;
  function parseDate(v) {
    if (v == null) return null;
    var d = v instanceof Date ? v : new Date(String(v).length === 10 ? v + "T00:00:00" : v);
    return isNaN(d.getTime()) ? null : d;
  }
  function toDate(v) {
    var d = parseDate(v);
    if (!d || !_zone || v instanceof Date) return d;
    var s = String(v);
    return s.length > 10 && EXPLICIT_ZONE.test(s) ? wallClock(d, _zone) : d;
  }
  // An instant as a flag's signature carries it, the same in every zone and scope.
  function instantKey(v) {
    var d = parseDate(v);
    return d ? d.toISOString() : String(v);
  }
  function daysBetween(a, b) { return Math.floor((b.getTime() - a.getTime()) / DAY); }
  // The calendar day `now` falls on in the account's `zone`, as a local Date that mondayOf and
  // daysBetween read the way they read a "YYYY-MM-DD" weekOf. With no zone passed (the day feed
  // failed while the roster loaded), shapeZone.mjs's viewer zone, which is the account's once
  // /api/me/timezone has answered (#2628 review); the device's day only without shapeZone.mjs.
  function dayInZone(now, zone) {
    var Z = typeof globalThis !== "undefined" && globalThis.ShapeZone && typeof globalThis.ShapeZone.partsInZone === "function" ? globalThis.ShapeZone : null;
    var z = typeof zone === "string" && zone ? zone : (Z && typeof Z.viewerZone === "function" ? Z.viewerZone() : null);
    var p = Z && typeof z === "string" && z ? Z.partsInZone(now.getTime(), z) : null;
    return p ? new Date(p.y, p.mo - 1, p.d, 12) : now;
  }
  function mondayOf(d) {
    var x = new Date(d.getTime());
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }
  function iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  // The Monday of `now`'s week, as the key a weekly reading's episode signature carries: a flag
  // dismissed this week comes back next week if it still holds.
  function weekKey(now) { return iso(mondayOf(now instanceof Date ? now : new Date())); }
  // Whole days since the client joined this coach (the earliest live subscription), or null.
  function clientDays(c, now) {
    var j = c && ((c.profile && c.profile.joinedAt) || (c.payments && c.payments.joinedAt));
    var d = toDate(j);
    return d ? daysBetween(d, now) : null;
  }
  // Local midnight of the day the client joined this coach, or null: for comparing with a dated log,
  // which is a day, not a moment.
  function clientJoinDay(c) {
    var d = toDate(c && ((c.profile && c.profile.joinedAt) || (c.payments && c.payments.joinedAt)));
    if (!d) return null;
    var x = new Date(d.getTime());
    x.setHours(0, 0, 0, 0);
    return x;
  }
  // ── A client's pause ("away until <date>", 2026-11-11-client-pause.sql) ────────────────────
  // Set by the member or any of their coaches; record.pause = { until: "YYYY-MM-DD", by, backAt? } from the
  // overview, null when none. While it holds, and for PAUSE_BACK_DAYS after it ends, the rules that read
  // the client's absence stay quiet (PAUSE_SILENCED) and a coach sees "Back from a break" instead. For
  // PAUSE_BOUND_DAYS after it ends, the gaps (food logs, check-ins, contact) count from the day they came
  // back, never from before the break. Engine policy, not a coach tunable.
  var PAUSE_BACK_DAYS = 3;
  var PAUSE_BOUND_DAYS = 14;
  var PAUSE_SILENCED = { food_gap: true, food_logging: true, checkin_overdue: true, contact_gap: true, missed_sessions: true, goal_slip: true, streak_broken: true, score_drop: true,
    // The trainer alerts (PR 1): every one that reads their absence (owner: anyone on a break stays quiet).
    workouts_missed: true, completion_drop: true, gone_quiet: true, not_started: true, no_booking: true, load_spike: true, steps_falling: true,
    // The weight alerts (PR 2): a weigh-in gap reads their absence.
    weighin_gap: true };
  var ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
  // null | { state: "paused", until, by } | { state: "back", until, since, day, fresh, by }: `since` is
  // the return day, `day` the days since it (0 on it), `fresh` within PAUSE_BACK_DAYS.
  // ⚠ ON THE MEMBER'S CALENDAR, NOT THE VIEWER'S (Codex on #2705). `until` is the member's last day
  // away, and a coach's surface runs on the coach's day: a coach a day ahead saw "Back from a break"
  // while the member was still away. `backAt` (get_client_pause) is the instant their return day
  // begins, the same in every zone; without it (a snapshot saved before it), the viewer's day.
  // `bound`: how many days back it still reads (PAUSE_BOUND_DAYS by default); the weigh-in gap reads it longer.
  function pauseOf(c, now, bound) {
    var p = c && c.pause;
    if (!p || typeof p !== "object" || typeof p.until !== "string" || !ISO_DAY.test(p.until)) return null;
    var by = typeof p.by === "string" ? p.by : null;
    var back = toDate(p.until);
    back.setDate(back.getDate() + 1);
    var backAt = typeof p.backAt === "string" ? parseDate(p.backAt) : null;
    var day;
    if (backAt) {
      var at = instantNow(now);
      if (at.getTime() < backAt.getTime()) {
        // ⚠ A BREAK READ AFTER THE ROSTER WAS SAVED, AND OVER BY THEN (Codex on #2705). The hourly run reads
        // a coach's stored roster as of its save (notify-core rosterClock) and lays each break over it as
        // read at the run (`readAt`). One that ended after the save read as still under way, so the coach's
        // "Back from a break" waited for their next visit. Over by the read, the welcome back speaks for its
        // PAUSE_BACK_DAYS, counted to the read; the roster knows nothing of the days since they came back,
        // so nothing that reads their absence speaks, then or after.
        var readAt = typeof p.readAt === "string" ? parseDate(p.readAt) : null;
        var readDay = readAt && readAt.getTime() >= backAt.getTime() ? daysBetween(backAt, readAt) : -1;
        if (readDay >= 0 && readDay < PAUSE_BACK_DAYS) return { state: "back", until: p.until, since: iso(back), day: readDay, fresh: true, by: by };
        return { state: "paused", until: p.until, by: by };
      }
      day = daysBetween(backAt, at);
    } else {
      if (iso(now) <= p.until) return { state: "paused", until: p.until, by: by };
      day = daysBetween(back, now);
    }
    if (day >= (bound || PAUSE_BOUND_DAYS)) return null;
    return { state: "back", until: p.until, since: iso(back), day: day, fresh: day < PAUSE_BACK_DAYS, by: by };
  }
  // Local midnight of the day they came back from a break, while the gaps still count from it; else null.
  function resumeDay(c, now) {
    var p = pauseOf(c, now);
    return p && p.state === "back" ? toDate(p.since) : null;
  }
  // The days since they came back, on the member's calendar (pauseOf's `day`, from backAt), while the
  // gaps still count from it; else null. ⚠ NOT daysBetween(resumeDay, now) (Codex on #2705): that is
  // their return date on the viewer's clock, so a coach a day behind the member counted a day fewer.
  function resumeDays(c, now) {
    var p = pauseOf(c, now);
    return p && p.state === "back" ? p.day : null;
  }
  // The coach's welcome back, for PAUSE_BACK_DAYS after a break: both coaches' (FLAG_DISCIPLINE general).
  function rulePauseEnded(p) {
    if (!p || p.state !== "back" || !p.fresh) return null;
    return { key: "pause_ended", label: p.day === 0 ? "Back today" : "Back " + p.day + "d", reason: p.day === 0 ? "Back from a break today: see how it went" : "Back from a break since " + p.since + ": see how it went", figures: { since: p.since, day: p.day }, sig: "back:" + p.since };
  }

  // The viewer's own onboarding board for this client (the overview's `onboarding`, per role;
  // client-onboarding review, fix 4), and one of its steps.
  function onboardingFor(c, role) {
    var disc = disciplineForRole(role);
    var key = disc === "training" ? "trainer" : disc === "nutrition" ? "nutritionist" : null;
    var ob = c && c.onboarding;
    return key && ob && typeof ob === "object" && ob[key] ? ob[key] : null;
  }
  function onboardingStep(ob, key) {
    var steps = ob && Array.isArray(ob.steps) ? ob.steps : [];
    for (var i = 0; i < steps.length; i++) if (steps[i] && steps[i].key === key) return steps[i];
    return null;
  }

  // ── Goal projection (the Goals page core) ──────────────────────────────────
  // Pros set up to MAX_GOALS goals per client; clients view them. Each goal
  // carries a value history; the projection is a least-squares pace over the
  // RECENT window (an old hot streak can't promise a date the current pace
  // won't deliver), run forward from the latest point. Missing or too-short
  // history is reported as a state, never guessed.

  var MAX_GOALS = 3;
  // The label a self-set weight goal gets when the member gave it no title. A reason that names
  // the goal says it as written; the member's own view also says when it is this stand-in
  // (ruleGoalSlip's `untitled`), so the app can name the goal in the member's language instead.
  var UNTITLED_WEIGHT_GOAL = "Goal weight";
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
  // `thresholds`: the coach's resolved set, so the "(ETA +Nd this wk)" note slips at their own Goal
  // slip line (F10), as the row's goal_slip flag does. Without one, the house line.
  function goalBrief(c, now, thresholds) {
    if (thresholds && typeof thresholds === "object") return withThresholds(thresholds, function () { return goalBrief(c, now); });
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
        id: "overall", label: o.title || UNTITLED_WEIGHT_GOAL, metric: "weight",
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
  // ⚠ A FLAG THE MEMBER CAN LEAD WITH ALSO CARRIES `figures`: the numbers (and the date or the
  // goal's own name) its reason was built from, never a formatted string. The reason stays English
  // for coaches and for a caller with no translator; the member's own directive copies the figures
  // into `evidence` (buildDirective), and Home, the splash and the member's push say the same thing
  // from them in the member's language and units (leadReason.mjs bsLeadReason, which the
  // notification layer's goal-slip and Score-dip notices read off the flag too). tagFlag never
  // copies them, so no coach row or coach push sees them.

  function ruleStreakBroken(c) {
    var s = c.streaks;
    if (!s || s.current == null || s.best == null) return null;
    if (s.current === 0 && s.best >= THRESHOLDS.STREAK_MIN_BEST) {
      return { key: "streak_broken", label: "Streak broken", reason: "Streak broken — was " + s.best + " days", figures: { best: s.best }, sig: "best:" + s.best + "|" + (s.lastActiveOn || "") };
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
      // The newest COMPLETE week the delta reads — the score_drop episode a dismissal keys on.
      completeWeekOf: complete.length ? complete[complete.length - 1].weekOf || null : null,
      // The complete week before it: what a coach's relative drop is a share of.
      prevComplete: complete.length >= 2 ? Number(complete[complete.length - 2].points) : null,
      // The series a sparkline should draw — the partial week is a real point.
      series: weeks.map(function (w) { return Number(w.points); }),
    };
  }

  // ⚠ A COACH'S SCORE DROP IS RELATIVE, AND CONTEXT (the coach-alerts research, 2026-11-10). The
  // Score pays 5 for a community post or a good night's sleep, so a 5-point fall is one quiet evening:
  // a coach's flag is the newest complete week SCORE_DROP_PCT under the one before (TrueCoach's
  // compliance drop is relative too), once that week held SCORE_DROP_MIN_PREV points, and it never
  // counts toward a coach's severity (CONTEXT_FLAGS). The member's own view keeps the absolute
  // SCORE_DROP_PTS and its notice, unchanged.
  function ruleScoreDrop(c, role) {
    var r = scoreWeekReading(c.shapeScoreHistory);
    if (!r || r.delta == null) return null;
    var drop = -r.delta;
    var sig = "wk:" + (r.completeWeekOf || "");
    if (disciplineForRole(role) !== "general") {
      var prev = r.prevComplete;
      if (!(drop > 0) || prev == null || !(prev >= THRESHOLDS.SCORE_DROP_MIN_PREV)) return null;
      // The line is the exact share, never the rounded one (Codex): 41 to 33 is 19.5%, under 20, though
      // it prints as 20. Points are whole, so the cross-multiplied test has no float in it.
      if (drop * 100 < THRESHOLDS.SCORE_DROP_PCT * prev) return null;
      var pct = Math.round((drop / prev) * 100);
      return { key: "score_drop", label: "Score \u2193" + pct + "%", reason: "Shape Score down " + drop + " pts (" + pct + "%) week-over-week", figures: { drop: drop, pct: pct }, sig: sig };
    }
    if (drop >= THRESHOLDS.SCORE_DROP_PTS) {
      return { key: "score_drop", label: "Score \u2193" + drop, reason: "Shape Score down " + drop + " pts week-over-week", figures: { drop: drop }, sig: sig };
    }
    return null;
  }

  function ruleFoodGap(c, now) {
    var f = c.foodLogs;
    if (!f) return null;
    var last = toDate(f.lastLoggedOn);
    if (last) {
      var gap = daysBetween(last, now);
      // ⚠ THE GAP IS COUNTED FROM WHEN THEY JOINED, NOT FROM BEFORE (Codex on #2378): a log from before
      // they hired this coach dated it, so a client who joined today after last logging ten days ago
      // read "No logs 10d" on day one. It is bounded by their days as a client; without a joining date,
      // the roster's 14-day "new" decides, as for the empty week below.
      // ⚠ AT DAY GRANULARITY (Fable on #2378): the log is a day and the join a moment, so a client who
      // joined at 8 pm and logged dinner that evening read "No logs 3d · since they joined". The bound
      // applies only to a last log dated before the join day, and counts from that day.
      var joinDay = clientJoinDay(c);
      var bounded = !!joinDay && last < joinDay;
      if (bounded) gap = daysBetween(joinDay, now);
      else if (!joinDay && c.profile && c.profile.isNew) return null;
      // A log from before their break counts the gap from the day they came back (pauseOf).
      var backDay = resumeDay(c, now);
      if (backDay && last < backDay && (!bounded || joinDay < backDay)) {
        gap = resumeDays(c, now);
        if (gap < THRESHOLDS.FOOD_GAP_DAYS) return null;
        return { key: "food_gap", label: "No logs " + gap + "d", reason: "No food logs in the " + gap + " days since their break", figures: { days: gap, sinceBreak: true }, sig: "back:" + iso(backDay) };
      }
      if (gap >= THRESHOLDS.FOOD_GAP_DAYS) {
        return { key: "food_gap", label: "No logs " + gap + "d", reason: bounded ? "No food logs in the " + gap + " days since they joined" : "No food logs in " + gap + " days", figures: { days: gap, sinceJoined: bounded }, sig: bounded ? "joined:" + iso(joinDay) : "last:" + iso(last) };
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
      // ⚠ "7d+" CLAIMS SEVEN DAYS AS A CLIENT (client-onboarding review, M13). An empty week is every
      // client on their first day, and read amber "No logs 7d+" in place of "New". Their joining
      // date decides it; without one, the roster's 14-day "new" does.
      var days = clientDays(c, now);
      if (days != null ? days < 7 : !!(c.profile && c.profile.isNew)) return null;
      return { key: "food_gap", label: "No logs 7d+", reason: "No food logs in the last week", figures: { lastWeek: true }, sig: "week:none" };
    }
    return null;
  }

  // Logging consistency (a nutritionist's; the coach-alerts research): food logged on fewer than
  // FOOD_LOG_DAYS of the last 7 days. At least 3 logged days a week goes with keeping weight off and 5
  // with losing more (Arroyo 2024), so a gap rule alone misses the client who logs one day in three.
  // Read from the 7-day count every surface quotes; nothing when the gap rule already speaks (the
  // stronger statement of the same week), when no day is logged at all (the gap's own "No logs 7d+",
  // or a gap the coach set longer than a week), or in a client's first week.
  function ruleFoodLogging(c, now) {
    var f = c.foodLogs;
    var n = f ? kpiNum(f.daysLogged7d) : null;
    if (n == null || n < 1 || n >= THRESHOLDS.FOOD_LOG_DAYS) return null;
    var days = clientDays(c, now);
    if (days != null ? days < 7 : !!(c.profile && c.profile.isNew)) return null;
    return { key: "food_logging", label: "Logged " + n + " of 7 days", reason: "Food logged on " + n + " of the last 7 days", figures: { days: n }, sig: "wk:" + weekKey(now) };
  }

  // Returns { flag, missedWeeks } so severity can escalate on missedWeeks.
  function ruleCheckinOverdue(c, now) {
    var ci = c.checkIn;
    if (!ci) return null;
    var thisMonday = mondayOf(now);
    var last = toDate(ci.lastWeekOf);
    // ⚠ A CHECK-IN FROM BEFORE THEY HIRED THIS COACH IS NOT ONE (F4, the engine audit): check-ins are
    // the member's, not per coach, so a client who joined on Monday after last checking in six weeks
    // earlier read red "No check-in for 6 weeks" on day one. A week before the join week reads as no
    // check-in yet, which keeps a new client's pass. The food-gap rule bounds its count the same way.
    var joinDay = clientJoinDay(c);
    if (last && joinDay && mondayOf(last) < mondayOf(joinDay)) last = null;
    // Back from a break: the weeks they were away are not missed, nor the week they came back in. A
    // check-in from before it counts as one for that week, so the week after is the first one due.
    var backDay = resumeDay(c, now);
    var sinceBreak = false;
    if (backDay && (!last || mondayOf(last) < mondayOf(backDay))) {
      last = mondayOf(backDay);
      sinceBreak = true;
    }
    if (!last) {
      if (c.profile && c.profile.isNew) return null; // new clients get a pass
      return { key: "checkin_overdue", missedWeeks: 99, label: "No first check-in", reason: "Hasn't completed a first check-in", figures: { first: true }, sig: "first" };
    }
    var missedWeeks = Math.max(0, Math.round(daysBetween(mondayOf(last), thisMonday) / 7));
    if (missedWeeks === 0) return null;
    // One missed week = "due" — only nag from Thu on (grace), so Monday
    // mornings aren't a wall of amber.
    var dayIntoWeek = (now.getDay() + 6) % 7; // Mon=0 … Sun=6
    if (missedWeeks === 1 && dayIntoWeek < THRESHOLDS.CHECKIN_GRACE_DAYS) return null;
    var label = sinceBreak
      ? (missedWeeks === 1 ? "Check-in due — the first since their break" : "No check-in in the " + missedWeeks + " weeks since their break")
      : missedWeeks === 1
      ? "Check-in due — last was week of " + iso(mondayOf(last))
      : "No check-in for " + missedWeeks + " weeks";
    // `lastWeekOf` is the Monday the reason names, as the reason prints it (YYYY-MM-DD, local).
    return { key: "checkin_overdue", missedWeeks: missedWeeks, label: missedWeeks === 1 ? "Check-in due" : "Check-in " + missedWeeks + "w late", reason: label, figures: { missedWeeks: missedWeeks, lastWeekOf: iso(mondayOf(last)) }, sig: "last:" + iso(mondayOf(last)) };
  }

  function ruleContactGap(c, now, role) {
    // A new client the coach has not written to yet (fix 4: the coach's own first message is its own
    // step, after Shape's welcome). Shape's welcome dates the thread, so the quiet check below would
    // wait five days and then call it a lapse; this says what it is, from day 3.
    var ob = onboardingFor(c, role);
    var hello = onboardingStep(ob, "hello");
    if (hello && hello.done === false && ob.day >= 3) {
      return { key: "contact_gap", label: "Say hello", reason: "You haven't written to them since they joined " + (ob.day - 1) + " days ago", sig: "hello", figures: { hello: true } };
    }
    var lc = c.lastContact;
    if (!lc) return null;
    var ts;
    var disc = disciplineForRole(role);
    if (disc === "training") ts = lc.trainer;
    else if (disc === "nutrition") ts = lc.nutritionist;
    else {
      // Client view: most recent contact from ANY of their pros (the value as written, for its signature).
      // ⚠ THE LATER OF THE TWO BY REAL INSTANT (Codex on #2703): in the hour a fall-back repeats, 09:15Z
      // reads 01:15 on a Los Angeles wall clock and 08:30Z reads 01:30, so wall clocks pick the older.
      var a = parseDate(lc.trainer), b = parseDate(lc.nutritionist);
      ts = a && b ? (a > b ? lc.trainer : lc.nutritionist) : (a ? lc.trainer : b ? lc.nutritionist : null);
    }
    var last = toDate(ts);
    if (!last) {
      // ⚠ A KNOWN NEVER IS A FLAG (client-onboarding review, L8). The leg carries the coach's own
      // role as null when they hold the link and have never messaged (bsLastContactLeg), and this
      // returned nothing, so a client nobody had written to was the one client never flagged. An
      // absent leg is still "not shared", never "never".
      var own = disc === "training" ? "trainer" : disc === "nutrition" ? "nutritionist" : null;
      if (!own || !Object.prototype.hasOwnProperty.call(lc, own) || lc[own] !== null) return null;
      var since = clientDays(c, now);
      if (since == null || since < THRESHOLDS.CONTACT_GAP_DAYS) return null;
      return { key: "contact_gap", label: "Never messaged", reason: "No message in the " + since + " days since they joined", sig: "never", figures: { never: true } };
    }
    var gap = daysBetween(last, now);
    // Quiet since before their break: counted from the day they came back.
    var backDay = resumeDay(c, now);
    if (backDay && last < backDay) {
      gap = resumeDays(c, now);
      if (gap < THRESHOLDS.CONTACT_GAP_DAYS) return null;
      return { key: "contact_gap", label: "Quiet " + gap + "d", reason: "No contact in the " + gap + " days since their break", sig: "back:" + iso(backDay), figures: { days: gap, sinceBreak: true } };
    }
    if (gap >= THRESHOLDS.CONTACT_GAP_DAYS) {
      return { key: "contact_gap", label: "Quiet " + gap + "d", reason: "No contact in " + gap + " days", sig: "last:" + instantKey(ts), figures: { days: gap } };
    }
    return null;
  }

  // Nutritionist-feed rules: intake quality vs the plan's targets. Both need
  // value AND target — live data carries averages today but no targets, so
  // these skip on live until targets reach the overview (no false alarms).
  // ⚠ AND AN AVERAGE NEEDS ITS DAYS (the coach-alerts research). Two logged days averaging 20% over
  // is one dinner out, not a plan running hot: both rules need NUTRITION_MIN_DAYS logged days in the
  // last seven, from the count the roster quotes. An unknown count is no evidence either. The floor is
  // the engine's, not a coach tunable (see TUNABLES).
  function nutritionLogged(c) {
    var n = c && c.foodLogs ? kpiNum(c.foodLogs.daysLogged7d) : null;
    return n != null && n >= THRESHOLDS.NUTRITION_MIN_DAYS;
  }
  function ruleLedgerBlown(c, now) {
    var n = c.nutrition;
    if (!n || n.avgCalories == null || n.targetCalories == null || !n.targetCalories) return null;
    if (!nutritionLogged(c)) return null;
    // ⚠ THE LINE IS THE EXACT SHARE, NEVER THE ROUNDED ONE (F6, the engine audit), as ruleScoreDrop's:
    // 2190 kcal on a 2000 target is 9.5% over, under a 10% line, though it prints as 10.
    var overPct = Math.round(((n.avgCalories - n.targetCalories) / n.targetCalories) * 100);
    if ((n.avgCalories - n.targetCalories) * 100 >= THRESHOLDS.LEDGER_OVER_PCT * n.targetCalories) {
      return { key: "ledger_blown", label: "Ledger +" + overPct + "%", reason: "Averaging " + n.avgCalories + " kcal vs a " + n.targetCalories + " kcal target", sig: "target:" + n.targetCalories + "|wk:" + weekKey(now) };
    }
    return null;
  }

  function ruleProteinUnder(c, now) {
    var n = c.nutrition;
    if (!n || n.avgProtein == null || n.targetProtein == null || !n.targetProtein) return null;
    if (!nutritionLogged(c)) return null;
    // The exact share, as the calorie line's (F6): 128 g on a 150 g target is 14.7% under a 15% line.
    if ((n.targetProtein - n.avgProtein) * 100 >= THRESHOLDS.PROTEIN_UNDER_PCT * n.targetProtein) {
      return { key: "protein_under", label: "Protein low", reason: "Averaging " + n.avgProtein + "g protein vs a " + n.targetProtein + "g target", sig: "target:" + n.targetProtein + "|wk:" + weekKey(now) };
    }
    return null;
  }

  // Goals-page rule: a projection slipping ≥ GOAL_SLIP_DAYS week-over-week
  // emits one amber-weight flag naming one goal (which, below). Both pro feeds see it
  // (either pro may have set the goal); skips cleanly when goals/history are
  // missing, and a goal that was ALWAYS stalled never had an ETA to slip.
  // A coach's flag names the worst slipped goal THEY own (goalOwned): a slipping weight goal that is
  // the nutritionist's never hides a trainer's slipping squat. Only when none of theirs is past the
  // line does it name the worst of all, which then reads as routed context. The member, who owns all
  // their goals, gets the worst of all.
  function ruleGoalSlip(c, now, role) {
    var gs = visibleGoals(c.goals);
    var coach = disciplineForRole(role) !== "general";
    var worst = null, worstGoal = null, mine = null, mineGoal = null;
    for (var i = 0; i < gs.length; i++) {
      var s = goalSlipDays(gs[i], now);
      if (s == null || !(s > 0)) continue;
      if (worst == null || s > worst) { worst = s; worstGoal = gs[i]; }
      if (coach && goalOwned(gs[i], role, c) && (mine == null || s > mine)) { mine = s; mineGoal = gs[i]; }
    }
    if (mine != null && mine >= THRESHOLDS.GOAL_SLIP_DAYS) { worst = mine; worstGoal = mineGoal; }
    if (worst == null || worst < THRESHOLDS.GOAL_SLIP_DAYS) return null;
    // The goal's own name, or none when it is the untitled weight goal's English stand-in. A lost
    // date is `lost`, never an Infinity `days`, so the figures survive JSON.
    // A title of only spaces is no name either (the Goals sheet saves it untrimmed): the app names it
    // as the untitled weight goal. The reason text, which coaches read, is left as it was.
    var untitled = worstGoal.id === "overall" && (worstGoal.label === UNTITLED_WEIGHT_GOAL || !String(worstGoal.label || "").trim());
    var goalName = untitled ? null : worstGoal.label;
    // The goal's own discipline rides on the flag (tagFlag reads it before FLAG_DISCIPLINE), so a weight
    // goal's slip is the nutritionist's and a squat's the trainer's; a habit or custom goal stays both.
    var disc = goalDiscipline(worstGoal);
    var flag;
    if (!isFinite(worst)) {
      flag = { key: "goal_slip", label: "Goal ETA lost", reason: "“" + worstGoal.label + "” lost its projected date — the pace flattened this week", figures: { goal: goalName, untitled: untitled, lost: true }, sig: "goal:" + (worstGoal.id || worstGoal.label) + "|wk:" + weekKey(now) };
    } else {
      flag = { key: "goal_slip", label: "Goal ETA +" + worst + "d", reason: "“" + worstGoal.label + "” slipped — the projected finish moved " + worst + " days later this week", figures: { goal: goalName, untitled: untitled, days: worst }, sig: "goal:" + (worstGoal.id || worstGoal.label) + "|wk:" + weekKey(now) };
    }
    if (disc) flag.discipline = disc;
    return flag;
  }
  // A goal's discipline by what it measures (the Goals editor's metrics: weight, strength, endurance,
  // habit, custom): the body is the nutritionist's, performance the trainer's, anything else both
  // coaches'. Null for "both", so the flag keeps FLAG_DISCIPLINE's general.
  var GOAL_METRIC_DISCIPLINE = {
    weight: "nutrition", bodyfat: "nutrition", body_fat: "nutrition", bodyFat: "nutrition", waist: "nutrition",
    strength: "training", endurance: "training", steps: "training",
  };
  function goalDiscipline(g) {
    var m = g && typeof g.metric === "string" ? g.metric : "";
    return Object.prototype.hasOwnProperty.call(GOAL_METRIC_DISCIPLINE, m) ? GOAL_METRIC_DISCIPLINE[m] : null;
  }
  // Would this goal's slip be the viewing coach's own? tagFlag's test, on the goal before a flag exists.
  function goalOwned(g, role, c) {
    var owner = disciplineOwner(goalDiscipline(g) || "general");
    return owner === null || disciplineForRole(owner) === disciplineForRole(role) || !hasPro(c, owner);
  }

  // Recovery rule: a 7-day average sleep MORE than SLEEP_DEFICIT_H hours under
  // target (a severe chronic deficit — roughly under 6h for a 7.5h target) becomes a
  // first-class triage flag for the coach + the member's directive. A milder shortfall
  // is left to the gentle cross-domain "sleep is the lever" narrative (buildDirective
  // step 3), so this only escalates the genuinely concerning case — no alert fatigue.
  // Uses recoveryRead (needs rec.recovery), which reads nothing below SLEEP_MIN_NIGHTS logged
  // nights, so a single short night never flags.
  function ruleSleepRecovery(c, now) {
    var rr = recoveryRead(c);
    if (!rr || rr.avg == null) return null;
    if (rr.target - rr.avg <= THRESHOLDS.SLEEP_DEFICIT_H) return null;
    var avgR = Math.round(rr.avg * 10) / 10;
    // `avg` and `n` as the vitals flags carry them, for Home's line in the member's own words.
    return { key: "sleep_low", label: "Sleep low", reason: "Averaging " + avgR + "h sleep vs a " + rr.target + "h target — recovery is running down", avg: rr.avg, n: rr.n, sig: "wk:" + weekKey(now) };
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
  // The reason is a coach's wording, a figure out of 10. The flag also carries the raw
  // average and the day count (`avg`, `n`) so the member's view can say it in words
  // (memberVitalsReason) and the app can compose its own translated line from them.
  function ruleEnergyLow(c, now) {
    var v = vitalsLeg(c, "energy");
    if (!v || v.avg == null || v.n < THRESHOLDS.ENERGY_MIN_DAYS) return null;
    if (!(v.avg <= THRESHOLDS.ENERGY_LOW_AVG)) return null;
    var avgR = Math.round(v.avg * 10) / 10;
    return { key: "energy_low", label: "Energy low", reason: "Energy has averaged " + avgR + "/10 this week — a lighter session still counts", avg: v.avg, n: v.n, sig: "wk:" + weekKey(now) };
  }
  function ruleHungerHigh(c, now) {
    var v = vitalsLeg(c, "hunger");
    if (!v || v.avg == null || v.n < THRESHOLDS.HUNGER_MIN_DAYS) return null;
    if (!(v.avg >= THRESHOLDS.HUNGER_HIGH_AVG)) return null;
    var avgR = Math.round(v.avg * 10) / 10;
    return { key: "hunger_high", label: "Hunger high", reason: "Hunger has averaged " + avgR + "/10 this week — the plan may be running light on fuel", avg: v.avg, n: v.n, sig: "wk:" + weekKey(now) };
  }

  // ⚠ THE MEMBER IS NEVER QUOTED A SCALE THEY WERE NOT SHOWN (Morning check-in part 2, rulings
  // 11 and 13). The check-in asks in five words and stores them as 2 · 4 · 6 · 8 · 10, so
  // "Energy has averaged 3.4/10" told the member about a 1-10 gauge they never saw. Their own
  // view (disciplineForRole 'general') says the word instead; a coach keeps the figure byte for
  // byte, because the roster, the case file, the coach Today read and the coach pushes (whose
  // signature holds the reason) all read it.
  // An average becomes a word by the card's one rule (leadReason.mjs bsCiWordIndex: (2i, 2i+2]
  // is word i), so the edges sit on ENERGY_LOW_AVG (4) and HUNGER_HIGH_AVG (8): a flagged week
  // reads Drained or Low, Hungry or Starving, never OK or Normal. Rounding to the nearest stored
  // value instead would call a 4.6 week Low with no flag behind it.
  // These English words are the line for a caller with no translator. Home, the Shape Daily splash
  // and the member's push and bell row compose their own line from the app's catalog out of
  // directive.evidence (leadReason.mjs bsLeadReason; memberMoveLine on the server), so all of them
  // say it in the member's language.
  var MEMBER_VITALS_WORDS = {
    energy_low: ["drained", "low", "OK", "good", "great"],
    hunger_high: ["not hungry", "a little", "normal", "hungry", "starving"],
  };
  function vitalsWordIndex(v) {
    var n = Number(v);
    if (!isFinite(n) || n <= 0) return null;
    return Math.max(0, Math.min(4, Math.ceil(Math.min(10, n) / 2) - 1));
  }
  // The member's wording of a vitals flag, or null when the flag is not one (the caller keeps
  // its own reason then).
  // ⚠ AN AVERAGE IS SAID AS AN AVERAGE. The word is the band of the week's average, so the line
  // says "on average". It said "mostly", and Your mornings, which the energy lead opens, says
  // "Most days" only for the answer that holds most of the days: answers of Drained, Drained,
  // Drained and Great average 4, so the push said "mostly low" in a week with no Low in it while
  // the page said Drained. The word stays lower case: a flagged week reads only Drained or Low,
  // Hungry or Starving.
  function memberVitalsReason(f) {
    var words = f ? MEMBER_VITALS_WORDS[f.key] : null;
    var i = words ? vitalsWordIndex(f.avg) : null;
    if (i == null) return null;
    if (f.key === "energy_low") return "Your energy has been " + words[i] + " on average this week — a lighter session still counts";
    return "You've been " + words[i] + " between meals on average this week — the plan may be running light on fuel";
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
    // The raw litres, unrounded, and the days the average is over: the app says them in the
    // member's units (leadReason.mjs bsLeadReason, for Home, the splash and the push); the reason
    // keeps its litres for a caller with no translator.
    return { key: "hydration_low", label: "Water low", reason: "Averaging " + avgR + "L of a " + tgtR + "L water target — a glass with each meal closes most of it", n: v.n, figures: { avgL: v.avgL, targetL: v.targetL } };
  }

  // ── The health screening (client-onboarding review, fix 2c: M17) ──────────
  // A coach is told when a client answered yes on the health screening, or has none on file
  // (they came in before the screening was asked before hiring, or by a session booked another
  // way). `c.screening` is the overview's read: 'flagged' | 'missing' | 'clear' | 'unknown'.
  // 'unknown' (a failed read, or a page that cannot tell) never flags: no record is never
  // evidence. Coach views only — the member's own view is never told to screen themselves here.
  // Week 1 not live: the coach set week 1 to start on a day (the week-one target, fix 4) and that day
  // has come with nothing published. No date, no flag: there is no fixed deadline (owner, decision 3).
  function rulePlanDue(c, now, role) {
    var plan = onboardingStep(onboardingFor(c, role), "plan");
    if (!plan || plan.done !== false || typeof plan.due !== "string") return null;
    if (iso(now) < plan.due) return null;
    return { key: "plan_due", label: "Week 1 not live", reason: "Week 1 was set to start " + plan.due + " and no plan is published", sig: "due:" + plan.due };
  }

  function ruleScreening(c) {
    var s = c && c.screening;
    if (s === "flagged") return { key: "screening_flagged", label: "Health flag", reason: "Answered yes on the health screening — read it before programming", sig: "flagged" };
    if (s === "missing") return { key: "screening_missing", label: "No screening", reason: "Has not completed the health screening — ask them to fill it in", sig: "missing" };
    return null;
  }

  // ── The coach signals added with the coach-action table (P2, 2026-11-05) ─────
  // Each reads a field the shared input builder (recordFromOverview) carries, skips when that field
  // is absent (absence is never a signal), and is a COACH view only: evaluateClient runs them for a
  // trainer or nutritionist, never for the member's own record.

  // Missed sessions (trainer). `bookedSessions` is the overview's per-role leg: the CALLER's own
  // sessions with the client in the last 42 days up to now, done = completed, planned = completed +
  // confirmed + requested. A booked session in the past that was never marked completed is the
  // "missed" one — said as "weren't completed", because a request the coach never confirmed counts
  // there too. ⚠ ONLY THE CALLER'S OWN (Codex on #2621): it read get_client_stats, every coach's
  // sessions with the client, so a trainer was told to rebook a nutritionist's missed session.
  function ruleMissedSessions(c, role) {
    var bs = c.bookedSessions;
    var own = disciplineForRole(role) === "training" ? "trainer" : disciplineForRole(role) === "nutrition" ? "nutritionist" : null;
    var ta = bs && typeof bs === "object" && own ? bs[own] : null;
    if (!ta) return null;
    var planned = kpiNum(ta.planned), done = kpiNum(ta.done);
    if (planned == null || done == null || planned < THRESHOLDS.MISSED_MIN_PLANNED) return null;
    var missed = planned - done;
    if (!(missed >= THRESHOLDS.MISSED_SESSIONS)) return null;
    return { key: "missed_sessions", label: "Missed " + missed, reason: missed + " of " + planned + " booked sessions in the last 6 weeks weren't completed", figures: { missed: missed, planned: planned }, sig: "missed:" + missed };
  }

  // A weekly rating that reads badly. ⚠ THE FORM ASKS 1-10 AND 10 IS GOOD ON EVERY QUESTION (Codex on
  // #2621): the website's and the app's check-in offer ten choices, and the two that sound inverted
  // are asked the good way round ("Stress · 10 = calm", "Hunger control"). So a rating is low when it
  // is at or under CHECKIN_RATING_LOW, on all six (the Week view reads them the same way, dashWeek.jsx).
  var CHECKIN_RATINGS = [
    ["trainingAdherence", "training", "hi"], ["nutritionAdherence", "nutrition", "hi"], ["sleep", "sleep", "hi"],
    ["energy", "energy", "hi"], ["stress", "calm", "hi"], ["hunger", "hunger control", "hi"],
  ];
  function checkinLowRatings(ratings) {
    var out = [];
    var r = ratings && typeof ratings === "object" ? ratings : {};
    for (var i = 0; i < CHECKIN_RATINGS.length; i++) {
      var v = kpiNum(r[CHECKIN_RATINGS[i][0]]);
      if (v == null || v < 1 || v > 10) continue;
      var low = CHECKIN_RATINGS[i][2] === "hi" ? v <= THRESHOLDS.CHECKIN_RATING_LOW : v >= 11 - THRESHOLDS.CHECKIN_RATING_LOW;
      if (low) out.push({ key: CHECKIN_RATINGS[i][0], name: CHECKIN_RATINGS[i][1], value: v });
    }
    return out;
  }
  // A check-in waiting on the coach's review, with a low rating or a question in it. Only a review
  // state that was READ counts (`reviewed === false`): a surface that could not read the coach's
  // reviews never says one is waiting. This week's check-in or last week's; an older one is the
  // Week page's history, not a to-do.
  function ruleCheckinWaiting(c, now) {
    var latest = c.checkIn && c.checkIn.latest;
    if (!latest || latest.reviewed !== false || typeof latest.weekOf !== "string") return null;
    var wk = toDate(latest.weekOf);
    if (!wk) return null;
    var age = daysBetween(mondayOf(wk), mondayOf(now));
    if (age < 0 || age > 7) return null;
    var lows = checkinLowRatings(latest.ratings);
    var asked = latest.asked === true;
    if (!lows.length && !asked) return null;
    var bits = [];
    if (lows.length) bits.push("rated " + lows.slice(0, 2).map(function (l) { return l.name + " " + l.value + "/10"; }).join(" and ") + (lows.length > 2 ? " (+" + (lows.length - 2) + ")" : ""));
    if (asked) bits.push("asked a question");
    return { key: "checkin_waiting", label: asked ? "Question waiting" : "Check-in to review", reason: "Check-in waiting — " + bits.join(", and "), figures: { weekOf: iso(mondayOf(wk)), lows: lows.length, asked: asked }, sig: "wk:" + iso(mondayOf(wk)) };
  }

  // A client's message the coach has not answered. `replyWait` is the overview's per-role leg: the
  // moment the client's oldest unanswered message was sent in the coach's own thread or the DM,
  // null when nothing is waiting, absent when the messages could not be read.
  function ruleReplyWaiting(c, now, role) {
    var rw = c.replyWait;
    if (!rw || typeof rw !== "object") return null;
    var disc = disciplineForRole(role);
    var own = disc === "training" ? "trainer" : disc === "nutrition" ? "nutritionist" : null;
    var since = own ? parseDate(rw[own]) : null;
    if (!since) return null;
    var hours = Math.floor((instantNow(now).getTime() - since.getTime()) / 3600000);
    if (!(hours >= THRESHOLDS.REPLY_WAIT_HOURS)) return null;
    var said = hours >= 48 ? Math.floor(hours / 24) + " days" : hours + " hours";
    return { key: "reply_waiting", label: "Reply " + (hours >= 48 ? Math.floor(hours / 24) + "d" : hours + "h"), reason: "Their message has waited " + said + " for your reply", figures: { hours: hours }, sig: "since:" + since.toISOString() };
  }

  // The coach's program (or plan) running out with nothing lined up next: the cue to write the next
  // block before the last session. Reads the caller's own assignment for the role being read
  // (programForRole): its estimated end, else "in its last week". A paused block, or one with the next
  // already assigned, is not ending.
  function ruleProgramEnding(c, now, role) {
    var p = programForRole(c, role);
    if (!p || typeof p !== "object" || p.paused || p.status === "paused" || p.nextAssigned) return null;
    var what = disciplineForRole(role) === "nutrition" ? "Plan" : "Program";
    var name = p.name ? "“" + String(p.name) + "”" : "Their " + what.toLowerCase();
    var end = toDate(p.estimatedEndAt);
    if (end) {
      var left = Math.ceil((end.getTime() - now.getTime()) / DAY);
      if (left > THRESHOLDS.PROGRAM_END_DAYS || left < -THRESHOLDS.PROGRAM_ENDED_DAYS) return null;
      var when = left > 1 ? "ends in " + left + " days" : left === 1 ? "ends tomorrow" : left === 0 ? "ends today" : "ended " + (-left) + (left === -1 ? " day" : " days") + " ago";
      return { key: "program_ending", label: what + (left >= 0 ? " ends " + left + "d" : " ended"), reason: name + " " + when + " and nothing is lined up next", figures: { daysLeft: left }, sig: "end:" + iso(end) };
    }
    var wk = kpiNum(p.week), total = kpiNum(p.weeks);
    if (wk == null || total == null || total <= 0 || wk < total) return null;
    return { key: "program_ending", label: what + " ends", reason: name + " is in its last week and nothing is lined up next", figures: { lastWeek: true }, sig: "last:" + (p.name || "") + "|" + total };
  }

  // ⚠ THE PROGRAM OF THE ROLE BEING READ (a coach with both listings). `program` is one pick: the trainer's
  // calendar first, else an assignment of either of the caller's roles, so the nutrition page called the
  // trainer's block an ending plan. `programs` (shared-overview's, per role) is each role's own; a record
  // without it (an older overview, the demo roster, a member) reads `program` as before.
  function programForRole(c, role) {
    if (!c) return null;
    var disc = disciplineForRole(role);
    var own = disc === "training" ? "trainer" : disc === "nutrition" ? "nutritionist" : null;
    if (own && c.programs && typeof c.programs === "object") return c.programs[own] || null;
    return c.program || null;
  }

  // A renewal Stripe is retrying (past_due). Still a client (owner, 2026-10-18); the coach hears of
  // it once a week while it lasts.
  function rulePaymentRetrying(c, now) {
    var pay = c.payments;
    var retrying = (pay && (pay.paymentRetrying === true || pay.status === "past_due")) || (c.profile && c.profile.paymentRetrying === true);
    if (!retrying) return null;
    return { key: "payment_retrying", label: "Payment retrying", reason: "Their last payment didn't go through — Stripe is retrying it", sig: "wk:" + weekKey(now) };
  }

  // A plan the client cancelled, ending at the period's end. ⚠ A HOOK: no table stores
  // cancel_at_period_end today (coach-renewals.mjs reads it live from Stripe for the Money tab), so
  // this fires only once the roster row carries `cancelAtPeriodEnd` and `periodEndsAt` — P3 adds both.
  function rulePlanEnding(c, now) {
    var pay = c.payments;
    if (!pay || pay.cancelAtPeriodEnd !== true) return null;
    var end = toDate(pay.periodEndsAt);
    if (!end) return null;
    var left = Math.ceil((end.getTime() - now.getTime()) / DAY);
    if (left < 0 || left > THRESHOLDS.PLAN_END_DAYS) return null;
    var on = end.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    return { key: "plan_ending", label: "Plan ends " + (left === 0 ? "today" : left + "d"), reason: "Cancelled — their plan ends " + on, figures: { endsOn: iso(end), daysLeft: left }, sig: "end:" + iso(end) };
  }

  // A wearable's own recovery / readiness score (WHOOP recovery, Oura readiness: the snapshot's
  // recovery_score, 0-100) averaging low over the week. Needs RECOVERY_MIN_DAYS readings: one red
  // morning after a hard session is not a signal.
  function ruleRecoveryLow(c, now) {
    var r = c.recovery && c.recovery.recoveryScore;
    if (!r || typeof r !== "object") return null;
    var avg = kpiNum(r.avg7), n = kpiNum(r.n);
    if (avg == null || n == null || n < THRESHOLDS.RECOVERY_MIN_DAYS) return null;
    if (!(avg <= THRESHOLDS.RECOVERY_LOW)) return null;
    return { key: "recovery_low", label: "Recovery low", reason: "Their wearable's recovery has averaged " + Math.round(avg) + "/100 this week — ease the load", avg: avg, n: n, sig: "wk:" + weekKey(now) };
  }

  // ── The trainer alerts (the 2026-11-11 coach-alerts plan, PR 1) ───────────
  // The local calendar day `n` days before `now`, as "YYYY-MM-DD".
  function dayBefore(now, n) { var d = new Date(now.getTime()); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return iso(d); }
  // The assigned workouts due: past days only (today never counts), in the last WORKOUT_WINDOW_DAYS,
  // never before they joined, and after a break only from the day they came back. Oldest first.
  function dueWorkouts(c, now) {
    var w = c && c.assignedWorkouts;
    if (!w || typeof w !== "object" || !Array.isArray(w.days)) return null;
    var today = iso(now), from = dayBefore(now, THRESHOLDS.WORKOUT_WINDOW_DAYS);
    var joinDay = clientJoinDay(c);
    var join = joinDay ? iso(joinDay) : null;
    var back = pauseOf(c, now);
    var since = back && back.state === "back" ? back.since : null;
    var out = [];
    for (var i = 0; i < w.days.length; i++) {
      var d = w.days[i];
      if (!d || typeof d.on !== "string" || !ISO_DAY.test(d.on)) continue;
      if (d.on >= today || d.on < from || (join && d.on < join) || (since && d.on < since)) continue;
      out.push({ on: d.on, done: d.done === true });
    }
    out.sort(function (a, b) { return a.on < b.on ? -1 : a.on > b.on ? 1 : 0; });
    return out;
  }
  // The assigned workouts due in the window and how many were done, for a surface's figure (the app's
  // case file); null when the record has no read of them.
  function workoutCompletion(c, now) {
    var due = dueWorkouts(c, now || new Date());
    return due ? { done: due.filter(function (d) { return d.done; }).length, due: due.length } : null;
  }
  // Workouts missed (a trainer's; amber, training): under WORKOUT_DONE_PCT of the assigned workouts due
  // in the window done, or the last WORKOUT_MISSED_ROW due all missed, once WORKOUT_MIN_DUE were due.
  function ruleWorkoutsMissed(c, now) {
    var due = dueWorkouts(c, now);
    if (!due || due.length < THRESHOLDS.WORKOUT_MIN_DUE) return null;
    var done = due.filter(function (d) { return d.done; }).length;
    var weeks = Math.round(THRESHOLDS.WORKOUT_WINDOW_DAYS / 7);
    if (done * 100 < THRESHOLDS.WORKOUT_DONE_PCT * due.length) {
      return { key: "workouts_missed", label: done + " of " + due.length + " done", reason: done + " of " + due.length + " assigned workouts done in the last " + weeks + " weeks", figures: { done: done, due: due.length }, sig: "wk:" + weekKey(now) };
    }
    var row = THRESHOLDS.WORKOUT_MISSED_ROW;
    var tail = due.slice(-row);
    if (row >= 1 && tail.length === row && tail.every(function (d) { return !d.done; })) {
      return { key: "workouts_missed", label: "Missed " + row + " in a row", reason: row === 1 ? "Missed the last assigned workout" : "Missed the last " + row + " assigned workouts", figures: { inARow: row, done: done, due: due.length }, sig: "last:" + tail[tail.length - 1].on };
    }
    return null;
  }
  // A sudden drop in completion (TrueCoach flags a 20% fall; CoachRx calls two falling weeks an early
  // warning): the last 14 days' completion COMPLETION_DROP_PCT points or more under the 14 before, each
  // half with COMPLETION_HALF_MIN due. Catches 95% → 70%, which the 50% line misses. Quiet when
  // workouts_missed speaks (evaluateClient).
  function ruleCompletionDrop(c, now) {
    var due = dueWorkouts(c, now);
    if (!due) return null;
    var mid = dayBefore(now, 14);
    var recent = due.filter(function (d) { return d.on >= mid; }), prior = due.filter(function (d) { return d.on < mid; });
    if (recent.length < THRESHOLDS.COMPLETION_HALF_MIN || prior.length < THRESHOLDS.COMPLETION_HALF_MIN) return null;
    var pct = function (list) { return list.filter(function (d) { return d.done; }).length * 100 / list.length; };
    var now2 = pct(recent), before = pct(prior);
    if (!(before - now2 >= THRESHOLDS.COMPLETION_DROP_PCT)) return null;
    return { key: "completion_drop", label: "Completion down", reason: "Did " + Math.round(now2) + "% of assigned workouts in the last 2 weeks, down from " + Math.round(before) + "%", figures: { recentPct: Math.round(now2), priorPct: Math.round(before) }, sig: "wk:" + weekKey(now) };
  }

  // The newest thing the client did that a coach can read, or null with what was read. Each source
  // the record carries: a finished workout (activity.lastWorkoutOn), a food log, a check-in (when it was
  // submitted, else the end of its week), a message to this coach (lastFromClient) and a day that
  // earned Shape Score points (streaks.lastActiveOn). ⚠ ABSENCE IS NEVER A SIGNAL: without the
  // workout, food, check-in and message reads all answered, there is nothing to say (`known` false).
  // Whether the food-log history was read with its dates (gone quiet, not started). The 7-day count can
  // come from the stats rollup while the dated snapshot read failed, which leaves lastLoggedOn null.
  // ⚠ A NULL DATE IS "NONE" ONLY WHEN THE DATED READ ANSWERED (Codex on #2717): the overview carried
  // `logs` (recordFromOverview's logsRead), and no day counted this week says otherwise.
  function foodDated(c) {
    var f = c && c.foodLogs;
    if (!f) return false;
    if (f.lastLoggedOn) return true;
    return c.logsRead === true && !(kpiNum(f.daysLogged7d) > 0);
  }
  function lastActivity(c, now) {
    var a = c && c.activity && typeof c.activity === "object" ? c.activity : null;
    var f = c && c.foodLogs;
    // ⚠ AND THE SCORE READ (Codex on #2717): a Score day is activity, so a failed read of it is unknown.
    var scoreKnown = !!(c && (c.streaks || c.scoreRead === true));
    var known = !!a && foodDated(c) && !!(c && c.checkIn) && scoreKnown && c && Object.prototype.hasOwnProperty.call(c, "lastFromClient") && c.lastFromClient !== undefined;
    var dates = [];
    if (a && a.lastWorkoutOn) dates.push(toDate(a.lastWorkoutOn));
    if (f && f.lastLoggedOn) dates.push(toDate(f.lastLoggedOn));
    var ci = c && c.checkIn;
    if (ci) {
      var sub = ci.latest && ci.latest.submittedAt ? toDate(ci.latest.submittedAt) : null;
      if (sub) dates.push(sub);
      else if (ci.lastWeekOf) { var wk = toDate(ci.lastWeekOf); if (wk) { wk.setDate(wk.getDate() + 6); dates.push(wk); } }
    }
    if (c && typeof c.lastFromClient === "string") dates.push(toDate(c.lastFromClient));
    if (c && c.streaks && c.streaks.lastActiveOn) dates.push(toDate(c.streaks.lastActiveOn));
    var last = null;
    for (var i = 0; i < dates.length; i++) {
      var d = dates[i];
      if (d && !isNaN(d.getTime()) && d.getTime() <= now.getTime() + DAY && (!last || d > last)) last = d;
    }
    // A last log with no date and an empty week is "nothing in the snapshot window", not unknown.
    return { known: known, last: last };
  }
  // Gone quiet (both coaches; amber, contact): nothing from them in QUIET_DAYS. It takes the place of
  // the food-log gap and the contact gap for the client (evaluateClient), so the coach reads one line.
  // Counted from when they joined, and from the day they came back from a break, never from before.
  function ruleGoneQuiet(c, now) {
    var r = lastActivity(c, now);
    if (!r.known) return null;
    var joinDay = clientJoinDay(c);
    var start = r.last ? new Date(r.last.getTime()) : null;
    if (start) start.setHours(0, 0, 0, 0);
    var since = "last";
    if (joinDay && (!start || start < joinDay)) { start = joinDay; since = "joined"; }
    var p = pauseOf(c, now);
    if (p && p.state === "back") { var bd = toDate(p.since); if (!start || start < bd) { start = bd; since = "break"; } }
    if (!start) return null;
    var gap = since === "break" ? resumeDays(c, now) : daysBetween(start, now);
    if (gap == null || gap < THRESHOLDS.QUIET_DAYS) return null;
    var what = "no workout, food log, check-in or message";
    var reason = since === "joined" ? "Nothing from them in the " + gap + " days since they joined: " + what
      : since === "break" ? "Nothing from them in the " + gap + " days since their break: " + what
      : "Nothing from them in " + gap + " days: " + what;
    return { key: "gone_quiet", label: "Quiet " + gap + "d", reason: reason, figures: { days: gap }, sig: since + ":" + iso(start) };
  }
  // Not started (both coaches; amber, onboarding): from NOT_STARTED_DAYS after joining, no first
  // workout, meal or check-in. Shape has no sign-in date, so it reads what they did. It sits beside the
  // board's "Say hello", which is the coach writing first; this is the client starting.
  function ruleNotStarted(c, now) {
    var days = clientDays(c, now);
    var joinDay = clientJoinDay(c);
    if (days == null || !joinDay || days < THRESHOLDS.NOT_STARTED_DAYS || days >= THRESHOLDS.NOT_STARTED_UNTIL) return null;
    var a = c.activity, f = c.foodLogs, ci = c.checkIn;
    if (!a || typeof a !== "object" || !foodDated(c) || !ci) return null;
    var after = function (v) { var d = toDate(v); return !!d && d.getTime() >= joinDay.getTime(); };
    if (a.lastWorkoutOn && after(a.lastWorkoutOn)) return null;
    if (f.lastLoggedOn && after(f.lastLoggedOn)) return null;
    var ciWeek = ci.lastWeekOf ? toDate(ci.lastWeekOf) : null;
    if (ci.latest && ci.latest.submittedAt ? after(ci.latest.submittedAt) : (ciWeek && mondayOf(ciWeek) >= mondayOf(joinDay))) return null;
    return { key: "not_started", label: "Not started", reason: "Joined " + days + " days ago, nothing logged yet", figures: { days: days }, sig: "joined:" + iso(joinDay) };
  }
  // No session booked (each coach's own; amber, never red): a client who has kept a session with this
  // coach, none in NO_BOOKING_DAYS and none coming up. One who only follows a program never gets it.
  function ruleNoBooking(c, now, role) {
    var bs = c.bookedSessions;
    var own = disciplineForRole(role) === "training" ? "trainer" : disciplineForRole(role) === "nutrition" ? "nutritionist" : null;
    var leg = bs && typeof bs === "object" && own ? bs[own] : null;
    if (!leg || typeof leg !== "object" || !Object.prototype.hasOwnProperty.call(leg, "nextAt")) return null;
    if (leg.nextAt != null || !leg.lastKeptAt) return null;
    var last = toDate(leg.lastKeptAt);
    if (!last) return null;
    var lastDay = new Date(last.getTime()); lastDay.setHours(0, 0, 0, 0);
    var gap = daysBetween(lastDay, now);
    if (gap < THRESHOLDS.NO_BOOKING_DAYS) return null;
    return { key: "no_booking", label: "Nothing booked", reason: "Last session with you " + gap + " days ago, nothing booked", figures: { days: gap }, sig: "last:" + instantKey(leg.lastKeptAt) };
  }
  // Context only (a trainer's): this week's training load over LOAD_SPIKE_X times the 4-week weekly
  // average. Load is the trainer's own runs' effort rating × minutes (bsTrainingLoadLeg).
  function ruleLoadSpike(c, now) {
    var tl = c.trainingLoad;
    if (!tl || !Array.isArray(tl.days)) return null;
    var today = iso(now), wkFrom = dayBefore(now, 6), baseFrom = dayBefore(now, 34);
    var week = 0, base = 0, baseN = 0;
    for (var i = 0; i < tl.days.length; i++) {
      var d = tl.days[i], v = d ? kpiNum(d.load) : null;
      if (!d || typeof d.on !== "string" || v == null || v <= 0 || d.on > today) continue;
      if (d.on >= wkFrom) week += v;
      // The rated runs that day (bsTrainingLoadLeg's `runs`), one when a record predates it (Codex on #2717).
      else if (d.on >= baseFrom) { base += v; var rn = kpiNum(d.runs); baseN += rn != null && rn >= 1 ? rn : 1; }
    }
    if (baseN < THRESHOLDS.LOAD_MIN_SESSIONS || !(base > 0)) return null;
    var avg = base / 4;
    if (!(week > THRESHOLDS.LOAD_SPIKE_X * avg)) return null;
    var x = Math.round((week / avg) * 10) / 10;
    return { key: "load_spike", label: "Load " + x + "×", reason: "This week's training load is " + x + "× their 4-week average", figures: { ratio: x }, sig: "wk:" + weekKey(now) };
  }
  // Context only (a trainer's): this week's average steps STEPS_DROP_PCT or more under their own 4-week
  // average before it.
  function ruleStepsFalling(c, now) {
    var a = c.activity;
    if (!a || !Array.isArray(a.steps)) return null;
    var today = iso(now), wkFrom = dayBefore(now, 6), baseFrom = dayBefore(now, 34);
    var w = [], b = [];
    for (var i = 0; i < a.steps.length; i++) {
      var d = a.steps[i], v = d ? kpiNum(d.steps) : null;
      if (!d || typeof d.on !== "string" || v == null || v <= 0 || d.on > today) continue;
      if (d.on >= wkFrom) w.push(v); else if (d.on >= baseFrom) b.push(v);
    }
    if (w.length < THRESHOLDS.STEPS_MIN_DAYS || b.length < THRESHOLDS.STEPS_BASE_MIN_DAYS) return null;
    var mean = function (l) { return l.reduce(function (x, y) { return x + y; }, 0) / l.length; };
    var wa = mean(w), ba = mean(b);
    if (!((ba - wa) * 100 >= THRESHOLDS.STEPS_DROP_PCT * ba)) return null;
    var pct = Math.round((1 - wa / ba) * 100);
    return { key: "steps_falling", label: "Steps −" + pct + "%", reason: "Steps averaging " + Math.round(wa).toLocaleString("en-US") + " a day this week, " + pct + "% under their 4-week average", figures: { pct: pct, avg: Math.round(wa), baseline: Math.round(ba) }, sig: "wk:" + weekKey(now) };
  }

  // ── The nutritionist's weight alerts (the coach-alerts plan, PR 2) ──────────────────────────────
  // All of them read the weight goal the client shares (its history is the live weigh-in series), in
  // kg. ⚠ A CLIENT WHO SHARES NO WEIGHT GOAL IS SILENT, with no notice to the coach.
  // The goal's start: a coach goal's startedOn, else its first weigh-in (a self-set goal stores only a
  // month label). Its start weight: the goal's own, else that first weigh-in. A loss goal aims under
  // it, a gain goal over it.
  function weightRead(c, now) {
    var gs = visibleGoals(c && c.goals), g = null;
    for (var i = 0; i < gs.length; i++) if (gs[i] && gs[i].metric === "weight") { g = gs[i]; break; }
    if (!g || g.target == null || !isFinite(Number(g.target))) return null;
    var unit = g.unit || "lb";
    // ⚠ THE LIVE WEIGH-INS TOO (Codex on #2720): a coach goal keeps its own history once it has two
    // points (goalsFromDoc), so the weigh-ins logged since were not read, and a client weighing in every
    // week could read a gap. The goal's points and the record's weigh-ins, one a day, the live one on a
    // day both have.
    var byDay = {};
    goalSeries(g, now).forEach(function (p) { byDay[iso(p.on)] = { on: p.on, kg: toWeightUnit(p.value, unit, "kg") }; });
    weightSeriesIn(c && c.weighIns, "kg").forEach(function (p) {
      var on = toDate(p.on);
      if (on && on.getTime() <= now.getTime()) byDay[p.on] = { on: on, kg: p.value };
    });
    var pts = Object.keys(byDay).sort().map(function (k) { return byDay[k]; }).filter(function (p) { return p.kg > 0; });
    if (!pts.length) return null;
    var started = toDate(g.startedOn) || pts[0].on;
    var startDay = new Date(started.getTime()); startDay.setHours(0, 0, 0, 0);
    var startKg = g.start != null && isFinite(Number(g.start)) && Number(g.start) > 0 ? toWeightUnit(Number(g.start), unit, "kg") : pts[0].kg;
    var targetKg = toWeightUnit(Number(g.target), unit, "kg");
    var dir = targetKg < startKg ? "loss" : targetKg > startKg ? "gain" : null;
    return { goal: g, pts: pts, startDay: startDay, startKg: startKg, dir: dir, days: daysBetween(startDay, now) };
  }
  // The trend of the last WEIGH_TREND_DAYS: a least-squares line through WEIGH_MIN_POINTS or more
  // weigh-ins spanning WEIGH_MIN_SPAN_DAYS, as % of body weight a week (negative is loss).
  function weightTrend(r, now) {
    var from = new Date(now.getTime()); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - THRESHOLDS.WEIGH_TREND_DAYS);
    var pts = r.pts.filter(function (p) { return p.on >= from && p.on.getTime() <= now.getTime(); });
    if (pts.length < THRESHOLDS.WEIGH_MIN_POINTS) return null;
    if (daysBetween(pts[0].on, pts[pts.length - 1].on) < THRESHOLDS.WEIGH_MIN_SPAN_DAYS) return null;
    var t0 = pts[0].on.getTime(), n = pts.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (var i = 0; i < n; i++) { var x = (pts[i].on.getTime() - t0) / DAY, y = pts[i].kg; sx += x; sy += y; sxx += x * x; sxy += x * y; }
    var den = n * sxx - sx * sx;
    if (!(den > 0)) return null;
    var slope = (n * sxy - sx * sy) / den, mean = sy / n;
    return { kgWeek: slope * 7, pctWeek: slope * 7 * 100 / mean, n: n };
  }
  // The weight on a day: the newest weigh-in on or before it, within 4 days of it; else null.
  function weightOn(r, day) {
    var best = null;
    for (var i = 0; i < r.pts.length; i++) {
      var p = r.pts[i];
      if (p.on.getTime() <= day.getTime() && day.getTime() - p.on.getTime() <= 4 * DAY + DAY - 1) best = p;
    }
    return best;
  }
  function round1(v) { return Math.round(v * 10) / 10; }
  // Losing fast (amber, nutrition; a trainer's context, TRAINER_CONTEXT): from week 3 of a weight-loss
  // goal, the 2-week trend losing more than LOSS_FAST_PCT of body weight a week (GLP1_FAST_PCT on a
  // GLP-1 medication).
  function ruleWeightFast(c, now, r) {
    if (!r || r.dir !== "loss" || r.days < THRESHOLDS.WEIGH_FROM_DAY) return null;
    var t = weightTrend(r, now);
    var line = c.glp1 === true ? THRESHOLDS.GLP1_FAST_PCT : THRESHOLDS.LOSS_FAST_PCT;
    if (!t || !(-t.pctWeek > line)) return null;
    var pct = round1(-t.pctWeek);
    return { key: "weight_fast", label: "Losing fast", reason: "Losing " + pct + "% of body weight a week over the last 2 weeks" + (c.glp1 === true ? " (on a GLP-1)" : ""), figures: { pctWeek: pct, glp1: c.glp1 === true }, sig: "wk:" + weekKey(now) };
  }
  // The safety red (red on its own, SAFETY_FLAGS): LOSS_SAFETY_KG a week or more for LOSS_SAFETY_WEEKS
  // weeks in a row, with high hunger or low energy. Any goal: a fast loss is the concern whatever the
  // aim. No BMI condition (Shape stores no height).
  function ruleWeightUnsafe(c, now, r) {
    if (!r) return null;
    var weeks = THRESHOLDS.LOSS_SAFETY_WEEKS;
    var end = new Date(now.getTime()); end.setHours(23, 59, 59, 999);
    var total = 0;
    for (var w = 0; w < weeks; w++) {
      var hi = new Date(end.getTime() - w * 7 * DAY), lo = new Date(end.getTime() - (w + 1) * 7 * DAY);
      var a = weightOn(r, hi), b = weightOn(r, lo);
      if (!a || !b || a === b) return null;
      var lost = b.kg - a.kg;
      if (!(lost >= THRESHOLDS.LOSS_SAFETY_KG)) return null;
      total += lost;
    }
    var hunger = ruleHungerHigh(c, now), energy = ruleEnergyLow(c, now);
    if (!hunger && !energy) return null;
    var with_ = hunger && energy ? "high hunger and low energy" : hunger ? "high hunger" : "low energy";
    return { key: "weight_unsafe", label: "Losing very fast", reason: "Down " + round1(total) + " kg in " + weeks + " weeks, with " + with_ + ". Check in, and suggest they see their doctor if it goes on", figures: { kg: round1(total), weeks: weeks, hunger: !!hunger, energy: !!energy }, sig: "wk:" + weekKey(now) };
  }
  // A weigh-in gap (amber, progress): a weight goal, weighed in weekly or more over the 4 weeks before
  // the last weigh-in (4 or more), and none for WEIGHIN_GAP_DAYS.
  function ruleWeighinGap(c, now, r) {
    if (!r) return null;
    var last = r.pts[r.pts.length - 1];
    var lastDay = new Date(last.on.getTime()); lastDay.setHours(0, 0, 0, 0);
    var gap = daysBetween(lastDay, now);
    // ⚠ FROM THE DAY THEY CAME BACK, NOT FROM BEFORE A BREAK (as the other gaps): a last weigh-in from
    // before it counts the days since their return. ⚠ FOR AS LONG AS THE LINE (Codex on #2721): the other
    // gaps stop reading a break 14 days back (PAUSE_BOUND_DAYS), and a line of 14 or more then counted from
    // before it, so the break is read here until a day past the coach's own line.
    var bp = pauseOf(c, now, Math.max(PAUSE_BOUND_DAYS, THRESHOLDS.WEIGHIN_GAP_DAYS + 1));
    var backDay = bp && bp.state === "back" ? toDate(bp.since) : null, sinceBreak = false;
    if (backDay && lastDay < backDay) { gap = bp.day; sinceBreak = true; }
    if (gap == null || gap < THRESHOLDS.WEIGHIN_GAP_DAYS) return null;
    var before = r.pts.filter(function (p) { return p.on.getTime() <= last.on.getTime() && last.on.getTime() - p.on.getTime() < 28 * DAY; });
    if (before.length < 4) return null;
    if (sinceBreak) return { key: "weighin_gap", label: "No weigh-in " + gap + "d", reason: "No weigh-in in the " + gap + " days since their break", figures: { days: gap, sinceBreak: true }, sig: "back:" + iso(backDay) };
    return { key: "weighin_gap", label: "No weigh-in " + gap + "d", reason: "No weigh-in for " + gap + " days", figures: { days: gap }, sig: "last:" + iso(lastDay) };
  }
  // A slow start on a weight-loss goal (amber, progress): under SLOW_START_EARLY_PCT lost by week 4, or
  // SLOW_START_LATE_PCT by week 8, from the goal's start; read through week 11. On a GLP-1 medication:
  // under GLP1_SLOW_PCT by week 12, read through week 15. The latest weigh-in must be from this read's
  // own weeks (no older than 14 days), or it has nothing to say.
  function ruleSlowStart(c, now, r) {
    if (!r || r.dir !== "loss") return null;
    var d = r.days, glp1 = c.glp1 === true, line = null;
    if (glp1) { if (d >= 84 && d < 112) line = THRESHOLDS.GLP1_SLOW_PCT; }
    else if (d >= 28 && d < 84) line = d >= 56 ? THRESHOLDS.SLOW_START_LATE_PCT : THRESHOLDS.SLOW_START_EARLY_PCT;
    if (line == null) return null;
    var last = r.pts[r.pts.length - 1];
    if (daysBetween(last.on, now) > 14 || last.on < r.startDay) return null;
    var lostPct = (r.startKg - last.kg) * 100 / r.startKg;
    if (!(lostPct < line)) return null;
    var weeks = Math.floor(d / 7), shown = round1(lostPct);
    var said = shown > 0 ? "Down " + shown + "%" : shown < 0 ? "Up " + round1(-lostPct) + "%" : "No change";
    return { key: "slow_start", label: "Slow start", reason: said + " after " + weeks + " weeks" + (glp1 ? " on a GLP-1" : ""), figures: { pct: shown, weeks: weeks, glp1: glp1 }, sig: "line:" + line + "|start:" + iso(r.startDay) };
  }
  // On a GLP-1 medication, context only: 14% or more lost in 3 to 4 months (from the weigh-in 84 to 122
  // days back), and protein under GLP1_PROTEIN_G_KG per kg of body weight a day.
  function ruleGlp1Total(c, now, r) {
    if (!r || c.glp1 !== true) return null;
    var last = r.pts[r.pts.length - 1];
    if (daysBetween(last.on, now) > 14) return null;
    var from = null;
    for (var i = 0; i < r.pts.length; i++) {
      var age = daysBetween(r.pts[i].on, now);
      if (age >= 84 && age <= 122) { from = r.pts[i]; break; }
    }
    if (!from) return null;
    var pct = (from.kg - last.kg) * 100 / from.kg;
    if (!(pct >= THRESHOLDS.GLP1_TOTAL_PCT)) return null;
    var months = Math.round(daysBetween(from.on, last.on) / 30);
    return { key: "glp1_total", label: "Down " + Math.round(pct) + "% on a GLP-1", reason: "Down " + Math.round(pct) + "% in about " + months + " months on a GLP-1: worth checking protein and strength work", figures: { pct: Math.round(pct), months: months }, sig: "from:" + iso(from.on) };
  }
  function ruleGlp1Protein(c, now, r) {
    if (!r || c.glp1 !== true) return null;
    var n = c.nutrition;
    if (!n || n.avgProtein == null || !isFinite(Number(n.avgProtein)) || !nutritionLogged(c)) return null;
    var last = r.pts[r.pts.length - 1];
    if (daysBetween(last.on, now) > 30) return null;
    var gkg = Number(n.avgProtein) / last.kg;
    if (!(gkg < THRESHOLDS.GLP1_PROTEIN_G_KG)) return null;
    return { key: "glp1_protein", label: "Protein " + round1(gkg) + " g/kg", reason: "Protein averaging " + round1(gkg) + " g per kg a day, under the 1.2 to 1.6 often advised on a GLP-1", figures: { gPerKg: round1(gkg) }, sig: "wk:" + weekKey(now) };
  }
  // The gain bands (amber, progress, both coaches): from week 3 of a weight-gain goal, the 2-week trend
  // gaining more than GAIN_FAST_PCT a week, or not gaining at all.
  function ruleGainPace(c, now, r) {
    if (!r || r.dir !== "gain" || r.days < THRESHOLDS.WEIGH_FROM_DAY) return null;
    var t = weightTrend(r, now);
    if (!t) return null;
    var pct = round1(t.pctWeek);
    if (t.pctWeek > THRESHOLDS.GAIN_FAST_PCT) return { key: "gain_fast", label: "Gaining fast", reason: "Gaining " + pct + "% of body weight a week over the last 2 weeks", figures: { pctWeek: pct }, sig: "wk:" + weekKey(now) };
    if (t.pctWeek <= 0) return { key: "gain_stalled", label: "Not gaining", reason: "No gain over the last 2 weeks on a weight-gain goal", figures: { pctWeek: pct }, sig: "wk:" + weekKey(now) };
    return null;
  }

  // ── Evaluation + triage ───────────────────────────────────────────────────

  // evaluateClient(record, now, role) -> { flags, severity }
  // severity, for a coach: red = counted hard flags in 2+ AREAS (FLAG_AREA), a safety flag
  //           (SAFETY_FLAGS), or a check-in missed ≥ CHECKIN_RED_WEEKS weeks; amber = 1+ counted
  //           flag; green = clean. The member's own view: red = 2+ flags, as before.
  function evaluateClient(c, now, role, thresholds) {
    if (thresholds) return withThresholds(thresholds, function () { return evaluateClient(c, now, role); });
    if (!inScope()) return withThresholds(defaultsForRole(role), function () { return evaluateClient(c, now, role); });
    now = now || new Date();
    var flags = [];
    var f;
    var coachView = disciplineForRole(role) !== "general";
    // ⚠ A BROKEN STREAK IS THE MEMBER'S, NOT A COACH'S (owner, 2026-11-10, with the coach-alerts
    // research). The streak is consecutive days with a completed workout, so a planned rest day broke
    // it and a client on a three-day split went amber every week; habit research counts four sessions
    // a week, not seven (Kaushal & Rhodes 2015), and one missed day doesn't undo a habit (Lally 2010).
    // The member's own screens keep it, and its gentle "streak restarts" notice.
    if (!coachView && (f = ruleStreakBroken(c))) flags.push(f);
    if ((f = ruleScoreDrop(c, role))) flags.push(f);
    var gapFlag = ruleFoodGap(c, now);
    if (gapFlag) flags.push(gapFlag);
    var ciFlag = ruleCheckinOverdue(c, now);
    if (ciFlag) flags.push(ciFlag);
    if ((f = ruleContactGap(c, now, role))) flags.push(f);
    if ((f = ruleGoalSlip(c, now, role))) flags.push(f);
    if ((f = ruleSleepRecovery(c, now))) flags.push(f);
    // energy_low is the RECOVERY discipline, and follows sleep_low's established
    // pattern exactly: pushed for every viewer.
    if ((f = ruleEnergyLow(c, now))) flags.push(f);
    // hunger_high is the NUTRITION discipline (FLAG_DISCIPLINE), so it must not
    // escalate a TRAINER's severity — it is gated like its nutrition siblings
    // ledger_blown / protein_under, EXCEPT that the member's own view keeps it: 'general'
    // is the client/unknown viewer, and hunger_high has a client-facing lever + move
    // (DIRECTIVE_VERDICTS.hunger / DIRECTIVE_MOVES.hunger) that would otherwise be
    // unreachable. So: everyone except the trainer, whose severity it is not.
    // The trainer still SEES it — readOnlyFlags surfaces it as routed context.
    // ⚠ AND A TRAINER WHO IS THE CLIENT'S ONLY COACH OWNS THE NUTRITION READS (P2). Routed to a
    // dietitian who is not there, a trainer-only client's protein, calories and hunger flags read
    // "→ dietitian" and never reached the one coach who could act. `pros` comes from the care team
    // (recordFromOverview); unknown keeps the routing.
    var soleTrainer = disciplineForRole(role) === "training" && !hasPro(c, "nutritionist");
    if (disciplineForRole(role) !== "training" || soleTrainer) {
      if ((f = ruleHungerHigh(c, now))) flags.push(f);
    }
    // Hydration is a CLIENT directive only (owner ruling) — never a coach flag.
    // disciplineForRole is 'general' exactly for the client/unknown viewer, so
    // a trainer/nutritionist/dietitian triage pass never evaluates it.
    if (disciplineForRole(role) === "general") {
      if ((f = ruleHydrationLow(c))) flags.push(f);
    }
    if (disciplineForRole(role) === "nutrition" || soleTrainer) {
      if ((f = ruleLedgerBlown(c, now))) flags.push(f);
      if ((f = ruleProteinUnder(c, now))) flags.push(f);
    }
    // The nutritionist's logging-consistency read, when the gap rule has not already spoken.
    if (disciplineForRole(role) === "nutrition" && !gapFlag && (f = ruleFoodLogging(c, now))) flags.push(f);
    if (coachView) {
      if ((f = ruleScreening(c))) flags.push(f);
      if ((f = rulePlanDue(c, now, role))) flags.push(f);
      // ⚠ MISSED SESSIONS ARE EACH COACH'S OWN (the coach-alerts research). The rule reads only the
      // caller's own sessions (#2621), yet a nutritionist saw their missed consults only when no
      // trainer was on the client. Every coach view runs it, on its own leg.
      if ((f = ruleMissedSessions(c, role))) flags.push(f);
      if ((f = ruleCheckinWaiting(c, now))) flags.push(f);
      if ((f = ruleReplyWaiting(c, now, role))) flags.push(f);
      if ((f = ruleProgramEnding(c, now, role))) flags.push(f);
      if ((f = rulePaymentRetrying(c, now))) flags.push(f);
      if ((f = rulePlanEnding(c, now))) flags.push(f);
      if ((f = ruleRecoveryLow(c, now))) flags.push(f);
      // The trainer alerts (PR 1). Workout completion and the context reads are the trainer's own
      // evaluation; a nutritionist sees completion in joint attention, read at the trainer's line.
      if (disciplineForRole(role) === "training") {
        var wm = ruleWorkoutsMissed(c, now);
        if (wm) flags.push(wm);
        else if ((f = ruleCompletionDrop(c, now))) flags.push(f);
        if ((f = ruleLoadSpike(c, now))) flags.push(f);
        if ((f = ruleStepsFalling(c, now))) flags.push(f);
      }
      if ((f = ruleNoBooking(c, now, role))) flags.push(f);
      // The weight alerts (PR 2). The safety red takes the place of losing fast; the GLP-1 reads are
      // context (CONTEXT_FLAGS), and losing fast is a trainer's context (TRAINER_CONTEXT).
      var wr = weightRead(c, now);
      if (wr) {
        var unsafe = ruleWeightUnsafe(c, now, wr);
        if (unsafe) flags.push(unsafe);
        else if ((f = ruleWeightFast(c, now, wr))) flags.push(f);
        if ((f = ruleWeighinGap(c, now, wr))) flags.push(f);
        // ⚠ ONE WEIGHT GOAL, ONE LINE: a slow start takes the place of that goal's slip, which says the
        // same thing (and would make the row red as a second area).
        if ((f = ruleSlowStart(c, now, wr))) {
          var wgSig = "goal:" + (wr.goal.id || wr.goal.label) + "|";
          flags = flags.filter(function (fl) { return !(fl.key === "goal_slip" && typeof fl.sig === "string" && fl.sig.indexOf(wgSig) === 0); });
          flags.push(f);
        }
        if ((f = ruleGainPace(c, now, wr))) flags.push(f);
        if ((f = ruleGlp1Total(c, now, wr))) flags.push(f);
        if ((f = ruleGlp1Protein(c, now, wr))) flags.push(f);
      }
      // Not started speaks for a new client; gone quiet for the rest. Either takes the place of the
      // food-log gap and the contact gap (not started: the food-log reads only), so the coach reads one
      // line, not two. Each gap still shows alone when only that one is quiet.
      var ns = ruleNotStarted(c, now);
      var gq = ns ? null : ruleGoneQuiet(c, now);
      if (ns || gq) {
        var replaced = ns ? { food_gap: true, food_logging: true } : { food_gap: true, food_logging: true, contact_gap: true };
        flags = flags.filter(function (fl) { return !replaced[fl.key] || (fl.key === "contact_gap" && fl.figures && fl.figures.hello); });
        flags.push(ns || gq);
        if (gapFlag && replaced[gapFlag.key]) gapFlag = null;
      }
    }

    // ⚠ AWAY IS NOT ABSENT (a pause, 2026-11-11). While the client is paused, and for the first days
    // back, nothing that reads their absence speaks; a coach sees them back instead (rulePauseEnded).
    var paused = pauseOf(c, now);
    if (paused && (paused.state === "paused" || paused.fresh)) {
      flags = flags.filter(function (fl) { return !PAUSE_SILENCED[fl.key]; });
      if (coachView && (f = rulePauseEnded(paused))) flags.push(f);
    }

    // ⚠ A DISMISSED OR SNOOZED REASON IS SKIPPED BEFORE SEVERITY, so it neither colours the row nor
    // leads the directive nor alerts. It holds while its episode (`sig`) is the same and, for a
    // snooze, until its time; a new episode of the same reason comes back on its own.
    var dismissed = [];
    if (Array.isArray(c.dismissals) && c.dismissals.length) {
      flags = flags.filter(function (fl) {
        if (isDismissed(c.dismissals, fl, now)) { dismissed.push(fl); return false; }
        return true;
      });
    }

    // ⚠ A COACH'S SEVERITY COUNTS ONLY THE FLAGS THAT COACH OWNS (P2). A nutritionist's row went red
    // on the trainer's broken streak while a trainer's never counted the dietitian's hunger read; with
    // the care team now on the record (`pros`), a flag routed to a co-coach who is really there is
    // context, and one with nobody else to take it is the viewer's own. The member's view counts all.
    // The money and calendar flags (SOFT_FLAGS) make a row amber on their own and never tip it red;
    // a coach's context flags (CONTEXT_FLAGS) and the quiet ones (QUIET_FLAGS) never colour it.
    var counted = (coachView ? flags.filter(function (fl) { return tagFlag(fl, role, c).owned && !isContextFlag(fl, role); }) : flags)
      .filter(function (fl) { return !QUIET_FLAGS[fl.key]; });
    // A trainer who is the client's only coach owns the intake reads, and they still never tip the row
    // red: a trainer shares general guidance or suggests a dietitian, never a target (ACE's scope).
    var hard = counted.filter(function (fl) { return !SOFT_FLAGS[fl.key] && !(soleTrainer && SOLE_TRAINER_SOFT[fl.key]); });

    // ⚠ A NEW CLIENT HAS NO RECENT DATA YET, AND THAT IS NOT "UNKNOWN" (client-onboarding review,
    // M13). Their progress read answers, with nothing in it, so they sat in "Progress unknown"
    // instead of reading "New". A read that failed or is still loading stays unknown.
    var progress = progressStatus(c, now);
    // …nor is a client on a break (pauseOf): away, nothing recent is what is expected.
    var severity = progress.state === "ready" || (progress.state === "insufficient" && ((c.profile && c.profile.isNew) || (paused && (paused.state === "paused" || paused.fresh)))) ? "green" : "unknown";
    // ⚠ A COACH'S RED IS TWO DIFFERENT AREAS, OR A SAFETY FLAG (owner, 2026-11-10). Two flags used to
    // be red, and two flags are often one thing seen twice: a food-log gap and calories nobody logged,
    // or a quiet thread and the reply waiting in it. Red now needs the client slipping in two areas
    // (flagArea: training, nutrition, recovery, contact, onboarding, progress), or a flag that is red
    // on its own (SAFETY_FLAGS: a yes on the health screening), or the check-ins missed for
    // CHECKIN_RED_WEEKS. The member's own view keeps two flags.
    var areas = {};
    hard.forEach(function (fl) { areas[flagArea(fl)] = true; });
    var redByCount = coachView ? Object.keys(areas).length >= 2 : hard.length >= 2;
    var safety = coachView && hard.some(function (fl) { return SAFETY_FLAGS[fl.key]; });
    if (redByCount || safety) severity = "red";
    else if (ciFlag && counted.indexOf(ciFlag) >= 0 && ciFlag.missedWeeks >= THRESHOLDS.CHECKIN_RED_WEEKS) severity = "red";
    else if (counted.length >= 1) severity = "amber";
    return { flags: flags, severity: severity, dismissed: dismissed };
  }

  // The flags that colour a row amber but never tip it red: a practice's calendar, not the client's
  // progress.
  var SOFT_FLAGS = { program_ending: true, plan_ending: true, no_booking: true };
  // …and, for a trainer who is the client's only coach, the intake reads they own (evaluateClient).
  var SOLE_TRAINER_SOFT = { ledger_blown: true, protein_under: true };
  // ⚠ AND ONE THAT NEVER COLOURS A ROW: a renewal Stripe is retrying is "a quiet mark only" (owner,
  // 2026-10-18: "They stay normal clients until Stripe gives up"). It is on the row with its reason and
  // its move, it can lead a row nothing else does, and it never makes anyone red, amber or a push.
  var QUIET_FLAGS = { payment_retrying: true };
  // A coach's context: on the row with its reason, never counted toward a coach's severity, never a
  // lead while anything counted is on the row (coachLead), never an alert. The Score moves on posts
  // and sleep as much as on training or food, so its fall is a question to ask, not a slip to chase.
  var CONTEXT_FLAGS = { score_drop: true, load_spike: true, steps_falling: true, glp1_total: true, glp1_protein: true };
  // …and a trainer's alone: losing weight fast is the nutritionist's to act on (the coach-alerts plan,
  // PR 2), so a trainer sees it on the client as context, as the only coach too. The safety red is not
  // here: a trainer who is the client's only coach owns it.
  var TRAINER_CONTEXT = { weight_fast: true };
  function isContextFlag(f, role) {
    return !!(f && (CONTEXT_FLAGS[f.key] || (TRAINER_CONTEXT[f.key] && disciplineForRole(role) === "training")));
  }
  // Red on its own for a coach: a yes on the health screening is read before anything is programmed.
  var SAFETY_FLAGS = { screening_flagged: true, weight_unsafe: true };
  // The area a flag speaks to, for the two-areas red. A goal's slip takes its goal's discipline.
  var FLAG_AREA = {
    missed_sessions: "training", streak_broken: "training", workouts_missed: "training", completion_drop: "training",
    no_booking: "training", load_spike: "training", steps_falling: "training", gone_quiet: "contact", not_started: "onboarding",
    weight_fast: "nutrition", weight_unsafe: "safety", weighin_gap: "progress", slow_start: "progress",
    gain_fast: "progress", gain_stalled: "progress", glp1_total: "progress", glp1_protein: "nutrition",
    food_gap: "nutrition", food_logging: "nutrition", ledger_blown: "nutrition", protein_under: "nutrition",
    hunger_high: "nutrition", hydration_low: "nutrition",
    sleep_low: "recovery", energy_low: "recovery", recovery_low: "recovery",
    checkin_overdue: "contact", contact_gap: "contact", reply_waiting: "contact", checkin_waiting: "contact", pause_ended: "contact",
    plan_due: "onboarding", screening_missing: "onboarding", screening_flagged: "safety",
    score_drop: "progress", goal_slip: "progress",
    program_ending: "calendar", plan_ending: "calendar", payment_retrying: "billing",
  };
  function flagArea(f) {
    if (f && f.key === "goal_slip" && f.discipline) return f.discipline;
    return (f && FLAG_AREA[f.key]) || (f && f.key) || "other";
  }

  // ── Dismiss and snooze (P2) ────────────────────────────────────────────────
  // record.dismissals: [{ key, sig, until }] — the coach's own rows from coach_signal_dismissals
  // (attachCoachContext). A dismissal matches a flag of the same key AND the same episode `sig`;
  // `until` null holds until the episode changes (Dismiss), a time holds until then as well
  // (Snooze). An unreadable `until` is an expired one: the flag comes back rather than vanishing.
  function isDismissed(dismissals, flag, now) {
    if (!flag || !Array.isArray(dismissals)) return false;
    var at = instantNow(now instanceof Date ? now : new Date()).getTime();
    for (var i = 0; i < dismissals.length; i++) {
      var d = dismissals[i];
      if (!d || d.key !== flag.key || typeof d.sig !== "string" || d.sig !== flag.sig) continue;
      if (d.until != null && d.until !== "") {
        var u = parseDate(d.until);
        if (!u || u.getTime() <= at) continue;
      }
      return true;
    }
    return false;
  }

  // Availability is separate from attention. An empty/failed overview is never
  // evidence that a client is on track. Older callers without fetch metadata
  // retain their existing policy; live dashboard records always supply it.
  function progressStatus(c, now) {
    var meta = c && c.progressRead;
    if (!meta) return { state: "ready", label: "Up to date", checkedAt: null };
    if (meta.state !== "ready") return { state: meta.state, label: meta.state === "loading" ? "Loading progress" : "Progress unavailable", checkedAt: meta.checkedAt || null };
    var dates = [];
    if (c.streaks) dates.push(c.streaks.lastActiveOn);
    if (c.foodLogs) dates.push(c.foodLogs.lastLoggedOn);
    if (c.checkIn) dates.push(c.checkIn.lastWeekOf);
    (c.shapeScoreHistory || []).forEach(function (w) { dates.push(w.weekOf); });
    var stamp = (now || new Date()).getTime();
    var recent = dates.some(function (d) {
      var n = d ? Date.parse(d) : NaN;
      return Number.isFinite(n) && n <= stamp + 86400000 && stamp - n <= 14 * 86400000;
    });
    return { state: recent ? "ready" : "insufficient", label: recent ? "Up to date" : "Insufficient recent data", checkedAt: meta.checkedAt || null };
  }

  // ── Discipline classification + routing (coach triage) ──────────────────────
  // Each signal belongs to a DISCIPLINE; the owning pro acts on it, the OTHER pro
  // sees it READ-ONLY. General signals (check-in / score / contact / sessions / a habit or
  // custom goal) are owned by whoever is viewing. A client with a single pro →
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
    // ⚠ LOGGING IS THE NUTRITIONIST'S (the coach-alerts research): reviewing intake is their role, so a
    // trainer sees a food-log gap as context while a nutritionist is on, and owns it as the only coach.
    food_gap: "nutrition",
    food_logging: "nutrition",
    score_drop: "general",
    checkin_overdue: "general",
    contact_gap: "general",
    goal_slip: "general",
    screening_flagged: "general", // both pros program around it
    screening_missing: "general",
    plan_due: "general",          // each coach reads their own board's plan step
    missed_sessions: "general",   // each coach's own booked sessions (ruleMissedSessions reads the caller's leg)
    recovery_low: "recovery",     // a wearable's recovery → ease the load, like sleep
    checkin_waiting: "general",   // each coach reviews the check-in
    reply_waiting: "general",     // each coach's own thread
    program_ending: "general",    // each coach's own program or plan
    payment_retrying: "general",  // each coach's own subscription
    plan_ending: "general",
    pause_ended: "general",       // back from a break: every coach on the client says welcome back
    // The trainer alerts (PR 1).
    workouts_missed: "training",  // the trainer's program: a nutritionist sees it in joint attention
    completion_drop: "training",
    load_spike: "training",       // context, the trainer's evaluation only
    steps_falling: "training",
    gone_quiet: "general",        // both coaches
    not_started: "general",
    no_booking: "general",        // each coach's own bookings
    // The weight alerts (PR 2): weight loss is the nutritionist's; a trainer sees it as context, and
    // owns the safety red, the gap and the slow start only as the client's one coach. Gain is both.
    weight_fast: "nutrition",
    weight_unsafe: "nutrition",
    weighin_gap: "nutrition",
    slow_start: "nutrition",
    gain_fast: "general",
    gain_stalled: "general",
    glp1_total: "nutrition",
    glp1_protein: "nutrition",
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
    // A flag that carries its own discipline (a goal's slip, by what the goal measures) keeps it.
    var d = f.discipline || flagDiscipline(f.key);
    var owner = disciplineOwner(d);
    // Owned if general, the viewer's own discipline, or the owning pro isn't on
    // this client (single pro → everything routes to them). Compared by
    // DISCIPLINE so a dietitian owns nutrition flags exactly like a nutritionist.
    var owned = owner === null || disciplineForRole(owner) === disciplineForRole(role) || !hasPro(c, owner);
    return {
      key: f.key, label: f.label, reason: f.reason, missedWeeks: f.missedWeeks,
      discipline: d, owned: owned, routeTo: owner,
      // The episode a dismissal keys on (isDismissed); never the figures, which stay the member's.
      sig: f.sig || null,
    };
  }
  // The OTHER discipline's flags this role doesn't already evaluate — surfaced as
  // routed context (a trainer/coach seeing the dietitian's macro flags). Each is
  // tagged owned/read-only: READ-ONLY when a nutritionist is on the client, OWNED
  // when the trainer is the only pro (everything routes to them). NOT counted
  // toward severity either way — severity stays exactly as evaluateClient says.
  function readOnlyFlags(c, now, role) {
    var out = [];
    // Only while a nutritionist is on the client: a sole trainer evaluates these as their own flags.
    if (disciplineForRole(role) !== "nutrition" && hasPro(c, "nutritionist")) {
      var f;
      if ((f = ruleLedgerBlown(c, now))) out.push(tagFlag(f, role, c));
      if ((f = ruleProteinUnder(c, now))) out.push(tagFlag(f, role, c));
      // hunger_high joins its nutrition siblings here: the trainer keeps full
      // visibility of the under-fuelling read as routed context, without it
      // counting toward their severity.
      if ((f = ruleHungerHigh(c, now))) out.push(tagFlag(f, role, c));
    }
    return out.filter(function (x) { return !isDismissed(c.dismissals, x, now); });
  }

  // getTriageFeed(role, clients, now) -> rows sorted red → amber → green,
  // most-flagged first within a band, name as the stable tiebreak. Each flag is
  // tagged with its discipline + owned/read-only routing; `readOnly` carries the
  // other discipline's context flags (not counted in severity).
  function getTriageFeed(role, clients, now, thresholds) {
    if (thresholds) return withThresholds(thresholds, function () { return getTriageFeed(role, clients, now); });
    if (!inScope()) return withThresholds(defaultsForRole(role), function () { return getTriageFeed(role, clients, now); });
    now = now || new Date();
    var rank = { red: 3, amber: 2, unknown: 1, green: 0 };
    return (clients || [])
      .map(function (c) {
        var r = evaluateClient(c, now, role);
        var tagged = r.flags.map(function (f) { return tagFlag(f, role, c); });
        var row = {
          client: c,
          severity: r.severity,
          progress: progressStatus(c, now),
          // Away or just back (pauseOf), so a surface can say "Away until Nov 20"; null otherwise.
          pause: pauseOf(c, now),
          flags: tagged,
          readOnly: readOnlyFlags(c, now, role),
          reasons: r.flags.map(function (x) { return x.reason; }),
          // The cross-domain directive (verdict + reason + the one action) + the
          // coach read, so every triage surface reuses ONE source for the reason.
          directive: buildDirective(c, now, role),
          // What the coach set aside (dismissed or snoozed), so a surface can say so and undo it.
          dismissed: (r.dismissed || []).map(function (f) { return tagFlag(f, role, c); }),
        };
        // The coach's ONE move for this client: the most urgent flag THIS coach owns, its reason and
        // the coach action for it (COACH_ACTIONS). Every surface reads this — the website's button,
        // the app's YOUR MOVE, Nora's answer and the push body — so none of them re-derives it.
        row.lead = coachLead(row, role);
        return row;
      })
      .sort(function (a, b) {
        if (rank[b.severity] !== rank[a.severity]) return rank[b.severity] - rank[a.severity];
        if (b.flags.length !== a.flags.length) return b.flags.length - a.flags.length;
        return String(a.client.profile.name).localeCompare(String(b.client.profile.name));
      });
  }

  // ── Mock personas (roadmap Phase 2.2 fallback) ────────────────────────────
  // Dates are generated relative to `now` so the demo never goes stale, and
  // each persona deterministically exercises specific rules (trainer · nutritionist):
  //   red:   Marcus T. (missed sessions + sleep low, the food gap and a 23% score drop as
  //          context · amber: the food gap; the joint-attention case), Sam R. (missed
  //          sessions + quiet 7d · food gap + quiet 7d), Jonah W. (2 weeks no check-in — red
  //          on its own)
  //   amber: Aisha K. (quiet 8d), Priya S. (green · protein under),
  //          Deandre K. (green · food gap + calories over: one area), Nadia P. (green ·
  //          her weight goal's ETA slipped +15d: the nutritionist's)
  //   green: Jordan M., Elena R. (a 23% score drop, shown and never counted), Tess B. (new)
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
    // ⚠ EVERY CLIENT SAYS WHO BROUGHT THEM, AND CARRIES THE FEE THEIR ROW STORES (the sweep
    // after #2394 round 10). The roster had prices and no origins, so Today netted all ten at
    // 15% ($1,547) while Business's origin list and its Plan said half were brought at 0%, and
    // the two tabs quoted two different nets for one practice. The preview's net is now each
    // client's price less the fee on their own row (`rosterNetCents`), the shape the live roster
    // route sends (coach-roster.ts: feeCents and origin), and Business lists these same people
    // as its origin list. The coach brought their longest-standing clients; the newer ones
    // found them on Shape, at the published rate.
    var pay = function (mrrCents, lastDays, joinedDays, origin) {
      return {
        mrrCents: mrrCents, status: "active", lastSessionAt: ago(lastDays), joinedAt: ago(joinedDays),
        origin: origin, feeCents: origin === "marketplace" ? Math.round(mrrCents * (1 - PREVIEW_NET_RATE)) : 0,
      };
    };
    // Each persona's Shape Score standing: rank points (the high-water mark of points earned), which
    // the coach dashboard draws as the client's tier colour (clientColors.mjs). Sized to the cast's
    // own weekly points (~60 a week) over their time on Shape, most of them members before they joined
    // this coach: Tess's is her two weeks exactly, Sam's his two years with the coach. No persona has
    // been on Shape the four-plus years Legend takes at that pace, so the preview shows four tiers.
    var STANDING = { 1: 5180, 2: 2240, 3: 1460, 4: 6890, 5: 2980, 6: 3350, 7: 1240, 8: 610, 9: 39, 10: 3720 };
    // Assigned workouts from [daysAgo, done] pairs (the trainer alerts, PR 1).
    var wk = function (pairs) { return { days: pairs.map(function (p) { return { on: ago(p[0]), done: !!p[1] }; }).reverse() }; };
    var person = function (id, name, over) {
      var base = {
        profile: { id: "demo-" + id, name: name, isNew: false, status: "ontrack" },
        rankPoints: STANDING[id] != null ? STANDING[id] : null,
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
        payments: pay(18000, 2, 400, "coach_link"),
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
      // red for the trainer — 4 of 9 booked sessions missed and a week of short sleep (two areas);
      // amber for the nutritionist — no food log in 5 days (the sleep is the trainer's). A 23% score
      // drop is context for both. The joint-attention case: each coach's lead is their side of the
      // slip, so each is offered the joint note. His weight
      // goal has been flat for weeks: stalled BOTH weeks, so there was never an ETA to slip —
      // the card shows the honest "no ETA" state without a flag. The streak broke too, which
      // is his own screens' and no coach's.
      person(2, "Marcus T.", {
        payments: pay(18000, 6, 96, "marketplace"),
        // The joint-attention case: a trainer AND a nutritionist on his care team (P2: joint attention
        // needs a real co-coach). Both are listed so either role's preview finds its counterpart.
        pros: { trainer: true, nutritionist: true },
        coCoaches: [{ role: "trainer", userId: "demo-coach-trainer", name: "Alex" }, { role: "nutritionist", userId: "demo-coach-nutritionist", name: "Rae" }],
        streaks: { current: 0, best: 12, lastActiveOn: ago(4) },
        foodLogs: { lastLoggedOn: ago(5), daysLogged7d: 2 },
        recovery: { sleepHours: { avg7: 5.6, lastNight: 5.4, target: 7.5, n: 6 } },
        shapeScoreHistory: history([62, 65, 60, 68, 64, 70, 71, 55]),
        trainingAdherence: { pct: 56, done: 5, planned: 9 }, bookedSessions: { trainer: { done: 5, planned: 9 }, nutritionist: null },
        // 3 of 8 assigned workouts done in 4 weeks, the last two missed (workouts_missed): the training
        // side of his joint attention from the nutritionist's view too.
        assignedWorkouts: wk([[2, 0], [5, 0], [9, 1], [12, 0], [16, 1], [19, 0], [23, 1], [26, 0]]),
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
          // Started 13 weeks ago, so past the slow start's weeks: his case is the training side.
          { id: "g-weight", label: "Goal weight", metric: "weight", unit: "lb", target: 172, start: 184, startedOn: ago(90), setBy: "trainer",
            history: gh([[35, 181.4], [28, 181.2], [21, 181.5], [14, 181.3], [7, 181.4], [1, 181.4]]) },
        ],
      }),
      // amber — gone quiet: nothing from her in 8 days (no workout, food log, check-in or message),
      // one line in place of the food-log and contact gaps
      person(3, "Aisha K.", {
        lastContact: { trainer: ago(8), nutritionist: ago(8) },
        lastFromClient: ago(9) + "T18:00:00Z",
        foodLogs: { lastLoggedOn: ago(8), daysLogged7d: 0 },
        activity: { lastWorkoutOn: ago(10), steps: [] },
        streaks: { current: 0, best: 9, lastActiveOn: ago(8) },
        checkIn: { lastWeekOf: mondaysAgo(0), latest: { weekOf: mondaysAgo(0), submittedAt: ago(8) + "T09:00:00Z" } },
        goalPhase: "Cut",
      }),
      // red — no contact in 7 days, and 5 of 14 sessions missed (the trainer's) or no food logs
      // in 4 days (the nutritionist's): two areas for each coach
      person(4, "Sam R.", {
        payments: pay(18000, 9, 730, "coach_invite"),
        recentLogs: [],
        program: { name: "Foundations", week: 4, weeks: 8 },
        foodLogs: { lastLoggedOn: ago(4), daysLogged7d: 2 },
        lastContact: { trainer: ago(7), nutritionist: ago(7) },
        // His last session kept 16 days ago and nothing booked since (no_booking, the trainer's).
        trainingAdherence: { pct: 64, done: 9, planned: 14 }, bookedSessions: { trainer: { done: 9, planned: 14, lastKeptAt: ago(16) + "T17:00:00Z", nextAt: null }, nutritionist: null },
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
        // Losing fast (PR 2): about 1.3% a week over the last 3 weeks, on protein well under target. The
        // nutritionist's, in the same area as her protein, so her row stays amber; the trainer's context.
        goals: [
          { id: "g-weight", label: "Goal weight", metric: "weight", unit: "lb", target: 135, start: 150, startedOn: ago(49), setBy: "nutritionist",
            history: gh([[49, 150], [42, 149], [35, 148], [28, 147], [21, 146], [14, 144.2], [7, 142.5], [1, 140.8]]) },
        ],
        // Her own weigh-ins, the same as her goal's (the weight alerts read both).
        weighIns: [[21, 146], [14, 144.2], [7, 142.5], [1, 140.8]].map(function (p) { return { on: ago(p[0]), weight: p[1], unit: "lb" }; }),
        payments: pay(22000, 1, 210, "marketplace"),
        recentLogs: [
          { on: ago(0), kcal: 1815, protein: 92 },
          { on: ago(1), kcal: 1870, protein: 101 },
          { on: ago(2), kcal: 1790, protein: 95 },
        ],
      }),
      // green — her score fell 23% wk/wk, everything else fine: a coach sees the drop as
      // context and it never colours the row (her own view still says it)
      person(6, "Elena R.", {
        shapeScoreHistory: history([48, 52, 55, 58, 61, 64, 66, 51]),
        // Context too, on the trainer's side (never counted): a training-load spike and falling steps.
        trainingLoad: { days: [[30, 280], [27, 300], [23, 290], [20, 310], [16, 300], [13, 290], [9, 300], [5, 520], [3, 540], [1, 500]].map(function (p) { return { on: ago(p[0]), load: p[1] }; }) },
        activity: { lastWorkoutOn: ago(1), steps: (function () { var out = []; for (var d = 34; d >= 0; d--) out.push({ on: ago(d), steps: d <= 6 ? 5200 : 9100 }); return out; })() },
      }),
      // green for the trainer (the food gap is the nutritionist's, and 3 days is under a
      // trainer's 5); amber on the nutritionist feed — no log in 3 days, and the four days
      // logged average 21% over the calorie target: one area
      person(7, "Deandre K.", {
        payments: pay(18000, 4, 45, "marketplace"),
        foodLogs: { lastLoggedOn: ago(3), daysLogged7d: 4 },
        nutrition: { avgCalories: 2540, targetCalories: 2100, avgProtein: 138, targetProtein: 150 },
        recentLogs: [
          { on: ago(3), kcal: 2680, protein: 132 },
          { on: ago(4), kcal: 2515, protein: 141 },
          { on: ago(5), kcal: 2430, protein: 140 },
        ],
      }),
      // red — two weeks without a check-in (red on its own). Eighteen days a client, so the last one is
      // from his own weeks here: one from before he joined would be no check-in at all (F4).
      person(8, "Jonah W.", {
        payments: pay(18000, 13, 18, "marketplace"),
        checkIn: { lastWeekOf: mondaysAgo(2) },
        trainingAdherence: { pct: 71, done: 10, planned: 14 }, bookedSessions: { trainer: { done: 10, planned: 14 }, nutritionist: null },
        // Every workout done in his first fortnight, 3 of 5 in the last two weeks: the drop the 50% line misses.
        assignedWorkouts: wk([[1, 1], [4, 0], [6, 1], [9, 0], [11, 1], [15, 1], [17, 1], [12 + 4, 1]]),
      }),
      // green + NEW — joined this week; no first check-in yet (new-client
      // pass). No goals set yet either — the pro sees the "set the first
      // one" state.
      person(9, "Tess B.", {
        profile: { id: "demo-9", name: "Tess B.", isNew: true, status: "new" },
        payments: pay(16000, 1, 5, "marketplace"),
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
      // amber for the nutritionist — the goal-slip case: a clean month of −1 lb/wk flattened
      // over the last two, so this week's projection lands 15 days later than last week's.
      // Everything else about her week is clean — the slip alone turns the row amber. A weight
      // goal is the nutritionist's, so the trainer sees it as context.
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
          // From 178.6: 3.2% down by week 10, so her case is the slip, not a slow start (PR 2).
          { id: "g-weight", label: "Goal weight", metric: "weight", unit: "lb", target: 165, start: 178.6, startedOn: ago(70), setBy: "nutritionist",
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
          return { client: c, state: "ready", reason: "Check-in received — ready to program" };
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
  // A client slipping in BOTH domains — training (missed sessions, a training goal's slip) AND
  // nutrition (logs/ledger/protein) — should get ONE coordinated message, not two separate nudges.
  // Each side is read by its own coach's rules (the training flags as a trainer's evaluation has
  // them, the nutrition flags as a nutritionist's), on the viewer's own thresholds: a trainer's joint
  // note waits for the food-log gap their own Settings names.
  // ⚠ THE TRAINING SIDE WAS THE BROKEN STREAK, WHICH IS NO COACH'S FLAG NOW (evaluateClient). Missed
  // sessions read the trainer's own booked sessions, which only the trainer's record carries
  // (bsBookedSessionsLeg), so from the nutritionist's side the training half is a training goal's
  // slip until a workout-adherence read gives both coaches one (War Room).
  var TRAINING_KEYS = { missed_sessions: true, workouts_missed: true, completion_drop: true };
  var NUTRITION_KEYS = { food_gap: true, food_logging: true, ledger_blown: true, protein_under: true };
  function isTrainingSlip(f) {
    return !!f && (TRAINING_KEYS[f.key] || (f.key === "goal_slip" && f.discipline === "training"));
  }
  // ⚠ ONLY FOR A CLIENT WHO REALLY HAS A CO-COACH OF THE OTHER DISCIPLINE (P2). It ran over every
  // client and said "with their nutritionist" about people who had none, and its action wrote to the
  // CLIENT. The record's `coCoaches` (recordFromOverview, from the overview's care team) names who is
  // on the other side; the entry carries that coach, and the surfaces open the private care-team
  // thread with them (/api/me/shared-clients/[clientId]/thread). `role` is the viewer's: a trainer's
  // counterpart is the nutritionist, and the reverse. Without a role, any co-coach of either side.
  function coCoachFor(c, role) {
    var list = c && Array.isArray(c.coCoaches) ? c.coCoaches : [];
    var want = disciplineForRole(role) === "training" ? "nutritionist" : disciplineForRole(role) === "nutrition" ? "trainer" : null;
    for (var i = 0; i < list.length; i++) {
      var x = list[i];
      if (!x || typeof x.userId !== "string" || !x.userId) continue;
      var xr = x.role === "dietitian" ? "nutritionist" : x.role;
      if (want ? xr === want : (xr === "trainer" || xr === "nutritionist")) return { role: xr, userId: x.userId, name: x.name || null };
    }
    return null;
  }
  // One side of joint attention, read at its own coach's line. The viewer's side keeps the set this
  // runs in (their own tuning). The co-coach's side reads at THEIR tuning, which the overview carries on
  // their care-team entry (flagLines, from get_care_team_flag_lines), resolved over their role's house
  // defaults; with none on the record (not read yet, or the read failed) it reads at those defaults.
  // Read inside the viewer's set, a trainer judged the nutrition side by their own 5-day food-log gap,
  // and the two coaches disagreed on who needed a joint note.
  function jointLeg(c, now, legRole, viewer) {
    var run = function () { return evaluateClient(c, now, legRole).flags; };
    if (disciplineForRole(legRole) === disciplineForRole(viewer)) return run();
    var lines = coCoachLines(c, legRole);
    return withThresholds(lines ? resolveThresholds(lines, legRole).thresholds : defaultsForRole(legRole), run);
  }
  // The flag tuning of the co-coach who holds `legRole` on this client: the same entry coCoachFor picks
  // (the first of that role with a user id), so the note's coach and the line it was read at agree.
  function coCoachLines(c, legRole) {
    var list = c && Array.isArray(c.coCoaches) ? c.coCoaches : [];
    for (var i = 0; i < list.length; i++) {
      var x = list[i];
      if (!x || typeof x.userId !== "string" || !x.userId) continue;
      var xr = x.role === "dietitian" ? "nutritionist" : x.role;
      if (disciplineForRole(xr) !== disciplineForRole(legRole)) continue;
      return flagLinesOf(x.flagLines);
    }
    return null;
  }
  // A care-team entry's flag tuning as the engine takes it: a plain object of finite numbers, or none.
  function flagLinesOf(v) {
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    var out = {}, any = false;
    for (var k in v) {
      if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
      if (typeof v[k] === "number" && isFinite(v[k])) { out[k] = v[k]; any = true; }
    }
    return any ? out : null;
  }
  function findJointAttention(clients, now, thresholds, role) {
    if (thresholds) return withThresholds(thresholds, function () { return findJointAttention(clients, now, null, role); });
    if (!inScope()) return withThresholds(defaultsForRole(role), function () { return findJointAttention(clients, now, null, role); });
    now = now || new Date();
    var out = [];
    for (var i = 0; i < (clients || []).length; i++) {
      var c = clients[i];
      var coCoach = coCoachFor(c, role);
      if (!coCoach) continue;
      var training = jointLeg(c, now, "trainer", role).filter(isTrainingSlip);
      var nutrition = jointLeg(c, now, "nutritionist", role).filter(function (f) { return NUTRITION_KEYS[f.key]; });
      if (training.length && nutrition.length) {
        out.push({ client: c, trainingFlags: training, nutritionFlags: nutrition, coCoach: coCoach,
          action: { kind: "care_team", label: "Start joint note" } });
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
  //     action:{label,kind}|null, read:{ summary30d, oneThingNow }, cited:[…],
  //     evidence?:{ key, avg, n, …figures } }   // only when an engine flag leads; avg/n null
  //                                             // without them; the flag's `figures` on the
  //                                             // member's own view only (memberFigures)

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
    // The coach-only levers (P2): a coach's verdict, never a member's. They carry no DIRECTIVE_MOVES
    // entry, so their directive has no member action — the coach's is COACH_ACTIONS.
    plan: "Week 1 not live", reply: "Reply waiting", review: "Check-in to review", sessions: "Sessions slipping",
    program: "Program ending", billing: "Payment retrying", renewal: "Plan ending", recovery: "Recovery is low",
    workouts: "Workouts slipping", start: "Not started yet", load: "Training load is up", steps: "Steps are down",
    weightfast: "Losing weight fast", weighin: "Weigh-in overdue", weightslow: "Slow start", gain: "Gain pace is off", glp1: "On a GLP-1",
  };
  function directiveKeyToLever(key) {
    return ({
      checkin_overdue: "checkin", streak_broken: "training", food_gap: "nutrition", food_logging: "nutrition",
      ledger_blown: "nutrition", protein_under: "nutrition", goal_slip: "goal",
      score_drop: "score", contact_gap: "contact", sleep_low: "sleep",
      energy_low: "energy", hunger_high: "hunger", hydration_low: "hydration",
      // The screening is a conversation: reach out about it.
      screening_flagged: "contact", screening_missing: "contact",
      plan_due: "plan", reply_waiting: "reply", checkin_waiting: "review", missed_sessions: "sessions", pause_ended: "contact",
      program_ending: "program", payment_retrying: "billing", plan_ending: "renewal", recovery_low: "recovery",
      workouts_missed: "workouts", completion_drop: "workouts", gone_quiet: "contact", not_started: "start",
      no_booking: "sessions", load_spike: "load", steps_falling: "steps",
      weight_fast: "weightfast", weight_unsafe: "weightfast", weighin_gap: "weighin", slow_start: "weightslow",
      gain_fast: "gain", gain_stalled: "gain", glp1_total: "glp1", glp1_protein: "glp1",
    })[key] || null;
  }

  // The directive's headline for one flag ("Reply waiting", "Tighten nutrition"), or null: what Nora
  // puts before a row's lead (coachToday.mjs), so her answer heads the coach's own flag the way the
  // directive heads its top one.
  function leadVerdict(key) {
    var lever = directiveKeyToLever(key);
    return lever && DIRECTIVE_VERDICTS[lever] ? DIRECTIVE_VERDICTS[lever] : null;
  }

  // The single directive must lead with the MOST URGENT flag, not whichever rule
  // ran first in push order (S3-5). A months-late check-in (a lost coaching
  // relationship) outranks a "grab a win" score dip. checkin_overdue escalates
  // further the longer it's been missed.
  var DIRECTIVE_PRIORITY = {
    checkin_overdue: 100,
    // A yes on the health screening is read before anything is programmed; a missing one is asked
    // for before the next session.
    screening_flagged: 90, plan_due: 85, contact_gap: 80, screening_missing: 70, goal_slip: 60, food_gap: 55, food_logging: 54,
    ledger_blown: 50, protein_under: 45, streak_broken: 40, sleep_low: 35,
    // The vitals flags rank BELOW sleep_low (a chronic sleep deficit outranks a
    // soft-gauge read) and above score_drop, in energy → hunger → hydration order.
    energy_low: 34, hunger_high: 33, hydration_low: 32,
    score_drop: 30,
    // The P2 coach signals. A client left waiting on the coach's reply leads everything but a
    // months-late check-in: it is the coach's own debt, and the cheapest thing on the list to clear.
    // A check-in with a low rating or a question sits beside contact; missed sessions above goal pace;
    // a cancelled plan just under it; a wearable's low recovery just above sleep; the calendar and
    // money reminders last.
    reply_waiting: 110, pause_ended: 78, checkin_waiting: 75, missed_sessions: 65, plan_ending: 58, recovery_low: 36,
    program_ending: 25, payment_retrying: 20,
    // The trainer alerts (PR 1): gone quiet stands where the contact gap did, not started just above
    // it (a new client who hasn't begun), workouts missed beside missed sessions and the drop just
    // under, no booking with the calendar reminders; the context reads under the Score.
    not_started: 82, gone_quiet: 80, workouts_missed: 64, completion_drop: 62, no_booking: 28,
    load_spike: 29, steps_falling: 29,
    // The weight alerts (PR 2): the safety red just over a yes on the screening; losing fast between the
    // goal's slip and the food-log gap, the gap and the slow start under it; the GLP-1 context with the
    // other context reads.
    weight_unsafe: 92, weight_fast: 57, weighin_gap: 53, slow_start: 52, gain_fast: 51, gain_stalled: 49,
    glp1_total: 29, glp1_protein: 29,
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
  // ⚠ NO READ BELOW SLEEP_MIN_NIGHTS LOGGED NIGHTS (owner, 2026-10-18). One logged night under
  // 6h used to be its own "7-day average", raised sleep_low and sent a push. `n` is the count
  // of nights the average is over, from both builders (signalsMap.sleepRecoveryFromProgress,
  // roster-vitals.buildRosterRecovery); a record without one has no evidence, like the
  // check-in vitals' *_MIN_DAYS floors. The floor is not a coach tunable, for the same reason.
  function recoveryRead(rec) {
    var r = rec && rec.recovery;
    if (!r || !r.sleepHours) return null;
    var s = r.sleepHours;
    var nights = s.n != null && isFinite(Number(s.n)) ? Number(s.n) : 0;
    if (nights < THRESHOLDS.SLEEP_MIN_NIGHTS) return null;
    var avg = s.avg7 != null && isFinite(Number(s.avg7)) ? Number(s.avg7) : null;
    var target = s.target != null && isFinite(Number(s.target)) ? Number(s.target) : 7.5;
    var lastNight = s.lastNight != null && isFinite(Number(s.lastNight)) ? Number(s.lastNight) : null;
    // "low" if logged-but-short, OR last night not logged yet (nothing to act on).
    var low = (avg != null && avg < target - 0.5) || s.lastNight == null;
    return { avg: avg, target: target, lastNight: lastNight, low: low, hasData: avg != null || s.lastNight != null, n: nights };
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
  // The member's own directive also carries the figures its flag's reason was built from
  // (the rule's `figures`: a streak's longest run, the weeks since a check-in and the Monday it names,
  // a goal's name and its slip, water's litres and target), so Home and the Shape Daily splash can
  // say the reason in the member's language and units (leadReason.mjs bsLeadReason), and the push and
  // the bell row on the server too (notifications.mjs memberMoveLine). A coach
  // role's directive keeps `{ key, avg, n }` byte for byte. No rule's figures are named key, avg or
  // n, so they never overwrite those (tests/member-engine-reasons.test.mjs).
  function memberFigures(evidence, figures) {
    if (!evidence || !figures || typeof figures !== "object") return;
    for (var k in figures) if (Object.prototype.hasOwnProperty.call(figures, k)) evidence[k] = figures[k];
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
      // The member's own view says a check-in average in words; every coach role keeps the
      // flag's figure (memberVitalsReason). `evidence` is what the reason was built from, so
      // Home can say the same thing in the member's language.
      var topReason = (disciplineForRole(role) === "general" && memberVitalsReason(top)) || top.reason;
      var flagLead = {
        source: "engine", lever: lever2, severity: ev.severity,
        verdict: DIRECTIVE_VERDICTS[lever2] || "Your move",
        reason: topReason, action: DIRECTIVE_MOVES[lever2] || null,
        read: buildDirectiveRead(rec, topReason), cited: [top.key],
        evidence: { key: top.key, avg: top.avg != null ? top.avg : null, n: top.n != null ? top.n : null },
      };
      if (disciplineForRole(role) === "general") memberFigures(flagLead.evidence, top.figures);
      return flagLead;
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

  // ── THE COACH'S MOVE: one action per reason (P2, 2026-11-05) ─────────────────
  // Owner: "I designed the shape engine to tell coaches, alert them, recommend to them on what they
  // should do for certain clients based on the data that is received, making their job as easy as
  // possible. I dont want coaches being overwhelmed with data."
  //
  // ⚠ ONE TABLE, KEYED BY THE FLAG, READ BY EVERY SURFACE. The website offered one-size Message for
  // every reason, and the app's case file picked its button by regex over the reason text. Each kind
  // is a move both surfaces can make:
  //   message        — open the client's thread with `draft`, written to the MEMBER (memberDraft)
  //   reply          — open the client's thread; they wrote, so no draft
  //   review_checkin — the check-in, to read and mark reviewed (draft: the reply's opener)
  //   read_screening — the client file's health screening
  //   adjust_program — the training program (builder / the app's ADJUST)
  //   adjust_plan    — the nutrition plan
  //   schedule       — the calendar, to rebook
  //   care_team      — the private thread with the co-coach (joint attention)
  // `nora: true` marks a message where Nora's grounded draft (/api/ai/draft-message, the app's
  // ✦ DRAFT) applies; the template draft is the fallback and the website's opener.
  var COACH_ACTIONS = {
    reply_waiting:     { kind: "reply", label: "Reply" },
    checkin_overdue:   { kind: "message", label: "Ask for the check-in", draft: true, nora: true },
    checkin_waiting:   { kind: "review_checkin", label: "Review check-in", draft: true },
    screening_flagged: { kind: "read_screening", label: "Read health screening" },
    plan_due:          { kind: "adjust_program", label: "Publish week 1", nutrition: { kind: "adjust_plan", label: "Publish the first plan" } },
    contact_gap:       { kind: "message", label: "Message", draft: true, nora: true },
    pause_ended:       { kind: "message", label: "Welcome back", draft: true, nora: true },
    screening_missing: { kind: "message", label: "Ask for the screening", draft: true },
    missed_sessions:   { kind: "schedule", label: "Schedule" },
    goal_slip:         { kind: "message", label: "Ask for a weigh-in", draft: true, nora: true },
    plan_ending:       { kind: "message", label: "Message", draft: true },
    food_gap:          { kind: "message", label: "Nudge to log", draft: true, nora: true },
    food_logging:      { kind: "message", label: "Nudge to log", draft: true, nora: true },
    // ⚠ A TRAINER SHARES GUIDANCE, NEVER A TARGET (ACE's scope of practice: no specific intake
    // recommendations, no individualised meal plans). A trainer reaches these only as the client's
    // only coach; the draft points to the general guidance and offers a dietitian (memberDraft).
    ledger_blown:      { kind: "adjust_plan", label: "Adjust plan", training: { kind: "message", label: "Share guidance", draft: true } },
    protein_under:     { kind: "adjust_plan", label: "Adjust plan", training: { kind: "message", label: "Share guidance", draft: true } },
    hunger_high:       { kind: "adjust_plan", label: "Adjust plan", training: { kind: "message", label: "Message", draft: true } },
    streak_broken:     { kind: "message", label: "Message", draft: true, nora: true },
    recovery_low:      { kind: "adjust_program", label: "Ease the load", nutrition: { kind: "message", label: "Message", draft: true } },
    sleep_low:         { kind: "adjust_program", label: "Ease the load", nutrition: { kind: "message", label: "Message", draft: true } },
    energy_low:        { kind: "adjust_program", label: "Ease the load", nutrition: { kind: "message", label: "Message", draft: true } },
    score_drop:        { kind: "message", label: "Message", draft: true, nora: true },
    program_ending:    { kind: "adjust_program", label: "Write the next block", nutrition: { kind: "adjust_plan", label: "Write the next plan" } },
    payment_retrying:  { kind: "message", label: "Message", draft: true },
    // The trainer alerts (PR 1).
    workouts_missed:   { kind: "message", label: "Check in about the program", draft: true, nora: true },
    completion_drop:   { kind: "message", label: "Check in about the program", draft: true, nora: true },
    gone_quiet:        { kind: "message", label: "Message", draft: true, nora: true },
    not_started:       { kind: "message", label: "Help them start", draft: true, nora: true },
    no_booking:        { kind: "schedule", label: "Offer a session" },
    load_spike:        { kind: "message", label: "Message", draft: true },
    steps_falling:     { kind: "message", label: "Message", draft: true },
    // The weight alerts (PR 2). A trainer shares guidance, never a target (ACE's scope).
    weight_unsafe:     { kind: "message", label: "Check in", draft: true },
    weight_fast:       { kind: "adjust_plan", label: "Review the plan", training: { kind: "message", label: "Message", draft: true } },
    weighin_gap:       { kind: "message", label: "Ask for a weigh-in", draft: true, nora: true },
    slow_start:        { kind: "adjust_plan", label: "Review the plan", training: { kind: "message", label: "Message", draft: true } },
    gain_fast:         { kind: "adjust_plan", label: "Review the plan", training: { kind: "message", label: "Message", draft: true } },
    gain_stalled:      { kind: "adjust_plan", label: "Review the plan", training: { kind: "message", label: "Message", draft: true } },
    glp1_total:        { kind: "message", label: "Message", draft: true },
    glp1_protein:      { kind: "adjust_plan", label: "Adjust plan", training: { kind: "message", label: "Share guidance", draft: true } },
  };
  var COACH_ACTION_KINDS = ["message", "reply", "review_checkin", "read_screening", "adjust_program", "adjust_plan", "schedule", "care_team"];

  function firstName(rec) {
    var n = rec && rec.profile && rec.profile.name ? String(rec.profile.name).trim() : "";
    return n ? n.split(/\s+/)[0] : "there";
  }

  // ⚠ THE CLIENT'S DRAFT IS WRITTEN TO THE CLIENT, NEVER FROM THE COACH'S REASON. The website pasted
  // the reason into the opener ("I'm seeing answered yes on the health screening — read it before
  // programming"), which is a note to the coach, sent to the member. Every line here is the member's
  // own: what to do, said kindly, with a figure only where it is theirs to know (a date, their week).
  // tests/coach-actions.test.mjs holds every draft free of every coach reason.
  function memberDraft(key, rec, role, flag) {
    var hi = "Hey " + firstName(rec) + " — ";
    var ci = rec && rec.checkIn;
    switch (key) {
      case "contact_gap": {
        var ob = onboardingFor(rec, role);
        var hello = onboardingStep(ob, "hello");
        // Never written to (the "Say hello" or "Never messaged" episode): a welcome, not a "been a while".
        if ((hello && hello.done === false) || (flag && (flag.sig === "hello" || flag.sig === "never"))) return "Hi " + firstName(rec) + " — welcome aboard! I'm glad you're here. How's your first week going so far?";
        return hi + "it's been a little while since we talked. How's this week going?";
      }
      case "pause_ended":
        return "Welcome back, " + firstName(rec) + "! How was the break? Let's pick up where we left off. How are you feeling about this week?";
      case "checkin_overdue":
        return ci && ci.lastWeekOf
          ? hi + "I haven't seen your weekly check-in yet. Could you send it when you get a minute? It helps me plan your next week."
          : hi + "when you get a minute, could you fill in your first weekly check-in? It helps me plan your next week.";
      case "checkin_waiting": {
        var wk = ci && ci.latest && ci.latest.weekOf ? ci.latest.weekOf : null;
        return "Hi " + firstName(rec) + " — thanks for your check-in" + (wk ? " for the week of " + wk : "") + ". ";
      }
      case "screening_missing":
        return "Hi " + firstName(rec) + " — before our next session, could you fill in your health screening? It takes a few minutes and helps me plan safely.";
      case "goal_slip":
        return hi + "could you log a weigh-in this week? I want to see how we're tracking and adjust if we need to.";
      case "food_gap":
        return hi + "your food log has gone quiet. No judgement — even a rough entry or a photo helps me see how the week is going.";
      case "streak_broken":
        return hi + "how has training felt this week? If something's getting in the way, let's adjust the plan so it fits.";
      case "score_drop":
        return hi + "how did this week feel? Tell me what got in the way and we'll pick one easy win for the next few days.";
      case "food_logging":
        return hi + "your food log has been patchy this week. No judgement — a quick entry or a photo on most days helps me see how it's going.";
      case "ledger_blown":
        if (disciplineForRole(role) === "training") return hi + "how's food going this week? Your log has been running over your calorie target. The general healthy-eating guidelines are a good place to start, and if you'd like a plan built around you, a registered dietitian can help — I'm happy to suggest one.";
        return hi + "how's food going this week? Let's look at your meals together and find an easy swap or two.";
      case "protein_under":
        if (disciplineForRole(role) === "training") return hi + "how's food going? Protein has been coming in under your target. A source of protein at each meal is the general guidance, and if you'd like a plan built around you, a registered dietitian can help — I'm happy to suggest one.";
        return hi + "how's food going? Protein has been coming in under where we want it — an extra serving at breakfast or lunch closes most of the gap.";
      case "hunger_high":
        return hi + "you've been hungry between meals this week. Let's look at your meals — the plan may need a bit more fuel.";
      case "sleep_low": case "energy_low": case "recovery_low":
        return hi + "how are you feeling this week? Recovery looks like it's running low, so let's keep things a little lighter for a few days.";
      case "workouts_missed": case "completion_drop":
        return hi + "how's the program feeling? A few of this block's workouts have slipped. No judgement — tell me what's getting in the way and I'll adjust it so it fits your week.";
      case "gone_quiet":
        return hi + "haven't heard from you in a bit, so just checking in. How are things going? Even a quick reply helps.";
      case "not_started":
        return "Hi " + firstName(rec) + " — welcome aboard! When you're ready, a good first step is logging one meal or opening your first workout. Want me to walk you through it?";
      case "load_spike":
        return hi + "you've put in a big week of training. How's your body feeling? If anything's sore or tired, tell me and we'll balance the next few days.";
      case "steps_falling":
        return hi + "how has your week been outside the gym? Your daily movement has dipped a little. Anything going on?";
      // The weight alerts (PR 2): never a weight, a percentage or a target, only what to do.
      case "weight_unsafe":
        return hi + "how are you feeling this week? Your weight has been coming down quickly, and you've been hungry or low on energy. Let's add a bit more food to your days, and if it carries on, please check in with your doctor.";
      case "weight_fast":
        return hi + "your weight has been coming down faster than we planned. How are you feeling? Let's make sure you're eating enough to keep your energy and strength up.";
      case "weighin_gap":
        return hi + "could you log a weigh-in this week? It helps me see how the plan is working for you.";
      case "slow_start":
        return hi + "how are you finding the plan so far? Progress has been slower than we hoped, which is common early on. Let's look at your week together and pick one or two changes.";
      case "gain_fast":
        return hi + "your weight is climbing a little faster than we planned. How are your appetite and training? We may ease back the extra food a touch.";
      case "gain_stalled":
        return hi + "your weight has held steady these last couple of weeks. How's eating going? We may add a little more to keep you moving toward your goal.";
      case "glp1_total":
        return hi + "you've made big progress. How are you feeling? With your medication, protein and strength work matter more than ever to protect your muscle. Let's check you're getting enough.";
      case "glp1_protein":
        return hi + "how's food going? On your medication, protein at each meal matters more than usual, to protect your muscle. How's that going for you?";
      case "payment_retrying":
        return "Hi " + firstName(rec) + " — quick heads-up: your latest payment for our plan didn't go through. Stripe will try again, and you can update your card in your membership settings.";
      case "plan_ending": {
        var end = rec && rec.payments && toDate(rec.payments.periodEndsAt);
        return "Hi " + firstName(rec) + " — I saw your plan is set to end" + (end ? " on " + end.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "") + ". Before it does, is there anything I could change that would make it more useful for you?";
      }
      default:
        return null;
    }
  }

  // The coach's action for one reason, for this coach's role: { key, kind, label, draft, nora }.
  // A key with no entry (a member-only flag) answers null; no surface invents a move.
  function coachActionFor(key, role, rec, flag) {
    var base = COACH_ACTIONS[key];
    if (!base) return null;
    var disc = disciplineForRole(role);
    var v = (disc === "nutrition" && base.nutrition) || (disc === "training" && base.training) || base;
    var draft = v.draft ? memberDraft(key, rec, role, flag) : null;
    return { key: key, kind: v.kind, label: v.label, draft: draft || null, nora: !!v.nora };
  }

  // A triage row's lead: the most urgent flag THIS coach owns (DIRECTIVE_PRIORITY), its reason and its
  // action. Null when nothing on the row is theirs — a row of routed flags asks nothing of them.
  function coachLead(row, role) {
    var owned = (row && Array.isArray(row.flags) ? row.flags : []).filter(function (f) { return f && f.owned !== false; });
    if (!owned.length) return null;
    // A quiet flag leads only a row nothing louder is on: payment_retrying has the lowest priority of
    // every coach flag (DIRECTIVE_PRIORITY; tests/coach-actions.test.mjs holds it there). A context
    // flag (CONTEXT_FLAGS: a score drop) leads only a row with nothing counted on it, so an amber row's
    // push and Today name what made it amber.
    var counted = owned.filter(function (f) { return !isContextFlag(f, role) && !QUIET_FLAGS[f.key]; });
    var top = topFlag(counted.length ? counted : owned);
    return { key: top.key, label: top.label, reason: top.reason, sig: top.sig || null, action: coachActionFor(top.key, role, row.client, top) };
  }

  // Who the feed says needs this coach, in its own order (red, then amber), split the way the roster's
  // status reads them: `now` is "Needs you" (red), `week` is "Watch" (amber, this week). A row needs the
  // coach only with a lead of theirs; a row of routed flags asks nothing of them. Today's board (its
  // brief and Needs you) and coachBrief below read this one rule.
  function coachNeeds(feed) {
    var rows = Array.isArray(feed) ? feed : [];
    var needs = rows.filter(function (r) {
      return r && (r.severity === "red" || r.severity === "amber") && r.lead;
    });
    return {
      now: needs.filter(function (r) { return r.severity === "red"; }),
      week: needs.filter(function (r) { return r.severity !== "red"; }),
    };
  }

  // Today's brief: "{name} first — {reason}" for the first client the feed says needs this coach, and
  // how many more do; the clear-day line when nobody does (the app's bsProLeadVerdict wording).
  function coachBrief(feed) {
    var split = coachNeeds(feed);
    var needs = split.now.concat(split.week);
    if (!needs.length) return { text: "Nothing needs you right now.", row: null, more: 0 };
    var r = needs[0];
    return { text: recName(r.client) + " first — " + r.lead.reason, row: r, more: needs.length - 1 };
  }

  // ── Check-in review state (the coach's `coach_week_reviews` doc) ───────────
  // The same rule as dashData.jsx's dashCheckinReviewed, over the record's summary of the check-in:
  // a review counts when it was stamped after the check-in was submitted, or — when the review kept
  // the check-in's signature — when that signature is still the check-in's (an edit reopens it).
  // The signature travels as a short hash so no check-in text rides in a stored snapshot.
  function textHash(str) {
    var h = 5381;
    var s = String(str);
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  function checkinReviewed(review, latest) {
    if (!review || !review.reviewedAt) return false;
    if (!latest) return true;
    if (review.checkinSignature) return textHash(review.checkinSignature) === latest.hash;
    return !latest.submittedAt || latest.submittedAt <= review.reviewedAt;
  }

  // ── THE SHARED INPUT BUILDER (P2) ──────────────────────────────────────────
  // ⚠ ONE RECORD PER CLIENT, BUILT ONE WAY, ON EVERY SURFACE. The website built its record from the
  // roster + /api/clients/shared-overview, the app from get_client_* rollups, Nora from three RPCs and
  // the push from whatever the app posted, so a client could be red on one and on track on another:
  // the website never mapped sleep, energy and hunger, the app and Nora had no streak, Score, targets
  // or last-logged day, Nora had no contact, screening or week-one board. Every surface reads the
  // same overview now (the website and the app POST the batch route, Nora builds it server-side with
  // buildSharedOverview), and this one function turns a roster row + that overview into the engine's
  // inputs. tests/coach-signals-surfaces.test.mjs feeds one client to every surface's path and
  // holds the flags and reasons equal.
  //   row: { id, name, isNew, joinedAt, status?, paymentRetrying?, cancelAtPeriodEnd?, periodEndsAt? }
  //   ov:  the overview (src/lib/shared-overview.ts), or null when it could not be read
  function recordFromOverview(row, ov) {
    row = row && typeof row === "object" ? row : {};
    var o = ov && typeof ov === "object" ? ov : null;
    var stats = o && o.stats && typeof o.stats === "object" ? o.stats : null;
    var checkins = o && Array.isArray(o.checkins) ? o.checkins : null;
    var goals = o && o.goals ? o.goals : null;
    var weighIns = goals && goals.overall && Array.isArray(goals.overall.weighIns)
      ? goals.overall.weighIns
          .map(function (w) { return { on: w.on || w.date || w.d || null, weight: w.w != null ? w.w : w.weight != null ? w.weight : w.kg, unit: w.unit || (w.kg != null ? "kg" : "lb") }; })
          .filter(function (w) { return w.on && w.weight != null; })
      : null;
    var phases = o && o.programPhases ? o.programPhases : null;
    var logs = o && o.logs ? o.logs : null;
    var score = o && o.scoreHistory ? o.scoreHistory : null;
    // `partial` rides along: scoreWeekReading keeps the delta to two COMPLETE weeks.
    var scoreWeeks = score && Array.isArray(score.weeks)
      ? score.weeks
          .filter(function (w) { return w && w.weekOf && w.points != null && isFinite(Number(w.points)); })
          .map(function (w) { return { weekOf: w.weekOf, points: Number(w.points), partial: !!w.partial }; })
          .slice(-8)
      : null;
    var streak = score && score.streak && score.streak.current != null ? score.streak : null;
    var targets = o && o.nutritionTargets ? o.nutritionTargets : null;
    var latestCk = checkins && checkins.length ? checkins[0] : null;
    var rec = {
      profile: { id: row.id != null ? row.id : null, name: row.name != null ? row.name : "Client", isNew: !!row.isNew, status: row.status || null, joinedAt: row.joinedAt || null },
      onboarding: o && o.onboarding && typeof o.onboarding === "object" ? o.onboarding : null,
      screening: o && o.screening ? o.screening : null,
      trainingAdherence: stats && stats.sessionsPlanned
        ? { pct: Math.round((stats.sessionsCompleted / stats.sessionsPlanned) * 100), done: stats.sessionsCompleted, planned: stats.sessionsPlanned }
        : null,
      // The rollup's 7-day count where it exists (the figure every surface quotes); the snapshot leg
      // supplies the last logged day and fills the count only when the rollup has none.
      foodLogs: stats && stats.daysLogged7d != null
        ? { lastLoggedOn: logs ? logs.lastLoggedOn : null, daysLogged7d: stats.daysLogged7d }
        : logs ? { lastLoggedOn: logs.lastLoggedOn, daysLogged7d: logs.daysLogged7d } : null,
      shapeScoreHistory: scoreWeeks && scoreWeeks.length ? scoreWeeks : null,
      weighIns: weighIns,
      streaks: streak ? { current: streak.current, best: streak.best != null ? streak.best : streak.current, lastActiveOn: streak.lastActiveOn || null } : null,
      lastContact: o && o.lastContact ? o.lastContact : null,
      checkIn: checkins
        ? (latestCk
            ? { lastWeekOf: latestCk.week_of || latestCk.weekOf || null, latest: checkinSummary(latestCk) }
            : { lastWeekOf: null })
        : null,
      // The coach's own targets (client_programs.detail.nutrition): the ledger and protein rules need
      // a value AND a target.
      nutrition: stats && (stats.avgCalories != null || stats.avgProtein != null)
        ? { avgCalories: stats.avgCalories, targetCalories: targets ? targets.calories : null, avgProtein: stats.avgProtein, targetProtein: targets ? targets.protein : null }
        : null,
      goal: goals && goals.overall && goals.overall.target != null
        ? { target: Number(goals.overall.target), unit: goals.overall.unit || "lb", now: goals.overall.now != null ? Number(goals.overall.now) : null }
        : null,
      goals: o && (o.coachGoals || goals)
        ? goalsFromDoc({
            coach: o.coachGoals || null,
            overall: goals && goals.overall ? goals.overall : null,
            weighIns: weighIns || [],
            training: goals && goals.training, nutrition: goals && goals.nutrition,
          })
        : null,
      goalPhase: phases ? phases.nutrition || phases.training || null : null,
      program: o && o.program ? o.program : null,
      // Each of the caller's roles' own (programForRole); null from an overview that predates it.
      programs: o && o.programs && typeof o.programs === "object"
        ? { trainer: o.programs.trainer || null, nutritionist: o.programs.nutritionist || null }
        : null,
      recovery: recoveryFromOverview(o),
      vitals: vitalsFromOverview(o && o.vitals),
      replyWait: o && o.replyWait && typeof o.replyWait === "object" ? o.replyWait : null,
      bookedSessions: o && o.bookedSessions && typeof o.bookedSessions === "object" ? o.bookedSessions : null,
      // The trainer alerts (PR 1): each null when the overview could not read it (unknown, never "none").
      assignedWorkouts: o && o.assignedWorkouts && typeof o.assignedWorkouts === "object" && Array.isArray(o.assignedWorkouts.days) ? { days: o.assignedWorkouts.days } : null,
      trainingLoad: o && o.trainingLoad && typeof o.trainingLoad === "object" && Array.isArray(o.trainingLoad.days) ? { days: o.trainingLoad.days } : null,
      activity: o && o.activity && typeof o.activity === "object"
        ? { lastWorkoutOn: typeof o.activity.lastWorkoutOn === "string" ? o.activity.lastWorkoutOn : null, steps: Array.isArray(o.activity.steps) ? o.activity.steps : [] }
        : null,
      payments: {
        status: row.paymentRetrying === true ? "past_due" : "active",
        paymentRetrying: row.paymentRetrying === true,
        joinedAt: row.joinedAt || null,
        // P3 hook: a cancelled plan's end, once the roster row carries it.
        cancelAtPeriodEnd: row.cancelAtPeriodEnd === true,
        periodEndsAt: row.periodEndsAt || null,
      },
    };
    // On a GLP-1 medication (the health profile's yes/no; PR 2): true, false, or left off when unanswered.
    var hp = o && o.healthProfile && typeof o.healthProfile === "object" ? o.healthProfile : null;
    if (hp && (hp.glp1 === "yes" || hp.glp1 === "no")) rec.glp1 = hp.glp1 === "yes";
    // Whether the dated food-log read answered (foodDated): the overview carries `logs`, null for none.
    if (o && Object.prototype.hasOwnProperty.call(o, "logs") && o.logs !== undefined) rec.logsRead = true;
    // Whether the Score read answered (gone quiet): only a true answer is carried.
    if (o && o.scoreRead === true) rec.scoreRead = true;
    // The client's newest message to this coach (gone quiet): left off when unread, null when none.
    if (o && (typeof o.lastFromClient === "string" || o.lastFromClient === null)) rec.lastFromClient = o.lastFromClient;
    var team = careTeamFrom(o);
    if (team.pros) rec.pros = team.pros;
    rec.coCoaches = team.coCoaches;
    // The client's pause ({ until, by }, pauseOf), null when none; left off when the overview could
    // not read it, so nothing reads differently from before the pause existed.
    if (o && o.pause && typeof o.pause === "object" && typeof o.pause.until === "string") {
      rec.pause = { until: o.pause.until, by: typeof o.pause.by === "string" ? o.pause.by : null };
      // The instant the member's return day begins (pauseOf reads it on every calendar: Codex on #2705).
      if (typeof o.pause.backAt === "string" && parseDate(o.pause.backAt)) rec.pause.backAt = o.pause.backAt;
    }
    else if (o && o.pause === null) rec.pause = null;
    return rec;
  }
  // The check-in the engine reads: its week, its ratings, whether it asks something, when it was
  // submitted and a hash of the whole row (the review signature). Never its text.
  function checkinSummary(ck) {
    if (!ck || typeof ck !== "object") return null;
    var wk = ck.week_of || ck.weekOf || null;
    return {
      weekOf: wk ? String(wk).slice(0, 10) : null,
      ratings: ck.ratings && typeof ck.ratings === "object" ? ck.ratings : null,
      asked: typeof ck.question === "string" && ck.question.trim() !== "",
      submittedAt: ck.updated_at || ck.submitted_at || ck.created_at || null,
      hash: textHash(JSON.stringify(ck)),
      reviewed: null,
    };
  }
  // The overview's sleep leg as the engine's recovery.sleepHours, over the SAME seven calendar days the
  // overview windowed (`series7`), plus the wearable's own recovery score when one is synced.
  function recoveryFromOverview(o) {
    var out = null;
    var sl = o && o.sleep && typeof o.sleep === "object" ? o.sleep : null;
    var pts = sl && Array.isArray(sl.series7) ? sl.series7.map(function (p) { return p ? kpiNum(p.value) : null; }).filter(function (v) { return v != null && v > 0; }) : [];
    if (pts.length) {
      var avg = pts.reduce(function (a, b) { return a + b; }, 0) / pts.length;
      out = { sleepHours: { avg7: Math.round(avg * 100) / 100, lastNight: pts[pts.length - 1], target: 7.5, n: pts.length } };
    }
    var dr = o && o.deviceRecovery && typeof o.deviceRecovery === "object" ? o.deviceRecovery : null;
    var davg = dr ? kpiNum(dr.avg7) : null, dn = dr ? kpiNum(dr.n) : null;
    if (davg != null && dn != null && dn > 0) {
      out = out || {};
      out.recoveryScore = { avg7: davg, n: dn };
    }
    return out;
  }
  // The overview's daily check-in gauges, as the engine reads them (no series: a snapshot stays small).
  function vitalsFromOverview(v) {
    if (!v || typeof v !== "object") return null;
    var out = {};
    ["energy", "hunger"].forEach(function (k) {
      var x = v[k];
      if (x && kpiNum(x.avg7) != null) out[k] = { avg7: kpiNum(x.avg7), n: kpiNum(x.n) || 0 };
    });
    if (v.hydration && kpiNum(v.hydration.avg7L) != null) out.hydration = { avg7L: kpiNum(v.hydration.avg7L), targetL: null, n: kpiNum(v.hydration.n) || 0 };
    return Object.keys(out).length ? out : null;
  }
  // Who else coaches this client, from the overview's care team. `pros` says which disciplines have a
  // coach, so a flag routes to the other coach only when there is one; a care team read that came back
  // partial names only the disciplines it saw, and an unseen one stays unknown (routing as before).
  function careTeamFrom(o) {
    var team = o && Array.isArray(o.careTeam) ? o.careTeam : null;
    if (!team) return { pros: null, coCoaches: [] };
    var has = { trainer: false, nutritionist: false };
    var co = [];
    for (var i = 0; i < team.length; i++) {
      var m = team[i];
      if (!m) continue;
      var r = m.role === "dietitian" ? "nutritionist" : m.role;
      if (r === "trainer" || r === "nutritionist") {
        has[r] = true;
        if (!m.isMe && typeof m.userId === "string" && m.userId) {
          var entry = { role: r, userId: m.userId, name: m.name || null };
          // Their flag tuning, for joint attention (jointLeg); only when the overview carried some.
          var lines = flagLinesOf(m.flagLines);
          if (lines) entry.flagLines = lines;
          co.push(entry);
        }
      }
    }
    var pros = has;
    if (o.careTeamPartial === true) {
      pros = {};
      if (has.trainer) pros.trainer = true;
      if (has.nutritionist) pros.nutritionist = true;
    }
    return { pros: pros, coCoaches: co };
  }

  // ── The coach's own context, attached to the records (P2) ─────────────────
  // ctx.dismissals: the coach's coach_signal_dismissals rows ({ client_id, reason_key, reason_sig,
  //   until, provider_role }) — null when the table could not be read (or does not exist yet: the
  //   migration is run by hand), which attaches nothing, so every flag shows.
  // role: the role the records are read as. ⚠ A DISMISSAL IS ONE ROLE'S (2026-11-05-coach-signal-
  //   dismissals-by-role.sql): a coach with both listings who sets "reply waiting" aside as the
  //   nutritionist still has the trainer's. A row of the other role is skipped; a row with no role, or
  //   a call with no role, reads as before.
  // ctx.reviews: the coach's coach_week_reviews doc ({ [weekOf]: { [clientId]: { reviewedAt, … } } }),
  //   null when unread, which leaves each check-in's review state unknown (checkin_waiting is quiet).
  // Returns NEW records; the inputs are not touched.
  function attachCoachContext(records, ctx, role) {
    ctx = ctx || {};
    var disc = disciplineForRole(role);
    var asRole = disc === "training" ? "trainer" : disc === "nutrition" ? "nutritionist" : null;
    var byClient = null;
    if (Array.isArray(ctx.dismissals)) {
      byClient = {};
      for (var i = 0; i < ctx.dismissals.length; i++) {
        var d = ctx.dismissals[i];
        if (!d || d.client_id == null || typeof d.reason_key !== "string") continue;
        if (asRole && typeof d.provider_role === "string" && d.provider_role !== asRole) continue;
        var k = String(d.client_id);
        (byClient[k] = byClient[k] || []).push({ key: d.reason_key, sig: typeof d.reason_sig === "string" ? d.reason_sig : null, until: d.until || null });
      }
    }
    var reviews = ctx.reviews && typeof ctx.reviews === "object" ? ctx.reviews : null;
    return (Array.isArray(records) ? records : []).map(function (rec) {
      if (!rec || typeof rec !== "object") return rec;
      var id = rec.profile && rec.profile.id != null ? String(rec.profile.id) : null;
      var out = {};
      for (var key in rec) if (Object.prototype.hasOwnProperty.call(rec, key)) out[key] = rec[key];
      if (byClient) out.dismissals = id && byClient[id] ? byClient[id] : [];
      var latest = rec.checkIn && rec.checkIn.latest;
      if (reviews && latest && latest.weekOf && id) {
        var wk = reviews[latest.weekOf];
        var review = wk && typeof wk === "object" ? wk[id] : null;
        var nl = {};
        for (var lk in latest) if (Object.prototype.hasOwnProperty.call(latest, lk)) nl[lk] = latest[lk];
        nl.reviewed = checkinReviewed(review, latest);
        var ci = {};
        for (var ck in rec.checkIn) if (Object.prototype.hasOwnProperty.call(rec.checkIn, ck)) ci[ck] = rec.checkIn[ck];
        ci.latest = nl;
        out.checkIn = ci;
      }
      return out;
    });
  }

  // What a surface posts to /api/ai/notify for the hourly push: the engine's inputs, and nothing a
  // coach page only shows (intake rows, notes, check-in text, recent logs, the care team's names).
  // `userId` is the id the route scope-checks (is_coach_on_client) and the alert opens.
  var SNAPSHOT_KEYS = ["profile", "progressRead", "onboarding", "screening", "trainingAdherence", "foodLogs",
    "shapeScoreHistory", "weighIns", "streaks", "lastContact", "checkIn", "nutrition", "goal", "goals", "goalPhase",
    "program", "programs", "recovery", "vitals", "replyWait", "bookedSessions", "pros", "dismissals",
    // A client's break (pauseOf): without it the push read every client on a break as present and sent
    // their absence alerts all through it (Codex on #2705).
    "pause",
    // The trainer alerts (PR 1): the push reads them as the website does.
    "assignedWorkouts", "trainingLoad", "activity", "lastFromClient", "scoreRead", "logsRead", "glp1"];
  function engineSnapshot(rec) {
    if (!rec || typeof rec !== "object") return null;
    var out = {};
    for (var i = 0; i < SNAPSHOT_KEYS.length; i++) {
      var k = SNAPSHOT_KEYS[i];
      if (rec[k] !== undefined) out[k] = rec[k];
    }
    var pay = rec.payments;
    if (pay && typeof pay === "object") {
      out.payments = { status: pay.status || null, paymentRetrying: pay.paymentRetrying === true, joinedAt: pay.joinedAt || null,
        cancelAtPeriodEnd: pay.cancelAtPeriodEnd === true, periodEndsAt: pay.periodEndsAt || null };
    }
    var id = rec.profile && rec.profile.id != null ? String(rec.profile.id) : null;
    if (id) out.userId = id;
    return out;
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
  //   net         each client's price less the fee their own row stores (`rosterNetCents`)
  //   thisMonth   net accrued month-to-date
  //   balance     the settled part: accrued up to the 7-day holding period
  //   lifetime    net × the months since the LONGEST-TENURED client joined
  // ⚠ THE PREVIEW'S PLATFORM FEE HAS ONE DEFINITION, AND IT HAD TO, because this file
  // applies it in several places — the current month (`demoPayouts`), every past month
  // (`demoPayoutHistory`), the KPI strip and the fee the roster's marketplace clients store.
  // Two copies of a rate is the disagreement this whole block was written to remove, one
  // layer down: change one and the history stops reconciling with the month beside it,
  // silently, on a page whose entire point is that its figures agree. Every net now goes
  // through `rosterNetCents` below; `dashBusiness.jsx` still reads the rate for the walk's
  // one-time purchases, pinned by a guard in tests/demo-coherence.test.mjs.
  var PREVIEW_NET_RATE = 0.85;   // after the 15% platform fee

  // ⚠ ONE NET FOR THE WHOLE PREVIEW, FROM EACH CLIENT'S OWN FEE (the sweep after #2394 round 10).
  // Today netted the roster at a flat 15% ($1,547 a month) while Business's origin list and its
  // Plan ("Brought by you", 50%) said half the clients were brought at 0%, and Business's Money
  // row, Plan sentence and 13-week header quoted a third figure from a walk of its own ($1,585).
  // One practice, three nets. A client's net is their price less the fee their row stores (0%
  // for one the coach brought, 15% for one who found them on Shape: coach-roster.ts sends it as
  // `feeCents`); a row that stores none falls back to the published rate, as coach-trajectory.mjs
  // does for a subscription with no `fee_bps`. Today's card, the KPI strip, the sidebar card, the
  // payout history and Business's trajectory all read this, so they state one net.
  // An unreadable row (`mrrCents` null) is left out, never counted as a measured $0 (kpiNum).
  function rowNetCents(c) {
    var pay = c && c.payments;
    var mrr = pay ? kpiNum(pay.mrrCents) : null;
    if (mrr == null) return null;
    var fee = kpiNum(pay.feeCents);
    return fee != null ? mrr - fee : Math.round(mrr * PREVIEW_NET_RATE);
  }
  function rosterNetCents(clients) {
    var rows = Array.isArray(clients) ? clients : [];
    var net = 0;
    for (var i = 0; i < rows.length; i++) {
      var v = rowNetCents(rows[i]);
      if (v != null) net += v;
    }
    return net;
  }

  function demoPayouts(clients, now) {
    const at = now instanceof Date ? now : new Date();
    const rows = Array.isArray(clients) ? clients : [];
    const monthlyCents = rows.reduce((sum, c) => sum + ((c && c.payments && c.payments.mrrCents) || 0), 0);
    const netCents = rosterNetCents(rows);

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

  // ── The KPI pool the two Today stat strips choose from (review 2026-09-09, R15) ──
  //
  // ⚠ EVERY METRIC RESOLVES FROM DATA THE PAGE ALREADY HAS. The strips are fed by the
  // dashboard payload, the roster, the triage feed, the programming queue and today's
  // schedule — all of which Today holds before any of this runs. A metric that needed a
  // new request would be a figure nobody on that screen had measured, and asking the
  // server for it would make the picker a data-fetch feature rather than a choice.
  //
  // ⚠ AND A METRIC THAT CANNOT BE ANSWERED SAYS SO RATHER THAN RESOLVING TO ZERO. Each
  // entry returns `{ value, unit, sub, why }`; a null `value` carries a `why` and the
  // strip renders an em-dash under it. That is the honest-data rule the strips already
  // follow for `renewals` and `avgCompliance`, applied to a list a coach can extend.
  //
  // The RAW value is returned, never a formatted string: `dashMoney` and the strip's own
  // typography live in dashToday.jsx, and a pure module that formatted money would have
  // to own a currency it knows nothing about.
  function kpiNum(v) {
    // ⚠ `Number(null)` IS 0 AND FINITE, so `isFinite` alone cannot tell an absent figure
    // from a measured zero — the class this file post-mortems on the Wall's helpers and
    // on the booking slots. A measured 0 is a value; null, "" and a boolean are not.
    // ⚠ AND AN OBJECT IS NOT A FIGURE, which `isFinite` cannot see either: `Number([])`
    // is **0 and finite** and `Number([5])` is 5, so an array reaches every metric below as
    // a confident reading. Found by the vector list in the compliance guard rather than by
    // reading — the same trap as `Number(null)`, one type over. (CodeRabbit, #2046.)
    if (v == null || v === "" || typeof v === "boolean" || typeof v === "object") return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function kpiLive(ctx) { return (ctx && ctx.live) || null; }
  function kpiRows(ctx) { return (ctx && Array.isArray(ctx.clients)) ? ctx.clients : []; }

  // The payload's own key differs by role (sessions vs consults), so the CALLER hands the
  // resolution the names — Today already holds them on its role config.
  function kpiPayload(ctx, which) {
    var live = kpiLive(ctx);
    if (!live || !live.kpis) return null;
    var keys = (ctx && ctx.kpiKeys) || {};
    var k = keys[which];
    return k ? kpiNum(live.kpis[k]) : null;
  }

  var LIVE_ONLY = "live only";
  // ⚠ A LIVE FIGURE THE DASHBOARD ROUTE SENT AS NULL IS A READ THAT FAILED (the dashboards after
  // #2395): the routes send today's clients and net as null, never 0, when the subscriptions couldn't
  // be read, and the strip says so under its dash rather than leaving it bare.
  var UNREAD = "couldn't be read";
  // A session count the route sent as null: a failed sessions read on a live page (Codex on #2639), so
  // "couldn't be read"; with no live feed at all, the preview, it is "live only" as before.
  function kpiPayloadWhy(ctx) {
    var live = kpiLive(ctx);
    return live && live.kpis ? UNREAD : LIVE_ONLY;
  }

  var DASH_KPI_METRICS = {
    activeClients: {
      trainer: "Active clients", nutritionist: "Active clients",
      resolve: function (ctx) {
        var live = kpiLive(ctx);
        if (live && live.kpis) {
          var n = kpiNum(live.kpis.activeClients);
          return n == null ? { value: null, unit: "count", why: UNREAD } : { value: n, unit: "count" };
        }
        // The preview's roster IS its active list — buildMockClients emits only current
        // clients — so the demo answer is a fact about what is on the screen.
        return { value: kpiRows(ctx).length, unit: "count" };
      },
    },
    monthlyNet: {
      trainer: "Monthly (net)", nutritionist: "Monthly (net)",
      resolve: function (ctx) {
        var live = kpiLive(ctx);
        if (live && live.kpis) {
          var net = kpiNum(live.kpis.monthlyNetCents);
          return net == null ? { value: null, unit: "money", why: UNREAD } : { value: net, unit: "money", sub: "after the platform fee" };
        }
        var gross = kpiMrr(ctx);
        if (gross.value == null) return { value: null, unit: "money", why: gross.why };
        // Each row after its own stored fee, the net Today's card and Business state (rosterNetCents).
        return { value: rosterNetCents(kpiRows(ctx)), unit: "money", sub: "after the platform fee" };
      },
    },
    weekSessions: {
      trainer: "Sessions this week", nutritionist: "Consults this week",
      resolve: function (ctx) {
        var v = kpiPayload(ctx, "week");
        return v == null ? { value: null, unit: "count", why: kpiPayloadWhy(ctx) } : { value: v, unit: "count" };
      },
    },
    upcoming: {
      trainer: "Upcoming sessions", nutritionist: "Upcoming consults",
      resolve: function (ctx) {
        var v = kpiPayload(ctx, "upcoming");
        return v == null ? { value: null, unit: "count", why: kpiPayloadWhy(ctx) } : { value: v, unit: "count" };
      },
    },
    totalSessions: {
      trainer: "Sessions logged", nutritionist: "Consults logged",
      resolve: function (ctx) {
        var v = kpiPayload(ctx, "total");
        if (v == null) return { value: null, unit: "count", why: kpiPayloadWhy(ctx) };
        // ⚠ NOT LABELLED "ALL TIME". The route reads a capped window and reports whether
        // it bit (`totalCapped`), so past the cap this count is a FLOOR — which is why
        // the capped-read fix had to land before this metric could exist at all.
        var live = kpiLive(ctx);
        var capped = !!(live && live.kpis && live.kpis.totalCapped);
        return { value: v, unit: "count", capped: capped, sub: capped ? "at least — the window is capped" : null };
      },
    },
    todaySessions: {
      trainer: "Sessions today", nutritionist: "Consults today",
      resolve: function (ctx) {
        // A day feed that failed is not "0 · all done" (the page's own read flag, never inferred).
        if (ctx && ctx.scheduleRead === false) return { value: null, unit: "count", why: UNREAD };
        var rows = (ctx && Array.isArray(ctx.schedule)) ? ctx.schedule : [];
        // The empty-schedule row carries "—" as its time; it is a placeholder, not a session.
        var real = rows.filter(function (s) { return s && s.time && s.time !== "—"; });
        var next = real.filter(function (s) { return s.status === "NEXT" || s.status === "PENDING"; })[0];
        return { value: real.length, unit: "count", sub: next ? "next " + next.time : "all done" };
      },
    },
    due: {
      trainer: "Programs due", nutritionist: "Plans due",
      resolve: function (ctx) {
        var q = (ctx && Array.isArray(ctx.queue)) ? ctx.queue : [];
        var ready = q.filter(function (r) { return r && r.state === "ready"; }).length;
        return { value: q.length, unit: "count", sub: ready + " ready" };
      },
    },
    compliance: {
      trainer: "Roster compliance", nutritionist: "Roster compliance",
      resolve: function (ctx) {
        // ⚠ A NON-NULL VALUE IS NOT A COUNT OF DAYS. `!= null` admits a string, a boolean
        // and a negative, and `Math.min` passes each straight through: "abc" makes the whole
        // percentage NaN, true counts as one day, and -3 subtracts from the roster's total.
        // The window is seven days, so the only readings this can mean are the integers 0..7
        // — anything else is a row we could not read, which is what `why` is for.
        // (CodeRabbit, #2046; the same class as `Number(null)` being 0 and finite.)
        var withLogs = kpiRows(ctx).filter(function (c) {
          if (!c || !c.foodLogs) return false;
          var d = kpiNum(c.foodLogs.daysLogged7d);
          return d != null && d >= 0 && d <= 7 && Math.floor(d) === d;
        });
        if (!withLogs.length) return { value: null, unit: "pct", why: "no shared logs yet" };
        var days = withLogs.reduce(function (s, c) { return s + kpiNum(c.foodLogs.daysLogged7d); }, 0);
        // The nutritionist's copy names WHAT was logged, which is the wording that strip
        // has always carried on that role.
        var what = (ctx && ctx.role) === "nutritionist" ? "food logs" : "logged";
        return { value: Math.round((days / (withLogs.length * 7)) * 100), unit: "pct", sub: what + " · 7d" };
      },
    },
    mrr: {
      trainer: "Monthly recurring", nutritionist: "Monthly recurring",
      resolve: function (ctx) { return kpiMrr(ctx); },
    },
    reviewed: {
      trainer: "Check-ins reviewed", nutritionist: "Check-ins reviewed",
      resolve: function (ctx) {
        // The window a check-in is still a to-do in (ruleCheckinWaiting): this week's or last week's,
        // each client's latest. Only a review state that was READ counts: `reviewed` is null when the
        // coach's reviews could not be read, and that check-in is neither reviewed nor waiting.
        // ⚠ THE ACCOUNT'S WEEK, NOT THE DEVICE'S: Sunday night in New York is already Monday on a
        // laptop in London, which would drop last week's check-ins a day early.
        var now = dayInZone((ctx && ctx.now instanceof Date) ? ctx.now : new Date(), ctx && ctx.zone);
        var total = 0, done = 0, unread = 0;
        kpiRows(ctx).forEach(function (c) {
          // ⚠ AN UNREAD OVERVIEW IS NOT "NO CHECK-IN" (#2628 review): while a client's overview loads,
          // or after it failed, the row holds no checkIn at all; skipping it said "no check-ins" or
          // shrank the count. Like progressStatus, only a read overview is evidence.
          var meta = c && c.progressRead;
          if (meta && meta.state !== "ready") { unread += 1; return; }
          var ci = c && c.checkIn;
          var latest = ci && ci.latest;
          var weekOf = latest && typeof latest.weekOf === "string" ? latest.weekOf : ci && typeof ci.lastWeekOf === "string" ? ci.lastWeekOf : null;
          var wk = weekOf ? toDate(weekOf) : null;
          if (!wk) return;
          var age = daysBetween(mondayOf(wk), mondayOf(now));
          if (age < 0 || age > 7) return;
          if (latest && latest.reviewed === true) { total += 1; done += 1; }
          else if (latest && latest.reviewed === false) total += 1;
          else unread += 1;
        });
        // The preview reads no reviews at all, so its check-ins are "live only", not a failed read.
        if (!total) return { value: null, unit: "count", why: unread ? (kpiLive(ctx) ? UNREAD : LIVE_ONLY) : "no check-ins in the last two weeks" };
        return { value: done, unit: "count", sub: "of " + total + " · this week and last" + (unread ? " · " + unread + " not read yet" : "") };
      },
    },
    needsEyes: {
      trainer: "Needs eyes", nutritionist: "Needs eyes",
      resolve: function (ctx) {
        var feed = (ctx && Array.isArray(ctx.triage)) ? ctx.triage : null;
        if (!feed) return { value: null, unit: "count", why: "the pulse could not be read" };
        var flagged = feed.filter(function (r) { return r && (r.severity === "red" || r.severity === "amber"); }).length;
        return { value: flagged, unit: "count", sub: "of " + feed.length + " on the pulse" };
      },
    },
    newClients: {
      trainer: "New clients", nutritionist: "New clients",
      resolve: function (ctx) {
        var rows = kpiRows(ctx);
        var fresh = rows.filter(function (c) { return c && c.profile && c.profile.isNew; }).length;
        // ⚠ 14 DAYS, BECAUSE THAT IS WHAT `isNew` MEANS. coach-roster.ts sets it from the
        // earliest subscription against a 14-day window, so any other span in this label
        // would describe a measurement nobody took.
        return { value: fresh, unit: "count", sub: "joined in the last 14d" };
      },
    },
  };

  // ⚠ MRR IS SHARED BY TWO METRICS, so it is one function: `monthlyNet` is this figure
  // after the fee, and two spellings of one sum is the disagreement the payouts round
  // was about.
  //
  // ⚠ AND AN UNREADABLE ROW IS COUNTED RATHER THAN COERCED. `mrrCents` is null when the
  // subscriptions read failed for that client, and `|| 0` would quietly under-report the
  // practice with nothing on screen saying so — so the sub names how many rows answered.
  function kpiMrr(ctx) {
    var rows = kpiRows(ctx);
    if (!rows.length) return { value: null, unit: "money", why: "no clients yet" };
    var known = 0, cents = 0;
    for (var i = 0; i < rows.length; i++) {
      var c = rows[i];
      var v = c && c.payments ? kpiNum(c.payments.mrrCents) : null;
      if (v == null) continue;
      known += 1; cents += v;
    }
    if (!known) return { value: null, unit: "money", why: "not shared" };
    var all = known === rows.length;
    return {
      value: cents,
      unit: "money",
      sub: all
        ? rows.length + " client" + (rows.length === 1 ? "" : "s")
        : known + " of " + rows.length + " shared",
    };
  }

  // The metric keys, in the order the picker lists them.
  var DASH_KPI_KEYS = Object.keys(DASH_KPI_METRICS);

  function dashKpiLabel(key, role) {
    var m = DASH_KPI_METRICS[key];
    if (!m) return null;
    return m[role] || m.trainer;
  }

  // Resolve one metric. A key this build does not recognise yields null rather than
  // throwing — there is no error boundary anywhere in public/newdesign, so a strip that
  // throws on a stale stored key takes the whole page to blank.
  function dashKpiValue(key, ctx) {
    var m = DASH_KPI_METRICS[key];
    if (!m) return null;
    try {
      var out = m.resolve(ctx || {});
      return out && typeof out === "object" ? out : null;
    } catch (e) {
      return { value: null, unit: "count", why: "could not be read" };
    }
  }

  // ⚠ CHOOSING A METRIC THAT IS ALREADY IN ANOTHER SLOT SWAPS THE TWO, rather than
  // duplicating it or refusing. Filtering each slot's options to what is unused would
  // mean a coach could not move a metric from slot 4 to slot 1 without first clearing
  // slot 1 — two steps for one intent — and allowing the duplicate would print the same
  // figure twice in a four-wide row. A swap is one tap, never duplicates, and never
  // loses the metric that was there.
  function dashKpiPick(current, slot, key) {
    var next = (Array.isArray(current) ? current : []).slice();
    if (!(slot >= 0 && slot < next.length)) return next;
    if (next[slot] === key) return next;
    var at = next.indexOf(key);
    if (at >= 0) next[at] = next[slot];
    next[slot] = key;
    return next;
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
      const joined = [];
      for (const c of rows) {
        const pay = c && c.payments;
        if (!pay || !pay.joinedAt) continue;
        const j = new Date(String(pay.joinedAt).length === 10 ? pay.joinedAt + "T00:00:00" : pay.joinedAt);
        const t = j.getTime();
        if (!isFinite(t) || t > endMs) continue;
        monthlyCents += pay.mrrCents || 0;
        joined.push(c);
      }
      if (monthlyCents <= 0) continue;          // nobody had joined yet — no payout ran
      out.push({
        id: "demo-po-" + i,
        // the month's clients, each after their own fee (rosterNetCents), as the current month is
        amountCents: rosterNetCents(joined),
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

  // ── Optional Today widgets (review 2026-09-21) ────────────────────────────
  // Everything a coach can ADD to Today from the widget catalogue derives from state
  // the page already holds — the calendar, the triage feed and the roster records.
  // Nothing here is fetched, which is the same constraint that decides what may be in
  // the KPI pool above: a widget that needed a request would be a figure nobody on
  // that screen had measured. Each derivation counts what it could NOT read, so a
  // card can say "3 of 8 shared" instead of publishing a total over the rows that
  // happened to answer.

  var DASH_DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Whole calendar days between two instants, on the LOCAL calendar.
  // ⚠ NOT `(b − a) / DAY`: a local day is 23 or 25 hours twice a year, so a millisecond
  // quotient over a span that crosses a spring-forward and NOT its matching fall-back
  // (a one-month or three-month mark straddling March) comes up an hour short, floors
  // a day low, and the anniversary lands a day late. A whole year contains both
  // transitions and is exact by accident — which is why a year-old join date is the
  // WRONG fixture to prove this with. Mapping each local Y/M/D onto Date.UTC gives an
  // ordinal in which every day is 24 hours by construction — the same fix the progress
  // page's calendar window and the Kitchen's day seed already carry.
  function calDays(a, b) {
    return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY);
  }
  function localMidnight(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  // `setDate` rather than `+ n * DAY`, for the same reason as calDays.
  function plusDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function recName(c) { return c && c.profile && c.profile.name ? String(c.profile.name) : "Client"; }
  function recId(c) { return c && c.profile && c.profile.id != null ? c.profile.id : null; }

  // The next `days` local days of a calendar, one bucket each, starting today.
  // events: [{ date: 'YYYY-MM-DD', time: 'HH:MM', kind, title }] — the shape both the
  // live calendar (dashCalDate / dashCalTime) and the demo calendar already carry.
  // An entry outside the window is simply not in it; one with no readable date is
  // COUNTED as skipped rather than silently dropped, so the card can say so.
  function dashWeekAhead(events, now, days) {
    now = now || new Date();
    days = days > 0 ? days : 7;
    var start = localMidnight(now);
    var buckets = [], byDate = {};
    for (var i = 0; i < days; i++) {
      var d = plusDays(start, i);
      var b = { date: iso(d), dow: DASH_DOW[d.getDay()], day: d.getDate(), count: 0, first: null, today: i === 0, bookedMin: 0 };
      buckets.push(b); byDate[b.date] = b;
    }
    var total = 0, skipped = 0;
    (Array.isArray(events) ? events : []).forEach(function (e) {
      if (!e || typeof e.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) { skipped += 1; return; }
      var bucket = byDate[e.date];
      if (!bucket) return;
      bucket.count += 1; total += 1;
      if (!e.sharedCoach && ["SESSION", "CONSULT", "TRAINING", "NUTRITION"].indexOf(String(e.kind).toUpperCase()) >= 0) {
        var duration = kpiNum(e.durationMin);
        bucket.bookedMin = bucket.bookedMin == null || duration == null || duration <= 0 ? null : bucket.bookedMin + duration;
      }
      var t = typeof e.time === "string" && /^\d{2}:\d{2}$/.test(e.time) ? e.time : null;
      if (t && (bucket.first == null || t < bucket.first)) bucket.first = t;
    });
    var busiest = null;
    buckets.forEach(function (b2) { if (b2.count > 0 && (!busiest || b2.count > busiest.count)) busiest = b2; });
    return { days: buckets, total: total, skipped: skipped, busiest: busiest };
  }

  // The roster by triage state — the counts behind the pulse's own ordering, so the
  // card and the pulse can never disagree about who is red. feed: getTriageFeed()'s
  // rows. A feed that could not be built is null, and so is the answer.
  var DASH_STATUS_BUCKETS = ["red", "amber", "green", "unknown"];
  function dashRosterStatus(feed) {
    if (!Array.isArray(feed)) return null;
    var out = { red: [], amber: [], green: [], unknown: [], fresh: 0, total: feed.length };
    feed.forEach(function (r) {
      var sev = r && r.severity;
      var bucket = DASH_STATUS_BUCKETS.indexOf(sev) >= 0 ? sev : "unknown";
      out[bucket].push(recName(r && r.client));
      if (r && r.client && r.client.profile && r.client.profile.isNew) out.fresh += 1;
    });
    return out;
  }

  // The biggest week-over-week Shape Score moves, from the ONE reading the roster cell,
  // the drawer and ruleScoreDrop already share — so the mover this names is the delta
  // the roster shows. `known` counts the clients with two complete weeks; the rest are
  // not "no movement", they are unread, and the card says so.
  function dashTopMovers(clients, n) {
    n = n > 0 ? n : 3;
    var rows = Array.isArray(clients) ? clients : [];
    var known = [];
    rows.forEach(function (c) {
      var r = c ? scoreWeekReading(c.shapeScoreHistory) : null;
      if (!r || r.delta == null) return;
      var complete = c.shapeScoreHistory.filter(function(w) { return w && !w.partial && w.points != null && isFinite(Number(w.points)); });
      known.push({ id: recId(c), name: recName(c), delta: r.delta, points: r.points, partial: r.partial, weekOf: r.weekOf,
        compareFrom: complete.length >= 2 ? complete[complete.length-2].weekOf : null,
        compareTo: complete.length >= 1 ? complete[complete.length-1].weekOf : null });
    });
    var byGain = function (a, b) { return b.delta - a.delta || a.name.localeCompare(b.name); };
    var byLoss = function (a, b) { return a.delta - b.delta || a.name.localeCompare(b.name); };
    return {
      up: known.filter(function (k) { return k.delta > 0; }).sort(byGain).slice(0, n),
      down: known.filter(function (k) { return k.delta < 0; }).sort(byLoss).slice(0, n),
      known: known.length,
      total: rows.length,
    };
  }

  // Tenure marks worth a word, in days on Shape.
  var DASH_TENURE_MARKS = [
    { days: 30, label: "1 month" }, { days: 90, label: "3 months" }, { days: 180, label: "6 months" },
    { days: 365, label: "1 year" }, { days: 730, label: "2 years" }, { days: 1095, label: "3 years" },
    { days: 1460, label: "4 years" }, { days: 1825, label: "5 years" },
  ];
  // Clients reaching their NEXT tenure mark within `horizon` days (today included),
  // from the earliest subscription the roster route already reports
  // (`payments.joinedAt`, R10). `unknown` counts rows whose start date could not be
  // read — a start date in the future is one of them, because a negative tenure is not
  // a tenure. `later` is the nearest mark past the horizon, so an empty list can still
  // say when the next one is.
  function dashTenureMilestones(clients, now, horizon) {
    now = now || new Date();
    horizon = horizon >= 0 ? horizon : 30;
    var today = localMidnight(now);
    var rows = Array.isArray(clients) ? clients : [];
    var soon = [], later = null, unknown = 0, beyond = 0;
    rows.forEach(function (c) {
      var at = c && c.payments ? c.payments.joinedAt : null;
      // ⚠ A FALSY START DATE IS NOT A DATE, and `toDate` alone cannot see that: `0` is
      // falsy AND parseable — `new Date(0)` is 1970, a valid instant fifty-six years
      // ago — so a zero join date read as a client past every mark rather than as one
      // whose start we do not know. The same trap the demo payout history walked into
      // with `joinedAt: 0`, closed here by the test that found it.
      var joined = at ? toDate(at) : null;
      if (!joined) { unknown += 1; return; }
      var tenure = calDays(joined, today);
      if (tenure < 0) { unknown += 1; return; }
      var next = null;
      for (var i = 0; i < DASH_TENURE_MARKS.length; i++) {
        if (DASH_TENURE_MARKS[i].days >= tenure) { next = DASH_TENURE_MARKS[i]; break; }
      }
      if (!next) { beyond += 1; return; }   // past the last mark — nothing left to announce
      var inDays = next.days - tenure;
      var hit = { id: recId(c), name: recName(c), label: next.label, inDays: inDays, on: iso(plusDays(today, inDays)) };
      if (inDays <= horizon) soon.push(hit);
      else if (!later || inDays < later.inDays) later = hit;
    });
    soon.sort(function (a, b) { return a.inDays - b.inDays || a.name.localeCompare(b.name); });
    return { soon: soon, later: later, unknown: unknown, beyond: beyond, total: rows.length };
  }

  // Whose current block ends within `weeks` weeks — the cue to write the next one
  // BEFORE the last session, not after it. Reads the caller's own assignment
  // (record.program: { name, week, weeks, paused }, capped at the template length by
  // the legs). `left` is the number of whole weeks after this one: week 12 of 12 is the
  // last week (0 left). A client with no block, or a block with no length, is COUNTED
  // as unknown rather than dropped, and a paused block is neither ending nor mid-way.
  // `role` is the page's: its own role's program (programForRole).
  function dashProgramsEnding(clients, weeks, role) {
    weeks = weeks >= 0 ? weeks : 3;
    var rows = Array.isArray(clients) ? clients : [];
    var soon = [], later = 0, paused = 0, unknown = 0;
    rows.forEach(function (c) {
      var p = programForRole(c, role);
      var wk = p ? kpiNum(p.week) : null, total = p ? kpiNum(p.weeks) : null;
      if (p && (p.paused || p.status === "paused")) { paused += 1; return; }
      if (!p || wk == null || total == null || total <= 0 || wk <= 0) { unknown += 1; return; }
      if (p.paused) { paused += 1; return; }
      var left = Math.max(0, total - wk);
      if (left <= weeks) soon.push({ id: recId(c), name: recName(c), program: p.name ? String(p.name) : null, week: wk, weeks: total, left: left, overdue: !!p.overdue, endDate: p.estimatedEndAt ? String(p.estimatedEndAt).slice(0,10) : null, nextAssigned: p.nextAssigned || null });
      else later += 1;
    });
    soon.sort(function (a, b) { return a.left - b.left || a.name.localeCompare(b.name); });
    return { soon: soon, later: later, paused: paused, unknown: unknown, total: rows.length, weeks: weeks };
  }

  // Who pays what per month, from the subscription rows the roster route sums per
  // client. An unreadable row (`mrrCents` null — that client's read FAILED) is COUNTED,
  // never coerced to $0: "3 of 8 shared" is a true sentence and "$0" is not. A measured
  // 0 is a real answer and sorts last among the known.
  function dashRevenueByClient(clients, n) {
    n = n > 0 ? n : 5;
    var rows = Array.isArray(clients) ? clients : [];
    var known = [], unknown = 0, sum = 0;
    rows.forEach(function (c) {
      var v = c && c.payments ? kpiNum(c.payments.mrrCents) : null;
      if (v == null || v < 0) { unknown += 1; return; }
      known.push({ id: recId(c), name: recName(c), cents: v, feeCents: kpiNum(c.payments.feeCents) });
      sum += v;
    });
    known.sort(function (a, b) { return b.cents - a.cents || a.name.localeCompare(b.name); });
    return {
      rows: known.slice(0, n).map(function (k) { return { id: k.id, name: k.name, cents: k.cents, feeCents: k.feeCents, share: sum > 0 ? k.cents / sum : 0 }; }),
      allRows: known.map(function (k) { return { id: k.id, name: k.name, cents: k.cents, feeCents: k.feeCents, share: sum > 0 ? k.cents / sum : 0 }; }),
      known: known.length,
      unknown: unknown,
      total: rows.length,
      sumCents: sum,
    };
  }

  // ── Superset labels ────────────────────────────────────────────────────────
  // The superset KEY, under the same rule as ShapeWorkoutDocument.supersetKey:
  // a string is trimmed and upper-cased (a key is a letter label — whitespace
  // and case carry no meaning), a finite number is its digits, anything else is
  // no key. ⚠ RESTATED RATHER THAN SHARED, because the member's pages load this
  // module without that one; tests/coach-superset-labels.test.mjs drives both
  // over one vector set and holds them equal, so a divergence fails there.
  function groupKey(value) {
    if (typeof value === "string") return value.trim().toUpperCase();
    return typeof value === "number" && isFinite(value) ? String(value) : "";
  }

  // Rows sharing a group key read A1/A2/… in list order; everything else is
  // numbered. ⚠ NOT "ADJACENT" — the header comment this replaced said so and no
  // code ever checked it. `[A, plain, A]` labels `A1 / 01 / A2`, and that is
  // CORRECT rather than lax: the session player finds a move's partner by a
  // circular search over the whole list (`bsNextSessionMove`), so a coach who
  // splits a pair around a plain move still gets them alternated. Enforcing
  // adjacency here would label a pair the player does run as two groups.
  //
  // Takes a FLAT ordered list of `{ group }` — a builder day's rows, or an
  // assigned workout's `exercises` — so the coach's editor, the coach's preview
  // and the member's own card all answer from one rule.
  //
  // ⚠ A GROUP KEY AND A DISPLAY LABEL ARE TWO DIFFERENT THINGS, and carrying
  // them in one field is what was wrong. The mobile session player decides a
  // superset by comparing the stored KEYS (`bsSameGroup`, workoutSession.mjs),
  // and only then is rest 0 and the pair alternated — so storing "A1"/"A2"
  // would make the two unequal and restore full rest between them. The key
  // stays the raw letter; the label is DERIVED here, at render.
  //
  // ⚠ AND IT IS DERIVED RATHER THAN STORED for a second reason: a stored label
  // is wrong the moment a row is reordered, and it would have to survive
  // `normalizeWorkoutDetail` and the assignment snapshot. Position is the only
  // thing a label depends on, and the ordered list already carries it.
  //
  // ⚠ THIS LIVES HERE, NOT IN `dashBuilderCore.js`, because the member surfaces
  // need it and the Client* pages that render a workout card do not load that
  // module at all. `public/newdesign` has no error boundary, so a bare global
  // that is not there is a blank page, not a missing label.
  function groupLabels(items) {
    // ⚠ A PROTOTYPE-FREE MAP, because the key is typed by a coach. With `{}`,
    // a group named `__proto__` read `counters.__proto__` (an object) and both
    // halves of the pair came out as `"__proto__[object Object]"` — identical, so
    // the pair lost its ordinal too; `constructor` rendered the native function
    // source. This now reaches a member's card, not just the builder.
    var counters = Object.create(null), plain = 0, out = [];
    for (var i = 0; i < (items || []).length; i++) {
      var g = groupKey(items[i] && items[i].group);
      if (g) { counters[g] = (counters[g] || 0) + 1; out.push(g + counters[g]); }
      else { plain += 1; out.push(String(plain).length < 2 ? "0" + plain : String(plain)); }
    }
    return out;
  }

  // The exercise list a workout card renders, from an assigned workout's own
  // `exercises`. ⚠ THIS WAS WRITTEN TWICE — byte-identical in `dashTrain.jsx` and
  // `dashClient.jsx` — which is how one of them could have kept the raw group as
  // its prefix while the other derived a label, and a member would have seen a
  // different numbering on Today than on Train. One rule, driven by its own test.
  // The coach's blocks, named as the member reads them. The kinds are the builder's own
  // (workoutDocument.js BLOCK_KINDS), repeated here because the member's pages load this
  // file without that one; tests/builder-fixes-client.test.mjs holds the two lists equal.
  var CARD_BLOCKS = { warmup: "Warm-up", main: "Main", accessory: "Accessory", finisher: "Finisher" };
  function cardBlockKind(value) {
    var key = typeof value === "string" ? value.trim().toLowerCase() : "";
    return Object.prototype.hasOwnProperty.call(CARD_BLOCKS, key) ? key : "";
  }
  function workoutCardExercises(exercises) {
    var list = exercises || [];
    var labels = groupLabels(list);
    // ⚠ A HEADING WHERE THE COACH'S BLOCK CHANGES, AND NONE WHEN THE COACH NAMED NONE.
    // The same rule as the app's preview (bsMoveBlocks): runs of one kind in the order the
    // moves arrive, a move with no kind staying with the run before it, and a day where no
    // move names a block read as one plain list. Owner, 2026-10-07: "Apply all the fixes".
    // (A day where no move names a block needs no case of its own: every kind is "", and
    // a heading needs one.)
    var kinds = list.map(function (e) { return cardBlockKind(e && e.block); });
    var run = "";
    return list.map(function (e, i) {
      e = e || {};
      var kind = kinds[i] || run;
      var blockLabel = kind && kind !== run ? CARD_BLOCKS[kind] : null;
      run = kind;
      return {
        prefix: labels[i],
        blockLabel: blockLabel,
        name: e.name,
        scheme: [[e.sets, e.reps].filter(Boolean).join(" × "), e.tempo ? e.tempo + " tempo" : null, e.rest].filter(Boolean).join(" · "),
        load: e.load || "",
        cue: e.cue || "",
        video: e.video || null,
      };
    });
  }
  return {
    CARD_BLOCKS: CARD_BLOCKS,
    THRESHOLDS: THRESHOLDS,
    DEFAULT_THRESHOLDS: DEFAULT_THRESHOLDS,
    workoutCompletion: workoutCompletion,
    TUNABLES: TUNABLES,
    ROLE_DEFAULTS: ROLE_DEFAULTS,
    defaultsForRole: defaultsForRole,
    tunablesFor: tunablesFor,
    resolveThresholds: resolveThresholds,
    MAX_GOALS: MAX_GOALS,
    evaluateClient: evaluateClient,
    buildDirective: buildDirective,
    buildEvidencePack: buildEvidencePack,
    buildCheckinDraft: buildCheckinDraft,
    flagDiscipline: flagDiscipline,
    disciplineOwner: disciplineOwner,
    disciplineForRole: disciplineForRole,
    vitalsWordIndex: vitalsWordIndex,
    buildMilestones: buildMilestones,
    findJointAttention: findJointAttention,
    getTriageFeed: getTriageFeed,
    inZone: inZone,
    pauseOf: pauseOf,
    progressStatus: progressStatus,
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
    rosterNetCents: rosterNetCents,
    pulseOrder: pulseOrder,
    DASH_KPI_METRICS: DASH_KPI_METRICS,
    DASH_KPI_KEYS: DASH_KPI_KEYS,
    dashKpiLabel: dashKpiLabel,
    dashKpiValue: dashKpiValue,
    dashKpiPick: dashKpiPick,
    demoPayouts: demoPayouts,
    demoPayoutHistory: demoPayoutHistory,
    demoPayoutCard: demoPayoutCard,
    dashWeekAhead: dashWeekAhead,
    dashRosterStatus: dashRosterStatus,
    dashTopMovers: dashTopMovers,
    dashTenureMilestones: dashTenureMilestones,
    dashRevenueByClient: dashRevenueByClient,
    dashProgramsEnding: dashProgramsEnding,
    DASH_TENURE_MARKS: DASH_TENURE_MARKS,
    groupKey: groupKey,
    groupLabels: groupLabels,
    workoutCardExercises: workoutCardExercises,
    // P2 — one engine everywhere, plus coach actions.
    COACH_ACTIONS: COACH_ACTIONS,
    COACH_ACTION_KINDS: COACH_ACTION_KINDS,
    DIRECTIVE_PRIORITY: DIRECTIVE_PRIORITY,
    FLAG_DISCIPLINE: FLAG_DISCIPLINE,
    FLAG_AREA: FLAG_AREA,
    flagArea: flagArea,
    CONTEXT_FLAGS: CONTEXT_FLAGS,
    SAFETY_FLAGS: SAFETY_FLAGS,
    goalDiscipline: goalDiscipline,
    coachActionFor: coachActionFor,
    coachLead: coachLead,
    leadVerdict: leadVerdict,
    coachBrief: coachBrief,
    coachNeeds: coachNeeds,
    memberDraft: memberDraft,
    topFlag: topFlag,
    isDismissed: isDismissed,
    checkinReviewed: checkinReviewed,
    checkinLowRatings: checkinLowRatings,
    recordFromOverview: recordFromOverview,
    attachCoachContext: attachCoachContext,
    engineSnapshot: engineSnapshot,
    coCoachFor: coCoachFor,
    _internals: { mondayOf: mondayOf, daysBetween: daysBetween, toDate: toDate, calDays: calDays, wallClock: wallClock },
  };
});
