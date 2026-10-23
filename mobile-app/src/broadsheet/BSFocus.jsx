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
// action on the right, then the 2px ink→accent rule. `top` is the gap above it
// (a section's, unless the head sits right under something, as Eat's Fuel left does).
export function BSFocusHead({ glyph, label, meta, actionLabel, onAction, color, tour, top }) {
  const t = window.useBS();
  const c = color || t.ACCENT;
  return (
    <div data-tour={tour || undefined}>
      <div style={{ padding: `${top ?? t.sectGap}px ${t.padX}px 8px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
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

// A display title with the accent period ("At a glance.") over the same rule,
// with an optional accent kicker above it ("Today") and a quiet meta on the
// right — the design board's section title (light 26px).
export function BSFocusTitle({ title, kicker, meta, color, right }) {
  const t = window.useBS();
  const c = color || t.ACCENT;
  return (
    <div style={{ padding: `${t.sectGap + 6}px ${t.padX}px 4px` }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          {kicker ? <span style={{ display: 'block', fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: c }}>{kicker}</span> : null}
          <h2 style={{ margin: kicker ? '3px 0 0' : 0, fontFamily: t.DISPLAY, fontWeight: 300, fontSize: 26, lineHeight: '32px', letterSpacing: '-0.02em', color: t.INK, whiteSpace: 'nowrap' }}>
            {title}<span style={{ color: c }}>.</span>
          </h2>
        </div>
        {right || (meta ? <span style={{ paddingBottom: 8, fontFamily: t.MONO, fontSize: 9, color: t.INK50, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, whiteSpace: 'nowrap' }}>{meta}</span> : null)}
      </div>
      <div aria-hidden style={{ height: 2, marginTop: 12, background: `linear-gradient(90deg, ${t.INK}, ${c} 62%, transparent)` }} />
    </div>
  );
}

// A small Day · Week · Month switch for a section title's right side. Options
// are { key, label }; the chosen one is accent with an underline.
export function BSFocusPeriod({ value, onChange, options, ariaLabel, color }) {
  const t = window.useBS();
  const c = color || t.ACCENT;
  return (
    <div role="group" aria-label={ariaLabel} style={{ display: 'flex', alignItems: 'flex-end', gap: 12, paddingBottom: 2 }}>
      {(options || []).map((o) => {
        const on = o.key === value;
        return (
          <button key={o.key} type="button" aria-pressed={on} onClick={() => onChange(o.key)}
            style={{ minHeight: 36, padding: '0 1px', background: 'transparent', border: 0, borderBottom: `2px solid ${on ? c : 'transparent'}`, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: on ? c : t.INK50, whiteSpace: 'nowrap' }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// A dotted leader row of the design board's "At a glance": label · leader ·
// a light figure (with a small unit) · a quiet note, and a bar under the row
// for how far along it is. A row with `onOpen` is a button.
export function BSFocusLeader({ label, value, unit, note, pct, color, onOpen, ariaLabel, first }) {
  const t = window.useBS();
  const c = color || t.ACCENT;
  const p = typeof pct === 'number' && isFinite(pct) ? Math.max(0, Math.min(100, pct)) : null;
  const body = (
    <>
      <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK70, whiteSpace: 'nowrap' }}>{label}</span>
      <span aria-hidden style={{ flex: 1, minWidth: 14, borderBottom: `1.5px dotted ${hexA(t.INK, 0.22)}`, transform: 'translateY(-2px)' }} />
      <span style={{ fontFamily: t.DISPLAY, fontWeight: 300, fontSize: 21, letterSpacing: '-0.02em', color: t.INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {value}{unit ? <small style={{ fontSize: 13, color: t.INK50, marginLeft: 2 }}>{unit}</small> : null}
      </span>
      {note ? <span style={{ minWidth: 58, textAlign: 'right', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.04em', color: t.INK50, whiteSpace: 'nowrap' }}>{note}</span> : null}
      {p != null ? <span aria-hidden style={{ position: 'absolute', left: t.padX, bottom: -1, height: 2, width: `calc((100% - ${t.padX * 2}px) * ${p / 100})`, background: c }} /> : null}
    </>
  );
  const style = { position: 'relative', display: 'flex', alignItems: 'center', gap: 10, width: '100%', boxSizing: 'border-box', minHeight: 54, padding: `0 ${t.padX}px`, border: 0, borderTop: first ? 0 : `1px solid ${t.HAIR}`, background: 'transparent', textAlign: 'left', font: 'inherit', color: 'inherit' };
  return typeof onOpen === 'function'
    ? <button type="button" onClick={onOpen} aria-label={ariaLabel || [label, value, unit, note].filter(Boolean).join(' ')} style={{ ...style, cursor: 'pointer' }}>{body}</button>
    : <div aria-label={ariaLabel || undefined} style={style}>{body}</div>;
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

// The day as a line, the design board's grammar: time · a stop on the rail ·
// what · a note. `nowIndex` is the row the NOW marker sits above (rows.length =
// after the last; -1 = none); `nowTime` is shown in its time column. Rows are
// { key, time, title, sub, note, state: 'done' | 'next' | '', color, onOpen,
// ariaLabel, extra, below } — a row's own `color` (a workout's rust) tints its
// time, stop and note; `below` renders under the row (the meal's shop list).
export function BSFocusLine({ rows, nowIndex = -1, nowLabel, nowTime, color }) {
  const t = window.useBS();
  const c = color || t.ACCENT;
  const list = rows || [];
  if (!list.length) return null;
  const COL = '62px 24px minmax(0, 1fr) auto';
  // The rail runs down the middle of the stop column (62 + 24/2 - 1).
  const RAIL = 73;
  const doneCount = list.filter((r) => r.state === 'done').length;
  const nowMark = nowLabel ? (
    <div key="focus-now" aria-label={nowLabel} style={{ display: 'grid', gridTemplateColumns: COL, alignItems: 'center', minHeight: 30, borderTop: `1px solid ${t.HAIR}` }}>
      <span aria-hidden style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 700, color: c, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{nowTime || ''}</span>
      <span aria-hidden style={{ justifySelf: 'center', position: 'relative', zIndex: 1, width: 8, height: 8, borderRadius: '50%', background: c, boxShadow: `0 0 8px ${c}` }} />
      <span aria-hidden style={{ gridColumn: '3 / 5', display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 12, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: c, whiteSpace: 'nowrap' }}>
        {nowLabel}<span style={{ flex: 1, height: 1, background: hexA(c, 0.35) }} />
      </span>
    </div>
  ) : null;
  // The rail is accent down to where NOW sits (or the last done stop), quiet after.
  const lit = nowIndex >= 0 ? Math.min(nowIndex, list.length) : doneCount;
  const litPct = Math.round((lit / list.length) * 100);
  return (
    <div style={{ position: 'relative', margin: `10px ${t.padX}px 0` }}>
      <span aria-hidden style={{ position: 'absolute', left: RAIL, top: 24, bottom: 24, width: 2, background: `linear-gradient(180deg, ${c} 0 ${litPct}%, ${hexA(t.INK, 0.16)} ${litPct}% 100%)` }} />
      {list.map((r, i) => {
        const done = r.state === 'done';
        const next = r.state === 'next';
        const rc = r.color || null;
        const open = typeof r.onOpen === 'function';
        const body = (
          <>
            <span style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', color: next ? c : rc || t.INK70, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{r.time}</span>
            <span aria-hidden style={{ justifySelf: 'center', position: 'relative', zIndex: 1, width: 10, height: 10, borderRadius: 2, boxSizing: 'border-box', border: `2px solid ${done || next ? c : rc || hexA(t.INK, 0.45)}`, background: done ? c : t.PAPER, boxShadow: next ? `0 0 0 3px ${hexA(c, 0.22)}` : 'none' }} />
            <span style={{ minWidth: 0, paddingLeft: 12 }}>
              <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 400, lineHeight: 1.2, letterSpacing: '-0.01em', color: done ? t.INK50 : t.INK, overflowWrap: 'anywhere' }}>{r.title}</span>
              {r.sub ? <span style={{ display: 'block', marginTop: 3, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.04em', color: next ? c : t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sub}</span> : null}
              {r.extra || null}
            </span>
            <span style={{ paddingLeft: 8, fontFamily: t.MONO, fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: next ? c : rc || t.INK50, whiteSpace: 'nowrap' }}>{r.note}</span>
          </>
        );
        const rowStyle = { display: 'grid', gridTemplateColumns: COL, alignItems: 'center', width: '100%', minHeight: 50, padding: '6px 0', boxSizing: 'border-box', borderTop: i === 0 ? 0 : `1px solid ${t.HAIR}`, background: 'transparent', textAlign: 'left', font: 'inherit', color: 'inherit' };
        return (
          <React.Fragment key={r.key}>
            {i === nowIndex ? nowMark : null}
            {open
              ? <button type="button" onClick={r.onOpen} aria-label={r.ariaLabel || undefined} style={{ ...rowStyle, border: 0, borderTop: rowStyle.borderTop, cursor: 'pointer' }}>{body}</button>
              : <div aria-label={r.ariaLabel || undefined} style={rowStyle}>{body}</div>}
            {/* `below` sits under the row, in the title column, outside the row's
                own button (a control inside a button is not a control). */}
            {r.below ? <div style={{ margin: '-4px 0 0', paddingLeft: 62 + 24 + 12, paddingBottom: 10 }}>{r.below}</div> : null}
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

// The shop list on a meal (Eat, option A · On the line — owner, 2026-10-11:
// "can you put the shop list with each meal"). At rest, one tag under the
// meal: a basket, a pip per ingredient (filled when got) and "4 to get"; "All
// got ✓" when nothing is left; "Skipped" when the meal is skipped. Tapped, the
// meal's ingredients open in place: tick boxes, what is already got (folded),
// Skip / Undo, and a door to the whole list by meal.
// `items` are { key, name, qty, also, got, onTick }. Every word arrives
// translated in `labels`.
export function BSFocusMealShop({ open, onToggle, items, skipped, onSkip, onOpenList, labels, color, gold }) {
  const t = window.useBS();
  const g = color || t.GREEN;
  const au = gold || (t.isLight ? '#a07a2e' : '#d8b25a');
  const [gotOpen, setGotOpen] = React.useState(false);
  const list = items || [];
  if (!list.length) return null;
  const toGet = list.filter((x) => !x.got);
  const got = list.filter((x) => x.got);
  const allGot = !skipped && toGet.length === 0;
  const tone = skipped ? au : allGot ? t.INK50 : g;
  const status = skipped ? labels.skipped : allGot ? labels.allGot : labels.toGet;
  const box = (on) => (
    <span aria-hidden style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 4, boxSizing: 'border-box', border: on ? 0 : `1.5px solid ${hexA(t.INK, 0.4)}`, background: on ? hexA(t.ACCENT, 0.8) : 'transparent', color: t.PAPER, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>{on ? '✓' : ''}</span>
  );
  const itemRow = (x) => (
    <button key={x.key} type="button" role="checkbox" aria-checked={x.got} onClick={x.onTick}
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, padding: '4px 0', background: 'transparent', border: 0, borderBottom: `1px solid ${t.HAIR}`, cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' }}>
      {box(x.got)}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 15, lineHeight: '19px', color: x.got ? t.INK50 : t.INK, textDecoration: x.got ? 'line-through' : 'none', overflowWrap: 'anywhere' }}>{x.name}</span>
        {x.qty || x.also ? (
          <span style={{ display: 'block', marginTop: 2, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.04em', color: t.INK50 }}>
            {x.qty}{x.qty && x.also ? ' · ' : ''}{x.also ? <span style={{ color: g }}>{x.also}</span> : null}
          </span>
        ) : null}
      </span>
    </button>
  );
  const textBtn = (label, onClick, c) => (
    <button type="button" onClick={onClick} style={{ flexShrink: 0, minHeight: 36, padding: 0, background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: c || t.ACCENT }}>{label}</button>
  );
  return (
    <div>
      {/* The tag reads like the menu's other stamps (SWAPPED, Prepped ✓): small
          mono caps in the shop colour, no box (owner, 2026-10-11: "make this
          smaller and fit the design look better"). The tap area stays 32px tall. */}
      <button type="button" aria-expanded={!!open} onClick={onToggle} aria-label={labels.tagAria}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 32, margin: '-6px 0 -6px', padding: 0, background: 'transparent', border: 0, cursor: 'pointer', color: tone, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
        <svg aria-hidden width="11" height="10" viewBox="0 0 13 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M1 4h11l-1.4 6.5H2.4z" /><path d="M4 4l2.5-3M9 4L6.5 1" /></svg>
        <span>{status}</span>
        <span aria-hidden style={{ fontSize: 8, opacity: 0.8 }}>{open ? '▴' : '▾'}</span>
      </button>
      {open ? (
        <div style={{ margin: '10px 0 2px', paddingLeft: 12, borderLeft: `2px solid ${hexA(skipped ? au : g, 0.55)}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 34, borderBottom: `1px solid ${t.RULE}` }}>
            <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, whiteSpace: 'nowrap' }}>{skipped ? labels.skippedHead : labels.head}</span>
            {textBtn(skipped ? labels.undo : labels.skip, onSkip, skipped ? t.ACCENT : au)}
          </div>
          {skipped ? (
            <div style={{ margin: '10px 0 8px', fontFamily: t.DISPLAY, fontSize: 14, lineHeight: '20px', color: t.INK70 }}>{labels.skippedNote}</div>
          ) : (
            <>
              {toGet.map(itemRow)}
              {got.length ? (
                <>
                  <button type="button" aria-expanded={gotOpen} onClick={() => setGotOpen((v) => !v)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 42, padding: 0, background: 'transparent', border: 0, borderBottom: `1px solid ${t.HAIR}`, cursor: 'pointer', textAlign: 'left', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>
                    <span aria-hidden style={{ flexShrink: 0, width: 16, height: 16, borderRadius: 4, background: hexA(t.ACCENT, 0.75), color: t.PAPER, fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>
                    <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{labels.gotLine}</span>
                    <b style={{ flex: 1, minWidth: 0, fontWeight: 600, color: t.INK70, textTransform: 'none', letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{got.map((x) => x.name).join(', ')}</b>
                    <span aria-hidden style={{ flexShrink: 0, fontSize: 9 }}>{gotOpen ? '▴' : '▾'}</span>
                  </button>
                  {gotOpen ? got.map(itemRow) : null}
                </>
              ) : null}
            </>
          )}
          {onOpenList ? (
            <button type="button" onClick={onOpenList}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 42, padding: 0, background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.ACCENT, textAlign: 'left' }}>
              <span style={{ flexShrink: 0 }}>{labels.openList}</span>
              <span aria-hidden style={{ flex: 1, minWidth: 12, borderBottom: `1.5px dotted ${hexA(t.INK, 0.22)}`, transform: 'translateY(-2px)' }} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
