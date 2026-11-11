import React from 'react';
import { createPortal } from 'react-dom';
import { createMobileVideoComponents } from '../services/videoComponents.mjs';
import { bsPlanPreview } from '../services/planPreview.mjs';
import { bsDialogRef } from '../services/dialogBack.mjs';

const { ShapeVideoPlayer } = createMobileVideoComponents(React);

// The i18n translator for this module, as the marketplace's: self-contained on the window globals
// (ShapeI18n/ShapeLocale), so it depends on no other file's copy or its load order.
function useShapeTr() {
  const [, force] = React.useState(0);
  React.useEffect(() => window.ShapeLocale?.subscribe?.(() => force((n) => n + 1)), []);
  return (key, opts) => {
    const v = window.ShapeI18n?.t?.(key, opts);
    return (v == null || v === key) ? (opts?.defaultValue ?? key) : v;
  };
}

// ── The plan preview sheet ("what's inside", spec 2026-07-24) ────────────────
// A buyer could see a name, a price and one line of meta before paying. This
// opens the coach's OWN authored outline. Every row comes from bsPlanPreview,
// which parses coach_plans.detail.blocks through the same planOutline parsers
// the Assign flow uses — so a preview can never describe a plan differently
// from how it is delivered, and a plan with no authored outline shows the
// honest "the coach hasn't published an outline" state rather than a fabricated
// one. Portals into #bs-phone-surface + position:absolute (the sheet rule).
//
// Its own module (was in iosAppBroadsheetMarketplace.jsx) so the coach page opens it on a meal plan's
// card too (BSTrainerProfile.jsx). canBuy: whether Buy shows; unset, it shows whenever the plan has a
// price (the marketplace's listing). The coach page passes its card's own rule (a real, paid plan on a
// live listing, never a sample's, never the coach's own). isSelf says this is what members see; onWork,
// where Buy doesn't show, offers Work with. onAccent: the Buy's words on the accent.
export function BSPlanPreviewSheet({ plan, isNutri, roleColor, teal, onBuy, onClose, canBuy, isSelf = false, onWork = null, first = '', onAccent = null }) {
  const t = window.useBS();
  const tr = useShapeTr();
  if (!plan) return null;
  const p = bsPlanPreview(plan, { isNutri });
  // Buy needs a price to say; the marketplace sells any priced plan, the coach page only what its card sells.
  const buys = !!plan.price && (canBuy === undefined ? true : !!canBuy);
  // `p.kind === null` is the EXPECTED state for a published plan with no
  // authored outline — it is not evidence the product is a single session.
  // Falling through to "Single session" mislabelled every empty nutrition plan
  // and every empty multi-week trainer program. The plan still declares what it
  // is, so the fallback reads the same `category` the shelf above buckets this
  // very row by (`singleMatch`), plus the role.
  const planCat = String((plan && plan.category) || '').toLowerCase();
  const isSinglePlan = isNutri ? /meal/.test(planCat) : /workout|single/.test(planCat);
  const eyebrowKind = p.kind
    || (isNutri ? 'menu' : (isSinglePlan ? 'session' : 'split'));
  // 'block' (a Week 1..N outline) reads as a Program — same as a weekday split.
  // Both are multi-session products; only the unit shape differs.
  const eyebrow = (eyebrowKind === 'split' || eyebrowKind === 'block' || eyebrowKind === 'program')
    ? tr('marketplace:preview.eyebrowProgram', { defaultValue: 'Program' })
    : eyebrowKind === 'menu'
      ? tr('marketplace:preview.eyebrowMenu', { defaultValue: 'Meal plan' })
      : tr('marketplace:preview.eyebrowSession', { defaultValue: 'Single session' });

  const register = [];
  if (p.weeks) register.push([tr('marketplace:preview.weeks', { defaultValue: 'Weeks' }), String(p.weeks)]);
  if (p.sessionsPerWeek) register.push([tr('marketplace:preview.perWeek', { defaultValue: 'Days / wk' }), String(p.sessionsPerWeek)]);
  // A program's units are its days, which Days / wk already counts.
  if (p.units.length && p.kind !== 'program') register.push([
    p.kind === 'menu' ? tr('marketplace:preview.meals', { defaultValue: 'Meals' }) : tr('marketplace:preview.moves', { defaultValue: 'Entries' }),
    String(p.units.length),
  ]);

  // A program's day carries its moves' names (a public preview's whole content): the day,
  // then its moves on a line under it.
  const dayRow = (u, i) => (
    <div key={i} data-preview-day="" style={{ padding: '9px 0', borderBottom: `1px solid ${t.HAIR}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ flexShrink: 0, minWidth: 46, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', color: t.INK50 }}>{u.label}</span>
        <span style={{ minWidth: 0, fontFamily: t.DISPLAY, fontSize: 14, color: t.INK }}>{u.title}</span>
      </div>
      <div style={{ marginTop: 3, paddingLeft: 54, fontFamily: t.DISPLAY, fontSize: 12.5, lineHeight: 1.45, color: t.INK70 }}>{u.moves.concat(u.more > 0 ? [`＋${u.more}`] : []).join(' · ')}</div>
    </div>
  );
  const row = (u, i) => (Array.isArray(u.moves) ? dayRow(u, i) :
    <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '9px 0', borderBottom: `1px solid ${t.HAIR}`, opacity: u.rest ? 0.55 : 1 }}>
      {u.label ? <span style={{ flexShrink: 0, minWidth: 46, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', color: t.INK50 }}>{u.label}</span> : null}
      <span style={{ minWidth: 0, fontFamily: t.DISPLAY, fontSize: 14, color: t.INK }}>{u.title}</span>
      <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${t.INK}47`, transform: 'translateY(-3px)', minWidth: 10 }} />
      <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, color: t.INK70, fontVariantNumeric: 'tabular-nums' }}>
        {u.rest ? tr('marketplace:preview.rest', { defaultValue: 'Rest' })
          : u.scheme ? u.scheme
            : u.load ? u.load
              : (u.kcal != null ? `${u.kcal} kcal` : '')}
      </span>
    </div>
  );

  const sheet = (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 210, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}>
      <div
        ref={bsDialogRef(onClose)}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={tr('marketplace:preview.aria', { defaultValue: "What's inside {name}", name: plan.name || '' })}
        className="bs-hide-scroll"
        style={{ width: '100%', boxSizing: 'border-box', maxHeight: '82%', overflowY: 'auto', background: t.PAPER, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTop: `1px solid ${t.RULE}`, padding: `18px ${t.padX}px calc(18px + env(safe-area-inset-bottom, 0px))`, boxShadow: '0 -20px 50px rgba(0,0,0,0.4)' }}
      >
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: roleColor }}>
          {eyebrow}{plan.price ? ` · ${plan.price}` : ''}
        </div>
        <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: t.INK, lineHeight: 1.1 }}>
          {plan.name}<span style={{ color: roleColor }}>.</span>
        </div>
        <div aria-hidden style={{ margin: '12px 0 2px', height: 2, background: `linear-gradient(90deg, ${t.INK}, ${teal} 72%, transparent)` }} />

        {p.media.length > 0 && (
          <div style={{ margin: '12px 0 2px', display: 'flex', gap: 7, flexWrap:'wrap' }}>
            {p.media.map((m, i) => (
              <div key={i} style={{ flex: 'none', width:m.type==='video'?'100%':132, height:m.type==='video'?'auto':96, minWidth:0, overflow: 'hidden', background: t.PAPER2, border: `1px solid ${t.HAIR}` }}>
                {m.type === 'video'
                  ? <ShapeVideoPlayer value={m}/>
                  : <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
            ))}
          </div>
        )}

        {register.length > 0 && (
          <div style={{ display: 'flex', gap: 22, marginTop: 14 }}>
            {register.map(([label, value]) => (
              <div key={label}>
                <div style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>{label}</div>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 20, fontWeight: 700, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {p.kind ? (
          <>
            <div style={{ marginTop: 16, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50 }}>
              {tr('marketplace:preview.outline', { defaultValue: 'The outline' })}
            </div>
            {/* C1a — a per-day menu's SEVEN DAYS are the table of contents and
                the differentiator being paid for, so they render free. Counts
                only: no locked meal's text is in `p.days`, so nothing here can
                leak paid content. Without this strip the model carried the
                structure and the buyer never saw it — the sheet showed a sample
                day plus a locked count, which is what a single-day menu looks
                like too. */}
            {p.perDay && Array.isArray(p.days) && (
              <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                {p.days.map((d) => (
                  <div key={d.label} style={{ flex: 1, textAlign: 'center', padding: '7px 0', border: `1px solid ${d.count ? t.HAIR : 'transparent'}`, background: d.count ? `${teal}14` : 'transparent', opacity: d.count ? 1 : 0.4 }}>
                    <div style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.1em', color: t.INK50 }}>{d.label}</div>
                    <div style={{ marginTop: 2, fontFamily: t.DISPLAY, fontSize: 13, fontWeight: 700, color: d.count ? t.INK : t.INK50, fontVariantNumeric: 'tabular-nums' }}>{d.count || '—'}</div>
                  </div>
                ))}
              </div>
            )}
            {p.perDay && (
              <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>
                {/* "Menus vary by day", not "a different menu each day" — perDay
                    fires on ONE differing day (Mon/Wed/Fri overrides + four
                    inherited defaults is the normal authored shape), so the
                    stronger claim would overstate what several real plans
                    deliver. Copy on a paid surface states what is true of
                    every plan it renders on. */}
                {tr('marketplace:preview.perDay', { defaultValue: 'Menus vary by day · meals per day' })}
              </div>
            )}
            <div style={{ marginTop: 4 }}>{p.free.map(row)}</div>
            {p.locked > 0 && (
              <div style={{ marginTop: 10, padding: '10px 0', borderTop: `1px dashed ${t.INK}3d`, textAlign: 'center', fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50 }}>
                {tr('marketplace:preview.locked', { defaultValue: '＋{count} more · unlocked when you buy', count: p.locked })}
              </div>
            )}
            {/* A program's public preview carries names, weeks and days only
                (bsProgramReduce); say what buying adds. */}
            {p.namesOnly && (
              <div data-preview-names-only="" style={{ marginTop: p.locked > 0 ? 0 : 10, paddingBottom: 4, textAlign: 'center', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>
                {tr('marketplace:preview.namesOnly', { defaultValue: 'Sets, loads, cues and exercise videos unlock when you buy' })}
              </div>
            )}
          </>
        ) : (
          <div style={{ marginTop: 16, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 13.5, lineHeight: 1.5, color: t.INK70 }}>
            {tr('marketplace:preview.noOutline', { defaultValue: "This coach hasn't published an outline for this one yet." })}
          </div>
        )}

        {p.note ? (
          <div style={{ marginTop: 14, paddingLeft: 11, borderLeft: `3px solid ${roleColor}` }}>
            <div style={{ fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 14, lineHeight: 1.5, color: t.INK }}>{p.note}</div>
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: '13px 10px', minHeight: 44, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK }}>
            <span style={{ borderBottom: `2px solid ${t.INK}59`, paddingBottom: 2 }}>{tr('marketplace:sheet.close', { defaultValue: 'Close' })}</span>
          </button>
          {isSelf ? (
            <p data-preview-self="" style={{ flex: 1, margin: 0, fontFamily: t.DISPLAY, fontSize: 13.5, lineHeight: 1.45, color: t.INK70 }}>{tr('profile:trainer.programSelf', { defaultValue: 'This is what members see before they buy.' })}</p>
          ) : buys ? (
            <button type="button" data-preview-buy="" onClick={onBuy} style={{ flex: 1, padding: 14, border: 0, background: teal, color: onAccent || (t.isLight ? '#fff' : '#04201d'), cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', clipPath: 'polygon(0 0, calc(100% - 11px) 0, 100% 11px, 100% 100%, 0 100%)' }}>
              {tr('marketplace:preview.buy', { defaultValue: 'Buy · {price} →', price: plan.price })}
            </button>
          ) : onWork ? (
            <button type="button" data-preview-work="" onClick={onWork} style={{ flex: 1, padding: 14, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
              {tr('profile:trainer.workTitle', { defaultValue: 'Work with {name}', name: first })}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );

  // Surface-only, no document.body fallback — body is where a sheet escapes the
  // phone frame to (the bug PR #1825 fixes), so the guard must not offer it as a
  // target. Absent surface renders in place: contained, not outside the frame.
  const surface = (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || null;
  return surface ? createPortal(sheet, surface) : sheet;
}
