// Mutation spec for coach dashboard step 5c (the Schedule page): a block's colour and words by its
// kind, the client's tier mark (an unknown tier hollow), today lifted and the now-line on the
// account's clock, the request card's order, fold and states, the Hours & rules slide-over's modal
// behaviour and unsaved-edit ask, the client panel's bookings and joint list, and sample data only in
// the preview. Every mutation must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/schedule-5c-2026-11-09.mutations.mjs --fail-on-skipped
const S = 'public/newdesign/dashSchedule.jsx';

export default {
  test: 'node --test tests/schedule-5c.test.mjs',
  timeoutMs: 240_000,
  mutations: [
    // ── kinds: colour and words ──
    { name: 'kinds: a consult is drawn as a note', file: S, find: '  if (ev.kind === "CONSULT") return "consult";\n', replace: '' },
    { name: 'kinds: a check-in is drawn as a note', file: S, find: '  if (ev.kind === "CHECKIN") return "checkin";\n', replace: '' },
    { name: 'kinds: a consult takes the neutral colour', file: S, find: 'if (key === "consult" || key === "checkin") {', replace: 'if (key === "checkin") {' },
    { name: 'kinds: clientColors.mjs is not read', file: S, find: 'c = CC && typeof CC.calendarKindColor === "function" ? CC.calendarKindColor(key, dscPaperName()) : null;', replace: 'c = null;' },
    { name: 'kinds: the paper is not read', file: S, find: 'CC.calendarKindColor(key, dscPaperName())', replace: 'CC.calendarKindColor(key, "night")' },
    { name: 'kinds: a week block does not say its kind', file: S, find: '<span data-kind-word="" style={{ fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: k.text }}>{k.label}</span>{" · " + dscFmt12(e.time)}', replace: '{dscFmt12(e.time)}' },
    { name: 'kinds: the kind leaves the block\'s words', file: S, find: 'look.client ? (m ? m.title : "tier not known") : null, look.kind.label].filter(Boolean)', replace: 'look.client ? (m ? m.title : "tier not known") : null].filter(Boolean)' },
    { name: 'palette: a session is tinted by its client again', file: S, find: 'background: requested ? "rgba(var(--sh-ground-rgb, 26,22,18),0.55)" : k.tint,', replace: 'background: requested ? "rgba(var(--sh-ground-rgb, 26,22,18),0.55)" : lk.points != null ? "rgba(224,70,60,0.2)" : k.tint,' },
    { name: 'palette: a session is edged by its client again', file: S, find: 'borderLeft: "3px " + (requested ? "dashed " : "solid ") + k.edge,\n', replace: 'borderLeft: "3px " + (requested ? "dashed " : "solid ") + (lk.points != null ? "rgb(224, 70, 60)" : k.edge),\n' },
    { name: 'month: a chip does not say its kind', file: S, find: '<span data-kind-word="" style={{ fontFamily: DSC_MONO, fontSize: compact ? 7 : 8, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: k.text, flexShrink: 0 }}>{k.label}</span>', replace: '' },
    { name: 'month: a chip has no tier mark', file: S, find: '{look.client && <DscTierMark points={look.points} size={compact ? 6 : 7} name={ev.with} decorative />}', replace: '' },

    // ── tiers ──
    { name: 'tiers: an unknown tier is drawn Raw', file: S, find: '    if (typeof points !== "number" || !Number.isFinite(points) || points < 0) return null;\n    if (!CC', replace: '    if (typeof points !== "number" || !Number.isFinite(points) || points < 0) points = 0;\n    if (!CC' },
    { name: 'tiers: an unknown tier draws nothing', file: S, find: 'if (!m) return <span aria-hidden="true" data-tier-unknown=""', replace: 'if (!m) return null; if (m) return <span aria-hidden="true" data-tier-unknown=""' },
    { name: 'tiers: a week block has no tier mark', file: S, find: '{lk.client && <DscTierMark points={lk.points} size={7} name={e.with} decorative />}', replace: '' },
    { name: 'tiers: the roster\'s tier is not read', file: S, find: 'points: row ? dscRecordTier(row) : null };', replace: 'points: null };' },
    { name: 'tiers: the block\'s words drop the tier', file: S, find: 'look.client ? (m ? m.title : "tier not known") : null, look.kind.label]', replace: 'null, look.kind.label]' },
    { name: 'tiers: the client chips have no mark', file: S, find: '<DscTierMark points={lk.points} size={8} name={c.name} decorative />{c.name}', replace: '{c.name}' },

    // ── today and the now-line ──
    { name: 'now: the line on this machine\'s clock', file: S, find: 'const now = dscNowIn(calZone);', replace: 'const now = dscNowIn(null);' },
    { name: 'now: the line on another day', file: S, find: '{iso === todayIso && nowMin != null && nowMin >= startHour * 60', replace: '{iso !== todayIso && nowMin != null && nowMin >= startHour * 60' },
    { name: 'now: the line does not move with the clock', file: S, find: 'React.useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 60000); return () => clearInterval(t); }, []);', replace: 'React.useEffect(() => undefined, []);' },
    { name: 'now: the line at the wrong height', file: S, find: 'top: yOf(nowMin), borderTop: "2px solid " + DSC_RUST', replace: 'top: yOf(nowMin + 30), borderTop: "2px solid " + DSC_RUST' },
    { name: 'today: the column is not lifted', file: S, find: 'cursor: "copy", minWidth: 0, ...(iso === todayIso ? lifted : {}),', replace: 'cursor: "copy", minWidth: 0,' },
    { name: 'today: the head does not say Today', file: S, find: '{today ? " · Today" : ""}', replace: '{""}' },
    { name: 'open hours: the wash gets its edge back', file: S, find: 'background: "rgba(var(--sh-accent-rgb, 46,224,196),0.08)", pointerEvents: "none" }} /> : null;', replace: 'background: "rgba(var(--sh-accent-rgb, 46,224,196),0.08)", borderLeft: "2px solid rgba(var(--sh-accent-rgb, 46,224,196),0.4)", pointerEvents: "none" }} /> : null;' },

    // ── the request card ──
    { name: 'requests: the latest leads', file: S, find: '.sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));', replace: '.sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")));' },
    { name: 'requests: a past request is still asking', file: S, find: '&& (e.date > todayIso || (e.date === todayIso && (nowMin == null || (dscMin(e.time) ?? 0) >= nowMin))))', replace: ')' },
    { name: 'requests: nothing folds', file: S, find: '{unfolded && <div data-requests-more="">', replace: '{true && <div data-requests-more="">' },
    { name: 'requests: the fold counts the lead', file: S, find: '{unfolded ? "Fold the other " + rest.length : rest.length + " more"}', replace: '{unfolded ? "Fold the other " + rest.length : list.length + " more"}' },
    { name: 'requests: the card is not Lift 2', file: S, find: 'boxShadow: "var(--lift-2, 0 2px 4px rgba(0,0,0,0.35), 0 26px 50px -16px rgba(0,0,0,0.75))" }}>', replace: 'boxShadow: "var(--lift-1, 0 2px 4px rgba(0,0,0,0.35), 0 26px 50px -16px rgba(0,0,0,0.75))" }}>' },
    { name: 'requests: an answer in flight is not said', file: S, find: '{busy && <div role="status" style={{ fontFamily: DSC_MONO, fontSize: 9, color: DSC_INK50, marginTop: 5 }}>Answering…</div>}', replace: '' },
    { name: 'requests: Accept stays live while busy', file: S, find: '<button type="button" disabled={busy} onClick={() => onAccept(ev)}', replace: '<button type="button" disabled={false} onClick={() => onAccept(ev)}' },
    { name: 'requests: a failed answer is only a toast', file: S, find: 'if (ev.status === "requested" && (action === "confirm" || action === "decline")) {', replace: 'if (false) {' },
    { name: 'requests: ⋯ loses Offer another time', file: S, find: 'items={[["Offer another time", () => onOther(ev)], ["Open the booking", () => onPick(ev)]]} />', replace: 'items={[["Open the booking", () => onPick(ev)]]} />' },
    { name: 'requests: Esc leaves ⋯ open', file: S, find: 'if (e.key !== "Escape") return;', replace: 'return;' },
    { name: 'requests: Esc strands focus in the closed menu', file: S, find: '      setOpen(false);\n      if (btnRef.current && btnRef.current.focus) btnRef.current.focus();', replace: '      setOpen(false);' },
    { name: 'requests: the name does not open the panel', file: S, find: 'onClient={onClient && canClient && canClient(ev) ? onClient : null} />', replace: 'onClient={null} />' },

    // ── Hours & rules: the slide-over ──
    { name: 'sheet: not modal', file: S, find: 'role="dialog" aria-modal="true" aria-labelledby={headingId} tabIndex={-1} data-settings-sheet=""', replace: 'role="dialog" aria-labelledby={headingId} tabIndex={-1} data-settings-sheet=""' },
    { name: 'sheet: the page behind stays live', file: S, find: 'const restore = dscInertOutside(overlayRef.current);', replace: 'const restore = () => {};' },
    { name: 'sheet: Esc does not close it', file: S, find: 'if (askingRef.current) setAsking(null); else tryRef.current();', replace: 'if (askingRef.current) setAsking(null);' },
    { name: 'sheet: Tab walks out of it', file: S, find: '      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }\n    };\n    const contain', replace: '    };\n    const contain' },
    { name: 'sheet: Shift-Tab walks out of it', file: S, find: '      else if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { e.preventDefault(); last.focus(); }\n      else if (!e.shiftKey && document.activeElement === last)', replace: '      else if (!e.shiftKey && document.activeElement === last)' },
    { name: 'sheet: focus that wanders out stays out', file: S, find: '    document.addEventListener("focusin", contain);\n', replace: '' },
    { name: 'sheet: focus is not given back to the tab', file: S, find: '      if (origin && origin.isConnected && origin.focus) origin.focus();\n    };\n  }, []);\n  const keepRef', replace: '    };\n  }, []);\n  const keepRef' },
    { name: 'sheet: the body still scrolls', file: S, find: '    document.body.style.overflow = "hidden";\n    const restore = dscInertOutside', replace: '    const restore = dscInertOutside' },
    { name: 'sheet: closes over an unsaved edit', file: S, find: 'if (words.length) { setAsking(words); return; }', replace: '' },
    { name: 'sheet: the hours editor reports nothing', file: S, find: 'onSaved={hoursSaved} onDirty={markUnsaved("hours")} />', replace: 'onSaved={hoursSaved} />' },
    { name: 'sheet: an open time-off form is never unsaved', file: S, find: 'const dirty = open && (note.trim() !== ""', replace: 'const dirty = false && (note.trim() !== ""' },
    { name: 'sheet: Leave without saving leaves nothing', file: S, find: 'onClick={() => { setAsking(null); onClose(); }} style={dscBtn("warn")}>Leave without saving</button>', replace: 'onClick={() => setAsking(null)} style={dscBtn("warn")}>Leave without saving</button>' },
    { name: 'sheet: a word on screen is hidden with the page', file: S, find: 'if (sib === node || sib.tagName === "SCRIPT" || (sib.matches && sib.matches("[data-toast]"))) continue;', replace: 'if (sib === node || sib.tagName === "SCRIPT") continue;' },
    { name: 'sheet: the toast stays in the page', file: S, find: '{toast && dscPortal(', replace: '{toast && (' },
    { name: 'sheet: the edge tab is gone at desktop widths', file: S, find: '{!narrow && <DscSettingsTab open={settingsOpen}', replace: '{false && <DscSettingsTab open={settingsOpen}' },
    { name: 'sheet: the hours editor is not in it', file: S, find: '          {editingHours\n            ? <DscHoursEditor', replace: '          {false\n            ? <DscHoursEditor' },

    // ── the client panel ──
    { name: 'panel: no bookings', file: S, find: 'prefs={prefs} joint={joint} sessions={panelSessions} />}', replace: 'prefs={prefs} joint={joint} />}' },
    { name: 'panel: no joint list', file: S, find: 'prefs={prefs} joint={joint} sessions={panelSessions} />}', replace: 'prefs={prefs} sessions={panelSessions} />}' },
    { name: 'panel: a booking inside the months is counted twice', file: S, find: 'feed.rows.filter((r) => r && Number.isFinite(r.at) && r.at >= gapAt)', replace: 'feed.rows.filter((r) => r && Number.isFinite(r.at))' },
    { name: 'panel: nothing in the months read is "none booked"', file: S, find: 'return r.state === "booked" ? { state: "read", rows } : { state: "unread" };', replace: 'return { state: "read", rows };' },
    { name: 'panel: a failed calendar is still loading', file: S, find: 'if (!preview) return { state: calState === "failed" ? "unread" : "loading" };', replace: 'if (!preview) return { state: "loading" };' },
    { name: 'panel: the coach\'s own booking as a client is a session', file: S, find: 'dscPanelSessions({ rec: drawerRow.client, cal, events: calEvents,', replace: 'dscPanelSessions({ rec: drawerRow.client, cal, events: allEvents,' },
    { name: 'panel: the preview\'s bookings meet by id', file: S, find: '.getTime()), clientId: null };', replace: '.getTime()) };' },
    { name: 'panel: a booking\'s time is not read on the account\'s clock', file: S, find: '    if (BR && zone) { const v = BR.wallInstant(d[0], d[1], d[2], t, zone); if (Number.isFinite(v)) return v; }\n', replace: '' },

    // ── sample data only under the band ──
    { name: 'preview: sample bookings for a signed-in coach', file: S, find: 'const allEvents = liveEvents ? cal.events : preview ? demoEvents : [];', replace: 'const allEvents = liveEvents ? cal.events : demoEvents;' },
    { name: 'preview: sample hours before the page knows', file: S, find: 'const availSlots = avail != null ? avail : preview ? DSC_DEMO.availability : [];', replace: 'const availSlots = avail != null ? avail : (isLive ? [] : DSC_DEMO.availability);' },
    { name: 'preview: sample time off before the page knows', file: S, find: 'if (!isLive) { setTimeOff(preview ? DSC_DEMO.timeOff : []); return undefined; }', replace: 'if (!isLive) { setTimeOff(DSC_DEMO.timeOff); return undefined; }' },
    { name: 'preview: sample plans for a signed-in coach', file: S, find: 'liveEvents ? (cal.clientPlans || []) : !preview ? []\n', replace: 'liveEvents ? (cal.clientPlans || [])\n' },
    { name: 'preview: a failed first read says only "some dates"', file: S, find: '{liveEvents ? "Some dates couldn\'t load." : "Your calendar couldn\'t be read just now."}', replace: '{"Some dates couldn\'t load."}' },
    { name: 'preview: the band over a signed-in coach\'s page', file: S, find: '{source === "demo" && !liveEvents && <DashDemoBand />}', replace: '{!liveEvents && <DashDemoBand />}' },
  ],
};
