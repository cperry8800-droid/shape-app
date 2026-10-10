// Mutation spec for Nora's sets: the licence's limits, the mixing rules, the energy arc, the
// slots and the schedule they make, the database side, and who can read or change any of it.
// Every one must be killed.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/nora-dj-sets-2026-10-11.mutations.mjs --fail-on-skipped
const PLAN = 'src/lib/radio/noraPlanner.mjs';
const SLOTS = 'src/lib/radio/noraSlots.mjs';
const STORE = 'src/lib/radio/noraSetStore.mjs';
const SQL = 'supabase-migrations/2026-10-11-nora-dj-sets.sql';
const CRON = 'src/app/api/cron/nora-sets/route.ts';
const ACT = 'src/app/dashboard/radio/actions.ts';

export default {
  test: 'node --test tests/nora-dj-sets.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── the licence's limits ──
    { name: 'five songs by one artist in 3 hours', file: PLAN,
      find: "export const COMPLEMENT = Object.freeze({ windowSec: 3 * 3600, artistMax: 4,", replace: "export const COMPLEMENT = Object.freeze({ windowSec: 3 * 3600, artistMax: 5," },
    { name: 'four in a row by one artist', file: PLAN,
      find: 'artistRun: 3,', replace: 'artistRun: 4,' },
    { name: 'three in a row from one album', file: PLAN,
      find: 'albumRun: 2 });', replace: 'albumRun: 3 });' },
    { name: 'the window is one hour', file: PLAN,
      find: 'windowSec: 3 * 3600,', replace: 'windowSec: 3600,' },
    { name: 'a featured artist does not count', file: PLAN,
      find: "    .split(/\\s*(?:,|&|\\+|\\/|;|\\bfeat\\.?|\\bft\\.?|\\bfeaturing\\b|\\bwith\\b|\\bx\\b|\\band\\b|\\bvs\\.?)\\s*/)", replace: '    .split(/\\s*,\\s*/)' },
    { name: 'a song repeats within 3 hours', file: PLAN,
      find: "    if (p.trackId && plays.slice(0, i).some((q) => q.trackId === p.trackId && q.at > p.at - REPEAT_SEC)) {", replace: '    if (false) {' },
    { name: 'the history is ignored', file: PLAN,
      find: '  const plays = past.filter((h) => h.at > -COMPLEMENT.windowSec);', replace: '  const plays = [];' },
    { name: 'a candidate that breaks a rule is played', file: PLAN,
      find: '      if (complementViolations([...plays, play], { fromIndex: plays.length }).length) continue;\n', replace: '' },
    // ── how she mixes ──
    { name: 'beat-matching reaches ±8 %', file: PLAN,
      find: 'export const BEATMATCH_MAX = 0.04;', replace: 'export const BEATMATCH_MAX = 0.08;' },
    { name: 'the incoming rate is inverted', file: PLAN,
      find: '  const r = playedBpm / bpm;', replace: '  const r = bpm / playedBpm;' },
    { name: 'the beat-matched song enters on its first beat, not its kick', file: PLAN,
      find: 'nextCueIn: Math.max(0, barAt(ng, ng.mixInFromBar)), nextRate: rate,', replace: 'nextCueIn: Math.max(0, ng.downbeatSec), nextRate: rate,' },
    { name: 'the outgoing rate is ignored on the set clock', file: PLAN,
      find: '  const toSet = (fileSec) => prevStart + (fileSec - prevCueIn) / prevRate;', replace: '  const toSet = (fileSec) => prevStart + (fileSec - prevCueIn);' },
    { name: 'clashing keys get a long blend', file: PLAN,
      find: '  const overlap = clash ? 3 : clamp(tail, 4, 10);', replace: '  const overlap = clamp(tail, 4, 10);' },
    { name: 'relative major/minor scores as a clash', file: PLAN,
      find: "  if (step === 0) return x.l === y.l ? 1 : 0.9;", replace: "  if (step === 0) return x.l === y.l ? 1 : 0.1;" },
    { name: 'the wheel does not wrap', file: PLAN,
      find: '  const step = Math.min((x.n - y.n + 12) % 12, (y.n - x.n + 12) % 12);', replace: '  const step = Math.abs(x.n - y.n);' },
    // ── the set ──
    { name: 'the arc never eases off', file: PLAN,
      find: '  return 0.9 - ((t - 0.9) / 0.1) * 0.25;                    // ease off: 0.9 → 0.65', replace: '  return 0.9;' },
    { name: 'the jitter is not seeded by the set', file: PLAN,
      find: '  const rand = mulberry32(hashSeed(seed ?? set.id ?? set.startsAt));', replace: "  const rand = mulberry32(hashSeed('fixed'));" },
    { name: 'a song plays twice in one set', file: PLAN,
      find: '      if (used.has(t.id)) continue;\n', replace: '' },
    { name: 'a short set does not say so', file: PLAN,
      find: "      if (cursor < durationSec - END_SLACK_SEC) short = items.length ? 'rules-or-library' : 'empty-library';", replace: '' },
    { name: 'a last song runs on past the end', file: PLAN,
      find: '  if (last && last.endSec > durationSec + OVERRUN_SEC) {', replace: '  if (false) {' },
    { name: 'songs are not levelled', file: PLAN,
      find: "    it.gainDb = Number.isFinite(l) ? round(clamp(ref - l, -9, 6), 2) : 0;", replace: '    it.gainDb = 0;' },
    { name: 'checkProgramme passes any rate', file: PLAN,
      find: "    if (!(it.rate >= 1 - BEATMATCH_MAX - 1e-6 && it.rate <= 1 + BEATMATCH_MAX + 1e-6)) problems.push({ rule: 'rate', index: i });\n", replace: '' },
    { name: 'checkProgramme passes a gap of silence', file: PLAN,
      find: "    if (i && !(it.startSec <= items[i - 1].endSec + 0.01)) problems.push({ rule: 'gap', index: i });\n", replace: '' },
    // ── slots and the schedule ──
    { name: 'a slot under 30 minutes', file: SLOTS,
      find: 'export const MIN_SET_MIN = 30;', replace: 'export const MIN_SET_MIN = 10;' },
    { name: 'a slot in an unknown zone', file: SLOTS,
      find: "  if (!isZone(zone)) return { ok: false, error: 'zone' };\n", replace: '' },
    { name: 'a slot time is a fixed UTC offset', file: SLOTS,
      find: '      const t = wallInstant(y, mo, d, slot.start_minute, slot.zone);', replace: '      const t = Date.UTC(y, mo - 1, d, 0, slot.start_minute) + 4 * 3600000;' },
    { name: 'a slot runs every day', file: SLOTS,
      find: '    if (slot.days.includes(weekday)) {', replace: '    if (true) {' },
    { name: '⚠ an unlicensed set is public', file: SLOTS,
      find: "      host_kind: 'nora', slot_id: o.slotId, published: !!licensed,", replace: "      host_kind: 'nora', slot_id: o.slotId, published: true," },
    { name: '⚠ a planned set is removed', file: SLOTS,
      find: '  const remove = nora.filter((r) => !r.planned && !(r.slot_id', replace: '  const remove = nora.filter((r) => !(r.slot_id' },
    { name: 'withdrawn licences leave sets public', file: SLOTS,
      find: '  const unpublish = nora.filter((r) => !removed.has(r.id) && !licensed && r.published).map((r) => r.id);', replace: '  const unpublish = [];' },
    { name: 'a set goes over a guest set', file: SLOTS,
      find: '    if (hit) { clashes.push({ ...o, with: hit.id ?? hit.slotId }); continue; }\n', replace: '' },
    // ── the database side ──
    { name: '⚠ a failed read reads as no planned sets', file: STORE,
      find: "    if (p.error) return { ok: false, error: 'read_failed' };\n    planned = new Set", replace: '    planned = new Set' },
    { name: 'the earlier sets are not history', file: STORE,
      find: '  const history = [...hist.history, ...(Array.isArray(externalHistory) ? externalHistory : [])];', replace: '  const history = [];' },
    { name: 'a second plan replaces the first', file: STORE,
      find: "  if (got.data) return { programme: got.data.programme, stored: true };\n", replace: '' },
    { name: 'a guest set is planned', file: STORE,
      find: "  if (!set || set.host_kind !== 'nora') return { error: 'not_a_nora_set' };", replace: "  if (!set) return { error: 'not_a_nora_set' };" },
    { name: 'the cron plans the whole week', file: STORE,
      find: 'export const PLAN_AHEAD_MS = 70 * 60000;', replace: 'export const PLAN_AHEAD_MS = 7 * 86400000;' },
    // ── who can read or change it ──
    { name: 'the plans are readable by members', file: SQL,
      find: 'revoke all on table public.nora_set_programmes from public, anon, authenticated;', replace: 'revoke all on table public.nora_set_programmes from public, anon;' },
    { name: 'the cron runs unauthenticated', file: CRON,
      find: "  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });\n", replace: '' },
    { name: 'licences are confirmed without the tick', file: ACT,
      find: "  if (formData.get('confirm') !== 'yes') failed('licences_unticked');\n", replace: '' },
    { name: 'adding a slot skips the admin check', file: ACT,
      find: "export async function addSlot(formData: FormData): Promise<void> {\n  await requireAdminUser();", replace: "export async function addSlot(formData: FormData): Promise<void> {\n  void requireAdminUser;" },
  ],
};
