import React from 'react';
import { createPortal } from 'react-dom';
import {
  BS_LOOK_PAPERS, BS_LOOK_ACCENTS, BS_STUDIO_ITEMS_MAX, BS_STUDIO_STATIONS_MAX, BS_STUDIO_WHERE_MAX, BS_STUDIO_LABEL_MAX,
  BS_STATION_TITLE_MAX, BS_STATION_NOTE_MAX, bsProfileLook, bsProfileStudio, bsProfileCover, bsNormalizeProfileCustom,
} from '../services/profileCustom.mjs';
import {
  STUDIO_KIT, STUDIO_GROUPS, STUDIO_COACH_KINDS, STUDIO_WORDS, BS_STUDIO_W, BS_STUDIO_H,
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
//
// What it writes: whichever of `look`, `studio` and `cover` the coach changed here, in the
// profile_custom doc, merged onto the doc as it is at save time (re-read for this account, so a
// key saved elsewhere since this opened is kept; no read, no save), through the same normalizer
// every surface uses. Nothing is saved until Save. The profile opens it only on the coach's doc
// as read, never on defaults.
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
const KIND_KEYS = { private: ['trainer.kindPrivate', 'Private studio'], garage: ['trainer.kindGarage', 'Garage gym'], gym: ['trainer.kindGym', 'Full gym'], pilates: ['trainer.kindPilates', 'Pilates studio'], boxing: ['trainer.kindBoxing', 'Boxing gym'], outdoor: ['trainer.kindOutdoor', 'Outdoors'], blank: ['mine.kindBlank', 'Start blank'] };
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
function Preview({ tr, look, wall, who, words }) {
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
          {[words.day, tr('profile:trainer.tabStudio', { defaultValue: 'The studio' }), tr('profile:trainer.tabReplays', { defaultValue: 'Replays' })].map((l, i) => (
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
function WallTab({ tr, look, setLook, wall, setWall, choices, uploading, onUpload }) {
  const fileRef = React.useRef(null);
  const tiles = [];
  const seen = new Set();
  for (const url of [wall, ...choices]) if (url && !seen.has(url)) { seen.add(url); tiles.push(url); }
  return (
    <div>
      <Eyebrow>{tr('profile:mine.pickPhoto', { defaultValue: 'Pick a photo' })}</Eyebrow>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif" onChange={onUpload} style={{ display: 'none' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        <button type="button" onClick={() => !uploading && fileRef.current && fileRef.current.click()} disabled={uploading}
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
function SpaceTab({ tr, look, studio, setStudio, sel, setSel }) {
  const P = paletteOf(look.paper, look.accent);
  const ACC = P.ACCENT;
  const ink = (n) => `rgba(${P.inkRGB},${n})`;
  const word = (k) => tr('profile:studio.word.' + k, { defaultValue: STUDIO_WORDS[k] || k });
  const kitName = (type) => tr('profile:studio.kit.' + type, { defaultValue: (STUDIO_KIT[type] || [type])[0] });
  const kindName = (k) => tr('profile:' + KIND_KEYS[k][0], { defaultValue: KIND_KEYS[k][1] });
  const doorName = (k) => (k === 'entrance' ? tr('profile:trainer.doorEntrance', { defaultValue: 'Entrance' }) : k === 'garage' ? tr('profile:trainer.doorGarage', { defaultValue: 'Garage door' }) : tr('profile:trainer.doorDoor', { defaultValue: 'Door' }));
  const items = studio.items;
  const stations = items.filter((p) => p.st).length;
  const [ask, setAsk] = React.useState(null); // a kind waiting on "replace your pieces?"
  const [group, setGroup] = React.useState('free');
  const [msg, setMsg] = React.useState(null);
  const svgRef = React.useRef(null);
  const drag = React.useRef(null);

  const update = (i, patch) => setStudio({ ...studio, items: items.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  const fit = (p) => { const w = clamp(Math.round(p.w), 4, BS_STUDIO_W), h = clamp(Math.round(p.h), 4, BS_STUDIO_H); return { ...p, w, h, x: clamp(Math.round(p.x), 0, BS_STUDIO_W - w), y: clamp(Math.round(p.y), 0, BS_STUDIO_H - h) }; };
  const pickKind = (k) => {
    if (k === studio.kind && items.length) return;
    if (items.length) { setAsk(k); return; }
    setStudio({ ...studio, kind: k, items: bsStudioFromTemplate(k, word) });
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
      <Eyebrow>{tr('profile:mine.whereCoach', { defaultValue: 'Where do you coach?' })}</Eyebrow>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {STUDIO_COACH_KINDS.map((k) => {
          const on = k === studio.kind && items.length > 0;
          return <button key={k} type="button" data-kind={k} aria-pressed={on} onClick={() => pickKind(k)}
            style={{ minHeight: 38, padding: '0 12px', borderRadius: 999, border: `1px solid ${on ? E.ED : ea(0.22)}`, background: on ? hexA(E.ED, 0.14) : 'transparent', color: E.INK, fontSize: 13.5, cursor: 'pointer' }}>{kindName(k)}</button>;
        })}
      </div>
      {ask ? (
        <div role="alertdialog" style={{ marginTop: 10, padding: 12, borderRadius: 12, background: E.BG3 }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>{tr('profile:mine.replaceAsk', { defaultValue: 'Start over from the {kind} layout? It replaces the pieces you have.', kind: kindName(ask) })}</p>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => { setStudio({ ...studio, kind: ask, items: bsStudioFromTemplate(ask, word) }); setSel(null); setAsk(null); }} style={{ ...smallBtn, background: E.ED, color: E.ON_ED, border: 0 }}>{tr('profile:mine.replace', { defaultValue: 'Start over' })}</button>
            <button type="button" onClick={() => { setStudio({ ...studio, kind: ask }); setAsk(null); }} style={smallBtn}>{tr('profile:mine.keepPieces', { defaultValue: 'Keep my pieces' })}</button>
            <button type="button" onClick={() => setAsk(null)} style={{ ...smallBtn, border: 0, color: ea(0.7) }}>{tr('profile:mine.cancel', { defaultValue: 'Cancel' })}</button>
          </div>
        </div>
      ) : null}
      <label style={{ display: 'block', marginTop: 12 }}>
        <span style={{ display: 'block', fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: ea(0.6), marginBottom: 6 }}>{tr('profile:mine.nameIt', { defaultValue: 'Name it' })}</span>
        <input value={studio.where} maxLength={BS_STUDIO_WHERE_MAX} onChange={(e) => setStudio({ ...studio, where: e.target.value })} placeholder={tr('profile:mine.namePh', { defaultValue: 'Okafor Strength, Fishtown' })} style={field} />
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
        <p style={{ margin: '14px 0 0', fontSize: 13.5, lineHeight: 1.45, color: ea(0.66) }}>{tr('profile:mine.spaceEmpty', { defaultValue: 'Pick the kind of space above to start from a layout, or add pieces below.' })}</p>
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
              <textarea value={cur.st.note} maxLength={BS_STATION_NOTE_MAX} rows={3} onChange={(e) => update(sel, { st: { ...cur.st, note: e.target.value } })} aria-label={tr('profile:mine.stationNote', { defaultValue: 'What you do here' })} placeholder={tr('profile:mine.stationNotePh', { defaultValue: 'What you do here, and what a client gets from it.' })} style={{ ...field, marginTop: 8, padding: '10px 12px', minHeight: 84, resize: 'vertical', lineHeight: 1.45 }} />
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
        {STUDIO_GROUPS.map(([slug, en]) => (
          <button key={slug} type="button" aria-pressed={slug === group} onClick={() => setGroup(slug)}
            style={{ flex: 'none', minHeight: 36, padding: '0 12px', borderRadius: 999, border: `1px solid ${slug === group ? E.INK : ea(0.2)}`, background: slug === group ? E.INK : 'transparent', color: slug === group ? E.BG : E.INK, fontSize: 13, cursor: 'pointer' }}>{tr('profile:studio.group.' + slug, { defaultValue: en })}</button>
        ))}
      </div>
      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {bsStudioTypesIn(group).filter((t) => t !== 'zone').concat(group === 'studio' ? ['zone'] : []).map((type) => {
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

// ── The editor ──────────────────────────────────────────────────────────────────────────────
export function BSMakeItYours({ role = 'trainer', ownerUid = null, initial = null, startTab = 'colors', who = {}, words = null, photos = [], onClose, onSaved }) {
  const tr = useShapeTr();
  // The account the editor is for (the one its `initial` doc was read for, else the one signed in
  // when it opened): the only one it reads for or saves to.
  const [owner] = React.useState(() => ownerUid || signedInUid());
  // What the editor opened on, fixed for its life, so what reads as changed is what the coach
  // changed here. The profile opens it only once their doc is read (Codex P1 on #2484).
  const [seed] = React.useState(() => {
    const look = bsProfileLook(initial && initial.look) || {};
    const st = bsProfileStudio(initial && initial.studio);
    const cover = bsProfileCover(initial && initial.cover, owner);
    return { look: { paper: look.paper || 'dark', accent: look.accent || 'teal', focus: look.focus || 'center' }, wall: cover ? cover.image : null, studio: st || { kind: 'blank', where: '', items: [] } };
  });
  const [tab, setTab] = React.useState(['colors', 'wall', 'space'].includes(startTab) ? startTab : 'colors');
  const [look, setLook] = React.useState(seed.look);
  const [wall, setWall] = React.useState(seed.wall);
  const [studio, setStudio] = React.useState(seed.studio);
  const [sel, setSel] = React.useState(null);
  const [uploading, setUploading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const [leaving, setLeaving] = React.useState(false);
  const lookChanged = !sameJson(look, seed.look);
  const wallChanged = wall !== seed.wall;
  const studioChanged = !sameJson(bsProfileStudio(studio), bsProfileStudio(seed.studio)) || studio.where !== seed.studio.where;
  const dirty = lookChanged || wallChanged || studioChanged;
  const first = who.first || String(who.name || '').split(' ')[0];
  const w = words || { day: tr('profile:trainer.dayName', { defaultValue: "{name}'s day", name: first }), work: tr('profile:trainer.workName', { defaultValue: 'Work with {name}', name: first }) };

  const onUpload = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
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

  const save = async () => {
    if (busy) return;
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
    // Each key is written only when it was changed here, so one changed elsewhere since this
    // opened is kept; the wall photo only as the owner's own media.
    const doc = { ...base };
    if (lookChanged) doc.look = { paper: look.paper, accent: look.accent, focus: look.focus };
    if (studioChanged) doc.studio = { kind: studio.kind, where: studio.where.trim(), items: studio.items };
    if (wallChanged) {
      const cover = wall ? bsProfileCover({ image: wall }, uid) : null;
      if (cover) doc.cover = cover; else delete doc.cover;
    }
    const clean = bsNormalizeProfileCustom(doc, uid);
    let res;
    try { res = await window.shapeDb?.saveUserGoals?.('profile_custom', clean, { expectedUserId: uid }); } catch (ex) { res = { error: ex }; }
    setBusy(false);
    if (!res || res.error) { setErr((res && res.error && res.error.message) || tr('profile:mine.errSave', { defaultValue: "Couldn't save. Nothing changed; try again." })); return; }
    onSaved && onSaved(clean);
  };
  const back = () => { if (dirty) setLeaving(true); else onClose && onClose(); };

  const head = {
    colors: [tr('profile:mine.colorsTitle', { defaultValue: 'Your colors' }), tr('profile:mine.colorsSub', { defaultValue: 'Pick from Shape’s papers and accents. Your whole page follows.' })],
    wall: [tr('profile:mine.wallTitle', { defaultValue: 'Your wall photo' }), tr('profile:mine.wallSub', { defaultValue: 'The big photo behind your avatar. Your gym, your platform, your view.' })],
    space: [tr('profile:mine.spaceTitle', { defaultValue: 'Your space' }), tr('profile:mine.spaceSub', { defaultValue: 'Draw where you coach: a studio, a garage, a full gym or a park.' })],
  }[tab];

  const host = typeof document !== 'undefined' ? (document.getElementById('bs-phone-surface') || document.body) : null;
  const el = (
    <div className="bs-scroll" data-make-it-yours="" style={{ position: 'absolute', inset: 0, zIndex: 225, background: E.BG, color: E.INK, overflowY: 'auto', fontFamily: BODY, WebkitFontSmoothing: 'antialiased' }}>
      <div style={{ padding: `calc(${window.BS_MAST_TOP_CSS || '12px'}) 18px ${dirty ? 120 : 40}px` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button type="button" onClick={back} style={{ minHeight: 44, padding: 0, border: 0, background: 'transparent', color: E.INK, fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>← {tr('profile:mine.backToProfile', { defaultValue: 'Profile' })}</button>
          <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: E.ED }}>{tr('profile:mine.eyebrow', { defaultValue: 'Your page' })}</span>
        </div>
        <div style={{ marginTop: 8 }}>
          <Seg label={tr('profile:mine.sections', { defaultValue: 'What to change' })} value={tab} onChange={(k) => { setTab(k); setSel(null); }}
            options={[['colors', tr('profile:mine.tabColors', { defaultValue: 'Colors' })], ['wall', tr('profile:mine.tabWall', { defaultValue: 'Wall photo' })], ['space', tr('profile:mine.tabSpace', { defaultValue: 'Your space' })]]} />
        </div>
        <h1 style={{ margin: '18px 0 0', fontFamily: DISPLAY, fontWeight: 600, fontSize: 28, lineHeight: 1.05 }}>{head[0]}<span style={{ color: E.ED }}>.</span></h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, lineHeight: 1.45, color: ea(0.7) }}>{head[1]}</p>
        {tab !== 'space' ? <Preview tr={tr} look={look} wall={wall} who={{ ...who, first }} words={w} /> : null}
        {tab === 'colors' ? <ColorsTab tr={tr} look={look} setLook={setLook} /> : null}
        {tab === 'wall' ? <WallTab tr={tr} look={look} setLook={setLook} wall={wall} setWall={setWall} choices={photos} uploading={uploading} onUpload={onUpload} /> : null}
        {tab === 'space' ? <SpaceTab tr={tr} look={look} studio={studio} setStudio={setStudio} sel={sel} setSel={setSel} /> : null}
        {err && !dirty ? <p role="alert" style={{ margin: '14px 0 0', fontSize: 13.5, color: E.ERR }}>{err}</p> : null}
      </div>
      {dirty ? (
        <div style={{ position: 'sticky', bottom: 0, zIndex: 3, padding: '10px 18px calc(12px + env(safe-area-inset-bottom))', background: E.BG, borderTop: `1px solid ${ea(0.16)}` }}>
          {leaving ? <p style={{ margin: '0 0 8px', fontSize: 13.5, color: ea(0.8) }}>{tr('profile:mine.leaveAsk', { defaultValue: "You haven't saved these changes." })}</p> : <p style={{ margin: '0 0 8px', fontSize: 12.5, color: ea(0.6) }}>{tr('profile:mine.saveNote', { defaultValue: 'Members see it as soon as you save.' })}</p>}
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
