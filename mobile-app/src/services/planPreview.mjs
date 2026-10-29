// Plan preview — the model behind the Listing's "what's inside" sheet.
//
// A buyer looking at a coach's programs and single workouts could see a name, a
// price and a one-line meta, and nothing else. This turns the coach's OWN
// authored outline (coach_plans.detail.blocks) into a structured preview so the
// purchase is informed.
//
// THE HONESTY RULE: this module never invents a session. Every unit it returns
// is parsed from a block the coach actually wrote, through the SAME parsers the
// Assign flow uses (planOutline.mjs — one implementation, so a preview can
// never describe a plan differently from how it is delivered). Where the coach
// stated nothing, the model says null and the sheet renders nothing.
//
// THE PAYWALL RULE: a split is the plan's table of contents — its day lines are
// structure, and the sessions' exercises do not exist in the data, so there is
// nothing deeper to withhold and the whole split shows. An exercise list or a
// menu IS the product, so it shows BS_PREVIEW_FREE_UNITS units and reports the
// remainder as locked. The sheet never renders a locked unit's text.
//
// THE SERVER'S HALF (2026-10-09, the open half of C2): the paywall used to be
// this module alone, while the public sale-plan functions handed every caller a
// meal plan's whole `blocks` and `days`. They now hand out what the sheet shows
// and nothing more (sale_plan_preview_detail, 2026-10-09-sale-plan-preview-menus.sql):
// `preview: true`, `perDay`, `blocksCount`, each authored day as { dow, count,
// blocks }, and the first two meals of the first day that has any. The reduced
// path below reads that shape; bsPreviewReduce is the same rule in JavaScript,
// kept here as the tests' oracle (the model of a reduced plan must equal the
// model of the full one), never used by the app itself.
//
// A PROGRAM'S HALF (2026-10-29): the same functions handed every caller a
// program's whole outline: each row's sets, reps, load, rest, tempo, cue and clip.
// The public preview now keeps names, weeks and days; sets, loads, cues and videos
// unlock on purchase, with one free preview video (the owner, 2026-10-29). See
// bsProgramReduce below and 2026-10-29-program-preview-names.sql.

import { bsAssignDayLine, bsAssignExercise, bsAssignMeal, bsAssignWeekLine, bsWeekUnits, bsWeekSpan, bsPlanWeek, BS_DAY_BLOCK_MAX } from './planOutline.mjs';

// How many units of a session/menu a buyer sees before paying.
export const BS_PREVIEW_FREE_UNITS = 2;

// Bounds — blocks come off a public-read provider row, so a crafted plan could
// carry a huge array or huge strings. We only ever parse/keep this many.
// The one display bound, shared with planOutline. Delivery does not truncate a
// per-day override, so this IS the bound that keeps a crafted public-read row
// from fanning out 7x on the preview — it must not quietly diverge from the
// number the contract states.
const BLOCK_SCAN = BS_DAY_BLOCK_MAX;
const TITLE_MAX = 120;

const clean = (v) => String(v == null ? '' : v).slice(0, 2000).replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, TITLE_MAX);

// A block may be a bare string or the PR-E authored object { text, … }.
function blockText(b) {
  if (b == null) return '';
  if (typeof b === 'string') return clean(b);
  if (typeof b === 'object' && !Array.isArray(b) && b.text != null) return clean(b.text);
  return '';
}

// "6 weeks · 4 days" / "6 week hypertrophy" / "12 wk · 48 on it" → 6 / 12. Only
// ever reads a STATED number — an unstated length is null, never a guess from
// the block count.
//
// `wk`/`wks` are accepted because that is what the live catalogue actually
// writes ("12 wk · 48 on it · 4.9 ★", "4 wks · fast & balanced · $130"), and
// the Assign flow's own duration parser already reads `wk|week`. Matching only
// the long form here made every one of those plans silently drop its Weeks
// register — real stated information lost in this preview alone.
function statedWeeks(...sources) {
  for (const s of sources) {
    // \b before the digits so a longer number can't be misread — "106 weeks"
    // must not parse as "6 weeks". slice bounds the (attacker-controllable) scan.
    const m = String(s || '').slice(0, 200).match(/\b(\d{1,2})\s*[-\s]?\s*(?:wks?|weeks?)\b/i);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= 1 && n <= 52) return n;
    }
  }
  return null;
}

// One meal block → one preview unit. Extracted so the per-day and legacy menu
// paths cannot drift on how a meal is titled or how an absent kcal renders.
//
// bsAssignMeal keeps the whole tail as the title (e.g. "Chicken bowl · 420
// kcal"); the sheet renders u.kcal separately, so strip a trailing kcal from the
// title to avoid showing the number twice. A kcal-only title (a block with no
// dish name) strips to empty — leave it empty rather than falling back to the
// raw text, which would show the kcal twice.
// `~` is consumed with the number: the nutrition builder's own default outline
// writes "Breakfast · ~500 kcal", so stripping only the digits left a dangling
// "Breakfast · ~" on every generated paid meal plan. The separator goes with it
// for the same reason.
function mealUnit(t) {
  const m = bsAssignMeal(t);
  if (!m) return null;
  const title = clean(m.title).replace(/\s*[·,-]?\s*[~≈]?\s*\d{2,4}\s*kcal\s*$/i, '').trim();
  return {
    label: m.slot,
    title,
    // bsAssignMeal reports 0 for "no kcal stated"; an absent number must render
    // as nothing, never as a real-looking 0.
    kcal: m.kcal > 0 ? m.kcal : null,
  };
}

// ── The server-reduced shape ────────────────────────────────────────────────
const DOW_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const DAYS_SCAN = 7;
const validDow = (v) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 6;

// The text a block DELIVERS (planOutline.mjs deliveredTexts, the same coercion):
// `String(((b && b.text != null) ? b.text : b) || '').trim()`.
function deliveredText(b) {
  const raw = (b && b.text != null) ? b.text : b;
  return String(raw || '').trim();
}

// bsPlanWeek's selection of authored days: the first DAYS_SCAN entries, an object
// with a valid dow and an array of blocks, the first entry per dow.
function authoredDays(detail) {
  const byDow = new Map();
  for (const e of (Array.isArray(detail.days) ? detail.days : []).slice(0, DAYS_SCAN)) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
    if (!validDow(e.dow)) continue;
    if (!Array.isArray(e.blocks)) continue;
    if (byDow.has(e.dow)) continue;
    byDow.set(e.dow, e);
  }
  return byDow;
}

// ── A program's server-reduced shape (2026-10-29) ────────────────────────────
// sale_plan_program_preview (2026-10-29-program-preview-names.sql) hands out:
//   preview:   true
//   blocks:    from the builder, which is what delivery reads, each named row as
//              { week, day, dayName?, weekday?, name, equipment?, muscle?, text: name }
//              in delivery order, at most 40, and `weeks`, how many weeks it holds (at
//              most 52). With no builder (or an outline-only one)
//              the text outline instead: a weekday line (its head a weekday and nothing
//              more) or week line whole, any other line cut to its exercise name.
//   media:     one video (the program's own, else the first clip), then up to 7 images
//   note, buildType: as they are, when they are text
// and nothing else. The rules below are the SQL's, written to agree with it exactly on
// any input (its own trim, separators and scans), not the parsers' looser ones.
const PROGRAM_SCAN = { weeks: 52, days: 14, blocks: 12, rows: 40, visits: 400, media: 40, images: 7 };
const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const spaceTrim = (s) => s.replace(/^ +| +$/g, '');
const programClean = (s, max) => spaceTrim(String(s).slice(0, 2000).replace(/[\x01-\x1f\x7f]/g, '')).slice(0, max);
const WEEKDAY_HEAD = /^(mon|monday|tue|tues|tuesday|wed|weds|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)\.?$/;
const programUrl = (u) => typeof u === 'string' && u.length <= 2048 && /^https?:\/\//i.test(u);

// A line of a text outline as the preview may show it: a weekday or week line whole,
// anything else cut to the exercise name before its separator (or before a " · " with a
// number after it, as bsAssignExercise reads a line with no separator). A weekday line's
// head is a weekday and nothing more: "Monster walk — 3 × 10" is an exercise and comes out
// "Monster walk", which bsAssignDayLine still reads as the Monday it always read, so the
// sheet classes the plan as it did; only the scheme is gone.
export function bsProgramLine(t) {
  if (!t) return '';
  const m = /^([^—–:]*)[—–:][\s\S]/.exec(t);
  const head = m ? m[1] : null;
  if (WEEKDAY_HEAD.test(spaceTrim(head == null ? t : head).toLowerCase())) return t;
  const w = /^ *week *([0-9]{1,2})(?![0-9A-Za-z_])/i.exec(t);
  if (w && Number(w[1]) >= 1 && Number(w[1]) <= 52) return t;
  if (head != null) return spaceTrim(head);
  const dot = t.indexOf('·');
  return dot >= 0 && /[0-9]/.test(t.slice(dot + 1)) ? spaceTrim(t.slice(0, dot)) : t;
}

function programOutline(detail) {
  const b = detail.builder;
  const out = [];
  if (isPlainObject(b) && Array.isArray(b.weeks) && b.outlineOnly !== true) {
    let visits = 0;
    rows: for (const [wi, w] of b.weeks.slice(0, PROGRAM_SCAN.weeks).entries()) {
      if (!isPlainObject(w) || !Array.isArray(w.days)) continue;
      for (const [di, d] of w.days.slice(0, PROGRAM_SCAN.days).entries()) {
        if (!isPlainObject(d) || !Array.isArray(d.blocks)) continue;
        const dayName = typeof d.name === 'string' ? programClean(d.name, 80) : '';
        const weekday = Number.isInteger(d.weekday) && d.weekday >= 0 && d.weekday <= 6 ? d.weekday : null;
        for (const bl of d.blocks.slice(0, PROGRAM_SCAN.blocks)) {
          if (!isPlainObject(bl) || !Array.isArray(bl.rows)) continue;
          for (const r of bl.rows.slice(0, PROGRAM_SCAN.rows)) {
            visits += 1;
            if (visits > PROGRAM_SCAN.visits) break rows;
            if (!isPlainObject(r) || typeof r.name !== 'string') continue;
            const name = programClean(r.name, TITLE_MAX);
            if (!name) continue;
            const equipment = typeof r.equipment === 'string' ? programClean(r.equipment, 60) : '';
            const muscle = typeof r.muscle === 'string' ? programClean(r.muscle, 60) : '';
            out.push({ week: wi, day: di, ...(dayName ? { dayName } : {}), ...(weekday != null ? { weekday } : {}), name, ...(equipment ? { equipment } : {}), ...(muscle ? { muscle } : {}), text: name });
            if (out.length >= BLOCK_SCAN) break rows;
          }
        }
      }
    }
    return out;
  }
  for (const x of (Array.isArray(detail.blocks) ? detail.blocks : []).slice(0, BLOCK_SCAN)) {
    const t = programClean(typeof x === 'string' ? x : (isPlainObject(x) && typeof x.text === 'string') ? x.text : '', TITLE_MAX);
    const line = bsProgramLine(t);
    if (line) out.push(line);
  }
  return out;
}

function programMedia(detail) {
  const media = (Array.isArray(detail.media) ? detail.media : []).slice(0, PROGRAM_SCAN.media);
  const b = detail.builder;
  const own = isPlainObject(b) && typeof b.video === 'string' ? spaceTrim(b.video) : '';
  const clip = media.find((m) => isPlainObject(m) && m.type === 'video' && programUrl(m.url));
  const video = programUrl(own) ? own : clip ? clip.url : null;
  const images = media.filter((m) => isPlainObject(m) && m.type !== 'video' && programUrl(m.url)).slice(0, PROGRAM_SCAN.images);
  return [...(video ? [{ type: 'video', url: video }] : []), ...images.map((m) => ({ type: 'image', url: m.url }))];
}

/** A program's detail as the public sale-plan functions return it (see above). */
export function bsProgramReduce(detail) {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return detail;
  const b = detail.builder;
  const fromBuilder = isPlainObject(b) && Array.isArray(b.weeks) && b.outlineOnly !== true;
  return {
    preview: true,
    blocks: programOutline(detail),
    media: programMedia(detail),
    ...(fromBuilder ? { weeks: Math.min(b.weeks.length, PROGRAM_SCAN.weeks) } : {}),
    ...(typeof detail.note === 'string' ? { note: detail.note } : {}),
    ...(typeof detail.buildType === 'string' ? { buildType: detail.buildType } : {}),
  };
}

/**
 * What the public sale-plan functions return for a plan's detail: the server's
 * rule, in JavaScript, for the tests. A meal plan's menus become counts plus the
 * first two meals of the first day that has any, and `builder` goes; a program
 * keeps its names, weeks and days (bsProgramReduce). Deep-equal to the SQL
 * function's output on the same input (checked on a replica; see the migrations'
 * guards).
 */
export function bsPreviewReduce(kind, detail) {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return detail;
  if (kind !== 'meal_plan') return bsProgramReduce(detail);
  const out = { ...detail };
  delete out.builder;
  const fallback = Array.isArray(detail.blocks) ? detail.blocks : [];
  const authored = authoredDays(detail);
  const resolved = [];
  for (let dow = 0; dow < 7; dow += 1) {
    const list = (authored.has(dow) ? authored.get(dow).blocks : fallback).slice(0, BLOCK_SCAN);
    // Meals by the preview's own rule (blockText); the perDay key by delivery's (bsPlanWeek).
    const meals = list.filter((b) => blockText(b));
    resolved.push({ dow, authored: authored.has(dow), count: meals.length, key: list.map(deliveredText).filter(Boolean).join('\u001f'), first2: meals.slice(0, BS_PREVIEW_FREE_UNITS) });
  }
  const sample = resolved.find((d) => d.count > 0) || null;
  const perDay = resolved.slice(1).some((d) => d.key !== resolved[0].key);
  out.preview = true;
  out.perDay = perDay;
  out.blocksCount = fallback.slice(0, BLOCK_SCAN).filter((b) => blockText(b)).length;
  out.blocks = sample && !sample.authored ? sample.first2 : [];
  if (Array.isArray(detail.days)) {
    out.days = resolved.filter((d) => d.authored).map((d) => ({ dow: d.dow, count: d.count, blocks: sample && sample.dow === d.dow ? d.first2 : [] }));
  }
  return out;
}

// The model of a reduced meal plan. Counts come from the server (an authored
// day's `count`, an inherited day's `blocksCount`), the free rows from the two
// meals the server kept, and the locked total from what was actually shown, as
// on the full path. `units` keeps the plan's whole length (the sheet reads
// `units.length` as the Meals register) with a placeholder per locked meal.
function reducedMenuPreview(detail, base) {
  const authored = authoredDays(detail);
  const countOf = (v) => Math.min(BLOCK_SCAN, Math.max(0, Math.floor(Number(v) || 0)));
  const defaultCount = countOf(detail.blocksCount);
  const defaultKept = Array.isArray(detail.blocks) ? detail.blocks.slice(0, BS_PREVIEW_FREE_UNITS) : [];
  const days = DOW_LABELS.map((label, dow) => (authored.has(dow)
    ? { label, count: countOf(authored.get(dow).count), kept: authored.get(dow).blocks.slice(0, BS_PREVIEW_FREE_UNITS) }
    : { label, count: defaultCount, kept: defaultKept }));
  // A per-day plan's Meals register is the whole week; a uniform week's is one day's menu
  // (the full path previews a uniform week from the resolved Monday).
  const perDay = detail.perDay === true;
  const total = perDay ? days.reduce((n, d) => n + d.count, 0) : days[0].count;
  if (!total) return { kind: null, weeks: base.weeks, sessionsPerWeek: null, units: [], free: [], locked: 0, note: base.note, media: base.media };
  const sample = perDay ? days.find((d) => d.count > 0) : days[0];
  const free = sample.kept.map(blockText).filter(Boolean).map(mealUnit).filter(Boolean).slice(0, BS_PREVIEW_FREE_UNITS);
  const units = free.concat(Array.from({ length: Math.max(0, total - free.length) }, () => ({ label: '', title: '', kcal: null, locked: true })));
  const model = { kind: 'menu' };
  if (perDay) {
    model.perDay = true;
    model.days = days.map((d) => ({ label: d.label, count: d.count }));
  }
  return { ...model, weeks: base.weeks, sessionsPerWeek: null, units, free, locked: Math.max(0, total - free.length), note: base.note, media: base.media };
}

export function bsPlanPreview(plan, opts) {
  const isNutri = !!(opts && opts.isNutri);
  const detail = (plan && plan.detail && typeof plan.detail === 'object') ? plan.detail : {};
  const rawBlocks = Array.isArray(detail.blocks) ? detail.blocks.slice(0, BLOCK_SCAN) : [];
  const texts = rawBlocks.map(blockText).filter(Boolean);

  const media = (Array.isArray(detail.media) ? detail.media : [])
    .slice(0, BLOCK_SCAN)   // bound the scan first — the array is attacker-controllable
    .filter((m) => m && typeof m === 'object' && typeof m.url === 'string' && m.url)
    .slice(0, 8)
    .map((m) => ({ ...m, url: m.url.slice(0, 2048) }));   // bound the url length too
  const note = clean(detail.note);
  const weeks = statedWeeks(plan && plan.meta, plan && plan.name);

  // A meal plan from the public sale-plan functions carries counts and a sample,
  // not the menus (see the header). Its model is built from those.
  if (isNutri && detail.preview === true) return reducedMenuPreview(detail, { weeks, note, media });
  // A program from the same functions carries names, weeks and days, the sets and
  // loads cut (bsProgramReduce). The sheet says what buying unlocks.
  const namesOnly = !isNutri && detail.preview === true;
  const cut = namesOnly ? { namesOnly: true } : {};
  // Its rows from a builder carry their week and day. More than one day is a program:
  // the first week's days are the outline, each with its moves' names, free (names and
  // structure are public). One day is a single session and reads as one below.
  if (namesOnly) {
    const days = new Map();
    for (const b of rawBlocks) {
      if (!b || typeof b !== 'object' || Array.isArray(b) || !Number.isInteger(b.week) || !Number.isInteger(b.day)) continue;
      const move = blockText(b);
      if (!move) continue;
      const key = `${b.week}:${b.day}`;
      if (!days.has(key)) days.set(key, { week: b.week, day: b.day, name: clean(b.dayName), weekday: validDow(b.weekday) ? b.weekday : null, moves: [] });
      days.get(key).moves.push(move);
    }
    if (days.size > 1) {
      const all = [...days.values()];
      const first = Math.min(...all.map((d) => d.week));
      const units = all.filter((d) => d.week === first).map((d) => ({ label: d.weekday != null ? DOW_LABELS[d.weekday] : `DAY ${d.day + 1}`, title: d.name, moves: d.moves }));
      const held = Number.isInteger(detail.weeks) && detail.weeks > 0 && detail.weeks <= 52 ? detail.weeks : null;
      return { kind: 'program', ...cut, weeks: weeks || held || Math.max(...all.map((d) => d.week)) + 1, sessionsPerWeek: units.length, units, free: units, locked: 0, note, media };
    }
  }

  // C1a — the per-day week has to be resolved BEFORE the empty check, or a
  // per-day plan whose DEFAULT menu is empty (every day authored individually,
  // nothing left in `detail.blocks`) returns the empty model and previews as
  // nothing. That is the same "paid preview renders nothing" failure the per-day
  // contract exists to prevent, in a narrower form — an empty `blocks` is no
  // longer the same thing as an empty plan.
  const week = bsPlanWeek(detail);
  // ⚠ The PREVIEW re-caps every resolved day at BLOCK_SCAN. bsPlanWeek leaves
  // the legacy fallback uncapped because DELIVERY must not drop sold meals —
  // but this module is a PUBLIC workload (any visitor can open any listing's
  // preview), and one authored day makes the six inherited days each carry the
  // uncapped fallback, so flattening them unbounded turns a crafted
  // detail.blocks into a 6× amplified scan. Delivery keeps every meal; the
  // preview scans at most 40 per day, exactly the display bound the legacy
  // path has always applied via rawBlocks.
  const dayScan = (d) => (Array.isArray(d.blocks) ? d.blocks.slice(0, BLOCK_SCAN) : []);
  // Content anywhere in the RESOLVED week keeps the preview alive — perDay is
  // deliberately not part of this test. A week whose seven days are authored
  // identically (perDay false) over an empty default still DELIVERS meals, so
  // it must not preview as an empty plan.
  const weekHasContent = week.days.some((d) => dayScan(d).some((b) => blockText(b)));

  const empty = { kind: null, weeks, sessionsPerWeek: null, units: [], free: [], locked: 0, note, media };
  if (!texts.length && !(isNutri && weekHasContent)) return empty;

  // A weekday split — the shape the Assign flow also keys off (≥3 day lines).
  //
  // Gated on !isNutri to match `iosAppBroadsheetPros.jsx`'s own test verbatim
  // (`const isSplit = !isNutri && dayLines.filter(Boolean).length >= 3`). A
  // nutrition plan whose meals happen to carry weekday prefixes ("Mon —
  // Breakfast…" through "Wed — Dinner…") clears the ≥3 bar, so without this
  // gate it was classified as a workout split: rows labelled as DAYS, every
  // meal exposed with `locked: 0`, and the meal-specific kcal treatment skipped
  // — a preview that disagrees with what the buyer is actually assigned.
  const dayLines = texts.map(bsAssignDayLine);
  if (!isNutri && dayLines.filter(Boolean).length >= 3) {
    const units = [];
    for (let i = 0; i < texts.length; i += 1) {
      const dl = dayLines[i];
      if (!dl) continue;
      units.push({
        label: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'][dl.dow] || '',
        title: clean(dl.title),
        rest: !!dl.rest,
      });
    }
    return {
      kind: 'split',
      ...cut,
      weeks,
      sessionsPerWeek: units.filter((u) => !u.rest).length,
      units,
      free: units,   // structure, not withheld content
      locked: 0,
      note,
      media,
    };
  }

  // A WEEK-BLOCK outline — "Week 1 — Accumulation" … "Week 6 — Retest". Both
  // builders emit exactly this for their multi-week products (the trainer's
  // paid `plan` and the nutritionist's `program`), and none of those lines is a
  // weekday, so without this they fell through to the exercise parser: a
  // six-week program was labelled "Single session" and its WEEKS were listed as
  // moves. Checked before the exercise fallback for that reason.
  // ONE grammar, shared with the delivery path (bsAssignWeekLine) — a local copy
  // here could drift and make the preview promise a shape Assign doesn't build.
  const weekLines = texts.map(bsAssignWeekLine);
  if (weekLines.filter(Boolean).length >= 2) {
    // Same dedupe + ordering the delivery applies (bsWeekUnits), so a duplicated
    // or out-of-order week line can't make this list a different set — including
    // a different `locked` count on paid content — than Assign actually builds.
    const wu = bsWeekUnits(weekLines);
    const maxWeek = bsWeekSpan(wu);
    const units = wu.map((w) => ({ label: `WEEK ${w.week}`, title: clean(w.title) }));
    return {
      kind: 'block',
      ...cut,
      // The outline STATES its own week numbers, so the highest one is stated
      // information — not a guess from the block count (which is what the
      // no-fabrication rule forbids, and which would be wrong here anyway:
      // the nutrition program outline carries a trailing non-week block).
      weeks: weeks || (maxWeek > 0 ? maxWeek : null),
      sessionsPerWeek: null,
      units,
      free: units.slice(0, BS_PREVIEW_FREE_UNITS),
      locked: Math.max(0, units.length - BS_PREVIEW_FREE_UNITS),
      note,
      media,
    };
  }

  if (isNutri) {
    // C1a — a per-day menu previews as BOTH structure and content (§5.4 of the
    // per-day menu contract). The seven day labels are the table of contents AND
    // the differentiator the buyer is paying for, so they are FREE — withholding
    // them would hide the product's value from the person deciding whether to
    // buy. The meals stay on the existing paid allowance.
    //
    // `week` is resolved above (before the empty check) through the SAME
    // bsPlanWeek the Assign flow delivers from, so the week shown here is the
    // week that gets installed.
    if (week.perDay) {
      const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
      const perDayMeals = week.days.map((d) => dayScan(d)
        .map(blockText).filter(Boolean).map(mealUnit).filter(Boolean));
      // `units` stays the WHOLE plan, as it is on every other kind — the sheet
      // renders `units.length` as the product's Meals count, so sampling it
      // would tell a buyer a three-meal plan has two.
      const units = perDayMeals.flat();
      // The FREE rows come from the first day that has meals, so what a buyer
      // reads is a real day rather than an interleaving of seven.
      const sample = perDayMeals.find((list) => list.length) || [];
      const free = sample.slice(0, BS_PREVIEW_FREE_UNITS);
      return {
        kind: units.length ? 'menu' : null,
        perDay: true,
        // Structure: free. Counts only — a locked meal's text never renders.
        days: week.days.map((d, i) => ({ label: DAY_LABELS[i], count: perDayMeals[i].length })),
        weeks,
        sessionsPerWeek: null,
        units,
        free,
        // Derived from what was ACTUALLY shown, never from the constant: when
        // the sampled day holds fewer meals than the allowance (a light
        // Monday), `free.length < BS_PREVIEW_FREE_UNITS`, and subtracting the
        // constant would leave meals counted in neither the free rows nor the
        // locked total — paid content invisible on both sides of the paywall.
        locked: Math.max(0, units.length - free.length),
        note,
        media,
      };
    }
    // A UNIFORM week previews from the RESOLVED day, not from detail.blocks.
    // The two only differ in one case — all seven days authored identically
    // (perDay false) over a different default — and there the resolved day is
    // what Assign delivers, while detail.blocks is a menu nobody will ever be
    // served. For a legacy plan (no `days` key) days[0].blocks IS detail.blocks,
    // so this maps to exactly the old `texts` and the model is byte-identical.
    const dayTexts = (week.days[0].blocks || []).slice(0, BLOCK_SCAN).map(blockText).filter(Boolean);
    const units = dayTexts.map(mealUnit).filter(Boolean);
    return {
      kind: units.length ? 'menu' : null,
      weeks,
      sessionsPerWeek: null,
      units,
      free: units.slice(0, BS_PREVIEW_FREE_UNITS),
      locked: Math.max(0, units.length - BS_PREVIEW_FREE_UNITS),
      note,
      media,
    };
  }

  // A reduced program's exercise line is the name alone: that line IS the title,
  // where bsAssignExercise would read "Squat · 2" as Squat with a load of 2. Its
  // weekday and week lines come whole and read as they always have.
  const units = texts.map((t) => {
    if (namesOnly && !bsAssignDayLine(t) && !bsAssignWeekLine(t)) return { label: '', title: t, scheme: '', load: '' };
    const e = bsAssignExercise(t);
    if (!e || !e.name) return null;
    const scheme = (e.sets && e.reps) ? `${e.sets}×${e.reps}` : '';
    return { label: '', title: clean(e.name), scheme, load: clean(e.load) };
  }).filter(Boolean);

  return {
    kind: units.length ? 'session' : null,
    ...cut,
    weeks,
    sessionsPerWeek: null,
    units,
    free: units.slice(0, BS_PREVIEW_FREE_UNITS),
    locked: Math.max(0, units.length - BS_PREVIEW_FREE_UNITS),
    note,
    media,
  };
}
