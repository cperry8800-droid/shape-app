// Mutation spec for the trainer profile's work (2026-10-29: programs and workout videos in Replays,
// each machine's workouts on the studio, station pins; 2026-11-04: the app's Studio tab as the coach's
// programs, workouts and coaching with their own lines, the floor plan and its pins now the website's
// only): coachWork.mjs, the profile doc's keys, the page, the Studio tab, the editor, the samples and
// the composer's starting type. The tests named below must notice every one. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/trainer-replays-2026-10-29.mutations.mjs --fail-on-skipped
const WORK = 'public/newdesign/coachWork.mjs'; // canonical since #2560
const DOC = 'public/newdesign/profileCustom.mjs';
const PAGE = 'mobile-app/src/broadsheet/BSTrainerProfile.jsx';
const EDIT = 'mobile-app/src/broadsheet/BSMakeItYours.jsx';
const STUDIO = 'mobile-app/src/broadsheet/BSCoachStudio.jsx';
const CLIMB = 'mobile-app/src/broadsheet/BSCoachClimb.jsx'; // the program sheet, since the Climb (2026-11-09)
const DEMO = 'public/newdesign/trainerDemo.mjs'; // canonical since #2560
const CLIENT = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';

export default {
  test: 'node --test tests/coach-work.test.mjs tests/coach-studio-model.test.mjs tests/trainer-profile.test.mjs tests/studio-editor.test.mjs tests/profile-custom.test.mjs',
  timeoutMs: 600_000,
  mutations: [
    // ── programs ──
    { name: 'work: a meal plan is a program', file: WORK,
      find: "if (!isObj(pl) || pl.kind === 'meal_plan' || pl.id == null) continue;", replace: "if (!isObj(pl) || pl.id == null) continue;" },
    { name: 'work: a plain-http video plays', file: WORK,
      find: "const httpsUrl = (u) => typeof u === 'string' && u.length <= 2048 && /^https:\\/\\/[^\\s]+$/i.test(u);", replace: "const httpsUrl = (u) => typeof u === 'string' && u.length <= 2048 && /^https?:\\/\\/[^\\s]+$/i.test(u);" },
    { name: 'work: no cap on programs', file: WORK,
      find: "    if (out.length >= BS_WORK_PROGRAMS_MAX) break;\n", replace: "" },
    { name: 'work: no weeks from the builder', file: WORK,
      find: "weeks: preview.weeks || (isObj(pl.detail) && Number.isInteger(pl.detail.weeks) && pl.detail.weeks > 0 && pl.detail.weeks <= 52 ? pl.detail.weeks : null),", replace: "weeks: preview.weeks || null," },
    { name: 'work: a price with no $', file: WORK,
      find: "return /^\\$|free/i.test(s) ? s : `$${s}`;", replace: "return s;" },
    { name: 'work: a move twice', file: WORK,
      find: "    if (!name || seen.has(key)) continue;", replace: "    if (!name) continue;" },
    { name: 'work: a week line is a move', file: WORK,
      find: "      if (!line || STRUCTURE_LINE.test(line)) continue;", replace: "      if (!line) continue;" },
    { name: 'work: no cap on moves', file: WORK,
      find: "    if (out.length >= BS_WORK_MOVES_MAX) break;\n", replace: "" },
    // ── workouts ──
    { name: 'work: a post with no https video is a workout', file: WORK,
      find: "    if (!isObj(c) || !httpsUrl(c.video)) continue;", replace: "    if (!isObj(c) || !c.video) continue;" },
    { name: 'work: no cap on workouts', file: WORK,
      find: "    if (out.length >= BS_WORK_VIDEOS_MAX) break;\n", replace: "" },
    { name: 'work: a workout with no sets steps through none', file: WORK,
      find: "const rows = isObj(c.breakdown) && Array.isArray(c.breakdown.rows) && c.breakdown.rows.length ? c.breakdown : null;", replace: "const rows = isObj(c.breakdown) ? c.breakdown : null;" },
    // ── pieces ──
    { name: 'pieces: equipment places a move the piece never means', file: WORK,
      find: "if (eq && rule.eq.some((e) => e.toLowerCase() === eq.toLowerCase())) return !(rule.not && rule.not.test(name));", replace: "if (eq && rule.eq.some((e) => e.toLowerCase() === eq.toLowerCase())) return true;" },
    { name: 'pieces: a name places a move whatever its equipment', file: WORK,
      find: "  return rule.with === ANY || rule.with.some((e) => e.toLowerCase() === eq.toLowerCase());", replace: "  return true;" },
    { name: 'pieces: a name the piece never means is placed', file: WORK,
      find: "  if (!rule.name.test(name) || (rule.not && rule.not.test(name))) return false;", replace: "  if (!rule.name.test(name)) return false;" },
    { name: 'pieces: the air bike is the bike', file: WORK,
      find: "with: ['Bike', 'Machine', ''], not: /air bike|assault|echo/ },", replace: "with: ['Bike', 'Machine', ''] }," },
    { name: 'pieces: a zone holds nothing', file: WORK,
      find: "      held = progs.map((pr) => merged.get(pr.id)).filter(Boolean);", replace: "      held = [];" },
    { name: 'pieces: a zone holds the whole floor', file: WORK,
      find: "if (j === i || !isObj(q) || q.t === 'zone' || !inside(q, p)) return;", replace: "if (j === i || !isObj(q) || q.t === 'zone') return;" },
    { name: 'pieces: a pin to a program not published', file: WORK,
      find: "p.st.pins.filter((id) => byId.has(id))", replace: "p.st.pins" },
    // ── the doc's pins ──
    { name: 'doc: pins in capitals', file: DOC,
      find: "        const k = typeof id === 'string' ? id.toLowerCase() : '';", replace: "        const k = typeof id === 'string' ? id : '';" },
    { name: 'doc: a pin twice', file: DOC,
      find: "        if (BS_PLAN_ID.test(k) && !pins.includes(k)) pins.push(k);", replace: "        if (BS_PLAN_ID.test(k)) pins.push(k);" },
    { name: 'doc: any string is a pin', file: DOC,
      find: "        if (BS_PLAN_ID.test(k) && !pins.includes(k)) pins.push(k);", replace: "        if (k && !pins.includes(k)) pins.push(k);" },
    { name: 'doc: four pins', file: DOC,
      find: "export const BS_STATION_PINS_MAX = 3;", replace: "export const BS_STATION_PINS_MAX = 4;" },
    { name: 'doc: the pins scan has no end', file: DOC,
      find: "      for (const id of v.st.pins.slice(0, BS_STATION_PINS_MAX * 4)) {", replace: "      for (const id of v.st.pins) {" },
    // ── the page ──
    { name: 'page: a session with a video is listed twice', file: PAGE,
      find: "c.breakdown.rows.length && !c.video);", replace: "c.breakdown.rows.length);" },
    { name: 'page: a guest buys', file: PAGE,
      find: "    if (W.bsRequireAccount && !W.bsRequireAccount(tr('profile:trainer.buyAsk', { defaultValue: 'buy a program' }))) return;\n", replace: "" },
    { name: 'page: the checkout is never opened', file: PAGE,
      find: "      if (url) (W.bsOpenCheckout || ((u) => { window.location.href = u; }))(url);", replace: "" },
    { name: 'page: the coach is offered Buy on their own program', file: CLIMB,
      find: "        {isSelf ? <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45, color: CLIMB.MUTED }}>", replace: "        {false ? <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45, color: CLIMB.MUTED }}>" },
    { name: 'page: Buy · Free goes to the paid checkout', file: CLIMB,
      find: "            {pr.sample || !pr.paid", replace: "            {pr.sample || !pr.price" },
    { name: 'work: a free program is sold', file: WORK,
      find: "return Number.isFinite(n) && n > 0; };", replace: "return Number.isFinite(n) && n >= 0; };" },
    { name: 'page: Buy on a sample', file: CLIMB,
      find: "            {pr.sample || !pr.paid", replace: "            {!pr.paid" },
    { name: 'page: the program\'s video is not played', file: CLIMB,
      find: "        {pr.video ? <div data-program-video=\"\"", replace: "        {false ? <div data-program-video=\"\"" },
    { name: 'page: a workout\'s video is not played', file: PAGE,
      find: "      {video ? <div data-replay-video=\"\"", replace: "      {false ? <div data-replay-video=\"\"" },
    { name: 'page: a workout with no sets has a stepper', file: PAGE,
      find: "      {rows.length ? <div style={{ margin: '12px 18px 0', display: 'flex', gap: 8 }}>", replace: "      {true ? <div style={{ margin: '12px 18px 0', display: 'flex', gap: 8 }}>" },
    { name: 'page: the names-only line is not said', file: CLIMB,
      find: "      {p.namesOnly ? <p style={{ margin: '12px 18px 0'", replace: "      {false ? <p style={{ margin: '12px 18px 0'" },
    { name: 'page: the initials are the name\'s first two letters', file: PAGE,
      find: ": String(name).split(/\\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();", replace: ": String(name).slice(0, 2).toUpperCase();" },
    // ── the Studio (owner, 2026-11-04: the coach's work in three kinds, each with their own line) ──
    { name: 'studio: the picks are not put first', file: WORK,
      find: "  const workouts = [...picked.map((w) => ({ ...w, pick: true })), ...all.filter((w) => !pickedKeys.has(w.key)).map((w) => ({ ...w, pick: false }))];",
      replace: "  const workouts = all.map((w) => ({ ...w, pick: pickedKeys.has(w.key) }));" },
    { name: 'studio: a program with no line of the coach\'s shows nothing, not its own note', file: WORK,
      find: "      desc: desc(`p:${id}`) || note,", replace: "      desc: desc(`p:${id}`)," },
    { name: 'studio: coaching shown with no monthly price', file: WORK,
      find: "  const coaching = Number.isFinite(price) && price > 0\n", replace: "  const coaching = true\n" },
    { name: 'studio: the focus filter does not filter', file: STUDIO,
      find: "  const shown = focusNow === 'all' ? works : works.filter((w) => w.focus === focusNow);", replace: "  const shown = works;" },
    { name: 'page: no Range camp for the work alone', file: PAGE,
      find: "      (isSelf || hasStudioWork || plansFailed) ? ['range'", replace: "      (isSelf || plansFailed) ? ['range'" },
    { name: 'doc: five focus words', file: DOC,
      find: "export const BS_FOCUS_MAX = 4;", replace: "export const BS_FOCUS_MAX = 5;" },
    { name: 'doc: a preset that is not one is kept', file: DOC,
      find: "  if (typeof v.id === 'string' && presets.includes(v.id)) return { id: v.id };", replace: "  if (typeof v.id === 'string') return { id: v.id };" },
    // ── the editor ──
    { name: 'editor: a focus preset is stored as its label', file: EDIT,
      find: "    setFocus([...list, { id }]);", replace: "    setFocus([...list, { w: say({ id }) }]);" },
    { name: 'editor: a description not changed here is written', file: EDIT,
      find: "    if (descriptionsChanged) doc.descriptions = descs;", replace: "    doc.descriptions = descs;" },
    // ── the samples ──
    { name: 'samples: a sample program is for sale', file: DEMO,
      find: "  return bsCoachPrograms(plans).map((p) => ({ ...p, sample: true }));", replace: "  return bsCoachPrograms(plans);" },
    { name: 'samples: no station pins a program', file: DEMO,
      find: "...(PINS[keyed[i].st.title] ? { pins: [PINS[keyed[i].st.title](family)] } : {})", replace: "...({})" },
    // PROVEN NO-OP on today's data (found when #2560 pointed this spec back at the canonical file; the
    // stale path had hidden it): every workout row carries a BS_SAMPLE_CLIPS url, and coach-work pins
    // all four clips as defined CDN mp4s, so `filter((w) => w[4])` drops nothing and the mutant's
    // output is identical. The guard is for a future sample with no clip yet; BS_SAMPLE_CLIPS is
    // frozen and workoutsFor unexported, so no test can remove one.
    { name: 'samples: a workout with no clip', file: DEMO, expectSurvive: true,
      find: "  return list.filter((w) => w[4]).map(", replace: "  return list.map(" },
    // ── the composer ──
    { name: 'composer: a new post ignores the kind asked for', file: CLIENT,
      find: ": (['note', 'photo', 'video', 'workout', 'milestone', 'link'].includes(startKind) ? startKind : 'note');", replace: ": 'note';" },
    { name: 'client: the checkout opener is not on window', file: CLIENT,
      find: "BSSearchCorner, bsOpenCheckout, bsStartPlatformCheckout });", replace: "BSSearchCorner, bsStartPlatformCheckout });" },
  ],
};
