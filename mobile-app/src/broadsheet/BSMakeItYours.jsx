import React from 'react';
import { createPortal } from 'react-dom';
import {
  bsProfileLook, bsProfileCover, bsNormalizeProfileCustom,
  BS_KITCHEN_RULES_MAX, BS_KITCHEN_RULE_MAX, BS_KITCHEN_STAPLES_MAX, BS_STAPLE_MAX, BS_KITCHEN_RECIPES_MAX, BS_RECIPE_TITLE_MAX, BS_RECIPE_NOTE_MAX,
  BS_RECIPE_INGS_MAX, BS_RECIPE_ING_MAX, BS_RECIPE_QTY_MAX, BS_RECIPE_STEPS_MAX, BS_RECIPE_STEP_MAX, BS_RECIPE_NUMS, bsKitchenRecipeItem, bsProfileKitchen, bsCleanText,
  BS_ABOUT_STORY_MAX, BS_ABOUT_FACT_MAX, BS_ABOUT_YEARS_MAX, BS_ABOUT_HOW, BS_PROFILE_LINK_KEYS, BS_LINK_MAX, BS_PROMPTS_MAX, BS_PROMPT_A_MAX, BS_COACH_PROMPTS,
  BS_ABOUT_LIST_MAX, BS_ABOUT_ITEM_MAX, BS_ABOUT_YEAR_MIN, bsProfileAbout, bsProfileLinks, bsProfilePrompts, bsProfileLinkHref, bsPromptLabel, bsPromptToken,
  BS_FOCUS_MAX, BS_FOCUS_WORD_MAX, BS_FOCUS_PRESETS, BS_PICKS_MAX, BS_DESC_MAX, BS_FOR_WORDS_MAX, BS_FOR_PRESETS,
  bsProfileFocus, bsProfilePicks, bsProfileDescriptions, bsProfileProgramFor,
  BS_FILM_CAPTION_MAX, BS_BIZ_NAME_MAX, BS_BIZ_WHERE_MAX, BS_BIZ_HOURS_MAX, BS_BIZ_HANDLE_MAX, BS_PINNED_REVIEWS_MAX,
  BS_PIN_TITLE_MAX, BS_PIN_NOTE_MAX, BS_PIN_METRIC_MAX, BS_SONG_LABEL_MAX, BS_HERO_STATS_MAX, BS_COACH_FILM_MAX_MB, BS_PIN_KINDS,
  bsProfileFilm, bsProfileBizCard, bsProfilePinnedReviews, bsProfilePinned, bsProfileSong, bsSpotifyEmbed, bsPinKindLabel,
  BS_PUBLIC_STATS, bsProfilePublicStats,
} from '../services/profileCustom.mjs';
import { BS_COACH_STATS, bsCoachHeadlineKeys } from '../services/coachWork.mjs';
import { bsFocusWordLabel, bsStudioForLabel } from './BSCoachStudio.jsx';
import { bsSplitPaste, bsSplitLongStep } from '../services/clientRecipes.mjs';
import { bsCoachFirstName } from '../services/coachPronoun.mjs';
import { BSLookPicker, BSLookBezel, bsLookPreviewTag, paletteOf, onColor, hexA } from './BSLookPicker.jsx';
// The live preview's layer (the page full screen, its tap guard and the floating bar), Customize's own.
import { bsLivePreviewLayer } from './BSProfileCustomizer.jsx';
import { BS_CLEAN_HEAD, BS_CLEAN_SANS } from './bsCleanType.jsx';
import { bsWsLed } from './bsMagazine.mjs';
import { bsDialogRef } from '../services/dialogBack.mjs';

// ─── MAKE IT YOURS: the coach's profile editor ────────────────────────────────────────────────
// Owner, 2026-10-27 (the R7 canvas), then 2026-11-04 (the Studio tab as the coach's work, then
// Spotlight: "Show them on coach pages"): five tabs. Colors and Wall photo sit under a live preview
// of the profile's top.
//
//   Colors       Shape's own papers and accents (the app's makePalette, nothing custom), with a
//                few starting looks, and a check that the accent reads on the paper.
//   Wall photo   the big photo behind the avatar: one of the coach's listing photos or their own
//                upload, and which part stays in view.
//   Programs     (a trainer's) one optional line, up to 140 characters, under each thing they sell:
//                each program, each workout (a program's day or a posted video) and the coaching
//                offer, with what members see when it is left blank; and who each program is for.
//                What they sell comes in as `work`, read by the profile.
//   Your kitchen (a nutritionist's, in place of Programs) the page's three parts: up to six recipes
//                of their own (written or pasted, with a photo, their note, the numbers, the
//                ingredients and the method, in the order they put them), the plate they teach and
//                their portion rules, and their staples.
//   Spotlight    what the old editors offered and no coach page showed until 2026-11-04: an intro film
//                (their own upload to coach-media), up to three headline stats (figures their page
//                already has, `figures`), a pinned highlight, a profile song (a Spotify link) and up
//                to three of their members' reviews pinned to the front of What clients say; and
//                What's public (owner, 2026-11-09): which of the figures Shape records for them a
//                visitor sees (`publicStats`), none until they turn one on.
//   About me     for a trainer, first what members read under their name: a preview, up to four
//                focus words (a preset, stored as its token, or their own) and up to two workouts
//                they would start a member on (their picks); then, for every coach, the story, the
//                details, accolades and education, the questions members ask, their socials, and
//                their practice's card (its name and place show under their name, its hours and
//                where to find them on About me).
//
// The floor plan a trainer drew (Your space, gone 2026-11-04: "too confusing for people") and a
// nutritionist's kitchen layout (gone 2026-10-31) are no longer edited here; a `studio` saved before
// rides through every save as stored, as any key this editor did not change.
//
// What it writes: whichever of `look`, `cover`, `kitchen`, `about`, `prompts`, `links`, `headLinks`,
// `focus`, `picks`, `descriptions`, `programFor`, `film`, `heroStats`, `pinned`, `song`,
// `pinnedReviews`, `bizCard` and `publicStats` the coach changed here, in the profile_custom
// doc, merged onto the doc as it is at save time (re-read for this account, so a key saved
// elsewhere since this opened is kept; no read, no save), through the same normalizer every
// surface uses. Nothing is saved until Save. The profile opens it only on the coach's doc as read,
// never on defaults.
//
// In the signed-out demo (`demo`), Save changes the page on screen and nothing else: no read, no
// write, the wall photo is one of the demo's own (`photos`), its film one of its own clips (`clips`)
// and its wins wall picked from its own sample reviews (`reviews`); an upload asks to sign in.
//
// The editor's own chrome is the app's dark editor (it does not repaint as colours change); the
// preview card at the top is painted in the colours being picked.
//
// View live preview (owner, 2026-11-04: "make sure coaches have the view live profile preview button"):
// a lit pill under each tab's title opens the coach's real page (BSTrainerProfile, read off window: it
// imports this module) full screen as members see it, with what is changed here and not saved yet on it
// (withChanges over the doc as opened). Customize's layer draws it (bsLivePreviewLayer): a tap does
// nothing but the page's Back and tabs and the bar, and nothing is read for it or written. Back to
// editing, the page's ← and a swipe right come back here, the editor as it was, every edit kept.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME (makePalette, ShapeCommunity, shapeDb, ShapeAuth, BSTrainerProfile).

function useShapeTr() {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const unsub = window.ShapeLocale?.subscribe?.(() => force((n) => n + 1));
    return typeof unsub === 'function' ? unsub : undefined;
  }, []);
  return (key, opts) => {
    const v = window.ShapeI18n?.t?.(key, opts);
    return (v == null || v === key) ? (opts?.defaultValue ?? key) : v;
  };
}

function intlLocale() {
  try { return window.ShapeI18n?.intlLocale?.() || window.ShapeI18n?.current?.() || undefined; } catch (e) { return undefined; }
}

// The editor's chrome: dark, with the editor's teal.
const E = { BG: '#0f0e0c', BG2: '#181612', BG3: '#221d18', INK: '#f5f0e6', ED: '#34d6c5', ON_ED: '#0b0d0c', WARN: '#e3a544', ERR: '#e06547' };
const ea = (n) => `rgba(245,240,230,${n})`;
const MONO = "'JetBrains Mono', ui-monospace, monospace";
const DISPLAY = "'Saira', 'Space Grotesk', -apple-system, system-ui, sans-serif";
const BODY = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif";
const RING = `0 0 0 2px ${E.BG}, 0 0 0 4px ${E.ED}`;

// The palette helpers (paletteOf, hexA, onColor and the rest) are BSLookPicker.jsx's, which the Colors page draws.
const FOCUS_POS = { top: 'center 22%', center: 'center 50%', bottom: 'center 80%' };
const signedInUid = () => { try { return window.ShapeAuth?.getCachedState?.()?.user?.id || null; } catch (e) { return null; } };
const sameJson = (a, b) => JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b);

function Eyebrow({ children, right }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginTop: 22, marginBottom: 10 }}>
      <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: ea(0.6) }}>{children}</span>
      {right ? <span style={{ fontSize: 12.5, color: ea(0.7) }}>{right}</span> : null}
    </div>
  );
}
// Five or more (the editor's own tabs since Spotlight joined them) share the row by what their words
// need rather than in equal parts, at 12.5px, so "Wall photo" and "Your kitchen" keep to one line where
// the row has room; a longer translation wraps inside its pill.
function Seg({ options, value, onChange, label }) {
  const many = options.length > 4;
  return (
    <div role="group" aria-label={label} style={many
      ? { display: 'flex', gap: 2, padding: 3, borderRadius: 999, border: `1px solid ${ea(0.2)}` }
      : { display: 'grid', gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`, gap: 3, padding: 3, borderRadius: 999, border: `1px solid ${ea(0.2)}` }}>
      {options.map(([k, l]) => {
        const on = k === value;
        return <button key={k} type="button" aria-pressed={on} onClick={() => onChange(k)} style={{ ...(many ? { flex: '1 1 auto' } : null), minHeight: 38, minWidth: 0, padding: many ? '0 6px' : '0 4px', border: 0, borderRadius: 999, background: on ? E.INK : 'transparent', color: on ? E.BG : ea(0.8), fontFamily: DISPLAY, fontSize: many ? 12.5 : options.length > 3 ? 13 : 14, lineHeight: 1.15, fontWeight: on ? 600 : 400, cursor: 'pointer' }}>{l}</button>;
      })}
    </div>
  );
}
const field = { width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '0 12px', borderRadius: 10, border: `1px solid ${ea(0.2)}`, background: E.BG2, color: E.INK, fontFamily: BODY, fontSize: 15, outline: 'none' };
const smallBtn = { minHeight: 40, padding: '0 12px', borderRadius: 10, border: `1px solid ${ea(0.22)}`, background: 'transparent', color: E.INK, fontFamily: DISPLAY, fontSize: 14, fontWeight: 600, cursor: 'pointer' };

// ── The preview: the top of the profile, painted in the look being picked ──────────────────
// Its tabs work (owner, 2026-10-31: "these dont work", of The studio and Replays): each shows what
// that part of the page holds, and the Studio opens Programs, the kitchen its own editor. The card says it is
// a preview, so the buttons drawn on it read as the page's, not as controls here.
// `lit`: on the Colors page, the card sits in the lit panel's raised bezel with a lit PREVIEW tag.
function Preview({ tr, look, wall, who, words, nutri = false, onEdit = null, lit = false }) {
  const P = paletteOf(look.paper, look.accent);
  const ACC = P.ACCENT;
  const ink = (n) => `rgba(${P.inkRGB},${n})`;
  const [pv, setPv] = React.useState(0);
  const tabLabels = [words.day, nutri ? (words.kitchen || tr('profile:nutri.kitchenName', { defaultValue: "{name}'s kitchen", name: who.first })) : tr('profile:trainer.tabStudio', { defaultValue: 'Studio' }), nutri ? tr('profile:nutri.tabPlateNotes', { defaultValue: 'Plate notes' }) : tr('profile:trainer.tabReplays', { defaultValue: 'Replays' })];
  const note = (text, editKey, editLabel) => (
    <div data-mine-preview-panel={pv} style={{ marginTop: 10, minHeight: 40, padding: '8px 10px', border: `1px solid ${ink(0.16)}`, display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ flex: 1, fontSize: 12.5, lineHeight: 1.35, color: ink(0.78) }}>{text}</span>
      {editKey && onEdit ? <button type="button" onClick={() => onEdit(editKey)} style={{ flex: 'none', minHeight: 32, padding: '0 2px', border: 0, background: 'transparent', color: ACC, fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>{editLabel} →</button> : null}
    </div>
  );
  const card = (
    <div data-mine-preview="" style={{ marginTop: lit ? 0 : 14, borderRadius: lit ? 13 : 16, overflow: 'hidden', background: P.PAPER_BG, color: P.INK, border: `1px solid ${ea(0.14)}` }}>
      <div style={{ position: 'relative', height: 92, background: wall ? '#111' : `linear-gradient(135deg, ${hexA(ACC, 0.42)}, ${P.PAPER2} 70%)` }}>
        {wall ? <img src={wall} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: FOCUS_POS[look.focus] || FOCUS_POS.center }} /> : null}
        <span data-mine-preview-tag={lit ? 'lit' : ''} style={{ position: 'absolute', top: 8, right: 8, fontFamily: MONO, fontSize: 8.5, textTransform: 'uppercase', ...(lit ? bsLookPreviewTag() : { padding: '4px 7px', borderRadius: 4, background: 'rgba(0,0,0,0.55)', color: '#fff', fontWeight: 700, letterSpacing: '0.16em' }) }}>{tr('profile:mine.previewLabel', { defaultValue: 'Preview' })}</span>
      </div>
      <div style={{ position: 'relative', padding: '0 14px 14px' }}>
        <div style={{ position: 'absolute', left: 14, top: -30, width: 60, height: 60, borderRadius: 99, border: `3px solid ${P.PAPER}`, background: P.PAPER2, overflow: 'hidden', display: 'grid', placeItems: 'center', boxSizing: 'border-box' }}>
          {who.photo ? <img src={who.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 20 }}>{String(who.name || '?').slice(0, 1)}</span>}
        </div>
        <div style={{ marginLeft: 70, paddingTop: 6, minHeight: 34 }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 17, lineHeight: 1.1 }}>{who.name}<span style={{ color: ACC }}>.</span></div>
          {who.roleLine ? <div style={{ fontSize: 11.5, color: ink(0.7) }}>{who.roleLine}</div> : null}
        </div>
        <div aria-hidden style={{ marginTop: 10, display: 'flex', gap: 6 }}>
          <span style={{ flex: 1.2, minHeight: 32, display: 'grid', placeItems: 'center', background: ACC, color: onColor(ACC), fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 600 }}>{tr('profile:trainer.message', { defaultValue: 'Message {name}', name: who.first })}</span>
          <span style={{ flex: 1, minHeight: 32, display: 'grid', placeItems: 'center', border: `1px solid ${ink(0.22)}`, fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 600 }}>{words.work}</span>
        </div>
        <div style={{ marginTop: 10, display: 'flex', borderBottom: `1px solid ${ink(0.16)}`, fontFamily: DISPLAY, fontSize: 12.5 }}>
          {tabLabels.map((l, i) => (
            <button key={i} type="button" aria-pressed={pv === i} onClick={() => setPv(i)} style={{ flex: '1 1 auto', minWidth: 0, minHeight: 34, padding: '6px 4px', border: 0, borderBottom: `2px solid ${pv === i ? ACC : 'transparent'}`, marginBottom: -1, background: 'transparent', color: pv === i ? P.INK : ink(0.55), fontFamily: DISPLAY, fontSize: 12.5, fontWeight: pv === i ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}>{l}</button>
          ))}
        </div>
        {pv === 1 ? (nutri
          ? note(tr('profile:mine.previewKitchen', { defaultValue: 'Your kitchen, recipes, plate and staples show here.' }), 'kitchen', tr('profile:mine.previewEditKitchen', { defaultValue: 'Edit your kitchen' }))
          : note(tr('profile:mine.previewStudio', { defaultValue: 'Your programs, workouts and coaching show here, with the lines you write for them.' }), 'programs', tr('profile:mine.previewEditStudio', { defaultValue: 'Write them' })))
        : pv === 2 ? (nutri
          ? note(tr('profile:mine.previewPlates', { defaultValue: 'The meals you share with clients show here, by day.' }))
          : note(tr('profile:mine.previewReplays', { defaultValue: 'Replays, workouts and programs you publish show here.' })))
        : (
          <div aria-hidden data-mine-preview-panel={0} style={{ marginTop: 10, minHeight: 40, padding: '6px 10px', border: `1.5px dashed ${ACC}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: MONO, fontSize: 10.5, color: ink(0.7) }}>8:00</span>
            <span style={{ flex: 1, fontSize: 12.5 }}><b style={{ fontWeight: 600 }}>{tr('profile:trainer.open', { defaultValue: 'Open' })}</b> · {tr('profile:mine.previewIntro', { defaultValue: 'Free intro call' })}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: ACC }}>{tr('profile:trainer.take', { defaultValue: 'Take it →' })}</span>
          </div>
        )}
      </div>
    </div>
  );
  // On the Colors page the card is the panel's screen, in a raised bezel (BSLookPicker's).
  return lit ? <BSLookBezel style={{ marginTop: 14 }}>{card}</BSLookBezel> : card;
}

// A ruled field (owner, 2026-11-04, the Studio round's editor): a 1px rule, a kicker in capitals with
// what sits on its right, then the field. Programs and About me's focus and picks use it.
const KICK = { fontFamily: MONO, fontSize: 9.5, fontWeight: 500, lineHeight: 1.3, letterSpacing: '0.13em', textTransform: 'uppercase', color: ea(0.55), whiteSpace: 'nowrap' };
function Ruled({ kicker, sub = null, right = null, children, ...rest }) {
  return (
    <div {...rest} style={{ marginTop: 18, paddingTop: 11, borderTop: `1px solid ${ea(0.2)}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <span style={{ ...KICK, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}><b style={{ fontWeight: 700, color: E.INK }}>{kicker}</b>{sub ? <> · {sub}</> : null}</span>
        {right != null ? <span style={{ ...KICK, flex: 'none' }}>{right}</span> : null}
      </div>
      {children}
    </div>
  );
}
const hintStyle = { margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.4, color: ea(0.66) };

// ── Colors ──────────────────────────────────────────────────────────────────────────────────
// The Colors page: the lit panel the owner picked (2026-11-04: "update profile edit settings page", then
// "B for colors"), BSLookPicker.jsx.
function ColorsTab({ tr, look, setLook }) {
  return <BSLookPicker tr={tr} look={look} setLook={setLook} />;
}

// ── Wall photo ──────────────────────────────────────────────────────────────────────────────
function WallTab({ tr, look, setLook, wall, setWall, choices, uploading, onUpload, noUpload = null }) {
  const fileRef = React.useRef(null);
  const tiles = [];
  const seen = new Set();
  for (const url of [wall, ...choices]) if (url && !seen.has(url)) { seen.add(url); tiles.push(url); }
  return (
    <div>
      <Eyebrow>{tr('profile:mine.pickPhoto', { defaultValue: 'Pick a photo' })}</Eyebrow>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif" onChange={onUpload} style={{ display: 'none' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        <button type="button" onClick={() => { if (uploading) return; if (noUpload) { noUpload(); return; } if (fileRef.current) fileRef.current.click(); }} disabled={uploading}
          style={{ height: 84, borderRadius: 10, border: `1.5px dashed ${ea(0.35)}`, background: 'transparent', color: E.INK, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: uploading ? 'wait' : 'pointer', fontSize: 12.5 }}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>＋</span>{uploading ? tr('profile:mine.uploading', { defaultValue: 'Uploading…' }) : tr('profile:mine.upload', { defaultValue: 'Upload yours' })}
        </button>
        <button type="button" aria-pressed={!wall} onClick={() => setWall(null)}
          style={{ height: 84, borderRadius: 10, border: `1px solid ${ea(0.16)}`, background: `linear-gradient(135deg, ${hexA(paletteOf(look.paper, look.accent).ACCENT, 0.45)}, ${E.BG2} 70%)`, color: E.INK, boxShadow: !wall ? RING : 'none', cursor: 'pointer', fontSize: 12.5 }}>
          {tr('profile:mine.noPhoto', { defaultValue: 'Your colors' })}
        </button>
        {tiles.map((url) => (
          <button key={url} type="button" data-wall-choice="" aria-pressed={url === wall} aria-label={tr('profile:mine.usePhoto', { defaultValue: 'Use this photo' })} onClick={() => setWall(url)}
            style={{ height: 84, padding: 0, borderRadius: 10, border: 0, overflow: 'hidden', background: '#111', boxShadow: url === wall ? RING : 'none', cursor: 'pointer' }}>
            <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </button>
        ))}
      </div>
      <Eyebrow>{tr('profile:mine.keepInView', { defaultValue: 'Keep in view' })}</Eyebrow>
      <Seg label={tr('profile:mine.keepInView', { defaultValue: 'Keep in view' })} value={look.focus || 'center'} onChange={(k) => setLook({ ...look, focus: k })}
        options={[['top', tr('profile:mine.focusTop', { defaultValue: 'Top' })], ['center', tr('profile:mine.focusCenter', { defaultValue: 'Center' })], ['bottom', tr('profile:mine.focusBottom', { defaultValue: 'Bottom' })]]} />
      <p style={{ margin: '12px 0 0', fontSize: 13, lineHeight: 1.45, color: ea(0.62) }}>{tr('profile:mine.wallHint', { defaultValue: 'Wide photos work best. Your listing photos show here too.' })}</p>
    </div>
  );
}

// ── Your kitchen (a nutritionist's) ─────────────────────────────────────────────────────────
// The same three parts the page shows, in its order: their recipes (written here: a name, a photo,
// their note, the time, servings and a serving's macros, the ingredients and the method, or a pasted
// recipe laid out to check), the plate they teach (a starting split, then vegetables, protein and
// carbs in steps of five that always add up to 100, and their portion rules), and their staples
// (each in the fridge, the pantry or the freezer).
const PLATE_PRESETS = [['everyday', { veg: 50, protein: 25, carbs: 25 }], ['training', { veg: 35, protein: 30, carbs: 35 }], ['lighter', { veg: 50, protein: 35, carbs: 15 }]];
const PLATE_PARTS = [['veg', 'partVeg', 'Vegetables'], ['protein', 'partProtein', 'Protein'], ['carbs', 'partCarbs', 'Carbs']];
// One part up or down by five, balanced against the rest of the plate so it always adds up to 100:
// vegetables are the rest, so protein and carbs move against them (then each other), and vegetables
// move against carbs, then protein.
const PLATE_BALANCE = { veg: ['carbs', 'protein'], protein: ['veg', 'carbs'], carbs: ['veg', 'protein'] };
function nudgePlate(plate, key, by) {
  const next = { ...plate };
  const v = next[key] + by;
  if (v < 0 || v > 100) return plate;
  next[key] = v;
  let owe = by;
  for (const k of PLATE_BALANCE[key]) {
    if (!owe) break;
    const take = by > 0 ? Math.min(owe, next[k]) : Math.max(owe, next[k] - 100);
    next[k] -= take; owe -= take;
  }
  return owe ? plate : next;
}
// The editor's parts: the page's three. The kitchen's layout went (owner, 2026-10-31: "i dont think
// this concept makes sense for nutritionist profiles").
const KITCHEN_PARTS = [['recipes', 'secRecipes', 'Recipes'], ['plate', 'secPlate', 'Plate'], ['staples', 'secStaples', 'Staples']];
// A recipe's numbers as the form asks for them: [key, label key, English]. Their ranges are BS_RECIPE_NUMS.
const RECIPE_NUM_FIELDS = [['min', 'profile:mine.recipeMin', 'Minutes'], ['serves', 'nutrition:myRecipe.servings', 'Serves'], ['kcal', 'profile:mine.recipeKcal', 'kcal'], ['p', 'profile:mine.recipeP', 'Protein (g)'], ['c', 'profile:mine.recipeC', 'Carbs (g)'], ['f', 'profile:mine.recipeF', 'Fat (g)']];
const newRecipeId = () => (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).replace(/[^a-z0-9]/g, '').slice(0, 24);
// A stored recipe as the form edits it (every number as text), and back.
const draftOf = (r) => ({
  id: r ? r.id : newRecipeId(), isNew: !r, t: r ? r.t : '', note: (r && r.note) || '', photo: (r && r.photo) || null,
  ...Object.fromEntries(RECIPE_NUM_FIELDS.map(([k]) => [k, r && Number.isFinite(r[k]) ? String(r[k]) : ''])),
  ing: r && r.ing ? r.ing.map((g) => ({ n: g.n || '', m: g.m })) : [{ n: '', m: '' }],
  steps: r && r.steps ? r.steps.slice() : [''],
});
const wholeOf = (v) => { const x = String(v || '').trim(); if (!x) return undefined; const n = Number(x.replace(',', '.')); return Number.isFinite(n) ? Math.round(n) : undefined; };
export function bsRecipeFromDraft(d, ownerUid) {
  return bsKitchenRecipeItem({
    id: d.id, t: d.t, note: d.note, photo: d.photo,
    ...Object.fromEntries(RECIPE_NUM_FIELDS.map(([k]) => [k, wholeOf(d[k])])),
    ing: d.ing, steps: d.steps,
  }, ownerUid);
}

function RecipeForm({ tr, draft, setDraft, owner, uploadPhoto, onDone, onCancel, onRemove = null }) {
  const [sure, setSure] = React.useState(false); // Remove asked once, then confirmed
  const [paste, setPaste] = React.useState(null); // null (closed) | the pasted text
  const [reading, setReading] = React.useState(false);
  const [note, setNote] = React.useState(null);
  const [photoBusy, setPhotoBusy] = React.useState(false);
  // A layout note stays while the form is open; an error goes once the coach changes something.
  // Every change merges into the draft as it is then, so a photo that finishes uploading after
  // other edits never puts back the draft it started from; and only into the draft it was made
  // for, so a read or an upload that lands after Cancel changes nothing (Codex P2 ×2 on #2497).
  const set = (patch, forId = draft.id) => {
    setNote((n) => (n && n[0] === 'err' ? null : n));
    setDraft((cur) => (cur && cur.id === forId ? { ...cur, ...patch } : cur));
  };
  // Each paste read is numbered; closing the paste box makes a read still out stale.
  const pasteRun = React.useRef(0);
  const fromPaste = async () => {
    const text = String(paste || '').trim();
    if (!text || reading) return;
    const forId = draft.id;
    const run = ++pasteRun.current;
    setReading(true); setNote(null);
    let got = null, ai = false;
    try {
      const res = window.ShapeRecipeImport && window.ShapeRecipeImport.parse ? await window.ShapeRecipeImport.parse(text) : null;
      if (res && res.ok && res.draft) { got = res.draft; ai = true; }
    } catch (e) { /* the phone's own split below */ }
    if (run !== pasteRun.current) return;
    if (!got) got = bsSplitPaste(text);
    setReading(false);
    let ing = (got.ingredients || []).map((g) => ({ n: String((g && g.n) || ''), m: String((g && g.m) || '') })).filter((g) => g.m.trim());
    let steps = (got.steps || []).map((x) => String(typeof x === 'string' ? x : (x && x.t) || '')).filter((x) => x.trim()).flatMap((x) => bsSplitLongStep(x, BS_RECIPE_STEP_MAX));
    // A pasted recipe starts with its name: the phone's own split files that line as an ingredient
    // or a step, so with no name read, the first line is the name.
    let title = String(got.title || '').trim();
    const firstLine = (text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) || '');
    if (!title && firstLine) {
      if (ing[0] && !ing[0].n && ing[0].m.trim() === firstLine) { title = firstLine; ing = ing.slice(1); }
      else if (steps[0] && steps[0].trim() === firstLine) { title = firstLine; steps = steps.slice(1); }
    }
    // More than the recipe holds is said, not dropped quietly.
    const over = ing.length > BS_RECIPE_INGS_MAX || steps.length > BS_RECIPE_STEPS_MAX;
    ing = ing.slice(0, BS_RECIPE_INGS_MAX);
    steps = steps.slice(0, BS_RECIPE_STEPS_MAX);
    if (!ing.length && !steps.length) { setNote(['err', tr('profile:mine.pasteFailed', { defaultValue: "Couldn't find a recipe in that. Fill it in by hand." })]); return; }
    setDraft((cur) => (cur && cur.id === forId ? {
      ...cur,
      t: cur.t.trim() ? cur.t : title,
      serves: cur.serves || (Number.isInteger(got.servings) && got.servings > 0 ? String(got.servings) : ''),
      ing: ing.length ? ing : cur.ing,
      steps: steps.length ? steps : cur.steps,
    } : cur));
    setPaste(null);
    if (over) { setNote(['err', tr('profile:mine.pasteOver', { defaultValue: 'Only the first {ing} ingredients and {steps} steps fit. Check what was left out.', ing: BS_RECIPE_INGS_MAX, steps: BS_RECIPE_STEPS_MAX })]); return; }
    setNote(['ok', ai ? tr('profile:mine.pasteAI', { defaultValue: 'Laid out from your paste by AI. Check every line.' }) : tr('profile:mine.pasteLocal', { defaultValue: 'Laid out from your paste. Check every line.' })]);
  };
  const onPhoto = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file || photoBusy) return;
    const forId = draft.id;
    setPhotoBusy(true);
    const url = await uploadPhoto(file);
    setPhotoBusy(false);
    if (url) set({ photo: url }, forId);
  };
  const done = () => {
    // The save keeps only a whole number in its range and drops anything else without a
    // word, so a number it would drop keeps the form open and says which one.
    const bad = RECIPE_NUM_FIELDS.find(([k]) => {
      if (!String(draft[k] || '').trim()) return false;
      const n = wholeOf(draft[k]);
      return n === undefined || n < BS_RECIPE_NUMS[k][0] || n > BS_RECIPE_NUMS[k][1];
    });
    if (bad) {
      const [k, key, en] = bad;
      setNote(['err', tr('profile:mine.errRecipeNum', { defaultValue: '{field}: enter a number from {min} to {max}.', field: tr(key, { defaultValue: en }), min: BS_RECIPE_NUMS[k][0], max: BS_RECIPE_NUMS[k][1] })]);
      return;
    }
    // So is text longer than its field: a paste can set it past the box's own limit.
    const longer = (v, max) => bsCleanText(v).length > max;
    if (longer(draft.t, BS_RECIPE_TITLE_MAX)) { setNote(['err', tr('profile:mine.errTitleLong', { defaultValue: 'The name is too long: {max} characters at most.', max: BS_RECIPE_TITLE_MAX })]); return; }
    const ingAt = draft.ing.findIndex((g) => g.m.trim() && longer(g.m, BS_RECIPE_ING_MAX));
    if (ingAt >= 0) { setNote(['err', tr('profile:mine.errIngLong', { defaultValue: 'Ingredient {n} is too long: {max} characters at most.', n: ingAt + 1, max: BS_RECIPE_ING_MAX })]); return; }
    const qtyAt = draft.ing.findIndex((g) => g.m.trim() && longer(g.n, BS_RECIPE_QTY_MAX));
    if (qtyAt >= 0) { setNote(['err', tr('profile:mine.errQtyLong', { defaultValue: 'The amount for ingredient {n} is too long: {max} characters at most.', n: qtyAt + 1, max: BS_RECIPE_QTY_MAX })]); return; }
    const stepAt = draft.steps.findIndex((x) => longer(x, BS_RECIPE_STEP_MAX));
    if (stepAt >= 0) { setNote(['err', tr('profile:mine.errStepLong', { defaultValue: 'Step {n} is too long: {max} characters at most. Split it in two.', n: stepAt + 1, max: BS_RECIPE_STEP_MAX })]); return; }
    const r = bsRecipeFromDraft(draft, owner);
    if (!r) { setNote(['err', tr('nutrition:myRecipe.errNoName', { defaultValue: 'Give it a name first.' })]); return; }
    onDone(r);
  };
  const rowBtn = { ...smallBtn, width: 40, padding: 0, flex: 'none' };
  return (
    <div data-recipe-form="">
      <span style={{ display: 'block', marginBottom: 10, fontFamily: DISPLAY, fontSize: 18, fontWeight: 600 }}>{draft.isNew ? tr('profile:nutri.writeRecipe', { defaultValue: 'Write a recipe' }) : draft.t || tr('profile:nutri.writeRecipe', { defaultValue: 'Write a recipe' })}</span>
      {paste == null ? (
        <button type="button" data-recipe-paste="" onClick={() => setPaste('')} style={{ ...smallBtn, width: '100%', borderStyle: 'dashed' }}>{tr('nutrition:myRecipe.paste', { defaultValue: 'Paste the recipe' })}</button>
      ) : (
        <div>
          <textarea value={paste} onChange={(e) => setPaste(e.target.value.slice(0, 12000))} rows={6} aria-label={tr('nutrition:myRecipe.paste', { defaultValue: 'Paste the recipe' })}
            placeholder={tr('nutrition:myRecipe.pastePlaceholder', { defaultValue: 'Ingredients and method — paste it however it comes.' })} style={{ ...field, minHeight: 120, padding: 12, lineHeight: 1.4, resize: 'vertical' }} />
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button type="button" data-paste-fill="" onClick={fromPaste} disabled={reading || !String(paste).trim()} style={{ ...smallBtn, flex: 1, background: E.ED, color: E.ON_ED, border: 0, opacity: reading || !String(paste).trim() ? 0.6 : 1 }}>{reading ? tr('nutrition:myRecipe.reading', { defaultValue: 'Reading…' }) : tr('profile:mine.pasteFill', { defaultValue: 'Lay it out' })}</button>
            <button type="button" data-paste-cancel="" onClick={() => { pasteRun.current += 1; setReading(false); setPaste(null); }} style={smallBtn}>{tr('profile:mine.cancel', { defaultValue: 'Cancel' })}</button>
          </div>
        </div>
      )}
      {note ? <p role={note[0] === 'err' ? 'alert' : 'status'} style={{ margin: '8px 0 0', fontSize: 13.5, color: note[0] === 'err' ? E.WARN : ea(0.8) }}>{note[1]}</p> : null}

      <Eyebrow>{tr('nutrition:myRecipe.name', { defaultValue: 'Name' })}</Eyebrow>
      <input data-recipe-title="" value={draft.t} maxLength={BS_RECIPE_TITLE_MAX} onChange={(e) => set({ t: e.target.value })} aria-label={tr('nutrition:myRecipe.name', { defaultValue: 'Name' })}
        placeholder={tr('profile:mine.recipeTitlePh', { defaultValue: 'Salmon, rice and greens' })} style={field} />
      <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
        {draft.photo ? <img src={draft.photo} alt="" style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover' }} /> : null}
        <label style={{ ...smallBtn, display: 'inline-flex', alignItems: 'center', opacity: photoBusy ? 0.6 : 1 }}>
          {photoBusy ? tr('profile:mine.uploading', { defaultValue: 'Uploading…' }) : draft.photo ? tr('profile:avatar.changePhoto', { defaultValue: 'Change photo' }) : tr('profile:mine.photoAdd', { defaultValue: 'Add a photo' })}
          <input type="file" accept="image/*" onChange={onPhoto} disabled={photoBusy} style={{ display: 'none' }} />
        </label>
        {draft.photo ? <button type="button" onClick={() => set({ photo: null })} style={{ ...smallBtn, border: 0, color: ea(0.7) }}>{tr('profile:editor.wall.removeAria', { defaultValue: 'Remove photo' })}</button> : null}
      </div>
      <input value={draft.note} maxLength={BS_RECIPE_NOTE_MAX} onChange={(e) => set({ note: e.target.value })} aria-label={tr('profile:mine.recipeNote', { defaultValue: 'Why you give it to clients' })}
        placeholder={tr('profile:mine.recipeNote', { defaultValue: 'Why you give it to clients' })} style={{ ...field, marginTop: 10 }} />

      <Eyebrow right={tr('profile:mine.perServing', { defaultValue: 'Macros per serving' })}>{tr('profile:mine.recipeNumbers', { defaultValue: 'Time and macros' })}</Eyebrow>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {RECIPE_NUM_FIELDS.map(([k, key, en]) => (
          <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: ea(0.66) }}>
            {tr(key, { defaultValue: en })}
            <input data-recipe-num={k} value={draft[k]} inputMode="numeric" onChange={(e) => set({ [k]: e.target.value.replace(/[^0-9.,]/g, '').slice(0, 5) })} style={{ ...field, padding: '0 10px' }} />
          </label>
        ))}
      </div>

      <Eyebrow right={tr('profile:mine.countOf', { defaultValue: '{count} of {max}', count: draft.ing.filter((g) => g.m.trim()).length, max: BS_RECIPE_INGS_MAX })}>{tr('nutrition:myRecipe.ingredients', { defaultValue: 'Ingredients' })}</Eyebrow>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {draft.ing.map((g, i) => (
          <div key={i} data-recipe-ing="" style={{ display: 'flex', gap: 6 }}>
            <input value={g.n} maxLength={BS_RECIPE_QTY_MAX} onChange={(e) => set({ ing: draft.ing.map((x, k) => (k === i ? { ...x, n: e.target.value } : x)) })} aria-label={tr('nutrition:myRecipe.qty', { defaultValue: 'Amount' })}
              placeholder={tr('nutrition:myRecipe.qtyPlaceholder', { defaultValue: 'amount' })} style={{ ...field, width: 96, flex: 'none' }} />
            <input value={g.m} maxLength={BS_RECIPE_ING_MAX} onChange={(e) => set({ ing: draft.ing.map((x, k) => (k === i ? { ...x, m: e.target.value } : x)) })} aria-label={tr('nutrition:myRecipe.ingredient', { defaultValue: 'Ingredient' })}
              placeholder={tr('profile:mine.staplePh', { defaultValue: 'Greek yogurt' })} style={{ ...field, flex: 1, minWidth: 0 }} />
            <button type="button" aria-label={tr('profile:mine.remove', { defaultValue: 'Remove' })} onClick={() => set({ ing: draft.ing.filter((x, k) => k !== i) })} style={rowBtn}>×</button>
          </div>
        ))}
        {draft.ing.length < BS_RECIPE_INGS_MAX ? <button type="button" data-add-ing="" onClick={() => set({ ing: [...draft.ing, { n: '', m: '' }] })} style={{ ...smallBtn, alignSelf: 'flex-start' }}>{tr('nutrition:myRecipe.addIngredient', { defaultValue: '＋ Add an ingredient' })}</button> : null}
      </div>

      <Eyebrow right={tr('profile:mine.countOf', { defaultValue: '{count} of {max}', count: draft.steps.filter((x) => x.trim()).length, max: BS_RECIPE_STEPS_MAX })}>{tr('nutrition:myRecipe.method', { defaultValue: 'Method' })}</Eyebrow>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {draft.steps.map((x, i) => (
          <div key={i} data-recipe-step="" style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <span style={{ width: 22, flex: 'none', paddingTop: 12, fontFamily: MONO, fontSize: 12, color: E.ED }}>{i + 1}</span>
            <textarea value={x} maxLength={BS_RECIPE_STEP_MAX} rows={2} onChange={(e) => set({ steps: draft.steps.map((y, k) => (k === i ? e.target.value.replace(/\n/g, ' ') : y)) })} aria-label={`${tr('nutrition:myRecipe.step', { defaultValue: 'Step' })} ${i + 1}`}
              style={{ ...field, flex: 1, minWidth: 0, padding: 10, lineHeight: 1.4, resize: 'vertical' }} />
            <button type="button" aria-label={tr('profile:mine.remove', { defaultValue: 'Remove' })} onClick={() => set({ steps: draft.steps.filter((y, k) => k !== i) })} style={rowBtn}>×</button>
          </div>
        ))}
        {draft.steps.length < BS_RECIPE_STEPS_MAX ? <button type="button" data-add-step="" onClick={() => set({ steps: [...draft.steps, ''] })} style={{ ...smallBtn, alignSelf: 'flex-start' }}>{tr('nutrition:myRecipe.addStep', { defaultValue: '＋ Add a step' })}</button> : null}
      </div>

      <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
        <button type="button" data-recipe-done="" onClick={done} disabled={photoBusy} style={{ ...smallBtn, flex: 1, minHeight: 46, background: E.ED, color: E.ON_ED, border: 0, opacity: photoBusy ? 0.6 : 1 }}>{tr('profile:mine.done', { defaultValue: 'Done' })}</button>
        <button type="button" data-recipe-cancel="" onClick={onCancel} style={{ ...smallBtn, minHeight: 46 }}>{tr('profile:mine.cancel', { defaultValue: 'Cancel' })}</button>
      </div>
      {/* Remove, a recipe already on the page only: quiet, and asked once before it goes. */}
      {onRemove ? (sure ? (
        <div ref={bsDialogRef(() => setSure(false))} role="alertdialog" data-remove-ask="" style={{ marginTop: 12, padding: 12, borderRadius: 12, background: E.BG3 }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>{tr('profile:mine.removeRecipeAsk', { defaultValue: 'Remove this recipe from your page?' })}</p>
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button type="button" data-remove-recipe="" onClick={onRemove} style={{ ...smallBtn, flex: 1, minHeight: 44, background: E.ERR, color: '#ffffff', border: 0 }}>{tr('profile:mine.remove', { defaultValue: 'Remove' })}</button>
            <button type="button" onClick={() => setSure(false)} style={{ ...smallBtn, flex: 1, minHeight: 44 }}>{tr('profile:mine.keepRecipe', { defaultValue: 'Keep it' })}</button>
          </div>
        </div>
      ) : (
        <button type="button" data-remove-start="" onClick={() => setSure(true)} style={{ marginTop: 10, minHeight: 44, padding: 0, border: 0, background: 'transparent', color: E.ERR, fontFamily: DISPLAY, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{tr('profile:mine.removeRecipe', { defaultValue: 'Remove this recipe' })}</button>
      )) : null}
    </div>
  );
}

// A rule's text box grows with what is written in it, so a long rule wraps rather than hides.
function RuleField({ value, onChange, label }) {
  const ref = React.useRef(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(44, el.scrollHeight)}px`;
  }, [value]);
  return (
    <textarea ref={ref} data-rule="" value={value} maxLength={BS_KITCHEN_RULE_MAX} rows={1} onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))} aria-label={label}
      style={{ flex: 1, minWidth: 0, minHeight: 44, padding: '11px 0', border: 0, background: 'transparent', color: E.INK, fontFamily: BODY, fontSize: 15, lineHeight: 1.45, resize: 'none', overflow: 'hidden', outline: 'none' }} />
  );
}
// Each staple group's small line drawing, as the page draws it.
function StapleGlyph({ g }) {
  const d = {
    fridge: <><rect x="6" y="2.5" width="12" height="19" rx="2" /><path d="M6 10h12M9 5.5v2M9 13v3" /></>,
    pantry: <><path d="M8 3.5h8v3H8z" /><path d="M7.5 6.5h9a1.5 1.5 0 0 1 1.5 1.5v11.5a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a1.5 1.5 0 0 1 1.5-1.5Z" /><path d="M6 12h12" /></>,
    freezer: <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5" />,
  }[g];
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>;
}
const STAPLE_GROUPS = [['fridge', 'groupFridge', 'Fridge'], ['pantry', 'groupPantry', 'Pantry'], ['freezer', 'groupFreezer', 'Freezer']];

// ── About: the coach's story, the details, questions members ask, and their socials ────────────
// Owner, 2026-10-31: "a section on coaches profiles for socials to list", then "an about page for each
// coach where they can write a bio about themselves and include more information". The profile shows
// it on its About tab. Questions and socials are the keys a member's profile already keeps (prompts,
// links), so whatever a coach wrote there before is here to edit.
const BS_LINK_NAMES = { instagram: 'Instagram', x: 'X', tiktok: 'TikTok', youtube: 'YouTube', substack: 'Substack' };
export const bsLinkName = (k, tr) => (k === 'website' ? tr('profile:editor.link.website', { defaultValue: 'Website' }) : BS_LINK_NAMES[k] || k);
// A list's rows as the editor holds them (the year as typed text), and as the doc stores them.
export const bsAboutRowsIn = (rows) => (Array.isArray(rows) ? rows : []).map((r) => ({ title: r.title || '', detail: r.detail || '', year: r.year ? String(r.year) : '' }));
const bsAboutRowsOut = (rows) => rows.map((r) => ({ title: r.title, detail: r.detail, year: r.year === '' ? null : Number(r.year) }));
// The editor's about, as the doc stores it (years typed as text).
export const bsAboutDoc = (a) => ({ story: a.story, years: a.years === '' ? null : Number(a.years), how: a.how || null, where: a.where, languages: a.languages,
  accolades: bsAboutRowsOut(a.accolades || []), education: bsAboutRowsOut(a.education || []) });
// A typed social the page could not link: the network's key, or null.
// Years the page would drop (0, or past 60): said at save, not dropped (Codex P2 on #2540).
export const bsYearsProblem = (years) => years !== '' && !bsProfileAbout({ years });
// A list row the page would drop is said at save, as years are: 'title' for a row with something in it
// but no title, 'year' for a year it would not keep; null when every row would be kept.
export const bsAboutListProblem = (about) => {
  for (const r of [...(about.accolades || []), ...(about.education || [])]) {
    const has = String(r.title || '').trim() || String(r.detail || '').trim() || r.year;
    if (has && !String(r.title || '').trim()) return 'title';
    if (r.year && !bsProfileAbout({ accolades: [{ title: 'x', year: r.year }] }).accolades[0].year) return 'year';
  }
  return null;
};
export const bsLinkProblem = (links) => BS_PROFILE_LINK_KEYS.find((k) => String(links[k] || '').trim() && !bsProfileLinkHref(k, String(links[k]).trim())) || null;
// ── About me's look (owner, 2026-11-04: "update design of this page") ───────────────────────────
// Six numbered parts, each a head over the ledger rule, then one quiet card that holds its fields:
// the fields are the card's rows, without boxes of their own, divided by hairlines. The row being
// typed in takes the editor's teal spine on its left (ABOUT_CSS), so a field with no border still
// shows where the caret is. The story and the answers grow with what is written, with no handle.
const ABOUT_HAIR = ea(0.1);
const ABOUT_CARD = { borderRadius: 12, background: E.BG2, border: `1px solid ${ea(0.12)}`, overflow: 'hidden' };
const ABOUT_BARE = { width: '100%', boxSizing: 'border-box', minHeight: 44, margin: 0, padding: 0, border: 0, borderRadius: 0, background: 'transparent', color: E.INK, fontFamily: BODY, fontSize: 16, outline: 'none' };
const ABOUT_CSS = `[data-mine-about] input::placeholder,[data-mine-about] textarea::placeholder{color:${ea(0.36)}}`
  + `[data-mine-about] [data-about-cell]{transition:box-shadow 140ms ease,background-color 140ms ease}`
  + `[data-mine-about] [data-about-cell]:focus-within{box-shadow:inset 3px 0 0 ${E.ED};background-color:${ea(0.025)}}`
  + `[data-mine-about] button:focus-visible{outline:2px solid ${E.ED};outline-offset:2px}`
  + `@media (prefers-reduced-motion:reduce){[data-mine-about] [data-about-cell]{transition:none}}`;
const aboutLabel = { display: 'block', fontSize: 12.5, lineHeight: 1.3, color: ea(0.6) };
const aboutX = { flex: 'none', width: 44, height: 44, padding: 0, border: 0, borderRadius: 10, background: 'transparent', color: ea(0.55), fontSize: 20, lineHeight: 1, cursor: 'pointer' };
const aboutAdd = { ...smallBtn, width: '100%', minHeight: 46, borderRadius: 12, borderStyle: 'dashed', color: ea(0.85) };

// A part's head: its number in the teal, its name, a count at the right, and the ledger rule.
function AboutHead({ n, title, right = null, first = false }) {
  return (
    <div data-about-head="" style={{ marginTop: first ? 22 : 32, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span aria-hidden style={{ flex: 'none', fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', color: E.ED }}>{String(n).padStart(2, '0')}</span>
        <h2 style={{ flex: 1, minWidth: 0, margin: 0, fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, lineHeight: 1.2, color: E.INK }}>{title}</h2>
        {right != null ? <span style={{ flex: 'none', fontFamily: MONO, fontSize: 11, color: ea(0.55), fontVariantNumeric: 'tabular-nums' }}>{right}</span> : null}
      </div>
      <div aria-hidden style={{ marginTop: 8, height: 2, background: `linear-gradient(90deg, ${ea(0.7)}, ${E.ED})` }} />
    </div>
  );
}

// A textarea as tall as what is in it (and never shorter than minHeight), so the page scrolls, not it.
function GrowText({ value, minHeight = 84, style, ...rest }) {
  const ref = React.useRef(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
  }, [value, minHeight]);
  return <textarea ref={ref} value={value} {...rest} style={{ ...ABOUT_BARE, display: 'block', lineHeight: 1.5, ...style, minHeight, overflow: 'hidden', resize: 'none' }} />;
}

// One of the coach's lists (owner, 2026-11-03: "certificates, accolades, things like that"): a row is
// what it is, then what it was or who gave it, then the year, each row removable, eight at most.
function AboutList({ kind, tr, rows, setRows, titlePh, detailPh, addLabel }) {
  const setRow = (i, k, v) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const sub = { ...ABOUT_BARE, minHeight: 38, fontSize: 14.5, color: ea(0.82) };
  return (
    <div data-about-list={kind}>
      {rows.length ? (
        <div style={ABOUT_CARD}>
          {rows.map((r, i) => (
            <div key={i} data-about-item="" data-about-cell="" style={{ padding: '2px 0 6px 14px', borderTop: i ? `1px solid ${ABOUT_HAIR}` : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <input data-about-item-title="" value={r.title} maxLength={BS_ABOUT_ITEM_MAX} onChange={(e) => setRow(i, 'title', e.target.value)}
                  aria-label={tr('profile:mine.itemTitle', { defaultValue: 'What it is' })} placeholder={titlePh}
                  style={{ ...ABOUT_BARE, flex: 1, minWidth: 0, fontFamily: DISPLAY, fontSize: 16, fontWeight: 600 }} />
                <button type="button" data-about-item-remove="" onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={tr('profile:mine.qaRemove', { defaultValue: 'Remove' })} style={aboutX}><span aria-hidden>×</span></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 72px', alignItems: 'center', marginRight: 14 }}>
                <input data-about-item-detail="" value={r.detail} maxLength={BS_ABOUT_ITEM_MAX} onChange={(e) => setRow(i, 'detail', e.target.value)}
                  aria-label={tr('profile:mine.itemDetail', { defaultValue: 'From or where' })} placeholder={detailPh} style={sub} />
                <input data-about-item-year="" inputMode="numeric" value={r.year} onChange={(e) => setRow(i, 'year', e.target.value.replace(/\D/g, '').slice(0, 4))}
                  aria-label={tr('profile:mine.itemYear', { defaultValue: 'Year' })} placeholder={tr('profile:mine.itemYear', { defaultValue: 'Year' })}
                  style={{ ...sub, minHeight: 28, paddingLeft: 10, borderLeft: `1px solid ${ABOUT_HAIR}`, textAlign: 'right', fontFamily: MONO, fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }} />
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {rows.length < BS_ABOUT_LIST_MAX ? (
        <button type="button" data-about-item-add="" onClick={() => setRows((prev) => [...prev, { title: '', detail: '', year: '' }])} style={{ ...aboutAdd, marginTop: rows.length ? 8 : 0 }}>＋ {addLabel}</button>
      ) : null}
    </div>
  );
}

// ── The Studio's words (owner, 2026-11-04): what a trainer says about the work they sell ────────
// `work` is the profile's, read when the editor opens: { programs: [{ id, name, note }], workouts:
// [{ key, kind: 'day'|'video', title, facts }], coaching: { blurb } | null, specialty }. The keys these
// write are profile_custom's (profileCustom.mjs): focus, picks, descriptions and programFor.
export const bsStudioWorkIn = (work) => ({
  programs: (work && Array.isArray(work.programs) ? work.programs : []).filter((p) => p && p.id != null && p.id !== ''),
  workouts: (work && Array.isArray(work.workouts) ? work.workouts : []).filter((x) => x && typeof x.key === 'string' && x.key),
  coaching: work && work.coaching && typeof work.coaching === 'object' ? work.coaching : null,
  specialty: work && typeof work.specialty === 'string' ? work.specialty.trim() : '',
});
// Own words being written are kept in the list as they are typed, so nothing waits unsaved in a box;
// a blank entry is never counted, shown or saved (the normalizer drops it too).
const isBlankWord = (f) => !f || (!f.id && !String(f.w || '').trim());

// `lit`: on a row that stays dark when ticked (the wins wall's), the box ticked in the editor's teal.
function TickBox({ on, lit = false }) {
  return <span aria-hidden style={{ flex: 'none', width: 18, height: 18, borderRadius: 4, display: 'grid', placeItems: 'center', boxSizing: 'border-box',
    boxShadow: on ? 'none' : `inset 0 0 0 1.5px ${ea(0.35)}`, background: on ? (lit ? E.ED : E.BG) : 'transparent', color: on ? (lit ? E.ON_ED : E.INK) : 'transparent', fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✓</span>;
}
const focusTile = (on, off) => ({ minWidth: 0, minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', border: 0, borderRadius: 6,
  boxShadow: on ? 'none' : `inset 0 0 0 1px ${ea(off ? 0.12 : 0.24)}`, background: on ? E.INK : 'transparent', color: on ? E.BG : off ? ea(0.45) : E.INK,
  fontFamily: BODY, fontSize: 14, fontWeight: on ? 600 : 500, lineHeight: 1.2, textAlign: 'left', cursor: 'pointer' });
const tileText = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

// Focus: up to four words under the coach's name, an even grid of presets (each stored as its token,
// drawn in the reader's language) and the coach's own words, the last tile.
function FocusField({ tr, focus, setFocus, specialty }) {
  const [typing, setTyping] = React.useState(false); // the last entry is the coach's own words, being written
  const [msg, setMsg] = React.useState(null);
  const kept = focus.filter((f) => !isBlankWord(f));
  const say = (f) => bsFocusWordLabel(tr, f);
  const full = () => setMsg(tr('profile:mine.focusMax', { defaultValue: '{count, plural, one {Up to # focus word.} other {Up to # focus words.}} Untick one to pick another.', count: BS_FOCUS_MAX }));
  // The list with the words being written put away: blank words go, words that name a preset become
  // the preset (so it reads in every language), and a word already there goes.
  const settle = (list) => {
    const out = [];
    for (const f of list) {
      if (isBlankWord(f)) continue;
      let g = f;
      if (!f.id) {
        const w = String(f.w).trim();
        const preset = BS_FOCUS_PRESETS.find((id) => say({ id }).toLowerCase() === w.toLowerCase());
        g = preset ? { id: preset } : { w };
      }
      if (out.some((x) => (g.id ? x.id === g.id : !x.id && x.w.toLowerCase() === g.w.toLowerCase()))) continue;
      out.push(g);
    }
    return out;
  };
  // Every other tap here puts the words being written away first.
  const base = () => { if (typing) setTyping(false); return typing ? settle(focus) : focus; };
  const togglePreset = (id) => {
    setMsg(null);
    const list = base();
    if (list.some((f) => f.id === id)) { setFocus(list.filter((f) => f.id !== id)); return; }
    if (list.filter((f) => !isBlankWord(f)).length >= BS_FOCUS_MAX) { if (list !== focus) setFocus(list); full(); return; }
    setFocus([...list, { id }]);
  };
  const dropWords = (w) => { setMsg(null); setFocus(base().filter((f) => f.id || String(f.w || '').trim().toLowerCase() !== w.toLowerCase())); };
  const openWords = () => {
    setMsg(null);
    if (typing) return;
    const list = settle(focus);
    if (list.length >= BS_FOCUS_MAX) { if (list.length !== focus.length) setFocus(list); full(); return; }
    setFocus([...list, { w: '' }]);
    setTyping(true);
  };
  const typeWords = (v) => setFocus((prev) => prev.map((f, i) => (i === prev.length - 1 ? { w: v } : f)));
  const doneWords = () => { setTyping(false); setFocus((prev) => settle(prev)); };
  const own = focus.map((f, i) => ({ f, i })).filter(({ f, i }) => !f.id && !isBlankWord(f) && !(typing && i === focus.length - 1));
  const atMax = kept.length >= BS_FOCUS_MAX;
  const writing = typing && focus.length && !focus[focus.length - 1].id ? focus[focus.length - 1] : null;
  return (
    <Ruled data-about-focus="" kicker={tr('profile:mine.focusTitle', { defaultValue: 'Focus' })} right={tr('profile:mine.countOf', { defaultValue: '{count} of {max}', count: kept.length, max: BS_FOCUS_MAX })}>
      <div style={{ marginTop: 9, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
        {BS_FOCUS_PRESETS.map((id) => {
          const on = focus.some((f) => f.id === id);
          return (
            <button key={id} type="button" data-focus={id} aria-pressed={on} onClick={() => togglePreset(id)} style={focusTile(on, !on && atMax)}>
              <TickBox on={on} /><span style={tileText}>{say({ id })}</span>
            </button>
          );
        })}
        {own.map(({ f }) => (
          <button key={'w:' + f.w} type="button" data-focus-words={f.w} aria-pressed onClick={() => dropWords(String(f.w).trim())} style={focusTile(true, false)}>
            <TickBox on /><span style={tileText}>{String(f.w).trim()}</span>
          </button>
        ))}
        {writing ? (
          <div data-focus-own="" style={{ gridColumn: '1 / -1', display: 'flex', gap: 6 }}>
            <input autoFocus value={writing.w || ''} maxLength={BS_FOCUS_WORD_MAX} onChange={(e) => typeWords(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); doneWords(); } }}
              aria-label={tr('profile:mine.focusOwn', { defaultValue: 'Your own words' })} placeholder={tr('profile:mine.focusOwnPh', { defaultValue: 'Kettlebells' })} style={{ ...field, flex: 1, minWidth: 0, fontSize: 16 }} />
            <button type="button" data-focus-own-done="" onClick={doneWords} style={{ ...smallBtn, minHeight: 44, background: E.INK, color: E.BG, border: 0 }}>{tr('profile:mine.done', { defaultValue: 'Done' })}</button>
          </div>
        ) : (
          <button type="button" data-focus-add="" onClick={openWords}
            style={{ ...focusTile(false, atMax), boxShadow: 'none', border: `1px dashed ${ea(atMax ? 0.16 : 0.32)}`, color: atMax ? ea(0.45) : ea(0.78) }}>
            <span aria-hidden style={{ flex: 'none', width: 18, textAlign: 'center', fontSize: 16, lineHeight: 1 }}>＋</span>
            <span style={tileText}>{tr('profile:mine.focusOwn', { defaultValue: 'Your own words' })}</span>
          </button>
        )}
      </div>
      {msg ? <p role="alert" style={{ margin: '8px 0 0', fontSize: 13.5, color: E.WARN }}>{msg}</p> : null}
      <p data-focus-hint="" style={hintStyle}>{specialty
        ? tr('profile:mine.focusHint', { defaultValue: 'None picked shows your listing’s “{specialty}”.', specialty })
        : tr('profile:mine.focusHintNone', { defaultValue: 'None picked shows nothing under your name.' })}</p>
    </Ruled>
  );
}

// Your picks: up to two workouts the coach would start a member on, in two numbered slots. A pick of a
// workout no longer on the page is never shown to members, so it neither fills a slot here nor survives
// the next change (as a station's pins).
function PicksField({ tr, picks, setPicks, workouts }) {
  const [choosing, setChoosing] = React.useState(null); // the slot whose workout is being chosen
  const byKey = new Map(workouts.map((x) => [x.key, x]));
  const shown = picks.filter((k) => byKey.has(k)).slice(0, BS_PICKS_MAX);
  const choose = (slot, key) => {
    const next = shown.slice();
    if (key == null) next.splice(slot, 1); else if (slot < next.length) next[slot] = key; else next.push(key);
    setPicks(next);
    setChoosing(null);
  };
  const no = (i) => String(i + 1).padStart(2, '0');
  const row = { display: 'grid', gridTemplateColumns: '30px minmax(0, 1fr) auto', columnGap: 10, alignItems: 'center', minHeight: 56, borderBottom: `1px solid ${ea(0.14)}` };
  const title = { display: 'block', fontFamily: BODY, fontSize: 15, fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
  const line = { display: 'block', marginTop: 1, fontSize: 12.5, lineHeight: 1.35, color: ea(0.66) };
  const num = { fontFamily: MONO, fontSize: 11, color: ea(0.5), fontVariantNumeric: 'tabular-nums' };
  return (
    <Ruled data-about-picks="" kicker={tr('profile:mine.picksTitle', { defaultValue: 'Your picks' })} right={tr('profile:mine.countOf', { defaultValue: '{count} of {max}', count: shown.length, max: BS_PICKS_MAX })}>
      <div style={{ marginTop: 9, borderTop: `1px solid ${ea(0.14)}` }}>
        {Array.from({ length: BS_PICKS_MAX }, (_, slot) => {
          const x = shown[slot] ? byKey.get(shown[slot]) : null;
          return (
            <div key={slot} data-pick-slot={slot + 1}>
              {x ? (
                <div style={row}>
                  <span style={num}>{no(slot)}</span>
                  <span style={{ minWidth: 0 }}><b data-pick-title="" style={title}>{x.title}</b>{x.facts ? <span style={line}>{x.facts}</span> : null}</span>
                  <button type="button" data-pick-change="" aria-expanded={choosing === slot} onClick={() => setChoosing(choosing === slot ? null : slot)}
                    style={{ minHeight: 44, padding: '0 2px 0 12px', border: 0, background: 'transparent', color: E.INK, fontFamily: BODY, fontSize: 13.5, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: ea(0.35), cursor: 'pointer' }}>
                    {tr('profile:mine.pickChange', { defaultValue: 'Change' })}
                  </button>
                </div>
              ) : (
                <button type="button" data-pick-add="" aria-expanded={choosing === slot} onClick={() => setChoosing(choosing === slot ? null : slot)}
                  style={{ ...row, width: '100%', padding: 0, borderTop: 0, borderLeft: 0, borderRight: 0, background: 'transparent', color: E.INK, textAlign: 'left', cursor: 'pointer' }}>
                  <span style={num}>{no(slot)}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ ...title, fontWeight: 500, color: ea(0.82) }}>{tr('profile:mine.pickAdd', { defaultValue: 'Add a workout' })}</span>
                    <span style={line}>{tr('profile:mine.pickAddHint', { defaultValue: 'Or tap ☆ on any workout in Programs.' })}</span>
                  </span>
                  <span aria-hidden style={{ width: 32, height: 32, marginRight: 2, borderRadius: 6, border: `1px dashed ${ea(0.32)}`, display: 'grid', placeItems: 'center', boxSizing: 'border-box', fontSize: 17, lineHeight: 1, color: ea(0.75) }}>＋</span>
                </button>
              )}
              {choosing === slot ? (
                <div data-pick-chooser="" style={{ padding: '4px 0 10px 40px', borderBottom: `1px solid ${ea(0.14)}` }}>
                  {workouts.length ? workouts.map((w) => {
                    const cur = shown[slot] === w.key;
                    const taken = !cur && shown.includes(w.key);
                    return (
                      <button key={w.key} type="button" data-pick-option={w.key} aria-pressed={cur} disabled={taken} onClick={() => choose(slot, w.key)}
                        style={{ width: '100%', minHeight: 48, padding: '6px 0', border: 0, borderTop: `1px solid ${ea(0.08)}`, background: 'transparent', color: taken ? ea(0.45) : E.INK, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', cursor: taken ? 'default' : 'pointer' }}>
                        <span style={{ flex: 1, minWidth: 0 }}><span style={title}>{w.title}</span>{w.facts ? <span style={line}>{w.facts}</span> : null}</span>
                        <span style={{ flex: 'none', fontSize: 12.5, color: cur ? E.ED : ea(0.55) }}>{cur ? '✓' : taken ? tr('profile:mine.pickTaken', { defaultValue: 'Picked' }) : ''}</span>
                      </button>
                    );
                  }) : <p style={{ ...hintStyle, margin: '8px 0 0' }}>{tr('profile:mine.picksNone', { defaultValue: 'Publish a program or post a workout video, then pick it here.' })}</p>}
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {x ? <button type="button" data-pick-remove="" onClick={() => choose(slot, null)} style={{ ...smallBtn, minHeight: 44 }}>{tr('profile:mine.pickRemove', { defaultValue: 'Remove this pick' })}</button> : null}
                    <button type="button" onClick={() => setChoosing(null)} style={{ ...smallBtn, minHeight: 44, border: 0, color: ea(0.7) }}>{tr('profile:mine.cancel', { defaultValue: 'Cancel' })}</button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Ruled>
  );
}

// ── Programs (a trainer's): a line under each thing they sell, and who each program is for ──────
// One line: the box grows with what is written, and a line break typed or pasted reads as a space.
function DescArea({ value, onChange, label, placeholder, ...rest }) {
  const ref = React.useRef(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(64, el.scrollHeight + 2)}px`;
  }, [value]);
  return (
    <textarea ref={ref} {...rest} value={value} maxLength={BS_DESC_MAX} rows={2} onChange={(e) => onChange(e.target.value.replace(/\s*\r?\n\s*/g, ' '))} aria-label={label} placeholder={placeholder}
      style={{ ...field, display: 'block', marginTop: 8, minHeight: 64, padding: '10px 12px', fontSize: 16, lineHeight: 1.4, resize: 'none', overflow: 'hidden' }} />
  );
}
// Who a program is for: a preset (stored as its token) or the coach's own words, one at a time.
function ForChips({ tr, value, onChange }) {
  const [open, setOpen] = React.useState(false);
  const words = value && !value.id ? String(value.w || '') : '';
  const chip = (on, dashed = false) => ({ minHeight: 44, padding: '0 13px', border: dashed ? `1px dashed ${ea(0.32)}` : 0, borderRadius: 6,
    boxShadow: on || dashed ? 'none' : `inset 0 0 0 1px ${ea(0.24)}`, background: on ? E.INK : 'transparent', color: on ? E.BG : dashed ? ea(0.78) : E.INK,
    fontFamily: BODY, fontSize: 14, fontWeight: 600, lineHeight: 1.2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' });
  // Closing the box keeps the words written, or none.
  const close = () => { setOpen(false); if (value && !value.id) onChange(words.trim() ? { w: words.trim() } : null); };
  return (
    <div>
      <div style={{ marginTop: 7, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {BS_FOR_PRESETS.map((id) => {
          const on = !!(value && value.id === id);
          return <button key={id} type="button" data-for={id} aria-pressed={on} onClick={() => { setOpen(false); onChange(on ? null : { id }); }} style={chip(on)}>{on ? '✓ ' : ''}{bsStudioForLabel(tr, { id })}</button>;
        })}
        {open ? null : words.trim()
          ? <button type="button" data-for-words="" aria-pressed onClick={() => setOpen(true)} style={chip(true)}>✓ {words.trim()}</button>
          : <button type="button" data-for-own="" onClick={() => setOpen(true)} style={chip(false, true)}>＋ {tr('profile:mine.forOwn', { defaultValue: 'Your words' })}</button>}
      </div>
      {open ? (
        <div data-for-own-row="" style={{ marginTop: 8, display: 'flex', gap: 6 }}>
          <input autoFocus value={words} maxLength={BS_FOR_WORDS_MAX} onChange={(e) => onChange({ w: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); close(); } }}
            aria-label={tr('profile:mine.forOwnLabel', { defaultValue: 'Who it’s for, in your words' })} placeholder={tr('profile:mine.forOwnPh', { defaultValue: 'Runners coming back from injury' })} style={{ ...field, flex: 1, minWidth: 0, fontSize: 16 }} />
          <button type="button" data-for-own-done="" onClick={close} style={{ ...smallBtn, minHeight: 44, background: E.INK, color: E.BG, border: 0 }}>{tr('profile:mine.done', { defaultValue: 'Done' })}</button>
        </div>
      ) : null}
    </div>
  );
}

function ProgramsTab({ tr, work, first, descs, setDescs, programFor, setProgramFor }) {
  const setDesc = (k, v) => setDescs((d) => ({ ...d, [k]: v }));
  const setFor = (id, v) => setProgramFor((m) => { const next = { ...m }; if (v) next[id] = v; else delete next[id]; return next; });
  const optional = tr('profile:mine.optional', { defaultValue: 'Optional' });
  const blank = (fallback) => (fallback
    ? tr('profile:mine.descBlank', { defaultValue: 'Leave blank to show “{fallback}”.', fallback })
    : tr('profile:mine.descBlankNone', { defaultValue: 'Leave blank to show nothing more.' }));
  const item = (k, kicker, sub, title, hint, placeholder, extra = null) => (
    <Ruled key={k} data-desc-field={k} kicker={kicker} sub={sub} right={optional}>
      <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <span style={{ minWidth: 0, fontFamily: BODY, fontSize: 15.5, fontWeight: 600, lineHeight: 1.3 }}>{title}</span>
        <span data-desc-count="" style={{ flex: 'none', fontFamily: MONO, fontSize: 11, color: ea(0.66), fontVariantNumeric: 'tabular-nums' }}>{`${(descs[k] || '').length}/${BS_DESC_MAX}`}</span>
      </div>
      <DescArea data-desc={k} value={descs[k] || ''} onChange={(v) => setDesc(k, v)} label={tr('profile:mine.descLabel', { defaultValue: 'A line about {name}', name: title })} placeholder={placeholder} />
      <p style={hintStyle}>{hint}</p>
      {extra}
    </Ruled>
  );
  const { programs, workouts, coaching } = work;
  if (!programs.length && !workouts.length && !coaching) {
    return <p data-desc-empty="" style={{ margin: '18px 0 0', fontSize: 13.5, lineHeight: 1.45, color: ea(0.66) }}>{tr('profile:mine.descNone', { defaultValue: 'Nothing to describe yet. Publish a program, post a workout video or offer monthly coaching, and write its line here.' })}</p>;
  }
  return (
    <div data-mine-programs="">
      {programs.map((p) => {
        const id = String(p.id);
        return item('p:' + id, tr('profile:mine.kickProgram', { defaultValue: 'Program' }), null, p.name, blank(p.note),
          tr('profile:mine.descProgramPh', { defaultValue: 'What it is, and who gets the most from it.' }),
          <div data-program-for={id}>
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
              <span style={{ ...KICK, fontWeight: 700, color: E.INK }}>{tr('profile:mine.forTitle', { defaultValue: 'Who it’s for' })}</span>
              <span style={KICK}>{optional}</span>
            </div>
            <ForChips tr={tr} value={programFor[id] || null} onChange={(v) => setFor(id, v)} />
          </div>);
      })}
      {workouts.map((x) => item(x.key, x.kind === 'video' ? tr('profile:mine.kickVideo', { defaultValue: 'Video' }) : tr('profile:mine.kickWorkout', { defaultValue: 'Workout' }), null, x.title, blank(x.facts),
        tr('profile:mine.descWorkoutPh', { defaultValue: 'What it works, and how it should feel.' })))}
      {coaching ? item('coaching', tr('profile:mine.kickCoaching', { defaultValue: 'Coaching' }), tr('profile:mine.kickMonthly', { defaultValue: 'Monthly' }),
        tr('profile:mine.coachingWith', { defaultValue: 'Coaching with {name}', name: first }),
        coaching.blurb ? blank(coaching.blurb) : tr('profile:mine.descCoachingBlank', { defaultValue: 'Leave blank to show only what’s included.' }),
        tr('profile:mine.descCoachingPh', { defaultValue: 'Who it suits, and what a month with you is like.' })) : null}
    </div>
  );
}

// ── Spotlight: the intro film, headline stats, a pinned highlight, the song and the wins wall ────
// Owner, 2026-11-04 ("Show them on coach pages", and "the customization options should be specific
// for what coaches can edit"): each part as the old coach editor (iosAppBroadsheetClient.jsx's
// BSProfileCustomizer with `coach`, no longer reached) offered it, in this editor's ruled fields.
//   Film       the coach's own video in coach-media (MP4, MOV, WebM or M4V, up to 200 MB), and a caption.
//   Stats      up to three of the coach's figures (coachWork.mjs BS_COACH_STATS), each with its number
//              as the page has it now, or "None yet": a stat with no figure stays off the page.
//   Highlight  one short pinned card: a kind, a headline, a line and a metric.
//   Song       a Spotify link, checked as it is typed, with its player under it.
//   Wins wall  up to three of the coach's members' reviews, which lead What clients say on the page.
// The stat words, by key: the labels the page already uses for each.
export const BS_STAT_WORDS = {
  rating: ['profile:stat.rating', 'Rating'], reviews: ['profile:trainer.reviews', 'Reviews'], years: ['profile:mine.years', 'Years coaching'],
  programs: ['profile:trainer.programs', 'Programs'], workouts: ['profile:trainer.workouts', 'Workouts'], replays: ['profile:trainer.tabReplays', 'Replays'],
  recipes: ['profile:nutri.secRecipes', 'Recipes'], plates: ['profile:nutri.tabPlateNotes', 'Plate notes'], certs: ['profile:about.certs', 'Certificates'],
  // Shape's own figures (owner, 2026-11-09), shown only when the coach made them public: What's public's words.
  sessions: ['profile:mine.publicSessions', 'Sessions coached'], clients: ['profile:mine.publicClients', 'Active clients'],
};
// What's public (owner, 2026-11-09: "coaches should be able to decide what they want public"): each of
// the figures Shape records for a coach, by its publicStats key, with the one line that says what a
// visitor sees. [title key, English, line key, English]; a nutritionist's last is their meal plans.
export const BS_PUBLIC_STAT_WORDS = {
  sessions: ['profile:mine.publicSessions', 'Sessions coached', 'profile:mine.publicSessionsLine', 'The sessions you’ve completed on Shape'],
  clients: ['profile:mine.publicClients', 'Active clients', 'profile:mine.publicClientsLine', 'How many clients pay you now'],
  since: ['profile:mine.publicSince', 'Coaching since', 'profile:mine.publicSinceLine', 'The year of your first client on Shape'],
  programClients: ['profile:mine.publicPrograms', 'Clients on each program', 'profile:mine.publicProgramsLine', 'How many clients are on each of your published programs now'],
};
const BS_PUBLIC_PLANS_WORDS = ['profile:mine.publicPlans', 'Clients on each meal plan', 'profile:mine.publicPlansLine', 'How many clients are on each of your published meal plans now'];
// A literal address, the same in every language (the old editor's note on it): not a key.
const SPOTIFY_PH = 'https://open.spotify.com/track/…';
// The video types the film's own check keeps (bsOwnVideoUrl): a picker that names no type is read by
// the file's extension, as the upload does.
const FILM_EXT = ['mp4', 'mov', 'webm', 'm4v'];
export const bsFilmFileOk = (file) => {
  if (!file) return false;
  const ext = String(file.name || '').split('.').pop().toLowerCase();
  return /^video\/(mp4|quicktime|webm|x-m4v|m4v)$/i.test(file.type || '') || (!file.type && FILM_EXT.includes(ext));
};
const statFigure = (k, v, locale) => {
  if (v == null) return null;
  try { return k === 'rating' ? Number(v).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : Number(v).toLocaleString(locale); } catch (e) { return String(v); }
};

// The four switches of What's public, one row each: what it is, and the plain line of what a visitor sees.
function PublicStats({ tr, role, on, setOn }) {
  const toggle = (k) => setOn(on.includes(k) ? on.filter((x) => x !== k) : BS_PUBLIC_STATS.filter((x) => x === k || on.includes(x)));
  return (
    <div data-spot-public-list="" style={{ ...ABOUT_CARD, marginTop: 9 }}>
      {BS_PUBLIC_STATS.map((k, i) => {
        const w = k === 'programClients' && role === 'nutritionist' ? BS_PUBLIC_PLANS_WORDS : BS_PUBLIC_STAT_WORDS[k];
        const lit = on.includes(k);
        return (
          <button key={k} type="button" role="switch" aria-checked={lit} data-public-stat={k} onClick={() => toggle(k)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', minHeight: 60, padding: '9px 14px', border: 0, borderTop: i ? `1px solid ${ABOUT_HAIR}` : 0,
              background: 'transparent', color: E.INK, cursor: 'pointer', textAlign: 'left', fontFamily: BODY }}>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.25 }}>{tr(w[0], { defaultValue: w[1] })}</span>
              <span data-public-line="" style={{ fontSize: 12.5, lineHeight: 1.35, color: ea(0.66) }}>{tr(w[2], { defaultValue: w[3] })}</span>
            </span>
            <span aria-hidden style={{ flex: 'none', width: 42, height: 24, borderRadius: 999, background: lit ? E.ED : ea(0.22), position: 'relative', transition: 'background 160ms ease' }}>
              <span style={{ position: 'absolute', top: 3, left: lit ? 21 : 3, width: 18, height: 18, borderRadius: 999, background: lit ? E.ON_ED : E.INK, transition: 'left 160ms ease' }} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SpotlightTab({ tr, role, locale, film, setFilm, filmBusy, filmErr, onFilm, stats, setStats, figures, publicStats = [], setPublicStats = () => {}, pinned, setPinned, song, setSong, pins, togglePin, reviews, reviewsRead }) {
  const fileRef = React.useRef(null);
  const [statMsg, setStatMsg] = React.useState(null);
  const optional = tr('profile:mine.optional', { defaultValue: 'Optional' });
  const keys = BS_COACH_STATS[role === 'nutritionist' ? 'nutritionist' : 'trainer'];
  const toggleStat = (k) => {
    setStatMsg(null);
    if (stats.includes(k)) { setStats(stats.filter((x) => x !== k)); return; }
    if (stats.length >= BS_HERO_STATS_MAX) { setStatMsg(tr('profile:mine.statsMax', { defaultValue: '{count, plural, one {Up to # headline stat.} other {Up to # headline stats.}} Untick one to pick another.', count: BS_HERO_STATS_MAX })); return; }
    setStats([...stats, k]);
  };
  const setPin = (patch) => setPinned((p) => ({ ...p, ...patch }));
  const pinAny = !!(pinned.title.trim() || pinned.note.trim() || pinned.metric.trim());
  const songUrl = song.url.trim();
  const embed = songUrl ? bsSpotifyEmbed(songUrl) : null;
  const chip = (on) => ({ minHeight: 44, padding: '0 13px', border: 0, borderRadius: 6, boxShadow: on ? 'none' : `inset 0 0 0 1px ${ea(0.24)}`, background: on ? E.INK : 'transparent',
    color: on ? E.BG : E.INK, fontFamily: BODY, fontSize: 14, fontWeight: 600, lineHeight: 1.2, cursor: 'pointer' });
  const quietBtn = { ...smallBtn, minHeight: 44, border: 0, padding: '0 2px', color: ea(0.7) };
  const full = pins.length >= BS_PINNED_REVIEWS_MAX;
  // The reviews as they came, the ones pinned first among them kept where they are: a list that
  // reordered on each tap would move the row under the finger.
  const shownReviews = (() => {
    const list = Array.isArray(reviews) ? reviews.slice(0, 40) : [];
    for (const id of pins) if (!list.some((r) => r.id === id)) { const r = (reviews || []).find((x) => x.id === id); if (r) list.push(r); }
    return list;
  })();
  return (
    <div data-mine-spotlight="">
      <Ruled data-spot-film="" kicker={tr('profile:film.headCoach', { defaultValue: 'Intro film' })} right={optional}>
        <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.webm,.m4v" onChange={onFilm} style={{ display: 'none' }} />
        {film ? (
          <div style={{ marginTop: 9 }}>
            <div style={{ borderRadius: 10, overflow: 'hidden', background: '#000', border: `1px solid ${ea(0.14)}` }}>
              <video data-spot-film-video="" src={film.url} controls playsInline preload="metadata" style={{ display: 'block', width: '100%', maxHeight: 220, background: '#000' }} />
            </div>
            <input data-spot-film-caption="" value={film.caption} maxLength={BS_FILM_CAPTION_MAX} onChange={(e) => setFilm({ ...film, caption: e.target.value })}
              aria-label={tr('profile:editor.ph.caption', { defaultValue: 'Caption (optional)' })} placeholder={tr('profile:editor.ph.caption', { defaultValue: 'Caption (optional)' })} style={{ ...field, marginTop: 8, fontSize: 16 }} />
            <button type="button" data-spot-film-remove="" onClick={() => setFilm(null)} style={{ ...quietBtn, marginTop: 4 }}>{tr('profile:editor.film.remove', { defaultValue: 'Remove film' })}</button>
          </div>
        ) : (
          <button type="button" data-spot-film-add="" disabled={filmBusy} onClick={() => { if (!filmBusy && fileRef.current) fileRef.current.click(); }}
            style={{ ...smallBtn, marginTop: 9, width: '100%', minHeight: 46, borderRadius: 12, borderStyle: 'dashed', color: ea(0.85), cursor: filmBusy ? 'wait' : 'pointer' }}>
            {filmBusy ? tr('profile:mine.uploading', { defaultValue: 'Uploading…' }) : tr('profile:editor.film.add', { defaultValue: '+ Add intro film' })}
          </button>
        )}
        {filmErr ? <p role="alert" data-spot-film-err="" style={{ margin: '8px 0 0', fontSize: 13.5, color: E.WARN }}>{filmErr}</p> : null}
        <p style={hintStyle}>{tr('profile:editor.film.hint', { defaultValue: '30–60 seconds · MP4, MOV or WebM' })}</p>
      </Ruled>

      <Ruled data-spot-stats="" kicker={tr('profile:mine.statsTitle', { defaultValue: 'Headline stats' })} right={tr('profile:mine.countOf', { defaultValue: '{count} of {max}', count: stats.length, max: BS_HERO_STATS_MAX })}>
        <div style={{ marginTop: 9, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
          {keys.map((k) => {
            const on = stats.includes(k);
            const fig = statFigure(k, figures ? figures[k] : null, locale);
            return (
              // The stat's name, and under it the figure the page has now, so a long name keeps its line.
              <button key={k} type="button" data-stat={k} aria-pressed={on} onClick={() => toggleStat(k)} style={{ ...focusTile(on, !on && stats.length >= BS_HERO_STATS_MAX), minHeight: 52, padding: '6px 12px' }}>
                <TickBox on={on} />
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={tileText}>{tr(BS_STAT_WORDS[k][0], { defaultValue: BS_STAT_WORDS[k][1] })}</span>
                  <span data-stat-figure="" style={{ ...tileText, fontFamily: MONO, fontSize: 11, fontWeight: 500, fontVariantNumeric: 'tabular-nums', opacity: fig ? 0.75 : 0.55 }}>
                    {fig ? (k === 'rating' ? `${fig}/10` : fig) : tr('profile:mine.statNone', { defaultValue: 'None yet' })}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {statMsg ? <p role="alert" style={{ margin: '8px 0 0', fontSize: 13.5, color: E.WARN }}>{statMsg}</p> : null}
        <p style={hintStyle}>{tr('profile:mine.statsHint', { defaultValue: 'Up to three of your numbers, under your name, in the order you pick them. One you have no figure for yet stays off your page.' })}</p>
      </Ruled>

      <Ruled data-spot-public="" kicker={tr('profile:mine.publicTitle', { defaultValue: 'What’s public' })} right={tr('profile:mine.countOf', { defaultValue: '{count} of {max}', count: publicStats.length, max: BS_PUBLIC_STATS.length })}>
        <PublicStats tr={tr} role={role} on={publicStats} setOn={setPublicStats} />
        <p style={hintStyle}>{tr('profile:mine.publicHint', { defaultValue: 'Shape counts these for you. Each stays off your page until you turn it on, and none shows a client’s name. Sessions coached and Active clients show as headline stats only when they are on here.' })}</p>
      </Ruled>

      <Ruled data-spot-pin="" kicker={tr('profile:editor.pin.label', { defaultValue: 'Pin a highlight' })} right={optional}>
        <div role="group" aria-label={tr('profile:editor.pin.label', { defaultValue: 'Pin a highlight' })} style={{ marginTop: 9, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {BS_PIN_KINDS.map((k) => {
            const on = pinned.kind === k.id;
            return <button key={k.id} type="button" data-pin-kind={k.id} aria-pressed={on} onClick={() => setPin({ kind: k.id })} style={chip(on)}>{bsPinKindLabel(k.id, tr)}</button>;
          })}
        </div>
        <input data-pin-title="" value={pinned.title} maxLength={BS_PIN_TITLE_MAX} onChange={(e) => setPin({ title: e.target.value })}
          aria-label={tr('profile:editor.ph.pinTitle', { defaultValue: 'Headline — e.g. Pulled 2× bodyweight today' })} placeholder={tr('profile:editor.ph.pinTitle', { defaultValue: 'Headline — e.g. Pulled 2× bodyweight today' })} style={{ ...field, marginTop: 8, fontSize: 16 }} />
        <input data-pin-note="" value={pinned.note} maxLength={BS_PIN_NOTE_MAX} onChange={(e) => setPin({ note: e.target.value })}
          aria-label={tr('profile:editor.ph.pinNote', { defaultValue: 'A line of context (optional)' })} placeholder={tr('profile:editor.ph.pinNote', { defaultValue: 'A line of context (optional)' })} style={{ ...field, marginTop: 8, fontSize: 16 }} />
        <input data-pin-metric="" value={pinned.metric} maxLength={BS_PIN_METRIC_MAX} onChange={(e) => setPin({ metric: e.target.value })}
          aria-label={tr('profile:editor.ph.pinMetric', { defaultValue: 'Metric (optional) — e.g. 2×BW' })} placeholder={tr('profile:editor.ph.pinMetric', { defaultValue: 'Metric (optional) — e.g. 2×BW' })} style={{ ...field, marginTop: 8, fontSize: 16 }} />
        {pinAny ? <button type="button" data-pin-clear="" onClick={() => setPinned({ kind: pinned.kind, title: '', note: '', metric: '' })} style={{ ...quietBtn, marginTop: 4 }}>{tr('profile:editor.pin.clear', { defaultValue: 'Clear pin' })}</button> : null}
      </Ruled>

      <Ruled data-spot-song="" kicker={tr('profile:extras.profileSong', { defaultValue: 'Profile song' })} right="Spotify">
        <input data-song-url="" value={song.url} maxLength={BS_LINK_MAX} onChange={(e) => setSong({ ...song, url: e.target.value })} autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="url"
          aria-label={tr('profile:editor.song.label', { defaultValue: 'Profile song · Spotify link' })} placeholder={SPOTIFY_PH} style={{ ...field, marginTop: 9, fontSize: 16 }} />
        <input data-song-label="" value={song.label} maxLength={BS_SONG_LABEL_MAX} onChange={(e) => setSong({ ...song, label: e.target.value })}
          aria-label={tr('profile:editor.ph.songLabel', { defaultValue: 'Label (optional) — e.g. Lift anthem' })} placeholder={tr('profile:editor.ph.songLabel', { defaultValue: 'Label (optional) — e.g. Lift anthem' })} style={{ ...field, marginTop: 8, fontSize: 16 }} />
        {songUrl && !embed ? <p role="alert" data-song-err="" style={{ margin: '8px 0 0', fontSize: 13.5, color: E.WARN }}>{tr('profile:editor.song.err', { defaultValue: 'Paste a Spotify track or playlist link (open.spotify.com/…).' })}</p> : null}
        {embed ? (
          <div data-song-preview="" style={{ marginTop: 10, borderRadius: 12, overflow: 'hidden', background: E.BG2 }}>
            <iframe title={tr('profile:editor.song.previewTitle', { defaultValue: 'Song preview' })} src={embed} width="100%" height="80" frameBorder="0" allow="encrypted-media" loading="lazy" style={{ display: 'block', border: 0 }} />
          </div>
        ) : null}
        {songUrl || song.label.trim() ? <button type="button" data-song-remove="" onClick={() => setSong({ url: '', label: '' })} style={{ ...quietBtn, marginTop: 4 }}>{tr('profile:mine.remove', { defaultValue: 'Remove' })}</button> : null}
      </Ruled>

      <Ruled data-spot-wins="" kicker={tr('profile:wins.head', { defaultValue: 'Wins wall' })} right={tr('profile:mine.countOf', { defaultValue: '{count} of {max}', count: pins.length, max: BS_PINNED_REVIEWS_MAX })}>
        <p style={{ ...hintStyle, margin: '6px 0 0' }}>{tr('profile:mine.winsHint', { defaultValue: 'Pin up to three of your members’ reviews. They lead What clients say on your page.' })}</p>
        {!reviewsRead ? null : shownReviews.length ? (
          <div style={{ marginTop: 8, borderTop: `1px solid ${ea(0.14)}` }}>
            {shownReviews.map((r) => {
              const on = pins.includes(r.id);
              const off = !on && full;
              return (
                <button key={r.id} type="button" data-spot-review={r.id} aria-pressed={on} disabled={off} onClick={() => togglePin(r.id)}
                  style={{ width: '100%', minHeight: 56, padding: '10px 0', border: 0, borderBottom: `1px solid ${ea(0.14)}`, background: 'transparent', color: off ? ea(0.45) : E.INK, display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left', cursor: off ? 'default' : 'pointer' }}>
                  <span style={{ paddingTop: 1 }}><TickBox on={on} lit /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: on ? E.ED : ea(0.55) }}>
                      {on ? tr('profile:editor.pins.pinned', { defaultValue: '✓ Pinned' }) : tr('profile:editor.pins.tapToPin', { defaultValue: 'Tap to pin' })} · ★ {Math.round(Number(r.rating) || 0)}/10 · {r.author || tr('profile:role.member', { defaultValue: 'Member' })}
                    </span>
                    <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginTop: 4, fontFamily: BODY, fontSize: 14, lineHeight: 1.4, color: off ? ea(0.45) : ea(0.86) }}>“{String(r.text || '').trim()}”</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : <p data-spot-wins-empty="" style={{ ...hintStyle, marginTop: 8 }}>{tr('profile:editor.pins.empty', { defaultValue: 'No reviews to pin yet — reviews members leave from now on can be pinned here.' })}</p>}
      </Ruled>
    </div>
  );
}

// The practice's card on About me: its name (the card's anchor), where, its hours and where to find
// them. The name and the place show under the coach's name; the hours and the handle on About me.
function PracticeCard({ tr, biz, setBiz }) {
  const set = (k, v) => setBiz((b) => ({ ...b, [k]: v }));
  const hair = `1px solid ${ABOUT_HAIR}`;
  const rows = [
    ['name', tr('profile:mine.bizName', { defaultValue: 'Name of your practice' }), tr('profile:editor.ph.bizName', { defaultValue: 'Business name — e.g. Iron Path Strength' }), BS_BIZ_NAME_MAX],
    ['where', tr('profile:biz.where', { defaultValue: 'Where' }), tr('profile:editor.ph.bizWhere', { defaultValue: 'Where (optional) — e.g. Austin, TX · online' }), BS_BIZ_WHERE_MAX],
    ['hours', tr('profile:biz.hours', { defaultValue: 'Hours' }), tr('profile:editor.ph.bizHours', { defaultValue: 'Hours (optional) — e.g. Mon–Fri, mornings' }), BS_BIZ_HOURS_MAX],
    ['handle', tr('profile:biz.find', { defaultValue: 'Find' }), tr('profile:editor.ph.bizHandle', { defaultValue: 'Find me (optional) — e.g. @ironpath' }), BS_BIZ_HANDLE_MAX],
  ];
  return (
    <div data-about-practice="">
      <div style={ABOUT_CARD}>
        {rows.map(([k, label, ph, max], i) => (
          <div key={k} data-about-cell="" style={{ padding: '10px 14px 2px', borderTop: i ? hair : 0 }}>
            <label htmlFor={`mine-biz-${k}`} style={aboutLabel}>{label}</label>
            <input id={`mine-biz-${k}`} data-about-biz={k} value={biz[k]} maxLength={max} onChange={(e) => set(k, e.target.value)} placeholder={ph}
              autoCapitalize={k === 'handle' ? 'none' : undefined} style={{ ...ABOUT_BARE, minHeight: 40 }} />
          </div>
        ))}
      </div>
      <p data-about-practice-hint="" style={{ ...hintStyle, margin: '10px 2px 0' }}>{tr('profile:mine.bizHint', { defaultValue: 'Its name and place show under your name; its hours and where to find you, on About me.' })}</p>
    </div>
  );
}

// `studioWords` (a trainer's About me only): { focus, setFocus, picks, setPicks, work, name } for the focus
// words and picks at its top.
function AboutTab({ tr, about, setAbout, prompts, setPrompts, links, setLinks, headLinks = false, setHeadLinks = () => {}, studioWords: studio = null, biz = null, setBiz = () => {} }) {
  const set = (k, v) => setAbout((a) => ({ ...a, [k]: v }));
  const howLabel = { online: tr('profile:mine.howOnline', { defaultValue: 'Online' }), in_person: tr('profile:mine.howInPerson', { defaultValue: 'In person' }), both: tr('profile:mine.howBoth', { defaultValue: 'Both' }) };
  const setPrompt = (i, k, v) => setPrompts((prev) => prev.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const unused = BS_COACH_PROMPTS.find((o) => !prompts.some((p) => bsPromptToken(p.q) === o.id));
  const hair = `1px solid ${ABOUT_HAIR}`;
  const storyShare = Math.min(1, about.story.length / BS_ABOUT_STORY_MAX);
  // What members read under the name: the focus words, else the listing's specialty.
  const focusSaid = studio ? studio.focus.filter((f) => !isBlankWord(f)).map((f) => bsFocusWordLabel(tr, f)).filter(Boolean) : [];
  const underName = focusSaid.length ? focusSaid.join(' · ') : studio ? studio.work.specialty : '';
  return (
    <div data-mine-about="">
      <style>{ABOUT_CSS}</style>
      {studio ? (
        <>
          <div data-about-preview="" style={{ marginTop: 14, padding: '10px 14px 12px', borderRadius: 10, background: E.BG2, border: `1px solid ${ea(0.14)}` }}>
            <span style={KICK}>{tr('profile:mine.onYourPage', { defaultValue: 'On your page' })}</span>
            <div style={{ marginTop: 5, fontFamily: DISPLAY, fontWeight: 600, fontSize: 19, lineHeight: 1.15, overflowWrap: 'anywhere' }}>{studio.name}<span style={{ color: E.ED }}>.</span></div>
            {underName ? <div data-about-preview-focus="" style={{ marginTop: 3, fontSize: 13.5, lineHeight: 1.4, color: focusSaid.length ? ea(0.8) : ea(0.5) }}>{underName}</div> : null}
          </div>
          <FocusField tr={tr} focus={studio.focus} setFocus={studio.setFocus} specialty={studio.work.specialty} />
          <PicksField tr={tr} picks={studio.picks} setPicks={studio.setPicks} workouts={studio.work.workouts} />
        </>
      ) : null}

      <AboutHead first={!studio} n={1} title={tr('profile:mine.story', { defaultValue: 'Your story' })} />
      <div data-about-cell="" style={ABOUT_CARD}>
        <GrowText data-about-story="" value={about.story} maxLength={BS_ABOUT_STORY_MAX} rows={5} minHeight={140} onChange={(e) => set('story', e.target.value)}
          aria-label={tr('profile:mine.story', { defaultValue: 'Your story' })}
          placeholder={tr('profile:mine.storyPh', { defaultValue: 'How you started, who you coach best, and what a client can expect.' })} style={{ padding: '12px 14px 6px' }} />
        {/* How much of the story's room is used: a hairline that fills, and the count. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px 12px' }}>
          <span aria-hidden style={{ flex: 1, height: 2, borderRadius: 2, background: ea(0.08), overflow: 'hidden' }}>
            <span style={{ display: 'block', width: `${storyShare * 100}%`, height: '100%', background: storyShare >= 0.95 ? E.WARN : E.ED }} />
          </span>
          <span data-about-story-count="" style={{ flex: 'none', fontFamily: MONO, fontSize: 11, color: ea(0.55), fontVariantNumeric: 'tabular-nums' }}>{about.story.length} / {BS_ABOUT_STORY_MAX}</span>
        </div>
      </div>

      <AboutHead n={2} title={tr('profile:mine.details', { defaultValue: 'The details' })} />
      <div style={ABOUT_CARD}>
        <div data-about-cell="" style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 54, padding: '0 14px' }}>
          <label htmlFor="mine-about-years" style={{ flex: 1, minWidth: 0, alignSelf: 'stretch', display: 'flex', alignItems: 'center', fontSize: 15, color: E.INK, cursor: 'text' }}>{tr('profile:mine.years', { defaultValue: 'Years coaching' })}</label>
          <input id="mine-about-years" data-about-years="" inputMode="numeric" value={about.years} onChange={(e) => set('years', e.target.value.replace(/\D/g, '').slice(0, 2))} 
            style={{ ...ABOUT_BARE, width: 64, minHeight: 40, flex: 'none', borderRadius: 9, border: `1px solid ${ea(0.16)}`, background: E.BG, textAlign: 'center', fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }} />
        </div>
        <div style={{ padding: '12px 14px 14px', borderTop: hair }}>
          <div style={{ ...aboutLabel, marginBottom: 8 }}>{tr('profile:mine.how', { defaultValue: 'How you coach' })}</div>
          {/* One of three, or none: the lit one taps off again. */}
          <div role="group" aria-label={tr('profile:mine.how', { defaultValue: 'How you coach' })} style={{ display: 'grid', gridTemplateColumns: `repeat(${BS_ABOUT_HOW.length}, minmax(0, 1fr))`, gap: 3, padding: 3, borderRadius: 999, background: E.BG, border: `1px solid ${ea(0.14)}` }}>
            {BS_ABOUT_HOW.map((k) => {
              const on = about.how === k;
              return <button key={k} type="button" data-about-how={k} aria-pressed={on} onClick={() => set('how', on ? '' : k)}
                style={{ minHeight: 38, minWidth: 0, padding: '0 6px', border: 0, borderRadius: 999, background: on ? E.INK : 'transparent', color: on ? E.BG : ea(0.8), fontFamily: DISPLAY, fontSize: 14, lineHeight: 1.15, fontWeight: on ? 600 : 400, cursor: 'pointer' }}>{howLabel[k]}</button>;
            })}
          </div>
        </div>
        <div data-about-cell="" style={{ padding: '10px 14px 2px', borderTop: hair }}>
          <label htmlFor="mine-about-where" style={aboutLabel}>{tr('profile:mine.where', { defaultValue: 'Where you coach' })}</label>
          <input id="mine-about-where" data-about-where="" value={about.where} maxLength={BS_ABOUT_FACT_MAX} onChange={(e) => set('where', e.target.value)} placeholder={tr('profile:mine.wherePh', { defaultValue: 'City, gym or area' })} style={{ ...ABOUT_BARE, minHeight: 40 }} />
        </div>
        <div data-about-cell="" style={{ padding: '10px 14px 2px', borderTop: hair }}>
          <label htmlFor="mine-about-languages" style={aboutLabel}>{tr('profile:mine.languages', { defaultValue: 'Languages you coach in' })}</label>
          <input id="mine-about-languages" data-about-languages="" value={about.languages} maxLength={BS_ABOUT_FACT_MAX} onChange={(e) => set('languages', e.target.value)} placeholder={tr('profile:mine.languagesPh', { defaultValue: 'English, Spanish' })} style={{ ...ABOUT_BARE, minHeight: 40 }} />
        </div>
      </div>

      <AboutHead n={3} title={tr('profile:mine.accolades', { defaultValue: 'Accolades' })} right={`${about.accolades.length} / ${BS_ABOUT_LIST_MAX}`} />
      <AboutList kind="accolades" tr={tr} rows={about.accolades} setRows={(fn) => setAbout((a) => ({ ...a, accolades: fn(a.accolades) }))}
        titlePh={tr('profile:mine.accoladePh', { defaultValue: 'Coach of the Year, a meet won, a feature' })}
        detailPh={tr('profile:mine.accoladeFromPh', { defaultValue: 'Who gave it, or where' })}
        addLabel={tr('profile:mine.accoladeAdd', { defaultValue: 'Add an accolade' })} />

      <AboutHead n={4} title={tr('profile:mine.education', { defaultValue: 'Education and training' })} right={`${about.education.length} / ${BS_ABOUT_LIST_MAX}`} />
      <AboutList kind="education" tr={tr} rows={about.education} setRows={(fn) => setAbout((a) => ({ ...a, education: fn(a.education) }))}
        titlePh={tr('profile:mine.educationPh', { defaultValue: 'A degree, a course or a mentorship' })}
        detailPh={tr('profile:mine.educationFromPh', { defaultValue: 'School or teacher' })}
        addLabel={tr('profile:mine.educationAdd', { defaultValue: 'Add a degree or course' })} />
      {/* Certificates are the ones Shape verified, not typed here (owner, 2026-11-03: "certificates"). */}
      <p data-about-certs-note="" style={{ display: 'flex', alignItems: 'flex-start', gap: 9, margin: '12px 2px 0', fontSize: 13, lineHeight: 1.45, color: ea(0.66) }}>
        <span aria-hidden style={{ flex: 'none', width: 18, height: 18, marginTop: 1, boxSizing: 'border-box', borderRadius: 99, border: `1px solid ${E.ED}`, color: E.ED, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700 }}>✓</span>
        <span>{tr('profile:mine.certsNote', { defaultValue: 'Your certificates show on About me once Shape has verified them.' })}</span>
      </p>

      <AboutHead n={5} title={tr('profile:mine.qa', { defaultValue: 'Questions members ask' })} right={`${prompts.length} / ${BS_PROMPTS_MAX}`} />
      {prompts.map((p, i) => {
        const tok = bsPromptToken(p.q);
        const known = BS_COACH_PROMPTS.some((o) => o.id === tok);
        return (
          <div key={i} data-about-prompt="" data-about-cell="" style={{ ...ABOUT_CARD, marginTop: i ? 10 : 0 }}>
            {/* The question is the card's head: pick it, then answer under the hairline. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, paddingLeft: 14 }}>
              <span style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex' }}>
                <select aria-label={tr('profile:mine.qaQuestion', { defaultValue: 'Question {n}', n: i + 1 })} value={tok} onChange={(e) => setPrompt(i, 'q', e.target.value)}
                  style={{ ...ABOUT_BARE, appearance: 'none', WebkitAppearance: 'none', paddingRight: 22, fontFamily: DISPLAY, fontSize: 15.5, fontWeight: 600, textOverflow: 'ellipsis', cursor: 'pointer' }}>
                  {BS_COACH_PROMPTS.map((o) => <option key={o.id} value={o.id}>{bsPromptLabel(o.id, tr)}</option>)}
                  {known ? null : <option value={tok}>{bsPromptLabel(tok, tr)}</option>}
                </select>
                <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={E.ED} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: 4, top: '50%', marginTop: -6, pointerEvents: 'none' }}><path d="m6 9 6 6 6-6" /></svg>
              </span>
              <button type="button" data-about-prompt-remove="" onClick={() => setPrompts((prev) => prev.filter((_, j) => j !== i))}
                aria-label={tr('profile:mine.qaRemove', { defaultValue: 'Remove' })} style={aboutX}><span aria-hidden>×</span></button>
            </div>
            <div aria-hidden style={{ height: 1, margin: '0 14px', background: ABOUT_HAIR }} />
            <GrowText data-about-answer="" value={p.a} maxLength={BS_PROMPT_A_MAX} rows={3} minHeight={88} onChange={(e) => setPrompt(i, 'a', e.target.value)}
              aria-label={tr('profile:mine.qaAnswer', { defaultValue: 'Answer {n}', n: i + 1 })} placeholder={tr('profile:editor.ph.promptAnswer', { defaultValue: 'Your answer…' })} style={{ padding: '10px 14px 12px' }} />
          </div>
        );
      })}
      {prompts.length < BS_PROMPTS_MAX ? (
        <button type="button" data-about-prompt-add="" onClick={() => setPrompts((prev) => [...prev, { q: (unused || BS_COACH_PROMPTS[0]).id, a: '' }])} style={{ ...aboutAdd, marginTop: prompts.length ? 8 : 0 }}>＋ {tr('profile:mine.qaAdd', { defaultValue: 'Add a question' })}</button>
      ) : null}

      <AboutHead n={6} title={tr('profile:mine.socials', { defaultValue: 'Your socials' })} />
      <div style={ABOUT_CARD}>
        {BS_PROFILE_LINK_KEYS.map((k, i) => (
          <div key={k} data-about-cell="" style={{ display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr)', alignItems: 'center', gap: 10, padding: '0 14px', borderTop: i ? hair : 0 }}>
            <label htmlFor={`mine-link-${k}`} style={{ alignSelf: 'stretch', display: 'flex', alignItems: 'center', fontSize: 14, color: ea(0.72) }}>{bsLinkName(k, tr)}</label>
            <input id={`mine-link-${k}`} data-about-link={k} value={links[k] || ''} maxLength={BS_LINK_MAX} onChange={(e) => setLinks((l) => ({ ...l, [k]: e.target.value }))}
              autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="url"
              placeholder={k === 'website' ? tr('profile:editor.ph.linkSite', { defaultValue: 'yoursite.com' }) : `@${tr('profile:editor.ph.linkHandle', { defaultValue: 'you' })}`} style={{ ...ABOUT_BARE, minHeight: 50 }} />
          </div>
        ))}
      </div>
      {/* The head shows them too, if the coach chooses (owner, 2026-11-03). Off unless turned on. */}
      <button type="button" role="switch" aria-checked={headLinks} data-about-head-links="" onClick={() => setHeadLinks(!headLinks)}
        style={{ ...ABOUT_CARD, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', minHeight: 54, marginTop: 10, padding: '0 14px', color: E.INK, cursor: 'pointer', textAlign: 'left', fontFamily: BODY, fontSize: 15 }}>
        <span>{tr('profile:mine.socialsInHead', { defaultValue: 'Show them at the top of your page' })}</span>
        <span aria-hidden style={{ flex: 'none', width: 42, height: 24, borderRadius: 999, background: headLinks ? E.ED : ea(0.22), position: 'relative', transition: 'background 160ms ease' }}>
          <span style={{ position: 'absolute', top: 3, left: headLinks ? 21 : 3, width: 18, height: 18, borderRadius: 999, background: headLinks ? E.ON_ED : E.INK, transition: 'left 160ms ease' }} />
        </span>
      </button>

      {biz ? (
        <>
          <AboutHead n={7} title={tr('profile:biz.head', { defaultValue: 'The practice' })} />
          <PracticeCard tr={tr} biz={biz} setBiz={setBiz} />
        </>
      ) : null}
    </div>
  );
}

function KitchenTab({ tr, look, kitchen, setKitchen, startSection = null, owner, uploadPhoto, draft, setDraft }) {
  const [part, setPart] = React.useState(KITCHEN_PARTS.some(([k]) => k === startSection) ? startSection : 'recipes');
  const [msg, setMsg] = React.useState(null);
  const [staple, setStaple] = React.useState('');
  const [group, setGroup] = React.useState('fridge');
  const { plate, rules, staples, recipes } = kitchen;
  // The plate in the page's colours: protein in the accent being picked, vegetables green and carbs
  // amber unless the accent already is that colour (the page's plateColors).
  const ACC = paletteOf(look.paper, look.accent).ACCENT;
  const near = (x) => String(ACC).toLowerCase() === x;
  const colorOf = { veg: near('#5fb16e') || near('#2f6b3a') ? ea(0.4) : '#5fb16e', protein: ACC, carbs: near('#e3a544') || near('#c8881a') ? ea(0.4) : '#e3a544' };
  const partName = (k) => tr('profile:nutri.' + PLATE_PARTS.find((x) => x[0] === k)[1], { defaultValue: PLATE_PARTS.find((x) => x[0] === k)[2] });
  const groupName = (g) => { const x = STAPLE_GROUPS.find((y) => y[0] === g); return tr('profile:nutri.' + x[1], { defaultValue: x[2] }); };
  const set = (patch) => { setMsg(null); setKitchen({ ...kitchen, ...patch }); };
  const move = (i, by) => {
    const j = i + by;
    if (j < 0 || j >= recipes.length) return;
    const next = recipes.slice();
    [next[i], next[j]] = [next[j], next[i]];
    set({ recipes: next });
  };
  const write = () => {
    if (recipes.length >= BS_KITCHEN_RECIPES_MAX) { setMsg(tr('profile:mine.recipesFull', { defaultValue: 'Up to {count} recipes.', count: BS_KITCHEN_RECIPES_MAX })); return; }
    setDraft(draftOf(null));
  };
  const keep = (r) => {
    const at = recipes.findIndex((x) => x.id === r.id);
    set({ recipes: at >= 0 ? recipes.map((x, k) => (k === at ? r : x)) : [...recipes, r] });
    setDraft(null);
  };
  // Removing a recipe happens in its own screen, after a confirm, so the list reads as recipes.
  const drop = (id) => { set({ recipes: recipes.filter((x) => x.id !== id) }); setDraft(null); };
  const addStaple = () => {
    const n = staple.trim();
    if (!n) return;
    if (staples.length >= BS_KITCHEN_STAPLES_MAX) { setMsg(tr('profile:mine.staplesFull', { defaultValue: 'Up to {count} staples.', count: BS_KITCHEN_STAPLES_MAX })); return; }
    if (staples.some((x) => x.n.toLowerCase() === n.toLowerCase())) { setStaple(''); return; }
    set({ staples: [...staples, { n: n.slice(0, BS_STAPLE_MAX), g: group }] });
    setStaple('');
  };
  const meta = (r) => [
    Number.isFinite(r.min) ? tr('cook:ck.mins', { defaultValue: '{n} min', n: r.min }) : null,
    Number.isFinite(r.kcal) ? tr('cook:ck.kcal', { defaultValue: '{n} kcal', n: r.kcal }) : null,
    Number.isFinite(r.p) ? tr('cook:ck.gProtein', { defaultValue: '{n} g protein', n: r.p }) : null,
  ].filter(Boolean).join(' · ');
  // The plate's starting splits, plus None (no plate picture on the page, only the rules), as one
  // segmented choice. A split changed by hand is the coach's own: no preset is lit then.
  const presetOf = !plate ? 'none' : (PLATE_PRESETS.find(([, pl]) => plate.veg === pl.veg && plate.protein === pl.protein && plate.carbs === pl.carbs) || [null])[0];
  const presetName = (k) => (k === 'none' ? tr('profile:mine.presetNone', { defaultValue: 'None' }) : tr('profile:mine.preset' + k.charAt(0).toUpperCase() + k.slice(1), { defaultValue: { everyday: 'Everyday', training: 'Training day', lighter: 'Lighter' }[k] }));
  const quiet = { width: 44, height: 44, flex: 'none', padding: 0, border: 0, borderRadius: 10, background: 'transparent', color: ea(0.62), fontSize: 18, lineHeight: 1, cursor: 'pointer' };

  if (draft) {
    return <RecipeForm tr={tr} draft={draft} setDraft={setDraft} owner={owner} uploadPhoto={uploadPhoto} onDone={keep} onCancel={() => setDraft(null)}
      onRemove={draft.isNew || !recipes.some((x) => x.id === draft.id) ? null : () => drop(draft.id)} />;
  }
  return (
    <div>
      <Seg label={tr('profile:nutri.sections', { defaultValue: 'In the kitchen' })} value={part} onChange={(k) => { setPart(k); setMsg(null); }}
        options={KITCHEN_PARTS.map(([k, key, en]) => [k, tr('profile:nutri.' + key, { defaultValue: en })])} />


      {part === 'recipes' ? (
        <div data-mine-part="recipes">
          <Eyebrow right={tr('profile:mine.countOf', { defaultValue: '{count} of {max}', count: recipes.length, max: BS_KITCHEN_RECIPES_MAX })}>{tr('profile:mine.yourRecipes', { defaultValue: 'Your recipes' })}</Eyebrow>
          {recipes.length ? (
            <>
              <div style={{ borderRadius: 14, background: E.BG2, border: `1px solid ${ea(0.1)}`, overflow: 'hidden' }}>
                {recipes.map((r, i) => (
                  // The card opens the recipe; the arrows beside it put it higher or lower on the page.
                  <div key={r.id} data-mine-recipe={r.id} style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 4px 0 0', borderTop: i ? `1px solid ${ea(0.08)}` : 0 }}>
                    <button type="button" data-edit-recipe={r.id} onClick={() => setDraft(draftOf(r))} aria-label={tr('profile:mine.editRecipe', { defaultValue: 'Edit {name}', name: r.t })}
                      style={{ flex: 1, minWidth: 0, minHeight: 64, padding: '10px 6px 10px 12px', border: 0, background: 'transparent', color: E.INK, display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', cursor: 'pointer' }}>
                      {r.photo ? <img src={r.photo} alt="" style={{ flex: 'none', width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }} />
                        : <span aria-hidden style={{ flex: 'none', width: 44, height: 44, borderRadius: 10, display: 'grid', placeItems: 'center', background: hexA(ACC, 0.3), fontFamily: DISPLAY, fontWeight: 600 }}>{r.t.charAt(0).toUpperCase()}</span>}
                      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
                        <span style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.t}</span>
                        <span style={{ fontSize: 12, color: ea(0.6) }}>{meta(r) || tr('profile:mine.recipeParts', { defaultValue: '{ing, plural, one {# ingredient} other {# ingredients}} · {steps, plural, one {# step} other {# steps}}', ing: (r.ing || []).length, steps: (r.steps || []).length })}</span>
                      </span>
                    </button>
                    {recipes.length > 1 ? (
                      <span style={{ flex: 'none', display: 'flex', flexDirection: 'column' }}>
                        <button type="button" aria-label={tr('profile:mine.moveUp', { defaultValue: 'Move up' })} onClick={() => move(i, -1)} disabled={i === 0} style={{ ...quiet, height: 36, fontSize: 16, visibility: i === 0 ? 'hidden' : 'visible' }}>↑</button>
                        <button type="button" aria-label={tr('profile:mine.moveDown', { defaultValue: 'Move down' })} onClick={() => move(i, 1)} disabled={i === recipes.length - 1} style={{ ...quiet, height: 36, fontSize: 16, visibility: i === recipes.length - 1 ? 'hidden' : 'visible' }}>↓</button>
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
              <p style={{ margin: '8px 2px 0', fontSize: 12.5, color: ea(0.55) }}>{tr('profile:mine.recipesHint', { defaultValue: 'Tap a recipe to change or remove it. The arrows set the order on your page.' })}</p>
            </>
          ) : <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45, color: ea(0.66) }}>{tr('profile:mine.noRecipes', { defaultValue: 'No recipes yet. Write the ones you give clients, or paste one in.' })}</p>}
          <button type="button" data-write-recipe="" onClick={write} style={{ ...smallBtn, marginTop: 12, width: '100%', minHeight: 46, background: recipes.length < BS_KITCHEN_RECIPES_MAX ? E.ED : 'transparent', color: recipes.length < BS_KITCHEN_RECIPES_MAX ? E.ON_ED : ea(0.6), border: recipes.length < BS_KITCHEN_RECIPES_MAX ? 0 : smallBtn.border }}>＋ {tr('profile:nutri.writeRecipe', { defaultValue: 'Write a recipe' })}</button>
        </div>
      ) : null}

      {part === 'plate' ? (
        <div data-mine-part="plate">
          <Eyebrow>{tr('profile:mine.plate', { defaultValue: 'The plate you teach' })}</Eyebrow>
          <div role="group" aria-label={tr('profile:mine.plate', { defaultValue: 'The plate you teach' })} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 3, padding: 3, borderRadius: 14, border: `1px solid ${ea(0.2)}` }}>
            {['none', ...PLATE_PRESETS.map(([k]) => k)].map((k) => {
              const on = presetOf === k;
              const pick = () => (k === 'none' ? set({ plate: null }) : set({ plate: { ...PLATE_PRESETS.find((x) => x[0] === k)[1] } }));
              return <button key={k} type="button" data-plate-preset={k} aria-pressed={on} onClick={pick}
                style={{ minHeight: 44, padding: '4px 4px', border: 0, borderRadius: 11, background: on ? E.INK : 'transparent', color: on ? E.BG : ea(0.82), fontFamily: DISPLAY, fontSize: 13, fontWeight: on ? 600 : 400, lineHeight: 1.15, cursor: 'pointer' }}>{presetName(k)}</button>;
            })}
          </div>
          <p style={{ margin: '8px 2px 0', fontSize: 12.5, lineHeight: 1.4, color: ea(0.58) }}>{!plate
            ? tr('profile:mine.plateNone', { defaultValue: 'No plate picture on your page: members see only your portion rules. Pick a split to show one.' })
            : presetOf ? tr('profile:mine.platePreset', { defaultValue: 'A starting split. Change any part below in steps of 5.' })
              : tr('profile:mine.plateOwn', { defaultValue: 'Your own split.' })}</p>
          {plate ? (
            // The plate large, its total under it, then a row per part, each with one rounded stepper.
            <div style={{ marginTop: 12, padding: '16px 14px 8px', borderRadius: 14, background: E.BG2 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <span aria-hidden data-mine-plate="" style={{ width: 124, height: 124, borderRadius: 99, background: `conic-gradient(${colorOf.veg} 0 ${plate.veg}%, ${colorOf.protein} ${plate.veg}% ${plate.veg + plate.protein}%, ${colorOf.carbs} ${plate.veg + plate.protein}% 100%)`, display: 'grid', placeItems: 'center' }}>
                  <span style={{ width: 44, height: 44, borderRadius: 99, background: E.BG2 }} />
                </span>
                <span data-plate-total="" style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.06em', color: plate.veg + plate.protein + plate.carbs === 100 ? E.ED : E.WARN }}>
                  {tr('profile:mine.plateTotal', { defaultValue: 'Total {n}%', n: plate.veg + plate.protein + plate.carbs })}{plate.veg + plate.protein + plate.carbs === 100 ? ' ✓' : ''}
                </span>
              </div>
              <div style={{ marginTop: 8 }}>
                {PLATE_PARTS.map(([k], i) => (
                  <div key={k} style={{ minHeight: 56, display: 'flex', alignItems: 'center', gap: 10, borderTop: i ? `1px solid ${ea(0.08)}` : 0 }}>
                    <span aria-hidden style={{ flex: 'none', width: 10, height: 10, borderRadius: 99, background: colorOf[k] }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: 1.2 }}>{partName(k)}</span>
                    <span style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', height: 44, borderRadius: 999, border: `1px solid ${ea(0.18)}` }}>
                      <button type="button" aria-label={tr('profile:mine.less', { defaultValue: 'Less {part}', part: partName(k) })} onClick={() => set({ plate: nudgePlate(plate, k, -5) })} style={{ ...quiet, borderRadius: 999, color: E.INK }}>−</button>
                      <span data-plate-part={k} style={{ width: 44, textAlign: 'center', fontFamily: MONO, fontSize: 13 }}>{tr('profile:nutri.pct', { defaultValue: '{n}%', n: plate[k] })}</span>
                      <button type="button" aria-label={tr('profile:mine.more', { defaultValue: 'More {part}', part: partName(k) })} onClick={() => set({ plate: nudgePlate(plate, k, 5) })} style={{ ...quiet, borderRadius: 999, color: E.INK }}>＋</button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <Eyebrow right={tr('profile:mine.countOf', { defaultValue: '{count} of {max}', count: rules.length, max: BS_KITCHEN_RULES_MAX })}>{tr('profile:mine.rules', { defaultValue: 'Your portion rules' })}</Eyebrow>
          {rules.length ? (
            <div style={{ borderRadius: 14, background: E.BG2, border: `1px solid ${ea(0.1)}`, padding: '0 4px 0 14px' }}>
              {rules.map((r, i) => (
                <div key={i} data-rule-row="" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, borderTop: i ? `1px solid ${ea(0.08)}` : 0 }}>
                  <span aria-hidden style={{ flex: 'none', paddingTop: 12, fontFamily: MONO, fontSize: 12, color: ACC }}>—</span>
                  <RuleField value={r} label={tr('profile:mine.ruleN', { defaultValue: 'Rule {n}', n: i + 1 })} onChange={(v) => set({ rules: rules.map((x, k) => (k === i ? v : x)) })} />
                  <button type="button" aria-label={tr('profile:mine.removeRule', { defaultValue: 'Remove rule {n}', n: i + 1 })} onClick={() => set({ rules: rules.filter((x, k) => k !== i) })} style={quiet}>×</button>
                </div>
              ))}
            </div>
          ) : null}
          {rules.length < BS_KITCHEN_RULES_MAX ? (
            <button type="button" data-add-rule="" onClick={() => set({ rules: [...rules, ''] })} style={{ ...smallBtn, marginTop: rules.length ? 8 : 0, width: '100%', minHeight: 46, borderStyle: 'dashed', color: ea(0.85) }}>
              ＋ {tr('profile:mine.addRuleShort', { defaultValue: 'Add a rule' })}
            </button>
          ) : null}
          {!rules.length ? <p style={{ margin: '8px 2px 0', fontSize: 12.5, color: ea(0.55) }}>{tr('profile:mine.ruleExample', { defaultValue: 'Like “A palm of protein at every meal”.' })}</p> : null}
        </div>
      ) : null}

      {part === 'staples' ? (
        <div data-mine-part="staples">
          <Eyebrow right={tr('profile:mine.countOf', { defaultValue: '{count} of {max}', count: staples.length, max: BS_KITCHEN_STAPLES_MAX })}>{tr('profile:mine.staples', { defaultValue: 'Always in your kitchen' })}</Eyebrow>
          {/* The staples where they live, as the page groups them: each a chip with its own ×. */}
          {staples.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              {STAPLE_GROUPS.map(([g]) => {
                const inG = staples.map((x, i) => ({ x, i })).filter(({ x }) => x.g === g);
                if (!inG.length) return null;
                return (
                  <div key={g} data-mine-staple-group={g}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: ea(0.7) }}><span style={{ color: ACC, display: 'inline-flex' }}><StapleGlyph g={g} /></span>{groupName(g)}<span style={{ fontFamily: MONO, fontSize: 11, color: ea(0.45) }}>{inG.length}</span></span>
                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {inG.map(({ x, i }) => (
                        <span key={x.n} data-mine-staple="" style={{ minHeight: 44, padding: '0 0 0 14px', borderRadius: 999, background: E.BG3, display: 'inline-flex', alignItems: 'center', fontSize: 14 }}>
                          {x.n}
                          <button type="button" aria-label={tr('profile:mine.removeStaple', { defaultValue: 'Remove {name}', name: x.n })} onClick={() => set({ staples: staples.filter((y, k) => k !== i) })} style={{ ...quiet, width: 40, borderRadius: 999, fontSize: 16 }}>×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
          {/* One control to add: where it lives, then its name and Add. */}
          <div data-add-staple-row="" style={{ padding: 10, borderRadius: 14, background: E.BG2, border: `1px solid ${ea(0.1)}` }}>
            <div role="group" aria-label={tr('profile:mine.stapleWhere', { defaultValue: 'Where it lives' })} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 3 }}>
              {STAPLE_GROUPS.map(([g]) => {
                const on = g === group;
                return <button key={g} type="button" aria-pressed={on} onClick={() => setGroup(g)}
                  style={{ minHeight: 40, border: 0, borderRadius: 10, background: on ? hexA(ACC, 0.22) : 'transparent', color: on ? E.INK : ea(0.7), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: DISPLAY, fontSize: 13.5, fontWeight: on ? 600 : 400, cursor: 'pointer' }}>
                  <span style={{ display: 'inline-flex', color: on ? ACC : 'inherit' }}><StapleGlyph g={g} /></span>{groupName(g)}
                </button>;
              })}
            </div>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', borderRadius: 12, border: `1px solid ${ea(0.2)}`, background: E.BG, overflow: 'hidden' }}>
              <input value={staple} maxLength={BS_STAPLE_MAX} onChange={(e) => setStaple(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStaple(); } }}
                aria-label={tr('profile:mine.stapleName', { defaultValue: 'A staple' })} placeholder={tr('profile:mine.staplePh', { defaultValue: 'Greek yogurt' })} style={{ ...field, flex: 1, border: 0, borderRadius: 0, background: 'transparent' }} />
              <button type="button" data-add-staple="" onClick={addStaple} disabled={!staple.trim()} style={{ flex: 'none', minHeight: 44, padding: '0 16px', border: 0, borderLeft: `1px solid ${ea(0.14)}`, background: staple.trim() ? E.ED : 'transparent', color: staple.trim() ? E.ON_ED : ea(0.5), fontFamily: DISPLAY, fontSize: 14, fontWeight: 600, cursor: staple.trim() ? 'pointer' : 'default' }}>
                {tr('profile:mine.addTo', { defaultValue: 'Add to {place}', place: groupName(group) })}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {msg ? <p role="alert" style={{ margin: '10px 0 0', fontSize: 13.5, color: E.WARN }}>{msg}</p> : null}
    </div>
  );
}

// ── The editor ──────────────────────────────────────────────────────────────────────────────
// `figures`: the coach's numbers by stat key, as their page has them (coachWork.mjs bsCoachStatFigures),
// for the headline stats' picker. `reviews` and `clips`: the demo's own sample reviews and clips.
// The live preview's Message: drawn as members see it, never reached (the layer's guard stops the tap).
const bsLiveNoop = () => {};

export function BSMakeItYours({ role = 'trainer', demo = false, ownerUid = null, initial = null, startTab = 'colors', startSection = null, who = {}, words = null, photos = [], work = null, figures = null, reviews = null, clips = null, onClose, onSaved, onSettings = null }) {
  const tr = useShapeTr();
  // The app's gutter, so the masthead and ← Back sit where they sit on every page (owner,
  // 2026-10-31); the chrome's hook is on window before any page renders.
  const theme = (window.useBS || (() => null))();
  const gut = (theme && theme.padX) || 22;
  const nutri = role === 'nutritionist';
  // The third tab: a trainer's programs (once their space), a nutritionist's kitchen.
  const third = nutri ? 'kitchen' : 'programs';
  // What a trainer sells, as their page lists it: what the Programs tab and About me's picks describe.
  const wk = bsStudioWorkIn(work);
  // The account the editor is for (the one its `initial` doc was read for, else the one signed in
  // when it opened): the only one it reads for or saves to.
  const [owner] = React.useState(() => ownerUid || signedInUid());
  // A wall photo the editor keeps: the owner's own media, or in the demo one of its photos.
  const coverOf = (image) => (demo ? (photos.includes(image) ? { image } : null) : bsProfileCover({ image }, owner));
  // The film likewise: the coach's own video in coach-media, or in the demo one of its clips.
  const demoClips = Array.isArray(clips) ? clips : [];
  const demoReviews = demo && Array.isArray(reviews) ? reviews.filter((r) => r && typeof r.id === 'string' && String(r.text || '').trim()) : [];
  const filmOf = (f) => {
    if (!f || typeof f !== 'object') return null;
    if (demo) return typeof f.url === 'string' && demoClips.includes(f.url) ? { url: f.url, caption: bsCleanText(f.caption, BS_FILM_CAPTION_MAX) } : null;
    return bsProfileFilm(f, owner, 'coach-media');
  };
  // What the editor opened on, fixed for its life, so what reads as changed is what the coach
  // changed here. The profile opens it only once their doc is read (Codex P1 on #2484).
  const [seed] = React.useState(() => {
    const look = bsProfileLook(initial && initial.look) || {};
    const cover = initial && initial.cover ? coverOf(initial.cover.image) : null;
    const kt = bsProfileKitchen(initial && initial.kitchen, owner);
    const ab = bsProfileAbout(initial && initial.about) || {};
    return {
      // The About: the story and details as typed (years as text), the questions as the coach's
      // tokens, the socials as written.
      about: { story: ab.story || '', years: ab.years ? String(ab.years) : '', how: ab.how || '', where: ab.where || '', languages: ab.languages || '',
        accolades: bsAboutRowsIn(ab.accolades), education: bsAboutRowsIn(ab.education) },
      prompts: bsProfilePrompts(initial && initial.prompts).map((p) => ({ q: bsPromptToken(p.q), a: p.a })),
      links: { ...(bsProfileLinks(initial && initial.links) || {}) },
      headLinks: !!(initial && initial.headLinks === true),
      // The Studio's words (a trainer's): the focus words and picks as stored, each description and
      // who-it's-for by its key.
      focus: bsProfileFocus(initial && initial.focus),
      picks: bsProfilePicks(initial && initial.picks),
      descs: { ...(bsProfileDescriptions(initial && initial.descriptions) || {}) },
      programFor: { ...(bsProfileProgramFor(initial && initial.programFor) || {}) },
      // A nutritionist starts amber (Shape's nutritionist gold), as their page does.
      look: { paper: look.paper || 'dark', accent: look.accent || (nutri ? 'amber' : 'teal'), focus: look.focus || 'center' }, wall: cover ? cover.image : null,
      kitchen: kt
        ? { plate: kt.plate, rules: kt.rules.slice(), staples: kt.staples.map((x) => ({ ...x })), recipes: JSON.parse(JSON.stringify(kt.recipes)) }
        : { plate: null, rules: [], staples: [], recipes: [] },
      // The Spotlight, each as the page would show it: a stat key another editor wrote that is not a
      // coach's opens unticked, and a song or highlight the page would not draw opens empty.
      film: filmOf(initial && initial.film),
      stats: bsCoachHeadlineKeys(initial && initial.heroStats, role),
      publicStats: bsProfilePublicStats(initial && initial.publicStats),
      pinned: (() => { const p = bsProfilePinned(initial && initial.pinned); return p ? { kind: p.kind || 'win', title: p.title, note: p.note, metric: p.metric } : { kind: 'win', title: '', note: '', metric: '' }; })(),
      song: (() => { const s = bsProfileSong(initial && initial.song); return s ? { url: s.url, label: s.label } : { url: '', label: '' }; })(),
      // A demo's pins are its sample reviews' ids; a coach's, their members' reviews' (uuids).
      pins: demo
        ? (Array.isArray(initial && initial.pinnedReviews) ? initial.pinnedReviews.filter((id, i, a) => demoReviews.some((r) => r.id === id) && a.indexOf(id) === i).slice(0, BS_PINNED_REVIEWS_MAX) : [])
        : bsProfilePinnedReviews(initial && initial.pinnedReviews),
      biz: (() => { const b = bsProfileBizCard(initial && initial.bizCard); return { name: (b && b.name) || '', where: (b && b.where) || '', hours: (b && b.hours) || '', handle: (b && b.handle) || '' }; })(),
    };
  });
  // A trainer's Programs took Your space's place, so a way in that still asks for the space opens it.
  const startAt = !nutri && startTab === 'space' ? 'programs' : startTab;
  const [tab, setTab] = React.useState(['colors', 'wall', third, 'spotlight', 'about'].includes(startAt) ? startAt : 'colors');
  const [look, setLook] = React.useState(seed.look);
  const [wall, setWall] = React.useState(seed.wall);
  const [kitchen, setKitchen] = React.useState(seed.kitchen);
  const [about, setAbout] = React.useState(seed.about);
  const [prompts, setPrompts] = React.useState(seed.prompts);
  const [links, setLinks] = React.useState(seed.links);
  const [headLinks, setHeadLinks] = React.useState(seed.headLinks);
  const [focus, setFocus] = React.useState(seed.focus);
  const [picks, setPicks] = React.useState(seed.picks);
  const [descs, setDescs] = React.useState(seed.descs);
  const [programFor, setProgramFor] = React.useState(seed.programFor);
  const [film, setFilm] = React.useState(seed.film);
  const [filmBusy, setFilmBusy] = React.useState(false);
  const [filmErr, setFilmErr] = React.useState(null);
  const [stats, setStats] = React.useState(seed.stats);
  const [publicStats, setPublicStats] = React.useState(seed.publicStats);
  const [highlight, setHighlight] = React.useState(seed.pinned);
  const [song, setSong] = React.useState(seed.song);
  const [pins, setPins] = React.useState(seed.pins);
  const [biz, setBiz] = React.useState(seed.biz);
  // The coach's own reviews to pin from (their members', never one of their own), read when Spotlight
  // first opens: their latest, and the ones already pinned (by id, so a pin older than the latest is
  // still there to take off). `reviewsOk` says both reads answered, so a pin that is not among them is
  // a review gone, which neither fills a place nor survives the next change (as a pick of a workout).
  const [cands, setCands] = React.useState(() => (demo ? demoReviews : null));
  const [reviewsOk, setReviewsOk] = React.useState(demo);
  React.useEffect(() => {
    if (demo || tab !== 'spotlight' || cands !== null) return undefined;
    const api = window.ShapeCoachReviews;
    if (!api || !owner) { setCands([]); return undefined; }
    let on = true;
    const keep = (list) => (Array.isArray(list) ? list.filter((r) => r && typeof r.id === 'string' && r.ownerId === owner && r.authorId !== r.ownerId && String(r.text || '').trim()) : []);
    Promise.all([
      Promise.resolve().then(() => api.forOwner(owner)).catch(() => null),
      seed.pins.length && api.byIds ? Promise.resolve().then(() => api.byIds(seed.pins.join(','))).catch(() => null) : Promise.resolve(null),
    ]).then(([mine, pinnedRead]) => {
      if (!on) return;
      const owned = keep(mine && mine.reviews);
      const seen = new Set(owned.map((r) => r.id));
      setCands(owned.concat(keep(pinnedRead && pinnedRead.reviews).filter((r) => !seen.has(r.id))));
      setReviewsOk(mine != null && (!seed.pins.length || pinnedRead != null));
    });
    return () => { on = false; };
  }, [tab]);
  const livePins = reviewsOk && Array.isArray(cands) ? pins.filter((id) => cands.some((r) => r.id === id)) : pins;
  const togglePin = (id) => setPins(() => (livePins.includes(id) ? livePins.filter((x) => x !== id) : livePins.length >= BS_PINNED_REVIEWS_MAX ? livePins : [...livePins, id]));
  const [uploading, setUploading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const [leaving, setLeaving] = React.useState(false);
  // The live preview, open over the editor (which stays mounted under it, as it was).
  const [previewing, setPreviewing] = React.useState(false);
  const liveOpenerRef = React.useRef(null);
  const liveBackRef = React.useRef(null);
  React.useEffect(() => {
    // Focus moves to Back to editing, and comes back to View live preview.
    if (previewing) { try { liveBackRef.current && liveBackRef.current.focus({ preventScroll: true }); } catch (e) {} return; }
    const el = liveOpenerRef.current;
    liveOpenerRef.current = null;
    if (el) { try { el.focus({ preventScroll: true }); } catch (e) {} }
  }, [previewing]);
  const lookChanged = !sameJson(look, seed.look);
  const wallChanged = wall !== seed.wall;
  const kitchenChanged = nutri && !sameJson(bsProfileKitchen(kitchen, owner), bsProfileKitchen(seed.kitchen, owner));
  // The About's three keys, each compared as the doc would keep it.
  const trimmedLinks = Object.fromEntries(BS_PROFILE_LINK_KEYS.map((k) => [k, String(links[k] || '').trim()]).filter(([, v]) => v));
  // Years typed as their only edit count too, though the doc would drop them, so the save bar shows
  // and save says why (Codex P2 on #2540: a 75 with nothing else changed got no save bar).
  const aboutChanged = !sameJson(bsProfileAbout(bsAboutDoc(about)), bsProfileAbout(bsAboutDoc(seed.about))) || (about.years !== seed.about.years && bsYearsProblem(about.years))
    || !!bsAboutListProblem(about);
  const promptsChanged = !sameJson(bsProfilePrompts(prompts), bsProfilePrompts(seed.prompts));
  const linksChanged = !sameJson(trimmedLinks, Object.fromEntries(Object.entries(seed.links).filter(([, v]) => v)));
  // The recipe being written (kept here, so it waits while the coach looks at another tab). Save
  // asks for Done or Cancel first, so it never drops one unseen.
  const [recipeDraft, setRecipeDraft] = React.useState(null);
  const recipeOpen = !!recipeDraft;
  const headLinksChanged = headLinks !== seed.headLinks;
  // The Studio's four keys, each compared as the doc would keep it (the maps in key order, so an edit
  // put back reads as no change).
  const byKey = (o) => (o ? Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : null);
  const focusChanged = !sameJson(bsProfileFocus(focus), bsProfileFocus(seed.focus));
  const picksChanged = !sameJson(bsProfilePicks(picks), bsProfilePicks(seed.picks));
  const descriptionsChanged = !sameJson(byKey(bsProfileDescriptions(descs)), byKey(bsProfileDescriptions(seed.descs)));
  const programForChanged = !sameJson(byKey(bsProfileProgramFor(programFor)), byKey(bsProfileProgramFor(seed.programFor)));
  // The Spotlight's keys and the practice's card, each compared as the doc would keep it. A song link
  // the page could not play, a highlight with words but no headline and a card with no name count as
  // changes too, so the save bar shows and Save says why rather than dropping them.
  const filmOut = film ? { url: film.url, caption: bsCleanText(film.caption, BS_FILM_CAPTION_MAX) } : null;
  const filmChanged = !sameJson(filmOut, seed.film);
  const statsChanged = !sameJson(stats, seed.stats);
  const publicChanged = !sameJson(bsProfilePublicStats(publicStats), seed.publicStats);
  const pinnedDoc = (p) => (p.title.trim() ? bsProfilePinned(p) : null);
  const pinProblem = !highlight.title.trim() && !!(highlight.note.trim() || highlight.metric.trim());
  const pinnedChanged = !sameJson(pinnedDoc(highlight), pinnedDoc(seed.pinned)) || pinProblem;
  const songDoc = (s) => (s.url.trim() ? bsProfileSong({ url: s.url.trim(), label: s.label }) : null);
  const songProblem = !!song.url.trim() && !bsSpotifyEmbed(song.url.trim());
  const songChanged = !sameJson(songDoc(song), songDoc(seed.song)) || songProblem;
  // As stored until a tap: a tap writes the live pins (a gone review dropped) with the change.
  const pinsChanged = !sameJson(pins, seed.pins);
  const bizDoc = (b) => bsProfileBizCard(b);
  const bizProblem = !biz.name.trim() && !!(biz.where.trim() || biz.hours.trim() || biz.handle.trim());
  const bizChanged = !sameJson(bizDoc(biz), bizDoc(seed.biz)) || bizProblem;
  const dirty = lookChanged || wallChanged || kitchenChanged || aboutChanged || promptsChanged || linksChanged || headLinksChanged
    || focusChanged || picksChanged || descriptionsChanged || programForChanged
    || filmChanged || statsChanged || publicChanged || pinnedChanged || songChanged || pinsChanged || bizChanged;
  const first = who.first || bsCoachFirstName(who.name);
  const w = words || { day: tr('profile:trainer.dayName', { defaultValue: "{name}'s day", name: first }), work: tr('profile:trainer.workName', { defaultValue: 'Work with {name}', name: first }) };

  const demoNoUpload = () => setErr(tr('profile:mine.errDemoUpload', { defaultValue: 'Sign in to upload your own photo.' }));
  const onUpload = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (demo) { demoNoUpload(); return; }
    // Only the types the cover guard keeps (bsProfileCover); any other upload would be dropped at save.
    if (!/^image\/(jpe?g|png|webp|gif|heic|heif)$/i.test(file.type || '')) { setErr(tr('profile:mine.errImage', { defaultValue: 'Pick a photo (JPEG, PNG or HEIC).' })); return; }
    setUploading(true); setErr(null);
    try {
      const url = await window.ShapeCommunity.uploadPhoto(file);
      if (!url) throw new Error('no url');
      setWall(url);
    } catch (ex) {
      setErr(tr('profile:mine.errUpload', { defaultValue: "Couldn't upload that photo. Try again." }));
    } finally { setUploading(false); }
  };

  // A recipe's photo: an upload of the coach's own, kept as the wall photo is (bsKitchenRecipeItem
  // keeps only their own folder's). Resolves the URL, or null with the reason shown.
  const uploadRecipePhoto = async (file) => {
    if (demo) { demoNoUpload(); return null; }
    if (!/^image\/(jpe?g|png|webp|gif|heic|heif)$/i.test(file.type || '')) { setErr(tr('profile:mine.errImage', { defaultValue: 'Pick a photo (JPEG, PNG or HEIC).' })); return null; }
    setUploading(true); setErr(null);
    try {
      const url = await window.ShapeCommunity.uploadPhoto(file);
      if (!url) throw new Error('no url');
      return url;
    } catch (ex) {
      setErr(tr('profile:mine.errUpload', { defaultValue: "Couldn't upload that photo. Try again." }));
      return null;
    } finally { setUploading(false); }
  };

  // The intro film: an upload of the coach's own to coach-media, checked as the old editor did before
  // it goes (the type the film's check keeps, and the bucket's 200 MB), so nothing uploads to be
  // dropped at save. Said under the film, where the coach is looking.
  const onFilm = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file || filmBusy) return;
    if (demo) { setFilmErr(tr('profile:mine.errDemoFilm', { defaultValue: 'Sign in to upload your own film.' })); return; }
    if (!bsFilmFileOk(file)) { setFilmErr(tr('profile:editor.err.videoType', { defaultValue: 'Pick an MP4, MOV or WebM video.' })); return; }
    if (file.size > BS_COACH_FILM_MAX_MB * 1024 * 1024) { setFilmErr(tr('profile:editor.err.videoSize', { defaultValue: 'That video is too large — keep it under {mb} MB.', mb: BS_COACH_FILM_MAX_MB })); return; }
    setFilmBusy(true); setFilmErr(null);
    try {
      const up = await window.ShapeCoachMedia?.upload?.(file, { videoOnly: true });
      const kept = up && up.url ? filmOf({ url: up.url }) : null;
      if (!kept) throw new Error('not kept');
      setFilm((prev) => ({ url: kept.url, caption: (prev && prev.caption) || '' }));
    } catch (ex) {
      setFilmErr(tr('profile:editor.err.film', { defaultValue: 'Could not upload film.' }));
    } finally { setFilmBusy(false); }
  };

  // The doc with what was changed here put on it. Each key is written only when it was changed
  // here, so one changed elsewhere since this opened is kept; the wall photo only as coverOf keeps it.
  // A floor plan saved before (`studio`) is never edited here, so it is always the doc's own.
  const withChanges = (base) => {
    const doc = { ...base };
    if (lookChanged) doc.look = { paper: look.paper, accent: look.accent, focus: look.focus };
    // An emptied kitchen drops the key (the normalizer keeps none with nothing in it).
    if (kitchenChanged) doc.kitchen = { plate: kitchen.plate, rules: kitchen.rules, staples: kitchen.staples, recipes: kitchen.recipes };
    // An emptied About, set of questions or socials drops its key (the normalizer keeps none empty).
    if (aboutChanged) doc.about = bsAboutDoc(about);
    if (promptsChanged) doc.prompts = prompts.map((p) => ({ q: bsPromptToken(p.q), a: p.a }));
    if (linksChanged) doc.links = trimmedLinks;
    if (headLinksChanged) { if (headLinks) doc.headLinks = true; else delete doc.headLinks; }
    // The Studio's words, as the coach left them (the normalizer cleans each, and drops an emptied one).
    if (focusChanged) doc.focus = focus.filter((f) => !isBlankWord(f));
    if (picksChanged) doc.picks = picks;
    if (descriptionsChanged) doc.descriptions = descs;
    if (programForChanged) doc.programFor = programFor;
    if (wallChanged) {
      const cover = wall ? coverOf(wall) : null;
      if (cover) doc.cover = cover; else delete doc.cover;
    }
    // The Spotlight and the practice's card, each written cleaned and dropped when emptied.
    if (filmChanged) { const f = filmOut ? filmOf(filmOut) : null; if (f) doc.film = f; else delete doc.film; }
    if (statsChanged) { if (stats.length) doc.heroStats = stats.slice(); else delete doc.heroStats; }
    // What's public: none (the default) drops the key, so nothing is public.
    if (publicChanged) { const p = bsProfilePublicStats(publicStats); if (p.length) doc.publicStats = p; else delete doc.publicStats; }
    if (pinnedChanged) { const p = pinnedDoc(highlight); if (p) doc.pinned = p; else delete doc.pinned; }
    if (songChanged) { const s = songDoc(song); if (s) doc.song = s; else delete doc.song; }
    if (pinsChanged) { if (pins.length) doc.pinnedReviews = pins.slice(); else delete doc.pinnedReviews; }
    if (bizChanged) {
      const b = bizDoc(biz);
      if (b) doc.bizCard = b; else delete doc.bizCard;
    }
    return doc;
  };
  const save = async () => {
    if (busy) return;
    if (recipeOpen) { setErr(tr('profile:mine.errRecipeOpen', { defaultValue: 'Finish the recipe you are writing first: Done or Cancel.' })); return; }
    // Years or a social the page could not keep is said, not dropped at save.
    if (bsYearsProblem(about.years)) { setTab('about'); setErr(tr('profile:mine.errYears', { defaultValue: 'Years coaching: a number from 1 to {max}.', max: BS_ABOUT_YEARS_MAX })); return; }
    const listProblem = bsAboutListProblem(about);
    if (listProblem === 'title') { setTab('about'); setErr(tr('profile:mine.errItemTitle', { defaultValue: 'Each accolade and course needs a title, or remove it.' })); return; }
    if (listProblem === 'year') { setTab('about'); setErr(tr('profile:mine.errItemYear', { defaultValue: 'A year from {min} to {max}.', min: BS_ABOUT_YEAR_MIN, max: new Date().getFullYear() + 1 })); return; }
    const badLink = linksChanged ? bsLinkProblem(links) : null;
    if (badLink) { setTab('about'); setErr(tr('profile:mine.errLink', { defaultValue: 'Check {network}: a handle like @you, or an address starting with https://', network: bsLinkName(badLink, tr) })); return; }
    // So is a card with no name, a highlight with no headline and a song the page could not play.
    if (bizProblem) { setTab('about'); setErr(tr('profile:mine.errBizName', { defaultValue: 'Give your practice a name, or clear its card.' })); return; }
    if (pinProblem) { setTab('spotlight'); setErr(tr('profile:mine.errPinTitle', { defaultValue: 'Give your highlight a headline, or clear it.' })); return; }
    if (songProblem) { setTab('spotlight'); setErr(tr('profile:editor.song.err', { defaultValue: 'Paste a Spotify track or playlist link (open.spotify.com/…).' })); return; }
    if (filmBusy) { setTab('spotlight'); setErr(tr('profile:editor.err.uploadBusy', { defaultValue: 'Hang on — an upload is still in progress.' })); return; }
    const spot = { film: filmChanged, heroStats: statsChanged, publicStats: publicChanged, pinned: pinnedChanged, song: songChanged, pinnedReviews: pinsChanged, bizCard: bizChanged };
    // The demo also says which keys were changed here, so its page keeps only those over its own
    // sample (whose station names follow the language; Codex P2 on #2486). Its pins are its sample
    // reviews' ids, which the normalizer (a coach's pins are their members' reviews' uuids) would drop.
    if (demo) {
      const shown = bsNormalizeProfileCustom(withChanges(initial || {}), null);
      if (pinsChanged) { if (pins.length) shown.pinnedReviews = pins.slice(); else delete shown.pinnedReviews; }
      onSaved && onSaved(shown, { look: lookChanged, cover: wallChanged, kitchen: kitchenChanged, about: aboutChanged, prompts: promptsChanged, links: linksChanged, headLinks: headLinksChanged,
        focus: focusChanged, picks: picksChanged, descriptions: descriptionsChanged, programFor: programForChanged, ...spot });
      thenTool();
      return;
    }
    const uid = owner;
    if (!uid || signedInUid() !== uid) { setErr(tr('profile:mine.errSignIn', { defaultValue: 'Sign in to save your page.' })); return; }
    if (uploading) { setErr(tr('profile:mine.errBusy', { defaultValue: 'Hang on, your photo is still uploading.' })); return; }
    setBusy(true); setErr(null);
    // Merge onto the doc as saved now, so a key changed elsewhere since this opened is kept. Both
    // calls are bound to this account, and a read that fails (or answers for another account)
    // stops the save: the doc as it was when this opened would undo a change made since (Codex P1
    // ×2 on #2484).
    let base = null;
    try { base = await window.shapeDb?.getUserGoals?.('profile_custom', { expectedUserId: uid }); } catch (ex) { base = null; }
    if (!base || typeof base !== 'object' || Array.isArray(base)) {
      setBusy(false);
      setErr(tr('profile:mine.errSave', { defaultValue: "Couldn't save. Nothing changed; try again." }));
      return;
    }
    // The film is held to the coach's own coach-media folder when it was changed here; one not changed
    // rides through as stored, as every key this editor did not change.
    const clean = bsNormalizeProfileCustom(withChanges(base), uid, filmChanged ? { filmBucket: 'coach-media' } : undefined);
    let res;
    try { res = await window.shapeDb?.saveUserGoals?.('profile_custom', clean, { expectedUserId: uid }); } catch (ex) { res = { error: ex }; }
    setBusy(false);
    if (!res || res.error) { setErr((res && res.error && res.error.message) || tr('profile:mine.errSave', { defaultValue: "Couldn't save. Nothing changed; try again." })); return; }
    onSaved && onSaved(clean);
    thenTool();
  };
  // A recipe still being written is unsaved work too (Codex P2 on #2497): leaving asks first.
  const unsaved = dirty || recipeOpen;
  // The masthead's tools (✦ Nora, ⌕ Search, ⚙ Settings) are on this page as on every page (owner,
  // 2026-11-04: "with correct masthead as well"). Each leaves the editor first. With changes not yet
  // saved, a tap asks as Back does, and the tool runs once the coach saves or leaves without saving.
  const toolRef = React.useRef(null);
  const runTool = (k) => {
    if (k === 'settings' && typeof onSettings === 'function') { onSettings(); return; }
    const name = k === 'nora' ? 'shape:openNora' : k === 'search' ? 'shape:openSearch' : 'shape:openProfile';
    try { window.dispatchEvent(new window.CustomEvent(name)); } catch (e) {}
  };
  const thenTool = () => { const k = toolRef.current; toolRef.current = null; if (k) setTimeout(() => runTool(k), 0); };
  const leaveNow = () => { onClose && onClose(); thenTool(); };
  const guardTool = (e) => {
    const b = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!unsaved || !b) return;
    e.preventDefault(); e.stopPropagation();
    toolRef.current = b.hasAttribute('data-nora-corner') ? 'nora' : b.hasAttribute('data-bs-settings-corner') ? 'settings' : 'search';
    setLeaving(true);
  };
  const back = () => { toolRef.current = null; if (unsaved) setLeaving(true); else onClose && onClose(); };

  const head = {
    colors: [tr('profile:mine.colorsTitle', { defaultValue: 'Your colors' }), tr('profile:mine.colorsSub', { defaultValue: 'Pick from Shape’s papers and accents. Your whole page follows.' })],
    wall: [tr('profile:mine.wallTitle', { defaultValue: 'Your wall photo' }), tr('profile:mine.wallSub', { defaultValue: 'The big photo behind your avatar. Your gym, your platform, your view.' })],
    programs: [tr('profile:mine.programsTitle', { defaultValue: 'Descriptions' }), tr('profile:mine.programsSub', { defaultValue: 'A short line under each thing you sell. All optional.' })],
    kitchen: [tr('profile:mine.kitchenTitle', { defaultValue: 'Your kitchen' }), tr('profile:mine.kitchenSub', { defaultValue: 'Your recipes, the plate you teach and your staples.' })],
    spotlight: [tr('profile:mine.spotlightTitle', { defaultValue: 'Your spotlight' }), tr('profile:mine.spotlightSub', { defaultValue: 'An intro film, your headline numbers, a highlight, your song and the reviews you pin. All optional.' })],
    about: [tr('profile:mine.aboutTitle', { defaultValue: 'About me' }), nutri
      ? tr('profile:mine.aboutSub', { defaultValue: 'Your story, how you coach, the questions members ask, and where to find you.' })
      : tr('profile:mine.aboutSubTrainer', { defaultValue: 'What members read under your name, your picks, your story and where to find you.' })],
  }[tab];

  const host = typeof document !== 'undefined' ? (document.getElementById('bs-phone-surface') || document.body) : null;
  // The Save bar comes in over the foot of the page with the first change. The control that made it
  // (Top, Center, Bottom under "Keep in view", a paper, a piece) stays in sight above it (owner,
  // 2026-10-31: "the save button pops up and coveres options"). The tap is remembered on its way down,
  // since a tap focuses nothing on iOS.
  const scrollRef = React.useRef(null);
  const barRef = React.useRef(null);
  const tapRef = React.useRef(null);
  React.useLayoutEffect(() => {
    if (!unsaved) return;
    const root = scrollRef.current;
    const bar = barRef.current;
    const hit = tapRef.current;
    if (!root || !bar || !hit || !hit.isConnected || !root.contains(hit)) return;
    const over = hit.getBoundingClientRect().bottom + 12 - bar.getBoundingClientRect().top;
    if (over > 0) root.scrollTop += over;
  }, [unsaved]);
  // The pinned masthead (BSPage's, on this takeover of its own): once the page's own masthead has
  // scrolled 64px away, a bar slides in with ← (the page's Back has gone under it), the mark and Vol·No,
  // and the tools, so they stay in sight down the page (owner, 2026-11-04).
  const [pinned, setPinned] = React.useState(false);
  const Search = window.BSSearchCorner, Settings = window.BSSettingsCorner;
  const corner = window.BS_HEADER_AVATAR || 34;
  const tools = Search || Settings ? (
    <span data-mine-tools="" onClickCapture={guardTool} style={{ display: 'flex', alignItems: 'center', gap: window.BS_CORNER_GAP || 8 }}>
      {Search ? <Search size={corner} ink={E.INK} close={() => onClose && onClose()} /> : null}
      {Settings ? <Settings size={corner} ink={E.INK} onClick={() => { onClose && onClose(); setTimeout(() => runTool('settings'), 0); }} /> : null}
    </span>
  ) : null;
  // The chrome's pinned bar for a takeover (BSPinnedBar): ←, the mark and Vol·No, the tools.
  const pinnedBar = window.BSPinnedBar ? (
    <window.BSPinnedBar shown={pinned} ink={E.INK} background={E.BG} rule={ea(0.14)} trailing={tools}
      run={() => { if (window.bsMarkBack) window.bsMarkBack(); back(); }} />
  ) : null;
  // ── View live preview: the coach's page as members see it, with the edits here on it, saved or not ──
  const LivePage = window.BSTrainerProfile;
  const openPreview = (e) => { liveOpenerRef.current = (e && e.currentTarget) || null; setPreviewing(true); };
  const closePreview = () => { try { window.bsMarkBack && window.bsMarkBack(); } catch (e) {} setPreviewing(false); };
  // The editor's chrome is the dark paper, so is the bar.
  const liveT = { ...(theme || {}), isLight: false, INK: E.INK, inkRGB: '245,240,230', PAPER: E.BG, PAPER_BG: E.BG, PAPER2: E.BG2, padX: gut };
  const livePill = LivePage ? (
    // A compact lit pill (owner, 2026-11-04: "make the box smaller"), 32px drawn inside a 44px target.
    <button type="button" data-mine-live-open="" onClick={openPreview}
      style={{ marginTop: 6, minHeight: 44, maxWidth: '100%', padding: 0, border: 0, background: 'transparent', color: 'inherit', display: 'inline-flex', alignItems: 'center', cursor: 'pointer', boxSizing: 'border-box', textAlign: 'left' }}>
      <span style={{ ...bsWsLed(liveT, true), minHeight: 32, maxWidth: '100%', padding: '0 12px 0 10px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 6, boxSizing: 'border-box', fontFamily: DISPLAY, fontSize: 13, fontWeight: 600, lineHeight: 1.2, boxShadow: `inset 0 1px 3px rgba(0,0,0,0.6), 0 0 12px -6px ${hexA(E.ED, 0.85)}` }}>
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flex: 'none' }}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /></svg>
        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{tr('profile:editor.live.open', { defaultValue: 'View live preview' })}</span>
      </span>
    </button>
  ) : null;
  let livePage = null;
  if (previewing && LivePage) {
    // The doc a Save would write over the doc as opened (no read: previewing reads and writes nothing), as
    // the page will clean it. The demo's pins are its sample reviews' ids, kept as its Save keeps them.
    const draft = bsNormalizeProfileCustom(withChanges(initial || {}), demo ? null : owner, !demo && filmChanged ? { filmBucket: 'coach-media' } : undefined);
    if (demo && pinsChanged) { if (pins.length) draft.pinnedReviews = pins.slice(); else delete draft.pinnedReviews; }
    const person = { who: who.name || first, kind: nutri ? 'NUTRI' : 'TRAINER', userId: demo ? null : owner, photo: who.photo || null };
    livePage = bsLivePreviewLayer({
      t: liveT, tClean: { ...liveT, DISPLAY: BS_CLEAN_SANS, BODY: BS_CLEAN_SANS, HEAD: BS_CLEAN_HEAD }, tr,
      // Message as members see it (a member's page shows it); the layer stops the tap, as every other.
      page: <LivePage person={person} previewCustom={draft} onBack={closePreview} onMessage={bsLiveNoop} />,
      unsaved: dirty, onBack: closePreview, backRef: liveBackRef, zIndex: 100,
    });
  }
  const scroller = (
    <div ref={scrollRef} aria-hidden={livePage ? true : undefined} inert={livePage ? true : undefined} onScroll={(e) => setPinned(e.currentTarget.scrollTop > 64)} onClickCapture={(e) => { const tg = e.target; tapRef.current = (tg && tg.closest && tg.closest('button, [role="button"], label, input, select')) || tg; }} className="bs-scroll" data-mine-scroll="" style={{ position: 'absolute', inset: 0, overflowY: 'auto', overflowX: 'hidden', visibility: livePage ? 'hidden' : undefined }}>
      <div style={{ padding: `calc(${window.BS_MAST_TOP_CSS || '12px'}) ${gut}px ${unsaved ? 24 : 40}px` }}>
        {/* The masthead row and the back row every page has: the mark and Vol·No, the tools in their pill. */}
        {window.BSMastRow ? <window.BSMastRow trailing={tools} ink={E.INK} /> : null}
        {window.BSBackRow ? <window.BSBackRow onBack={back} ink={E.INK}
          trailing={<span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: E.ED }}>{tr('profile:mine.eyebrow', { defaultValue: 'Your page' })}</span>} /> : null}
        <div style={{ marginTop: 8 }}>
          <Seg label={tr('profile:mine.sections', { defaultValue: 'What to change' })} value={tab} onChange={setTab}
            options={[['colors', tr('profile:mine.tabColors', { defaultValue: 'Colors' })], ['wall', tr('profile:mine.tabWall', { defaultValue: 'Wall photo' })], nutri ? ['kitchen', tr('profile:mine.tabKitchen', { defaultValue: 'Your kitchen' })] : ['programs', tr('profile:mine.tabPrograms', { defaultValue: 'Programs' })],
              ['spotlight', tr('profile:mine.tabSpotlight', { defaultValue: 'Spotlight' })], ['about', tr('profile:mine.tabAbout', { defaultValue: 'About me' })]]} />
        </div>
        <h1 style={{ margin: '18px 0 0', fontFamily: DISPLAY, fontWeight: 600, fontSize: 28, lineHeight: 1.05 }}>{head[0]}<span style={{ color: E.ED }}>.</span></h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, lineHeight: 1.45, color: ea(0.7) }}>{head[1]}</p>
        {livePill}
        {tab === 'colors' || tab === 'wall' ? <Preview tr={tr} look={look} wall={wall} who={{ ...who, first }} words={w} nutri={nutri} onEdit={setTab} lit={tab === 'colors'} /> : null}
        {tab === 'colors' ? <ColorsTab tr={tr} look={look} setLook={setLook} /> : null}
        {tab === 'wall' ? <WallTab tr={tr} look={look} setLook={setLook} wall={wall} setWall={(u) => { setWall(u); setErr(null); }} choices={photos} uploading={uploading} onUpload={onUpload} noUpload={demo ? demoNoUpload : null} /> : null}
        {tab === 'programs' ? <ProgramsTab tr={tr} work={wk} first={first} descs={descs} setDescs={setDescs} programFor={programFor} setProgramFor={setProgramFor} /> : null}
        {tab === 'kitchen' ? <KitchenTab tr={tr} look={look} kitchen={kitchen} setKitchen={setKitchen} startSection={startSection} owner={owner} uploadPhoto={uploadRecipePhoto} draft={recipeDraft} setDraft={setRecipeDraft} /> : null}
        {tab === 'spotlight' ? <SpotlightTab tr={tr} role={role} locale={intlLocale()} film={film} setFilm={(f) => { setFilm(f); setFilmErr(null); }} filmBusy={filmBusy} filmErr={filmErr} onFilm={onFilm}
          stats={stats} setStats={setStats} figures={figures} publicStats={publicStats} setPublicStats={setPublicStats} pinned={highlight} setPinned={(f) => { setHighlight(f); setErr(null); }} song={song} setSong={(s) => { setSong(s); setErr(null); }}
          pins={livePins} togglePin={togglePin} reviews={cands} reviewsRead={cands !== null} /> : null}
        {tab === 'about' ? <AboutTab tr={tr} about={about} setAbout={setAbout} prompts={prompts} setPrompts={setPrompts} links={links} setLinks={(f) => { setLinks(f); setErr(null); }} headLinks={headLinks} setHeadLinks={setHeadLinks}
          studioWords={nutri ? null : { focus, setFocus, picks, setPicks, work: wk, name: who.name || first }} biz={biz} setBiz={(f) => { setBiz(f); setErr(null); }} /> : null}
        {err && !unsaved ? <p role="alert" style={{ margin: '14px 0 0', fontSize: 13.5, color: E.ERR }}>{err}</p> : null}
      </div>
      {unsaved ? (
        // The save bar, condensed (owner, 2026-10-31: "also make this smaller"): 40px buttons at 14 / 600,
        // Leave the wider of the two so "Leave without saving" keeps to one line (a longer translation
        // wraps rather than being cut). They were 48px pills, Save at 16, and Leave wrapped beside a
        // wider Save.
        <div ref={barRef} data-mine-savebar="" data-save-bar="" style={{ position: 'sticky', bottom: 0, zIndex: 3, padding: `8px ${gut}px calc(10px + env(safe-area-inset-bottom))`, background: E.BG, borderTop: `1px solid ${ea(0.16)}` }}>
          {leaving ? <p style={{ margin: '0 0 6px', fontSize: 13, color: ea(0.8) }}>{tr('profile:mine.leaveAsk', { defaultValue: "You haven't saved these changes." })}</p> : <p style={{ margin: '0 0 6px', fontSize: 12.5, color: ea(0.6) }}>{demo ? tr('profile:mine.demoNote', { defaultValue: 'A sample page: your changes show here until you leave. Sign in to save yours.' }) : tr('profile:mine.saveNote', { defaultValue: 'Members see it as soon as you save.' })}</p>}
          {err ? <p role="alert" style={{ margin: '0 0 8px', fontSize: 13.5, color: E.ERR }}>{err}</p> : null}
          <div style={{ display: 'flex', gap: 8 }}>
            {leaving ? <button type="button" data-leave-mine="" onClick={leaveNow} style={{ ...smallBtn, flex: '1.5 1 0px', minWidth: 0, minHeight: 40, padding: '6px 12px', borderRadius: 999, lineHeight: 1.15 }}>{tr('profile:mine.leave', { defaultValue: 'Leave without saving' })}</button> : null}
            <button type="button" data-save-mine="" onClick={save} disabled={busy || uploading}
              style={{ flex: '1 1 0px', minWidth: 0, minHeight: 40, padding: '6px 12px', borderRadius: 999, border: 0, background: E.ED, color: E.ON_ED, fontFamily: DISPLAY, fontSize: 14, fontWeight: 600, lineHeight: 1.15, cursor: busy ? 'default' : 'pointer', opacity: busy || uploading ? 0.6 : 1 }}>
              {busy ? tr('profile:mine.saving', { defaultValue: 'Saving…' }) : tr('profile:mine.save', { defaultValue: 'Save' })}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
  // The editor's chrome is the app's dark paper whatever paper the app is on, so the shared masthead
  // pieces (the pill, ✦'s teal, the mark) are drawn on the dark palette here, at the reader's own
  // density and text size.
  const Dark = window.BSProvider;
  const body = (
    <div data-make-it-yours="" style={{ position: 'absolute', inset: 0, zIndex: 225, overflow: 'hidden', background: E.BG, color: E.INK, colorScheme: 'dark', fontFamily: BODY, WebkitFontSmoothing: 'antialiased' }}>
      {scroller}
      {livePage ? null : pinnedBar}
      {livePage}
    </div>
  );
  const el = Dark && theme ? (
    <Dark paperMode="dark" accentKey="teal" densityKey={theme.densityKey} borderKey={theme.borderKey} weightKey={theme.weightKey} textScaleKey={theme.textScaleKey}>{body}</Dark>
  ) : body;
  return host ? createPortal(el, host) : el;
}
