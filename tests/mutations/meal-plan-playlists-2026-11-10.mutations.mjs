// Mutation spec for a nutritionist's playlist on a meal-plan day and on a meal (owner, 2026-11-10):
// the builder's document (`day.playlist`, `meal.playlist`, the key gone when cleared), what the
// assignment sends the member (DashMeals.buildMealAssignment, through DashMealWeek.buildAssignment),
// and the picker (the coach's saved playlists less a trainer's, a playlist the day or meal already has
// kept selected). A survivor is a missing test, or a proven no-op marked expectSurvive with its proof.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/meal-plan-playlists-2026-11-10.mutations.mjs --fail-on-skipped
const CORE = 'public/newdesign/dashMealCore.js';
const UI = 'public/newdesign/dashMealBuilder.jsx';

export default {
  test: 'node --test tests/meal-plan-playlists.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── What the member is sent ──
    { name: 'a day\'s playlist is never sent', file: CORE, find: '      if (dayList) day.playlist = dayList;\n', replace: '' },
    { name: 'a meal\'s playlist is never sent', file: CORE, find: '          if (mealList) out.playlist = mealList;\n', replace: '' },
    { name: 'every weekday gets the first day\'s playlist', file: CORE, find: 'var dayList = sentPlaylist(meta[dow].src.playlist);', replace: 'var dayList = sentPlaylist(plan.days[0].playlist);' },
    { name: 'a rest day sends the base meal\'s playlist, not its own version\'s', file: CORE, find: 'var mealList = sentPlaylist(sm.playlist);', replace: 'var mealList = sentPlaylist((plan.days[dow % plan.days.length].slots.find(function (b) { return b.id === sm.id; }) || {}).playlist);' },
    { name: 'a blank name counts', file: CORE, find: '    if (!name) return null;\n    var out = {};', replace: '    var out = {};' },
    { name: 'the name goes untrimmed', file: CORE, find: 'var name = typeof p.name === "string" ? p.name.trim() : "";', replace: 'var name = typeof p.name === "string" && p.name.trim() ? p.name : "";' },
    { name: 'the id is dropped', file: CORE, find: '    if ((typeof p.id === "string" && p.id) || (typeof p.id === "number" && isFinite(p.id))) out.id = p.id;\n', replace: '' },
    { name: 'an empty id is sent', file: CORE, find: '(typeof p.id === "string" && p.id) ||', replace: 'typeof p.id === "string" ||' },
    { name: 'a meta that is not words is sent', file: CORE, find: 'out.meta = typeof p.meta === "string" ? p.meta : "";', replace: 'out.meta = p.meta;' },
    { name: 'the stored object is sent whole', file: CORE, find: '    out.meta = typeof p.meta === "string" ? p.meta : "";\n    return out;', replace: '    out.meta = typeof p.meta === "string" ? p.meta : "";\n    return p;' },
    // ── The builder's document ──
    { name: 'a cleared playlist is stored as null', file: UI, find: '  else delete next.playlist;', replace: '  else next.playlist = null;' },
    { name: 'the picked playlist is written without its id', file: UI, find: 'if (p) next.playlist = { ...(p.id != null && p.id !== "" ? { id: p.id } : {}), name: p.name, meta: p.meta || "" };', replace: 'if (p) next.playlist = { name: p.name, meta: p.meta || "" };' },
    { name: 'the day\'s picker writes nothing', file: UI, find: 'onChange={(p) => onChange(dmbWithPlaylist(day, p))}', replace: 'onChange={(p) => onChange(day)}' },
    { name: 'the meal\'s picker writes nothing', file: UI, find: 'onChange={(p) => onChange(dmbWithPlaylist(meal, p))}', replace: 'onChange={(p) => onChange(meal)}' },
    // ── The list ──
    { name: 'a trainer\'s playlist is offered', file: UI, find: '.filter((x) => x && x.role !== "trainer" && typeof x.name === "string" && x.name.trim())', replace: '.filter((x) => x && typeof x.name === "string" && x.name.trim())' },
    { name: 'one track reads "1 tracks"', file: UI, find: 'meta: Number.isFinite(n) && n > 0 ? n + (n === 1 ? " track" : " tracks") : ""', replace: 'meta: Number.isFinite(n) && n > 0 ? n + " tracks" : ""' },
    // (Not "every render": with no deps the read sets a new list, which renders again, and the suite
    // hangs on that loop instead of failing; an edit is what a re-read would follow in practice.)
    { name: 'the list is read again on every edit', file: UI, find: '    return () => { on = false; };\n  }, [live]);', replace: '    return () => { on = false; };\n  }, [live, doc]);' },
    { name: 'signed out, the list is read anyway', file: UI, find: '    if (!live) { setPlaylists((prev) => (prev.length ? [] : prev)); return undefined; }\n', replace: '' },
    { name: 'a rest day\'s own version of a meal gets no list', file: UI, find: 'customFoods={customFoods} playlists={playlists} badge={{ label: "Overridden"', replace: 'customFoods={customFoods} badge={{ label: "Overridden"' },
    // ── The picker ──
    { name: 'a playlist the list lacks shows as No playlist', file: UI, find: 'const lists = has && !list.some((p) => same(p, value)) ? [value, ...list] : list;', replace: 'const lists = list;' },
    { name: 'a playlist is matched by name only', file: UI, find: 'const same = (p, q) => !!p && !!q && (q.id != null && q.id !== "" ? p.id === q.id : p.name === q.name);', replace: 'const same = (p, q) => !!p && !!q && p.name === q.name;' },
    { name: 'a playlist saved without an id never matches the list', file: UI, find: 'const same = (p, q) => !!p && !!q && (q.id != null && q.id !== "" ? p.id === q.id : p.name === q.name);', replace: 'const same = (p, q) => !!p && !!q && p.id === q.id;' },
    { name: 'an empty list offers no "No playlists yet"', file: UI, find: '      {!lists.length && <option value="" disabled>No playlists yet</option>}\n', replace: '' },
    { name: 'the week drops the ♪ mark', file: UI, find: '{dmbHasPlaylist(m.playlist) ? " ♪" : ""}', replace: '' },
  ],
};
