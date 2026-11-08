// Mutation spec for client tier colours and the lifts that pop (owner, 2026-11-06): the tier from
// rank points and nothing else (clientColors.mjs), the roster's rank read (roster-rank-points.mjs,
// coach-roster.ts), the record and its quiet re-read (dashData.jsx), the preview's standings
// (dashSignals.js), the marks on the board and the roster (dashToday.jsx, dashRoster.jsx), the
// ring and the lifts (dash.css). Every mutation must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/client-tier-colours-2026-11-08.mutations.mjs --fail-on-skipped
const CC = 'public/newdesign/clientColors.mjs';
const RP = 'src/lib/roster-rank-points.mjs';
const ROSTER_TS = 'src/lib/coach-roster.ts';
const DATA = 'public/newdesign/dashData.jsx';
const SIG = 'public/newdesign/dashSignals.js';
const TODAY = 'public/newdesign/dashToday.jsx';
const ROSTER = 'public/newdesign/dashRoster.jsx';
const CSS = 'public/newdesign/dash.css';

export default {
  test: 'node --test tests/client-tier-colours.test.mjs tests/dash-today-board.test.mjs tests/dash-depth.test.mjs',
  timeoutMs: 240_000,
  mutations: [
    // ── a tier from rank points, never Raw by default ──
    { name: 'tier: a negative number is Raw', file: CC, find: '    let t = null;\n    for (const x of MEMBER_TIERS) if (v >= x.min) t = x;', replace: '    let t = MEMBER_TIERS[0];\n    for (const x of MEMBER_TIERS) if (v >= x.min) t = x;' },
    { name: 'tier: null is Raw', file: CC, find: "function tierOf(v) {\n  if (typeof v === 'number') {", replace: "function tierOf(v) {\n  if (v == null) return MEMBER_TIERS[0];\n  if (typeof v === 'number') {" },
    { name: 'tier: a numeric string is points', file: CC, find: 'return MEMBER_TIERS.find((x) => x.key === k) || null;', replace: 'return MEMBER_TIERS.find((x) => x.key === k) || tierOf(Number(k));' },
    { name: 'tier: a threshold is exclusive', file: CC, find: 'for (const x of MEMBER_TIERS) if (v >= x.min) t = x;', replace: 'for (const x of MEMBER_TIERS) if (v > x.min) t = x;' },
    { name: 'tier: Peak drifts off the canonical colour', file: CC, find: "label: 'Peak', min: 5000, color: '#8fe3e6'", replace: "label: 'Peak', min: 5000, color: '#8fe3e7'" },
    { name: 'tier: Tempo starts at 700', file: CC, find: "label: 'Tempo', min: 750,", replace: "label: 'Tempo', min: 700," },
    { name: 'tier: no words for the tier', file: CC, find: "title: t.label + ' tier'", replace: 'title: t.label' },
    { name: 'calendar: a session\'s colour moves with the paper', file: CC, find: 'light: t.color, dark: t.color, color: t.color, tier: t.key,', replace: "light: t.color, dark: t.color, color: paperTone(paper) === 'dark' ? t.color : '#15211e', tier: t.key," },
    { name: 'calendar: an unknown tier is Raw', file: CC, find: 'const t = clientTier(clientTierOrPoints);', replace: 'const t = clientTier(clientTierOrPoints) || clientTier(0);' },

    // ── the roster's rank read ──
    { name: 'read: a member with no ledger is unknown, not 0', file: RP, find: 'const got = new Map(chunk.map((id) => [id, 0]));', replace: 'const got = new Map();' },
    { name: 'read: unreadable points are 0', file: RP, find: '      else got.delete(id);\n', replace: '' },
    { name: 'read: an upper-case id misses its row', file: RP, find: "const id = row && typeof row.user_id === 'string' ? row.user_id.toLowerCase() : null;", replace: "const id = row && typeof row.user_id === 'string' ? row.user_id : null;" },
    { name: 'read: a failed chunk reads as no ledger', file: RP, find: "if (!res || res.error || !Array.isArray(res.data)) {", replace: "if (!res) {" },
    { name: 'route: an unread tier ships as 0', file: ROSTER_TS, find: 'rankPoints: e.id ? rankPoints.get(e.id.toLowerCase()) ?? null : null,', replace: 'rankPoints: e.id ? rankPoints.get(e.id.toLowerCase()) ?? 0 : null,' },
    { name: 'route: the 401 is cacheable', file: ROSTER_TS, find: "return privateJson({ error: 'Authentication required.' }, { status: 401 });", replace: "return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });" },

    // ── the record and the quiet re-read ──
    { name: 'record: a missing tier is 0', file: DATA, find: 'row.rankPoints >= 0 ? row.rankPoints : null,', replace: 'row.rankPoints >= 0 ? row.rankPoints : 0,' },
    { name: 'record: a quiet re-read drops the tier it had', file: DATA, find: 'return prior != null ? { ...rec, rankPoints: prior } : rec;', replace: 'return rec;' },
    { name: 'record: a kept record misses the new tier', file: DATA, find: 'return fresh != null && fresh !== kept.rankPoints ? { ...kept, rankPoints: fresh } : kept;', replace: 'return kept;' },

    // ── the preview's standings ──
    { name: 'preview: no standings', file: SIG, find: 'rankPoints: STANDING[id] != null ? STANDING[id] : null,', replace: 'rankPoints: null,' },
    { name: 'preview: Tess outranks her own weeks', file: SIG, find: '8: 610, 9: 39, 10: 3720', replace: '8: 610, 9: 390, 10: 3720' },

    // ── the marks on the board ──
    { name: 'board: the brief names no tier', file: TODAY, find: 'name: p.name || "A client", points: dashRecordTier(r && r.client) };', replace: 'name: p.name || "A client", points: null };' },
    { name: 'board: the next appointment has no tier', file: TODAY, find: 'id: rec && rec.profile ? rec.profile.id : null, points: dashRecordTier(rec) } : null,', replace: 'id: rec && rec.profile ? rec.profile.id : null } : null,' },
    { name: 'board: the dot can wrap away from the name', file: TODAY, find: '{m ? <span style={{ whiteSpace: "nowrap" }}><DashTierDot', replace: '{m ? <span><DashTierDot' },
    { name: 'board: a done session keeps its mark', file: TODAY, find: 'const points = r.done ? null : tierOf(r.who);', replace: 'const points = tierOf(r.who);' },
    { name: 'board: Up next has no mark', file: TODAY, find: 'points={single ? dashRecordTier(rec) : null} size={10}', replace: 'points={null} size={10}' },
    { name: 'board: an unknown gem takes a status colour', file: TODAY, find: 'data-tier-unknown="" style={{ ...box, boxShadow: "inset 0 0 0 1px var(--sh-line2, #413d38)" }}', replace: 'data-tier-unknown="" style={{ ...box, background: DASH_SEV_COLORS.unknown }}' },
    { name: 'board: the name takes the tier\'s colour', file: TODAY, find: '<span title={tier ? tier.title : undefined} style={{ fontSize: 14, fontWeight: 600 }}>{it.name}</span>', replace: '<span title={tier ? tier.title : undefined} style={{ fontSize: 14, fontWeight: 600, color: tier ? tier.style["--tier-mark"] : undefined }}>{it.name}</span>' },
    { name: 'board: an open-able row does not say the tier', file: TODAY, find: 'aria-label={canOpen ? "Open " + it.name + (tier ? ", " + tier.title : "") : undefined}', replace: 'aria-label={canOpen ? "Open " + it.name : undefined}' },
    { name: 'board: the fold\'s gems are read aloud inside its button', file: TODAY, find: 'title={it.name} decorative />', replace: 'title={it.name} />' },

    // ── the roster's row ──
    { name: 'roster: the row does not say the tier', file: ROSTER, find: 'aria-label={"Open " + rec.profile.name + " drilldown" + (tier ? ", " + tier.title : "")}', replace: 'aria-label={"Open " + rec.profile.name + " drilldown"}' },
    { name: 'roster: the bare status square is back', file: ROSTER, find: '              {tier\n                ? <span className="sh-tier-mark"', replace: '              <span style={{ width: 7, height: 7, flexShrink: 0, borderRadius: 2, background: sevColor }} />\n              {tier\n                ? <span className="sh-tier-mark"' },
    { name: 'roster: an unknown tier is a coloured square', file: ROSTER, find: 'const tier = dashClientTierMark(rec.rankPoints);', replace: 'const tier = dashClientTierMark(rec.rankPoints == null ? 0 : rec.rankPoints);' },

    // ── the ring ──
    { name: 'ring: none on White and Bone', file: CSS, find: '.sh-tier-mark { background: var(--tier-mark); box-shadow: inset 0 0 0 1px var(--sh-ink2, #5a6763); }', replace: '.sh-tier-mark { background: var(--tier-mark); box-shadow: none; }' },
    { name: 'ring: none for Form on Glass', file: CSS, find: 'html[data-paper="glass"] .sh-tier-mark[data-tier="form"] { box-shadow: inset 0 0 0 1px var(--sh-ink2, #b0bacb); }\n', replace: '' },
    { name: 'ring: every tier ringed on the dark papers', file: CSS, find: 'html:is([data-paper="dark"], [data-paper="carbon"], [data-paper="night"], [data-paper="glass"]) .sh-tier-mark { box-shadow: none; }\n', replace: '' },

    // ── the lifts pop ──
    { name: 'lifts: Night\'s Lift 2 casts no deeper than Lift 1', file: CSS, find: '  --lift-2-cast: 0 0 0 1px rgba(240,212,164,0.1), 0 2px 4px rgba(0,0,0,0.5), 0 30px 56px -16px rgba(0,0,0,0.9);', replace: '  --lift-2-cast: 0 0 0 1px rgba(240,212,164,0.1), 0 1px 2px rgba(0,0,0,0.45), 0 16px 34px -12px rgba(0,0,0,0.8);' },
    { name: 'lifts: Carbon\'s Lift 2 edge as dim as Dark\'s', file: CSS, find: '--lift-2-edge: inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(0,0,0,0.5);', replace: '--lift-2-edge: inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.5);' },
    { name: 'lifts: Bone back to White\'s alphas', file: CSS, find: '  --lift-1-cast: 0 1px 1px rgba(26,22,14,0.09), 0 2px 6px -1px rgba(26,22,14,0.13), 0 14px 30px -10px rgba(26,22,14,0.3);', replace: '  --lift-1-cast: 0 1px 1px rgba(26,22,14,0.05), 0 2px 5px -1px rgba(26,22,14,0.07), 0 12px 28px -10px rgba(26,22,14,0.18);' },
    { name: 'lifts: Night lit in white', file: CSS, find: '--lift-2-edge: inset 0 1px 0 rgba(240,212,164,0.28),', replace: '--lift-2-edge: inset 0 1px 0 rgba(255,255,255,0.28),' },
    { name: 'lifts: Glass\'s Lift 2 loses its hairline', file: CSS, find: '  --lift-2-cast: 0 0 0 1px rgba(255,255,255,0.08), 0 2px 4px rgba(0,0,0,0.42),', replace: '  --lift-2-cast: 0 2px 4px rgba(0,0,0,0.42),' },
    { name: 'lifts: Glass\'s lip as light as Dark\'s', file: CSS, find: '--lift-1-edge: inset 0 1px 0 rgba(255,255,255,0.17), inset 0 -1px 0 rgba(0,0,0,0.35);', replace: '--lift-1-edge: inset 0 1px 0 rgba(255,255,255,0.17), inset 0 -1px 0 rgba(0,0,0,0.3);' },
    { name: 'lifts: Lift 0 is not flat', file: CSS, find: 'html[data-paper="bone"] {\n  --lift-0: 0 1px 2px rgba(26,22,14,0.06);', replace: 'html[data-paper="bone"] {\n  --lift-0: 0 2px 8px rgba(26,22,14,0.12);' },
  ],
};
