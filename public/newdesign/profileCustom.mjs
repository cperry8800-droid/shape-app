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
