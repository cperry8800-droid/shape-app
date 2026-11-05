// The coach's own Goal page, everything that is not React (trainerGoalPage.jsx and
// nutritionistGoalPage.jsx, P4 of the coach-dashboard wiring, 2026-11-05).
//
// PURE module: no React, no DOM, no fetch of its own. Loads as a plain <script> in the browser
// (window.CoachGoals, after dashSignals.js) and through require() in Node (tests/coach-goals.test.mjs).
//
// THE STORE. A coach's goals are one document in user_goals, kind 'trainer' or 'nutritionist':
//   { goals: [goal], momentum: [[value, label, compare]], archived: [goal + { archivedAt, final }], rev }
// A goal is { id, t, cur, tgt, sub, money, pct, metric } as it always was, and may now also carry
//   start      the figure it started from (a number)
//   startDate  the day it started ('YYYY-MM-DD')
//   due        the day it is due ('YYYY-MM-DD')
//   history    a typed goal's own readings, [{ on, value }]: each day the coach changed CURRENT
// Every one is optional: a goal saved before them reads as it did, with a pace and no due date.
//
// ⚠ EVERY WRITE IS COMPARE-AND-SET (writeGoalsDoc). The page saved the whole document blindly, so a
// second tab's save put back what the first had changed. With an archive in the document that would
// lose archived goals, so a write now reads the document, applies its change to what it read, and
// saves only if no one wrote in between (user_goals' saveUserGoalsIfRev, as mealDays.mjs writes);
// otherwise it reads again and re-applies the change.
//
// THE PACE. Each goal's figure gets a series of readings (seriesFor) and the engine's own pace
// (DashSignals.projectGoal, a least-squares fit over the last 56 days) is run over it; goalOutlook
// then says what that means against the due date: "On track · gets there Dec 25, 6 days early",
// "Off track · heading for 83% by Dec 31, not 90%". The series:
//   activeClients, mrrNetMonthly   the trajectory's weeks, which the analytics route already sends
//   adherencePct                   the weekly readings the analytics routes record
//                                  (GET /api/coach/goal-readings → adherence)
//   programsPublished              programs published since the goal's start date, week by week
//                                  (GET /api/coach/goal-readings → programs)
//   a typed goal                   its own history
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CoachGoals = api;
})(typeof window !== "undefined" ? window : null, function (root) {
  var DAY = 86400000;
  var ARCHIVE_MAX = 60;
  var HISTORY_MAX = 60;
  var CAS_TRIES = 4;
  // The trajectory's weeks a series keeps: the pace reads 56 days, the rest is for a start date.
  var SERIES_WEEKS = 30;

  function engine(opts) {
    if (opts && opts.signals) return opts.signals;
    if (root && root.DashSignals) return root.DashSignals;
    if (typeof require === "function") { try { return require("./dashSignals.js"); } catch (e) {} }
    return null;
  }

  // ── Small parts ─────────────────────────────────────────────────────────
  function list(v) { return Array.isArray(v) ? v : []; }
  function num(v) {
    if (v == null || v === "" || typeof v === "boolean") return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  function isDay(v) {
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    var d = new Date(v + "T00:00:00");
    return !isNaN(d.getTime()) && localDay(d) === v;
  }
  // Days are the coach's own (local), as the engine's are.
  function localDay(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function dayMs(s) { return new Date(s + "T00:00:00").getTime(); }
  function addDays(s, n) { var d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return localDay(d); }
  function daysFrom(a, b) { return Math.round((dayMs(b) - dayMs(a)) / DAY); }
  function asDate(now) { return now instanceof Date ? now : new Date(now == null ? Date.now() : now); }
  function quarterStart(now) { var d = asDate(now); return localDay(new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1)); }
  function quarterEnd(now) { var d = asDate(now); return localDay(new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3 + 3, 0)); }
  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }

  // A list of readings, cleaned: valid days and numbers only, one a day (the last kept), oldest first.
  function cleanReadings(raw) {
    var byDay = {};
    list(raw).forEach(function (p) {
      if (!p || !isDay(p.on)) return;
      var v = num(p.value);
      if (v == null) return;
      byDay[p.on] = v;
    });
    return Object.keys(byDay).sort().map(function (on) { return { on: on, value: byDay[on] }; });
  }
  function addReading(history, on, value) {
    var rest = cleanReadings(history).filter(function (p) { return p.on !== on; });
    rest.push({ on: on, value: value });
    rest.sort(function (a, b) { return a.on < b.on ? -1 : a.on > b.on ? 1 : 0; });
    return rest.slice(-HISTORY_MAX);
  }

  // ── The document ────────────────────────────────────────────────────────
  // A goal with its new fields cleaned: a start that is not a number, or a day that is not a day,
  // is dropped rather than kept as junk. Everything else is the goal as the coach left it.
  function cleanGoal(g) {
    var out = Object.assign({}, g);
    var s = num(out.start);
    if (s == null) delete out.start; else out.start = s;
    if (!isDay(out.startDate)) delete out.startDate;
    if (!isDay(out.due)) delete out.due;
    if (out.history != null) {
      var h = cleanReadings(out.history);
      if (h.length) out.history = h; else delete out.history;
    }
    return out;
  }

  var seq = 0;
  function newGoalId(now) { return "g" + asDate(now).getTime().toString(36) + "-" + (seq++).toString(36); }

  function goalsOf(doc) { return list(doc && doc.goals); }
  function archivedOf(doc) { return list(doc && doc.archived); }

  // Add a goal, or change the one with input.id. `opts.current` is the bound figure today (for a goal
  // bound to a metric), `opts.now` the clock. A new goal, or one newly bound to a different figure,
  // starts today from where its figure stands, unless the coach gave a start. A typed goal keeps a
  // reading each day its CURRENT changes, which is its pace.
  function upsertGoal(doc, input, opts) {
    opts = opts || {};
    var now = asDate(opts.now);
    var today = localDay(now);
    var goals = goalsOf(doc).slice();
    var at = input && input.id != null ? goals.findIndex(function (g) { return g && g.id === input.id; }) : -1;
    var prev = at >= 0 ? goals[at] : null;
    var g = cleanGoal(Object.assign({}, prev || {}, input || {}));
    if (!g.id) g.id = newGoalId(now);
    var fresh = !prev || (prev.metric || "") !== (g.metric || "");
    if (fresh) {
      // Rebound to another figure: a start the coach left as it was is the old figure's, in its unit.
      if (prev && num(input && input.start) === num(prev.start)) delete g.start;
      if (!isDay(g.startDate)) g.startDate = today;
      // Today's figure is the start only of a goal that starts today; one that started earlier reads
      // its start off the series at its start date (goalOutlook).
      if (num(g.start) == null && g.startDate === today) {
        var from = g.metric === "programsPublished" ? 0 : g.metric ? num(opts.current) : num(g.cur);
        if (from != null) g.start = from;
      }
    }
    if (g.metric) {
      // A bound goal's readings are the practice's; typed ones from before would mix two figures.
      delete g.history;
    } else {
      var cur = num(g.cur);
      var had = prev && !prev.metric ? cleanReadings(prev.history) : [];
      var changed = !prev || prev.metric || num(prev.cur) !== cur || !had.length;
      if (cur != null && changed) g.history = addReading(had, today, cur);
    }
    if (at >= 0) goals[at] = g; else goals.push(g);
    return Object.assign({}, doc, { goals: goals });
  }

  function removeGoal(doc, id) {
    return Object.assign({}, doc, { goals: goalsOf(doc).filter(function (g) { return !g || g.id !== id; }) });
  }

  // Archive every goal on the page: each moves to `archived`, newest first, with the day it was
  // archived and where its figure ended (`finals[id]`, the bound figure or the typed CURRENT; null
  // when it could not be read). Nothing is deleted; restoreGoal brings one back.
  function archiveGoals(doc, opts) {
    opts = opts || {};
    var at = asDate(opts.now).toISOString();
    var finals = opts.finals || {};
    var moved = goalsOf(doc).filter(Boolean).map(function (g) {
      var f = Object.prototype.hasOwnProperty.call(finals, g.id) ? num(finals[g.id]) : (g.metric ? null : num(g.cur));
      return Object.assign({}, g, { archivedAt: at, final: f });
    });
    if (!moved.length) return Object.assign({}, doc);
    return Object.assign({}, doc, { goals: [], archived: moved.concat(archivedOf(doc)).slice(0, ARCHIVE_MAX) });
  }

  function restoreGoal(doc, id, opts) {
    var arch = archivedOf(doc);
    var hit = arch.find(function (g) { return g && g.id === id; });
    if (!hit) return Object.assign({}, doc);
    var g = Object.assign({}, hit);
    delete g.archivedAt; delete g.final;
    var goals = goalsOf(doc).slice();
    if (goals.some(function (x) { return x && x.id === g.id; })) g.id = newGoalId(opts && opts.now);
    goals.push(g);
    return Object.assign({}, doc, { goals: goals, archived: arch.filter(function (x) { return x !== hit; }) });
  }

  // ── Writing it ──────────────────────────────────────────────────────────
  function revOf(raw) {
    var r = raw && typeof raw === "object" ? raw.rev : null;
    return typeof r === "number" && isFinite(r) && r >= 0 ? Math.floor(r) : 0;
  }
  function revToken(raw) {
    if (!raw || typeof raw !== "object" || raw.rev == null) return null;
    return String(raw.rev);
  }

  // Read the coach's goals document (`kind` 'trainer' | 'nutritionist'), apply `change(doc)` to what
  // was read, and save it only if nobody wrote it in between; on a conflict, read and apply again.
  // Resolves { ok: true, doc } or { ok: false, reason }: 'signed-out', 'unreadable' (a read that
  // failed writes nothing: an empty document saved over a real one would lose every goal),
  // 'account-changed', 'write-failed' or 'contended' (every try lost; nothing was written).
  async function writeGoalsDoc(db, kind, change) {
    try {
      if (!db || !db.getUser || !db.getUserGoals || !(db.saveUserGoalsIfRev || db.saveUserGoals)) return { ok: false, reason: "write-failed" };
      var u = await db.getUser();
      var uid = u && u.id;
      if (!uid) return { ok: false, reason: "signed-out" };
      for (var i = 0; i < CAS_TRIES; i += 1) {
        var cur = await db.getUserGoals(kind, { expectedUserId: uid });
        if (!cur || typeof cur !== "object") return { ok: false, reason: "unreadable" };
        var next = Object.assign({}, change(cur), { rev: revOf(cur) + 1 });
        var res = db.saveUserGoalsIfRev
          ? await db.saveUserGoalsIfRev(kind, next, revToken(cur), uid)
          : await db.saveUserGoals(kind, next, { expectedUserId: uid });
        if (res && res.conflict) continue;
        if (res && res.accountChanged) return { ok: false, reason: "account-changed" };
        if (!res || !res.ok) return { ok: false, reason: "write-failed" };
        return { ok: true, doc: next };
      }
      return { ok: false, reason: "contended" };
    } catch (e) {
      return { ok: false, reason: "write-failed" };
    }
  }

  // ── The bound figure for "programs published" ───────────────────────────
  // Counted from the goal's start date, or this quarter's first day for a goal with none.
  function programsSince(goal, now) { return goal && isDay(goal.startDate) ? goal.startDate : quarterStart(now); }
  // The programs published since the goal started: 'loading' while the readings are on their way,
  // null when they could not be read, else a count.
  function programsBound(goal, readings, now) {
    if (!readings || readings.kind === "loading") return "loading";
    if (readings.kind !== "live" || !readings.programs || !Array.isArray(readings.programs.published)) return null;
    var since = programsSince(goal, now);
    var today = localDay(asDate(now));
    return readings.programs.published.filter(function (d) { return isDay(d) && d >= since && d <= today; }).length;
  }

  // ── The series ──────────────────────────────────────────────────────────
  // The readings a goal's pace is fitted to, oldest first, or null when its figure has none to give
  // (unread, or not loaded yet). `src` is { live, readings }: the page's useCoachLiveFigures and
  // useCoachGoalReadings.
  function seriesFor(goal, src, now) {
    if (!goal) return null;
    src = src || {};
    var today = localDay(asDate(now));
    var live = src.live, readings = src.readings;
    var m = goal.metric;
    if (m === "activeClients" || m === "mrrNetMonthly") {
      if (!live || live.kind !== "live" || !live.trajectory || !Array.isArray(live.trajectory.weeks)) return null;
      return cleanReadings(live.trajectory.weeks.slice(-SERIES_WEEKS).map(function (w) {
        if (!w || !isDay(w.weekOf)) return null;
        var end = addDays(w.weekOf, 6);
        var v = m === "activeClients" ? num(w.active) : (num(w.mrrNetCents) == null ? null : Math.round(num(w.mrrNetCents) / 100));
        return { on: end > today ? today : end, value: v };
      }));
    }
    if (m === "adherencePct") {
      if (!readings || readings.kind !== "live" || !Array.isArray(readings.adherence)) return null;
      return cleanReadings(readings.adherence);
    }
    if (m === "programsPublished") {
      if (!readings || readings.kind !== "live" || !readings.programs || !Array.isArray(readings.programs.published)) return null;
      var since = programsSince(goal, now);
      if (since > today) return [];
      var days = readings.programs.published.filter(function (d) { return isDay(d) && d >= since && d <= today; }).sort();
      var out = [];
      for (var d = since; d <= today; d = addDays(d, 7)) {
        out.push({ on: d, value: days.filter(function (x) { return x <= d; }).length });
      }
      out.push({ on: today, value: days.length });
      return cleanReadings(out);
    }
    if (m) return null;
    return cleanReadings(goal.history);
  }

  // ── The outlook ─────────────────────────────────────────────────────────
  function fmtValue(goal, v) {
    if (v == null || !isFinite(v)) return "—";
    if (goal && goal.money) return "$" + Math.round(v).toLocaleString("en-US");
    if (goal && goal.pct) return Math.round(v) + "%";
    // Clients and programs come whole; a typed figure keeps a decimal.
    if (goal && (goal.metric === "activeClients" || goal.metric === "programsPublished")) return String(Math.round(v));
    var r = Math.abs(v - Math.round(v)) < 0.05 ? Math.round(v) : Math.round(v * 10) / 10;
    return String(r);
  }
  function valueOn(pts, day) {
    var v = null;
    for (var i = 0; i < pts.length; i++) { if (pts[i].on <= day) v = pts[i].value; else break; }
    return v;
  }

  // What a goal's pace says against its due date. `series` is seriesFor's; `opts.current` is the figure
  // the card shows today (the bound figure, or the typed CURRENT), which stands as today's reading.
  // Returns null when there is nothing to say (no target, no figure), else { state, line, … }:
  //   done     reached ("Reached Nov 2 ✓")
  //   on       on pace to reach it by the due date ("On track · gets there Dec 25, 6 days early")
  //   off      not on pace to ("Off track · heading for 83% by Dec 31, not 90%"), with `heading`
  //   missed   the due date passed short of it
  //   pace / stalled / far   no due date: the engine's own words ("At this pace: Dec 9", "Pace stalled")
  //   unknown  too few readings for a pace yet
  function goalOutlook(goal, series, opts) {
    opts = opts || {};
    var S = engine(opts);
    if (!S || !goal) return null;
    var target = num(goal.tgt);
    if (target == null) return null;
    var nowD = asDate(opts.now);
    var today = localDay(nowD);
    var current = num(opts.current);
    var pts = cleanReadings(series);
    if (current != null) pts = cleanReadings(pts.concat([{ on: today, value: current }]));
    if (!pts.length) return null;
    var start = goal.metric === "programsPublished" ? 0 : num(goal.start);
    if (start == null && isDay(goal.startDate)) start = valueOn(pts, goal.startDate);
    if (start == null) {
      var from = addDays(today, -S.THRESHOLDS.GOAL_RECENT_DAYS);
      var win = pts.filter(function (p) { return p.on >= from; });
      start = win.length ? win[0].value : null;
    }
    var p = S.projectGoal({ target: target, start: start, now: current, history: pts }, nowD);
    if (!p) return null;
    var due = isDay(goal.due) ? goal.due : null;
    var dueLabel = due ? S.goalDateLabel(due) : null;
    var tgtF = fmtValue(goal, target);
    if (p.state === "achieved") {
      return { state: "done", line: "Reached" + (p.achievedOn ? " " + S.goalDateLabel(p.achievedOn) : "") + " ✓" };
    }
    if (due && today > due) {
      return { state: "missed", due: due, line: "Was due " + dueLabel + " · " + fmtValue(goal, p.lastValue) + " of " + tgtF };
    }
    if (p.state === "insufficient" || p.state === "stale") {
      return { state: "unknown", line: "Pace shows once there are readings a week apart" };
    }
    var heading = null;
    if (due && p.ratePerWeek != null && p.lastOn) {
      heading = p.lastValue + (p.ratePerWeek / 7) * daysFrom(p.lastOn, due);
      // A practice's figures don't go below nothing, and a percent stops at 100.
      if (goal.metric || goal.money || goal.pct) heading = Math.max(0, heading);
      if (goal.pct) heading = Math.min(100, heading);
    }
    if (p.state === "on-pace") {
      if (!due) return { state: "pace", projectedDate: p.projectedDate, line: "At this pace: " + p.projectedLabel };
      var diff = daysFrom(due, p.projectedDate);
      if (diff <= 0) {
        return { state: "on", due: due, projectedDate: p.projectedDate,
          line: "On track · gets there " + p.projectedLabel + (diff < 0 ? ", " + plural(-diff, "day") + " early" : ", on the day") };
      }
      return { state: "off", due: due, projectedDate: p.projectedDate, heading: heading,
        line: "Off track · heading for " + fmtValue(goal, heading) + " by " + dueLabel + ", not " + tgtF + " · gets there " + p.projectedLabel + ", " + plural(diff, "day") + " late" };
    }
    if (!due) return { state: p.state, line: p.state === "far" ? "More than a year away at this pace" : "Pace stalled" };
    return { state: "off", due: due, heading: heading,
      line: "Off track · heading for " + fmtValue(goal, heading != null ? heading : p.lastValue) + " by " + dueLabel + ", not " + tgtF };
  }

  return {
    ARCHIVE_MAX: ARCHIVE_MAX,
    HISTORY_MAX: HISTORY_MAX,
    CAS_TRIES: CAS_TRIES,
    isDay: isDay,
    localDay: localDay,
    quarterStart: quarterStart,
    quarterEnd: quarterEnd,
    cleanGoal: cleanGoal,
    upsertGoal: upsertGoal,
    removeGoal: removeGoal,
    archiveGoals: archiveGoals,
    restoreGoal: restoreGoal,
    writeGoalsDoc: writeGoalsDoc,
    programsSince: programsSince,
    programsBound: programsBound,
    seriesFor: seriesFor,
    fmtValue: fmtValue,
    goalOutlook: goalOutlook,
  };
});
