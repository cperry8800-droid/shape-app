// Mutation spec for the "Set up with Nora" fixes (owner, 2026-11-10: "Make sure this set up with Nora
// feature is fully functioning"): the chat launcher no longer re-opens a request the widget already
// took (public/newdesign/globalChatButton.js), one setup card a reply and a drafted card kept when
// the follow-up fails (src/app/api/support/chat/route.ts), a refused Undo says why
// (src/app/api/ai/audit/undo/route.ts), and the app's card reads the session's token at the tap
// (mobile-app/src/services/shapeBackend.js). Every guard is broken once here and a test must notice.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/nora-setup-fixes-2026-11-10.mutations.mjs --fail-on-skipped
const LAUNCHER = 'public/newdesign/globalChatButton.js';
const ROUTE = 'src/app/api/support/chat/route.ts';
const UNDO = 'src/app/api/ai/audit/undo/route.ts';
const BE = 'mobile-app/src/services/shapeBackend.js';

export default {
  test: 'node --test tests/nora-account-setup.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── The launcher ──
    { name: 'a request the widget took is opened again (Nora turned off)', file: LAUNCHER, find: '    if (delivered) return;\n', replace: '' },
    { name: 'the boot forgets a waiting request', file: LAUNCHER, find: '    if (window.__openChatRequest) waiting = true;\n', replace: '' },
    { name: 'every open after a boot is swallowed', file: LAUNCHER, find: 'var delivered = !req && waiting;', replace: 'var delivered = waiting || true;' },
    { name: 'the fallback panel leaves the flag up', file: LAUNCHER, find: '    // The panel takes the waiting request itself; a later bare open is a bare open.\n    waiting = false;\n', replace: '' },
    // ── One card a reply ──
    { name: 'a second setup card is drawn', file: ROUTE, find: "    if (name === 'set_up_account' && setupDrafted) {", replace: '    if (false) {' },
    { name: 'the first card is never counted', file: ROUTE, find: "    if (name === 'set_up_account') setupDrafted = true;\n", replace: '' },
    // ── A drafted card outlives the follow-up ──
    { name: 'a failed follow-up drops the card', file: ROUTE, find: 'if (!result.ok) return actions.length ? { reply: CARD_ONLY_REPLY, actions, model: answeredBy } : null;', replace: 'if (!result.ok) return null;' },
    { name: 'a wordless follow-up drops the card', file: ROUTE, find: 'return reply ? { reply, actions, model: answeredBy } : actions.length ? { reply: CARD_ONLY_REPLY, actions, model: answeredBy } : null;', replace: 'return reply ? { reply, actions, model: answeredBy } : null;' },
    { name: 'a failed follow-up with no card says the card line', file: ROUTE, find: 'if (!result.ok) return actions.length ? { reply: CARD_ONLY_REPLY, actions, model: answeredBy } : null;', replace: 'if (!result.ok) return { reply: CARD_ONLY_REPLY, actions, model: answeredBy };' },
    // ── Undo says why ──
    { name: 'a refused undo is a bare 500 again', file: UNDO, find: "    return NextResponse.json({ error: 'undo_failed', message }, { status: 409 });", replace: '    throw e;' },
    { name: 'the reason is dropped', file: UNDO, find: "return NextResponse.json({ error: 'undo_failed', message }, { status: 409 });", replace: "return NextResponse.json({ error: 'undo_failed' }, { status: 409 });" },
    // ── The app's card ──
    { name: 'the app confirms with the cached token', file: BE, find: "    headers: await noraCardHeaders(),\n    body: JSON.stringify({ token }),", replace: "    headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),\n    body: JSON.stringify({ token })," },
    { name: 'the fresh token is never read', file: BE, find: '  const token = await liveAccessToken();\n  return token ?', replace: '  const token = null;\n  return token ?' },
    { name: "the app's Undo shows the route's code", file: BE, find: "if (!res.ok) throw new Error(payload.message || 'Could not undo that change.');", replace: "if (!res.ok) throw new Error(payload.error || 'Could not undo that change.');" },
  ],
};
