// Workout-builder core (dashboard-v2 — trainer Programs step). PURE module:
// no React, no DOM, no fetch. Browser global (window.DashBuilder) + Node
// require() for tests, same pattern as dashSignals.js.
//
// Template document (stored in coach_plans.detail.builder):
//   {
//     version: n,                 // bumped on every saved edit of the template
//     goalTag: 'cut'|'strength'|'hypertrophy'|'return-to-gym'|'5k-prep',
//     weeks: [ {
//       deload: bool,
//       days: [ {
//         name: 'Lower Push',
//         playlist: { name, meta } | null,        // → chip on the client card
//         blocks: [ {
//           kind: 'warmup'|'main'|'accessory'|'finisher',
//           rows: [ {
//             id, name, muscle, equipment,
//             sets: n, reps: '5' | '8-10',
//             loadType: 'kg'|'pct'|'rpe', load: n,
//             tempo: '31X1' | '', rest: '90s' | '',
//             cue: 'brace before the walkout',     // renders VERBATIM on the client card
//             group: 'A' | null,                   // adjacent same letters = superset (A1/A2)
//             progression: { rule: 'all-reps', incKg: 2.5 } | null,
//           } ]
//         } ]
//       } ]
//     } ]
//   }
//
// Assignment is a SNAPSHOT: buildAssignmentRows deep-copies into
// client_workouts payloads — later template edits never retro-change them,
// and per-client overrides edit the client rows, never the template.

(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.DashBuilder = api;
})(typeof window !== "undefined" ? window : null, function () {
  var DAY = 86400000;

  var GOAL_TAGS = [
    { key: "cut", label: "Cut", c: "#d8a23a" },
    { key: "strength", label: "Strength", c: "#c0533b" },
    { key: "hypertrophy", label: "Hypertrophy", c: "#8a5cf6" },
    { key: "return-to-gym", label: "Return to gym", c: "#7bbf5a" },
    { key: "5k-prep", label: "5k prep", c: "#5ec8e0" },
  ];

  var BLOCK_KINDS = [
    { key: "warmup", label: "Warmup" },
    { key: "main", label: "Main" },
    { key: "accessory", label: "Accessory" },
    { key: "finisher", label: "Finisher" },
  ];

  // ── Exercise library (searchable: name · muscle group · equipment) ────────
  var EXERCISES = [
    ["Back squat", "Quads", "Barbell"], ["Front squat", "Quads", "Barbell"], ["Goblet squat", "Quads", "Dumbbell"],
    ["Hack squat", "Quads", "Machine"], ["Leg press", "Quads", "Machine"], ["Walking lunge", "Quads", "Dumbbell"],
    ["Split squat", "Quads", "Dumbbell"], ["Leg extension", "Quads", "Machine"],
    ["Deadlift", "Posterior chain", "Barbell"], ["Romanian deadlift", "Hamstrings", "Barbell"],
    ["Trap-bar deadlift", "Posterior chain", "Trap bar"], ["Good morning", "Hamstrings", "Barbell"],
    ["Leg curl", "Hamstrings", "Machine"], ["Nordic curl", "Hamstrings", "Bodyweight"],
    ["Hip thrust", "Glutes", "Barbell"], ["Glute bridge", "Glutes", "Bodyweight"], ["Back extension", "Posterior chain", "Bodyweight"],
    ["Standing calf raise", "Calves", "Machine"], ["Seated calf raise", "Calves", "Machine"],
    ["Bench press", "Chest", "Barbell"], ["Incline bench press", "Chest", "Barbell"], ["Dumbbell bench press", "Chest", "Dumbbell"],
    ["Incline dumbbell press", "Chest", "Dumbbell"], ["Machine chest press", "Chest", "Machine"],
    ["Push-up", "Chest", "Bodyweight"], ["Dip", "Chest", "Bodyweight"], ["Cable fly", "Chest", "Cable"],
    ["Overhead press", "Shoulders", "Barbell"], ["Dumbbell shoulder press", "Shoulders", "Dumbbell"],
    ["Lateral raise", "Shoulders", "Dumbbell"], ["Rear-delt fly", "Shoulders", "Dumbbell"], ["Face pull", "Shoulders", "Cable"],
    ["Pull-up", "Back", "Bodyweight"], ["Chin-up", "Back", "Bodyweight"], ["Lat pulldown", "Back", "Cable"],
    ["Barbell row", "Back", "Barbell"], ["Dumbbell row", "Back", "Dumbbell"], ["Chest-supported row", "Back", "Machine"],
    ["Cable row", "Back", "Cable"], ["Inverted row", "Back", "Bodyweight"], ["Shrug", "Traps", "Dumbbell"],
    ["Barbell curl", "Biceps", "Barbell"], ["Dumbbell curl", "Biceps", "Dumbbell"], ["Hammer curl", "Biceps", "Dumbbell"],
    ["Incline curl", "Biceps", "Dumbbell"], ["Cable curl", "Biceps", "Cable"],
    ["Triceps pushdown", "Triceps", "Cable"], ["Overhead triceps extension", "Triceps", "Cable"],
    ["Skull crusher", "Triceps", "Barbell"], ["Close-grip bench", "Triceps", "Barbell"],
    ["Plank", "Core", "Bodyweight"], ["Hanging leg raise", "Core", "Bodyweight"], ["Ab wheel rollout", "Core", "Wheel"],
    ["Cable crunch", "Core", "Cable"], ["Pallof press", "Core", "Cable"], ["Farmer carry", "Core", "Dumbbell"],
    ["Suitcase carry", "Core", "Dumbbell"], ["Bird dog", "Core", "Bodyweight"], ["Dead bug", "Core", "Bodyweight"],
    ["Kettlebell swing", "Posterior chain", "Kettlebell"], ["Box jump", "Quads", "Box"],
    ["Sled push", "Conditioning", "Sled"], ["Assault bike", "Conditioning", "Bike"], ["Rower", "Conditioning", "Rower"],
    ["Easy run", "Conditioning", "None"], ["Tempo run", "Conditioning", "None"], ["Interval run", "Conditioning", "None"],
    ["Hill sprints", "Conditioning", "None"], ["Jump rope", "Conditioning", "Rope"],
    ["Band pull-apart", "Shoulders", "Band"], ["Hip 90/90 flow", "Mobility", "Bodyweight"],
    ["Couch stretch", "Mobility", "Bodyweight"], ["World's greatest stretch", "Mobility", "Bodyweight"],
    ["Cat-cow", "Mobility", "Bodyweight"], ["Glute med kickout", "Glutes", "Band"],
  ].map(function (x, i) { return { id: "ex-" + i, name: x[0], muscle: x[1], equipment: x[2] }; });

  function searchExercises(q) {
    var s = String(q || "").trim().toLowerCase();
    if (!s) return EXERCISES.slice(0, 12);
    return EXERCISES.filter(function (e) {
      return e.name.toLowerCase().indexOf(s) >= 0 || e.muscle.toLowerCase().indexOf(s) >= 0 || e.equipment.toLowerCase().indexOf(s) >= 0;
    }).slice(0, 12);
  }

  // ── Small factories ────────────────────────────────────────────────────────
  var _uid = 0;
  function uid() { _uid += 1; return "r" + Date.now().toString(36) + "-" + _uid; }
  function newRow(ex) {
    return {
      id: uid(), name: ex ? ex.name : "", muscle: ex ? ex.muscle : "", equipment: ex ? ex.equipment : "",
      sets: 3, reps: "8", loadType: "kg", load: 0, tempo: "", rest: "90s", cue: "", group: null, progression: null,
    };
  }
  function newDay(name) {
    return { name: name || "New day", playlist: null, blocks: [{ kind: "main", rows: [] }] };
  }
  function newWeek() { return { deload: false, days: [newDay("Day 1")] }; }
  function newProgram(name, goalTag) {
    return { version: 1, goalTag: goalTag || "strength", weeks: [newWeek()] };
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ── Load + scheme formatting (the client card shows these verbatim) ───────
  function loadLabel(row) {
    if (row.load == null || row.load === 0 || row.load === "") return "";
    if (row.loadType === "pct") return row.load + "% 1RM";
    if (row.loadType === "rpe") return "RPE " + row.load;
    return row.load + " kg";
  }
  function schemeLabel(row) {
    var parts = [];
    if (row.sets && row.reps) parts.push(row.sets + " × " + row.reps);
    if (row.tempo) parts.push(row.tempo + " tempo");
    if (row.rest) parts.push(row.rest);
    return parts.join(" · ");
  }

  // Superset labels: adjacent rows sharing a group letter get A1/A2/…;
  // ungrouped rows get plain numbering.
  function rowLabels(day) {
    var out = [];
    var counters = {};
    var plain = 0;
    for (var b = 0; b < day.blocks.length; b++) {
      var rows = day.blocks[b].rows;
      for (var i = 0; i < rows.length; i++) {
        var g = rows[i].group;
        if (g) {
          counters[g] = (counters[g] || 0) + 1;
          out.push(g + counters[g]);
        } else {
          plain += 1;
          out.push(String(plain).padStart(2, "0"));
        }
      }
    }
    return out;
  }

  // ── Week tools ─────────────────────────────────────────────────────────────
  // Progression: when duplicating a week, rows with a rule auto-fill the next
  // week (kg loads bump by incKg; pct/rpe rules bump by 1 step when defined).
  function applyProgression(week) {
    var next = clone(week);
    next.deload = false;
    for (var d = 0; d < next.days.length; d++) {
      for (var b = 0; b < next.days[d].blocks.length; b++) {
        var rows = next.days[d].blocks[b].rows;
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i];
          if (r.progression && r.progression.rule === "all-reps") {
            if (r.loadType === "kg" && r.progression.incKg) r.load = Math.round((Number(r.load) + r.progression.incKg) * 100) / 100;
            else if (r.loadType === "pct" && r.progression.incPct) r.load = Math.min(100, Number(r.load) + r.progression.incPct);
            else if (r.loadType === "rpe" && r.progression.incRpe) r.load = Math.min(10, Number(r.load) + r.progression.incRpe);
          }
          r.id = uid(); // duplicated rows are their own rows
        }
      }
    }
    return next;
  }

  // Deload: −40% volume (sets), floor 1 — a starting point the trainer edits.
  function deloadWeek(week) {
    var next = clone(week);
    next.deload = true;
    for (var d = 0; d < next.days.length; d++) {
      for (var b = 0; b < next.days[d].blocks.length; b++) {
        var rows = next.days[d].blocks[b].rows;
        for (var i = 0; i < rows.length; i++) {
          rows[i].sets = Math.max(1, Math.round(rows[i].sets * 0.6));
        }
      }
    }
    return next;
  }

  // ── Client-card shape (the preview renders EXACTLY this; the plan API
  //    delivers the same fields to the real card) ────────────────────────────
  function dayToClientCard(day, opts) {
    opts = opts || {};
    var labels = rowLabels(day);
    var exercises = [];
    var li = 0;
    for (var b = 0; b < day.blocks.length; b++) {
      var rows = day.blocks[b].rows;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        exercises.push({
          prefix: r.group ? labels[li] : null,
          name: r.name || "Exercise",
          scheme: schemeLabel(r),
          load: loadLabel(r),
          cue: r.cue || "",
        });
        li += 1;
      }
    }
    var totalSets = day.blocks.reduce(function (s, blk) {
      return s + blk.rows.reduce(function (s2, r) { return s2 + (Number(r.sets) || 0); }, 0);
    }, 0);
    return {
      title: day.name,
      time: opts.time || null,
      coach: opts.coach || "you",
      meta: exercises.length + " moves · " + totalSets + " sets",
      exercises: exercises,
      playlist: day.playlist || null,
    };
  }

  // ── Assignment snapshot ────────────────────────────────────────────────────
  // One client_workouts payload per day, scheduled from startDate, weeks laid
  // out 7 days apart, days inside a week on consecutive dates. Deep-copied:
  // later template edits never touch what was assigned.
  function iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function buildAssignmentRows(program, templateMeta, startDateISO) {
    var start = new Date(startDateISO + "T00:00:00");
    var out = [];
    for (var w = 0; w < program.weeks.length; w++) {
      var days = program.weeks[w].days;
      for (var d = 0; d < days.length; d++) {
        var day = clone(days[d]);
        var date = new Date(start.getTime() + (w * 7 + d) * DAY);
        var labels = rowLabels(day);
        var li = 0;
        var exercises = [];
        for (var b = 0; b < day.blocks.length; b++) {
          for (var i = 0; i < day.blocks[b].rows.length; i++) {
            var r = day.blocks[b].rows[i];
            exercises.push({
              name: r.name, sets: String(r.sets), reps: String(r.reps),
              rest: r.rest || "", load: loadLabel(r), tempo: r.tempo || "",
              cue: r.cue || "", group: r.group ? labels[li] : "",
              block: day.blocks[b].kind,
            });
            li += 1;
          }
        }
        out.push({
          title: day.name,
          scheduledDate: iso(date),
          payload: {
            exercises: exercises,
            playlist: day.playlist ? clone(day.playlist) : null,
            template: templateMeta ? { id: templateMeta.id || null, name: templateMeta.name || "", version: program.version || 1, week: w + 1, day: d + 1 } : null,
          },
        });
      }
    }
    return out;
  }

  // ── Demo templates + performance (signed-out / API-down fallback) ─────────
  function demoTemplates() {
    var mk = function (name, goalTag, weeks) {
      return { id: "demo-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: name, published: true, detail: { builder: { version: 3, goalTag: goalTag, weeks: weeks } } };
    };
    var row = function (name, muscle, equipment, sets, reps, loadType, load, tempo, rest, cue, group, prog) {
      return { id: uid(), name: name, muscle: muscle, equipment: equipment, sets: sets, reps: reps, loadType: loadType, load: load, tempo: tempo, rest: rest, cue: cue, group: group || null, progression: prog || null };
    };
    var strengthW1 = {
      deload: false,
      days: [
        { name: "Lower Push", playlist: { name: "Lower Push — Peak", meta: "95–138 BPM · 14 tracks" }, blocks: [
          { kind: "warmup", rows: [row("Hip 90/90 flow", "Mobility", "Bodyweight", 2, "5 ea", "kg", 0, "", "30s", "Slow — own every position", null)] },
          { kind: "main", rows: [
            row("Back squat", "Quads", "Barbell", 4, "5", "kg", 110, "31X1", "150s", "Brace before the walkout", null, { rule: "all-reps", incKg: 2.5 }),
            row("Romanian deadlift", "Hamstrings", "Barbell", 3, "8", "kg", 90, "3010", "120s", "Push the hips back, bar on the thighs", null, { rule: "all-reps", incKg: 2.5 }),
          ] },
          { kind: "accessory", rows: [
            row("Split squat", "Quads", "Dumbbell", 3, "8 ea", "kg", 18, "", "90s", "Slow eccentric, drive through the heel", "A"),
            row("Leg curl", "Hamstrings", "Machine", 3, "10", "rpe", 8, "", "90s", "", "A"),
          ] },
          { kind: "finisher", rows: [row("Farmer carry", "Core", "Dumbbell", 3, "40 m", "kg", 28, "", "60s", "Crush grip · ribs down", null)] },
        ] },
        { name: "Upper Pull", playlist: { name: "Pull Heavy", meta: "92–128 BPM · 12 tracks" }, blocks: [
          { kind: "main", rows: [
            row("Pull-up", "Back", "Bodyweight", 4, "6-8", "rpe", 8, "", "150s", "Dead hang — chest to bar", null),
            row("Barbell row", "Back", "Barbell", 4, "8", "kg", 70, "", "120s", "Hinge 45°, pull to the sternum", null, { rule: "all-reps", incKg: 2.5 }),
          ] },
          { kind: "accessory", rows: [
            row("Face pull", "Shoulders", "Cable", 3, "15", "kg", 20, "", "60s", "External rotation at the top", "A"),
            row("Incline curl", "Biceps", "Dumbbell", 3, "12", "kg", 12, "", "60s", "Full stretch · 3s down", "A"),
          ] },
        ] },
      ],
    };
    var strengthW2 = applyProgression(strengthW1);
    return [
      mk("Strength Block 3", "strength", [strengthW1, strengthW2]),
      mk("Summer Cut", "cut", [{ deload: false, days: [
        { name: "Full Body A", playlist: null, blocks: [{ kind: "main", rows: [
          row("Goblet squat", "Quads", "Dumbbell", 3, "12", "kg", 24, "", "75s", "Tall chest the whole way", null),
          row("Push-up", "Chest", "Bodyweight", 3, "12-15", "kg", 0, "", "60s", "", null),
          row("Kettlebell swing", "Posterior chain", "Kettlebell", 4, "15", "kg", 20, "", "60s", "Snap the hips — arms are ropes", null),
        ] }] },
      ] }]),
      mk("Hypertrophy 8", "hypertrophy", [{ deload: false, days: [
        { name: "Push", playlist: null, blocks: [{ kind: "main", rows: [
          row("Incline dumbbell press", "Chest", "Dumbbell", 4, "10", "kg", 26, "3010", "90s", "Stretch at the bottom — no bounce", null, { rule: "all-reps", incKg: 1 }),
          row("Lateral raise", "Shoulders", "Dumbbell", 4, "15", "kg", 8, "", "60s", "Lead with the elbows", "A"),
          row("Triceps pushdown", "Triceps", "Cable", 4, "12", "kg", 25, "", "60s", "", "A"),
        ] }] },
      ] }]),
      mk("Return to Gym", "return-to-gym", [{ deload: false, days: [
        { name: "Foundations A", playlist: null, blocks: [
          { kind: "warmup", rows: [row("Cat-cow", "Mobility", "Bodyweight", 2, "8", "kg", 0, "", "30s", "Move with the breath", null)] },
          { kind: "main", rows: [
            row("Goblet squat", "Quads", "Dumbbell", 3, "10", "kg", 12, "", "90s", "Sit between the hips", null),
            row("Chest-supported row", "Back", "Machine", 3, "12", "kg", 25, "", "90s", "Squeeze 1s at the top", null),
          ] },
        ] },
      ] }]),
      mk("5k Prep", "5k-prep", [{ deload: false, days: [
        { name: "Tempo Tuesday", playlist: { name: "Tempo 32", meta: "165–172 BPM" }, blocks: [{ kind: "main", rows: [
          row("Easy run", "Conditioning", "None", 1, "10 min", "rpe", 4, "", "", "Conversational pace", null),
          row("Tempo run", "Conditioning", "None", 1, "20 min", "rpe", 7, "", "", "Comfortably hard — hold it steady", null),
          row("Easy run", "Conditioning", "None", 1, "10 min", "rpe", 3, "", "", "Shake it out", null),
        ] }] },
      ] }]),
    ];
  }

  // Per-program demo performance: subscribers, completion, week retention.
  function demoPerformance(templateId) {
    var seeds = {
      "demo-strength-block-3": { subscribers: 14, completion: 78, retention: [100, 93, 86, 86, 79, 71, 64, 64, 57, 50, 50, 43] },
      "demo-summer-cut": { subscribers: 9, completion: 64, retention: [100, 89, 78, 67, 56, 56, 44, 44] },
      "demo-hypertrophy-8": { subscribers: 11, completion: 82, retention: [100, 91, 91, 82, 82, 73, 73, 64] },
      "demo-return-to-gym": { subscribers: 6, completion: 92, retention: [100, 100, 83, 83] },
      "demo-5k-prep": { subscribers: 7, completion: 71, retention: [100, 86, 86, 71, 71, 57] },
    };
    return seeds[templateId] || null;
  }

  // ── Assignment grouping — one publish per WEEK, not per session ────────────
  //
  // The publish boundary (SPEC-guardrails.md §9.4) evaluates and REPLACES a whole
  // client-week. Sending a program one session at a time is correct — each call
  // re-merges and accumulates — but it republishes the same week once per
  // session, so a 12-week × 3-day program does ~36 publishes and ~36 telemetry
  // rows for ONE authoring act, which skews §10.2's flag-rate denominators.
  //
  // ⚠ MONDAY COMES FROM THE SESSION'S OWN DATE, never from the program start.
  // A session grouped into the wrong week is judged against the wrong week's
  // load AND lands in a replace that clears a week it was never part of. The
  // arithmetic below is `bsWeekStartOf` (src/lib/week-merge.mjs) verbatim,
  // overflow round-trip included —
  // UTC-only, so no local timezone can shift the boundary — because the route
  // re-derives the week server-side and rejects a call whose sessions span two.
  function weekStartOf(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if (!m) return null;
    var y = +m[1], mo = +m[2], day = +m[3];
    var d = new Date(Date.UTC(y, mo - 1, day));
    if (isNaN(d.getTime())) return null;
    // ⚠ DAY OVERFLOW IS THE ONE CASE A NaN CHECK MISSES. `Date.UTC(2026, 1, 30)`
    // does not fail — it rolls Feb 30 to March 2 — so a calendar-impossible date
    // would be bucketed into a week nobody authored, silently. Month 13 and
    // hour 25 do yield NaN, which is exactly why the round-trip is the check.
    if (d.getUTCFullYear() !== y || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== day) return null;
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  }

  // rows (from buildAssignmentRows) -> [{ weekStartISO, rows }], week-ascending.
  // A row with an unreadable date is DROPPED rather than bucketed into a
  // fabricated week: the route refuses an undated session by name, and silently
  // inventing a Monday for it would publish it into a week nobody authored.
  function groupAssignmentWeeks(rows) {
    var byWeek = {};
    var list = Array.isArray(rows) ? rows : [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r) continue;
      var k = weekStartOf(r.scheduledDate);
      if (!k) continue;
      if (!byWeek[k]) byWeek[k] = [];
      byWeek[k].push(r);
    }
    return Object.keys(byWeek).sort().map(function (k) {
      return { weekStartISO: k, rows: byWeek[k] };
    });
  }

  return {
    weekStartOf: weekStartOf, groupAssignmentWeeks: groupAssignmentWeeks,
    GOAL_TAGS: GOAL_TAGS,
    BLOCK_KINDS: BLOCK_KINDS,
    EXERCISES: EXERCISES,
    searchExercises: searchExercises,
    newRow: newRow, newDay: newDay, newWeek: newWeek, newProgram: newProgram,
    loadLabel: loadLabel, schemeLabel: schemeLabel, rowLabels: rowLabels,
    applyProgression: applyProgression, deloadWeek: deloadWeek,
    dayToClientCard: dayToClientCard, buildAssignmentRows: buildAssignmentRows,
    demoTemplates: demoTemplates, demoPerformance: demoPerformance,
  };
});
