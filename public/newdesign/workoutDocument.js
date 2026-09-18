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
  function loadLabel(row) {
    if (row.loadText != null) return text(row.loadText);
    if (row.load == null || row.load === '' || Number(row.load) === 0) return '';
    if (row.loadType === 'pct') return row.load + '% 1RM';
    if (row.loadType === 'rpe') return 'RPE ' + row.load;
    return row.load + ' ' + (row.loadType === 'lb' ? 'lb' : 'kg');
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
      blocks:(day.blocks || []).map((block, bi) => ({...block, rows:(block.rows || []).map((row,ri) => ({...row, id:row.id || `ex-${wi}-${di}-${bi}-${ri}`, video:videoUrl(row.video)}))})),
    }))}));
    if (!builder.weeks.length) builder.weeks = [{deload:false,days:[{id:'day-0',name:options.name || 'Workout',blocks:[{kind:'main',rows:[]}]}]}];
    const dayCount = builder.weeks.reduce((n,w) => n + w.days.length, 0);
    return {...detail, buildType:options.buildType || detail.buildType || (dayCount === 1 ? 'workout' : 'program'), builder};
  }
  function normalizeWorkoutPlan(plan) {
    return plan && plan.kind !== 'meal_plan' ? {...plan, detail:normalizeWorkoutDetail(plan.detail,{name:plan.name})} : plan;
  }
  function exerciseFromRow(row) {
    return {id:row.id, name:text(row.name), sets:text(row.sets), reps:text(row.reps), rest:text(row.rest),
      ...(row.restSeconds != null ? {restSeconds:row.restSeconds} : {}), load:loadLabel(row),
      loadType:row.loadType, tempo:text(row.tempo), cue:text(row.cue), group:text(row.group),
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
      text:`${row.name} — ${row.sets} × ${row.reps}${loadLabel(row) ? ' · ' + loadLabel(row) : ''}`,
    })))));
  }
  return {normalizeWorkoutDetail, normalizeWorkoutPlan, builderToAssignmentRows, builderToOutlineBlocks, exerciseFromRow, rowFromBlock, loadLabel, videoUrl};
});
