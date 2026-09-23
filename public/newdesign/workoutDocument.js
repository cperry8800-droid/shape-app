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
  function rowFromBlock(block, id) {
    const b = typeof block === 'object' && block ? block : {text:block};
    const raw = text(b.text).trim();
    const split = raw.match(/^(.*?)\s*[—–:]\s*(.+)$/);
    const parts = split ? [split[1], split[2]] : raw.split(/\s*·\s*/);
    const tail = parts.slice(1).join(' · ');
    // Repetitions can be timed or effort-based. Preserve the authored token;
    // parsing only its numeric prefix changed "30s" into 30 repetitions and
    // moved "AMRAP" into the load field.
    const scheme = tail.match(/(\d+)\s*[×x]\s*((?:\d+(?:[–-]\d+)?(?:\s*(?:seconds?|secs?|s|minutes?|mins?))?|AMRAP|to\s+failure|max)(?:\s*(?:ea(?:ch)?|per\s+(?:side|leg)|\/\s*(?:side|leg)))?)/i);
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
    builder.version = Math.max(1, Number(builder.version) || 1);
    builder.weeks = builder.weeks.map((week, wi) => ({...week, days:(week.days || []).map((day, di) => ({
      ...day, id:day.id || `day-${wi}-${di}`, name:day.name || `Day ${di + 1}`,
      blocks:(day.blocks || []).map((block, bi) => ({...block, rows:(block.rows || []).map((row,ri) => withLadder(splitLegacyRpe({...row, id:row.id || `ex-${wi}-${di}-${bi}-${ri}`, video:videoUrl(row.video), group:supersetKey(row.group) || null})))})),
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
      out.push({title:day.name, scheduledDate:iso(date), ...capture, payload:{...capture,exercises,playlist:day.playlist ? copy(day.playlist) : null,
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
  return {normalizeWorkoutDetail, normalizeWorkoutPlan, builderToAssignmentRows, builderToOutlineBlocks, exerciseFromRow, rowFromBlock, loadLabel, weightLabel, repsLabel, ladder, setTarget, perSetEntries, normalizePerSet, LADDER_MAX, SET_REPS_MAX, rpeValue, splitLegacyRpe, supersetKey, videoUrl};
});
