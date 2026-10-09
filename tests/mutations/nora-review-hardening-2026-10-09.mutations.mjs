// Mutation spec for the Nora half of the 2026-10-08 review's app code: H9 (undo is the actor's
// own, and changes a row or says so), M6 (remember audits the note id only) and M8 (daily budgets
// on speak, transcribe and draft-program). Each mutation breaks one clause; the actions,
// proposals and hardening tests must notice every one.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/nora-review-hardening-2026-10-09.mutations.mjs --fail-on-skipped
const PROPOSALS = 'src/lib/ai/proposals.mjs';
const ACTIONS = 'src/lib/ai/actions.mjs';
const LIMITS = 'src/lib/ai/noraLimits.ts';
const SPEAK = 'src/app/api/ai/speak/route.ts';
const TRANSCRIBE = 'src/app/api/ai/transcribe/route.ts';
const DRAFT = 'src/app/api/ai/draft-program/route.ts';

export default {
  test: 'node --test tests/ai-actions.test.mjs tests/ai-proposals.test.mjs tests/nora-review-hardening.test.mjs tests/nora-help-and-voice.test.mjs tests/transcribe-routes.test.mjs',
  timeoutMs: 600_000,
  mutations: [
    // ── H9: the actor ──
    { name: 'anyone who can read the audit row can undo it (the actor check is dropped)', file: PROPOSALS,
      find: "  if (!actor || !actor.id || entry.actorUserId !== actor.id) return { ok: false, error: 'actor_mismatch' };\n",
      replace: '' },
    { name: 'the actor check compares roles, not accounts', file: PROPOSALS,
      find: "  if (!actor || !actor.id || entry.actorUserId !== actor.id) return { ok: false, error: 'actor_mismatch' };",
      replace: "  if (!actor || entry.actorRole !== actor.role) return { ok: false, error: 'actor_mismatch' };" },
    // ── H9: affected rows ──
    { name: 'assign_workout undo reports success whatever it hit', file: ACTIONS,
      find: "    var res = await q.select('id');\n    if (res.error || !Array.isArray(res.data) || !res.data.length) throw new Error('Changed since — nothing undone.');\n  },\n};\n\n// ── draft_workout",
      replace: "    await q;\n  },\n};\n\n// ── draft_workout" },
    { name: 'assign_meal_plan undo archives nothing and still reads undone', file: ACTIONS,
      find: "      .eq('nutritionist_id', b.nutritionistId).eq('client_id', b.clientId).eq('title', b.title).eq('status', 'published')\n      .select('id');\n    if (res.error || !Array.isArray(res.data) || !res.data.length) throw new Error('Changed since — nothing undone.');",
      replace: "      .eq('nutritionist_id', b.nutritionistId).eq('client_id', b.clientId).eq('title', b.title).eq('status', 'published')\n      .select('id');" },
    { name: 'set_program_detail undo does not check the row it restored', file: ACTIONS,
      find: "    var res = await ctx.supabase.from('client_programs').update(patch).eq('user_id', b.clientId).select('user_id');\n    if (res.error || !Array.isArray(res.data) || !res.data.length) throw new Error('Changed since — nothing undone.');",
      replace: "    await ctx.supabase.from('client_programs').update(patch).eq('user_id', b.clientId).select('user_id');" },
    { name: 'add_review_note undo with no note id is a quiet success', file: ACTIONS,
      find: "    if (!id) throw new Error('Changed since — nothing undone.');\n    var res = await ctx.supabase.from('coach_workout_review_notes').delete().eq('id', id).select('id');",
      replace: "    if (!id) return;\n    var res = await ctx.supabase.from('coach_workout_review_notes').delete().eq('id', id).select('id');" },
    { name: 'add_review_note undo deletes nothing and still reads undone', file: ACTIONS,
      find: "    var res = await ctx.supabase.from('coach_workout_review_notes').delete().eq('id', id).select('id');\n    if (res.error || !Array.isArray(res.data) || !res.data.length) throw new Error('Changed since — nothing undone.');",
      replace: "    await ctx.supabase.from('coach_workout_review_notes').delete().eq('id', id).select('id');" },
    // ── M6 ──
    { name: 'remember audits the note text again', file: ACTIONS,
      find: "    var audited = await ensureMemoryAudit(ctx, 'remember', out.note.id, { noteId: out.note.id }, out.deduped === true);",
      replace: "    var audited = await ensureMemoryAudit(ctx, 'remember', out.note.id, { noteId: out.note.id, text: out.note.text }, out.deduped === true);" },
    // ── M8: the budgets ──
    { name: 'the budget counter always allows', file: LIMITS,
      find: "  const r = await checkRateLimit(sb, `nora:${kind}:${uid}`, limit, DAY);\n  return { allowed: r.allowed, limit, resetSeconds: r.resetSeconds };",
      replace: "  const r = await checkRateLimit(sb, `nora:${kind}:${uid}`, limit, DAY);\n  return { allowed: true, limit, resetSeconds: r.resetSeconds };" },
    { name: 'every account shares one budget bucket (the uid leaves the key)', file: LIMITS,
      find: "  const r = await checkRateLimit(sb, `nora:${kind}:${uid}`, limit, DAY);",
      replace: "  const r = await checkRateLimit(sb, `nora:${kind}`, limit, DAY);" },
    { name: 'the speak budget is effectively unlimited', file: LIMITS,
      find: '  speak: 200,',
      replace: '  speak: 200000,' },
    { name: 'the budget window is an hour, not a day', file: LIMITS,
      find: "  const r = await checkRateLimit(sb, `nora:${kind}:${uid}`, limit, DAY);",
      replace: "  const r = await checkRateLimit(sb, `nora:${kind}:${uid}`, limit, 3600);" },
    { name: 'speak ignores a spent budget', file: SPEAK,
      find: "  const budget = await countBudget(actor.supabase, actor.user.id, 'speak');\n  if (!budget.allowed) {",
      replace: "  const budget = await countBudget(actor.supabase, actor.user.id, 'speak');\n  if (false) {" },
    { name: 'transcribe ignores a spent budget', file: TRANSCRIBE,
      find: "  const budget = await countBudget(await clientForRequest(request), user.id, 'transcribe');\n  if (!budget.allowed) {",
      replace: "  const budget = await countBudget(await clientForRequest(request), user.id, 'transcribe');\n  if (false) {" },
    { name: 'draft-program ignores a spent budget', file: DRAFT,
      find: "  const budget = await countBudget(await clientForRequest(request), user.id, 'draft_program');\n  if (!budget.allowed) {",
      replace: "  const budget = await countBudget(await clientForRequest(request), user.id, 'draft_program');\n  if (false) {" },
    { name: 'draft-program counts the budget under speak\'s key', file: DRAFT,
      find: "  const budget = await countBudget(await clientForRequest(request), user.id, 'draft_program');",
      replace: "  const budget = await countBudget(await clientForRequest(request), user.id, 'speak');" },
  ],
};
