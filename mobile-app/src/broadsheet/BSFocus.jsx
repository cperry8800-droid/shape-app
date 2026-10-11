import React from 'react';
// ─── FOCUS LAYOUT — the shared pieces of Home · Train · Eat · Grocery ─────────
// Owner, 2026-10-11, off the C · Focus board: "impliment focus layout for home
// train eat and grocery with shop by aisle and shop by meal", in the app's own
// look ("same look at current home page, fonts etc") but the Focus order: the
// next stop on its own, a few numbers at a glance, the day as a line, and the
// rest of the page behind links.
//
// Every piece here is presentational: the screens own the data and hand in the
// words already translated, so this file renders no copy of its own.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP — the rule
// BSIntegrationsPage.jsx records. This file is a static import of the client
// module and evaluates before anything is published on window.

const hexA = (hex, a) => {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return hex;
  return `#${m[1]}${Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0')}`;
};

// A section head in the Home grammar: glyph + caps label, a quiet meta, one
// action on the right, then the 2px ink→accent rule.
export function BSFocusHead({ glyph, label, meta, actionLabel, onAction, color, tour }) {
  const t = window.useBS();
  const c = color || t.ACCENT;
  return (
    <div data-tour={tour || undefined}>
      <div style={{ padding: `${t.sectGap}px ${t.padX}px 8px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 9, minWidth: 0, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK, whiteSpace: 'nowrap' }}>{glyph ? `${glyph} ` : ''}{label}</span>
          {meta ? <span style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, whiteSpace: 'nowrap' }}>{meta}</span> : null}
        </span>
        {actionLabel && onAction ? (
          <button type="button" onClick={onAction} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', minHeight: 44, background: 'transparent', border: 0, padding: '0 2px', color: c, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' }}>{actionLabel}</button>
        ) : null}
      </div>
      <div style={{ padding: `0 ${t.padX}px 4px` }}>
        <div aria-hidden style={{ height: 2, background: `linear-gradient(90deg, ${t.INK}, ${c} 58%, transparent)`, marginBottom: 4 }} />
      </div>
    </div>
  );
}

// A display title with the accent period ("At a glance.") over the same rule.
export function BSFocusTitle({ title, meta, color }) {
  const t = window.useBS();
  const c = color || t.ACCENT;
  return (
    <div style={{ padding: `${t.sectGap}px ${t.padX}px 4px` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 22, letterSpacing: '-0.02em', color: t.INK }}>
          {title}<span style={{ color: c }}>.</span>
        </span>
        {meta ? <span style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, whiteSpace: 'nowrap' }}>{meta}</span> : null}
      </div>
      <div aria-hidden style={{ height: 2, marginTop: 8, background: `linear-gradient(90deg, ${t.INK}, ${c} 58%, transparent)` }} />
    </div>
  );
}

// The lead: one next thing, on a colour spine. The title steps down in size as
// it grows, so a long meal name wraps to two lines rather than to four.
export function BSFocusLead({ color, kicker, kickerRight, title, sub, tour, children }) {
  const t = window.useBS();
  const c = color || t.ACCENT;
  const raw = String(title == null ? '' : title).trim();
  const ends = /[?!…]$/.test(raw);
  const head = raw.replace(/\.\s*$/, '');
  const size = head.length <= 14 ? 40 : head.length <= 24 ? 32 : 26;
  return (
    <section data-tour={tour || undefined} style={{ position: 'relative', margin: `10px ${t.padX}px 0`, padding: '2px 0 16px 15px' }}>
      <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: c }} />
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ minWidth: 0, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: c }}>{kicker}</span>
        {kickerRight ? <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, whiteSpace: 'nowrap' }}>{kickerRight}</span> : null}
      </div>
      <h2 style={{ margin: '7px 0 0', fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: size, lineHeight: 1.06, letterSpacing: '-0.03em', color: t.INK, overflowWrap: 'anywhere' }}>
        {head}{ends ? null : <span style={{ color: c }}>.</span>}
      </h2>
      {sub ? <div style={{ marginTop: 7, fontFamily: t.MONO, fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', lineHeight: 1.5, color: t.INK50 }}>{sub}</div> : null}
      {children}
    </section>
  );
}

// From the stop before to the next stop, with a needle at now. The caller
// passes null for `pct` when the two stops are not both timed, and the bar is
// not drawn at all.
export function BSFocusArrival({ color, pct, nowLabel, fromLabel, toLabel, ariaLabel }) {
  const t = window.useBS();
  if (typeof pct !== 'number' || !isFinite(pct)) return null;
  const c = color || t.ACCENT;
  const p = Math.max(0, Math.min(100, pct));
  // The NOW label is centred on its needle until that would push it past an
  // edge; then it pins to that edge.
  const nowAlign = p < 18 ? { left: 0 } : p > 82 ? { right: 0 } : { left: `${p}%`, transform: 'translateX(-50%)' };
  return (
    <div role="img" aria-label={ariaLabel} style={{ position: 'relative', height: 30, marginTop: 30, marginRight: 2 }}>
      <span aria-hidden style={{ position: 'absolute', top: -21, ...nowAlign, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: c, whiteSpace: 'nowrap' }}>{nowLabel}</span>
      <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 2, background: t.HAIR }} />
      <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, height: 2, width: `${p}%`, background: `linear-gradient(90deg, ${hexA(t.INK, 0.7)}, ${c})` }} />
      <span aria-hidden style={{ position: 'absolute', left: `${p}%`, top: -7, width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `7px solid ${c}`, transform: 'translateX(-5px)' }} />
      <span aria-hidden style={{ position: 'absolute', left: 0, top: 10, maxWidth: '48%', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fromLabel}</span>
      <span aria-hidden style={{ position: 'absolute', right: 0, top: 10, maxWidth: '48%', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right' }}>{toLabel}</span>
    </div>
  );
}

// "Starts in 4h 50m": a quiet label and a light display figure.
export function BSFocusCountdown({ label, value }) {
  const t = window.useBS();
  if (!value) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 14 }}>
      <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50 }}>{label}</span>
      <span style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 28, letterSpacing: '-0.03em', color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

// One filled action (the Train "Start session →" button) and one text action.
export function BSFocusActions({ primary, secondary, color }) {
  const t = window.useBS();
  const c = color || t.ACCENT;
  if (!primary && !secondary) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 20px', marginTop: 16 }}>
      {primary ? (
        <button type="button" onClick={primary.onClick} aria-label={primary.ariaLabel || undefined} style={{ minHeight: 48, padding: '10px 16px', borderRadius: 5, border: 0, background: c, color: t.isLight ? '#ffffff' : '#031f1c', cursor: 'pointer', fontFamily: t.MONO, fontSize: 11, fontWeight: 800 }}>{primary.label}</button>
      ) : null}
      {secondary ? (
        <button type="button" onClick={secondary.onClick} style={{ minHeight: 44, padding: '0 2px', background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: c }}>{secondary.label}</button>
      ) : null}
    </div>
  );
}

// The day as a line: time · a stop on the rail · what · a note. `nowIndex` is
// the row the NOW marker sits above (rows.length = after the last; -1 = none).
// Rows are { key, time, title, sub, note, state: 'done' | 'next' | '', onOpen,
// ariaLabel, extra }.
export function BSFocusLine({ rows, nowIndex = -1, nowLabel, color }) {
  const t = window.useBS();
  const c = color || t.ACCENT;
  const list = rows || [];
  if (!list.length) return null;
  const COL = '68px 22px minmax(0, 1fr) auto';
  const nowMark = nowLabel ? (
    <div key="focus-now" aria-label={nowLabel} style={{ display: 'grid', gridTemplateColumns: COL, alignItems: 'center', minHeight: 30 }}>
      <span aria-hidden />
      <span aria-hidden style={{ justifySelf: 'center', position: 'relative', zIndex: 1, width: 8, height: 8, borderRadius: '50%', background: c, boxShadow: `0 0 8px ${c}` }} />
      <span aria-hidden style={{ gridColumn: '3 / 5', display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 10, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: c, whiteSpace: 'nowrap' }}>
        {nowLabel}<span style={{ flex: 1, height: 1, background: hexA(c, 0.35) }} />
      </span>
    </div>
  ) : null;
  return (
    <div style={{ position: 'relative', margin: `6px ${t.padX}px 0` }}>
      <span aria-hidden style={{ position: 'absolute', left: 78, top: 22, bottom: 22, width: 2, background: `linear-gradient(180deg, ${c}, ${hexA(c, 0.15)})` }} />
      {list.map((r, i) => {
        const done = r.state === 'done';
        const next = r.state === 'next';
        const open = typeof r.onOpen === 'function';
        const body = (
          <>
            <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', color: next ? c : t.INK50, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{r.time}</span>
            <span aria-hidden style={{ justifySelf: 'center', position: 'relative', zIndex: 1, width: 10, height: 10, borderRadius: 2, boxSizing: 'border-box', border: `2px solid ${done || next ? c : t.RULE}`, background: done ? c : t.PAPER, boxShadow: next ? `0 0 0 3px ${hexA(c, 0.22)}` : 'none' }} />
            <span style={{ minWidth: 0, paddingLeft: 10 }}>
              <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', color: done ? t.INK50 : t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>
              {r.sub ? <span style={{ display: 'block', marginTop: 3, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.04em', color: next ? c : t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sub}</span> : null}
              {r.extra || null}
            </span>
            <span style={{ paddingLeft: 8, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: next || done ? c : t.INK50, whiteSpace: 'nowrap' }}>{r.note}</span>
          </>
        );
        const rowStyle = { display: 'grid', gridTemplateColumns: COL, alignItems: 'center', width: '100%', minHeight: 52, padding: '8px 0', boxSizing: 'border-box', borderTop: i === 0 ? 0 : `1px solid ${t.HAIR}`, background: 'transparent', textAlign: 'left', font: 'inherit', color: 'inherit' };
        return (
          <React.Fragment key={r.key}>
            {i === nowIndex ? nowMark : null}
            {open
              ? <button type="button" onClick={r.onOpen} aria-label={r.ariaLabel || undefined} style={{ ...rowStyle, border: 0, borderTop: rowStyle.borderTop, cursor: 'pointer' }}>{body}</button>
              : <div aria-label={r.ariaLabel || undefined} style={rowStyle}>{body}</div>}
          </React.Fragment>
        );
      })}
      {nowIndex === list.length ? nowMark : null}
    </div>
  );
}

// A link out of the page, in the Find-a-coach grammar: a colour spine, a glyph,
// the name, a short tag, a dotted leader and an arrow.
// `data-bsck-door` passes through: a link into cooking carries the token the
// cook screen hands focus back to (cookFocus.mjs).
export function BSFocusLink({ color, glyph, label, tag, sub, onOpen, tour, ariaLabel, 'data-bsck-door': door }) {
  const t = window.useBS();
  const c = color || t.ACCENT;
  const head = (
    <>
      <span style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 13.5, color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{label}</span>
      {tag ? <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 7.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: c, whiteSpace: 'nowrap' }}>{tag}</span> : null}
    </>
  );
  return (
    <button type="button" onClick={onOpen} data-tour={tour || undefined} data-bsck-door={door || undefined} aria-label={ariaLabel || [label, tag, sub].filter(Boolean).join(', ')}
      style={{ display: 'flex', alignItems: 'center', gap: 9, margin: `8px ${t.padX}px 0`, width: `calc(100% - ${t.padX * 2}px)`, boxSizing: 'border-box', minHeight: 48, padding: '4px 4px 4px 10px', background: 'transparent', border: 0, borderLeft: `3px solid ${c}`, borderTop: `1px solid ${t.HAIR}`, borderBottom: `1px solid ${t.HAIR}`, cursor: 'pointer', textAlign: 'left' }}>
      <span aria-hidden style={{ flexShrink: 0, width: 16, textAlign: 'center', color: c, fontSize: 13, lineHeight: 1 }}>{glyph}</span>
      {sub ? (
        // With a second line the row reads label · tag over a quiet meta line,
        // and the leader gives way to it.
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 0' }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 9, minWidth: 0 }}>{head}</span>
          <span style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.06em', color: t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>
        </span>
      ) : (
        <>
          {head}
          <span aria-hidden style={{ flex: 1, borderBottom: `1.5px dotted ${hexA(t.INK, 0.22)}`, transform: 'translateY(-2px)', minWidth: 12 }} />
        </>
      )}
      <span aria-hidden style={{ flexShrink: 0, color: c, fontSize: 14, fontWeight: 700 }}>→</span>
    </button>
  );
}

// A row of stops on a rule with a needle over the chosen one — the week strip's
// grammar, for any number of stops (the grocery aisles). Each stop is { key,
// top, value, pct, on, onSelect, ariaLabel }. `flush` drops the side padding
// for a host that already pads its column.
export function BSFocusRoute({ stops, flush = false }) {
  const t = window.useBS();
  const list = stops || [];
  if (!list.length) return null;
  const n = list.length;
  const on = Math.max(0, list.findIndex((s) => s.on));
  return (
    <div style={{ padding: flush ? '14px 0 4px' : `14px ${t.padX}px 4px` }}>
      <div aria-hidden style={{ position: 'relative', height: 2, margin: '5px 2px 0', background: `linear-gradient(90deg, ${t.INK}, ${t.ACCENT} 58%, transparent)` }}>
        {list.map((s, i) => <span key={s.key} style={{ position: 'absolute', left: `${((i + 0.5) * 100) / n}%`, top: -3, width: 1.5, height: 8, background: t.RULE }} />)}
        <span style={{ position: 'absolute', left: `${((on + 0.5) * 100) / n}%`, top: -7, width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `7px solid ${t.ACCENT}`, transform: 'translateX(-5px)' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, marginTop: 6 }}>
        {list.map((s) => (
          <button type="button" key={s.key} onClick={s.onSelect} aria-pressed={!!s.on} aria-label={s.ariaLabel || undefined} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minHeight: 56, minWidth: 0, padding: '4px 0', background: 'transparent', border: 0, cursor: 'pointer' }}>
            <span style={{ maxWidth: '100%', fontFamily: t.MONO, fontSize: 7.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: s.on ? t.ACCENT : t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.top}</span>
            <span style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 17, lineHeight: 1.15, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', color: s.on ? t.INK : t.INK50 }}>{s.value}</span>
            <span aria-hidden style={{ width: 28, height: 2, marginTop: 2, borderRadius: 1, background: t.HAIR, overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${Math.max(0, Math.min(100, s.pct || 0))}%`, background: t.ACCENT }} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Shop by: aisle | meal — a two-way switch.
export function BSShopBySwitch({ value, onChange, label, aisleLabel, mealLabel }) {
  const t = window.useBS();
  const opt = (key, text, icon) => {
    const on = value === key;
    return (
      <button type="button" key={key} onClick={() => onChange(key)} aria-pressed={on}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 40, borderRadius: 4, border: 0, background: on ? hexA(t.ACCENT, 0.12) : 'transparent', boxShadow: on ? `inset 0 0 0 1px ${t.ACCENT}` : 'none', color: on ? t.ACCENT : t.INK70, fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>
        {icon}{text}
      </button>
    );
  };
  const aisleIcon = <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 5v14M20 5v14M4 9h16M4 14h16M4 19h16" /></svg>;
  const mealIcon = <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 12h17a8.5 8.5 0 0 1-17 0z" /><path d="M9 8.5c0-1.2 1-1.6 1-3M14 8.5c0-1.2 1-1.6 1-3" /></svg>;
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
      <span aria-hidden style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: 3, border: `1px solid ${t.RULE}`, borderRadius: 6 }}>
        {opt('aisle', aisleLabel, aisleIcon)}
        {opt('meal', mealLabel, mealIcon)}
      </span>
    </div>
  );
}
