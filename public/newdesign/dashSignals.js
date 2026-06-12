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
//     goalPhase: string | null,
//     milestones: [{ key, label, hitAt? }] | null,
//     payments:  { mrrCents, status? } | null,
//   }

(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.DashSignals = api;
})(typeof window !== "undefined" ? window : null, function () {
  var DAY = 86400000;

  // Every tunable in one place (roadmap: thresholds are named constants).
  var THRESHOLDS = {
    SCORE_DROP_PTS: 5,        // wk/wk Shape Score drop that flags
    FOOD_GAP_DAYS: 3,         // days without a food log
    CONTACT_GAP_DAYS: 5,      // days without coach↔client contact
    STREAK_MIN_BEST: 3,       // only call a streak "broken" if one existed
    CHECKIN_RED_WEEKS: 2,     // missed weeks that escalate to red on their own
    CHECKIN_GRACE_DAYS: 3,    // don't nag "due this week" before Thu
  };

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

  // ── Rules ──────────────────────────────────────────────────────────────────
  // Each returns a flag { key, reason } or null. `now` is a Date.

  function ruleStreakBroken(c) {
    var s = c.streaks;
    if (!s || s.current == null || s.best == null) return null;
    if (s.current === 0 && s.best >= THRESHOLDS.STREAK_MIN_BEST) {
      return { key: "streak_broken", reason: "Streak broken — was " + s.best + " days" };
    }
    return null;
  }

  function ruleScoreDrop(c) {
    var h = c.shapeScoreHistory;
    if (!Array.isArray(h) || h.length < 2) return null;
    var prev = h[h.length - 2], last = h[h.length - 1];
    if (prev == null || last == null || prev.points == null || last.points == null) return null;
    var drop = prev.points - last.points;
    if (drop >= THRESHOLDS.SCORE_DROP_PTS) {
      return { key: "score_drop", reason: "Shape Score down " + drop + " pts week-over-week" };
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
        return { key: "food_gap", reason: "No food logs in " + gap + " days" };
      }
      return null;
    }
    // Live rollups only expose days-logged-this-week today (no last-logged
    // date) — approximate: a fully empty week flags, anything else skips.
    if (f.daysLogged7d === 0) {
      return { key: "food_gap", reason: "No food logs in the last week" };
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
      return { key: "checkin_overdue", missedWeeks: 99, reason: "Hasn't completed a first check-in" };
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
    return { key: "checkin_overdue", missedWeeks: missedWeeks, reason: label };
  }

  function ruleContactGap(c, now, role) {
    var lc = c.lastContact;
    if (!lc) return null;
    var ts;
    if (role === "trainer") ts = lc.trainer;
    else if (role === "nutritionist") ts = lc.nutritionist;
    else {
      // Client view: most recent contact from ANY of their pros.
      var a = toDate(lc.trainer), b = toDate(lc.nutritionist);
      ts = a && b ? (a > b ? a : b) : (a || b);
    }
    var last = toDate(ts);
    if (!last) return null;
    var gap = daysBetween(last, now);
    if (gap >= THRESHOLDS.CONTACT_GAP_DAYS) {
      return { key: "contact_gap", reason: "No contact in " + gap + " days" };
    }
    return null;
  }

  // ── Evaluation + triage ───────────────────────────────────────────────────

  // evaluateClient(record, now, role) -> { flags, severity }
  // severity: red = 2+ flags, or a check-in missed ≥ CHECKIN_RED_WEEKS weeks;
  //           amber = exactly 1 flag; green = clean.
  function evaluateClient(c, now, role) {
    now = now || new Date();
    var flags = [];
    var f;
    if ((f = ruleStreakBroken(c))) flags.push(f);
    if ((f = ruleScoreDrop(c))) flags.push(f);
    if ((f = ruleFoodGap(c, now))) flags.push(f);
    var ciFlag = ruleCheckinOverdue(c, now);
    if (ciFlag) flags.push(ciFlag);
    if ((f = ruleContactGap(c, now, role))) flags.push(f);

    var severity = "green";
    if (flags.length >= 2) severity = "red";
    else if (ciFlag && ciFlag.missedWeeks >= THRESHOLDS.CHECKIN_RED_WEEKS) severity = "red";
    else if (flags.length === 1) severity = "amber";
    return { flags: flags, severity: severity };
  }

  // getTriageFeed(role, clients, now) -> rows sorted red → amber → green,
  // most-flagged first within a band, name as the stable tiebreak.
  function getTriageFeed(role, clients, now) {
    now = now || new Date();
    var rank = { red: 2, amber: 1, green: 0 };
    return (clients || [])
      .map(function (c) {
        var r = evaluateClient(c, now, role);
        return {
          client: c,
          severity: r.severity,
          flags: r.flags,
          reasons: r.flags.map(function (x) { return x.reason; }),
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
  //   amber: Aisha K. (contact gap), Elena R. (score drop), Deandre K. (food gap)
  //   green: Jordan M., Priya S.
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
        goalPhase: "Build",
        milestones: [
          { key: "m25", label: "25% to goal", hitAt: ago(40) },
          { key: "m50", label: "50% to goal", hitAt: ago(12) },
        ],
        payments: { mrrCents: 18000, status: "active" },
      };
      Object.keys(over || {}).forEach(function (k) { base[k] = over[k]; });
      return base;
    };

    return [
      // green — the picture of health
      person(1, "Jordan M.", {}),
      // red — streak broken AND a 8-pt wk/wk score drop
      person(2, "Marcus T.", {
        streaks: { current: 0, best: 12, lastActiveOn: ago(4) },
        shapeScoreHistory: history([62, 65, 60, 68, 64, 70, 71, 63]),
        goalPhase: "Cut",
      }),
      // amber — gone quiet: no coach contact in 6 days
      person(3, "Aisha K.", {
        lastContact: { trainer: ago(6), nutritionist: ago(6) },
        goalPhase: "Cut",
      }),
      // red — no food logs in 4 days + no contact in 7
      person(4, "Sam R.", {
        foodLogs: { lastLoggedOn: ago(4), daysLogged7d: 2 },
        lastContact: { trainer: ago(7), nutritionist: ago(7) },
        trainingAdherence: { pct: 64, done: 9, planned: 14 },
      }),
      // green
      person(5, "Priya S.", {
        goalPhase: "Cut",
        payments: { mrrCents: 22000, status: "active" },
      }),
      // amber — score slid 7 pts wk/wk, everything else fine
      person(6, "Elena R.", {
        shapeScoreHistory: history([48, 52, 55, 58, 61, 64, 66, 59]),
      }),
      // amber — food logs stopped exactly at the 3-day line
      person(7, "Deandre K.", {
        foodLogs: { lastLoggedOn: ago(3), daysLogged7d: 4 },
      }),
      // red — three weeks without a check-in (red on its own)
      person(8, "Jonah W.", {
        checkIn: { lastWeekOf: mondaysAgo(3) },
        trainingAdherence: { pct: 71, done: 10, planned: 14 },
      }),
    ];
  }

  return {
    THRESHOLDS: THRESHOLDS,
    evaluateClient: evaluateClient,
    getTriageFeed: getTriageFeed,
    buildMockClients: buildMockClients,
    _internals: { mondayOf: mondayOf, daysBetween: daysBetween, toDate: toDate },
  };
});
