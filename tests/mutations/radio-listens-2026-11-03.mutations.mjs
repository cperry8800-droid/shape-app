// Mutation spec for Shape Radio on Shape's own station, part 4: a performance count for every play.
// The station's sign-in and its start on every call, each session kept as a listener joins and
// leaves (a lost join kept whole, a lost end closed at the next start), each song's audible span,
// the count of sessions that heard any part of it, every play of the month a page at a time, the
// month's listening hours, the station's config, and the dashboard. Every one must be killed.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/radio-listens-2026-11-03.mutations.mjs --fail-on-skipped
const L = 'src/lib/radio/listens.mjs';
const PASS = 'src/lib/radio/pass.mjs';
const DOOR = 'src/app/api/radio/pass/route.ts';
const API = 'src/lib/radio/noraEngineApi.mjs';
const XML = 'services/station/icecast/icecast.xml.template';
const ENTRY = 'services/station/icecast/entrypoint.sh';
const PANEL = 'src/app/dashboard/radio/StationPanel.tsx';

export default {
  test: 'node --test tests/radio-listens.test.mjs tests/radio-pass.test.mjs tests/radio-station-config.test.mjs tests/radio-rotation.test.mjs tests/nora-engine.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── only the station ──
    { name: '⚠ any token signs in as the station (no real token set)', file: L,
      find: '  if (token.length < 32) return false;\n', replace: '' },
    { name: '⚠ any sign-in of the right length is the station', file: L,
      find: '  return got.length === want.length && timingSafeEqual(got, want);', replace: '  return got.length === want.length;' },
    { name: 'any name signs in as the station', file: L,
      find: '  return got.length === want.length && timingSafeEqual(got, want);',
      replace: "  return Buffer.from(String(authorization || '').replace(/^Basic /, ''), 'base64').toString().split(':').slice(1).join(':') === token;" },
    { name: 'a start named any way is taken', file: L,
      find: "const m = /^(\\d{9,11})\\.[0-9a-f]{16}$/.exec(String(value || ''));", replace: "const m = /^(\\d{9,11})\\.[0-9a-fA-F]{4,16}$/.exec(String(value || ''));" },
    // ── each session ──
    { name: '⚠ a second word on a join restarts the session', file: L,
      find: "      { boot, boot_at: bootAt, client, started_at: at },\n      { onConflict: 'boot,client', ignoreDuplicates: true },", replace: "      { boot, boot_at: bootAt, client, started_at: at },\n      { onConflict: 'boot,client', ignoreDuplicates: false }," },
    // Two guards keep a session's end where the first word put it: the early return (which saves a
    // write) and the update's own `.is('ended_at', null)`. Either alone is enough, so removing one
    // is a no-op (measured: it survived); the mutation removes both.
    { name: '⚠ a second word on leaving moves the end', file: L,
      find: "    if (open.ended_at) return { ok: true };\n    // Never before it began (two servers' clocks a moment apart).\n    const ended = new Date(Math.max(now, Date.parse(open.started_at))).toISOString();\n    const { error } = await db.from(T).update({ ended_at: ended, duration_sec: durationSec })\n      .eq('id', open.id).is('ended_at', null);",
      replace: "    // Never before it began (two servers' clocks a moment apart).\n    const ended = new Date(Math.max(now, Date.parse(open.started_at))).toISOString();\n    const { error } = await db.from(T).update({ ended_at: ended, duration_sec: durationSec })\n      .eq('id', open.id);" },
    { name: 'an end before the session began (clocks)', file: L,
      find: '    const ended = new Date(Math.max(now, Date.parse(open.started_at))).toISOString();', replace: '    const ended = new Date(now).toISOString();' },
    { name: '⚠ a lost join loses the session', file: L,
      find: "    { boot, boot_at: bootAt, client, started_at: new Date(now - durationSec * 1000).toISOString(), ended_at: at, duration_sec: durationSec },", replace: "    { boot, boot_at: bootAt, client, started_at: at, ended_at: at, duration_sec: durationSec }," },
    { name: 'a fault on leaving reads as kept', file: L,
      find: "  if (readErr) return { ok: false, error: 'read_failed' };\n", replace: '' },
    // ── each song's span ──
    { name: '⚠ the blend into the next song is not heard', file: L,
      find: "      const tail = r.event === 'song' ? BLEND_TAIL_SEC * 1000 : 0;", replace: '      const tail = 0;' },
    { name: 'a stopped song blends into nothing', file: L,
      find: "      const tail = r.event === 'song' ? BLEND_TAIL_SEC * 1000 : 0;", replace: '      const tail = BLEND_TAIL_SEC * 1000;' },
    { name: '⚠ the listener\'s lag is not heard', file: L,
      find: '      out.set(prev.row, { start: prev.at, end: Math.max(prev.at, at + tail + lagMs) });', replace: '      out.set(prev.row, { start: prev.at, end: Math.max(prev.at, at + tail) });' },
    { name: 'a song with no next word ends at once', file: L,
      find: '  for (const { row, at } of last.values()) out.set(row, { start: at, end: at + (MAX_TRACK_SEC + HEARD_LAG_SEC) * 1000 });', replace: '  for (const { row, at } of last.values()) out.set(row, { start: at, end: at });' },
    { name: 'the planner\'s longest blend is cut short', file: L,
      find: 'export const BLEND_TAIL_SEC = Math.ceil(((BLEND_BARS + 1) * 4 * (60 / MIN_GRID_BPM)) / (1 - BEATMATCH_MAX));', replace: 'export const BLEND_TAIL_SEC = 10;' },
    // ── each session's span ──
    { name: '⚠ a session left open by an earlier start runs on until now', file: L,
      find: '    let end = r.ended_at ? Date.parse(r.ended_at) : Math.min(nextBoot.get(r.boot) ?? now, now);', replace: '    let end = r.ended_at ? Date.parse(r.ended_at) : now;' },
    { name: 'a session shorter than nothing', file: L,
      find: '    spans.push({ start, end: Math.max(start, end), open: !r.ended_at });', replace: '    spans.push({ start, end, open: !r.ended_at });' },
    // ── the count ──
    { name: '⚠ a session that ended as the song began heard it', file: L,
      find: '  return windows.map((w) => countBelow(starts, w.end) - countAtMost(ends, w.start));', replace: '  return windows.map((w) => countBelow(starts, w.end) - countBelow(ends, w.start));' },
    { name: '⚠ a session that began as the song ended heard it', file: L,
      find: '  return windows.map((w) => countBelow(starts, w.end) - countAtMost(ends, w.start));', replace: '  return windows.map((w) => countAtMost(starts, w.end) - countAtMost(ends, w.start));' },
    { name: 'the hours outside the range are counted', file: L,
      find: '  for (const s of spans) ms += Math.max(0, Math.min(s.end, toMs) - Math.max(s.start, fromMs));', replace: '  for (const s of spans) ms += Math.max(0, s.end - s.start);' },
    // ── the month ──
    { name: '⚠ only the first 1,000 rows are read', file: L,
      find: '    if (!data || data.length < PAGE) return { rows };', replace: '    return { rows };' },
    { name: '⚠ the month\'s last song loses its blend into the next month', file: L,
      find: ".gte('played_at', fromIso).lt('played_at', readTo).order(", replace: ".gte('played_at', fromIso).lt('played_at', toIso).order(" },
    { name: '⚠ who heard the month\'s last song after midnight is not read', file: L,
      find: ".lt('started_at', readTo).or(", replace: ".lt('started_at', toIso).or(" },
    { name: '⚠ a fault reading the sessions is a month of no listeners', file: L,
      find: "    if (!missingTable(listens.error)) return { ok: false, error: 'read_failed' };\n", replace: '' },
    { name: '⚠ radio.co\'s plays are counted as nobody listening', file: L,
      find: '    return measured && (!!r.block_id || (firstBoot != null && at >= firstBoot));', replace: '    return measured;' },
    { name: 'a rotation block before its first listener is not measured', file: L,
      find: '    return measured && (!!r.block_id || (firstBoot != null && at >= firstBoot));', replace: '    return measured && firstBoot != null && at >= firstBoot;' },
    { name: 'an open session is not counted open', file: L,
      find: '      openSessions: measured ? inRange.filter((s) => s.open).length : null,', replace: '      openSessions: measured ? 0 : null,' },
    // ── the dashboard ──
    { name: 'listening now reads the first start of the station', file: L,
      find: "select('boot').order('boot_at', { ascending: false }).limit(1);", replace: "select('boot').order('boot_at', { ascending: true }).limit(1);" },
    { name: 'every open session reads as open too long', file: L,
      find: "open().lt('started_at', new Date(now - LONG_OPEN_MS).toISOString())", replace: 'open()' },
    { name: 'the panel never says who is listening', file: PANEL,
      find: '  try { listening = own ? await listeningNow(db, { now }) : null; } catch { listening = null; }', replace: '  listening = null;' },
    // ── the door ──
    { name: '⚠ anyone may tell Shape a listener joined or left', file: DOOR,
      find: "  if (!stationCaller(request.headers.get('authorization')) || !boot) {", replace: '  if (!boot) {' },
    { name: 'a call naming no start of the station is taken', file: DOOR,
      find: "  if (!stationCaller(request.headers.get('authorization')) || !boot) {", replace: "  if (!stationCaller(request.headers.get('authorization'))) {" },
    { name: '⚠ a forged ticket leaves a session', file: PASS,
      find: '  const signed = signedTicket(u.searchParams.get(TICKET_PARAM), key);\n  if (!signed.ok) return signed;\n  const client', replace: '  const client' },
    { name: 'a leave from another mount is kept', file: PASS,
      find: "  if (form.get('action') !== 'listener_remove') return { ok: false, reason: 'action' };\n  let u;\n  try { u = new URL(String(form.get('mount') || ''), 'http://station'); } catch { return { ok: false, reason: 'mount' }; }\n  if (u.pathname !== STATION_MOUNT) return { ok: false, reason: 'mount' };\n  const signed",
      replace: "  if (form.get('action') !== 'listener_remove') return { ok: false, reason: 'action' };\n  let u;\n  try { u = new URL(String(form.get('mount') || ''), 'http://station'); } catch { return { ok: false, reason: 'mount' }; }\n  const signed" },
    { name: 'a join with no connection number is let in unkept', file: PASS,
      find: "  if (!/^\\d{1,15}$/.test(client)) return { ok: false, reason: 'numbers' };\n  return { ...verdict, client: Number(client) };", replace: '  return { ...verdict, client: Number(client) };' },
    // ── the report ──
    { name: '⚠ the report has no performances', file: API,
      find: '    lines.push([r.played_at, r.artist, r.title, r.isrc, r.album, r.label, r.performances, r.set_id, r.block_id].map(csvCell).join(\',\'));', replace: '    lines.push([r.played_at, r.artist, r.title, r.isrc, r.album, r.label, null, r.set_id, r.block_id].map(csvCell).join(\',\'));' },
    { name: 'the totals have no listening hours', file: API,
      find: 't.tuningHours == null ? null : t.tuningHours.toFixed(2)', replace: 'null' },
    // ── the station server ──
    { name: '⚠ the station never says a listener left', file: XML,
      find: '            <option name="listener_remove" value="${LISTENER_AUTH_URL}" />\n', replace: '' },
    { name: '⚠ the station never signs in', file: XML,
      find: '            <option name="username" value="station" />\n            <option name="password" value="${STATION_TOKEN}" />\n', replace: '' },
    { name: '⚠ the station never names its start', file: ENTRY,
      find: 'LISTENER_AUTH_URL="$SHAPE_URL/api/radio/pass?boot=$BOOT"', replace: 'LISTENER_AUTH_URL="$SHAPE_URL/api/radio/pass"' },
    { name: 'the station starts with no token, or one that breaks its config', file: ENTRY,
      find: "printf '%s' \"${NORA_ENGINE_TOKEN:-}\" | grep -Eq '^[A-Za-z0-9._~-]{32,}$' \\\n  || fail 'NORA_ENGINE_TOKEN must be the engine token (32 or more characters), the same as in Vercel'\n", replace: '' },
    { name: 'every start of the station has the same name', file: ENTRY,
      find: "BOOT=\"$(date -u +%s).$(od -An -N8 -tx1 /dev/urandom | tr -d ' \\n')\"", replace: 'BOOT="1793318400.0123456789abcdef"' },
  ],
};
