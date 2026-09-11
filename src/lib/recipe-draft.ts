// The shared half of member recipe import: the rules the model is bound by, the
// validator its output must survive, and the reader that gets text back out of a
// Responses API envelope.
//
// ⚠ WHY THIS IS SHARED RATHER THAN COPIED. Two routes now turn member input into
// a recipe draft — /api/nutrition/recipe-parse (pasted text) and
// /api/nutrition/recipe-photo (a photograph). They differ ONLY in what they hand
// the model; everything after that must be identical, because the thing they
// produce is written to the same store and cooked by the same walkthrough. This
// file already post-mortems having three line-for-line copies of one store; a
// second copy of the no-step-metadata rule would be the same mistake with a new
// name, and the copy that drifts is the one nobody is testing.

// The binding rules, shared verbatim by both prompts. Rule 5 is not cosmetic:
// `passive` + a station + a duration is how a step earns an interleave window on
// the prep board, and an imported recipe may never have one (cookOrchestrator's
// binding "no fabricated parallelism"). The cookable wrapper drops that metadata
// too — this is the belt, and the wrapper is the braces.
const RULES = [
  'Rules, all binding:',
  '1. Carry the source\'s OWN words for each step. Do not reword, merge, summarise or add flourish.',
  '2. Never invent a quantity. If an ingredient states no amount, use "" for n.',
  '3. Never invent a step, an ingredient, a serving count or a title.',
  // ⚠ THE UNIT BELONGS IN `n`, WITH THE NUMBER. Measured on the Shape Kitchen
  // catalog, 767 of its 903 ingredient amounts are written that way ("3/4 cup",
  // "6 oz", "2 cloves") — 108 of its 120 distinct amounts — and bsScaleQty reads
  // the unit back out of that field, so a unitless `n` scales to a unitless
  // quantity and the member's mise loses its units entirely. The first version
  // of this rule used "1/2 cup" -> "1/2" to mean "do not convert the fraction",
  // and taught exactly the wrong lesson.
  '4. Emit ingredients as {"n": amount INCLUDING its unit, "m": the ingredient name}.',
  '   "1/2 cup flour" is {"n": "1/2 cup", "m": "flour"} — the unit goes in n, never in m.',
  '   Keep the amount as written: "1/2 cup", never "0.5 cup". An amount with no unit is fine ("2" eggs).',
  '5. Steps are plain strings. Never emit timing, station or passive/hands-off metadata of any kind.',
].join('\n');

const SHAPE_LINE =
  'Return ONLY JSON: {"title": string, "servings": number|null, "ingredients": [{"n": string, "m": string}], "steps": [string]}';

export const RECIPE_SYSTEM_TEXT = [
  'You extract a recipe from pasted text into JSON. You are a parser, not an author.',
  RULES,
  '6. If the text is not a recipe, return empty arrays rather than guessing.',
  SHAPE_LINE,
].join('\n');

// ⚠ THE PHOTO PROMPT ADDS TRANSCRIPTION RULES AND NOTHING ELSE. A model reading a
// cookbook page is doing OCR plus structure, and the two failure modes a member
// cannot detect on the review screen are a misread digit and a confidently
// invented line for text that was cut off, blurred or in shadow. Both are worse
// than a gap: a gap is visible, a wrong quantity looks finished. Rule 3 already
// forbids invention; 6 and 7 aim it at the cases a photograph creates.
export const RECIPE_SYSTEM_PHOTO = [
  'You transcribe a recipe from a PHOTOGRAPH into JSON. You are a transcriber, not an author.',
  RULES,
  '6. Transcribe only what is legible. If a word, amount or line is cut off, blurred, obscured or',
  '   you are unsure of it, OMIT that row or step entirely rather than guessing at it.',
  '   A missing line is recoverable by the reader; a confidently wrong quantity is not.',
  '7. If the image is not a recipe — a menu, a photograph of food, a screenshot of something else —',
  '   return empty arrays rather than describing what you see.',
  SHAPE_LINE,
].join('\n');

export type RecipeDraft = {
  title: string;
  servings: number | null;
  ingredients: { n: string; m: string }[];
  steps: string[];
};

// The model's output becomes DATA, so it goes through a hand-written validator
// after parseModelJson — never straight to the record.
export function shapeRecipeDraft(raw: unknown): RecipeDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const s = (v: unknown, max: number): string =>
    typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
  const ings: { n: string; m: string }[] = [];
  if (Array.isArray(o.ingredients)) {
    for (const g of o.ingredients.slice(0, 120)) {
      if (!g || typeof g !== 'object') continue;
      const row = g as Record<string, unknown>;
      const m = s(row.m, 200);
      if (!m) continue;
      ings.push({ n: s(row.n, 60), m });
    }
  }
  const steps: string[] = [];
  if (Array.isArray(o.steps)) {
    for (const st of o.steps.slice(0, 80)) {
      // A structured step is dropped to its text — the route never passes
      // min/passive/station through, whatever the model emitted.
      const t = typeof st === 'object' && st !== null ? s((st as Record<string, unknown>).t, 1200) : s(st, 1200);
      if (t) steps.push(t);
    }
  }
  const servRaw = typeof o.servings === 'number' && Number.isFinite(o.servings) ? Math.floor(o.servings) : null;
  return {
    title: s(o.title, 160),
    servings: servRaw !== null && servRaw > 0 && servRaw <= 99 ? servRaw : null,
    ingredients: ings,
    steps,
  };
}

// The Responses API returns the text in output_text; fall back to walking the
// content blocks rather than assuming a shape. Models fence JSON often enough
// that not stripping it is a self-inflicted parse failure.
export function readModelText(data: unknown): string {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  let out = typeof d.output_text === 'string' ? d.output_text : '';
  if (!out && Array.isArray(d.output)) {
    for (const blk of d.output as Record<string, unknown>[]) {
      const content = blk && Array.isArray(blk.content) ? (blk.content as Record<string, unknown>[]) : [];
      for (const c of content) if (typeof c.text === 'string') out += c.text;
    }
  }
  const fenced = out.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1] : out;
}

// ── the image a photo import may send ───────────────────────────────────────

// Decoded bytes, not the base64 string. readJson's own 1 MB body limit is the
// outer bound on the route path; this is the inner one, so an oversized image is
// named as an oversized IMAGE rather than surfacing as a generic 413 the member
// cannot act on.
export const MAX_IMAGE_BYTES = 700_000;

// ⚠ AN ALLOW-LIST OF WHAT THE PROVIDER ACCEPTS, NOT WHAT A PHONE EMITS. The mime
// is echoed straight into the data URL handed to the provider, so an
// unconstrained value is attacker-controlled text in an outbound request — and
// admitting a type the next hop refuses (image/heic, which iPhones produce and
// the provider does not take) guarantees a 400 that the route can only report as
// "we couldn't read your photo" while its log blames the model. An allow-list
// that admits what the next hop refuses is worse than one that refuses it here,
// because only one of the two can say why. The app re-encodes every pick to JPEG
// through a canvas, so this bound is for every other caller.
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

// 100 decoded bytes is ~136 base64 characters; 140 is the same floor with no
// allocation.
const MIN_B64_CHARS = 140;

export type ParsedImage =
  | { ok: true; dataUrl: string; bytes: number; mime: string }
  | { ok: false; reason: 'no_image' | 'bad_image' | 'unsupported_type' | 'too_large' };

// ⚠ THIS LIVES HERE RATHER THAN IN THE ROUTE, AND THAT IS NOT TIDYING. An App
// Router route file exporting anything outside the handler set is a build error
// under the webpack typegen path (`checkFields<Diff<…>>`), and this was the only
// route in the repo doing it — exported purely so a test could reach it. Beside
// the validator it is reachable without standing up the route and its five stubs.
//
// ⚠ AND NOTHING HERE DECODES THE IMAGE. An earlier draft ran Buffer.from purely
// to check the decoded length and then threw the buffer away — up to 700 KB of
// per-invocation garbage on the hot path of the feature's only request, since
// the provider is sent the base64 string this function was handed, never the
// buffer. The regex has already constrained the payload to base64 characters, so
// the length math is exact enough for both bounds.
export function parseImageDataUrl(raw: unknown): ParsedImage {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, reason: 'no_image' };
  const m = raw.match(/^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!m) return { ok: false, reason: 'bad_image' };
  const mime = m[1].toLowerCase();
  if (!ALLOWED_MIME.has(mime)) return { ok: false, reason: 'unsupported_type' };
  const b64 = m[2].replace(/\s+/g, '');
  if (b64.length < MIN_B64_CHARS) return { ok: false, reason: 'bad_image' };
  // Exact, not an estimate: every 4 base64 characters are 3 bytes LESS one per
  // '=' of padding. Dropping the padding term overstates the size by up to 2
  // bytes, which changes no decision here — but `bytes` is returned under that
  // name, and a field that says bytes should be the number of bytes.
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  const bytes = Math.floor((b64.length * 3) / 4) - pad;
  if (bytes > MAX_IMAGE_BYTES) return { ok: false, reason: 'too_large' };
  return { ok: true, dataUrl: `data:${mime};base64,${b64}`, bytes, mime };
}
