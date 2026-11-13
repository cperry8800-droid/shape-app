// Which how-to clip an exercise module shows in the live session (owner, 2026-11-13: "all of these
// need to have videos of each exercise listed above each set so users can get a visual of the
// exercise", "coaches can use stock or custom videos", "show the videos on the workout exercise
// modules in all 3 views").
//
// ONE ORDER: the coach's own clip on the plan's move (`move.video`, attached with ＋ CLIP or the
// workout builder), else the stock clip the catalog keeps for that move (`exercise_catalog.demo_url`,
// read through window.ShapeExerciseDemos), else none. A coach's clip always wins, so a coach who
// filmed their own cue is never overruled by the library.
//
// ⚠ A STOCK CLIP IS FOUND BY THE MOVE'S EXACT NAME OR ONE OF ITS ALIASES, NEVER A NEAR MATCH. The
// catalog's aliases name the same movement only (2026-10-07-exercise-catalog.sql), so "RDL" finds
// Romanian deadlift; a fuzzy match would put a squat's clip on a split squat, and a wrong demo
// teaches the wrong movement. No match shows no clip.
//
// ⚠ ONLY https REACHES THE STOCK INDEX (the table's own check, held again here); a coach's clip keeps
// the http(s) rule the session always applied to it. Either way the frame resolves the URL through
// ShapeVideo.resolve, which never iframes an arbitrary page.

// A move's name as the index keys it: case, accents and punctuation folded away ("Push-up",
// "push up" and "PUSH-UP" are one key).
export function demoKey(name) {
  return String(name ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// The catalog's rows with a clip, as name/alias → clip. Names are indexed before any alias, so an
// alias can never take a key another move's own name holds.
export function stockDemoIndex(rows) {
  const index = new Map();
  const list = (Array.isArray(rows) ? rows : []).map((r) => ({
    url: r && typeof r.demo_url === 'string' ? r.demo_url.trim() : '',
    name: r && r.name,
    aliases: r && Array.isArray(r.aliases) ? r.aliases : [],
  })).filter((r) => /^https:\/\/\S+$/i.test(r.url));
  const put = (name, url) => { const k = demoKey(name); if (k && !index.has(k)) index.set(k, url); };
  for (const r of list) put(r.name, r.url);
  for (const r of list) for (const a of r.aliases) put(a, r.url);
  return index;
}

// The coach's clip on a move, as the plan carries it: a URL, or a saved clip `{ url, name }`.
export function customDemoUrl(move) {
  const v = move && move.video;
  const url = typeof v === 'string' ? v.trim() : (v && typeof v.url === 'string' ? v.url.trim() : '');
  return /^https?:\/\/\S+$/i.test(url) ? url : '';
}

// The clip a move's module shows: `{ url, source: 'custom' | 'stock' }`, or null.
export function exerciseDemo(move, index) {
  const own = customDemoUrl(move);
  if (own) return { url: own, source: 'custom' };
  const stock = index && typeof index.get === 'function' ? index.get(demoKey(move && move.m)) : undefined;
  return stock ? { url: stock, source: 'stock' } : null;
}
