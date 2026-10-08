// Mutation spec for Nora's speed, the setup half: membership's reads together, the chat route's
// independent steps together, and the token counts in the log. Every one must be killed.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/nora-speed-setup-2026-10-08.mutations.mjs --fail-on-skipped
const CORE = 'src/lib/membership-core.ts';
const CHAT = 'src/app/api/support/chat/route.ts';
const AI = 'src/lib/ai.ts';

export default {
  test: 'node --test tests/nora-speed-setup.test.mjs tests/support-chat-route.test.mjs tests/ai-draft-surfaces.test.mjs tests/ai-model-pin.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── membership decides exactly as before ──
    { name: 'a coach waits on the plan read', file: CORE,
      find: '  if (!isMember && subRead) {', replace: '  if (subRead) {' },
    { name: 'an admin reads the plan anyway', file: CORE,
      find: '  const subRead = isAdmin ? null : Promise.resolve(client', replace: '  const subRead = Promise.resolve(client' },
    { name: 'the plan query runs twice', file: CORE,
      find: "  const subRead = isAdmin ? null : Promise.resolve(client\n    .from('platform_subscriptions')\n    .select('status')\n    .eq('client_id', userId)\n    .order('current_period_end', { ascending: false, nullsFirst: false })\n    .limit(1)\n    .maybeSingle());",
      replace: "  const subRead = isAdmin ? null : client\n    .from('platform_subscriptions')\n    .select('status')\n    .eq('client_id', userId)\n    .order('current_period_end', { ascending: false, nullsFirst: false })\n    .limit(1)\n    .maybeSingle();" },
    { name: 'the plan is read after the profile again', file: CORE,
      find: '  if (subRead) subRead.then(undefined, () => {});\n  const { data: profile } = await profileRead;',
      replace: '  const { data: profile } = await profileRead;\n  if (subRead) await subRead.then(undefined, () => {});' },
    // ── the route ──
    { name: 'the day is counted after the facts again', file: CHAT,
      find: "  const countedEarly = actor ? early(countQuestion(actor.supabase, { tier, uid: actor.user.id, visitorId: null, ip: requestIp(request) })) : null;",
      replace: "  const countedEarly = actor ? (async () => { await new Promise((r) => setTimeout(r, 30)); return early(countQuestion(actor.supabase, { tier, uid: actor.user.id, visitorId: null, ip: requestIp(request) })); })().then((p) => p) : null;" },
    { name: 'the limit is ignored', file: CHAT,
      find: '    ? settledValue(await countedEarly)\n', replace: '    ? { allowed: true, limit: null, resetSeconds: 0 }\n' },
    { name: "the Shape team's replies are dropped", file: CHAT,
      find: '  const teamReplies = settledValue(await teamRepliesEarly);', replace: '  const teamReplies = new Set<string>();' },
    { name: "a coach's day is UTC", file: CHAT,
      find: '        ? (coachZoneEarly ? settledValue(await coachZoneEarly) : await coachZone(actor.supabase, actor.user.id, screen.timezone, actor.role))',
      replace: "        ? (coachZoneEarly ? 'UTC' : await coachZone(actor.supabase, actor.user.id, screen.timezone, actor.role))" },
    { name: "the member's facts never reach the prompt", file: CHAT,
      find: '  if (factsEarly) {\n    const { facts, failed } = await factsEarly;', replace: '  if (false) {\n    const { facts, failed } = await factsEarly!;' },
    { name: 'the setup time is not logged', file: CHAT,
      find: "  console.log('[shape-ai]', JSON.stringify({ promptId: 'support.chat.setup', setupMs: Date.now() - startedAt, signedIn: !!actor }));\n", replace: '' },
    // ── the log ──
    { name: 'cached tokens are not read', file: AI,
      find: "    cachedTokens: num(detail(o.input_tokens_details, 'cached_tokens'), detail(o.prompt_tokens_details, 'cached_tokens')),", replace: '    cachedTokens: null,' },
  ],
};
