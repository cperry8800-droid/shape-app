// Profile-customization guard — the ONE per-key normalizer for the member/coach
// self-authored profile keys (spec 2026-07-23, the profile wave). ONE
// implementation for every surface (the listingMedia / mealPrep precedent): the
// website loads it as a native ES module (window.ShapeProfileLib), mobile
// imports it via mobile-app/src/services/profileCustom.mjs (re-export), Node
// tests import through that same module. It reuses the box wave's canonical URL
// guard (bsOwnMediaUrl) so both surfaces' upload AND render paths call ONE gate.
//
// The doc lives in user_goals('profile_custom') and get_public_profile returns
// it WHOLE to visitors, so these keys inherit the doc's existing visibility. The
// normalizer is enforced at three points — editor, the trusted save wrapper
// (allowlisted: only this wave's keys are touched; every other key passes
// byte-identical), and render — so no stale/direct-API doc can bypass the caps.
// Junk at any key → that feature renders nothing (never throws, never a
// placeholder). Media keys are bound to the profile owner's OWN bucket folder.
import { bsOwnMediaUrl, bsOwnVideoUrl } from './listingMedia.mjs';

export const BS_WALL_MAX = 6;         // M1
export const BS_SHELF_MAX = 4;        // M3
export const BS_LINE_MAX = 80;        // M4 / P2
export const BS_CAPTION_MAX = 80;
export const BS_SHELF_TITLE_MAX = 60;
export const BS_SHELF_WHEN_MAX = 20;
export const BS_START_TITLE_MAX = 60; // M2
export const BS_FILM_CAPTION_MAX = 80; // P1 / M5
export const BS_BIZ_NAME_MAX = 60;     // P4
export const BS_BIZ_WHERE_MAX = 80;
export const BS_BIZ_HOURS_MAX = 40;
export const BS_BIZ_HANDLE_MAX = 40;
export const BS_PINNED_REVIEWS_MAX = 3; // P5

// coach_reviews.id is a v4 uuid (gen_random_uuid). A pinned-review id must match
// this shape or it's dropped before it can ever be looked up (render resolves it
// against the owner's own reviews by id AND owner_id).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// How many raw wall/shelf entries we ever inspect. The doc is public-read (whole
// via get_public_profile) + owner-writable, so a crafted doc could carry a huge
// array; we only keep 6/4, and the editor caps a real save, so a bounded prefix
// is all we ever walk on a viewer's device (DoS guard — the listingMedia scan-cap
// precedent).
const BS_WALL_SCAN = BS_WALL_MAX * 4;
const BS_SHELF_SCAN = BS_SHELF_MAX * 4;
const BS_PINNED_REVIEWS_SCAN = BS_PINNED_REVIEWS_MAX * 4;

const CONTROL_CHARS = new RegExp("[\u0000-\u001F\u007F]", "g");

// Plain single-line text: coerce to string, strip control chars, trim, clamp.
// Non-strings → ''. (Callers treat '' as absent.)
export function bsCleanText(v, max) {
  if (typeof v !== 'string') return '';
  const out = v.replace(CONTROL_CHARS, '').trim();
  return (max && out.length > max) ? out.slice(0, max) : out;
}

// M4 / P2 — the motto line. Returns cleaned text (may be '').
export function bsProfileLine(v) {
  return bsCleanText(v, BS_LINE_MAX);
}

// M1 — the wall: captioned community-photos in the owner's own folder, ≤6.
// Field-by-field rebuild (extra keys never ride through); items with no valid
// own-bucket image url drop.
export function bsProfileWall(v, ownerUid) {
  if (!Array.isArray(v) || !ownerUid) return [];
  const out = [];
  const items = v.length > BS_WALL_SCAN ? v.slice(0, BS_WALL_SCAN) : v;
  for (const item of items) {
    if (out.length >= BS_WALL_MAX) break;
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const url = bsOwnMediaUrl(item.url, 'community-photos', ownerUid);
    if (!url) continue;
    out.push({ url, caption: bsCleanText(item.caption, BS_CAPTION_MAX) });
  }
  return out;
}

// M3 — the shelf: ≤4 member-written proud rows { title, when }. Field-by-field;
// a row with no title drops (a bare date is not a row).
export function bsProfileShelf(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  const items = v.length > BS_SHELF_SCAN ? v.slice(0, BS_SHELF_SCAN) : v;
  for (const item of items) {
    if (out.length >= BS_SHELF_MAX) break;
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const title = bsCleanText(item.title, BS_SHELF_TITLE_MAX);
    if (!title) continue;
    out.push({ title, when: bsCleanText(item.when, BS_SHELF_WHEN_MAX) });
  }
  return out;
}

// M2 — validate a start-line date: strict YYYY-MM-DD AND a REAL calendar date
// (round-trip: the constructed noon-anchored local date's own y/m/d must equal
// the parsed values). Rejects 2026-02-31, 2026-00-10, non-leap -02-29 — which
// JS Date would silently normalize into a shifted real date. Returns {y,m,d} or null.
export function bsValidStartDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const y = Number(v.slice(0, 4)), m = Number(v.slice(5, 7)), d = Number(v.slice(8, 10));
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return { y, m, d };
}

// M2 — days-out state as a LOCAL-CALENDAR-DAY difference (noon-anchored, so no
// UTC/DST off-by-one). `now` is the viewer's local Date. Returns { days } with
// days>=0 (0 = TODAY), or null when the date is invalid OR already past.
export function bsStartLineState(dateStr, now) {
  const v = bsValidStartDate(dateStr);
  if (!v || !(now instanceof Date) || isNaN(now.getTime())) return null;
  const todayNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0).getTime();
  const targetNoon = new Date(v.y, v.m - 1, v.d, 12, 0, 0, 0).getTime();
  const days = Math.round((targetNoon - todayNoon) / 86400000);
  return days < 0 ? null : { days };
}

// M2 — normalize the stored startLine { title, date }. Requires a valid date
// (else the whole line is absent → null). Title cleaned (may be '').
export function bsProfileStartLine(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  if (!bsValidStartDate(v.date)) return null;
  return { title: bsCleanText(v.title, BS_START_TITLE_MAX), date: v.date };
}

// P1 / M5 — the film: one pinned video { url, caption } bound to the owner's OWN
// folder in `bucket` (coach-media for a coach's intro film, member-films for a
// member's film). A junk / wrong-bucket / non-video url → null, so the card
// renders nothing. The video allowlist is disjoint from the image one, so a photo
// url can never sneak in as a film.
export function bsProfileFilm(v, ownerUid, bucket) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const url = bsOwnVideoUrl(v.url, bucket, ownerUid);
  if (!url) return null;
  return { url, caption: bsCleanText(v.caption, BS_FILM_CAPTION_MAX) };
}

// P4 — the business card: a grounded contact station. `name` is the anchor — no
// name, no card. where/hours/handle are optional cleaned text (the render skips
// an empty row). Plain text throughout; the handle is text in v1, never a link.
export function bsProfileBizCard(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const name = bsCleanText(v.name, BS_BIZ_NAME_MAX);
  if (!name) return null;
  return {
    name,
    where: bsCleanText(v.where, BS_BIZ_WHERE_MAX),
    hours: bsCleanText(v.hours, BS_BIZ_HOURS_MAX),
    handle: bsCleanText(v.handle, BS_BIZ_HANDLE_MAX),
  };
}

// P5 — the wins wall's stored form: up to 3 coach_reviews IDs (uuid strings),
// de-duped, order preserved. This ONLY cleans the id list; the RENDER resolves
// each id against the profile owner's OWN reviews (by id AND owner_id), so a
// hand-written id belonging to another coach's review never resolves.
export function bsProfilePinnedReviews(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  const seen = new Set();
  // Bound the source scan (the wall/shelf DoS-guard precedent): the doc is public-
  // read + owner-writable, so a crafted array of junk ids with few/no valid uuids
  // would otherwise walk the whole thing on every visitor's render.
  const items = v.length > BS_PINNED_REVIEWS_SCAN ? v.slice(0, BS_PINNED_REVIEWS_SCAN) : v;
  for (const id of items) {
    if (out.length >= BS_PINNED_REVIEWS_MAX) break;
    if (typeof id !== 'string') continue;
    const s = id.trim().toLowerCase();
    if (!UUID_RE.test(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

// ── The coach profile redesign (owner, 2026-10-27) ────────────────────────────
// `look`: the coach's own colours, chosen from Shape's papers and accents (the app's
// makePalette keys, so the profile paints with the same values the app does), and what stays
// in view in their wall photo (`cover.image`). `studio`: their space, drawn as pieces on a
// fixed 344 × 528 plan (the profile's frame), some of them numbered stations with the
// coach's own words. Both are public through get_public_profile like the rest of the doc, so
// every value is an enum, a bounded integer or cleaned text, and every array scan is capped.
export const BS_LOOK_PAPERS = ['dark', 'light', 'white', 'bone', 'manila', 'sage', 'rose', 'mist', 'steel', 'teal', 'forest', 'blueprint', 'midnight', 'slate', 'plum', 'oxblood', 'cocoa', 'carbon'];
export const BS_LOOK_ACCENTS = ['teal', 'blue', 'amber', 'rust', 'green', 'violet', 'rose', 'white', 'black'];
export const BS_LOOK_FOCUS = ['top', 'center', 'bottom'];

export function bsProfileLook(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out = {};
  if (BS_LOOK_PAPERS.includes(v.paper)) out.paper = v.paper;
  if (BS_LOOK_ACCENTS.includes(v.accent)) out.accent = v.accent;
  if (BS_LOOK_FOCUS.includes(v.focus)) out.focus = v.focus;
  return Object.keys(out).length ? out : null;
}

// The wall photo (`cover`, { image }) loads on the device of everyone who opens the profile, so
// it is held to the owner's own media like the M1 wall and the film: an upload in community-photos
// or one of their listing photos in coach-media, in their own folder, with an image extension.
// Anything else, an outside URL included, is no cover (Codex P1 on #2484).
export function bsProfileCover(v, ownerUid) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const image = bsOwnMediaUrl(v.image, 'community-photos', ownerUid) || bsOwnMediaUrl(v.image, 'coach-media', ownerUid);
  return image ? { image } : null;
}

// The pieces a coach can place (mobile-app/src/services/studioKit.mjs draws each one).
export const BS_STUDIO_TYPES = [
  'dumbbells', 'bells', 'plates', 'barbells', 'bench', 'adjbench', 'rack', 'platform', 'landmine',
  'smith', 'cable', 'latpull', 'chest', 'pecdeck', 'legpress', 'hack', 'legext', 'legcurl', 'hipthrust', 'preacher', 'dip', 'ghd',
  'treadmill', 'bike', 'airbike', 'rower', 'ski', 'elliptical', 'stair',
  'rig', 'turf', 'sled', 'boxes', 'ropes', 'wallballs', 'straps', 'bag', 'ring',
  'mats', 'reformer', 'barre', 'mirror', 'speaker', 'desk', 'frames', 'tree', 'zone',
  'counter', 'island', 'range', 'fridge', 'sink', 'pantry', 'table', 'scale', 'blender', 'herbs', 'board',
  'sofa', 'armchair', 'screen', 'shelf',
];
// The kinds of space (each draws its own room outline and doors).
export const BS_STUDIO_KINDS = ['private', 'garage', 'gym', 'pilates', 'boxing', 'outdoor', 'kitchen', 'home', 'clinic', 'online', 'blank'];
export const BS_STUDIO_W = 344;
export const BS_STUDIO_H = 528;
export const BS_STUDIO_ITEMS_MAX = 80;
export const BS_STUDIO_STATIONS_MAX = 12;
export const BS_STUDIO_WHERE_MAX = 80;
export const BS_STUDIO_LABEL_MAX = 24;
export const BS_STATION_TITLE_MAX = 60;
export const BS_STATION_NOTE_MAX = 280;
const BS_STUDIO_SCAN = BS_STUDIO_ITEMS_MAX * 4;

const bsInt = (v, lo, hi) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null;
};

// One piece: { t, x, y, w, h, label?, tag?, spot?: [dx, dy], st?: { title, note } }. A piece is
// kept inside the plan (its size first, then its corner). A station keeps the coach's words.
export function bsStudioItem(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  if (!BS_STUDIO_TYPES.includes(v.t)) return null;
  const w = bsInt(v.w, 4, BS_STUDIO_W), h = bsInt(v.h, 4, BS_STUDIO_H);
  if (w == null || h == null) return null;
  const x = bsInt(v.x, 0, BS_STUDIO_W - w), y = bsInt(v.y, 0, BS_STUDIO_H - h);
  if (x == null || y == null) return null;
  const out = { t: v.t, x, y, w, h };
  const label = bsCleanText(v.label, BS_STUDIO_LABEL_MAX);
  if (label) out.label = label;
  const tag = bsCleanText(v.tag, BS_STUDIO_LABEL_MAX);
  if (tag) out.tag = tag;
  if (Array.isArray(v.spot) && v.spot.length === 2) {
    const dx = bsInt(v.spot[0], 0, w), dy = bsInt(v.spot[1], 0, h);
    if (dx != null && dy != null) out.spot = [dx, dy];
  }
  if (v.st && typeof v.st === 'object' && !Array.isArray(v.st)) {
    out.st = { title: bsCleanText(v.st.title, BS_STATION_TITLE_MAX), note: bsCleanText(v.st.note, BS_STATION_NOTE_MAX) };
  }
  return out;
}

// The whole space. Null when it holds nothing to draw (no pieces), so an empty doc key drops.
export function bsProfileStudio(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const raw = Array.isArray(v.items) ? (v.items.length > BS_STUDIO_SCAN ? v.items.slice(0, BS_STUDIO_SCAN) : v.items) : [];
  const items = [];
  let stations = 0;
  for (const r of raw) {
    if (items.length >= BS_STUDIO_ITEMS_MAX) break;
    const it = bsStudioItem(r);
    if (!it) continue;
    if (it.st) {
      if (stations >= BS_STUDIO_STATIONS_MAX) delete it.st;
      else stations++;
    }
    items.push(it);
  }
  if (!items.length) return null;
  return {
    kind: BS_STUDIO_KINDS.includes(v.kind) ? v.kind : 'blank',
    where: bsCleanText(v.where, BS_STUDIO_WHERE_MAX),
    items,
  };
}

// `kitchen`: a nutritionist's kitchen tab (owner, 2026-10-27: "lets do something different for
// nutritionists", agreeing to a kitchen with no floor plan; 2026-10-29: "It will be their own
// recipes", and all of it organized): the plate they teach (how a plate splits between vegetables,
// protein and carbs, with their portion rules), the staples always in their kitchen (each in the
// fridge, the pantry or the freezer), and up to six recipes of their own, written in Make it yours.
// The doc is public through get_public_profile, so a recipe is rebuilt field by field: cleaned
// text, bounded whole numbers, and a photo only from the owner's own upload folder.
export const BS_KITCHEN_RULES_MAX = 4;
export const BS_KITCHEN_RULE_MAX = 60;
export const BS_KITCHEN_STAPLES_MAX = 12;
export const BS_STAPLE_MAX = 40;
export const BS_STAPLE_GROUPS = ['fridge', 'pantry', 'freezer'];
export const BS_KITCHEN_RECIPES_MAX = 6;
export const BS_RECIPE_TITLE_MAX = 80;
export const BS_RECIPE_NOTE_MAX = 160;
export const BS_RECIPE_INGS_MAX = 20;
export const BS_RECIPE_ING_MAX = 60;   // an ingredient's name
export const BS_RECIPE_QTY_MAX = 24;   // its amount ("1/2 cup")
export const BS_RECIPE_STEPS_MAX = 16;
export const BS_RECIPE_STEP_MAX = 300;
// A recipe's numbers: minutes, servings, then kcal and grams of protein, carbs and fat a serving.
export const BS_RECIPE_NUMS = { min: [1, 600], serves: [1, 24], kcal: [0, 3000], p: [0, 400], c: [0, 400], f: [0, 400] };
const BS_KITCHEN_SCAN = 24;
const RECIPE_ID_RE = /^[a-z0-9]{1,24}$/;

// The plate: whole percentages in steps of five that add up to 100, or no plate.
export function bsKitchenPlate(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const parts = ['veg', 'protein', 'carbs'].map((k) => v[k]);
  if (!parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 100 && n % 5 === 0)) return null;
  if (parts[0] + parts[1] + parts[2] !== 100) return null;
  return { veg: parts[0], protein: parts[1], carbs: parts[2] };
}

const scan = (a) => (Array.isArray(a) ? (a.length > BS_KITCHEN_SCAN ? a.slice(0, BS_KITCHEN_SCAN) : a) : []);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// One of their recipes: { id, t, note?, min?, serves?, kcal?, p?, c?, f?, ing?: [{ n?, m }], steps?,
// photo? }, or null without an id and a name. `ing` is the Shape Kitchen's own ingredient grammar
// (n the amount, m the ingredient), so the app's grocery lists and cook mode take it as it is.
export function bsKitchenRecipeItem(v, ownerUid) {
  if (!isObj(v)) return null;
  const id = typeof v.id === 'string' && RECIPE_ID_RE.test(v.id) ? v.id : null;
  const t = bsCleanText(v.t, BS_RECIPE_TITLE_MAX);
  if (!id || !t) return null;
  const out = { id, t };
  const note = bsCleanText(v.note, BS_RECIPE_NOTE_MAX);
  if (note) out.note = note;
  for (const [k, [lo, hi]] of Object.entries(BS_RECIPE_NUMS)) {
    if (Number.isInteger(v[k]) && v[k] >= lo && v[k] <= hi) out[k] = v[k];
  }
  const ing = [];
  for (const g of scan(v.ing)) {
    if (ing.length >= BS_RECIPE_INGS_MAX) break;
    if (!isObj(g)) continue;
    const m = bsCleanText(g.m, BS_RECIPE_ING_MAX);
    if (!m) continue;
    const n = bsCleanText(g.n, BS_RECIPE_QTY_MAX);
    ing.push(n ? { n, m } : { m });
  }
  if (ing.length) out.ing = ing;
  const steps = [];
  for (const x of scan(v.steps)) {
    if (steps.length >= BS_RECIPE_STEPS_MAX) break;
    const st = bsCleanText(x, BS_RECIPE_STEP_MAX);
    if (st) steps.push(st);
  }
  if (steps.length) out.steps = steps;
  const photo = bsOwnMediaUrl(v.photo, 'community-photos', ownerUid) || bsOwnMediaUrl(v.photo, 'coach-media', ownerUid);
  if (photo) out.photo = photo;
  return out;
}

// Null when it holds nothing to show, so an empty doc key drops. `ownerUid` is the account the doc
// belongs to: a recipe photo is kept only from that account's own folder.
export function bsProfileKitchen(v, ownerUid) {
  if (!isObj(v)) return null;
  const plate = bsKitchenPlate(v.plate);
  const rules = [];
  for (const r of scan(v.rules)) {
    if (rules.length >= BS_KITCHEN_RULES_MAX) break;
    const t = bsCleanText(r, BS_KITCHEN_RULE_MAX);
    if (t) rules.push(t);
  }
  const staples = [];
  const seenStaple = new Set();
  for (const it of scan(v.staples)) {
    if (staples.length >= BS_KITCHEN_STAPLES_MAX) break;
    if (!isObj(it)) continue;
    const n = bsCleanText(it.n, BS_STAPLE_MAX);
    if (!n || seenStaple.has(n.toLowerCase())) continue;
    seenStaple.add(n.toLowerCase());
    staples.push({ n, g: BS_STAPLE_GROUPS.includes(it.g) ? it.g : 'pantry' });
  }
  const recipes = [];
  const seen = new Set();
  for (const x of scan(v.recipes)) {
    if (recipes.length >= BS_KITCHEN_RECIPES_MAX) break;
    const r = bsKitchenRecipeItem(x, ownerUid);
    if (!r || seen.has(r.id)) continue;
    seen.add(r.id);
    recipes.push(r);
  }
  if (!plate && !rules.length && !staples.length && !recipes.length) return null;
  return { plate, rules, staples, recipes };
}

// The trusted save wrapper's core: normalize THIS WAVE's keys on a copy of the
// doc, dropping a key entirely when it's empty/invalid (never an empty-string
// tombstone), and passing EVERY other key through byte-identical (AC 9). Junk
// shapes → the key is dropped. Never throws. Film normalization is opt-in per role:
// `opts.filmBucket` (coach-media / member-films) + `opts.filmKey` (defaults 'film';
// the coach P1 film lives in `film`, the member M5 film in its own `filmMember` key so
// the two role-specific films COEXIST rather than overwriting one shared key). A save
// path only ever normalizes ITS role's key — the other role's film key rides through
// byte-identical (the render re-validates each against the right bucket regardless).
export function bsNormalizeProfileCustom(doc, ownerUid, opts) {
  const base = (doc && typeof doc === 'object' && !Array.isArray(doc)) ? { ...doc } : {};
  const line = bsProfileLine(base.line);
  if (line) base.line = line; else delete base.line;
  const wall = bsProfileWall(base.wall, ownerUid);
  if (wall.length) base.wall = wall; else delete base.wall;
  const shelf = bsProfileShelf(base.shelf);
  if (shelf.length) base.shelf = shelf; else delete base.shelf;
  const startLine = bsProfileStartLine(base.startLine);
  if (startLine) base.startLine = startLine; else delete base.startLine;
  const bizCard = bsProfileBizCard(base.bizCard);
  if (bizCard) base.bizCard = bizCard; else delete base.bizCard;
  const pinnedReviews = bsProfilePinnedReviews(base.pinnedReviews);
  if (pinnedReviews.length) base.pinnedReviews = pinnedReviews; else delete base.pinnedReviews;
  const look = bsProfileLook(base.look);
  if (look) base.look = look; else delete base.look;
  const studio = bsProfileStudio(base.studio);
  if (studio) base.studio = studio; else delete base.studio;
  const kitchen = bsProfileKitchen(base.kitchen, ownerUid);
  if (kitchen) base.kitchen = kitchen; else delete base.kitchen;
  const filmBucket = (opts && typeof opts.filmBucket === 'string') ? opts.filmBucket : null;
  const filmKey = (opts && typeof opts.filmKey === 'string') ? opts.filmKey : 'film';
  if (filmBucket) {
    const film = bsProfileFilm(base[filmKey], ownerUid, filmBucket);
    if (film) base[filmKey] = film; else delete base[filmKey];
  }
  return base;
}

// ── The pin kind + prompt question: a stored TOKEN, a rendered LABEL ─────────
//
// ⚠ WHY THIS SPLIT, AND WHY IT LIVES HERE. `pinned.kind` and each prompt's `q`
// are STORED in this same profile_custom doc, SELECTED by an equality
// comparison against the picker's own value, and RENDERED straight back off the
// record on BOTH surfaces. That is the grocery-aisle / primary-goal / Settings-
// pref class at a fourth site: a tr() on the picker would freeze whichever
// language was active when the member pinned it into their own saved profile.
// This module is already the ONE per-key normalizer for this doc, already
// loaded on all seven website profile pages as window.ShapeProfileLib and
// already re-exported to mobile — a separate module would need seven new loader
// tags to say the same thing.
//
// ⚠ THE LABEL RESOLVES A LEGACY ENGLISH VALUE TOO, WHICH THE SETTINGS PREF
// HELPERS DELIBERATELY DO NOT. There the value is bound to a picker AND a free
// text field at once, so an English-looking string may genuinely be something
// the member typed. Here the only writer is a fixed picker, so an English match
// is unambiguous — and resolving it at RENDER means every doc already on disk
// reads the translated label immediately rather than waiting for a re-save.
//
// ⚠ ONE PROMPT LOOKUP ACROSS BOTH ROLE LISTS, ON PURPOSE. The picker is
// role-specific (a coach is offered coach questions); the RENDER is not, and
// does not know the role. The fourteen ids are unique across the two lists, so
// one lookup covers both — and a coach who was once a member still reads their
// older prompt correctly instead of falling through to raw text.
//
// ⚠ ZERO CATALOG KEYS TODAY, AND THAT IS THE CUT. `tr` is injected and optional
// and every helper falls back to this table's English, so the split is a pure
// data-shape change with no visible difference on either surface. The keys land
// with the string sweep, when a translator is actually in scope on this screen.
export const BS_PIN_KINDS = [
  { id: 'pr',      en: 'PR' },
  { id: 'workout', en: 'Workout' },
  { id: 'meal',    en: 'Meal' },
  { id: 'post',    en: 'Post' },
  { id: 'win',     en: 'Win' },
];
export const BS_PROFILE_PROMPTS = [
  { id: 'never_skip',        en: 'Never skip' },
  { id: 'pre_workout_fuel',  en: 'Pre-workout fuel' },
  { id: 'currently_chasing', en: 'Currently chasing' },
  { id: 'form_check',        en: 'Form check I love' },
  { id: 'non_negotiable',    en: 'My non-negotiable' },
  { id: 'rest_day',          en: 'Rest day looks like' },
  { id: 'win_this_month',    en: 'A win this month' },
  { id: 'training_motto',    en: 'Training motto' },
];
// P3 · coach-flavored prompt suggestions (the prompts render already shows on the
// Signal profile — this only swaps the picker's suggested questions for coaches).
export const BS_COACH_PROMPTS = [
  { id: 'philosophy',       en: 'My coaching philosophy' },
  { id: 'first_session',    en: 'First session with me' },
  { id: 'who_i_coach_best', en: 'Who I coach best' },
  { id: 'wont_program',     en: "What I won't program" },
  { id: 'approach',         en: 'My approach' },
  { id: 'client_win',       en: 'A client win' },
];

const BS_PROMPTS_ALL = [...BS_PROFILE_PROMPTS, ...BS_COACH_PROMPTS];

// The plain .toLowerCase() is the CORRECT fold here and not the Turkish
// dotted-i class: the right-hand side is a canonical English constant, so
// folding by English rules is what makes the two comparable (cut 9's
// bsmFilterCategory ruling). Whitespace is collapsed so a hand-edited doc with
// a double space still lands on its token.
function bsProfileFold(v) {
  return String(v).trim().toLowerCase().replace(/\s+/g, ' ');
}

function bsProfileFind(rows, value) {
  const v = String(value == null ? '' : value).trim();
  if (!v) return null;
  const byId = rows.find((o) => o.id === v);
  if (byId) return byId;
  const folded = bsProfileFold(v);
  return rows.find((o) => bsProfileFold(o.en) === folded) || null;
}

// A catalog that returns the RAW KEY (the returnEmptyString: false trap), an
// authored empty value, or one that throws outright all read English rather
// than putting `profile:pin.kind.pr` on a member's own profile.
function bsProfileOptLabel(prefix, row, tr) {
  if (typeof tr !== 'function') return row.en;
  try {
    const v = tr(`${prefix}${row.id}`, { defaultValue: row.en });
    return (v == null || v === '' || String(v).indexOf('profile:') === 0) ? row.en : v;
  } catch (e) { return row.en; }
}

/**
 * The pin kind a member reads. A token or a legacy English value resolves to
 * the label; anything else renders as ITSELF — never a raw key, never blank
 * (the grocery-aisle precedent), so a hand-authored kind survives to the card.
 */
export function bsPinKindLabel(value, tr) {
  const v = String(value == null ? '' : value).trim();
  if (!v) return '';
  const row = bsProfileFind(BS_PIN_KINDS, v);
  return row ? bsProfileOptLabel('profile:pin.kind.', row, tr) : v;
}

/** The pin kind that gets stored: a token stays, legacy English maps, free text passes. */
export function bsPinKindToken(stored) {
  const s = String(stored == null ? '' : stored).trim();
  if (!s) return '';
  const row = bsProfileFind(BS_PIN_KINDS, s);
  return row ? row.id : s;
}

/** The prompt question a member reads. Same contract as the pin kind. */
export function bsPromptLabel(value, tr) {
  const v = String(value == null ? '' : value).trim();
  if (!v) return '';
  const row = bsProfileFind(BS_PROMPTS_ALL, v);
  return row ? bsProfileOptLabel('profile:prompt.q.', row, tr) : v;
}

/** The prompt question that gets stored. */
export function bsPromptToken(stored) {
  const s = String(stored == null ? '' : stored).trim();
  if (!s) return '';
  const row = bsProfileFind(BS_PROMPTS_ALL, s);
  return row ? row.id : s;
}
