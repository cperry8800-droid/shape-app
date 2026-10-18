// Mutation spec for the Business follow-up on client names (left open by #2394 and #2395): both
// analytics routes read their roster's names a batch of ids at a time (src/lib/client-names.ts), send
// a name they don't have as null with `nameUnread` saying whether the read failed (the roster's and
// the churn list's alike), and the nutritionist route's unread `newClients7d` is gone. The website
// and the app say an unread name and a missing one each in their own words. Each mutation undoes one
// guard; the tests must fail on every one.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/business-followup-names-2026-10-18.mutations.mjs --fail-on-skipped
const NAMES = 'src/lib/client-names.ts';
const TR = 'src/app/api/trainer/analytics/route.ts';
const NU = 'src/app/api/nutritionist/analytics/route.ts';
const CF = 'public/newdesign/coachForecast.js';
const BIZ = 'public/newdesign/dashBusiness.jsx';
const APP = 'mobile-app/src/broadsheet/BSCoachBusiness.jsx';
const DE = 'mobile-app/src/i18n/catalogs/de/coach.json';

// The old read, in the helper's shape: one select over every id, its error dropped.
const ONE_READ = "      supabase.from('profiles').select('id, full_name').in('id', clientIds).then(({ data }) => ({ names: new Map<string, string>((data ?? []).map((r) => [String(r.id), String(r.full_name ?? '').trim()])), unread: new Set<string>() })),";

const routeMutations = (role, file) => [
  { name: `${role} roster: one profiles read of every id again (cut at 1,000, its error dropped)`, file,
    find: '      profileNames(supabase, clientIds),',
    replace: ONE_READ },
  { name: `${role} roster: the names read are never used`, file,
    find: '    for (const [id, name] of rosterNames.names) activeNames.set(id, name);\n',
    replace: '' },
  { name: `${role} roster: a name it doesn't have is "Client" again`, file,
    find: '      r.name = activeNames.get(r.client_id) || null;',
    replace: "      r.name = activeNames.get(r.client_id) || 'Client';" },
  { name: `${role} roster: an unread name is never said`, file,
    find: '      r.nameUnread = rosterNames.unread.has(r.client_id);',
    replace: '      r.nameUnread = false;' },
  { name: `${role} churn: a failed get_display_names flags no row`, file,
    find: '      for (const id of churnIds) churnUnread.add(String(id));\n',
    replace: '' },
  { name: `${role} churn: a name it doesn't have is "Former client" again`, file,
    find: '      name: churnNames.get(String(r.client_id)) || null,',
    replace: "      name: churnNames.get(String(r.client_id)) || 'Former client'," },
  { name: `${role} churn: nameUnread is not sent`, file,
    find: '      nameUnread: churnUnread.has(String(r.client_id)),\n',
    replace: '' },
  { name: `${role} churn: a row with no client reads as unread`, file,
    find: '      nameUnread: churnUnread.has(String(r.client_id)),',
    replace: '      nameUnread: churnUnread.size > 0,' },
];

export default {
  test: 'node --test tests/coach-analytics-routes.test.mjs tests/coach-forecast.test.mjs tests/business-plan-page.test.mjs tests/app-coach-business.test.mjs',
  timeoutMs: 240_000,
  mutations: [
    // ── The shared read (src/lib/client-names.ts) ──
    { name: 'names: one read of every id (no batches)', file: NAMES,
      find: 'export const NAME_BATCH = 100;',
      replace: 'export const NAME_BATCH = 1_000_000;' },
    { name: 'names: batches of 1,000 ids (the URL length limit)', file: NAMES,
      find: 'export const NAME_BATCH = 100;',
      replace: 'export const NAME_BATCH = 1000;' },
    { name: 'names: a failed batch is dropped silently', file: NAMES,
      find: '      for (const id of batch) unread.add(id);\n',
      replace: '' },
    { name: 'names: a failed batch marks every id unread', file: NAMES,
      find: '      for (const id of batch) unread.add(id);',
      replace: '      for (const id of want) unread.add(id);' },
    { name: 'names: a failed batch stops the read', file: NAMES,
      find: '      continue;\n    }',
      replace: '      break;\n    }' },
    { name: 'names: a repeated id is asked for twice', file: NAMES,
      find: "  const want = [...new Set(ids.filter((id) => id != null && id !== '').map(String))];",
      replace: "  const want = ids.filter((id) => id != null && id !== '').map(String);" },
    { name: 'names: an id that is no id is asked for', file: NAMES,
      find: "ids.filter((id) => id != null && id !== '')",
      replace: 'ids' },
    { name: 'names: one batch past the end (a read for no ids)', file: NAMES,
      find: '  for (let i = 0; i < want.length; i += NAME_BATCH) {',
      replace: '  for (let i = 0; i <= want.length; i += NAME_BATCH) {' },
    { name: 'names: a name is not trimmed', file: NAMES,
      find: "      names.set(String(r.id), String(r.full_name ?? '').trim());",
      replace: "      names.set(String(r.id), String(r.full_name ?? ''));" },
    { name: 'names: a profile with no name reads "null"', file: NAMES,
      find: "      names.set(String(r.id), String(r.full_name ?? '').trim());",
      replace: '      names.set(String(r.id), String(r.full_name).trim());' },

    // ── Both routes ──
    ...routeMutations('trainer', TR),
    ...routeMutations('nutritionist', NU),

    // ── The nutritionist's newClients7d is gone ──
    { name: 'nutritionist ticker: newClients7d is sent again, at 0', file: NU,
      find: '      avgLogsPerClient,\n    },',
      replace: '      newClients7d: 0,\n      avgLogsPerClient,\n    },' },
    { name: 'nutritionist: the count of new subscriptions is read again', file: NU,
      find: '  // -------- Client-progress rollups for nutritionist roster',
      replace: "  await supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('provider_role', 'nutritionist').eq('provider_id', providerId).gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString());\n  // -------- Client-progress rollups for nutritionist roster" },

    // ── The pages' shared departures (coachForecast.js) ──
    { name: 'departures: nameUnread is dropped', file: CF,
      find: '        name: last.name, nameUnread: last.nameUnread === true, clientId:',
      replace: '        name: last.name, clientId:' },
    { name: "departures: a row with no flag (the preview's) reads as unread", file: CF,
      find: 'nameUnread: last.nameUnread === true,',
      replace: 'nameUnread: last.nameUnread !== false,' },

    // ── The website (plain English) ──
    { name: 'website: an unread name reads as no name on file', file: BIZ,
      find: 'const dbzName = (r, none) => r.name || (r.nameUnread ? "Name couldn\'t be read" : none);',
      replace: 'const dbzName = (r, none) => r.name || none;' },
    { name: 'website: no name on file reads as unread', file: BIZ,
      find: 'const dbzName = (r, none) => r.name || (r.nameUnread ? "Name couldn\'t be read" : none);',
      replace: 'const dbzName = (r, none) => r.name || "Name couldn\'t be read";' },
    { name: "website churn: the route's name alone again, blank when there is none", file: BIZ,
      find: '{dbzName(r, "Former client")}',
      replace: '{r.name}' },
    { name: 'website outcomes: the weight list says "Client" for an unread name again', file: BIZ,
      find: '              <span style={{ fontSize: 13, fontWeight: 500 }}>{dbzName(r, "Client")}</span>\n              <span style={{ fontFamily: serif, fontSize: 15, color: DBZ_TEAL }}>',
      replace: '              <span style={{ fontSize: 13, fontWeight: 500 }}>{r.name || "Client"}</span>\n              <span style={{ fontFamily: serif, fontSize: 15, color: DBZ_TEAL }}>' },
    { name: 'website outcomes: the consistency list says "Client" for an unread name again', file: BIZ,
      find: '                <span style={{ fontSize: 13, fontWeight: 500 }}>{dbzName(r, "Client")}</span>\n                <span style={{ fontFamily: serif, fontSize: 15 }}>',
      replace: '                <span style={{ fontSize: 13, fontWeight: 500 }}>{r.name || "Client"}</span>\n                <span style={{ fontFamily: serif, fontSize: 15 }}>' },

    // ── The app (every language) ──
    { name: "app: the route's name alone again, blank when there is none", file: APP,
      find: 'label={leftName(r)}',
      replace: 'label={r.name}' },
    { name: 'app: an unread name reads as a former client', file: APP,
      find: '  const leftName = (r) => r.name || (r.nameUnread\n',
      replace: '  const leftName = (r) => r.name || (false\n' },
    { name: 'app: no name on file reads as unread', file: APP,
      find: '  const leftName = (r) => r.name || (r.nameUnread\n',
      replace: '  const leftName = (r) => r.name || (true\n' },
    { name: 'app: "Former client" in English in every language', file: APP,
      find: "    : tr('coach:business.clients.leftNoName', { defaultValue: 'Former client' }));",
      replace: "    : 'Former client');" },
    { name: 'app: "Name couldn\'t be read" in English in every language', file: APP,
      find: "    ? tr('coach:business.clients.nameUnread', { defaultValue: \"Name couldn't be read\" })",
      replace: "    ? \"Name couldn't be read\"" },
    { name: 'catalog: German says "Former client" in English', file: DE,
      find: '  "business.clients.leftNoName": "Ehemaliger Klient",',
      replace: '  "business.clients.leftNoName": "Former client",' },
  ],
};
