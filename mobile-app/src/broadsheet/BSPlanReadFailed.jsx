import React from 'react';
// ─── A PLAN READ THAT FAILED ──────────────────────────────────────────────────────────────────────
// /api/client/plan failed, or answered without its training or meals part (`read: false`;
// services/planRead.mjs). Train used to offer the Build door and Eat said "No meals planned", so a
// member whose coach's plan did not load was told they had none. This says it could not load, and
// Try again reads again. It sits on the page's spine in the role's colour, as Your coach is on it does.
//
// Window globals are read at call time and the module never imports back into the client module
// (the BSIntegrationsPage / BSLeaderboard pattern).

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

// part: 'training' | 'meals'. onRetry reads the plan again; busy while that read is out.
export function BSPlanReadFailed({ part, onRetry, busy = false }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const c = part === 'meals' ? '#a07a2e' : '#c0533b';
  return (
    <div data-plan-read-failed={part} role="status" style={{ margin: `10px ${t.padX}px 0`, padding: '4px 0 4px 12px', borderLeft: `3px solid ${c}` }}>
      <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: c, fontWeight: 700 }}>
        {tr('common:planRead.eyebrow', { defaultValue: 'Not loaded' })}
      </div>
      <div style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 22, letterSpacing: '-0.02em', color: t.INK, margin: '5px 0 0', lineHeight: 1.1 }}>
        {part === 'meals'
          ? tr('common:planRead.meals', { defaultValue: 'Couldn’t load your meal plan' })
          : tr('common:planRead.training', { defaultValue: 'Couldn’t load your training' })}
      </div>
      <div style={{ marginTop: 7, fontFamily: t.DISPLAY, fontSize: 14, color: t.INK70, lineHeight: 1.5 }}>
        {tr('common:planRead.body', { defaultValue: 'If you have a plan, it’s still there. Check your connection and try again.' })}
      </div>
      <button type="button" onClick={onRetry} disabled={busy} aria-busy={busy || undefined}
        style={{ marginTop: 12, minHeight: 44, padding: '0 16px', background: 'transparent', border: `1.5px solid ${t.INK}`, borderRadius: 0, color: t.INK, fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
        {busy ? tr('common:planRead.retrying', { defaultValue: 'Loading…' }) : `${tr('common:planRead.retry', { defaultValue: 'Try again' })} ↻`}
      </button>
    </div>
  );
}
