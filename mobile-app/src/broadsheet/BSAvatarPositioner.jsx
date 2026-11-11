import React from 'react';
import { createRoot } from 'react-dom/client';
import { bsDialogRef } from '../services/dialogBack.mjs';
import { BS_AV_OUT, BS_AV_ZOOM_MAX, BS_AV_WINDOW, BS_AV_SOURCE_MAX, bsAvClamp, bsAvRect, bsAvPan, bsAvZoomAt, bsAvFit } from '../services/avatarCrop.mjs';

// ─── POSITION YOUR PHOTO ──────────────────────────────────────────────────────────────────────────
// Owner, 2026-11-11: "need to be able to drag and reposition profile pic on avatar". A picked photo opens
// here before anything is saved, and so does Reposition on Edit profile: the photo in a large copy of the
// avatar's diamond, dragged into place with a finger or the mouse, zoomed with a pinch, the slider, the
// wheel or + and −, and moved with the arrow keys. Use photo cuts the 256px square every avatar reads
// (services/avatarCrop.mjs) and hands it to the caller's save; the sheet stays open, saying so, until the
// save lands or fails. Cancel saves nothing.
//
// It is its own React root over the phone surface, opened by a call (bsOpenPhotoPositioner), so the
// Settings page, the member's profile and a coach's profile can each open it without mounting a host.
// That is also why it is fixed-dark, as the launch screens are: a root of its own reads no theme.
//
// ⚠ A FAILED SAVE SAYS SO ON SCREEN. Toasts are a no-op app-wide (BSToastHost).

const { useState, useEffect, useRef } = React;

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

const INK = '#f2ede4';
const INK70 = 'rgba(242,237,228,0.72)';
const INK50 = 'rgba(242,237,228,0.5)';
const LINE = 'rgba(242,237,228,0.22)';
const TEAL = '#34d6c5';
const RUST = '#ff9b7a';
const MONO = "'JetBrains Mono', 'Cascadia Code', Consolas, monospace";
const DISPLAY = "'Saira', 'Space Grotesk', -apple-system, system-ui, sans-serif";

// A data URL read into an <img>, with its size.
function bsAvLoad(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('unreadable'));
    img.src = src;
  });
}

// A picked file as the photo to keep: its long side at most BS_AV_SOURCE_MAX, as a JPEG.
export async function bsAvReadFile(file) {
  const raw = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('unreadable'));
    r.readAsDataURL(file);
  });
  const img = await bsAvLoad(raw);
  const { w, h } = bsAvFit(img.naturalWidth, img.naturalHeight, BS_AV_SOURCE_MAX);
  try {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0, w, h);
    return cv.toDataURL('image/jpeg', 0.85);
  } catch (e) { return raw; }
}

// The square at `pos`, as the 256px JPEG.
export function bsAvCut(img, pos) {
  const r = bsAvRect(img.naturalWidth, img.naturalHeight, pos);
  const cv = document.createElement('canvas');
  cv.width = BS_AV_OUT; cv.height = BS_AV_OUT;
  cv.getContext('2d').drawImage(img, r.sx, r.sy, r.side, r.side, 0, 0, BS_AV_OUT, BS_AV_OUT);
  return cv.toDataURL('image/jpeg', 0.82);
}

function BSAvatarPositioner({ src, pos: startPos, onSave, onDone }) {
  const tr = useShapeTr();
  const [img, setImg] = useState(null);
  const [broken, setBroken] = useState(false);
  const [pos, setPos] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const stageRef = useRef(null);
  const [frame, setFrame] = useState(280);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const posRef = useRef(null);
  posRef.current = pos;

  useEffect(() => {
    let on = true;
    bsAvLoad(src).then((im) => {
      if (!on) return;
      setImg(im);
      setPos(bsAvClamp(im.naturalWidth, im.naturalHeight, startPos || null));
    }).catch(() => { if (on) setBroken(true); });
    return () => { on = false; };
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const measure = () => setFrame(Math.max(120, el.clientWidth || 280));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [img]);

  const iw = img ? img.naturalWidth : 1;
  const ih = img ? img.naturalHeight : 1;
  const cancel = () => { if (!busy) onDone(null); };
  const move = (next) => { setErr(''); setPos(next); };

  // The stage's own wheel listener, not React's: a passive one cannot stop the page scrolling under it.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !img) return undefined;
    const wheel = (e) => {
      e.preventDefault();
      const b = el.getBoundingClientRect();
      setPos((p) => bsAvZoomAt(iw, ih, p, (p ? p.zoom : 1) * Math.exp(-e.deltaY * 0.0022), (e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [img, iw, ih]);

  const pinchOf = () => {
    const pts = [...pointers.current.values()];
    if (pts.length < 2) return null;
    const [a, b] = pts;
    return { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  };
  const onDown = (e) => {
    if (!img || busy) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) { /* the drag still follows inside the stage */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current = { pinch: pinchOf(), pos: posRef.current };
  };
  const onMove = (e) => {
    if (!img || !pointers.current.has(e.pointerId)) return;
    const prev = pointers.current.get(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pinch = pinchOf();
    if (pinch && gesture.current && gesture.current.pinch) {
      const b = stageRef.current.getBoundingClientRect();
      const start = gesture.current;
      const z = start.pos.zoom * (pinch.d / Math.max(1, start.pinch.d));
      move(bsAvZoomAt(iw, ih, start.pos, z, (pinch.cx - b.left) / b.width, (pinch.cy - b.top) / b.height));
      return;
    }
    if (pointers.current.size === 1) setPos((p) => bsAvPan(iw, ih, p, e.clientX - prev.x, e.clientY - prev.y, frame));
  };
  const onUp = (e) => {
    pointers.current.delete(e.pointerId);
    gesture.current = { pinch: pinchOf(), pos: posRef.current };
  };
  const onKey = (e) => {
    if (!img) return;
    const step = frame * 0.03;
    const k = e.key;
    let next = null;
    if (k === 'ArrowLeft') next = bsAvPan(iw, ih, pos, step, 0, frame);
    else if (k === 'ArrowRight') next = bsAvPan(iw, ih, pos, -step, 0, frame);
    else if (k === 'ArrowUp') next = bsAvPan(iw, ih, pos, 0, step, frame);
    else if (k === 'ArrowDown') next = bsAvPan(iw, ih, pos, 0, -step, frame);
    else if (k === '+' || k === '=') next = bsAvZoomAt(iw, ih, pos, pos.zoom * 1.1);
    else if (k === '-' || k === '_') next = bsAvZoomAt(iw, ih, pos, pos.zoom / 1.1);
    if (next) { e.preventDefault(); move(next); }
  };

  const use = async () => {
    if (!img || !pos || busy) return;
    setBusy(true); setErr('');
    let photo = '';
    try { photo = bsAvCut(img, pos); } catch (e) { photo = ''; }
    if (!photo) { setBusy(false); setErr(tr('settings:edit.photoFailed', { defaultValue: 'Couldn’t save your photo. Try again.' })); return; }
    let res = null;
    try { res = await onSave({ photo, source: src, pos }); } catch (e) { res = { error: e }; }
    if (res && res.error) { setBusy(false); setErr(tr('settings:edit.photoFailed', { defaultValue: 'Couldn’t save your photo. Try again.' })); return; }
    onDone({ photo, pos });
  };

  const r = img && pos ? bsAvRect(iw, ih, pos) : null;
  const scale = r ? frame / r.side : 1;
  const win = `${(BS_AV_WINDOW * 100).toFixed(2)}%`;
  const btn = (fill) => ({ flex: fill ? 1 : '0 0 auto', minWidth: 0, minHeight: 48, padding: '0 20px', borderRadius: 10, border: `1px solid ${fill ? TEAL : LINE}`, background: fill ? TEAL : 'transparent', color: fill ? '#04201d' : INK70, fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: busy ? 'default' : 'pointer', opacity: busy && !fill ? 0.5 : 1 });
  const title = tr('settings:edit.positionTitle', { defaultValue: 'Position your photo' });

  return (
    <div ref={bsDialogRef(busy ? null : cancel)} role="dialog" aria-modal="true" aria-label={title} data-bs-avatar-positioner=""
      style={{ position: 'absolute', inset: 0, zIndex: 1300, display: 'flex', flexDirection: 'column', background: '#05080c', color: INK, fontFamily: DISPLAY }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'stretch', padding: 'max(56px, calc(env(safe-area-inset-top, 0px) + 40px)) 22px 12px', boxSizing: 'border-box' }}>
        <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: TEAL }}>{tr('settings:edit.photoAvatar', { defaultValue: 'Photo & avatar' })}</div>
        <h2 style={{ margin: '6px 0 0', fontFamily: DISPLAY, fontSize: 28, fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1.08 }}>{title}</h2>
        <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.45, color: INK70 }}>{tr('settings:edit.positionHint', { defaultValue: 'Drag the photo to move it. Pinch, scroll or use the slider to zoom. What shows inside the outline is your avatar.' })}</p>

        <div ref={stageRef} data-bs-avatar-stage="" tabIndex={0} role="group"
          aria-label={tr('settings:edit.positionStage', { defaultValue: 'Photo position. Drag, or use the arrow keys to move and + or − to zoom.' })}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey}
          style={{ position: 'relative', width: '100%', maxWidth: 340, aspectRatio: '1 / 1', alignSelf: 'center', marginTop: 20, overflow: 'hidden', borderRadius: 14, background: '#0b1015', touchAction: 'none', cursor: img ? 'grab' : 'default', outline: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}>
          {img && r ? (
            <img src={src} alt="" draggable={false}
              style={{ position: 'absolute', left: -r.sx * scale, top: -r.sy * scale, width: iw * scale, height: ih * scale, maxWidth: 'none', pointerEvents: 'none' }} />
          ) : null}
          {broken ? <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 20, textAlign: 'center', fontSize: 14, color: INK70 }}>{tr('settings:edit.photoUnreadable', { defaultValue: 'This photo could not be opened. Try another.' })}</div> : null}
          {/* The avatar's window: the diamond every avatar shows, the rest dimmed. */}
          <div aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '50%', width: win, height: win, transform: 'translate(-50%, -50%) rotate(45deg)', borderRadius: '23%', border: `2px solid ${TEAL}`, boxShadow: '0 0 0 2000px rgba(3,5,11,0.58)', pointerEvents: 'none' }} />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, alignSelf: 'center', width: '100%', maxWidth: 340 }}>
          <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: INK50 }}>{tr('settings:edit.zoom', { defaultValue: 'Zoom' })}</span>
          <input type="range" min={1} max={BS_AV_ZOOM_MAX} step={0.01} value={pos ? pos.zoom : 1} disabled={!img || busy}
            onChange={(e) => pos && move(bsAvZoomAt(iw, ih, pos, Number(e.target.value)))}
            style={{ flex: 1, minWidth: 0, accentColor: TEAL, height: 32 }} />
        </label>
        {img ? (
          <button type="button" onClick={() => move(bsAvClamp(iw, ih, null))} disabled={busy}
            style={{ alignSelf: 'center', marginTop: 4, minHeight: 40, padding: '0 14px', border: 0, background: 'transparent', color: TEAL, fontFamily: MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>
            {tr('settings:edit.positionReset', { defaultValue: 'Centre it' })}
          </button>
        ) : null}
        {err ? <div role="alert" style={{ marginTop: 10, fontFamily: MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: RUST, textAlign: 'center' }}>{err}</div> : null}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '12px 22px max(18px, calc(12px + env(safe-area-inset-bottom, 0px)))', borderTop: `1px solid ${LINE}` }}>
        <button type="button" onClick={cancel} disabled={busy} style={btn(false)}>{tr('settings:action.cancel', { defaultValue: 'Cancel' })}</button>
        <button type="button" data-bs-avatar-use="" onClick={use} disabled={!img || busy} style={btn(true)}>
          {busy ? tr('profile:log.saving', { defaultValue: 'Saving…' }) : tr('settings:edit.usePhoto', { defaultValue: 'Use photo' })}
        </button>
      </div>
    </div>
  );
}

/**
 * Opens Position your photo over the phone and resolves when it closes: { photo, pos } once `onSave`
 * has saved the square, or null for Cancel (and for a Back). `onSave({ photo, source, pos })` resolves
 * { error } when the save failed; the sheet then stays open and says so.
 */
export function bsOpenPhotoPositioner({ src, pos = null, onSave }) {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || !src) { resolve(null); return; }
    const host = document.getElementById('bs-phone-surface') || document.body;
    const el = document.createElement('div');
    el.setAttribute('data-bs-avatar-positioner-root', '');
    // ⚠ ITS OWN BOX OVER THE WHOLE SURFACE: index.html sets `.bs-paper-grain > * { position: relative }`, so a
    // bare wrapper is a zero-high box and the sheet inside it has no height.
    el.style.cssText = 'position:absolute;inset:0;z-index:1300;';
    // A surface is overflow:hidden but can still be scrolled (a scrollIntoView, a focused field); a sheet
    // at its top would then open partly above the screen.
    try { host.scrollTop = 0; host.scrollLeft = 0; } catch (e) { /* nothing scrolled */ }
    host.appendChild(el);
    const root = createRoot(el);
    let open = true;
    const done = (v) => {
      if (!open) return;
      open = false;
      // After this tick: the root is not unmounted from inside its own render.
      setTimeout(() => { try { root.unmount(); } catch (e) { /* already gone */ } el.remove(); }, 0);
      resolve(v);
    };
    root.render(<BSAvatarPositioner src={src} pos={pos} onSave={onSave} onDone={done} />);
  });
}

/** A file picker, then the positioner: resolves the picked photo as the one to keep, or null. */
export function bsPickPhotoFile() {
  return new Promise((resolve) => {
    try {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.onchange = () => {
        const f = input.files && input.files[0];
        if (!f) { resolve(null); return; }
        bsAvReadFile(f).then(resolve).catch(() => resolve(null));
      };
      input.click();
    } catch (e) { resolve(null); }
  });
}
