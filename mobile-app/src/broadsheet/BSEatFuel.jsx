import React from 'react';
import { BSFocusHead } from './BSFocus.jsx';
// ─── EAT · FUEL LEFT TODAY ───────────────────────────────────────────────────────────────────────
// What is left of the day's target, its bar, then protein, carbs and fat side by side, each with its
// own bar; a macro opens the day's breakdown. Eat draws it above the next meal (owner, 2026-10-22:
// "move this above lunch on eat page and condense a little more"), so the day's budget reads before
// what to eat next. Eat passes the figures in, coach-set targets already applied (Adjust plan →
// Apply wins). Window globals are read at call time and the module never imports back into the
// client module (the BSIntegrationsPage / BSLeaderboard pattern).

const { useState, useEffect } = React;

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

// A colour at an alpha, for a tint behind it; a colour that isn't a 6-digit hex gets the hairline.
const bsEfTint = (c, alpha, fallback) => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? `${c}${alpha}` : fallback);

// `macros` are [{ k, l, v, g, c }]: key, label, eaten, target, colour. The look follows Home's morning
// panel (owner, 2026-10-22: "change the look of this", of the macro rows): one rounded panel, a rounded
// kcal bar, and each macro a tinted tile with its own rounded bar.
export function BSEatFuel({ calLeft, calTarget, calNow, calPct, macros = [], onOpen }) {
  const t = window.useBS();
  const tr = useShapeTr();
  return (
    <>
      <BSFocusHead glyph="◐" label={tr('nutrition:eat.fuelLeft', { defaultValue: 'Fuel left today' })}
        meta={tr('nutrition:eat.kcalPlan', { defaultValue: '{kcal} kcal plan', kcal: calTarget.toLocaleString() })} />
      <section data-eat-fuel="" style={{ margin: `8px ${t.padX}px 0`, padding: '14px 14px 12px', borderRadius: 16, background: t.PAPER2 || t.PAPER, border: t.isLight ? 0 : `1px solid ${t.HAIR}`, boxShadow: t.isLight ? '0 10px 24px -18px rgba(15,14,12,0.45)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: t.DISPLAY, fontWeight: 600, fontSize: 34, lineHeight: 0.95, letterSpacing: '-0.03em', color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{calLeft.toLocaleString()}</span>
          <span style={{ fontFamily: t.BODY, fontSize: 13, color: t.INK70 }}>{tr('nutrition:eat.kcalLeftWord', { defaultValue: 'kcal left' })}</span>
          <span style={{ marginLeft: 'auto', fontFamily: t.BODY, fontSize: 12, color: t.INK50, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{tr('nutrition:eat.eatenPct', { defaultValue: '{eaten} eaten · {pct}%', eaten: calNow.toLocaleString(), pct: calPct })}</span>
        </div>
        <div aria-hidden style={{ marginTop: 10, height: 8, borderRadius: 999, background: t.HAIR, overflow: 'hidden' }}>
          <div style={{ width: `${calPct}%`, height: '100%', borderRadius: 999, background: t.ACCENT }} />
        </div>
        {/* One row of three tiles, not a 44 px row each. A long language's "{g}g left" wraps in its tile. */}
        <div data-eat-macros="" style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {macros.map((m) => {
            const left = tr('nutrition:eat.gramsLeft', { defaultValue: '{g}g left', g: Math.max(0, m.g - m.v) });
            const pct = m.g > 0 ? Math.max(0, Math.min(100, Math.round((m.v / m.g) * 100))) : 0;
            return (
              <button key={m.k} type="button" onClick={onOpen} aria-label={`${m.l} ${left} ${m.v} / ${m.g}`}
                style={{ minWidth: 0, minHeight: 44, border: 0, borderRadius: 12, background: bsEfTint(m.c, '14', t.HAIR), padding: '9px 10px 10px', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
                <span style={{ display: 'block', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: m.c, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.l}</span>
                <span style={{ display: 'block', marginTop: 4, fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600, lineHeight: 1.1, letterSpacing: '-0.01em', color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{left}</span>
                <span aria-hidden style={{ display: 'block', marginTop: 7, height: 5, borderRadius: 999, background: bsEfTint(m.c, '33', t.HAIR), overflow: 'hidden' }}>
                  <span style={{ display: 'block', width: `${pct}%`, height: '100%', borderRadius: 999, background: m.c }} />
                </span>
                <span style={{ display: 'block', marginTop: 5, fontFamily: t.BODY, fontSize: 11.5, color: t.INK50, fontVariantNumeric: 'tabular-nums' }}>{m.v} / {m.g}</span>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}
