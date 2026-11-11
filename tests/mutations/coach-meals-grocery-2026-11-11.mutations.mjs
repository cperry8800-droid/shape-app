// Mutation spec for the nutritionist's meals and grocery note reaching the member (left by #2686): each
// mutation undoes one guard, and the suites below must fail on every one. The migration's mutations are
// source checks (the runner does not run Postgres).
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/coach-meals-grocery-2026-11-11.mutations.mjs --fail-on-skipped
const LIB = 'src/lib/coach-meals.ts';
const ROUTE = 'src/app/api/client/coach-meals/route.ts';
const CONSOLE = 'src/app/api/nutritionist/console/route.ts';
const SQL = 'supabase-migrations/2026-11-10-coach-grocery-note.sql';
const VIEW = 'mobile-app/src/broadsheet/BSCoachMeals.jsx';
const BACKEND = 'mobile-app/src/services/shapeBackend.js';
const PAGE = 'public/newdesign/NutritionistLiveConsole.html';

export default {
  test: 'node --test tests/coach-meals-member.test.mjs tests/coach-console-routes.test.mjs tests/coach-console-page.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── the shared reader ──
    { name: 'a row of another kind is a meal', file: LIB,
      find: "  if (!row || row.kind !== 'meal' || row.id == null) return null;",
      replace: "  if (!row || row.id == null) return null;" },
    { name: 'a nameless meal is listed', file: LIB,
      find: "  const name = text(p.name);\n  if (!name) return null;\n  const sentAt = typeof row.sent_at === 'string' ? row.sent_at : null;\n  const day = sentAt ? memberDay(sentAt, zone) : null;",
      replace: "  const name = text(p.name) || 'Meal';\n  const sentAt = typeof row.sent_at === 'string' ? row.sent_at : null;\n  const day = sentAt ? memberDay(sentAt, zone) : null;" },
    { name: 'a meal is placed on the UTC day', file: LIB,
      find: "  const day = sentAt ? memberDay(sentAt, zone) : null;\n  if (!sentAt || !day) return null;\n  return {\n    id: String(row.id),\n    providerId: String(row.provider_id ?? ''),\n    name,",
      replace: "  const day = sentAt ? memberDay(sentAt, null) : null;\n  if (!sentAt || !day) return null;\n  return {\n    id: String(row.id),\n    providerId: String(row.provider_id ?? ''),\n    name," },
    { name: 'the last note read wins, not the newest', file: LIB,
      find: '    if (!had || had.sentAt < n.sentAt) out.set(n.providerId, n);',
      replace: '    out.set(n.providerId, n);' },
    { name: 'a negative amount is a figure', file: LIB,
      find: '  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;',
      replace: '  return Number.isFinite(n) ? Math.round(n) : null;' },
    // ── the member's route ──
    { name: 'a former nutritionist\'s meals are the member\'s', file: ROUTE,
      find: '    .filter((m): m is PushedMeal => !!m && paid.has(m.providerId) && m.day in days)',
      replace: '    .filter((m): m is PushedMeal => !!m && m.day in days)' },
    { name: 'a former nutritionist\'s note is the member\'s', file: ROUTE,
      find: '    .filter((n) => paid.has(n.providerId))',
      replace: '    .filter((n) => !!n)' },
    { name: 'a failed notes read is "no note"', file: ROUTE,
      find: '  const failed = subRes.error || mealRes.error || noteRes.error || tzRes.error;',
      replace: '  const failed = subRes.error || mealRes.error || tzRes.error;' },
    { name: 'a failed zone read counts in UTC', file: ROUTE,
      find: '  const failed = subRes.error || mealRes.error || noteRes.error || tzRes.error;',
      replace: '  const failed = subRes.error || mealRes.error || noteRes.error;' },
    { name: 'a trainer\'s rows are read as meals', file: ROUTE,
      find: "      .eq('provider_role', 'nutritionist')\n      .eq('kind', 'meal')",
      replace: "      .eq('kind', 'meal')" },
    // ── the console ──
    { name: 'another day\'s meal is today\'s plan', file: CONSOLE,
      find: '    if (!m || m.day !== memberDay(now, zone)) continue;',
      replace: '    if (!m) continue;' },
    { name: 'a failed meals read is an empty plan', file: CONSOLE,
      find: '  const itemsUnread = !!mealRes.error || zonesUnread;',
      replace: '  const itemsUnread = zonesUnread;' },
    { name: 'a failed notes read is no note', file: CONSOLE,
      find: '  const groceryNoteUnread = !!noteRes.error;',
      replace: '  const groceryNoteUnread = false;' },
    { name: 'the old note is set aside before the new one saves', file: CONSOLE,
      find: '    let keep: string | null = null;\n    if (text) {',
      replace: "    let keep: string | null = null;\n    await supabase.from('coach_pushed_items').update({ removed_at: new Date().toISOString() }).eq('provider_role', ROLE).eq('provider_id', providerId).eq('client_id', clientId).eq('kind', 'grocery_note').is('removed_at', null);\n    if (text) {" },
    { name: 'the new note is set aside with the old', file: CONSOLE,
      find: '    if (keep) older = older.neq(\'id\', keep);',
      replace: '' },
    { name: 'a refused note answers ok', file: CONSOLE,
      find: "        .select('id')\n        .single();\n      if (error) return dbError(error, 'nutritionist console write', 400);\n      keep = String(data.id);",
      replace: "        .select('id')\n        .single();\n      keep = String(data?.id ?? '');" },
    { name: 'an overlong note is saved', file: CONSOLE,
      find: '    if (text.length > GROCERY_NOTE_MAX) {',
      replace: '    if (false) {' },
    // ── the migration ──
    { name: 'the kind check still refuses a note', file: SQL,
      find: "check (kind in ('exercise', 'meal', 'cue', 'grocery_note'))",
      replace: "check (kind in ('exercise', 'meal', 'cue'))" },
    { name: 'a note is filed as an exercise', file: SQL,
      find: "  if new.kind = 'grocery_note' then\n    insert into public.notifications (user_id, type, title, body, route, data)\n    values (uid, 'grocery', 'Note on your grocery list',\n            coalesce(new.payload->>'text', ''), 'eat', jsonb_build_object('itemId', new.id));\n  elsif new.kind = 'meal' and",
      replace: "  if new.kind = 'meal' and" },
    { name: 'a cue files a notice again', file: SQL,
      find: "  if new.kind = 'cue' then\n    return new;\n  end if;",
      replace: '' },
    // ── the app ──
    { name: 'a failed read draws as nothing on Eat', file: VIEW,
      find: "  if (read && read.status === 'error') {\n    return unreadBlock(t, tr, tr('nutrition:eat.coachAdded.unread'",
      replace: "  if (read && read.status === 'nope') {\n    return unreadBlock(t, tr, tr('nutrition:eat.coachAdded.unread'" },
    { name: 'today\'s meals carry no grocery note', file: VIEW,
      find: '      {today ? notesBlock(t, tr, read) : null}',
      replace: '      {null}' },
    { name: 'another day carries the grocery note', file: VIEW,
      find: '      {today ? notesBlock(t, tr, read) : null}',
      replace: '      {notesBlock(t, tr, read)}' },
    { name: 'the app treats a failed answer as an empty one', file: BACKEND,
      find: "    return { status: 'ready', today: typeof body.today === 'string' ? body.today : null, days: body.days, notes: Array.isArray(body.notes) ? body.notes : [] };\n  } catch (e) {\n    return { status: 'error' };",
      replace: "    return { status: 'ready', today: typeof body.today === 'string' ? body.today : null, days: body.days, notes: Array.isArray(body.notes) ? body.notes : [] };\n  } catch (e) {\n    return { status: 'ready', days: {}, notes: [] };" },
    { name: 'a cue redraws the meals', file: BACKEND,
      find: "        if (kind && kind !== 'meal' && kind !== 'grocery_note') return;",
      replace: "        if (kind && kind === 'exercise') return;" },
    // ── the console page ──
    { name: 'the page shows a meal before it is saved', file: PAGE,
      find: "      if (!res.ok || data.ok !== true || !data.id) throw new Error(data.error || \"Could not add the meal. Try again.\");",
      replace: "      setPlansById(prev => ({ ...prev, [forClient]: [...(prev[forClient] || []), { id: 'tmp', ...payload }] }));\n      if (!res.ok || data.ok !== true || !data.id) throw new Error(data.error || \"Could not add the meal. Try again.\");" },
    { name: 'the page drops a meal whose remove failed', file: PAGE,
      find: "      if (!res.ok || data.ok !== true) throw new Error(data.error || \"Could not remove the meal. Try again.\");",
      replace: "      setPlansById(prev => ({ ...prev, [forClient]: (prev[forClient] || []).filter(m => m.id !== id) }));\n      if (!res.ok || data.ok !== true) throw new Error(data.error || \"Could not remove the meal. Try again.\");" },
    { name: 'the page says a note was sent before it was', file: PAGE,
      find: "      if (!res.ok || data.ok !== true) throw new Error(data.error || \"Could not send the grocery note. Try again.\");",
      replace: "      flash(\"Grocery note sent to \" + who);\n      return;" },
    { name: 'an unread plan reads as empty', file: PAGE,
      find: '        setItemsUnread(d.itemsUnread === true);',
      replace: '        setItemsUnread(false);' },
  ],
};
