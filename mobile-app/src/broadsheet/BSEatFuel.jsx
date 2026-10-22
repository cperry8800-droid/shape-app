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

// `macros` are [{ k, l, v, g, c }]: key, label, eaten, target, colour.
export function BSEatFuel({ calLeft, calTarget, calNow, calPct, macros = [], onOpen }) {
  const t = window.useBS();
  const tr = useShapeTr();
  return (
    <>
      <BSFocusHead glyph="◐" label={tr('nutrition:eat.fuelLeft', { defaultValue: 'Fuel left today' })}
        meta={tr('nutrition:eat.kcalPlan', { defaultValue: '{kcal} kcal plan', kcal: calTarget.toLocaleString() })} />
      <div style={{ padding: `6px ${t.padX}px 0` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 40, lineHeight: 0.9, letterSpacing: '-0.045em', color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{calLeft.toLocaleString()}</span>
          <span style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>{tr('nutrition:eat.kcalLeftWord', { defaultValue: 'kcal left' })}</span>
          <span style={{ marginLeft: 'auto', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.06em', color: t.INK50, whiteSpace: 'nowrap' }}>{tr('nutrition:eat.eatenPct', { defaultValue: '{eaten} eaten · {pct}%', eaten: calNow.toLocaleString(), pct: calPct })}</span>
        </div>
        <div aria-hidden style={{ marginTop: 8, height: 3, background: t.HAIR }}>
          <div style={{ width: `${calPct}%`, height: '100%', background: t.ACCENT }} />
        </div>
        {/* One row of three, not a 44 px row each. A long language's "{g}g left" wraps under its label. */}
        <div data-eat-macros="" style={{ marginTop: 4, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: 14 }}>
          {macros.map((m) => {
            const left = tr('nutrition:eat.gramsLeft', { defaultValue: '{g}g left', g: Math.max(0, m.g - m.v) });
            const pct = m.g > 0 ? Math.max(0, Math.min(100, Math.round((m.v / m.g) * 100))) : 0;
            return (
              <button key={m.k} type="button" onClick={onOpen} aria-label={`${m.l} ${left} ${m.v} / ${m.g}`}
                style={{ minWidth: 0, minHeight: 44, border: 0, background: 'transparent', padding: '6px 0 4px', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
                <span style={{ display: 'block', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.l}</span>
                <span style={{ display: 'block', marginTop: 3, fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 800, lineHeight: 1.1, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{left}</span>
                <span style={{ display: 'block', marginTop: 2, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, color: t.INK50, fontVariantNumeric: 'tabular-nums' }}>{m.v} / {m.g}</span>
                <span aria-hidden style={{ display: 'block', marginTop: 5, height: 2, background: t.HAIR }}>
                  <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: m.c }} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
