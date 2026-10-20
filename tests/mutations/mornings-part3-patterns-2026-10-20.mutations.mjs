// Mutation spec for the Morning check-in, part 3 (What we've noticed: morningPatterns.mjs's gates and its copies of the card's rules; docs/REVIEW-2026-10-19-morning-checkin.md
// §3.6, §3.9, §3.10 and rulings 14-18). One of four part-3 specs, each with its own narrow test
// command. Every mutation must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/mornings-part3-patterns-2026-10-20.mutations.mjs --fail-on-skipped
const MOD = 'mobile-app/src/services/morningPatterns.mjs';

export default {
  test: "node --test tests/morning-patterns.test.mjs tests/member-mornings.test.mjs",
  timeoutMs: 600_000,
  mutations: [
    { name: "patterns: short.n >= MP_MIN_MORNINGS && full.n → short.n >= 7 && full.n", file: MOD, find: "short.n >= MP_MIN_MORNINGS && full.n", replace: "short.n >= 7 && full.n" },
    { name: "patterns: full.n >= MP_MIN_MORNINGS) → full.n >= 7)", file: MOD, find: "full.n >= MP_MIN_MORNINGS)", replace: "full.n >= 7)" },
    { name: "patterns: Math.abs(gap) >= MP_GAP → Math.abs(gap) > MP_GAP", file: MOD, find: "Math.abs(gap) >= MP_GAP", replace: "Math.abs(gap) > MP_GAP" },
    { name: "patterns: const gap = r9(pS - pF); → const gap = pS - pF;", file: MOD, find: "const gap = r9(pS - pF);", replace: "const gap = pS - pF;" },
    { name: "patterns: Math.abs(gap) >= r9(MP_Z * se) → Math.abs(gap) >= 0 * se", file: MOD, find: "Math.abs(gap) >= r9(MP_Z * se)", replace: "Math.abs(gap) >= 0 * se" },
    { name: "patterns: Math.abs(gap) >= r9(MP_Z * se) → Math.abs(gap) > MP_Z * se + 0.01", file: MOD, find: "Math.abs(gap) >= r9(MP_Z * se)", replace: "Math.abs(gap) > MP_Z * se + 0.01" },
    { name: "patterns: dir: gap > 0 ? 'more' : 'less' → dir: 'more'", file: MOD, find: "dir: gap > 0 ? 'more' : 'less'", replace: "dir: 'more'" },
    { name: "patterns: if (e <= 1) side.low += 1; → if (e <= 2) side.low += 1;", file: MOD, find: "if (e <= 1) side.low += 1;", replace: "if (e <= 2) side.low += 1;" },
    { name: "patterns: if (e <= 1) side.low += 1; → if (e < 1) side.low += 1;", file: MOD, find: "if (e <= 1) side.low += 1;", replace: "if (e < 1) side.low += 1;" },
    { name: "patterns: && d.iso >= from → && d.iso > from", file: MOD, find: "&& d.iso >= from", replace: "&& d.iso > from" },
    { name: "patterns: && d.iso >= from → ", file: MOD, find: "&& d.iso >= from", replace: "" },
    { name: "patterns: Number.isFinite(d.sleep) && d.sleep > 0 → Number.isFinite(d.sleep) && d.sleep >= 0", file: MOD, find: "Number.isFinite(d.sleep) && d.sleep > 0", replace: "Number.isFinite(d.sleep) && d.sleep >= 0" },
    { name: "patterns: Number.isFinite(d.sleep) && d.sleep > 0 → d.sleep != null", file: MOD, find: "Number.isFinite(d.sleep) && d.sleep > 0", replace: "d.sleep != null" },
    { name: "patterns: tired * 2 > n → tired * 2 >= n", file: MOD, find: "tired * 2 > n", replace: "tired * 2 >= n" },
    { name: "patterns: if (n >= MP_MIN_MORNINGS && tired → if (n >= 7 && tired", file: MOD, find: "if (n >= MP_MIN_MORNINGS && tired", replace: "if (n >= 7 && tired" },
    { name: "patterns: if (r <= 1) tired += 1; → if (r <= 2) tired += 1;", file: MOD, find: "if (r <= 1) tired += 1;", replace: "if (r <= 2) tired += 1;" },
    { name: "patterns:     if (mpShortNight(d.sleep, d.usual)) continue → ", file: MOD, find: "    if (mpShortNight(d.sleep, d.usual)) continue;\n", replace: "" },
    { name: "patterns: h < MR_SHORT_FLOOR_H || → h <= MR_SHORT_FLOOR_H ||", file: MOD, find: "h < MR_SHORT_FLOOR_H ||", replace: "h <= MR_SHORT_FLOOR_H ||" },
    { name: "patterns: h <= u - 1) → h < u - 1)", file: MOD, find: "h <= u - 1)", replace: "h < u - 1)" },
    { name: "patterns: if (p && !byDate.has(p.date)) byDate.set(p.date, → if (p) byDate.set(p.date, p.value);", file: MOD, find: "if (p && !byDate.has(p.date)) byDate.set(p.date, p.value);", replace: "if (p) byDate.set(p.date, p.value);" },
    { name: "patterns: if (p && !byDate.has(p.date)) byDate.set(p.date, → if (p && !byDate.has(p.date) && Number.i", file: MOD, find: "if (p && !byDate.has(p.date)) byDate.set(p.date, p.value);", replace: "if (p && !byDate.has(p.date) && Number.isFinite(Number(p.value))) byDate.set(p.date, p.value);" },
    { name: "patterns: const device = ix.has('sleepFromDevice') → const device = false && ix.has('sleepFro", file: MOD, find: "const device = ix.has('sleepFromDevice')", replace: "const device = false && ix.has('sleepFromDevice')" },
    { name: "patterns: at('sleepEfficiency') != null || at('restingHr') → at('sleepEfficiency') != null || at('res", file: MOD, find: "at('sleepEfficiency') != null || at('restingHr') != null || at('hrv') != null", replace: "at('sleepEfficiency') != null || at('restingHr') != null" },
    { name: "patterns: skipped: ix.dated('sleepSkipped', iso) → skipped: ix.at('sleepSkipped', iso) != n", file: MOD, find: "skipped: ix.dated('sleepSkipped', iso)", replace: "skipped: ix.at('sleepSkipped', iso) != null" },
    { name: "patterns: for (let i = 1; i <= 14; i += 1) { → for (let i = 0; i <= 13; i += 1) {", file: MOD, find: "for (let i = 1; i <= 14; i += 1) {", replace: "for (let i = 0; i <= 13; i += 1) {" },
    { name: "patterns: if (s != null && s > 0) nights.push(s); → if (s != null && s >= 0) nights.push(s);", file: MOD, find: "if (s != null && s > 0) nights.push(s);", replace: "if (s != null && s >= 0) nights.push(s);" },
    { name: "patterns: Math.round(mid * 2) / 2 → mid", file: MOD, find: "Math.round(mid * 2) / 2", replace: "mid" },
    { name: "patterns: Math.max(3, Math.min(12, → Math.max(3, Math.min(13,", file: MOD, find: "Math.max(3, Math.min(12,", replace: "Math.max(3, Math.min(13," },
    { name: "patterns: if (!nights.length) return 7.5; → if (!nights.length) return 7;", file: MOD, find: "if (!nights.length) return 7.5;", replace: "if (!nights.length) return 7;" },
    { name: "patterns: const len = Math.min(MP_MAX_DAYS, → const len = Math.min(401,", file: MOD, find: "const len = Math.min(MP_MAX_DAYS,", replace: "const len = Math.min(401," },
    { name: "patterns: for (let i = len - 1; i >= 0; i -= 1) { → for (let i = len; i >= 1; i -= 1) {", file: MOD, find: "for (let i = len - 1; i >= 0; i -= 1) {", replace: "for (let i = len; i >= 1; i -= 1) {" },
    { name: "patterns: export const MP_WINDOW_DAYS = 60; → export const MP_WINDOW_DAYS = 61;", file: MOD, find: "export const MP_WINDOW_DAYS = 60;", replace: "export const MP_WINDOW_DAYS = 61;" },
    { name: "patterns: export const MP_SINCE = '2026-10-19'; → export const MP_SINCE = '2026-10-18';", file: MOD, find: "export const MP_SINCE = '2026-10-19';", replace: "export const MP_SINCE = '2026-10-18';" },
    { name: "patterns: return morningPatterns(mpDays(series, todayIso,  → return morningPatterns(mpDays(series, to", file: MOD, find: "return morningPatterns(mpDays(series, todayIso, MP_WINDOW_DAYS), opts);", replace: "return morningPatterns(mpDays(series, todayIso, MP_WINDOW_DAYS), undefined);" },
    { name: "patterns: const from = typeof since === 'string' && MP_ISO → const from = since || MP_SINCE;", file: MOD, find: "const from = typeof since === 'string' && MP_ISO.test(since) ? since : MP_SINCE;", replace: "const from = since || MP_SINCE;" },
    { name: "patterns: out.push({ iso, ...mpDay(ix, iso), usual: mpUsua → out.push({ iso, ...mpDay(ix, iso), usual", file: MOD, find: "out.push({ iso, ...mpDay(ix, iso), usual: mpUsualNight(ix, iso) });", replace: "out.push({ iso, ...mpDay(ix, iso), usual: 7.5 });" },
    { name: "patterns: const se = r9( → const se = 0.5 * r9(", file: MOD, find: "const se = r9(", replace: "const se = 0.5 * r9(" },
  ],
};
