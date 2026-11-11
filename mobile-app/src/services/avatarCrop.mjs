// ─── THE AVATAR PHOTO'S FRAME ─────────────────────────────────────────────────────────────────────
// Owner, 2026-11-11: "need to be able to drag and reposition profile pic on avatar". A picked photo is
// placed in the avatar before it is saved (BSAvatarPositioner.jsx), and the square every avatar reads
// (client_identity.photo, 256px) is cut from the photo where the member left it. The photo as picked is
// kept privately beside it (user_goals 'client_photo_source'), so Reposition starts from the whole photo
// again, not from the square already cut.
//
// A position is { x, y, zoom }: the square's centre as a share of the photo's width and height (0 to 1),
// and how far in it is zoomed (1: the photo's short side fills the square). It is always one the photo
// can fill: bsAvClamp keeps the square inside the photo.

export const BS_AV_OUT = 256;       // the saved square, as every avatar has read it since the first photo
export const BS_AV_ZOOM_MAX = 4;
export const BS_AV_SOURCE_MAX = 1080; // the kept photo's long side
// The avatar's window as a share of the square: BSFacetAvatar draws the photo at 152% of a diamond window
// (a square turned 45°), so the window's side is 1 / 1.52 of the photo's.
export const BS_AV_WINDOW = 1 / 1.52;

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function bsAvClamp(iw, ih, pos) {
  const w = Math.max(1, num(iw, 1));
  const h = Math.max(1, num(ih, 1));
  const zoom = Math.min(BS_AV_ZOOM_MAX, Math.max(1, num(pos && pos.zoom, 1)));
  const side = Math.min(w, h) / zoom;
  const hx = side / 2 / w;
  const hy = side / 2 / h;
  const x = Math.min(1 - hx, Math.max(hx, num(pos && pos.x, 0.5)));
  const y = Math.min(1 - hy, Math.max(hy, num(pos && pos.y, 0.5)));
  return { x, y, zoom };
}

// The square in the photo's own pixels.
export function bsAvRect(iw, ih, pos) {
  const p = bsAvClamp(iw, ih, pos);
  const side = Math.min(iw, ih) / p.zoom;
  return { sx: p.x * iw - side / 2, sy: p.y * ih - side / 2, side };
}

// A drag of (dx, dy) screen pixels on a frame `frame` pixels wide moves the photo with the finger, so the
// square moves the other way.
export function bsAvPan(iw, ih, pos, dx, dy, frame) {
  const p = bsAvClamp(iw, ih, pos);
  const k = bsAvRect(iw, ih, p).side / Math.max(1, frame);
  return bsAvClamp(iw, ih, { x: p.x - (num(dx, 0) * k) / iw, y: p.y - (num(dy, 0) * k) / ih, zoom: p.zoom });
}

// A zoom to `zoom` that keeps the point under (fx, fy) of the frame (shares, 0 to 1) where it is: a pinch
// zooms at the fingers, the slider and the keys at the centre.
export function bsAvZoomAt(iw, ih, pos, zoom, fx = 0.5, fy = 0.5) {
  const p = bsAvClamp(iw, ih, pos);
  const r = bsAvRect(iw, ih, p);
  const px = r.sx + num(fx, 0.5) * r.side;
  const py = r.sy + num(fy, 0.5) * r.side;
  const z = Math.min(BS_AV_ZOOM_MAX, Math.max(1, num(zoom, p.zoom)));
  const side = Math.min(iw, ih) / z;
  const sx = px - num(fx, 0.5) * side;
  const sy = py - num(fy, 0.5) * side;
  return bsAvClamp(iw, ih, { x: (sx + side / 2) / iw, y: (sy + side / 2) / ih, zoom: z });
}

// The kept photo's size: the long side at most `max`, never enlarged.
export function bsAvFit(iw, ih, max = BS_AV_SOURCE_MAX) {
  const w = Math.max(1, num(iw, 1));
  const h = Math.max(1, num(ih, 1));
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

// Whether a kept photo still belongs to the avatar: it is kept with the square it made, and a photo
// changed elsewhere since (the website's Edit profile) is a different square, so Reposition starts from the
// avatar as it is instead.
export function bsAvSourceFits(sourceDoc, photo) {
  if (!sourceDoc || typeof sourceDoc !== 'object' || typeof sourceDoc.src !== 'string' || !sourceDoc.src) return false;
  if (typeof photo !== 'string' || !photo) return false;
  return sourceDoc.made === bsAvMark(photo);
}

// A short mark of a saved square: its length and its last characters (a JPEG's data ends differently for a
// different picture), so the kept document need not hold a second copy of the square.
export function bsAvMark(photo) {
  const s = typeof photo === 'string' ? photo : '';
  return s ? `${s.length}:${s.slice(-48)}` : '';
}
