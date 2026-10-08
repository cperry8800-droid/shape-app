// Mutation spec for "Talk to a person" (the Ask Nora plan, step 5): the stored 'team' role and
// who can write it, the request route, the console's reply, the chat route's quote, the
// migration's policies, and both panels. Every one must be killed.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/talk-to-person-2026-10-08.mutations.mjs --fail-on-skipped
const THREAD = 'src/lib/ai/noraThread.mjs';
const GET = 'src/app/api/nora/thread/route.ts';
const LIB = 'src/lib/supportRequests.mjs';
const REQ = 'src/app/api/support/request/route.ts';
const ACT = 'src/app/dashboard/support/actions.ts';
const CHAT = 'src/app/api/support/chat/route.ts';
const SQL = 'supabase-migrations/2026-10-08-support-requests.sql';
const WEB = 'public/newdesign/chatWidget.jsx';
const APP = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';

export default {
  test: 'node --test tests/nora-talk-to-person.test.mjs tests/support-chat-route.test.mjs tests/nora-thread.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── only the server writes the team's words ──
    { name: 'a device can store a team message', file: THREAD,
      find: "(opts.team === true && m.role === 'team')", replace: "m.role === 'team'" },
    { name: "a device's append drops the stored team reply", file: THREAD,
      find: '  return cleanThread(stored, now, { team: true }).concat(extra).slice(-THREAD_MAX);', replace: '  return cleanThread(stored, now).concat(extra).slice(-THREAD_MAX);' },
    { name: 'the conversation is read without the team reply', file: GET,
      find: 'cleanThread(row?.messages, new Date(), { team: true })', replace: 'cleanThread(row?.messages, new Date())' },
    // ── the request ──
    { name: 'a question of any length is sent', file: LIB,
      find: '  return s && s.length <= QUESTION_MAX ? s : null;\n}\n\n/** A reply', replace: '  return s || null;\n}\n\n/** A reply' },
    { name: 'the whole conversation is sent', file: LIB,
      find: '.slice(-TRANSCRIPT_MAX)', replace: '' },
    { name: 'the question is not escaped in the email', file: LIB,
      find: 'white-space:pre-wrap">${esc(question)}</blockquote>', replace: 'white-space:pre-wrap">${question}</blockquote>' },
    { name: 'signed out is not refused', file: REQ,
      find: "  if (!user) return json({ error: 'Sign in to send your question to the Shape team, or email info@theshapecommunity.com.' }, 401);\n", replace: '' },
    { name: 'a fourth question a day is sent', file: REQ,
      find: '(counted.count ?? 0) >= DAILY_MAX', replace: '(counted.count ?? 0) > DAILY_MAX' },
    { name: 'the transcript is taken from the request', file: REQ,
      find: 'transcriptFrom((thread.data as { messages?: unknown }).messages)', replace: 'transcriptFrom((parsed.data as { transcript?: unknown }).transcript)' },
    { name: 'a failed email is reported as sent', file: REQ,
      find: 'emailed: !!sent.ok', replace: 'emailed: true' },
    // ── the console's reply ──
    { name: 'the console does not check for an admin', file: ACT,
      find: '  const admin = await requireAdminUser();\n', replace: "  const admin = { email: 'anyone' };\n" },
    { name: 'a request is answered twice', file: ACT,
      find: "    .update({ status: 'answered', reply, replied_by_email: admin.email, replied_at: now.toISOString() })\n    .eq('id', id)\n    .eq('status', 'open')\n", replace: "    .update({ status: 'answered', reply, replied_by_email: admin.email, replied_at: now.toISOString() })\n    .eq('id', id)\n" },
    { name: 'an answered request can be closed', file: ACT,
      find: "    .update({ status: 'closed' })\n    .eq('id', id)\n    .eq('status', 'open')\n", replace: "    .update({ status: 'closed' })\n    .eq('id', id)\n" },
    { name: 'the outcome never says the email failed', file: ACT,
      find: "thread.ok && emailed ? 'answered' : thread.ok ? 'answered_not_emailed'", replace: "thread.ok ? 'answered' : thread.ok ? 'answered_not_emailed'" },
    { name: "the reply overwrites a device's write (no conditional write)", file: LIB,
      find: ".eq('user_id', userId).eq('updated_at', row.updated_at).select('user_id');", replace: ".eq('user_id', userId).select('user_id');" },
    { name: "the stamp does not move past a device clock that runs ahead", file: LIB,
      find: 'prev >= now.getTime() ? prev + 1 : now.getTime()', replace: 'now.getTime()' },
    { name: 'a lost first write gives up', file: LIB,
      find: "      if (created.error.code === '23505') continue;\n", replace: '' },
    // ── a team message counts only when an answered request vouches for it (Codex, #2265) ──
    { name: 'any stored team message is trusted', file: LIB,
      find: "filter((m) => !m || m.role !== 'team' || replies.has(String(m.text || '').trim()))", replace: 'filter(() => true)' },
    { name: 'a closed or open request vouches for a reply', file: LIB,
      find: ".eq('user_id', userId).eq('status', 'answered')", replace: ".eq('user_id', userId)" },
    { name: 'the conversation is shown unverified', file: GET,
      find: '  const messages = await verifiedThread(who.supabase, who.userId, row?.messages, new Date());', replace: "  const messages = cleanThread(row?.messages, new Date(), { team: true });" },
    { name: "a forged reply reaches the team's transcript", file: REQ,
      find: 'transcriptFrom(await verifiedThread(supabase, user.id, (thread.data as { messages?: unknown }).messages))', replace: 'transcriptFrom((thread.data as { messages?: unknown }).messages)' },
    // ── the limit in the database ──
    { name: "the database's refusal is a 503", file: REQ,
      find: "    if (/support_request:daily_limit/.test(created.error?.message ?? '')) return json(DAILY_LIMIT, 429);\n", replace: '' },
    { name: 'two sends at once are not serialised', file: SQL,
      find: "  perform pg_advisory_xact_lock(hashtextextended('shape.support_request:' || new.user_id::text, 0));\n", replace: '' },
    { name: 'a direct insert dates itself', file: SQL,
      find: '  new.created_at := now();\n', replace: '' },
    // ── a reply sent later appears on the next open ──
    { name: 'the app never asks again after the first load', file: APP,
      find: '        const next = bsNoraNewTeam(_bsNoraThread || [SUPPORT_GREETING], list);\n        if (next) _bsNoraPublish(next);\n', replace: '' },
    { name: 'the app adds a reply it already shows', file: APP,
      find: "filter((m) => m && m.role === 'team' && !seen.has(String(m.text || '')))", replace: "filter((m) => m && m.role === 'team')" },
    { name: 'the website never asks again', file: WEB,
      find: '  React.useEffect(() => { if (open) cwPullTeam(); }, [open]);', replace: '' },
    // ── the chat route ──
    { name: 'any message labelled team is quoted', file: CHAT,
      find: 'team && team.has(content.trim())', replace: 'true' },
    { name: 'a typed marker is kept', file: CHAT,
      find: "content.split(TEAM_QUOTE).join('')", replace: 'content' },
    { name: 'the button note rides for a signed-out visitor', file: CHAT,
      find: 'member.signedIn && !member.noCards && !member.cookMsg', replace: '!member.noCards && !member.cookMsg' },
    // ── the migration ──
    { name: 'an account can send an answered request', file: SQL,
      find: "    and status = 'open'\n", replace: '' },
    { name: 'RLS is off', file: SQL,
      find: 'alter table public.support_requests enable row level security;\n', replace: '' },
    // ── the panels ──
    { name: 'the website button never shows', file: WEB,
      find: '        setNoraPersonOk(true);\n', replace: '' },
    { name: 'the website sends the team reply as Nora', file: WEB,
      find: 'role: m.team ? "team" : m.me ? "user" : "assistant"', replace: 'role: m.me ? "user" : "assistant"' },
    { name: 'the app shows the button signed out', file: APP,
      find: "const personOk = _bsNoraWho() !== 'anon' && !!window.ShapeSupport?.talkToPerson;", replace: 'const personOk = !!window.ShapeSupport?.talkToPerson;' },
    { name: 'the app sends the team reply as Nora', file: APP,
      find: "role: m.team ? 'team' : m.me ? 'user' : 'assistant'", replace: "role: m.me ? 'user' : 'assistant'" },
    { name: 'the app draws the team as Nora', file: APP,
      find: 'bot: !me && !team, team,', replace: 'bot: !me, team,' },
  ],
};
