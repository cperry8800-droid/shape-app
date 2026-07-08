// Starter training catalog — the seed shelves a coach-less member picks from.
//
// TWO shelves:
//   • BS_STARTER_SESSIONS — one-tap weekly workouts (prefill the builder's
//     SESSION mode).
//   • BS_STARTER_PROGRAMS — multi-week progressive schedules incl. marathon /
//     half / 10K / triathlon / Hyrox / a strength block (prefill PROGRAM mode).
//
// Everything here is a SEED for the builder, never a fixed prescription — a
// picked template lands in the builder for the member to adjust (length, days,
// moves) before anything is saved. `bsStarterProgram(id, weeks)` resolves a
// program to a concrete N-week schedule so the length is always member-chosen.
//
// A "move" is a lift row ({ name, sets, reps, load }) OR a segment row
// ({ name, seg }) — runs/rides/swims and Hyrox stations are segments; barbell
// work is a lift. A single day can mix both (a Hyrox or brick day).

// ── Sessions ─────────────────────────────────────────────────────────────────
// Lifts: reps as a string so "8-12" survives. Load '—' = member fills it in.
const lift = (name, sets, reps, load = '—') => ({ name, sets, reps, load });
const seg = (name, s) => ({ name, seg: s });

export const BS_STARTER_SESSIONS = [
  {
    id: 'push', name: 'Push day', discipline: 'strength',
    moves: [
      lift('Barbell bench press', 4, '6-8'),
      lift('Overhead press', 3, '8-10'),
      lift('Incline dumbbell press', 3, '10-12'),
      lift('Lateral raise', 3, '12-15'),
      lift('Triceps pushdown', 3, '12-15'),
    ],
  },
  {
    id: 'pull', name: 'Pull day', discipline: 'strength',
    moves: [
      lift('Deadlift', 3, '5'),
      lift('Pull-up', 4, '6-10'),
      lift('Barbell row', 3, '8-10'),
      lift('Face pull', 3, '15-20'),
      lift('Barbell curl', 3, '10-12'),
    ],
  },
  {
    id: 'legs', name: 'Leg day', discipline: 'strength',
    moves: [
      lift('Back squat', 4, '6-8'),
      lift('Romanian deadlift', 3, '8-10'),
      lift('Leg press', 3, '10-12'),
      lift('Walking lunge', 3, '12'),
      lift('Standing calf raise', 4, '12-15'),
    ],
  },
  {
    id: 'upper', name: 'Upper body', discipline: 'strength',
    moves: [
      lift('Bench press', 4, '6-8'),
      lift('Barbell row', 4, '6-8'),
      lift('Overhead press', 3, '8-10'),
      lift('Lat pulldown', 3, '10-12'),
      lift('Dumbbell curl', 3, '12'),
      lift('Triceps extension', 3, '12'),
    ],
  },
  {
    id: 'lower', name: 'Lower body', discipline: 'strength',
    moves: [
      lift('Back squat', 4, '5-6'),
      lift('Hip thrust', 3, '8-10'),
      lift('Bulgarian split squat', 3, '10'),
      lift('Leg curl', 3, '12-15'),
      lift('Calf raise', 4, '15'),
    ],
  },
  {
    id: 'fullbody', name: 'Full body', discipline: 'strength',
    moves: [
      lift('Goblet squat', 3, '10'),
      lift('Dumbbell bench press', 3, '10'),
      lift('One-arm row', 3, '10'),
      lift('Romanian deadlift', 3, '10'),
      lift('Plank', 3, '45s'),
    ],
  },
  {
    id: 'conditioning', name: 'Conditioning', discipline: 'conditioning',
    moves: [
      seg('Row erg', '5 min · easy warm-up'),
      seg('AMRAP 12 min', '10 KB swings · 10 push-ups · 10 air squats'),
      seg('Assault bike', '5 × 30s hard / 90s easy'),
      seg('Cool-down walk', '5 min'),
    ],
  },
  {
    id: 'easy-run', name: 'Easy run', discipline: 'run',
    moves: [seg('Easy run', '4 mi · Z2 · conversational')],
  },
  {
    id: 'tempo-run', name: 'Tempo run', discipline: 'run',
    moves: [
      seg('Warm-up', '1 mi · easy'),
      seg('Tempo', '3 mi · Z3-4 · comfortably hard'),
      seg('Cool-down', '1 mi · easy'),
    ],
  },
  {
    id: 'intervals', name: 'Track intervals', discipline: 'run',
    moves: [
      seg('Warm-up', '1.5 mi · easy + strides'),
      seg('Intervals', '6 × 800m @ 5K pace · 2 min jog'),
      seg('Cool-down', '1 mi · easy'),
    ],
  },
];

// ── Program builders ─────────────────────────────────────────────────────────
// Each program's build(weeks) returns [{ week, days: [{ dow, title, moves }] }].
// Progressions are functions of the week index so a member-chosen length always
// produces a coherent schedule (build → cutback → taper).

const clampWeeks = (w) => Math.max(1, Math.min(26, Math.round(Number(w) || 1)));

// Endurance long-run (or long-ride) miles across a block: build ~ (base → peak),
// a cutback every 4th week, and a 2-3 week taper landing near 55-65% of peak.
function enduranceLong(base, peak, weeks, wk) {
  const taperLen = weeks >= 12 ? 3 : weeks >= 6 ? 2 : 1;
  const buildLen = Math.max(1, weeks - taperLen);
  if (wk >= buildLen) {
    // Taper: step down from ~peak to ~55%.
    const into = wk - buildLen + 1;            // 1..taperLen
    const frac = 1 - (into / (taperLen + 1)) * 0.9;
    return Math.max(base, Math.round(peak * Math.max(0.5, frac)));
  }
  // Build: linear base→peak with a cutback (10% dip) every 4th week.
  const prog = buildLen > 1 ? wk / (buildLen - 1) : 1;
  let mi = base + (peak - base) * prog;
  if ((wk + 1) % 4 === 0) mi *= 0.85;          // cutback week
  return Math.max(base, Math.round(mi));
}

function runProgram(peakLong, base, easyMi, disciplineLabel = 'run') {
  return (weeks) => {
    const n = clampWeeks(weeks);
    return Array.from({ length: n }, (_, i) => {
      const wk = i;
      const long = enduranceLong(base, peakLong, n, wk);
      const taper = wk >= n - (n >= 12 ? 3 : 2);
      return {
        week: wk + 1,
        days: [
          { dow: 1, title: 'Easy run', moves: [seg('Easy run', `${easyMi} mi · Z2`)] },
          { dow: 3, title: taper ? 'Sharpener' : 'Tempo / intervals', moves: [
            seg('Warm-up', '1 mi easy'),
            taper ? seg('Strides', '4 × 100m fast') : seg('Quality', `${Math.max(2, Math.round(long * 0.35))} mi · Z3-4`),
            seg('Cool-down', '1 mi easy'),
          ] },
          { dow: 5, title: 'Easy + strides', moves: [seg('Easy run', `${Math.max(3, easyMi - 1)} mi · Z2`)] },
          { dow: 6, title: taper ? 'Long (taper)' : 'Long run', moves: [seg('Long run', `${long} mi · Z2`)] },
        ],
      };
    });
  };
}

function triProgram() {
  return (weeks) => {
    const n = clampWeeks(weeks);
    return Array.from({ length: n }, (_, i) => {
      const wk = i;
      const bikeLong = enduranceLong(12, 30, n, wk);
      const runLong = enduranceLong(3, 8, n, wk);
      return {
        week: wk + 1,
        days: [
          { dow: 1, title: 'Swim technique', moves: [seg('Swim', `${800 + wk * 50}m · drills + steady`)] },
          { dow: 2, title: 'Bike intervals', moves: [seg('Warm-up', '10 min easy'), seg('Bike', '5 × 3 min Z4 / 3 min easy')] },
          { dow: 3, title: 'Easy run', moves: [seg('Run', `${Math.max(3, Math.round(runLong * 0.6))} mi · Z2`)] },
          { dow: 4, title: 'Swim endurance', moves: [seg('Swim', `${1000 + wk * 75}m · continuous`)] },
          { dow: 5, title: 'Long bike', moves: [seg('Bike', `${bikeLong} mi · Z2`)] },
          { dow: 6, title: 'Brick (bike + run)', moves: [seg('Bike', `${Math.round(bikeLong * 0.6)} mi · Z2`), seg('Run off the bike', `${Math.max(2, Math.round(runLong * 0.5))} mi · Z3`)] },
        ],
      };
    });
  };
}

function hyroxProgram() {
  return (weeks) => {
    const n = clampWeeks(weeks);
    return Array.from({ length: n }, (_, i) => {
      const wk = i;
      const rounds = 3 + Math.min(2, Math.floor(wk / 3));   // volume ramps
      return {
        week: wk + 1,
        days: [
          { dow: 1, title: 'Strength — lower', moves: [
            lift('Back squat', 4, '5'), lift('Romanian deadlift', 3, '8'), lift('Walking lunge', 3, '20m'),
          ] },
          { dow: 2, title: 'Compromised running', moves: [
            seg('Run', '1 km · Z3'), seg('Sled push', '50m · heavy'), seg('Run', '1 km · Z3'), seg('Burpee broad jumps', '15 reps'),
          ] },
          { dow: 4, title: 'Strength — push/pull', moves: [
            lift('Push press', 4, '6'), lift('Barbell row', 4, '8'), lift('Farmers carry', 3, '40m'),
          ] },
          { dow: 5, title: `Hyrox sim (${rounds} rounds)`, moves: [
            seg('Run', '1 km'), seg('SkiErg', '500m'), seg('Sled pull', '50m'), lift('Wall balls', 3, '20'),
          ] },
          { dow: 6, title: 'Zone 2 base', moves: [seg('Easy run or row', `${25 + wk * 2} min · Z2`)] },
        ],
      };
    });
  };
}

function strengthBlock() {
  return (weeks) => {
    const n = clampWeeks(weeks);
    return Array.from({ length: n }, (_, i) => {
      const wk = i;
      const note = `week ${wk + 1} · add ~2.5-5% to main lifts`;
      return {
        week: wk + 1,
        days: [
          { dow: 1, title: 'Squat focus', moves: [lift('Back squat', 4, '5', note), lift('Leg press', 3, '10'), lift('Leg curl', 3, '12')] },
          { dow: 3, title: 'Bench focus', moves: [lift('Bench press', 4, '5', note), lift('Overhead press', 3, '8'), lift('Dip', 3, '10')] },
          { dow: 5, title: 'Deadlift focus', moves: [lift('Deadlift', 3, '5', note), lift('Barbell row', 4, '8'), lift('Pull-up', 3, 'AMRAP')] },
        ],
      };
    });
  };
}

export const BS_STARTER_PROGRAMS = [
  { id: 'marathon', name: 'Marathon', discipline: 'run', defaultWeeks: 16, daysPerWeek: 4, build: runProgram(20, 8, 5) },
  { id: 'half', name: 'Half-marathon', discipline: 'run', defaultWeeks: 12, daysPerWeek: 4, build: runProgram(12, 5, 4) },
  { id: '10k', name: '10K', discipline: 'run', defaultWeeks: 8, daysPerWeek: 4, build: runProgram(7, 3, 3) },
  { id: 'tri-sprint', name: 'Triathlon (sprint)', discipline: 'triathlon', defaultWeeks: 12, daysPerWeek: 6, build: triProgram() },
  { id: 'hyrox', name: 'Hyrox', discipline: 'hybrid', defaultWeeks: 8, daysPerWeek: 5, build: hyroxProgram() },
  { id: 'strength-block', name: 'Strength block', discipline: 'strength', defaultWeeks: 8, daysPerWeek: 3, build: strengthBlock() },
];

// Resolve a program id + a member-chosen length → a concrete schedule.
// Clamps weeks to 1..26. Returns null for an unknown id.
export function bsStarterProgram(id, weeks) {
  const p = BS_STARTER_PROGRAMS.find((x) => x.id === id);
  if (!p) return null;
  return { id: p.id, name: p.name, discipline: p.discipline, weeks: p.build(clampWeeks(weeks)) };
}

// ── Shape validators (used by tests + the builder to reject malformed drafts) ─
function validMove(m) {
  if (!m || typeof m.name !== 'string' || !m.name) return false;
  const isLift = m.sets != null && m.reps != null;
  const isSeg = typeof m.seg === 'string' && m.seg.length > 0;
  return isLift || isSeg;
}

export function bsValidSessionShape(s) {
  return !!s && typeof s.id === 'string' && typeof s.name === 'string'
    && Array.isArray(s.moves) && s.moves.length > 0 && s.moves.every(validMove);
}

export function bsValidProgramShape(p) {
  if (!p || typeof p.name !== 'string' || !Array.isArray(p.weeks) || p.weeks.length === 0) return false;
  return p.weeks.every((wk) =>
    wk && Number.isInteger(wk.week) && Array.isArray(wk.days)
    && wk.days.every((d) => d && Number.isInteger(d.dow) && d.dow >= 0 && d.dow <= 6
      && typeof d.title === 'string' && d.title && Array.isArray(d.moves)));
}
