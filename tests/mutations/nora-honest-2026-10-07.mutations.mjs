// Mutation spec for Nora's honesty fixes: no follow-up she cannot keep, and a trainer's
// "today" in their own zone. Each mutation breaks one clause; every one must be killed.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/nora-honest-2026-10-07.mutations.mjs --fail-on-skipped
const CHAT = 'src/app/api/support/chat/route.ts';
const WEB = 'public/newdesign/chatWidget.jsx';
const APP = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const KB = 'src/lib/ai/shapeKnowledge.mjs';

export default {
  test: 'node --test tests/ai-draft-surfaces.test.mjs tests/support-chat-route.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── the trainer's day ──
    { name: 'the note ignores the zone', file: CHAT,
      find: "trainerPromptNote(member.reads ? member.reads.now : new Date(), member.trainerZone)",
      replace: "trainerPromptNote(member.reads ? member.reads.now : new Date())" },
    { name: 'the listing zone is never read', file: CHAT,
      find: "for (const row of (t.data ?? []) as Array<{ timezone?: unknown }>) { const z = valid(row.timezone); if (z) return z; }",
      replace: '' },
    { name: 'the profile zone is never the fallback', file: CHAT,
      find: '    if (z) return z;\n  } catch { /* UTC below */ }',
      replace: '  } catch { /* UTC below */ }' },
    { name: 'an unknown zone is trusted', file: CHAT,
      find: "    try { new Intl.DateTimeFormat('en-US', { timeZone: v }); return v; } catch { return null; }",
      replace: '    return v;' },
    { name: 'the earliest-day note never rides', file: CHAT,
      find: '  const earliest = day < utcDay',
      replace: '  const earliest = false' },
    { name: 'the earliest-day note always rides', file: CHAT,
      find: '  const earliest = day < utcDay',
      replace: '  const earliest = true' },
    { name: 'the weekday stays UTC\'s', file: CHAT,
      find: "{ day = local; weekday = get('weekday'); }",
      replace: '{ day = local; }' },
    { name: 'a second listing is an error', file: CHAT,
      find: ".select('timezone').eq('owner_id', uid).limit(5);",
      replace: ".select('timezone').eq('owner_id', uid).limit(1);" },
    // ── no follow-up promise ──
    { name: 'the prompt promises a follow-up again', file: CHAT,
      find: 'say you cannot do that from here and that they can email the Shape team at info@theshapecommunity.com.',
      replace: 'say you have flagged it for the Shape team and they will follow up here.' },
    { name: 'the prompt drops the never-claim rule', file: CHAT,
      find: ' never say you have flagged, forwarded, noted or passed something on,',
      replace: '' },
    { name: 'the billing fallback flags it', file: CHAT,
      find: "I can't make billing changes from here. Email the Shape team at info@theshapecommunity.com",
      replace: "I can't make billing changes from here, but I've flagged this for the Shape team. Email info@theshapecommunity.com" },
    { name: 'the catch-all drops the address', file: CHAT,
      find: "The Shape team answers at info@theshapecommunity.com. Is there anything else",
      replace: "The Shape team will get back to you. Is there anything else" },
    { name: 'the login fallback drops the address', file: CHAT,
      find: "email the Shape team at info@theshapecommunity.com from the address on your account.\", actions: [] };",
      replace: "tell me your account email.\", actions: [] };" },
    { name: 'the knowledge base says Nora passes messages', file: KB,
      find: "Nora cannot pass a message on herself.",
      replace: "Nora can pass a message to the Shape team." },
    { name: 'the website fallback promises a teammate', file: WEB,
      find: '  return "I can\'t answer that just now. The Shape team answers at info@theshapecommunity.com. Anything else I can help with?";',
      replace: '  return "Thanks — a Shape teammate will follow up here and by email shortly.";' },
    { name: 'the website profile escalates again', file: WEB,
      find: '<Stat label="People at" value="info@" />',
      replace: '<Stat label="Escalates to" value="Shape team" />' },
    { name: 'the app greeting brings in the team', file: APP,
      find: "If I can't sort it out, the Shape team answers at info@theshapecommunity.com.",
      replace: "I'll bring in the Shape team if I can't sort it out." },
    { name: 'the app error flags it', file: APP,
      find: "I can't be reached right now. Try again in a moment, or email the Shape team at info@theshapecommunity.com.",
      replace: "I'm having trouble reaching support right now — I've flagged this for the Shape team to follow up." },
  ],
};
