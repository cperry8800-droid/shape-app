import React from 'react';
import {
  BS_HOURS_DAYS, BS_HOURS_STEP, bsHoursEmpty, bsHoursFromRows, bsHoursProblems, bsHoursValid, bsHoursToRows,
  bsHoursTotal, bsHoursSame, bsHoursCopy, bsHoursClone, bsHoursNextBlock, bsHoursToInput, bsHoursFromInput, bsHoursLabel,
} from '../services/coachHours.mjs';
import { bsProjectAvailability, bsInstantInZone, bsIsZone } from '../services/coachAvailability.mjs';

// ─── YOUR HOURS (Settings → Your practice → Availability) ────────────────────────────────────
// Owner, 2026-10-27: "make sure coaches calendars/time slots all function properly. Make sure
// coaches have the ability to edit their time slots and customize their availability as they see
// fit." Until now the app had no hours editor at all: the Availability row opened the calendar,
// and hours, time off and booking rules could be set only on the website's Schedule page.
//
// Three stations, each on the same route as the website's, so either editor reads what the other
// saved:
//   Every week     blocks per day (9:00 to 12:00, 14:00 to 18:00), copied across days, saved
//                  together  →  /api/my-availability (the phone's zone rides along: the route
//                  refuses hours it cannot place)
//   Booking rules  the intro's length, notice, a break between sessions, a daily limit, intros
//                  while full; each tap saves that one rule  →  /api/my-booking-rules
//   Time off       whole days or part of one, with a private note  →  /api/my-time-off
//
// ⚠ WHAT MEMBERS SEE IS READ BACK, NOT ASSUMED. Under the week the page lists the next open times
// from the PUBLIC read members get (/api/availability), projected by the same module the listing
// books from, so a coach sees at once whether a change is bookable.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME (useBS, BSPage, BSDetailHeader, BSFooter): this file is a
// static import of the client module and evaluates before that module's body runs.

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

function intlLocale() {
  try { return window.ShapeI18n?.intlLocale?.() || window.ShapeI18n?.current?.() || undefined; } catch (e) { return undefined; }
}
// A weekday's short name in the reader's language (2024-01-07 was a Sunday).
function dayShort(wd, locale) {
  try { return new Date(Date.UTC(2024, 0, 7 + wd)).toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' }); } catch (e) { return BS_HOURS_DAYS.find(([d]) => d === wd)[1]; }
}
const teal = (t) => (t.isLight ? '#0a8f87' : '#34d6c5');
const onTeal = (t) => (t.isLight ? '#fff' : '#06231f');
const signedInNow = () => { try { return !!window.ShapeAuth?.getCachedState?.()?.user?.id; } catch (e) { return false; } };

// The sample a signed-out preview shows, and says it is one.
const PREVIEW_ROWS = [1, 2, 3, 4, 5].flatMap((wd) => [{ weekday: wd, start_minute: 540, duration_min: 180 }, { weekday: wd, start_minute: 840, duration_min: 240 }]);

function Switch({ t, on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      style={{ flex: 'none', width: 52, height: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
      <span aria-hidden style={{ position: 'relative', width: 40, height: 24, borderRadius: 99, background: on ? teal(t) : t.RULE, transition: 'background 160ms' }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 19 : 3, width: 18, height: 18, borderRadius: 99, background: on ? onTeal(t) : t.PAPER, transition: 'left 160ms' }} />
      </span>
    </button>
  );
}

function Eyebrow({ t, children, right }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, paddingBottom: 8, borderBottom: `2px solid ${t.INK}` }}>
      <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK }}>{children}</span>
      {right ? <span style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.06em', color: t.INK50 }}>{right}</span> : null}
    </div>
  );
}

function Chip({ t, on, onClick, children, disabled }) {
  return (
    <button type="button" aria-pressed={on} disabled={disabled} onClick={onClick}
      style={{ minHeight: 40, padding: '0 12px', borderRadius: 999, border: `1px solid ${on ? teal(t) : t.RULE}`, background: on ? `${teal(t)}22` : 'transparent', color: t.INK, fontFamily: t.DISPLAY, fontSize: 14, fontWeight: on ? 600 : 400, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap' }}>
      {children}
    </button>
  );
}

function Note({ t, children, tone, style }) {
  const color = tone === 'err' ? (t.RUST || '#c0533b') : tone === 'ok' ? teal(t) : t.INK70 || t.INK50;
  return <div role={tone ? 'status' : undefined} style={{ fontFamily: t.DISPLAY, fontSize: 13.5, lineHeight: 1.45, color, ...style }}>{children}</div>;
}

function TimeInput({ t, value, onChange, label, invalid }) {
  return (
    <input type="time" step={BS_HOURS_STEP * 60} aria-label={label} value={bsHoursToInput(value)}
      onChange={(e) => { const m = bsHoursFromInput(e.target.value); if (m != null) onChange(m); }}
      // The whole time reads, AM/PM included (owner, 2026-10-31: "these times are cut off"): the app's
      // narrower face with even digits, not the mono, and less padding around it.
      style={{ minWidth: 0, flex: 1, minHeight: 42, boxSizing: 'border-box', padding: '0 6px 0 9px', borderRadius: 10, border: `1px solid ${invalid ? (t.RUST || '#c0533b') : t.RULE}`, background: t.PAPER2, color: t.INK, colorScheme: t.isLight ? 'light' : 'dark', fontFamily: t.DISPLAY, fontVariantNumeric: 'tabular-nums', fontSize: 15, outline: 'none' }} />
  );
}

// ── Every week ────────────────────────────────────────────────────────────────────────────────
function WeekEditor({ t, tr, days, setDays, disabled }) {
  const locale = intlLocale();
  // A day switched off remembers its blocks, so switching it back on restores them.
  const closedMemo = React.useRef({});
  const [copyFrom, setCopyFrom] = React.useState(1);
  const problemText = {
    order: tr('coach:hours.problemOrder', { defaultValue: 'Ends before it starts.' }),
    short: tr('coach:hours.problemShort', { defaultValue: 'Make it at least 15 minutes.' }),
    overlap: tr('coach:hours.problemOverlap', { defaultValue: 'Runs into the hours above.' }),
  };
  const setDay = (wd, blocks) => { const next = bsHoursClone(days); next[wd] = blocks; setDays(next); };
  // An open day says how long it is open; its times are the inputs right under it.
  const dayTotal = (blocks) => {
    const one = bsHoursEmpty(); one[0] = blocks;
    const min = bsHoursTotal(one), h = Math.floor(min / 60), m = min % 60;
    return m ? tr('coach:hours.totalHm', { defaultValue: '{h} h {m} min', h, m }) : tr('coach:hours.totalH', { defaultValue: '{h, plural, one {# hour} other {# hours}}', h });
  };
  return (
    <div>
      {BS_HOURS_DAYS.map(([wd]) => {
        const blocks = days[wd] || [];
        const open = blocks.length > 0;
        const problems = bsHoursProblems(blocks);
        const name = dayShort(wd, locale);
        const nextBlock = bsHoursNextBlock(blocks);
        return (
          <div key={wd} data-hours-day={wd} style={{ padding: '10px 0', borderBottom: `1px solid ${t.HAIR || t.RULE}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 'none', width: 52, fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 600, color: t.INK }}>{name}</span>
              <span style={{ flex: 1, minWidth: 0, fontFamily: t.DISPLAY, fontSize: 13.5, color: open ? t.INK70 || t.INK50 : t.INK50 }}>
                {open ? dayTotal(blocks) : tr('coach:hours.closed', { defaultValue: 'Closed' })}
              </span>
              <Switch t={t} on={open} label={tr('coach:hours.openDay', { defaultValue: 'Open on {day}', day: name })}
                onChange={(on) => {
                  if (disabled) return;
                  if (on) setDay(wd, closedMemo.current[wd] && closedMemo.current[wd].length ? closedMemo.current[wd] : [bsHoursNextBlock([])]);
                  else { closedMemo.current[wd] = blocks; setDay(wd, []); }
                }} />
            </div>
            {open ? (
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {blocks.map((b, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <TimeInput t={t} value={b[0]} invalid={!!problems[i]} label={tr('coach:hours.fromLabel', { defaultValue: '{day}, from', day: name })}
                        onChange={(m) => { if (disabled) return; const next = blocks.map((x) => x.slice()); next[i][0] = m; setDay(wd, next); }} />
                      <span style={{ flex: 'none', fontFamily: t.DISPLAY, fontSize: 13, color: t.INK50 }}>{tr('coach:hours.to', { defaultValue: 'to' })}</span>
                      <TimeInput t={t} value={b[1]} invalid={!!problems[i]} label={tr('coach:hours.toLabel', { defaultValue: '{day}, until', day: name })}
                        onChange={(m) => { if (disabled) return; const next = blocks.map((x) => x.slice()); next[i][1] = m; setDay(wd, next); }} />
                      <button type="button" aria-label={tr('coach:hours.removeBlock', { defaultValue: 'Remove {from} to {to}', from: bsHoursLabel(b[0], locale), to: bsHoursLabel(b[1], locale) })}
                        onClick={() => { if (disabled) return; setDay(wd, blocks.filter((_, j) => j !== i)); }}
                        style={{ flex: 'none', width: 32, height: 44, marginRight: -6, padding: 0, border: 0, background: 'transparent', color: t.INK50, fontSize: 22, cursor: 'pointer' }}>×</button>
                    </div>
                    {problems[i] ? <Note t={t} tone="err" style={{ fontSize: 12.5, marginTop: 4 }}>{problemText[problems[i]]}</Note> : null}
                  </div>
                ))}
                {nextBlock ? (
                  <button type="button" onClick={() => { if (!disabled) setDay(wd, [...blocks.map((x) => x.slice()), nextBlock]); }}
                    style={{ alignSelf: 'flex-start', minHeight: 40, padding: '0 2px', border: 0, background: 'transparent', color: teal(t), fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                    ＋ {tr('coach:hours.addBlock', { defaultValue: 'Add hours' })}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
      <div role="group" aria-label={tr('coach:hours.copyAria', { defaultValue: 'Copy a day' })} style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: t.DISPLAY, fontSize: 14, color: t.INK70 || t.INK50 }}>{tr('coach:hours.copy', { defaultValue: 'Copy' })}</span>
        <select aria-label={tr('coach:hours.copyFrom', { defaultValue: 'Copy from' })} value={copyFrom} onChange={(e) => setCopyFrom(Number(e.target.value))}
          style={{ minHeight: 40, padding: '0 10px', borderRadius: 10, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, colorScheme: t.isLight ? 'light' : 'dark', fontFamily: t.DISPLAY, fontSize: 14 }}>
          {BS_HOURS_DAYS.map(([wd]) => <option key={wd} value={wd}>{dayShort(wd, locale)}</option>)}
        </select>
        <span style={{ fontFamily: t.DISPLAY, fontSize: 14, color: t.INK70 || t.INK50 }}>{tr('coach:hours.copyTo', { defaultValue: 'to' })}</span>
        {[['weekdays', tr('coach:hours.weekdays', { defaultValue: 'Weekdays' })], ['weekend', tr('coach:hours.weekend', { defaultValue: 'Weekend' })], ['all', tr('coach:hours.everyDay', { defaultValue: 'Every day' })]].map(([k, lbl]) => (
          <Chip key={k} t={t} disabled={disabled} onClick={() => setDays(bsHoursCopy(days, copyFrom, k))}>{lbl}</Chip>
        ))}
      </div>
    </div>
  );
}

// ── What members see: the public read, projected as the listing books it ─────────────────────
function MemberPreview({ t, tr, role, providerId, nonce }) {
  const locale = intlLocale();
  const [state, setState] = React.useState({ kind: 'loading' });
  React.useEffect(() => {
    if (!providerId || !window.ShapeCoachAvailability?.get) { setState({ kind: 'none' }); return undefined; }
    let on = true;
    setState({ kind: 'loading' });
    window.ShapeCoachAvailability.get(role, providerId, { fresh: true })
      .then((d) => {
        if (!on) return;
        if (!d || !Array.isArray(d.slots)) { setState({ kind: 'error' }); return; }
        if (d.slots.length && !bsIsZone(d.timezone)) { setState({ kind: 'nozone' }); return; }
        const len = Number(d.rules && d.rules.consultMin);
        const sessionMin = Number.isInteger(len) && len >= 5 && len <= 240 ? len : 15;
        const open = bsProjectAvailability({ slots: d.slots, booked: d.booked || [], weeks: 2, zone: d.timezone, busy: d.busy || [], rules: d.rules || null, sessionMin });
        setState({ kind: 'ready', open, atCapacity: d.atCapacity === true, intros: !!(d.rules && d.rules.introsAtCapacity) });
      })
      .catch(() => { if (on) setState({ kind: 'error' }); });
    return () => { on = false; };
  }, [role, providerId, nonce]);
  const fmt = (at) => {
    try { return new Date(at).toLocaleString(locale, { weekday: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return new Date(at).toISOString(); }
  };
  let body;
  if (state.kind === 'loading') body = <Note t={t}>{tr('coach:hours.previewLoading', { defaultValue: 'Reading what members see…' })}</Note>;
  else if (state.kind === 'none') body = <Note t={t}>{tr('coach:hours.previewNone', { defaultValue: 'Members see your open times once your listing is set up.' })}</Note>;
  else if (state.kind === 'error') body = <Note t={t}>{tr('coach:hours.previewError', { defaultValue: "Couldn't read your open times just now. Your hours are saved as shown above." })}</Note>;
  else if (state.kind === 'nozone') body = <Note t={t} tone="err">{tr('coach:hours.previewNoZone', { defaultValue: 'Your hours have no time zone yet, so members see no times. Save your hours once from this phone to fix it.' })}</Note>;
  else {
    // Full with intro calls closed: members join the waiting list and the listing offers no
    // times (its introClosed), so neither does this read-back (Codex on #2483).
    const closed = state.atCapacity && !state.intros;
    const first = closed ? [] : state.open.slice(0, 6);
    body = (
      <div>
        {state.atCapacity ? <Note t={t} style={{ marginBottom: 8 }}>{state.intros
          ? tr('coach:hours.previewFullIntros', { defaultValue: "You're full, so new members join your waiting list. They can still book a free intro call." })
          : tr('coach:hours.previewFull', { defaultValue: "You're full, so new members join your waiting list instead of booking." })}</Note> : null}
        {closed ? null : first.length ? (
          <>
            <Note t={t}>{tr('coach:hours.previewCount', { defaultValue: '{count, plural, one {# open time} other {# open times}} in the next two weeks. The next ones:', count: state.open.length })}</Note>
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {first.map((s) => (
                <span key={s.at} data-hours-preview="" style={{ padding: '7px 10px', borderRadius: 999, border: `1.5px dashed ${teal(t)}`, fontFamily: t.MONO, fontSize: 12, color: t.INK }}>{fmt(s.at)}</span>
              ))}
            </div>
          </>
        ) : <Note t={t}>{tr('coach:hours.previewEmpty', { defaultValue: 'No open times in the next two weeks. Add hours above, or check your time off and rules.' })}</Note>}
      </div>
    );
  }
  return <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: t.PAPER2 }}>
    <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, marginBottom: 8 }}>{tr('coach:hours.previewHead', { defaultValue: 'What members can book' })}</div>
    {body}
  </div>;
}

// ── Booking rules ────────────────────────────────────────────────────────────────────────────
function RulesEditor({ t, tr, role, disabled, onChanged }) {
  const [state, setState] = React.useState({ kind: disabled ? 'preview' : 'loading' });
  const [rules, setRules] = React.useState({ bufferMin: 0, maxPerDay: null, minNoticeHours: 0, consultMin: 15, introsAtCapacity: false });
  const [msg, setMsg] = React.useState(null);
  const [busy, setBusy] = React.useState(null);
  const [reload, setReload] = React.useState(0);
  React.useEffect(() => {
    if (disabled) return undefined;
    let on = true;
    setState({ kind: 'loading' });
    window.ShapeCoachHours.rules(role)
      .then((d) => { if (!on) return; if (d.rules) setRules(d.rules); setState({ kind: d.providerId ? (d.ready === false ? 'notready' : 'ready') : 'none' }); })
      .catch(() => { if (on) setState({ kind: 'error' }); });
    return () => { on = false; };
  }, [role, disabled, reload]);
  const save = async (key, value) => {
    if (disabled || busy) return;
    const before = rules;
    setRules({ ...rules, [key]: value }); setBusy(key); setMsg(null);
    try {
      const r = await window.ShapeCoachHours.saveRules(role, { [key]: value });
      if (r && r.rules) setRules(r.rules);
      setMsg({ tone: 'ok', text: tr('coach:hours.ruleSaved', { defaultValue: 'Saved.' }) });
      onChanged && onChanged();
    } catch (e) {
      setRules(before);
      setMsg({ tone: 'err', text: (e && e.message) || tr('coach:hours.ruleFailed', { defaultValue: "Couldn't save that. Try again." }) });
    } finally { setBusy(null); }
  };
  if (state.kind === 'loading') return <Note t={t} style={{ marginTop: 12 }}>{tr('coach:hours.rulesLoading', { defaultValue: 'Reading your rules…' })}</Note>;
  if (state.kind === 'error') return <div style={{ marginTop: 12 }}><Note t={t}>{tr('coach:hours.rulesError', { defaultValue: "Couldn't read your booking rules just now." })}</Note><Chip t={t} onClick={() => setReload((n) => n + 1)}>{tr('coach:hours.retry', { defaultValue: 'Try again' })}</Chip></div>;
  if (state.kind === 'none') return <Note t={t} style={{ marginTop: 12 }}>{tr('coach:hours.rulesNone', { defaultValue: 'Booking rules open once your coach application is approved.' })}</Note>;
  if (state.kind === 'notready') return <Note t={t} style={{ marginTop: 12 }}>{tr('coach:hours.rulesNotReady', { defaultValue: "Booking rules aren't set up yet. They'll be ready after the next update." })}</Note>;
  const min = (n) => tr('coach:hours.minutes', { defaultValue: '{n} min', n });
  const hrs = (n) => tr('coach:hours.hours', { defaultValue: '{n, plural, one {# hour} other {# hours}}', n });
  const withCurrent = (opts, cur) => (opts.some(([v]) => v === cur) ? opts : [...opts, [cur, null]].sort((a, b) => (a[0] == null ? -1 : b[0] == null ? 1 : a[0] - b[0])));
  const rows = [
    ['consultMin', tr('coach:hours.ruleIntro', { defaultValue: 'Free intro call' }), tr('coach:hours.ruleIntroSub', { defaultValue: 'How long a first call with a new member runs.' }),
      withCurrent([[10], [15], [20], [30], [45], [60]], rules.consultMin).map(([v]) => [v, min(v)])],
    ['minNoticeHours', tr('coach:hours.ruleNotice', { defaultValue: 'Notice before a booking' }), tr('coach:hours.ruleNoticeSub', { defaultValue: 'How soon a member can book you.' }),
      withCurrent([[0], [2], [12], [24], [48]], rules.minNoticeHours).map(([v]) => [v, v === 0 ? tr('coach:hours.none', { defaultValue: 'None' }) : hrs(v)])],
    ['bufferMin', tr('coach:hours.ruleBuffer', { defaultValue: 'Break between sessions' }), tr('coach:hours.ruleBufferSub', { defaultValue: 'Kept free after every session.' }),
      withCurrent([[0], [10], [15], [30]], rules.bufferMin).map(([v]) => [v, v === 0 ? tr('coach:hours.none', { defaultValue: 'None' }) : min(v)])],
    ['maxPerDay', tr('coach:hours.ruleMax', { defaultValue: 'Most bookings a day' }), tr('coach:hours.ruleMaxSub', { defaultValue: 'Members see no more times once a day is full.' }),
      withCurrent([[null], [2], [4], [6], [8]], rules.maxPerDay).map(([v]) => [v, v == null ? tr('coach:hours.noLimit', { defaultValue: 'No limit' }) : String(v)])],
  ];
  return (
    <div>
      {rows.map(([key, label, sub, opts]) => (
        <div key={key} data-hours-rule={key} style={{ padding: '12px 0', borderBottom: `1px solid ${t.HAIR || t.RULE}` }}>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600, color: t.INK }}>{label}</div>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 13, color: t.INK50, marginTop: 2 }}>{sub}</div>
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {opts.map(([v, lbl]) => <Chip key={String(v)} t={t} on={rules[key] === v} disabled={disabled || !!busy} onClick={() => { if (rules[key] !== v) save(key, v); }}>{lbl}</Chip>)}
          </div>
        </div>
      ))}
      <div data-hours-rule="introsAtCapacity" style={{ padding: '12px 0', borderBottom: `1px solid ${t.HAIR || t.RULE}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600, color: t.INK }}>{tr('coach:hours.ruleFullIntros', { defaultValue: 'Intro calls while you are full' })}</div>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 13, color: t.INK50, marginTop: 2 }}>{tr('coach:hours.ruleFullIntrosSub', { defaultValue: 'Let members on your waiting list book a free call.' })}</div>
        </div>
        <Switch t={t} on={!!rules.introsAtCapacity} label={tr('coach:hours.ruleFullIntros', { defaultValue: 'Intro calls while you are full' })} onChange={(v) => save('introsAtCapacity', v)} />
      </div>
      {msg ? <Note t={t} tone={msg.tone} style={{ marginTop: 8 }}>{msg.text}</Note> : null}
    </div>
  );
}

// ── Time off ─────────────────────────────────────────────────────────────────────────────────
// Today's date in the coach's stored zone, which the route reads whole days and part-days in
// (Codex on #2483: a coach travelling across the date line saw the phone's today). en-CA formats
// as YYYY-MM-DD. With no stored zone yet, the phone's own date.
const isoToday = (zone) => {
  if (zone) { try { return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch (e) {} }
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function TimeOffEditor({ t, tr, role, disabled, onChanged }) {
  const locale = intlLocale();
  const [state, setState] = React.useState({ kind: disabled ? 'preview' : 'loading' });
  const [list, setList] = React.useState([]);
  const [zone, setZone] = React.useState(null);
  const [adding, setAdding] = React.useState(false);
  const [mode, setMode] = React.useState('days');
  const [form, setForm] = React.useState(() => ({ from: isoToday(), to: isoToday(), date: isoToday(), start: 12 * 60, end: 17 * 60, note: '' }));
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState(null);
  const [reload, setReload] = React.useState(0);
  React.useEffect(() => {
    if (disabled) return undefined;
    let on = true;
    setState({ kind: 'loading' });
    window.ShapeCoachHours.timeOff(role)
      .then((d) => { if (!on) return; setList(Array.isArray(d.timeOff) ? d.timeOff : []); setZone(d.timezone || null); setState({ kind: d.providerId ? (d.ready === false ? 'notready' : 'ready') : 'none' }); })
      .catch(() => { if (on) setState({ kind: 'error' }); });
    return () => { on = false; };
  }, [role, disabled, reload]);
  const tz = bsIsZone(zone) ? zone : undefined;
  const label = (b) => {
    const s = new Date(b.startsAt), e = new Date(b.endsAt);
    try {
      const day = (d) => d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz });
      const time = (d) => d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', timeZone: tz });
      const midnight = (d) => time(d) === new Date(Date.UTC(2000, 0, 1)).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
      if (midnight(s) && midnight(e)) {
        const last = new Date(e.getTime() - 1);
        return day(s) === day(last) ? `${day(s)} · ${tr('coach:hours.allDay', { defaultValue: 'all day' })}` : `${day(s)} – ${day(last)}`;
      }
      return day(s) === day(e) ? `${day(s)} · ${time(s)} – ${time(e)}` : `${day(s)} ${time(s)} – ${day(e)} ${time(e)}`;
    } catch (err) { return `${b.startsAt} – ${b.endsAt}`; }
  };
  const upcoming = list.filter((b) => new Date(b.endsAt).getTime() > Date.now());
  const add = async () => {
    if (busy || disabled) return;
    setBusy(true); setMsg(null);
    try {
      let body;
      if (mode === 'days') body = { fromDate: form.from, toDate: form.to < form.from ? form.from : form.to };
      else {
        const [y, mo, d] = form.date.split('-').map(Number);
        const at = (m) => (tz ? bsInstantInZone(y, mo, d, Math.floor(m / 60), m % 60, tz) : new Date(y, mo - 1, d, Math.floor(m / 60), m % 60).getTime());
        const s = at(form.start), e = at(Math.min(form.end, 1439));
        if (!(Number.isFinite(s) && Number.isFinite(e) && e > s)) { setMsg({ tone: 'err', text: tr('coach:hours.offOrder', { defaultValue: 'The time off ends before it starts.' }) }); return; }
        body = { startsAt: new Date(s).toISOString(), endsAt: new Date(e).toISOString() };
      }
      if (form.note.trim()) body.note = form.note.trim();
      const r = await window.ShapeCoachHours.addTimeOff(role, body);
      if (r && r.timeOff) setList((prev) => [...prev, r.timeOff].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)));
      setAdding(false);
      setForm((f) => ({ ...f, note: '' }));
      setMsg({ tone: 'ok', text: r && r.overlapping > 0
        ? tr('coach:hours.offAddedOverlap', { defaultValue: 'Added. You still have {count, plural, one {# session} other {# sessions}} in that time: move or cancel them in your calendar.', count: r.overlapping })
        : tr('coach:hours.offAdded', { defaultValue: 'Added. Members can’t book you in that time.' }) });
      onChanged && onChanged();
    } catch (e) {
      setMsg({ tone: 'err', text: (e && e.message) || tr('coach:hours.offFailed', { defaultValue: "Couldn't add that time off. Try again." }) });
    } finally { setBusy(false); }
  };
  const remove = async (b) => {
    if (busy || disabled) return;
    setBusy(true); setMsg(null);
    try {
      await window.ShapeCoachHours.removeTimeOff(role, b.id);
      setList((prev) => prev.filter((x) => x.id !== b.id));
      setMsg({ tone: 'ok', text: tr('coach:hours.offRemoved', { defaultValue: 'Removed. Those times are open again.' }) });
      onChanged && onChanged();
    } catch (e) {
      setMsg({ tone: 'err', text: (e && e.message) || tr('coach:hours.offRemoveFailed', { defaultValue: "Couldn't remove that. Try again." }) });
    } finally { setBusy(false); }
  };
  if (state.kind === 'loading') return <Note t={t} style={{ marginTop: 12 }}>{tr('coach:hours.offLoading', { defaultValue: 'Reading your time off…' })}</Note>;
  if (state.kind === 'error') return <div style={{ marginTop: 12 }}><Note t={t}>{tr('coach:hours.offError', { defaultValue: "Couldn't read your time off just now." })}</Note><Chip t={t} onClick={() => setReload((n) => n + 1)}>{tr('coach:hours.retry', { defaultValue: 'Try again' })}</Chip></div>;
  if (state.kind === 'none') return <Note t={t} style={{ marginTop: 12 }}>{tr('coach:hours.offNone', { defaultValue: 'Time off opens once your coach application is approved.' })}</Note>;
  if (state.kind === 'notready') return <Note t={t} style={{ marginTop: 12 }}>{tr('coach:hours.offNotReady', { defaultValue: "Time off isn't set up yet. It'll be ready after the next update." })}</Note>;
  const field = { width: '100%', boxSizing: 'border-box', minHeight: 42, padding: '0 10px', borderRadius: 10, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, colorScheme: t.isLight ? 'light' : 'dark', fontFamily: t.MONO, fontSize: 15, outline: 'none' };
  const lbl = { display: 'block', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, marginBottom: 5 };
  return (
    <div>
      {upcoming.length ? upcoming.map((b) => (
        <div key={b.id} data-hours-off="" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: `1px solid ${t.HAIR || t.RULE}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK }}>{label(b)}</div>
            {b.note ? <div style={{ fontFamily: t.DISPLAY, fontSize: 13, color: t.INK50, marginTop: 2 }}>{b.note}</div> : null}
          </div>
          <button type="button" disabled={busy} onClick={() => remove(b)} aria-label={tr('coach:hours.offRemoveAria', { defaultValue: 'Remove time off {when}', when: label(b) })}
            style={{ flex: 'none', width: 44, height: 44, border: 0, background: 'transparent', color: t.INK50, fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
      )) : <Note t={t} style={{ padding: '10px 0' }}>{tr('coach:hours.offEmpty', { defaultValue: 'No time off coming up.' })}</Note>}
      {adding ? (
        <div data-hours-off-form="" style={{ marginTop: 12, padding: 14, borderRadius: 12, border: `1px solid ${t.RULE}` }}>
          <div role="tablist" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: `1px solid ${t.RULE}`, borderRadius: 999, padding: 3, gap: 3 }}>
            {[['days', tr('coach:hours.offWholeDays', { defaultValue: 'Whole days' })], ['part', tr('coach:hours.offPartDay', { defaultValue: 'Part of a day' })]].map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
                style={{ minHeight: 36, border: 0, borderRadius: 999, background: mode === k ? teal(t) : 'transparent', color: mode === k ? onTeal(t) : t.INK, fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{l}</button>
            ))}
          </div>
          {mode === 'days' ? (
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label><span style={lbl}>{tr('coach:hours.offFrom', { defaultValue: 'From' })}</span><input type="date" style={field} value={form.from} min={isoToday(tz)} onChange={(e) => setForm({ ...form, from: e.target.value, to: form.to < e.target.value ? e.target.value : form.to })} /></label>
              <label><span style={lbl}>{tr('coach:hours.offTo', { defaultValue: 'To' })}</span><input type="date" style={field} value={form.to} min={form.from} onChange={(e) => setForm({ ...form, to: e.target.value })} /></label>
            </div>
          ) : (
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label style={{ gridColumn: '1 / -1' }}><span style={lbl}>{tr('coach:hours.offDate', { defaultValue: 'Day' })}</span><input type="date" style={field} value={form.date} min={isoToday(tz)} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
              <label><span style={lbl}>{tr('coach:hours.offFrom', { defaultValue: 'From' })}</span><input type="time" step={BS_HOURS_STEP * 60} style={field} value={bsHoursToInput(form.start)} onChange={(e) => { const m = bsHoursFromInput(e.target.value); if (m != null) setForm({ ...form, start: m }); }} /></label>
              <label><span style={lbl}>{tr('coach:hours.offTo', { defaultValue: 'To' })}</span><input type="time" step={BS_HOURS_STEP * 60} style={field} value={bsHoursToInput(form.end)} onChange={(e) => { const m = bsHoursFromInput(e.target.value); if (m != null) setForm({ ...form, end: m }); }} /></label>
            </div>
          )}
          <label style={{ display: 'block', marginTop: 10 }}>
            <span style={lbl}>{tr('coach:hours.offNote', { defaultValue: 'Note · only you see it' })}</span>
            <input type="text" maxLength={500} style={{ ...field, fontFamily: t.DISPLAY }} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={tr('coach:hours.offNotePh', { defaultValue: 'Vacation, a competition…' })} />
          </label>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setAdding(false)} style={{ flex: 1, minHeight: 44, borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>{tr('coach:hours.cancel', { defaultValue: 'Cancel' })}</button>
            <button type="button" disabled={busy} onClick={add} style={{ flex: 1.4, minHeight: 44, borderRadius: 999, border: 0, background: teal(t), color: onTeal(t), fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? tr('coach:hours.saving', { defaultValue: 'Saving…' }) : tr('coach:hours.offAdd', { defaultValue: 'Add time off' })}</button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={disabled} onClick={() => { const today = isoToday(tz); setForm((f) => ({ ...f, from: today, to: today, date: today })); setAdding(true); setMsg(null); }}
          style={{ marginTop: 6, minHeight: 44, padding: '0 2px', border: 0, background: 'transparent', color: teal(t), fontFamily: t.DISPLAY, fontSize: 14.5, fontWeight: 600, cursor: disabled ? 'default' : 'pointer' }}>
          ＋ {tr('coach:hours.offAddRow', { defaultValue: 'Add time off' })}
        </button>
      )}
      {msg ? <Note t={t} tone={msg.tone} style={{ marginTop: 8 }}>{msg.text}</Note> : null}
    </div>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────────────────────
export function BSCoachHoursPage({ role = 'trainer', onBack, onOpenCalendar }) {
  const { useBS, BSPage, BSDetailHeader, BSFooter } = window;
  const t = useBS();
  const tr = useShapeTr();
  const locale = intlLocale();
  const live = signedInNow() && !!window.ShapeCoachHours;
  const [load, setLoad] = React.useState(live ? 'loading' : 'preview');
  const [seed, setSeed] = React.useState(() => (live ? bsHoursEmpty() : bsHoursFromRows(PREVIEW_ROWS)));
  const [days, setDays] = React.useState(() => bsHoursClone(seed));
  const [zone, setZone] = React.useState(null);
  const [providerId, setProviderId] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState(null);
  const [leaving, setLeaving] = React.useState(null);
  const [reload, setReload] = React.useState(0);
  const [previewNonce, setPreviewNonce] = React.useState(0);
  React.useEffect(() => {
    if (!live) return undefined;
    let on = true;
    setLoad('loading');
    window.ShapeCoachHours.get(role)
      .then((d) => {
        if (!on) return;
        if (!d.providerId) { setLoad('none'); return; }
        const m = bsHoursFromRows(d.slots);
        setSeed(m); setDays(bsHoursClone(m)); setZone(d.timezone || null); setProviderId(d.providerId); setLoad('ready');
      })
      .catch(() => { if (on) setLoad('error'); });
    return () => { on = false; };
  }, [role, live, reload]);
  const dirty = !bsHoursSame(days, seed);
  const valid = bsHoursValid(days);
  const total = bsHoursTotal(days);
  const phoneZone = window.ShapeCoachHours?.zone?.() || null;
  const zoneLine = zone
    ? (phoneZone && phoneZone !== zone
      ? tr('coach:hours.zoneMoved', { defaultValue: 'Times in {zone}. Saving from this phone moves them to {phone}.', zone, phone: phoneZone })
      : tr('coach:hours.zone', { defaultValue: 'Times in {zone}', zone }))
    : (phoneZone ? tr('coach:hours.zoneFirst', { defaultValue: 'Times will be saved in {zone}', zone: phoneZone }) : '');
  const hoursLabel = (min) => {
    const h = Math.floor(min / 60), m = min % 60;
    return m ? tr('coach:hours.totalHm', { defaultValue: '{h} h {m} min', h, m }) : tr('coach:hours.totalH', { defaultValue: '{h, plural, one {# hour} other {# hours}}', h });
  };
  // The stored hours are on another zone than the phone's (a coach who moved), or on none (hours
  // saved before zones were, which members can't book): either way they stay as they are until a
  // save, so placing them in the phone's zone is its own action, never a side effect of looking
  // (Codex on #2483: with nothing edited there was no way to save).
  const zoneMoved = live && load === 'ready' && !!phoneZone && phoneZone !== zone && bsHoursTotal(seed) > 0;
  const save = async ({ force = false } = {}) => {
    if (!live || saving || (!dirty && !force) || !valid) return false;
    setSaving(true); setMsg(null);
    try {
      const r = await window.ShapeCoachHours.save(role, bsHoursToRows(days));
      setSeed(bsHoursClone(days));
      if (r && r.timezone) setZone(r.timezone);
      setMsg({ tone: 'ok', text: tr('coach:hours.saved', { defaultValue: 'Saved. Members can book these times now.' }) });
      setPreviewNonce((n) => n + 1);
      return true;
    } catch (e) {
      // The route clears the old hours before it writes the new ones, so a failed save can leave
      // fewer hours stored, or none (Codex on #2483). Read back what is stored: the editor keeps
      // the coach's changes on screen with the save bar up, and says what members see now.
      let stored = null, storedZone = null;
      try { const d = await window.ShapeCoachHours.get(role); if (d && d.providerId) { stored = bsHoursFromRows(d.slots); storedZone = d.timezone || null; if (storedZone) setZone(storedZone); } } catch (e2) {}
      setPreviewNonce((n) => n + 1);
      // What was sent is what is stored (the save landed and only its answer was lost): it saved.
      // A zone-only save stores the same hours, so for one the zone has to have moved too.
      const sentChange = !bsHoursSame(days, seed);
      if (stored && bsHoursSame(stored, days) && (sentChange || (!!phoneZone && storedZone === phoneZone))) {
        setSeed(bsHoursClone(days));
        setMsg({ tone: 'ok', text: tr('coach:hours.saved', { defaultValue: 'Saved. Members can book these times now.' }) });
        return true;
      }
      let text;
      if (stored && bsHoursSame(stored, seed)) text = (e && e.message) || tr('coach:hours.saveFailed', { defaultValue: "Couldn't save your hours. Nothing changed; try again." });
      else if (stored) { setSeed(stored); text = tr('coach:hours.savePartial', { defaultValue: "Your hours didn't fully save, so members see only what is stored now. Save again to finish." }); }
      else text = tr('coach:hours.saveUnknown', { defaultValue: "Couldn't save your hours or check what is stored. Save again before you leave." });
      setMsg({ tone: 'err', text });
      return false;
    } finally { setSaving(false); }
  };
  // Leaving with unsaved hours (Back, or See your calendar) asks first; `leaving` holds where to.
  const leaveTo = (go) => { if (!go) return; if (dirty && live && load === 'ready') setLeaving(() => go); else go && go(); };
  const back = () => leaveTo(onBack);

  let week;
  if (load === 'loading') week = <Note t={t} style={{ marginTop: 12 }}>{tr('coach:hours.loading', { defaultValue: 'Reading your hours…' })}</Note>;
  else if (load === 'error') week = <div style={{ marginTop: 12 }}><Note t={t}>{tr('coach:hours.error', { defaultValue: "Couldn't read your hours just now. Nothing is lost." })}</Note><div style={{ marginTop: 8 }}><Chip t={t} onClick={() => setReload((n) => n + 1)}>{tr('coach:hours.retry', { defaultValue: 'Try again' })}</Chip></div></div>;
  else if (load === 'none') week = <Note t={t} style={{ marginTop: 12 }}>{tr('coach:hours.notCoach', { defaultValue: 'Your hours open once your coach application is approved.' })}</Note>;
  // The preview's week works on screen (owner, 2026-10-31: "the toggles arent working"): its switches,
  // times and copy change the sample until you leave, as Make it yours does; there is nothing to save.
  else week = <WeekEditor t={t} tr={tr} days={days} setDays={(d) => { setDays(d); setMsg(null); }} disabled={false} />;

  return (
    <BSPage>
      {/* With unsaved hours there is no corner: it opens the profile and unmounts this page with
          no ask (Codex on #2483). Back and See your calendar ask first; noCorner takes the pinned
          strip's corner off too. */}
      <BSDetailHeader onBack={back} noCorner={dirty && live && load === 'ready'} kicker={tr('coach:hours.kicker', { defaultValue: 'Your practice' })} title={tr('coach:hours.title', { defaultValue: 'Your hours.' })} />
      <div data-coach-hours="" style={{ padding: `0 ${t.padX}px ${dirty ? 110 : 28}px` }}>
        <Note t={t}>{tr('coach:hours.blurb', { defaultValue: 'When members can book you. Your hours repeat every week; time off and your rules close times inside them.' })}</Note>
        {load === 'preview' ? <Note t={t} style={{ marginTop: 8 }}>{tr('coach:hours.preview', { defaultValue: 'A preview with sample hours. Sign in as a coach to set yours.' })} {tr('coach:hours.previewTry', { defaultValue: 'Try it: your changes show here until you leave.' })}</Note> : null}

        <div style={{ marginTop: 22 }}>
          <Eyebrow t={t} right={load === 'ready' || load === 'preview' ? tr('coach:hours.perWeek', { defaultValue: '{total} a week', total: hoursLabel(total) }) : null}>{tr('coach:hours.weekHead', { defaultValue: 'Every week' })}</Eyebrow>
          {zoneLine && load === 'ready' ? <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.04em', color: t.INK50 }}>{zoneLine}</div> : null}
          {zoneMoved && !dirty ? <div style={{ marginTop: 8 }}><Chip t={t} disabled={saving} onClick={() => save({ force: true })}>{zone
            ? tr('coach:hours.zoneMove', { defaultValue: 'Move my hours to {zone}', zone: phoneZone })
            : tr('coach:hours.zoneSet', { defaultValue: 'Save my hours in {zone}', zone: phoneZone })}</Chip></div> : null}
          {week}
          {load === 'ready' && !dirty && msg ? <Note t={t} tone={msg.tone} style={{ marginTop: 10 }}>{msg.text}</Note> : null}
          {load === 'ready' ? <MemberPreview t={t} tr={tr} role={role} providerId={providerId} nonce={previewNonce} /> : null}
        </div>

        <div style={{ marginTop: 30 }}>
          <Eyebrow t={t}>{tr('coach:hours.rulesHead', { defaultValue: 'Booking rules' })}</Eyebrow>
          <RulesEditor t={t} tr={tr} role={role} disabled={!live} onChanged={() => setPreviewNonce((n) => n + 1)} />
        </div>

        <div style={{ marginTop: 30 }}>
          <Eyebrow t={t}>{tr('coach:hours.offHead', { defaultValue: 'Time off' })}</Eyebrow>
          <TimeOffEditor t={t} tr={tr} role={role} disabled={!live} onChanged={() => setPreviewNonce((n) => n + 1)} />
        </div>

        {onOpenCalendar ? (
          <button type="button" onClick={() => leaveTo(onOpenCalendar)}
            style={{ marginTop: 26, width: '100%', minHeight: 50, padding: '0 14px', borderRadius: 12, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
            {tr('coach:hours.openCalendar', { defaultValue: 'See your calendar' })}<span style={{ color: teal(t) }}>→</span>
          </button>
        ) : null}
      </div>

      {dirty && load === 'ready' ? (
        <div style={{ position: 'sticky', bottom: 0, zIndex: 5, padding: `10px ${t.padX}px calc(12px + env(safe-area-inset-bottom))`, background: t.PAPER, borderTop: `1px solid ${t.RULE}` }}>
          {leaving ? <Note t={t} style={{ marginBottom: 8 }}>{tr('coach:hours.leaveAsk', { defaultValue: "You haven't saved these hours." })}</Note> : null}
          {msg && msg.tone === 'err' ? <Note t={t} tone="err" style={{ marginBottom: 8 }}>{msg.text}</Note> : null}
          {!valid ? <Note t={t} tone="err" style={{ marginBottom: 8 }}>{tr('coach:hours.fixFirst', { defaultValue: 'Fix the times marked in red to save.' })}</Note> : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => { if (leaving) { leaving(); return; } setDays(bsHoursClone(seed)); setMsg(null); }}
              style={{ flex: 1, minHeight: 46, borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>
              {leaving ? tr('coach:hours.discardLeave', { defaultValue: 'Leave without saving' }) : tr('coach:hours.undo', { defaultValue: 'Undo changes' })}
            </button>
            <button type="button" data-save-hours="" disabled={saving || !valid} onClick={async () => { const ok = await save(); if (ok && leaving) leaving(); }}
              style={{ flex: 1.3, minHeight: 46, borderRadius: 999, border: 0, background: teal(t), color: onTeal(t), fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: saving || !valid ? 'default' : 'pointer', opacity: saving || !valid ? 0.55 : 1 }}>
              {saving ? tr('coach:hours.saving', { defaultValue: 'Saving…' }) : tr('coach:hours.save', { defaultValue: 'Save hours' })}
            </button>
          </div>
        </div>
      ) : null}
      {BSFooter ? <BSFooter left={tr('coach:hours.footer', { defaultValue: 'Your hours' })} right={zone || ''} /> : null}
    </BSPage>
  );
}
