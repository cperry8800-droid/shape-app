// Mutation spec for Nora's admin help-desk lookup (the Ask Nora plan, step 5): the lookup and
// its log (src/lib/ai/adminLookup.mjs) and the route's gate. Every one must be killed.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/admin-lookup-2026-10-08.mutations.mjs --fail-on-skipped
const CORE = 'src/lib/ai/adminLookup.mjs';
const CHAT = 'src/app/api/support/chat/route.ts';

export default {
  test: 'node --test tests/nora-admin-lookup.test.mjs tests/support-chat-route.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── logged before it reads ──
    { name: 'a lookup runs though its log row was not written', file: CORE,
      find: '    if (!r.ok || !r.data || !r.data.id) {', replace: '    if (false) {' },
    { name: 'a lookup that finds nobody is not recorded', file: CORE,
      find: '    await finish({ found: false });\n', replace: '' },
    { name: 'a found account is not recorded against its id', file: CORE,
      find: '  await finish({ found: true, target_user_id: u.id, sections });', replace: '  await finish({ found: true, sections });' },
    // ── the help-desk set only ──
    { name: 'the whole profile row is read', file: CORE,
      find: "select('id, full_name, role, roles, created_at').eq('email', q)", replace: "select('*').eq('email', q)" },
    { name: 'the Stripe account id is handed to the model', file: CORE,
      find: '          role, listing: r.name, connected: !!r.stripe_account_id,', replace: '          role, listing: r.name, connected: !!r.stripe_account_id, account: r.stripe_account_id,' },
    { name: 'an email is looked up as typed', file: CORE,
      find: '  const s = value.trim().toLowerCase();', replace: '  const s = value.trim();' },
    { name: 'a plan that could not be read reads as none', file: CORE,
      find: "      : 'unavailable',\n    coaching: subs.ok", replace: "      : 'none',\n    coaching: subs.ok" },
    // ── the route's gate ──
    { name: 'an unconfirmed allow-listed email is an admin', file: CHAT,
      find: 'const admin = membership.isAdmin && actor.user.email && actor.user.email_confirmed_at', replace: 'const admin = membership.isAdmin && actor.user.email' },
    { name: 'the call is not re-checked', file: CHAT,
      find: "        if (!reads.admin) return { error: 'not_admin', message: 'Only a Shape admin can look up another account.' };\n", replace: '' },
    { name: 'every member is offered the lookup', file: CHAT,
      find: '      if (admin) adminTools = ADMIN_TOOLS;', replace: '      adminTools = ADMIN_TOOLS;' },
    { name: 'a server with no service role crashes the turn', file: CHAT,
      find: "        try { db = createAdminClient(); } catch { return { ok: false, error: 'unavailable', message: 'Account lookups are not configured on this server.' }; }", replace: '        db = createAdminClient();' },
  ],
};
