// Mutation spec for coach dashboard step 6c, part 1 (the owner's coach review, 4 Nov 2026): the
// workout builder and the program builder. Covers what the session adds up to and from what, the
// library panel, the whiteboard line and the superset bracket, the single workout's canvas, the
// plan (weeks across, loads on the cards, the peek), the progression chart and its Now, the length,
// the tray, Assign on the same screen, the playlist id, and the retired pages. A survivor is a
// missing test, or a proven no-op marked expectSurvive with its proof.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/builders-6c-workout-2026-11-09.mutations.mjs --fail-on-skipped
const CORE = 'public/newdesign/dashBuilderCore.js';
const PROG = 'public/newdesign/dashBuilder.jsx';
const OLDW = 'public/newdesign/TrainerNewWorkout.html';
const OLDP = 'public/newdesign/TrainerNewProgram.html';

export default {
  test: 'node --test tests/builders-6c-workout.test.mjs tests/coach-builder-views.test.mjs tests/builder-step2.test.mjs tests/builder-step3.test.mjs tests/coach-custom-moves.test.mjs tests/coach-builder-layouts.test.mjs',
  timeoutMs: 400_000,
  mutations: [
    // ── The session adds itself up ──
    { name: 'the warm-up counts as working sets', file: CORE, find: 'if (!blocks[b] || blocks[b].kind === "warmup") continue;', replace: 'if (!blocks[b]) continue;' },
    { name: 'a rep range counts as a number', file: CORE, find: 'function wholeReps(v) { var t = tagText(v); return /^\\d+$/.test(t) ? Number(t) : null; }', replace: 'function wholeReps(v) { var t = tagText(v); return parseInt(t, 10) || null; }' },
    { name: 'per cent of 1RM is volume in kg', file: CORE, find: 'row.loadType === "pct" || row.loadType === "rpe" ? "" : "kg";', replace: 'row.loadType === "rpe" ? "" : "kg";' },
    { name: 'an RPE is volume in kg', file: CORE, find: 'row.loadType === "pct" || row.loadType === "rpe" ? "" : "kg";', replace: 'row.loadType === "pct" ? "" : "kg";' },
    { name: 'a ladder counts its first set for all of them', file: CORE, find: 'var t = WorkoutDoc.setTarget(row, i);', replace: 'var t = WorkoutDoc.setTarget(row, 0);' },
    { name: 'a move with no weight is not said to be left out', file: CORE, find: '        if (sets && !counted) out.unweighed += 1;\n', replace: '' },
    { name: 'an untagged move counts nowhere', file: CORE, find: '        } else out.untagged += sets;', replace: '        }' },
    { name: 'the muscles keep the order they were met', file: CORE, find: '.sort(function (a, b2) { return b2.sets - a.sets || a.label.localeCompare(b2.label); });\n    out.regions', replace: ';\n    out.regions' },
    { name: 'a day with upper moves is told to pair with an upper day', file: CORE, find: 'if (regions.lower && !regions.upper && only(["lower", "core"]))', replace: 'if (regions.lower && only(["lower", "upper", "core"]))' },
    { name: 'a duration is invented', file: CORE, find: 'out.minutes = day && day.plannedMinutes != null && Number.isFinite(pm) && pm > 0 ? pm : null;', replace: 'out.minutes = day && day.plannedMinutes != null && Number.isFinite(pm) && pm > 0 ? pm : 60;' },
    { name: 'the totals draw a duration with no source', file: PROG, find: '{t.minutes != null && <span><b>{t.minutes} min</b> planned</span>}', replace: '<span><b>{t.minutes || 60} min</b> planned</span>' },
    { name: 'the volume leaves out the kg', file: PROG, find: 't.volume.kg > 0 && dbuVolume(t.volume.kg) + " kg"', replace: 'false' },
    { name: 'the bar names no muscle', file: PROG, find: 'aria-label={"Working sets by muscle: " + parts.map((p) => p.label + " " + p.sets).join(", ")}', replace: 'aria-label="Working sets by muscle"' },
    { name: 'the pairing note is dropped', file: PROG, find: '{t.pairWith && <p className="dtot-note">{t.pairWith}</p>}', replace: '' },
    // ── The library ──
    { name: 'the library is capped at 12 again', file: CORE, find: 'return { mine: (Array.isArray(customMoves) ? customMoves : []).filter(pass), shape: EXERCISES.filter(pass) };', replace: 'return { mine: (Array.isArray(customMoves) ? customMoves : []).filter(pass), shape: EXERCISES.filter(pass).slice(0, 12) };' },
    { name: 'the region filter does nothing', file: CORE, find: '      if (region && moveRegion(e) !== region) return false;\n', replace: '' },
    { name: 'the equipment filter does nothing', file: CORE, find: '      if (eq && rowKit(e).equipment !== eq) return false;\n', replace: '' },
    { name: 'no ✓ on a move already in', file: PROG, find: 'const has = (ex) => !!inDay && inDay.has(dbuNameKey(ex.name));', replace: 'const has = (ex) => false;' },
    { name: 'the library adds to the selected move\'s block, not Main', file: PROG, find: 'const [aim, setAim] = React.useState(() => { const i = (day.blocks || []).findIndex((b) => b && b.kind === "main"); return i >= 0 ? i : null; });', replace: 'const [aim, setAim] = React.useState(null);' },
    { name: '+ Exercise does not aim the library', file: PROG, find: 'onClick={() => { setAim(bi); if (libSearch.current) libSearch.current.focus(); }}>+ Exercise</button>', replace: 'onClick={() => { if (libSearch.current) libSearch.current.focus(); }}>+ Exercise</button>' },
    { name: 'a library drop is ignored', file: PROG, find: '    const ex = dbuLibDrag.current;\n    dbuLibDrag.current = null;', replace: '    const ex = null;\n    dbuLibDrag.current = null;' },
    { name: 'the library\'s Enter creates while an IME composes', file: PROG, find: '          if (dbuImeComposing(e.nativeEvent)) return;\n          if (e.key === "Enter" && canCreate) { e.preventDefault(); create(); }', replace: '          if (e.key === "Enter" && canCreate) { e.preventDefault(); create(); }' },
    // ── The whiteboard line and the superset ──
    { name: 'the tempo leaves the line', file: PROG, find: '<span className="c tp"><input className="ci" data-cell="tempo" aria-label={who+\' Tempo\'} placeholder="Tempo" value={row.tempo ?? \'\'} onChange={e=>set(\'tempo\',e.target.value)}/></span>', replace: '' },
    { name: 'the cue is not written', file: PROG, find: "onChange={e=>set('cue',e.target.value)}/>\n  </div>;", replace: "onChange={()=>{}}/>\n  </div>;" },
    { name: 'A1 offers a rest again', file: PROG, find: '    if (at < members.length - 1) info.restTo = members[at + 1].label;\n', replace: '' },
    { name: 'the bracket counts the most sets, not the fewest', file: CORE, find: 'return s == null ? n : n == null ? s : Math.min(n, s);', replace: 'return s == null ? n : n == null ? s : Math.max(n, s);' },
    { name: 'a superset of one draws a bracket', file: CORE, find: 'if (!g || members.length < 2) return null;', replace: 'if (!g || !members.length) return null;' },
    // ── The single workout ──
    { name: 'a single workout opens the program builder', file: PROG, find: '  return days === 1 && (doc.weeks || []).length === 1 && (type ? type === "workout" : true);', replace: '  return false;' },
    { name: 'a stored "workout" of many days hides them', file: PROG, find: '  return days === 1 && (doc.weeks || []).length === 1 && (type ? type === "workout" : true);', replace: '  return type ? type === "workout" : days === 1;' },
    { name: 'a program opens on a day', file: PROG, find: 'const [sel, setSel] = React.useState(() => (single ? {w:0,d:0} : {w:-1,d:-1}));', replace: 'const [sel, setSel] = React.useState(() => ({w:0,d:0}));' },
    { name: 'Saved just now never says so', file: PROG, find: 'return mins < 1 ? "Saved just now" : mins < 60 ? "Saved " + mins + " min ago" : "Saved";', replace: 'return "Saved";' },
    { name: 'a save sets no time', file: PROG, find: "setSaveState('saved');setSavedAt(Date.now());setClock(Date.now());", replace: "setSaveState('saved');" },
    { name: 'Client view draws nothing', file: PROG, find: '{tab === "client" && <div className="dclient" aria-label="Client view">', replace: '{false && <div className="dclient" aria-label="Client view">' },
    // ── The plan ──
    { name: 'a card\'s change ignores the weekday', file: CORE, find: 'var at = wd != null ? (prev.days || []).findIndex(function (d) { return d && d.weekday === wd; }) : -1;\n    return at >= 0 ? prev.days[at] : (prev.days || [])[di] || null;', replace: 'return (prev.days || [])[di + 1] || null;' },
    { name: 'a card compares across units', file: CORE, find: 'var delta = before && before.loadType === row.loadType && Number.isFinite(now)', replace: 'var delta = before && Number.isFinite(now)' },
    { name: 'the cards show no change on last week', file: PROG, find: 'const dbuDelta = (l) => (l.delta ? (l.delta > 0 ? "▲" : "▼") + Math.abs(l.delta) : "");', replace: 'const dbuDelta = (l) => "";' },
    { name: 'a free slot moves a session from another week', file: PROG, find: '    if (f && f.wi === wi) moveTo(f.wi, f.di, wd);', replace: '    if (f) moveTo(f.wi, f.di, wd);' },
    { name: 'a plan drop overwrites rather than swaps', file: PROG, find: '  const moveTo = (wi, di, weekday) => setWeeks(weeks.map((w, i) => (i === wi ? dbuAssignWeekday(w, di, weekday) : w)));', replace: '  const moveTo = (wi, di, weekday) => setWeeks(weeks.map((w, i) => (i === wi ? { ...w, days: w.days.map((d, j) => (j === di ? { ...d, weekday } : d)) } : w)));' },
    { name: 'Open in builder does nothing', file: PROG, find: 'onOpen={() => selectDay({ w: peek.w, d: peek.d })}', replace: 'onOpen={() => {}}' },
    { name: 'Back to the plan forgets the session', file: PROG, find: 'if (view === "sheet") refocus(); else setPeek(was.w >= 0 ? { w: was.w, d: was.d } : null);', replace: 'refocus();' },
    { name: 'the open day does not say its week of the length', file: PROG, find: '<>Week {sel.w + 1} of {doc.weeks.length}{dates[sel.w', replace: '<>Week {sel.w + 1}{dates[sel.w' },
    // ── The progression drawn ──
    { name: 'the chart follows the move by place, not weekday', file: CORE, find: 'var at = wd != null ? days.findIndex(function (d) { return d && d.weekday === wd; }) : -1;\n      var d = at >= 0 ? days[at] : days[di || 0];', replace: 'var d = days[(di || 0) + 1] || days[di || 0];' },
    { name: 'the deload weeks are not hatched', file: PROG, find: '{series.map((p) => p.deload && <rect', replace: '{series.map((p) => false && <rect' },
    { name: 'Now is any client on any program', file: PROG, find: 'if (!leg || leg.templateId !== idRef.current || !Number.isInteger(wk) || wk < 1) return;', replace: 'if (!leg || !Number.isInteger(wk) || wk < 1) return;' },
    { name: 'the caption drops Now', file: PROG, find: '+ (marks.length ? ". Now at " +', replace: '+ (false ? ". Now at " +' },
    // ── The length ──
    { name: 'a longer program keeps the last week\'s pins', file: CORE, find: 'var u = WorkoutDoc ? WorkoutDoc.unpinned(r) : r; u.id = uid(); return u;', replace: 'var u = Object.assign({}, r); u.id = uid(); return u;' },
    { name: 'a longer program shares row ids', file: CORE, find: 'var u = WorkoutDoc ? WorkoutDoc.unpinned(r) : r; u.id = uid(); return u;', replace: 'var u = WorkoutDoc ? WorkoutDoc.unpinned(r) : r; return u;' },
    { name: 'shortening drops weeks without asking', file: PROG, find: '    if (out.removed && out.removed.moves) {\n      const C =', replace: '    if (false) {\n      const C =' },
    { name: 'a No in ShapeConfirm shortens anyway', file: PROG, find: '      if (!ok) return;\n      const again = DashBuilder.resizeProgram(latest.current.doc, n);', replace: '      const again = DashBuilder.resizeProgram(latest.current.doc, n);' },
    { name: 'Custom sets nothing', file: PROG, find: 'if (Number.isFinite(n) && n >= 1 && n <= 52 && n !== weeks) onLength(n);', replace: '{}' },
    // ── The tray ──
    { name: 'the tray lists this program\'s days twice', file: PROG, find: '.filter((x) => x && x.day && (!selfId || x.programId !== selfId))', replace: '.filter((x) => x && x.day)' },
    { name: 'a tray card has no colour', file: PROG, find: 'style={{ "--c": info ? info.c : DBU_LINE2 }}', replace: 'style={{ "--c": DBU_LINE2 }}' },
    { name: 'a tray card replaces a day already there', file: PROG, find: '    if (taken) { setNotice("Week " + (wi + 1) + " already has "', replace: '    if (false) { setNotice("Week " + (wi + 1) + " already has "' },
    { name: 'a plan drop ignores the tray', file: PROG, find: '    if (t) { onPlace(t, wi, wd); return; }\n', replace: '' },
    // ── Assign on the same screen ──
    { name: 'a client already on it is offered again', file: PROG, find: 'const others = (clients || []).filter((c) => c && c.profile && !onIds.has(String(c.profile.id)));', replace: 'const others = (clients || []).filter((c) => c && c.profile);' },
    { name: 'an unread usage reads as nobody', file: PROG, find: 'else if (u.state !== "ready") now = <span className="dash-lib-quiet">{u.state === "error" ? "Couldn’t read who’s on it" : "Checking who’s on it…"}</span>;', replace: 'else if (u.state !== "ready") now = <span className="dash-lib-quiet">No clients yet</span>;' },
    { name: 'the panel assigns to nobody', file: PROG, find: '    if (await assign(ids, startDate, meta)) setPicked({});', replace: '    if (await assign([], startDate, meta)) setPicked({});' },
    { name: 'the one button does not name them', file: PROG, find: 'ids.length ? "Assign to " + dbuNameList(names) : "Pick clients to assign"', replace: 'ids.length ? "Assign" : "Pick clients to assign"' },
    { name: 'the panel publishes every session at once', file: PROG, find: '        const weekGroups = DashBuilder.groupAssignmentWeeks(rows);', replace: '        const weekGroups = [{ rows }];' },
    // ── The playlist ──
    { name: 'the playlist is written without its id', file: PROG, find: 'onChange({ ...day, playlist: p ? { ...(p.id != null && p.id !== "" ? { id: p.id } : {}), name: p.name, meta: p.meta || "" } : null });', replace: 'onChange({ ...day, playlist: p ? { name: p.name, meta: p.meta || "" } : null });' },
    { name: 'a legacy playlist is not matched by name', file: PROG, find: 'const same = (p, q) => !!p && !!q && (q.id != null && q.id !== "" ? p.id === q.id : p.name === q.name);', replace: 'const same = (p, q) => !!p && !!q && p.id === q.id;' },
    { name: 'the soundtrack read drops the id', file: PROG, find: "return { ...(x && x.id != null && x.id !== '' ? { id: x.id } : {}), name: x && x.name,", replace: 'return { name: x && x.name,' },
    // ── The retired pages ──
    { name: 'the old workout page stays', file: OLDW, find: '<script>location.replace("TrainerApp.html#programs"+(location.search||""));</script>', replace: '' },
    { name: 'the old program page stays', file: OLDP, find: '<script>location.replace("TrainerApp.html#programs"+(location.search||""));</script>', replace: '' },
  ],
};
