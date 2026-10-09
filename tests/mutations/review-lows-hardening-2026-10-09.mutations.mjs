// Mutation spec for the Lows of the 2026-10-08 review's app code (L1 to L15). Each mutation
// re-opens one hole or breaks one rule; tests/review-lows-hardening.test.mjs and the suites
// beside it must notice every one. The database-side Lows are the owner's policy decisions
// and have no code here.
// ⚠ src/app/api/apply/route.ts has CRLF line endings, so its anchors are single lines.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/review-lows-hardening-2026-10-09.mutations.mjs --fail-on-skipped
const CONFIRM = 'src/lib/delete-confirm.ts';
const DELETE = 'src/app/api/account/delete/route.ts';
const SESSION = 'src/app/api/auth/session/route.ts';
const CREDS = 'src/app/api/coach/credentials/route.ts';
const APPLY = 'src/app/api/apply/route.ts';
const RADIO = 'src/app/api/radio/rooms/route.ts';
const REGISTER = 'src/app/api/push/register/route.ts';
const DISPATCH = 'src/app/api/push/dispatch/route.ts';
const DEVTOKEN = 'src/app/api/integrations/apple-music/developer-token/route.ts';
const MEALNOTE = 'src/app/api/nutrition/meal-note/route.ts';
const RETURN = 'src/lib/return-path.ts';
const CHECKOUT = 'src/app/api/stripe/checkout-session/route.ts';
const WEBHOOK = 'src/app/api/stripe/webhook/route.ts';
const REFUNDS = 'src/app/dashboard/refunds/actions.ts';
const ADMIN = 'src/lib/admin-access.ts';
const CORE = 'src/lib/membership-core.ts';
const THREAD = 'src/lib/ai/noraThread.mjs';
const SUPPORT = 'src/lib/supportRequests.mjs';
const CONSOLE = 'src/app/dashboard/support/actions.ts';
const APP = 'mobile-app/src/services/shapeBackend.js';

export default {
  test: 'node --test tests/review-lows-hardening.test.mjs tests/nora-talk-to-person.test.mjs tests/store-credit-reservation.test.mjs tests/support-chat-route.test.mjs tests/provider-apply-requirements.test.mjs',
  timeoutMs: 600_000,
  mutations: [
    // ── L1 ──
    { name: "another account's confirmation token verifies", file: CONFIRM,
      find: "  if (uid !== userId || !/^\\d{1,12}$/.test(expRaw) || !/^[0-9a-f]{64}$/.test(sig)) return false;",
      replace: "  if (!/^\\d{1,12}$/.test(expRaw) || !/^[0-9a-f]{64}$/.test(sig)) return false;" },
    { name: 'the confirmation token never expires', file: CONFIRM,
      find: '  if (Number(expRaw) * 1000 < now) return false;\n',
      replace: '' },
    { name: 'the first request deletes (no 428 step)', file: DELETE,
      find: '  if (!confirmToken) {\n    const issued = issueDeleteConfirm(user.id);',
      replace: '  if (false) {\n    const issued = issueDeleteConfirm(user.id);' },
    { name: 'any token deletes', file: DELETE,
      find: '  if (!verifyDeleteConfirm(confirmToken, user.id)) {',
      replace: '  if (false) {' },
    // ── L2 ──
    { name: 'a cross-site POST sets the session', file: SESSION,
      find: '  if (!originAllowed(req)) {',
      replace: '  if (false) {' },
    { name: 'the installed app cannot sign in', file: SESSION,
      find: '  const allowed = new Set<string>([new URL(req.url).origin, ...NATIVE_APP_ORIGINS]);',
      replace: '  const allowed = new Set<string>([new URL(req.url).origin]);' },
    // ── L3 ──
    { name: "the coach reads the admin's notes again", file: CREDS,
      find: '      notes: null,',
      replace: "      notes: (c?.review_notes as string) || null," },
    // ── L4 ──
    { name: 'a declared type outside the list is stored as declared', file: APPLY,
      find: "  if (declared && declared !== 'application/octet-stream') return ALLOWED_FILE_TYPES.has(declared) ? declared : null;",
      replace: "  if (declared && declared !== 'application/octet-stream') return declared;" },
    { name: 'an unknown extension is stored as octet-stream', file: APPLY,
      find: '  return EXTENSION_TYPES[ext] ?? null;',
      replace: "  return EXTENSION_TYPES[ext] ?? 'application/octet-stream';" },
    { name: 'no cap on the file count', file: APPLY,
      find: '  if (files.length > MAX_FILES) return `At most ${MAX_FILES} files per application.`;',
      replace: '  if (false) return `At most ${MAX_FILES} files per application.`;' },
    { name: 'the file check no longer runs before the row is written', file: APPLY,
      find: '  if (fileProblem) {',
      replace: '  if (false) {' },
    // ── L5 ──
    { name: "the body's role hosts the room again", file: RADIO,
      find: '  const hostRole = normalizeRole(profile?.role);',
      replace: '  const hostRole = normalizeRole((payload as { role?: unknown } | null)?.role ?? profile?.role);' },
    // ── L6 ──
    { name: 'a token changing hands is not logged', file: REGISTER,
      find: '  if (prior && prior.user_id !== user.id) {',
      replace: '  if (false) {' },
    { name: 'the overflow is never pruned', file: REGISTER,
      find: '  } else if (overflow && overflow.length) {',
      replace: '  } else if (false) {' },
    { name: 'the cap keeps the OLDEST tokens', file: REGISTER,
      find: "    .order('updated_at', { ascending: false })\n    .range(MAX_TOKENS_PER_USER, MAX_TOKENS_PER_USER + 199);",
      replace: "    .order('updated_at', { ascending: true })\n    .range(MAX_TOKENS_PER_USER, MAX_TOKENS_PER_USER + 199);" },
    // ── L7 ──
    { name: 'the push secret is compared with ===', file: DISPATCH,
      find: '  return x.length === y.length && timingSafeEqual(x, y);',
      replace: '  return given === expected;' },
    // ── L8 ──
    { name: 'any visitor gets an Apple developer token', file: DEVTOKEN,
      find: "  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });\n",
      replace: '' },
    { name: 'one app caller fetches the developer token without its session', file: APP,
      find: "  const tokenRes = await fetch(`${apiBaseUrl}/api/integrations/apple-music/developer-token`, { headers: sessionsAuthHeaders() });\n  const tokenJson = await tokenRes.json().catch(() => ({}));\n  if (!tokenRes.ok || !tokenJson.developerToken) { const e = new Error(",
      replace: "  const tokenRes = await fetch(`${apiBaseUrl}/api/integrations/apple-music/developer-token`);\n  const tokenJson = await tokenRes.json().catch(() => ({}));\n  if (!tokenRes.ok || !tokenJson.developerToken) { const e = new Error(" },
    // ── L9 ──
    { name: 'the meal-note link lives a year again', file: MEALNOTE,
      find: 'const SIGNED_URL_TTL = 60 * 60 * 24 * 90; // 90 days',
      replace: 'const SIGNED_URL_TTL = 60 * 60 * 24 * 365; // 90 days' },
    { name: 'a type outside the list is uploaded', file: MEALNOTE,
      find: '  if (!allowed.has(type)) {\n    console.warn',
      replace: '  if (false) {\n    console.warn' },
    // ── L10 ──
    { name: 'a protocol-relative return path passes', file: RETURN,
      find: 'const SAME_ORIGIN_PATH = /^\\/(?![\\/\\\\])\\S*$/;',
      replace: 'const SAME_ORIGIN_PATH = /^\\/\\S*$/;' },
    { name: 'the checkout success path is concatenated as sent', file: CHECKOUT,
      find: "  const successPath = sameOriginPath(body.successPath, '/purchase/success');",
      replace: "  const successPath = body.successPath || '/purchase/success';" },
    // ── L11 ──
    { name: 'the Connect account row is picked by metadata again', file: WEBHOOK,
      find: "            .eq('stripe_account_id', account.id)\n            .select('id');",
      replace: "            .eq('id', Number(account.metadata?.provider_id ?? 0))\n            .select('id');" },
    // ── L12 ──
    { name: "a refund's purchase is looked up by id alone", file: REFUNDS,
      find: "        .eq('id', req.one_time_purchase_id)\n        .eq('client_id', req.client_id)\n",
      replace: "        .eq('id', req.one_time_purchase_id)\n" },
    // ── L13 ──
    { name: 'an unpaid completion records the purchase', file: WEBHOOK,
      find: "          if (session.payment_status !== 'paid') {",
      replace: '          if (false) {' },
    { name: 'the delayed payment event is not handled', file: WEBHOOK,
      find: "      case 'checkout.session.async_payment_succeeded': {\n",
      replace: '      {\n' },
    { name: 'a failed delayed payment keeps the reserved credit', file: WEBHOOK,
      find: "      case 'checkout.session.expired':\n      case 'checkout.session.async_payment_failed': {",
      replace: "      case 'checkout.session.expired': {" },
    // ── L14 ──
    { name: 'the applications inbox is an admin again', file: ADMIN,
      find: "  const configured = [process.env.ADMIN_EMAILS]\n    .filter(Boolean)\n    .flatMap((value) => String(value).split(','))",
      replace: "  const configured = [process.env.ADMIN_EMAILS, process.env.APPLICATIONS_EMAIL]\n    .filter(Boolean)\n    .flatMap((value) => String(value).split(','))" },
    { name: 'an unconfirmed email is an admin', file: ADMIN,
      find: '  if (!user || !email || !user.email_confirmed_at || !getAdminEmails().includes(email)) {',
      replace: '  if (!user || !email || !getAdminEmails().includes(email)) {' },
    { name: 'the mirror still counts the inbox', file: CORE,
      find: '  const configured = [process.env.ADMIN_EMAILS]\n    .filter(Boolean)\n    .flatMap((v) => String(v).split(\',\'))',
      replace: '  const configured = [process.env.ADMIN_EMAILS, process.env.APPLICATIONS_EMAIL]\n    .filter(Boolean)\n    .flatMap((v) => String(v).split(\',\'))' },
    // ── L15 ──
    { name: 'a team message is vouched for by its text alone again', file: SUPPORT,
      find: "    if (!ref || seen.has(ref) || replies.get(ref) !== String(m.text || '').trim()) return false;",
      replace: "    if (![...replies.values()].includes(String(m.text || '').trim())) return false;" },
    { name: 'the same reply shows twice', file: SUPPORT,
      find: "    if (!ref || seen.has(ref) || replies.get(ref) !== String(m.text || '').trim()) return false;",
      replace: "    if (!ref || replies.get(ref) !== String(m.text || '').trim()) return false;" },
    { name: 'an answered row with no reply is vouched for', file: SUPPORT,
      find: '      if (id && text) replies.set(id, text);',
      replace: '      replies.set(id, text);' },
    { name: 'a user message keeps a ref', file: THREAD,
      find: "  const ref = role === 'team' && typeof m.ref === 'string' && /^[A-Za-z0-9-]{1,40}$/.test(m.ref) ? m.ref : null;",
      replace: "  const ref = typeof m.ref === 'string' && /^[A-Za-z0-9-]{1,40}$/.test(m.ref) ? m.ref : null;" },
    { name: 'the console writes the reply without the request id', file: CONSOLE,
      find: '  const thread = await appendTeamToThread(db, row.user_id, reply, now, { ref: row.id }).catch(() => ({ ok: false }));',
      replace: '  const thread = await appendTeamToThread(db, row.user_id, reply, now).catch(() => ({ ok: false }));' },
  ],
};
