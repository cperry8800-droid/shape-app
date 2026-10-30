// A trainer's work on their profile: the programs they sell, the workouts they posted on video, and
// which of their moves happen on each piece of their studio (owner, 2026-10-29: "There needs to be
// videos in replays of specific workouts or programs. The layout of the gym floor needs to include
// coaches workouts based on those machines"; of the options put to them, Replays shows workouts and
// programs, and the studio both reads the moves' equipment and takes the coach's own pins).
//
// Pure, so tests/coach-work.test.mjs runs it without a browser. The profile hands in:
//   - the coach's published plans, as anyone reads them (get_coach_sale_plans_by_user, whose program
//     detail is the public preview: each move's name, equipment and muscle, its week and day, the
//     first week, and one free video; 2026-10-29-program-preview-names.sql);
//   - their profile cards (bsProfileCardFromPost over their posts);
//   - their studio (profile_custom.studio, profileCustom.mjs).
// Nothing here reads more than the preview gives: sets, loads, cues and the clip of each move stay
// with the buyer.
import { bsPlanPreview, bsProgramLine } from './planPreview.mjs';

export const BS_WORK_PROGRAMS_MAX = 12;
export const BS_WORK_VIDEOS_MAX = 12;
export const BS_WORK_MOVES_MAX = 60;
const PLAN_SCAN = 40;
const ROW_SCAN = 120;

const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const httpsUrl = (u) => typeof u === 'string' && u.length <= 2048 && /^https:\/\/[^\s]+$/i.test(u);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Whether a plan is sold for money: a price above zero ("Free" and 0 are not; checkout charges cents). */
export const bsWorkPaid = (price) => { const n = Number(String(price == null ? '' : price).replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0; };

/** The price as the storefront prints it: "$49", "Free", or null when the plan names none. */
export function bsWorkPrice(price) {
  if (price == null || price === '' || price === 0) return null;
  const s = clean(price, 24);
  if (!s) return null;
  return /^\$|free/i.test(s) ? s : `$${s}`;
}

// A week line ("Week 3 — Peak") or weekday line ("Mon — Push") of a text outline is the plan's
// structure, not a move.
const STRUCTURE_LINE = /^(week\s*\d+|(mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun)(day|nesday|sday|urday|rsday)?\.?)(\s*[—–:\-|·]|\s*$)/i;

/**
 * The moves of a program, as the preview names them: { name, equipment, muscle }, one per name,
 * in the program's order. A builder's rows carry their equipment; a text outline's lines are cut
 * to their names (bsProgramLine, the server's rule) and carry none.
 */
export function bsProgramMoves(detail) {
  const rows = isObj(detail) && Array.isArray(detail.blocks) ? detail.blocks.slice(0, ROW_SCAN) : [];
  const out = [];
  const seen = new Set();
  for (const r of rows) {
    let name = '', equipment = '', muscle = '';
    if (isObj(r) && typeof r.name === 'string') {
      name = clean(r.name, 80);
      equipment = typeof r.equipment === 'string' ? clean(r.equipment, 40) : '';
      muscle = typeof r.muscle === 'string' ? clean(r.muscle, 40) : '';
    } else {
      const text = typeof r === 'string' ? r : isObj(r) && typeof r.text === 'string' ? r.text : '';
      const line = clean(text, 200);
      if (!line || STRUCTURE_LINE.test(line)) continue;
      name = clean(bsProgramLine(line), 80);
    }
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push({ name, ...(equipment ? { equipment } : {}), ...(muscle ? { muscle } : {}) });
    if (out.length >= BS_WORK_MOVES_MAX) break;
  }
  return out;
}

/**
 * The coach's programs: every published plan that isn't a meal plan, in their order, each with
 * { id, name, price, paid, plan, preview, video, poster, weeks, perWeek, moves }. `video` is the one the
 * preview gives free ({ url, type: 'video' }), `poster` its first image, `preview` bsPlanPreview's
 * model (the days and moves the program sheet lists), `plan` the row the storefront buys.
 */
export function bsCoachPrograms(plans) {
  const out = [];
  for (const pl of (Array.isArray(plans) ? plans.slice(0, PLAN_SCAN) : [])) {
    if (!isObj(pl) || pl.kind === 'meal_plan' || pl.id == null) continue;
    const name = clean(pl.name, 80);
    if (!name) continue;
    const preview = bsPlanPreview(pl, { isNutri: false });
    const v = preview.media.find((m) => m.type === 'video' && httpsUrl(m.url));
    const img = preview.media.find((m) => m.type === 'image' && httpsUrl(m.url));
    out.push({
      id: String(pl.id),
      name,
      price: bsWorkPrice(pl.price),
      // A free program has no checkout to go through (Codex on #2508: "Buy · Free" failed there).
      paid: bsWorkPaid(pl.price),
      plan: pl,
      preview,
      video: v ? { url: v.url, type: 'video', name: clean(v.name, 80) || name } : null,
      poster: img ? img.url : null,
      // The weeks the plan states, else the weeks a builder holds (the preview's `weeks`).
      weeks: preview.weeks || (isObj(pl.detail) && Number.isInteger(pl.detail.weeks) && pl.detail.weeks > 0 && pl.detail.weeks <= 52 ? pl.detail.weeks : null),
      perWeek: preview.sessionsPerWeek || null,
      moves: bsProgramMoves(pl.detail),
    });
    if (out.length >= BS_WORK_PROGRAMS_MAX) break;
  }
  return out;
}

/**
 * The workouts the coach posted with a video, newest first as the cards come: { key, title, body,
 * ago, typeLabel, video: { url, type: 'video' }, breakdown }. A session they logged with a video is
 * one too, and keeps its sets.
 */
export function bsWorkoutVideos(cards) {
  const out = [];
  for (const c of (Array.isArray(cards) ? cards.slice(0, 80) : [])) {
    if (!isObj(c) || !httpsUrl(c.video)) continue;
    const rows = isObj(c.breakdown) && Array.isArray(c.breakdown.rows) && c.breakdown.rows.length ? c.breakdown : null;
    out.push({
      key: String(c.key || c.postId || c.video),
      title: clean(c.title, 80),
      body: clean(c.body, 600),
      ago: clean(c.ago, 24),
      typeLabel: clean(c.typeLabel, 24),
      video: { url: c.video, type: 'video', name: clean(c.title, 80) },
      breakdown: rows,
    });
    if (out.length >= BS_WORK_VIDEOS_MAX) break;
  }
  return out;
}

// ── Which moves happen on which piece ─────────────────────────────────────────────────────────
// A move is done on a piece when its equipment is the piece's own (a kettlebell move on the
// kettlebells), or its name says the piece and its equipment doesn't say otherwise (a "Leg press"
// on the leg press; a "Back squat" on the rack unless it's done with dumbbells). Equipment words are
// the exercise catalog's (2026-10-07-exercise-catalog.sql and dashBuilderCore.js's EXERCISES).
// `with` lists the equipment a name match accepts ('' for none written); `not` names a match never
// means this piece. A move can be on more than one piece (a bench press: the rack and the bench).
const ANY = null;
const BAR = ['Barbell', ''];
const RULES = {
  rack: { eq: ['Safety bar'], name: /\b(back|front|box|pause|high bar|low bar)?\s*squats?\b|bench press|overhead press|\bohp\b|military press|push press|rack pull|good morning|barbell (row|lunge|split squat|reverse lunge)/, with: BAR, not: /goblet|hack|smith|pistol|bulgarian|\bair\b|jump|wall|sissy|cossack|split squat|belt|landmine|zercher sit/ },
  platform: { eq: ['Trap bar'], name: /deadlift|\brdl\b|romanian|power clean|hang clean|\bclean\b|snatch|\bjerk\b|pendlay/, with: ['Barbell', 'Trap bar', ''], not: /single.leg|kettlebell|dumbbell/ },
  bench: { eq: [], name: /bench|incline|decline|\bfl(y|ye|yes)\b|chest.supported|skull ?crusher|seated (dumbbell|shoulder) press|step.?up/, with: ['Barbell', 'Dumbbell', 'EZ bar', ''], not: /machine|cable|pec deck/ },
  adjbench: { eq: [], name: /incline|decline|bench|chest.supported|seated (dumbbell|shoulder) press|\bfl(y|ye|yes)\b/, with: ['Barbell', 'Dumbbell', 'EZ bar', ''], not: /machine|cable|pec deck/ },
  dumbbells: { eq: ['Dumbbell'], name: /dumbbell|\bdb\b/, with: ANY },
  bells: { eq: ['Kettlebell'], name: /kettlebell|\bkb\b|swing|turkish get.?up/, with: ['Kettlebell', ''] },
  plates: { eq: ['Plate'], name: /plate (pinch|raise|front raise)/, with: ANY },
  barbells: { eq: ['EZ bar'], name: /barbell curl|ez.?bar|drag curl/, with: ['Barbell', 'EZ bar', ''] },
  landmine: { eq: ['Landmine'], name: /landmine/, with: ANY },
  smith: { eq: ['Smith machine'], name: /smith/, with: ANY },
  cable: { eq: ['Cable'], name: /cable|face pull|pallof|tricep (push.?down|pressdown)|pressdown|push.?down|crossover|straight.arm pull.?down/, with: ['Cable', 'Machine', ''] },
  latpull: { eq: [], name: /pull.?down|lat pull/, with: ['Cable', 'Machine', ''], not: /straight.arm/ },
  chest: { eq: [], name: /chest press|machine (bench|press)/, with: ['Machine', ''] },
  pecdeck: { eq: [], name: /pec deck|rear delt (fly|machine)|machine fly|butterfly/, with: ['Machine', ''] },
  legpress: { eq: [], name: /leg press/, with: ANY },
  hack: { eq: [], name: /hack squat/, with: ANY },
  legext: { eq: [], name: /leg extension|knee extension/, with: ['Machine', ''] },
  legcurl: { eq: [], name: /leg curl|hamstring curl|lying curl|seated curl/, with: ['Machine', ''] },
  hipthrust: { eq: [], name: /hip thrust|glute (bridge|drive)/, with: ['Barbell', 'Machine', ''] },
  preacher: { eq: [], name: /preacher/, with: ANY },
  dip: { eq: [], name: /\bdips?\b|knee raise|leg raise/, with: ['Bodyweight', 'None', ''], not: /ring/ },
  ghd: { eq: [], name: /\bghd\b|back extension|hyperextension|reverse hyper|nordic|glute.ham/, with: ANY },
  treadmill: { eq: ['Treadmill'], name: /treadmill|incline walk|\brun\b|\bruns\b|jog|tempo run|sprint intervals/, with: ['Treadmill', 'Bodyweight', 'None', ''] },
  bike: { eq: ['Bike'], name: /\bbike\b|cycl|spin/, with: ['Bike', 'Machine', ''], not: /air bike|assault|echo/ },
  airbike: { eq: [], name: /air bike|assault bike|echo bike|airdyne/, with: ANY },
  rower: { eq: ['Rower'], name: /\brower\b|row erg|rowing|\berg\b(?!.*ski)/, with: ['Rower', 'Machine', ''] },
  ski: { eq: ['Ski machine'], name: /ski ?erg|ski machine/, with: ANY },
  elliptical: { eq: [], name: /elliptical|cross.?trainer/, with: ANY },
  stair: { eq: [], name: /stair|step ?mill/, with: ANY },
  rig: { eq: ['Rings'], name: /pull.?ups?\b|chin.?ups?\b|muscle.?ups?\b|toes.to.bar|hanging|dead hang|ring (row|dip)|inverted row/, with: ['Bodyweight', 'Rings', 'Band', 'None', ''] },
  turf: { eq: [], name: /sled|sprint|farmer|carry|bear crawl|walking lunge|prowler|shuttle/, with: ANY },
  sled: { eq: ['Sled'], name: /sled|prowler/, with: ANY },
  boxes: { eq: ['Box'], name: /box jump|step.?up|box squat|depth jump/, with: ANY },
  ropes: { eq: ['Battle rope'], name: /battle rope|rope (wave|slam|climb)/, with: ANY },
  wallballs: { eq: ['Medicine ball'], name: /wall ball|med(icine)? ball|ball slam/, with: ANY },
  straps: { eq: [], name: /\btrx\b|suspension|strap row/, with: ANY },
  bag: { eq: [], name: /heavy bag|\bbag\b|punch|\bjab\b|uppercut|shadow ?box|\bcombos?\b/, with: ANY },
  ring: { eq: [], name: /spar|pad work|mitts|\bpads\b|footwork/, with: ANY },
  mats: { eq: ['Foam roller', 'Stability ball', 'Wheel'], name: /plank|stretch|mobility|yoga|dead bug|bird dog|crunch|sit.?up|hollow|foam roll|pilates mat|\bflow\b|breath|glute bridge|push.?up|cat.?cow|ab wheel/, with: ANY, not: /cable|machine/ },
  reformer: { eq: [], name: /reformer/, with: ANY },
  barre: { eq: [], name: /barre|pli[eé]|relev[eé]/, with: ANY },
};

/** Whether a move ({ name, equipment? }) is done on a studio piece of type `type`. */
export function bsPieceMoves(type, move) {
  const rule = RULES[type];
  if (!rule || !isObj(move)) return false;
  const name = clean(move.name, 80).toLowerCase();
  const eq = clean(move.equipment, 40);
  if (!name) return false;
  if (eq && rule.eq.some((e) => e.toLowerCase() === eq.toLowerCase())) return !(rule.not && rule.not.test(name));
  if (!rule.name.test(name) || (rule.not && rule.not.test(name))) return false;
  return rule.with === ANY || rule.with.some((e) => e.toLowerCase() === eq.toLowerCase());
}

/** The piece types a move is done on. */
export function bsMovePieces(move) {
  return Object.keys(RULES).filter((t) => bsPieceMoves(t, move));
}

const inside = (p, z) => {
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  return cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h;
};

/**
 * What each piece of the studio holds of the coach's programs, by piece index: { programs:
 * [{ id, name, moves: [name] }], count, pinned: [id] }, or null for a piece with nothing. A zone
 * holds what the pieces inside it hold. A station's pins (st.pins) name programs the coach set
 * there; a pin to a program no longer published is left out.
 */
export function bsStudioWork(studio, programs) {
  const items = isObj(studio) && Array.isArray(studio.items) ? studio.items : [];
  const progs = Array.isArray(programs) ? programs : [];
  const byId = new Map(progs.map((p) => [p.id, p]));
  const own = items.map((p) => {
    if (!isObj(p) || p.t === 'zone') return [];
    return progs.map((pr) => ({ id: pr.id, name: pr.name, moves: pr.moves.filter((m) => bsPieceMoves(p.t, m)).map((m) => m.name) })).filter((x) => x.moves.length);
  });
  return items.map((p, i) => {
    if (!isObj(p)) return null;
    let held = own[i];
    if (p.t === 'zone') {
      const merged = new Map();
      items.forEach((q, j) => {
        if (j === i || !isObj(q) || q.t === 'zone' || !inside(q, p)) return;
        for (const x of own[j]) {
          const m = merged.get(x.id) || { id: x.id, name: x.name, moves: [] };
          for (const n of x.moves) if (!m.moves.includes(n)) m.moves.push(n);
          merged.set(x.id, m);
        }
      });
      held = progs.map((pr) => merged.get(pr.id)).filter(Boolean);
    }
    const pinned = isObj(p.st) && Array.isArray(p.st.pins) ? p.st.pins.filter((id) => byId.has(id)) : [];
    const count = held.reduce((n, x) => n + x.moves.length, 0);
    return count || pinned.length ? { programs: held, count, pinned } : null;
  });
}
