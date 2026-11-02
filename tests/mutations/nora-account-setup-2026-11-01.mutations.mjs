// Mutation spec for Nora setting the account up (set_up_account): the allowlist and each field's rule
// (src/lib/ai/accountSetup.mjs), the guarded apply/undo engine there, the action and its owner checks
// (src/lib/ai/actions.mjs), the route's offer, note and budget (src/app/api/support/chat/route.ts,
// src/lib/ai/noraLimits.ts), and the surfaces (the app's goal step and card, the website's card, the
// tours). This writes account data from a model's output, so every guard is broken here once and a
// test must notice. A survivor is a missing test, or a proven no-op marked expectSurvive with its proof.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/nora-account-setup-2026-11-01.mutations.mjs --fail-on-skipped
const CORE = 'src/lib/ai/accountSetup.mjs';
const ACT = 'src/lib/ai/actions.mjs';
const ROUTE = 'src/app/api/support/chat/route.ts';
const LIMITS = 'src/lib/ai/noraLimits.ts';
const APP = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const PROS = 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx';
const WEB = 'public/newdesign/chatWidget.jsx';
const TOUR = 'public/newdesign/spotlightTour.js';
const DASH = 'public/newdesign/dashTour.js';
const PROPOSALS = 'src/lib/ai/proposals.mjs';
const GL = 'src/lib/ai/goalLabels.mjs';

export default {
  test: 'node --test tests/nora-account-setup.test.mjs tests/nora-account-setup-surfaces.test.mjs tests/nora-app-sheet.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── Whose account ──
    { name: 'a proposal naming another account is drafted', file: CORE, find: "    if (k === 'email' || String(inp[k]).trim().toLowerCase() !== String(actorId || '').toLowerCase()) throw new Error(OTHER_ACCOUNT_MSG);", replace: '    continue;' },
    { name: 'userId is not a target key', file: CORE, find: "const TARGET_KEYS = ['userId', ", replace: 'const TARGET_KEYS = [' },
    { name: 'execute and undo take any target', file: ACT, find: "if (!uid || !plan || !plan.target || plan.target.userId !== uid || plan.target.kind !== 'account_setup') throw new Error(NOT_ALLOWED_MSG);", replace: 'if (!uid || !plan) throw new Error(NOT_ALLOWED_MSG);' },
    { name: 'execute takes another account as the target', file: ACT, find: 'plan.target.userId !== uid || ', replace: '' },
    { name: "execute takes another action's target", file: ACT, find: " || plan.target.kind !== 'account_setup') throw", replace: ') throw' },
    { name: 'the preview aims at no one in particular', file: ACT, find: "      target: { userId: ctx.actor.id, kind: 'account_setup', id: null },", replace: "      target: { userId: ctx.actor.id, kind: 'self', id: null }," },
    { name: 'the engine writes for no account', file: CORE, find: '  if (!uid) throw new Error(NOT_ALLOWED_MSG);\n', replace: '' },
    { name: "the name read is anyone's", file: CORE, find: ".from('profiles').select('full_name').eq('id', uid).maybeSingle()", replace: ".from('profiles').select('full_name').maybeSingle()" },
    {
      name: 'the documents read are not keyed on the account', file: CORE,
      find: ".select('kind, data, updated_at').eq('user_id', uid).in('kind', kinds)", replace: ".select('kind, data, updated_at').in('kind', kinds)",
      // PROOF OF NO-OP: user_goals has one read policy, user_goals_read_own (`using (user_id = auth.uid())`,
      // supabase-migrations/2026-04-20-user-goals.sql), and the engine reads through the caller's own RLS
      // client, so the rows that come back are the caller's with or without the filter; the fake models
      // that policy. The filter stays as the habit of every reader here, not as the gate.
      expectSurvive: true,
    },
    {
      name: 'the notification row read is not keyed on the account', file: CORE,
      find: ".select('quiet_start, quiet_end, daily_cap').eq('user_id', uid).maybeSingle()", replace: ".select('quiet_start, quiet_end, daily_cap').maybeSingle()",
      // PROOF OF NO-OP: notification_settings' only policy is notif_settings_own, `for all ... using
      // (user_id = auth.uid())` (supabase-migrations/2026-06-17-notification-center.sql): through the
      // caller's RLS client there is at most their own row to read.
      expectSurvive: true,
    },
    {
      name: 'a document update is not keyed on the account', file: CORE,
      find: ".update({ data }).eq('user_id', uid).eq('kind', c0.kind)", replace: ".update({ data }).eq('kind', c0.kind)",
      // PROOF OF NO-OP: user_goals_update_own (`using (user_id = auth.uid()) with check (user_id =
      // auth.uid())`, 2026-04-20-user-goals.sql) confines an UPDATE through the caller's client to their
      // own rows, and the updated_at guard beside it names one row of theirs; the fake models the policy.
      expectSurvive: true,
    },

    // ── The allowlist and the person's own boxes ──
    { name: 'a coach field opens to a member', file: CORE, find: "    if (spec.who === 'coach' && !isCoach) { refused.push({ field, label, reason: 'coach_only' }); continue; }\n", replace: '' },
    { name: 'everyone reads as a coach', file: CORE, find: 'const isCoach = (Array.isArray(roles) ? roles : []).some((r) => COACH_ROLES.includes(r));', replace: 'const isCoach = true;' },
    { name: "the action does not pass the account's roles", file: ACT, find: 'roles: [ctx.actor.role].concat(ctx.actor.roles || [])', replace: 'roles: []' },
    { name: "the person's own boxes read as merely not here", file: CORE, find: "reason: YOURS_RE.test(fold(field)) ? 'yours' : 'not_here'", replace: "reason: 'not_here'" },
    { name: 'a password is not named as theirs', file: CORE, find: 'const YOURS_RE = /pass ?word|', replace: 'const YOURS_RE = /' },
    { name: 'the privacy switches are not named as theirs', file: CORE, find: '|privacy|visib|share|public/;', replace: '/;' },
    { name: 'a second answer for one field is taken', file: CORE, find: "    if (seen.has(field)) { refused.push({ field, label, reason: 'invalid' }); continue; }\n", replace: '' },
    { name: 'a proposal has no ceiling', file: CORE, find: 'inp.changes.slice(0, SETUP_MAX_CHANGES)', replace: 'inp.changes' },
    {
      name: 'any value type reaches the parser', file: CORE,
      find: "(typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') && String(raw).length <= 2000 ? spec.parse(raw) : null", replace: 'spec.parse(raw)',
      // PROOF OF NO-OP: every parser already refuses a non-scalar and anything that long. Each reads its
      // value through text() (null for an object, an array, null or undefined), or through onOff /
      // parseHour, which take a boolean / an integer and otherwise go through text() too; and each caps its
      // length below 2,000 (option 60, goal 60, name 60, headline 80, About 1,200, the facts 80) or matches
      // a fixed vocabulary. The gate is defence in depth in front of twenty-three parsers.
      expectSurvive: true,
    },
    { name: 'the cell allowlist admits anything', file: CORE, find: '!ALLOWED_CELLS.has(cellId(c))', replace: 'false' },
    { name: 'the scaffold keeps the raw input, refused values and all', file: PROPOSALS, find: 'suggestion: preview.suggestion !== undefined ? preview.suggestion : (input ?? null),', replace: 'suggestion: input ?? null,' },
    { name: 'the setup keeps no checked suggestion', file: ACT, find: "      suggestion: { changes: plan.changes, refused: plan.refused.map(function (r) { return { field: r.field, reason: r.reason }; }) },\n", replace: '' },

    // ── Each field's rule ──
    { name: 'an option is not read by its English label', file: CORE, find: ' || rows.find((o) => fold(o.en) === f)', replace: '' },
    { name: 'a goal past the step\'s length is cut, not refused', file: CORE, find: ".trim()).length > SIGNUP_GOAL_MAX) return null;", replace: '.trim()).length > 1000) return null;' },
    { name: 'a goal need not be words', file: CORE, find: "return g && (SIGNUP_GOALS.some((x) => x.id === g) || /\\p{L}/u.test(g)) ? g : null;", replace: 'return g || null;' },
    { name: 'sessions a week run 1 to 7', file: CORE, find: "match(/^([2-6])(?: ?(?:x|", replace: "match(/^([1-7])(?: ?(?:x|" },
    { name: 'pounds do not mean imperial', file: CORE, find: "['imperial', 'lb', 'lbs', 'pounds',", replace: "['imperial', 'pounds'," },
    { name: 'quiet hours take minutes', file: CORE, find: "  if (m[2] != null && m[2] !== '00') return null;\n", replace: '' },
    { name: 'a 12-hour clock takes 13', file: CORE, find: '    if (h < 1 || h > 12) return null;\n', replace: '' },
    { name: '12 am is noon', file: CORE, find: "    h = h % 12 + (half === 'p' ? 12 : 0);", replace: "    h = h + (half === 'p' ? 12 : 0);" },
    { name: 'any daily limit from 2 to 8', file: CORE, find: 'return DAILY_CAPS.includes(n) ? n : null;', replace: 'return n >= 2 && n <= 8 ? n : null;' },
    { name: 'a name may be an address', file: CORE, find: '/@|:\\/\\/|www\\./i.test(name)', replace: '/:\\/\\//i.test(name)' },
    { name: 'a name need not have a letter', file: CORE, find: "!/\\p{L}/u.test(name) || ", replace: '' },
    { name: 'a name has no length limit', file: CORE, find: 'if (!out.length || out.length > NAME_MAX) return null;', replace: 'if (!out.length) return null;' },
    {
      name: 'a headline line is read up to 200', file: CORE, find: 'const v = line(raw, BS_LINE_MAX);', replace: 'const v = line(raw, 200);',
      // PROOF OF NO-OP: the headline is then held to `bsProfileLine(v) === v`, and bsProfileLine clamps to
      // BS_LINE_MAX (80, public/newdesign/profileCustom.mjs), so a value past 80 never equals its clamp and
      // is refused either way. The two are the same rule said twice: Make it yours' cleaner and ours.
      expectSurvive: true,
    },
    { name: 'an About has no length limit', file: CORE, find: 'return v && v.length <= BS_ABOUT_STORY_MAX ? v : null;', replace: 'return v || null;' },
    { name: 'years coaching from 0, without end', file: CORE, find: 'return Number.isInteger(n) && n >= 1 && n <= BS_ABOUT_YEARS_MAX ? n : null;', replace: 'return Number.isInteger(n) && n >= 0 ? n : null;' },
    { name: '"in person" is not read', file: CORE, find: "f === 'in person' || f === 'inperson' || ", replace: '' },
    { name: '"not right now" is not a no', file: CORE, find: "'not right now': 'none', ", replace: '' },

    // ── The card ──
    { name: 'an unchanged value is drawn as a change', file: CORE, find: '    if (!moving) { unchanged.push(ch.field); continue; }', replace: '    if (false) { unchanged.push(ch.field); continue; }' },
    { name: 'an unset check-in reads off', file: CORE, find: "return v == null ? 'On' : onOff(v) || 'On';", replace: 'return v;' },
    { name: 'a row not yet made reads as nothing, not the defaults', file: CORE, find: ": { had: false, value: NOTIFY_DEFAULTS[c.key] };", replace: ': { had: false, value: null };' },
    { name: 'the members-only gate is dropped from the preview', file: ACT, find: '    memberGate(ctx);\n    var plan = planSetupChanges(', replace: '    var plan = planSetupChanges(' },

    // ── Confirm and Undo ──
    { name: 'confirm writes before checking every cell', file: CORE, find: '  checkCells(await readState(sb, uid, cells), cells, dir);\n', replace: '' },
    { name: 'a document is written without its updated_at guard', file: CORE, find: ".eq('kind', c0.kind).eq('updated_at', row.updatedAt).select('kind')", replace: ".eq('kind', c0.kind).select('kind')" },
    { name: 'the notification row is written without its guard', file: CORE, find: "        for (const c of todo) q = q.eq(c.key, dir === 'apply' ? c.before : c.after);\n", replace: '' },
    { name: 'the name is written without its guard', file: CORE, find: "      q = from == null ? q.is('full_name', null) : q.eq('full_name', from);\n", replace: '' },
    { name: 'a first row made beside ours is a failure', file: CORE, find: "      if (res.error.code === '23505') continue;", replace: "      if (false) continue;" },
    { name: 'a new notification row is made in UTC', file: CORE, find: 'insert({ user_id: uid, tz: tz || \'UTC\', ...patch })', replace: "insert({ user_id: uid, tz: 'UTC', ...patch })" },
    { name: 'a failed apply is not rolled back', file: CORE, find: "      if (dir === 'apply') {\n        const kept = [];", replace: "      if (false) {\n        const kept = [];" },
    { name: 'undo trips over a cell already back', file: CORE, find: "    else if (dir === 'undo' && sameValue(cur, to)) continue;\n", replace: '' },
    { name: 'an About in another key order reads as changed', file: CORE, find: 'Object.fromEntries(Object.keys(v).sort().map(', replace: 'Object.fromEntries(Object.keys(v).map(' },
    { name: 'an About the cleaner would reshape is saved', file: CORE, find: '!sameValue(bsProfileAbout(data.about), data.about)', replace: 'false' },
    { name: 'the action is not registered', file: ACT, find: 'checkHabitAction, setReminderAction, setUpAccountAction];', replace: 'checkHabitAction, setReminderAction];' },

    // ── The route ──
    { name: 'the budget is not enforced', file: ROUTE, find: "      if (!budget.allowed) return { result: { error: 'daily_budget', message: budgetReply('account_setup', budget.resetSeconds) }, actions: [] };", replace: '' },
    { name: "the budget counts another feature's bucket", file: ROUTE, find: "countBudget(actor.supabase, actor.user.id, 'account_setup');", replace: "countBudget(actor.supabase, actor.user.id, 'speak');" },
    { name: 'the budget is ten times larger', file: LIMITS, find: '  account_setup: 30,', replace: '  account_setup: 300,' },
    { name: 'set_up_account is not a write tool', file: ROUTE, find: "'check_habit', 'set_reminder', 'set_up_account']);", replace: "'check_habit', 'set_reminder']);" },
    { name: 'the tool is not offered', file: ROUTE, find: '  // quiet hours and, for a coach, headline and About. DRAFTS one card; the server\'s allowlist and\n  // each field\'s own rule decide what is set, never the model.\n  SETUP_TOOL,\n', replace: '' },
    { name: 'the note rides on a panel with no cards', file: ROUTE, find: 'const setupNote = member.memberTools.length && !member.noCards && !member.cookMsg ?', replace: 'const setupNote = member.memberTools.length ?' },

    // ── The app ──
    { name: 'a refused row is drawn as a line', file: APP, find: '{diff.map((d, i) => (isRefused(d)', replace: '{diff.map((d, i) => (false' },
    { name: 'a refusal is not said in their words', file: APP, find: "<span style={{ color: muted }}>{refusedWhy(d)}</span>", replace: '<span style={{ color: muted }}>{d.after}</span>' },
    { name: "a card forgets it was confirmed", file: APP, find: "setStatus('done'); keep('done', r && r.auditId);", replace: "setStatus('done');" },
    { name: 'a kept outcome is not read back', file: APP, find: "React.useState(kept ? kept.status : 'idle');", replace: "React.useState('idle');" },
    { name: 'a confirmed setup reads nothing again', file: APP, find: '      if (setupCard) bsAfterAccountSetup(false);\n', replace: '' },
    { name: 'an undone setup reads nothing again', file: APP, find: '      if (setupCard) bsAfterAccountSetup(true);\n', replace: '' },
    { name: 'the first run is not told of a setup', file: APP, find: "  try { window.dispatchEvent(new CustomEvent('shape:accountSetup', { detail: { undone: !!undone } })); } catch (e) {}\n", replace: '' },
    { name: 'the units are not read again', file: APP, find: '        if (st.units) { try { window.ShapeUnits?.set?.(st.units); } catch (e) {} }\n', replace: '' },
    { name: 'every confirmed card says "saved to your account"', file: APP, find: "{status === 'done' && setupCard && (", replace: "{status === 'done' && (" },
    { name: 'the goal step has no door', file: APP, find: '        {onNora && (\n          <button type="button" data-nora-setup', replace: '        {false && (\n          <button type="button" data-nora-setup' },
    { name: 'the shell gives the step no way to open her', file: APP, find: ' onNora={setUpWithNora} />}{noraSheet}</>;', replace: ' />}{noraSheet}</>;' },
    { name: 'the first-run steps do not listen for a setup', file: APP, find: "    window.addEventListener('shape:accountSetup', again);\n", replace: '' },
    { name: "her sheet is not drawn over the goal step", file: APP, find: "onNora={setUpWithNora} />}{noraSheet}</>;", replace: 'onNora={setUpWithNora} />}</>;' },

    // ── The when-it-changed stamps (Codex on 60fdc94) ──
    { name: "execute writes the card's stamp, not Confirm's", file: ACT, find: '    var cells = stampSetupCells(a.cells, new Date().toISOString());', replace: '    var cells = a.cells;' },
    { name: 'the stamped cells are not kept for the undo', file: ACT, find: '    plan.afterState = Object.assign({}, a, { cells: cells });\n', replace: '' },
    { name: 'every cell is stamped', file: CORE, find: 'isObj(c) && STAMP_CELLS.has(cellId(c)) ? { ...c, after: now } : c', replace: 'isObj(c) ? { ...c, after: now } : c' },
    { name: 'the stamp is written into the cells given', file: CORE, find: 'STAMP_CELLS.has(cellId(c)) ? { ...c, after: now } : c', replace: 'STAMP_CELLS.has(cellId(c)) ? Object.assign(c, { after: now }) : c' },
    { name: 'the allowlist names no stamp', file: CORE, find: ".filter((c) => c.stamp).map(cellId)", replace: ".filter((c) => false).map(cellId)" },

    // ── The goal's words in the member's language (Codex on a569e48) ──
    { name: 'the goal mirror is English in every language', file: CORE, find: 'value: primaryGoalLabel(g, locale) ?? goalLabel(g) }', replace: 'value: goalLabel(g) }' },
    { name: 'the preview drops the language', file: CORE, find: 'cells: SETUP_FIELDS[ch.field].cells(ch.value, now, { locale }) }));', replace: 'cells: SETUP_FIELDS[ch.field].cells(ch.value, now) }));' },
    { name: 'the action drops the language', file: ACT, find: 'tz: tz, locale: locale });', replace: 'tz: tz });' },
    { name: "the route's context carries no language", file: ROUTE, find: "isMember, draftModel, zone, locale: locale || 'en' },", replace: 'isMember, draftModel, zone },' },
    { name: 'the route hands the proposer no language', file: ROUTE, find: 'actor ? zone : null, locale);', replace: 'actor ? zone : null);' },
    { name: "a language's label is read in English", file: GL, find: 'const row = Object.prototype.hasOwnProperty.call(PRIMARY_GOAL_LABELS, locale) ? PRIMARY_GOAL_LABELS[locale] : en;', replace: 'const row = en;' },

    { name: 'a goal named in another language is kept as their words', file: CORE, find: 'const g = primaryGoalFromWords(s) || signupGoalFromText(s);', replace: 'const g = signupGoalFromText(s);' },
    { name: "a goal's words are matched as typed, unfolded", file: GL, find: ".normalize('NFKC').toLowerCase().replace(/\\s+/g, ' ').trim();", replace: ';' },

    // ── A restore that fails too (Codex on a569e48) ──
    { name: 'a failed restore still says nothing was changed', file: CORE, find: 'if (kept.length) throw new Error(partialSavedMsg(', replace: 'if (false) throw new Error(partialSavedMsg(' },
    { name: 'a failed restore names nothing kept', file: CORE, find: '            kept.push(...g);\n', replace: '' },

    // ── A notification row the setup made, on Undo (Codex on fbf4a41) ──
    { name: 'Undo keeps the notification row the setup made', file: CORE, find: "      if (dir === 'undo' && state.notify && cells.every((c) => c.had === false)) {", replace: '      if (false) {' },
    { name: 'Undo deletes a notification row the member had before', file: CORE, find: '&& state.notify && cells.every((c) => c.had === false)) {', replace: '&& state.notify) {' },
    { name: 'the delete ignores the mute', file: CORE, find: ".delete().eq('user_id', uid).eq('muted', false).eq('tz', tz || 'UTC');", replace: ".delete().eq('user_id', uid).eq('tz', tz || 'UTC');" },
    { name: 'the delete ignores the zone', file: CORE, find: ".eq('muted', false).eq('tz', tz || 'UTC');", replace: ".eq('muted', false);" },
    { name: "the delete ignores the columns the setup did not set", file: CORE, find: 'del = del.eq(k, mine ? mine.after : NOTIFY_DEFAULTS[k]);', replace: 'del = mine ? del.eq(k, mine.after) : del;' },
    { name: 'a delete that removed nothing is read as done', file: CORE, find: 'if (gone && !gone.error && Array.isArray(gone.data) && gone.data.length) return true;', replace: 'if (gone && !gone.error) return true;' },

    // ── The website and the tours ──
    { name: 'the website draws a refused row as a line', file: WEB, find: '{diff.map((d, i) => cwIsRefused(d) ? (', replace: '{diff.map((d, i) => false ? (' },
    // ── A website card's outcome outlives the card (Codex on 08677b3) ──
    // One source (Codex on 88348f0): Applied and Undone are drawn from the kept outcome alone.
    { name: 'a website card forgets it was applied', file: WEB, find: 'phase : kept ? kept.status : phase === "error"', replace: 'phase : phase === "error"' },
    { name: 'a website card forgets its Undo', file: WEB, find: 'const auditId = kept ? kept.auditId : null;', replace: 'const auditId = null;' },
    { name: 'a confirmed website card is not kept', file: WEB, find: '      cwCardDoneKeep(token, "done", r && r.auditId);\n', replace: '' },
    { name: 'an undone website card is not kept', file: WEB, find: '      cwCardDoneKeep(token, "undone", auditId);\n', replace: '' },
    { name: 'a confirmed setup does not tell the page under the website card', file: WEB, find: 'cwCardDoneKeep(token, "done", r && r.auditId);\n      setPhase(null);\n      adopt();', replace: 'cwCardDoneKeep(token, "done", r && r.auditId);\n      setPhase(null);' },
    { name: 'an undone setup does not tell the page under the website card', file: WEB, find: 'cwCardDoneKeep(token, "undone", auditId);\n      setPhase(null);\n      adopt();', replace: 'cwCardDoneKeep(token, "undone", auditId);\n      setPhase(null);' },
    { name: 'the page under the website card is told of every card', file: WEB, find: 'if (now && now !== was && isSetup) cwAfterAccountSetup', replace: 'if (now && now !== was) cwAfterAccountSetup' },
    { name: 'the page under the website card is told of no setup', file: WEB, find: '    if (now && now !== was && isSetup) cwAfterAccountSetup(now === "undone");\n', replace: '' },
    { name: 'the same outcome heard again is announced again', file: WEB, find: 'if (now && now !== was && isSetup)', replace: 'if (now && isSetup)' },
    { name: 'a website card does not hear another tab', file: WEB, find: '    try { window.addEventListener("storage", onStore); } catch (e) { return undefined; }', replace: '    return undefined;' },
    { name: 'a Confirm lost to another tab shows its error over the winner\'s outcome', file: WEB, find: '      if (adopt()) { setPhase(null); return; }\n', replace: '' },
    { name: 'an error outranks the kept outcome', file: WEB, find: 'const status = phase === "busy" || phase === "undoing" ? phase : kept ? kept.status : phase === "error" ? "error" : "idle";', replace: 'const status = phase === "busy" || phase === "undoing" || phase === "error" ? phase : kept ? kept.status : "idle";' },
    { name: 'a browser that refuses storage keeps no outcome', file: WEB, find: '  _cwCardDoneMem.set(id, v);\n', replace: '' },
    {
      name: "a website card takes any key's change as its own", file: WEB, find: 'if (e && e.key != null && e.key !== CW_CARD_DONE_KEY) return;', replace: 'if (false) return;',
      // PROOF OF NO-OP: on any storage event the card re-reads its own outcome from the one store
      // (cwCardDoneRead), so another key's change reads back what it already shows; the key check
      // only spares that read. The test's other-key event confirms the card is unchanged either way.
      expectSurvive: true,
    },
    { name: 'every website card is kept as one', file: WEB, find: 'token.slice(token.lastIndexOf(".") + 1) || null', replace: '"all"' },
    { name: 'every confirmed web card says "saved to your account"', file: WEB, find: '{status === "done" && a.action === "set_up_account" && (', replace: '{status === "done" && (' },
    { name: "the tour's other way on runs before the tour is marked seen", file: TOUR, find: "other.onclick = () => { finish(); try { step.onAlt(); } catch (_) {} };", replace: "other.onclick = () => { try { step.onAlt(); } catch (_) {} finish(); };" },
    { name: 'the tour never draws the other way on', file: TOUR, find: '`${alt ? `<button data-st="alt"', replace: '`${false ? `<button data-st="alt"' },
    { name: "the website opens Chat, not Nora", file: DASH, find: "window.__openChatTo({ who: 'Nora', tab: 'support', draft: draft });", replace: "window.__openChatTo({ who: 'Nora', tab: 'team', draft: draft });" },
    { name: "the coach tour's Welcome has no door", file: PROS, find: "        altLabel: tr('coach:tour.noraSetup', { defaultValue: 'Set up with Nora' }), onAlt:", replace: "        altLabelX: tr('coach:tour.noraSetup', { defaultValue: 'Set up with Nora' }), onAlt:" },
  ],
};
