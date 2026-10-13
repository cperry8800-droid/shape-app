// Mutation spec for two-factor sign-in for staff (2026-10-13): each mutation undoes one guard, and
// tests/staff-two-factor.test.mjs, tests/admin-console.test.mjs, tests/nav-rewards-store.test.mjs or
// tests/site-nav.test.mjs must fail on every one.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/staff-two-factor-2026-10-13.mutations.mjs --fail-on-skipped
const RULES = 'src/lib/staff-two-factor.mjs';
const ACCESS = 'src/lib/admin-access.ts';
const PROXY = 'src/lib/supabase/middleware.ts';
const PAGE = 'src/app/staff-verify/page.tsx';
const STAFF = 'src/app/admin/staff/actions.ts';
const ROUTE = 'src/app/api/staff/two-factor/route.ts';
const CLIENT = 'src/app/staff-verify/StaffTwoFactor.tsx';
const SHELL = 'public/newdesign/pageShell.jsx';

export default {
  test: 'node --test tests/staff-two-factor.test.mjs tests/admin-console.test.mjs tests/nav-rewards-store.test.mjs tests/site-nav.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── the rules ──
    { name: 'a lookalike path counts as a staff page', file: RULES,
      find: '  return STAFF_PAGE_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));',
      replace: '  return STAFF_PAGE_PREFIXES.some((prefix) => p.startsWith(prefix));' },
    { name: 'the admin tools are not staff pages', file: RULES,
      find: 'export const STAFF_PAGE_PREFIXES = [...new Set([...CONSOLE_PAGES, ...ADMIN_TOOLS].map((p) => p.href))];',
      replace: 'export const STAFF_PAGE_PREFIXES = [...new Set([...CONSOLE_PAGES].map((p) => p.href))];' },
    { name: 'an authenticator alone counts as verified', file: RULES,
      find: "  if (currentLevel === 'aal2') return 'verified';\n  return Number(verifiedFactors) > 0 ? 'verify' : 'enroll';",
      replace: "  if (currentLevel === 'aal2' || Number(verifiedFactors) > 0) return 'verified';\n  return 'enroll';" },
    { name: 'the way back can leave the console', file: RULES,
      find: "  return isStaffPage(next.split(/[?#]/)[0]) ? next : '/admin';",
      replace: '  return next;' },
    // ── the staff check ──
    { name: 'a password alone is staff', file: ACCESS,
      find: "  return signIn?.twoFactor === 'verified' ? signIn.staff : null;",
      replace: '  return signIn ? signIn.staff : null;' },
    { name: 'an unconfirmed set-up counts as an authenticator', file: ACCESS,
      find: "  const verifiedFactors = (user.factors ?? []).filter((f) => f.status === 'verified' && f.factor_type === 'totp').length;",
      replace: "  const verifiedFactors = (user.factors ?? []).filter((f) => f.factor_type === 'totp').length;" },
    { name: 'an unreadable token is trusted', file: ACCESS,
      find: '    currentLevel = error ? null : ((data?.claims as { aal?: string } | undefined)?.aal ?? null);',
      replace: "    currentLevel = error ? 'aal2' : ((data?.claims as { aal?: string } | undefined)?.aal ?? null);" },
    // ── the proxy ──
    { name: 'the proxy lets an unverified session in', file: PROXY,
      find: "    if (assurance?.currentLevel !== 'aal2') {",
      replace: '    if (false) {' },
    { name: 'the proxy forgets where they were going', file: PROXY,
      find: '      const target = new URL(verifyUrl(request.nextUrl.pathname, request.nextUrl.search), url);',
      replace: "      const target = new URL('/staff-verify', url);" },
    // ── the page ──
    { name: 'a verified session is asked again', file: PAGE,
      find: "  if (signIn.twoFactor === 'verified') redirect(next);",
      replace: '' },
    { name: 'a non-staff account sees the page', file: PAGE,
      find: '    if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);\n    notFound();',
      replace: '    if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);\n    return null;' },
    // ── the owner's reset ──
    { name: 'an admin can reset two-factor', file: STAFF,
      find: "export async function resetStaffTwoFactor(formData: FormData): Promise<void> {\n  const owner = await requireStaff('owner');",
      replace: "export async function resetStaffTwoFactor(formData: FormData): Promise<void> {\n  const owner = await requireStaff('admin');" },
    { name: 'a reset leaves them signed in', file: STAFF,
      find: "  const { error: endError } = await db.rpc('admin_end_sessions', { p_user: userId });",
      replace: '  const endError = null;' },
    { name: 'a failed factor delete reads as done', file: STAFF,
      find: '    if (error) failed = true;\n  }',
      replace: '    void error;\n  }' },
    { name: 'a reset runs without its log row', file: STAFF,
      find: "    details: { level: target.level, factors: factors.length },\n  });\n  if (log.error) redirect(`${PAGE}?error=${log.error}`);",
      replace: '    details: { level: target.level, factors: factors.length },\n  });' },
    // ── Codex, #2329 ──
    { name: 'a phone factor counts as an authenticator', file: ACCESS,
      find: "  const verifiedFactors = (user.factors ?? []).filter((f) => f.status === 'verified' && f.factor_type === 'totp').length;",
      replace: "  const verifiedFactors = (user.factors ?? []).filter((f) => f.status === 'verified').length;" },
    { name: 'an ADMIN_EMAILS admin cannot be reset', file: STAFF,
      find: "    if (email && getEnvAdminEmails().includes(email) && !getOwnerEmails().includes(email)) target = { email, level: 'admin' };\n",
      replace: '' },
    { name: 'an owner listed in ADMIN_EMAILS can be reset', file: STAFF,
      find: "    if (email && getEnvAdminEmails().includes(email) && !getOwnerEmails().includes(email)) target = { email, level: 'admin' };",
      replace: "    if (email && getEnvAdminEmails().includes(email)) target = { email, level: 'admin' };" },
    // ── the steps on the server (owner, 2026-10-13: "this isn't working") ──
    { name: 'the page reads the session in the browser again', file: CLIENT,
      find: "import { cleanCode } from '@/lib/staff-two-factor.mjs';",
      replace: "import { cleanCode } from '@/lib/staff-two-factor.mjs';\nimport { createClient } from '@/lib/supabase/client';" },
    { name: 'the route answers an account that is not staff', file: ROUTE,
      find: "  if (!signIn) return say('Not found.', 404);\n",
      replace: "  if (!signIn) return NextResponse.json({ mode: 'verified' });\n" },
    { name: 'a set-up clears a confirmed authenticator too', file: ROUTE,
      find: "    for (const f of totp.filter((x) => x.status === 'unverified')) {",
      replace: '    for (const f of totp) {' },
    { name: 'a code goes to Supabase uncleaned', file: ROUTE,
      find: '    const code = cleanCode(parsed.data.code);',
      replace: "    const code = String(parsed.data.code ?? '');" },
    { name: 'any factor id goes to Supabase', file: ROUTE,
      find: "    if (!UUID_RE.test(factorId)) return say('Reload the page to try again.', 400);\n",
      replace: '' },
    { name: 'a wrong code is let through', file: ROUTE,
      find: "    if (error) return say('That code did not match. Codes change every 30 seconds; enter the one showing now.', 400);\n",
      replace: '' },
    { name: 'a session already verified is asked to set up again', file: ROUTE,
      find: "    if (signIn.twoFactor === 'verified') return NextResponse.json({ mode: 'verified' }, { headers: NO_STORE });\n",
      replace: '' },
    // ── the website's way in ──
    { name: 'every signed-in member sees Admin', file: SHELL,
      find: '              {staffLevel ? <a href="/admin" style={quietLink}>Admin</a> : null}',
      replace: '              <a href="/admin" style={quietLink}>Admin</a>' },
    { name: 'the drawer shows Admin to every signed-in member', file: SHELL,
      find: '        {authUser && staffLevel ? <a href="/admin" onClick={onClose} style={{ ...linkBase, color: INK }}>Admin</a> : null}',
      replace: '        {authUser ? <a href="/admin" onClick={onClose} style={{ ...linkBase, color: INK }}>Admin</a> : null}' },
    // ── the staff header's room for the link (Codex on #2340) ──
    { name: 'the header does not mark staff', file: SHELL,
      find: ' data-staff={staffLevel ? "" : undefined}',
      replace: '' },
    { name: 'a staff account keeps its greeting as long as everyone', file: SHELL,
      find: '      @media (max-width: 1240px) {\n        .shape-header[data-staff] .shape-nav-hi { display: none !important; }\n',
      replace: '      @media (max-width: 1240px) {\n' },
    { name: 'a staff switch account keeps its greeting to 1340', file: SHELL,
      find: '      @media (max-width: 1380px) {',
      replace: '      @media (max-width: 1340px) {' },
    { name: 'a staff switch account takes the loose gaps to 1200', file: SHELL,
      find: '        :where(.shape-header[data-role-switch][data-staff]) .shape-header-inner { gap: 18px !important; }\n',
      replace: '' },
    { name: 'a staff switch account folds at 1120 with everyone', file: SHELL,
      find: '      @media (max-width: 1170px) {',
      replace: '      @media (max-width: 1120px) {' },
    { name: 'the staff fold leaves the burger hidden', file: SHELL,
      find: '        .shape-header[data-role-switch][data-staff] .shape-nav-burger { display: inline-flex !important; }\n',
      replace: '' },
  ],
};
