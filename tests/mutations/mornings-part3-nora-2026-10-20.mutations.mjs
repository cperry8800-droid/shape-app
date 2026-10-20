// Mutation spec for the Morning check-in, part 3 (Nora reads the mornings: memberMornings.mjs, the chat route's wiring, the facts line, the week summary; docs/REVIEW-2026-10-19-morning-checkin.md
// §3.6, §3.9, §3.10 and rulings 14-18). One of four part-3 specs, each with its own narrow test
// command. Every mutation must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/mornings-part3-nora-2026-10-20.mutations.mjs --fail-on-skipped
const MM = 'src/lib/ai/memberMornings.mjs';
const CHAT = 'src/app/api/support/chat/route.ts';
const CTX = 'src/lib/ai/memberContext.mjs';
const READS = 'src/lib/ai/memberReads.mjs';

export default {
  test: "node --test tests/member-mornings.test.mjs tests/support-chat-route.test.mjs tests/member-context.test.mjs tests/nora-reads.test.mjs",
  timeoutMs: 600_000,
  mutations: [
    { name: 'snapshot read loses its uid filter', file: MM, find: ".eq('user_id', uid).gte('snapshot_date', from)", replace: ".gte('snapshot_date', from)" },
    { name: 'coaching read loses its uid filter', file: MM, find: ".eq('client_id', uid).in('status', OPEN_SUB_STATUSES)", replace: ".in('status', OPEN_SUB_STATUSES)" },
    { name: 'settings read loses its uid filter', file: MM, find: "leg(sb.from('user_goals').select('data').eq('user_id', uid).eq('kind', 'client_settings')", replace: "leg(sb.from('user_goals').select('data').eq('kind', 'client_settings')" },
    { name: 'rows after today are read', file: MM, find: ".lte('snapshot_date', to)", replace: '' },
    { name: 'hunger shows on an unread coaching link', file: MM, find: 'const hunger = coaching.nutritionist === true;', replace: 'const hunger = coaching.nutritionist !== false;' },
    { name: 'hunger always shows', file: MM, find: 'const hunger = coaching.nutritionist === true;', replace: 'const hunger = true;' },
    { name: '0h nights count in the averages', file: MM, find: "(kind === 'sleep' ? Number.isFinite(n) && n > 0 : mrWordIndex(n) != null)", replace: "(kind === 'sleep' ? Number.isFinite(n) && n >= 0 : mrWordIndex(n) != null)" },
    { name: 'typed-over hours read as a watch night', file: MM, find: "return r.sleep_hours != null && by !== '' && by !== 'manual';", replace: "return r.sleep_hours != null && by !== '';" },
    { name: 'a skip wins over hours', file: MM, find: '  if (Number.isFinite(h) && h >= 0) return { hours: mmHM(h), fromWatch: !!d.device };', replace: '  if (!d.skipped && Number.isFinite(h) && h >= 0) return { hours: mmHM(h), fromWatch: !!d.device };' },
    { name: 'a skip no longer answers the night', file: MM, find: 'answered: d.energy != null && (d.sleep != null || d.skipped),', replace: 'answered: d.energy != null && d.sleep != null,' },
    { name: 'asked from 3 a.m.', file: MM, find: 'export const MM_ASK_FROM_HOUR = 4;', replace: 'export const MM_ASK_FROM_HOUR = 3;' },
    { name: "readiness ignores the usual night", file: MM, find: 'const r = morningReadinessForDay(series, todayIso, { usualNight: usual });', replace: 'const r = morningReadinessForDay(series, todayIso, {});' },
    { name: 'the stored energy value leaks', file: MM, find: "const energy = wordOf('energy', d.energy);", replace: 'const energy = d.energy;' },
    { name: 'who sees it says 7-day averages again', file: MM, find: "both: 'Your trainer and nutritionist see your answers.',", replace: "both: 'Your trainer and nutritionist see your 7-day averages.'," },
    { name: "get_mornings reads UTC's day", file: MM, find: "  const today = dayIn(now, zone);\n  const [snap, subs, settings]", replace: "  const today = dayIn(now, 'UTC');\n  const [snap, subs, settings]" },
    { name: 'a trainer is not a coach for the read', file: MM, find: 'const coached = coaching.trainer === true || coaching.nutritionist === true;', replace: 'const coached = coaching.nutritionist === true;' },
    { name: 'about the same is 15 minutes', file: MM, find: 'const MM_SAME_MINUTES = 20;', replace: 'const MM_SAME_MINUTES = 15;' },
    { name: 'most days is half', file: MM, find: 'return counts[best] * 2 > idx.length ? best : null;', replace: 'return counts[best] * 2 >= idx.length ? best : null;' },
    { name: 'a failed settings read is on', file: MM, find: '  if (!settings.ok) return null;', replace: '  if (!settings.ok) return true;' },
    { name: 'facts read 30 days', file: MM, find: 'export const MM_FACT_DAYS = 45;', replace: 'export const MM_FACT_DAYS = 30;' },
    { name: 'get_mornings reads 60 days', file: MM, find: 'export const MM_READ_DAYS = 90;', replace: 'export const MM_READ_DAYS = 60;' },
    { name: 'the patterns lose the coach follow-up', file: MM, find: '.map((p) => mmPatternWords(p, { coached }))', replace: '.map((p) => mmPatternWords(p, {}))' },
    { name: 'short nights always 0', file: MM, find: 'shortNights: h.vars.short', replace: 'shortNights: 0' },
    { name: 'a failed coaching read says only you', file: MM, find: "  if (!coaching || coaching.trainer == null || coaching.nutritionist == null) return null;\n  if (coaching.trainer && coaching.nutritionist) return 'both';", replace: "  if (!coaching) return null;\n  if (coaching.trainer && coaching.nutritionist) return 'both';" },
    { name: "get_mornings reads the coach's listing zone", file: CHAT, find: "        return await readMornings(sb, uid, { now, zone: reads.dayZone || zone });", replace: "        return await readMornings(sb, uid, { now, zone });" },
    { name: "the day zone is the listing zone", file: CHAT, find: "        : (screen.timezone || zone);\n", replace: "        : zone;\n" },
    { name: 'the morning rides with a client open', file: CHAT, find: 'const ownMorning = !screen.clientId && !COACH_ROLE_NAMES.has(actor.role);', replace: 'const ownMorning = !COACH_ROLE_NAMES.has(actor.role);' },
    { name: "the morning rides for a coach's account", file: CHAT, find: 'const ownMorning = !screen.clientId && !COACH_ROLE_NAMES.has(actor.role);', replace: 'const ownMorning = !screen.clientId;' },
    { name: 'the morning never reaches the facts', file: CHAT, find: '  if (mornings) facts.morning = mornings;\n', replace: '' },
    { name: 'the mornings note never rides', file: CHAT, find: '\\n\\n${morningsPromptNote(member.coach.surface)}', replace: '' },
    { name: 'the website hears the app sentence', file: CHAT, find: "  const where = surface === 'app'\n", replace: "  const where = surface !== 'app'\n" },
    { name: "get_mornings is not run", file: CHAT, find: "        return await readMornings(sb, uid, { now, zone: reads.dayZone || zone });\n", replace: "        return { ok: false };\n" },
    { name: 'the off line is never said', file: CTX, find: "  if (mo.checkinsOn === false) out.push(", replace: '  if (false) out.push(' },
    { name: 'an off morning reads as open', file: CTX, find: '  else if (mo.asked === true && mo.checkinsOn !== false) out.push(', replace: '  else if (mo.asked === true) out.push(' },
    { name: 'before 4 a.m. is open', file: CTX, find: '  else if (mo.asked === true && mo.checkinsOn !== false) out.push(', replace: '  else if (mo.checkinsOn !== false) out.push(' },
    { name: 'every night is the watch\'s', file: CTX, find: `(\${n.fromWatch ? "their watch's night" : 'typed in'})`, replace: `(\${"their watch's night"})` },
    { name: 'a 0h night counts in the week', file: READS, find: "const nights = col('sleep_hours', (n) => n > 0);", replace: "const nights = col('sleep_hours');" },
    { name: "get_mornings runs where it isn't offered", file: CHAT, find: "if (!reads.mornings) return { error: 'not_available'", replace: "if (false) return { error: 'not_available'" },
    { name: "get_mornings is offered on a client page", file: CHAT, find: ".filter((t) => t.name !== 'get_mornings' || !!(member.reads && member.reads.mornings))", replace: ".filter(() => true)" },
    { name: "the MORNINGS note rides on a client page", file: CHAT, find: "${member.reads && member.reads.mornings ? `", replace: "${true ? `" },
    { name: "on the website the browser's zone is the day", file: CHAT, find: "const dayZone = surface === 'web'", replace: "const dayZone = surface === 'never'" },
    { name: "the read is not offered to members either", file: CHAT, find: "mornings: ownMorning, role: actor.role", replace: "mornings: false, role: actor.role" },
    { name: "the read doesn't say whose rows it holds", file: MM, find: "    whose: MM_WHOSE,\n", replace: "" },
    { name: "a failed coaching read doesn't say so", file: MM, find: "{ coachesUnavailable: true, coachesNote: MM_COACHES_UNREAD }", replace: "{ coachesUnavailable: true }" },
  ],
};
