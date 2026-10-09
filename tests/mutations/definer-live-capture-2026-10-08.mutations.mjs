// Mutation spec for the live capture's plumbing (first run on the 2026-10-08 capture, now reading the
// 2026-10-09 one, which supersedes it): replayDir's `including`, the capture-day
// helpers (modelAsOfCapture, ambiguousCaptureDayFiles), the trigger-definer comparison, and the
// fixture's own record. Each mutation breaks one clause; every one must be killed.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/definer-live-capture-2026-10-08.mutations.mjs --fail-on-skipped
const MODEL = 'tests/helpers/definer-model.mjs';
const LIVE = 'tests/helpers/definer-live.mjs';
const FIXTURE = 'tests/fixtures/definer-live-2026-10-09.json';

export default {
  test: 'node --test tests/definer-live-agreement.test.mjs tests/definer-live-diff.test.mjs',
  timeoutMs: 600_000,
  mutations: [
    // ── replayDir's `including` ──
    { name: 'an included capture-day file is left out of the replay', file: MODEL,
      find: '    if (including.includes(file)) return true;\n',
      replace: '' },
    { name: 'a name the directory lacks is included silently', file: MODEL,
      find: "  for (const name of including) if (!ordered.includes(name)) throw new Error(`replayDir: \\`including\\` names ${name}, which is not a migration in ${dir}`);\n",
      replace: '' },
    // ── the capture-day helpers ──
    { name: 'modelAsOfCapture ignores the capture\'s record of applied files', file: LIVE,
      find: '  return replayDir(dir, { before: live.capturedOn, including: applied });',
      replace: '  return replayDir(dir, { before: live.capturedOn });' },
    { name: 'modelAsOfCapture accepts an applied file dated another day', file: LIVE,
      find: '    if (migrationDate(f) !== live.capturedOn) throw new Error(',
      replace: '    if (false) throw new Error(' },
    { name: 'every capture-day file is ambiguous, applied or not', file: LIVE,
      find: '  return captureDayFiles(dir, live).filter((f) => !applied.has(f));',
      replace: '  return captureDayFiles(dir, live);' },
    { name: 'no capture-day file is ever ambiguous', file: LIVE,
      find: '  return captureDayFiles(dir, live).filter((f) => !applied.has(f));',
      replace: '  return [];' },
    // ── the trigger-definer comparison ──
    { name: 'trigger definers are never compared', file: LIVE,
      find: '  if (Array.isArray(live.triggerDefiners)) {',
      replace: '  if (false) {' },
    { name: 'a trigger definer only the model has is not drift', file: LIVE,
      find: "      drift.push({ kind: liveTrig.has(name) ? 'trigger-live-only' : 'trigger-model-only', name,",
      replace: "      if (!liveTrig.has(name)) { triggersCompared++; continue; }\n      drift.push({ kind: liveTrig.has(name) ? 'trigger-live-only' : 'trigger-model-only', name," },
    { name: 'a trigger definer only live has is not drift', file: LIVE,
      find: "      drift.push({ kind: liveTrig.has(name) ? 'trigger-live-only' : 'trigger-model-only', name,",
      replace: "      if (!modelTrig.has(name)) { triggersCompared++; continue; }\n      drift.push({ kind: liveTrig.has(name) ? 'trigger-live-only' : 'trigger-model-only', name," },
    // ── the fixture's own record ──
    { name: 'the fixture forgets the one trigger definer no migration creates', file: FIXTURE,
      find: '    "rls_auto_enable",\n',
      replace: '' },
    { name: 'the fixture forgets that the sale-plan preview file was applied before the capture', file: FIXTURE,
      find: '    "2026-10-09-sale-plan-preview-menus.sql",\n',
      replace: '' },
    { name: 'the fixture forgets a non-trigger definer the migrations create', file: FIXTURE,
      find: '    "get_health_sources",\n',
      replace: '' },
    { name: 'the fixture forgets the trigger definer the 2026-10-09 restore put back', file: FIXTURE,
      find: '    "messages_touch_conversation",\n',
      replace: '' },
  ],
};
