import React from 'react';
import { channelMark, CHANNEL_MARK_TRIANGLES, CHANNEL_MARK_TROPHY } from '../services/channelMark.mjs';
// ─── A CHANNEL'S CIRCLE ─────────────────────────────────────────────────────────
// Owner, 2026-11-10, over the channel header's "#" in a ring beside "# Sunday Ru…": "rethink these
// icons for the channels", "have creators of channels upload custom pictures", "you can leave them
// circle", "make them a little smaller", "make shape hq one be the triangles".
//
// What goes in it is channelMark's (public/newdesign/channelMark.mjs, which the website's bubble
// copies): the host's picture, Shape's triangles for Shape HQ, a trophy for the PR Wall, else the
// name's initials on the name's colour. A circle, as before; the sizes come from the caller.
//
// Self-contained: no window globals, so it is safe as a static import of the client module.

function hexA(hex, a) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return hex;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

// `ink` and `accent` are the theme's (t.INK and its teal), for the two Shape marks; `ring` an
// optional outer ring (the thread header's desk ring).
export function BSChannelMark({ ch, size = 40, ink = '#f2ede4', accent = '#34d6c5', ring = null }) {
  const m = channelMark(ch);
  const [broken, setBroken] = React.useState(false);
  const base = { flex: 'none', width: size, height: size, borderRadius: '50%', display: 'grid', placeItems: 'center', overflow: 'hidden', boxShadow: ring || undefined };
  if (m.kind === 'picture' && !broken) {
    return (
      <span aria-hidden data-channel-mark="picture" style={{ ...base, background: hexA(accent, 0.12) }}>
        <img src={m.src} alt="" onError={() => setBroken(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </span>
    );
  }
  if (m.kind === 'shape') {
    const g = CHANNEL_MARK_TRIANGLES;
    return (
      <span aria-hidden data-channel-mark="shape" style={{ ...base, background: hexA(accent, 0.14), border: `1px solid ${hexA(accent, 0.45)}` }}>
        <svg viewBox={g.viewBox} width={size * 0.56} height={size * 0.56} style={{ display: 'block' }}>
          <polygon points={g.top} fill={ink} />
          <polygon points={g.bottom} fill={accent} />
        </svg>
      </span>
    );
  }
  if (m.kind === 'trophy') {
    const gold = '#d8b25a';
    return (
      <span aria-hidden data-channel-mark="trophy" style={{ ...base, background: hexA(gold, 0.14), border: `1px solid ${hexA(gold, 0.45)}`, color: gold }}>
        <svg viewBox="0 0 24 24" width={size * 0.52} height={size * 0.52} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
          <path d={CHANNEL_MARK_TROPHY} />
        </svg>
      </span>
    );
  }
  const text = m.kind === 'initials' ? m.text : channelMark({ name: ch && ch.name }).text;
  const hue = m.hue || channelMark({ name: ch && ch.name }).hue;
  return (
    <span aria-hidden data-channel-mark="initials" style={{ ...base, background: hexA(hue, 0.16), border: `1px solid ${hexA(hue, 0.45)}`, color: hue, fontFamily: "'Saira', 'Space Grotesk', system-ui, sans-serif", fontWeight: 700, fontSize: Math.round(size * (text.length > 1 ? 0.36 : 0.44)), letterSpacing: '0.02em', lineHeight: 1 }}>
      {text}
    </span>
  );
}
