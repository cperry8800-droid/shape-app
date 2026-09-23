// Workout-builder core (dashboard-v2 — trainer Programs step). PURE module:
// no React, no DOM, no fetch. Browser global (window.DashBuilder) + Node
// require() for tests, same pattern as dashSignals.js.
//
// Template document (stored in coach_plans.detail.builder):
//   {
//     version: n,                 // bumped on every saved edit of the template
//     goalTag: 'strength',        // LEGACY — every writer stamps 'strength' and no control
//                                 // ever chose it, so nothing reads it (see programFacts)
//     tags: ['cut', 'Postnatal'], // what the coach chose: GOAL_TAGS keys or their own words
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
//             loadType: 'kg'|'lb'|'pct', load: n,   // a stored 'rpe' is legacy — splitLegacyRpe moves it
//             rpe: 1–10 in half points | '',       // its own axis: '100 kg · RPE 8' is one row
//             tempo: '31X1' | '', rest: '90s' | '',
//             cue: 'brace before the walkout',     // renders VERBATIM on the client card
//             group: 'A' | null,                   // same letter = superset (A1/A2, in list order — not only adjacent)
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
  var WorkoutDoc = typeof module !== "undefined" && module.exports ? require("./workoutDocument.js") : globalThis.ShapeWorkoutDocument;
  var Signals = typeof module !== "undefined" && module.exports ? require("./dashSignals.js") : globalThis.DashSignals;

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

  // ── The coach's own moves ──────────────────────────────────────────────────
  // ⚠ EVERY MOVE A COACH HAS EVER WRITTEN IS ALREADY IN THEIR OWN SAVED PROGRAMS,
  // so offering them back needs no table, no route and no migration: `newRow`
  // keeps `name`, `muscle` and `equipment` on the row, and the library page
  // already holds every template. This walks them.
  // ⚠ IT EXCLUDES ANYTHING SHAPE ALREADY LISTS, because the point of the group is
  // the moves that are NOT in the library — a coach seeing "Back squat" under
  // YOUR MOVES learns nothing and the group stops meaning anything.
  // The rule for a second sighting of one move: keep the first non-empty descriptor we
  // meet. Shared with the builder's open-document merge, so a move cannot resolve one way
  // in the library and another inside the plan being edited.
  function mergeMoveInto(prev, next) {
    if (!prev || !next) return prev;
    if (!prev.muscle && next.muscle) prev.muscle = String(next.muscle);
    if (!prev.equipment && next.equipment) prev.equipment = String(next.equipment);
    return prev;
  }
  var _BUILTIN = (function () { var m = Object.create(null); for (var i = 0; i < EXERCISES.length; i++) m[EXERCISES[i].name.toLowerCase()] = true; return m; })();
  function customMovesFromTemplates(templates) {
    // ⚠ NULL-PROTOTYPE, because these keys are names a COACH TYPES. With a plain
    // object, "__proto__" and "constructor" were dropped here and refused by
    // canCreateMove — unaddable and unofferable, a dead end — while "toString"
    // and "valueOf" happened to work. Measured, not reasoned about.
    var seen = Object.create(null), out = [];
    var list = templates || [];
    for (var t = 0; t < list.length; t++) {
      var b = list[t] && list[t].detail && list[t].detail.builder;
      var weeks = (b && b.weeks) || [];
      // ⚠ THE MIDDLE LEVELS ARE GUARDED LIKE THE OUTER AND INNER ONES. This walk already
      // refuses a null template, detail, builder and ROW; leaving week, day and block bare
      // made the helper's own contract arbitrary — it accepted a ragged document at five of
      // eight levels. Reachability today is the workout route's, not this function's:
      // `normalizeWorkoutDetail` reads `week.days`, `day.id` and `block.rows` just as bare,
      // so a persisted null throws THERE first. This is the helper keeping its own promise,
      // not a live crash — and it is what lets a future caller hand it an un-normalized doc.
      for (var w = 0; w < weeks.length; w++) {
        var days = (weeks[w] && weeks[w].days) || [];
        for (var d = 0; d < days.length; d++) {
          var blocks = (days[d] && days[d].blocks) || [];
          for (var bi = 0; bi < blocks.length; bi++) {
            var rows = (blocks[bi] && blocks[bi].rows) || [];
            for (var r = 0; r < rows.length; r++) {
              var name = String((rows[r] && rows[r].name) || "").trim();
              if (!name) continue;
              var key = name.toLowerCase();
              if (_BUILTIN[key]) continue;
              if (seen[key]) { mergeMoveInto(seen[key], rows[r]); continue; }
              seen[key] = { id: "own-" + key, name: name, muscle: String(rows[r].muscle || ""), equipment: String(rows[r].equipment || ""), own: true };
              out.push(seen[key]);
            }
          }
        }
      }
    }
    return out.sort(function (a, b2) { return a.name.localeCompare(b2.name); });
  }

  // The twin of `mergeOwnFoods`: the EARLIER list keeps identity, `mergeMoveInto` fills
  // what it is missing from the later ones.
  function mergeOwnMoves(lists) {
    var out = [], seen = Object.create(null), i, j, k, list, m, rec;
    for (i = 0; i < (lists || []).length; i++) {
      list = lists[i] || [];
      for (j = 0; j < list.length; j++) {
        m = list[j];
        k = String((m && m.name) || "").trim().toLowerCase();
        if (!k) continue;
        if (seen[k]) { mergeMoveInto(seen[k], m); continue; }
        rec = {};
        for (var key in m) if (Object.prototype.hasOwnProperty.call(m, key)) rec[key] = m[key];
        seen[k] = rec; out.push(rec);
      }
    }
    return out.sort(function (a, b) { return a.name.localeCompare(b.name); });
  }
  // ⚠ THE OPEN DOCUMENT GOES FIRST, and the decision lives here rather than in the
  // component for the reason `ownFoodsFor` records: in a memo the order is one array
  // literal nobody can drive, and reverting it is invisible to every test.
  function ownMovesFor(doc, savedMoves) {
    return mergeOwnMoves([customMovesFromTemplates([{ detail: { builder: doc } }]), savedMoves || []]);
  }

  // Same matching rule as `searchExercises`, so the two groups in the picker
  // cannot disagree about what a query means.
  function searchCustomMoves(list, q) {
    var s = String(q || "").trim().toLowerCase();
    var all = list || [];
    if (!s) return all.slice(0, 8);
    return all.filter(function (e) {
      return e.name.toLowerCase().indexOf(s) >= 0 || String(e.muscle || "").toLowerCase().indexOf(s) >= 0 || String(e.equipment || "").toLowerCase().indexOf(s) >= 0;
    }).slice(0, 8);
  }

  // ⚠ THE "ADD AS CUSTOM" OFFER IS GATED ON AN EXACT NAME MATCH, not on the result
  // count. It used to render only when the search returned NOTHING, so a coach
  // whose move merely resembled one in the library — "sled drag" against the
  // listed "Sled push" — was handed a list without their move on it and no way to
  // add it. Anything that is not already exactly this name may be created.
  function canCreateMove(name, customMoves) {
    var s = String(name || "").trim();
    if (!s) return false;
    var key = s.toLowerCase();
    if (_BUILTIN[key]) return false;
    var own = customMoves || [];
    for (var i = 0; i < own.length; i++) if (String(own[i].name || "").toLowerCase() === key) return false;
    return true;
  }

  // ── Small factories ────────────────────────────────────────────────────────
  var _uid = 0;
  function uid() { _uid += 1; return "r" + Date.now().toString(36) + "-" + _uid; }
  function newRow(ex) {
    return {
      id: uid(), name: ex ? ex.name : "", muscle: ex ? ex.muscle : "", equipment: ex ? ex.equipment : "",
      sets: 3, reps: "8", loadType: "kg", load: 0, rpe: "", tempo: "", rest: "90s", cue: "", video: "", group: null, progression: null,
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
  // ⚠ THE FALLBACK IS A FALLBACK, and it has to compose the same two axes or a
  // browser that somehow loaded this without `workoutDocument.js` would silently
  // drop every coach's RPE. `WorkoutDoc.loadLabel` is the rule; this mirrors it.
  function fbWeight(row) {
    // An imported free-text load stands in for the weight, never for the RPE —
    // the same rule as ShapeWorkoutDocument.loadLabel, which this must agree with.
    if (row.loadText != null) return String(row.loadText);
    if (row.load == null || row.load === "" || Number(row.load) === 0) return "";
    if (row.loadType === "pct") return row.load + "% 1RM";
    if (row.loadType === "rpe") return "RPE " + row.load;
    return row.load + " " + (row.loadType === "lb" ? "lb" : "kg");
  }
  // ⚠ AND SO DOES THE LADDER. `WorkoutDoc.ladder` is the rule: a blank per-set field
  // inherits the row's own value, the compact "60/70/80 kg" form is used only when
  // every set is a number in the row's unit, and entries past the set count are
  // not delivered. A fallback that printed "60 kg" over a 60/70/80 ladder would be
  // the dropped-RPE defect above in a new place; tests/coach-rpe-axis.test.mjs holds
  // the two equal over one vector set.
  function fbLadder(row) {
    var n = Number(row && row.sets);
    // Number.isInteger, spelled for ES5: Infinity passes `n === Math.floor(n)`.
    n = isFinite(n) && n === Math.floor(n) && n > 0 ? Math.min(n, 50) : 0;
    var raw = row && Array.isArray(row.perSet) ? row.perSet.slice(0, 20) : [];
    var entries = raw.map(function (v) {
      var e = v && typeof v === "object" ? v : {};
      var t = e.load == null ? "" : String(e.load).trim();
      var num = typeof e.load === "number" ? e.load : t === "" ? NaN : Number(t);
      return { reps: (e.reps == null ? "" : String(e.reps)).trim().slice(0, 24), load: isFinite(num) && num >= 0 ? num : "" };
    });
    var any = false;
    for (var k = 0; k < Math.min(n, entries.length); k++) if (entries[k].reps !== "" || entries[k].load !== "") any = true;
    if (!n || !any) return null;
    var unit = row.loadType === "pct" ? "% 1RM" : " " + (row.loadType === "lb" ? "lb" : "kg");
    var baseNum = row.loadText == null && row.loadType !== "rpe" && !(row.load == null || row.load === "") && isFinite(Number(row.load)) && Number(row.load) > 0 ? Number(row.load) : null;
    var reps = [], labels = [], nums = [];
    for (var i = 0; i < n; i++) {
      var e = entries[i] || { reps: "", load: "" };
      reps.push(e.reps !== "" ? e.reps : (row.reps == null ? "" : String(row.reps)).trim());
      if (e.load !== "") { labels.push(e.load === 0 ? "" : e.load + unit); nums.push(e.load === 0 ? null : e.load); }
      else { labels.push(fbWeight(row)); nums.push(baseNum); }
    }
    var same = function (list) { for (var j = 1; j < list.length; j++) if (list[j] !== list[0]) return false; return true; };
    var allNum = true;
    for (var q = 0; q < nums.length; q++) if (nums[q] == null) allNum = false;
    return {
      reps: same(reps) ? reps[0] : reps.map(function (x) { return x || "\u2014"; }).join("/"),
      weight: same(labels) ? labels[0] : allNum ? nums.join("/") + unit : labels.map(function (x) { return x || "\u2014"; }).join(" / "),
    };
  }
  function loadLabel(row) {
    if (WorkoutDoc) return WorkoutDoc.loadLabel(row);
    var parts = [];
    var ladder = fbLadder(row);
    var weight = ladder ? ladder.weight : fbWeight(row);
    if (weight) parts.push(weight);
    var n = Number(row.rpe);
    if (row.loadType !== "rpe" && isFinite(n) && n > 0 && n <= 10) parts.push("RPE " + n);
    return parts.join(" \u00b7 ");
  }
  function repsLabel(row) {
    if (WorkoutDoc) return WorkoutDoc.repsLabel(row);
    var ladder = fbLadder(row);
    return ladder ? ladder.reps : row.reps;
  }
  function schemeLabel(row) {
    var parts = [];
    // The ladder's reps ("8/6/4"), so the preview card shows what each set is for.
    var reps = repsLabel(row);
    if (row.sets && reps) parts.push(row.sets + " × " + reps);
    if (row.tempo) parts.push(row.tempo + " tempo");
    if (row.rest) parts.push(row.rest);
    return parts.join(" · ");
  }

  // Superset labels: rows sharing a group letter get A1/A2/… in list order;
  // ungrouped rows get plain numbering.
  // ⚠ ONE RULE, NOT A SECOND COPY OF IT. `DashSignals.groupLabels` is what the
  // member's own card derives its A1/A2 from, and a builder that numbered rows
  // its own way would put the coach's editor and the client's screen back into
  // disagreement — which is the defect this delegation exists to close.
  function rowLabels(day) {
    var flat = [];
    for (var b = 0; b < day.blocks.length; b++) {
      var rows = day.blocks[b].rows;
      for (var i = 0; i < rows.length; i++) flat.push(rows[i]);
    }
    return Signals.groupLabels(flat);
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
            if (r.loadType === "lb" && r.progression.incLb) r.load = Math.round((Number(r.load) + r.progression.incLb) * 100) / 100;
            else if (r.loadType === "pct" && r.progression.incPct) r.load = Math.min(100, Number(r.load) + r.progression.incPct);
            // ⚠ RPE PROGRESSES ON ITS OWN AXIS NOW, independently of the load's
            //   unit — a week that adds 2.5 kg AND a half point of RPE is an
            //   ordinary block, and keying this on `loadType` made the two
            //   mutually exclusive.
            if (r.progression.incRpe && Number(r.rpe) > 0) r.rpe = Math.min(10, Math.round((Number(r.rpe) + r.progression.incRpe) * 100) / 100);
            // ⚠ A LADDER PROGRESSES SET BY SET. Bumping only the row's own weight
            //   moves the sets that inherit it and leaves every set the coach wrote
            //   standing still, so a 60/70/80 pyramid would flatten a little every
            //   week. A set written as 0 is a set with no weight, and stays one.
            var inc = r.loadType === "kg" ? r.progression.incKg : r.loadType === "lb" ? r.progression.incLb : r.loadType === "pct" ? r.progression.incPct : 0;
            if (inc && Array.isArray(r.perSet)) {
              r.perSet = r.perSet.map(function (e) {
                if (!e || typeof e !== "object" || e.load === "" || e.load == null || !isFinite(Number(e.load)) || Number(e.load) <= 0) return e;
                var v = r.loadType === "pct" ? Math.min(100, Number(e.load) + inc) : Math.round((Number(e.load) + inc) * 100) / 100;
                return Object.assign({}, e, { load: v });
              });
            }
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
          // ⚠ EVERY ROW, NOT ONLY THE GROUPED ONES. `DashWorkoutCard` numbers a
          //   prefix-less row by its ABSOLUTE index, so this preview read
          //   "01 / A1 / A2 / 04" beside an editor reading "01 / A1 / A2 / 02" —
          //   the coach's own two views of one day disagreeing about its numbering.
          prefix: labels[li],
          name: r.name || "Exercise",
          scheme: schemeLabel(r),
          load: loadLabel(r),
          cue: r.cue || "",
          video: WorkoutDoc.videoUrl(r.video),
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
    if (WorkoutDoc) return WorkoutDoc.builderToAssignmentRows(program, templateMeta, startDateISO);
    var start = new Date(startDateISO + "T00:00:00");
    var out = [];
    for (var w = 0; w < program.weeks.length; w++) {
      var days = program.weeks[w].days;
      for (var d = 0; d < days.length; d++) {
        var day = clone(days[d]);
        var date = new Date(start.getTime() + (w * 7 + d) * DAY);
        var exercises = [];
        for (var b = 0; b < day.blocks.length; b++) {
          for (var i = 0; i < day.blocks[b].rows.length; i++) {
            var r = day.blocks[b].rows[i];
            exercises.push({
              name: r.name, sets: String(r.sets), reps: String(r.reps),
              rest: r.rest || "", load: loadLabel(r), tempo: r.tempo || "",
              // ⚠ THE KEY, NEVER THE LABEL. This fallback wrote `labels[li]`
              // ("A1"/"A2") into the one field the player pairs on, so the two
              // halves of a superset stopped matching and full rest came back
              // between them. Unreachable on today's two hosts (both load
              // workoutDocument.js first), which is why nothing caught it.
              cue: r.cue || "", group: Signals.groupKey(r.group),
              block: day.blocks[b].kind,
            });
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

  // ── The library's filters ───────────────────────────────────────────────────
  // ⚠ EVERY FILTER READS SOMETHING THE COACH ACTUALLY SET. The row this replaces
  // filtered on `goalTag`, and nothing anywhere lets a coach choose that: `newProgram`
  // writes "strength" and so does the importer (workoutDocument.js), so on a real
  // library Cut, Hypertrophy, Return to gym and 5k prep matched nothing, ever — they
  // only ever matched the demo. Everything below is derived from what the coach
  // already built (the moves, the weeks, the publish state) or from `builder.tags`,
  // which the builder's own tag picker writes.
  // ⚠ `goalTag` IS DELIBERATELY NOT READ AS A TAG. Carrying it over would tag every
  // program the coach has ever made "Strength" — the same fabrication in a new place.

  // Tags a coach chooses: Shape's five goals plus their own words.
  var TAG_MAX_LEN = 32, TAG_MAX = 12;
  // A coach's own tag takes one of these, picked by a hash of its text, so a tag reads
  // the same colour on every card and in every row with nothing stored. They sit in
  // GOAL_TAGS' register (dark-paper colours); the chip mixes each with the paper's ink
  // (dash.css `--sh-tag-ink-mix`) so its text clears AA on both papers.
  var TAG_PALETTE = ["#e0884b", "#e05ea8", "#5e8ee0", "#a9c25a", "#c77dd6", "#c8a86e"];
  // Keyed by a built-in's KEY and by its label, so "strength", "Strength" and
  // "5K PREP" all resolve to the goal they name. Null-prototype: a tag is a string a
  // coach types, and a plain object would answer for "constructor".
  var _BUILTIN_TAG = (function () {
    var m = Object.create(null);
    for (var i = 0; i < GOAL_TAGS.length; i++) { m[GOAL_TAGS[i].key] = GOAL_TAGS[i]; m[GOAL_TAGS[i].label.toLowerCase()] = GOAL_TAGS[i]; }
    return m;
  })();
  function tagText(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }
  // One stored spelling per tag: a built-in's KEY, or the coach's own words as they
  // typed them (trimmed and capped). A label that names a built-in becomes that
  // built-in rather than a look-alike of it.
  function normalizeTag(s) {
    if (typeof s !== "string") return null;
    var t = tagText(s);
    if (!t) return null;
    var b = _BUILTIN_TAG[t.toLowerCase()];
    if (b) return b.key;
    return tagText(t.slice(0, TAG_MAX_LEN)) || null;
  }
  // `builder.tags` is client-written jsonb, so everything is checked on the way in:
  // strings only, one copy per tag ignoring case, and never more than TAG_MAX.
  function normalizeTags(raw) {
    var out = [], seen = Object.create(null);
    var list = Array.isArray(raw) ? raw : [];
    for (var i = 0; i < list.length && out.length < TAG_MAX; i++) {
      var t = normalizeTag(list[i]);
      if (!t) continue;
      var k = t.toLowerCase();
      if (seen[k]) continue;
      seen[k] = true;
      out.push(t);
    }
    return out;
  }
  function tagInfo(t) {
    var text = tagText(t);
    var b = _BUILTIN_TAG[text.toLowerCase()];
    if (b) return { key: b.key, label: b.label, c: b.c, builtin: true };
    var lower = text.toLowerCase(), h = 0;
    for (var i = 0; i < lower.length; i++) h = (h * 31 + lower.charCodeAt(i)) | 0;
    return { key: "tag:" + lower, label: text, c: TAG_PALETTE[Math.abs(h) % TAG_PALETTE.length], builtin: false };
  }
  function programTags(template) {
    var b = template && template.detail && template.detail.builder;
    return normalizeTags(b && b.tags);
  }
  // Every tag of the coach's own, across their saved programs — derived, like their
  // own moves, so a tag they stop using simply stops being offered.
  function customTagsFromTemplates(templates) {
    var seen = Object.create(null), out = [];
    var list = templates || [];
    for (var i = 0; i < list.length; i++) {
      var tags = programTags(list[i]);
      for (var j = 0; j < tags.length; j++) {
        var info = tagInfo(tags[j]);
        if (info.builtin || seen[info.key]) continue;
        seen[info.key] = true;
        out.push(info.label);
      }
    }
    return out.sort(function (a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); });
  }

  // What a row trains and needs. The row's own descriptor wins; a row that carries none
  // — every move a coach adds themselves, and every row the mobile editor writes — is
  // recognised BY NAME from Shape's list, because the name is what identifies it there.
  // A row that is neither stays unknown: it adds no focus, and it stops a program from
  // being counted as needing no gym.
  var _EXERCISE_BY_NAME = (function () { var m = Object.create(null); for (var i = 0; i < EXERCISES.length; i++) m[EXERCISES[i].name.toLowerCase()] = EXERCISES[i]; return m; })();
  function rowKit(row) {
    var lib = _EXERCISE_BY_NAME[tagText(row && row.name).toLowerCase()];
    return {
      muscle: (tagText(row && row.muscle) || (lib ? lib.muscle : "")).toLowerCase(),
      equipment: (tagText(row && row.equipment) || (lib ? lib.equipment : "")).toLowerCase(),
    };
  }
  function has(map, k) { return !!k && Object.prototype.hasOwnProperty.call(map, k); }
  var REGION_OF = {
    quads: "lower", hamstrings: "lower", glutes: "lower", calves: "lower", "posterior chain": "lower",
    chest: "upper", shoulders: "upper", back: "upper", traps: "upper", biceps: "upper", triceps: "upper",
    core: "core", conditioning: "conditioning", mobility: "mobility",
  };
  // "Home" is named, not inferred: the equipment a client can be expected to own.
  var HOME_KIT = { bodyweight: 1, none: 1, band: 1, dumbbell: 1, kettlebell: 1, rope: 1, wheel: 1, box: 1 };
  var BODYWEIGHT_KIT = { bodyweight: 1, none: 1 };
  var BARBELL_KIT = { barbell: 1, "trap bar": 1 };
  var MACHINE_KIT = { machine: 1, cable: 1 };
  var CARDIO_KIT = { sled: 1, rower: 1, bike: 1 };

  // Every row of a program. Guarded at every level for the reason customMovesFromTemplates
  // gives: this runs inside the library render, where a throw is a blank page.
  function programRows(builder) {
    var out = [], weeks = (builder && Array.isArray(builder.weeks)) ? builder.weeks : [];
    for (var w = 0; w < weeks.length; w++) {
      var days = (weeks[w] && weeks[w].days) || [];
      for (var d = 0; d < days.length; d++) {
        var blocks = (days[d] && days[d].blocks) || [];
        for (var bi = 0; bi < blocks.length; bi++) {
          var rows = (blocks[bi] && blocks[bi].rows) || [];
          for (var ri = 0; ri < rows.length; ri++) if (rows[ri]) out.push(rows[ri]);
        }
      }
    }
    return out;
  }
  function lengthBucket(weeks) { return weeks <= 1 ? "1" : weeks <= 4 ? "2-4" : weeks <= 8 ? "5-8" : "9+"; }
  function daysBucket(n) { return n >= 6 ? "6+" : String(n); }

  // The facts one program answers each filter with. `usage` is { clients, capped } when
  // the library has read who is on each program, and null when it has not — which is
  // not the same as "on nobody's calendar", so an unknown usage answers nothing.
  function programFacts(template, usage) {
    var t = template || {};
    var detail = t.detail || {};
    var b = detail.builder || {};
    var weeks = Array.isArray(b.weeks) ? b.weeks : [];
    var perWeek = weeks[0] && Array.isArray(weeks[0].days) ? weeks[0].days.length : 0;
    var rows = programRows(b);
    var regions = Object.create(null);
    var home = rows.length > 0, bodyweight = rows.length > 0, barbell = false, machines = false, cardio = false;
    for (var i = 0; i < rows.length; i++) {
      var kit = rowKit(rows[i]);
      if (has(REGION_OF, kit.muscle)) regions[REGION_OF[kit.muscle]] = true;
      if (!has(HOME_KIT, kit.equipment)) home = false;
      if (!has(BODYWEIGHT_KIT, kit.equipment)) bodyweight = false;
      if (has(BARBELL_KIT, kit.equipment)) barbell = true;
      if (has(MACHINE_KIT, kit.equipment)) machines = true;
      if (has(CARDIO_KIT, kit.equipment)) cardio = true;
    }
    var focus = ["lower", "upper", "core", "conditioning", "mobility"].filter(function (k) { return regions[k]; });
    if (regions.lower && regions.upper) focus.push("full");
    var equipment = [];
    if (home) equipment.push("home");
    if (bodyweight) equipment.push("bodyweight");
    if (barbell) equipment.push("barbell");
    if (machines) equipment.push("machines");
    if (cardio) equipment.push("cardio");
    var tags = programTags(t).map(tagInfo);
    var clients = usage && Number(usage.clients) > 0 ? Math.floor(Number(usage.clients)) : 0;
    // ⚠ A CAPPED READ CAN ONLY UNDER-COUNT, so it may say "in use" and never "not in use".
    var use = !usage ? [] : clients > 0 ? ["in-use"] : usage.capped ? [] : ["idle"];
    return {
      search: tagText(t.name).toLowerCase(),
      keys: {
        type: [detail.buildType === "workout" ? "single" : "program"],
        length: weeks.length ? [lengthBucket(weeks.length)] : [],
        days: perWeek ? [daysBucket(perWeek)] : [],
        focus: focus,
        equipment: equipment,
        status: [t.published ? "published" : "draft"],
        use: use,
        tags: tags.map(function (x) { return x.key; }),
      },
      info: { weeks: weeks.length, perWeek: perWeek, moves: rows.length, focus: focus, equipment: equipment, tags: tags, clients: usage ? clients : null },
    };
  }

  var FOCUS_LABELS = { lower: "Lower body", upper: "Upper body", full: "Full body", core: "Core", conditioning: "Conditioning", mobility: "Mobility" };
  var EQUIPMENT_LABELS = { home: "Home", bodyweight: "Bodyweight only", barbell: "Barbell", machines: "Machines & cables", cardio: "Sled, rower or bike" };
  // The filters, in the order the bar shows them. Tags are built per library (their
  // options are the coach's own), so `programTagFacet` supplies that one.
  var PROGRAM_FACETS = [
    { key: "type", label: "Type", options: [{ key: "single", label: "Single day" }, { key: "program", label: "Program" }] },
    { key: "length", label: "Length", options: [{ key: "1", label: "1 week" }, { key: "2-4", label: "2–4 weeks" }, { key: "5-8", label: "5–8 weeks" }, { key: "9+", label: "9+ weeks" }] },
    { key: "days", label: "Days / week", help: "How many sessions the first week holds.",
      options: [{ key: "1", label: "1 day" }, { key: "2", label: "2 days" }, { key: "3", label: "3 days" }, { key: "4", label: "4 days" }, { key: "5", label: "5 days" }, { key: "6+", label: "6–7 days" }] },
    { key: "focus", label: "Focus", help: "The muscles the moves train. A move you added yourself has none recorded, so it adds nothing here.",
      options: ["lower", "upper", "full", "core", "conditioning", "mobility"].map(function (k) { return { key: k, label: FOCUS_LABELS[k] }; }) },
    { key: "equipment", label: "Equipment", help: "What the moves need. Home means nothing beyond bodyweight, bands, dumbbells, kettlebells, a jump rope, an ab wheel or a box — and a move you added yourself has no equipment recorded, so a program with one is never counted as Home.",
      options: ["home", "bodyweight", "barbell", "machines", "cardio"].map(function (k) { return { key: k, label: EQUIPMENT_LABELS[k] }; }) },
    { key: "status", label: "Status", options: [{ key: "published", label: "Published" }, { key: "draft", label: "Draft" }] },
    { key: "use", label: "In use", help: "On a client’s calendar today or later.",
      // Yes / No, so a chosen filter reads "In use · Yes" rather than naming itself twice.
      options: [{ key: "in-use", label: "Yes" }, { key: "idle", label: "No" }] },
  ];
  // Shape's five goals always, then the coach's own tags from their library.
  function programTagFacet(templates) {
    var own = customTagsFromTemplates(templates).map(tagInfo);
    return {
      key: "tags", label: "Tags",
      options: GOAL_TAGS.map(function (g) { return { key: g.key, label: g.label, c: g.c }; })
        .concat(own.map(function (x) { return { key: x.key, label: x.label, c: x.c }; })),
    };
  }

  // ── Demo templates + performance (signed-out / API-down fallback) ─────────
  function demoTemplates() {
    var mk = function (name, goalTag, weeks) {
      // The preview's programs carry the tag their names already promise, so the demo
      // shows what the tag row does — on a real library every tag is one the coach chose.
      return { id: "demo-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: name, published: true, detail: { builder: { version: 3, goalTag: goalTag, tags: [goalTag], weeks: weeks } } };
    };
    var row = function (name, muscle, equipment, sets, reps, loadType, load, tempo, rest, cue, group, prog) {
      // ⚠ THROUGH THE SAME MIGRATION THE STORED DOCUMENTS TAKE. These demo rows
      //   never pass through `normalizeWorkoutDetail`, so a hand-written
      //   `loadType:'rpe'` here would be the one place in the app still carrying
      //   the retired shape — visible, in the demo a coach is shown first.
      var made = { id: uid(), name: name, muscle: muscle, equipment: equipment, sets: sets, reps: reps, loadType: loadType, load: load, rpe: "", tempo: tempo, rest: rest, cue: cue, group: group || null, progression: prog || null };
      // The METHOD is tested, not only the module: a stale cached copy of the
      // document module has the object and not this function.
      return WorkoutDoc && typeof WorkoutDoc.splitLegacyRpe === "function" ? WorkoutDoc.splitLegacyRpe(made) : made;
    };
    var strengthW1 = {
      deload: false,
      days: [
        { name: "Lower Push", playlist: { name: "Lower Push — Peak", meta: "95–138 BPM · 14 tracks" }, blocks: [
          { kind: "warmup", rows: [row("Hip 90/90 flow", "Mobility", "Bodyweight", 2, "5 ea", "kg", 0, "", "30s", "Slow — own every position", null)] },
          { kind: "main", rows: [
            // The preview shows a ladder, so a coach meets per-set targets where they
            // will use them: 5/5/5/3 at 100/105/110/115, set 3 inheriting the row.
            Object.assign(row("Back squat", "Quads", "Barbell", 4, "5", "kg", 110, "31X1", "150s", "Brace before the walkout", null, { rule: "all-reps", incKg: 2.5 }),
              { perSet: [{ load: 100 }, { load: 105 }, {}, { reps: "3", load: 115 }] }),
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
    customMovesFromTemplates: customMovesFromTemplates, mergeMoveInto: mergeMoveInto,
    mergeOwnMoves: mergeOwnMoves, ownMovesFor: ownMovesFor,
    searchCustomMoves: searchCustomMoves,
    canCreateMove: canCreateMove,
    newRow: newRow, newDay: newDay, newWeek: newWeek, newProgram: newProgram,
    loadLabel: loadLabel, repsLabel: repsLabel, schemeLabel: schemeLabel, rowLabels: rowLabels,
    applyProgression: applyProgression, deloadWeek: deloadWeek,
    dayToClientCard: dayToClientCard, buildAssignmentRows: buildAssignmentRows,
    demoTemplates: demoTemplates, demoPerformance: demoPerformance,
    TAG_MAX: TAG_MAX, TAG_MAX_LEN: TAG_MAX_LEN, TAG_PALETTE: TAG_PALETTE,
    normalizeTag: normalizeTag, normalizeTags: normalizeTags, tagInfo: tagInfo, programTags: programTags,
    customTagsFromTemplates: customTagsFromTemplates, rowKit: rowKit, programFacts: programFacts,
    PROGRAM_FACETS: PROGRAM_FACETS, programTagFacet: programTagFacet,
  };
});
