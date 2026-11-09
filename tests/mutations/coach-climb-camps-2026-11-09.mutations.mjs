// Mutation spec for the Climb's camps and the coach's accent in the app (owner, 2026-11-09: one camp list
// on the website and in the app; the accent tints the drawing, never the words): BSTrainerProfile.jsx
// picks the camps and reads them, BSCoachClimb.jsx draws them. tests/coach-climb.test.mjs must notice
// every one. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/coach-climb-camps-2026-11-09.mutations.mjs --fail-on-skipped
const PAGE = 'mobile-app/src/broadsheet/BSTrainerProfile.jsx';
const CLIMB = 'mobile-app/src/broadsheet/BSCoachClimb.jsx';

export default {
  test: 'node --test tests/coach-climb.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── the camps ──
    { name: 'page: Proof for a reader the reviews are locked for', file: PAGE,
      find: 'const winsShown = isPrivate || demo || (reviews && reviews.locked) ? [] : wins;', replace: 'const winsShown = isPrivate || demo ? [] : wins;' },
    { name: 'page: Proof on a sample', file: PAGE,
      find: 'const winsShown = isPrivate || demo || (reviews && reviews.locked) ? [] : wins;', replace: 'const winsShown = isPrivate || (reviews && reviews.locked) ? [] : wins;' },
    { name: 'page: Find me holds About too', file: PAGE,
      find: "  const shown = part === 'find' ? sections.filter(([k]) => ABOUT_FIND_PARTS.includes(k))", replace: "  const shown = part === 'find' ? sections" },
    { name: 'page: About keeps the links and the practice', file: PAGE,
      find: "    : part === 'about' ? sections.filter(([k]) => !ABOUT_FIND_PARTS.includes(k)) : sections;", replace: '    : sections;' },
    { name: 'page: an empty Find me shown to a visitor', file: PAGE,
      find: "    (isSelf || hasFind) ? ['find'", replace: "    true ? ['find'" },
    { name: 'page: no Book camp', file: PAGE,
      find: "    // The week's open times: the website's \"Book\" camp, right after Base, always (the coach books here).\n    ['day',", replace: "    // The week's open times: the website's \"Book\" camp, right after Base, always (the coach books here).\n    null && ['day'," },
    { name: 'page: Base without the photo posts', file: PAGE,
      find: "  const photoPosts = activity.filter((a) => a && typeof a.photo === 'string' && /^(https:\\/\\/|\\/[^/\\\\])/.test(a.photo)).slice(0, 6)", replace: '  const photoPosts = [].slice(0, 6)' },
    // ── a read that failed ──
    { name: 'page: a failed posts read is quiet', file: PAGE,
      find: '    }).catch(() => { if (on) setPostsErr(true); });', replace: '    }).catch(() => {});' },
    { name: 'page: a failed plans read is quiet', file: PAGE,
      find: '.catch(() => { if (on) { setSalePlans([]); setPlansErr(true); } });', replace: '.catch(() => { if (on) { setSalePlans([]); } });' },
    { name: 'page: a failed reviews read is quiet', file: PAGE,
      find: '.catch(() => { if (on) setRevErr(true); });', replace: '.catch(() => {});' },
    { name: 'page: Try again on the posts reads nothing', file: PAGE,
      find: 'onRetry={() => setPostsNonce((n) => n + 1)} />', replace: 'onRetry={() => {}} />' },
    // ── the accent ──
    { name: 'page: the accent is not handed to the Climb', file: PAGE,
      find: "accent={isPrivate ? null : bsClimbAccent(look.accent, nutri ? 'nutritionist' : 'trainer')}", replace: 'accent={null}' },
    { name: 'climb: an accent that is no hex is drawn', file: CLIMB,
      find: "  const DRAW = /^#[0-9a-f]{6}$/i.test(String(accent || '')) ? accent : ACC;", replace: '  const DRAW = accent || ACC;' },
    { name: 'climb: the full stop keeps the role colour', file: CLIMB,
      find: '<span aria-hidden="true" data-climb-stop="" style={{ color: DRAW }}>', replace: '<span aria-hidden="true" data-climb-stop="" style={{ color: ACC }}>' },
    { name: 'page: a sample\'s pinned review left out of Words', file: PAGE,
      find: '  const quotesRest = winsShown.length ? quotes.filter((r) => !r.pinned) : quotes;', replace: '  const quotesRest = quotes.filter((r) => !r.pinned);' },
    { name: 'climb: a camp title\'s full stop keeps the role colour', file: CLIMB,
      find: 'data-climb-camp-stop="" style={{ color: DRAW }}', replace: 'data-climb-camp-stop="" style={{ color: ACC }}' },
    { name: 'climb: the role\'s own key is a pick', file: CLIMB,
      find: "  if (key === (role === 'nutritionist' ? 'amber' : 'teal')) return null;\n", replace: '' },
    { name: 'climb: an accent that does not show is drawn', file: CLIMB,
      find: "  return bsClimbContrast(hex, '#0a0e11') >= 1.6 ? hex : null;", replace: '  return hex;',
      // A proven no-op today: every accent in CLIMB_ACCENTS clears 1.6 on the Climb's ground (black is
      // read as white), which coach-climb.test.mjs asserts; the floor guards a future accent.
      expectSurvive: true },
    { name: 'climb: the eyebrow takes the accent', file: CLIMB,
      find: "{who.eyebrow ? <div data-climb-eyebrow=\"\" style={{ ...mono(10, ACC), lineHeight: 1.5 }}>", replace: "{who.eyebrow ? <div data-climb-eyebrow=\"\" style={{ ...mono(10, DRAW), lineHeight: 1.5 }}>" },
    { name: 'climb: the tab you are at takes the accent', file: CLIMB,
      find: "color: on ? ACC : CLIMB.MUTED, ...mono(10.5, on ? ACC : CLIMB.MUTED)", replace: "color: on ? DRAW : CLIMB.MUTED, ...mono(10.5, on ? DRAW : CLIMB.MUTED)" },
    { name: 'climb: the spine keeps the role colour', file: CLIMB,
      find: 'background: `linear-gradient(180deg, ${DRAW}, ${hexA(DRAW, 0.25)})` }} />', replace: 'background: `linear-gradient(180deg, ${ACC}, ${hexA(ACC, 0.25)})` }} />' },
    { name: 'climb: a black accent drawn black on the dark', file: CLIMB,
      find: "white: '#ffffff', black: '#ffffff',", replace: "white: '#ffffff', black: '#000000'," },
    { name: 'climb: a raw hex reads as an accent', file: CLIMB,
      find: "  if (typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(CLIMB_ACCENTS, key)) return null;", replace: "  if (typeof key === 'string' && /^#[0-9a-f]{6}$/i.test(key)) return key;\n  if (typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(CLIMB_ACCENTS, key)) return null;" },
  ],
};
