// Mutation spec for Shape Radio while Nora is the DJ: what listeners are told is playing (only what
// has been heard, with its album, only while her engine is on the air), and both surfaces treating
// her own set as hers. Every one must be killed. (radio.co's payload and its connection were taken
// out with radio.co, 2026-11-04; Shape's own station's are in radio-own-station-2026-11-03.)
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/nora-on-air-2026-10-11.mutations.mjs --fail-on-skipped
const AIR = 'src/lib/radio/noraOnAir.mjs';
const ROUTE = 'src/app/api/radio/now-playing/route.ts';
const WEB = 'public/newdesign/radio.jsx';
const APP = 'mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx';
const INSTR = 'public/newdesign/radioInstrument.jsx';

export default {
  test: 'node --test tests/nora-on-air.test.mjs',
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
