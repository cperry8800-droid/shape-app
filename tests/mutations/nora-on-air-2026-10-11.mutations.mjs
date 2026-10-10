// Mutation spec for Shape Radio on radio.co while Nora is the DJ: what listeners are told is
// playing (only what has been heard, with its album, only while her engine is on the air), the
// station's own payload (radio.co's "Artist - Title", never Nora by name), connecting the
// station, and both surfaces treating her own set as hers. Every one must be killed.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/nora-on-air-2026-10-11.mutations.mjs --fail-on-skipped
const AIR = 'src/lib/radio/noraOnAir.mjs';
const NP = 'src/lib/radio/now-playing.mjs';
const ROUTE = 'src/app/api/radio/now-playing/route.ts';
const STATION = 'src/lib/radio/station.mjs';
const WEB = 'public/newdesign/radio.jsx';
const APP = 'mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx';
const INSTR = 'public/newdesign/radioInstrument.jsx';

export default {
  test: 'node --test tests/nora-on-air.test.mjs tests/radio-now-playing.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── only what has been heard ──
    { name: '⚠ no lag: a song is named before listeners hear it', file: AIR,
      find: 'export const HEARD_LAG_SEC = 6;', replace: 'export const HEARD_LAG_SEC = 0;' },
    { name: '⚠ the incoming song is named as the blend begins', file: AIR,
      find: '    index = t >= half ? sounding[sounding.length - 1] : sounding[0];', replace: '    index = sounding[sounding.length - 1];' },
    { name: 'a blend is not reported as one', file: AIR,
      find: '    mixing: sounding.length > 1,', replace: '    mixing: false,' },
    { name: 'the tempo heard ignores the rate', file: AIR,
      find: 'Math.round(bpm * (Number(item.rate) || 1) * 100) / 100', replace: 'Math.round(bpm * 100) / 100' },
    { name: '⚠ a set whose engine stopped is still called hers', file: AIR,
      find: "    if (!last || !['started', 'song'].includes(last.event)) continue;", replace: "    if (!last) continue;" },
    { name: 'an unpublished set is called hers', file: AIR,
      find: "    .eq('host_kind', 'nora').eq('published', true)\n    .lte(", replace: "    .eq('host_kind', 'nora')\n    .lte(" },
    { name: 'the album is dropped', file: AIR,
      find: '      album: heard.item.album || null,', replace: '      album: null,' },
    { name: 'the route asks the station first', file: ROUTE,
      find: '    const nora = await noraOnAir(createAdminClient(), { now: Date.now() });\n    if (nora)', replace: '    const nora = null as unknown as Record<string, unknown> | null;\n    if (nora)' },
    // ── the station's own payload ──
    { name: '⚠ an artist called Nora… is Nora', file: NP,
      find: '  return album ? { title, artist, album, isNora: false } : { title, artist, isNora: false };', replace: "  const isNora = !!artist && artist.toLowerCase().includes('nora');\n  return album ? { title, artist, album, isNora } : { title, artist, isNora };" },
    { name: "radio.co's one-field title is not split", file: NP,
      find: '  if (!artist && title) {', replace: '  if (false) {' },
    { name: 'the split takes the last " - "', file: NP,
      find: "    const cut = title.indexOf(' - ');", replace: "    const cut = title.lastIndexOf(' - ');" },
    { name: 'the album is not read', file: NP,
      find: "  return album ? { title, artist, album, isNora: false } : { title, artist, isNora: false };", replace: "  return { title, artist, isNora: false };" },
    // ── connecting the station ──
    { name: 'an http stream is taken', file: STATION,
      find: "  if (u.protocol !== 'https:') return { ok: false, error: 'stream_https' };\n", replace: '' },
    { name: 'any host is taken', file: STATION,
      find: "  if (!/(^|\\.)radio\\.co$/i.test(u.hostname)) return { ok: false, error: 'stream_not_radio_co' };\n", replace: '' },
    { name: 'a host merely containing radio.co is taken', file: STATION,
      find: '  if (!/(^|\\.)radio\\.co$/i.test(u.hostname))', replace: '  if (!/radio\\.co/i.test(u.hostname))' },
    { name: 'a stream URL with credentials is taken', file: STATION,
      find: "  if (u.username || u.password) return { ok: false, error: 'stream_url' };\n", replace: '' },
    // ── both surfaces ──
    { name: '⚠ the website reads her set as a guest set', file: WEB,
      find: '  const guestDj = stationConfigured && liveSet && liveSet.dj && !noraSet ? String(liveSet.dj) : null;', replace: '  const guestDj = stationConfigured && liveSet && liveSet.dj ? String(liveSet.dj) : null;' },
    { name: "the website says Nora's mix on the schedule's word", file: WEB,
      find: 'guest: guestDj, cueSheet: !!noraNow } }) : { key: "offAir" };', replace: 'guest: guestDj, cueSheet: noraSet } }) : { key: "offAir" };' },
    { name: '⚠ the app reads her set as a guest set', file: APP,
      find: "  const guestDj = stationConfigured && r.sets && r.sets.live && r.sets.live.dj && !noraSet ? String(r.sets.live.dj) : null;", replace: "  const guestDj = stationConfigured && r.sets && r.sets.live && r.sets.live.dj ? String(r.sets.live.dj) : null;" },
    { name: 'the app drops the album', file: APP,
      find: "    byline: has(np && np.artist) ? (has(np && np.album) ? `${np.artist} · ${np.album}` : np.artist) : '—',", replace: "    byline: has(np && np.artist) ? np.artist : '—'," },
    { name: 'the website drops the album', file: INSTR,
      find: '{artist ? (album ? `${artist} · ${album}` : artist) : (st.playing', replace: '{artist ? artist : (st.playing' },
  ],
};
