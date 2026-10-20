// Mutation spec for custom goals (owner, 2026-10-20: "make sure user can make custom goals";
// "Website sign-up too"; "Show the goal's words"): the website sign-up's own-words goal
// (signup.jsx), its tidy-up and record writes on the server (src/lib/signup-answers.mjs), the
// app's tidy-up, and the Goal card and Home door that read a goal that isn't about weight in
// words (iosAppBroadsheetClient.jsx). Every mutation must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/custom-goals-2026-10-20.mutations.mjs --fail-on-skipped
const SERVER = 'src/lib/signup-answers.mjs';
const FORM = 'public/newdesign/signup.jsx';
const APP = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';

export default {
  test: 'node --test tests/custom-goal.test.mjs tests/signup-answers.test.mjs tests/primary-goal-token.test.mjs tests/intent-step-i18n.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── The server's tidy-up and records ──
    { name: 'control characters are kept', file: SERVER, find: "text.replace(/\\p{Cc}/gu, ' ').replace(/\\s+/g, ' ')", replace: "text.replace(/\\s+/g, ' ')" },
    { name: 'the words have no length cap', file: SERVER, find: '.slice(0, SIGNUP_GOAL_MAX)', replace: '' },
    { name: 'a listed goal typed out stays words', file: SERVER, find: '  return listed ? listed.id : s;', replace: '  return s;' },
    { name: 'a listed goal typed out matches its label only in its case', file: SERVER, find: "SIGNUP_GOALS.find((g) => g.en.toLowerCase() === s.toLowerCase())", replace: 'SIGNUP_GOALS.find((g) => g.en === s)' },
    { name: 'the sign-up drops the words', file: SERVER, find: ' || signupGoalFromText(raw.goalText) || null;', replace: ';' },
    { name: 'the words beat a listed goal', file: SERVER, find: "oneOf(raw.goal, SIGNUP_GOALS.map((g) => g.id)) || signupGoalFromText(raw.goalText) || null;", replace: "signupGoalFromText(raw.goalText) || oneOf(raw.goal, SIGNUP_GOALS.map((g) => g.id)) || null;" },
    { name: 'the profile mirror gets the token, not its label', file: SERVER, find: "fill('client_identity', { goal: goalLabel(answers.goal) });", replace: "fill('client_identity', { goal: answers.goal });" },

    // ── The website form ──
    { name: 'the words ride along with a listed goal', file: FORM, find: 'const own = v.goal === SU_OWN_GOAL ? String(v.goalText || "").trim() : "";', replace: 'const own = String(v.goalText || "").trim();' },
    { name: 'blank words are sent', file: FORM, find: '    ...(own ? { goalText: own } : {}),', replace: '    goalText: own,' },
    { name: "the website's field has no limit", file: FORM, find: ' maxLength={SU_GOAL_MAX}', replace: '' },
    { name: 'the website offers no own-words chip', file: FORM, find: '          <Chip on={v.goal === SU_OWN_GOAL} onClick={() => set({ goal: SU_OWN_GOAL })}>{SU_OWN_GOAL}</Chip>\n', replace: '' },

    // ── The app's tidy-up ──
    { name: 'the app keeps control characters', file: APP, find: "String(text == null ? '' : text).replace(/\\p{Cc}/gu, ' ').replace(/\\s+/g, ' ')", replace: "String(text == null ? '' : text).replace(/\\s+/g, ' ')" },

    // ── Which goals have a weight read ──
    { name: 'every goal is a weight goal', file: APP, find: '  return !s || BS_WEIGHT_GOAL_IDS.includes(s);', replace: '  return true;' },
    { name: 'no goal yet reads in words', file: APP, find: '  return !s || BS_WEIGHT_GOAL_IDS.includes(s);', replace: '  return BS_WEIGHT_GOAL_IDS.includes(s);' },
    { name: 'a race counts as a weight goal', file: APP, find: "const BS_WEIGHT_GOAL_IDS = ['fat_loss', 'muscle', 'recomp', 'maintain', 'tone'];", replace: "const BS_WEIGHT_GOAL_IDS = ['fat_loss', 'muscle', 'recomp', 'maintain', 'tone', 'strength'];" },
    { name: 'toning reads in words', file: APP, find: "const BS_WEIGHT_GOAL_IDS = ['fat_loss', 'muscle', 'recomp', 'maintain', 'tone'];", replace: "const BS_WEIGHT_GOAL_IDS = ['fat_loss', 'muscle', 'recomp', 'maintain'];" },

    // ── The Goal card ──
    { name: 'a weight target set still reads in words', file: APP, find: '  const wordsOnly = !hasGoal && !bsPrimaryGoalIsWeight(data && data.primaryGoal);', replace: '  const wordsOnly = !bsPrimaryGoalIsWeight(data && data.primaryGoal);' },
    { name: 'the card keeps its weight figures for words', file: APP, find: "        {!wordsOnly && <div style={{ marginTop: 14, paddingTop: 12,", replace: "        {true && <div style={{ marginTop: 14, paddingTop: 12," },
    { name: 'the card says "No goal set yet" for words', file: APP, find: '      {!wordsOnly && <div style={{ margin: `18px ${t.padX}px 0` }}>', replace: '      {true && <div style={{ margin: `18px ${t.padX}px 0` }}>' },
    { name: 'the card does not name the goal', file: APP, find: ", goal: bsPrimaryGoalLabel(data.primaryGoal, tr) })}", replace: " })}" },

    // ── Home's Goal door ──
    { name: 'the door hides a goal in words', file: APP, find: '  if (bsGoalSignedIn && !g && !words) return null;', replace: '  if (bsGoalSignedIn && !g) return null;' },
    { name: 'the door reads a percentage for words', file: APP, find: '  if (words && !hasRange) {', replace: '  if (false) {' },
    { name: "the door's words are silent", file: APP, find: ' onOpen={onOpen} figureText={words}', replace: ' onOpen={onOpen}' },
    { name: 'a drawn figure says nothing', file: APP, find: ": (figureText || '');", replace: ": '';" },
    { name: "the door's words run off the row", file: APP, find: "whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{words}</span>", replace: "whiteSpace: 'nowrap' }}>{words}</span>" },
  ],
};
