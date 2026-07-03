// Pure helpers for the Session Details "Open Ledger" summary — stat ranking
// into the two ledger registers + the AVG PACE needle math. Dependency-free
// so the honesty rules (no fabricated needle, promoted primaries) stay
// unit-tested. Spec: docs/superpowers/specs/2026-07-03-session-details-open-ledger-design.md

// Split a stat value into { num, unit } for big-number + small-unit type.
// Only a short trailing letter/%/slash token counts as a unit — composites
// ("2.4 · M0") and times ("25:31") render whole.
export function bsSdSplitUnit(text) {
  const s = String(text == null ? '' : text).trim();
  const m = s.match(/^([\d.,:]+)\s*([a-zA-Z%/]{1,6})$/);
  return m ? { num: m[1], unit: m[2] } : { num: s, unit: '' };
}

const SD_PACE_RE = /pace|speed/i;
const SD_TIME_RE = /\btime\b|duration|moving|elapsed/i;
const SD_HR_RE = /avg.*(hr|heart|bpm)|(^|\s)hr\b|heart/i;

// Rank [label, value] pairs into the ledger registers. Primary = the first
// pace/speed + time + HR match (≤3), kept in SOURCE order; when fewer than 2
// match (strength / recovery sessions) the leading stats are promoted so the
// big register never renders a lonely orphan. Secondary = the rest, in order.
export function bsSdRankStats(stats) {
  const list = Array.isArray(stats) ? stats.filter((s) => Array.isArray(s) && s.length >= 2) : [];
  const primary = [];
  [SD_PACE_RE, SD_TIME_RE, SD_HR_RE].forEach((re) => {
    const hit = list.find((s) => re.test(String(s[0])) && !primary.includes(s));
    if (hit) primary.push(hit);
  });
  list.forEach((s) => { if (primary.length < 2 && !primary.includes(s)) primary.push(s); });
  primary.sort((a, b) => list.indexOf(a) - list.indexOf(b));
  return { primary, secondary: list.filter((s) => !primary.includes(s)) };
}

const clamp01 = (n) => Math.max(0, Math.min(1, n));
const fmtPace = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

// Where the average sits between the session's slowest and fastest samples.
// Returns null (→ plain ledger row, never a fabricated needle) when the trace
// is short/flat or the value doesn't parse. 'pace' traces are seconds (lower
// = faster; faster reads RIGHT); 'speed' traces are mph (higher = faster).
// lo/hi are the LEFT/RIGHT endpoint labels (slowest → fastest).
export function bsSdNeedle(value, trace, mode = 'pace') {
  if (!Array.isArray(trace) || trace.length < 2) return null;
  const lo = Math.min(...trace), hi = Math.max(...trace);
  if (!(hi > lo)) return null;
  const s = String(value == null ? '' : value);
  if (mode === 'speed') {
    const avg = parseFloat(s.replace(/[^\d.]/g, ''));
    if (!isFinite(avg)) return null;
    return { frac: clamp01((avg - lo) / (hi - lo)), lo: lo.toFixed(1), hi: hi.toFixed(1) };
  }
  const m = s.match(/(\d+):(\d{2})/);
  if (!m) return null;
  const avg = (+m[1]) * 60 + (+m[2]);
  return { frac: clamp01((hi - avg) / (hi - lo)), lo: fmtPace(hi), hi: fmtPace(lo) };
}
