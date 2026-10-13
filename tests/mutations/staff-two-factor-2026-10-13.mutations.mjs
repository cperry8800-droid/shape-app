// Mutation spec for two-factor sign-in for staff (2026-10-13): each mutation undoes one guard, and
// tests/staff-two-factor.test.mjs or tests/admin-console.test.mjs must fail on every one.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/staff-two-factor-2026-10-13.mutations.mjs --fail-on-skipped
const RULES = 'src/lib/staff-two-factor.mjs';
const ACCESS = 'src/lib/admin-access.ts';
const PROXY = 'src/lib/supabase/middleware.ts';
const PAGE = 'src/app/staff-verify/page.tsx';
const STAFF = 'src/app/admin/staff/actions.ts';

export default {
  test: 'node --test tests/staff-two-factor.test.mjs tests/admin-console.test.mjs',
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
      find: "  const verifiedFactors = (user.factors ?? []).filter((f) => f.status === 'verified').length;",
      replace: '  const verifiedFactors = (user.factors ?? []).length;' },
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
      find: "    details: { level: row.level, factors: factors.length },\n  });\n  if (log.error) redirect(`${PAGE}?error=${log.error}`);",
      replace: '    details: { level: row.level, factors: factors.length },\n  });' },
  ],
};
