import React from 'react';
import { BS_CLEAN_HEAD, BS_CLEAN_SANS } from './bsCleanType.jsx';
// ─── THE COACH'S DRAFT COMPOSER (✦ AI draft / Build) ─────────────────────────────────────────────
// The page a trainer's Programs and a nutritionist's Plans open to describe a plan, workout or program
// for Nora to draft, or to build one blank (owner, 2026-11-04: "update design of page here"; the direction:
// "keep designs simple … modern, appealing, easy to navigate, not overwhelming, not analog. make them look
// really alive", of the member profile, "this looks better", then "reduce the coloring and simplify UI
// more"). In the profile's grammar, in the paper's own colours: what the page is and Cancel on one line, the
// kind as a rounded switch, the brief as a raised box, every choice a soft chip (the picked one in ink), and
// Generate the one button in the accent. Its choices are compact (owner, of the first cut: "clean up filters,
// make them smaller, and alow for custom focuses to be used"): a 30px chip drawn inside a 44px button, and a
// group that takes the coach's own words (a trainer's focus, a nutritionist's goal) adds them with ＋ Custom.
//
// ⚠ THE PAGE HANDS IN EVERYTHING (BSTrainerPrograms / BSNutriPlans): the words, the picks and their setters,
// the brief, Cancel (which releases the run, see there) and Generate with its status, which is the button's
// label and its disabled state while a draft is on its way. The only state kept here is the custom choices
// typed this visit; a picked one is the group's value like any built-in one, and the page sends it the same
// way (Nora's draft request carries it as `goal`, a plain string).
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP; this module imports nothing of the pros or
// client modules.

const { useState } = React;
const HEAD = BS_CLEAN_HEAD;
const SANS = BS_CLEAN_SANS;
const hexA = (c, a) => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || ''));
  if (!m) return `color-mix(in srgb, ${c || 'currentColor'} ${Math.round(a * 100)}%, transparent)`;
  const h = m[1].length === 3 ? m[1].replace(/./g, (x) => x + x) : m[1];
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const inkA = (t, a) => `rgba(${t.inkRGB || (t.isLight ? '15,14,12' : '245,240,230')},${a})`;
// The member profile's quiet tile and soft pill.
const tile = (t, r = 20) => ({
  position: 'relative', boxSizing: 'border-box', borderRadius: r,
  background: t.isLight ? 'rgba(255,255,255,0.78)' : inkA(t, 0.065),
  border: `1px solid ${inkA(t, t.isLight ? 0.07 : 0.1)}`,
  boxShadow: t.isLight ? `0 1px 2px ${inkA(t, 0.06)}, 0 14px 28px -18px ${inkA(t, 0.4)}` : 'inset 0 1px 0 rgba(255,255,255,0.06), 0 16px 32px -20px rgba(0,0,0,0.95)',
});
const pill = (t) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, padding: '0 16px', boxSizing: 'border-box',
  borderRadius: 999, border: `1px solid ${inkA(t, t.isLight ? 0.1 : 0.14)}`, background: t.isLight ? 'rgba(255,255,255,0.72)' : inkA(t, 0.07),
  color: t.INK, fontFamily: SANS, fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
});

const CSS = `
@keyframes bsdc-in { from { opacity: 0; transform: translateY(10px); } }
@keyframes bsdc-spin { to { transform: rotate(360deg); } }
[data-draft-composer] button { -webkit-tap-highlight-color: transparent; }
[data-draft-composer] button:focus-visible { outline: 2px solid var(--dc-accent); outline-offset: 2px; }
[data-dc-in] { animation: bsdc-in 420ms cubic-bezier(.2,.8,.2,1) both; }
[data-dc-press] { transition: transform 160ms ease, background-color 200ms ease, box-shadow 200ms ease, color 200ms ease; }
[data-dc-press]:active { transform: scale(0.96); }
[data-dc-brief] { transition: box-shadow 220ms ease, border-color 220ms ease; }
[data-dc-brief]:focus-within { border-color: var(--dc-accent) !important; box-shadow: 0 0 0 3px var(--dc-ring), 0 16px 32px -20px var(--dc-shadow) !important; }
[data-dc-thumb] { transition: left 280ms cubic-bezier(.2,.8,.2,1); }
[data-dc-spin] { animation: bsdc-spin 900ms linear infinite; }
@media (prefers-reduced-motion: reduce) {
  [data-draft-composer] *, [data-draft-composer] *::before, [data-draft-composer] *::after { animation: none !important; transition: none !important; }
  [data-dc-press]:active { transform: none !important; }
}
`;

// A group's label: the catalog's own word (its capitals kept), set small over the chips.
const label = (t) => ({ display: 'block', marginBottom: 2, fontFamily: SANS, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 });
// A custom choice: one line of the coach's own words, trimmed, at most this long, at most this many a group.
export const BS_DRAFT_CUSTOM_MAX_LEN = 24;
export const BS_DRAFT_CUSTOM_MAX = 5;
export function bsDraftCustomName(raw) {
  return String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim().slice(0, BS_DRAFT_CUSTOM_MAX_LEN).trim();
}

export function BSProDraftComposer({ t, accent, accentInk, eyebrow, cancelLabel, onCancel, titleA, titleB, buildingLabel, kinds, kind, onKind, kindDesc, prompt, groups, generate, hint }) {
  const n = kinds.length;
  const idx = Math.max(0, kinds.findIndex(([k]) => k === kind));
  const busy = !!generate.busy;
  const [customs, setCustoms] = useState({}); // group key → the custom choices typed this visit
  const [adding, setAdding] = useState(null); // the group whose ＋ Custom field is open
  const [entry, setEntry] = useState('');
  // A chip: 30px drawn (36px round for a number) inside a 44px button; the picked one in ink.
  const face = (on, round = false) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', borderRadius: 999, whiteSpace: 'nowrap',
    height: round ? 36 : 30, minWidth: round ? 36 : 0, padding: round ? 0 : '0 12px', fontFamily: SANS, fontSize: 13, fontWeight: on ? 700 : 550,
    ...(on ? { background: t.INK, color: t.PAPER, border: `1px solid ${t.INK}` } : { background: t.isLight ? 'rgba(255,255,255,0.72)' : inkA(t, 0.06), color: t.INK70, border: `1px solid ${inkA(t, t.isLight ? 0.1 : 0.14)}` }),
  });
  const target = { minWidth: 44, minHeight: 44, padding: 0, margin: 0, border: 0, background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'inherit', font: 'inherit' };
  const customsOf = (g) => {
    const own = customs[g.key] || [];
    // A custom value picked on an earlier visit still shows, so it can be seen and changed.
    const kept = typeof g.value === 'string' && g.value && !g.options.includes(g.value) && !own.includes(g.value) ? [g.value] : [];
    return [...kept, ...own];
  };
  const addCustom = (g) => {
    const name = bsDraftCustomName(entry);
    setEntry('');
    setAdding(null);
    if (!name) return;
    const list = customsOf(g);
    // A duplicate (any case) picks the one already there.
    const same = [...g.options.map(String), ...list].find((x) => x.toLowerCase() === name.toLowerCase());
    if (same) { g.onPick(g.options.find((o) => String(o) === same) ?? same); return; }
    if (list.length >= BS_DRAFT_CUSTOM_MAX) return;
    setCustoms((m) => ({ ...m, [g.key]: [...(m[g.key] || []), name] }));
    g.onPick(name);
  };
  const removeCustom = (g, name) => {
    setCustoms((m) => ({ ...m, [g.key]: (m[g.key] || []).filter((x) => x !== name) }));
    if (g.value === name) g.onPick(g.custom.fallback);
  };
  return (
    <div data-draft-composer="" style={{ '--dc-accent': accent, '--dc-ring': hexA(accent, t.isLight ? 0.16 : 0.2), '--dc-shadow': t.isLight ? inkA(t, 0.4) : 'rgba(0,0,0,0.95)', padding: `12px ${t.padX}px 28px`, overflowX: 'clip' }}>
      <style>{CSS}</style>
      {/* What the page is, and the way out. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span data-dc-eyebrow="" style={{ minWidth: 0, fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: t.INK70, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{eyebrow}</span>
        <button type="button" data-dc-cancel="" data-dc-press="" onClick={onCancel} style={{ ...pill(t), flexShrink: 0, fontSize: 13, letterSpacing: '0.06em' }}>{cancelLabel}</button>
      </div>
      <h1 data-dc-in="" style={{ margin: '16px 0 0', fontFamily: HEAD, fontSize: 32, fontWeight: 650, letterSpacing: '-0.03em', lineHeight: 1.08, color: t.INK, overflowWrap: 'anywhere' }}>
        {titleA} {titleB}<span aria-hidden="true" style={{ color: accent }}>.</span>
      </h1>

      {/* The kind, as a rounded switch, and what it is under it. */}
      <div style={{ marginTop: 20 }}>
        <span style={label(t)}>{buildingLabel}</span>
        <div role="radiogroup" aria-label={buildingLabel} style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, padding: 4, borderRadius: 18, background: inkA(t, t.isLight ? 0.06 : 0.08), border: `1px solid ${inkA(t, 0.08)}` }}>
          <span aria-hidden="true" data-dc-thumb="" style={{ position: 'absolute', top: 4, bottom: 4, left: `calc(4px + ${idx} * (100% - 8px) / ${n})`, width: `calc((100% - 8px) / ${n})`, borderRadius: 14, background: t.isLight ? '#ffffff' : inkA(t, 0.16), boxShadow: t.isLight ? `0 6px 14px -6px ${inkA(t, 0.35)}` : '0 8px 18px -8px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.08)' }} />
          {kinds.map(([k, l]) => {
            const on = k === kind;
            return <button key={k} type="button" role="radio" aria-checked={on} onClick={() => onKind(k)} style={{ position: 'relative', minWidth: 0, minHeight: 44, padding: '0 4px', border: 0, background: 'transparent', cursor: 'pointer', fontFamily: SANS, fontSize: 14, fontWeight: on ? 700 : 550, color: on ? t.INK : t.INK70, overflowWrap: 'anywhere', lineHeight: 1.15 }}>{l}</button>;
          })}
        </div>
        <div style={{ marginTop: 8, fontFamily: SANS, fontSize: 13, lineHeight: 1.4, color: t.INK70 }}>{kindDesc}</div>
      </div>

      {/* The brief: a raised box that lights in the accent while it is written in. */}
      {prompt ? (
        <label data-dc-brief="" style={{ ...tile(t, 22), display: 'block', marginTop: 18, padding: '12px 14px 10px', cursor: 'text' }}>
          <span aria-hidden="true" style={{ display: 'inline-grid', placeItems: 'center', width: 26, height: 26, borderRadius: 99, background: inkA(t, 0.07), color: accent, fontSize: 13 }}>✦</span>
          <textarea value={prompt.value} onChange={(e) => prompt.onChange(e.target.value)} rows={3} placeholder={prompt.placeholder} aria-label={prompt.placeholder}
            style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, minHeight: 72, border: 0, background: 'transparent', color: t.INK, padding: 0, fontFamily: SANS, fontSize: 16, lineHeight: 1.5, resize: 'vertical', outline: 'none' }} />
        </label>
      ) : null}

      {/* Every choice, a compact chip (the picked one in ink); a group that takes the coach's own words ends
          with ＋ Custom, which opens a one-line field. A custom chip picks like any other and has its ×. */}
      {groups.map((g) => {
        const own = g.custom ? customsOf(g) : [];
        return (
          <div key={g.key} role="radiogroup" aria-label={g.label} data-dc-group={g.key} style={{ marginTop: 16 }}>
            <span style={label(t)}>{g.label}</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 0, margin: '0 -2px' }}>
              {g.options.map((o) => {
                const on = g.value === o;
                return <button key={String(o)} type="button" role="radio" aria-checked={on} data-dc-press="" data-dc-chip="" onClick={() => g.onPick(o)} style={target}><span style={face(on, g.round)}>{String(o)}</span></button>;
              })}
              {own.map((name) => {
                const on = g.value === name;
                return (
                  <span key={`c-${name}`} data-dc-custom={name} style={{ ...face(on), padding: 0, margin: '7px 0' }}>
                    <button type="button" role="radio" aria-checked={on} data-dc-press="" onClick={() => g.onPick(name)} style={{ ...target, margin: '-7px 0', padding: '0 2px 0 12px', justifyContent: 'flex-start', fontWeight: on ? 700 : 550 }}>{name}</button>
                    <button type="button" data-dc-remove="" aria-label={g.custom.removeAria(name)} onClick={() => removeCustom(g, name)} style={{ ...target, margin: '-7px -6px -7px -8px', fontSize: 15, lineHeight: 1, opacity: 0.75 }}>×</button>
                  </span>
                );
              })}
              {g.custom && adding === g.key ? (
                <form data-dc-custom-form="" onSubmit={(e) => { e.preventDefault(); addCustom(g); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
                  <input autoFocus value={entry} maxLength={BS_DRAFT_CUSTOM_MAX_LEN} onChange={(e) => setEntry(e.target.value)} placeholder={g.custom.placeholder} aria-label={g.custom.placeholder}
                    onKeyDown={(e) => { if (e.key === 'Escape') { setEntry(''); setAdding(null); } }}
                    onBlur={() => { if (!entry.trim()) setAdding(null); }}
                    style={{ width: 168, maxWidth: '100%', minWidth: 0, minHeight: 44, boxSizing: 'border-box', padding: '0 14px', borderRadius: 999, border: `1px solid ${accent}`, background: t.isLight ? '#ffffff' : inkA(t, 0.06), color: t.INK, fontFamily: SANS, fontSize: 16, outline: 'none' }} />
                  <button type="submit" data-dc-press="" data-dc-custom-add="" onMouseDown={(e) => e.preventDefault()} style={target}><span style={face(true)}>{g.custom.addWord}</span></button>
                </form>
              ) : g.custom && own.length < BS_DRAFT_CUSTOM_MAX ? (
                <button type="button" data-dc-press="" data-dc-custom-open="" onClick={() => { setEntry(''); setAdding(g.key); }} style={target}>
                  <span style={{ ...face(false), borderStyle: 'dashed', color: t.INK }}>{g.custom.addLabel}</span>
                </button>
              ) : null}
            </div>
          </div>
        );
      })}

      {/* Generate: the one button in the accent; while a draft is on its way it says so and waits. */}
      <div style={{ position: 'relative', marginTop: 28 }}>
        <button type="button" data-dc-generate="" data-dc-press="" onClick={generate.onClick} disabled={busy} aria-busy={busy || undefined}
          style={{ position: 'relative', width: '100%', minHeight: 58, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 18, border: 0, background: accent, color: accentInk, boxShadow: t.isLight ? `0 12px 24px -14px ${inkA(t, 0.55)}` : '0 14px 28px -14px rgba(0,0,0,0.95)', fontFamily: SANS, fontSize: 16.5, fontWeight: 750, letterSpacing: '-0.005em', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.8 : 1 }}>
          {busy ? <span aria-hidden="true" data-dc-spin="" style={{ width: 16, height: 16, borderRadius: 99, border: `2px solid ${hexA(accentInk, 0.25)}`, borderTopColor: accentInk, boxSizing: 'border-box' }} /> : null}
          <span>{generate.label}</span>
        </button>
      </div>
      <div style={{ marginTop: 14, textAlign: 'center', fontFamily: SANS, fontSize: 13, color: t.INK50 }}>{hint}</div>
    </div>
  );
}
