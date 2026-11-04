import React from 'react';
import { createPortal } from 'react-dom';
import { BS_CLEAN_HEAD, BS_CLEAN_SANS, BSCleanType, useBSClean } from './bsCleanType.jsx';
import { BSMpIcon, bsMpGlass } from './BSMemberBento.jsx';
import { BSLookPicker, bsLookWords, paletteOf, hexA, onColor } from './BSLookPicker.jsx';
import { bsRaised, BSGlassEdge } from './BSProInstrument.jsx';
import { bsWsAccent, bsWsLed } from './bsMagazine.mjs';
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
// analog. make them look really alive, like popping off the screen"; then "reduce the coloring and
// simplify UI more"; then, of the one long page: "organize the page listing different sections or areas
// on the profile you can choose to customize which then brings you to individual page for those
// customizations instead of listing everyone on one, requires less scrolling").
//
//   · In the other session's lit, raised language (owner: "popping out, almost 3d look", "and a better
//     layout"): raised plates (bsRaised) with a lit top edge (BSGlassEdge), lit slots (bsWsLed), fields
//     as inset wells, one glowing primary. Colour lives in the lit edges and slots, the facet avatar's
//     tier colour, the one primary and an error.
//   · THE HUB, what Customize opens to: the profile as it will look (cover, the facet avatar for a
//     member or the round photo for a coach, the name, the countdown or a coach's line, the bio) as the
//     hero plate; then the areas as a 2-column grid of raised tiles, each with a lit icon well, its name,
//     what is set there and a lit "Set" or a dim "Add"; Colors and Profile song as wide tiles (Colors
//     showing the look as lit swatches), which also closes the grid with no gap; last, the door to the
//     name, @handle and photo (Settings) as a quiet glass row. A pressed tile sinks.
//   · AN AREA'S PAGE: a BSPage with the shared Back under the masthead (BSDetailHeader), so a swipe right
//     goes back as ← does; its fields grouped on raised plates; its own Save at the foot, the one glowing
//     primary. Leaving it with changes not saved asks once, on a raised sheet (Discard / Keep editing).
//   · Motion is a short rise as the plates come in and a sink on a press, all of it off under
//     prefers-reduced-motion.
//
// ⚠ AN AREA'S SAVE READS THE DOC AGAIN AND WRITES ONLY THAT AREA'S FIELDS (areaFields), as Make it yours
// saves: they go over the doc as stored now, so a key written elsewhere since (a `look`, a member's line,
// another area) is kept. The read is bound to the account, and a read that fails writes nothing. `look`
// follows the website editor's rule (#2611): the panel shows a tap (`pick`), else the saved look, else
// the app's own paper and accent, and Colors writes `look` only when a tap differs from the saved look,
// so an untouched panel never writes the app's colours to a profile. The limits, the upload type and size
// checks, the in-flight upload guard, the sign-in guard and the normalizer are the editor's as they were
// (tests/profile-custom.test.mjs, tests/profile-token-sync.test.mjs).
// ⚠ ONE WORKING COPY. Every field lives in `form`, made from the doc as last saved (bsCustFormOf): an area
// is unsaved when its fields differ from the saved doc's, Discard puts the form back to it, and a Save
// replaces the saved doc, so the hub's preview and lines read what is stored.
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP, and this module never imports the client
// module (the BSLeaderboard / BSEatDay pattern): the page, the detail header, the masthead row, the facet
// avatar and the identity helpers are read off window inside the component. The client imports the
// option tables below from here.

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

// ── The editor's working copy ──────────────────────────────────────────────────────────────────
// Every field as a doc holds it: what the editor opens with, what Discard puts back, and what an area
// compares itself with to know it has changes. `pick` is the look panel's tap: null until one, so the
// panel shows the saved look (or the app's own) and writes nothing (the website editor's rule, #2611).
export function bsCustFormOf(init, { filmKey, promptOpts }) {
  return {
    bio: init.bio || '',
    songUrl: (init.song && init.song.url) || '',
    songLabel: (init.song && init.song.label) || '',
    links: { ...(init.links || {}) },
    prompts: Array.isArray(init.prompts) && init.prompts.length ? init.prompts.slice(0, 4) : [{ q: promptOpts[0].id, a: '' }],
    coverUrl: (init.cover && init.cover.image) || '',
    pick: null,
    // A tap on Keep in view (the cover's crop, look.focus); null until one.
    focusPick: null,
    // Normalise on the way IN: a doc stored before the split carries English, and a
    // picker comparing tokens would match no chip and silently reset the member's pin.
    // The label helpers take the translator; the TOKEN is what the picker compares
    // and the doc stores, so a renaming translator can never reset a member's pin.
    pinKind: bsPinKindToken((init.pinned && init.pinned.kind) || '') || BS_PIN_KINDS[0].id,
    pinTitle: (init.pinned && init.pinned.title) || '',
    pinNote: (init.pinned && init.pinned.note) || '',
    pinMetric: (init.pinned && init.pinned.metric) || '',
    heroStats: Array.isArray(init.heroStats) && init.heroStats.length ? init.heroStats : ['score', 'tier', 'streak'],
    line: init.line || '',
    startTitle: (init.startLine && init.startLine.title) || '',
    startDate: (init.startLine && init.startLine.date) || '',
    wall: Array.isArray(init.wall) ? init.wall.slice(0, BS_WALL_MAX).map((w) => ({ url: w && w.url, caption: (w && w.caption) || '' })) : [],
    shelf: Array.isArray(init.shelf) ? init.shelf.slice(0, BS_SHELF_MAX).map((s) => ({ title: (s && s.title) || '', when: (s && s.when) || '' })) : [],
    // Each role's intro film lives in its OWN doc key so they coexist: coach P1 → `film`
    // (coach-media), member M5 → `filmMember` (member-films).
    film: (init[filmKey] && init[filmKey].url) ? { url: init[filmKey].url, caption: (init[filmKey].caption || '') } : null,
    biz: { name: (init.bizCard && init.bizCard.name) || '', where: (init.bizCard && init.bizCard.where) || '', hours: (init.bizCard && init.bizCard.hours) || '', handle: (init.bizCard && init.bizCard.handle) || '' },
    pins: Array.isArray(init.pinnedReviews) ? init.pinnedReviews.slice(0, BS_PINNED_REVIEWS_MAX) : [],
  };
}

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
// The hub's row icons: monochrome line drawings in currentColor (no coloured emoji in new work). The
// ones the member profile's set has are drawn by BSMpIcon; these four are this page's own.
const BS_CUST_ICONS = {
  image: ['M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z', 'M8.5 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z', 'm21 15-5-5L5 20'],
  palette: ['M12 3a9 9 0 1 0 0 18c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5C21 6.6 17 3 12 3Z', 'M7.5 11.5h.01', 'M10.5 7.5h.01', 'M15.5 8.5h.01'],
  link: ['M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5', 'M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5'],
  briefcase: ['M4 8h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z', 'M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2', 'M3 13h18'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M4 20a8 8 0 0 1 16 0'],
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
};
const custIcon = (name, size = 18) => (BS_CUST_ICONS[name]
  ? <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flex: 'none' }}>{BS_CUST_ICONS[name].map((d, i) => <path key={i} d={d} />)}</svg>
  : <BSMpIcon name={name} size={size} stroke={2} />);

// Focus rings, placeholders, the press and the cards' rise: the parts inline styles cannot say. Every
// motion rule is undone under prefers-reduced-motion.
function bsCustCss() {
  if (typeof document === 'undefined' || document.getElementById('bs-cust-css')) return;
  const s = document.createElement('style');
  s.id = 'bs-cust-css';
  s.textContent = [
    '.bs-cust-field { transition: border-color 160ms ease, box-shadow 160ms ease; }',
    '.bs-cust-field::placeholder { color: var(--cust-ph); opacity: 1; }',
    '.bs-cust-field:focus { border-color: var(--cust-teal) !important; box-shadow: var(--cust-well), 0 0 16px -6px var(--cust-glow) !important; }',
    '.bs-cust-cap::placeholder { color: rgba(255,255,255,0.8); opacity: 1; }',
    '.bs-cust-cap:focus { box-shadow: inset 0 -3px 0 var(--cust-teal); }',
    '.bs-cust-btn:focus-visible { outline: 2px solid var(--cust-teal); outline-offset: 2px; }',
    '.bs-cust-press { transition: transform 160ms ease, box-shadow 160ms ease, background-color 160ms ease; }',
    '.bs-cust-press:active:not(:disabled) { transform: translateY(1px); }',
    // A tile sinks a hair under the finger; the one glowing primary sinks and its glow tightens.
    '.bs-cust-row { transition: transform 140ms ease, filter 140ms ease; }',
    '.bs-cust-row:active { transform: translateY(1px); filter: brightness(0.97); }',
    '.bs-cust-primary { transition: transform 140ms ease, box-shadow 140ms ease; }',
    '.bs-cust-primary:active:not(:disabled) { transform: translateY(1px); box-shadow: 0 6px 16px -10px var(--cust-glow) !important; }',
    '@keyframes bsCustIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }',
    '.bs-cust-in { animation: bsCustIn 340ms cubic-bezier(.2,.7,.2,1) both; }',
    '@keyframes bsCustFade { from { opacity: 0; } to { opacity: 1; } }',
    '.bs-cust-photo { animation: bsCustFade 260ms ease both; }',
    // On a narrow phone the area's Preview pill is its eye alone (its name stays its aria-label), so the
    // title beside it keeps its line.
    '@media (max-width: 359px) { .bs-cust-live-word { display: none; } }',
    '@media (prefers-reduced-motion: reduce) {',
    '  .bs-cust-in, .bs-cust-photo { animation: none !important; }',
    '  .bs-cust-press, .bs-cust-field { transition: none !important; }',
    '  .bs-cust-press:active:not(:disabled) { transform: none !important; }',
    '  .bs-cust-row, .bs-cust-primary { transition: none !important; }',
    '  .bs-cust-row:active, .bs-cust-primary:active:not(:disabled) { transform: none !important; }',
    '}',
  ].join('\n');
  document.head.appendChild(s);
}

// ── The editor ─────────────────────────────────────────────────────────────────────────────────
// `who` is the person the profile behind it shows ({ name, handle, photo }), so the preview reads as
// that profile does (the preview persona included); without it, the signed-in member's own.
// `onSave(doc)` closes the editor with the doc as saved (once any area saved); `onClose()` closes it with
// nothing saved.
export function BSProfileCustomizer({ initial, c, INK, BG, onClose, onSave, coach = false, ownerUid = null, who = null }) {
  const W = typeof window !== 'undefined' ? window : {};
  const BSMastRow = W.BSMastRow;
  const FacetAvatar = W.BSFacetAvatar;
  const Page = W.BSPage;
  const DetailHeader = W.BSDetailHeader;
  const BS_MAST_TOP_CSS = W.BS_MAST_TOP_CSS || `max(${W.BS_MAST_TOP || 44}px, calc(env(safe-area-inset-top, 0px) + 12px), var(--bs-notch-floor, 0px))`;
  // Ink/paper arrive as props (this editor is painted over the profile's own ground); the gutter is a
  // density setting, so it reads the live theme. It portals into the phone surface, and a portal keeps
  // React context, so the theme resolves.
  const tTheme = W.useBS ? W.useBS() : {};
  const tClean = useBSClean();
  const gutter = (tTheme && tTheme.padX) || 22;
  const light = !!tTheme.isLight;
  const PAPER = tTheme.PAPER || '#0f0e0c';
  // The one colour of the page: Save and a focused field (the magazine's teal, readable on either paper).
  const TEAL = bsWsAccent(tTheme);
  const onTeal = onColor(TEAL);
  const ERR = light ? '#b3412b' : '#f08a6c';
  const ink = (a) => hexA(INK, a);
  const tr = useShapeTr();
  const PROMPT_OPTS = coach ? BS_COACH_PROMPTS : BS_PROFILE_PROMPTS;
  // This role's intro film key and bucket; the other role's film key is left as the doc has it.
  const filmKey = coach ? 'film' : 'filmMember';
  const filmRoleBucket = coach ? 'coach-media' : 'member-films';
  // The look panel's start for a profile that never picked one: the app's own paper and accent.
  const seedPaper = BS_LOOK_PAPERS.includes(tTheme.paperMode) ? tTheme.paperMode : 'dark';
  const seedAccent = BS_LOOK_ACCENTS.includes(tTheme.accentKey) ? tTheme.accentKey : 'teal';
  const formOf = (doc) => bsCustFormOf(doc || {}, { filmKey, promptOpts: PROMPT_OPTS });
  useEffect(() => { bsCustCss(); }, []);
  const [motion] = useState(() => !reducedMotion());

  // The doc as last saved (as opened, until an area saves), the working copy, and the open area.
  const [saved, setSaved] = useState(() => initial || {});
  const [form, setForm] = useState(() => formOf(initial || {}));
  const [area, setArea] = useState(null);
  const [savedOnce, setSavedOnce] = useState(false);
  const [busy, setBusy] = useState(false);
  // The live preview is open over the hub or the area it was opened from; closing it shows that again,
  // where it was scrolled, with every draft as it was (nothing is saved or reset by previewing).
  const [previewing, setPreviewing] = useState(false);
  const liveOpenerRef = useRef(null);
  const liveBackRef = useRef(null);
  useEffect(() => {
    // Focus moves to the preview's Back to editing, and comes back to the button that opened it.
    if (previewing) { try { liveBackRef.current && liveBackRef.current.focus({ preventScroll: true }); } catch (e) {} return; }
    const el = liveOpenerRef.current;
    liveOpenerRef.current = null;
    if (el) { try { el.focus({ preventScroll: true }); } catch (e) {} }
  }, [previewing]);
  const [coverBusy, setCoverBusy] = useState(false);
  const [wallBusy, setWallBusy] = useState(false);
  const [filmBusy, setFilmBusy] = useState(false);
  const coverRef = useRef(null);
  const wallRef = useRef(null);
  const filmRef = useRef(null);
  // A field's setter, taking a value or an updater as useState's does.
  const setF = (k) => (v) => setForm((p) => ({ ...p, [k]: typeof v === 'function' ? v(p[k]) : v }));
  const { bio, songUrl, songLabel, links, prompts, coverUrl, pick, focusPick, pinKind, pinTitle, pinNote, pinMetric, heroStats, line, startTitle, startDate, wall, shelf, film, biz, pins } = form;
  const setBio = setF('bio'), setSongUrl = setF('songUrl'), setSongLabel = setF('songLabel'), setLinks = setF('links'), setPrompts = setF('prompts');
  const setCoverUrl = setF('coverUrl'), setPinKind = setF('pinKind'), setPinTitle = setF('pinTitle'), setPinNote = setF('pinNote');
  // The look, as the website editor reads it (#2611): the pick (a tap), else the saved look, else the
  // app's own paper and accent. A tap records the pick; nothing else does.
  const initLook = bsProfileLook(saved.look) || {};
  const look = { ...initLook, paper: (pick && pick.paper) || initLook.paper || seedPaper, accent: (pick && pick.accent) || initLook.accent || seedAccent };
  const setLook = (next) => setForm((p) => ({ ...p, pick: { paper: next.paper, accent: next.accent } }));
  const pickChanged = !!pick && (pick.paper !== initLook.paper || pick.accent !== initLook.accent);
  // What stays in view in a member's cover (look.focus, #2611's member crop map, BS_MEMBER_FOCUS): set on
  // Photos & film under the cover, by the same rule as the pick. The page crops to the middle until one is
  // saved, so a tap on the crop it already has is no change. A coach's page here reads no crop.
  const focusNow = focusPick || initLook.focus || 'center';
  const focusChanged = !coach && !!focusPick && focusPick !== (initLook.focus || 'center');
  const setPinMetric = setF('pinMetric'), setHeroStats = setF('heroStats'), setLine = setF('line'), setStartTitle = setF('startTitle'), setStartDate = setF('startDate');
  const setWall = setF('wall'), setShelf = setF('shelf'), setFilm = setF('film'), setBiz = setF('biz'), setPins = setF('pins');

  const toggleStat = (k) => setHeroStats((prev) => { if (prev.includes(k)) return prev.length > 1 ? prev.filter((x) => x !== k) : prev; return prev.length >= 3 ? [...prev.slice(1), k] : [...prev, k]; });
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
  const togglePin = (id) => setPins((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : (prev.length >= BS_PINNED_REVIEWS_MAX ? prev : [...prev, id]));
  // Pin candidates: the coach's OWN reviews by owner_id (the trigger-stamped column),
  // NOT a display-name slug — a name mismatch would otherwise hide pinnable reviews.
  // Filtered to a MEMBER's review (authorId !== ownerId), so a self-authored row can't be pinned.
  const [pickReviews, setPickReviews] = useState([]);
  // The pins that resolve, once the reviews have loaded (null until then): a dead saved pin is dropped
  // from the form, and from what Your practice compares itself with, so it never reads as a change.
  const [livePins, setLivePins] = useState(null);
  useEffect(() => {
    // The owner list is a capped latest-200 page; a review already pinned but aged past
    // it still renders on the wall (by-id resolver) yet would vanish from the picker,
    // leaving no way to UNPIN it. UNION the ≤3 saved pins (resolved by id) into the
    // candidates so every currently-pinned review always has a removal control.
    let on = true;
    setPickReviews([]);   // drop the prior coach's candidates before (re)loading — a stale
    if (!coach || !ownerUid) return () => { on = false; };  // set could be shown/pinned for the wrong coach
    const savedIds = Array.isArray(saved.pinnedReviews) ? saved.pinnedReviews.slice(0, BS_PINNED_REVIEWS_MAX) : [];
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
        setLivePins(live);
        setPins((prev) => prev.filter((id) => live.has(id)));
      }
    });
    return () => { on = false; };
  }, [coach, ownerUid]);
  const startState = bsStartLineState(startDate, new Date());
  const embedPreview = bsSpotifyEmbed(songUrl);

  // ── The areas: what each one's page writes ──
  // An area's Save writes exactly these keys over the doc as stored now; every other key is left as the
  // doc has it. `f` is a form (the working copy, or the saved doc's).
  const areaFields = (key, f) => {
    const { bio, songUrl, songLabel, links, prompts, coverUrl, pinKind, pinTitle, pinNote, pinMetric, heroStats, line, startTitle, startDate, wall, shelf, film, biz, pins } = f;
    if (key === 'about') {
      // The member profile shows no prompts and no longer asks for a line (owner, 2026-11-04:
      // "Remove the field"); a member's saved ones stay as they are.
      return coach ? {
        bio: bio.trim(),
        line,
        prompts: prompts.filter((p) => p && p.q && String(p.a).trim()).map((p) => ({ q: bsPromptToken(p.q), a: String(p.a).trim() })).slice(0, 4),
      } : {
        bio: bio.trim(),
        startLine: (startTitle.trim() || startDate.trim()) ? { title: startTitle.trim(), date: startDate.trim() } : null,
      };
    }
    if (key === 'photos') {
      return {
        cover: coverUrl.trim() ? { image: coverUrl.trim() } : null,
        // This role's intro film → its own key (coach `film`, member `filmMember`).
        [filmKey]: (film && film.url) ? { url: film.url, caption: (film.caption || '').trim() } : null,
        // A member's wall (M1); the normalizer below cleans and caps it and DROPS it when empty.
        ...(coach ? {} : { wall }),
      };
    }
    if (key === 'highlights') {
      return {
        pinned: pinTitle.trim() ? { kind: bsPinKindToken(pinKind), title: pinTitle.trim(), note: pinNote.trim(), metric: pinMetric.trim() } : null,
        heroStats: heroStats.slice(0, 3),
        ...(coach ? {} : { shelf }),
      };
    }
    if (key === 'song') return { song: songUrl.trim() ? { url: songUrl.trim(), label: songLabel.trim() } : null };
    if (key === 'links') return { links: Object.fromEntries(BS_PROFILE_LINKS.map((l) => [l.key, String(links[l.key] || '').trim()]).filter(([, v]) => v)) };
    // A coach's business card (P4) and pinned reviews (P5).
    if (key === 'practice') return { bizCard: biz.name.trim() ? { name: biz.name.trim(), where: biz.where.trim(), hours: biz.hours.trim(), handle: biz.handle.trim() } : null, pinnedReviews: pins };
    return {};
  };
  const base = formOf(saved);
  const basePins = livePins ? base.pins.filter((id) => livePins.has(id)) : base.pins;
  const uploading = wallBusy || coverBusy || filmBusy;
  const areaDirty = (key) => {
    if (!key || key === 'signal') return false;
    if (key === 'colors') return pickChanged;
    if (key === 'photos' && focusChanged) return true;
    if (key === 'photos' && uploading) return true;
    const was = key === 'practice' ? { ...base, pins: basePins } : base;
    return JSON.stringify(areaFields(key, form)) !== JSON.stringify(areaFields(key, was));
  };
  const dirty = areaDirty(area);
  const saveArea = async (key) => {
    if (busy || !areaDirty(key)) return;
    // A real signed-in owner is REQUIRED before we normalize: bsProfileWall drops
    // every wall entry when ownerUid is empty, so persisting with no uid would
    // SILENTLY erase the member's wall. Surface save failures instead of
    // swallowing them, and only go back to the hub once the write actually lands.
    const uid = window.ShapeAuth?.getCachedState?.()?.user?.id;
    if (!uid) { window.__bsToast?.(tr('profile:editor.err.signIn', { defaultValue: 'Sign in to save your profile.' }), 'err'); return; }
    // A wall/cover/film upload still in flight would be omitted from the saved doc
    // AND left orphaned in storage — wait.
    if (uploading) { window.__bsToast?.(tr('profile:editor.err.uploadBusy', { defaultValue: 'Hang on — an upload is still in progress.' }), 'err'); return; }
    setBusy(true);
    // Merge onto the doc as saved NOW, not the copy this opened with, so a key written elsewhere
    // since (a `look` from Make it yours, Nora's account setup) is kept — as Make it yours saves. Both
    // calls are bound to this account, and a read that fails (or answers for another account) stops
    // the save: the doc as it was when this opened would undo a change made since.
    let stored = null;
    try { stored = await window.shapeDb?.getUserGoals?.('profile_custom', { expectedUserId: uid }); } catch (e) { stored = null; }
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
      setBusy(false);
      window.__bsToast?.(tr('profile:editor.err.save', { defaultValue: 'Could not save — try again.' }), 'err');
      return;
    }
    const doc = { ...stored, ...areaFields(key, form) };
    // `look` only when it was picked here (or its focus changed: #2611), over whatever else the stored
    // look holds; an untouched panel writes none. The old `accent` hex and `climbBg` ride through
    // `...stored` as the doc has them.
    if (key === 'colors' && pickChanged) doc.look = { ...(bsProfileLook(stored.look) || {}), paper: pick.paper, accent: pick.accent };
    // The crop, the same way: over the stored look, its paper and accent kept.
    if (key === 'photos' && focusChanged) doc.look = { ...(bsProfileLook(stored.look) || {}), focus: focusPick };
    // Normalize only THIS role's film key against its bucket; the other role's film key
    // isn't named here, so it passes through byte-identical.
    const clean = bsNormalizeProfileCustom(doc, uid, { filmBucket: filmRoleBucket, filmKey });
    let res;
    try { res = await window.shapeDb?.saveUserGoals?.('profile_custom', clean, { expectedUserId: uid }); }
    catch (e) { res = { error: e }; }
    setBusy(false);
    // saveUserGoals RESOLVES { ok } | { error } (never throws on an RLS/no-backend
    // failure). Keep the page open + toast on any non-ok result rather than faking success.
    if (!res || res.error) { window.__bsToast?.((res && res.error && res.error.message) || tr('profile:editor.err.save', { defaultValue: 'Could not save — try again.' }), 'err'); return; }
    setSaved(clean);
    setForm(formOf(clean));
    setSavedOnce(true);
    setArea(null);
  };
  // Back from an area (its ←, or a swipe right): with changes not saved, it asks once, on the editor's own
  // raised sheet; Keep editing (or a tap outside it) stays, Discard puts the form back to the saved doc.
  const [asking, setAsking] = useState(false);
  const leaveArea = () => {
    if (areaDirty(area)) { setAsking(true); return false; }
    setArea(null);
    return true;
  };
  const keepEditing = () => setAsking(false);
  const discardChanges = () => { setAsking(false); setForm(formOf(saved)); setArea(null); };
  const openArea = (key) => { setForm(formOf(saved)); setArea(key); };
  // Closing the editor hands the profile the doc as saved, once an area has saved; else nothing changed.
  const closeEditor = () => (savedOnce ? onSave(saved) : onClose());

  // ── The look: the lit, raised language of the other session's pages (owner, 2026-11-04: "popping
  // out, almost 3d look") ──
  // Page paper → raised plate (bsRaised, its lit top edge BSGlassEdge) → glass pane (bsMpGlass) → inset
  // well → lit slot (bsWsLed). Colour lives in the lit edges, the lit slots and the one glowing primary.
  const PLATE_PAD = '18px 16px 20px';
  const plate = (glow) => bsRaised(tTheme, glow || null);
  const led = (on) => bsWsLed(tTheme, on);
  const glowOf = (col = TEAL) => `0 0 16px -6px ${hexA(col, 0.85)}`;
  // An inset well: a dark inset on a dark paper, a faint ink wash on a light one.
  const wellBg = light ? ink(0.045) : 'rgba(0,0,0,0.45)';
  const wellIn = light ? 'inset 0 1px 2px rgba(0,0,0,0.08)' : 'inset 0 1px 3px rgba(0,0,0,0.6)';
  // The one glowing primary: a filled teal, its words readable on it, a deep coloured shadow.
  const primaryGlow = (col) => `0 12px 28px -12px ${hexA(col, 0.85)}, inset 0 1px 0 rgba(255,255,255,0.35)`;
  const labelS = { fontFamily: BS_CLEAN_SANS, fontSize: 15, fontWeight: 650, lineHeight: 1.3, color: INK };
  // Quiet words at 60% of the ink: 4.5:1 and up on every paper at 13px.
  const hintS = { fontFamily: BS_CLEAN_SANS, fontSize: 13, fontWeight: 500, lineHeight: 1.3, color: ink(0.6) };
  const noteS = { margin: '8px 0 0', fontFamily: BS_CLEAN_SANS, fontSize: 13, fontWeight: 500, lineHeight: 1.45, color: ink(0.6) };
  // Fields: inset wells, their edge lit with a soft glow when focused; 16px words (iOS zooms a smaller field).
  const field = { width: '100%', boxSizing: 'border-box', minHeight: 48, padding: '12px 14px', borderRadius: 14, border: `1px solid ${ink(0.12)}`, background: wellBg, boxShadow: wellIn, color: INK, fontFamily: BS_CLEAN_SANS, fontSize: 16, lineHeight: 1.35, outline: 'none', WebkitAppearance: 'none', appearance: 'none' };
  const stack = (gap) => ({ display: 'flex', flexDirection: 'column', gap });
  // A quiet action: an unlit slot.
  const ghost = { ...led(false), minHeight: 44, padding: '0 16px', borderRadius: 12, color: INK, textShadow: 'none', cursor: 'pointer', fontFamily: BS_CLEAN_SANS, fontSize: 15, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'flex-start', boxSizing: 'border-box' };
  // A chip: a slot, lit (its edge, and a soft glow on a dark paper) when chosen, with a tick.
  const chip = (on) => ({ ...led(on), minHeight: 44, padding: on ? '0 15px 0 12px' : '0 16px', borderRadius: 12, cursor: 'pointer', fontFamily: BS_CLEAN_SANS, fontSize: 15, fontWeight: on ? 650 : 550, display: 'inline-flex', alignItems: 'center', gap: 6, boxSizing: 'border-box', ...(on && !light ? { boxShadow: `${wellIn}, ${glowOf()}` } : null) });
  // The round × on a row, a full 44px key.
  const xKey = { width: 44, height: 44, flex: 'none', padding: 0, border: 0, borderRadius: 999, background: 'transparent', color: ink(0.6), cursor: 'pointer', display: 'grid', placeItems: 'center' };
  // An empty slot to fill: an inset well with a lit plus.
  const slot = { borderRadius: 16, border: `1px solid ${ink(0.12)}`, background: wellBg, boxShadow: wellIn, color: ink(0.82), cursor: 'pointer', fontFamily: BS_CLEAN_SANS, fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxSizing: 'border-box' };
  const plusDot = <span aria-hidden="true" style={{ ...led(true), width: 36, height: 36, flex: 'none', borderRadius: 999, display: 'grid', placeItems: 'center', ...(light ? null : { boxShadow: `${wellIn}, ${glowOf()}` }) }}><BSMpIcon name="plus" size={17} stroke={2.2} /></span>;
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
      <div data-cust-cover="" style={{ position: 'relative', height: coverUrl ? 140 : 88, borderRadius: 18, overflow: 'hidden', boxSizing: 'border-box', background: coverUrl ? '#111' : wellBg, border: coverUrl ? 0 : `1px solid ${ink(0.12)}`, boxShadow: coverUrl ? (light ? `0 10px 22px -14px ${ink(0.45)}` : '0 12px 24px -14px rgba(0,0,0,0.9)') : wellIn }}>
        {coverUrl && <img src={coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', objectPosition: (!coach && W.BS_MEMBER_FOCUS && W.BS_MEMBER_FOCUS[focusNow]) || undefined }} />}
        <input ref={coverRef} type="file" accept="image/*" onChange={onCoverFile} style={{ display: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 10 }}>
          <button type="button" className="bs-cust-btn bs-cust-press" onClick={() => !coverBusy && coverRef.current && coverRef.current.click()} disabled={coverBusy} style={{ ...coverPill, cursor: coverBusy ? 'wait' : 'pointer', ...(coverUrl ? null : { background: ink(light ? 0.06 : 0.09), boxShadow: 'none' }) }}>{coverBusy ? tr('profile:log.uploading', { defaultValue: 'Uploading…' }) : coverUrl ? tr('profile:editor.cover.replace', { defaultValue: 'Replace' }) : tr('profile:editor.cover.upload', { defaultValue: 'Upload cover' })}</button>
          {coverUrl && <button type="button" className="bs-cust-btn bs-cust-press" onClick={() => setCoverUrl('')} style={{ ...coverPill, cursor: 'pointer' }}>{tr('profile:action.remove', { defaultValue: 'Remove' })}</button>}
        </div>
      </div>
      {/* Keep in view: what the profile's cover keeps in its crop (look.focus), a member's only. */}
      {!coach && coverUrl ? (
        <div data-cust-focus="" role="group" aria-label={tr('profile:mine.keepInView', { defaultValue: 'Keep in view' })} style={{ marginTop: 14 }}>
          <div style={{ ...hintS, marginBottom: 8 }}>{tr('profile:mine.keepInView', { defaultValue: 'Keep in view' })}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[['top', tr('profile:mine.focusTop', { defaultValue: 'Top' })], ['center', tr('profile:mine.focusCenter', { defaultValue: 'Center' })], ['bottom', tr('profile:mine.focusBottom', { defaultValue: 'Bottom' })]].map(([k, label]) => (
              <button key={k} type="button" data-cust-focus-pick={k} aria-pressed={focusNow === k} className="bs-cust-btn bs-cust-press" onClick={() => setForm((p) => ({ ...p, focusPick: k }))} style={chip(focusNow === k)}>
                {focusNow === k ? <BSMpIcon name="check" size={15} stroke={2.6} /> : null}{label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
  // The colours: the shared look panel (BSLookPicker, Make it yours' Colors page): a Shape look, a
  // paper and an accent. It draws its own chrome, so it sits in the card as it is, reaching 12px into
  // the card's padding so its grids keep their gaps (its lamps measure 42px wide on a 280px-wide
  // surface; the panel's own five-a-row grid is what sets that).
  const lookPart = (
    <div key="look">
      {head(tr('profile:mine.colorsTitle', { defaultValue: 'Your colors' }))}
      <p style={{ ...noteS, margin: '-4px 0 4px' }}>{tr('profile:mine.colorsSub', { defaultValue: 'Pick from Shape’s papers and accents. Your whole page follows.' })}</p>
      <div data-cust-look="" style={{ margin: '0 -12px' }}>
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
  // The song is its page's only part, so the page's title is its label and the hint leads the card.
  const songHead = splitHead(tr('profile:editor.song.label', { defaultValue: 'Profile song · Spotify link' }));
  const songPart = (
    <div key="song">
      <p style={{ ...noteS, margin: '0 0 12px' }}>{songHead[1]}</p>
      <div style={stack(10)}>
        {/* The URL example is deliberately NOT keyed — it is a literal address,
            byte-identical in every locale, so a key would ship thirteen copies of
            one string a translator must not touch (the "Shape Score" exemption).
            The HANDLE and DOMAIN examples below ARE keyed: those are the
            +1 555 123 4567 class, where a locale's own form reads better. */}
        <input className="bs-cust-field" value={songUrl} onChange={(e) => setSongUrl(e.target.value)} placeholder="https://open.spotify.com/track/…" aria-label={songHead[0]} inputMode="url" autoCapitalize="none" style={field} />
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
  // The links are their page's only part, so the page's title ("Social links") is their label.
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
  const signalPart = coach ? (
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
    </div>
  ) : null;

  // ── The areas, for each role: their tile's name and icon, and their page's parts ──
  // To add an area: build its parts above, add it here and to TILES, and give areaFields() the keys its
  // Save writes (a key no area writes is left as the doc has it). `wide` spans the hub's two columns;
  // `bare` draws its parts without plates (the look panel brings its own).
  const AREAS = {
    signal: { name: signalHead[0], icon: 'pulse', parts: [signalPart] },
    about: { name: tr('profile:editor.group.about', { defaultValue: 'About you' }), icon: 'chat', parts: coach ? [bioPart, linePart, promptsPart] : [bioPart, startPart] },
    practice: { name: tr('profile:editor.group.practice', { defaultValue: 'Your practice' }), icon: 'briefcase', parts: [bizPart, winsPart] },
    photos: { name: tr('profile:editor.group.photos', { defaultValue: 'Photos & film' }), icon: 'image', parts: coach ? [coverPart, filmPart] : [wallPart, coverPart, filmPart] },
    highlights: { name: tr('profile:editor.group.highlights', { defaultValue: 'Highlights' }), icon: 'trophy', parts: coach ? [pinPart, statsPart] : [shelfPart, pinPart, statsPart] },
    links: { name: tr('profile:editor.links.label', { defaultValue: 'Social links' }), icon: 'link', parts: [linksPart] },
    colors: { name: tr('profile:mine.tabColors', { defaultValue: 'Colors' }), icon: 'palette', parts: [lookPart], wide: true, bare: true },
    song: { name: songHead[0], icon: 'note', parts: [songPart], wide: true },
  };
  // The hub's order: the half tiles in pairs, then the two wide ones, so the grid closes with no gap.
  const TILES = coach ? ['signal', 'about', 'practice', 'photos', 'highlights', 'links', 'colors', 'song'] : ['about', 'photos', 'highlights', 'links', 'colors', 'song'];

  // What is set in each area, as its tile says it: from the doc as saved, never from a draft.
  const EMPTY = tr('profile:editor.sum.empty', { defaultValue: 'Not set yet' });
  const orNone = (parts) => parts.filter(Boolean).join(' · ') || EMPTY;
  const savedStart = bsStartLineState(base.startDate, new Date());
  const savedPrompts = base.prompts.filter((p) => p && p.q && String(p.a || '').trim()).length;
  const savedLinks = BS_PROFILE_LINKS.filter((l) => String(base.links[l.key] || '').trim()).length;
  // The look the profile shows now: the saved one, its missing half the app's own (as the panel reads it).
  const shownLook = { paper: initLook.paper || seedPaper, accent: initLook.accent || seedAccent };
  const lookWords = bsLookWords(tr, shownLook);
  const SUMMARY = {
    signal: signalHead[1],
    about: orNone([
      base.bio.trim() ? tr('profile:editor.sum.bio', { defaultValue: 'Bio set' }) : '',
      coach && base.line.trim() ? tr('profile:editor.sum.line', { defaultValue: 'Line set' }) : '',
      coach && savedPrompts ? tr('profile:editor.sum.prompts', { count: savedPrompts, defaultValue: '{count, plural, one {# prompt} other {# prompts}}' }) : '',
      !coach && savedStart ? tr('profile:editor.sum.countdown', { defaultValue: 'Countdown set' }) : '',
    ]),
    practice: orNone([
      base.biz.name.trim() ? tr('profile:editor.sum.biz', { defaultValue: 'Business card set' }) : '',
      basePins.length ? tr('profile:editor.sum.reviews', { count: basePins.length, defaultValue: '{count, plural, one {# review pinned} other {# reviews pinned}}' }) : '',
    ]),
    photos: orNone([
      !coach && base.wall.length ? tr('profile:editor.sum.photos', { count: base.wall.length, defaultValue: '{count, plural, one {# photo} other {# photos}}' }) : '',
      base.coverUrl ? tr('profile:editor.sum.cover', { defaultValue: 'Cover set' }) : '',
      base.film && base.film.url ? tr('profile:editor.sum.film', { defaultValue: 'Intro film set' }) : '',
    ]),
    highlights: orNone([
      !coach && base.shelf.length ? tr('profile:editor.sum.shelf', { count: base.shelf.length, defaultValue: '{count} on the shelf' }) : '',
      base.pinTitle.trim() ? tr('profile:editor.sum.pinned', { defaultValue: 'Highlight pinned' }) : '',
      Array.isArray(saved.heroStats) && saved.heroStats.length ? tr('profile:editor.sum.stats', { count: Math.min(3, saved.heroStats.length), defaultValue: '{count, plural, one {# headline stat} other {# headline stats}}' }) : '',
    ]),
    colors: bsProfileLook(saved.look) ? [lookWords.paperName(shownLook.paper), lookWords.accentName(shownLook.accent)].join(' · ') : EMPTY,
    song: base.songUrl.trim() ? (base.songLabel.trim() || tr('profile:editor.sum.song', { defaultValue: 'Song set' })) : EMPTY,
    links: savedLinks ? tr('profile:editor.sum.links', { count: savedLinks, defaultValue: '{count, plural, one {# link} other {# links}}' }) : EMPTY,
  };
  const isSet = (k) => k !== 'signal' && SUMMARY[k] !== EMPTY;

  // ── The live preview's door: the real profile page (the client's, read off window at call time), as a
  // visitor sees it, with the drafts in (owner, 2026-11-04: "add an option to view live preview") ──
  const LiveProfile = coach ? W.BSSignalCoachProfile : W.BSTerrainProfile;
  const openPreview = (e) => { liveOpenerRef.current = (e && e.currentTarget) || null; setPreviewing(true); };
  // Every way out is a Back (marked, as the page's ← marks itself), so the page it closes is not kept in
  // the scroll memory as a page left going forward.
  const closePreview = () => { try { W.bsMarkBack && W.bsMarkBack(); } catch (e) {} setPreviewing(false); };
  const liveOpenLabel = tr('profile:editor.live.open', { defaultValue: 'View live preview' });
  const liveTitle = tr('profile:editor.live.title', { defaultValue: 'Preview' });

  // ── The hub's hero: the profile as it will look (the doc as saved), on a raised plate with a lit edge ──
  const name = (who && who.name) || (W.bsMyName ? W.bsMyName() : '') || '';
  const handle = (who && who.handle) || '';
  const photo = validPhoto((who && who.photo) || (W.bsMyPhoto ? W.bsMyPhoto() : null));
  const initials = (W.bsInitials ? W.bsInitials(name) : fallbackInitials(name)) || (W.bsMyInitials ? W.bsMyInitials() : '') || '•';
  const startTitleNow = base.startTitle.trim();
  let startWhen = '';
  if (savedStart) {
    const v = bsValidStartDate(base.startDate);
    try { startWhen = new Date(v.y, v.m - 1, v.d, 12).toLocaleDateString((W.bsDateLocale && W.bsDateLocale()) || undefined, { month: 'short', day: 'numeric' }); } catch (e) { startWhen = ''; }
  }
  const startDays = savedStart ? (savedStart.days === 0 ? tr('profile:startLine.today', { defaultValue: 'Today' }) : tr('profile:startLine.daysOut', { defaultValue: '{count, plural, one {# day out} other {# days out}}', count: savedStart.days })) : '';
  // The line is a coach's only now (a member's editor no longer asks for it), so only a coach's preview shows it.
  const lineNow = coach ? base.line.trim() : '';
  const bioNow = base.bio.trim();
  const bizNow = coach ? base.biz.name.trim() : '';
  const coverNow = base.coverUrl;
  const previewEmpty = !lineNow && !bioNow && !(startTitleNow && savedStart) && !bizNow;
  const avatar = !coach && FacetAvatar
    ? <FacetAvatar size={54} c={c} initial={initials} name={name} photo={photo} showRank={false} BG={PAPER} INK={INK} />
    : (
      <span data-cust-round-avatar="" aria-hidden="true" style={{ width: 58, height: 58, flex: 'none', borderRadius: 999, overflow: 'hidden', display: 'grid', placeItems: 'center', background: tTheme.PAPER3 || ink(0.08), boxShadow: `0 0 0 3px ${PAPER}, 0 0 0 4px ${ink(0.14)}, 0 8px 18px -8px rgba(0,0,0,0.5)` }}>
        {photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 25%' }} /> : <span style={{ fontFamily: BS_CLEAN_HEAD, fontSize: 21, fontWeight: 700, color: ink(0.8) }}>{initials}</span>}
      </span>
    );
  // A small lit tag ("UNSAVED CHANGES"): one of the few words that may stay in capitals.
  const tag = (text, on = true) => <span data-cust-tag="" style={{ ...led(on), display: 'inline-block', padding: '4px 9px', borderRadius: 8, fontFamily: BS_CLEAN_SANS, fontSize: 10.5, fontWeight: 750, letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{text}</span>;
  const previewLabel = tr('profile:editor.preview.label', { defaultValue: 'Live preview' });
  const pe = enter(0);
  const preview = (
    <section data-cust-preview="" aria-label={previewLabel} className={pe.className} style={{ ...plate(), ...(pe.style || null), marginBottom: 14 }}>
      <BSGlassEdge t={tTheme} />
      {coverNow ? <div aria-hidden="true" style={{ height: 92, background: `#111 center/cover no-repeat url("${coverNow}")`, boxShadow: 'inset 0 -24px 30px -20px rgba(0,0,0,0.45)' }} /> : null}
      <div style={{ padding: '16px 16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <span style={{ flex: 'none', display: 'grid', placeItems: 'center', width: 62, height: 62 }}>{avatar}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div data-cust-preview-name="" style={{ fontFamily: BS_CLEAN_HEAD, fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.12, color: INK, overflowWrap: 'anywhere' }}>{name || initials}</div>
            {handle || bizNow ? <div style={{ marginTop: 2, fontFamily: BS_CLEAN_SANS, fontSize: 13.5, color: ink(0.62), overflowWrap: 'anywhere' }}>{[handle, bizNow].filter(Boolean).join(' · ')}</div> : null}
          </div>
        </div>
        {!coach && startTitleNow && savedStart ? (
          <p data-cust-preview-start="" style={{ margin: '14px 0 0', fontFamily: BS_CLEAN_SANS, fontSize: 14.5, lineHeight: 1.4, color: INK, overflowWrap: 'anywhere' }}>
            <span style={{ fontWeight: 650 }}>{tr('profile:startLine.trainingFor', { defaultValue: 'Training for' })}</span>
            {` ${startTitleNow}`}
            <span style={{ display: 'block', marginTop: 2, fontSize: 13, color: ink(0.62), fontVariantNumeric: 'tabular-nums' }}>{[startWhen, startDays].filter(Boolean).join(' · ')}</span>
          </p>
        ) : null}
        {lineNow ? <p data-cust-preview-line="" style={{ margin: '12px 0 0', fontFamily: BS_CLEAN_HEAD, fontSize: 15.5, fontWeight: 650, lineHeight: 1.35, color: INK, overflowWrap: 'anywhere' }}>“{lineNow}”</p> : null}
        {bioNow ? <p data-cust-preview-bio="" style={{ margin: '8px 0 0', fontFamily: BS_CLEAN_SANS, fontSize: 14, lineHeight: 1.5, color: ink(0.78), whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{bioNow}</p> : null}
        {previewEmpty ? <p style={{ ...noteS, marginTop: 12, fontSize: 14 }}>{tr('profile:editor.preview.empty', { defaultValue: 'Fill in the parts below. Your profile takes shape here as you type.' })}</p> : null}
        {/* The door to the whole page as visitors see it: a lit pill at the card's foot. */}
        {LiveProfile ? (
          // A compact lit pill (owner, 2026-11-04: "make the box smaller"), 32px drawn inside a 44px target.
          <button type="button" data-cust-live-open="hub" className="bs-cust-btn bs-cust-press" onClick={openPreview}
            style={{ marginTop: 8, minHeight: 44, maxWidth: '100%', padding: 0, border: 0, background: 'transparent', color: 'inherit', display: 'inline-flex', alignItems: 'center', cursor: 'pointer', boxSizing: 'border-box', textAlign: 'left' }}>
            <span style={{ ...led(true), minHeight: 32, maxWidth: '100%', padding: '0 12px 0 10px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 6, boxSizing: 'border-box', fontFamily: BS_CLEAN_SANS, fontSize: 13, fontWeight: 650, lineHeight: 1.2, ...(light ? null : { boxShadow: `${wellIn}, ${glowOf()}` }) }}>
              {custIcon('eye', 15)}<span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{liveOpenLabel}</span>
            </span>
          </button>
        ) : null}
      </div>
    </section>
  );

  // ── The hub's tiles: each area a raised tile with a lit icon well, its name, what is set there, and a
  // lit "Set" or a dim "Add"; Colors shows the look as lit swatches. A tile sinks a hair when pressed. ──
  const iconWell = (k, on) => (
    <span aria-hidden="true" style={{ ...led(on), width: 40, height: 40, flex: 'none', borderRadius: 12, display: 'grid', placeItems: 'center', boxSizing: 'border-box', color: on ? TEAL : ink(0.72), ...(on && !light ? { boxShadow: `${wellIn}, ${glowOf()}`, filter: `drop-shadow(0 0 3px ${hexA(TEAL, 0.6)})` } : null) }}>{custIcon(AREAS[k] ? AREAS[k].icon : k, 19)}</span>
  );
  const status = (on) => (
    <span data-cust-status={on ? 'set' : 'add'} style={{ ...led(on), flex: 'none', padding: '4px 9px', borderRadius: 8, fontFamily: BS_CLEAN_SANS, fontSize: 12, fontWeight: 700, lineHeight: 1.3, whiteSpace: 'nowrap', boxSizing: 'border-box', ...(on && !light ? { boxShadow: `${wellIn}, ${glowOf()}` } : null) }}>
      {on ? tr('profile:editor.status.set', { defaultValue: 'Set' }) : tr('profile:editor.status.add', { defaultValue: 'Add' })}
    </span>
  );
  const tileName = (k) => <span style={{ display: 'block', fontFamily: BS_CLEAN_SANS, fontSize: 16, fontWeight: 650, lineHeight: 1.2, color: INK, overflowWrap: 'anywhere' }}>{AREAS[k].name}</span>;
  const tileSummary = (k) => <span data-cust-summary="" style={{ display: 'block', marginTop: 3, fontFamily: BS_CLEAN_SANS, fontSize: 13, lineHeight: 1.3, color: ink(0.62), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{SUMMARY[k]}</span>;
  // The look as the profile wears it: its paper as a little page, its accent as a lamp.
  const lookPage = paletteOf(shownLook.paper, shownLook.accent);
  const lookSwatches = (
    <span aria-hidden="true" data-cust-swatches="" style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ ...led(isSet('colors')), width: 38, height: 38, padding: 3, borderRadius: 11, boxSizing: 'border-box' }}>
        <span style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, width: '100%', height: '100%', padding: '0 6px', boxSizing: 'border-box', borderRadius: 8, background: lookPage.PAPER_BG }}>
          <span style={{ display: 'block', height: 3, width: '80%', borderRadius: 3, background: lookPage.INK, opacity: 0.85 }} />
          <span style={{ display: 'block', height: 3, width: '55%', borderRadius: 3, background: lookPage.ACCENT }} />
        </span>
      </span>
      <span style={{ ...led(isSet('colors')), width: 30, height: 30, borderRadius: 999, display: 'grid', placeItems: 'center', boxSizing: 'border-box' }}>
        <span style={{ width: 16, height: 16, borderRadius: 999, background: lookWords.accentCol(shownLook.accent), boxShadow: light ? 'inset 0 1px 2px rgba(0,0,0,0.25)' : `0 0 10px ${hexA(lookWords.accentCol(shownLook.accent), 0.8)}` }} />
      </span>
    </span>
  );
  const tileS = { ...plate(), width: '100%', margin: 0, cursor: 'pointer', color: INK, textAlign: 'left', boxSizing: 'border-box' };
  const tile = (k) => {
    const on = isSet(k);
    if (AREAS[k].wide) {
      return (
        <button key={k} type="button" data-cust-row={k} className="bs-cust-btn bs-cust-row" onClick={() => openArea(k)}
          style={{ ...tileS, gridColumn: '1 / -1', minHeight: 76, padding: '14px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
          {iconWell(k, on)}
          <span style={{ flex: 1, minWidth: 0 }}>{tileName(k)}{tileSummary(k)}</span>
          {k === 'colors' ? lookSwatches : null}
          {status(on)}
        </button>
      );
    }
    return (
      <button key={k} type="button" data-cust-row={k} className="bs-cust-btn bs-cust-row" onClick={() => openArea(k)}
        style={{ ...tileS, minHeight: 118, padding: '14px 14px 15px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          {iconWell(k, on || k === 'signal')}
          {k === 'signal' ? null : status(on)}
        </span>
        <span style={{ minWidth: 0 }}>{tileName(k)}{tileSummary(k)}</span>
      </button>
    );
  };
  const re = enter(1);
  const rows = (
    <section data-cust-rows="" className={re.className} style={{ ...(re.style || null) }}>
      <div data-cust-grid="" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        {TILES.map(tile)}
      </div>
      {/* Identity fields (name · @handle · photo · pronouns · goal · link) live in the
          Settings editor — the door is a quiet glass row at the foot, so this page stays
          the one hub for everything the public profile shows. */}
      <button type="button" data-cust-identity="" className="bs-cust-btn bs-cust-row" onClick={() => { closeEditor(); try { window.dispatchEvent(new Event('shape:openProfile')); } catch (e) {} }}
        style={{ ...bsMpGlass(tTheme, INK, { radius: 18 }), width: '100%', minHeight: 60, marginTop: 14, padding: '10px 8px 10px 14px', display: 'flex', alignItems: 'center', gap: 12, color: INK, textAlign: 'left', cursor: 'pointer' }}>
        <span aria-hidden="true" style={{ ...led(false), width: 36, height: 36, flex: 'none', borderRadius: 11, display: 'grid', placeItems: 'center', color: ink(0.72) }}>{custIcon('user', 17)}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontFamily: BS_CLEAN_SANS, fontSize: 15, fontWeight: 650, lineHeight: 1.25, color: INK }}>{tr('profile:editor.identity.title', { defaultValue: 'Name, @handle, photo & details' })}</span>
          <span style={{ display: 'block', marginTop: 2, fontFamily: BS_CLEAN_SANS, fontSize: 13, lineHeight: 1.3, color: ink(0.62) }}>{tr('profile:editor.identity.sub', { defaultValue: 'Pronouns · goal · link — edit in Settings' })}</span>
        </span>
        <span aria-hidden="true" style={{ width: 28, flex: 'none', display: 'grid', placeItems: 'center', color: ink(0.5) }}><BSMpIcon name="chevron" size={18} stroke={2.2} /></span>
      </button>
    </section>
  );
  const hub = (
    <div data-cust-hub="" style={{ padding: `0 ${gutter}px calc(28px + env(safe-area-inset-bottom, 0px))`, maxWidth: 620, margin: '0 auto', boxSizing: 'border-box' }}>
      {/* Masthead row at the standard inset — the editor's title and close sit
          BELOW it (every page opens on the same row). */}
      <div style={{ paddingTop: BS_MAST_TOP_CSS }}>
        {BSMastRow && <BSMastRow trailing={null} />}
      </div>
      <BSCleanType t={tClean}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 0 16px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: BS_CLEAN_SANS, fontSize: 14, fontWeight: 600, color: ink(0.6) }}>{splitHead(tr('profile:editor.eyebrow', { defaultValue: 'Your profile · Editor' }))[0]}</div>
            <h1 id="bs-cust-title" style={{ margin: '2px 0 0', fontFamily: BS_CLEAN_HEAD, fontSize: 32, fontWeight: 750, letterSpacing: '-0.025em', lineHeight: 1.05, color: INK }}>{tr('profile:editor.title', { defaultValue: 'Customize' })}</h1>
          </div>
          <button type="button" data-cust-close="" className="bs-cust-btn bs-cust-press" onClick={closeEditor} aria-label={tr('profile:editor.closeAria', { defaultValue: 'Close' })}
            style={{ ...plate(), width: 44, height: 44, flex: 'none', padding: 0, borderRadius: 999, color: INK, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
            <BSMpIcon name="close" size={18} stroke={2.2} />
          </button>
        </div>
        {preview}
        {rows}
      </BSCleanType>
    </div>
  );

  // ── An area's page: the shared Back and title, its fields grouped on raised plates, its own Save ──
  const saveBar = (
    // Save floats at the foot as the one glowing primary, over a fade into the paper (PAPER, the solid
    // colour: BG is a gradient on Steel). Its edges track the density gutter.
    <div style={{ position: 'sticky', bottom: 0, zIndex: 2, marginLeft: -gutter, marginRight: -gutter, marginTop: 4, padding: `22px ${gutter}px calc(12px + env(safe-area-inset-bottom, 0px))`, background: `linear-gradient(180deg, ${hexA(PAPER, 0)} 0%, ${hexA(PAPER, 0.92)} 38%, ${PAPER} 100%)`, pointerEvents: 'none' }}>
      <button type="button" data-cust-save="" className="bs-cust-btn bs-cust-primary" onClick={() => saveArea(area)} disabled={!dirty || busy || uploading}
        style={{ pointerEvents: 'auto', width: '100%', minHeight: 54, borderRadius: 16, border: 0, background: TEAL, color: onTeal, cursor: (busy || uploading) ? 'wait' : dirty ? 'pointer' : 'default', opacity: dirty ? (uploading ? 0.7 : 1) : 0.45, fontFamily: BS_CLEAN_HEAD, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: dirty ? primaryGlow(TEAL) : 'none' }}>
        {busy ? tr('profile:log.saving', { defaultValue: 'Saving…' }) : <><BSMpIcon name="check" size={18} stroke={2.6} />{tr('profile:editor.save', { defaultValue: 'Save profile' })}</>}
      </button>
    </div>
  );
  const ae = enter(0);
  // The header is the chrome's own (outside the clean type), so an area's title and Back read as every
  // other detail page's do. Each group sits on its own raised plate, the first with the lit edge.
  const areaParts = area && AREAS[area] ? AREAS[area].parts.filter(Boolean) : [];
  // The live preview from an area's page: a quiet raised pill beside the title, its drafts shown unsaved.
  // In the clean type, as the header around it is not (the app's regular weight would thin it).
  const areaLivePill = LiveProfile ? (
    <BSCleanType t={tClean}><button type="button" data-cust-live-open="area" className="bs-cust-btn bs-cust-press" onClick={openPreview} aria-label={liveOpenLabel}
      style={{ ...plate(), flex: 'none', minHeight: 44, padding: '0 15px 0 12px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 7, color: INK, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: BS_CLEAN_SANS, fontSize: 15, fontWeight: 650, boxSizing: 'border-box' }}>
      <span style={{ display: 'grid', color: ink(0.72) }}>{custIcon('eye', 17)}</span><span className="bs-cust-live-word">{liveTitle}</span>
    </button></BSCleanType>
  ) : null;
  const areaBody = area && AREAS[area] ? (
    <div data-cust-area={area}>
      {DetailHeader ? <DetailHeader onBack={leaveArea} title={AREAS[area].name} noCorner trailing={areaLivePill} /> : null}
      <BSCleanType t={tClean}>
        <div style={{ padding: `8px ${gutter}px 0`, maxWidth: 620, margin: '0 auto', boxSizing: 'border-box' }}>
          <div data-cust-card={area} className={ae.className} style={{ ...(ae.style || null), display: 'flex', flexDirection: 'column', gap: 14 }}>
            {AREAS[area].bare ? areaParts : areaParts.map((p, i) => (
              <section key={i} data-cust-plate="" style={{ ...plate(), padding: PLATE_PAD }}>
                {i === 0 ? <BSGlassEdge t={tTheme} /> : null}
                {p}
              </section>
            ))}
          </div>
          {area === 'signal' ? <div style={{ height: 24 }} /> : saveBar}
        </div>
      </BSCleanType>
    </div>
  ) : null;
  // The area's page is a BSPage (its own scroller under the masthead, its Back registered for the swipe);
  // no tab bar sits under the editor, so it keeps no room for one.
  const areaPage = areaBody ? (Page ? <Page tabBarHeight={0}>{areaBody}</Page> : <div className="bs-scroll" style={{ position: 'absolute', inset: 0, overflowY: 'auto' }}>{areaBody}</div>) : null;
  // Leaving with changes not saved: the editor's own raised sheet, over a dim of the page.
  const DANGER = '#b3412b';
  const discardSheet = asking ? (
    <div data-cust-discard="" onClick={keepEditing} style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(8,7,6,0.55)', display: 'flex', alignItems: 'flex-end', padding: `0 ${Math.max(10, gutter - 8)}px calc(12px + env(safe-area-inset-bottom, 0px))`, boxSizing: 'border-box' }}>
      <BSCleanType t={tClean}>
        <div role="alertdialog" aria-modal="true" aria-labelledby="bs-cust-leave-title" aria-describedby="bs-cust-leave-msg" onClick={(e) => e.stopPropagation()} className={motion ? 'bs-cust-in' : undefined}
          style={{ ...plate(), width: '100%', borderRadius: 24, padding: '20px 18px 18px' }}>
          <BSGlassEdge t={tTheme} />
          {tag(tr('profile:editor.leave.eyebrow', { defaultValue: 'Unsaved changes' }))}
          <div id="bs-cust-leave-title" style={{ marginTop: 12, fontFamily: BS_CLEAN_HEAD, fontSize: 21, fontWeight: 700, letterSpacing: '-0.015em', lineHeight: 1.2, color: INK }}>{tr('profile:editor.leave.title', { defaultValue: 'Discard your changes?' })}</div>
          <p id="bs-cust-leave-msg" style={{ ...noteS, marginTop: 6, fontSize: 14.5 }}>{tr('profile:editor.leave.message', { defaultValue: "You haven't saved the changes on this page." })}</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button type="button" data-cust-keep="" className="bs-cust-btn bs-cust-press" onClick={keepEditing} style={{ ...ghost, flex: 1, minWidth: 0, minHeight: 50, alignSelf: 'stretch' }}>{tr('profile:editor.leave.keep', { defaultValue: 'Keep editing' })}</button>
            <button type="button" data-cust-discard-confirm="" className="bs-cust-btn bs-cust-primary" onClick={discardChanges}
              style={{ flex: 1, minWidth: 0, minHeight: 50, borderRadius: 12, border: 0, background: DANGER, color: onColor(DANGER), cursor: 'pointer', fontFamily: BS_CLEAN_SANS, fontSize: 15.5, fontWeight: 700, boxShadow: primaryGlow(DANGER) }}>{tr('profile:editor.leave.discard', { defaultValue: 'Discard' })}</button>
          </div>
        </div>
      </BSCleanType>
    </div>
  ) : null;

  // ── The live preview: the profile page itself, full screen, as a visitor sees it, with the drafts in ──
  // The drafts are every area's fields over the doc as last saved, the look only when it was picked here
  // (the doc a Save of every area would write, never written: nothing here calls saveUserGoals). The page
  // is the client's own (BSTerrainProfile for a member, BSSignalCoachProfile for a coach: the page this
  // editor's coach doc is read by), opened as a visitor's (not isSelf). The member page paints itself in
  // the draft's look (#2611: its paper, accent and crop, as a visitor sees them), so nothing here wraps it;
  // the coach page here reads no look, as for its visitors. A tap on it does nothing but its Back
  // and its tabs (LIVE_PASS), so Follow, Message, a like or a sheet can't write from a preview. Its Back
  // and a swipe right (the page's Back, as on every BSPage) come back here, as Back to editing does.
  const anyDirty = TILES.some(areaDirty);
  let livePage = null;
  if (previewing && LiveProfile) {
    const uid = ownerUid || W.ShapeAuth?.getCachedState?.()?.user?.id || null;
    let draft = { ...saved };
    for (const k of TILES) if (k !== 'signal' && k !== 'colors') Object.assign(draft, areaFields(k, form));
    if (pickChanged || focusChanged) draft.look = { ...(bsProfileLook(saved.look) || {}), ...(pickChanged ? { paper: pick.paper, accent: pick.accent } : {}), ...(focusChanged ? { focus: focusPick } : {}) };
    // As a Save would store it (the wall, the cover and the film bound to the owner); a signed-out preview
    // has no owner, and the page drops what it can't bind as it renders.
    if (uid) draft = bsNormalizeProfileCustom(draft, uid, { filmBucket: filmRoleBucket, filmKey });
    const livePerson = { who: name || initials, init: initials, kind: (who && who.kind) || (coach ? 'TRAINER' : 'CLIENT'), userId: uid, photo: photo || null };
    // Message as a member opening the page sees it; the layer stops the tap, as every other.
    const page = <LiveProfile person={livePerson} previewCustom={draft} onBack={closePreview} onMessage={liveNoop} />;
    // The ground under the page: the draft's paper when the member page paints in one, else the editor's.
    const lookNow = bsProfileLook(draft.look) || {};
    const livePaper = !coach && lookNow.paper ? paletteOf(lookNow.paper, lookNow.accent || seedAccent).PAPER_BG : BG;
    livePage = bsLivePreviewLayer({ t: tTheme, tClean, tr, page, unsaved: anyDirty, paper: livePaper, onBack: closePreview, backRef: liveBackRef, motion });
  }

  return createPortal(
    <>
      {/* Full-page takeover — the customizer owns the screen. The hub scrolls here; an area's page is a
          BSPage, which scrolls itself. Under the live preview it stays as it was, hidden and out of reach. */}
      <div data-cust-root="" className={areaPage ? undefined : 'bs-scroll'} role="dialog" aria-modal="true"
        {...(areaPage ? { 'aria-label': AREAS[area].name } : { 'aria-labelledby': 'bs-cust-title' })}
        aria-hidden={livePage ? true : undefined} inert={livePage ? true : undefined}
        style={{ position: 'absolute', inset: 0, zIndex: 220, background: BG, color: INK, overflowY: areaPage ? 'hidden' : 'auto', overflowX: 'hidden', visibility: livePage ? 'hidden' : undefined, '--cust-teal': TEAL, '--cust-glow': hexA(TEAL, 0.85), '--cust-well': wellIn, '--cust-ph': ink(0.42) }}>
        {areaPage || hub}
        {discardSheet}
      </div>
      {livePage}
    </>,
    (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || document.body
  );
}

// The live preview's Message: drawn as visitors see it, never reached (liveGuard stops the tap).
const liveNoop = () => {};

// What a tap may reach on the live preview: its own bar, the page's Back (the row's and the pinned bar's)
// and its tabs (a member's, the Signal page's, a coach page's). Anything else (Follow, Message, Work with, a
// like, a sheet, a link) is stopped before it lands.
const LIVE_PASS = '[data-cust-live-bar], [data-bs-back], [data-bs-pin-back], [data-terrain-tabs], [data-profile-tabs]';
function liveGuard(e) {
  const el = e && e.target;
  if (el && typeof el.closest === 'function' && el.closest(LIVE_PASS)) return;
  if (e) { e.preventDefault(); e.stopPropagation(); }
}

// ── The live preview's layer: a profile page full screen, the tap guard over it, and the floating bar ──
// Shared by Customize and Make it yours (BSMakeItYours.jsx), so a member's and a coach's preview read and
// behave alike. `page` is the profile page with the drafts in; `t` the editor's theme (the bar is in the
// editor's colours, raised and lit); `unsaved` says "Not saved yet" under "Preview"; `onBack` is Back to
// editing (the page's own Back, and so a swipe right, should call it too); `backRef` takes the focus.
// The bar floats over the page at its foot: at the foot, the page's top (its masthead, Back, cover and
// name) shows as a visitor sees it; over the masthead, the row's corner buttons showed past the bar's
// ends. The page keeps room under its end for a tab bar, which the bar takes.
export function bsLivePreviewLayer({ t = {}, tClean = null, tr, page, unsaved = false, paper = null, onBack, backRef = null, motion = true, zIndex = 221 }) {
  bsCustCss();
  const light = !!t.isLight;
  const INK = t.INK || '#f5f0e6';
  const TEAL = bsWsAccent(t);
  const title = tr('profile:editor.live.title', { defaultValue: 'Preview' });
  const unsavedWord = tr('profile:editor.live.unsaved', { defaultValue: 'Not saved yet' });
  const edge = Math.max(10, (t.padX || 22) - 8);
  const bar = (
    <div className={motion ? 'bs-cust-in' : undefined} style={{ ...bsRaised(t), borderRadius: 18, minHeight: 56, padding: '6px 6px 6px 14px', display: 'flex', alignItems: 'center', gap: 10, boxSizing: 'border-box' }}>
      <BSGlassEdge t={t} />
      <span data-cust-live-state={unsaved ? 'unsaved' : 'saved'} style={{ flex: '1 1 0', minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: BS_CLEAN_HEAD, fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.2, color: INK, overflowWrap: 'anywhere' }}>{title}</span>
        {unsaved ? <span style={{ display: 'block', marginTop: 1, fontFamily: BS_CLEAN_SANS, fontSize: 13, fontWeight: 600, lineHeight: 1.25, color: TEAL, textShadow: light ? 'none' : `0 0 8px ${hexA(TEAL, 0.7)}`, overflowWrap: 'anywhere' }}>{unsavedWord}</span> : null}
      </span>
      <button ref={backRef} type="button" data-cust-live-back="" data-bs-back="" className="bs-cust-btn bs-cust-primary" onClick={onBack}
        style={{ flex: '0 1 auto', maxWidth: '62%', minHeight: 44, padding: '6px 14px', borderRadius: 999, border: 0, background: TEAL, color: onColor(TEAL), cursor: 'pointer', fontFamily: BS_CLEAN_SANS, fontSize: 15, fontWeight: 700, lineHeight: 1.15, textAlign: 'center', overflowWrap: 'anywhere', boxShadow: `0 12px 28px -12px ${hexA(TEAL, 0.85)}, inset 0 1px 0 rgba(255,255,255,0.35)` }}>
        {tr('profile:editor.live.back', { defaultValue: 'Back to editing' })}
      </button>
    </div>
  );
  return (
    <div data-cust-live="" role="dialog" aria-modal="true" aria-label={unsaved ? `${title} · ${unsavedWord}` : title} onClickCapture={liveGuard}
      style={{ position: 'absolute', inset: 0, zIndex, background: paper || t.PAPER_BG || t.PAPER || '#0f0e0c', overflow: 'hidden', '--cust-teal': TEAL, '--cust-glow': hexA(TEAL, 0.85) }}>
      {page}
      <div data-cust-live-bar="" style={{ position: 'absolute', zIndex: 70, bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', left: edge, right: edge }}>
        {tClean ? <BSCleanType t={tClean}>{bar}</BSCleanType> : bar}
      </div>
    </div>
  );
}
