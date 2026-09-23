// Settings pref options — the stable token, the English label, and the ONE
// cut/build/maintain classifier.
//
// ⚠ WHY THIS MODULE EXISTS. The eight `options:` rows in Settings →
// Nutrition/Training were raw English array literals: rendered as chips,
// SELECTED by an equality comparison against the rendered string, and STORED
// RAW into `client_nutrition_prefs` / `client_training_prefs`. One of them —
// `primary_goal` — is then classified into cut/build/maintain and read on two
// member surfaces plus a server route. So the string was doing double duty as
// copy AND as the identifier something parses: translate the picker and the
// classification breaks in twelve locales at once. Same class as the Train
// tag, the grocery aisle, the integrations provider name and the primary goal
// — a token the member never sees, a label they always do.
//
// ⚠ FREE TEXT IS A FIRST-CLASS VALUE HERE, WHICH IS WHY THE HELPERS PASS IT
// THROUGH RATHER THAN REFUSING IT. The pref editor is a picker AND a text
// field at once — both bound to the same value — so a member can type
// anything. An unrecognised value is returned unchanged by both helpers and
// classified by the English regexes below; only a value that matches a shipped
// option becomes a token.
//
// ⚠ THE TRANSLATOR IS INJECTED, NEVER IMPORTED. This module is imported by a
// Next server route as well as the client bundle, so it cannot hold a hook. Each
// display helper takes `tr` as its LAST argument and falls back to this table's
// English when it is absent — so the pure vectors, and the server route, keep
// working with no translator at all. Same shape as `bsGoalVerdict` and
// `bsPrimaryGoalLabel`.
//
// ⚠ EVERY KEY CARRIES THIS TABLE'S ENGLISH AS ITS defaultValue, AND EVERY KEY IS
// ALSO AUTHORED IN `en`. Both are needed and they close different holes. The
// defaultValue is what renders if a catalog fails to load. The authored `en` key
// is what the parity gate can see: that gate compares the twelve locales AGAINST
// `en`, so a key absent from `en` is absent everywhere and parity is satisfied —
// the silent half that let fifteen `marketplace:preview.*` keys ship unauthored.
// `tests/pref-options-i18n.test.mjs` DERIVES the expected key set from this table
// and fails if any of them is missing or has drifted from the English here.

/**
 * The eight option rows, as { id, en }. `id` is stored; `en` is displayed.
 * KEEP IN SYNC with the row lists in BSSettings — a row whose `options` are
 * not sourced from here is a row that can drift back to storing copy.
 *
 * ⚠ `sessions_per_week` keeps bare numerals as its ids. They are the same
 * string in every locale, so a token would add indirection for nothing.
 */
export const BS_PREF_OPTIONS = {
  dietary_style: [
    { id: 'omnivore', en: 'Omnivore' },
    { id: 'vegetarian', en: 'Vegetarian' },
    { id: 'vegan', en: 'Vegan' },
    { id: 'pescatarian', en: 'Pescatarian' },
    { id: 'keto', en: 'Keto' },
    { id: 'paleo', en: 'Paleo' },
    { id: 'mediterranean', en: 'Mediterranean' },
  ],
  calorie_range: [
    { id: 'by_feel', en: 'By feel' },
    { id: 'strict', en: 'Strict' },
    { id: 'loose', en: 'Loose tracking' },
    { id: 'r1600_1800', en: '1600–1800' },
    { id: 'r1800_2000', en: '1800–2000' },
    { id: 'r2000_2200', en: '2000–2200' },
    { id: 'r2200_2400', en: '2200–2400' },
    { id: 'r2400_plus', en: '2400+' },
  ],
  alcohol: [
    { id: 'none', en: 'None' },
    { id: 'rare', en: 'Rare' },
    { id: 'social', en: 'Social' },
    { id: 'weekly', en: 'Weekly' },
    { id: 'daily', en: 'Daily' },
  ],
  primary_goal: [
    { id: 'strength', en: 'Strength' },
    { id: 'hypertrophy', en: 'Hypertrophy' },
    { id: 'strength_hypertrophy', en: 'Strength + hypertrophy' },
    { id: 'endurance', en: 'Endurance' },
    { id: 'fat_loss', en: 'Fat loss' },
    { id: 'general_health', en: 'General health' },
  ],
  experience: [
    { id: 'beginner', en: 'Beginner' },
    { id: 'novice', en: 'Novice' },
    { id: 'intermediate', en: 'Intermediate' },
    { id: 'advanced', en: 'Advanced' },
    { id: 'elite', en: 'Elite' },
  ],
  sessions_per_week: [
    { id: '2', en: '2' },
    { id: '3', en: '3' },
    { id: '4', en: '4' },
    { id: '5', en: '5' },
    { id: '6', en: '6' },
  ],
  equipment: [
    { id: 'full_gym', en: 'Full gym' },
    { id: 'home_gym', en: 'Home gym' },
    { id: 'bodyweight', en: 'Bodyweight only' },
    { id: 'limited', en: 'Limited (bands + DBs)' },
    { id: 'full_gym_home_db', en: 'Full gym + home DBs' },
  ],
  preferred_times: [
    { id: 'early_morning', en: 'Early morning' },
    { id: 'mornings', en: 'Mornings' },
    { id: 'midday', en: 'Midday' },
    { id: 'evenings', en: 'Evenings' },
    { id: 'late_evenings', en: 'Late evenings' },
    { id: 'variable', en: 'Variable' },
  ],
};

/**
 * Rows whose options are NOT translated, and why.
 *
 * ⚠ `sessions_per_week`'s ids ARE its English ("2".."6"), so a key could only
 * ever carry the same digit back. Single digits take no thousands separator in
 * any locale, so there is nothing a translator could change. The calorie RANGES
 * are keyed for the opposite reason: four-digit numbers DO group differently
 * (de "1.600", fr/ru "1 600"), so regrouping them is a translator's call even
 * though the shipped values start identical to English.
 *
 * A row added later is keyed by DEFAULT — the guard fails on a missing key
 * rather than letting an unkeyed row ship English in twelve locales.
 */
export const BS_PREF_UNKEYED_ROWS = ['sessions_per_week'];

/** The catalog key for one option, derived — never hand-mapped. */
export function bsPrefOptionKey(rowKey, id) {
  return `settings:pref.${rowKey}.${id}`;
}

function labelOf(rowKey, opt, tr) {
  if (typeof tr !== 'function' || BS_PREF_UNKEYED_ROWS.includes(rowKey)) return opt.en;
  try {
    const out = tr(bsPrefOptionKey(rowKey, opt.id), { defaultValue: opt.en });
    // A catalog that returns the raw key, an authored empty value, or a
    // non-string still has to read as English — the `returnEmptyString: false`
    // trap puts the raw key on screen otherwise.
    return typeof out === 'string' && out && out !== bsPrefOptionKey(rowKey, opt.id) ? out : opt.en;
  } catch {
    return opt.en;
  }
}

/**
 * Case-insensitive comparison that survives Turkish.
 *
 * ⚠ `toLowerCase()` IS LOCALE-INSENSITIVE AND TURKISH BREAKS IT. `'Sıkı'`
 * upper-cases to `SIKI`, which lower-cases back to `siki` — not `sıkı` — so a
 * Turkish member who typed the option in caps fell out of the match and their
 * pick was stored as free text. The dotted/dotless-i class this repo has now
 * paid for five times. Folding the whole i-family (İ ı I i) to one letter fixes
 * it with no locale to thread through a module the server also imports; a row
 * whose options differ ONLY by that distinction would collide, and the guard
 * asserts every option still maps back to its own id in all thirteen locales.
 */
function fold(v) {
  return String(v == null ? '' : v).trim().replace(/[\u0130\u0131\u0049\u0069]/g, 'i').toLowerCase();
}

function rowsFor(rowKey) {
  const rows = BS_PREF_OPTIONS[String(rowKey == null ? '' : rowKey)];
  return Array.isArray(rows) ? rows : null;
}

/**
 * The string a member reads. A shipped option renders its label; anything else
 * — free text, or a value from a row with no options — is returned unchanged.
 * Never a raw token on screen, never a blank for a value that exists.
 */
export function bsPrefOptionLabel(rowKey, value, tr) {
  const v = String(value == null ? '' : value).trim();
  if (!v) return '';
  const rows = rowsFor(rowKey);
  if (!rows) return v;
  const hit = rows.find((o) => o.id === v);
  return hit ? labelOf(rowKey, hit, tr) : v;
}

/**
 * What the editor's text field shows. Converts ONLY an exact known id to its
 * label and returns every other value byte-for-byte — no trim, no coercion —
 * because this runs on each keystroke and `bsPrefOptionLabel`'s trim would eat
 * a space the member is still typing.
 */
export function bsPrefOptionDisplay(rowKey, value, tr) {
  const rows = rowsFor(rowKey);
  if (!rows) return value == null ? '' : value;
  const hit = rows.find((o) => o.id === value);
  return hit ? labelOf(rowKey, hit, tr) : (value == null ? '' : value);
}

/**
 * The value that gets stored. A token stays a token; a legacy English value
 * (every row on disk today carries one) maps to its token; free text passes
 * through unchanged. The English match is case- and whitespace-insensitive so
 * a member who types the option by hand still lands on the token.
 */
export function bsPrefOptionToken(rowKey, stored, tr) {
  const s = String(stored == null ? '' : stored).trim();
  if (!s) return '';
  const rows = rowsFor(rowKey);
  if (!rows) return s;
  if (rows.some((o) => o.id === s)) return s;
  const lower = fold(s);
  const hit = rows.find((o) => fold(o.en) === lower);
  if (hit) return hit.id;
  // ⚠ THE CURRENT LOCALE'S LABELS MAP BACK TOO, OR THE ROUND-TRIP BREAKS IN
  // TWELVE LOCALES. The editor is a picker AND a text field bound to the same
  // value: it SHOWS the translated label, so a member who retypes what is on
  // screen would otherwise store that sentence as free text and drop out of
  // every comparison. Checked after English so a locale can never shadow it.
  if (typeof tr === 'function') {
    const back = rows.find((o) => fold(labelOf(rowKey, o, tr)) === lower);
    if (back) return back.id;
  }
  return s;
}

/**
 * What a stored `primary_goal` means. Tokens decide first; free text falls back
 * to the English regexes the three readers have always used.
 *
 * ⚠ THE REGEX FALLBACK CANNOT BE DROPPED, AND A TOKEN CANNOT BE FED TO IT.
 * `fat_loss` does not match /fat ?loss/ — the underscore is not a space — so a
 * reader that kept only the regex would silently reclassify every member the
 * moment the picker started storing tokens. That is the whole trap this split
 * exists to disarm.
 *
 * ⚠ THE PATTERNS ARE THE UNION OF THE THREE READERS' OWN. Two of them tested
 * `hypertroph|strength` and the third tested `deficit|surplus`; merging keeps
 * every phrase any of them ever honoured and loses none.
 *
 * ⚠ CUT IS TESTED BEFORE BUILD, per value and then across the pair, because
 * that is the order all three readers used on their combined string. A member
 * whose two fields say "fat loss" and "strength" reads cut, as they always did.
 */
const GOAL_KIND = {
  fat_loss: 'cut',
  strength: 'build',
  hypertrophy: 'build',
  strength_hypertrophy: 'build',
  endurance: 'maintain',
  general_health: 'maintain',
};
const CUT_RE = /fat ?loss|cut|lean|weight ?loss|shred|deficit/;
const BUILD_RE = /hypertroph|build|bulk|mass|muscle|strength|gain|surplus/;

export function bsGoalKind(nutritionGoal, trainingGoal) {
  const vals = [nutritionGoal, trainingGoal]
    .map((v) => String(v == null ? '' : v).trim())
    .filter(Boolean);
  const kinds = vals.map((v) => {
    // No translator here, deliberately: a STORED goal is a token or legacy
    // English, never a translated label, and this runs on the server too.
    const known = GOAL_KIND[bsPrefOptionToken('primary_goal', v)];
    if (known) return known;
    const s = fold(v);
    if (CUT_RE.test(s)) return 'cut';
    if (BUILD_RE.test(s)) return 'build';
    return 'maintain';
  });
  if (kinds.includes('cut')) return 'cut';
  if (kinds.includes('build')) return 'build';
  // A phrase split across the two fields ("fat" + "loss") matched the old
  // combined-string read and matches nothing per value; keep the combined pass
  // so nothing a member already stored changes meaning.
  const raw = fold(vals.join(' '));
  if (CUT_RE.test(raw)) return 'cut';
  if (BUILD_RE.test(raw)) return 'build';
  return 'maintain';
}
