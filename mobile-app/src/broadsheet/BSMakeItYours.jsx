import React from 'react';
import { createPortal } from 'react-dom';
import {
  BS_LOOK_PAPERS, BS_LOOK_ACCENTS, BS_STUDIO_ITEMS_MAX, BS_STUDIO_STATIONS_MAX, BS_STUDIO_WHERE_MAX, BS_STUDIO_LABEL_MAX,
  BS_STATION_TITLE_MAX, BS_STATION_NOTE_MAX, BS_STATION_PINS_MAX, bsProfileLook, bsProfileStudio, bsProfileCover, bsNormalizeProfileCustom,
  BS_KITCHEN_RULES_MAX, BS_KITCHEN_RULE_MAX, BS_KITCHEN_STAPLES_MAX, BS_STAPLE_MAX, BS_KITCHEN_RECIPES_MAX, BS_RECIPE_TITLE_MAX, BS_RECIPE_NOTE_MAX,
  BS_RECIPE_INGS_MAX, BS_RECIPE_ING_MAX, BS_RECIPE_QTY_MAX, BS_RECIPE_STEPS_MAX, BS_RECIPE_STEP_MAX, BS_RECIPE_NUMS, bsKitchenRecipeItem, bsProfileKitchen, bsCleanText,
} from '../services/profileCustom.mjs';
import { bsSplitPaste, bsSplitLongStep } from '../services/clientRecipes.mjs';
import { bsCoachFirstName } from '../services/coachPronoun.mjs';
import {
  STUDIO_KIT, STUDIO_GROUPS, STUDIO_COACH_KINDS, KITCHEN_GROUPS, KITCHEN_COACH_KINDS, STUDIO_WORDS, BS_STUDIO_W, BS_STUDIO_H,
  bsStudioTypesIn, bsStudioRoom, bsStudioSvg, bsStudioSpot, bsStudioDrawOrder, bsStudioFromTemplate,
} from '../services/studioKit.mjs';

// ─── MAKE IT YOURS: the coach's profile editor ────────────────────────────────────────────────
// Owner, 2026-10-27 (the R7 canvas): three tabs over a live preview of the profile's top.
//
//   Colors       Shape's own papers and accents (the app's makePalette, nothing custom), with a
//                few starting looks, and a check that the accent reads on the paper.
//   Wall photo   the big photo behind the avatar: one of the coach's listing photos or their own
//                upload, and which part stays in view.
//   Your space   the studio plan: a starting layout per kind of space, then pieces to add, move,
//                turn, copy and remove. A piece made a station gets a number members tap, and
//                the coach's own title and note for it.
//   Your kitchen (a nutritionist's, in place of Your space) in four parts: the kitchen's layout
//                (owner, 2026-10-30: "lets show a kitchen layout, like we did for trainers": Your
//                space's editor with the kitchen's pieces, saved in `studio` as a trainer's floor
//                is), then the page's three: up to six recipes of their own (written or pasted, with a photo, their
//                note, the numbers, the ingredients and the method, in the order they put them),
//                the plate they teach and their portion rules, and their staples.
//
// What it writes: whichever of `look`, `studio`, `kitchen` and `cover` the coach changed here, in the
// profile_custom doc, merged onto the doc as it is at save time (re-read for this account, so a
// key saved elsewhere since this opened is kept; no read, no save), through the same normalizer
// every surface uses. Nothing is saved until Save. The profile opens it only on the coach's doc
// as read, never on defaults.
//
// In the signed-out demo (`demo`), Save changes the page on screen and nothing else: no read, no
// write, and the wall photo is one of the demo's own (`photos`); an upload asks to sign in.
//
// The editor's own chrome is the app's dark editor (it does not repaint as colours change); the
// preview card at the top is painted in the colours being picked.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME (makePalette, ShapeCommunity, shapeDb, ShapeAuth).

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

// The editor's chrome: dark, with the editor's teal.
const E = { BG: '#0f0e0c', BG2: '#181612', BG3: '#221d18', INK: '#f5f0e6', ED: '#34d6c5', ON_ED: '#0b0d0c', WARN: '#e3a544', ERR: '#e06547' };
const ea = (n) => `rgba(245,240,230,${n})`;
const MONO = "'JetBrains Mono', ui-monospace, monospace";
const DISPLAY = "'Saira', 'Space Grotesk', -apple-system, system-ui, sans-serif";
const BODY = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif";
const RING = `0 0 0 2px ${E.BG}, 0 0 0 4px ${E.ED}`;

const rgbOf = (hex) => { const m = /^#([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lum = (hex) => { const c = rgbOf(hex); if (!c) return 0; const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (x, y) => { const a = lum(x), b = lum(y); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
const onColor = (hex) => (lum(hex) > 0.36 ? '#0b0d0c' : '#ffffff');
const hexA = (hex, a) => { const c = rgbOf(hex); return c ? `rgba(${c.join(',')},${a})` : hex; };
// The palette a look paints: the app's own makePalette, so the preview is exactly the page.
const paletteOf = (paper, accent) => {
  try { if (window.makePalette) return window.makePalette({ paperMode: paper, accentKey: accent }); } catch (e) {}
  return { PAPER: '#0f0e0c', PAPER2: '#181612', PAPER_BG: '#0f0e0c', INK: '#f5f0e6', inkRGB: '245,240,230', isLight: false, ACCENT: '#34d6c5' };
};
// The accent before makePalette's fallback, to say when it swapped a vanishing accent.
const RAW_ACCENT = { blue: ['#1c4ed8', '#5b8df9'], amber: ['#c8881a', '#e3a544'], rust: ['#a8331b', '#e06547'], green: ['#2f6b3a', '#5fb16e'], teal: ['#0a8f87', '#34d6c5'], violet: ['#6d3fc4', '#a78bfa'], rose: ['#b8285f', '#f2749f'], white: ['#ffffff', '#ffffff'], black: ['#000000', '#000000'] };
const PRESETS = [['shape', 'dark', 'teal'], ['bone', 'bone', 'rust'], ['blueprint', 'blueprint', 'amber'], ['oxblood', 'oxblood', 'amber'], ['forest', 'forest', 'green'], ['plum', 'plum', 'violet'], ['manila', 'manila', 'black']];
const FOCUS_POS = { top: 'center 22%', center: 'center 50%', bottom: 'center 80%' };
// The kinds' names are the profile's (profile:trainer.kind*), except blank: on the profile it reads
// "Their space", here it is the choice to start from nothing.
const KIND_KEYS = { private: ['trainer.kindPrivate', 'Private studio'], garage: ['trainer.kindGarage', 'Garage gym'], gym: ['trainer.kindGym', 'Full gym'], pilates: ['trainer.kindPilates', 'Pilates studio'], boxing: ['trainer.kindBoxing', 'Boxing gym'], outdoor: ['trainer.kindOutdoor', 'Outdoors'], kitchen: ['trainer.kindKitchen', 'Kitchen'], blank: ['mine.kindBlank', 'Start blank'] };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
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
function Seg({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'grid', gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`, gap: 3, padding: 3, borderRadius: 999, border: `1px solid ${ea(0.2)}` }}>
      {options.map(([k, l]) => {
        const on = k === value;
        return <button key={k} type="button" aria-pressed={on} onClick={() => onChange(k)} style={{ minHeight: 38, border: 0, borderRadius: 999, background: on ? E.INK : 'transparent', color: on ? E.BG : ea(0.8), fontFamily: DISPLAY, fontSize: 14, fontWeight: on ? 600 : 400, cursor: 'pointer' }}>{l}</button>;
      })}
    </div>
  );
}
const field = { width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '0 12px', borderRadius: 10, border: `1px solid ${ea(0.2)}`, background: E.BG2, color: E.INK, fontFamily: BODY, fontSize: 15, outline: 'none' };
const smallBtn = { minHeight: 40, padding: '0 12px', borderRadius: 10, border: `1px solid ${ea(0.22)}`, background: 'transparent', color: E.INK, fontFamily: DISPLAY, fontSize: 14, fontWeight: 600, cursor: 'pointer' };

// ── The preview: the top of the profile, painted in the look being picked ──────────────────
function Preview({ tr, look, wall, who, words, nutri = false }) {
  const P = paletteOf(look.paper, look.accent);
  const ACC = P.ACCENT;
  const ink = (n) => `rgba(${P.inkRGB},${n})`;
  return (
    <div data-mine-preview="" aria-hidden style={{ marginTop: 14, borderRadius: 16, overflow: 'hidden', background: P.PAPER_BG, color: P.INK, border: `1px solid ${ea(0.14)}` }}>
      <div style={{ position: 'relative', height: 92, background: wall ? '#111' : `linear-gradient(135deg, ${hexA(ACC, 0.42)}, ${P.PAPER2} 70%)` }}>
        {wall ? <img src={wall} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: FOCUS_POS[look.focus] || FOCUS_POS.center }} /> : null}
      </div>
      <div style={{ position: 'relative', padding: '0 14px 14px' }}>
        <div style={{ position: 'absolute', left: 14, top: -30, width: 60, height: 60, borderRadius: 99, border: `3px solid ${P.PAPER}`, background: P.PAPER2, overflow: 'hidden', display: 'grid', placeItems: 'center', boxSizing: 'border-box' }}>
          {who.photo ? <img src={who.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 20 }}>{String(who.name || '?').slice(0, 1)}</span>}
        </div>
        <div style={{ marginLeft: 70, paddingTop: 6, minHeight: 34 }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 17, lineHeight: 1.1 }}>{who.name}<span style={{ color: ACC }}>.</span></div>
          {who.roleLine ? <div style={{ fontSize: 11.5, color: ink(0.7) }}>{who.roleLine}</div> : null}
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
          <span style={{ flex: 1.2, minHeight: 32, display: 'grid', placeItems: 'center', background: ACC, color: onColor(ACC), fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 600 }}>{tr('profile:trainer.message', { defaultValue: 'Message {name}', name: who.first })}</span>
          <span style={{ flex: 1, minHeight: 32, display: 'grid', placeItems: 'center', border: `1px solid ${ink(0.22)}`, fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 600 }}>{words.work}</span>
        </div>
        <div style={{ marginTop: 10, display: 'flex', borderBottom: `1px solid ${ink(0.16)}`, fontFamily: DISPLAY, fontSize: 12.5 }}>
          {[words.day, nutri ? (words.kitchen || tr('profile:nutri.kitchenName', { defaultValue: "{name}'s kitchen", name: who.first })) : tr('profile:trainer.tabStudio', { defaultValue: 'The studio' }), nutri ? tr('profile:nutri.tabPlateNotes', { defaultValue: 'Plate notes' }) : tr('profile:trainer.tabReplays', { defaultValue: 'Replays' })].map((l, i) => (
            <span key={i} style={{ flex: 1, textAlign: 'center', padding: '6px 0', borderBottom: `2px solid ${i === 0 ? ACC : 'transparent'}`, marginBottom: -1, color: i === 0 ? P.INK : ink(0.55), fontWeight: i === 0 ? 600 : 400 }}>{l}</span>
          ))}
        </div>
        <div style={{ marginTop: 10, minHeight: 40, padding: '6px 10px', border: `1.5px dashed ${ACC}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: MONO, fontSize: 10.5, color: ink(0.7) }}>8:00</span>
          <span style={{ flex: 1, fontSize: 12.5 }}><b style={{ fontWeight: 600 }}>{tr('profile:trainer.open', { defaultValue: 'Open' })}</b> · {tr('profile:mine.previewIntro', { defaultValue: 'Free intro call' })}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: ACC }}>{tr('profile:trainer.take', { defaultValue: 'Take it →' })}</span>
        </div>
      </div>
    </div>
  );
}

// ── Colors ──────────────────────────────────────────────────────────────────────────────────
function ColorsTab({ tr, look, setLook }) {
  const paperName = (k) => tr('settings:paper.' + k, { defaultValue: k.charAt(0).toUpperCase() + k.slice(1) });
  const accentName = (k) => tr('settings:accent.' + k, { defaultValue: k.charAt(0).toUpperCase() + k.slice(1) });
  const P = paletteOf(look.paper, look.accent);
  const raw = (RAW_ACCENT[look.accent] || RAW_ACCENT.teal)[P.isLight ? 0 : 1];
  const cr = contrast(P.ACCENT, P.PAPER);
  const check = raw.toLowerCase() !== String(P.ACCENT).toLowerCase()
    ? { ok: false, text: tr('profile:mine.checkSwapped', { defaultValue: '{accent} would vanish on {paper}, so your buttons use {fallback}.', accent: accentName(look.accent), paper: paperName(look.paper), fallback: P.ACCENT === '#000000' ? accentName('black') : accentName('white') }) }
    : cr >= 3
      ? { ok: true, text: tr('profile:mine.checkOk', { defaultValue: 'Buttons and text read clearly on {paper}.', paper: paperName(look.paper) }) }
      : { ok: false, text: tr('profile:mine.checkFaint', { defaultValue: '{accent} is faint on {paper}. Try a darker accent.', accent: accentName(look.accent), paper: paperName(look.paper) }) };
  return (
    <div>
      <Eyebrow>{tr('profile:mine.startFrom', { defaultValue: 'Start from a Shape look' })}</Eyebrow>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, margin: '0 -2px' }}>
        {PRESETS.map(([key, pa, ac]) => {
          const on = pa === look.paper && ac === look.accent, Q = paletteOf(pa, ac);
          return (
            <button key={key} type="button" aria-pressed={on} onClick={() => setLook({ ...look, paper: pa, accent: ac })}
              style={{ flex: 'none', width: 74, padding: 0, border: 0, background: 'transparent', color: on ? E.INK : ea(0.65), cursor: 'pointer', fontSize: 11.5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 70, height: 46, borderRadius: 10, background: Q.PAPER_BG, border: `1px solid ${ea(0.14)}`, boxShadow: on ? RING : 'none', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 6, boxSizing: 'border-box' }}>
                <span style={{ width: 22, height: 8, borderRadius: 99, background: Q.ACCENT }} />
              </span>
              {key === 'shape' ? 'Shape' : paperName(pa)}
            </button>
          );
        })}
      </div>
      <Eyebrow right={paperName(look.paper)}>{tr('profile:mine.paper', { defaultValue: 'Paper' })}</Eyebrow>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 8 }}>
        {BS_LOOK_PAPERS.map((k) => {
          const Q = paletteOf(k, look.accent), on = k === look.paper;
          return (
            <button key={k} type="button" data-paper={k} aria-pressed={on} aria-label={paperName(k)} onClick={() => setLook({ ...look, paper: k })}
              style={{ aspectRatio: '1 / 1', minHeight: 44, padding: 0, borderRadius: 10, border: `1px solid ${ea(0.16)}`, background: Q.PAPER_BG, color: Q.INK, boxShadow: on ? RING : 'none', position: 'relative', cursor: 'pointer', fontFamily: DISPLAY, fontWeight: 600, fontSize: 14 }}>
              Aa<span style={{ position: 'absolute', right: 5, bottom: 5, width: 7, height: 7, borderRadius: 99, background: Q.ACCENT }} />
            </button>
          );
        })}
      </div>
      <Eyebrow right={accentName(look.accent)}>{tr('profile:mine.accent', { defaultValue: 'Accent' })}</Eyebrow>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {BS_LOOK_ACCENTS.map((k) => {
          const on = k === look.accent, col = (RAW_ACCENT[k] || RAW_ACCENT.teal)[P.isLight ? 0 : 1];
          return <button key={k} type="button" data-accent={k} aria-pressed={on} aria-label={accentName(k)} onClick={() => setLook({ ...look, accent: k })}
            style={{ width: 44, height: 44, borderRadius: 99, border: `1px solid ${ea(0.25)}`, background: col, boxShadow: on ? RING : 'none', cursor: 'pointer' }} />;
        })}
      </div>
      <p role="status" style={{ margin: '14px 0 0', display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.45, color: ea(0.8) }}>
        <span aria-hidden style={{ flex: 'none', width: 20, height: 20, borderRadius: 99, display: 'grid', placeItems: 'center', background: check.ok ? E.ED : E.WARN, color: E.BG, fontSize: 12, fontWeight: 700 }}>{check.ok ? '✓' : '!'}</span>
        {check.text}
      </p>
    </div>
  );
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

// ── Your space ──────────────────────────────────────────────────────────────────────────────
// A station's programs (owner, 2026-10-29, the studio showing the coach's workouts by machine:
// "Both", the moves' own equipment and the coach's pins). Their published programs, up to
// BS_STATION_PINS_MAX pinned; members see them on the station.
function PinPicker({ tr, programs, pins: stored, onChange }) {
  const [msg, setMsg] = React.useState(null);
  // A pin to a program no longer published is never shown to members, so it neither counts against
  // the limit nor survives the next change here (Codex on #2508: a full station stayed full).
  const pins = stored.filter((id) => programs.some((pr) => pr.id === id));
  return (
    <div data-pins="" style={{ marginTop: 10 }}>
      <span style={{ display: 'block', fontSize: 13, color: ea(0.66) }}>{tr('profile:mine.pinsTitle', { defaultValue: 'Programs you run here' })}</span>
      {programs.length ? (
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {programs.map((pr) => {
            const on = pins.includes(pr.id);
            return (
              <button key={pr.id} type="button" data-pin={pr.id} aria-pressed={on} onClick={() => {
                setMsg(null);
                if (on) { onChange(pins.filter((x) => x !== pr.id)); return; }
                if (pins.length >= BS_STATION_PINS_MAX) { setMsg(tr('profile:mine.pinsMax', { defaultValue: 'Up to {count} programs on a station.', count: BS_STATION_PINS_MAX })); return; }
                onChange([...pins, pr.id]);
              }} style={{ minHeight: 38, padding: '0 12px', borderRadius: 999, border: `1px solid ${on ? E.ED : ea(0.22)}`, background: on ? hexA(E.ED, 0.14) : 'transparent', color: E.INK, fontSize: 13.5, cursor: 'pointer' }}>{on ? '✓ ' : ''}{pr.name}</button>
            );
          })}
        </div>
      ) : <span style={{ display: 'block', marginTop: 4, fontSize: 12.5, color: ea(0.55) }}>{tr('profile:mine.pinsNone', { defaultValue: 'Publish a program to pin it here.' })}</span>}
      {msg ? <p role="alert" style={{ margin: '6px 0 0', fontSize: 13, color: E.WARN }}>{msg}</p> : null}
    </div>
  );
}

// `kitchen`: a nutritionist's kitchen layout, the same editor with the kitchen's kinds and pieces and
// no program pins.
function SpaceTab({ tr, look, studio, setStudio, sel, setSel, programs = [], kitchen = false }) {
  const KINDS = kitchen ? KITCHEN_COACH_KINDS : STUDIO_COACH_KINDS;
  const GROUPS = kitchen ? KITCHEN_GROUPS : STUDIO_GROUPS;
  const zoneGroup = kitchen ? 'kitchen' : 'studio';
  const P = paletteOf(look.paper, look.accent);
  const ACC = P.ACCENT;
  const ink = (n) => `rgba(${P.inkRGB},${n})`;
  const word = (k) => tr('profile:studio.word.' + k, { defaultValue: STUDIO_WORDS[k] || k });
  const kitName = (type) => tr('profile:studio.kit.' + type, { defaultValue: (STUDIO_KIT[type] || [type])[0] });
  const kindName = (k) => tr('profile:' + KIND_KEYS[k][0], { defaultValue: KIND_KEYS[k][1] });
  // ⚠ A KITCHEN STAYS A KITCHEN (Codex on #2516). "Start blank" empties it but stores kind
  // `kitchen`, never `blank`, which is the trainer's generic 480-unit room and reads "Their space"
  // on the profile. So the kind a button stores and the kind it shows as lit are kept apart: a
  // kitchen's "Start blank" is never the lit one.
  const kindOf = (k) => (kitchen && k === 'blank' ? 'kitchen' : k);
  const isOn = (k) => kindOf(k) === studio.kind && items.length > 0 && !(kitchen && k === 'blank');
  const doorName = (k) => (k === 'entrance' ? tr('profile:trainer.doorEntrance', { defaultValue: 'Entrance' }) : k === 'garage' ? tr('profile:trainer.doorGarage', { defaultValue: 'Garage door' }) : tr('profile:trainer.doorDoor', { defaultValue: 'Door' }));
  const items = studio.items;
  const stations = items.filter((p) => p.st).length;
  const [ask, setAsk] = React.useState(null); // a kind waiting on "replace your pieces?"
  const [group, setGroup] = React.useState(GROUPS[0][0]);
  const [msg, setMsg] = React.useState(null);
  const svgRef = React.useRef(null);
  const drag = React.useRef(null);

  const update = (i, patch) => setStudio({ ...studio, items: items.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  const fit = (p) => { const w = clamp(Math.round(p.w), 4, BS_STUDIO_W), h = clamp(Math.round(p.h), 4, BS_STUDIO_H); return { ...p, w, h, x: clamp(Math.round(p.x), 0, BS_STUDIO_W - w), y: clamp(Math.round(p.y), 0, BS_STUDIO_H - h) }; };
  const pickKind = (k) => {
    if (isOn(k)) return;
    if (items.length) { setAsk(k); return; }
    setStudio({ ...studio, kind: kindOf(k), items: bsStudioFromTemplate(k, word) });
    setSel(null);
  };
  const add = (type) => {
    setMsg(null);
    if (items.length >= BS_STUDIO_ITEMS_MAX) { setMsg(tr('profile:mine.tooMany', { defaultValue: 'Your space holds {count} pieces at most.', count: BS_STUDIO_ITEMS_MAX })); return; }
    const [, , w, h] = STUDIO_KIT[type];
    const [rx, ry, rw, rh] = bsStudioRoom(studio.kind).room;
    // Dropped in the middle of the room, nudged down a little for each piece already there.
    const n = items.length % 8;
    const p = fit({ t: type, x: rx + rw / 2 - w / 2 + n * 6, y: ry + rh / 2 - h / 2 + n * 6, w, h });
    setStudio({ ...studio, items: [...items, p] });
    setSel(items.length);
  };
  const onDown = (e, i) => {
    setSel(i); setMsg(null);
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    drag.current = { i, x0: e.clientX, y0: e.clientY, px: items[i].x, py: items[i].y, scale: BS_STUDIO_W / (r.width || BS_STUDIO_W) };
    try { svg.setPointerCapture(e.pointerId); } catch (err) {}
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const p = items[d.i];
    if (!p) return;
    update(d.i, fit({ ...p, x: d.px + (e.clientX - d.x0) * d.scale, y: d.py + (e.clientY - d.y0) * d.scale }));
  };
  const onUp = () => { drag.current = null; };
  const room = bsStudioRoom(studio.kind);
  const [rx, ry, rw, rh, style, radius] = room.room;
  const stationNo = (i) => items.slice(0, i + 1).filter((p) => p.st).length;
  const cur = sel != null ? items[sel] : null;

  return (
    <div>
      <Eyebrow>{kitchen ? tr('profile:mine.kitchenStart', { defaultValue: 'Start from' }) : tr('profile:mine.whereCoach', { defaultValue: 'Where do you coach?' })}</Eyebrow>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {KINDS.map((k) => {
          const on = isOn(k);
          return <button key={k} type="button" data-kind={k} aria-pressed={on} onClick={() => pickKind(k)}
            style={{ minHeight: 38, padding: '0 12px', borderRadius: 999, border: `1px solid ${on ? E.ED : ea(0.22)}`, background: on ? hexA(E.ED, 0.14) : 'transparent', color: E.INK, fontSize: 13.5, cursor: 'pointer' }}>{kindName(k)}</button>;
        })}
      </div>
      {ask ? (
        <div role="alertdialog" style={{ marginTop: 10, padding: 12, borderRadius: 12, background: E.BG3 }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>{tr('profile:mine.replaceAsk', { defaultValue: 'Start over from the {kind} layout? It replaces the pieces you have.', kind: kindName(ask) })}</p>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => { setStudio({ ...studio, kind: kindOf(ask), items: bsStudioFromTemplate(ask, word) }); setSel(null); setAsk(null); }} style={{ ...smallBtn, background: E.ED, color: E.ON_ED, border: 0 }}>{tr('profile:mine.replace', { defaultValue: 'Start over' })}</button>
            <button type="button" onClick={() => { setStudio({ ...studio, kind: kindOf(ask) }); setAsk(null); }} style={smallBtn}>{tr('profile:mine.keepPieces', { defaultValue: 'Keep my pieces' })}</button>
            <button type="button" onClick={() => setAsk(null)} style={{ ...smallBtn, border: 0, color: ea(0.7) }}>{tr('profile:mine.cancel', { defaultValue: 'Cancel' })}</button>
          </div>
        </div>
      ) : null}
      <label style={{ display: 'block', marginTop: 12 }}>
        <span style={{ display: 'block', fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: ea(0.6), marginBottom: 6 }}>{tr('profile:mine.nameIt', { defaultValue: 'Name it' })}</span>
        <input value={studio.where} maxLength={BS_STUDIO_WHERE_MAX} onChange={(e) => setStudio({ ...studio, where: e.target.value })} placeholder={kitchen ? tr('profile:mine.kitchenNamePh', { defaultValue: 'The test kitchen, East Austin' }) : tr('profile:mine.namePh', { defaultValue: 'Okafor Strength, Fishtown' })} style={field} />
      </label>

      {items.length ? (
        <>
          <p style={{ margin: '14px 0 8px', fontSize: 13, lineHeight: 1.45, color: ea(0.66) }}>{tr('profile:mine.planHint', { defaultValue: 'Drag a piece to move it, or tap it to turn, copy or remove it. Make it a station to give it a number members can tap.' })}</p>
          <div style={{ position: 'relative', width: '100%', aspectRatio: `${BS_STUDIO_W} / ${BS_STUDIO_H}`, borderRadius: 12, overflow: 'hidden', background: P.PAPER2 }}>
            <svg ref={svgRef} data-studio-plan="" viewBox={`0 0 ${BS_STUDIO_W} ${BS_STUDIO_H}`} width="100%" height="100%" style={{ position: 'absolute', inset: 0, display: 'block' }}
              onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
              onPointerDown={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
              <rect x={rx} y={ry} width={rw} height={rh} rx={radius} fill="none" stroke={ink(0.26)} strokeWidth="1.5" strokeDasharray={style === 'dashed' ? '5 5' : undefined} pointerEvents="none" />
              {room.doors.map(([x, y, w, h, key, lx, ly], i) => (
                <g key={'d' + i} pointerEvents="none"><rect x={x} y={y} width={w} height={h} fill={P.PAPER2} /><text x={lx} y={ly + 9} fontFamily="Inter, system-ui, sans-serif" fontSize="10.5" fill={ink(0.62)}>{doorName(key)}</text></g>
              ))}
              {bsStudioDrawOrder(items).map((i) => {
                const p = items[i], on = i === sel;
                return (
                  <g key={i} role="button" tabIndex={0} aria-label={p.st ? `${stationNo(i)}. ${p.st.title || kitName(p.t)}` : (p.tag || p.label || kitName(p.t))} aria-pressed={on}
                    onPointerDown={(e) => { e.stopPropagation(); onDown(e, i); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(i); } }}
                    style={{ cursor: 'grab', touchAction: 'none', outline: 'none' }}>
                    <image href={bsStudioSvg(p.t, p.w, p.h, { ink: P.inkRGB, light: P.isLight, accent: p.st ? ACC : null })} x={p.x} y={p.y} width={p.w} height={p.h} />
                    <rect x={p.x} y={p.y} width={p.w} height={p.h} fill="transparent" stroke={on ? E.ED : 'none'} strokeWidth="2" strokeDasharray={on ? '4 3' : undefined} rx="3" />
                    {p.tag ? <text x={p.x + 9} y={p.y + 17} fontFamily="Inter, system-ui, sans-serif" fontSize="11" fontWeight="600" fill={ink(0.72)} pointerEvents="none">{p.tag}</text> : null}
                    {p.label ? <text x={p.x} y={p.y + p.h + 12} fontFamily="Inter, system-ui, sans-serif" fontSize="10.5" fill={ink(0.62)} pointerEvents="none">{p.label}</text> : null}
                  </g>
                );
              })}
              {items.map((p, i) => {
                if (!p.st) return null;
                const [sx, sy] = bsStudioSpot(p);
                return <g key={'n' + i} pointerEvents="none"><circle cx={sx} cy={sy} r="11" fill={ACC} /><text x={sx} y={sy + 4} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="11" fontWeight="700" fill={onColor(ACC)}>{stationNo(i)}</text></g>;
              })}
            </svg>
          </div>
        </>
      ) : (
        <p style={{ margin: '14px 0 0', fontSize: 13.5, lineHeight: 1.45, color: ea(0.66) }}>{kitchen
          ? tr('profile:mine.kitchenEmpty', { defaultValue: 'Pick Kitchen above to start from a layout, or add pieces below.' })
          : tr('profile:mine.spaceEmpty', { defaultValue: 'Pick the kind of space above to start from a layout, or add pieces below.' })}</p>
      )}

      {cur ? (
        <div data-piece-panel="" style={{ marginTop: 12, padding: 14, borderRadius: 12, background: E.BG3 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 600 }}>{kitName(cur.t)}</span>
            <button type="button" onClick={() => setSel(null)} style={{ ...smallBtn, background: E.INK, color: E.BG, border: 0 }}>{tr('profile:mine.done', { defaultValue: 'Done' })}</button>
          </div>
          <label style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!cur.st} onChange={(e) => {
              setMsg(null);
              if (e.target.checked) {
                if (stations >= BS_STUDIO_STATIONS_MAX) { setMsg(tr('profile:mine.tooManyStations', { defaultValue: 'Up to {count} stations.', count: BS_STUDIO_STATIONS_MAX })); return; }
                update(sel, { st: { title: cur.label || cur.tag || kitName(cur.t), note: '' } });
              } else { const { st, ...rest } = cur; setStudio({ ...studio, items: items.map((p, k) => (k === sel ? rest : p)) }); }
            }} style={{ width: 20, height: 20, accentColor: E.ED }} />
            <span style={{ fontSize: 14.5 }}>{tr('profile:mine.station', { defaultValue: 'Station' })}<span style={{ display: 'block', fontSize: 12.5, color: ea(0.6) }}>{tr('profile:mine.stationSub', { defaultValue: 'A number members tap to read what you do here.' })}</span></span>
          </label>
          {cur.st ? (
            <>
              <input value={cur.st.title} maxLength={BS_STATION_TITLE_MAX} onChange={(e) => update(sel, { st: { ...cur.st, title: e.target.value } })} aria-label={tr('profile:mine.stationTitle', { defaultValue: 'What you call it' })} placeholder={tr('profile:mine.stationTitle', { defaultValue: 'What you call it' })} style={{ ...field, marginTop: 8 }} />
              <textarea value={cur.st.note} maxLength={BS_STATION_NOTE_MAX} rows={3} onChange={(e) => update(sel, { st: { ...cur.st, note: e.target.value } })} aria-label={tr('profile:mine.stationNote', { defaultValue: 'What you do here' })} placeholder={kitchen ? tr('profile:mine.spotNotePh', { defaultValue: 'What you make here, and how a client can do the same.' }) : tr('profile:mine.stationNotePh', { defaultValue: 'What you do here, and what a client gets from it.' })} style={{ ...field, marginTop: 8, padding: '10px 12px', minHeight: 84, resize: 'vertical', lineHeight: 1.45 }} />
              {kitchen ? null : <PinPicker tr={tr} programs={programs} pins={Array.isArray(cur.st.pins) ? cur.st.pins : []} onChange={(pins) => { const { pins: was, ...st } = cur.st; update(sel, { st: pins.length ? { ...st, pins } : st }); }} />}
            </>
          ) : null}
          <input value={cur.t === 'zone' ? (cur.tag || '') : (cur.label || '')} maxLength={BS_STUDIO_LABEL_MAX} onChange={(e) => update(sel, cur.t === 'zone' ? { tag: e.target.value } : { label: e.target.value })}
            aria-label={tr('profile:mine.labelOnPlan', { defaultValue: 'Name on the plan' })} placeholder={tr('profile:mine.labelOnPlan', { defaultValue: 'Name on the plan' })} style={{ ...field, marginTop: 8 }} />
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[['←', -6, 0, 'moveLeft', 'Move left'], ['↑', 0, -6, 'moveUp', 'Move up'], ['↓', 0, 6, 'moveDown', 'Move down'], ['→', 6, 0, 'moveRight', 'Move right']].map(([g, dx, dy, k, d]) => (
              <button key={k} type="button" aria-label={tr('profile:mine.' + k, { defaultValue: d })} onClick={() => update(sel, fit({ ...cur, x: cur.x + dx, y: cur.y + dy }))} style={{ ...smallBtn, width: 44, padding: 0 }}>{g}</button>
            ))}
            <button type="button" onClick={() => { const cx = cur.x + cur.w / 2, cy = cur.y + cur.h / 2; const { spot, ...rest } = cur; update(sel, fit({ ...rest, w: cur.h, h: cur.w, x: cx - cur.h / 2, y: cy - cur.w / 2 })); }} style={smallBtn}>{tr('profile:mine.turn', { defaultValue: 'Turn' })}</button>
            <button type="button" onClick={() => {
              if (items.length >= BS_STUDIO_ITEMS_MAX) { setMsg(tr('profile:mine.tooMany', { defaultValue: 'Your space holds {count} pieces at most.', count: BS_STUDIO_ITEMS_MAX })); return; }
              const { st, ...rest } = cur;
              setStudio({ ...studio, items: [...items, fit({ ...rest, x: cur.x + 12, y: cur.y + 12 })] }); setSel(items.length);
            }} style={smallBtn}>{tr('profile:mine.copy', { defaultValue: 'Copy' })}</button>
            <button type="button" onClick={() => { setStudio({ ...studio, items: items.filter((p, k) => k !== sel) }); setSel(null); }} style={{ ...smallBtn, color: E.ERR, borderColor: hexA(E.ERR, 0.5) }}>{tr('profile:mine.remove', { defaultValue: 'Remove' })}</button>
          </div>
        </div>
      ) : null}
      {msg ? <p role="alert" style={{ margin: '10px 0 0', fontSize: 13.5, color: E.WARN }}>{msg}</p> : null}

      <Eyebrow right={tr('profile:mine.tapToDrop', { defaultValue: 'Tap to drop it in' })}>{tr('profile:mine.addWhat', { defaultValue: 'Add what you have' })}</Eyebrow>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
        {GROUPS.map(([slug, en]) => (
          <button key={slug} type="button" aria-pressed={slug === group} onClick={() => setGroup(slug)}
            style={{ flex: 'none', minHeight: 36, padding: '0 12px', borderRadius: 999, border: `1px solid ${slug === group ? E.INK : ea(0.2)}`, background: slug === group ? E.INK : 'transparent', color: slug === group ? E.BG : E.INK, fontSize: 13, cursor: 'pointer' }}>{tr('profile:studio.group.' + slug, { defaultValue: en })}</button>
        ))}
      </div>
      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {bsStudioTypesIn(group).filter((t) => t !== 'zone').concat(group === zoneGroup ? ['zone'] : []).map((type) => {
          const [, , w, h] = STUDIO_KIT[type];
          const s = Math.min(54 / w, 40 / h, 1.4);
          return (
            <button key={type} type="button" data-kit={type} onClick={() => add(type)}
              style={{ minHeight: 84, padding: '8px 4px', borderRadius: 10, border: `1px solid ${ea(0.14)}`, background: E.BG2, color: E.INK, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', gap: 6, cursor: 'pointer', fontSize: 11.5, lineHeight: 1.2, textAlign: 'center' }}>
              <span style={{ height: 44, display: 'grid', placeItems: 'center' }}><img src={bsStudioSvg(type, w, h, { line: true })} alt="" style={{ width: Math.max(8, w * s), height: Math.max(8, h * s) }} /></span>
              {kitName(type)}
            </button>
          );
        })}
      </div>
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
// The editor's parts: the kitchen's layout, then the page's three.
const KITCHEN_PARTS = [['layout', 'secLayout', 'Layout'], ['recipes', 'secRecipes', 'Recipes'], ['plate', 'secPlate', 'Plate'], ['staples', 'secStaples', 'Staples']];
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
        <div role="alertdialog" data-remove-ask="" style={{ marginTop: 12, padding: 12, borderRadius: 12, background: E.BG3 }}>
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

function KitchenTab({ tr, look, kitchen, setKitchen, startSection = null, owner, uploadPhoto, draft, setDraft, layout = null }) {
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

      {part === 'layout' ? <div data-mine-part="layout">{layout}</div> : null}

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
export function BSMakeItYours({ role = 'trainer', demo = false, ownerUid = null, initial = null, startTab = 'colors', startSection = null, who = {}, words = null, photos = [], programs = [], onClose, onSaved }) {
  const tr = useShapeTr();
  const nutri = role === 'nutritionist';
  // The third tab: a trainer's space, a nutritionist's kitchen.
  const third = nutri ? 'kitchen' : 'space';
  // The account the editor is for (the one its `initial` doc was read for, else the one signed in
  // when it opened): the only one it reads for or saves to.
  const [owner] = React.useState(() => ownerUid || signedInUid());
  // A wall photo the editor keeps: the owner's own media, or in the demo one of its photos.
  const coverOf = (image) => (demo ? (photos.includes(image) ? { image } : null) : bsProfileCover({ image }, owner));
  // What the editor opened on, fixed for its life, so what reads as changed is what the coach
  // changed here. The profile opens it only once their doc is read (Codex P1 on #2484).
  const [seed] = React.useState(() => {
    const look = bsProfileLook(initial && initial.look) || {};
    const st = bsProfileStudio(initial && initial.studio);
    const cover = initial && initial.cover ? coverOf(initial.cover.image) : null;
    const kt = bsProfileKitchen(initial && initial.kitchen, owner);
    return {
      // A nutritionist starts amber (Shape's nutritionist gold), as their page does.
      look: { paper: look.paper || 'dark', accent: look.accent || (nutri ? 'amber' : 'teal'), focus: look.focus || 'center' }, wall: cover ? cover.image : null,
      // A nutritionist's empty plan is a kitchen, so a piece added before any layout is picked
      // saves as one (Codex on #2516).
      studio: st || { kind: nutri ? 'kitchen' : 'blank', where: '', items: [] },
      kitchen: kt
        ? { plate: kt.plate, rules: kt.rules.slice(), staples: kt.staples.map((x) => ({ ...x })), recipes: JSON.parse(JSON.stringify(kt.recipes)) }
        : { plate: null, rules: [], staples: [], recipes: [] },
    };
  });
  const [tab, setTab] = React.useState(['colors', 'wall', third].includes(startTab) ? startTab : 'colors');
  const [look, setLook] = React.useState(seed.look);
  const [wall, setWall] = React.useState(seed.wall);
  const [studio, setStudio] = React.useState(seed.studio);
  const [kitchen, setKitchen] = React.useState(seed.kitchen);
  const [sel, setSel] = React.useState(null);
  const [uploading, setUploading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const [leaving, setLeaving] = React.useState(false);
  const lookChanged = !sameJson(look, seed.look);
  const wallChanged = wall !== seed.wall;
  // A trainer's floor, or a nutritionist's kitchen layout: both ride in `studio`.
  const studioChanged = !sameJson(bsProfileStudio(studio), bsProfileStudio(seed.studio)) || studio.where !== seed.studio.where;
  const kitchenChanged = nutri && !sameJson(bsProfileKitchen(kitchen, owner), bsProfileKitchen(seed.kitchen, owner));
  // The recipe being written (kept here, so it waits while the coach looks at another tab). Save
  // asks for Done or Cancel first, so it never drops one unseen.
  const [recipeDraft, setRecipeDraft] = React.useState(null);
  const recipeOpen = !!recipeDraft;
  const dirty = lookChanged || wallChanged || studioChanged || kitchenChanged;
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

  // The doc with what was changed here put on it. Each key is written only when it was changed
  // here, so one changed elsewhere since this opened is kept; the wall photo only as coverOf keeps it.
  const withChanges = (base) => {
    const doc = { ...base };
    if (lookChanged) doc.look = { paper: look.paper, accent: look.accent, focus: look.focus };
    if (studioChanged) doc.studio = { kind: studio.kind, where: studio.where.trim(), items: studio.items };
    // An emptied kitchen drops the key (the normalizer keeps none with nothing in it).
    if (kitchenChanged) doc.kitchen = { plate: kitchen.plate, rules: kitchen.rules, staples: kitchen.staples, recipes: kitchen.recipes };
    if (wallChanged) {
      const cover = wall ? coverOf(wall) : null;
      if (cover) doc.cover = cover; else delete doc.cover;
    }
    return doc;
  };
  const save = async () => {
    if (busy) return;
    if (recipeOpen) { setErr(tr('profile:mine.errRecipeOpen', { defaultValue: 'Finish the recipe you are writing first: Done or Cancel.' })); return; }
    // The demo also says which keys were changed here, so its page keeps only those over its own
    // sample (whose station names follow the language; Codex P2 on #2486).
    if (demo) { onSaved && onSaved(bsNormalizeProfileCustom(withChanges(initial || {}), null), { look: lookChanged, cover: wallChanged, studio: studioChanged, kitchen: kitchenChanged }); return; }
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
    const clean = bsNormalizeProfileCustom(withChanges(base), uid);
    let res;
    try { res = await window.shapeDb?.saveUserGoals?.('profile_custom', clean, { expectedUserId: uid }); } catch (ex) { res = { error: ex }; }
    setBusy(false);
    if (!res || res.error) { setErr((res && res.error && res.error.message) || tr('profile:mine.errSave', { defaultValue: "Couldn't save. Nothing changed; try again." })); return; }
    onSaved && onSaved(clean);
  };
  // A recipe still being written is unsaved work too (Codex P2 on #2497): leaving asks first.
  const unsaved = dirty || recipeOpen;
  const back = () => { if (unsaved) setLeaving(true); else onClose && onClose(); };

  const head = {
    colors: [tr('profile:mine.colorsTitle', { defaultValue: 'Your colors' }), tr('profile:mine.colorsSub', { defaultValue: 'Pick from Shape’s papers and accents. Your whole page follows.' })],
    wall: [tr('profile:mine.wallTitle', { defaultValue: 'Your wall photo' }), tr('profile:mine.wallSub', { defaultValue: 'The big photo behind your avatar. Your gym, your platform, your view.' })],
    space: [tr('profile:mine.spaceTitle', { defaultValue: 'Your space' }), tr('profile:mine.spaceSub', { defaultValue: 'Draw where you coach: a studio, a garage, a full gym or a park.' })],
    kitchen: [tr('profile:mine.kitchenTitle', { defaultValue: 'Your kitchen' }), tr('profile:mine.kitchenSub', { defaultValue: 'Your kitchen\'s layout, your recipes, the plate you teach and your staples.' })],
  }[tab];

  const host = typeof document !== 'undefined' ? (document.getElementById('bs-phone-surface') || document.body) : null;
  const el = (
    <div className="bs-scroll" data-make-it-yours="" style={{ position: 'absolute', inset: 0, zIndex: 225, background: E.BG, color: E.INK, overflowY: 'auto', overflowX: 'hidden', fontFamily: BODY, WebkitFontSmoothing: 'antialiased' }}>
      <div style={{ padding: `calc(${window.BS_MAST_TOP_CSS || '12px'}) 18px ${dirty ? 120 : 40}px` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button type="button" onClick={back} style={{ minHeight: 44, padding: 0, border: 0, background: 'transparent', color: E.INK, fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>← {tr('profile:mine.backToProfile', { defaultValue: 'Profile' })}</button>
          <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: E.ED }}>{tr('profile:mine.eyebrow', { defaultValue: 'Your page' })}</span>
        </div>
        <div style={{ marginTop: 8 }}>
          <Seg label={tr('profile:mine.sections', { defaultValue: 'What to change' })} value={tab} onChange={(k) => { setTab(k); setSel(null); }}
            options={[['colors', tr('profile:mine.tabColors', { defaultValue: 'Colors' })], ['wall', tr('profile:mine.tabWall', { defaultValue: 'Wall photo' })], nutri ? ['kitchen', tr('profile:mine.tabKitchen', { defaultValue: 'Your kitchen' })] : ['space', tr('profile:mine.tabSpace', { defaultValue: 'Your space' })]]} />
        </div>
        <h1 style={{ margin: '18px 0 0', fontFamily: DISPLAY, fontWeight: 600, fontSize: 28, lineHeight: 1.05 }}>{head[0]}<span style={{ color: E.ED }}>.</span></h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, lineHeight: 1.45, color: ea(0.7) }}>{head[1]}</p>
        {tab !== 'space' && tab !== 'kitchen' ? <Preview tr={tr} look={look} wall={wall} who={{ ...who, first }} words={w} nutri={nutri} /> : null}
        {tab === 'colors' ? <ColorsTab tr={tr} look={look} setLook={setLook} /> : null}
        {tab === 'wall' ? <WallTab tr={tr} look={look} setLook={setLook} wall={wall} setWall={(u) => { setWall(u); setErr(null); }} choices={photos} uploading={uploading} onUpload={onUpload} noUpload={demo ? demoNoUpload : null} /> : null}
        {tab === 'space' ? <SpaceTab tr={tr} look={look} studio={studio} setStudio={setStudio} sel={sel} setSel={setSel} programs={programs} /> : null}
        {tab === 'kitchen' ? <KitchenTab tr={tr} look={look} kitchen={kitchen} setKitchen={setKitchen} startSection={startSection} owner={owner} uploadPhoto={uploadRecipePhoto} draft={recipeDraft} setDraft={setRecipeDraft}
          layout={<SpaceTab tr={tr} look={look} studio={studio} setStudio={setStudio} sel={sel} setSel={setSel} kitchen />} /> : null}
        {err && !unsaved ? <p role="alert" style={{ margin: '14px 0 0', fontSize: 13.5, color: E.ERR }}>{err}</p> : null}
      </div>
      {unsaved ? (
        <div style={{ position: 'sticky', bottom: 0, zIndex: 3, padding: '10px 18px calc(12px + env(safe-area-inset-bottom))', background: E.BG, borderTop: `1px solid ${ea(0.16)}` }}>
          {leaving ? <p style={{ margin: '0 0 8px', fontSize: 13.5, color: ea(0.8) }}>{tr('profile:mine.leaveAsk', { defaultValue: "You haven't saved these changes." })}</p> : <p style={{ margin: '0 0 8px', fontSize: 12.5, color: ea(0.6) }}>{demo ? tr('profile:mine.demoNote', { defaultValue: 'A sample page: your changes show here until you leave. Sign in to save yours.' }) : tr('profile:mine.saveNote', { defaultValue: 'Members see it as soon as you save.' })}</p>}
          {err ? <p role="alert" style={{ margin: '0 0 8px', fontSize: 13.5, color: E.ERR }}>{err}</p> : null}
          <div style={{ display: 'flex', gap: 8 }}>
            {leaving ? <button type="button" onClick={() => onClose && onClose()} style={{ ...smallBtn, flex: 1, minHeight: 48, borderRadius: 999 }}>{tr('profile:mine.leave', { defaultValue: 'Leave without saving' })}</button> : null}
            <button type="button" data-save-mine="" onClick={save} disabled={busy || uploading}
              style={{ flex: 1.3, minHeight: 48, borderRadius: 999, border: 0, background: E.ED, color: E.ON_ED, fontFamily: DISPLAY, fontSize: 16, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy || uploading ? 0.6 : 1 }}>
              {busy ? tr('profile:mine.saving', { defaultValue: 'Saving…' }) : tr('profile:mine.save', { defaultValue: 'Save' })}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
  return host ? createPortal(el, host) : el;
}
