import React from 'react';
import { useBSClean, BSCleanType } from './bsCleanType.jsx';
import { bsMpGlass } from './BSMemberBento.jsx';
import { bsRaised } from './BSProInstrument.jsx';
import { bsCookableFromMeal } from '../services/cookable.mjs';
import { SHAPE_KITCHEN_RECIPES } from './shapeKitchenData.js';
// ─── THE MEAL PAGE (Eat → a meal of the day; Home's meal preview) ───────────────────────────────────
// The owner asked for a new design of this page ("new design this page": a more immersive hero, a
// cleaner read of the macros, ingredients and a method that are easier to scan) and picked B of three
// (owner, 2026-11-04: "B for meal page and grocery"): a tall photo with a glass card riding up over it
// that carries the title and the four figures; Cook this as a raised plate; the ingredients in a glass
// card, the amounts and the kcal in columns of their own; the method on a timeline rail. Moved out of
// iosAppBroadsheetClient.jsx with the redesign, as BSGroceryLibrary and BSLeaderboard were.
//
// What it does is what the old page did: Cook this opens Cook Mode at the meal's own cookable tier,
// Cook with something else hands the dish to the prep session, Save keeps the meal in the Library, and
// Ate as planned (or Log Now, where the host logs) files it.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP. The client module imports this file, so
// it evaluates before that module's body has put its pieces on window; a top-level read would capture
// undefined (React error #130). The component names the globals it needs on its first line. This file
// never imports the client module back.

// The i18n translator for this module (the self-contained copy every feature module carries).
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

// The chrome's masthead inset, with the chrome's own fallback (read at call time from window).
const BS_MAST_TOP_CSS = 'max(44px, calc(env(safe-area-inset-top, 0px) + 12px), var(--bs-notch-floor, 0px))';

// A colour at an alpha (the client's bsTHexA, copied: this module never imports it).
const bsMpA = (hex, a) => { const h = String(hex || '#888888').replace('#', ''); const s = h.length === 3 ? h.split('').map((x) => x + x).join('') : h; const n = parseInt(s, 16); return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`; };

// A real food photo for a meal — the meal's own `photo` when set, else a stock
// image inferred from the title/ingredients so previews always show a picture
// (was a generated halftone placeholder).
function bsMealPhoto(meal) {
  if (meal && (meal.photo || meal.image)) return meal.photo || meal.image;
  // A coach-uploaded image (from the meal/recipe builder's MEDIA section, stored
  // in detail.media) — use the first photo as the hero when present.
  if (meal && Array.isArray(meal.media)) {
    const img = meal.media.find((m) => m && m.url && (m.type === 'image' || !m.type));
    if (img) return img.url;
  }
  const s = `${(meal && meal.title) || ''} ${(meal && meal.sub) || ''} ${(meal && meal.hero) || ''} ${(meal && meal.tag) || ''}`.toLowerCase();
  const pick = (id) => `https://images.unsplash.com/photo-${id}?w=720&h=400&fit=crop&q=72&auto=format`;
  if (/oat|egg|toast|pancake|breakfast|yogurt|granola|smoothie/.test(s)) return pick('1484723091739-30a097e8f929');
  if (/salmon|fish|tuna|cod/.test(s)) return pick('1467003909585-2f8a72700288');
  if (/steak|beef|burger|sirloin/.test(s)) return pick('1546964124-0cce460f38ef');
  if (/wrap|sandwich|burrito|taco/.test(s)) return pick('1528735602780-2552fd46c7af');
  if (/chicken|turkey|poultry/.test(s)) return pick('1532550907401-a500c9a57435');
  if (/salad|veg|bowl|greens|broccoli|kale/.test(s)) return pick('1512621776951-a57141f2eefd');
  if (/rice|stir|noodle|pasta|grain|quinoa/.test(s)) return pick('1603133872878-684f208fb84b');
  return pick('1490645935967-10de6ba17061');
}

const bsMpClock = (c) => <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9.5 3h5" /></svg>;
const bsMpPot = <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11h16v3a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6z" /><path d="M2 11h2M20 11h2M9 7.5c0-1 .8-1.4.8-2.5M14 7.5c0-1 .8-1.4.8-2.5" /></svg>;

// A section head: the mono label, how many, and a hairline to the edge. The words are written where it is
// drawn (JSX text), so the i18n inventory still counts them as the page's own hardcoded copy.
function BSMealSecHead({ t, n = null, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '20px 0 2px' }}>
      <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>{children}</span>
      {n != null ? <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, color: t.INK50 }}>{n}</span> : null}
      <span aria-hidden style={{ flex: 1, height: 1, background: t.HAIR }} />
    </div>
  );
}

export function BSMealPreview({ meal, onBack, onLog, onFiled, onUnfiled }) {
  const { BSPage, BSBackRow, BSMastRow, BSMeCorner, BSHalftone, BSFooter, BSCookMode, BSMealLogged, BSCookWithDoor, useBSLibrary, bsLibToggle, bsNoraOpen, bsHouseholdQty, bsMealSchedTime, bsFmt12, _bsScrollTopOnMount } = window;
  // The page's words in the clean type, as the rest of Eat (Geist heads, Inter Tight words); the
  // masthead and ← Back sit outside it and keep the app's own.
  const t = useBSClean();
  _bsScrollTopOnMount();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const onTeal = t.isLight ? '#fff' : '#04201d';
  const tr = useShapeTr();
  const [justLogged, setJustLogged] = React.useState(false);
  const [cooking, setCooking] = React.useState(false);
  // Normalized ONCE — null (malformed/title-less meal) hides the Cook door
  // entirely, so BSCookMode can never mount on a null cookable (CodeRabbit).
  const cookable = React.useMemo(() => bsCookableFromMeal(meal, SHAPE_KITCHEN_RECIPES), [meal]);
  // Nora's "this meal" (the Ask Nora plan, step 4).
  React.useEffect(() => (meal && meal.title ? bsNoraOpen({ item: { kind: 'meal', title: meal.title } }) : undefined), [meal && meal.title]);
  const mealLibItem = { id: 'meal:' + String(meal.id || String(meal.title || 'meal').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')), kind: 'meal', title: meal.title, meta: `${meal.kcal} kcal · ${meal.p}P · ${meal.c}C · ${meal.f}F` };
  const mealSaved = useBSLibrary().some(x => x.id === mealLibItem.id);
  // The eyebrow timestamp follows the client's actual schedule: the meal's own
  // scheduled time, and only when it's missing the client's meal-time preference
  // for that slot (Settings → Preferences → meal times).
  const schedTime = bsMealSchedTime(meal);
  // Cook Mode takeover (spec 2026-07-21) — EVERY meal opens at its honest
  // cookable tier: a catalog-mapped meal walks the recipe's method (the plan's
  // macros stay the logged truth), an unmapped one walks what it carries.
  if (cooking && cookable) return <BSCookMode cookable={cookable} onClose={() => setCooking(false)} onLogged={() => { try { onFiled?.(); } catch (e) {} }} onUnlogged={() => { try { onUnfiled?.(); } catch (e) {} }} />;
  if (justLogged) {
    return <BSMealLogged kcal={meal.kcal} p={meal.p} logged time={bsFmt12(schedTime)} onDone={onBack} onUndo={() => { setJustLogged(false); try { onUnfiled?.(); } catch (e) {} }}
      share={{ name: meal.title, kcal: meal.kcal, p: meal.p, c: meal.c, f: meal.f, planned: true, recipeId: meal.recipeId || '', coach: meal.coach || '' }} />;
  }

  // Meals opened from the day log carry only macros — guard the rich fields.
  // Steps may be coach-authored OBJECTS ({t, min, passive, station} — PR E
  // structured authoring): the page renders display text only; Cook Mode
  // reads the structure through bsCookableFromMeal.
  const ingredients = Array.isArray(meal.ingredients) ? meal.ingredients : [];
  const steps = (Array.isArray(meal.steps) ? meal.steps : [])
    .map((s) => (typeof s === 'string' ? s : (s && typeof s === 'object' && typeof s.t === 'string' ? s.t : ''))).filter(Boolean);
  const kicker = [meal.tag, schedTime ? bsFmt12(schedTime) : null].filter(Boolean).join(' · ');
  const px = t.padX;
  const mono = (size, color, extra = {}) => ({ fontFamily: t.MONO, fontSize: size, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', ...(color !== undefined ? { color } : {}), ...extra });
  // The four figures, each with the colour Fuel left gives it (protein rust, carbs amber, fat blue).
  const figs = [
    { k: 'kcal', l: 'Kcal', v: meal.kcal, u: '', c: teal },
    { k: 'p', l: 'Protein', v: meal.p, u: 'g', c: t.RUST },
    { k: 'c', l: 'Carbs', v: meal.c, u: 'g', c: t.AMBER },
    { k: 'f', l: 'Fat', v: meal.f, u: 'g', c: t.BLUE },
  ];
  // An ingredient's amount and its kcal in columns of their own, so the list reads down as a table
  // (the Kitchen Card prints the same two parts as one "¾ cups · 120", bsIngQtyLabel).
  const qtyOf = (ing) => (t.isMetric ? ing.n : bsHouseholdQty(ing.n, ing.m));
  const kcOf = (ing) => (ing.k ? String(ing.k).replace(/\s*kcal$/i, '') : '');
  const hasKc = ingredients.some((ing) => ing.k);
  const facts = [meal.prep ? { k: 'prep', v: meal.prep, clock: true } : null, meal.portion ? { k: 'portion', v: meal.portion } : null].filter(Boolean);
  const mastTop = window.BS_MAST_TOP_CSS || BS_MAST_TOP_CSS;

  return (
    <BSPage>
      <div style={{ padding: `${mastTop} ${px}px 8px` }}>
        {BSMastRow && <BSMastRow trailing={<BSMeCorner />} />}
        <BSBackRow onBack={onBack} />
      </div>

      <BSCleanType t={t}>
        {/* THE HERO: the photo edge to edge, fading into the paper, the halftone under it if the image
            fails; the glass card rides up over its foot with the slot and time, the title and the four
            figures, so the first screen is the dish and what it gives. */}
        <div data-meal-hero="" style={{ position: 'relative', height: 290, overflow: 'hidden', background: bsMpA(meal.tagColor || t.AMBER, 0.14) }}>
          <BSHalftone height={290} accent={meal.tagColor} pattern="dots" />
          <img src={bsMealPhoto(meal)} alt={meal.title || 'Meal'} loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${bsMpA(t.PAPER, 0)} 42%, ${bsMpA(t.PAPER, 0.8)} 80%, ${t.PAPER} 100%)` }} />
        </div>
        <div data-meal-card="" style={{ ...bsMpGlass(t, t.INK, { radius: 20 }), backgroundColor: bsMpA(t.PAPER, t.isLight ? 0.6 : 0.72), backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', zIndex: 1, margin: `-96px ${px}px 0`, padding: '14px 14px 12px' }}>
          {kicker ? <div style={mono(8.5, t.INK50, { letterSpacing: '0.2em', fontWeight: 700 })}>{kicker}</div> : null}
          <div style={{ marginTop: 4, fontFamily: t.HEAD, fontSize: 27, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05, color: t.INK }}>{meal.title}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', marginTop: 12, paddingTop: 11, borderTop: `1px solid ${t.HAIR}` }}>
            {figs.map((m, i) => (
              <div key={m.k} style={{ minWidth: 0, paddingLeft: i ? 10 : 0, borderLeft: i ? `1px solid ${t.HAIR}` : 0 }}>
                <div style={{ fontFamily: t.HEAD, fontSize: 20, fontWeight: 600, lineHeight: 1.05, letterSpacing: '-0.02em', color: t.INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{m.v}<span style={{ marginLeft: 1, fontSize: 12, fontWeight: 500, color: t.INK50 }}>{m.u}</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                  <span aria-hidden style={{ flexShrink: 0, width: 6, height: 6, borderRadius: 999, background: m.c }} />
                  <span style={mono(7.5, t.INK50, { letterSpacing: '0.12em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })}>{m.l}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: `0 ${px}px` }}>
          {/* Cook Mode door — universal (spec 2026-07-21 §2.5); the tier ladder inside decides what the
              walkthrough honestly offers. Hidden when the meal can't normalize at all (null cookable —
              nothing to walk). A raised plate, so it reads as the page's one big door. */}
          {cookable && (
            <div style={{ marginTop: 14 }}>
              <button type="button" data-bsck-door="cook" onClick={() => setCooking(true)} style={{ ...bsRaised(t, teal), width: '100%', minHeight: 64, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 16, cursor: 'pointer', textAlign: 'left', color: t.INK }}>
                <span aria-hidden style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: bsMpA(teal, 0.16), color: teal }}>{bsMpPot}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={mono(7.5, t.INK50, { display: 'block', letterSpacing: '0.18em' })}>{tr('cook:cta.eyebrow', { defaultValue: 'Guided · step by step' })}</span>
                  <span style={{ display: 'block', marginTop: 2, fontFamily: t.HEAD, fontSize: 16.5, fontWeight: 700, letterSpacing: '-0.01em' }}>{tr('cook:cta', { defaultValue: 'Cook this' })}</span>
                </span>
                <span aria-hidden style={{ flexShrink: 0, color: teal, fontSize: 16, fontWeight: 800 }}>→</span>
              </button>
              <BSCookWithDoor cookable={cookable} tone={teal} />
            </div>
          )}

          {/* Quick facts, one quiet line (a drawn clock, not the ⏱ glyph). */}
          {(facts.length || meal.score) ? (
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: cookable ? 4 : 14, fontFamily: t.BODY, fontSize: 13, color: t.INK70 }}>
              {facts.map((f, i) => <span key={f.k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{i ? <span aria-hidden style={{ color: t.INK50 }}>·</span> : null}{f.clock ? bsMpClock(t.INK50) : null}{f.v}</span>)}
              {meal.score ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{facts.length ? <span aria-hidden style={{ color: t.INK50 }}>·</span> : null}Score <b style={{ color: t.AMBER }}>{meal.score}</b></span> : null}
            </div>
          ) : null}

          {/* The brief, on a teal spine. */}
          {(meal.hero || meal.brief) && (
            <>
              <BSMealSecHead t={t}>The dish</BSMealSecHead>
              <div style={{ borderLeft: `3px solid ${teal}`, paddingLeft: 12, marginTop: 8 }}>
                {meal.hero ? <div style={{ fontFamily: t.BODY, fontSize: 16, lineHeight: 1.4, fontWeight: 600, color: t.INK }}>{meal.hero}</div> : null}
                {meal.brief ? <div style={{ marginTop: 6, fontFamily: t.BODY, fontSize: 14, lineHeight: 1.45, color: t.INK70 }}>{meal.brief}</div> : null}
              </div>
            </>
          )}

          {/* The ingredients in a glass card: one column, the amount and the kcal each in a column of
              its own (the old two-column list broke a name from its amount across the gutter). */}
          {ingredients.length > 0 && (
            <div data-meal-ingredients="" style={{ ...bsMpGlass(t, t.INK, { radius: 18 }), marginTop: 22, padding: '2px 14px 6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0 6px' }}>
                <span style={mono(9, t.INK50)}>The ingredients</span>
                <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, color: t.INK50 }}>{ingredients.length}</span>
                <span style={{ flex: 1 }} />
                {hasKc ? <span style={mono(7.5, t.INK50, { letterSpacing: '0.12em' })}>kcal</span> : null}
              </div>
              {ingredients.map((ing, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: hasKc ? '1fr auto 30px' : '1fr auto', alignItems: 'center', gap: 10, minHeight: 40, padding: '5px 0', borderTop: i ? `1px solid ${t.HAIR}` : 0 }}>
                  <span style={{ minWidth: 0, fontFamily: t.BODY, fontSize: 15, color: t.INK }}>{ing.m}</span>
                  <span style={{ fontFamily: t.MONO, fontSize: 11, fontWeight: 700, color: teal, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{qtyOf(ing)}</span>
                  {hasKc ? <span style={{ textAlign: 'right', fontFamily: t.MONO, fontSize: 10, color: t.INK50, fontVariantNumeric: 'tabular-nums' }}>{kcOf(ing)}</span> : null}
                </div>
              ))}
            </div>
          )}

          {/* The method on a timeline rail: a numbered node per step, joined down the side. */}
          {steps.length > 0 && (
            <>
              <BSMealSecHead t={t} n={steps.length}>The method</BSMealSecHead>
              <div data-meal-method="" style={{ marginTop: 8 }}>
                {steps.map((s, i) => {
                  const last = i === steps.length - 1;
                  return (
                    <div key={i} style={{ position: 'relative', display: 'flex', gap: 12, paddingBottom: last ? 0 : 12 }}>
                      {!last ? <span aria-hidden style={{ position: 'absolute', left: 13, top: 28, bottom: 0, width: 2, background: bsMpA(teal, 0.3) }} /> : null}
                      <span aria-hidden style={{ position: 'relative', zIndex: 1, flexShrink: 0, width: 28, height: 28, borderRadius: 999, boxSizing: 'border-box', background: t.PAPER, border: `1.5px solid ${bsMpA(teal, 0.6)}`, color: teal, display: 'grid', placeItems: 'center', fontFamily: t.MONO, fontSize: 11, fontWeight: 800 }}>{i + 1}</span>
                      <span style={{ flex: 1, minWidth: 0, paddingTop: 4, fontFamily: t.BODY, fontSize: 14.5, lineHeight: 1.45, color: t.INK }}>{s}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Save, and the one-tap log. */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', margin: '20px 0 16px' }}>
            <button type="button" onClick={() => bsLibToggle(mealLibItem)} aria-pressed={mealSaved} style={{
              ...bsMpGlass(t, t.INK, { radius: 14 }), minHeight: 54, padding: '0 16px', cursor: 'pointer', color: mealSaved ? teal : t.INK,
              ...mono(9.5, undefined, { letterSpacing: '0.14em', whiteSpace: 'nowrap' }),
            }}>{mealSaved ? '✓ Saved' : '♡ Save'}</button>
            <button type="button" onClick={onLog ? onLog : () => {
              // One-tap "ate as planned" — also persist the meal's macros onto
              // today's snapshot so the Nutrition stats track real logging.
              try { window.ShapeMealLog?.log?.({ kcal: meal.kcal, protein: meal.p, carbs: meal.c, fat: meal.f }); } catch (e) {}
              try { onFiled?.(); } catch (e) {}
              setJustLogged(true);
            }} style={{
              flex: 1, minHeight: 54, border: 0, borderRadius: 14, background: teal, color: onTeal, cursor: 'pointer', textAlign: 'left',
              padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: onLog ? 'center' : 'space-between', gap: 8,
              boxShadow: t.isLight ? 'none' : `0 0 24px ${bsMpA(teal, 0.2)}`,
            }}>
              {onLog ? <span style={mono(9.5, undefined)}>Log Now</span> : (
                <>
                  <span style={{ minWidth: 0 }}>
                    <span style={mono(7, undefined, { display: 'block', letterSpacing: '0.18em', opacity: 0.65 })}>One tap</span>
                    <span style={{ display: 'block', marginTop: 1, fontFamily: t.HEAD, fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>Ate as planned</span>
                  </span>
                  <span aria-hidden style={{ fontSize: 15, fontWeight: 800 }}>✓</span>
                </>
              )}
            </button>
          </div>
        </div>
      </BSCleanType>
      <BSFooter right="Meal" />
    </BSPage>
  );
}
