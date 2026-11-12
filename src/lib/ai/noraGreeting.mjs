// Nora's greeting and four suggestions, per kind of account (the Ask Nora plan, step 2:
// "A greeting and four suggestions that fit the account"). One source for every panel:
// GET /api/support/chat answers with these, decided from the server's own verdicts, so
// the website widget, the older pages' panel, the Next app's button and the app's sheet
// all open the same way for the same account.
//
// ⚠ A SUGGESTION IS SENT AS THE MEMBER'S OWN QUESTION, so each one names something Nora
// can do today for that account. Nothing here offers a capability the route does not
// give that tier (the plan's later steps add the rest; their suggestions come with them).
// And no greeting promises a hand-off: nothing records a question for the team.

const EMAIL = 'info@theshapecommunity.com';

/** visitor · account (signed in, no plan) · member · trainer · nutritionist · admin */
export function greetingKind(signedIn, m, roles) {
  if (!signedIn) return 'visitor';
  if (m && m.isAdmin) return 'admin';
  const r = Array.isArray(roles) ? roles : [];
  if (m && m.isCoach) return r.includes('trainer') ? 'trainer' : 'nutritionist';
  if (m && m.isMember) return 'member';
  return 'account';
}

const GREETINGS = {
  visitor: {
    text: `Hi, I'm Nora, Shape's concierge. Ask me how Shape works, what it costs, or to find you a coach. For anything else, the Shape team reads ${EMAIL}.`,
    quick: ['Find me a coach', 'What does Shape cost?', 'How does coaching work?', 'Is a coach required?'],
  },
  account: {
    text: `Hi, I'm Nora. Your account is set up but there's no membership on it yet. I can explain what one includes, help you find a coach, or answer billing questions. The Shape team reads ${EMAIL}.`,
    quick: ['What does a membership include?', 'Find me a coach', 'How do I cancel or change my plan?', 'How does coaching work?'],
  },
  member: {
    text: `Hi, I'm Nora. I can look up your plan, log a meal, water or a weigh-in for you to confirm, set reminders, or find a coach. For anything I can't sort out, the Shape team reads ${EMAIL}.`,
    quick: ["What's on today?", 'How was my week?', 'Log a glass of water', 'Find me a coach'],
  },
  trainer: {
    text: `Hi, I'm Nora. I can tell you what needs you today, draft a workout or a program for you to review, look up a client, assign a session or move one. Nothing changes until you confirm it. The Shape team reads ${EMAIL}.`,
    quick: ['What needs me today?', 'Draft a 45-minute lower-body session', 'Draft a 4-week strength program', 'Look up a client'],
  },
  nutritionist: {
    text: `Hi, I'm Nora. I can tell you what needs you today, draft a meal plan from Shape's meal library, look up a client or set a client's goal, each drafted for you to confirm. The Shape team reads ${EMAIL}.`,
    quick: ['What needs me today?', 'Draft a 3-day cut meal plan', 'Look up a client', "Set a client's protein goal"],
  },
  admin: {
    text: `Hi, I'm Nora. I can look up an account by its email for a help-desk question (read-only, and every lookup is logged), answer how Shape works, and look up your own account. The Shape team reads ${EMAIL}.`,
    quick: ['Look up an account by email', 'What does Shape take from coaches?', 'What does a membership include?', 'How does the Verified badge work?'],
  },
};

// ⚠ A PLAIN PANEL CANNOT SHOW A CONFIRM CARD (the older pages' panel, the Next app's
// button: confirmCards false), so the route gives it no write tools. Its greeting must not
// offer to log, draft or assign either, or the first suggestion tapped would fail.
const PLAIN = {
  member: {
    text: `Hi, I'm Nora. I can look up your plan and your week, explain how Shape works, or find you a coach. To log or change something, ask me in the chat on the dashboard. The Shape team reads ${EMAIL}.`,
    quick: ["What's on today?", 'How was my week?', 'Find me a coach', 'How do I cancel or change my plan?'],
  },
  trainer: {
    text: `Hi, I'm Nora. I can tell you what needs you today, look up a client and answer how Shape works. To draft a workout or move a session, ask me in the chat on your dashboard. The Shape team reads ${EMAIL}.`,
    quick: ['What needs me today?', 'Look up a client', 'What does Shape take from coaches?', 'How does the Verified badge work?'],
  },
  nutritionist: {
    text: `Hi, I'm Nora. I can tell you what needs you today, look up a client and answer how Shape works. To set a goal or draft a plan, ask me in the chat on your dashboard. The Shape team reads ${EMAIL}.`,
    quick: ['What needs me today?', 'Look up a client', 'What does Shape take from coaches?', 'How does the Verified badge work?'],
  },
};

// What each suggestion gets Nora to do, in a line under it on the website's welcome cards
// (owner, 2026-11-12: Nora's panel to look and flow like Ladder's, whose cards carry one).
// Keyed by the suggestion, so a suggestion without a line here is a card with its title only.
// Each line says only what the suggestion above it already does for that account.
const HINTS = {
  'Find me a coach': 'Coaches on Shape who fit your goal.',
  'What does Shape cost?': 'Membership, coaching, and what each includes.',
  'How does coaching work?': 'Plans, check-ins and messages with a coach.',
  'Is a coach required?': 'What you can do on Shape on your own.',
  'What does a membership include?': 'Nora, Shape Radio, the Store and the full leaderboard.',
  'How do I cancel or change my plan?': 'Change or cancel your membership, step by step.',
  "What's on today?": "Today's sessions and meals from your plan.",
  'How was my week?': 'Your training and eating this week, in brief.',
  'Log a glass of water': 'Logged once you confirm it.',
  'What needs me today?': 'Clients and sessions waiting on you.',
  'Draft a 45-minute lower-body session': 'A draft for you to review before it saves.',
  'Draft a 4-week strength program': 'Nothing changes until you confirm it.',
  'Look up a client': 'Find a client and see where they are.',
  'Draft a 3-day cut meal plan': "From Shape's meal library, for you to review.",
  "Set a client's protein goal": 'Drafted for you to confirm.',
  'Look up an account by email': 'Read-only, and every lookup is logged.',
  'What does Shape take from coaches?': 'The coach fee, and when it applies.',
  'How does the Verified badge work?': 'What it means and how a coach gets it.',
};

export function greetingFor(kind, { plain = false } = {}) {
  const known = GREETINGS[kind] ? kind : 'visitor';
  const g = (plain && PLAIN[known]) || GREETINGS[known];
  const quick = g.quick.slice(0, 4);
  const hints = Object.fromEntries(quick.filter((q) => HINTS[q]).map((q) => [q, HINTS[q]]));
  return { kind: known, text: g.text, quick, hints };
}

export const GREETING_KINDS = Object.keys(GREETINGS);
