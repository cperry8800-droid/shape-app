// Client's coaching team — "Your team." (Open Ledger grammar).
// Zero-box coach stations on role-colored spines (trainer rust / nutritionist
// gold), dot-leader registers, ink→accent rules. Honest data throughout:
// live coaches from /api/client/team; role-tinted initials avatars (the API
// carries no photo); a real empty state for a signed-in member with no coach;
// a real error state on a failed load; the demo team shows ONLY as a labelled
// signed-out (401) preview — never on a server error.

const CT_RUST = "#c0533b";      // trainer
const CT_GOLD = "#d8b25a";      // nutritionist (bright variant reads on dark paper)
const CT_INK55 = INK + "8c";    // 55% of the cream INK token
const CT_INK40 = INK + "66";    // 40%
const CT_HAIR = INK + "1a";     // 10% hairline
const CT_MONO = "'JetBrains Mono', monospace";
const CT_MARKET = "/newdesign/marketplace.html";

const CT_DEMO_COACHES = [
  { name: "Maya Okafor", role: "Head trainer", provider_role: "trainer", since: "Feb 4, 2026", plan: "Strength + hybrid · $220/mo", next: "Thu 8:00 AM", hasNext: true },
  { name: "Rae Lindqvist", role: "Nutritionist", provider_role: "nutritionist", since: "Feb 18, 2026", plan: "Performance fuel · $180/mo", next: "Wed 1:30 PM", hasNext: true },
];

function ctRoleColor(c) {
  return c.provider_role === "nutritionist" ? CT_GOLD : CT_RUST;
}
function ctInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
function ctOpenChat(name) {
  const f = window.__openChatTo || window.__openChat;
  if (f) f({ who: name });
}

// One dot-leader register row: LABEL ···· value (tabular).
function CtLeader({ label, value, valueColor }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "6px 0" }}>
      <span style={{ fontFamily: CT_MONO, fontSize: 10, letterSpacing: "0.14em", color: CT_INK55, flex: "0 0 auto" }}>{label}</span>
      <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${CT_HAIR}`, transform: "translateY(-3px)" }} />
      <span style={{ fontSize: 13, color: valueColor || INK, fontVariantNumeric: "tabular-nums", textAlign: "right", flex: "0 0 auto" }}>{value}</span>
    </div>
  );
}

// ── Booking (review 2026-09-09, R20's other half) ──────────────────────────
//
// ⚠ "BOOK SESSION" USED TO OPEN THE CHAT. Not a dead control — a MISLABELLED one,
// which is worse: a member tapped a button that named an outcome and got a different
// one, with nothing saying the booking had not happened. Both halves of the API it
// needed were already live (`/api/availability` to read the coach's open hours, the
// RLS-pinned `sessions` insert the mobile app uses to request one), and no website
// surface called either.
//
// ⚠ THE TIMES ARE LABELLED IN THE MEMBER'S OWN ZONE, DELIBERATELY, AND THE INSTANT
// BEHIND THEM IS NOW THE COACH'S. `start_minute` is a bare wall-clock minute in the
// coach's local day — they toggle the cell marked "9a" and 540 is stored — and until
// 2026-09-11 the chain read it as 09:00 UTC, so a coach in New York had members booking
// 5:00 AM while both parties were shown "9:00 AM". The coach's zone now comes back from
// /api/availability and `BookingSlots` resolves the instant in it; `slotLabel` renders
// that instant in the MEMBER's zone, which is the only clock they can act on.
//
// ⚠ AND A COACH WITH NO STORED ZONE OFFERS NOTHING RATHER THAN BEING READ AS UTC — the
// `nozone` state below. That is a claim about OUR data, not about the coach, so it says
// so: hours we cannot place are not hours a member can be allowed to book.
// 14, because that is what the table's own migration says the client UI does:
// "Client UI generates the next 14 days of concrete slots by projecting these rows
// against each date." Matching the documented intent rather than picking a number.
const CT_BOOK_DAYS = 14;
const CT_SESSION_MIN = 60;    // the editor's own grid is hourly, so an hour is the unit

function ctSupabase() {
  const db = typeof window !== "undefined" ? window.shapeDb : null;
  return (db && db.client) || null;
}

function CtBookSheet({ coach, onClose, onBooked }) {
  const accent = ctRoleColor(coach);
  const [state, setState] = React.useState("loading");  // loading | ready | none | nozone | unreadable
  const [slots, setSlots] = React.useState([]);
  const [pick, setPick] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const [done, setDone] = React.useState(null);

  React.useEffect(() => {
    let on = true;
    const pid = coach && coach.provider_id;
    const role = coach && coach.provider_role === "nutritionist" ? "nutritionist" : "trainer";
    if (!pid) { setState("unreadable"); return undefined; }
    fetch("/api/availability?role=" + encodeURIComponent(role) + "&id=" + encodeURIComponent(pid), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!on) return;
        // ⚠ AN UNREADABLE PATTERN IS NOT AN EMPTY ONE. "This coach has no open hours"
        // is a claim about the coach; a failed read is a claim about us.
        if (!j || !Array.isArray(j.slots)) { setState("unreadable"); return; }
        // ⚠ "NO HOURS" IS KNOWABLE WITHOUT A ZONE; "WHEN" IS NOT. An empty pattern is a
        // fact about the coach either way, so it keeps its own honest empty — the zone
        // only decides whether declared hours can be placed.
        if (!j.slots.length) { setSlots([]); setState("none"); return; }
        if (!window.BookingSlots.isZone(j.timezone)) { setSlots([]); setState("nozone"); return; }
        const built = window.BookingSlots.buildSlots({
          slots: j.slots, booked: j.booked, zone: j.timezone,
          now: new Date(), days: CT_BOOK_DAYS, sessionMin: CT_SESSION_MIN,
        });
        setSlots(built);
        setState(built.length ? "ready" : "none");
      })
      .catch(() => { if (on) setState("unreadable"); });
    return () => { on = false; };
  }, [coach]);

  const groups = state === "ready" ? window.BookingSlots.groupByDay(slots) : [];

  async function book() {
    if (!pick || saving) return;
    setSaving(true); setErr(null);
    const c = ctSupabase();
    if (!c) { setSaving(false); setErr("We couldn't reach the booking service. Try again in a moment."); return; }
    try {
      const { data: auth } = await c.auth.getUser();
      const user = auth && auth.user;
      if (!user) { setSaving(false); setErr("Sign in to book a session."); return; }
      // Identity comes from the ACCOUNT, never from anything on screen — the same rule
      // /api/consultation records, and the RLS policy pins client_id = auth.uid() anyway.
      const name = (user.user_metadata && user.user_metadata.full_name) || (user.email || "").split("@")[0] || "Shape client";
      const { error } = await c.from("sessions").insert({
        client_id: user.id,
        client_name: name,
        client_email: user.email || null,
        provider_id: coach.provider_id,
        provider_role: coach.provider_role === "nutritionist" ? "nutritionist" : "trainer",
        type: "video",
        scheduled_at: pick.iso,
        duration_min: pick.durationMin,
        // Pinned by RLS too: a member may only ever write 'requested', so the coach
        // still decides. Sending anything else is refused rather than honoured.
        status: "requested",
        topic: "Coaching session",
      });
      if (error) {
        setSaving(false);
        // ⚠ 23505 IS THE DOUBLE-BOOK INDEX, AND IT DESERVES ITS OWN SENTENCE. The slot
        // was open when the list was built and somebody took it in between; telling the
        // member "something went wrong" would send them back to the same dead time.
        setErr(String(error.code) === "23505"
          ? "Somebody just took that time. Pick another and we'll send the request."
          : "We couldn't send that request. Nothing was booked — try again.");
        return;
      }
      setSaving(false);
      setDone(pick);
      if (onBooked) onBooked(coach, pick);
    } catch (e) {
      setSaving(false);
      setErr("We couldn't send that request. Nothing was booked — try again.");
    }
  }

  const pill = (active) => ({
    fontFamily: CT_MONO, fontSize: 11.5, letterSpacing: "0.04em", padding: "9px 12px", minHeight: 24,
    borderRadius: 4, cursor: "pointer", fontVariantNumeric: "tabular-nums",
    border: "1px solid " + (active ? accent : CT_HAIR),
    background: active ? accent + "24" : "transparent",
    color: active ? INK : CT_INK55,
  });

  return (
    <div onClick={onClose} role="presentation"
      style={{ position: "fixed", inset: 0, background: "rgba(10,8,6,0.7)", backdropFilter: "blur(6px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={"Book a session with " + coach.name}
        style={{ background: PAPER, border: `1px solid ${CT_HAIR}`, borderRadius: 14, padding: 26, width: "100%", maxWidth: 520, maxHeight: "84vh", overflowY: "auto" }}>
        <div style={{ fontFamily: CT_MONO, fontSize: 10.5, letterSpacing: "0.14em", color: accent }}>REQUEST A SESSION</div>
        <div style={{ fontFamily: serif, fontSize: 27, letterSpacing: "-0.02em", margin: "6px 0 4px", color: INK }}>{coach.name}.</div>

        {done ? (
          <>
            <div style={{ fontSize: 13.5, color: CT_INK55, lineHeight: 1.5, marginTop: 12 }}>
              Requested for <b style={{ color: INK }}>{window.BookingSlots.dayLabel(done.iso)}</b> at{" "}
              <b style={{ color: INK }}>{window.BookingSlots.slotLabel(done.iso)}</b>. {coach.name.split(" ")[0]} confirms it from their side — you'll see it under NEXT once they do.
            </div>
            <button type="button" onClick={onClose} style={{ marginTop: 20, background: INK, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 4, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Done</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: CT_INK40, lineHeight: 1.5 }}>
              Times are shown in your timezone. Your coach confirms before it's final.
            </div>

            {state === "loading" && <div style={{ fontFamily: CT_MONO, fontSize: 11.5, color: CT_INK40, marginTop: 18 }}>Loading open times…</div>}

            {state === "unreadable" && (
              <div style={{ fontSize: 13.5, color: CT_INK55, marginTop: 18, lineHeight: 1.5 }}>
                We couldn't read {coach.name.split(" ")[0]}'s open times just now. Message them and they can set one up.
              </div>
            )}

            {state === "none" && (
              <div style={{ fontSize: 13.5, color: CT_INK55, marginTop: 18, lineHeight: 1.5 }}>
                {coach.name.split(" ")[0]} has no open times in the next {CT_BOOK_DAYS} days. Message them and they can open one.
              </div>
            )}

            {state === "nozone" && (
              <div style={{ fontSize: 13.5, color: CT_INK55, marginTop: 18, lineHeight: 1.5 }}>
                {coach.name.split(" ")[0]} has open hours set, but we can't place them on a clock yet — their timezone isn't recorded. Message them and they can set one up.
              </div>
            )}

            {state === "ready" && (
              <div style={{ marginTop: 18, display: "grid", gap: 16 }}>
                {groups.map((g) => (
                  <div key={g.day}>
                    <div style={{ fontFamily: CT_MONO, fontSize: 10, letterSpacing: "0.14em", color: CT_INK55, marginBottom: 8 }}>{g.day.toUpperCase()}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {g.slots.map((sl) => (
                        <button key={sl.iso} type="button" onClick={() => { setPick(sl); setErr(null); }}
                          aria-pressed={!!(pick && pick.iso === sl.iso)}
                          style={pill(!!(pick && pick.iso === sl.iso))}>{window.BookingSlots.slotLabel(sl.iso)}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {err && <div style={{ fontSize: 13, color: RUST, marginTop: 16, lineHeight: 1.45 }}>{err}</div>}

            <div style={{ display: "flex", gap: 12, marginTop: 22, flexWrap: "wrap" }}>
              <button type="button" disabled={!pick || saving} onClick={book}
                style={{ background: pick && !saving ? INK : "transparent", color: pick && !saving ? PAPER : CT_INK40, border: pick && !saving ? 0 : `1px solid ${CT_HAIR}`, padding: "10px 22px", borderRadius: 4, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: pick && !saving ? "pointer" : "default" }}>
                {saving ? "Sending…" : "Request this time"}
              </button>
              <button type="button" onClick={onClose} style={{ background: "transparent", border: 0, padding: "10px 4px", color: CT_INK55, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// A zero-box coach station threaded on its role-colored spine.
function CtStation({ c, onBook, canBook }) {
  const accent = ctRoleColor(c);
  return (
    <div style={{ position: "relative", paddingLeft: 24 }}>
      <div aria-hidden style={{ position: "absolute", left: 0, top: 3, bottom: 3, width: 3, background: accent, borderRadius: 2 }} />
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div aria-hidden style={{ width: 48, height: 48, flex: "0 0 auto", borderRadius: 8, background: accent + "1f", border: `1px solid ${accent}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: serif, fontSize: 18, color: accent }}>{ctInitials(c.name)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: CT_MONO, fontSize: 10, letterSpacing: "0.16em", color: accent, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{String(c.role).toUpperCase()} · SINCE {String(c.since).toUpperCase()}</div>
          <div style={{ fontFamily: serif, fontSize: 25, letterSpacing: "-0.015em", lineHeight: 1.12, marginTop: 3 }}>{c.name}</div>
        </div>
      </div>
      <div aria-hidden style={{ height: 2, margin: "15px 0 6px", background: `linear-gradient(90deg, ${INK}, ${accent} 55%, transparent)`, opacity: 0.85, borderRadius: 1 }} />
      <CtLeader label="PLAN" value={c.plan} />
      <CtLeader label="NEXT" value={c.hasNext ? c.next : "No session booked"} valueColor={c.hasNext ? TEAL_BRIGHT : CT_INK40} />
      {/* A request the coach has not confirmed is not a session yet, so it gets its own
          register rather than being folded into NEXT. Its value is what the member was
          shown in the sheet — the same instant, in the same zone — so the two cannot
          disagree about when they asked for. */}
      {c.requested && <CtLeader label="REQUESTED" value={c.requested} valueColor={accent} />}
      <div style={{ display: "flex", gap: 26, marginTop: 12 }}>
        <button type="button" onClick={() => ctOpenChat(c.name)} style={{ background: "transparent", border: 0, padding: "11px 0", color: INK, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Message <span aria-hidden>→</span></button>
        {/* ⚠ IN THE SIGNED-OUT PREVIEW THE CONTROL RENDERS AND SAYS WHY IT IS OFF, rather
            than disappearing. The demo coaches have no provider row, so there is nothing
            to read availability for and nothing a booking could be written against — but
            a prospect still needs to see that booking exists. Same call as the roster CSV
            export. What it must never do is what it did before: look like it worked. */}
        <button type="button" disabled={!canBook} onClick={() => canBook && onBook(c)}
          title={canBook ? undefined : "Sign in to book with your own coach"}
          style={{ background: "transparent", border: 0, padding: "11px 0", color: canBook ? TEAL_BRIGHT : CT_INK40, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: canBook ? "pointer" : "default" }}>
          Book session{canBook ? "" : " · live only"} <span aria-hidden>→</span>
        </button>
      </div>
    </div>
  );
}

// Eyebrow-above-figure register cell for the synthesis lead.
function CtRegister({ label, value }) {
  return (
    <div>
      <div style={{ fontFamily: CT_MONO, fontSize: 10, letterSpacing: "0.16em", color: CT_INK55 }}>{label}</div>
      <div style={{ fontFamily: serif, fontSize: 30, letterSpacing: "-0.02em", lineHeight: 1, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

// A zero-box notice on a spine (shared by the empty + error states).
function CtNotice({ accent, eyebrow, title, body, cta }) {
  return (
    <div style={{ paddingLeft: 24, position: "relative", maxWidth: 520, marginBottom: 20 }}>
      <div aria-hidden style={{ position: "absolute", left: 0, top: 3, bottom: 3, width: 3, background: accent, borderRadius: 2 }} />
      <div style={{ fontFamily: CT_MONO, fontSize: 10, letterSpacing: "0.16em", color: accent }}>{eyebrow}</div>
      <div style={{ fontFamily: serif, fontSize: 25, letterSpacing: "-0.015em", marginTop: 6 }}>{title}</div>
      <div style={{ fontSize: 13.5, color: CT_INK55, marginTop: 8, lineHeight: 1.5 }}>{body}</div>
      {cta}
    </div>
  );
}

function ClientTeamPage() {
  const [coaches, setCoaches] = React.useState([]);
  const [state, setState] = React.useState("loading"); // loading | live | empty | preview | error
  const [booking, setBooking] = React.useState(null);  // the coach whose sheet is open

  React.useEffect(() => {
    let alive = true;
    fetch("/api/client/team", { credentials: "same-origin" })
      .then((r) => {
        if (r.status === 401) return { __signedOut: true };   // genuine signed-out → preview
        if (!r.ok) return { __error: true };                  // 403/500/etc → real error, never demo
        return r.json();
      })
      .then((d) => {
        if (!alive) return;
        if (d && d.__signedOut) { setCoaches(CT_DEMO_COACHES); setState("preview"); return; }
        if (d && d.__error) { setState("error"); return; }
        if (d && Array.isArray(d.coaches) && d.coaches.length) {
          setCoaches(d.coaches.map((c) => ({
            name: c.name,
            role: c.role,
            provider_role: c.provider_role,
            // Carried so the booking sheet can ask /api/availability who this is. The
            // page used to drop it, which is half the reason "Book session" went
            // nowhere: there was nothing on screen that identified the coach to book.
            provider_id: c.provider_id,
            since: c.since,
            plan: c.plan,
            next: c.next,
            hasNext: !!c.next && c.next !== "No session booked",
          })));
          setState("live");
        } else {
          setCoaches([]);
          setState("empty");
        }
      })
      .catch(() => { if (alive) setState("error"); });        // network failure → error, never demo
    return () => { alive = false; };
  }, []);

  const n = coaches.length;
  const upcoming = coaches.filter((c) => c.hasNext).length;
  const showCount = state === "live" || state === "preview";
  const eyebrow = showCount ? `YOUR CARE TEAM · ${n} ACTIVE` : "YOUR CARE TEAM";
  const subtitle = state === "empty"
    ? "You haven't added a coach yet. Build your team — you pay each coach directly, at their rates."
    : state === "error"
    ? "We couldn't load your team just now."
    : state === "loading"
    ? "Loading your coaches…"
    : `${n === 1 ? "One coach" : `${n} coaches`}, one plan. You pay each directly, at their rates.`;

  const ghostBtn = { display: "inline-block", background: "transparent", color: INK, textDecoration: "none", border: `1px solid ${INK}40`, padding: "10px 20px", borderRadius: 4, fontFamily: sans, fontSize: 13, cursor: "pointer" };
  const solidBtn = { display: "inline-block", background: INK, color: PAPER, textDecoration: "none", border: 0, padding: "10px 22px", borderRadius: 4, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" };
  const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 40, marginBottom: 20 };

  return (
    <DashPage
      navItems={clientNavItems("team")}
      payoutCard={clientPayoutCard}
      eyebrow={eyebrow}
      title="Your team."
      subtitle={subtitle}
      actions={<>
        <a href={CT_MARKET} style={ghostBtn}>Browse coaches</a>
        <a href={CT_MARKET} style={solidBtn}>＋ Invite specialist</a>
      </>}
    >
      {state === "loading" ? (
        <div style={gridStyle}>
          {[0, 1].map((i) => (
            <div key={i} style={{ paddingLeft: 24, opacity: 0.5 }}>
              <div style={{ display: "flex", gap: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: 8, background: CT_HAIR }} />
                <div style={{ flex: 1 }}>
                  <div style={{ height: 10, width: "55%", background: CT_HAIR, borderRadius: 2 }} />
                  <div style={{ height: 20, width: "70%", background: CT_HAIR, borderRadius: 3, marginTop: 8 }} />
                </div>
              </div>
              <div style={{ height: 2, margin: "16px 0", background: CT_HAIR }} />
              <div style={{ height: 12, width: "80%", background: CT_HAIR, borderRadius: 2, margin: "10px 0" }} />
              <div style={{ height: 12, width: "60%", background: CT_HAIR, borderRadius: 2 }} />
            </div>
          ))}
        </div>
      ) : state === "error" ? (
        <CtNotice
          accent={RUST}
          eyebrow="COULDN'T LOAD"
          title="Your team didn't load."
          body="Something went wrong reaching your coaches. Give it another try."
          cta={<button type="button" onClick={() => window.location.reload()} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 16, background: "transparent", border: 0, padding: "6px 0", fontFamily: sans, fontSize: 13, fontWeight: 500, color: TEAL_BRIGHT, cursor: "pointer" }}>Retry <span aria-hidden>→</span></button>}
        />
      ) : state === "empty" ? (
        <CtNotice
          accent={TEAL}
          eyebrow="NO COACHES YET"
          title="Find your first coach."
          body="Browse trainers and nutritionists in the Marketplace. You subscribe at their rate and they show up here."
          cta={<a href={CT_MARKET} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 16, fontFamily: sans, fontSize: 13, fontWeight: 500, color: TEAL_BRIGHT, textDecoration: "none" }}>Browse coaches <span aria-hidden>→</span></a>}
        />
      ) : (
        <>
          {state === "preview" && (
            <div style={{ fontFamily: CT_MONO, fontSize: 10.5, letterSpacing: "0.12em", color: CT_INK40, marginBottom: 18 }}>PREVIEW · SAMPLE TEAM — SIGN IN TO SEE YOURS</div>
          )}
          <div style={{ display: "flex", gap: 44, alignItems: "flex-end", paddingBottom: 20, marginBottom: 28, borderBottom: "2px solid transparent", borderImage: `linear-gradient(90deg, ${INK}, ${TEAL_BRIGHT} 45%, transparent) 1` }}>
            <CtRegister label="COACHES" value={n} />
            <CtRegister label="SESSIONS COMING UP" value={upcoming} />
          </div>
          <div style={gridStyle}>
            {coaches.map((c, i) => (
              <CtStation key={i} c={c} canBook={state === "live" && !!c.provider_id} onBook={setBooking} />
            ))}
          </div>
        </>
      )}

      {booking && (
        <CtBookSheet
          coach={booking}
          onClose={() => setBooking(null)}
          onBooked={(coach, slot) => {
            // ⚠ THE STATION SHOWS THE REQUEST, AND SAYS IT IS ONE. NEXT has always meant
            // a session that is happening; a request the coach has not confirmed is not
            // that yet, so it is labelled rather than folded in silently. It also does not
            // touch `hasNext`, which drives the "SESSIONS COMING UP" count — counting a
            // request there would inflate a figure that means confirmed sessions.
            setCoaches((prev) => prev.map((c) => (
              c.provider_id === coach.provider_id && c.provider_role === coach.provider_role
                ? { ...c, requested: window.BookingSlots.dayLabel(slot.iso) + " \u00b7 " + window.BookingSlots.slotLabel(slot.iso) }
                : c
            )));
          }}
        />
      )}

      <ChatWidget tabs={clientChatTabs} />
    </DashPage>
  );
}
