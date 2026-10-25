import React from 'react';
import { BSFocusHead } from './BSFocus.jsx';
// ─── EAT · FUEL LEFT TODAY ───────────────────────────────────────────────────────────────────────
// What is left of the day's target, its bar, then protein, carbs and fat side by side, each with its
// own bar; each macro opens its own page (BSEatMacroPage, below). Eat draws it above the next meal
// (owner, 2026-10-22: "move this above lunch on eat page and condense a little more"), so the day's
// budget reads before what to eat next. Eat passes the figures in, coach-set targets already applied
// (Adjust plan → Apply wins). Window globals are read at call time and the module never imports
// back into the client module (the BSIntegrationsPage / BSLeaderboard pattern).

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
// ⚠ `unread`: the meal plan read hasn't answered or failed. What was eaten comes from the plan, so it
// and what is left read "—", not 0; a target reads only when Eat has one from elsewhere (a coach's
// Adjust: `calTargetKnown`, and a macro's `gKnown`, which keep a coach's 0 g; Codex P2 on #2453), and the
// tiles open nothing, since their pages would show the same zeros.
export function BSEatFuel({ calLeft, calTarget, calNow, calPct, macros = [], onOpen, unread = false, calTargetKnown = false }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const dash = '—';
  return (
    <>
      {/* Right under the week strip, so a tighter gap than a section's (owner, 2026-10-23: "reduce the
          spacing here"). */}
      <BSFocusHead glyph="◐" top={10} label={tr('nutrition:eat.fuelLeft', { defaultValue: 'Fuel left today' })}
        meta={unread && !calTargetKnown ? dash : tr('nutrition:eat.kcalPlan', { defaultValue: '{kcal} kcal plan', kcal: calTarget.toLocaleString() })} />
      <section data-eat-fuel="" data-eat-fuel-unread={unread ? '' : undefined} style={{ margin: `8px ${t.padX}px 0`, padding: '14px 14px 12px', borderRadius: 16, background: t.PAPER2 || t.PAPER, border: t.isLight ? 0 : `1px solid ${t.HAIR}`, boxShadow: t.isLight ? '0 10px 24px -18px rgba(15,14,12,0.45)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: t.DISPLAY, fontWeight: 600, fontSize: 34, lineHeight: 0.95, letterSpacing: '-0.03em', color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{unread ? dash : calLeft.toLocaleString()}</span>
          <span style={{ fontFamily: t.BODY, fontSize: 13, color: t.INK70 }}>{tr('nutrition:eat.kcalLeftWord', { defaultValue: 'kcal left' })}</span>
          <span style={{ marginLeft: 'auto', fontFamily: t.BODY, fontSize: 12, color: t.INK50, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{unread ? '' : tr('nutrition:eat.eatenPct', { defaultValue: '{eaten} eaten · {pct}%', eaten: calNow.toLocaleString(), pct: calPct })}</span>
        </div>
        <div aria-hidden style={{ marginTop: 10, height: 8, borderRadius: 999, background: t.HAIR, overflow: 'hidden' }}>
          <div style={{ width: `${unread ? 0 : calPct}%`, height: '100%', borderRadius: 999, background: t.ACCENT }} />
        </div>
        {/* One row of three tiles, not a 44 px row each. A long language's "{g}g left" wraps in its tile. */}
        <div data-eat-macros="" style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {macros.map((m) => {
            const left = unread ? dash : tr('nutrition:eat.gramsLeft', { defaultValue: '{g}g left', g: Math.max(0, m.g - m.v) });
            const pct = !unread && m.g > 0 ? Math.max(0, Math.min(100, Math.round((m.v / m.g) * 100))) : 0;
            const of = unread ? `${dash} / ${m.gKnown ? m.g : dash}` : `${m.v} / ${m.g}`;
            return (
              <button key={m.k} type="button" onClick={() => !unread && onOpen && onOpen(m.k)} disabled={unread} aria-label={`${m.l} ${left} ${of}`}
                style={{ minWidth: 0, minHeight: 44, border: 0, borderRadius: 12, background: bsEfTint(m.c, '14', t.HAIR), padding: '9px 10px 10px', textAlign: 'left', cursor: unread ? 'default' : 'pointer', font: 'inherit', color: 'inherit' }}>
                <span style={{ display: 'block', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: m.c, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.l}</span>
                <span style={{ display: 'block', marginTop: 4, fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600, lineHeight: 1.1, letterSpacing: '-0.01em', color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{left}</span>
                <span aria-hidden style={{ display: 'block', marginTop: 7, height: 5, borderRadius: 999, background: bsEfTint(m.c, '33', t.HAIR), overflow: 'hidden' }}>
                  <span style={{ display: 'block', width: `${pct}%`, height: '100%', borderRadius: 999, background: m.c }} />
                </span>
                <span style={{ display: 'block', marginTop: 5, fontFamily: t.BODY, fontSize: 11.5, color: t.INK50, fontVariantNumeric: 'tabular-nums' }}>{of}</span>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}

// ─── EAT · ONE MACRO'S PAGE ──────────────────────────────────────────────────────────────────────
// Each macro tile opens its own page (owner, 2026-10-24: "the 3 of these are links to the same page,
// need to change that"): what is left of it, the day's meals by that macro, and the week's figures
// against the target. In the Wall's magazine look: a figure, square bars, Saira heads over a 2px rule,
// hairline rows. `meals` are Eat's day (swaps applied) with p/c/f; `week` is Mon–Sun, { d, v, g }.

function BSEfHead({ t, label, meta }) {
  return (
    <div data-eat-macro-head="" style={{ display: 'flex', alignItems: 'baseline', gap: 10, paddingBottom: 6, borderBottom: `2px solid ${t.INK}` }}>
      <span style={{ flex: 'none', fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 600, lineHeight: 1, letterSpacing: '0.02em', textTransform: 'uppercase', color: t.INK, whiteSpace: 'nowrap' }}>{label}</span>
      {meta ? <span style={{ marginLeft: 'auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, whiteSpace: 'nowrap' }}>{meta}</span> : null}
    </div>
  );
}

const bsEfNum = (x) => { const n = Number(String(x == null ? '' : x).replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : 0; };

// What the member's swaps change in what was eaten (Codex P2 on #2446: a swapped meal's row read its
// swap's grams while the figure above it read the plan's). Eat swaps a meal by its plan title
// (mealOverrides: title → { kcal, p, c, f }), and only a meal already logged is in the day's figure,
// so each logged meal that was swapped adds its swap's amount less the planned one. `k` is 'kcal',
// 'p', 'c' or 'f'; a swap that names no amount for it changes nothing.
// The meal a tap opens (Codex P2 on #2446: a swapped meal's row opened the planned meal). A swap carries
// only a title and its amounts (BS_MEAL_SWAPS), so the meal opens as the swap: its title, kcal and
// macros, and none of the planned meal's recipe, picture or note, which are not the swap's. A meal
// with no swap opens as it is.
export function bsEatSwappedMeal(meal, overrides) {
  const ov = meal && overrides ? overrides[meal.title] : null;
  if (!ov || !ov.title) return meal || null;
  return {
    ...meal, title: ov.title, kcal: ov.kcal, p: ov.p, c: ov.c, f: ov.f, sub: ov.sub || meal.sub,
    hero: '', brief: '', ingredients: [], steps: [], coachNote: '', prep: '—', score: '—', _swappedFrom: meal.title,
  };
}

export function bsEatSwapDelta(meals, overrides, k) {
  let d = 0;
  for (const m of Array.isArray(meals) ? meals : []) {
    const ov = m && overrides ? overrides[m.title] : null;
    if (!ov || m.state !== 'done' || ov[k] == null || ov[k] === '') continue;
    d += bsEfNum(ov[k]) - bsEfNum(m[k]);
  }
  return Math.round(d);
}

export function BSEatMacroPage({ k, name, color, v, g, meals = [], week = [], dayIdx = 0, todayIdx = 0, onBack, onMealClick, onDay }) {
  const { BSPage, BSDetailHeader, BSFooter } = window;
  const t = window.useBS();
  const tr = useShapeTr();
  const over = v > g;
  const pct = g > 0 ? Math.round((v / g) * 100) : 0;
  const rows = meals.map((m) => ({ id: m.id, tag: m.tag, title: m.title, state: m.state, grams: Math.round(bsEfNum(m[k])) }));
  const top = Math.max(1, ...week.map((w) => Math.max(w.v || 0, w.g || 0)));
  const CHART = 88;
  return (
    <BSPage>
      <BSDetailHeader onBack={onBack}
        eyebrow={dayIdx === todayIdx ? tr('nutrition:eat.fuelLeft', { defaultValue: 'Fuel left today' }) : (week[dayIdx] && week[dayIdx].d) || ''}
        title={name} />

      <section data-eat-macro-hero="" style={{ padding: `0 ${t.padX}px` }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 40, fontWeight: 600, lineHeight: 1, letterSpacing: '-0.03em', color: t.INK, fontVariantNumeric: 'tabular-nums' }}>
          {over
            ? tr('nutrition:eat.macro.gramsOver', { defaultValue: '{g}g over', g: v - g })
            : tr('nutrition:eat.gramsLeft', { defaultValue: '{g}g left', g: Math.max(0, g - v) })}
        </div>
        <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK70, fontVariantNumeric: 'tabular-nums' }}>
          {tr('nutrition:eat.macro.ofTarget', { defaultValue: '{v} of {g} g · {pct}%', v, g, pct })}
        </div>
        <div aria-hidden style={{ marginTop: 12, height: 6, background: t.HAIR }}>
          <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color }} />
        </div>
      </section>

      <section style={{ padding: `${t.sectGap || 28}px ${t.padX}px 0` }}>
        <BSEfHead t={t} label={tr('nutrition:eat.mealsToday', { defaultValue: "Today's meals" })}
          meta={tr('nutrition:eat.macro.gramsOf', { defaultValue: 'Grams of {macro}', macro: name })} />
        {rows.length === 0 ? (
          <p style={{ margin: '14px 0 0', fontFamily: t.BODY, fontSize: 14, color: t.INK70 }}>{tr('nutrition:eat.noMealsToday', { defaultValue: 'No meals planned for today.' })}</p>
        ) : rows.map((r) => {
          const done = r.state === 'done';
          const share = g > 0 ? Math.min(100, Math.round((r.grams / g) * 100)) : 0;
          return (
            <button key={r.id} type="button" data-eat-macro-meal="" onClick={() => onMealClick && onMealClick(r.id)}
              style={{ display: 'block', width: '100%', minHeight: 44, padding: '12px 0', border: 0, borderBottom: `1px solid ${t.HAIR}`, borderRadius: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: done ? t.INK : t.INK50 }}>
                    {r.tag}{' · '}{done ? `✓ ${tr('nutrition:eat.macro.logged', { defaultValue: 'Logged' })}` : tr('nutrition:eat.macro.toCome', { defaultValue: 'To come' })}
                  </span>
                  <span style={{ display: 'block', marginTop: 3, fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.15, color: t.INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                </span>
                <span style={{ flex: 'none', fontFamily: t.DISPLAY, fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: t.INK, fontVariantNumeric: 'tabular-nums' }}>
                  {r.grams}<span style={{ marginLeft: 3, fontFamily: t.MONO, fontSize: 10, fontWeight: 700, color: t.INK50 }}>g</span>
                </span>
              </span>
              <span aria-hidden style={{ display: 'block', marginTop: 8, height: 3, background: t.HAIR }}>
                <span style={{ display: 'block', width: `${share}%`, height: '100%', background: color, opacity: done ? 1 : 0.4 }} />
              </span>
            </button>
          );
        })}
      </section>

      {week.length ? (
        <section style={{ padding: `${t.sectGap || 28}px ${t.padX}px 0` }}>
          <BSEfHead t={t} label={tr('home:section.thisWeek', { defaultValue: 'This week' })}
            meta={tr('nutrition:eat.macro.weekMeta', { defaultValue: 'Grams a day' })} />
          <div data-eat-macro-week="" style={{ display: 'grid', gridTemplateColumns: `repeat(${week.length}, minmax(0, 1fr))`, gap: 6, marginTop: 14 }}>
            {week.map((w, i) => {
              const h = Math.round(((w.v || 0) / top) * CHART);
              const tick = Math.round(((w.g || 0) / top) * CHART);
              const ahead = i > todayIdx;
              const on = i === dayIdx;
              return (
                <div key={i} role="img" aria-label={tr('nutrition:eat.macro.dayAria', { defaultValue: '{day}: {v} of {g} g', day: w.d, v: w.v || 0, g: w.g || 0 })} style={{ minWidth: 0, textAlign: 'center' }}>
                  <div style={{ position: 'relative', height: CHART, borderBottom: `1px solid ${t.INK}` }}>
                    <div style={{ position: 'absolute', left: '18%', right: '18%', bottom: 0, height: h, background: color, opacity: ahead ? 0.3 : 1 }} />
                    {w.g ? <div style={{ position: 'absolute', left: 0, right: 0, bottom: tick, height: 2, background: t.INK }} /> : null}
                  </div>
                  <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: on ? t.INK : t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <span style={{ paddingBottom: 2, boxShadow: on ? `inset 0 -2px 0 ${color}` : 'none' }}>{w.d}</span>
                  </div>
                  <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 9, fontWeight: 600, color: ahead ? t.INK50 : t.INK70, fontVariantNumeric: 'tabular-nums' }}>{w.v ? w.v : '—'}</div>
                </div>
              );
            })}
          </div>
          <p style={{ margin: '10px 0 0', fontFamily: t.MONO, fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>
            <span aria-hidden style={{ display: 'inline-block', width: 12, height: 2, marginRight: 6, verticalAlign: 'middle', background: t.INK }} />
            {tr('nutrition:eat.macro.tickNote', { defaultValue: 'The tick marks the target' })}
          </p>
        </section>
      ) : null}

      {onDay ? (
        <div style={{ padding: `${t.sectGap || 28}px ${t.padX}px 8px` }}>
          <button type="button" onClick={onDay} style={{ minHeight: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK }}>
            <span style={{ paddingBottom: 3, boxShadow: `inset 0 -1px 0 ${t.INK}` }}>{tr('nutrition:eat.macro.wholeDay', { defaultValue: 'The whole day →' })}</span>
          </button>
        </div>
      ) : null}
      <BSFooter />
    </BSPage>
  );
}
