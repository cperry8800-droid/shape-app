// The member-recipe store — `user_goals` kind `client_recipes`.
// Spec: docs/superpowers/specs/2026-09-10-third-party-recipe-import-design.md §3.
//
// WHY BODIES DO NOT LIVE IN `client_library`: that array is written BLIND by
// `bsLibWrite` (no read-merge), so a device holding a stale copy publishes it
// over the cloud on the next toggle. For a POINTER that costs a re-save; for a
// recipe the member typed it is unrecoverable — nothing can re-derive it. So the
// Library keeps holding pointers (`myrecipe:<id>`) and the bodies live here,
// behind a serial read-merge-write lane.
//
// SHAPE: pure normalizers + a store whose IO is INJECTED, so tests drive the
// shipped functions rather than a copy of them. No `window` at module scope —
// every environment read happens at call time.

import { bsQtyParse } from './mealPrep.mjs';
import { bsSplitMethodProse } from './cookable.mjs';

export const BS_RECIPES_KIND = 'client_recipes';
export const BS_RECIPES_V = 1;

// How many times a contended write re-reads and re-applies before giving up.
// A member adding a recipe on two devices at once is the case; a bounded loop
// is the difference between converging and spinning.
export const BS_RECIPES_CAS_TRIES = 4;

// Per-uid mirror. ⚠ NOT one shared key: on a shared device a single record is
// whoever wrote last, which is the cross-account class the radio ask-gate was
// rebuilt to avoid. `shape.recipes.` is registered in SHAPE_SCRUB_PREFIXES
// (public/newdesign/localScrub.mjs + its two inline twins), so sign-out clears
// every member's copy — the obligation attaches to the mirror existing, not to
// any screen reading it.
export const BS_RECIPES_MIRROR_PREFIX = 'shape.recipes.';
export const bsRecipesMirrorKey = (uid) => BS_RECIPES_MIRROR_PREFIX + String(uid || '');

// A new recipe id. `crypto.randomUUID` needs a secure context, so the fallback
// has to carry REAL entropy of its own: a suffix derived from the timestamp adds
// none, and two saves in the same millisecond then mint the same id — which
// bsRecipesPut replaces by, losing the first recipe with no error anywhere.
export function bsNewRecipeId(now, win) {
  const w = win || (typeof globalThis !== 'undefined' ? globalThis : null);
  const c = w && w.crypto;
  try { if (c && typeof c.randomUUID === 'function') return c.randomUUID(); } catch (e) {}
  let rand = '';
  try {
    if (c && typeof c.getRandomValues === 'function') {
      const a = new Uint32Array(2);
      c.getRandomValues(a);
      rand = a[0].toString(36) + a[1].toString(36);
    }
  } catch (e) {}
  if (!rand) rand = Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 6);
  return `r${Number(now) || Date.now()}-${rand}`;
}

// The pointer id a `client_library` row carries for a member recipe. Deliberately
// NOT the catalog's `recipe:<slug>` shape: every catalog consumer resolves that
// prefix by slug against SHAPE_KITCHEN_RECIPES, and a member can type any title.
export const BS_MYRECIPE_PREFIX = 'myrecipe:';
export const bsMyRecipePointerId = (id) => BS_MYRECIPE_PREFIX + String(id || '');
export const bsIsMyRecipeId = (id) => typeof id === 'string' && id.startsWith(BS_MYRECIPE_PREFIX);
export const bsMyRecipeIdFrom = (pointerId) =>
  bsIsMyRecipeId(pointerId) ? pointerId.slice(BS_MYRECIPE_PREFIX.length) : null;

// ---------------------------------------------------------------------------
// Normalizers. Everything here treats its input as untrusted: a jsonb document
// round-trips through PostgREST and a mirror round-trips through localStorage,
// so neither is a promise about shape.

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// Ids that would not behave as ordinary keys — see bsRecipeItem.
const UNSAFE_ID = new Set(['__proto__', 'constructor', 'prototype']);

// One ingredient row, in the catalog's own `{n, m, k?}` grammar so
// normalizeIngredients / bsMergeMise accept it with no adapter. `k` is a STRING
// ("330 kcal"), matching shapeKitchenData.js — not a number.
export function bsRecipeIngredient(raw) {
  if (typeof raw === 'string') { const m = str(raw); return m ? { n: '', m } : null; }
  if (!raw || typeof raw !== 'object') return null;
  const m = str(raw.m);
  if (!m) return null;
  const row = { n: str(raw.n) || '', m };
  const k = str(raw.k);
  if (k) row.k = k;
  return row;
}

// One stored recipe. ⚠ `steps` are coerced to PLAIN STRINGS and any `stepMeta`
// is dropped on the floor — see bsCookableFromMemberRecipe, which is where the
// no-passive-windows invariant is actually enforced. Normalizing here as well
// means a hand-edited jsonb row cannot smuggle one in either.
export function bsRecipeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = str(raw.id);
  const title = str(raw.title);
  // ⚠ THE ID BECOMES AN OBJECT KEY, AND `__proto__` IS NOT AN ORDINARY ONE:
  // `items[id] = item` is an ASSIGNMENT, which for `__proto__` invokes the
  // setter — the recipe silently vanishes AND the document's prototype is
  // replaced. Ids are generated (randomUUID, else a timestamp), so nothing
  // legitimate is refused here.
  if (!id || !title || UNSAFE_ID.has(id)) return null;
  const steps = [];
  if (Array.isArray(raw.steps)) {
    for (const s of raw.steps) {
      const t = typeof s === 'object' && s !== null ? str(s.t) : str(s);
      if (t) steps.push(t);
    }
  }
  const ingredients = [];
  if (Array.isArray(raw.ingredients)) {
    for (const g of raw.ingredients) { const row = bsRecipeIngredient(g); if (row) ingredients.push(row); }
  }
  const servings = num(raw.servings);
  const createdAt = num(raw.createdAt);
  const updatedAt = num(raw.updatedAt);
  const out = {
    id, title, steps, ingredients,
    servings: servings !== null && servings > 0 ? Math.floor(servings) : null,
    sourceKind: raw.sourceKind === 'photo' ? 'photo' : 'paste',
    sourceNote: str(raw.sourceNote),
    createdAt: createdAt !== null && createdAt > 0 ? createdAt : null,
    updatedAt: updatedAt !== null && updatedAt > 0 ? updatedAt : null,
  };
  // Provenance, never cleared once set — a member editing every field does not
  // change where the draft came from (spec §5.4).
  if (raw.draftedByAI === true) out.draftedByAI = true;
  return out;
}

// The whole document. An absent/!object/attacker-shaped value becomes an empty
// document; a row that will not normalize is DROPPED rather than kept partial.
// The document's revision, as a NON-NEGATIVE INTEGER. Anything else — absent, a
// string, a float, junk from another build — reads as 0, so the counter always
// moves forward from somewhere. ⚠ This is NOT what the CAS filter compares
// against; that is bsRecipesRevToken below, which must match the RAW stored
// value byte for byte or a document written by another build could never be
// written again.
export function bsRecipesRev(raw) {
  const r = raw && typeof raw === 'object' ? raw.rev : null;
  const n = typeof r === 'number' && Number.isFinite(r) ? Math.floor(r) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// The value to compare-and-set on: the raw `rev` as a string, or null when the
// key is absent (which Postgres reads as `data->>'rev' IS NULL`).
export function bsRecipesRevToken(raw) {
  if (!raw || typeof raw !== 'object' || raw.rev == null) return null;
  return String(raw.rev);
}

export function bsRecipesDoc(raw) {
  const items = {};
  const src = raw && typeof raw === 'object' && raw.items && typeof raw.items === 'object' ? raw.items : {};
  // Object.keys is OWN-enumerable only, so an inherited `constructor` on the
  // parsed value is never visited — the class the dashboard shells were
  // hardened against. (A `for…in` here would visit it; that is the regression
  // this loop is written against, not a hasOwnProperty check inside it, which
  // could never fire.)
  for (const key of Object.keys(src)) {
    const item = bsRecipeItem(src[key]);
    if (item) items[item.id] = item;
  }
  return { v: BS_RECIPES_V, rev: bsRecipesRev(raw), items };
}

// Newest first. Ties break on id so the order is total and a render cannot
// reshuffle between paints.
export function bsRecipesList(doc) {
  const d = bsRecipesDoc(doc);
  return Object.keys(d.items).map((k) => d.items[k]).sort((a, b) => {
    const bt = b.updatedAt || b.createdAt || 0;
    const at = a.updatedAt || a.createdAt || 0;
    if (bt !== at) return bt - at;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function bsRecipesPut(doc, item) {
  const d = bsRecipesDoc(doc);
  const it = bsRecipeItem(item);
  if (!it) return d;
  return { v: BS_RECIPES_V, rev: d.rev, items: { ...d.items, [it.id]: it } };
}

// ⚠ A remove is an UPSERT with the key gone, never a row delete: `user_goals`
// carries no user-facing DELETE policy (spec §3.3 / 0b.7).
export function bsRecipesDrop(doc, id) {
  const d = bsRecipesDoc(doc);
  const key = str(id);
  if (!key || !Object.prototype.hasOwnProperty.call(d.items, key)) return d;
  const items = { ...d.items };
  delete items[key];
  return { v: BS_RECIPES_V, rev: d.rev, items };
}

// The pointer this recipe contributes to `client_library`.
export function bsRecipePointer(item) {
  const it = bsRecipeItem(item);
  if (!it) return null;
  const n = it.ingredients.length;
  const s = it.steps.length;
  return {
    id: bsMyRecipePointerId(it.id),
    kind: 'recipe',
    mine: true,
    recipeId: it.id,
    title: it.title,
    // Counts, not a claim about content — a recipe with no method must not read
    // as though it has one.
    meta: [s ? `${s} step${s === 1 ? '' : 's'}` : null, n ? `${n} ingredient${n === 1 ? '' : 's'}` : null]
      .filter(Boolean).join(' · ') || 'Your recipe',
    // ⚠ NEVER a coach name. bsRecipeAttribution is the catalog's crediting path;
    // a member's own dish is credited to nobody (spec §7.3).
    coach: null,
    savedAt: it.updatedAt || it.createdAt || 0,
  };
}

// ---------------------------------------------------------------------------
// The store. `db` is window.shapeDb, `storage` is window.localStorage; both are
// injected so a test drives these exact code paths.

const SERIAL = { chain: Promise.resolve() };

// One lane, shared by reads AND writes, so a hydrate queued behind a save sees
// that save rather than a pre-write snapshot. Passing `step` as both handlers
// (the bsSettingsWriteSerial shape) means a rejected step never wedges the lane
// while the caller still receives the real promise.
export function bsRecipesSerial(step) {
  const run = SERIAL.chain.then(step, step);
  SERIAL.chain = run.then(() => {}, () => {});
  return run;
}

// The uid, SYNCHRONOUSLY. `shapeDb.getUser()` is async even though it returns a
// cache first, and a first paint cannot await — so the mirror is keyed off the
// same cached state the rest of the client module reads
// (`ShapeAuth.getCachedState()`, shapeBackend.js:4139). Every identity
// transition passes through the setter behind it, so the two agree.
export function bsRecipesUidSync(win) {
  try {
    const w = win || (typeof window !== 'undefined' ? window : null);
    return (w && w.ShapeAuth && w.ShapeAuth.getCachedState && w.ShapeAuth.getCachedState().user
      && w.ShapeAuth.getCachedState().user.id) || null;
  } catch (e) { return null; }
}

export function bsRecipesStore({ db, storage } = {}) {
  const uidNow = async () => {
    try {
      if (!db || !db.getUser) return null;
      const u = await db.getUser();
      return (u && u.id) || null;
    } catch (e) { return null; }
  };

  // Synchronous, so a first paint has the member's recipes without waiting on a
  // round trip — and so the app works offline, which a cloud-only kind cannot.
  const readMirror = (uid) => {
    if (!uid || !storage) return null;
    try {
      const raw = storage.getItem(bsRecipesMirrorKey(uid));
      return raw ? bsRecipesDoc(JSON.parse(raw)) : null;
    } catch (e) { return null; }
  };

  const writeMirror = (uid, doc) => {
    if (!uid || !storage) return;
    try { storage.setItem(bsRecipesMirrorKey(uid), JSON.stringify(bsRecipesDoc(doc))); } catch (e) {}
  };

  // Read the cloud document, or null when it CANNOT BE KNOWN.
  // ⚠ getUserGoals collapses three can't-know cases to null (no backend, no
  // user, a PostgREST error) and returns {} only for a genuinely absent row. A
  // null must therefore decline a write; a {} is a real, empty document and is
  // merged into. It is also documented never to reject — but that is a claim
  // about the supabase client, not an invariant this function enforces, so the
  // catch stays.
  const readCloud = async () => {
    try {
      if (!db || !db.getUserGoals) return null;
      const d = await db.getUserGoals(BS_RECIPES_KIND);
      return d && typeof d === 'object' ? d : null;
    } catch (e) { return null; }
  };

  // Write the document, compare-and-set on its revision where the backend can.
  // Resolves { ok } | { conflict } | { error }.
  //
  // ⚠ THE FALLBACK IS AN HONEST DEGRADATION, NOT A PREFERENCE. Without
  // saveUserGoalsIfRev the write is the unconditional upsert it always was, and
  // the cross-device race below is open. Refusing to write at all would be
  // worse: a member on a build whose shapeDb predates the CAS could not save a
  // recipe.
  const writeDoc = async (next, expectedRev, expectedUid) => {
    // ⚠ THE UID GOES INTO THE WRITER. saveUserGoalsIfRev resolves the user
    // itself, so a switch after our own re-resolve would target the NEW account
    // — and on a fresh row (both revisions absent) the CAS would SUCCEED and put
    // this member's whole document in someone else's row. Re-resolving here only
    // narrows that window; the writer is the only place that can close it.
    if (db && db.saveUserGoalsIfRev) return db.saveUserGoalsIfRev(BS_RECIPES_KIND, next, expectedRev, expectedUid);
    // ⚠ The fallback CANNOT be bound — saveUserGoals takes no uid and resolves
    // its own. The re-resolve immediately above is all there is, so a switch
    // inside that window is an open (pre-existing) hole on this path. Stated
    // rather than discovered; it closes when no shipped client lacks the CAS.
    if (db && db.saveUserGoals) return db.saveUserGoals(BS_RECIPES_KIND, next);
    return { error: { message: 'No backend' } };
  };

  // Read-merge-write, bound to the account that initiated it, and COMPARE-AND-SET
  // on the document's revision.
  //
  // ⚠ THE ORDER IS LOAD-BEARING: capture the uid, read, RE-RESOLVE the uid, then
  // write. saveUserGoals resolves the user independently at SAVE time, so an
  // account switch between the read and the write upserts A's whole document
  // into B's row. Re-resolving before the read would leave that window open.
  //
  // ⚠ AND saveUserGoals RESOLVES `{error}` RATHER THAN THROWING, so a bare await
  // inside a try can never see a failed write. The return value is inspected.
  //
  // ⚠ THE SERIAL LANE IS ONE JAVASCRIPT RUNTIME, AND THAT IS NOT THE THREAT.
  // Two DEVICES can each read the same document, each add a recipe, and each
  // write the whole thing back — leaving only the later write, with the earlier
  // device's recipe gone and nothing reporting it. For a pointer that costs a
  // re-save; for a body the member typed it is unrecoverable, which is the
  // entire reason this kind exists rather than reusing client_library. So the
  // write is conditional on the revision the read saw, and a conflict RE-READS
  // AND RE-APPLIES `mutate` against the newer document — which is why commit
  // takes a function rather than a finished document. An add re-adds onto their
  // recipe; a delete re-deletes from it. (Codex, this PR.)
  const commit = (mutate, ownerUid) => bsRecipesSerial(async () => {
    const uid0 = await uidNow();
    if (!uid0) return { ok: false, reason: 'signed-out' };
    // ⚠ THE DRAFT BELONGS TO AN ACCOUNT, AND A RETRY MUST NOT RE-HOME IT.
    // Every uid check below is resolved AT CALL TIME, so they close the window
    // *inside* one write and say nothing about the one before it: a save
    // refused because the account changed leaves the draft on screen, and one
    // more tap re-enters here, resolves uid0 as the NEW account, reads ITS
    // document and writes this member's typed recipe into it — the race the CAS
    // closed, reopened through the retry path. Telling the member not to retry
    // is not a mechanism; this is. The caller captures the account the draft
    // was composed under and passes it, so a retry is refused until they are
    // signed back in as that account — at which point it simply works.
    if (ownerUid != null && String(uid0) !== String(ownerUid)) {
      return { ok: false, reason: 'account-changed' };
    }

    let base = null;
    for (let attempt = 0; attempt < BS_RECIPES_CAS_TRIES; attempt += 1) {
      const cloud = await readCloud();
      if (cloud === null) return { ok: false, reason: 'unreadable', doc: base };

      const uid1 = await uidNow();
      if (!uid1 || uid1 !== uid0) return { ok: false, reason: 'account-changed' };

      base = bsRecipesDoc(cloud);
      const mutated = mutate(base);
      const next = { ...mutated, rev: bsRecipesRev(base) + 1 };

      let res = null;
      try {
        res = await writeDoc(next, bsRecipesRevToken(cloud), uid0);
      } catch (e) {
        return { ok: false, reason: 'write-failed', doc: base };
      }
      if (res && res.conflict) continue;          // another device wrote — re-read
      // ⚠ THE WRITER'S ACCOUNT REFUSAL IS NOT A RETRYABLE FAILURE, and it is
      // read off a FLAG rather than off its message. The first draft sniffed
      // /account/i on the error text, which made the branch fire for any backend
      // error whose prose happened to contain the word — "Your account is over
      // its usage limits", "User account is disabled" — steering a member away
      // from the retry that would have worked once the condition cleared, and
      // made the writer's wording part of this module's contract. It keeps the
      // same name the store's own re-resolve uses, so one state means one thing.
      if (res && res.accountChanged) return { ok: false, reason: 'account-changed', doc: base };
      if (!res || res.error) return { ok: false, reason: 'write-failed', doc: base };

      writeMirror(uid0, next);
      return { ok: true, doc: next };
    }
    // Every attempt lost the race. Nothing was written and nothing was lost —
    // the member's own copy is intact and the next save will land.
    return { ok: false, reason: 'contended', doc: base };
  });

  return {
    uidNow,
    readMirror,
    writeMirror,
    readCloud,
    // Converge the mirror onto the cloud. A can't-know read leaves the mirror
    // alone rather than publishing an empty document over the member's recipes.
    hydrate: () => bsRecipesSerial(async () => {
      const uid0 = await uidNow();
      if (!uid0) return { ok: false, reason: 'signed-out' };
      const cloud = await readCloud();
      if (cloud === null) return { ok: false, reason: 'unreadable', doc: readMirror(uid0) };
      // ⚠ THE SAME RE-RESOLVE THE WRITE LANE DOES, FOR THE SAME REASON.
      // getUserGoals resolves the user ITSELF, so the document that came back
      // belongs to whoever was signed in at THAT moment — not necessarily to
      // uid0. Writing it under uid0's mirror key on a shared device paints B's
      // recipes on A's Library at the next boot, which is exactly what the
      // per-uid key exists to prevent. commit guarded this; hydrate did not.
      const uid1 = await uidNow();
      if (!uid1 || uid1 !== uid0) return { ok: false, reason: 'account-changed', doc: null };
      const doc = bsRecipesDoc(cloud);
      writeMirror(uid0, doc);
      return { ok: true, doc };
    }),
    // ownerUid: the account the caller composed this change under. Optional —
    // a caller that cannot resolve it degrades to today's behaviour (bound at
    // write time, which still closes the mid-write window) rather than being
    // unable to save at all.
    save: (item, ownerUid) => commit((doc) => bsRecipesPut(doc, item), ownerUid),
    remove: (id, ownerUid) => commit((doc) => bsRecipesDrop(doc, id), ownerUid),
  };
}

// ---------------------------------------------------------------------------
// The paste splitter (spec §4.1) — one textarea into an ingredient list and a
// method, with NO model involved. Whatever it gets wrong the member corrects on
// the review screen; nothing here is persisted without them seeing it.


// Deliberately the same vocabulary bsSplitMethodProse uses to decide whether a
// sentence is an instruction — one definition of "this line cooks something".
const RECIPE_VERBS = /\b(heat|preheat|cook|stir|add|mix|whisk|bake|roast|grill|boil|simmer|sear|saut[eé]|toast|season|slice|chop|dice|mince|drain|rinse|marinate|fold|pour|spread|layer|top|serve|rest|cover|blend|mash|melt|fry|steam|reduce|combine|transfer|flip|remove|garnish)\b/i;

// ⚠ HEADINGS ARE MATCHED IN ALL 13 SHIPPED LOCALES, not just English. A heading
// the matcher does not know is not merely missed — it falls through and is
// PRESENTED TO THE MEMBER AS AN INGREDIENT ROW ("Ingredientes", "Метод"), which
// is worse than no split at all. The alternations are deliberately generous —
// a heading line is short and unambiguous.
// ⚠ AND THERE IS NO TRAILING `\b`, DELIBERATELY. `\b` is defined against ASCII
// `\w`, so it can NEVER match after Ингредиенты, Nguyên liệu or Yapılışı — measured,
// those headings fell through and were shown to the member AS INGREDIENT ROWS.
// `^\s*(…)[:\s]*$` already requires the whole line to be the heading, so the
// boundary was excluding every non-Latin script and buying nothing.
const ING_HEAD = new RegExp(
  '^\\s*(ingredients|you(?:\'ll| will| wll|ll) need|shopping list|what you need'
  + '|zutaten|ingredientes|ingr[ée]dients?|ingredienti|bahan|kayan ha[dɗ]i'
  + '|malzemeler|nguy[eê]n li[eệ]u|\u0438\u043d\u0433\u0440\u0435\u0434\u0438\u0435\u043d\u0442\u044b|\u0456\u043d\u0433\u0440\u0435\u0434\u0456\u0454\u043d\u0442\u0438)[:\\s]*$', 'iu');
const METHOD_HEAD = new RegExp(
  '^\\s*(method|m[\u00e9e]todo|directions|instructions|steps|preparation|to cook|how to (?:make|cook)'
  + '|zubereitung|preparaci[óo]n|elaboraci[óo]n|pr[ée]paration|preparazione|preparo|modo de preparo'
  + '|cara (?:masak|membuat)|yadda ake yi|yap[ıi]l[ıi][şs][ıi]|haz[ıi]rlan[ıi][şs][ıi]|c[áa]ch l[àa]m'
  + '|\u043f\u0440\u0438\u0433\u043e\u0442\u043e\u0432\u043b\u0435\u043d\u0438\u0435|\u0441\u043f\u043e\u0441\u043e\u0431 \u043f\u0440\u0438\u0433\u043e\u0442\u043e\u0432\u043b\u0435\u043d\u0438\u044f|\u043f\u0440\u0438\u0433\u043e\u0442\u0443\u0432\u0430\u043d\u043d\u044f)[:\\s]*$', 'iu');
// A leading "1." / "2)" / "-" / "•" marks a list row on either side of the split.
const BULLET = /^\s*(?:[-–—*•]|\d+[.)]|[a-h][.)])\s+/;

const clean = (l) => String(l || '').replace(BULLET, '').trim();

// Is this line an ingredient? A parseable quantity is the strong signal; failing
// that, a SHORT line naming no cooking action ("salt to taste", "2 eggs").
function looksIngredient(line) {
  const l = clean(line);
  if (!l) return false;
  if (RECIPE_VERBS.test(l)) return false;
  if (bsQtyParse(l)) return true;
  return l.split(/\s+/).length <= 6 && !/[.!?]$/.test(l);
}

// → { ingredients: [{n, m}], steps: [string] }
// Headings win when present; otherwise every line is classified on its own.
export function bsSplitPaste(text) {
  const lines = String(text || '').split(/\r?\n/);
  const ing = [];
  const method = [];
  let mode = 'auto';
  for (const raw of lines) {
    const line = String(raw || '');
    if (!line.trim()) continue;
    if (ING_HEAD.test(line)) { mode = 'ing'; continue; }
    if (METHOD_HEAD.test(line)) { mode = 'method'; continue; }
    const body = clean(line);
    if (!body) continue;
    if (mode === 'ing') { ing.push(body); continue; }
    if (mode === 'method') { method.push(body); continue; }
    (looksIngredient(line) ? ing : method).push(body);
  }
  return {
    ingredients: ing.map((l) => {
      const p = bsQtyParse(l);
      if (!p) return { n: '', m: l };
      // Split at the parsed pieces rather than re-formatting the number, so
      // "1/2 cup" stays "1/2 cup" and never becomes "0.5 cup".
      //   "1 cup flour" → rest "flour"  → n "1 cup", m "flour"
      //   "2 eggs"      → rest ""       → the unit token IS the name: n "2", m "eggs"
      const cut = p.rest ? l.length - p.rest.length : l.length - (p.unit || '').length;
      // ⚠ THE CUT MUST LAND ON A WORD BOUNDARY. bsQtyParse's unit vocabulary is
      // English, so on a non-English line it can claim a prefix of a real word:
      // measured, "2 quả trứng" cut to n "2 qu" / m "ả trứng". Splitting a word
      // in half is worse than not splitting — the amount is then wrong AND the
      // ingredient is unreadable — so an off-boundary cut keeps the line whole.
      if (cut <= 0 || cut > l.length || (cut < l.length && !/\s/.test(l[cut - 1]))) return { n: '', m: l };
      const n = String(l.slice(0, cut)).trim();
      const m = (p.rest || p.unit || '').trim();
      // ⚠ A LINE CARRYING A SECOND QUANTITY IS REFUSED RATHER THAN HALF-PARSED,
      // AND THE TEST ASKS bsQtyParse — not a regex over the tail. Two shapes
      // reach here, and both scale WRONG while looking right at ×1:
      //   mixed fractions — bsQtyParse stops at the whole number and returns an
      //     EMPTY unit, so "1 1/2 cups flour" came back as n "1" / m "1/2 cups
      //     flour", an ingredient literally named that, which Prep scales as one;
      //   compound amounts — "1 lb 2 oz beef" parses as n "1 lb" / m "2 oz beef",
      //     so doubling prints "2 lb | 2 oz beef" where the truth is 2 lb 4 oz.
      // The unicode form matters most: it is what a pasted web recipe contains
      // AND it reads correctly at ×1, so the member has no reason to fix it on
      // the review screen and only meets it when a doubled "1 ½ cups" prints as
      // "2 ½ cups" instead of 3.
      // ⚠ AND THE TEST MUST NOT BE "m STARTS WITH A DIGIT": that refuses
      // "1 cup 2% milk", "200 g 70% dark chocolate" and "1 cup 00 flour", whose
      // digits belong to the NAME and whose unit is real — and refusing is not
      // free, because with n empty the merged mise cannot annotate ×N either, so
      // a doubled batch shows the original amount with nothing saying it was not
      // scaled. `!p.unit` alone is the opposite miss: it is the mixed-fraction
      // shape and nothing else, so every compound amount above walks through.
      // Re-parsing the tail separates them on the one thing a regex cannot see.
      // ⚠ THE TEST IS UNIT **AND** REST, NOT UNIT ALONE, and bsQtyParse is why:
      // it has NO unit vocabulary — it takes whatever word follows a number —
      // so "5 spice" parses with unit "spice" exactly as "2 oz beef" parses with
      // unit "oz". What tells them apart is what is LEFT: a real compound amount
      // is still followed by an ingredient ("2 oz | beef", "500 g | rice",
      // "1/2 cups | flour"), while a name carrying a number consumes the whole
      // tail and leaves nothing ("5 spice", "100 flour"). Measured, unit alone
      // refused "1 tbsp 5 spice", which is an ingredient, not an amount.
      // "2% milk" and "70% dark" yield no unit at all (no space before the %),
      // and "00 flour" does not parse — all three are kept. A vulgar fraction is
      // checked separately because bsQtyParse returns null for "½ cups flour".
      // ⚠ The residual, stated rather than discovered: a tail of three or more
      // tokens opening with a number ("1 cup 5 spice powder") is still refused,
      // and a tail that is a bare amount with no ingredient at all ("1 lb 2 oz")
      // is still split. Both are rarer than the cases above and both land on the
      // review screen, which is where a member fixes what we got wrong.
      // Widening bsQtyParse itself would reach the whole grocery and mise stack,
      // which is not this change's to move.
      const tail = bsQtyParse(m);
      if ((tail && tail.unit && tail.rest) || /^\p{No}/u.test(m)) return { n: '', m: l };
      // A quantity with nothing after it is not an ingredient row on its own —
      // keep the line verbatim rather than emitting an empty name.
      return m ? { n, m } : { n: '', m: l };
    }),
    // ⚠ STEPS ARE THE PASTE'S OWN LINES, and that is the whole point. Joining
    // them into one blob and re-splitting on sentence punctuation destroyed the
    // structure the member pasted: a numbered method whose lines carry no full
    // stops collapsed into ONE step, and any non-Latin script never split at all
    // (the sentence rule looks for an ASCII capital). A line IS a step.
    //
    // A single-line paste has no line structure to keep, so it falls back to the
    // catalog's own prose splitter — which handles numbered markers first and
    // sentences second — rather than to a weaker copy of it.
    steps: method.length > 1 ? method : (method.length === 1 ? (bsSplitMethodProse(method[0]) || method) : []),
  };
}
