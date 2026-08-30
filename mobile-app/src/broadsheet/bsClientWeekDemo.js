// Load scaling + intensity constants come from the adjust-regeneration
// module — the ONE source both the display path and the row rewrite share.
import { bsScaleLoad, BS_ADJUST_SCALE } from '../services/adjustRegen.mjs';

// ═══════════════════════════════════════════════════════════
// SHARED CLIENT DEMO WEEK — single source of truth
// ═══════════════════════════════════════════════════════════
// The client home week-strip (BSClientHome day-log + week dots) and the month
// calendar (BSCalendarScreen, logged-out demo) used to carry TWO independent
// hardcoded datasets, so the same weekday showed different workouts in each.
// They now both build off this one array, so they always match.
//
// Indexed Mon..Sun (0..6). Each item is color-agnostic — consumers map `kind`
// to a theme color (TRN=amber, MEAL=blue, CHK=green, CON=rust, REST=ink50):
//   { time:'HH:MM', kind, title, sub, dur, state?, slot? }
// `state`: 'done' | 'now' | 'next' (drives done/highlight styling); `dur` mins
// (calendar duration); `slot` lets a meal follow the client's meal-time pref.

export const BS_CLIENT_WEEK_DEMO = [
  // Mon
  [
    { time: '06:50', kind: 'MEAL', slot: 'BFAST',  dur: 0,  title: 'Eggs, toast, fruit',     sub: '438 kcal · 28P',      state: 'done' },
    { time: '08:30', kind: 'TRN',                  dur: 58, title: 'Lower Pull — Vol.',       sub: '58 min · Jordan',     state: 'done' },
    { time: '12:30', kind: 'MEAL', slot: 'LUNCH',  dur: 0,  title: 'Turkey wrap',             sub: '540 kcal · 38P',      state: 'done' },
    { time: '15:15', kind: 'CHK',                  dur: 0,  title: 'Mid-day check-in',        sub: 'Energy 7/10',         state: 'done' },
    { time: '18:30', kind: 'CHK',                  dur: 0,  title: 'Evening check-in',        sub: 'RPE recap · Jordan',  state: 'done' },
    { time: '19:30', kind: 'MEAL', slot: 'DINNER', dur: 0,  title: 'Steak, sweet potato',     sub: '610 kcal · 46P',      state: 'done' },
  ],
  // Tue
  [
    { time: '07:20', kind: 'MEAL', slot: 'BFAST',  dur: 0,  title: 'Oats, berries, whey',     sub: '412 kcal · 32P',      state: 'done' },
    { time: '09:05', kind: 'TRN',                  dur: 52, title: 'Upper Push — Peak',       sub: '52 min · Jordan',     state: 'done' },
    { time: '09:45', kind: 'CHK',                  dur: 0,  title: 'Morning check-in',        sub: 'Sleep 7h · 8/10',     state: 'done' },
    { time: '12:40', kind: 'MEAL', slot: 'LUNCH',  dur: 0,  title: 'Chicken bowl + rice',     sub: '620 kcal · 48P',      state: 'next' },
    { time: '15:00', kind: 'CON',                  dur: 30, title: 'Nutrition consult',       sub: 'Dr. Maya · Zoom' },
    { time: '16:00', kind: 'MEAL', slot: 'SNACK',  dur: 0,  title: 'Greek yogurt + almonds',  sub: '280 kcal · 22P' },
    { time: '18:30', kind: 'CHK',                  dur: 0,  title: 'Evening check-in',        sub: 'RPE recap · Jordan' },
    { time: '19:30', kind: 'MEAL', slot: 'DINNER', dur: 0,  title: 'Salmon, quinoa, greens',  sub: '580 kcal · 44P' },
  ],
  // Wed
  [
    { time: '07:00', kind: 'MEAL', slot: 'BFAST',  dur: 0,  title: 'Oats + whey + banana',    sub: '460 kcal · 34P' },
    { time: '08:00', kind: 'TRN',                  dur: 52, title: 'Upper Pull — Peak',       sub: '52 min · Jordan' },
    { time: '12:30', kind: 'MEAL', slot: 'LUNCH',  dur: 0,  title: 'Chicken caesar',          sub: '560 kcal · 42P' },
    { time: '15:30', kind: 'CHK',                  dur: 0,  title: 'Daily check-in',          sub: 'Sleep 7h12 · 8/10' },
    { time: '19:00', kind: 'MEAL', slot: 'DINNER', dur: 0,  title: 'Cod, rice, broccoli',     sub: '550 kcal · 42P' },
  ],
  // Thu
  [
    { time: '07:15', kind: 'MEAL', slot: 'BFAST',  dur: 0,  title: 'Yogurt parfait',          sub: '380 kcal · 30P' },
    { time: '12:30', kind: 'MEAL', slot: 'LUNCH',  dur: 0,  title: 'Buddha bowl',             sub: '590 kcal · 34P' },
    { time: '17:45', kind: 'TRN',                  dur: 45, title: 'Z2 run · 45 min',         sub: '5.6k · 8:00/km' },
  ],
  // Fri
  [
    { time: '07:00', kind: 'MEAL', slot: 'BFAST',  dur: 0,  title: 'Egg whites, toast',       sub: '320 kcal · 28P' },
    { time: '09:00', kind: 'TRN',                  dur: 54, title: 'Lower Push — Peak',       sub: '54 min · Jordan' },
    { time: '12:30', kind: 'MEAL', slot: 'LUNCH',  dur: 0,  title: 'Sushi, edamame',          sub: '640 kcal · 38P' },
    { time: '15:00', kind: 'CON',                  dur: 30, title: 'Nutrition consult',       sub: 'Dr. Maya · Zoom' },
    { time: '18:30', kind: 'CHK',                  dur: 0,  title: 'Evening check-in',        sub: 'RPE recap · Jordan' },
    { time: '20:00', kind: 'MEAL', slot: 'DINNER', dur: 0,  title: 'Pizza night (Fri)',       sub: 'Refeed · 38P' },
  ],
  // Sat
  [
    { time: '08:30', kind: 'TRN',                  dur: 75, title: 'Long run · 75 min',       sub: '11k · easy' },
    { time: '10:30', kind: 'MEAL', slot: 'BFAST',  dur: 0,  title: 'Brunch · pancakes',       sub: '720 kcal · 28P' },
    { time: '14:00', kind: 'MEAL', slot: 'SNACK',  dur: 0,  title: 'Smoothie + nuts',         sub: '420 kcal · 28P' },
    { time: '19:30', kind: 'MEAL', slot: 'DINNER', dur: 0,  title: 'Bolognese, salad',        sub: '580 kcal · 38P' },
  ],
  // Sun
  [
    { time: '09:00', kind: 'MEAL', slot: 'BFAST',  dur: 0,  title: 'Brunch (light)',          sub: '480 kcal · 28P' },
    { time: '13:00', kind: 'MEAL', slot: 'LUNCH',  dur: 0,  title: 'Sunday meal prep',        sub: '8 meals · 220P' },
    { time: '18:00', kind: 'MEAL', slot: 'DINNER', dur: 0,  title: 'Light dinner',            sub: '420 kcal · 32P' },
    { time: '—',     kind: 'REST',                 dur: 0,  title: 'Rest day',                sub: 'Walk + mobility' },
  ],
];

// Order categories show as week-strip dots (REST is intentionally omitted).
export const BS_CLIENT_WEEK_DOT_ORDER = ['TRN', 'MEAL', 'CHK', 'CON'];

// ═══════════════════════════════════════════════════════════
// WORKOUT DETAIL — keyed by the TRN titles used in the week above
// ═══════════════════════════════════════════════════════════
// Drives the home "Up next" workout card + its preview, so the featured workout
// always matches the day's actual session (from the shared week). `cardio: true`
// entries are segment-based (no load). `meta` is the summary line; `note` the
// coach's cue. Each move: { name, scheme, cue, load?, up? }.
export const BS_CLIENT_WORKOUTS = {
  'Upper Pull — Peak': {
    meta: '52 min · 6 moves · RPE 8 · ~420 kcal',
    brief: 'Three weeks of intent buys one chance to test. Six moves, three-second eccentrics on every pull — bar speed decides the rep, never the load.',
    note: 'Peak week — tempo matters more than load. 3s eccentric on every pull. If bar speed drops, drop a rep, not the tempo.',
    moves: [
      { name: 'Pull-up',        scheme: '4 × 6-8 · 3 min rest', cue: 'Dead hang. Chest to bar.',      load: '42 lb', up: true },
      { name: 'Barbell row',    scheme: '4 × 8 · 2 min rest',   cue: 'Hinge 45°, pull to sternum.',   load: '155 lb' },
      { name: 'Chest-sup. row', scheme: '3 × 10 · 90s rest',    cue: 'Pause 1s at peak contraction.', load: '60 lb' },
      { name: 'Face pull',      scheme: '3 × 15 · 60s rest',    cue: 'External rotation at the top.', load: '35 lb' },
      { name: 'Incline curl',   scheme: '3 × 12 · 60s rest',    cue: 'Full stretch. 3s eccentric.',   load: '27.5 lb' },
      { name: 'Farmer carry',   scheme: '3 × 40m · 60s rest',   cue: 'Crush grip. Ribs down.',        load: '80 lb' },
    ],
  },
  'Upper Push — Peak': {
    meta: '54 min · 6 moves · RPE 8 · ~430 kcal',
    brief: 'Press for the lockout you keep losing. Heavy top sets, then volume to back it up — own every inch of the range.',
    note: 'Peak push. Brace hard off the chest, own the lockout. Leave one clean rep in the tank on the top sets.',
    moves: [
      { name: 'Bench press',     scheme: '4 × 5 · 3 min rest',  cue: 'Tuck elbows, drive heels.',     load: '165 lb', up: true },
      { name: 'Overhead press',  scheme: '4 × 6 · 2 min rest',  cue: 'Squeeze glutes, ribs down.',    load: '95 lb' },
      { name: 'Incline DB press',scheme: '3 × 10 · 90s rest',   cue: 'Stretch at the bottom.',        load: '55 lb' },
      { name: 'Weighted dip',    scheme: '3 × 8 · 90s rest',    cue: 'Lean forward 15°.',             load: '+25 lb' },
      { name: 'Lateral raise',   scheme: '3 × 15 · 45s rest',   cue: 'Lead with the elbows.',         load: '20 lb' },
      { name: 'Triceps pushdown',scheme: '3 × 12 · 45s rest',   cue: 'Lock the elbows in.',           load: '50 lb' },
    ],
  },
  'Lower Pull — Vol.': {
    meta: '58 min · 6 moves · RPE 7 · ~460 kcal',
    brief: 'Hinge-biased volume. Hamstrings under tension the whole way down — the floor doesn’t move until your hips do.',
    note: 'Volume day — chase the stretch, not the ego. Smooth bar path off the floor, hips and bar rise together.',
    moves: [
      { name: 'Deadlift',        scheme: '4 × 5 · 3 min rest',  cue: 'Wedge in. Push the floor away.',load: '275 lb', up: true },
      { name: 'Romanian DL',     scheme: '4 × 8 · 2 min rest',  cue: 'Soft knees, bar grazes thigh.', load: '185 lb' },
      { name: 'Hamstring curl',  scheme: '3 × 12 · 75s rest',   cue: 'Pause 1s at full flexion.',     load: '70 lb' },
      { name: 'Back extension',  scheme: '3 × 15 · 60s rest',   cue: 'Round up one vertebra at a time.', load: '25 lb' },
      { name: 'Hip thrust',      scheme: '3 × 12 · 75s rest',   cue: 'Chin tucked, ribs down at top.',load: '225 lb' },
      { name: 'Calf raise',      scheme: '4 × 15 · 45s rest',   cue: 'Full stretch, 2s pause up.',    load: '120 lb' },
    ],
  },
  'Lower Push — Peak': {
    meta: '54 min · 6 moves · RPE 8 · ~440 kcal',
    brief: 'Peak-week legs. Depth before load — every squat to the same mark, drive the floor apart out of the hole.',
    note: 'Peak legs. Stay tight in the hole, drive the floor apart. Depth before load — every rep to the same mark.',
    moves: [
      { name: 'Back squat',      scheme: '5 × 3 · 3 min rest',  cue: 'Big air, brace, sit between hips.', load: '255 lb', up: true },
      { name: 'Front squat',     scheme: '3 × 6 · 2 min rest',  cue: 'Elbows high, stay upright.',     load: '165 lb' },
      { name: 'Leg press',       scheme: '3 × 10 · 90s rest',   cue: 'Knees track over toes.',        load: '360 lb' },
      { name: 'Walking lunge',   scheme: '3 × 20 · 90s rest',   cue: 'Long step, vertical shin.',     load: '50 lb' },
      { name: 'Leg extension',   scheme: '3 × 12 · 60s rest',   cue: 'Pause 1s at the top.',          load: '90 lb' },
      { name: 'Standing calf',   scheme: '4 × 12 · 45s rest',   cue: 'Full ROM, no bounce.',          load: '140 lb' },
    ],
  },
  'Z2 run · 45 min': {
    cardio: true,
    meta: '45 min · Zone 2 · ~5.6k · ~380 kcal',
    brief: 'An easy aerobic build. Conversational the whole way — if you can’t talk, you’re going too hard.',
    note: 'Keep it conversational — nose-breathing pace. If HR drifts over Z2, walk it back. Easy is the point.',
    moves: [
      { name: 'Warm-up',     scheme: '10 min · easy', cue: 'Build from a walk to an easy jog.' },
      { name: 'Zone 2 main', scheme: '30 min · steady', cue: 'Hold HR 60-70% — conversational.' },
      { name: 'Cooldown',    scheme: '5 min · walk',  cue: 'Bring the heart rate down, breathe.' },
    ],
  },
  'Long run · 75 min': {
    cardio: true,
    meta: '75 min · easy · ~11k · ~620 kcal',
    brief: 'Time on feet, not pace. Steady aerobic effort, fuel at the midpoint, finish like you could keep going.',
    note: 'Time on feet, not pace. Fuel at 45 min, sip water throughout. Finish feeling like you could keep going.',
    moves: [
      { name: 'Warm-up',     scheme: '10 min · easy',   cue: 'Loose and relaxed, let it open up.' },
      { name: 'Steady main', scheme: '55 min · aerobic',cue: 'Even effort, relaxed shoulders.' },
      { name: 'Strides',     scheme: '4 × 20s · brisk', cue: 'Quick turnover, not a sprint.' },
      { name: 'Cooldown',    scheme: '5 min · walk',    cue: 'Easy walk, deep breaths.' },
    ],
  },
};

// Today's workout item (from the shared week) + its detail, or null on a rest day.
export function bsClientWorkoutForDay(weekIdx) {
  const day = BS_CLIENT_WEEK_DEMO[weekIdx] || [];
  const item = day.find((it) => it.kind === 'TRN');
  if (!item) return null;
  return { ...item, detail: BS_CLIENT_WORKOUTS[item.title] || null };
}

// Build the 7-day Train demo PROGRAM (Mon..Sun) from the shared week, so the
// Train deck / live session / preview show the SAME workout as the home hero and
// the calendar for each day. Mirrors the day shape of bsBuildTrainProgram (the
// live-plan builder): { d, kicker, title, tag, tagColor, accent, headline, meta,
// copy, moves:[{n,m,s,l,cue}], total, coachLine }, plus time/timeLabel.
export function bsBuildDemoTrainProgram(t) {
  const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const monday = new Date(); monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const dateNum = (i) => { const d = new Date(monday); d.setDate(d.getDate() + i); return d.getDate(); };
  const fmt12 = (hhmm) => {
    const [h, m] = String(hhmm || '').split(':').map(Number);
    if (Number.isNaN(h)) return '';
    const ap = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ap}`;
  };
  return BS_CLIENT_WEEK_DEMO.map((day, i) => {
    const label = `${DOW[i]} ${dateNum(i)}`;
    const item = day.find((it) => it.kind === 'TRN');
    if (!item) {
      return {
        d: label, kicker: 'The Recovery', title: 'Rest day.', tag: 'REST',
        tagColor: t.GREEN, accent: t.GREEN, headline: 'Full rest.', time: '', timeLabel: '',
        meta: 'No session · 0 min',
        copy: 'No training today — recover, eat well, sleep. Tomorrow’s session is built on today’s rest.',
        moves: [], total: '0 sessions', coachLine: 'A skipped rest day is a skipped peak. Take it.',
      };
    }
    const detail = BS_CLIENT_WORKOUTS[item.title] || null;
    const cardio = !!(detail && detail.cardio);
    const moves = (detail ? detail.moves : []).map((m, j) => ({
      n: String(j + 1).padStart(2, '0'), m: m.name, s: m.scheme || '—', l: m.load || '—', cue: m.cue || '',
    }));
    const parts = detail && detail.meta ? detail.meta.split(' · ') : [];
    const timePart = parts[0] || (item.dur ? `${item.dur} min` : '—');
    const intensity = cardio ? (parts[1] || 'Zone 2') : (parts.find((p) => /rpe/i.test(p)) || 'RPE 8');
    return {
      d: label, kicker: cardio ? 'The Conditioning' : 'The Training',
      title: item.title, tag: cardio ? 'COND' : 'FEATURE',
      tagColor: cardio ? t.RUST : t.AMBER, accent: cardio ? t.RUST : t.AMBER,
      headline: item.title, time: item.time, timeLabel: fmt12(item.time),
      meta: `${timePart} · ${intensity}`,
      copy: (detail && detail.brief) || item.sub || 'Programmed by your coach.',
      moves,
      total: cardio ? `${moves.length} segment${moves.length === 1 ? '' : 's'}` : `${moves.length} move${moves.length === 1 ? '' : 's'}`,
      coachLine: (detail && detail.note) || 'Move with intent. Quality over load.',
    };
  });
}

// Empty 7-day program for a SIGNED-IN account with no assigned plan. There are
// no coaches on Shape yet, so a real user sees "no workout assigned" days — NOT
// the demo program (that's only the signed-out preview). Same shape the Train
// deck/hero render, with moves:[] so the hero shows its Rest/empty state.
export function bsEmptyTrainProgram(t, tr) {
  const T = bsTrainT(tr);
  const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const monday = new Date(); monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const dateNum = (i) => { const d = new Date(monday); d.setDate(d.getDate() + i); return d.getDate(); };
  return DOW.map((dl, i) => ({
    d: `${dl} ${dateNum(i)}`, kicker: 'No program',
    title: T('session:train.empty.title', 'No workout.'),
    tag: 'REST', tagLabel: bsTrainTagLabel('REST', T),
    tagColor: t.INK50, accent: t.INK50,
    headline: T('session:train.empty.headline', 'No workout assigned.'), time: '', timeLabel: '',
    meta: T('session:train.empty.meta', 'No session'),
    copy: T('session:train.empty.copy', 'No training assigned yet — when you’re working with a coach, your week shows up here.'),
    moves: [], total: '0 sessions', coachLine: '',
  }));
}

// Scale a parsed load string ("185 lb", "24 kg", "BW", "—") by a factor, rounding
// to the nearest 5 for barbell-ish numbers. Non-numeric loads pass through.
// Nudge a shown RPE in a meta string ("52 min · RPE 8" → "52 min · RPE 7").
function bsAdjustRpeMeta(meta, adj) {
  if (!adj) return meta;
  return String(meta || '').replace(/RPE\s*(\d+(?:\.\d+)?)/i, (_, n) => `RPE ${Math.min(10, Math.max(5, Math.round(Number(n) + adj)))}`);
}

const BS_SPLIT_TAG = { 'Push day': 'PUSH', 'Pull day': 'PULL', 'Legs day': 'LEGS', 'Upper day': 'UPPER', 'Lower day': 'LOWER', 'Conditioning': 'COND' };

// ⚠ A DAY'S `tag` IS A LOGIC TOKEN, NOT A LABEL — and that is why the Train cut
// needed a design change before a single tr() could land. Three call sites read
// it as a value the app must recognise (`tag === 'REST'` → the deck's rest state,
// the week strip's rest flags, the on-deck rows), so translating it in place
// would have stopped the app recognising a rest day in all twelve non-English
// locales — silently, with every gate green.
//
// So the token STAYS English and canonical; `tagLabel` is the string a member
// reads. Every writer sets both through this one function, and every reader
// picks its side deliberately: logic reads `tag`, render reads `tagLabel`.
export const BS_TRAIN_TAG_KEY = {
  REST: 'session:train.tag.rest',
  YOURS: 'session:train.tag.yours',
  CUSTOM: 'session:train.tag.custom',
  FEATURE: 'session:train.tag.feature',
  PUSH: 'session:train.tag.push',
  PULL: 'session:train.tag.pull',
  LEGS: 'session:train.tag.legs',
  UPPER: 'session:train.tag.upper',
  LOWER: 'session:train.tag.lower',
  COND: 'session:train.tag.cond',
};

// Translate a tag token for display. `T` is the injected translator built by
// bsTrainT (below); an unknown token falls through to itself, so a tag added
// later still renders rather than blanking.
export function bsTrainTagLabel(tag, T) {
  const key = BS_TRAIN_TAG_KEY[tag];
  return key ? T(key, tag) : tag;
}

// The injected-translator shape these module-scope builders use (they cannot
// hold a hook). `tr` is optional and the shipped English rides at every call
// site as the defaultValue, so a caller that passes nothing — and a catalog
// that fails to load — both degrade to exactly the English that shipped.
// ⚠ The fallback is PRE-INTERPOLATED English, never an ICU string — the same
// rule cut 1 set for the telegram: no ICU is ever evaluated on the path that
// exists because the catalog is unavailable. Plural call sites therefore pass
// the already-correct English ("3 moves") as `en` and let the catalog own the
// plural forms.
export function bsTrainT(tr) {
  return (key, en, vars) => {
    try {
      if (tr) return tr(key, { defaultValue: en, ...(vars || {}) });
    } catch (e) { /* fall through to the English below */ }
    let out = String(en);
    if (vars) for (const k of Object.keys(vars)) out = out.split(`{${k}}`).join(String(vars[k]));
    return out;
  };
}

// Apply a coach's "Adjust program" intent (client_programs.detail.training) onto a
// built Train deck so the client's per-day workouts actually reflect what the coach
// set — not just the banner. Honest transform (no fabricated exercises):
//   • intensity → scales every training day's loads + shown RPE (deload lighter /
//     progress nudges up / maintain unchanged) and labels the day,
//   • days[] weekly split → coach "Rest" turns that day into a rest day; a focus
//     label re-themes the day's eyebrow + tag (keeps the programmed moves),
//   • the coach's note rides onto each adjusted day's coach line.
// Returns the program unchanged when there's no applied adjustment.
export function bsApplyTrainAdjust(program, training, t, tr) {
  if (!Array.isArray(program) || !training || !training.updatedAt) return program;
  const T = bsTrainT(tr);
  const intensity = training.intensity || 'maintain';
  const scale = BS_ADJUST_SCALE[intensity] ?? 1;
  const rpeAdj = intensity === 'deload' ? -1 : 0;
  const intensityLabel = intensity === 'deload'
    ? T('session:train.intensity.deload', 'Deload · lighter')
    : intensity === 'progress'
      ? T('session:train.intensity.progress', 'Progress · nudge up')
      : T('session:train.intensity.maintain', 'Maintain');
  const days = Array.isArray(training.days) ? training.days : null;
  const note = training.note || '';
  return program.map((day, i) => {
    const cd = days ? days[i] : null;
    const hasMoves = Array.isArray(day.moves) && day.moves.length > 0;
    // Coach scheduled REST here → override a training day to recovery.
    if (cd === 'Rest' && hasMoves) {
      return {
        ...day,
        tag: 'REST', tagLabel: bsTrainTagLabel('REST', T),
        tagColor: t.GREEN, accent: t.GREEN,
        kicker: T('session:train.kicker.recovery', 'The Recovery'),
        title: T('session:train.restTitleFlat', 'Rest day.'),
        headline: T('session:train.coachRestHeadline', 'Coach-set rest.'),
        meta: T('session:train.noSessionMeta', 'No session · 0 min'),
        moves: [], total: '0 sessions',
        copy: T('session:train.coachRestCopy', 'Your coach scheduled recovery today — walk, mobility, sleep.'),
        coachLine: note || T('session:train.coachRestLine', 'Recovery is part of the plan.'),
        coachAdjust: true, intensityLabel: null,
      };
    }
    if (!hasMoves) return day;
    // A row the regeneration already rewrote (spec #1707) carries a matching
    // generation stamp — its loads are baked from base, so display scaling
    // would double-apply. Keep the banner/labels only. Rows without the stamp
    // (e.g. Assigned after the regeneration) keep today's display behavior.
    if (training.gen != null && day.adjustGen != null && Number(day.adjustGen) === Number(training.gen)) {
      return { ...day, coachAdjust: true, intensityLabel, coachLine: note || day.coachLine };
    }
    const next = { ...day, moves: day.moves.map((m) => ({ ...m, l: bsScaleLoad(m.l, scale) })), meta: bsAdjustRpeMeta(day.meta, rpeAdj), coachAdjust: true, intensityLabel, coachLine: note || day.coachLine };
    // Re-theme by the coach split focus (keep the day's actual moves).
    if (cd && cd !== 'Rest' && day.tag !== 'COND' && BS_SPLIT_TAG[cd]) {
      next.coachFocus = cd.replace(/\s*day$/i, '');
      next.tag = BS_SPLIT_TAG[cd];
      next.tagLabel = bsTrainTagLabel(next.tag, T);
    }
    return next;
  });
}
