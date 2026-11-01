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
    { name: 'a failed apply is not rolled back', file: CORE, find: "      if (dir === 'apply') {\n        for (const g of done.reverse()) {", replace: "      if (false) {\n        for (const g of done.reverse()) {" },
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

    // ── The website and the tours ──
    { name: 'the website draws a refused row as a line', file: WEB, find: '{diff.map((d, i) => cwIsRefused(d) ? (', replace: '{diff.map((d, i) => false ? (' },
    { name: 'every confirmed web card says "saved to your account"', file: WEB, find: '{status === "done" && a.action === "set_up_account" && (', replace: '{status === "done" && (' },
    { name: "the tour's other way on runs before the tour is marked seen", file: TOUR, find: "other.onclick = () => { finish(); try { step.onAlt(); } catch (_) {} };", replace: "other.onclick = () => { try { step.onAlt(); } catch (_) {} finish(); };" },
    { name: 'the tour never draws the other way on', file: TOUR, find: '`${alt ? `<button data-st="alt"', replace: '`${false ? `<button data-st="alt"' },
    { name: "the website opens Chat, not Nora", file: DASH, find: "window.__openChatTo({ who: 'Nora', tab: 'support', draft: draft });", replace: "window.__openChatTo({ who: 'Nora', tab: 'team', draft: draft });" },
    { name: "the coach tour's Welcome has no door", file: PROS, find: "        altLabel: tr('coach:tour.noraSetup', { defaultValue: 'Set up with Nora' }), onAlt:", replace: "        altLabelX: tr('coach:tour.noraSetup', { defaultValue: 'Set up with Nora' }), onAlt:" },
  ],
};
