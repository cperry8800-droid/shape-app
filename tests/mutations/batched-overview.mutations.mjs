// Mutation spec for the batched roster read (2026-09-30).
// Run: node scripts/mutate.mjs --spec tests/mutations/batched-overview.mutations.mjs
export default {
  test: 'node --test tests/shared-overview-batch.test.mjs tests/dash-batch-read.test.mjs tests/website-navigation-performance.test.mjs',
  mutations: [
    // ── the route ──────────────────────────────────────────────────────────────
    { name: 'a failed client ships as an empty overview instead of being named', file: 'src/app/api/clients/shared-overview/route.ts',
      find: '        failed.push(id);\n', replace: '        results[id] = {};\n        failed.push(id);\n' },
    { name: 'auth check removed from the batch route', file: 'src/app/api/clients/shared-overview/route.ts',
      find: "  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });\n\n  const parsed", replace: "  if (!user && false) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });\n\n  const parsed" },
    { name: 'validation result ignored', file: 'src/app/api/clients/shared-overview/route.ts',
      find: '  if (!wanted.ok) return NextResponse.json({ error: wanted.error }, { status: 400 });\n', replace: '  if (!wanted.ok) return NextResponse.json({ me: null, results: {}, failed: [] });\n' },
    // ── the library ────────────────────────────────────────────────────────────
    { name: 'the cap is raised tenfold', file: 'src/lib/shared-overview.ts',
      find: 'export const BATCH_MAX_IDS = 50;', replace: 'export const BATCH_MAX_IDS = 500;' },
    { name: 'duplicate ids are not collapsed', file: 'src/lib/shared-overview.ts',
      find: '    if (!ids.includes(id)) ids.push(id);', replace: '    ids.push(id);' },
    { name: 'a non-UUID id is accepted', file: 'src/lib/shared-overview.ts',
      find: "    if (typeof v !== 'string' || !UUID.test(v)) return { ok: false, error: 'Every id must be a UUID.' };", replace: "    if (typeof v !== 'string') return { ok: false, error: 'Every id must be a UUID.' };" },
    { name: 'a failed snapshot read ships logs:null instead of omitting the key', file: 'src/lib/shared-overview.ts',
      find: '  const logs = snapReadFailed ? undefined : bsLogsLeg(snapRows as Array<Record<string, unknown>>, Date.now());', replace: '  const logs = snapReadFailed ? null : bsLogsLeg(snapRows as Array<Record<string, unknown>>, Date.now());' },
    { name: 'the caller\'s own trainer row is never resolved (every plan and session reads as a counterpart\'s)', file: 'src/lib/shared-overview.ts',
      find: '    trainerId: trainerRow.data?.id ?? null,', replace: '    trainerId: null,' },
    // ── the data layer ─────────────────────────────────────────────────────────
    { name: 'a failed client is cached as null for the TTL', file: 'public/newdesign/dashData.jsx',
      find: '      if (data == null) continue;\n', replace: '' },
    { name: 'the cache is never consulted (every roster read re-requests every client)', file: 'public/newdesign/dashData.jsx',
      find: '    if (hit && !hit.pending && Date.now() - hit.at < DASH_CACHE_TTL) out[i] = hit.data;', replace: '    if (false) out[i] = hit.data;' },
    { name: 'the client-side chunk cap ignores the route\'s', file: 'public/newdesign/dashData.jsx',
      find: 'const DASH_BATCH_MAX = 50;', replace: 'const DASH_BATCH_MAX = 5000;' },
    { name: 'two mounts no longer share an in-flight request', file: 'public/newdesign/dashData.jsx',
      find: '  const hit = _dashBatchInFlight.get(key);\n  if (hit) return hit;\n', replace: '' },
    { name: 'a failed in-flight request is never cleared, so every retry re-uses the failure', file: 'public/newdesign/dashData.jsx',
      find: '    } finally {\n      _dashBatchInFlight.delete(key);\n    }', replace: '    } finally {\n    }' },
    { name: 'the cache key stops being the single route\'s URL', file: 'public/newdesign/dashData.jsx',
      find: 'function _dashOverviewKey(id) { return "/api/clients/" + encodeURIComponent(id) + "/shared-overview"; }', replace: 'function _dashOverviewKey(id) { return "/api/clients/" + id + "/shared-overview"; }' },
    { name: 'a result present in the response is not written to the cache', file: 'public/newdesign/dashData.jsx',
      find: '      _dashCache.set(_dashOverviewKey(id), { at, data });\n', replace: '' },
  ],
};
