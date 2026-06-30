// Pure merge for community_posts.metrics on edit. The edit composer sends only
// the keys it changed; everything else (workoutStats, coach, program, delta,
// mentions, kind) must survive. A key whose patch value is '' or null is a
// REMOVAL (used to clear video_url / link when the author drops the media).
export function mergePostPatch(existingMetrics, patch) {
  const out = { ...(existingMetrics && typeof existingMetrics === 'object' ? existingMetrics : {}) };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v === '' || v === null || v === undefined) delete out[k];
    else out[k] = v;
  }
  return out;
}
