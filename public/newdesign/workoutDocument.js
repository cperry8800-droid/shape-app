// Shared, lossless workout document used by both coach editors and delivery.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ShapeWorkoutDocument = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const copy = value => JSON.parse(JSON.stringify(value));
  const text = value => value == null ? '' : String(value);
  const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const videoUrl = value => {
    const url = typeof value === 'string' ? value : value && value.url;
    return /^https?:\/\//i.test(text(url).trim()) ? text(url).trim() : '';
  };
  // The superset key. ⚠ ONE RULE FOR EVERY COMPARISON, because there were two
  // and they disagreed: the session player's navigation (`bsNextSessionMove`)
  // TRIMMED the key while its rest decision compared it RAW — so 'A' and 'A '
  // (reachable from the mobile editor's free-text field) jumped the member to
  // the partner AND made them sit a full rest, the one combination no coach
  // authors. Case was significant everywhere, so 'A' and 'a' were two groups
  // to the labels and to the player while reading as one pair to the coach.
  // A superset key is a letter label; whitespace and case carry no meaning. A
  // finite number keeps its digits; anything else (a boolean, an object) is NO
  // key — `text()` would have turned `false` into a group called "FALSE".
  // ⚠ DashSignals.groupKey restates this for pages that load only that module;
  // tests/coach-superset-labels.test.mjs holds the two equal over one vector set.
  const supersetKey = value => typeof value === 'string' ? value.trim().toUpperCase()
    : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
  // The block a coach put a move in, as a key the member's surfaces can name.
  // ⚠ `builderToAssignmentRows` HAS STAMPED `block` ON EVERY EXERCISE SINCE IT WAS
  // WRITTEN, and nothing downstream read it: the member's plan route dropped it from
  // its whitelist, and the app's workout preview invented "Warm-up / Main set /
  // Cool-down" around every move instead (owner, 2026-10-07: "Apply all the fixes").
  // Only the builder's own kinds are a block; anything else (an older assignment, a
  // hand-built payload, a stray value) is NO block, so the reader falls back to one
  // plain list rather than a heading nobody wrote. DashBuilder.BLOCK_KINDS carries
  // the coach-facing labels; tests/builder-fixes-client.test.mjs holds the two lists equal.
  const BLOCK_KINDS = ['warmup', 'main', 'accessory', 'finisher'];
  const blockKind = value => {
    const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return BLOCK_KINDS.includes(key) ? key : '';
  };
  // ⚠ RPE IS ITS OWN AXIS, NOT A UNIT OF LOAD. It was the fourth `loadType`, which
  // made it EXCLUSIVE with a weight: a coach could prescribe 100 kg or RPE 8 and
  // never "100 kg @ RPE 8" — the ordinary thing a strength coach writes. Owner:
  // "if i want RPE, that should be a seperate drop down from KG or IBS".
  // The scale is 1–10, so 0, '' and null all mean "not prescribed", and anything
  // unparseable is not a reading. A row may now carry both, one, or neither.
  const rpeValue = row => {
    const n = Number(row && row.rpe);
    return Number.isFinite(n) && n > 0 && n <= 10 ? n : null;
  };
  // Legacy rows stored RPE as the load. ⚠ THE MIGRATION IS ON READ, not in the
  // database: `normalizeWorkoutPlan` runs on every GET, POST and PATCH of a coach
  // plan and on every mobile library read, so a stored document is converted the
  // first time it is looked at and persisted the next time it is saved.
  function splitLegacyRpe(row) {
    if (!row || row.loadType !== 'rpe') return row;
    const n = Number(row.load);
    return {...row, loadType:'kg', load:'', rpe:Number.isFinite(n) && n > 0 ? n : (row.rpe == null ? '' : row.rpe)};
  }
  // The row's own WEIGHT, without its RPE: the imported free text when there is
  // one, else the number and its unit, else nothing. Split out of `loadLabel` so a
  // set that inherits the row's weight reads exactly what the row itself says.
  function weightLabel(row) {
    // ⚠ AN IMPORTED FREE-TEXT LOAD ("bodyweight", "heavy") STANDS IN FOR THE WEIGHT,
    // NOT FOR THE WHOLE PRESCRIPTION. It returned early, so a target RPE on an
    // imported row never reached the label — and the editors then cleared the text
    // whenever RPE changed, to make room, which threw away the coach's own
    // instruction. The text and the RPE are separate axes, like a weight and RPE.
    if (row.loadText != null) return text(row.loadText);
    if (row.load == null || row.load === '' || Number(row.load) === 0) return '';
    if (row.loadType === 'pct') return row.load + '% 1RM';
    // ⚠ THE LEGACY ARM STAYS, and is what stops "RPE 8 · RPE 8" on a row that
    // has not passed through `splitLegacyRpe` yet — a demo template, or a
    // document read by an older build. Belt and braces beside the migration.
    if (row.loadType === 'rpe') return 'RPE ' + row.load;
    return row.load + ' ' + (row.loadType === 'lb' ? 'lb' : 'kg');
  }
  // ⚠ PER-SET TARGETS: THE FULL LADDER. Owner: "i also should be able to customize
  // as a coach the numbers of reps for each set and weight if I want to". The pick
  // was a full ladder, e.g. Back squat 3 × 8/6/4 · 60/70/80 kg.
  // A row may carry `perSet`, one `{reps, load}` entry per set, in order.
  // ⚠ A BLANK FIELD INHERITS THE ROW'S OWN VALUE. A coach who writes 8 reps @ 60 kg
  // on the row and fills in only sets 2 and 3 has written exactly what they meant,
  // and a row with no entries is the row it always was. The unit is the row's
  // `loadType` and the RPE stays the row's: one axis each, as before.
  const LADDER_MAX = 20;
  // The longest set's reps a ladder keeps. Both editors cap their field at this, so
  // what a coach types is what is saved: a field that took more would have been cut
  // here, silently, on save.
  const SET_REPS_MAX = 24;
  function ladderEntry(value) {
    const e = value && typeof value === 'object' ? value : {};
    const raw = typeof e.load === 'number' ? e.load : text(e.load).trim() === '' ? NaN : Number(text(e.load).trim());
    return {reps:text(e.reps).trim().slice(0, SET_REPS_MAX), load:Number.isFinite(raw) && raw >= 0 ? raw : ''};
  }
  function perSetEntries(row) {
    return (row && Array.isArray(row.perSet) ? row.perSet.slice(0, LADDER_MAX) : []).map(ladderEntry);
  }
  // The stored ladder, cleaned: at most LADDER_MAX entries, each field a rep text or
  // a non-negative number, trailing blank entries dropped (a blank entry inherits,
  // so a run of them at the end says nothing), and null when nothing is left, so a
  // row that never had a ladder does not grow an empty one.
  // ⚠ ENTRIES PAST THE SET COUNT ARE KEPT, never trimmed to `sets`. A coach editing
  // the sets field passes through '' on the way from 3 to 5 and through "1" on the
  // way to "12"; trimming there would destroy entries they are about to see again.
  // Delivery reads only the first `sets`, so a hidden entry reaches nobody.
  function normalizePerSet(value) {
    if (!Array.isArray(value)) return null;
    const list = value.slice(0, LADDER_MAX).map(ladderEntry);
    while (list.length && list[list.length - 1].reps === '' && list[list.length - 1].load === '') list.pop();
    return list.length ? list : null;
  }
  const loadUnitSuffix = row => row.loadType === 'pct' ? '% 1RM' : ' ' + (row.loadType === 'lb' ? 'lb' : 'kg');
  // One set's target: its own entry where the coach wrote one, the row's where not.
  // `label` is that set's weight WITHOUT the RPE (the row prints the RPE once);
  // `num` is the weight as a number when the label is one, so a ladder of numbers
  // can be written compactly ("60/70/80 kg") and anything else in full.
  function setTarget(row, i) {
    const e = perSetEntries(row)[i] || {reps:'', load:''};
    const reps = e.reps !== '' ? e.reps : text(row.reps).trim();
    if (e.load !== '') return {reps, label:e.load === 0 ? '' : e.load + loadUnitSuffix(row), num:e.load === 0 ? null : e.load};
    const base = row.loadText == null && row.loadType !== 'rpe' && !(row.load == null || row.load === '') && Number.isFinite(Number(row.load)) && Number(row.load) > 0 ? Number(row.load) : null;
    return {reps, label:weightLabel(row), num:base};
  }
  const setCount = row => {
    const n = Number(row && row.sets);
    return Number.isInteger(n) && n > 0 ? Math.min(n, 50) : 0;
  };
  // The ladder a row prescribes, or null when it has none: every set's target, and
  // the reps and the weight written the way a coach writes them — "8/6/4" and
  // "60/70/80 kg" — collapsing to the one value when every set agrees.
  // ⚠ NULL UNLESS AN ENTRY INSIDE THE SET COUNT SAYS SOMETHING. A row whose only
  // entries sit past `sets` is delivered as the straight sets it now is.
  function ladder(row) {
    const n = setCount(row);
    if (!n || !perSetEntries(row).slice(0, n).some(e => e.reps !== '' || e.load !== '')) return null;
    const sets = Array.from({length:n}, (_, i) => setTarget(row, i));
    const same = list => list.every(x => x === list[0]);
    const reps = sets.map(x => x.reps);
    const labels = sets.map(x => x.label);
    return {
      sets,
      reps:same(reps) ? reps[0] : reps.map(x => x || '—').join('/'),
      // ⚠ THE COMPACT FORM NEEDS EVERY SET TO BE A NUMBER IN THE ROW'S UNIT. A set
      // with no weight, or one inheriting an imported "bodyweight", is written in
      // full ("— / 70 kg / 80 kg"), so each weight still carries its own unit.
      weight:same(labels) ? labels[0] : sets.every(x => x.num != null) ? sets.map(x => x.num).join('/') + loadUnitSuffix(row) : labels.map(x => x || '—').join(' / '),
    };
  }
  function repsLabel(row) {
    const l = ladder(row);
    return l ? l.reps : text(row.reps);
  }
  function loadLabel(row) {
    const parts = [];
    const l = ladder(row);
    const weight = l ? l.weight : weightLabel(row);
    if (weight) parts.push(weight);
    const rpe = rpeValue(row);
    if (rpe != null && row.loadType !== 'rpe') parts.push('RPE ' + rpe);
    return parts.join(' · ');
  }
  // ⚠ THE OUTLINE PARSER'S UNIT LIST, COPIED. What makes a rep value a hold or a
  // distance is one rule, whose home is BS_TIME_DISTANCE_UNITS in the mobile app's
  // planOutline.mjs, and a plain browser script cannot import it. So this file keeps its
  // own copy, split into the two families it reads differently, and
  // tests/unit-rule-readers.test.mjs fails the moment the two lists drift.
  const TIME_UNITS = 's|secs?|seconds?|mins?|minutes?';
  const DISTANCE_UNITS = 'm|km|mi|yds?|yards?';
  const TIME_DISTANCE_UNITS = TIME_UNITS + '|' + DISTANCE_UNITS;
  // The unit after a rep number, three ways:
  // ⚠ A WHOLE NUMBER'S TIME UNIT READS EXACTLY AS IT ALWAYS HAS: the longest unit word
  // that follows, with nothing checked after it, so "30s/side", "30s/45s" and
  // "30 min/km" keep their readings. That needs the longer spellings tried first, so
  // the list is sorted here rather than rewritten out of the parser's order. ⚠ It still
  // reads a word that starts with a unit as one ("3 × 10 sets" is "10 s" and a load of
  // "ets"), as it did before this list came here. Registered, not changed here.
  // A decimal part is the parser's, and new here ("1.5 min"), so it takes one check: no
  // letter may follow the unit. That keeps it from changing another reading ("1.5 sets"
  // is still 1 and a load of ".5 sets"), and it is also what lets this branch keep the
  // parser's order: without it "1.5 seconds" would read as "1.5 s".
  // ⚠ THE DISTANCE UNITS ARE NEW HERE AND TAKE THE PARSER'S OWN RULE: the unit ends the
  // value (the end, a space, " · ", a comma or a semicolon), or this reader's own
  // "/side" follows it. So "40 m · 32 kg" is 40 m with a load of 32 kg, while a speed
  // ("10 m/s"), a word ("max", "mph", "meters") and a unit run into a list ("40 m/40 m",
  // "400m-800m") read exactly as they did before. A speed written with spaces
  // ("10 m / s") is 10 m and a load of "/ s", in the parser as here: the unit ends the
  // value, which is all the rule can see.
  const TIME_LONGEST_FIRST = TIME_UNITS.split('|').sort((a, b) => b.length - a.length).join('|');
  const REP_UNIT = String.raw`(?:\s*(?:${TIME_LONGEST_FIRST})|\.\d+\s*(?:${TIME_UNITS})(?![a-z])|(?:\.\d+)?\s*(?:${DISTANCE_UNITS})(?=$|[\s·,;]|\/\s*(?:side|leg)\b))`;
  // Repetitions can be timed, a distance or effort-based. Preserve the authored token;
  // parsing only its numeric prefix changed "30s" into 30 repetitions and moved
  // "AMRAP" into the load field.
  const SCHEME = new RegExp(String.raw`(\d+)\s*[×x]\s*((?:\d+(?:[–-]\d+)?${REP_UNIT}?|AMRAP|to\s+failure|max)(?:\s*(?:ea(?:ch)?|per\s+(?:side|leg)|\/\s*(?:side|leg)))?)`, 'i');
  function rowFromBlock(block, id) {
    const b = typeof block === 'object' && block ? block : {text:block};
    const raw = text(b.text).trim();
    const split = raw.match(/^(.*?)\s*[—–:]\s*(.+)$/);
    const parts = split ? [split[1], split[2]] : raw.split(/\s*·\s*/);
    const tail = parts.slice(1).join(' · ');
    const scheme = tail.match(SCHEME);
    const loadText = b.load != null ? text(b.load) : tail.replace(scheme ? scheme[0] : /$^/, '').replace(/^[\s·,]+|[\s·,]+$/g, '');
    const numeric = loadText.match(/^([\d.]+)\s*(kg|lbs?|%\s*1RM)$/i);
    const effort = loadText.match(/^RPE\s*([\d.]+)$/i);
    return {
      ...copy(b), id:b.id || id, name:b.name || parts[0] || 'Exercise',
      sets:b.sets != null ? b.sets : (scheme ? Number(scheme[1]) : ''),
      reps:b.reps != null ? text(b.reps) : (scheme ? scheme[2] : ''),
      loadType:b.loadType || (numeric ? (numeric[2].toLowerCase().startsWith('lb') ? 'lb' : numeric[2].startsWith('%') ? 'pct' : 'kg') : effort ? 'rpe' : 'kg'),
      load:numeric ? Number(numeric[1]) : effort ? Number(effort[1]) : b.loadType && Number.isFinite(Number(b.load)) ? Number(b.load) : typeof b.load === 'number' ? b.load : 0,
      ...(b.loadType || numeric || effort ? {} : {loadText}),
      rest:text(b.rest), tempo:text(b.tempo), cue:text(b.cue), group:b.group || null,
      video:videoUrl(b.video), muscle:text(b.muscle), equipment:text(b.equipment),
    };
  }
  // A row with its ladder cleaned, or with no `perSet` key at all when nothing in
  // it says anything — never an empty array beside a row that has no ladder.
  function withLadder(row) {
    if (!row || !('perSet' in row)) return row;
    const {perSet, ...rest} = row;
    const clean = normalizePerSet(perSet);
    return clean ? {...rest, perSet:clean} : rest;
  }
  // The markers a row can carry for the program's progression, kept only in the shape
  // they are written in: `loadPinned` and `rpePinned` are true or absent, `deloadFrom`
  // is the set count a deload cut, or absent.
  function withProgressionMarks(row) {
    if (!row || (!('loadPinned' in row) && !('rpePinned' in row) && !('deloadFrom' in row))) return row;
    const {loadPinned, rpePinned, deloadFrom, ...rest} = row;
    const from = Number(deloadFrom);
    return {...rest, ...(loadPinned === true ? {loadPinned:true} : {}), ...(rpePinned === true ? {rpePinned:true} : {}), ...(text(deloadFrom).trim() !== '' && Number.isFinite(from) && from > 0 ? {deloadFrom} : {})};
  }
  // A row with its hand-typed marks taken off: 'load', 'rpe', or both when no axis is
  // named. What "Follow the progression" does, and what a copied day or week starts as
  // (a value typed by hand for the source's week is not one for the copy's).
  function unpinned(row, axis) {
    if (!row) return row;
    const {loadPinned, rpePinned, ...rest} = row;
    if (axis === 'load') return 'rpePinned' in row ? {...rest, rpePinned} : rest;
    if (axis === 'rpe') return 'loadPinned' in row ? {...rest, loadPinned} : rest;
    return rest;
  }

  // ── Deload weeks ───────────────────────────────────────────────────────────
  // A deload keeps 60% of each move's sets, at least one: the week tools' rule, which the
  // program's progression now also applies on its deload weeks.
  // ⚠ THE CUT REMEMBERS WHAT IT CUT (`deloadFrom`), so taking the deload off gives the
  // sets back. It used to leave them cut, which a cadence cannot live with: moving "deload
  // every 4th week" to every 5th would have left week 4 short of sets with no deload flag
  // to say why. A set count the coach changed during the deload is theirs and stays.
  const DELOAD_SHARE = 0.6;
  function deloadedSets(sets) {
    const n = Number(sets);
    return text(sets).trim() !== '' && Number.isFinite(n) && n > 0 ? Math.max(1, Math.round(n * DELOAD_SHARE)) : null;
  }
  const eachRow = (week, fn) => {
    for (const day of week.days || []) for (const block of day.blocks || []) block.rows = (block.rows || []).map(fn);
  };
  // ⚠ A DELOAD WEEK SAVED BEFORE THE CUT REMEMBERED ANYTHING IS NOT ONE THIS MODULE CUT.
  // It carries `deload: true` over sets that are ALREADY cut and no `deloadFrom` to give
  // them back (Codex P1, #2230). Cutting it again would take 40% off what is left, and
  // taking its flag off would leave a short week that no longer says why. So a week this
  // module deloads says so (`deloadCut`), a row's `deloadFrom` says the same of a week cut
  // before the marker existed, and a deload week with neither is a legacy one: it stays
  // marked and is never cut again, and only the coach takes its flag off (the week's own
  // Deload), knowing its sets stay as they are.
  const anyRow = (week, test) => (week.days || []).some(d => (d.blocks || []).some(b => (b.rows || []).some(r => r && test(r))));
  function legacyDeload(week) {
    return !!week && week.deload === true && week.deloadCut !== true && !anyRow(week, r => r.deloadFrom != null);
  }
  // ⚠ IDEMPOTENT, AND RUN ON EVERY DELOAD WEEK THE CADENCE NAMES, not only on the weeks it
  // turns into deloads: a move or a saved day added to a deload week after it was cut has
  // no `deloadFrom`, and is cut here like the rest (Codex P1, #2230). A row that already
  // remembers its cut is the coach's from then on, so its sets are never cut twice.
  function deloadWeek(week) {
    const next = copy(week);
    if (legacyDeload(week)) return next;
    next.deload = true;
    next.deloadCut = true;
    eachRow(next, row => {
      if (!row || row.deloadFrom != null) return row;
      const cut = deloadedSets(row.sets);
      return cut == null ? row : {...row, deloadFrom:row.sets, sets:cut};
    });
    return next;
  }
  function undeloadWeek(week) {
    const next = copy(week);
    next.deload = false;
    delete next.deloadCut;
    eachRow(next, row => {
      if (!row || row.deloadFrom == null) return row;
      const {deloadFrom, ...rest} = row;
      return Number(rest.sets) === deloadedSets(deloadFrom) ? {...rest, sets:deloadFrom} : rest;
    });
    return next;
  }

  // ── The program's progression ──────────────────────────────────────────────
  // Owner, 2026-10-07 (the builder plan, step 3): "+5 lb a week on main lifts, deload in
  // week 4", set once for the program. It replaces the per-move checkbox whose increments
  // were fixed in code and applied only when a week was copied with Progress.
  //   builder.progression = { amount: 5, unit: 'lb'|'kg'|'pct', kinds: ['main'], deloadEvery: 0|N }
  // ⚠ THE RULE IS WRITTEN INTO THE WEEKS, NOT APPLIED AT DELIVERY. `applyProgramProgression`
  // sets each later week's loads in the document itself, so every reader gets week N's real
  // load without knowing the rule exists: the assign flow, "Update future workouts" (whose
  // route lifts ONE day out of its week and so could never apply a per-week rule), the app's
  // editor and library, and Nora. The rule is kept beside the weeks so the bar can show it
  // and the builder can keep the weeks in step when week 1 changes.
  // ⚠ UNITS ARE NEVER CONVERTED. A rule in lb moves only moves typed in lb; a move in kg is
  // left as the coach wrote it, and the bar says how many were left.
  const PROGRESSION_UNITS = ['kg', 'lb', 'pct'];
  const round2 = n => Math.round(n * 100) / 100;
  // ── The RPE climb ──
  // Owner, 2026-10-07: "There's no progression for RPE." An optional part of the same rule:
  //   progression.rpe = { step: 0.5, cap: 9 }   "RPE +0.5 a week, up to 9"
  // ⚠ EVERY RPE IT WRITES IS ONE BOTH EDITORS CAN SHOW. Their select offers 1–10 in half
  // points (plus a stored off-list value), so the step and the cap are kept on that grid:
  // a step of 0.5 to 2, a cap of 1 to 10. A week-1 RPE on the grid therefore climbs on it,
  // and nothing the rule writes is ever above 10 or below week 1's own RPE.
  const halfPoint = n => Math.round(n * 2) / 2;
  function normalizeRpeClimb(value) {
    if (!value || typeof value !== 'object') return null;
    const step = halfPoint(Number(value.step));
    if (!Number.isFinite(step) || step < 0.5) return null;
    const asked = text(value.cap).trim() === '' ? NaN : Number(value.cap);
    const cap = Number.isFinite(asked) ? Math.min(10, Math.max(1, halfPoint(asked))) : 10;
    return {step:Math.min(step, 2), cap};
  }
  function normalizeProgression(value) {
    if (!value || typeof value !== 'object') return null;
    const amount = Number(value.amount);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const unit = PROGRESSION_UNITS.includes(value.unit) ? value.unit : null;
    if (!unit) return null;
    const asked = Array.isArray(value.kinds) ? value.kinds.map(blockKind) : ['main'];
    const kinds = BLOCK_KINDS.filter(k => asked.includes(k));
    if (!kinds.length) return null;
    const every = Number(value.deloadEvery);
    // The RPE climb rides along only when it is a valid one; a broken one is no climb,
    // never a reason to drop the load rule beside it.
    const rpe = normalizeRpeClimb(value.rpe);
    return {amount:round2(Math.min(amount, 1000)), unit, kinds, deloadEvery:Number.isInteger(every) && every >= 2 && every <= 52 ? every : 0, ...(rpe ? {rpe} : {})};
  }
  const positiveLoad = v => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v)) && Number(v) > 0;
  // A move the rule can move: in one of its blocks, typed in its unit, with a weight, and
  // not standing in for an imported load instruction.
  const progressible = (rule, block, row) => !!(rule && block && row) && rule.kinds.includes(blockKind(block.kind))
    && row.loadType === rule.unit && row.loadText == null && positiveLoad(row.load);
  // Steps of progression each week has taken: one per training week after the first; a
  // deload week takes none, so its loads hold and the climb resumes after it.
  const progressionSteps = weeks => { let n = 0; return weeks.map((w, i) => { if (i > 0 && !(w && w.deload)) n += 1; return n; }); };
  // ⚠ "THE SAME MOVE" IN A LATER WEEK IS THE SAME DAY, THE SAME KIND OF BLOCK AND THE SAME
  // NAME — the second Back squat of a day matches the second. Not the row's exact place: a
  // move added or dragged in week 3 would otherwise hand every move after it someone
  // else's weight. And the same day is week 1's day ON THE SAME WEEKDAY (the Grid's own
  // identity for a day), falling back to the same place in the week (the Sheet's band) for
  // a day with no weekday or none to match: by place alone, deleting a day from week 1, or
  // a week whose days are not listed Mon → Sun, would match every later day to the wrong
  // session and quietly stop its climb.
  function moveKeys(day) {
    const seen = {}, out = [];
    (day && day.blocks || []).forEach((block, bi) => (block.rows || []).forEach((row, ri) => {
      const name = text(row && row.name).trim().toLowerCase();
      const k = blockKind(block.kind) + '|' + name;
      seen[k] = (seen[k] || 0) + 1;
      out.push({bi, ri, block, row, key:name ? k + '|' + seen[k] : ''});
    }));
    return out;
  }
  const hasWeekday = d => !!d && Number.isInteger(d.weekday) && d.weekday >= 0 && d.weekday <= 6;
  function baseDay(builder, day, di) {
    const first = (builder.weeks[0] || {}).days || [];
    const same = hasWeekday(day) ? first.find(d => hasWeekday(d) && d.weekday === day.weekday) : null;
    return same || first[di];
  }
  function baseMoves(builder, day, di) {
    const map = new Map();
    for (const m of moveKeys(baseDay(builder, day, di))) if (m.key && !map.has(m.key)) map.set(m.key, m);
    return map;
  }
  function stepLoad(rule, base, steps) {
    const v = round2(base + rule.amount * steps);
    return rule.unit === 'pct' ? Math.min(100, v) : v;
  }
  // A governed move's ladder follows week 1's set by set; its reps stay its own.
  function stepLadder(rule, baseRow, row, steps) {
    const base = Array.isArray(baseRow.perSet) ? baseRow.perSet : [];
    const own = Array.isArray(row.perSet) ? row.perSet : [];
    if (!base.length && !own.length) return null;
    return Array.from({length:Math.max(base.length, own.length)}, (_, i) => {
      const b = base[i] && typeof base[i] === 'object' ? base[i] : {};
      const o = own[i] && typeof own[i] === 'object' ? own[i] : {};
      return {...o, load:positiveLoad(b.load) ? stepLoad(rule, Number(b.load), steps) : Number(b.load) === 0 && text(b.load).trim() !== '' ? 0 : ''};
    });
  }
  // A move whose RPE the climb moves: in one of the rule's blocks, with a target RPE. Its
  // weight does not matter (a bodyweight move climbs by effort alone), and a legacy row
  // that still keeps its RPE as the load is left to `splitLegacyRpe`.
  const rpeClimbs = (rule, block, row) => !!(rule && rule.rpe && block && row) && rule.kinds.includes(blockKind(block.kind))
    && row.loadType !== 'rpe' && rpeValue(row) != null;
  // Week N's RPE: week 1's plus a step for every training week since, up to the cap and
  // never below week 1's own. ⚠ A DELOAD WEEK GOES BACK TO WEEK 1'S RPE, the effort the
  // climb started from, and takes no step, so the climb resumes after it where it left.
  function stepRpe(rule, base, steps, deload) {
    if (deload) return base;
    return round2(Math.max(base, Math.min(rule.rpe.cap, base + rule.rpe.step * steps)));
  }
  // Every later week's governed loads, from week 1's, by the rule, and their RPEs when the
  // rule climbs RPE too. A load or an RPE the coach set by hand in a later week
  // (`loadPinned`, `rpePinned`) is left alone. Returns the SAME object when nothing
  // changes, so opening a program that is already in step cannot mark it dirty.
  function applyProgramProgression(builder) {
    const rule = normalizeProgression(builder && builder.progression);
    if (!rule || !Array.isArray(builder.weeks) || !builder.weeks.length) return builder;
    let weeks = builder.weeks;
    if (rule.deloadEvery) {
      weeks = weeks.map((w, i) => {
        if (legacyDeload(w)) return w;
        const want = (i + 1) % rule.deloadEvery === 0;
        return want ? deloadWeek(w) : w.deload ? undeloadWeek(w) : w;
      });
    }
    const steps = progressionSteps(weeks);
    const base = {...builder, weeks};
    const out = weeks.map((week, wi) => wi === 0 ? week : {...week, days:(week.days || []).map((day, di) => {
      const from = baseMoves(base, day, di);
      const keyed = new Map(moveKeys(day).map(m => [m.bi + ':' + m.ri, m.key]));
      return {...day, blocks:(day.blocks || []).map((block, bi) => ({...block, rows:(block.rows || []).map((row, ri) => {
        const b = from.get(keyed.get(bi + ':' + ri));
        if (!row || !b) return row;
        let next = row;
        if (row.loadPinned !== true && progressible(rule, b.block, b.row) && progressible(rule, block, {...row, load:1})) {
          next = {...next, load:stepLoad(rule, Number(b.row.load), steps[wi])};
          const ladder = stepLadder(rule, b.row, row, steps[wi]);
          if (ladder) next.perSet = ladder;
        }
        if (row.rpePinned !== true && row.loadType !== 'rpe' && rpeClimbs(rule, b.block, b.row)) {
          next = {...next, rpe:stepRpe(rule, rpeValue(b.row), steps[wi], !!week.deload)};
        }
        return next;
      })}))};
    })});
    const result = {...builder, weeks:out};
    return JSON.stringify(result) === JSON.stringify(builder) ? builder : result;
  }
  // The move at one place, with the rule and week 1's move it is matched to.
  function progressionPlace(builder, wi, di, bi, ri) {
    const rule = normalizeProgression(builder && builder.progression);
    if (!rule || !builder.weeks || !builder.weeks[wi]) return null;
    const day = (builder.weeks[wi].days || [])[di];
    const block = day && (day.blocks || [])[bi];
    const row = block && (block.rows || [])[ri];
    if (!row) return null;
    if (wi === 0) return {rule, block, row, base:null};
    const key = (moveKeys(day).find(m => m.bi === bi && m.ri === ri) || {}).key;
    return {rule, block, row, base:key ? baseMoves(builder, day, di).get(key) || null : null};
  }
  // What the rule does to one move, for the builder to mark it: 'source' (week 1, the
  // weight the climb starts from), 'follows' (a later week, set by the rule), 'pinned' (a
  // later week, typed by hand) or '' (the rule does not touch it).
  function progressionStatus(builder, wi, di, bi, ri) {
    const at = progressionPlace(builder, wi, di, bi, ri);
    if (!at) return '';
    const {rule, block, row, base:b} = at;
    if (wi === 0) return progressible(rule, block, row) ? 'source' : '';
    if (!b || !progressible(rule, b.block, b.row) || !progressible(rule, block, {...row, load:1})) return '';
    return row.loadPinned === true ? 'pinned' : 'follows';
  }
  // The same four answers for the move's RPE: 'source', 'follows', 'pinned' or '' (the
  // rule climbs no RPE, or not this move's).
  function rpeProgressionStatus(builder, wi, di, bi, ri) {
    const at = progressionPlace(builder, wi, di, bi, ri);
    if (!at) return '';
    const {rule, block, row, base:b} = at;
    if (wi === 0) return rpeClimbs(rule, block, row) ? 'source' : '';
    if (!b || !rpeClimbs(rule, b.block, b.row) || row.loadType === 'rpe') return '';
    return row.rpePinned === true ? 'pinned' : 'follows';
  }
  // A load typed by hand in a later week stays as typed: every row whose weight (or a
  // ladder weight) differs between the day before and after an edit is marked. Matched by
  // id within the one day, so a move dragged elsewhere in it is still the move it was.
  // ⚠ ONLY THE WEIGHTS A COACH WROTE COUNT: the row's load and each set's explicit one.
  // Typing a set's reps adds ladder entries whose weights are blank, and a blank weight
  // inherits the row's, so a reps-only edit pinned a load nobody typed and stopped that
  // week's climb (Codex P1, #2230). Trailing blank weights say nothing and are dropped.
  const loadsOf = row => {
    const ladderWeights = perSetEntries(row).map(e => e.load);
    while (ladderWeights.length && ladderWeights[ladderWeights.length - 1] === '') ladderWeights.pop();
    return JSON.stringify([row && row.load, ladderWeights]);
  };
  // ⚠ AN RPE IS PINNED THE SAME WAY, BUT ONLY WHILE THE RULE CLIMBS RPE (`rule`, the
  // program's progression, is the third argument). Without a climb nothing would put a
  // later week's RPE back, so a pin there would only wait to hold it against a climb the
  // coach turns on later, over a value they picked when no climb existed.
  const rpeOf = row => rpeValue(row);
  function pinLoadEdits(prevDay, nextDay, rule) {
    if (!prevDay || !nextDay) return nextDay;
    const climbRpe = !!(normalizeProgression(rule) || {}).rpe;
    const before = new Map();
    for (const b of prevDay.blocks || []) for (const r of b.rows || []) if (r && r.id != null && !before.has(String(r.id))) before.set(String(r.id), r);
    let changed = false;
    const blocks = (nextDay.blocks || []).map(b => ({...b, rows:(b.rows || []).map(r => {
      const was = r && r.id != null ? before.get(String(r.id)) : null;
      if (!was) return r;
      let out = r;
      if (r.loadPinned !== true && loadsOf(was) !== loadsOf(r)) out = {...out, loadPinned:true};
      if (climbRpe && r.rpePinned !== true && rpeOf(was) !== rpeOf(r)) out = {...out, rpePinned:true};
      if (out !== r) changed = true;
      return out;
    })}));
    return changed ? {...nextDay, blocks} : nextDay;
  }
  function normalizeWorkoutDetail(input, options = {}) {
    const detail = input && typeof input === 'object' ? copy(input) : {};
    let builder = detail.builder;
    if (!builder || !Array.isArray(builder.weeks)) {
      const blocks = Array.isArray(detail.blocks) ? detail.blocks : [];
      const weekLines = blocks.filter(b => /^week\s+\d+\b/i.test(text(b && b.text != null ? b.text : b)));
      const dayLines = blocks.filter(b => /^(mon|tue|wed|thu|fri|sat|sun)\b/i.test(text(b && b.text != null ? b.text : b)));
      // Match the legacy delivery parser's split/phase thresholds. A phase
      // heading or a note beside a weekly split is still an outline; turning
      // its weekday labels into exercises would change an existing program.
      const outlineOnly = blocks.length > 0 && (weekLines.length >= 2 || dayLines.length >= 3 || weekLines.length === blocks.length || dayLines.length === blocks.length);
      const makeDay = (name, rows, weekday, id) => ({id, name, ...(weekday == null ? {} : {weekday}), playlist:null, blocks:[{kind:'main',rows}]});
      let weeks;
      if (outlineOnly && weekLines.length && dayLines.length < 3) {
        weeks = weekLines.map((b, wi) => ({deload:false, days:[makeDay(text(b.text ?? b), [], null, 'day-' + wi)]}));
      } else if (outlineOnly && dayLines.length) {
        weeks = [{deload:false, days:dayLines.map((b, di) => {
          const value = text(b.text ?? b);
          return makeDay(value.replace(/^\w+\s*[—–:]?\s*/, '') || value, [], weekdays.indexOf(value.slice(0,3).toLowerCase()), 'day-' + di);
        })}];
      } else {
        const rows = blocks.filter(b => !/^week\s+\d+\b/i.test(text(b && b.text != null ? b.text : b))).map((b,i) => rowFromBlock(b,'legacy-ex-' + i));
        weeks = [{deload:false, days:[makeDay(options.name || 'Workout', rows, null, 'day-0')]}];
      }
      builder = {version:1, schemaVersion:1, goalTag:'strength', weeks, ...(outlineOnly ? {outlineOnly:true} : {})};
    }
    builder.schemaVersion = 1;
    if ('video' in builder) builder.video = videoUrl(builder.video);
    builder.version = Math.max(1, Number(builder.version) || 1);
    // The program's progression is kept only in the shape the builder writes; anything
    // else is no rule at all, rather than a half-read one moving loads.
    if ('progression' in builder) {
      const rule = normalizeProgression(builder.progression);
      if (rule) builder.progression = rule; else delete builder.progression;
    }
    // `deloadCut` is true on a deload week, or absent.
    builder.weeks = builder.weeks.map(({deloadCut, ...week}, wi) => ({...week, ...(deloadCut === true && week.deload === true ? {deloadCut:true} : {}), days:(week.days || []).map((day, di) => ({
      ...day, ...('video' in day ? {video:videoUrl(day.video)} : {}), id:day.id || `day-${wi}-${di}`, name:day.name || `Day ${di + 1}`,
      blocks:(day.blocks || []).map((block, bi) => ({...block, rows:(block.rows || []).map((row,ri) => withProgressionMarks(withLadder(splitLegacyRpe({...row, id:row.id || `ex-${wi}-${di}-${bi}-${ri}`, video:videoUrl(row.video), group:supersetKey(row.group) || null}))))})),
    }))}));
    if (!builder.weeks.length) builder.weeks = [{deload:false,days:[{id:'day-0',name:options.name || 'Workout',blocks:[{kind:'main',rows:[]}]}]}];
    const dayCount = builder.weeks.reduce((n,w) => n + w.days.length, 0);
    return {...detail, buildType:options.buildType || detail.buildType || (dayCount === 1 ? 'workout' : 'program'), builder};
  }
  function normalizeWorkoutPlan(plan) {
    return plan && plan.kind !== 'meal_plan' ? {...plan, detail:normalizeWorkoutDetail(plan.detail,{name:plan.name})} : plan;
  }
  function exerciseFromRow(row) {
    const l = ladder(row);
    return {id:row.id, name:text(row.name), sets:text(row.sets), reps:l ? l.reps : text(row.reps), rest:text(row.rest),
      ...(row.restSeconds != null ? {restSeconds:row.restSeconds} : {}), load:loadLabel(row),
      loadType:row.loadType, ...(rpeValue(row) != null ? {rpe:rpeValue(row)} : {}),
      // ⚠ THE LADDER TRAVELS TWICE, AND BOTH ARE NEEDED. `reps` and `load` above are
      // the whole ladder written out ("8/6/4", "60/70/80 kg"), which is what every
      // card and list already prints; `perSet` is each set's own target, resolved,
      // which is what the session player pre-fills a set with and what a logged set
      // records as its plan. A player reading "8/6/4" into one set's reps box would
      // log no reps at all. Weights here carry their unit and never the RPE.
      ...(l ? {perSet:l.sets.map(x => ({reps:x.reps, load:x.label}))} : {}),
      tempo:text(row.tempo), cue:text(row.cue), group:supersetKey(row.group),
      video:videoUrl(row.video), ...(row.seg ? {seg:row.seg} : {})};
  }
  function builderToAssignmentRows(builder, meta, startDateISO) {
    const start = new Date(startDateISO + 'T00:00:00');
    if (!Number.isFinite(start.getTime())) throw new Error('Choose a valid start date.');
    const iso = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const out = [];
    builder.weeks.forEach((week, wi) => week.days.forEach((day, di) => {
      const date = new Date(start);
      const hasWeekday = Number.isInteger(day.weekday) && day.weekday >= 0 && day.weekday <= 6;
      const offset = hasWeekday ? (day.weekday - (start.getDay()+6)%7 + 7)%7 : di;
      date.setDate(start.getDate() + wi*7 + offset);
      const exercises = (day.blocks || []).flatMap(block => (block.rows || []).map(row => ({...exerciseFromRow(row),block:block.kind})));
      const capture = {};
      for (const key of ['plannedMinutes','plannedRpe','loadCapture']) if (day[key] != null) capture[key] = day[key];
      out.push({title:day.name, scheduledDate:iso(date), ...capture, payload:{...capture,exercises,...(videoUrl(day.video) ? {video:videoUrl(day.video)} : {}),...(videoUrl(builder.video) ? {programVideo:videoUrl(builder.video)} : {}),playlist:day.playlist ? copy(day.playlist) : null,
        template:meta ? {id:meta.id || null,name:meta.name || '',version:meta.revision || builder.version || 1,week:wi+1,day:di+1,...(day.id ? {dayId:day.id} : {})} : null}});
    }));
    return out.sort((a,b) => a.scheduledDate.localeCompare(b.scheduledDate));
  }
  function builderToOutlineBlocks(builder) {
    return builder.weeks.flatMap((week,wi) => week.days.flatMap((day,di) => day.blocks.flatMap(block => block.rows.map(row => ({
      ...row, week:wi, day:di, dayName:day.name, weekday:day.weekday,
      text:`${row.name} — ${row.sets} × ${repsLabel(row)}${loadLabel(row) ? ' · ' + loadLabel(row) : ''}`,
    })))));
  }
  return {normalizeWorkoutDetail, normalizeWorkoutPlan, builderToAssignmentRows, builderToOutlineBlocks, exerciseFromRow, rowFromBlock, loadLabel, weightLabel, repsLabel, ladder, setTarget, perSetEntries, normalizePerSet, LADDER_MAX, SET_REPS_MAX, rpeValue, splitLegacyRpe, supersetKey, blockKind, BLOCK_KINDS, videoUrl, TIME_DISTANCE_UNITS, normalizeProgression, applyProgramProgression, progressionStatus, rpeProgressionStatus, pinLoadEdits, unpinned, deloadWeek, undeloadWeek, legacyDeload};
});
