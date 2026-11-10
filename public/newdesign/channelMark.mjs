// What sits in a channel's circle (owner, 2026-11-10: "rethink these icons for the channels",
// "have creators of channels upload custom pictures", "you can leave them circle", "make them a
// little smaller", "make shape hq one be the triangles"). The circle held a "#", which the
// channel's name beside it already says.
//
// In order: the picture the channel's host uploaded; Shape's two triangles for Shape HQ and a
// trophy for the PR Wall, both only for Shape's own channel (`official`: system-owned), so a
// member's channel named "Shape HQ" does not wear Shape's mark; otherwise the name's initials on
// a colour taken from the name, so a channel keeps its colour everywhere it is drawn.
//
// CANONICAL here; the app imports it through mobile-app/src/services/channelMark.mjs, and the
// website's chat bubble (a classic script, which cannot import it) carries an identical copy,
// `cwChannelMark` in chatWidget.jsx, held to this one by tests/channel-mark.test.mjs.

// The accents the app already draws on dark and light paper.
export const CHANNEL_MARK_HUES = ['#34d6c5', '#c0533b', '#d8b25a', '#5b8def', '#8a5cf6', '#5fa96e'];

// The logo's two triangles (BSLogo's geometry, viewBox 0 0 99 113): the top one points left,
// the bottom one right, drawn in the logo's two tones.
export const CHANNEL_MARK_TRIANGLES = { viewBox: '4 12 91 91', top: '43,39 82,15 82,63', bottom: '17,49 56,73 17,97' };

// A trophy, line-drawn on a 24-unit grid.
export const CHANNEL_MARK_TROPHY = 'M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H5.5a2.5 2.5 0 0 0 2.5 3.5M16 6h2.5a2.5 2.5 0 0 1-2.5 3.5M12 13v3.5M9.5 16.5h5v3.5h-5Z';

export function channelMark(ch) {
  const c = ch || {};
  const name = String(c.name || '').replace(/^#\s*/, '').trim();
  const key = name.toLowerCase();
  if (typeof c.picture === 'string' && c.picture.trim()) return { kind: 'picture', src: c.picture.trim() };
  if (c.official && key === 'shape hq') return { kind: 'shape' };
  if (c.official && key === 'pr wall') return { kind: 'trophy' };
  const words = name.split(/[\s\-_.·]+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
  const text = (words.length >= 2 ? words[0][0] + words[1][0] : (words[0] || '#').slice(0, 2)).toUpperCase();
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return { kind: 'initials', text, hue: CHANNEL_MARK_HUES[h % CHANNEL_MARK_HUES.length] };
}
