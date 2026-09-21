// What Nora knows about HOW SHAPE WORKS — the answers to "what does it cost",
// "can I cancel", "how does the Score work", "are coaches verified", "what can
// you do" — as a small, SOURCED knowledge base the chat route exposes through
// the `shape_help` tool (to every caller, signed in or not: none of this is
// private).
//
// Every entry names where its claim comes from, and the tests hold the ones
// that can drift to their source: the price and the fee against the pricing
// page's own FAQ, the credentials rule against the Terms clause the app
// renders. Where the website's FAQ and the Terms disagree (the FAQ still says
// "we verify licenses on application"; Terms clause 04 says credentials are
// self-reported unless a Verified badge shows), Nora follows the Terms — the
// operative document — and the disagreement is registered for the owner.
//
// Plain ESM, no deps: node:test drives searchKnowledge() directly.

export const SHAPE_KNOWLEDGE = Object.freeze([
  {
    id: 'membership',
    title: 'What a Shape membership costs and includes',
    tags: ['price', 'cost', 'membership', 'platform fee', '$5', 'five dollars', 'month', 'include', 'subscription', 'join', 'sign up'],
    body: 'A Shape membership is $5 a month — the Shape platform fee. It covers browsing trainers and nutritionists, messaging your pros, tracking progress, logging meals, listening to Shape Radio ad-free, and the community. Anything bought from an individual coach — a subscription, a plan, a one-off session — is separate and goes to that coach.',
    source: 'Pricing page FAQ',
  },
  {
    id: 'coach-optional',
    title: 'Do I have to subscribe to a coach?',
    tags: ['coach', 'subscribe', 'required', 'have to', 'without a coach', 'self', 'own workouts', 'platform level'],
    body: 'No. At the platform level you can browse coaches, book intro calls, buy one-off plans, build your own workouts right in the app, and use the community. Some members stay there, training on self-built weeks or à-la-carte plans; others subscribe to one or more coaches for ongoing programming.',
    source: 'Pricing page FAQ',
  },
  {
    id: 'coach-prices',
    title: 'How much trainers and nutritionists cost',
    tags: ['coach', 'trainer', 'nutritionist', 'price', 'cost', 'rate', 'session', 'consult', 'per month', 'expensive'],
    body: 'Each coach sets their own price, shown on their profile before you subscribe. The pricing page gives typical ranges: trainers $60 to $150 per session or $80 to $250 a month for full programming; nutritionists $120 to $250 per consult or $120 to $300 a month for plans and reviews.',
    source: 'Pricing page FAQ',
  },
  {
    id: 'cancel',
    title: 'Cancelling, pausing or changing the membership and billing',
    tags: ['cancel', 'cancellation', 'refund', 'stop', 'quit', 'pause', 'billing', 'invoice', 'receipt', 'payment method', 'card', 'stripe', 'portal', 'renew', 'charge'],
    body: 'The $5 membership cancels any time from settings — instantly, no penalty, no lock-in — and coach subscriptions cancel on the same screen; your data and training history stay with you. In the app: Settings → Account → Membership & billing → Manage subscription, which opens the Stripe billing portal (invoices, receipts and the payment method live there too). Pausing or deleting the account is under Settings → Account actions.',
    source: 'Pricing page FAQ · the app’s Settings',
  },
  {
    id: 'coach-fees',
    title: 'What coaches pay, and how to become one',
    tags: ['coach', 'become a coach', 'apply', 'fee', 'fees', 'commission', '15%', 'fifteen percent', 'payout', 'earn', 'join as a trainer', 'nutritionist'],
    body: 'Coaches join and list for free — no monthly dues, no setup fees. Shape takes a 15% platform fee on everything clients pay a coach, so a coach only pays when they earn; standard card processing is separate. Trainers, nutritionists and dietitians apply from the website’s Coaches page; a coach’s clients, schedule, programs and payouts live in the coach dashboard.',
    source: 'Pricing page FAQ',
  },
  {
    id: 'radio',
    title: 'Shape Radio and music',
    tags: ['radio', 'music', 'station', 'playlist', 'dj', 'spotify', 'apple music', 'listen', 'ad-free', 'skip'],
    body: 'Shape Radio is included in the membership: an ad-free station of coach playlists and DJ sets. It is a non-interactive station, so you cannot choose, request, replay or skip a specific track, and it streams only where the licences cover it — the US and UK at launch. Coach playlists and soundtracks play through your own connected Spotify or Apple Music account. Radio is opened from the Home card, and Shape Radio can be turned on or off under Settings.',
    source: 'Pricing page FAQ · Terms of service, clause 08',
  },
  {
    id: 'credentials',
    title: 'Coach credentials and the Verified badge',
    tags: ['verified', 'certified', 'credential', 'credentials', 'qualified', 'license', 'vetted', 'trust', 'real'],
    body: 'Trainers and nutritionists operate as independent providers, responsible for credentials, scope of practice, taxes, service quality, and client delivery. Unless a coach shows a Verified badge, the credentials on their profile are self-reported and not independently verified by Shape. A coach’s profile shows the credential they state; a Verified badge is the sign it has been checked.',
    source: 'Terms of service, clause 04',
  },
  {
    id: 'switch-coach',
    title: 'Switching coaches',
    tags: ['switch', 'change coach', 'new coach', 'different coach', 'leave', 'transfer', 'find a coach', 'marketplace', 'match'],
    body: 'You can switch coaches any time, with no penalty; your training history, nutrition logs and Shape Score stay with you. New coaches are found on the marketplace — ask Nora to recommend one by goal, style or specialty — and you can book a free intro call from a coach’s profile before subscribing.',
    source: 'Website FAQ',
  },
  {
    id: 'shape-score',
    title: 'How the Shape Score and its tiers work',
    tags: ['score', 'shape score', 'points', 'tier', 'tiers', 'level', 'ladder', 'rank', 'raw', 'tempo', 'form', 'peak', 'legend', 'rewards', 'reward', 'store', 'redeem'],
    body: 'You earn points for consistency — workouts logged, meals tracked, sessions kept, habits done. Your all-time points set your tier: Raw from 0, Tempo from 750 (a free Shape cap), Form from 2,000 (a free coach workout or plan), Peak from 5,000 (a free month with a coach), Legend from 15,000 (a free year of Shape plus a cap). Coaches climb the same rungs as Certified, Pro, Elite, Master and Icon. Tier rewards are claimed free in the Shape Store; points are not cash, are not transferable, and may be adjusted for abuse.',
    source: 'The app’s Score page · Terms of service, clause 06',
  },
  {
    id: 'habits',
    title: 'Habits and streaks',
    tags: ['habit', 'habits', 'streak', 'daily', 'check off', 'tick', 'routine'],
    body: 'You add daily habits — things to do or things to avoid — and tick them off each day; each habit keeps a streak, and today’s completion shows on Home and counts toward your Shape Score. Nora can read your habits and streaks and check one off for you with a confirm card.',
    source: 'The app',
  },
  {
    id: 'units',
    title: 'Weigh-ins, goals and units',
    tags: ['weigh', 'weigh-in', 'weight', 'goal', 'units', 'imperial', 'metric', 'kg', 'lb', 'pounds', 'kilograms', 'miles', 'kilometres'],
    body: 'Log a weigh-in from the Goal page or ask Nora to draft one; the goal page tracks your target and trend. Units are yours to choose under Settings → Units — Imperial (lb, mi) or Metric (kg, km) — and the choice applies to every figure in the app.',
    source: 'The app’s Settings',
  },
  {
    id: 'cook-mode',
    title: 'Cook Mode, Prep sessions and importing recipes',
    tags: ['cook', 'cooking', 'recipe', 'recipes', 'kitchen', 'prep', 'meal prep', 'import', 'paste', 'photo', 'timer', 'grocery', 'shopping list'],
    body: 'Any Shape Kitchen recipe, a meal from your plan, or a recipe you bring in yourself (pasted or photographed, then reviewed line by line) can be cooked step by step in Cook Mode with timers. Pick two or more dishes for a Prep session and the app merges the shopping list and plans the timing; a grocery list can be sent to Instacart. Inside Cook Mode Nora is a read-only sous-chef.',
    source: 'The app',
  },
  {
    id: 'nora',
    title: 'What Nora can do',
    tags: ['nora', 'assistant', 'help', 'what can you do', 'voice', 'talk', 'speak', 'listen', 'mic', 'remember', 'memory', 'read aloud'],
    body: 'For a signed-in member Nora can look up today’s and this week’s plan, recent workouts, the last seven days in numbers, habits and streaks, coaching sessions, reminders and Shape Score points; recommend coaches from the marketplace; and draft actions you confirm with one tap — a weigh-in, water, a habit check, a reminder, a meal log with real macros. She remembers preferences you tell her (managed under Settings → What Nora remembers). Coaches can ask her to look up a client by name and read that client’s snapshot. Voice: in the app and on the website, turn on voice chat and hold the mic to talk; Nora reads replies aloud, and her voice and tone live under Settings → Notifications → Nora’s voice.',
    source: 'The app',
  },
  {
    id: 'health-data',
    title: 'Health data, privacy and your data',
    tags: ['privacy', 'data', 'health', 'medical', 'par-q', 'injury', 'export', 'delete', 'gdpr', 'share', 'coach sees'],
    body: 'Shape is not medical care; training, nutrition and coach guidance are informational and do not replace licensed medical advice. Health and screening information you enter — PAR-Q, injuries, medications — helps your coach work with you safely and is shared only with your linked coaches. You can export all of your data, pause the membership, or delete the account under Settings → Account actions.',
    source: 'Terms of service, clause 09 · the app’s Settings',
  },
  {
    id: 'account',
    title: 'Account, eligibility and contact',
    tags: ['account', 'email', 'phone', 'password', 'two-factor', '2fa', 'login', 'sign in', 'age', '18', 'contact', 'support', 'human', 'team'],
    body: 'Shape is for people who are at least 18. Email, phone, password and two-factor authentication are managed under Settings → Account. Questions the app cannot answer go to info@theshapecommunity.com or the contact page, and Nora can pass a message to the Shape team.',
    source: 'Terms of service, clause 01 · the app’s Settings',
  },
]);

const STOP = new Set(['a', 'an', 'the', 'is', 'are', 'do', 'does', 'i', 'my', 'me', 'you', 'your', 'it', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'how', 'what', 'can', 'with', 'about', 'shape', 'app', 'this', 'that', 'much', 'get', 'if', 'be', 'at', 'from', 'work', 'works', 'tell']);

function tokens(s) {
  return String(s || '').toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9$%]+/).filter((w) => w.length > 1 && !STOP.has(w));
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A whole-word match (a plural allowed), so 'age' cannot fire on "manage" and
// 'tier' still finds "tiers" — a substring test scored half the base on "hi".
const wordRe = (w) => new RegExp(`(^|[^a-z0-9$])${escapeRe(w)}(?:e?s)?(?![a-z0-9])`);

/**
 * The entries that best answer a question: tag hits count most, then the
 * title, then the body. Returns at most `limit` entries carrying their
 * source; with no hit at all it answers the topic list, so the model can say
 * what it CAN explain instead of guessing. `minScore` lets a caller that has
 * no model to judge relevance (the rule-based fallback) demand a tag or a
 * title hit rather than a stray body word.
 */
export function searchKnowledge(query, { limit = 3, minScore = 1 } = {}) {
  const q = String(query || '').toLowerCase().replace(/[’']/g, '');
  const words = tokens(q);
  const scored = SHAPE_KNOWLEDGE.map((e) => {
    let score = 0;
    for (const tag of e.tags) if (wordRe(tag.toLowerCase()).test(q)) score += 4;
    const title = e.title.toLowerCase(); const body = e.body.toLowerCase();
    for (const w of words) {
      const re = wordRe(w);
      if (re.test(title)) score += 3;
      if (re.test(body)) score += 1;
    }
    return { e, score };
  }).filter((s) => s.score >= Math.max(1, minScore)).sort((a, b) => b.score - a.score);
  const hits = scored.slice(0, Math.max(1, Math.min(5, limit))).map(({ e }) => ({ id: e.id, title: e.title, body: e.body, source: e.source }));
  if (hits.length) return { entries: hits };
  return { entries: [], topics: SHAPE_KNOWLEDGE.map((e) => e.title) };
}
