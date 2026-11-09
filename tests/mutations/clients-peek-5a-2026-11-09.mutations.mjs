// Mutation spec for coach dashboard step 5a (the client peek and the Clients page): the status groups,
// the roster-health bar's counts and its unread "—", the docked panel versus the modal slide-over,
// ↑ ↓ and Esc, the compact columns and the lifted row, the panel's facts, joint note and next session,
// and Today's names opening the panel while keeping their href. Every mutation must be killed. Run
// from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/clients-peek-5a-2026-11-09.mutations.mjs --fail-on-skipped
const ROSTER = 'public/newdesign/dashRoster.jsx';
const TODAY = 'public/newdesign/dashToday.jsx';
const TCP = 'public/newdesign/trainerClientsPage.jsx';
const TROUTE = 'src/app/api/trainer/dashboard/route.ts';
const NROUTE = 'src/app/api/nutritionist/dashboard/route.ts';

export default {
  test: 'node --test tests/clients-peek-5a.test.mjs tests/dash-today-board.test.mjs tests/dashboard-coaching-usability.test.mjs tests/coach-dashboard-routes.test.mjs tests/dash-kpi-picker.test.mjs',
  timeoutMs: 240_000,
  mutations: [
    // ── Codex on #2639: the client by id, a failed sessions read, a fresh panel per client
    { name: 'Up next finds its client by name again', file: TODAY,
      find: 'const rec = next ? dashFindRecord(clients, next.who, next.clientId) : null;\n  const context', replace: 'const rec = next ? dashFindRecord(clients, next.who) : null;\n  const context' },
    { name: 'a shared name picks the first client', file: TODAY, find: '  return hits.length === 1 ? hits[0] : null;', replace: '  return hits[0] || null;' },
    { name: 'the next row loses its client id', file: TODAY,
      find: '    if (!best || at < best.at) best = { at, who: r.who, clientId: r.clientId != null ? r.clientId : null };', replace: '    if (!best || at < best.at) best = { at, who: r.who, clientId: null };' },
    { name: 'the panel reads a failed sessions read as nothing booked', file: ROSTER,
      find: '  if (today && today.sessionsRead === false) return { state: "unread" };\n', replace: '' },
    { name: 'Today reads a failed sessions read as a clear day', file: TODAY,
      find: ' && live.sessionsRead !== false ? live.today : null;', replace: ' ? live.today : null;' },
    { name: 'the trainer route hides a failed sessions read', file: TROUTE, find: '      sessionsRead = false;\n', replace: '' },
    { name: 'the nutritionist route hides a failed sessions read', file: NROUTE, find: '      sessionsRead = false;\n', replace: '' },
    { name: 'the trainer route drops today\'s client id', file: TROUTE, find: '        clientId: r.client_id,\n      }));', replace: '      }));' },
    { name: 'the nutritionist route drops today\'s client id', file: NROUTE, find: '        clientId: r.client_id,\n      }));', replace: '      }));' },
    // ── Codex on #2639, round 2: every figure built from a failed sessions read is unread
    { name: 'the trainer route sends a failed week as 0', file: TROUTE, find: '      sessionsThisWeek: sessionsRead ? sessionsThisWeek : null,', replace: '      sessionsThisWeek,' },
    { name: 'the trainer route sends failed upcoming as 0', file: TROUTE, find: '      upcomingSessions: sessionsRead ? upcomingSessions : null,', replace: '      upcomingSessions,' },
    { name: 'the nutritionist route sends a failed total as 0', file: NROUTE, find: '      totalConsults: sessionsRead ? totalConsults : null,', replace: '      totalConsults,' },
    { name: 'the nutritionist route sends a failed pulse as empty', file: NROUTE, find: '    pulse: sessionsRead ? pulse : null,', replace: '    pulse,' },
    { name: 'an unread session count says "live only"', file: 'public/newdesign/dashSignals.js', find: '    return live && live.kpis ? UNREAD : LIVE_ONLY;', replace: '    return LIVE_ONLY;' },
    { name: 'one panel serves every client', file: ROSTER,
      find: 'return <DashClientPanel key={p && p.id != null ? String(p.id) : "none"} {...props} />;', replace: 'return <DashClientPanel {...props} />;' },
    // ── the groups ──
    { name: 'groups: every row in one group', file: ROSTER, find: 'const keyOf = (r) => (known.has(r.severity) ? r.severity : "unknown");', replace: 'const keyOf = (r) => "green";' },
    { name: 'groups: an unknown severity leaves the list', file: ROSTER, find: 'const keyOf = (r) => (known.has(r.severity) ? r.severity : "unknown");', replace: 'const keyOf = (r) => r.severity;' },
    { name: 'groups: Progress unknown sinks below On track', file: ROSTER, find: '  ["unknown", "Progress unknown", "Their progress couldn\'t be read, or they haven\'t shared enough of it yet."],\n  ["green", "On track", null],', replace: '  ["green", "On track", null],\n  ["unknown", "Progress unknown", "Their progress couldn\'t be read, or they haven\'t shared enough of it yet."],' },
    { name: 'groups: the heading is not a heading', file: ROSTER, find: '<div role="heading" aria-level={3} style=', replace: '<div style=' },
    { name: 'groups: the unknown group does not say why', file: ROSTER, find: '{g.note && <React.Fragment>{" "}<span style={{ fontSize: 11.5, color: ink50 }}>{g.note}</span></React.Fragment>}', replace: '' },
    { name: 'groups: a sort ignores the groups\' rows', file: ROSTER, find: 'const groups = dashRosterGroups(rows);', replace: 'const groups = dashRosterGroups(filtered);' },
    { name: 'groups: a new client loses the New mark', file: ROSTER, find: '{rec.profile.isNew && <DashPill c={DASH_SEV_COLORS.new}>New</DashPill>}', replace: '' },

    // ── the roster-health bar ──
    { name: 'health: overviews still reading count as read', file: ROSTER, find: 'const settled = reading === 0;', replace: 'const settled = true;' },
    { name: 'health: a loading roster counts 0', file: ROSTER, find: 'if (loading || !Array.isArray(triage)) return { state: "loading", counts: none, reading: null, total: null };', replace: 'if (loading || !Array.isArray(triage)) return { state: "loading", counts: { red: 0, amber: 0, green: 0, new: 0, unknown: 0 }, reading: null, total: null };' },
    { name: 'health: an unread count prints 0', file: ROSTER, find: '{n == null ? "\\u2014" : n}', replace: '{n == null ? 0 : n}' },
    { name: 'health: clients still reading are "progress unknown"', file: ROSTER, find: 'unknown: settled ? count("unknown") : null },', replace: 'unknown: count("unknown") },' },
    { name: 'health: counts by severity, not by the table\'s rule', file: ROSTER, find: 'const count = (k) => rows.filter((r) => dashRosterMatches(r, k)).length;', replace: 'const count = (k) => rows.filter((r) => r.severity === k).length;' },
    { name: 'health: the part that is on cannot be turned off', file: ROSTER, find: 'onClick={() => onChange(on ? "all" : k)}', replace: 'onClick={() => onChange(k)}' },
    { name: 'health: a remembered empty filter loses its part', file: ROSTER, find: 'k === "green" || k === value || (h.counts[k]', replace: 'k === "green" || (h.counts[k]' },
    { name: 'health: no way back to everyone', file: ROSTER, find: '{value && value !== "all" && (', replace: '{false && (' },
    { name: 'health: check-ins reviewed is a different figure', file: TCP, find: 'role: "trainer", zone: today && today.dayZone }, ["reviewed"])[0]', replace: 'role: "trainer", zone: today && today.dayZone }, ["compliance"])[0]' },

    // ── docked versus the slide-over ──
    { name: 'docked: the panel is modal anyway', file: ROSTER, find: '    if (docked) {\n      // Docked, Esc is the only key the panel takes', replace: '    if (false) {\n      // Docked, Esc is the only key the panel takes' },
    { name: 'docked: the panel claims aria-modal', file: ROSTER, find: 'aria-modal={docked ? undefined : "true"}', replace: 'aria-modal="true"' },
    { name: 'docked: the panel is portaled over the page', file: ROSTER, find: '  if (docked) return panel;\n', replace: '' },
    { name: 'docked: at any width', file: ROSTER, find: 'const docked = wide && !!openRow;', replace: 'const docked = !!openRow;' },
    { name: 'docked: never', file: ROSTER, find: 'const docked = wide && !!openRow;', replace: 'const docked = false;' },
    { name: 'docked: Esc does nothing', file: ROSTER, find: 'if (e.key !== "Escape" || e.defaultPrevented) return;', replace: 'return;' },
    { name: 'docked: Esc from the panel strands focus', file: ROSTER, find: 'backTo.current = selectedId;\n', replace: '\n' },
    { name: 'docked: arrows open a panel nobody asked for', file: ROSTER, find: 'if (!docked || e.target !== e.currentTarget || !listRef.current) return;', replace: 'if (e.target !== e.currentTarget || !listRef.current) return;' },
    { name: 'docked: an arrow moves focus but not the selection', file: ROSTER, find: '    if (row) select(row.client.profile.id);\n', replace: '\n' },
    { name: 'docked: the list keeps every column', file: ROSTER, find: 'if (!docked) return { keep: all, cols: view.cols, minWidth: view.minWidth };', replace: 'return { keep: all, cols: view.cols, minWidth: view.minWidth };' },
    { name: 'docked: the sorted column is dropped', file: ROSTER, find: 'const keep = all.filter((i) => base.includes(i) || i === sorted);', replace: 'const keep = all.filter((i) => base.includes(i));' },
    { name: 'docked: the selected row does not lift', file: ROSTER, find: '...(picked ? { zIndex: 1, borderRadius: 10, background: "var(--sh-card, #25211d)", boxShadow: "var(--lift-2, 0 4px 14px rgba(0,0,0,0.14))" } : null)', replace: '...(picked ? { zIndex: 1, borderRadius: 10 } : null)' },

    // ── the panel ──
    { name: 'facts: still reading reads as unread', file: ROSTER, find: 'const miss = (empty) => read === "loading" ? { v: "…", sub: "reading", state: "loading" }', replace: 'const miss = (empty) => read === "loading" ? { v: "—", sub: "couldn\'t be read", state: "unread" }' },
    { name: 'facts: an unread overview reads as empty', file: ROSTER, find: '    : read === "unavailable" ? { v: "—", sub: "couldn\'t be read", state: "unread" }\n', replace: '\n' },
    { name: 'joint: an empty joint section for a client nobody shares', file: ROSTER, find: 'const shown = secs.shown.filter(([key]) => key !== "joint" || !!jointRow);', replace: 'const shown = secs.shown;' },
    { name: 'next: a cancelled booking is the next session', file: ROSTER, find: '    if (s.status != null && DASH_PEEK_OPEN_STATUSES.indexOf(s.status) === -1) continue;\n', replace: '' },
    { name: 'next: an older feed with no status reads as nothing booked', file: ROSTER, find: '  if (own.length && !own.some((e) => typeof e.status === "string")) return { state: "unread" };\n', replace: '' },
    { name: 'next: another client by the same name', file: ROSTER, find: 'const mine = s.clientId != null ? id != null && String(s.clientId) === id : !!name && String(s.who || "").trim().toLowerCase() === name;', replace: 'const mine = !!name && String(s.who || "").trim().toLowerCase() === name;' },
    { name: 'next: a failed day feed is an empty schedule', file: ROSTER, find: '  if (!cal) return { state: "unread" };\n', replace: '  if (!cal) return { state: "read", rows: [] };\n' },
    { name: 'checkin: an unread review state is no state', file: ROSTER, find: '    : { t: "Review status couldn\'t be read", c: DASH_SEV_COLORS.unknown };', replace: '    : null;' },

    // ── Today's names ──
    { name: 'today: a plain click on a name follows the link', file: TODAY, find: '  e.preventDefault();\n  e.stopPropagation();\n  open();\n  return true;', replace: '  open();\n  return true;' },
    { name: 'today: a plain click on a name opens nothing', file: TODAY, find: '  e.preventDefault();\n  e.stopPropagation();\n  open();\n  return true;', replace: '  e.preventDefault();\n  e.stopPropagation();\n  return true;' },
    { name: 'today: a modifier click is taken from the browser', file: TODAY, find: 'if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;', replace: 'if (e.defaultPrevented) return false;' },
    { name: 'today: a name loses its href', file: TODAY, find: 'return <a href={href} data-dash-peek-name={can ? "" : undefined}', replace: 'return <a data-dash-peek-name={can ? "" : undefined}' },
    { name: 'today: a ⌘-click on a Needs you name bubbles to the row', file: TODAY, find: 'if (!canOpen || (e.target && e.target.closest && e.target.closest("a, button"))) return; pk.open(it.id);', replace: 'if (!canOpen) return; pk.open(it.id);' },
    { name: 'today: the brief\'s names are plain text', file: TODAY, find: 'link={role && p.id != null ? { id: p.id, role, peek } : null}', replace: 'link={null}' },
    { name: 'today: Up next\'s name does not open the panel', file: TODAY, find: '<DashPeekLink id={rec.profile ? rec.profile.id : null} rec={rec} role={role} peek={peek}>{name}</DashPeekLink>', replace: '<DashPeekLink id={rec.profile ? rec.profile.id : null} rec={rec} role={role}>{name}</DashPeekLink>' },
    { name: 'today: the panel has no schedule', file: TODAY, find: 'sessions={typeof dashPeekSessions === "function" ? dashPeekSessions(live, source, role) : undefined} />}', replace: 'sessions={undefined} />}' },
    { name: 'today: the panel has no joint list', file: TODAY, find: '{peekRow && <DashClientDrawer row={peekRow} role={role} onClose={() => setPeekId(null)} prefs={prefs} dismiss={dismiss} joint={joint}', replace: '{peekRow && <DashClientDrawer row={peekRow} role={role} onClose={() => setPeekId(null)} prefs={prefs} dismiss={dismiss}' },
  ],
};
