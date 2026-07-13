// reactionVerbs.mjs — the feed reaction verb system.
//
// There is ONE unified reaction count per post (the social-currency tally). The
// VERB is display-only: it's derived from the post's activity type and shown on
// the same single button (e.g. "Beast · 42"). The verb never forks the count —
// changing the word never changes the number.
//
// Buckets (10): strength · pr/milestone · run/endurance · swim · cycle ·
// recovery/rest · nutrition · sleep · mobility/yoga · sport/other. Anything
// unknown falls back to `sport` → "Props" (never blank, and never a
// strength-only word like "Spot" on a non-strength post).

export const BS_REACTION_VERBS = {
  strength:  'Spot',
  pr:        'Beast',      // pr / milestone (a training new-best)
  run:       'Respect',    // run / endurance
  swim:      'Gliding',
  cycle:     'Watts',
  recovery:  'Smart',      // recovery / rest
  nutrition: 'Locked in',
  sleep:     'Recharged',
  mobility:  'Centered',   // mobility / yoga
  career:    'Onward',     // work milestone (THE APPOINTMENTS, spec 2026-07-13)
  sport:     'Props',      // default / fallback (sport / anything else)
};

// Normalize any raw type token — the composer's woType ("Strength"/"Run"/"Ride"/
// "Conditioning"/"Mobility"), the `activity_type` column, a sensor-imported
// workout name (Strava/Whoop/Garmin), or a demo card kind — into ONE canonical
// bucket. PR/milestone is a card-level signal (a new-best delta), handled by
// bsReactionType below, NOT here.
export function bsActivityBucket(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (!s) return 'sport';
  // Work milestones stamp activity_type 'milestone' at the composer (spec
  // 2026-07-13) — an exact token, never a name-content guess. Checked first
  // so no later pattern can shadow it.
  if (s === 'milestone') return 'career';
  if (/swim/.test(s)) return 'swim';
  if (/(cycl|\bbike\b|\bride\b|\bspin\b|watt|peloton)/.test(s)) return 'cycle';
  if (/(run|jog|sprint|\b5k\b|\b10k\b|marathon|endurance|cardio|condition|\brow\b|\berg\b|walk|hike|hiit)/.test(s)) return 'run';
  if (/(yoga|mobility|stretch|flexib|pilates|warm.?up|cool.?down)/.test(s)) return 'mobility';
  if (/(sleep|\bnap\b|recharge)/.test(s)) return 'sleep';
  if (/(recovery|\brest\b|rest day|deload|off day|active.?recovery)/.test(s)) return 'recovery';
  if (/(nutrition|\bmeal\b|\bfood\b|macro|\bdiet\b|\beat)/.test(s)) return 'nutrition';
  if (/(strength|lift|weight|squat|bench|deadlift|press|hypertroph|power|workout|\bgym\b|session|training)/.test(s)) return 'strength';
  return 'sport';
}

// Full resolver: PR/milestone wins over the base bucket so a strength PR reads
// "Beast", not "Spot". `isPR` is true when the post carries a new-best delta or
// is an explicit milestone post.
export function bsReactionType(raw, opts) {
  if (opts && opts.isPR) return 'pr';
  return bsActivityBucket(raw);
}

// Canonical bucket → verb, with the Props fallback baked in. Accepts a bucket
// key; an unknown key still resolves to "Props" rather than blank.
export function bsReactionVerb(type) {
  return BS_REACTION_VERBS[type] || BS_REACTION_VERBS.sport;
}

// Phase 2 — the long-press expressive palette. A press-and-hold on the reaction
// opens these alternates; picking one re-labels YOUR reaction but stays the SAME
// unified like (the count never forks). All TEXT, no emoji.
export const BS_REACTION_EXPRESSIONS = ['Fire', 'Props', 'Crushing it', "Don't stop"];

// The palette for a given card: its activity-default verb leads (the contextual
// choice), followed by the universal expressions with the default de-duped out.
export function bsReactionPalette(defaultVerb) {
  const lead = String(defaultVerb || '').trim();
  const rest = BS_REACTION_EXPRESSIONS.filter((w) => w.toLowerCase() !== lead.toLowerCase());
  return lead ? [lead, ...rest] : rest.slice();
}
