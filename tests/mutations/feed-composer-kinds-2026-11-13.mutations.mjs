// Mutation spec for the web composer's kinds persisting (Codex P2 on #2736): a Meal, Workout,
// Run or PR picked in the composer or the message box's chips is written as the marker the
// feed files by. Each mutation breaks one clause; every one must be killed. From the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/feed-composer-kinds-2026-11-13.mutations.mjs --fail-on-skipped
const FEED = 'public/newdesign/communityFeed.jsx';

export default {
  test: 'node --test tests/feed-composer-kinds.test.mjs',
  timeoutMs: 120_000,
  mutations: [
    { name: 'a meal is written as a workout', file: FEED,
      find: "  if (k === 'meal') return 'meal';",
      replace: "  if (k === 'meal') return 'workout';" },
    { name: 'a meal writes no marker', file: FEED,
      find: "  if (k === 'meal') return 'meal';\n",
      replace: '' },
    { name: 'a run writes no marker', file: FEED,
      find: "  if (k === 'workout' || k === 'run' || k === 'pr') return 'workout';",
      replace: "  if (k === 'workout' || k === 'pr') return 'workout';" },
    { name: 'a PR writes no marker', file: FEED,
      find: "  if (k === 'workout' || k === 'run' || k === 'pr') return 'workout';",
      replace: "  if (k === 'workout' || k === 'run') return 'workout';" },
    { name: 'a workout writes no marker', file: FEED,
      find: "  if (k === 'workout' || k === 'run' || k === 'pr') return 'workout';",
      replace: "  if (k === 'run' || k === 'pr') return 'workout';" },
    { name: 'a plain post is marked a workout', file: FEED,
      find: "  if (k === 'workout' || k === 'run' || k === 'pr') return 'workout';\n  return null;",
      replace: "  if (k === 'workout' || k === 'run' || k === 'pr') return 'workout';\n  return k ? 'workout' : null;" },
    { name: 'a video loses its kind to the chip', file: FEED,
      find: "  if (!post || post.video || k === 'milestone' || k === 'video') return null;",
      replace: "  if (!post || k === 'milestone' || k === 'video') return null;" },
    { name: 'a milestone loses its kind', file: FEED,
      find: "  if (!post || post.video || k === 'milestone' || k === 'video') return null;",
      replace: "  if (!post || post.video || k === 'video') return null;" },
    { name: 'the create path drops the marker', file: FEED,
      find: '            if (kindMarker) metrics.kind = kindMarker;\n',
      replace: '' },
  ],
};
