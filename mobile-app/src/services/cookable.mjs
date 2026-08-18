// The cookable contract — Cook Mode's input layer (spec 2026-07-21 §4).
//
// One normalizer, bsCookable(source), ingests EVERY meal/recipe shape in the
// system and emits the one shape the walkthrough renders. Coverage is an
// honest ladder, never fabrication:
//   tier 1 (STEPS)  — authored steps, walked verbatim
//   tier 2 (PROSE)  — a prose method deterministically split ("FROM THE PLAN")
//   tier 3 (MISE)   — ingredients but no method: mise + timers only
//   tier 4 (QUICK)  — title/macros only: quick mode
// A tier-3/4 cookable carries steps: [] — the UI never renders a step that
// wasn't authored (or member-reviewed via the labeled AI draft, PR B).
//
// Pure + deterministic: no Date, no random, Symbol-safe on attacker-shaped
// input (rows can arrive from jsonb — treat every field as untrusted).

export const BS_COOK_TIERS = { STEPS: 1, PROSE: 2, MISE: 3, QUICK: 4 };

// The station a passive step occupies (PR D orchestration §6). A structured
// step may claim exactly one; anything else is no station. 'off' = a hands-off
// wait that ties up no equipment (rest / chill / marinate), which still hosts an
// interleave window but never conflicts.
export const BS_STATIONS = ['oven', 'stove', 'board', 'off'];

// A string-or-nothing guard: only real, non-empty strings pass (a Symbol or
// object in a text field must drop honestly, never throw via String()).
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

// Honest number: null/''/Symbol/NaN are ABSENCE, never 0 (the Number(null)=0
// fabrication class — see the cycle-engine + food-search lessons).
const num = (v) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};

export const bsCookSlug = (title) => {
  const s = str(title);
  return s ? s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : '';
};

// The resume-stamp identity for a cookable. A bare title slug collides (two
// same-titled meals share a slot) and slugs to '' on non-Latin titles (every
// Cyrillic meal would share ONE key) — so identity prefers the meal id, then
// the recipe/title slug, then a stable char-code hash of the raw title.
export const bsCookKey = (c) => {
  if (typeof c !== 'object' || c === null) return 'cook:';
  if (str(c.mealId)) return 'cook:meal:' + str(c.mealId);
  const slug = bsCookSlug(c.recipeTitle || c.title);
  if (slug) return 'cook:' + slug;
  const s = str(c.title) || '';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) >>> 0;
  return 'cook:h' + h.toString(36);
};

// ---------------------------------------------------------------------------
// Steps + ingredients normalization

// The honest step-metadata for a step (PR D orchestration §6). A plain-string
// step carries none — it can never host an interleave window (only authored,
// hand-checked `passive` steps do), so the board never fabricates parallelism.
const plainStepMeta = () => ({ min: null, passive: false, station: null });

// Validate one authored meta blob (an inline `{t, min?, passive?, station?}` step
// OR a catalog `stepMeta[i]` overlay entry) into the canonical shape. `min` counts
// only as a real positive number; `station` only when in BS_STATIONS; `passive`
// only on an explicit `=== true`. Null/attacker-shaped input → null (drops out).
const sanitizeMeta = (m) => {
  if (!m || typeof m !== 'object') return null;
  const min = num(m.min);
  return {
    min: min !== null && min > 0 ? min : null,
    passive: m.passive === true,
    station: BS_STATIONS.includes(m.station) ? m.station : null,
  };
};

// Splits raw step entries (string | { t, min?, passive?, station? }) into two
// index-aligned arrays: the rendered `text` (backward compatible — strings stay
// valid everywhere) and `meta`. Empty/attacker-shaped entries drop from BOTH in
// lockstep, so text[i] and meta[i] always describe the same step. Structured
// `min` is honored only when a real positive number; `station` only when it is
// one of BS_STATIONS; `passive` only on an explicit `=== true`.
const splitSteps = (steps) => {
  const text = [];
  const meta = [];
  if (!Array.isArray(steps)) return { text, meta };
  for (const s of steps) {
    if (typeof s === 'object' && s !== null) {
      const t = str(s.t);
      if (!t) continue;
      text.push(t);
      meta.push(sanitizeMeta(s)); // s is a non-null object here → never null (the overlay merge below is where the fallback is real)
    } else {
      const t = str(s);
      if (!t) continue;
      text.push(t);
      meta.push(plainStepMeta());
    }
  }
  return { text, meta };
};

// Back-compat: the many `steps`-only call sites keep working unchanged.
const normalizeSteps = (steps) => splitSteps(steps).text;

// Ingredients: { n, m, k? } objects (the catalog/meal grammar) or plain
// strings (legacy website shape) → { n, m, k? }. Empty names drop.
const normalizeIngredients = (ings) => {
  if (!Array.isArray(ings)) return [];
  const out = [];
  for (const ing of ings) {
    if (typeof ing === 'string') {
      const m = str(ing);
      if (m) out.push({ n: '', m });
    } else if (typeof ing === 'object' && ing !== null) {
      const m = str(ing.m);
      if (!m) continue;
      const row = { n: str(ing.n) || '', m };
      const k = str(ing.k);
      if (k) row.k = k;
      out.push(row);
    }
  }
  return out;
};

// ---------------------------------------------------------------------------
// The prose splitter (tier 2)

// A blurb only qualifies as a METHOD when it actually reads as instructions —
// gated on cooking verbs so marketing copy ("Sunday reset — easy to scale")
// never becomes fake steps.
const COOK_VERBS = /\b(heat|preheat|cook|stir|add|mix|whisk|bake|roast|grill|boil|simmer|sear|saut[eé]|toast|season|slice|chop|dice|mince|drain|rinse|marinate|fold|pour|spread|layer|top|serve|rest|cover|blend|mash|melt|fry|steam|reduce|combine|transfer|flip|remove|garnish)\b/i;

export const bsSplitMethodProse = (text) => {
  const t = str(text);
  if (!t) return null;
  // Numbered/lettered line markers win; otherwise sentence boundaries.
  const numbered = /(?:^|\n|\s)(?:\d+[.)]|[a-h][.)])\s+/.test(t);
  let parts;
  if (numbered) {
    // Authored structure — every marked segment is a step, even a short
    // "2. Stir." (no length floor: dropping an authored step would silently
    // omit a real instruction, the opposite of carrying-what-was-authored).
    parts = t.split(/(?:^|\n|\s)(?:\d+[.)]|[a-h][.)])\s+/).map((p) => p.trim()).filter(Boolean);
  } else {
    parts = t.split(/(?<=[.!?])\s+(?=[A-Z])/).map((p) => p.trim()).filter(Boolean)
      .filter((p) => p.length > 12); // noise-fragment floor, sentence mode only
  }
  if (parts.length < 2) return null;
  const instructional = parts.filter((p) => COOK_VERBS.test(p));
  if (instructional.length < 2) return null;
  // Numbered/lettered prose is carried WHOLESALE (the coach chose the
  // structure); free sentences carry only the instructional segments, so a
  // marketing lead ("Sunday reset — a favorite.") can never ride into the
  // walkthrough as a fake method step.
  return numbered ? parts : instructional;
};

// ---------------------------------------------------------------------------
// The step-timer parser (v1 — structured `min` metadata overrides in PR D)

// "18 minutes" · "30 seconds" · "1 hour" · "18–20 minutes" (range → the lower
// bound runs, the label keeps the range) · "3 minutes per side" (label keeps
// the qualifier). Cap 4 per step.
// The per-side qualifier appears both as words ("3 minutes per side") and the
// shipped shorthand ("3 min/side") — match both so the CTA keeps the flip cue.
//
// The unit vocabulary is exported because it is the SINGLE definition of what
// counts as a stated duration in a step. Any other rule that has to reason
// about one (the scheduling-note gate in `tests/cook-steps.test.mjs`) derives
// from this alternation rather than restating it — a second copy would keep
// passing while silently ceasing to cover a unit added here, which is exactly
// the kind of quietly-narrowed gate that guards nothing.
export const BS_TIMER_UNITS = 'hours?|hrs?|minutes?|mins?|seconds?|secs?';
const TIMER_RE = new RegExp(
  `(\\d+(?:\\s*[–-]\\s*\\d+)?)\\s*(${BS_TIMER_UNITS})(\\s*\\/\\s*side|\\s+per\\s+side)?`,
  'gi',
);
const UNIT_SECONDS = (unit) => (/^h/i.test(unit) ? 3600 : /^m/i.test(unit) ? 60 : 1);

// THE one parse. Each entry also carries WHERE its duration sits in the step
// (`at`/`end`), because anything that has to know which words a given timer
// belongs to must read it from the parser rather than re-deriving boundaries
// with a second rule. ⚠ Three separate label defects came from doing exactly
// that (punctuation-splitting the step and hoping the pieces line up with the
// timers); the match position is the only authority that cannot disagree with
// the parser, because it IS the parser.
const timerSpans = (text) => {
  const t = str(text);
  if (!t) return [];
  const out = [];
  let m;
  TIMER_RE.lastIndex = 0;
  while ((m = TIMER_RE.exec(t)) && out.length < 4) {
    const firstNum = num(m[1].split(/[–-]/)[0]);
    if (firstNum === null || firstNum <= 0) continue;
    const seconds = firstNum * UNIT_SECONDS(m[2]);
    // A cook timer under 5s or over 6h is a parse artifact, not a timer.
    if (seconds < 5 || seconds > 21600) continue;
    const unitLabel = /^h/i.test(m[2]) ? 'hr' : /^m/i.test(m[2]) ? 'min' : 'sec';
    out.push({
      seconds,
      label: `${m[1].replace(/\s+/g, '')} ${unitLabel}${m[3] ? ' per side' : ''}`,
      at: m.index,
      end: m.index + m[0].length,
    });
  }
  return out;
};

// The public contract is {seconds, label} and is pinned by deepEqual in
// tests/cookable.test.mjs — the spans stay internal so the shape can't drift.
export const bsStepTimers = (text) => timerSpans(text).map(({ seconds, label }) => ({ seconds, label }));

// ---------------------------------------------------------------------------
// Step identity — "which timer is this?" and "what do I need HERE?"
// ---------------------------------------------------------------------------

// A SHORT label for a step's timer — ONE OR TWO WORDS. The band used to show a
// timer's DURATION and nothing else, so two 2-minute steps produced two rows
// reading "2 MIN", literally indistinguishable mid-cook.
//
// It names the THING, not the sentence: the ingredient the timed clause reaches
// for ("turkey", "peanut butter"), else that clause's verb ("roast", "rest").
// Both are lifted from the recipe's own words — never a generated summary,
// which is the fabrication class this file exists to refuse. Returns '' when
// there is nothing usable; the caller falls back to the step NUMBER, always a
// fact.
export const BS_GIST_WORDS = 2;
// Lead-ins and auxiliaries that carry no identity. Includes bare conjunctions
// because comma-splitting yields clauses like "and toast for 1 minute" — a
// label must never open on a dangling "and" — and weak auxiliaries so
// "let it sit undisturbed" labels as "sit", not "let".
const GIST_SKIP = new Set([
  'meanwhile', 'then', 'now', 'next', 'finally', 'afterwards', 'afterward', 'and', 'or', 'but',
  'let', 'keep', 'allow', 'the', 'a', 'an', 'it', 'its', 'them', 'they', 'you', 'your', 'for',
  'to', 'on', 'in', 'of', 'with', 'until', 'about', 'another', 'over', 'off', 'up', 'down',
  'into', 'from', 'at', 'by', 'so', 'that', 'this', 'is', 'are', 'be', 'been', 'will', 'more',
  'all', 'each', 'both', 'again', 'while', 'once', 'through', 'aside', 'per', 'side',
]);
// Clause boundary. A '.' closes a clause only when whitespace or end-of-string
// follows, so "medium-high." splits while "1.5 minutes" does NOT — the same
// decimal hazard bsFractionalDuration guards on the timer side. Commas count:
// they separate "Push the meat aside" from "add the garlic and ginger ... 30
// seconds", and the timer belongs to the second.
const GIST_SPLIT_RE = /[.;:!?](?=\s|$)|\s+[–—]\s+|,\s+/;
// Where one ACTION ends -- sentence-level punctuation only, NO comma.
//
// ⚠ A comma does not end an action. "Until the rice is tender, continue
// simmering, about 10 minutes" is ONE action written in three fragments, and
// taking the fragment nearest the number kept only "about" -- an empty label on
// a step whose prose names the rice plainly. Reducing the lead to the nearest
// COMMA fragment is lossy in a way that reducing it to the nearest SENTENCE is
// not: "Heat a dry skillet. ... let it sit undisturbed 2 minutes" still has to
// label "sit" and not "heat".
const GIST_CLAUSE_RE = /[.;:!?](?=\s|$)|\s+[–—]\s+/;
// A stated duration, in the same unit vocabulary the timer parser accepts.
// ⚠ Plain concatenation, NOT a template literal: `\d` inside a template literal
// collapses to a bare "d", which silently produced a regex that matched no
// duration at all and sent every label back to the step's first clause.
const GIST_DUR_RE = new RegExp('\\d+\\s*(?:' + BS_TIMER_UNITS + ')\\b', 'i');

// The recipe's own short name for an ingredient: its last two content words
// ("chicken thigh, skin-on" -> "chicken thigh", "lean ground turkey" -> "turkey").
const ingShortName = (name) => {
  const c = ingContent(ingBase(name));
  return c.length ? c.slice(-BS_GIST_WORDS).join(' ') : '';
};

// Where an ingredient's own words first appear in this timer's region.
// Infinity = not named in it at all.
//
// ⚠ EARLIEST, not nearest-the-number. Ranking by distance to the duration reads
// plausible and is wrong: the medium and the seasoning are exactly what sit
// closest to it. Measured over the catalogue it turned "chicken breast" into
// "olive oil" ("pan-sear in a little olive oil ... 5 minutes per side"), "carrot"
// into "olive oil", and "kale" into "lemon" ("a squeeze of lemon for 30
// seconds"). The subject of an action is written FIRST; media and seasonings
// arrive later behind a preposition.
//
// The original defect was never "first" -- it was first in RECIPE-LIST order,
// which let the ingredient list decide which timer got which food ("Bake the
// salmon 12 minutes while the pearl couscous cooks 10 minutes" labelled the
// SALMON timer "pearl couscous", and reordering the list moved it). First in the
// TEXT reads the recipe's own words, and needs to know nothing about which
// conjunction joined the two actions -- "while", "before", "and", "meanwhile".
const ingPosition = (ing, region, distinctive) => {
  const name = ing && typeof ing === 'object' ? str(ing.m) : str(ing);
  if (!name) return Infinity;
  let best = Infinity;
  // ⚠ Rank on ingMatchTokens -- the SAME set that admitted this ingredient --
  // never on every content word. Admission already refuses an action word as a
  // lone alias, but ranking used to scan all of them, so the two halves
  // disagreed: "Brown the chicken 3 minutes until the brown sugar melts" admits
  // both foods legitimately (the full phrase "brown sugar" is right there), then
  // the opening VERB handed brown sugar position zero and it beat the chicken
  // the step names outright. One token set, one scan, no way for them to drift.
  for (const tok of ingMatchTokens(name, distinctive)) {
    const m = new RegExp('\\b' + escapeRe(tok) + '(?:e?s)?\\b', 'i').exec(region);
    if (m && m.index < best) best = m.index;
  }
  return best;
};

// Does this fragment say anything a label could be built from -- a named food,
// or a word that carries an action? Used to decide when the fragment nearest the
// number is too thin to stand for the action.
const gistCandidate = (frag, ingredients) => {
  const f = str(frag);
  if (!f) return false;
  if (bsStepIngredients(f, ingredients).length) return true;
  return f
    .replace(GIST_DUR_RE, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .some((w) => w.length >= 3 && !GIST_SKIP.has(w));
};

export const bsStepGist = (text, ingredients, seconds, nth, avoid) => {
  const t = str(text);
  if (!t) return '';
  const parts = t.split(GIST_SPLIT_RE).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return '';
  // WHICH WORDS IS THIS TIMER TIMING? Read the answer off the parser: a timer's
  // action is the text running from the end of the PREVIOUS stated duration to
  // the start of its own -- "Boil the rice |2 minutes| then toast the sesame oil
  // for |2 minutes|" gives "Boil the rice" and "then toast the sesame oil for".
  //
  // ⚠ Do NOT go back to splitting the step and matching timers to the pieces.
  // Three defects came out of that, each a different way for a hand-written
  // boundary rule to disagree with the parser: one shared label for every timer
  // on a step, then equal durations both selecting the first piece, then two
  // actions joined by a bare "then" never splitting at all. A match position
  // cannot disagree with the parser, because it IS the parser.
  //
  // `nth` = how many earlier timers share this duration, so equal durations
  // still take their own span.
  //
  // The action is anchored by the parser on BOTH sides -- it runs from the
  // PREVIOUS stated duration to the NEXT one -- and the food may be named on
  // either side of the number, so both are kept:
  //   "Roast |10 minutes| until the chicken browns, then simmer the rice"
  //    lead ^^^^^         ^^^^^^^^^^^^^^^^^^^^^^^^ tail
  // ⚠ Anchoring only the LEAD throws away the half that usually carries the
  // food ("roast 16-18 minutes until the chicken hits 165F" -> "roast"), and
  // running the tail to the next duration drags in the NEXT action's food.
  // Both were shipped and both were wrong; the tail therefore stops at the
  // first action boundary inside the anchored region.
  const spans = Number.isFinite(seconds) ? timerSpans(t) : [];
  const mine = spans.filter((s) => s.seconds === seconds)[Number.isFinite(nth) ? nth : 0];
  let own = null;
  if (mine) {
    let from = 0;
    let upto = t.length;
    for (const s of spans) {
      if (s.end <= mine.at) from = Math.max(from, s.end);
      if (s.at >= mine.end) upto = Math.min(upto, s.at);
    }
    // BOTH sides end at the same two boundaries: punctuation, and a bare
    // sequencing "then" (a coach can write two timed actions with no comma at
    // all). Deliberately NOT a bare "and" -- "until the sauce coats a spoon and
    // the chickpeas have softened" is ONE action, and cutting there loses the
    // only food it names.
    // ⚠ The cut has to run on BOTH sides or it hands one action's food to the
    // NEXT action's timer: cutting only the tail left "Boil the rice 10 minutes
    // until tender then rest 5 minutes" labelling the REST timer "tender", and
    // "...until the lentils soften then rest 5 minutes" labelling it "brown
    // lentils" -- which ALSO made both timers on that step read alike, the exact
    // collision this label exists to prevent.
    // The words that genuinely END one action and START the next. Sequencing
    // only -- NOT a bare "and", which is usually WITHIN an action ("until the
    // sauce coats a spoon and the chickpeas have softened"). MEASURED on this
    // head: adding a bare "and" changes 41 of 96 catalogue labels and nearly all
    // get worse -- "shrimp"->"cook", "bok choy"->"steam", "chicken breast"->
    // "marinate" -- because recipe prose overwhelmingly writes "add X and cook
    // 5 minutes", which is ONE action. Codex asked about exactly this; the
    // answer is evidence, not taste.
    // Ingredient choice no longer depends on this set at all (that is text
    // order); it bounds the VERB fallback, which would otherwise reach back
    // across the join -- "...until tender while rest 5 minutes" labelled the
    // REST timer "tender".
    // A join ENDS one action and STARTS the next. "then"/"meanwhile" always do.
    // The subordinators (while/before/after/once/as) only do so when another
    // timed action actually follows -- otherwise they introduce a condition that
    // NAMES this action's food ("cook 5 minutes once the chicken is added").
    const SEQ = 'then|meanwhile';
    const SUB = 'while|before|after|once|as';
    // ⚠ Build the escapes with doubled backslashes. A lone \s in a JS string
    // literal is just the letter s, and a lone \b is BACKSPACE -- both make a
    // regex that silently matches the wrong thing while every test still runs.
    // This trap has now fired four separate times in this file.
    const reOf = (alt) => new RegExp('\\s+(?:' + alt + ')\\s+', 'i');

    // LEAD: the clause nearest the number, so "Heat a dry skillet. ... let it
    // sit undisturbed 2 minutes" labels "sit" and not "heat". It must not reach
    // back across a join into the PREVIOUS action -- "...until tender while rest
    // 5 minutes" labelled the REST timer "tender".
    const rawLead = t.slice(from, mine.at);
    const leads = rawLead.split(GIST_SPLIT_RE).map((p) => p.trim()).filter(Boolean);
    let leadClause = leads.length ? leads[leads.length - 1] : '';
    // ⚠ The fragment nearest the number can carry NOTHING. "Until the rice is
    // tender, continue simmering, about 10 minutes" leaves "about", an empty
    // label on prose that names the rice plainly -- a coach may front this
    // action's completion condition ahead of its verb. Widen to the whole
    // SENTENCE only when the nearest fragment says nothing at all, so the
    // ordinary case is untouched: widening unconditionally moved 32 of 96
    // catalogue labels, several of them worse (bok choy -> steam).
    if (!bsStepIngredients(leadClause, ingredients).length) {
      const sentences = rawLead.split(GIST_CLAUSE_RE).map((p) => p.trim()).filter(Boolean);
      const whole = sentences.length ? sentences[sentences.length - 1] : '';
      // TWO reasons to widen past the fragment nearest the number:
      //   a) the sentence OPENS on a fronted condition that names this action's
      //      food ahead of its verb -- "Until the rice is tender, continue
      //      simmering for 10 minutes" -- which a content-word threshold misses
      //      entirely, because "continue simmering for" reads complete.
      //   b) the fragment says nothing at all ("simmer, about 10 minutes"
      //      leaves "about", every word a skip-word).
      //
      // ⚠ (a) is deliberately NOT "the sentence names a food somewhere". That
      // reaches back to the sentence's FIRST food, which in a long sentence is
      // the MEDIUM: "Warm the olive oil over medium, add the sliced garlic ...,
      // and cook about 1 minute" turned "cook" into "olive oil". Measured, the
      // unbounded version moved 22 of 96 catalogue labels, several like that;
      // bounded to a fronted condition it moves 4, all improvements.
      const first = whole.split(GIST_SPLIT_RE).map((x) => x.trim()).filter(Boolean)[0] || '';
      const frontedCondition = /^(?:until|while|once|as|after|before)\b/i.test(first)
        && bsStepIngredients(first, ingredients).length > 0;
      if (whole && (frontedCondition || !gistCandidate(leadClause, ingredients))) leadClause = whole;
    }
    // WHOSE action is the text before this clause's "and"/comma?
    //
    // An opening `until`/`while` usually completes the action that just ended
    // ("simmer 10 minutes until the carrots soften, boil the rice 8 minutes" --
    // the carrots are the SIMMER's). But the same words FRONTED onto a new
    // sentence introduce THIS action instead ("... 1 minute. Until the rice is
    // tender, continue simmering, about 10 minutes" -- the rice is this timer's).
    // The tell is a sentence boundary between the previous duration and here.
    //
    // ⚠ Neither splitting on commas nor ignoring them is right on its own. A
    // comma joins two timed actions in "until tender, rest 5 minutes" and joins
    // ONE action's fragments in "Until the rice is tender, continue simmering,
    // about 10 minutes" -- taking the fragment nearest the number reduced that
    // second one to "about" and produced an EMPTY label on prose naming the rice.
    const fronted = GIST_CLAUSE_RE.test(t.slice(from, mine.at));
    const carriesPrevAction = !fronted && /^(?:until|while)\b/i.test(leadClause);
    const leadBase = leadClause.split(reOf(SEQ + '|' + SUB)).pop();
    // Its completion condition ends at the next comma or "and"; what follows is
    // this timer's own action.
    const lead = carriesPrevAction ? leadBase.split(/\s+and\s+|,\s+/).pop() : leadBase;
    // TAIL: the food is often named AFTER the number ("roast 16-18 minutes until
    // the chicken hits 165F"), so it is kept -- but only as far as the next
    // action. `upto` is the next stated duration, so when it is the end of the
    // step there is no next action and a subordinate clause here is THIS
    // timer's own context, not a boundary.
    const more = upto < t.length;
    // ⚠ When another timed action follows, a COMMA ends this tail. Letting it run
    // to the sentence end made "Rest 10 minutes, toast the sesame oil 2 minutes"
    // hand the REST timer the sesame oil -- and the uniqueness set then withheld
    // that food from the timer it actually belongs to, so one wrong label
    // produced a second. With no following action the comma is just a fragment
    // break inside this timer's own context, so it is kept.
    const tail = (t.slice(mine.end, upto).split(more ? GIST_SPLIT_RE : GIST_CLAUSE_RE)[0] || '').split(reOf(more ? SEQ + '|' + SUB : SEQ))[0];
    own = [lead.trim(), tail.trim()].filter(Boolean).join(' ') || null;
  }
  // No usable span (no duration given, or the step opens on one) falls back to
  // the first clause stating a duration -- never an empty label.
  const timed = own || parts.find((p) => GIST_DUR_RE.test(p)) || parts[0];
  // 1. The ingredient that clause reaches for, in the recipe's own words.
  //
  // ⚠ NEAREST the number, never first-on-the-recipe's-list. bsStepIngredients
  // returns matches in RECIPE order, so taking [0] let the ingredient list
  // decide which timer got which food: "Bake the salmon 12 minutes while the
  // pearl couscous cooks 10 minutes" labelled the SALMON timer "pearl couscous"
  // purely because the couscous was listed first -- reordering the list moved
  // the label to a different timer, which is the proof it was never reading the
  // recipe's words at all.
  //
  // This is also why chasing boundary words was a losing game. Six rounds added
  // "then", and coaches still write "while", "before", "and", "meanwhile", "as",
  // "once". Distance to the stated duration needs to know none of them: whatever
  // joins two timed actions, each number's own food is the one written closest
  // to it.
  // `avoid` = labels already taken by EARLIER timers on this same step. Two rows
  // reading alike is the state this label exists to end, so a collision walks on
  // to the next candidate instead of repeating: the step's other foods in the
  // order it writes them, then its verbs. Absence ('') is the honest floor -- the
  // caller renders the duration rather than inventing a word.
  const taken = avoid instanceof Set ? avoid : null;
  const free = (v) => (v && (!taken || !taken.has(v)) ? v : null);
  const allNames = (Array.isArray(ingredients) ? ingredients : [])
    .map((ing) => (ing && typeof ing === 'object' ? str(ing.m) : str(ing)));
  const distinctive = ingDistinctiveWords(allNames);
  const named = bsStepIngredients(timed, ingredients)
    .map((ing) => ({ ing, p: ingPosition(ing, timed, distinctive) }))
    .sort((x, y) => x.p - y.p); // stable: ties keep recipe order
  for (const { ing } of named) {
    const nm = ing && typeof ing === 'object' ? str(ing.m) : str(ing);
    const short = free(nm ? ingShortName(nm) : '');
    if (short) return short;
  }
  // 2. Else the clause's own verb -- the first word that carries an action.
  const words = timed
    .replace(GIST_DUR_RE, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !GIST_SKIP.has(w));
  for (const w of words) if (free(w)) return w;
  return '';
};

// Every timer on ONE step, labelled together and guaranteed distinct.
//
// Uniqueness cannot be decided one timer at a time -- it is a property of the
// SET -- so this is the chokepoint the UI must call. Per-timer labelling shipped
// "Sear the pork chops 4 minutes then flip and sear 4 minutes more" as two
// identical rows, and three equal rests as "rest" three times over.
// Index-aligned with bsStepTimers(text).
export const bsStepGists = (text, ingredients) => {
  const t = str(text);
  if (!t) return [];
  const tms = bsStepTimers(t);
  const used = new Set();
  return tms.map((tm, i) => {
    const nth = tms.slice(0, i).filter((x) => x.seconds === tm.seconds).length;
    const g = bsStepGist(t, ingredients, tm.seconds, nth, used);
    if (g) used.add(g);
    return g;
  });
};

// Words that never identify an ingredient on their own — qualifiers, prep verbs
// and units. Dropped when reducing a name to its head noun.
const BS_ING_STOP = new Set([
  'fresh', 'dried', 'ground', 'lean', 'large', 'small', 'medium', 'chopped', 'minced',
  'sliced', 'diced', 'julienned', 'grated', 'shredded', 'whole', 'raw', 'ripe', 'optional',
  'plus', 'more', 'taste', 'the', 'and', 'for', 'extra', 'virgin', 'low', 'fat', 'free', 'light',
  'skinless', 'boneless', 'room', 'temperature', 'finely', 'roughly', 'thinly', 'toasted',
  'cooked', 'uncooked', 'peeled', 'halved', 'quartered', 'crushed', 'packed', 'divided',
]);
const BS_ING_MIN_TOKEN = 3;
// Category nouns SHARED by many ingredients. A multi-word name may never fall
// back to one of these as its head noun: "sesame oil" matching a step's "olive
// oil", or "soy sauce" matching "the pan sauce", tells the cook to reach for
// something the step never asked for.
// Words that are ACTIONS first and ingredient modifiers second. One of these may
// never stand ALONE for an ingredient, however unique it is on the recipe's list.
//
// ⚠ "Brown the chicken 3 minutes per side" with ['chicken thigh', 'brown
// lentils'] labelled that timer "brown lentils": `brown` was unique on the list
// so it became a lone alias, and text-order ranking then put the VERB ahead of
// the explicitly named chicken. The step's ingredient list showed the lentils
// too -- a food the step never touches, which reads as "fetch this" to a cook.
// The FULL phrase is unaffected, so "stir in the brown lentils" still resolves.
const BS_ING_ACTION = new Set([
  'brown', 'chill', 'cube', 'dice', 'grate', 'grill', 'halve', 'mash', 'mince',
  'quarter', 'roast', 'shred', 'slice', 'steam', 'toast', 'season', 'crush',
  'press', 'peel', 'core', 'trim', 'rest', 'cover', 'whip', 'beat', 'fold',
  'blend', 'chop', 'drain', 'rinse', 'spread', 'layer', 'boil', 'fry', 'melt',
  'warm', 'cool', 'heat', 'stir', 'pour', 'serve', 'sear', 'bake', 'cook',
]);

const BS_ING_GENERIC = new Set([
  'oil', 'sauce', 'vinegar', 'stock', 'broth', 'cheese', 'milk', 'flour', 'sugar', 'salt',
  'pepper', 'water', 'juice', 'powder', 'paste', 'butter', 'cream', 'syrup', 'wine', 'seeds',
  'nuts', 'herbs', 'spice', 'spices', 'blend', 'dressing', 'yogurt', 'yoghurt', 'extract',
]);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Which ingredients a content word could be pointing at. The matcher below
// tests /\b{tok}(?:e?s)?\b/, so a token ALSO fires on that word + s and + es —
// which means uniqueness has to be decided by the matcher's OWN rule. Counted
// raw, "olives" and "olive oil" look like two different words, so "olive"
// scores unique, becomes a lone alias for the OIL, and a step saying "olives"
// gets handed the bottle.
//
// ⚠ Do NOT swap this for a singularizer. Guessing English morphology is what
// fails: a stripper that correctly turns "glasses" into "glass" also turns
// "roses" into "ros" while "rose" stays "rose", so that pair silently stops
// folding and the false positive returns wearing a different word. Asking the
// matcher which words IT would conflate has no such blind spot, because it is
// the same rule the match runs on.
const ingOwners = (word, byWord) => {
  const out = new Set(byWord.get(word) || []);
  for (const v of [word + 's', word + 'es']) for (const i of byWord.get(v) || []) out.add(i);
  return out;
};

const ingBase = (name) => String(name)
  .toLowerCase()
  .replace(/\([^)]*\)/g, ' ')   // drop parentheticals
  .split(',')[0]                 // "garlic, minced" → "garlic"
  .replace(/[^a-z0-9\s-]/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const ingContent = (base) => base.split(' ').filter((w) => w.length >= BS_ING_MIN_TOKEN && !BS_ING_STOP.has(w));

// The phrases that may stand in for an ingredient inside a step's prose.
// `distinctive` is the set of single words that are safe to match alone in THIS
// recipe — decided per recipe by the caller, never here (see bsStepIngredients).
const ingMatchTokens = (name, distinctive) => {
  const base = ingBase(name);
  if (!base) return [];
  const content = ingContent(base);
  const out = new Set();
  if (base.length >= BS_ING_MIN_TOKEN) out.add(base);
  if (content.length >= 2) out.add(content.slice(-2).join(' '));
  if (content.length === 1 && !BS_ING_ACTION.has(content[0])) out.add(content[0]);
  // ⚠ Steps abbreviate: "Sear the chicken" never repeats "chicken thigh,
  // skin-on". Any content word the recipe uses in exactly ONE ingredient may
  // stand for it — head noun ("lettuce") or modifier ("chicken", "sesame") —
  // UNLESS the word is an action, which a step is far likelier to be using as a
  // verb than as a name (see BS_ING_ACTION).
  else for (const w of content) if (distinctive.has(w) && !BS_ING_ACTION.has(w)) out.add(w);
  return [...out].filter((tok) => tok.length >= BS_ING_MIN_TOKEN);
};

// The ingredients a step ACTUALLY names, so the method screen can show what this
// step needs instead of re-listing the whole cupboard under every instruction.
// The full list stays on the mise, which is where you shop the board.
//
// Matching is deliberately CONSERVATIVE and quote-based — word-boundary hits on
// the ingredient's own name, no stemming beyond a trailing plural, no fuzzy
// scoring. Under-matching is the safe direction: a step that lists nothing
// renders nothing (the cook reads the instruction, which names the food in
// prose), whereas a WRONG subset reads as "this is all I need" and is acted on.
// The words that may stand ALONE for exactly one ingredient in this recipe.
// Extracted so admission and RANKING read the same set -- see ingPosition.
const ingDistinctiveWords = (names) => {
  const byWord = new Map();
  names.forEach((n, i) => {
    if (!n) return;
    for (const w of new Set(ingContent(ingBase(n)))) {
      if (!byWord.has(w)) byWord.set(w, new Set());
      byWord.get(w).add(i);
    }
  });
  return new Set([...byWord.keys()].filter(
    (w) => !BS_ING_GENERIC.has(w) && ingOwners(w, byWord).size === 1,
  ));
};

export const bsStepIngredients = (step, ingredients) => {
  const text = str(step);
  const list = Array.isArray(ingredients) ? ingredients : [];
  if (!text || !list.length) return [];
  const nameOf = (ing) => (ing && typeof ing === 'object' ? str(ing.m) : str(ing));
  const names = list.map(nameOf);
  // A single word may stand for an ingredient only when it is unambiguous IN
  // THIS RECIPE. If two ingredients share it ("butter lettuce" + "romaine
  // lettuce") neither may claim it — the subset would name the wrong one with
  // total confidence. Category nouns ("oil", "sauce") are never distinctive
  // even when unique, because a step's "olive oil" is not the "sesame oil" on
  // the list. Ambiguity is resolved by refusing, not by guessing — the same
  // rule the timer parser applies to decimals.
  const distinctive = ingDistinctiveWords(names);
  return list.filter((ing, i) => {
    const name = names[i];
    if (!name) return false;
    return ingMatchTokens(name, distinctive).some((tok) => new RegExp(`\\b${escapeRe(tok)}(?:e?s)?\\b`, 'i').test(text));
  });
};

// ---------------------------------------------------------------------------
// Coach step authoring (PR E) — ONE derivation for a structured method step.
// The window's `min` is NEVER typed by the coach: it derives from the step's
// own stated duration (the catalog overlay's no-fabrication rule, applied at
// the source), so authored metadata and text can't drift. A station with no
// stated duration ≥ 4 min honestly downgrades to a plain step — the editor
// shows the hint, nothing is fabricated.
const BS_AUTHOR_MIN_PASSIVE = 4; // keep in sync with BS_ORCH.minPassive (cookOrchestrator.mjs)
// A fractional number ANYWHERE in the step refuses window authoring. The
// integer timer parser mis-reads decimals in too many arrangements to
// enumerate — "1.5 minutes" → "5 minutes", "1,5 Minuten" the same, and range
// forms evade unit-adjacent guards both ways ("1.5–2 minutes" parses "5–2",
// "1–1.5 minutes" parses "5 minutes"; Codex + CodeRabbit, three rounds of the
// same family). Deliberately conservative: a legit non-duration decimal
// ("add 1.5 cups…, simmer 15 minutes") also refuses — a false refusal shows
// the editor hint and the coach restates; a false window fabricates a hold on
// a client's board. Never fabricate wins.
const BS_AUTHOR_FRACTIONAL_RE = /\d[.,]\d/;
// Shared with the DISPLAY side (Codex): a step whose text carries a decimal
// must not offer parser-derived timer chips either — the same mis-parse that
// would fabricate an authored window fabricates a wrong countdown ("sear 1.5
// minutes" → a 5-min chip). One rule, both sides: any decimal → no derived
// timers; the cook reads the time from the step text itself.
export const bsFractionalDuration = (text) => BS_AUTHOR_FRACTIONAL_RE.test(str(text) || '');
export const bsAuthorStep = (text, station) => {
  const t = str(text);
  if (!t) return null;
  if (!BS_STATIONS.includes(station)) return { t };
  if (BS_AUTHOR_FRACTIONAL_RE.test(t)) return { t };
  const first = bsStepTimers(t)[0];
  // Floor on RAW SECONDS — Math.round(210/60) is 4, which would sneak a
  // 3.5-minute step over the 4-minute window floor (CodeRabbit).
  if (!first || first.seconds < BS_AUTHOR_MIN_PASSIVE * 60) return { t };
  return { t, min: Math.round(first.seconds / 60), passive: true, station };
};

// ---------------------------------------------------------------------------
// Adapters

const finishCookable = (c) => {
  // stepMeta is always index-aligned with steps — a caller that set it from
  // splitSteps carries it through; anything else (prose splits, a mapped base
  // that reshaped steps) gets a fresh plain-meta per step. Never longer/shorter
  // than steps, so board/orchestrator reads can index either array safely.
  const supplied = Array.isArray(c.stepMeta) ? c.stepMeta : [];
  c.stepMeta = c.steps.map((_, i) => supplied[i] || plainStepMeta());
  // A TERMINAL window must be walk-away ('off'): the board's wrap treats
  // leftover holds as unattended make-aheads (the round-7 ruling), so a
  // live-fire final hold would lose its countdown at Finish. Catalog-tested
  // for the Kitchen; enforced STRUCTURALLY here for authored sources (coach
  // meal methods, PR E — CodeRabbit): the window drops to a plain step, the
  // honest text stays, nothing fabricates a walk-away.
  const lastMeta = c.stepMeta[c.steps.length - 1];
  if (lastMeta && lastMeta.passive === true && lastMeta.station != null && lastMeta.station !== 'off') {
    c.stepMeta[c.steps.length - 1] = plainStepMeta();
  }
  if (c.steps.length > 0) c.tier = c.fromPlan ? BS_COOK_TIERS.PROSE : BS_COOK_TIERS.STEPS;
  else if (c.ingredients.length > 0) c.tier = BS_COOK_TIERS.MISE;
  else c.tier = BS_COOK_TIERS.QUICK;
  return c;
};

// Catalog recipe: { title, servings, kcal, macros:{p,c,f}, ingredients, steps,
// tip, time, prep, by, byRole } (shapeKitchenData.js).
export const bsCookableFromRecipe = (recipe) => {
  if (typeof recipe !== 'object' || recipe === null) return null;
  const title = str(recipe.title);
  if (!title) return null;
  const macros = recipe.macros && typeof recipe.macros === 'object' ? recipe.macros : {};
  const { text: steps, meta: inlineMeta } = splitSteps(recipe.steps);
  // A recipe may carry an explicit parallel `stepMeta` array (the catalog's
  // hand-curated passive-window overlay — steps stay plain strings). It wins
  // per-index over the inline meta; a null/invalid overlay entry falls back.
  // The overlay is authored parallel to the RAW steps, but splitSteps compacts
  // (drops empty/attacker-shaped entries) — so apply it only when nothing
  // dropped, or a future empty catalog step could shift it off its step (audit).
  const rawLen = Array.isArray(recipe.steps) ? recipe.steps.length : 0;
  const overlay = Array.isArray(recipe.stepMeta) && steps.length === rawLen ? recipe.stepMeta : null;
  const stepMeta = overlay ? steps.map((_, i) => sanitizeMeta(overlay[i]) || inlineMeta[i]) : inlineMeta;
  return finishCookable({
    title,
    sourceKind: 'recipe',
    servings: num(recipe.servings),
    macros: { kcal: num(recipe.kcal), p: num(macros.p), c: num(macros.c), f: num(macros.f) },
    ingredients: normalizeIngredients(recipe.ingredients),
    steps,
    stepMeta,
    fromPlan: false,
    coach: str(recipe.by) ? { name: str(recipe.by), role: str(recipe.byRole) || '' } : null,
    tip: str(recipe.tip),
    timeLabel: str(recipe.time),
    prepNote: str(recipe.prep),
    recipeTitle: title,
  });
};

// Plan/preview meal: { title, kcal, p, c, f, ingredients?, steps?, recipeId?,
// coach?, brief?/hero?, prep? } (BSMealPreview's contract). When the meal maps
// to a catalog recipe (recipeId slug or exact title), the recipe's method +
// ingredients carry the walkthrough while the MEAL's macros stay the logged
// truth (the plan's numbers are what "Ate as planned" writes).
export const bsCookableFromMeal = (meal, recipes) => {
  if (typeof meal !== 'object' || meal === null) return null;
  const title = str(meal.title);
  if (!title) return null;

  const list = Array.isArray(recipes) ? recipes : [];
  const wantId = str(meal.recipeId);
  const slug = bsCookSlug(title);
  const mapped = list.find((r) => {
    const rSlug = bsCookSlug(r && r.title);
    if (!rSlug) return false;
    if (wantId) return rSlug === bsCookSlug(wantId) || str(r.title) === wantId;
    return rSlug === slug;
  });

  const base = mapped ? bsCookableFromRecipe(mapped) : null;
  const mealMacros = { kcal: num(meal.kcal), p: num(meal.p), c: num(meal.c), f: num(meal.f) };
  const coach = str(meal.coach) ? { name: str(meal.coach), role: 'Nutritionist' } : null;

  // Authored steps on the meal ITSELF outrank a title-coincidence catalog map
  // (PR E): the coach wrote this method for THIS meal. The catalog base still
  // serves step-less meals (the PR A mapping design) — and we never mix the
  // two sources (catalog ingredients under coach steps could contradict).
  const authored = splitSteps(meal.steps);

  if (base && authored.text.length === 0) {
    return finishCookable({
      ...base,
      title,
      sourceKind: 'meal',
      // The plan's macros are the billing truth of the plate — never the
      // recipe's, which may be portioned differently.
      macros: mealMacros,
      coach: coach || base.coach,
      mealId: str(meal.id != null ? String(meal.id) : null),
      recipeTitle: base.recipeTitle,
    });
  }

  let { text: steps, meta: stepMeta } = authored;
  let fromPlan = false;
  if (steps.length === 0) {
    const prose = bsSplitMethodProse([str(meal.brief), str(meal.desc), str(meal.method)].filter(Boolean).join(' '));
    if (prose) { steps = prose; stepMeta = null; fromPlan = true; } // prose is plain text → finishCookable derives plain meta
  }
  return finishCookable({
    title,
    sourceKind: 'meal',
    servings: null,
    macros: mealMacros,
    ingredients: normalizeIngredients(meal.ingredients),
    steps,
    stepMeta,
    fromPlan,
    coach,
    tip: null,
    timeLabel: str(meal.prep),
    prepNote: null,
    mealId: str(meal.id != null ? String(meal.id) : null),
    recipeTitle: null,
  });
};

// Generic text adapter — the seam future creation surfaces (coach_plans
// single dishes, AI-created recipes) call with whatever they honestly have.
export const bsCookableFromText = ({ title, text, ingredients, macros, coach } = {}) => {
  const t = str(title);
  if (!t) return null;
  const prose = bsSplitMethodProse(text);
  const mm = macros && typeof macros === 'object' ? macros : {};
  return finishCookable({
    title: t,
    sourceKind: 'text',
    servings: null,
    macros: { kcal: num(mm.kcal), p: num(mm.p), c: num(mm.c), f: num(mm.f) },
    ingredients: normalizeIngredients(ingredients),
    steps: prose || [],
    fromPlan: !!prose,
    coach: coach && str(coach.name) ? { name: str(coach.name), role: str(coach.role) || '' } : null,
    tip: null,
    timeLabel: null,
    prepNote: null,
    recipeTitle: null,
  });
};

// The dispatch: recipes carry a macros OBJECT, meals carry flat p/c/f.
export const bsCookable = (source, opts = {}) => {
  if (typeof source !== 'object' || source === null) return null;
  if (source.macros && typeof source.macros === 'object' && Array.isArray(source.steps)) {
    return bsCookableFromRecipe(source);
  }
  return bsCookableFromMeal(source, opts.recipes);
};
