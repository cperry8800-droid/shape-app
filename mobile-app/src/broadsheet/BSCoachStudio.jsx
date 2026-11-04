import React from 'react';
import { bsShortAge } from '../services/shortAge.mjs';

// ─── THE STUDIO TAB: A TRAINER'S WORK, IN THREE KINDS ─────────────────────────────────────────
// Owner, 2026-11-04, of round 3 of the studio ("i like these pages. But need to combine all of these,
// with a clear list of workouts vs programs vs custom coaching. And allow coach to write a brief
// descrioption of each of these if coaches chooses to"), then of the backgrounds "C", and of the tab
// "no keep programs studio" and "name it studio": the Studio tab keeps its place and its name and
// holds the coach's work in place of the floor plan, which was "too confusing for people".
//
//   The jump line  how many of each kind there are, each a way to its section.
//   Programs.      plans that run for weeks, bought once: the price on one right edge marked
//                  "once", the coach's line about it (else the program's own note), its weeks and
//                  days, and who it is for. The first is the lead, with Preview and Open.
//   Workouts.      one session each: every program's day and every posted video, the coach's picks
//                  first (a rule in the margin), filtered by focus (worked out from the moves'
//                  muscles; a focus with nothing in it is not offered). A day opens in place to its
//                  moves and leads to its program; a video plays.
//   Coaching.      the one card: the monthly price marked "a month", the coach's line (else the
//                  offer's blurb), what you get, and the way in.
//
// Over background C, the heat mesh: the coach's accent glowing from the top right through a soft
// beam into a deep teal pool, with a fine grain. The jump line, the rows and the card sit on glass
// in the page's own colour; the section heads sit on the page. The model is bsStudioModel
// (coachWork.mjs); the words the coach writes are profile_custom's (profileCustom.mjs).

const hexA = (hex, a) => {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const rgbOf = (hex) => {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};

// The heat: the coach's own accent, unless it is the page's teal or a plain white or black, when it
// is the trainer's rust (the mesh is the accent against a teal pool; teal on teal reads as one wash).
export function bsStudioHeat(t, accentKey, ACC) {
  if (!accentKey || accentKey === 'teal' || accentKey === 'white' || accentKey === 'black') return t.isLight ? '#c0533b' : '#e2775d';
  return ACC;
}

const GRAIN_LIGHT = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .55  0 0 0 0 .5  0 0 0 0 .44  0 0 0 .22 0'/></filter><rect width='160' height='160' filter='url(%23n)'/></svg>\")";
const GRAIN_DARK = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 .95  0 0 0 0 .88  0 0 0 .09 0'/></filter><rect width='160' height='160' filter='url(%23n)'/></svg>\")";

// Background C. Sized in pixels from the tab's top, so a long tab keeps the light where the eye
// lands first and settles into the page's own colour further down.
export function BSStudioMesh({ t, heat }) {
  const h = rgbOf(heat) || '192,83,59';
  const pool = t.isLight ? '10,143,135' : '16,122,112';
  const glow = t.isLight
    ? `radial-gradient(ellipse 130% 520px at 106% -40px, rgba(${h},0.5) 0%, rgba(${h},0.2) 40%, transparent 70%), radial-gradient(ellipse 120% 460px at -14% 600px, rgba(${pool},0.3) 0%, rgba(${pool},0.1) 45%, transparent 74%), radial-gradient(ellipse 80% 300px at 92% 960px, rgba(${h},0.18) 0%, transparent 72%)`
    : `radial-gradient(ellipse 130% 520px at 106% -40px, rgba(${h},0.6) 0%, rgba(${h},0.26) 40%, transparent 70%), radial-gradient(ellipse 120% 460px at -14% 600px, rgba(${pool},0.6) 0%, rgba(10,78,72,0.28) 45%, transparent 76%), radial-gradient(ellipse 80% 300px at 92% 960px, rgba(${h},0.32) 0%, transparent 72%)`;
  return (
    <div aria-hidden="true" data-studio-mesh="" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0, background: glow }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: -60, height: 700, filter: 'blur(20px)', mixBlendMode: t.isLight ? 'normal' : 'screen' }}>
        <div style={{ position: 'absolute', inset: 0, clipPath: 'polygon(80% 0, 100% 0, 70% 100%, 14% 100%)', background: t.isLight
          ? 'linear-gradient(196deg, rgba(255,247,236,0.7) 0%, rgba(255,247,236,0.26) 45%, transparent 85%)'
          : `linear-gradient(196deg, rgba(${h},0.3) 0%, rgba(${h},0.08) 50%, transparent 85%)` }} />
      </div>
      <div style={{ position: 'absolute', inset: 0, opacity: t.isLight ? 0.5 : 0.55, mixBlendMode: t.isLight ? 'multiply' : 'screen', backgroundImage: t.isLight ? GRAIN_LIGHT : GRAIN_DARK }} />
    </div>
  );
}

// Glass in the page's own colour: a light-to-clear sheen, a lit top edge, a hairline, a soft shadow,
// and the teal edge line along its top. See-through enough for the mesh, never for the words.
export function bsStudioGlass(t) {
  const rgb = rgbOf(t.INK) || (t.isLight ? '26,22,14' : '241,235,221');
  const paper = hexA(t.PAPER, t.isLight ? 0.62 : 0.58);
  const blur = { backdropFilter: 'blur(22px) saturate(1.15)', WebkitBackdropFilter: 'blur(22px) saturate(1.15)' };
  return t.isLight ? {
    position: 'relative', borderRadius: 10, ...blur,
    background: `linear-gradient(180deg, rgba(255,253,247,0.6) 0%, rgba(255,253,247,0.22) 55%, rgba(255,253,247,0.1) 100%), ${paper}`,
    border: `1px solid rgba(${rgb},0.12)`, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.9), 0 18px 34px -22px rgba(${rgb},0.42)`,
  } : {
    position: 'relative', borderRadius: 10, ...blur,
    background: `linear-gradient(180deg, rgba(${rgb},0.075) 0%, rgba(${rgb},0.025) 55%, rgba(${rgb},0.012) 100%), ${paper}`,
    border: `1px solid rgba(${rgb},0.12)`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.09), 0 18px 40px -22px rgba(0,0,0,0.9)',
  };
}
function GlassEdge({ t }) {
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  return <span aria-hidden="true" style={{ position: 'absolute', top: -1, left: 26, right: 26, height: 1, opacity: 0.8, pointerEvents: 'none', background: `linear-gradient(90deg, transparent, ${teal} 30%, ${teal} 70%, transparent)` }} />;
}

// A video's link is a file the page can take a first frame from.
const isVideoFile = (u) => { try { return /\.(mp4|m4v|mov|webm)$/i.test(new URL(u).pathname); } catch (e) { return false; } };

const DOW_INDEX = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
// "MON" as the reader's weekday ("Monday", "lundi"); a label that is no weekday stays as it is.
export function bsStudioWeekday(label, locale) {
  const d = DOW_INDEX[String(label || '').toUpperCase()];
  if (d == null) return label || '';
  try { return new Intl.DateTimeFormat(locale || undefined, { weekday: 'long' }).format(new Date(2024, 0, 7 + d)); } catch (e) { return label; }
}

export const bsStudioFocusLabel = (tr, f) => (
  f === 'upper' ? tr('profile:work.focus.upper', { defaultValue: 'Upper body' })
    : f === 'lower' ? tr('profile:work.focus.lower', { defaultValue: 'Lower body' })
      : f === 'full' ? tr('profile:work.focus.full', { defaultValue: 'Full body' })
        : f === 'core' ? tr('profile:work.focus.core', { defaultValue: 'Core' }) : '');
// A focus word as the reader reads it: a preset's label in their language, or the coach's own words.
const FOCUS_WORDS = { strength: 'Strength', conditioning: 'Conditioning', beginners: 'Beginners welcome', hypertrophy: 'Hypertrophy', cut: 'Cut', return: 'Return to gym', '5k': '5k prep', mobility: 'Mobility' };
export const bsFocusWordLabel = (tr, f) => {
  if (!f) return '';
  if (f.id) return FOCUS_WORDS[f.id] ? tr(`profile:work.word.${f.id}`, { defaultValue: FOCUS_WORDS[f.id] }) : '';
  return f.w || '';
};
export const bsStudioForLabel = (tr, f) => (
  !f ? '' : f.id === 'new' ? tr('profile:work.for.new', { defaultValue: 'New to lifting' })
    : f.id === 'lifting' ? tr('profile:work.for.lifting', { defaultValue: 'Lifting already' }) : (f.w || ''));

export function BSStudioWorkTab({ t, tr, locale, ACC, ink, DISPLAY, MONO, gutter = 22, stickyTop = 0, model, first, isSelf, heat, hasMessage,
  onProgram, onVideo, onWork, onMessage, onDescribe, onPostVideo }) {
  const INK = t.INK;
  const ON_INK = t.isLight ? '#f6f0e3' : '#13110d';
  const glass = bsStudioGlass(t);
  const progs = model.programs;
  const works = model.workouts;
  const coaching = model.coaching;
  const [focus, setFocus] = React.useState('all');
  const [open, setOpen] = React.useState(null);
  const focusNow = focus === 'all' || model.foci.some(([f]) => f === focus) ? focus : 'all';
  const shown = focusNow === 'all' ? works : works.filter((w) => w.focus === focusNow);
  const refs = { programs: React.useRef(null), workouts: React.useRef(null), coaching: React.useRef(null) };
  const jump = (k) => { const el = refs[k].current; if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
  const kicker = { fontFamily: MONO, fontSize: 9.5, lineHeight: '12px', letterSpacing: '0.13em', textTransform: 'uppercase', color: ink(0.62), whiteSpace: 'nowrap' };
  const kickB = { fontWeight: 700, color: INK };
  const counts = [['programs', progs.length, tr('profile:work.programs', { defaultValue: 'Programs' })], ['workouts', works.length, tr('profile:work.workouts', { defaultValue: 'Workouts' })], ['coaching', coaching ? 1 : 0, tr('profile:work.coaching', { defaultValue: 'Coaching' })]];
  const tray = { ...glass, margin: `10px ${Math.max(8, gutter - 12)}px 0`, padding: '0 12px' };
  const linkStyle = { minHeight: 44, padding: 0, border: 0, background: 'transparent', color: ACC, fontFamily: DISPLAY, fontSize: 14.5, fontWeight: 600, cursor: 'pointer' };
  const hint = (text) => <p style={{ margin: '8px 0 0', fontSize: 13.5, lineHeight: 1.45, color: ink(0.7) }}>{text}</p>;

  const Head = ({ k, title, count, sub }) => (
    <div ref={refs[k]} data-studio-head={k} style={{ margin: `24px ${gutter}px 0`, paddingTop: 10, borderTop: `2px solid ${INK}`, scrollMarginTop: stickyTop + 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <h2 style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 600, fontSize: 25, lineHeight: '28px', letterSpacing: '-0.01em', color: INK }}>{title}<span style={{ color: ACC }}>.</span></h2>
        <span style={{ fontFamily: DISPLAY, fontWeight: 400, fontSize: 25, lineHeight: '28px', color: ink(0.6), fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      </div>
      {sub ? <p style={{ margin: '3px 0 0', fontSize: 13, lineHeight: '18px', color: ink(0.78) }}>{sub}</p> : null}
    </div>
  );
  const Price = ({ value, unit }) => (
    <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
      <b style={{ display: 'block', fontFamily: DISPLAY, fontWeight: 600, fontSize: 20, lineHeight: '22px', color: INK, fontVariantNumeric: 'tabular-nums' }}>{value}</b>
      {unit ? <span style={{ ...kicker, display: 'block', marginTop: 3, fontSize: 9 }}>{unit}</span> : null}
    </span>
  );
  const factsOf = (p) => [
    p.weeks ? tr('profile:trainer.programWeeks', { defaultValue: '{count, plural, one {# week} other {# weeks}}', count: p.weeks }) : null,
    p.perWeek ? tr('profile:trainer.programDays', { defaultValue: '{count, plural, one {# day a week} other {# days a week}}', count: p.perWeek }) : null,
  ].filter(Boolean).join(' · ');
  const movesSaid = (n) => tr('profile:trainer.movesCount', { defaultValue: '{count, plural, one {# move} other {# moves}}', count: n });

  return (
    <section data-studio-work="" style={{ position: 'relative', paddingBottom: 30, isolation: 'isolate' }}>
      <BSStudioMesh t={t} heat={heat} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        {isSelf ? (
          <div style={{ padding: `8px ${gutter}px 0`, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {onPostVideo ? <button type="button" data-post-video="" onClick={onPostVideo} style={linkStyle}>＋ {tr('profile:trainer.postVideo', { defaultValue: 'Post a workout video' })}</button> : null}
            {onDescribe ? <button type="button" data-studio-describe="" onClick={onDescribe} style={linkStyle}>{tr('profile:work.describe', { defaultValue: 'Write a line about each' })} →</button> : null}
          </div>
        ) : null}

        {/* The jump line: how many of each, and the way to each */}
        <div data-studio-jump="" style={{ ...glass, margin: `${isSelf ? 4 : 14}px ${Math.max(8, gutter - 12)}px 0`, padding: '8px 11px' }}>
          <GlassEdge t={t} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {counts.map(([k, n, label], i) => (
              <button key={k} type="button" data-studio-jump-to={k} disabled={!n} onClick={() => jump(k)}
                aria-label={tr('profile:work.jumpTo', { defaultValue: '{count} {section}: go to them', count: n, section: label })}
                style={{ minHeight: 44, padding: '2px 0 2px 12px', border: 0, borderLeft: i ? `1px solid ${ink(0.3)}` : 0, background: 'transparent', color: INK, textAlign: 'left', cursor: n ? 'pointer' : 'default', opacity: n ? 1 : 0.55 }}>
                <b style={{ display: 'block', fontFamily: DISPLAY, fontWeight: 500, fontSize: 21, lineHeight: '24px', fontVariantNumeric: 'tabular-nums' }}>{n}</b>
                <span style={{ ...kicker, display: 'flex', alignItems: 'center', gap: 5, marginTop: 2, fontWeight: 600, color: ink(0.78) }}>{label}<span aria-hidden="true">⌄</span></span>
              </button>
            ))}
          </div>
        </div>

        {/* Programs */}
        {progs.length || isSelf ? (
          <div data-studio-programs="">
            <Head k="programs" title={tr('profile:work.programs', { defaultValue: 'Programs' })} count={progs.length} sub={tr('profile:work.programsSub', { defaultValue: 'Plans that run for weeks. Buy once, yours to keep.' })} />
            {progs.length ? (
              <div style={tray}>
                <GlassEdge t={t} />
                {progs.map((p, i) => {
                  const lead = i === 0;
                  const facts = factsOf(p);
                  const forSaid = bsStudioForLabel(tr, p.forWho);
                  const body = (
                    <>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ ...kicker, display: 'block', ...kickB }}>{tr('profile:work.kindProgram', { defaultValue: 'Program' })}</span>
                        <span style={{ display: 'block', marginTop: 3, fontSize: 17, lineHeight: '22px', fontWeight: 650, color: INK }}>{p.name}</span>
                        {p.desc ? <span data-studio-desc="" style={{ display: '-webkit-box', marginTop: 3, fontSize: 13, lineHeight: '18px', color: INK, WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.desc}</span> : null}
                        {facts ? <span style={{ display: 'block', marginTop: 3, fontSize: 13, lineHeight: '18px', color: ink(0.78) }}>{facts}</span> : null}
                        {forSaid ? <span data-studio-for="" style={{ display: 'flex', gap: 7, alignItems: 'baseline', marginTop: 4, fontSize: 13, fontWeight: 600, color: INK }}><span style={kicker}>{tr('profile:work.forLabel', { defaultValue: 'For' })}</span>{forSaid}</span> : null}
                      </span>
                      {p.price ? <Price value={p.price} unit={p.paid ? tr('profile:work.once', { defaultValue: 'Once' }) : ''} /> : <span />}
                    </>
                  );
                  const rowStyle = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: 16, padding: '14px 0 15px', borderBottom: i < progs.length - 1 ? `1px solid ${ink(0.14)}` : 0 };
                  if (!lead) {
                    return <button key={p.key} type="button" data-program="" onClick={() => onProgram(p.pr)} style={{ ...rowStyle, width: '100%', border: 0, borderBottom: rowStyle.borderBottom, background: 'transparent', color: INK, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>{body}</button>;
                  }
                  return (
                    <div key={p.key} data-program="" data-lead="" style={rowStyle}>
                      {body}
                      <span style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: p.pr && p.pr.video ? '1fr 1fr' : '1fr', gap: 8, marginTop: 12 }}>
                        {p.pr && p.pr.video ? <button type="button" data-program-preview="" onClick={() => onProgram(p.pr)} style={{ minHeight: 44, borderRadius: 6, border: `1px solid ${INK}`, background: 'transparent', color: INK, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>▷ {tr('profile:work.preview', { defaultValue: 'Preview' })}</button> : null}
                        <button type="button" data-program-open="" onClick={() => onProgram(p.pr)} style={{ minHeight: 44, borderRadius: 6, border: 0, background: INK, color: ON_INK, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{tr('profile:work.open', { defaultValue: 'Open' })}</button>
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : <div style={{ padding: `0 ${gutter}px` }}>{hint(tr('profile:trainer.programsEmptySelf', { defaultValue: 'Publish a program and it shows here with its preview video, for members to buy.' }))}</div>}
          </div>
        ) : null}

        {/* Workouts */}
        {works.length || isSelf ? (
          <div data-studio-workouts="">
            <Head k="workouts" title={tr('profile:work.workouts', { defaultValue: 'Workouts' })} count={works.length} sub={tr('profile:work.workoutsSub', { defaultValue: "One session each: program days and {name}'s videos.", name: first })} />
            {model.foci.length > 1 || (model.foci.length === 1 && model.foci[0][1] < works.length) ? (
              <div data-studio-filter="" role="group" aria-label={tr('profile:work.filterAria', { defaultValue: 'Workouts by focus' })} className="bs-hide-scroll"
                style={{ position: 'sticky', top: stickyTop, zIndex: 3, marginTop: 8, padding: `0 ${gutter}px`, display: 'flex', gap: 6, overflowX: 'auto', background: hexA(t.PAPER, 0.78), backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
                {[['all', works.length], ...model.foci].map(([f, n]) => {
                  const on = f === focusNow;
                  return (
                    <button key={f} type="button" data-studio-focus={f} aria-pressed={on} onClick={() => { setFocus(f); setOpen(null); }}
                      style={{ flex: 'none', minHeight: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      <span style={{ height: 32, padding: '0 10px 0 11px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, background: on ? INK : 'transparent', color: on ? ON_INK : INK, boxShadow: on ? 'none' : `inset 0 0 0 1px ${ink(0.34)}` }}>
                        {f === 'all' ? tr('profile:work.all', { defaultValue: 'All' }) : bsStudioFocusLabel(tr, f)}
                        <em style={{ fontStyle: 'normal', fontFamily: MONO, fontSize: 11, fontWeight: 500, opacity: on ? 0.75 : 0.7, fontVariantNumeric: 'tabular-nums' }}>{n}</em>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            {shown.length ? (
              <div style={tray}>
                <GlassEdge t={t} />
                {shown.map((w, i) => {
                  const isOpen = open === w.key && w.kind === 'day';
                  const focusSaid = bsStudioFocusLabel(tr, w.focus);
                  const label = w.pick
                    ? <><b style={kickB}>{tr('profile:work.kindWorkout', { defaultValue: 'Workout' })}</b> · <em style={{ fontStyle: 'normal', fontWeight: 700, color: ACC }}>{tr('profile:work.pick', { defaultValue: "{name}'s pick", name: first })}</em></>
                    : <><b style={kickB}>{tr('profile:work.kindWorkout', { defaultValue: 'Workout' })}</b>{focusSaid ? ` · ${focusSaid}` : w.kind === 'video' ? ` · ${tr('profile:work.kindVideo', { defaultValue: 'Video' })}` : ''}</>;
                  const facts = w.kind === 'day'
                    ? [w.program && w.program.name, bsStudioWeekday(w.label, locale), w.moves.length ? movesSaid(w.moves.length + (w.more || 0)) : null].filter(Boolean).join(' · ')
                    : [tr('profile:work.kindVideo', { defaultValue: 'Video' }), w.ago ? bsShortAge(w.ago, tr) : null].filter(Boolean).join(' · ');
                  return (
                    <div key={w.key} data-workout="" data-kind={w.kind} data-pick={w.pick ? '' : undefined} style={{ position: 'relative', borderBottom: i < shown.length - 1 ? `1px solid ${ink(0.14)}` : 0 }}>
                      {w.pick ? <span aria-hidden="true" style={{ position: 'absolute', left: -10, top: 12, bottom: 13, width: 2, background: ACC }} /> : null}
                      <button type="button" aria-expanded={w.kind === 'day' ? isOpen : undefined} onClick={() => (w.kind === 'day' ? setOpen(isOpen ? null : w.key) : onVideo(w.v))}
                        style={{ width: '100%', padding: '12px 0 13px', border: 0, background: 'transparent', color: INK, textAlign: 'left', cursor: 'pointer', display: 'grid', gridTemplateColumns: '48px minmax(0, 1fr) 18px', columnGap: 12, alignItems: 'start', fontFamily: 'inherit' }}>
                        {w.kind === 'day' ? (
                          <span aria-hidden="true" style={{ width: 48, height: 48, borderRadius: 6, boxShadow: `inset 0 0 0 1px ${ink(0.34)}`, display: 'grid', placeItems: 'center', fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: INK }}>{w.label}</span>
                        ) : (
                          <span aria-hidden="true" style={{ position: 'relative', width: 48, height: 48, borderRadius: 6, overflow: 'hidden', background: `linear-gradient(135deg, #15171b, ${hexA(ACC, 0.45)})`, display: 'grid', placeItems: 'center' }}>
                            {w.video && isVideoFile(w.video.url) ? <video src={`${w.video.url}#t=0.1`} muted playsInline preload="metadata" tabIndex={-1} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} /> : null}
                            <span style={{ position: 'relative', color: '#fff', fontSize: 14, textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>▶</span>
                          </span>
                        )}
                        <span style={{ minWidth: 0 }}>
                          <span style={{ ...kicker, display: 'block' }}>{label}</span>
                          <span style={{ display: 'block', marginTop: 3, fontSize: 15.5, lineHeight: '20px', fontWeight: 650 }}>{w.title || tr('profile:trainer.workoutVideo', { defaultValue: 'Workout video' })}</span>
                          {w.desc ? <span data-studio-desc="" style={{ display: '-webkit-box', marginTop: 2, fontSize: 13, lineHeight: '18px', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{w.desc}</span> : null}
                          <span style={{ display: 'block', marginTop: 2, fontSize: 13, lineHeight: '18px', color: ink(0.78) }}>{facts}</span>
                        </span>
                        <span aria-hidden="true" style={{ alignSelf: 'center', justifySelf: 'end', color: ink(0.62), fontSize: 13, transform: isOpen ? 'rotate(90deg)' : 'none' }}>{w.kind === 'video' ? '▷' : '›'}</span>
                      </button>
                      {isOpen ? (
                        <div data-workout-moves="" style={{ marginLeft: 60, paddingBottom: 12 }}>
                          {w.moves.map((m, k) => (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, minHeight: 31, borderTop: `1px solid ${ink(0.14)}`, fontSize: 13.5, fontWeight: 500 }}>
                              <span style={{ minWidth: 0 }}>{m.name}</span>{m.muscle ? <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 400, color: ink(0.74) }}>{m.muscle}</span> : null}
                            </div>
                          ))}
                          {w.more ? <div style={{ minHeight: 31, display: 'flex', alignItems: 'center', borderTop: `1px solid ${ink(0.14)}`, fontSize: 12.5, color: ink(0.74) }}>＋{w.more}</div> : null}
                          <button type="button" data-workout-program="" onClick={() => onProgram(w.pr)} style={{ ...linkStyle, display: 'block', marginTop: 4, color: INK, textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: ink(0.34), fontFamily: 'inherit', fontSize: 13.5 }}>
                            {tr('profile:work.setsIn', { defaultValue: 'Sets and loads are in {program}', program: w.program ? w.program.name : '' })} →
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : <div style={{ padding: `0 ${gutter}px` }}>{hint(tr('profile:work.workoutsEmptySelf', { defaultValue: "Post a workout video, or publish a program, and its sessions show here." }))}</div>}
          </div>
        ) : null}

        {/* Coaching */}
        {coaching || isSelf ? (
          <div data-studio-coaching="">
            <Head k="coaching" title={tr('profile:work.coaching', { defaultValue: 'Coaching' })} count={coaching ? 1 : 0} sub={tr('profile:work.coachingSub', { defaultValue: 'Written for you, changed as you go. Paid monthly.' })} />
            {coaching ? (
              <div data-coaching-card="" style={{ ...glass, margin: `12px ${Math.max(8, gutter - 12)}px 0`, padding: 16 }}>
                <GlassEdge t={t} />
                <span style={{ ...kicker, display: 'block' }}><b style={kickB}>{tr('profile:work.coaching', { defaultValue: 'Coaching' })}</b> · {tr('profile:work.monthly', { defaultValue: 'Monthly' })}</span>
                <div style={{ marginTop: 4, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: 16, alignItems: 'start' }}>
                  <span style={{ fontSize: 17, lineHeight: '22px', fontWeight: 650, color: INK }}>{tr('profile:work.coachingWith', { defaultValue: 'Coaching with {name}', name: first })}</span>
                  <Price value={`$${coaching.price}`} unit={tr('profile:work.aMonth', { defaultValue: 'A month' })} />
                </div>
                {coaching.desc ? <p data-studio-desc="" style={{ margin: '8px 0 0', fontSize: 13.5, lineHeight: '19px', color: INK }}>{coaching.desc}</p> : null}
                {coaching.includes.length ? (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${ink(0.14)}` }}>
                    <span style={{ ...kicker, display: 'block' }}>{tr('profile:work.youGet', { defaultValue: 'What you get' })}</span>
                    <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none' }}>
                      {coaching.includes.map((x, k) => <li key={k} style={{ display: 'flex', gap: 8, fontSize: 13.5, lineHeight: '20px', marginTop: 3, color: INK }}><span aria-hidden="true" style={{ color: ACC }}>✓</span>{x}</li>)}
                    </ul>
                  </div>
                ) : null}
                {!isSelf ? (
                  <div style={{ display: 'grid', gridTemplateColumns: hasMessage ? '1fr 1fr' : '1fr', gap: 8, marginTop: 16 }}>
                    <button type="button" data-coaching-apply="" onClick={onWork} style={{ minHeight: 46, borderRadius: 6, border: 0, background: INK, color: ON_INK, fontSize: 14.5, fontWeight: 600, cursor: 'pointer' }}>{tr('profile:work.apply', { defaultValue: 'Apply' })}</button>
                    {hasMessage ? <button type="button" onClick={onMessage} style={{ minHeight: 46, borderRadius: 6, border: `1px solid ${INK}`, background: 'transparent', color: INK, fontSize: 14.5, fontWeight: 600, cursor: 'pointer' }}>{tr('profile:trainer.message', { defaultValue: 'Message {name}', name: first })}</button> : null}
                  </div>
                ) : null}
              </div>
            ) : <div style={{ padding: `0 ${gutter}px` }}>{hint(tr('profile:work.coachingEmptySelf', { defaultValue: 'Give your listing a monthly price and your coaching shows here.' }))}</div>}
          </div>
        ) : null}
      </div>
    </section>
  );
}
