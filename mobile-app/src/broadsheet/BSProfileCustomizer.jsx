import React from 'react';
import { createPortal } from 'react-dom';
import { BS_CLEAN_HEAD, BS_CLEAN_SANS, BSCleanType, useBSClean } from './bsCleanType.jsx';
import { BSMpIcon } from './BSMemberBento.jsx';
import { BSLookPicker, hexA, onColor } from './BSLookPicker.jsx';
import { bsWsAccent } from './bsMagazine.mjs';
import {
  bsNormalizeProfileCustom, bsStartLineState, bsValidStartDate, bsProfileLook, BS_LOOK_PAPERS, BS_LOOK_ACCENTS,
  BS_WALL_MAX, BS_SHELF_MAX, BS_LINE_MAX, BS_CAPTION_MAX, BS_SHELF_TITLE_MAX, BS_SHELF_WHEN_MAX, BS_START_TITLE_MAX,
  BS_FILM_CAPTION_MAX, BS_BIZ_NAME_MAX, BS_BIZ_WHERE_MAX, BS_BIZ_HOURS_MAX, BS_BIZ_HANDLE_MAX, BS_PINNED_REVIEWS_MAX,
  BS_PIN_KINDS, BS_PROFILE_PROMPTS, BS_COACH_PROMPTS, bsPinKindLabel, bsPinKindToken, bsPromptLabel, bsPromptToken,
} from '../services/profileCustom.mjs';
// ─── CUSTOMIZE · THE PROFILE EDITOR ──────────────────────────────────────────────────────────────
// What a member (or a coach, `coach`) edits their public profile in: opened from the profile's ✎ and
// Edit profile, and from Settings → Customize. Moved out of iosAppBroadsheetClient.jsx when it was
// redesigned (owner, 2026-11-04, of the old page's ruled capitals: "new design for these pages", "keep
// designs simple, nothing to futuristic … but modern, appealing, easy to navigate, not overwhelming, not
// analog. make them look really alive, like popping off the screen", pointing at the member profile as
// what "looks better"; then, of the redesigns that followed, "reduce the coloring and simplify UI more").
//
//   · A live preview at the top: the profile's head as it will read (the facet avatar for a member, the
//     round photo for a coach; the name, the countdown, a coach's line and the bio), redrawn as they
//     type, with the door to the name, @handle and photo (Settings) under it.
//   · The parts gathered into a few cards in the paper's own colour with a soft lift, each part under a
//     plain label with its hint beside it; rounded 16px fields; the photos as rounded tiles.
//   · Colour only as a signal: Save, a focused field, the tier's colour in the facet avatar and an error.
//     No tinted or gradient panels. The profile's colours are picked in the shared look panel
//     (BSLookPicker, Make it yours' Colors page), which draws its own chrome.
//   · Save floats at the foot as one pill. Motion is a short rise as the cards come in and a press on a
//     tap, all of it off under prefers-reduced-motion.
//
// ⚠ SAVE READS THE DOC AGAIN AND WRITES ONLY WHAT THIS PAGE SHOWS, as Make it yours saves: the parts this
// role's editor shows go over the doc as stored now, so a key written elsewhere since it opened (a `look`,
// a member's line) is kept, and `look` is written only when it was changed here. The limits, the upload
// type and size checks, the in-flight upload guard, the sign-in guard and the normalizer are the
// editor's as they were (tests/profile-custom.test.mjs, tests/profile-token-sync.test.mjs).
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP, and this module never imports the client
// module (the BSLeaderboard / BSEatDay pattern): the masthead row, the facet avatar and the identity
// helpers are read off window inside the component. The client imports the option tables below from here.

const { useState, useEffect, useRef } = React;

// The i18n translator for this module (the self-contained copy every feature module carries).
function useShapeTr() {
  const [, force] = useState(0);
  useEffect(() => {
    const unsub = window.ShapeLocale?.subscribe?.(() => force((n) => n + 1));
    return typeof unsub === 'function' ? unsub : undefined;
  }, []);
  return (key, opts) => {
    const v = window.ShapeI18n?.t?.(key, opts);
    return (v == null || v === key) ? (opts?.defaultValue ?? key) : v;
  };
}

// ── The option tables (the public profile reads them too, through the client's import) ──────────

// Profile customization (song · prompts · links · bio) is stored in user_goals('profile_custom') and
// surfaced to others via get_public_profile (`custom`). Music is a Spotify embed (reuses the existing
// integration model).
export function bsSpotifyEmbed(url) {
  if (!url) return null;
  const m = /open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|playlist|album|artist|episode|show)\/([A-Za-z0-9]+)/.exec(String(url));
  return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}` : null;
}
// Headline-stat picker options. `key` is what the doc stores and the profile hero
// resolves against its own `stats` map — the split already exists, so `label` is
// display-only. `tKey` is the profile key a locale renames it through; `score`
// deliberately carries NONE, because "Shape Score" is a brand noun that stays
// literal in all thirteen and keying it would ship thirteen identical values a
// translator must not touch. The guard pins that exemption with its reason.
export const BS_STAT_OPTIONS = [
  { key: 'score',   label: 'Shape Score' },
  { key: 'tier',    label: 'Tier',         tKey: 'profile:stat.tier' },
  { key: 'streak',  label: 'Day streak',   tKey: 'profile:stat.dayStreak' },
  { key: 'since',   label: 'Member since', tKey: 'profile:stat.memberSince' },
  { key: 'lift',    label: 'Top lift',     tKey: 'profile:stat.topLift' },
  { key: 'rating',  label: 'Rating',       tKey: 'profile:stat.rating' },
  { key: 'reviews', label: 'Reviews',      tKey: 'profile:tab.reviews' },
];
// A catalog that returns the RAW KEY (the returnEmptyString: false trap), an
// authored empty value, or one that throws still reads English — the same
// contract bsProfileOptLabel holds for the pin kinds and prompts.
export function bsOptLabel(o, tr) {
  if (!o) return '';
  if (!o.tKey || typeof tr !== 'function') return o.label;
  try {
    const v = tr(o.tKey, { defaultValue: o.label });
    return (v == null || v === '' || String(v).indexOf('profile:') === 0) ? o.label : v;
  } catch (e) { return o.label; }
}
export const BS_PROFILE_LINKS = [
  // Brand nouns — literal in all thirteen, so no tKey. Only "Website" is a word
  // a locale renames, and it alone carries one.
  { key: 'instagram', label: 'Instagram', pre: 'instagram.com/' },
  { key: 'x', label: 'X', pre: 'x.com/' },
  { key: 'tiktok', label: 'TikTok', pre: 'tiktok.com/@' },
  { key: 'youtube', label: 'YouTube', pre: 'youtube.com/@' },
  { key: 'substack', label: 'Substack', pre: 'substack.com/@' },
  { key: 'website', label: 'Website', pre: '', tKey: 'profile:editor.link.website' },
];

// ── Drawing helpers ────────────────────────────────────────────────────────────────────────────
// The colour maths (a colour at an alpha, the words that read on a colour) are the look panel's own
// palette helpers (BSLookPicker.jsx), imported above, not a copy: every palette colour is a 6-digit hex.
// A part's name and its hint, as the catalog writes them: "The wall · pinned photos · up to 6".
const splitHead = (text) => {
  const s = String(text || '');
  const at = s.indexOf(' · ');
  return at > 0 ? [s.slice(0, at), s.slice(at + 3)] : [s, ''];
};
// The Add labels carry their own "+ " in every locale; the editor draws the plus as an icon instead.
const noPlus = (s) => String(s || '').replace(/^\s*[+＋]\s*/, '');
const fallbackInitials = (name) => String(name || '').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const validPhoto = (p) => { const s = (p == null ? '' : String(p)).trim(); return /^(https?:|blob:|\/|data:image\/)/i.test(s) ? s : null; };
const reducedMotion = () => { try { return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

// Focus rings, placeholders, the press and the cards' rise: the parts inline styles cannot say. Every
// motion rule is undone under prefers-reduced-motion.
function bsCustCss() {
  if (typeof document === 'undefined' || document.getElementById('bs-cust-css')) return;
  const s = document.createElement('style');
  s.id = 'bs-cust-css';
  s.textContent = [
    '.bs-cust-field { transition: border-color 160ms ease, box-shadow 160ms ease; }',
    '.bs-cust-field::placeholder { color: var(--cust-ph); opacity: 1; }',
    '.bs-cust-field:focus { border-color: var(--cust-teal) !important; box-shadow: 0 0 0 3px var(--cust-ring) !important; }',
    '.bs-cust-cap::placeholder { color: rgba(255,255,255,0.8); opacity: 1; }',
    '.bs-cust-cap:focus { box-shadow: inset 0 -3px 0 var(--cust-teal); }',
    '.bs-cust-btn:focus-visible { outline: 2px solid var(--cust-teal); outline-offset: 2px; }',
    '.bs-cust-press { transition: transform 160ms ease, box-shadow 160ms ease, background-color 160ms ease; }',
    '.bs-cust-press:active:not(:disabled) { transform: scale(0.97); }',
    '@keyframes bsCustIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }',
    '.bs-cust-in { animation: bsCustIn 340ms cubic-bezier(.2,.7,.2,1) both; }',
    '@keyframes bsCustFade { from { opacity: 0; } to { opacity: 1; } }',
    '.bs-cust-photo { animation: bsCustFade 260ms ease both; }',
    '@media (prefers-reduced-motion: reduce) {',
    '  .bs-cust-in, .bs-cust-photo { animation: none !important; }',
    '  .bs-cust-press, .bs-cust-field { transition: none !important; }',
    '  .bs-cust-press:active:not(:disabled) { transform: none !important; }',
    '}',
  ].join('\n');
  document.head.appendChild(s);
}

// ── The editor ─────────────────────────────────────────────────────────────────────────────────
// `who` is the person the profile behind it shows ({ name, handle, photo }), so the preview reads as
// that profile does (the preview persona included); without it, the signed-in member's own.
export function BSProfileCustomizer({ initial, c, INK, BG, onClose, onSave, coach = false, ownerUid = null, who = null }) {
  const W = typeof window !== 'undefined' ? window : {};
  const BSMastRow = W.BSMastRow;
  const FacetAvatar = W.BSFacetAvatar;
  const BS_MAST_TOP_CSS = W.BS_MAST_TOP_CSS || `max(${W.BS_MAST_TOP || 44}px, calc(env(safe-area-inset-top, 0px) + 12px), var(--bs-notch-floor, 0px))`;
  // Ink/paper arrive as props (this editor is painted over the profile's own ground); the gutter is a
  // density setting, so it reads the live theme. It portals into the phone surface, and a portal keeps
  // React context, so the theme resolves.
  const tTheme = W.useBS ? W.useBS() : {};
  const tClean = useBSClean();
  const gutter = (tTheme && tTheme.padX) || 22;
  const light = !!tTheme.isLight;
  const PAPER = tTheme.PAPER || '#0f0e0c';
  const PAPER2 = tTheme.PAPER2 || PAPER;
  // The one colour of the page: Save and a focused field (the magazine's teal, readable on either paper).
  const TEAL = bsWsAccent(tTheme);
  const onTeal = onColor(TEAL);
  const ERR = light ? '#b3412b' : '#f08a6c';
  const ink = (a) => hexA(INK, a);
  const tr = useShapeTr();
  const init = initial || {};
  const PROMPT_OPTS = coach ? BS_COACH_PROMPTS : BS_PROFILE_PROMPTS;
  useEffect(() => { bsCustCss(); }, []);
  const [motion] = useState(() => !reducedMotion());

  const [bio, setBio] = useState(init.bio || '');
  const [songUrl, setSongUrl] = useState((init.song && init.song.url) || '');
  const [songLabel, setSongLabel] = useState((init.song && init.song.label) || '');
  const [links, setLinks] = useState({ ...(init.links || {}) });
  const [prompts, setPrompts] = useState(Array.isArray(init.prompts) && init.prompts.length ? init.prompts.slice(0, 4) : [{ q: PROMPT_OPTS[0].id, a: '' }]);
  const [coverUrl, setCoverUrl] = useState((init.cover && init.cover.image) || '');
  // The profile's colours (`look`: a Shape paper and accent), picked in the shared look panel
  // (BSLookPicker, Make it yours' Colors page). The panel needs both set, so a profile that never
  // picked starts from the app's own paper and accent; that seed is never written: `look` is saved
  // only once something here changes it, so a page nobody recoloured stays exactly as it was. The
  // old `accent` hex and `climbBg` are no longer edited here; Save leaves them as the doc has them.
  const [lookSeed] = useState(() => {
    const saved = bsProfileLook(init.look) || {};
    return {
      ...saved,
      paper: saved.paper || (BS_LOOK_PAPERS.includes(tTheme.paperMode) ? tTheme.paperMode : 'dark'),
      accent: saved.accent || (BS_LOOK_ACCENTS.includes(tTheme.accentKey) ? tTheme.accentKey : 'teal'),
    };
  });
  const [look, setLook] = useState(lookSeed);
  const lookChanged = look.paper !== lookSeed.paper || look.accent !== lookSeed.accent;
  // Normalise on the way IN: a doc stored before the split carries English, and a
  // picker comparing tokens would match no chip and silently reset the member's pin.
  // The label helpers take the translator; the TOKEN is what the picker compares
  // and the doc stores, so a renaming translator can never reset a member's pin.
  const [pinKind, setPinKind] = useState(bsPinKindToken((init.pinned && init.pinned.kind) || '') || BS_PIN_KINDS[0].id);
  const [pinTitle, setPinTitle] = useState((init.pinned && init.pinned.title) || '');
  const [pinNote, setPinNote] = useState((init.pinned && init.pinned.note) || '');
  const [pinMetric, setPinMetric] = useState((init.pinned && init.pinned.metric) || '');
  const [heroStats, setHeroStats] = useState(Array.isArray(init.heroStats) && init.heroStats.length ? init.heroStats : ['score', 'tier', 'streak']);
  const toggleStat = (k) => setHeroStats((prev) => { if (prev.includes(k)) return prev.length > 1 ? prev.filter((x) => x !== k) : prev; return prev.length >= 3 ? [...prev.slice(1), k] : [...prev, k]; });
  const [coverBusy, setCoverBusy] = useState(false);
  const coverRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const onCoverFile = async (e) => {
    const file = e?.target?.files?.[0]; if (e?.target) e.target.value = '';
    if (!file) return;
    // Only the types the cover guard keeps (bsProfileCover): any other upload would be stored and
    // then never shown. The same allowlist as the wall below and Make it yours.
    if (!/^image\/(jpe?g|png|webp|gif|heic|heif)$/i.test(file.type || '')) { window.__bsToast?.(tr('profile:editor.err.imageType', { defaultValue: 'Pick a JPG, PNG, WebP, GIF, HEIC or HEIF image.' }), 'err'); return; }
    setCoverBusy(true);
    try { const url = await window.ShapeCommunity?.uploadPhoto?.(file); if (url) setCoverUrl(url); else throw new Error(tr('profile:editor.err.uploadFailed', { defaultValue: 'Upload failed.' })); }
    catch (err) { window.__bsToast?.(err?.message || tr('profile:editor.err.cover', { defaultValue: 'Could not upload cover.' }), 'err'); }
    finally { setCoverBusy(false); }
  };
  const setPrompt = (i, k, v) => setPrompts((prev) => prev.map((p, j) => j === i ? { ...p, [k]: v } : p));
  const addPrompt = () => setPrompts((prev) => prev.length >= 4 ? prev : [...prev, { q: PROMPT_OPTS[prev.length % PROMPT_OPTS.length].id, a: '' }]);
  const removePrompt = (i) => setPrompts((prev) => prev.filter((_, j) => j !== i));
  // ── Member profile-wave sections (M1–M4). State round-trips init even when the
  //    section isn't shown (coach path is PR D), so the doc never loses a key. ──
  const [line, setLine] = useState(init.line || '');
  const [startTitle, setStartTitle] = useState((init.startLine && init.startLine.title) || '');
  const [startDate, setStartDate] = useState((init.startLine && init.startLine.date) || '');
  const [wall, setWall] = useState(Array.isArray(init.wall) ? init.wall.slice(0, BS_WALL_MAX).map((w) => ({ url: w && w.url, caption: (w && w.caption) || '' })) : []);
  const [shelf, setShelf] = useState(Array.isArray(init.shelf) ? init.shelf.slice(0, BS_SHELF_MAX).map((s) => ({ title: (s && s.title) || '', when: (s && s.when) || '' })) : []);
  const [wallBusy, setWallBusy] = useState(false);
  const wallRef = useRef(null);
  const onWallFile = async (e) => {
    const file = e?.target?.files?.[0]; if (e?.target) e.target.value = '';
    if (!file || wall.length >= BS_WALL_MAX) return;
    // Reject types the wall's image allowlist can't accept BEFORE upload — an SVG
    // (or avif/bmp) uploads then gets dropped by bsOwnMediaUrl at save, orphaning
    // the blob in storage. Mirrors the web dkWallExt allowlist.
    if (!/^image\/(jpe?g|png|webp|gif|heic|heif)$/i.test(file.type || '')) { window.__bsToast?.(tr('profile:editor.err.imageType', { defaultValue: 'Pick a JPG, PNG, WebP, GIF, HEIC or HEIF image.' }), 'err'); return; }
    setWallBusy(true);
    try { const url = await window.ShapeCommunity?.uploadPhoto?.(file); if (url) setWall((prev) => prev.length >= BS_WALL_MAX ? prev : [...prev, { url, caption: '' }]); else throw new Error(tr('profile:editor.err.uploadFailed', { defaultValue: 'Upload failed.' })); }
    catch (err) { window.__bsToast?.(err?.message || tr('profile:editor.err.photo', { defaultValue: 'Could not upload photo.' }), 'err'); }
    finally { setWallBusy(false); }
  };
  const setWallCap = (i, v) => setWall((prev) => prev.map((w, j) => j === i ? { ...w, caption: v.slice(0, BS_CAPTION_MAX) } : w));
  const removeWall = (i) => setWall((prev) => prev.filter((_, j) => j !== i));
  const addShelfRow = () => setShelf((prev) => prev.length >= BS_SHELF_MAX ? prev : [...prev, { title: '', when: '' }]);
  const setShelfField = (i, k, v) => setShelf((prev) => prev.map((s, j) => j === i ? { ...s, [k]: v.slice(0, k === 'title' ? BS_SHELF_TITLE_MAX : BS_SHELF_WHEN_MAX) } : s));
  const removeShelf = (i) => setShelf((prev) => prev.filter((_, j) => j !== i));
  // ── Profile-wave state (film · P4 business card · P5 wins wall). ──
  // Each role's intro film lives in its OWN doc key so they coexist: coach P1 → `film`
  // (coach-media), member M5 → `filmMember` (member-films). The customizer reads/writes
  // only this role's key; the other role's film key rides through the save untouched.
  const filmKey = coach ? 'film' : 'filmMember';
  const filmRoleBucket = coach ? 'coach-media' : 'member-films';
  const [film, setFilm] = useState((init[filmKey] && init[filmKey].url) ? { url: init[filmKey].url, caption: (init[filmKey].caption || '') } : null);
  const [filmBusy, setFilmBusy] = useState(false);
  const filmRef = useRef(null);
  const onFilmFile = async (e) => {
    const file = e?.target?.files?.[0]; if (e?.target) e.target.value = '';
    if (!file) return;
    // Reject non-video BEFORE upload — the film gate (bsOwnVideoUrl) accepts only
    // mp4/mov/webm/m4v, so anything else would upload then be dropped at save.
    // Accept a video MIME OR a video filename extension — some Capacitor/browser
    // pickers return a valid video File with an EMPTY type, and uploadCoachMedia
    // already handles the blank-MIME .mp4/.mov/.webm/.m4v case via the filename ext.
    const nameExt = (file.name || '').split('.').pop().toLowerCase();
    if (!(/^video\/(mp4|quicktime|webm|x-m4v|m4v)$/i.test(file.type || '') || (!file.type && ['mp4', 'mov', 'webm', 'm4v'].includes(nameExt)))) { window.__bsToast?.(tr('profile:editor.err.videoType', { defaultValue: 'Pick an MP4, MOV or WebM video.' }), 'err'); return; }
    // Coaches film to coach-media (200 MB); members to the dedicated member-films bucket (60 MB).
    const maxMb = coach ? 200 : 60;
    if (file.size > maxMb * 1024 * 1024) { window.__bsToast?.(tr('profile:editor.err.videoSize', { mb: maxMb, defaultValue: 'That video is too large — keep it under {mb} MB.' }), 'err'); return; }
    setFilmBusy(true);
    const uploader = coach ? window.ShapeCoachMedia : window.ShapeMemberFilm;
    try { const up = await uploader?.upload?.(file); if (up && up.url) setFilm((prev) => ({ url: up.url, caption: (prev && prev.caption) || '' })); else throw new Error(tr('profile:editor.err.uploadFailed', { defaultValue: 'Upload failed.' })); }
    catch (err) { window.__bsToast?.(err?.message || tr('profile:editor.err.film', { defaultValue: 'Could not upload film.' }), 'err'); }
    finally { setFilmBusy(false); }
  };
  const [biz, setBiz] = useState({ name: (init.bizCard && init.bizCard.name) || '', where: (init.bizCard && init.bizCard.where) || '', hours: (init.bizCard && init.bizCard.hours) || '', handle: (init.bizCard && init.bizCard.handle) || '' });
  const [pins, setPins] = useState(Array.isArray(init.pinnedReviews) ? init.pinnedReviews.slice(0, BS_PINNED_REVIEWS_MAX) : []);
  const togglePin = (id) => setPins((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : (prev.length >= BS_PINNED_REVIEWS_MAX ? prev : [...prev, id]));
  // Pin candidates: the coach's OWN reviews by owner_id (the trigger-stamped column),
  // NOT a display-name slug — a name mismatch would otherwise hide pinnable reviews.
  // Filtered to a MEMBER's review (authorId !== ownerId), so a self-authored row can't be pinned.
  const [pickReviews, setPickReviews] = useState([]);
  useEffect(() => {
    // The owner list is a capped latest-200 page; a review already pinned but aged past
    // it still renders on the wall (by-id resolver) yet would vanish from the picker,
    // leaving no way to UNPIN it. UNION the ≤3 saved pins (resolved by id) into the
    // candidates so every currently-pinned review always has a removal control.
    let on = true;
    setPickReviews([]);   // drop the prior coach's candidates before (re)loading — a stale
    if (!coach || !ownerUid) return () => { on = false; };  // set could be shown/pinned for the wrong coach
    const savedIds = Array.isArray(init.pinnedReviews) ? init.pinnedReviews.slice(0, BS_PINNED_REVIEWS_MAX) : [];
    const keep = (list) => (Array.isArray(list) ? list.filter((r) => r && r.ownerId === ownerUid && r.authorId !== r.ownerId) : []);
    Promise.all([
      // Through the native-safe client (apiBaseUrl + Bearer); `/api/...` reached nothing on native.
      window.ShapeCoachReviews ? window.ShapeCoachReviews.forOwner(ownerUid).catch(() => null) : Promise.resolve(null),
      savedIds.length && window.ShapeCoachReviews ? window.ShapeCoachReviews.byIds(savedIds.join(',')).catch(() => null) : Promise.resolve(null),
    ]).then(([ownerJ, idsJ]) => {
      if (!on) return;
      const owned = keep(ownerJ && ownerJ.reviews);
      const seen = new Set(owned.map((r) => r.id));
      const extraPins = keep(idsJ && idsJ.reviews).filter((r) => !seen.has(r.id));
      const merged = owned.concat(extraPins);
      setPickReviews(merged);
      // On a FULLY successful load, reconcile pins to what actually resolves — drop a
      // deleted/unresolvable saved pin so its dead id can't hold a slot and block the
      // coach from pinning a replacement (togglePin counts it toward the max otherwise).
      // Guarded so a transient fetch failure can't wipe live pins.
      if (ownerJ != null && (savedIds.length === 0 || idsJ != null)) {
        const live = new Set(merged.map((r) => r.id));
        setPins((prev) => prev.filter((id) => live.has(id)));
      }
    });
    return () => { on = false; };
  }, [coach, ownerUid]);
  const startState = bsStartLineState(startDate, new Date());
  const embedPreview = bsSpotifyEmbed(songUrl);
  // What this editor writes: the parts it SHOWS for this role, as the doc keeps them. Every other key
  // (the other role's parts, a `look` nobody changed here, the old `accent` hex, `climbBg`, anything a
  // later editor adds) is left as the doc has it when Save reads it.
  const shownFields = () => ({
    bio: bio.trim(),
    song: songUrl.trim() ? { url: songUrl.trim(), label: songLabel.trim() } : null,
    links: Object.fromEntries(BS_PROFILE_LINKS.map((l) => [l.key, String(links[l.key] || '').trim()]).filter(([, v]) => v)),
    cover: coverUrl.trim() ? { image: coverUrl.trim() } : null,
    pinned: pinTitle.trim() ? { kind: bsPinKindToken(pinKind), title: pinTitle.trim(), note: pinNote.trim(), metric: pinMetric.trim() } : null,
    heroStats: heroStats.slice(0, 3),
    // This role's intro film → its own key (coach `film`, member `filmMember`); the other
    // role's film key is left as the doc has it, so they coexist.
    [filmKey]: (film && film.url) ? { url: film.url, caption: (film.caption || '').trim() } : null,
    // A coach's page: the line, the prompts, the business card (P4) and the pinned reviews (P5).
    // The member profile shows no prompts and no longer asks for a line (owner, 2026-11-04:
    // "Remove the field"); a member's saved ones stay as they are.
    ...(coach ? {
      line,
      prompts: prompts.filter((p) => p && p.q && String(p.a).trim()).map((p) => ({ q: bsPromptToken(p.q), a: String(p.a).trim() })).slice(0, 4),
      bizCard: biz.name.trim() ? { name: biz.name.trim(), where: biz.where.trim(), hours: biz.hours.trim(), handle: biz.handle.trim() } : null,
      pinnedReviews: pins,
    } : {
      // A member's page (M1–M4): the wall, the shelf and the countdown. The normalizer below
      // cleans and caps these and DROPS them when empty.
      wall,
      shelf,
      startLine: (startTitle.trim() || startDate.trim()) ? { title: startTitle.trim(), date: startDate.trim() } : null,
    }),
  });
  const save = async () => {
    if (busy) return;
    // A real signed-in owner is REQUIRED before we normalize: bsProfileWall drops
    // every wall entry when ownerUid is empty, so persisting with no uid would
    // SILENTLY erase the member's wall. Surface save failures instead of
    // swallowing them, and only close (onSave) once the write actually lands.
    const uid = window.ShapeAuth?.getCachedState?.()?.user?.id;
    if (!uid) { window.__bsToast?.(tr('profile:editor.err.signIn', { defaultValue: 'Sign in to save your profile.' }), 'err'); return; }
    // A wall/cover/film upload still in flight would be omitted from the saved doc
    // AND left orphaned in storage (onSave closes the editor before it lands) — wait.
    if (wallBusy || coverBusy || filmBusy) { window.__bsToast?.(tr('profile:editor.err.uploadBusy', { defaultValue: 'Hang on — an upload is still in progress.' }), 'err'); return; }
    setBusy(true);
    // Merge onto the doc as saved NOW, not the copy this opened with, so a key written elsewhere
    // since (a `look` from Make it yours, Nora's account setup) is kept — as Make it yours saves. Both
    // calls are bound to this account, and a read that fails (or answers for another account) stops
    // the save: the doc as it was when this opened would undo a change made since.
    let base = null;
    try { base = await window.shapeDb?.getUserGoals?.('profile_custom', { expectedUserId: uid }); } catch (e) { base = null; }
    if (!base || typeof base !== 'object' || Array.isArray(base)) {
      setBusy(false);
      window.__bsToast?.(tr('profile:editor.err.save', { defaultValue: 'Could not save — try again.' }), 'err');
      return;
    }
    const doc = { ...base, ...shownFields() };
    // The colours only when they were picked here, over whatever else the doc's look holds.
    if (lookChanged) doc.look = { ...(bsProfileLook(base.look) || {}), paper: look.paper, accent: look.accent };
    // Normalize only THIS role's film key against its bucket; the other role's film key
    // isn't named here, so it passes through byte-identical.
    const clean = bsNormalizeProfileCustom(doc, uid, { filmBucket: filmRoleBucket, filmKey });
    let res;
    try { res = await window.shapeDb?.saveUserGoals?.('profile_custom', clean, { expectedUserId: uid }); }
    catch (e) { res = { error: e }; }
    setBusy(false);
    // saveUserGoals RESOLVES { ok } | { error } (never throws on an RLS/no-backend
    // failure), so the old empty catch could never see a failed write. Keep the
    // sheet open + toast on any non-ok result rather than faking success.
    if (!res || res.error) { window.__bsToast?.((res && res.error && res.error.message) || tr('profile:editor.err.save', { defaultValue: 'Could not save — try again.' }), 'err'); return; }
    onSave(clean);
  };
  const saving = busy || wallBusy || coverBusy || filmBusy;

  // ── The look ──
  // A card: the paper's own colour (its raised tone on a dark paper, where a shadow cannot show), a
  // hairline and a soft lift. Never tinted.
  const cardBg = light ? PAPER : PAPER2;
  const lift = light
    ? `0 1px 2px ${ink(0.05)}, 0 16px 34px -24px ${ink(0.34)}`
    : 'inset 0 1px 0 rgba(255,255,255,0.04), 0 18px 38px -26px rgba(0,0,0,0.9)';
  const cardS = { background: cardBg, borderRadius: 24, border: `1px solid ${ink(light ? 0.07 : 0.08)}`, boxShadow: lift, padding: '22px 16px 24px', marginBottom: 18, boxSizing: 'border-box', minWidth: 0 };
  const cardTitleS = { margin: '0 0 20px', fontFamily: BS_CLEAN_HEAD, fontSize: 19, fontWeight: 700, letterSpacing: '-0.015em', lineHeight: 1.2, color: INK };
  const labelS = { fontFamily: BS_CLEAN_SANS, fontSize: 15, fontWeight: 650, lineHeight: 1.3, color: INK };
  // Quiet words at 60% of the ink: 4.5:1 and up on every paper at 13px.
  const hintS = { fontFamily: BS_CLEAN_SANS, fontSize: 13, fontWeight: 500, lineHeight: 1.3, color: ink(0.6) };
  const noteS = { margin: '8px 0 0', fontFamily: BS_CLEAN_SANS, fontSize: 13, fontWeight: 500, lineHeight: 1.45, color: ink(0.6) };
  // Fields: rounded, a whisper of the ink as their ground, 16px words (iOS zooms a smaller field).
  const field = { width: '100%', boxSizing: 'border-box', minHeight: 48, padding: '12px 14px', borderRadius: 16, border: `1px solid ${ink(light ? 0.14 : 0.16)}`, background: ink(light ? 0.025 : 0.045), color: INK, fontFamily: BS_CLEAN_SANS, fontSize: 16, lineHeight: 1.35, outline: 'none', WebkitAppearance: 'none', appearance: 'none' };
  const stack = (gap) => ({ display: 'flex', flexDirection: 'column', gap });
  // A quiet action: words on a whisper of the ink, a pill.
  const ghost = { minHeight: 44, padding: '0 16px', borderRadius: 999, border: 0, background: ink(light ? 0.055 : 0.08), color: INK, cursor: 'pointer', fontFamily: BS_CLEAN_SANS, fontSize: 15, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'flex-start' };
  // A chip: chosen is outlined in the ink over a whisper of it, with a tick; else a hairline pill.
  const chipOn = ink(light ? 0.07 : 0.1);
  const chip = (on) => ({ minHeight: 44, padding: on ? '0 15px 0 13px' : '0 16px', borderRadius: 999, cursor: 'pointer', border: on ? `1.5px solid ${INK}` : `1px solid ${ink(0.16)}`, background: on ? chipOn : 'transparent', color: on ? INK : ink(0.74), fontFamily: BS_CLEAN_SANS, fontSize: 15, fontWeight: on ? 650 : 550, display: 'inline-flex', alignItems: 'center', gap: 6, boxSizing: 'border-box' });
  // The round × on a row, a full 44px key.
  const xKey = { width: 44, height: 44, flex: 'none', padding: 0, border: 0, borderRadius: 999, background: 'transparent', color: ink(0.6), cursor: 'pointer', display: 'grid', placeItems: 'center' };
  // An empty slot to fill: a dashed outline and a plus, nothing tinted.
  const slot = { borderRadius: 18, border: `1.5px dashed ${ink(light ? 0.22 : 0.26)}`, background: 'transparent', color: ink(0.78), cursor: 'pointer', fontFamily: BS_CLEAN_SANS, fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxSizing: 'border-box' };
  const plusDot = <span aria-hidden="true" style={{ width: 36, height: 36, flex: 'none', borderRadius: 999, background: ink(light ? 0.06 : 0.09), color: INK, display: 'grid', placeItems: 'center' }}><BSMpIcon name="plus" size={17} stroke={2.2} /></span>;
  const enter = (i) => (motion ? { className: 'bs-cust-in', style: { animationDelay: `${40 + i * 45}ms` } } : { className: undefined, style: null });

  // A part's head: its name as the field's label, its hint beside it (wrapping under it when narrow).
  const head = (text, htmlFor) => {
    const [main, hint] = splitHead(text);
    return (
      <div data-cust-head="" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 12, rowGap: 2, marginBottom: 10 }}>
        {htmlFor ? <label htmlFor={htmlFor} style={labelS}>{main}</label> : <span style={labelS}>{main}</span>}
        {hint ? <span style={hintS}>{hint}</span> : null}
      </div>
    );
  };
  // A card of parts. The title is a heading, so a screen reader can step from card to card.
  let cardN = 0;
  const card = (id, title, body) => {
    const e = enter(cardN++);
    return (
      <section key={id} data-cust-card={id} aria-labelledby={`bs-cust-card-${id}`} className={e.className} style={{ ...cardS, ...(e.style || null) }}>
        <h2 id={`bs-cust-card-${id}`} style={cardTitleS}>{title}</h2>
        <div style={stack(28)}>{body}</div>
      </section>
    );
  };

  // ── The live preview: the profile's head as it will read ──
  const name = (who && who.name) || (W.bsMyName ? W.bsMyName() : '') || '';
  const handle = (who && who.handle) || '';
  const photo = validPhoto((who && who.photo) || (W.bsMyPhoto ? W.bsMyPhoto() : null));
  const initials = (W.bsInitials ? W.bsInitials(name) : fallbackInitials(name)) || (W.bsMyInitials ? W.bsMyInitials() : '') || '•';
  const startTitleNow = startTitle.trim();
  let startWhen = '';
  if (startState) {
    const v = bsValidStartDate(startDate);
    try { startWhen = new Date(v.y, v.m - 1, v.d, 12).toLocaleDateString((W.bsDateLocale && W.bsDateLocale()) || undefined, { month: 'short', day: 'numeric' }); } catch (e) { startWhen = ''; }
  }
  const startDays = startState ? (startState.days === 0 ? tr('profile:startLine.today', { defaultValue: 'Today' }) : tr('profile:startLine.daysOut', { defaultValue: '{count, plural, one {# day out} other {# days out}}', count: startState.days })) : '';
  // The line is a coach's only now (a member's editor no longer asks for it), so only a coach's preview shows it.
  const lineNow = coach ? line.trim() : '';
  const bioNow = bio.trim();
  const bizNow = coach ? biz.name.trim() : '';
  const previewEmpty = !lineNow && !bioNow && !(startTitleNow || startState) && !bizNow;
  const avatar = !coach && FacetAvatar
    ? <FacetAvatar size={58} c={c} initial={initials} name={name} photo={photo} showRank={false} BG={cardBg} INK={INK} />
    : (
      <span data-cust-round-avatar="" aria-hidden="true" style={{ width: 60, height: 60, flex: 'none', borderRadius: 999, overflow: 'hidden', display: 'grid', placeItems: 'center', background: tTheme.PAPER3 || ink(0.08), boxShadow: `0 0 0 3px ${cardBg}, 0 0 0 4px ${ink(0.14)}` }}>
        {photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 25%' }} /> : <span style={{ fontFamily: BS_CLEAN_HEAD, fontSize: 21, fontWeight: 700, color: ink(0.8) }}>{initials}</span>}
      </span>
    );
  const pe = enter(0);
  cardN = 1;
  const preview = (
    <section data-cust-preview="" aria-label={tr('profile:editor.preview.label', { defaultValue: 'Live preview' })} className={pe.className}
      style={{ ...cardS, ...(pe.style || null), padding: 0, overflow: 'hidden' }}>
      {coverUrl ? (
        <div aria-hidden="true" style={{ height: 92, background: `#111 center/cover no-repeat url("${coverUrl}")` }} />
      ) : null}
      <div style={{ padding: '18px 16px 18px' }}>
        <div style={{ ...hintS, fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}>{tr('profile:editor.preview.label', { defaultValue: 'Live preview' })}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <span style={{ flex: 'none', display: 'grid', placeItems: 'center', width: 62, height: 62 }}>{avatar}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div data-cust-preview-name="" style={{ fontFamily: BS_CLEAN_HEAD, fontSize: 21, fontWeight: 700, letterSpacing: '-0.015em', lineHeight: 1.15, color: INK, overflowWrap: 'anywhere' }}>{name || initials}</div>
            {handle || bizNow ? <div style={{ marginTop: 2, fontFamily: BS_CLEAN_SANS, fontSize: 14, color: ink(0.6), overflowWrap: 'anywhere' }}>{[handle, bizNow].filter(Boolean).join(' · ')}</div> : null}
          </div>
        </div>
        {!coach && (startTitleNow || startState) ? (
          <p data-cust-preview-start="" style={{ margin: '14px 0 0', fontFamily: BS_CLEAN_SANS, fontSize: 15, lineHeight: 1.4, color: INK, overflowWrap: 'anywhere' }}>
            <span style={{ fontWeight: 650 }}>{tr('profile:startLine.trainingFor', { defaultValue: 'Training for' })}</span>
            {startTitleNow ? ` ${startTitleNow}` : ''}
            {startState ? <span style={{ display: 'block', marginTop: 2, fontSize: 13.5, color: ink(0.6), fontVariantNumeric: 'tabular-nums' }}>{[startWhen, startDays].filter(Boolean).join(' · ')}</span> : null}
          </p>
        ) : null}
        {lineNow ? <p data-cust-preview-line="" style={{ margin: '12px 0 0', fontFamily: BS_CLEAN_HEAD, fontSize: 16, fontWeight: 600, lineHeight: 1.35, color: INK, overflowWrap: 'anywhere' }}>“{lineNow}”</p> : null}
        {bioNow ? <p data-cust-preview-bio="" style={{ margin: '10px 0 0', fontFamily: BS_CLEAN_SANS, fontSize: 14.5, lineHeight: 1.5, color: ink(0.78), whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{bioNow}</p> : null}
        {previewEmpty ? <p style={{ ...noteS, marginTop: 14, fontSize: 14 }}>{tr('profile:editor.preview.empty', { defaultValue: 'Fill in the parts below. Your profile takes shape here as you type.' })}</p> : null}
        {/* Identity fields (name · @handle · photo · pronouns · goal · link) live in the
            Settings editor — the door sits under the preview of them, so this page stays
            the one hub for everything the public profile shows. */}
        <button type="button" data-cust-identity="" className="bs-cust-btn bs-cust-press" onClick={() => { onClose(); try { window.dispatchEvent(new Event('shape:openProfile')); } catch (e) {} }}
          style={{ width: '100%', minHeight: 56, marginTop: 16, padding: '10px 6px 10px 14px', borderRadius: 16, border: 0, background: ink(light ? 0.04 : 0.06), color: INK, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontFamily: BS_CLEAN_SANS, fontSize: 15, fontWeight: 650, color: INK }}>{tr('profile:editor.identity.title', { defaultValue: 'Name, @handle, photo & details' })}</span>
            <span style={{ display: 'block', marginTop: 2, fontFamily: BS_CLEAN_SANS, fontSize: 13, color: ink(0.62) }}>{tr('profile:editor.identity.sub', { defaultValue: 'Pronouns · goal · link — edit in Settings' })}</span>
          </span>
          <span aria-hidden="true" style={{ width: 32, height: 32, flex: 'none', display: 'grid', placeItems: 'center', color: ink(0.55) }}><BSMpIcon name="chevron" size={18} stroke={2.2} /></span>
        </button>
      </div>
    </section>
  );

  // ── The parts ──
  const bioPart = (
    <div key="bio">
      {head(tr('profile:editor.bio.label', { defaultValue: 'Bio' }), 'bs-cust-bio')}
      <textarea id="bs-cust-bio" data-cust-field="bio" className="bs-cust-field" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={280} placeholder={tr('profile:editor.ph.bio', { defaultValue: 'A line about you, your training, your why…' })} style={{ ...field, resize: 'vertical', minHeight: 96, lineHeight: 1.5 }} />
    </div>
  );
  // A coach's line (the member editor no longer asks for one: owner, 2026-11-04, "Remove the field").
  const linePart = (
    <div key="line">
      {head(tr('profile:editor.line.label', { defaultValue: 'Your line · one motto' }), 'bs-cust-line')}
      <input id="bs-cust-line" data-cust-field="line" className="bs-cust-field" value={line} onChange={(e) => setLine(e.target.value.slice(0, BS_LINE_MAX))} maxLength={BS_LINE_MAX}
        placeholder={tr('profile:editor.ph.lineCoach', { defaultValue: 'A line you coach by — e.g. Strong is a skill.' })} style={field} />
    </div>
  );
  // M2 · The Start line
  const startDatePh = tr('profile:editor.ph.startDate', { defaultValue: 'Date · YYYY-MM-DD' });
  const startPart = (
    <div key="start">
      {head(tr('profile:editor.start.label', { defaultValue: 'Training for · a countdown' }), 'bs-cust-start')}
      <div style={stack(10)}>
        <input id="bs-cust-start" data-cust-field="startTitle" className="bs-cust-field" value={startTitle} onChange={(e) => setStartTitle(e.target.value.slice(0, BS_START_TITLE_MAX))} maxLength={BS_START_TITLE_MAX} placeholder={tr('profile:editor.ph.startTitle', { defaultValue: "What you're training for — e.g. My first marathon" })} style={field} />
        <input data-cust-field="startDate" className="bs-cust-field" value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder={startDatePh} aria-label={startDatePh} autoComplete="off" style={{ ...field, fontVariantNumeric: 'tabular-nums' }} />
      </div>
      {startDate.trim() && !startState ? <p role="alert" style={{ ...noteS, color: ERR, fontWeight: 600 }}>{bsValidStartDate(startDate) ? tr('profile:editor.start.errPast', { defaultValue: 'That date has passed — clear or update it.' }) : tr('profile:editor.start.errFormat', { defaultValue: 'Enter a real date as YYYY-MM-DD.' })}</p> : null}
      {startState ? <p style={noteS}>{startState.days === 0 ? tr('profile:editor.start.showsToday', { defaultValue: 'Shows: TODAY' }) : tr('profile:editor.start.shows', { count: startState.days, defaultValue: '{count, plural, one {Shows: # day out} other {Shows: # days out}}' })}</p> : null}
      {(startTitle.trim() || startDate.trim()) ? <button type="button" className="bs-cust-btn bs-cust-press" onClick={() => { setStartTitle(''); setStartDate(''); }} style={{ ...ghost, marginTop: 12 }}>{tr('profile:editor.start.clear', { defaultValue: 'Clear start line' })}</button> : null}
    </div>
  );
  // M1 · The Wall: the photos as rounded tiles, each caption written on its photo as the profile shows it.
  const wallPart = (
    <div key="wall">
      {head(tr('profile:editor.wall.label', { count: BS_WALL_MAX, defaultValue: 'The wall · pinned photos · up to {count}' }))}
      <input ref={wallRef} type="file" accept="image/*" onChange={onWallFile} style={{ display: 'none' }} />
      <div data-cust-wall="" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        {wall.map((w, i) => (
          <figure key={i} className={motion ? 'bs-cust-photo' : undefined} style={{ position: 'relative', margin: 0, aspectRatio: '1 / 1', minHeight: 120, borderRadius: 18, overflow: 'hidden', background: ink(0.06), boxShadow: light ? `0 10px 22px -14px ${ink(0.45)}` : '0 12px 24px -14px rgba(0,0,0,0.9)' }}>
            <img src={w.url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            <button type="button" className="bs-cust-btn" onClick={() => removeWall(i)} aria-label={tr('profile:editor.wall.removeAria', { defaultValue: 'Remove photo' })}
              style={{ position: 'absolute', top: 0, right: 0, width: 44, height: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
              <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 999, background: 'rgba(0,0,0,0.52)', color: '#ffffff', display: 'grid', placeItems: 'center' }}><BSMpIcon name="close" size={14} stroke={2.4} /></span>
            </button>
            <input className="bs-cust-cap" value={w.caption} onChange={(e) => setWallCap(i, e.target.value)} maxLength={BS_CAPTION_MAX}
              placeholder={tr('profile:editor.ph.caption', { defaultValue: 'Caption (optional)' })} aria-label={tr('profile:editor.wall.captionAria', { n: i + 1, defaultValue: 'Caption for photo {n}' })}
              style={{ position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', minHeight: 48, boxSizing: 'border-box', padding: '20px 12px 10px', border: 0, borderRadius: 0, outline: 'none', background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.66) 100%)', color: '#ffffff', fontFamily: BS_CLEAN_SANS, fontSize: 16, fontWeight: 600, textShadow: '0 1px 2px rgba(0,0,0,0.4)' }} />
          </figure>
        ))}
        {wall.length < BS_WALL_MAX ? (
          <button type="button" className="bs-cust-btn bs-cust-press" onClick={() => !wallBusy && wallRef.current && wallRef.current.click()} disabled={wallBusy}
            style={{ ...slot, cursor: wallBusy ? 'wait' : 'pointer', ...(wall.length ? { aspectRatio: '1 / 1', minHeight: 120, flexDirection: 'column' } : { gridColumn: '1 / -1', minHeight: 88 }) }}>
            {plusDot}
            <span>{wallBusy ? tr('profile:log.uploading', { defaultValue: 'Uploading…' }) : noPlus(tr('profile:editor.wall.add', { defaultValue: '+ Add photo' }))}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
  // M3 · The Shelf
  const shelfPart = (
    <div key="shelf">
      {head(tr('profile:editor.shelf.label', { count: BS_SHELF_MAX, defaultValue: 'The shelf · proudest · up to {count}' }))}
      {shelf.length ? (
        <div style={stack(18)}>
          {shelf.map((s, i) => (
            <div key={i} data-cust-shelf-row="" style={stack(8)}>
              <input className="bs-cust-field" value={s.title} onChange={(e) => setShelfField(i, 'title', e.target.value)} maxLength={BS_SHELF_TITLE_MAX} placeholder={tr('profile:editor.ph.shelfTitle', { defaultValue: 'e.g. Deadlift 140kg' })} style={field} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input className="bs-cust-field" value={s.when} onChange={(e) => setShelfField(i, 'when', e.target.value)} maxLength={BS_SHELF_WHEN_MAX} placeholder={tr('profile:editor.ph.shelfWhen', { defaultValue: 'When' })} style={{ ...field, flex: 1, minWidth: 0 }} />
                <button type="button" className="bs-cust-btn" onClick={() => removeShelf(i)} aria-label={tr('profile:editor.shelf.removeAria', { defaultValue: 'Remove row' })} style={xKey}><BSMpIcon name="close" size={17} stroke={2.2} /></button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {shelf.length < BS_SHELF_MAX ? <button type="button" className="bs-cust-btn bs-cust-press" onClick={addShelfRow} style={{ ...ghost, marginTop: shelf.length ? 14 : 0 }}><BSMpIcon name="plus" size={16} stroke={2.3} />{noPlus(tr('profile:editor.shelf.add', { defaultValue: '+ Add row' }))}</button> : null}
    </div>
  );
  // The intro film — shared by the coach (P1 → coach-media) and member (M5 → member-films);
  // onFilmFile + save route the bucket by role.
  const filmPart = (
    <div key="film">
      {head(tr('profile:editor.film.label', { defaultValue: 'Intro film · a short video' }))}
      <input ref={filmRef} type="file" accept="video/*" onChange={onFilmFile} style={{ display: 'none' }} />
      {film && film.url ? (
        <div style={stack(10)}>
          <div style={{ borderRadius: 18, overflow: 'hidden', background: '#000', boxShadow: light ? `0 10px 22px -14px ${ink(0.45)}` : 'none' }}>
            <video src={film.url} controls playsInline preload="metadata" style={{ display: 'block', width: '100%', maxHeight: 220, background: '#000' }} />
          </div>
          <input className="bs-cust-field" value={film.caption} onChange={(e) => setFilm((prev) => ({ ...prev, caption: e.target.value.slice(0, BS_FILM_CAPTION_MAX) }))} maxLength={BS_FILM_CAPTION_MAX} placeholder={tr('profile:editor.ph.caption', { defaultValue: 'Caption (optional)' })} style={field} />
          <button type="button" className="bs-cust-btn bs-cust-press" onClick={() => setFilm(null)} style={ghost}>{tr('profile:editor.film.remove', { defaultValue: 'Remove film' })}</button>
        </div>
      ) : (
        <button type="button" className="bs-cust-btn bs-cust-press" onClick={() => !filmBusy && filmRef.current && filmRef.current.click()} disabled={filmBusy} style={{ ...slot, width: '100%', minHeight: 72, padding: '0 14px', cursor: filmBusy ? 'wait' : 'pointer' }}>
          {plusDot}
          <span>{filmBusy ? tr('profile:log.uploading', { defaultValue: 'Uploading…' }) : noPlus(tr('profile:editor.film.add', { defaultValue: '+ Add intro film' }))}</span>
        </button>
      )}
      <p style={noteS}>{tr('profile:editor.film.hint', { defaultValue: '30–60 seconds · MP4, MOV or WebM' })}</p>
    </div>
  );
  // The cover: the photo itself, the two actions on it as solid pills; empty, a dashed slot.
  const coverPill = { minHeight: 44, padding: '0 18px', borderRadius: 999, border: 0, background: PAPER, color: INK, fontFamily: BS_CLEAN_SANS, fontSize: 15, fontWeight: 650, display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 6px 16px -8px rgba(0,0,0,0.55)' };
  const coverPart = (
    <div key="cover">
      {head(tr('profile:editor.cover.label', { defaultValue: 'Cover image' }))}
      <div data-cust-cover="" style={{ position: 'relative', height: coverUrl ? 140 : 88, borderRadius: 18, overflow: 'hidden', boxSizing: 'border-box', background: coverUrl ? '#111' : 'transparent', border: coverUrl ? 0 : `1.5px dashed ${ink(light ? 0.22 : 0.26)}`, boxShadow: coverUrl && light ? `0 10px 22px -14px ${ink(0.45)}` : 'none' }}>
        {coverUrl && <img src={coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
        <input ref={coverRef} type="file" accept="image/*" onChange={onCoverFile} style={{ display: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 10 }}>
          <button type="button" className="bs-cust-btn bs-cust-press" onClick={() => !coverBusy && coverRef.current && coverRef.current.click()} disabled={coverBusy} style={{ ...coverPill, cursor: coverBusy ? 'wait' : 'pointer', ...(coverUrl ? null : { background: ink(light ? 0.06 : 0.09), boxShadow: 'none' }) }}>{coverBusy ? tr('profile:log.uploading', { defaultValue: 'Uploading…' }) : coverUrl ? tr('profile:editor.cover.replace', { defaultValue: 'Replace' }) : tr('profile:editor.cover.upload', { defaultValue: 'Upload cover' })}</button>
          {coverUrl && <button type="button" className="bs-cust-btn bs-cust-press" onClick={() => setCoverUrl('')} style={{ ...coverPill, cursor: 'pointer' }}>{tr('profile:action.remove', { defaultValue: 'Remove' })}</button>}
        </div>
      </div>
    </div>
  );
  // The colours: the shared look panel (BSLookPicker, Make it yours' Colors page): a Shape look, a
  // paper and an accent. It draws its own chrome, so it sits in the card as it is, reaching 12px into
  // the card's padding so its grids keep their gaps (its lamps measure 42px wide on a 280px-wide
  // surface; the panel's own five-a-row grid is what sets that).
  const lookPart = (
    <div key="look" data-cust-look="">
      {head(tr('profile:mine.tabColors', { defaultValue: 'Colors' }))}
      <div style={{ margin: '0 -12px' }}>
        <BSLookPicker tr={tr} look={look} setLook={setLook} />
      </div>
    </div>
  );
  const statsPart = (
    <div key="stats">
      {head(tr('profile:editor.stats.label', { count: 3, defaultValue: 'Headline stats · pick up to {count}' }))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {BS_STAT_OPTIONS.map((s) => { const on = heroStats.includes(s.key); return (
          <button key={s.key} type="button" className="bs-cust-btn bs-cust-press" aria-pressed={on} onClick={() => toggleStat(s.key)} style={chip(on)}>{on ? <BSMpIcon name="check" size={15} stroke={2.6} /> : null}{bsOptLabel(s, tr)}</button>
        ); })}
      </div>
    </div>
  );
  const pinPart = (
    <div key="pin">
      {head(tr('profile:editor.pin.label', { defaultValue: 'Pin a highlight' }))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {BS_PIN_KINDS.map((k) => (
          <button key={k.id} type="button" className="bs-cust-btn bs-cust-press" onClick={() => setPinKind(k.id)} aria-pressed={bsPinKindToken(pinKind) === k.id} style={chip(bsPinKindToken(pinKind) === k.id)}>{bsPinKindLabel(k.id, tr)}</button>
        ))}
      </div>
      <div style={stack(10)}>
        <input className="bs-cust-field" value={pinTitle} onChange={(e) => setPinTitle(e.target.value)} maxLength={80} placeholder={tr('profile:editor.ph.pinTitle', { defaultValue: 'Headline — e.g. Pulled 2× bodyweight today' })} style={field} />
        <input className="bs-cust-field" value={pinNote} onChange={(e) => setPinNote(e.target.value)} maxLength={160} placeholder={tr('profile:editor.ph.pinNote', { defaultValue: 'A line of context (optional)' })} style={field} />
        <input className="bs-cust-field" value={pinMetric} onChange={(e) => setPinMetric(e.target.value)} maxLength={24} placeholder={tr('profile:editor.ph.pinMetric', { defaultValue: 'Metric (optional) — e.g. 2×BW' })} style={field} />
      </div>
      {pinTitle.trim() ? <button type="button" className="bs-cust-btn bs-cust-press" onClick={() => { setPinTitle(''); setPinNote(''); setPinMetric(''); }} style={{ ...ghost, marginTop: 12 }}>{tr('profile:editor.pin.clear', { defaultValue: 'Clear pin' })}</button> : null}
    </div>
  );
  const songPart = (
    <div key="song">
      {head(tr('profile:editor.song.label', { defaultValue: 'Profile song · Spotify link' }))}
      <div style={stack(10)}>
        {/* The URL example is deliberately NOT keyed — it is a literal address,
            byte-identical in every locale, so a key would ship thirteen copies of
            one string a translator must not touch (the "Shape Score" exemption).
            The HANDLE and DOMAIN examples below ARE keyed: those are the
            +1 555 123 4567 class, where a locale's own form reads better. */}
        <input className="bs-cust-field" value={songUrl} onChange={(e) => setSongUrl(e.target.value)} placeholder="https://open.spotify.com/track/…" inputMode="url" autoCapitalize="none" style={field} />
        <input className="bs-cust-field" value={songLabel} onChange={(e) => setSongLabel(e.target.value)} placeholder={tr('profile:editor.ph.songLabel', { defaultValue: 'Label (optional) — e.g. Lift anthem' })} style={field} />
      </div>
      {songUrl.trim() && !embedPreview ? <p role="alert" style={{ ...noteS, color: ERR, fontWeight: 600 }}>{tr('profile:editor.song.err', { defaultValue: 'Paste a Spotify track or playlist link (open.spotify.com/…).' })}</p> : null}
      {embedPreview ? <div style={{ marginTop: 12, borderRadius: 14, overflow: 'hidden' }}><iframe title={tr('profile:editor.song.previewTitle', { defaultValue: 'Song preview' })} src={embedPreview} width="100%" height="80" frameBorder="0" allow="encrypted-media" style={{ display: 'block', border: 0 }} /></div> : null}
    </div>
  );
  // Prompts only for a coach's page: the member profile no longer shows them (owner, 2026-10-31),
  // so the member's editor doesn't ask; answers already saved are kept as they are on save.
  const promptsPart = coach ? (
    <div key="prompts">
      {head(tr('profile:editor.prompts.label', { defaultValue: 'Prompts' }))}
      <p style={{ ...noteS, margin: '-2px 0 12px' }}>{tr('profile:editor.prompts.hint', { defaultValue: 'Pick a question, write a short answer — they show on your profile so people get a feel for you.' })}</p>
      <div style={stack(18)}>
        {prompts.map((p, i) => (
          <div key={i} style={stack(8)}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                <select value={bsPromptToken(p.q)} onChange={(e) => setPrompt(i, 'q', e.target.value)} className="bs-cust-field" style={{ ...field, padding: '12px 40px 12px 14px', fontWeight: 600, cursor: 'pointer' }}>
                  {PROMPT_OPTS.map((q) => <option key={q.id} value={q.id} style={{ color: '#111', fontFamily: BS_CLEAN_SANS }}>{bsPromptLabel(q.id, tr)}</option>)}
                </select>
                <span aria-hidden="true" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%) rotate(90deg)', pointerEvents: 'none', color: ink(0.6) }}><BSMpIcon name="chevron" size={16} stroke={2.2} /></span>
              </div>
              <button type="button" className="bs-cust-btn" onClick={() => removePrompt(i)} aria-label={tr('profile:editor.prompts.removeAria', { defaultValue: 'Remove prompt' })} style={xKey}><BSMpIcon name="close" size={17} stroke={2.2} /></button>
            </div>
            <input className="bs-cust-field" value={p.a} onChange={(e) => setPrompt(i, 'a', e.target.value)} maxLength={120} placeholder={tr('profile:editor.ph.promptAnswer', { defaultValue: 'Your answer…' })} style={field} />
          </div>
        ))}
      </div>
      {prompts.length < 4 ? <button type="button" className="bs-cust-btn bs-cust-press" onClick={addPrompt} style={{ ...ghost, marginTop: prompts.length ? 14 : 0 }}><BSMpIcon name="plus" size={16} stroke={2.3} />{noPlus(tr('profile:editor.prompts.add', { defaultValue: '+ Add prompt' }))}</button> : null}
    </div>
  ) : null;
  // The links are their card's only part, so the card's title ("Social links") is their label.
  const linksTitle = tr('profile:editor.links.label', { defaultValue: 'Social links' });
  const linksPart = (
    <div key="links">
      <div style={stack(10)}>
        {BS_PROFILE_LINKS.map((l) => (
          <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label htmlFor={`bs-cust-link-${l.key}`} style={{ flex: '0 0 84px', minWidth: 0, fontFamily: BS_CLEAN_SANS, fontSize: 14, fontWeight: 600, color: ink(0.7), overflowWrap: 'anywhere' }}>{bsOptLabel(l, tr)}</label>
            <input id={`bs-cust-link-${l.key}`} className="bs-cust-field" value={links[l.key] || ''} onChange={(e) => setLinks((prev) => ({ ...prev, [l.key]: e.target.value }))} inputMode="url" autoCapitalize="none" placeholder={l.pre ? l.pre + tr('profile:editor.ph.linkHandle', { defaultValue: 'you' }) : tr('profile:editor.ph.linkSite', { defaultValue: 'yoursite.com' })} style={{ ...field, flex: 1, minWidth: 0 }} />
          </div>
        ))}
      </div>
    </div>
  );
  // The coach's business card (P4) and wins wall (P5).
  const bizPh = {
    name: tr('profile:editor.ph.bizName', { defaultValue: 'Business name — e.g. Iron Path Strength' }),
    where: tr('profile:editor.ph.bizWhere', { defaultValue: 'Where (optional) — e.g. Austin, TX · online' }),
    hours: tr('profile:editor.ph.bizHours', { defaultValue: 'Hours (optional) — e.g. Mon–Fri, mornings' }),
    handle: tr('profile:editor.ph.bizHandle', { defaultValue: 'Find me (optional) — e.g. @ironpath' }),
  };
  const bizPart = coach ? (
    <div key="biz">
      {head(tr('profile:editor.biz.label', { defaultValue: 'The practice · business card' }))}
      <div style={stack(10)}>
        <input className="bs-cust-field" value={biz.name} onChange={(e) => setBiz((p) => ({ ...p, name: e.target.value.slice(0, BS_BIZ_NAME_MAX) }))} maxLength={BS_BIZ_NAME_MAX} placeholder={bizPh.name} aria-label={bizPh.name} style={field} />
        <input className="bs-cust-field" value={biz.where} onChange={(e) => setBiz((p) => ({ ...p, where: e.target.value.slice(0, BS_BIZ_WHERE_MAX) }))} maxLength={BS_BIZ_WHERE_MAX} placeholder={bizPh.where} aria-label={bizPh.where} style={field} />
        <input className="bs-cust-field" value={biz.hours} onChange={(e) => setBiz((p) => ({ ...p, hours: e.target.value.slice(0, BS_BIZ_HOURS_MAX) }))} maxLength={BS_BIZ_HOURS_MAX} placeholder={bizPh.hours} aria-label={bizPh.hours} style={field} />
        <input className="bs-cust-field" value={biz.handle} onChange={(e) => setBiz((p) => ({ ...p, handle: e.target.value.slice(0, BS_BIZ_HANDLE_MAX) }))} maxLength={BS_BIZ_HANDLE_MAX} placeholder={bizPh.handle} aria-label={bizPh.handle} style={field} />
      </div>
    </div>
  ) : null;
  // P5 · The Wins wall picker — only the coach's OWN pinnable reviews
  const winsPart = coach ? (
    <div key="wins">
      {head(tr('profile:editor.pins.label', { count: BS_PINNED_REVIEWS_MAX, defaultValue: 'Wins wall · pin up to {count, plural, one {# review} other {# reviews}}' }))}
      {pickReviews && pickReviews.length ? (
        <div style={stack(10)}>
          {pickReviews.map((r) => { const on = pins.includes(r.id); return (
            <button key={r.id} type="button" className="bs-cust-btn bs-cust-press" aria-pressed={on} onClick={() => togglePin(r.id)} style={{ textAlign: 'left', cursor: 'pointer', borderRadius: 16, border: `1px solid ${on ? INK : ink(0.14)}`, background: on ? ink(light ? 0.05 : 0.08) : 'transparent', color: INK, padding: '12px 14px', minHeight: 44 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: BS_CLEAN_SANS, fontSize: 13, fontWeight: 650, color: on ? INK : ink(0.6) }}>{on ? <BSMpIcon name="check" size={14} stroke={2.6} /> : null}{on ? tr('profile:editor.pins.pinned', { defaultValue: '✓ Pinned' }).replace(/^✓\s*/, '') : tr('profile:editor.pins.tapToPin', { defaultValue: 'Tap to pin' })} · ★ {Math.round(r.rating || 0)}/10 · {r.author || tr('profile:role.member', { defaultValue: 'Member' })}</span>
              <span style={{ display: 'block', fontFamily: BS_CLEAN_SANS, fontSize: 14.5, lineHeight: 1.4, color: ink(0.84), marginTop: 5 }}>“{(r.text || '').slice(0, 120)}{(r.text || '').length > 120 ? '…' : ''}”</span>
            </button>
          ); })}
        </div>
      ) : (
        <p style={{ ...noteS, marginTop: 0, fontSize: 14 }}>{tr('profile:editor.pins.empty', { defaultValue: 'No reviews to pin yet — reviews members leave from now on can be pinned here.' })}</p>
      )}
    </div>
  ) : null;
  // What the Signal sigil rings mean — moved off the public profile to here (coach-only). It explains
  // the instrument on the coach's own profile; each ring's dot is the ring's own colour.
  const signalHead = splitHead(tr('profile:editor.signal.label', { defaultValue: 'Your Signal · what the rings mean' }));
  const signalCard = coach ? card('signal', signalHead[0], [
    <div key="signal">
      <p style={{ margin: 0, fontFamily: BS_CLEAN_SANS, fontSize: 14.5, color: ink(0.74), lineHeight: 1.55 }}>{tr('profile:editor.signal.bodyPre', { defaultValue: 'The instrument on your profile reads your coaching at a glance. The' })} <strong style={{ color: INK, fontWeight: 650 }}>{tr('profile:editor.signal.bodyAccent', { defaultValue: 'outer ring' })}</strong> {tr('profile:editor.signal.bodyPost', { defaultValue: 'is your progress to the next coach tier; the three inner rings each track a contribution and fill as you keep them up:' })}</p>
      <div style={{ ...stack(10), marginTop: 14 }}>
        {[
          ['habits', c, tr('profile:editor.signal.ring.habits', { defaultValue: 'Habits' }), tr('profile:editor.signal.ring.habitsDesc', { defaultValue: 'Your own daily habit consistency.' })],
          ['clientWorkouts', hexA(c, 0.7), tr('profile:editor.signal.ring.clientWorkouts', { defaultValue: 'Client workouts' }), tr('profile:editor.signal.ring.clientWorkoutsDesc', { defaultValue: 'Sessions your clients complete on the plans you set.' })],
          ['ownActivity', '#34d6c5', tr('profile:editor.signal.ring.ownActivity', { defaultValue: 'Own activity' }), tr('profile:editor.signal.ring.ownActivityDesc', { defaultValue: 'Your own logged training — you walk the walk.' })],
        ].map(([id, dot, ringName, desc]) => (
          <div key={id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: dot, flex: 'none', marginTop: 7 }} />
            <span style={{ minWidth: 0, fontFamily: BS_CLEAN_SANS, fontSize: 14, lineHeight: 1.5, color: ink(0.66) }}>
              <span style={{ fontWeight: 650, color: INK }}>{ringName}</span>{' '}{desc}
            </span>
          </div>
        ))}
      </div>
    </div>,
  ]) : null;

  // The page, card by card, for each role. A part is a keyed <div> under head(); to add one, build it
  // above, list it in its card here, and if it writes a key, add that key to shownFields() for the
  // roles that show it (a key no card shows is left as the doc has it).
  const groups = coach ? [
    signalCard,
    card('about', tr('profile:editor.group.about', { defaultValue: 'About you' }), [bioPart, linePart, promptsPart]),
    card('practice', tr('profile:editor.group.practice', { defaultValue: 'Your practice' }), [bizPart, winsPart]),
    card('photos', tr('profile:editor.group.photos', { defaultValue: 'Photos & film' }), [coverPart, filmPart]),
    card('highlights', tr('profile:editor.group.highlights', { defaultValue: 'Highlights' }), [pinPart, statsPart]),
    card('style', tr('profile:editor.group.style', { defaultValue: 'Look & sound' }), [lookPart, songPart]),
    card('links', linksTitle, [linksPart]),
  ] : [
    card('about', tr('profile:editor.group.about', { defaultValue: 'About you' }), [bioPart, startPart]),
    card('photos', tr('profile:editor.group.photos', { defaultValue: 'Photos & film' }), [wallPart, coverPart, filmPart]),
    card('highlights', tr('profile:editor.group.highlights', { defaultValue: 'Highlights' }), [shelfPart, pinPart, statsPart]),
    card('style', tr('profile:editor.group.style', { defaultValue: 'Look & sound' }), [lookPart, songPart]),
    card('links', linksTitle, [linksPart]),
  ];

  return createPortal(
    // Full-page takeover — the customizer owns the screen.
    <div data-cust-root="" className="bs-scroll" role="dialog" aria-modal="true" aria-labelledby="bs-cust-title"
      style={{ position: 'absolute', inset: 0, zIndex: 220, background: BG, color: INK, overflowY: 'auto', overflowX: 'hidden', '--cust-teal': TEAL, '--cust-ring': hexA(TEAL, 0.24), '--cust-ph': ink(0.42) }}>
      <div style={{ padding: `0 ${gutter}px`, maxWidth: 620, margin: '0 auto', boxSizing: 'border-box' }}>
        {/* Masthead row at the standard inset — the editor's title and close sit
            BELOW it (every page opens on the same row). */}
        <div style={{ paddingTop: BS_MAST_TOP_CSS }}>
          {BSMastRow && <BSMastRow trailing={null} />}
        </div>
        <BSCleanType t={tClean}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 0 20px' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: BS_CLEAN_SANS, fontSize: 14, fontWeight: 600, color: ink(0.6) }}>{splitHead(tr('profile:editor.eyebrow', { defaultValue: 'Your profile · Editor' }))[0]}</div>
              <h1 id="bs-cust-title" style={{ margin: '2px 0 0', fontFamily: BS_CLEAN_HEAD, fontSize: 32, fontWeight: 750, letterSpacing: '-0.025em', lineHeight: 1.05, color: INK }}>{tr('profile:editor.title', { defaultValue: 'Customize' })}</h1>
            </div>
            <button type="button" data-cust-close="" className="bs-cust-btn bs-cust-press" onClick={onClose} aria-label={tr('profile:editor.closeAria', { defaultValue: 'Close' })}
              style={{ width: 44, height: 44, flex: 'none', padding: 0, borderRadius: 999, border: `1px solid ${ink(light ? 0.08 : 0.1)}`, background: cardBg, boxShadow: lift, color: INK, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
              <BSMpIcon name="close" size={18} stroke={2.2} />
            </button>
          </div>
          {preview}
          {groups}
          {/* Save floats at the foot as one pill, over a fade into the paper (PAPER, the solid
              colour: BG is a gradient on Steel). Its edges track the density gutter. */}
          <div style={{ position: 'sticky', bottom: 0, zIndex: 2, marginLeft: -gutter, marginRight: -gutter, marginTop: 4, padding: `22px ${gutter}px calc(12px + env(safe-area-inset-bottom, 0px))`, background: `linear-gradient(180deg, ${hexA(PAPER, 0)} 0%, ${hexA(PAPER, 0.92)} 38%, ${PAPER} 100%)`, pointerEvents: 'none' }}>
            <button type="button" data-cust-save="" className="bs-cust-btn bs-cust-press" onClick={save} disabled={saving}
              style={{ pointerEvents: 'auto', width: '100%', minHeight: 54, borderRadius: 999, border: 0, background: TEAL, color: onTeal, cursor: saving ? 'wait' : 'pointer', opacity: saving && !busy ? 0.7 : 1, fontFamily: BS_CLEAN_HEAD, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: light ? `0 12px 24px -14px ${ink(0.5)}` : '0 12px 26px -12px rgba(0,0,0,0.9)' }}>
              {busy ? tr('profile:log.saving', { defaultValue: 'Saving…' }) : <><BSMpIcon name="check" size={18} stroke={2.6} />{tr('profile:editor.save', { defaultValue: 'Save profile' })}</>}
            </button>
          </div>
        </BSCleanType>
      </div>
    </div>,
    (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || document.body
  );
}
