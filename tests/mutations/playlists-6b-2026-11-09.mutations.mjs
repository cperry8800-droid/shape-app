// Mutation spec for coach review step 6b: the coach Playlists page (trainerPlaylistsPage.jsx): the
// sample playlists only signed out, an unread client count never 0, a program day written in every
// week and held to the revision read, sends with the entry members read and reverted on failure,
// the roster only when read live, the coverage over the programs clients are on, the track list
// once each, and Delete behind ShapeConfirm.
// Data: every mutation must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/playlists-6b-2026-11-09.mutations.mjs --fail-on-skipped
const PAGE = 'public/newdesign/trainerPlaylistsPage.jsx';

export default {
  test: 'node --test tests/playlists-6b.test.mjs tests/coach-dashboard-fixes.test.mjs',
  timeoutMs: 600_000,
  mutations: [
    // ── The read: signed out (401) versus a read that failed
    { name: 'any failed read shows the sample playlists', file: PAGE,
      find: 'if (r.status === 401) { setRead({ state: "demo", rows: [] }); return; }', replace: 'if (!r.ok) { setRead({ state: "demo", rows: [] }); return; }' },
    { name: 'a network error shows the sample playlists', file: PAGE,
      find: '.catch(() => { if (!cancelled) setRead({ state: "unread", rows: [] }); });', replace: '.catch(() => { if (!cancelled) setRead({ state: "demo", rows: [] }); });' },
    { name: 'the demo band shows on a signed-in page', file: PAGE,
      find: '{demo && typeof DashDemoBand === "function" && <DashDemoBand />}', replace: '{typeof DashDemoBand === "function" && <DashDemoBand />}' },
    { name: 'the programs are read for a coach who is not signed in', file: PAGE,
      find: 'if (role !== "trainer" || read.state !== "live") return undefined;', replace: 'if (role !== "trainer") return undefined;' },
    { name: 'a row with no tracks reads "0 tracks"', file: PAGE,
      find: 'trackCount: Number.isFinite(n) && n > 0 ? n : null,', replace: 'trackCount: Number.isFinite(n) ? n : null,' },

    // ── Unread versus 0 clients
    { name: 'unread usage reads as 0 clients', file: PAGE,
      find: 'const clients = !usage ? null :', replace: 'const clients = !usage ? 0 :' },
    { name: 'a capped usage answer calls the unlisted 0', file: PAGE,
      find: '(usage.capped ? null : 0)', replace: '0' },
    { name: 'an unread program count adds up as 0', file: PAGE,
      find: 'const programClients = counts.some((c) => c == null) ? null :', replace: 'const programClients = false ? null :' },
    { name: 'a day on a program nobody is on is flagged', file: PAGE,
      find: 'const needs = !music && (prog.clients == null || prog.clients > 0);', replace: 'const needs = !music;' },

    // ── Coverage
    { name: 'with usage unread, coverage counts no programs', file: PAGE,
      find: 'const inUse = list.filter((p) => (usageRead ? p.clients > 0 : true));', replace: 'const inUse = list.filter((p) => p.clients > 0);' },
    { name: 'a day set in some weeks reads as every week', file: PAGE,
      find: 'return hits.reduce((s, x) => s + x.weeksWith, 0) >= day.weeks ? true : "some";', replace: 'return true;' },
    { name: 'a day matches a playlist by name even with an id', file: PAGE,
      find: '  if (entry.id) return entry.id === p.id;\n', replace: '' },
    { name: 'a name two playlists share is claimed by both', file: PAGE,
      find: 'return entry.name === p.name && !(dupNames && dupNames.has(p.name));', replace: 'return entry.name === p.name;' },
    { name: 'a day is written without the playlist id', file: PAGE,
      find: 'const next = playlist ? { ...(playlist.id ? { id: playlist.id } : {}), name: playlist.name, meta: playlist.meta || "" } : null;', replace: 'const next = playlist ? { name: playlist.name, meta: playlist.meta || "" } : null;' },
    { name: 'a delete leaves the program days', file: PAGE,
      find: '    for (const x of who.programs) {\n', replace: '    for (const x of []) {\n' },
    { name: 'a delete with the programs unread goes ahead', file: PAGE,
      find: 'if (role === "trainer" && !demo && programsState !== "ready") return', replace: 'if (false) return' },
    { name: 'a picked playlist loses its track count', file: PAGE,
      find: '...(tracks != null ? { tracks } : {})', replace: '' },
    { name: 'the nutritionist brief counts nobody reached', file: PAGE,
      find: 'const reached = c.roster.clients.filter((cl) => c.playlists.some((p) => plIsSentTo(p, cl.id))).length;', replace: 'const reached = 0;' },

    // ── Program-day writes
    { name: 'a day is written in the first week only', file: PAGE,
      find: 'const weeks = builder.weeks.map((week) => {\n    const days = week && Array.isArray(week.days) ? week.days : [];\n    const slots', replace: 'const weeks = builder.weeks.map((week, wi) => {\n    if (wi > 0) return week;\n    const days = week && Array.isArray(week.days) ? week.days : [];\n    const slots' },
    { name: 'the program write drops the revision it read', file: PAGE,
      find: 'expectedRevision: program.revision', replace: 'expectedRevision: undefined' },
    { name: 'a 409 is not named', file: PAGE,
      find: 'const msg = res.status === 409 ?', replace: 'const msg = false ?' },
    { name: 'a program\'s days lock one by one', file: PAGE,
      find: '["prog:" + prog.id]', replace: '["prog:" + prog.id + ":" + d.index]' },

    // ── Sends
    { name: 'a failed send stays painted', file: PAGE,
      find: 'if (r.error) { replaceRow(was); setNote(r.error); }', replace: 'if (r.error) { setNote(r.error); }' },
    { name: 'a client entry drops its client: id', file: PAGE,
      find: 'const plClientEntry = (c) => ({ id: "client:" + c.id,', replace: 'const plClientEntry = (c) => ({ id: c.id,' },
    { name: 'a save re-stamps the row\'s role', file: PAGE,
      find: 'body: JSON.stringify({ id: p.id, ...patch })', replace: 'body: JSON.stringify({ id: p.id, ...patch, role })' },
    { name: 'the other role\'s playlists are listed', file: PAGE,
      find: 'd.soundtracks.filter((r) => r && (r.role == null || r.role === role))', replace: 'd.soundtracks.filter((r) => r)' },
    { name: 'a day is matched by its position', file: PAGE,
      find: 'const base = wd != null ? "wd:" + wd : "name:" + String((day && day.name) || "Day " + (di + 1)).trim().toLowerCase();', replace: 'const base = "i:" + di;' },
    { name: 'usage asks for today on the device clock', file: PAGE,
      find: 'if (Z && typeof Z.dayKey === "function") today = Z.dayKey(Date.now()) || "";', replace: '' },
    { name: 'a signed-in coach\'s sample roster is listed', file: PAGE,
      find: 'if (dash.source === "live" || (demo && dash.source === "demo"))', replace: 'if (dash.source === "live" || dash.source === "demo")' },

    // ── The track list and Delete
    { name: 'the builder repeats the sample tracks to the count', file: PAGE,
      find: 'const tracks = trackTotal > 0 ? sample.slice(0, trackTotal) : sample;',
      replace: 'const tracks = trackTotal > 0 && sample.length ? Array.from({ length: trackTotal }, (_, i) => sample[i % sample.length]) : sample;' },
    { name: 'a cancelled confirm still deletes', file: PAGE,
      find: 'if (!ok) return { cancelled: true };', replace: '' },
    { name: 'no ShapeConfirm deletes without asking', file: PAGE,
      find: '      : false;\n    if (!ok)', replace: '      : true;\n    if (!ok)' },
  ],
};
