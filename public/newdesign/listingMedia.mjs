// Coach listing-media guard — the ONE normalizer for the marketplace box's
// coach-authored photos (spec 2026-07-23, "E · The Combo"). ONE implementation
// for every surface (the varianceBand / mealPrep / noraSets precedent): the
// website loads it as a native ES module (window.ShapeListingLib), mobile
// imports it via mobile-app/src/services/listingMedia.mjs (re-export), Node
// tests import it through that same module. Dependency-free on purpose so it
// behaves identically in all three.
//
// SECURITY — the load-bearing contract. These URLs are coach-authored and
// render on OTHER members' screens, so every one runs through bsOwnMediaUrl:
// it must be an https URL on OUR OWN Supabase storage host, in the PUBLIC
// object path of the given bucket, under the OWNER'S folder
// (…/object/public/<bucket>/<ownerUid>/…), an allowlisted IMAGE extension, no
// userinfo, no explicit port. That single parsed-URL check kills SSRF /
// tracking-beacon planting / cross-type (video) planting / cross-account
// hotlinking of another coach's folder at once. A prefix regex is explicitly
// NOT the mechanism: /^https?:\/\// accepts host-less "https://" and a substring
// match accepts evil.example/…/coach-media/<uid>/. ownerUid is REQUIRED and the
// whole normalize fails closed without it.

// Our own Supabase project's storage host. PUBLIC info — already shipped in
// public/supabase.js and the mobile bundle (the URL + publishable key are
// client-side by design), and previews + prod share this one project (WORKLOG).
// Pinned here so the module stays pure and Node-testable.
export const BS_SUPABASE_HOST = 'zznufekgjngecelwxndw.supabase.co';
export const BS_LISTING_GALLERY_MAX = 6;
export const BS_LISTING_CAPTION_MAX = 80;

// Image extensions the listing accepts — mirrors the editor's mime allowlist
// (jpeg/png/webp/gif/heic/heif) plus the bare "jpg" a hand-authored URL may use.
// Deliberately excludes svg (script vector) and every video/other type.
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'];

// How many raw gallery entries we ever inspect. Provider rows are public-read +
// owner-writable, so a crafted row could carry a huge invalid array; we only
// ever keep BS_LISTING_GALLERY_MAX, and the setter normalizes before write, so
// a real row is ≤6 valid. This bounds the per-viewer parse work (DoS guard).
const BS_LISTING_GALLERY_SCAN = BS_LISTING_GALLERY_MAX * 4;

// Control chars (NUL..US + DEL) — stripped from captions, which are one-line
// labels. Kept as an escaped class so the source stays plain ASCII.
const CONTROL_CHARS = new RegExp("[\u0000-\u001F\u007F]", "g");

// The loose gate (exported for reuse by the profile-customization wave): a
// syntactically real http(s) URL with a hostname, ≤ 500 chars. Returns the
// normalized href or null — never throws.
export function bsSafeMediaUrl(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > 500) return null;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!u.hostname) return null;
  return u.href;
}

// The strict gate: a public object URL on OUR host, in the given bucket, under
// the owner's own folder, with an image extension. `bucket` and `ownerUid` are
// trusted (supplied by the render/write code for the row being shown); `v` is
// the untrusted coach-authored value. Returns the URL or null — fail closed.
export function bsOwnMediaUrl(v, bucket, ownerUid) {
  if (!bucket || !ownerUid || typeof bucket !== 'string' || typeof ownerUid !== 'string') return null;
  const safe = bsSafeMediaUrl(v);
  if (!safe) return null;
  let u;
  try { u = new URL(safe); } catch { return null; }
  if (u.protocol !== 'https:') return null;          // public objects are https
  if (u.hostname !== BS_SUPABASE_HOST) return null;  // OUR project only
  if (u.username || u.password) return null;          // no userinfo smuggling
  if (u.port) return null;                            // no explicit port
  // new URL() has already collapsed any ../ or ./ in the path, so a traversal
  // attempt can never forge this prefix — the check runs on the normalized path.
  const prefix = `/storage/v1/object/public/${bucket}/${ownerUid}/`;
  if (!u.pathname.startsWith(prefix)) return null;    // owner-folder binding
  const rest = u.pathname.slice(prefix.length);
  if (!rest) return null;                             // the folder itself is not a file
  const ext = (rest.split('.').pop() || '').toLowerCase();
  if (!IMAGE_EXT.includes(ext)) return null;          // images only
  // Defense in depth: these URLs render inside CSS url("…") sinks. new URL()
  // percent-encodes " but leaves ' ( ) raw, so reject any that survive — our own
  // upload keys never contain them, and this keeps the value safe even if a sink
  // ever switches to single quotes.
  if (/['"()]/.test(safe)) return null;
  return safe;
}

// Plain-text caption: coerce to string, strip control chars (newlines/tabs/NUL
// — captions are one-line labels), trim, clamp to the limit. Non-strings → ''.
function cleanCaption(c) {
  if (typeof c !== 'string') return '';
  return c.replace(CONTROL_CHARS, '').trim().slice(0, BS_LISTING_CAPTION_MAX);
}

// updatedAt is cosmetic (renderers ignore it) — pass it through only when it is
// a genuine ISO-8601 timestamp string; anything else drops to null.
function isoOrNull(v) {
  if (typeof v !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? v : null;
}

// The gate every consumer runs raw provider-row data through. ownerUid REQUIRED
// (the media only counts as the coach's own when it lives in the coach's own
// folder). Always returns the { portrait, cover, gallery, updatedAt } shape;
// never throws; no Number() on anything.
export function bsNormalizeListingMedia(raw, ownerUid) {
  const empty = { portrait: null, cover: null, gallery: [], updatedAt: null };
  if (!ownerUid || typeof ownerUid !== 'string') return empty;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
  const bucket = 'coach-media';
  const gallery = [];
  const all = Array.isArray(raw.gallery) ? raw.gallery : [];
  // Only ever inspect a bounded prefix of the source array (see BS_LISTING_GALLERY_SCAN).
  const items = all.length > BS_LISTING_GALLERY_SCAN ? all.slice(0, BS_LISTING_GALLERY_SCAN) : all;
  for (const item of items) {
    if (gallery.length >= BS_LISTING_GALLERY_MAX) break;
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const url = bsOwnMediaUrl(item.url, bucket, ownerUid);
    if (!url) continue;
    // Field-by-field rebuild — extra keys on the item never ride through.
    gallery.push({ url, caption: cleanCaption(item.caption) });
  }
  return {
    portrait: bsOwnMediaUrl(raw.portrait, bucket, ownerUid),
    cover: bsOwnMediaUrl(raw.cover, bucket, ownerUid),
    gallery,
    updatedAt: isoOrNull(raw.updatedAt),
  };
}
