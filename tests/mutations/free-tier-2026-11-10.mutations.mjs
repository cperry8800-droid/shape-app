// Mutation spec for the free account on the server (owner, 2026-11-10): an account is free; the
// $5 membership (active only: no trial; a past-due member keeps the account and loses the paid
// features) adds assistant Nora, Shape Radio, the AI helpers, Cook Mode's voice, being ranked on
// the leaderboards and the points Store. Every mutation must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/free-tier-2026-11-10.mutations.mjs --fail-on-skipped
const CORE = 'src/lib/membership-core.ts';
const MW = 'src/lib/supabase/middleware.ts';
const GUARD = 'src/lib/require-membership.ts';
const SUB = 'src/app/api/stripe/subscription/route.ts';
const PLATFORM = 'src/app/api/stripe/platform-checkout/route.ts';
const COACH = 'src/app/api/stripe/checkout-session/route.ts';
const ME = 'src/app/api/me/membership/route.ts';
const BOARD = 'src/app/api/leaderboard/route.ts';
const ACTIONS = 'src/lib/ai/actions.mjs';
const REVIEWS = 'src/app/api/coaches/reviews/route.ts';

export default {
  test: "node --test tests/free-tier-server.test.mjs tests/membership-first.test.mjs tests/leaderboards.test.mjs tests/ai-actions.test.mjs tests/coach-ratings-live.test.mjs",
  timeoutMs: 300_000,
  mutations: [
    { name: "a trial pays for the paid features", file: CORE,
      find: "export const PLATFORM_PERK_STATUSES = new Set(['active']);",
      replace: "export const PLATFORM_PERK_STATUSES = new Set(['active', 'trialing']);" },
    { name: "a past-due membership pays for the paid features", file: CORE,
      find: "export const PLATFORM_PERK_STATUSES = new Set(['active']);",
      replace: "export const PLATFORM_PERK_STATUSES = new Set(['active', 'past_due']);" },
    { name: "past due is never reported", file: CORE,
      find: "  const pastDue = !isMember && platformStatus === 'past_due';",
      replace: "  const pastDue = false;" },
    { name: "a past-due member is told to join", file: CORE,
      find: "  return m.pastDue\n    ? {",
      replace: "  return false\n    ? {" },
    { name: "the gate refuses a free account a free path", file: MW,
      find: "      if (!isMember && isPaidApiPath(apiPath)) return NextResponse.json(paidRefusal(membership), { status: 402 });",
      replace: "      if (!isMember) return NextResponse.json(paidRefusal(membership), { status: 402 });" },
    { name: "the gate lets a free account through a paid path", file: MW,
      find: "      if (!isMember && isPaidApiPath(apiPath)) return NextResponse.json(paidRefusal(membership), { status: 402 });",
      replace: "      if (false) return NextResponse.json(paidRefusal(membership), { status: 402 });" },
    { name: "the recipe imports are free", file: MW,
      find: "const PAID_API_PATHS = ['/api/nutrition/recipe-parse', '/api/nutrition/recipe-photo'];",
      replace: "const PAID_API_PATHS: string[] = [];" },
    { name: "the gate stamps a free account as a member", file: MW,
      find: "      forwardedHeaders.set(GATE_STAMP_HEADER, isMember ? GATE_STAMP_VALUE : GATE_STAMP_ACCOUNT);",
      replace: "      forwardedHeaders.set(GATE_STAMP_HEADER, GATE_STAMP_VALUE);" },
    { name: "an account's stamp passes a paid route", file: GUARD,
      find: "  if (request.headers.get(GATE_STAMP_HEADER) === GATE_STAMP_VALUE) return null;",
      replace: "  if (request.headers.get(GATE_STAMP_HEADER)) return null;" },
    { name: "an admin with no stamp is refused a paid route", file: GUARD,
      find: "    const membership = await computeMembership(client, user.id, user.email ?? null, { emailConfirmed: !!user.email_confirmed_at });",
      replace: "    const membership = await computeMembership(client, user.id, user.email ?? null);" },
    { name: "requireAccount lets a known minor in", file: GUARD,
      find: "    const { isKnownMinor } = await computeMembership(client, user.id, user.email ?? null, { emailConfirmed: !!user.email_confirmed_at });\n    if (isKnownMinor) {",
      replace: "    const { isKnownMinor } = await computeMembership(client, user.id, user.email ?? null, { emailConfirmed: !!user.email_confirmed_at });\n    if (false) {" },
    { name: "requireAccount lets a visitor in", file: GUARD,
      find: "    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });\n    const client = await clientForRequest(request);\n    const { isKnownMinor }",
      replace: "    if (!user) return null;\n    const client = await clientForRequest(request);\n    const { isKnownMinor }" },
    { name: "the plan card reads a past-due plan as paid", file: SUB,
      find: "    active: PLATFORM_PERK_STATUSES.has(String(data.status)),",
      replace: "    active: true," },
    { name: "the plan card shows a trial as a plan", file: SUB,
      find: "const SHOWN = new Set(['active', 'past_due']);",
      replace: "const SHOWN = new Set(['active', 'past_due', 'trialing']);" },
    { name: "a past-due member opens a second membership checkout", file: PLATFORM,
      find: "    if (m.pastDue) {",
      replace: "    if (false) {" },
    { name: "hiring a coach needs the membership again", file: COACH,
      find: "    if (m.isKnownMinor) {\n      return NextResponse.json({ error: 'Shape is for adults 18 and over.', code: 'age_restricted' }, { status: 403 });\n    }\n  } catch (err) {",
      replace: "    if (m.isKnownMinor) {\n      return NextResponse.json({ error: 'Shape is for adults 18 and over.', code: 'age_restricted' }, { status: 403 });\n    }\n    if (!m.isMember) return NextResponse.json({ error: 'Shape membership required.', code: 'membership_required' }, { status: 402 });\n  } catch (err) {" },
    { name: "/api/me/membership says nothing of past due", file: ME,
      find: "ageRestricted: m.isKnownMinor, pastDue: m.pastDue, status: m.platformStatus }",
      replace: "ageRestricted: m.isKnownMinor }" },
    { name: "a free caller keeps their row on the board", file: BOARD,
      find: "  const rows = ((board.data ?? []) as Array<Record<string, unknown>>).filter((r) => !(notRanked && r.is_me === true));",
      replace: "  const rows = (board.data ?? []) as Array<Record<string, unknown>>;" },
    { name: "a free caller is not told why they are not ranked", file: BOARD,
      find: "    hidden: notRanked ?? (own ? hiddenReason(scope, own.privacy, own.visibility) : null),",
      replace: "    hidden: own ? hiddenReason(scope, own.privacy, own.visibility) : null," },
    { name: "a past-due caller is told to join", file: BOARD,
      find: "(membership?.pastDue ? 'past_due' : 'free_account')",
      replace: "'free_account'" },
    { name: "Nora draws a meal card a free account cannot confirm", file: ACTIONS,
      find: "    // is refused: the card would draw, then fail. Asked here, Nora says so before drawing it.\n    memberGate(ctx);\n",
      replace: "    // is refused: the card would draw, then fail. Asked here, Nora says so before drawing it.\n" },
    { name: "a visitor reads the review words", file: REVIEWS,
      find: "  if (!user) return isMeasuredSignedOut(error) ? { member: false, admin: false } : null;",
      replace: "  if (!user) return isMeasuredSignedOut(error) ? { member: true, admin: false } : null;" },
  ],
};
