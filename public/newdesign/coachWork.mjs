// A trainer's work on their profile: the programs they sell, the workouts they posted on video, and
// which of their moves happen on each piece of their studio (owner, 2026-10-29: "There needs to be
// videos in replays of specific workouts or programs. The layout of the gym floor needs to include
// coaches workouts based on those machines"; of the options put to them, Replays shows workouts and
// programs, and the studio both reads the moves' equipment and takes the coach's own pins).
//
// Pure, so tests/coach-work.test.mjs runs it without a browser. Canonical here, in public/newdesign,
// so the website's coach profile (coachProfileWeb.jsx) and the app's (which imports it through
// mobile-app/src/services/coachWork.mjs, a re-export) read one implementation. The profile hands in:
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

// ── A nutritionist's kitchen layout and their recipes ──────────────────────────────────────────
// Owner, 2026-10-30: "lets show a kitchen layout, like we did for trainers". As the studio reads a
// program's moves onto the pieces they use, the kitchen reads a recipe's method onto the spots it
// uses: a recipe that roasts lights the oven, one that sears lights the stove, an overnight one the
// fridge. Read from the recipe's own words (its name, note, method and ingredients), so a coach's
// recipe lands on their plan with nothing more to set, in English (KITCHEN_USES) or in any of the
// app's other twelve languages (KITCHEN_WORDS_INTL).
const KITCHEN_USES = [
  ['oven', /\b(oven|bake[ds]?|baking|roast(s|ed|ing)?|sheet[- ]pans?|broil(s|ed|ing)?|traybake)\b/i],
  // Sheet-pan is the oven's, so it is taken out before the stove looks for a pan.
  ['range', /\b(pans?|skillet|wok|saucepan|pot|sear(s|ed|ing)?|saut[eé](s|ed|ing)?|simmer(s|ed|ing)?|boil(s|ed|ing)?|fry|fries|fried|frying|stir[- ]fr\w*|poach(es|ed|ing)?|scrambl\w*|stovetop|stove)\b/i, (s) => s.replace(/sheet[- ]pans?/gi, ' ')],
  ['blender', /\b(blend(s|ed|er|ing)?|blitz\w*|smoothies?|pur[eé]e[ds]?)\b/i],
  ['board', /\b(chop(s|ped|ping)?|dic(e|ed|es|ing)|slic(e|ed|es|ing)|minc(e|ed|es|ing)|julienne)\b/i],
  ['fridge', /\b(fridge|refrigerat\w*|chill(s|ed|ing)?|overnight|marinat\w*)\b/i],
  ['sink', /\b(rins(e|ed|es|ing)|drain(s|ed|ing)?)\b/i],
  ['scale', /\b(weigh(s|ed|ing)?)\b/i],
];
// What the pantry and the herb shelf hold, read from the ingredients alone.
const PANTRY_WORDS = /\b(rice|oats?|lentils?|beans?|chickpeas?|pasta|noodles|quinoa|couscous|tinned|canned|flour|tortillas?|stock|broth)\b/i;
const HERB_WORDS = /\b(basil|parsley|cilantro|coriander|mint|dill|thyme|rosemary|chives|oregano|sage)\b/i;

// ⚠ THE SAME USES IN THE APP'S OTHER TWELVE LANGUAGES (#2516's open item: a recipe written in
// German or Vietnamese lit nothing), one block per language. Three rules hold every word here:
//   · A word ending in * is a stem and matches any word that starts with it, so an inflected verb
//     still lands ("anbraten", "обжарьте", "doğrayın"); any other word matches whole. Word edges are
//     Unicode letters (JS's \b knows only ASCII ones, so Cyrillic and Vietnamese never matched).
//   · A word that also means something else in a recipe is left out, not guessed: fr "four" is
//     inside "fourchette", es "horno" next to "hornilla" (a burner), it "forn-" also "fornello" (the
//     stove), vi "cân" is "cân bằng" (balance), tr "kes-" is "kesinlikle". A spot that stays dark
//     is better than one lit by the wrong word.
//   · ⚠ A line is read only with its own language's words (Codex on #2518): a stem of one language
//     begins words of another, as id "iris*" begins the English "Irish", it "trit*" "Triticale",
//     and fr "laver" is a seaweed. So a word two languages share is in both blocks.
// Pidgin (pcm) recipes are written with English cooking words, which KITCHEN_USES already reads.
const KITCHEN_WORDS_INTL = {
  de: {
    oven: ['backofen', 'ofen*', 'backen', 'gebacken*', 'backblech*', 'röst*', 'geröstet*', 'überbacken*'],
    range: ['pfanne*', 'topf', 'kochtopf', 'anbrat*', 'brat*', 'köchel*', 'dünst*', 'sautier*', 'herd', 'schmor*', 'wok'],
    blender: ['mixer', 'stabmixer', 'pürier*', 'smoothie*'],
    board: ['hack*', 'gehackt*', 'schneid*', 'geschnitten*', 'würfel*', 'gewürfelt*', 'schneidebrett'],
    fridge: ['kühlschrank', 'kühl*', 'gekühlt*', 'über nacht', 'marinier*'],
    sink: ['abspül*', 'abtropf*', 'abgieß*', 'abgiess*', 'wasch*', 'gewaschen*'],
    scale: ['wieg*', 'abwieg*', 'waage'],
    pantry: ['reis', 'hafer*', 'linsen', 'bohnen', 'kichererbsen', 'nudeln', 'pasta', 'quinoa', 'couscous', 'mehl', 'brühe'],
    herbs: ['basilikum', 'petersilie', 'koriander', 'minze', 'dill', 'thymian', 'rosmarin', 'schnittlauch', 'oregano', 'salbei'],
  },
  es: {
    oven: ['horno', 'hornea*', 'hornee*', 'hornear', 'horneado*', 'horneada*', 'asado*', 'asada*', 'asar', 'gratin*'],
    range: ['sartén', 'olla', 'cacerola', 'salte*', 'sofr*', 'freír', 'fríe', 'frit*', 'herv*', 'hierv*', 'fuego', 'wok'],
    blender: ['licua*', 'batidora', 'tritur*', 'smoothie*'],
    board: ['picar', 'pique', 'picado*', 'picada*', 'cortar', 'corte', 'cortado*', 'cortada*', 'trocea*', 'troce*', 'dados', 'cubos', 'rebana*', 'tabla de cortar'],
    fridge: ['nevera', 'refriger*', 'frigor*', 'enfri*', 'toda la noche', 'marinar', 'marinado*', 'marinada*'],
    sink: ['enjuag*', 'escurr*', 'lavar', 'lave', 'lavado*', 'lavada*'],
    scale: ['pesar', 'pese', 'báscula'],
    pantry: ['arroz', 'avena', 'lentejas', 'frijoles', 'judías', 'alubias', 'garbanzos', 'fideos', 'pasta', 'quinoa', 'cuscús', 'harina', 'caldo'],
    herbs: ['albahaca', 'perejil', 'cilantro', 'menta', 'hierbabuena', 'eneldo', 'tomillo', 'romero', 'cebollino', 'orégano', 'salvia'],
  },
  fr: {
    oven: ['enfourn*', 'rôti*', 'au four', 'gratin*'],
    range: ['poêl*', 'casserole', 'sauteuse', 'revenir', 'saisi*', 'mijot*', 'frire', 'bouill*', 'ébullition', 'feu', 'wok'],
    blender: ['mixez', 'mixer', 'mixé*', 'mixeur', 'blender', 'smoothie*'],
    board: ['hach*', 'émin*', 'coupe', 'coupez', 'couper', 'coupé*', 'découp*', 'dés', 'tranch*', 'cisel*', 'planche à découper'],
    fridge: ['frigo*', 'réfrigér*', 'au frais', 'toute la nuit', 'mariner', 'marinez', 'mariné*'],
    sink: ['rinc*', 'égoutt*', 'laver', 'lavez'],
    scale: ['peser', 'pesez', 'pèse'],
    pantry: ['riz', 'avoine', 'lentilles', 'haricots', 'pois chiches', 'pâtes', 'nouilles', 'quinoa', 'couscous', 'farine', 'bouillon'],
    herbs: ['basilic', 'persil', 'coriandre', 'menthe', 'aneth', 'thym', 'romarin', 'ciboulette', 'origan', 'sauge'],
  },
  it: {
    oven: ['forno', 'inforn*', 'arrost*', 'teglia', 'gratin*'],
    range: ['padell*', 'pentol*', 'tegame', 'rosol*', 'soffri*', 'frigg*', 'fritt*', 'boll*', 'sobboll*', 'fuoco', 'fornell*', 'wok'],
    blender: ['frull*', 'mixer', 'smoothie*'],
    board: ['trit*', 'sminuzz*', 'tagliare', 'tagliate', 'tagliato*', 'tagliata*', 'cubett*', 'dadin*', 'affett*', 'tagliere'],
    fridge: ['frigo*', 'tutta la notte', 'marinare', 'marinato*', 'marinata*'],
    sink: ['sciacqu*', 'scol*', 'lavare', 'lavate'],
    scale: ['pesare', 'pesate', 'bilancia'],
    pantry: ['riso', 'avena', 'lenticchie', 'fagioli', 'ceci', 'pasta', 'quinoa', 'couscous', 'farina', 'brodo'],
    herbs: ['basilico', 'prezzemolo', 'coriandolo', 'menta', 'aneto', 'timo', 'rosmarino', 'erba cipollina', 'origano', 'salvia'],
  },
  pt: {
    oven: ['forno', 'assar', 'assado*', 'assada*', 'asse', 'assadeira*', 'gratin*'],
    range: ['frigideir*', 'panela', 'refog*', 'salte*', 'frit*', 'ferv*', 'fogo', 'wok'],
    blender: ['liquidific*', 'processador', 'tritur*', 'smoothie*'],
    board: ['picar', 'pique', 'picado*', 'picada*', 'cortar', 'corte', 'cortado*', 'cortada*', 'fati*', 'cubos', 'cubinhos', 'tábua'],
    fridge: ['geladeira', 'refriger*', 'durante a noite', 'noite toda', 'marinar', 'marinado*', 'marinada*'],
    sink: ['enxágu*', 'enxagu*', 'escorr*', 'lavar', 'lave', 'lavado*', 'lavada*'],
    scale: ['pesar', 'pese', 'balança'],
    pantry: ['arroz', 'aveia', 'lentilha*', 'feijão', 'feijões', 'grão-de-bico', 'macarrão', 'quinoa', 'cuscuz', 'farinha', 'caldo'],
    herbs: ['manjericão', 'salsinha', 'coentro', 'hortelã', 'endro', 'tomilho', 'alecrim', 'cebolinha', 'orégano', 'sálvia'],
  },
  id: {
    oven: ['oven', 'panggang', 'dipanggang', 'memanggang'],
    range: ['wajan', 'panci', 'wok', 'tumis', 'menumis', 'goreng', 'menggoreng', 'rebus', 'merebus', 'didih*', 'mendidih', 'kompor'],
    blender: ['blender', 'diblender', 'haluskan', 'smoothie*'],
    board: ['potong*', 'dipotong', 'iris*', 'diiris', 'cincang', 'dicincang', 'talenan'],
    fridge: ['kulkas', 'lemari es', 'dinginkan', 'semalam*', 'marinasi'],
    sink: ['bilas', 'dibilas', 'tiriskan', 'cuci', 'dicuci'],
    scale: ['timbang', 'ditimbang', 'timbangan'],
    pantry: ['beras', 'nasi', 'oat', 'kacang', 'mie', 'bihun', 'quinoa', 'pasta', 'tepung', 'kaldu'],
    herbs: ['kemangi', 'peterseli', 'ketumbar', 'daun mint', 'adas', 'daun bawang', 'oregano'],
  },
  ha: {
    oven: ['gasa*'],
    range: ['soya*', 'tafas*', 'tukunya', 'murhu'],
    blender: ['markad*'],
    board: ['yank*', 'yayyank*'],
    fridge: ['firij*', 'firji'],
    sink: ['wank*', 'tsiyay*'],
    scale: ['auna'],
    pantry: ['shinkafa', 'wake', 'alkama', 'fulawa', 'taliya'],
    herbs: ["na'a na'a", 'daddoya'],
  },
  ru: {
    oven: ['духовк*', 'запек*', 'запеч*', 'выпек*', 'противн*'],
    range: ['сковород*', 'кастрюл*', 'обжар*', 'жар*', 'туши*', 'тушен*', 'варит*', 'свари*', 'отвари*', 'кипя*', 'закип*', 'плит*'],
    blender: ['блендер*', 'смузи', 'пюрир*'],
    board: ['нареж*', 'нарез*', 'порез*', 'измельч*', 'шинк*', 'кубик*', 'рубит*', 'доск*'],
    fridge: ['холодильник*', 'охлад*', 'на ночь', 'маринов*', 'маринад*'],
    sink: ['промо*', 'промыв*', 'сполосн*', 'слить', 'слейте', 'дуршлаг*'],
    scale: ['взвес*', 'весы', 'весах'],
    pantry: ['рис', 'овсян*', 'геркулес', 'чечевиц*', 'фасол*', 'нут', 'макарон*', 'лапш*', 'киноа', 'кускус', 'мук*', 'бульон*', 'консерв*'],
    herbs: ['базилик*', 'петрушк*', 'кинз*', 'мят*', 'укроп*', 'тимьян*', 'розмарин*', 'шалфе*', 'орегано'],
  },
  uk: {
    oven: ['духовк*', 'запік*', 'запеч*', 'випік*', 'деко'],
    range: ['сковород*', 'сковорід*', 'каструл*', 'обсмаж*', 'смаж*', 'тушк*', 'вари*', 'звари*', 'відвар*', 'кип\'ят*', 'кипʼят*', 'кип’ят*', 'плит*'],
    blender: ['блендер*', 'смузі'],
    board: ['наріж*', 'наріз*', 'поріж*', 'поріз*', 'подрібн*', 'шатк*', 'кубик*', 'дошк*'],
    fridge: ['холодильник*', 'охолод*', 'на ніч', 'маринув*', 'маринад*'],
    sink: ['промий*', 'промив*', 'злий*', 'злити', 'друшляк*'],
    scale: ['зваж*', 'ваги', 'вагах'],
    pantry: ['рис', 'вівсян*', 'геркулес', 'сочевиц*', 'квасол*', 'нут', 'макарон*', 'локшин*', 'кіноа', 'кускус', 'борошн*', 'бульйон*', 'консерв*'],
    herbs: ['базилік*', 'петрушк*', 'кінз*', "м'ят*", 'мʼят*', 'м’ят*', 'кріп', 'кроп*', 'чебрец*', 'чебрець', 'розмарин*', 'шавлі*', 'орегано'],
  },
  tr: {
    oven: ['fırın*'],
    range: ['tava*', 'tencere*', 'kızart*', 'kavur*', 'haşla*', 'kaynat*', 'sote*', 'ocak*', 'wok'],
    blender: ['blender*', 'rondo*', 'smoothie*'],
    board: ['doğra*', 'dilimle*', 'küp', 'rendele*'],
    fridge: ['buzdolab*', 'soğut*', 'gece boyunca', 'bir gece', 'marine'],
    sink: ['durula*', 'süz*', 'yıka*'],
    scale: ['tartın', 'tartılı*', 'terazi'],
    pantry: ['pirinç', 'yulaf', 'mercimek', 'fasulye', 'nohut', 'makarna', 'şehriye', 'kinoa', 'kuskus', 'et suyu', 'tavuk suyu', 'konserve'],
    herbs: ['fesleğen', 'maydanoz', 'kişniş', 'nane', 'dereotu', 'kekik', 'biberiye', 'frenk soğanı', 'adaçayı'],
  },
  vi: {
    oven: ['lò nướng', 'nướng'],
    range: ['chảo', 'nồi', 'xào', 'chiên', 'rán', 'luộc', 'đun', 'hầm'],
    blender: ['máy xay', 'xay', 'sinh tố'],
    board: ['băm', 'cắt', 'xắt', 'thái lát', 'thái nhỏ', 'thái mỏng', 'thái sợi', 'thái hạt lựu', 'thớt'],
    fridge: ['tủ lạnh', 'ướp', 'qua đêm', 'làm lạnh'],
    sink: ['rửa', 'xả', 'để ráo', 'ráo'],
    pantry: ['gạo', 'cơm', 'yến mạch', 'đậu lăng', 'đậu', 'mì', 'bún', 'phở', 'bột', 'nước dùng', 'đồ hộp'],
    herbs: ['húng quế', 'rau mùi', 'ngò', 'bạc hà', 'thì là', 'hương thảo', 'hẹ', 'kinh giới'],
  },
};
// Which language a line is in, from its little words and the letters only that language writes: a
// point for each such word, and one for each letter class a word shows. Cyrillic counts for Russian
// and Ukrainian alike until a letter tells them apart. Pidgin is read with the English words, so its
// little words are English's signs too (after the |): "Put di rice for pot, make e boil" is not Italian.
const KITCHEN_LANG_SIGNS = {
  en: ['the and with until into then of to your from it is or on at each while when before after over add for make small | dey wey una dem don wetin abeg sabi pikin wan di am na'],
  de: ['der die das und mit den dem des im auf ein eine einen einem einer zu zum zur von vom für bei beim aus nach oder ist sie dann bis etwa über minuten', /[äß]/u, /[öü]/u],
  es: ['el los las y del al con en por para hasta luego unos unas una sin después muy más minutos', /ñ/u],
  fr: ['le les et avec des du dans une pour puis aux au sur est en ou à jusqu pendant environ votre vos chaque sans très', /[œîûëïÿ]/u],
  it: ['il lo gli le della delle dei degli nel nella nei alla allo alle poi fino minuti che per con del al una e di da è sono circa ogni dopo più oppure sul sulla', /[ìò]/u],
  pt: ['o os e com do da dos das em no na nos nas um uma até depois ao aos à minutos por para ou mais sem também', /[ãõ]/u],
  id: ['dan di ke dengan yang hingga sampai lalu kemudian selama menit dalam atau untuk dari ini itu agar setelah sebelum sambil secukupnya'],
  ha: ['sannan kuma cikin har minti zuwa akan tare wannan kafin bayan ka ki da na ta shi ita ko idan', /[ɓɗƙƴ]/u],
  ru: ['и в на с до по из для минут затем или не а что к со под пока после перед потом', /[\u0400-\u04ff]/u, /[ыэъё]/u],
  uk: ['і й та з із зі у в на до для не а по хвилин потім або після поки що', /[\u0400-\u04ff]/u, /[іїєґ]/u],
  tr: ['ve ile bir için kadar sonra dakika iyice olarak veya üzerine içine daha gibi her', /[ışğ]/u, /[öü]/u],
  vi: ['và trong cho với rồi của khi phút một các những là có để sau trước đến vào', /[ăđơư\u1ea0-\u1ef9]/u],
};
const LANG_SIGNS = Object.entries(KITCHEN_LANG_SIGNS).map(([lang, [words, ...letters]]) => [lang, new Set(words.split(' ').filter((w) => w !== '|')), letters]);

const langSigns = (text) => {
  const score = new Map();
  for (const w of String(text || '').normalize('NFC').toLowerCase().match(/[\p{L}\p{M}]+/gu) || []) {
    for (const [lang, words, letters] of LANG_SIGNS) {
      let n = words.has(w) ? 1 : 0;
      for (const re of letters) if (re.test(w)) n++;
      if (n) score.set(lang, (score.get(lang) || 0) + n);
    }
  }
  return score;
};
const mostSigns = (score, none) => {
  const top = Math.max(0, ...score.values());
  return top ? [...score.keys()].filter((l) => score.get(l) === top) : none;
};
/**
 * The languages a line of text is written in: the one with the most signs, or each tied for the
 * most; `none` (English) when it shows no sign of any.
 */
export function bsTextLanguages(text, none = ['en']) {
  return mostSigns(langSigns(text), none);
}

const reEscape = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A word list as one regex: a stem's word starts with it, any other word is whole; edges are letters.
const wordsRe = (list) => new RegExp('(?<![\\p{L}\\p{M}\\p{N}])(?:' + list.map((w) => (w.endsWith('*')
  ? reEscape(w.slice(0, -1).normalize('NFC'))
  : reEscape(w.normalize('NFC')) + '(?![\\p{L}\\p{M}\\p{N}])')).join('|') + ')', 'iu');
const KITCHEN_INTL_RE = Object.fromEntries(Object.entries(KITCHEN_WORDS_INTL).map(([lang, spots]) => [lang,
  Object.fromEntries(Object.entries(spots).filter(([, list]) => list.length).map(([type, list]) => [type, wordsRe(list)]))]));
// Where a use lands when the plan has no piece for it: an oven's on the stove, the board's on the
// island or a counter.
const KITCHEN_FALLBACK = { oven: ['range'], board: ['island', 'counter'], scale: ['island', 'counter'], blender: ['counter', 'island'] };
const RECIPE_SCAN = 40;
const recipeLines = (r) => [r.t, r.note, ...(Array.isArray(r.steps) ? r.steps.slice(0, RECIPE_SCAN) : [])].map((x) => clean(x, 600).normalize('NFC')).filter(Boolean);
const recipeIngs = (r) => (Array.isArray(r.ing) ? r.ing.slice(0, RECIPE_SCAN) : []).map((g) => (isObj(g) ? clean(g.m, 120).normalize('NFC') : '')).filter(Boolean);
const KITCHEN_USE_ORDER = [...KITCHEN_USES.map(([type]) => type), 'pantry', 'herbs'];

/** The kitchen pieces one recipe uses, by type, from its words: e.g. ['oven', 'board', 'pantry']. */
export function bsRecipeKitchenUses(r) {
  if (!isObj(r)) return [];
  const lines = recipeLines(r).map((s) => [s, langSigns(s)]);
  const ings = recipeIngs(r).map((s) => [s, langSigns(s)]);
  // Each line is read in its own language, or in the recipe's when the line shows no sign of one:
  // a catalog recipe's English method with the coach's own note in Turkish reads each in its own.
  const all = new Map();
  for (const [, score] of [...lines, ...ings]) for (const [lang, n] of score) all.set(lang, (all.get(lang) || 0) + n);
  const whole = mostSigns(all, ['en']);
  const byLang = (list) => {
    const by = new Map();
    for (const [s, score] of list) {
      for (const lang of mostSigns(score, whole)) by.set(lang, (by.has(lang) ? by.get(lang) + ' \n ' : '') + s);
    }
    return by;
  };
  const used = new Set();
  for (const [lang, text] of byLang(lines)) {
    if (lang === 'en') {
      for (const [type, re, prep] of KITCHEN_USES) if (re.test(prep ? prep(text) : text)) used.add(type);
    } else {
      for (const [type] of KITCHEN_USES) if (KITCHEN_INTL_RE[lang][type] && KITCHEN_INTL_RE[lang][type].test(text)) used.add(type);
    }
  }
  for (const [lang, text] of byLang(ings)) {
    if (lang === 'en' ? PANTRY_WORDS.test(text) : KITCHEN_INTL_RE[lang].pantry.test(text)) used.add('pantry');
    if (lang === 'en' ? HERB_WORDS.test(text) : KITCHEN_INTL_RE[lang].herbs.test(text)) used.add('herbs');
  }
  return KITCHEN_USE_ORDER.filter((type) => used.has(type));
}

// Surfaces: what stands on one is used there too (the board on the island makes it the prep spot).
const KITCHEN_SURFACES = new Set(['island', 'counter', 'table']);

/**
 * Each piece of a kitchen layout's share of the coach's recipes, by index: { recipes: [{ id, t }],
 * count } for a piece some recipe uses, else null. A use with no piece of its own on the plan goes
 * to KITCHEN_FALLBACK's; a zone, and a surface, also hold the recipes of the pieces inside them.
 */
export function bsKitchenWork(studio, recipes) {
  const items = isObj(studio) && Array.isArray(studio.items) ? studio.items : [];
  const list = (Array.isArray(recipes) ? recipes : []).filter((r) => isObj(r) && r.id);
  const has = new Set(items.filter(isObj).map((p) => p.t));
  const land = (type) => (has.has(type) ? type : (KITCHEN_FALLBACK[type] || []).find((x) => has.has(x)) || null);
  const usesOf = list.map((r) => new Set(bsRecipeKitchenUses(r).map(land).filter(Boolean)));
  const own = items.map((p) => (isObj(p) && p.t !== 'zone' ? list.filter((r, k) => usesOf[k].has(p.t)) : []));
  return items.map((p, i) => {
    if (!isObj(p)) return null;
    const ids = new Set(own[i].map((r) => r.id));
    if (p.t === 'zone' || KITCHEN_SURFACES.has(p.t)) {
      items.forEach((q, j) => {
        if (j === i || !isObj(q) || q.t === 'zone' || (p.t !== 'zone' && KITCHEN_SURFACES.has(q.t)) || !inside(q, p)) return;
        for (const r of own[j]) ids.add(r.id);
      });
    }
    const held = list.filter((r) => ids.has(r.id));
    return held.length ? { recipes: held.map((r) => ({ id: r.id, t: r.t })), count: held.length } : null;
  });
}

// ── A nutritionist's plate notes ──────────────────────────────────────────────────────────────
// Moved here from BSTrainerProfile.jsx (which re-exports both), so the website's coach profile
// groups and splits a shared meal with the same code as the app's.
const plateNum = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));
const plateDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/**
 * Plate cards grouped by the local day they were shared on, newest day first, each day in the order
 * it was eaten: { key, at, meals, protein, proteinAll, kcal }.
 */
export function bsPlateNoteDays(plates) {
  const days = new Map();
  for (const pl of (Array.isArray(plates) ? plates : [])) {
    const at = Date.parse(pl && pl.created_at);
    const d = Number.isFinite(at) ? new Date(at) : null;
    const key = d ? plateDay(d) : 'undated';
    if (!days.has(key)) days.set(key, { key, at: d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() : -Infinity, meals: [] });
    days.get(key).meals.push({ ...pl, at: d ? d.getTime() : null });
  }
  return [...days.values()].sort((a, b) => b.at - a.at).map((day) => {
    const meals = day.meals.slice().sort((a, b) => (a.at || 0) - (b.at || 0));
    // A day's protein and energy, each only when every meal of the day carried it.
    let so = 0, all = true, kcal = 0, kcalAll = true;
    for (const m of meals) {
      const p = plateNum(m.meal && m.meal.p); if (p == null) all = false; else so += p;
      const k = plateNum(m.meal && m.meal.kcal); if (k == null) kcalAll = false; else kcal += k;
    }
    return { ...day, meals, protein: so, proteinAll: all, kcal: kcalAll ? kcal : null };
  });
}
/** Where a meal's energy came from: protein and carbs at 4 kcal a gram, fat at 9. Null unless all three were logged. */
export function energySplit(m) {
  const p = plateNum(m && m.p), c = plateNum(m && m.c), f = plateNum(m && m.f);
  if (p == null || c == null || f == null) return null;
  const e = [p * 4, c * 4, f * 9], tot = e[0] + e[1] + e[2];
  if (!tot) return null;
  // Whole percentages that add up to 100: each share rounded down, then the points left over go to
  // the largest remainders, so none is ever below 0 or above its share by more than one.
  const exact = e.map((x) => (x / tot) * 100);
  const out = exact.map(Math.floor);
  const order = [0, 1, 2].sort((a, b) => (exact[b] - out[b]) - (exact[a] - out[a]));
  for (let i = 0, left = 100 - out[0] - out[1] - out[2]; i < left; i += 1) out[order[i]] += 1;
  return { p: out[0], c: out[1], f: out[2] };
}
