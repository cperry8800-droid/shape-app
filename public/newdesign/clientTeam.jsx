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

// A zero-box coach station threaded on its role-colored spine.
function CtStation({ c }) {
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
      <div style={{ display: "flex", gap: 26, marginTop: 12 }}>
        <button type="button" onClick={() => ctOpenChat(c.name)} style={{ background: "transparent", border: 0, padding: "11px 0", color: INK, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Message <span aria-hidden>→</span></button>
        <button type="button" onClick={() => ctOpenChat(c.name)} style={{ background: "transparent", border: 0, padding: "11px 0", color: TEAL_BRIGHT, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Book session <span aria-hidden>→</span></button>
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
            {coaches.map((c, i) => (<CtStation key={i} c={c} />))}
          </div>
        </>
      )}

      <ChatWidget tabs={clientChatTabs} />
    </DashPage>
  );
}
