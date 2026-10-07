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
    text: `Hi, I'm Nora, Shape's assistant. Ask me how Shape works, what it costs, or to find you a coach. For anything else, the Shape team reads ${EMAIL}.`,
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
    text: `Hi, I'm Nora. I can draft a workout or a program for you to review, look up a client, assign a session or move one. Nothing changes until you confirm it. The Shape team reads ${EMAIL}.`,
    quick: ['Draft a 45-minute lower-body session', 'Draft a 4-week strength program', 'Look up a client', 'Move a session'],
  },
  nutritionist: {
    text: `Hi, I'm Nora. I can look up a client, set a client's goal, assign a meal plan or note a program phase, each drafted for you to confirm. The Shape team reads ${EMAIL}.`,
    quick: ['Look up a client', "Set a client's protein goal", 'Assign a meal plan', 'What does Shape take from coaches?'],
  },
  admin: {
    text: `Hi, I'm Nora. I can answer how Shape works, billing and coach questions, and look up your own account. The Shape team reads ${EMAIL}.`,
    quick: ['What does Shape take from coaches?', 'What does a membership include?', 'How does the Verified badge work?', 'Find me a coach'],
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
    text: `Hi, I'm Nora. I can look up a client and answer how Shape works. To draft a workout or move a session, ask me in the chat on your dashboard. The Shape team reads ${EMAIL}.`,
    quick: ['Look up a client', 'What does Shape take from coaches?', 'How does the Verified badge work?', 'Find me a coach'],
  },
  nutritionist: {
    text: `Hi, I'm Nora. I can look up a client and answer how Shape works. To set a goal or assign a plan, ask me in the chat on your dashboard. The Shape team reads ${EMAIL}.`,
    quick: ['Look up a client', 'What does Shape take from coaches?', 'How does the Verified badge work?', 'Find me a coach'],
  },
};

export function greetingFor(kind, { plain = false } = {}) {
  const known = GREETINGS[kind] ? kind : 'visitor';
  const g = (plain && PLAIN[known]) || GREETINGS[known];
  return { kind: known, text: g.text, quick: g.quick.slice(0, 4) };
}

export const GREETING_KINDS = Object.keys(GREETINGS);
