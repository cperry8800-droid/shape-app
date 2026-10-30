// ─── SHORT AGES ──────────────────────────────────────────────────────────────────────────────
// How long ago something happened, as the cards print it: "6m", "3h", "2d", "1w" or "now". The code
// that makes an age writes it as that token (bsAgoShort, the samples, the demo feed), and the
// screen that prints it says it in the reader's language through `tr` (common:age.*), so a language
// switch reaches cards already loaded (owner, 2026-10-30: "Yes, translate the short ages too").
// Anything else (a date past a week, already the reader's, or a clock time) is printed as it is.

const AGE = /^(\d+)\s*([mhdw])$/;

/** A short age in the reader's language; anything that is not one, as it is. */
export function bsShortAge(ago, tr) {
  const s = ago == null ? '' : String(ago).trim();
  if (!s) return '';
  if (/^now$/i.test(s)) return tr('common:age.now', { defaultValue: 'now' });
  const m = s.match(AGE);
  if (!m) return s;
  return tr('common:age.' + m[2], { defaultValue: '{n}' + m[2], n: Number(m[1]) });
}
