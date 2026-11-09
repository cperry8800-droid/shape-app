import React from 'react';
import { bsMpGlass } from './BSMemberBento.jsx';

// ─── THE SETTINGS ROOT, A LIT PANEL ──────────────────────────────────────────────────────────────
// The owner's pick (2026-11-04, "option C for settings page", after "new design for settings page" with
// less clutter and smaller sizes): an instrument panel. The masthead and ← Back as every page has them,
// then a dotted-glass profile plate with the tier in a lit slot and its two actions; the two quick
// switches, each state a lit slot; Preview as / Profile mode as lit buttons; the doors as a two-column
// grid of tiles with lit numbers; then Also and Sign out.
//
// Moved out of iosAppBroadsheetClient.jsx's BSSettings (the root view only; every pane stays there).
// BSSettings composes what this draws, beside the state it reads: the identity line, the switches and
// their writer (setPref), the pickers (setTweak('role')), the doors (passportTiles, alsoRows) and where
// each one opens (setDetail). This file only lays them out, so nothing here can write a setting.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP (see BSIntegrationsPage.jsx): useBS,
// BSMastRow, BSBackRow and BS_MAST_TOP_CSS are the chrome's; BSMeCorner and BSFacetAvatar are the client
// module's, put on window by its body, which runs after this file is imported.

// The i18n translator for this module, the same self-contained copy every feature module carries.
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

const hexA = (hex, a) => {
  const h = String(hex || '#888888').replace('#', '');
  const s = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const n = parseInt(s, 16);
  if (!Number.isFinite(n)) return hex;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

// ─── THE LIT PANEL'S PARTS, SHARED WITH EVERY PANE ───────────────────────────────────────────────
// Owner, 2026-11-09: "need to improve every other page in app settings with updated look". The panes
// (BSSettings in iosAppBroadsheetClient.jsx: Account, Notifications, Customize, Edit profile and the
// rest) draw with these same parts, so a pane and the root cannot drift apart: the head, a group's
// label, the glass plate, the lit slot and its lamp.

// The Settings teal (the theme's, whatever accent the member chose) and its deeper pair for small text.
export const bsSetTeal = (t) => (t && t.isLight ? '#0a8f87' : '#34d6c5');
export const bsSetTealInk = (t) => (t && t.isLight ? '#0a7a72' : '#34d6c5');
// The lit slot: a dark inset on a dark paper (a faint ink wash on a light one), a 1px frame in its colour
// and figures that glow on a dark paper only. Unlit, the frame and the words fall back to the ink.
export function bsSetLed(t, c, on = true) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5, boxSizing: 'border-box', padding: '3px 7px', borderRadius: 6,
    background: t.isLight ? hexA(t.INK, 0.05) : 'rgba(0,0,0,0.45)',
    border: `1px solid ${on ? hexA(c, t.isLight ? 0.5 : 0.6) : hexA(t.INK, 0.16)}`,
    color: on ? c : t.INK50, textShadow: on && !t.isLight ? `0 0 8px ${hexA(c, 0.75)}` : 'none',
    fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
  };
}
export function BSSetLamp({ t, c, on = true }) {
  return <span aria-hidden="true" style={{ flexShrink: 0, width: 6, height: 6, borderRadius: 99, background: on ? c : hexA(t.INK, 0.25), boxShadow: on && !t.isLight ? `0 0 6px ${c}` : 'none' }} />;
}
// The glass plate every group sits on (the profile plate takes its dots, `grid`).
export const bsSetPlate = (t, radius = 16, grid = false) => bsMpGlass(t, t.INK, { radius, grid });
// A group's label: a lit dot, the words in mono capitals, and anything it carries on the right.
export function BSSetLabel({ t, children, meta = null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingBottom: 8, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}><BSSetLamp t={t} c={bsSetTeal(t)} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span></span>{meta}
    </div>
  );
}
// The head of the root and of every pane: the masthead row and ← as every page has them, then the title
// over a teal hairline. No kicker over the title (owner, 2026-11-09, of "02 · SETTINGS" over a pane's
// title: "remove this", "everywhere in settings").
function bsSetNoBar() { return null; }
export function BSSettingsHead({ title, onBack }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const MastRow = window.BSMastRow;
  const BackRow = window.BSBackRow;
  const MeCorner = window.BSMeCorner;
  const mastTop = window.BS_MAST_TOP_CSS || 'max(44px, calc(env(safe-area-inset-top, 0px) + 12px), var(--bs-notch-floor, 0px))';
  const teal = bsSetTeal(t);
  // Inside a BSPage the head scrolls away and the page's pinned bar takes ← and the title in one line
  // once the title has gone under it, as a BSDetailHeader's does (useBSDetailBar, the chrome's).
  const titleRef = (window.useBSDetailBar || bsSetNoBar)(title, onBack);
  return (
    <>
      <div style={{ padding: `${mastTop} ${t.padX}px 2px` }}>
        {MastRow && <MastRow trailing={MeCorner ? <MeCorner /> : null} />}
        {BackRow && <BackRow onBack={onBack} label={tr('settings:head.back', { defaultValue: 'Back' })} />}
      </div>
      <div data-settings-head="" style={{ padding: `6px ${t.padX}px 0` }}>
        <div ref={titleRef || undefined} role="heading" aria-level={1} style={{ fontFamily: t.DISPLAY, fontSize: 28, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.05, color: t.INK, overflowWrap: 'anywhere' }}>{title}</div>
        <div aria-hidden="true" style={{ marginTop: 10, height: 1, background: `linear-gradient(90deg, ${teal}, ${hexA(teal, 0.25)} 45%, transparent)`, boxShadow: t.isLight ? 'none' : `0 0 8px ${hexA(teal, 0.6)}` }} />
      </div>
    </>
  );
}

// identity: { name, sub, initial, photo, ring (the avatar's tier colour), tierColor, tierLine, statusLine }
// switches: [{ k, label, on, value, onToggle }]
// modes:    [{ key, title, meta, label, opts: [[role, label]], value, hint }]  (Preview as, Profile mode)
// tiles:    [{ detail, title, summary }]   also: [{ detail, title, summary, value }]
export function BSSettingsRoot({ onBack, identity = {}, onEdit, onPublicProfile, switches = [], modes = [], onPickRole, tiles = [], also = [], onOpen, onLogout }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const Avatar = window.BSFacetAvatar;
  const teal = bsSetTeal(t);
  const tealInk = bsSetTealInk(t);
  const amber = t.AMBER || '#d8a23a';
  const ell = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
  const led = (c, on = true) => bsSetLed(t, c, on);
  // The lamp and the label are called, not mounted: plain parts with no state of their own, drawn
  // inline in this panel's own tree.
  const lamp = (c, on) => BSSetLamp({ t, c, on });
  const label = (txt, meta = null) => BSSetLabel({ t, meta, children: txt });
  const plate = (radius = 16, grid = false) => bsSetPlate(t, radius, grid);
  const open = (detail) => { if (typeof onOpen === 'function') onOpen(detail); };

  return (
    <div data-bs-settings-root="">
      <BSSettingsHead title={tr('settings:head.title', { defaultValue: 'Settings' })} onBack={onBack} />

      {/* Who you are: the avatar, the name, the handle and city only when they are the member's own, the
          tier in its colour's lit slot and the membership or role beside it; then Edit profile and
          Public profile ↗, each half of the plate's foot. */}
      <div data-settings-identity="" style={{ ...plate(18, true), margin: `14px ${t.padX}px 0`, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
          {Avatar ? <Avatar size={46} c={identity.ring} initial={identity.initial} name={identity.name} photo={identity.photo} BG={t.PAPER} /> : null}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 19, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.1, color: t.INK, ...ell }}>{identity.name}</div>
            {identity.sub ? <div style={{ marginTop: 1, fontFamily: t.BODY, fontSize: 12, color: t.INK50, ...ell }}>{identity.sub}</div> : null}
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              <span data-settings-tier="" style={led(identity.tierColor)}>{lamp(identity.tierColor, true)}{identity.tierLine}</span>
              {identity.statusLine ? <span style={{ minWidth: 0, fontFamily: t.MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, ...ell }}>{identity.statusLine}</span> : null}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', borderTop: `1px solid ${t.HAIR}` }}>
          <button type="button" onClick={onEdit} style={{ flex: 1, minWidth: 0, minHeight: 44, border: 0, background: 'transparent', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: tealInk, textShadow: t.isLight ? 'none' : `0 0 8px ${hexA(teal, 0.6)}`, ...ell }}>{tr('settings:passport.edit', { defaultValue: 'Edit profile' })}</button>
          <span aria-hidden="true" style={{ width: 1, background: t.HAIR }} />
          <button type="button" onClick={onPublicProfile} style={{ flex: 1, minWidth: 0, minHeight: 44, border: 0, background: 'transparent', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK70, ...ell }}>{tr('settings:more.publicProfile', { defaultValue: 'Public profile' })}<span aria-hidden="true"> ↗</span></button>
        </div>
      </div>

      {/* The quick switches: each half of one plate is the control, its state a lit slot. */}
      <div style={{ padding: `20px ${t.padX}px 0` }}>
        {label(tr('settings:passport.quick', { defaultValue: 'Quick switches' }))}
        <div style={{ ...plate(16), display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, switches.length)}, minmax(0, 1fr))`, overflow: 'hidden' }}>
          {switches.map((s, i) => (
            <button key={s.k} type="button" data-settings-switch={s.k} onClick={s.onToggle} aria-pressed={!!s.on} style={{ minWidth: 0, minHeight: 60, padding: '10px 14px', border: 0, borderLeft: i ? `1px solid ${t.HAIR}` : 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', color: t.INK, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 6 }}>
              <span style={{ maxWidth: '100%', fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 500, letterSpacing: '-0.01em', lineHeight: 1.1, ...ell }}>{s.label}</span>
              <span data-settings-switch-slot={s.on ? 'on' : 'off'} style={led(tealInk, !!s.on)}>{lamp(teal, !!s.on)}{s.value}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Preview as (signed-out demo) and Profile mode (more than one account): lit buttons, the chosen
          one lit. */}
      {modes.map((m) => (
        <div key={m.key} data-settings-mode={m.key} style={{ padding: `20px ${t.padX}px 0` }}>
          {label(m.title, m.meta ? <span style={led(amber)}>{m.meta}</span> : null)}
          <div style={{ marginBottom: 6, fontFamily: t.MONO, fontSize: 7.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50 }}>{m.label}</div>
          <div role="radiogroup" aria-label={m.label} style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, m.opts.length)}, minmax(0, 1fr))`, gap: 6 }}>
            {m.opts.map(([key, text]) => {
              const on = m.value === key;
              return (
                <button key={key} type="button" role="radio" aria-checked={on} data-settings-role={key} onClick={() => { if (typeof onPickRole === 'function') onPickRole(key); }}
                  style={{ ...led(tealInk, on), justifyContent: 'center', minWidth: 0, minHeight: 44, borderRadius: 8, cursor: 'pointer', fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {lamp(teal, on)}{text}
                </button>
              );
            })}
          </div>
          {m.hint ? <div style={{ marginTop: 7, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.06em', color: t.INK50, lineHeight: 1.45 }}>{m.hint}</div> : null}
        </div>
      ))}

      {/* The doors: a two-column grid of tiles, each numbered in a lit slot, its name, and what is behind
          it (the tile's summary is the pane's own current value). */}
      <div style={{ padding: `22px ${t.padX}px 0` }}>
        {label(tr('settings:more.sectionsMeta', { n: tiles.length, defaultValue: '{n} sections' }))}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          {tiles.map((c, i) => (
            <button key={c.detail} type="button" data-settings-door={c.detail} onClick={() => open(c.detail)} style={{ ...plate(14), minWidth: 0, minHeight: 88, padding: '10px 12px 11px', cursor: 'pointer', textAlign: 'left', color: t.INK, display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ ...led(tealInk), padding: '2px 6px' }}>{String(i + 1).padStart(2, '0')}</span>
                <span aria-hidden="true" style={{ fontFamily: t.DISPLAY, fontSize: 14, color: t.INK50, lineHeight: 1 }}>→</span>
              </span>
              <span style={{ marginTop: 9, fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 500, letterSpacing: '-0.01em', lineHeight: 1.15, overflowWrap: 'anywhere' }}>{c.title}</span>
              {c.summary ? <span style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.summary}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {/* Also: the doors that are not settings (More, About with the build, Account actions), as rows. */}
      <div style={{ padding: `22px ${t.padX}px 0` }}>
        {label(tr('settings:passport.also', { defaultValue: 'Also' }))}
        <div style={{ ...plate(16), overflow: 'hidden' }}>
          {also.map((c, i) => (
            <button key={c.detail} type="button" data-settings-door={c.detail} onClick={() => open(c.detail)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, minHeight: 50, padding: '8px 14px', border: 0, borderTop: i ? `1px solid ${t.HAIR}` : 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', color: t.INK, boxSizing: 'border-box' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 14.5, fontWeight: 500 }}>{c.title}</span>
                {c.summary ? <span style={{ display: 'block', marginTop: 1, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, ...ell }}>{c.summary}</span> : null}
              </span>
              {c.value ? <span style={led(t.INK70, false)}>{c.value}</span> : null}
              <span aria-hidden="true" style={{ fontFamily: t.DISPLAY, fontSize: 14, color: t.INK50, lineHeight: 1 }}>→</span>
            </button>
          ))}
        </div>
      </div>

      {/* Sign out: ink, never red, with room before the footer. */}
      <div style={{ padding: `20px ${t.padX}px 30px` }}>
        <button type="button" data-settings-signout="" onClick={onLogout} style={{ width: '100%', minHeight: 44, borderRadius: 10, border: `1px solid ${t.RULE}`, background: 'transparent', cursor: 'pointer', color: t.INK70, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' }}>{tr('settings:action.signOut', { defaultValue: 'Sign out' })}</button>
      </div>
    </div>
  );
}
