// Mutation spec for the check-in and water saves' deadline (shapeBackend.js postWithDeadline) and
// how the check-in card and the water line take a save past it. A late save may have landed, and a
// glass is added on the server, so each rule that decides what is shown and what is sent again must
// be guarded. Every mutation must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/save-deadline-2026-10-30.mutations.mjs --fail-on-skipped
const BACKEND = 'mobile-app/src/services/shapeBackend.js';
const CARD = 'mobile-app/src/broadsheet/BSCheckinCard.jsx';
const WATER = 'mobile-app/src/broadsheet/BSWaterLine.jsx';

export default {
  test: 'node --test tests/save-deadline.test.mjs tests/checkin-card.test.mjs tests/water-line.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── The deadline ──
    { name: 'the check-in save has no deadline', file: BACKEND,
      find: "const { res, d } = await postWithDeadline(`${apiBaseUrl || ''}/api/client/checkin`, {",
      replace: "const res = await fetch(`${apiBaseUrl || ''}/api/client/checkin`, { /* */" },
    { name: 'the water save has no deadline', file: BACKEND,
      find: "const { res, d } = await postWithDeadline(`${apiBaseUrl || ''}/api/client/hydration`, {",
      replace: "const res = await fetch(`${apiBaseUrl || ''}/api/client/hydration`, { /* */" },
    { name: 'a late save is not flagged as one that may have landed', file: BACKEND,
      find: '      e.timedOut = true;\n',
      replace: '' },
    { name: 'the held request is never aborted', file: BACKEND,
      find: '      if (controller) { try { controller.abort(); } catch (x) { /* the deadline still holds */ } }\n',
      replace: '' },
    { name: 'the deadline is armed only with AbortController', file: BACKEND,
      find: '    timer = setTimeout(() => {\n      // Rejected before the abort',
      replace: '    if (controller) timer = setTimeout(() => {\n      // Rejected before the abort' },
    { name: 'the body is read outside the deadline', file: BACKEND,
      find: '    const d = await res.json().catch(() => ({}));\n    return { res, d };',
      replace: '    return { res, d: {} };' },
    { name: 'the deadline is a hair trigger', file: BACKEND,
      find: 'const SAVE_DEADLINE_MS = 15000;',
      replace: 'const SAVE_DEADLINE_MS = 1500;' },

    // ── The check-in card ──
    { name: 'a late check-in answer is said to have failed', file: CARD,
      find: "undo(e && e.timedOut ? 'unconfirmed' : 'failed')",
      replace: "undo('failed')" },
    { name: 'the card never says a late answer', file: CARD,
      find: ": err === 'unconfirmed' ? tr('home:today.checkinUnconfirmed', { defaultValue: 'Could not confirm that answer — tap it again' })",
      replace: ": err === 'never' ? tr('home:today.checkinUnconfirmed', { defaultValue: 'Could not confirm that answer — tap it again' })" },

    // ── The water line ──
    { name: 'a late glass is taken back like a failed one', file: WATER,
      find: '      if (e && e.timedOut) {\n        resync.current = true;',
      replace: '      if (false) {\n        resync.current = true;' },
    { name: 'a late glass is kept but the day is never read again', file: WATER,
      find: '      if (e && e.timedOut) {\n        resync.current = true;',
      replace: '      if (e && e.timedOut) {\n        resync.current = false;' },
    { name: 'the line never says a late glass', file: WATER,
      find: "{errLine('water')}{errLine('unconfirmed')}",
      replace: "{errLine('water')}" },
    { name: 'a late glass is said to have failed', file: WATER,
      find: "        if (alive.current) setErr('unconfirmed');",
      replace: "        if (alive.current) setErr('water');" },
  ],
};
