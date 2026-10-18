// Mutation spec for the coach score in the app and on the website (2026-10-18, WORKLOG known gap:
// "The app's coach Score page reads the member ledger, and /api/coach/score returns 401 to the
// app's Bearer token"). Each mutation breaks one rule; every one must be killed:
//   node scripts/mutate.mjs --spec tests/mutations/coach-score-app-2026-10-18.mutations.mjs --fail-on-skipped
const ROUTE = 'src/app/api/coach/score/route.ts';
const APP = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const TRAINER = 'public/newdesign/trainerScorePage.jsx';
const NUTRI = 'public/newdesign/nutritionistScorePage.jsx';

// The website's two pages carry the same read; each mutation is applied to both, one at a time.
const website = (name, find, replace) => [
  { name: `trainer page: ${name}`, file: TRAINER, find, replace },
  { name: `nutritionist page: ${name}`, file: NUTRI, find, replace },
];

export default {
  test: 'node --test tests/coach-score-route.test.mjs tests/coach-score-app.test.mjs tests/coach-score-website.test.mjs tests/leaderboards.test.mjs tests/score-i18n-contract.test.mjs',
  timeoutMs: 600_000,
  mutations: [
    // ── The route: the app's Bearer token, and an outage is not a 401 ──────────
    { name: 'route: the sign-in check reads only the cookie again', file: ROUTE, find: '  const { user, error: authErr } = await userLookupForRequest(req);', replace: "  const { user, error: authErr } = await userLookupForRequest(new Request(req.url));" },
    { name: 'route: the reads run on the cookie client, not the token\'s', file: ROUTE, find: '  const supabase = await clientForRequest(req);', replace: '  const supabase = await clientForRequest(new Request(req.url));' },
    { name: 'route: an auth outage answers 401 (the website shows the sample)', file: ROUTE, find: '    if (!isMeasuredSignedOut(authErr)) {', replace: '    if (false) {' },
    { name: 'route: the outage answer is a 401', file: ROUTE, find: "      return NextResponse.json({ error: 'Could not check your sign-in just now.' }, { status: 503 });", replace: "      return NextResponse.json({ error: 'Could not check your sign-in just now.' }, { status: 401 });" },

    // ── The app: which score a coach reads ─────────────────────────────────────
    { name: 'app: a coach reads the member ledger again', file: APP, find: '  const coachRole = (_coach && !(opts && opts.ledger)) ? bsCoachScoreRole(profile.roleLabel) : null;', replace: '  const coachRole = null;' },
    { name: 'app: the Store\'s ledger read is ignored for a coach', file: APP, find: '  const coachRole = (_coach && !(opts && opts.ledger)) ? bsCoachScoreRole(profile.roleLabel) : null;', replace: '  const coachRole = _coach ? bsCoachScoreRole(profile.roleLabel) : null;' },
    { name: 'app: the Store reads the coach score for its balance', file: APP, find: '  profile = _bsUseLiveScore(profile, { ledger: true });', replace: '  profile = _bsUseLiveScore(profile);' },
    { name: 'app: a dietitian rides the trainer rails', file: APP, find: "  if (r === 'nutritionist' || r === 'dietitian') return 'nutritionist';", replace: "  if (r === 'nutritionist') return 'nutritionist';" },
    { name: 'app: a signed-out coach reads the score anyway', file: APP, find: '    if (!loggedIn) return undefined;\n    let cancelled = false;\n    if (coachRole) {', replace: '    let cancelled = false;\n    if (coachRole) {' },

    // ── The app: the field mapping ─────────────────────────────────────────────
    { name: 'app: the total is not the route\'s', file: APP, find: '    total: d.total,\n    tier: d.current_tier,', replace: '    total: 0,\n    tier: d.current_tier,' },
    { name: 'app: the rung is not the route\'s', file: APP, find: '    total: d.total,\n    tier: d.current_tier,', replace: "    total: d.total,\n    tier: 'Certified'," },
    { name: 'app: the breakdown is dropped', file: APP, find: "    breakdown: d.breakdown.map((b) => ({ label: String((b && b.label) || ''), points: Number(b && b.points) || 0, sub: String((b && b.sub) || '') })),", replace: '    breakdown: [],' },
    { name: 'app: the coach read no longer sets the avatar tier', file: APP, find: '          try { window.ShapeScore = { points: d.total, tier: d.current_tier }; } catch (e) {}', replace: '' },
    { name: 'app: a coach\'s ledger read writes the member tier over the avatar again', file: APP, find: "          if (!_coach) { try { window.ShapeScore = { points: d.points_total || 0, tier: d.current_tier ? d.current_tier.name : 'Base' }; } catch (e) {} }", replace: "          try { window.ShapeScore = { points: d.points_total || 0, tier: d.current_tier ? d.current_tier.name : 'Base' }; } catch (e) {}" },
    { name: 'app: the breakdown\'s figures keep the route\'s English', file: APP, find: '              const sub = !term || n == null ? b.sub', replace: '              const sub = true ? b.sub' },
    { name: 'app: a nutritionist is shown the programs term', file: APP, find: "BS_COACH_SCORE_FORMULA.nutritionist = BS_COACH_SCORE_FORMULA.trainer.filter((r) => r.id !== 'coachPrograms');", replace: 'BS_COACH_SCORE_FORMULA.nutritionist = BS_COACH_SCORE_FORMULA.trainer;' },
    { name: 'app: the programs term is priced wrong', file: APP, find: "capKey: 'perProgram', name: 'Programs published', pts: '+80',", replace: "capKey: 'perProgram', name: 'Programs published', pts: '+40'," },

    // ── The app: the unread state ──────────────────────────────────────────────
    { name: 'app: any payload is a score', file: APP, find: "  return !!(d && typeof d.total === 'number' && Number.isFinite(d.total)\n    && typeof d.current_tier === 'string' && d.current_tier && Array.isArray(d.breakdown));", replace: '  return !!d;' },
    { name: 'app: a failed read shows the sample', file: APP, find: "    return { ...bsCoachUnreadProfile(profile.roleLabel, mine && coachRead.state === 'failed' ? 'failed' : 'loading'), retry: () => setAttempt((n) => n + 1) };", replace: "    return { ...profile, coachRole, scoreSource: 'coach', scoreState: 'preview', live: false, momentum: null, activities: BS_COACH_SCORE_FORMULA[coachRole], penalties: [] };" },
    { name: 'app: a failed read reads as still loading', file: APP, find: "    return { ...bsCoachUnreadProfile(profile.roleLabel, mine && coachRead.state === 'failed' ? 'failed' : 'loading'), retry: () => setAttempt((n) => n + 1) };", replace: "    return { ...bsCoachUnreadProfile(profile.roleLabel, 'loading'), retry: () => setAttempt((n) => n + 1) };" },
    { name: 'app: a thrown fetch never settles', file: APP, find: "        .catch(() => { if (current()) setCoachRead({ state: 'failed', data: null, role: coachRole }); });", replace: '        .catch(() => {});' },
    { name: 'app: one role\'s score is shown for another', file: APP, find: "    const mine = coachRead.role === coachRole;", replace: '    const mine = true;' },
    { name: 'app: Try again does nothing', file: APP, find: '  }, [loggedIn, coachRole, attempt]);', replace: '  }, [loggedIn, coachRole]);' },
    { name: 'app: a sign-out mid-read lands the old score', file: APP, find: '      const current = () => !cancelled && gen === (window.__bsSessionGen || 0);', replace: '      const current = () => !cancelled;' },
    { name: 'app: the unread tier ignores the avatar\'s', file: APP, find: "    total: null, tier: held ? bsCoachTier(held) : 'Certified',", replace: "    total: null, tier: 'Certified'," },

    // ── The app: what a coach's page shows ─────────────────────────────────────
    { name: 'app: a coach gets the weekly commitment', file: APP, find: '      {!isCoach && <BSCommitmentCard />}', replace: '      <BSCommitmentCard />' },
    { name: 'app: a coach gets the Rewards tab', file: APP, find: "          ? [['breakdown', 'Breakdown'], ['tiers', 'Tiers'], ['points', 'Points']]", replace: "          ? [['breakdown', 'Breakdown'], ['tiers', 'Tiers'], ['rewards', 'Rewards'], ['points', 'Points']]" },
    { name: 'app: a coach opens on the Tiers tab', file: APP, find: "  const [scoreTab, setScoreTab] = useStateBSC(isCoach ? 'breakdown' : 'tiers');", replace: "  const [scoreTab, setScoreTab] = useStateBSC('tiers');" },
    { name: 'app: a coach is told the ledger\'s rules', file: APP, find: "                <div style={{ fontFamily: t.BODY, fontSize: 12, color: t.INK70, lineHeight: 1.5 }}>{isCoach\n", replace: "                <div style={{ fontFamily: t.BODY, fontSize: 12, color: t.INK70, lineHeight: 1.5 }}>{false\n" },
    { name: 'app: a coach is sent to spend points', file: APP, find: "              {!isCoach && <div onClick={onOpenStore} style={{ marginTop: 13,", replace: "              {<div onClick={onOpenStore} style={{ marginTop: 13," },
    { name: 'app: a coach register shows the week and streak', file: APP, find: "        {(isCoach\n          ? [['reg.score', scoreTotal.toLocaleString(), t.INK], ['reg.next',", replace: "        {(false\n          ? [['reg.score', scoreTotal.toLocaleString(), t.INK], ['reg.next'," },
    { name: 'app: a coach past 10,000 is toasted Legend', file: APP, find: '        if (isCoach) return;\n', replace: '' },
    { name: 'app: the unread verdict names no failure', file: APP, find: "            {profile.scoreState === 'failed'\n              ? tr('score:coach.unread.title', { defaultValue: 'Your score couldn’t be read just now.' })\n              : tr('score:coach.loading', { defaultValue: 'Reading your score…' })}\n          </div>\n          {profile.scoreState", replace: "            {false\n              ? tr('score:coach.unread.title', { defaultValue: 'Your score couldn’t be read just now.' })\n              : tr('score:coach.loading', { defaultValue: 'Reading your score…' })}\n          </div>\n          {profile.scoreState" },

    // ── The website: only a 401 is the sample ──────────────────────────────────
    ...website('a 401 is not the sample', '      .then(r => (r.status === 401 ? signedOut : r.ok ? r.json() : null))', '      .then(r => (r.ok ? r.json() : null))'),
    ...website('a failed read shows the sample', '        else setRead({ state: "failed", score: null });', '        else setRead({ state: "sample", score: SAMPLE });'),
    ...website('a thrown fetch shows the sample', '      .catch(() => { if (alive) setRead({ state: "failed", score: null }); });', '      .catch(() => { if (alive) setRead({ state: "sample", score: SAMPLE }); });'),
    ...website('any payload is a score', "        else if (d && typeof d.total === 'number' && Number.isFinite(d.total) && typeof d.current_tier === 'string' && Array.isArray(d.breakdown)) setRead({ state: \"ok\", score: d });", '        else if (d) setRead({ state: "ok", score: d });'),
    ...website('a good read is not shown', "        else if (d && typeof d.total === 'number' && Number.isFinite(d.total) && typeof d.current_tier === 'string' && Array.isArray(d.breakdown)) setRead({ state: \"ok\", score: d });", "        else if (false) setRead({ state: \"ok\", score: d });"),
    ...website('the unread headline names no failure', '    : { title: "—", eyebrow: read.state === "failed" ? "COACH SCORE · COULDN\'T READ" : "COACH SCORE" };', '    : { title: "—", eyebrow: "COACH SCORE" };'),
    ...website('the sample is not labelled in the headline', '    ? { title: score.total.toLocaleString(), eyebrow: `COACH SCORE · ${tierLabel}${read.state === "sample" ? " · SAMPLE" : ""}` }', '    ? { title: score.total.toLocaleString(), eyebrow: `COACH SCORE · ${tierLabel}` }'),
    ...website('the demo band is not shown for the sample', '      {read.state === "sample" && typeof DashDemoBand === "function" && <DashDemoBand />}', ''),
    ...website('the path card is the old fixed figure', '          ? `${Math.max(0, Number(score.points_to_next) || 0).toLocaleString()} more points.', '          ? `8,580 more points.'),
    // ── Codex on #2400: a coach's every listing of the role, the named one or the oldest ──
    { name: 'codex-2400 route: the named listing is ignored', file: ROUTE,
      find: '  const providerId = (owned.find((p) => p.id === asked) ?? owned[0]).id;', replace: '  const providerId = owned[0].id;' },
    { name: 'codex-2400 route: any listing id asked for is read, owned or not', file: ROUTE,
      find: '  const providerId = (owned.find((p) => p.id === asked) ?? owned[0]).id;', replace: '  const providerId = asked > 0 ? asked : owned[0].id;' },
    { name: 'codex-2400 route: the listings come in no order', file: ROUTE,
      find: "    .eq('owner_id', user.id)\n    .order('id', { ascending: true });", replace: "    .eq('owner_id', user.id);" },
    { name: 'codex-2400 route: a failed listing read is "no listing"', file: ROUTE,
      find: '  if (listErr) {', replace: '  if (false) {' },
    // ── The score counts distinct open clients (owner, 2026-10-18; Codex round 5 on #2400) ──
    { name: 'score route: counts plans again', file: ROUTE,
      find: "(r.client_id != null ? 'c:' + r.client_id : 'sub:' + r.id)", replace: "('sub:' + r.id)" },
    { name: 'score route: a retrying client earns nothing', file: ROUTE,
      find: "        .in('status', OPEN_SUB_STATUSES);", replace: "        .in('status', ['active', 'trialing']);" },
    { name: 'score route: a failed walk is a zero', file: ROUTE,
      find: '  const failed = [activeRes, sessTotalRes, sessDoneRes, workoutsRes]', replace: '  const failed = [sessTotalRes, sessDoneRes, workoutsRes]' },
    ...[['get_coach_scores', 'join ids on ids.id = s.provider_id'], ['shape_coach_score_parts', 'join listings l on l.id = s.provider_id']].map(([fn, join]) => ({
      name: `score sql: ${fn} counts plans, active and trialing only, again`, file: 'supabase-migrations/2026-10-18-coach-score-distinct-clients.sql',
      find: `           count(distinct coalesce(s.client_id::text, 'sub:' || s.id::text))\n             filter (where s.status in ('active', 'trialing', 'past_due')) as active_clients\n    from public.subscriptions s\n    ${join}`,
      replace: `           count(*) filter (where s.status in ('active', 'trialing')) as active_clients\n    from public.subscriptions s\n    ${join}`,
    })),
    { name: 'trainer page: the programs term is priced wrong', file: TRAINER, find: `    ["Programs published", "Per program · each program you've published", "+80"],`, replace: `    ["Programs published", "Per program · each program you've published", "+40"],` },
  ],
};
