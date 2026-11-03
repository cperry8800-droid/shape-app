// Mutation spec for Shape Radio on Shape's own station, part 2: pointing the station at Shape's own
// stream (only https on its own name and /live, only once it answers with audio), now-playing from
// the rotation (only what listeners hear, only a song the engine reported, only while it is on the
// air for that block, the newest block), the route's order, the dashboard's order of checks, and
// the stream's cross-origin header on every mount. Every one must be killed.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/radio-own-station-2026-11-03.mutations.mjs --fail-on-skipped
const ST = 'src/lib/radio/station.mjs';
const AIR = 'src/lib/radio/noraOnAir.mjs';
const SEL = 'src/lib/radio/index.ts';
const ROUTE = 'src/app/api/radio/now-playing/route.ts';
const ACT = 'src/app/dashboard/radio/actions.ts';
const XML = 'services/station/icecast/icecast.xml.template';

export default {
  test: 'node --test tests/radio-own-station.test.mjs tests/radio-station-config.test.mjs tests/radio-instrument-rules.test.mjs tests/nora-on-air.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── Shape's own stream ──
    { name: '⚠ an http stream is taken', file: ST,
      find: "  if (u.protocol !== 'https:') return { ok: false, error: 'stream_https' };\n  if (u.username || u.password || u.search", replace: '  if (u.username || u.password || u.search' },
    { name: 'credentials, a query or a port are taken', file: ST,
      find: "  if (u.username || u.password || u.search || u.hash || u.port) return { ok: false, error: 'stream_url' };\n  if (u.pathname !== OWN_MOUNT)", replace: '  if (u.pathname !== OWN_MOUNT)' },
    { name: 'any path is taken', file: ST,
      find: "  if (u.pathname !== OWN_MOUNT) return { ok: false, error: 'stream_not_live' };\n", replace: '' },
    { name: 'a radio.co address is taken as Shape\'s own', file: ST,
      find: "  if (/(^|\\.)radio\\.co$/.test(host)) return { ok: false, error: 'stream_is_radio_co' };\n", replace: '' },
    { name: '⚠ an address or a local name is taken', file: ST,
      find: "  if (!/^[a-z0-9-]+(\\.[a-z0-9-]+)*\\.[a-z]{2,}$/.test(host) || /(^|\\.)(localhost|local|internal)$/.test(host)) {", replace: '  if (false) {' },
    { name: '⚠ a stream that answers with anything is taken', file: ST,
      find: "  return type.startsWith('audio/mpeg') ? { ok: true } : { ok: false, error: 'station_not_audio' };", replace: '  return { ok: true };' },
    { name: 'a refused stream is taken for audio', file: ST,
      find: "  if (!res.ok) return { ok: false, error: 'station_unreachable' };\n  const type", replace: '  const type' },
    { name: 'the probe reads the whole stream', file: ST,
      find: '  try { await res.body?.cancel(); } catch { /* the headers are all that was wanted */ }\n', replace: '' },
    { name: 'the probe follows a redirect elsewhere', file: ST,
      find: "method: 'GET', redirect: 'error',", replace: "method: 'GET', redirect: 'follow'," },
    { name: '⚠ Shape\'s own station reads as the mock', file: SEL,
      find: "  if (config.provider === 'shape') return shapeProvider;\n", replace: '' },
    // ── now-playing from the rotation ──
    { name: '⚠ a song the engine never reported is named', file: AIR,
      find: '    if (!reported) continue;\n', replace: '' },
    { name: '⚠ a block whose engine ended or stopped is named', file: AIR,
      find: "      if (!(Number.isFinite(stoppedAt) && now - HEARD_LAG_SEC * 1000 < stoppedAt)) continue;", replace: '      void stoppedAt;' },
    { name: 'a block\'s end blanks the title before listeners hear it end (Codex, #2574)', file: AIR,
      find: "      if (!(Number.isFinite(stoppedAt) && now - HEARD_LAG_SEC * 1000 < stoppedAt)) continue;", replace: '      continue;' },
    { name: 'a song deleted while it plays loses its title (Codex, #2574)', file: AIR,
      find: "      || (r.track_id == null && r.title === item.title && r.artist === item.artist)));", replace: '));' },
    { name: 'another song\'s copied names stand in for a deleted one', file: AIR,
      find: "      || (r.track_id == null && r.title === item.title && r.artist === item.artist)));", replace: '      || (r.track_id == null && r.title === item.title)));' },
    { name: '⚠ a song is named before listeners hear it', file: AIR,
      find: '    const heard = heardNow(block.programme, Date.parse(block.starts_at), now);', replace: '    const heard = heardNow(block.programme, Date.parse(block.starts_at), now, { lagSec: 0 });' },
    { name: 'another block\'s reports count for this one', file: AIR,
      find: ".select('event,track_id,title,artist,played_at')\n      .eq('block_id', block.id).order(", replace: ".select('event,track_id,title,artist,played_at')\n      .order(" },
    { name: 'the oldest block on the air wins', file: AIR,
      find: ".gt('starts_at', new Date(now - ROTATION_LOOKBACK_MS).toISOString())\n    .order('starts_at', { ascending: false })", replace: ".gt('starts_at', new Date(now - ROTATION_LOOKBACK_MS).toISOString())\n    .order('starts_at', { ascending: true })" },
    { name: 'the rotation\'s album is dropped', file: AIR,
      find: '      album: heard.item.album || null,\n      isNora: false,', replace: '      album: null,\n      isNora: false,' },
    { name: 'a block not yet started is read', file: AIR,
      find: ".select('id,starts_at,programme')\n    .lte('starts_at', new Date(now).toISOString())", replace: ".select('id,starts_at,programme')\n    .lte('starts_at', new Date(now + 3600000).toISOString())" },
    // ── the dashboard's word on the engine ──
    { name: '⚠ a healthy engine in a long song is called quiet (Codex, #2574)', file: ST,
      find: 'export const ENGINE_QUIET_MS = (MAX_TRACK_SEC + 120) * 1000;', replace: 'export const ENGINE_QUIET_MS = 15 * 60000;' },
    { name: 'an engine that never reported is not called quiet', file: ST,
      find: '  return !Number.isFinite(at) || now - at > ENGINE_QUIET_MS;', replace: '  return now - at > ENGINE_QUIET_MS;' },
    { name: 'the panel keeps its own threshold', file: 'src/app/dashboard/radio/StationPanel.tsx',
      find: '  const quiet = own && engineQuiet(lastAt, now);', replace: '  const quiet = own && (!lastAt || now - Date.parse(lastAt) > 15 * 60000);' },
    // ── the route ──
    { name: '⚠ the rotation is named on any station', file: ROUTE,
      find: '  if (cfg.provider === OWN_PROVIDER) {', replace: '  if (true) {' },
    { name: 'the rotation\'s payload is not marked measured', file: ROUTE,
      find: '      if (rotation) return NextResponse.json({ ...rotation, simulated: false },', replace: '      if (rotation) return NextResponse.json(rotation,' },
    // ── the dashboard ──
    { name: '⚠ Shape\'s own station is saved without hearing it answer', file: ACT,
      find: '  const probed = await probeStream(checked.value.stream_url);\n  if (!probed.ok) failed(probed.error);\n', replace: '' },
    { name: 'a non-admin can point the station', file: ACT,
      find: "export async function connectOwnStation(formData: FormData): Promise<void> {\n  await requireAdminUser();\n", replace: 'export async function connectOwnStation(formData: FormData): Promise<void> {\n' },
    // ── the stream's cross-origin header ──
    { name: '⚠ the listeners\' mount has no cross-origin header (the players refuse the stream)', file: XML,
      find: '        <stream-url>https://www.theshapecommunity.com/radio</stream-url>\n        <http-headers>\n            <header name="Access-Control-Allow-Origin" value="*" />\n        </http-headers>\n',
      replace: '        <stream-url>https://www.theshapecommunity.com/radio</stream-url>\n' },
    { name: '⚠ the standby loop has no cross-origin header', file: XML,
      find: '        <stream-name>Shape Radio</stream-name>\n        <http-headers>\n            <header name="Access-Control-Allow-Origin" value="*" />\n        </http-headers>\n    </mount>\n\n    <fileserve>',
      replace: '        <stream-name>Shape Radio</stream-name>\n    </mount>\n\n    <fileserve>' },
    { name: 'a top-level header block that could double it', file: XML,
      find: '    <fileserve>1</fileserve>', replace: '    <http-headers>\n        <header name="Access-Control-Allow-Origin" value="*" />\n    </http-headers>\n    <fileserve>1</fileserve>' },
  ],
};
