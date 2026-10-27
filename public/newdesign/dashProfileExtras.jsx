
// Dashboard Profile = the LIVING profile itself (profile-first, like the app's
// Me tab). "✎ Customize profile" on the page edits it; the dashboard-only
// pieces (credentials & verification + back link + danger zone) ride below.

// Coach credentials & verification — upload the Certificate of Insurance (COI)
// + certifications, then submit for admin review. On approval a ✓ Verified badge
// shows on the marketplace + profile. Backed by /api/coach/credentials(+/document).
function CoachCredentialsCard() {
  const [st, setSt] = React.useState({ loading: true });
  const [busy, setBusy] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [cert, setCert] = React.useState({ type: "", number: "" });

  const load = React.useCallback(() => {
    fetch("/api/coach/credentials", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSt({ loading: false, data: d }))
      .catch(() => setSt({ loading: false, data: null }));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const upload = async (kind, file, extra) => {
    if (!file) return;
    setBusy(kind); setMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("kind", kind);
      if (extra) { fd.append("type", extra.type || ""); fd.append("number", extra.number || ""); }
      const r = await fetch("/api/coach/credentials/document", { method: "POST", credentials: "same-origin", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Upload failed.");
      setMsg(kind === "coi" ? "Insurance document uploaded." : "Certificate uploaded.");
      if (kind === "cert") setCert({ type: "", number: "" });
      load();
    } catch (e) { setMsg((e && e.message) || "Upload failed."); }
    finally { setBusy(""); }
  };

  const submit = async () => {
    setBusy("submit"); setMsg("");
    try {
      const r = await fetch("/api/coach/credentials", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "submit" }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Could not submit.");
      setMsg("Submitted for review — we’ll verify within a few business days.");
      load();
    } catch (e) { setMsg((e && e.message) || "Could not submit."); }
    finally { setBusy(""); }
  };

  const d = st.data || {};
  const review = d.review || {};
  const verified = !!d.verified;
  const status = verified ? "verified" : (review.status || "none");
  const badge = {
    verified: ["✓ Verified", "teal"],
    pending: ["In review", "amber"],
    changes_requested: ["Changes requested", "amber"],
    rejected: ["Not verified", "rust"],
    approved: ["✓ Verified", "teal"],
    none: ["Not submitted", "muted"],
  }[status] || ["—", "muted"];
  const blocked = !review.hasCoi || status === "pending";

  return (
    <div className="px-card" style={pxCard} data-px-card="credentials">
      <PxHead title="Credentials & verification" pill={st.data ? badge[0] : null} tone={badge[1]}
        desc={<>Upload proof of certification and your professional liability insurance (COI). Once verified, a <span style={{ color: PX.teal }}>✓ Verified</span> badge shows on your marketplace profile.</>} />

      {st.loading ? (
        <div style={pxQuiet}>Loading…</div>
      ) : !st.data ? (
        <p style={pxBody}>Sign in as a coach to manage your credentials.</p>
      ) : (
        <>
          {review.notes && status !== "verified" ? (
            <div style={pxNotice("amber")}><span aria-hidden="true" style={{ fontFamily: PX.mono, fontSize: 12, color: PX.amber }}>!</span><p style={{ ...pxBody, color: "rgba(242,237,228,0.85)" }}>Reviewer note: {review.notes}</p></div>
          ) : null}

          {/* COI */}
          <div style={{ ...pxRow, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={pxLabel}>Insurance · COI</div>
              <div style={{ ...pxValue, color: review.hasCoi ? PX.teal : PX.faint }}>{review.hasCoi ? "On file ✓" : "Not uploaded"}</div>
            </div>
            <label style={pxButton(false, busy === "coi")}>
              {busy === "coi" ? "Uploading…" : (review.hasCoi ? "Replace COI" : "Upload COI")}
              <input type="file" accept="application/pdf,image/*,.doc,.docx" style={{ display: "none" }} disabled={busy === "coi"} onChange={(e) => upload("coi", e.target.files && e.target.files[0])} />
            </label>
          </div>

          {/* Certifications */}
          <div style={pxRow}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <div style={pxLabel}>Certifications</div>
              <div style={{ ...pxValue, marginTop: 0, color: review.certCount ? PX.teal : PX.faint }}>{review.certCount ? `${review.certCount} on file ✓` : "None yet"}</div>
            </div>
            <div className="px-cert" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr) auto", gap: 8, marginTop: 10 }}>
              <input aria-label="Certification type" style={pxInput} placeholder="Cert (e.g. NASM-CPT)" value={cert.type} onChange={(e) => setCert((c) => ({ ...c, type: e.target.value }))} />
              <input aria-label="Certification number" style={pxInput} placeholder="Cert # (optional)" value={cert.number} onChange={(e) => setCert((c) => ({ ...c, number: e.target.value }))} />
              <label style={pxButton(false, busy === "cert")}>
                {busy === "cert" ? "Uploading…" : "Add file"}
                <input type="file" accept="application/pdf,image/*,.doc,.docx" style={{ display: "none" }} disabled={busy === "cert"} onChange={(e) => upload("cert", e.target.files && e.target.files[0], cert)} />
              </label>
            </div>
          </div>

          {/* Submit */}
          <div style={pxFoot}>
            <div role="status" style={pxMsg}>{msg}</div>
            <button
              onClick={submit}
              disabled={busy === "submit" || blocked}
              style={pxButton(true, blocked)}
              title={!review.hasCoi ? "Upload your COI first" : status === "pending" ? "Already in review" : "Submit for verification"}
            >
              {status === "pending" ? "In review" : busy === "submit" ? "Submitting…" : "Submit for review"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Marketplace listing · rates and readiness. A coach's listing is hidden from the marketplace
// until it has a monthly price, active payouts and a photo (listing_ready, 2026-10-12); this card
// says which are missing and sets the rates, which nothing else on the site could. Backed by
// /api/coach/listing (the same route the Business page's notice reads).
const LISTING_STEP_TEXT = {
  price: "your monthly rate",
  payouts: "payouts set up (Business → Set up payouts)",
  photo: "a photo (below, or your profile photo)",
};
function listingStepsLine(missing) {
  const parts = (missing || []).map((k) => LISTING_STEP_TEXT[k]).filter(Boolean);
  if (parts.length <= 1) return parts.join("");
  return parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
}

// ── The coach setup cards' one look (owner, 2026-10-18: "improve design and look of this on
// profile page on website"). Each card opens with a plain title, a status pill where there is a
// state to report, and a line saying what it is for; rows sit on hairlines, fields are one height,
// and buttons are pills. The four sit in two columns on a wide screen (DashProfileExtras). The
// living profile is always dark, whatever the paper, so the palette is literal, as it was.
const PX = {
  ink: "#f2ede4", muted: "rgba(242,237,228,0.64)", faint: "rgba(242,237,228,0.42)", line: "rgba(242,237,228,0.08)",
  teal: (typeof window !== "undefined" && window.TEAL_BRIGHT) || "#2ee0c4", amber: "#d8a23a", rust: "#e07856",
  mono: "'JetBrains Mono', monospace", sans: "'Space Grotesk', sans-serif", serif: "'Fraunces', serif",
};
// [text, border, fill] for a pill or a notice.
const PX_TONES = {
  teal: ["#2ee0c4", "rgba(46,224,196,0.38)", "rgba(46,224,196,0.07)"],
  amber: ["#d8a23a", "rgba(216,162,58,0.45)", "rgba(216,162,58,0.08)"],
  rust: ["#e07856", "rgba(224,120,86,0.45)", "rgba(224,120,86,0.08)"],
  muted: ["rgba(242,237,228,0.6)", "rgba(242,237,228,0.2)", "rgba(242,237,228,0.03)"],
};
const pxCard = { background: "linear-gradient(180deg, rgba(242,237,228,0.04), rgba(242,237,228,0.015))", border: "1px solid rgba(242,237,228,0.09)", borderRadius: 16, padding: "22px 24px 20px", marginBottom: 16, breakInside: "avoid", boxSizing: "border-box", width: "100%" };
const pxLabel = { fontFamily: PX.mono, fontSize: 9.5, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)" };
const pxBody = { fontFamily: PX.sans, fontSize: 13, color: PX.muted, lineHeight: 1.5, margin: 0 };
const pxQuiet = { fontFamily: PX.mono, fontSize: 11, color: "rgba(242,237,228,0.4)" };
const pxValue = { fontFamily: PX.sans, fontSize: 13, marginTop: 4 };
const pxRow = { padding: "14px 0", borderTop: "1px solid " + PX.line };
const pxFoot = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 16, borderTop: "1px solid " + PX.line };
// The save line shrinks beside its button rather than wrapping the button onto a line of its own.
const pxMsg = { fontFamily: PX.mono, fontSize: 10.5, color: "rgba(242,237,228,0.55)", minHeight: 14, flex: "1 1 0", minWidth: 0 };
const pxInput = { height: 40, boxSizing: "border-box", background: "rgba(0,0,0,0.25)", border: "1px solid rgba(242,237,228,0.16)", borderRadius: 10, padding: "0 12px", color: PX.ink, fontFamily: PX.sans, fontSize: 13.5, outline: "none", minWidth: 0, width: "100%" };
function pxNotice(tone) {
  const t = PX_TONES[tone] || PX_TONES.muted;
  return { display: "flex", gap: 10, alignItems: "baseline", padding: "11px 13px", borderRadius: 11, marginBottom: 14, border: "1px solid " + t[1], background: t[2] };
}
function pxButton(primary, off) {
  const base = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 38, boxSizing: "border-box", padding: "0 17px", borderRadius: 999, fontFamily: PX.sans, fontSize: 13, whiteSpace: "nowrap", cursor: off ? "default" : "pointer" };
  return primary
    ? { ...base, border: 0, fontWeight: 600, background: off ? "rgba(46,224,196,0.16)" : PX.teal, color: off ? "rgba(46,224,196,0.75)" : "#0b0e0c" }
    : { ...base, fontWeight: 500, background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.22)", color: PX.ink, opacity: off ? 0.55 : 1 };
}
function PxHead({ title, desc, pill, tone }) {
  const t = PX_TONES[tone] || PX_TONES.muted;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h3 style={{ margin: 0, fontFamily: PX.sans, fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em", color: PX.ink, lineHeight: 1.25 }}>{title}</h3>
        {pill ? <span data-px-pill="" style={{ flex: "none", fontFamily: PX.mono, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: t[0], border: "1px solid " + t[1], background: t[2], borderRadius: 999, padding: "4px 10px" }}>{pill}</span> : null}
      </div>
      {desc ? <p style={{ ...pxBody, marginTop: 6 }}>{desc}</p> : null}
    </div>
  );
}
// A money field: the dollar sign and the period sit inside the box with the number.
function PxMoney({ label, value, onChange, placeholder, aria, per }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 0 }}>
      <span style={pxLabel}>{label}</span>
      <span className="px-money" style={{ ...pxInput, display: "flex", alignItems: "center", gap: 6, padding: "0 12px" }}>
        <span aria-hidden="true" style={{ fontFamily: PX.mono, fontSize: 12, color: PX.faint }}>$</span>
        <input style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none", color: PX.ink, fontFamily: PX.sans, fontSize: 14, fontVariantNumeric: "tabular-nums" }} inputMode="decimal" value={value} onChange={onChange} placeholder={placeholder} aria-label={aria} />
        {per ? <span aria-hidden="true" style={{ fontFamily: PX.mono, fontSize: 11, color: PX.faint }}>{per}</span> : null}
      </span>
    </label>
  );
}

function CoachListingRatesCard() {
  const role = /nutrition/i.test(typeof window !== "undefined" ? window.location.pathname : "") ? "nutritionist" : "trainer";
  const oneTimeLabel = role === "nutritionist" ? "Single consult" : "Single session";
  const [state, setState] = React.useState({ loading: true, error: false, listing: null, signedIn: true });
  const [monthly, setMonthly] = React.useState("");
  const [oneTime, setOneTime] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let on = true;
    setState((s) => ({ ...s, loading: true, error: false }));
    fetch("/api/coach/listing", { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) return { signedIn: false };
        if (!r.ok) throw new Error("read");
        return r.json();
      })
      .then((d) => {
        if (!on) return;
        if (d.signedIn === false) { setState({ loading: false, error: false, listing: null, signedIn: false }); return; }
        const listing = ((d && d.listings) || []).find((l) => l.role === role) || null;
        setState({ loading: false, error: false, listing, signedIn: true });
        if (listing) {
          setMonthly(listing.monthly != null ? String(listing.monthly) : "");
          setOneTime(listing.oneTime != null ? String(listing.oneTime) : "");
        }
      })
      .catch(() => { if (on) setState((s) => ({ ...s, loading: false, error: true })); });
    return () => { on = false; };
  }, [role, reloadKey]);

  // A photo saved in the card below can make the listing ready: read the readiness again, leaving
  // the rates as typed (a coach can be mid-edit here).
  React.useEffect(() => {
    let on = true;
    const onChanged = () => {
      fetch("/api/coach/listing", { credentials: "same-origin", cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const listing = d && ((d.listings || []).find((l) => l.role === role) || null);
          if (on && listing) setState((s) => ({ ...s, listing }));
        })
        .catch(() => {});
    };
    window.addEventListener("shape:listing-changed", onChanged);
    return () => { on = false; window.removeEventListener("shape:listing-changed", onChanged); };
  }, [role]);

  const save = async () => {
    if (busy) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/coach/listing", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, monthly, oneTime }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Could not save your rates. Please try again.");
      setState((s) => ({ ...s, listing: d.listing }));
      setMsg("Rates saved ✓");
    } catch (e) { setMsg((e && e.message) || "Could not save your rates. Please try again."); }
    finally { setBusy(false); }
  };

  const l = state.listing;
  // ⚠ SUSPENDED BEFORE READY (Codex on #2399). listing_ready counts the price, payouts and photo and
  // not staff's suspension, so a suspended coach whose listing was complete reads both, and was shown
  // "Live" and "Your listing is in the marketplace." while members could neither find nor hire them.
  const live = !!(l && l.ready && !l.suspended);
  const pill = !l ? null : l.suspended ? ["Suspended", "rust"] : l.ready ? ["Live", "teal"] : ["Not listed", "amber"];

  return (
    <div className="px-card" style={pxCard} data-px-card="rates">
      <PxHead title="Rates" pill={pill && pill[0]} tone={pill && pill[1]} desc={"What members pay to hire you: a monthly rate, and a " + oneTimeLabel.toLowerCase() + " if you offer one."} />
      {state.loading ? (
        <div style={pxQuiet}>Loading…</div>
      ) : state.error ? (
        <div>
          <p style={pxBody}>Couldn't load your listing — nothing has changed. Try again.</p>
          <button onClick={() => setReloadKey((k) => k + 1)} style={{ ...pxButton(false), marginTop: 12 }}>Retry</button>
        </div>
      ) : !state.signedIn ? (
        <p style={pxBody}>Sign in as a coach to set your rates.</p>
      ) : !l ? (
        <p style={pxBody}>Your listing appears once your coach application is approved.</p>
      ) : (
        <>
          <div role="status" style={pxNotice(live ? "teal" : "amber")}>
            <span aria-hidden="true" style={{ fontFamily: PX.mono, fontSize: 12, color: live ? PX.teal : PX.amber }}>{live ? "✓" : "!"}</span>
            <p style={{ ...pxBody, color: "rgba(242,237,228,0.85)" }}>
              {l.suspended
                ? "Your listing is suspended until further review. Members can't find or subscribe to you while it is."
                : l.ready
                  ? "Your listing is in the marketplace."
                : l.missing && l.missing.length
                  ? <>Members can't find you yet. Your listing appears in the marketplace once it has {listingStepsLine(l.missing)}.</>
                  : "Your listing isn't in the marketplace yet."}
            </p>
          </div>
          <div style={{ ...pxRow, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
            <PxMoney label="Monthly rate" per="/ mo" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="120" aria="Monthly rate in dollars" />
            <PxMoney label={oneTimeLabel + " · optional"} value={oneTime} onChange={(e) => setOneTime(e.target.value)} placeholder="60" aria={oneTimeLabel + " price in dollars"} />
          </div>
          <div style={pxFoot}>
            <div role="status" style={pxMsg}>{msg}</div>
            <button onClick={save} disabled={busy} style={pxButton(true, busy)}>{busy ? "Saving…" : "Save rates"}</button>
          </div>
        </>
      )}
    </div>
  );
}

// Taking new clients · the capacity switch and the waiting room (client-onboarding task #10). The
// website had neither: a coach could pause only from the app, which changed the first listing it
// found, and could see and invite their waiting list only there. Backed by /api/coach/capacity (the
// switch, a resume date, free intros while full; reopening tells the waiting list) and the waitlist
// routes (/api/waitlist/room, /api/waitlist/invite), on the website's cookie session.
// At capacity a coach's current clients still book and buy; new ones join the waiting list.
// A picked day reopens at the start of that day on the coach's own clock: the day is sent as it is
// (`resumeOn`) and the route places it in the listing's zone (Codex on #2375: this built midnight in
// the browser's zone). The browser's zone rides along only for a listing that has none yet.
function cpcBrowserZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (e) { return null; }
}
// The earliest day the picker offers: tomorrow on the COACH's calendar, the zone the route places
// the day in (the listing's, or this browser's for a listing with none yet), because that day's
// midnight is the first still to come. Read from this browser's calendar (Codex on #2375), a New
// York listing managed from Tokyo on a Friday morning could not pick Friday, still to come in New
// York; the other way round it offered a day whose midnight had passed. The route checks the instant.
function cpcTomorrow(zone) {
  let y, m, d;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const get = (t) => Number((parts.find((p) => p.type === t) || {}).value);
    y = get("year"); m = get("month"); d = get("day");
  } catch (e) { y = NaN; }
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    const now = new Date(); y = now.getFullYear(); m = now.getMonth() + 1; d = now.getDate();
  }
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  const p = (n) => String(n).padStart(2, "0");
  return t.getUTCFullYear() + "-" + p(t.getUTCMonth() + 1) + "-" + p(t.getUTCDate());
}
// The coach's day, shown as that day wherever the page is read (noon keeps it on its date).
function cpcDayLabel(day) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(day || "") ? new Date(day + "T12:00:00") : null;
  return d && !isNaN(d) ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
}

function CoachCapacityCard() {
  const role = /nutrition/i.test(typeof window !== "undefined" ? window.location.pathname : "") ? "nutritionist" : "trainer";
  const [state, setState] = React.useState({ loading: true, error: false, signedIn: true, listing: null });
  const [room, setRoom] = React.useState({ loading: false, error: false, entries: [] });
  const [resumeDay, setResumeDay] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let on = true;
    setState((s) => ({ ...s, loading: true, error: false }));
    // This browser's zone rides along: a listing with no zone of its own places, and reads back, its
    // resume day in it (Codex on #2375).
    fetch("/api/coach/capacity?tz=" + encodeURIComponent(cpcBrowserZone() || ""), { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) return { signedIn: false };
        if (!r.ok) throw new Error("read");
        return r.json();
      })
      .then((d) => {
        if (!on) return;
        if (d.signedIn === false) { setState({ loading: false, error: false, signedIn: false, listing: null }); return; }
        const listing = ((d && d.listings) || []).find((l) => l.role === role) || null;
        setState({ loading: false, error: false, signedIn: true, listing });
        setResumeDay(listing && listing.effective && listing.resumeOn ? listing.resumeOn : "");
      })
      .catch(() => { if (on) setState((s) => ({ ...s, loading: false, error: true })); });
    return () => { on = false; };
  }, [role, reloadKey]);

  const providerId = state.listing && state.listing.providerId;
  const loadRoom = React.useCallback(() => {
    if (!providerId) return () => {};
    let on = true;
    setRoom((r) => ({ ...r, loading: true, error: false }));
    fetch("/api/waitlist/room?providerId=" + encodeURIComponent(providerId) + "&providerRole=" + role, { credentials: "same-origin", cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error("room"); return r.json(); })
      .then((d) => { if (on) setRoom({ loading: false, error: false, entries: Array.isArray(d && d.entries) ? d.entries : [] }); })
      .catch(() => { if (on) setRoom((r) => ({ ...r, loading: false, error: true })); });
    return () => { on = false; };
  }, [providerId, role]);
  React.useEffect(() => loadRoom(), [loadRoom]);

  const save = async (patch, label) => {
    if (busy) return;
    setBusy(label); setMsg("");
    try {
      const r = await fetch("/api/coach/capacity", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, tz: cpcBrowserZone(), ...patch }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.listing) throw new Error(d.detail || (d.error && d.error !== "save_failed" ? d.error : "") || "Could not save. Please try again.");
      setState((s) => ({ ...s, listing: d.listing }));
      if (patch.atCapacity === true) setMsg("Paused. New clients can join your waiting list.");
      else if (patch.atCapacity === false) setMsg(d.notified > 0 ? "Taking new clients again. " + d.notified + (d.notified === 1 ? " person" : " people") + " on your waiting list were told." : "Taking new clients again.");
      else setMsg("Saved ✓");
    } catch (e) { setMsg((e && e.message) || "Could not save. Please try again."); }
    finally { setBusy(""); }
  };

  const invite = async (entryId) => {
    if (busy) return;
    setBusy("invite:" + entryId); setMsg("");
    try {
      const r = await fetch("/api/waitlist/invite", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryId }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Could not send the invite.");
      setMsg("Invited. They have a window to book before you reopen to everyone.");
      loadRoom();
    } catch (e) { setMsg((e && e.message) || "Could not send the invite."); }
    finally { setBusy(""); }
  };

  const l = state.listing;
  const full = !!(l && l.effective);
  const waiting = (room.entries || []).filter((e) => e.position);
  const btn = (primary) => pxButton(primary, !!busy);

  return (
    <div className="px-card" style={pxCard} data-capacity-card="">
      <PxHead title="Taking new clients" pill={l ? (full ? "Paused" : "Open") : null} tone={full ? "rust" : "teal"} />
      {state.loading ? (
        <div style={pxQuiet}>Loading…</div>
      ) : state.error ? (
        <div>
          <p style={pxBody}>Couldn't load your capacity — nothing has changed. Try again.</p>
          <button onClick={() => setReloadKey((k) => k + 1)} style={{ ...btn(false), marginTop: 12 }}>Retry</button>
        </div>
      ) : !state.signedIn ? (
        <p style={pxBody}>Sign in as a coach to manage your capacity.</p>
      ) : !l ? (
        <p style={pxBody}>Your capacity can be set once your coach application is approved.</p>
      ) : (
        <>
          <div role="status" style={pxNotice(full ? "rust" : "teal")}>
            <span aria-hidden="true" style={{ fontFamily: PX.mono, fontSize: 12, color: full ? PX.rust : PX.teal }}>{full ? "×" : "✓"}</span>
            <p style={{ ...pxBody, color: "rgba(242,237,228,0.85)" }}>
              {full
                ? <>You're at capacity{l.resumeOn ? <>, reopening {cpcDayLabel(l.resumeOn)}</> : null}. New clients can join your waiting list; your current clients still book and buy.</>
                : "You're taking new clients. Pause when you're full, and new clients join your waiting list instead."}
            </p>
          </div>
          {full ? (
            <div style={{ ...pxRow, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={() => save({ atCapacity: false }, "open")} disabled={!!busy} style={btn(true)} data-capacity-open="">{busy === "open" ? "Saving…" : "Take new clients again"}</button>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontFamily: PX.sans, fontSize: 13, color: "rgba(242,237,228,0.8)", cursor: "pointer" }}>
                <input type="checkbox" checked={!!l.introsAtCapacity} disabled={!!busy} onChange={(e) => save({ introsAtCapacity: e.target.checked }, "intros")} data-capacity-intros="" style={{ width: 16, height: 16, accentColor: PX.teal }} />
                Free intros while full
              </label>
            </div>
          ) : (
            <div style={{ ...pxRow, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <span style={pxLabel}>Reopen on · optional</span>
                <input type="date" value={resumeDay} min={cpcTomorrow((l && l.timezone) || cpcBrowserZone())} onChange={(e) => setResumeDay(e.target.value)} aria-label="Reopen on" style={{ ...pxInput, width: 170, colorScheme: "dark" }} />
              </label>
              <button onClick={() => save({ atCapacity: true, ...(resumeDay ? { resumeOn: resumeDay, tz: cpcBrowserZone() } : {}) }, "pause")} disabled={!!busy} style={btn(true)} data-capacity-pause="">{busy === "pause" ? "Saving…" : "Pause new clients"}</button>
            </div>
          )}
          <div style={{ ...pxRow, paddingBottom: 0 }}>
            <div style={{ ...pxLabel, marginBottom: 8 }}>Waiting list · {waiting.length}</div>
            {room.error ? (
              <p style={pxBody}>Couldn't load your waiting list. <button onClick={loadRoom} style={{ background: "transparent", border: 0, padding: 0, color: PX.teal, cursor: "pointer", fontFamily: PX.sans, fontSize: 13, textDecoration: "underline" }}>Retry</button></p>
            ) : room.loading && !waiting.length ? (
              <div style={pxQuiet}>Loading…</div>
            ) : !waiting.length ? (
              <p style={pxBody}>No one is waiting. When you're at capacity, members can join your list from your profile.</p>
            ) : waiting.map((e) => (
              <div key={e.id} data-waitlist-entry="" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 0", borderTop: "1px solid rgba(242,237,228,0.06)" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: PX.sans, fontSize: 13.5, color: PX.ink }}><span style={{ fontFamily: PX.mono, fontSize: 11, color: PX.faint, marginRight: 8 }}>#{e.position}</span>{e.clientName || "Member"}</div>
                  {e.note ? <div style={{ fontFamily: PX.sans, fontSize: 12, color: "rgba(242,237,228,0.55)", marginTop: 2 }}>{e.note}</div> : null}
                </div>
                {e.status === "invited"
                  ? <span style={{ fontFamily: PX.mono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: PX.teal }}>Invited</span>
                  : <button onClick={() => invite(e.id)} disabled={!!busy} style={btn(false)} data-waitlist-invite="">{busy === "invite:" + e.id ? "Inviting…" : "Invite"}</button>}
              </div>
            ))}
          </div>
          <div role="status" style={{ ...pxMsg, minHeight: 0, marginTop: msg ? 10 : 0 }}>{msg}</div>
        </>
      )}
    </div>
  );
}

// Marketplace listing photos — the coach dresses their marketplace box (portrait,
// cover, studio gallery) from the dashboard. Reads/writes the coach's OWN provider
// row directly via window.shapeDb.client (owner-scoped RLS + the admin-column
// guard). Role is the dashboard's own (Trainer vs Nutritionist page). Media is
// normalized by the canonical ShapeListingLib at both write and (server-side)
// render, so an invalid/foreign URL never persists or shows.
function CoachListingMediaCard() {
  const lib = (typeof window !== "undefined" && window.ShapeListingLib) || null;
  const GMAX = (lib && lib.BS_LISTING_GALLERY_MAX) || 6;
  const CMAX = (lib && lib.BS_LISTING_CAPTION_MAX) || 80;
  const role = /nutrition/i.test(typeof window !== "undefined" ? window.location.pathname : "") ? "nutritionist" : "trainer";
  const table = role === "nutritionist" ? "nutritionists" : "trainers";
  const [meta, setMeta] = React.useState({ loading: true, signedIn: true, hasRow: true, loadError: false });
  const [uid, setUid] = React.useState(null);
  const [portrait, setPortrait] = React.useState(null);
  const [cover, setCover] = React.useState(null);
  const [gallery, setGallery] = React.useState([]); // [{ id, url, caption }]
  const nextId = React.useRef(0);
  const [busy, setBusy] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    const cl = window.shapeDb && window.shapeDb.client;
    if (!cl || !cl.auth) { setMeta({ loading: false, signedIn: false, hasRow: false, loadError: false }); return undefined; }
    let on = true;
    setMeta((s) => ({ ...s, loading: true, loadError: false }));
    (async () => {
      try {
        const { data: ud } = await cl.auth.getUser();
        const id = ud && ud.user && ud.user.id;
        if (!on) return;
        if (!id) { setMeta({ loading: false, signedIn: false, hasRow: false, loadError: false }); return; }
        setUid(id);
        const r = await cl.from(table).select("listing_media").eq("owner_id", id).maybeSingle();
        if (!on) return;
        if (r.error) throw r.error;
        if (!r.data) { setMeta({ loading: false, signedIn: true, hasRow: false, loadError: false }); return; }
        // Without the normalizer we can't safely READ or later WRITE — treat a
        // missing guard as a load failure (Retry), never an empty editor that
        // Save would then persist over the coach's real photos.
        if (!lib || !lib.bsNormalizeListingMedia) throw new Error("listing guard unavailable");
        const m = lib.bsNormalizeListingMedia(r.data.listing_media, id);
        setPortrait(m.portrait || null);
        setCover(m.cover || null);
        setGallery((Array.isArray(m.gallery) ? m.gallery : []).map((g) => ({ id: nextId.current++, url: g.url, caption: g.caption || "" })));
        setMeta({ loading: false, signedIn: true, hasRow: true, loadError: false });
      } catch (e) { if (on) setMeta({ loading: false, signedIn: true, hasRow: true, loadError: true }); }
    })();
    return () => { on = false; };
  }, [table, reloadKey]);

  const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"];
  const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"];
  const okImage = (file) => {
    const t = (file.type || "").toLowerCase();
    if (t) return IMAGE_MIMES.includes(t);
    const ext = (file.name || "").toLowerCase().split(".").pop();
    return IMAGE_EXTS.includes(ext);
  };
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 2800); };
  const uploadImage = async (file) => {
    const cl = window.shapeDb && window.shapeDb.client;
    if (!file || !cl || !uid) return null;
    if (!okImage(file) || file.size > 10 * 1024 * 1024) { flash("Images only, under 10 MB."); return null; }
    setUploading(true);
    try {
      const nameExt = (file.name && file.name.includes(".")) ? file.name.split(".").pop() : "";
      const ext = ((file.type && file.type.split("/")[1]) || nameExt || "jpg").replace(/[^a-z0-9]/gi, "") || "jpg";
      const EXT_MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif" };
      const path = `${uid}/listing/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const { error } = await cl.storage.from("coach-media").upload(path, file, { contentType: file.type || EXT_MIME[ext.toLowerCase()] || "image/jpeg", upsert: false });
      if (error) throw error;
      const { data } = cl.storage.from("coach-media").getPublicUrl(path);
      return (data && data.publicUrl) || null;
    } catch (e) { flash((e && e.message) || "Upload failed."); return null; }
    finally { setUploading(false); }
  };
  const pickSlot = (setter) => async (e) => {
    const file = e.target.files && e.target.files[0]; if (e.target) e.target.value = "";
    const url = await uploadImage(file); if (url) setter(url);
  };
  const pickGallery = async (e) => {
    const file = e.target.files && e.target.files[0]; if (e.target) e.target.value = "";
    if (gallery.length >= GMAX) return;
    const url = await uploadImage(file); if (url) setGallery((p) => (p.length >= GMAX ? p : [...p, { id: nextId.current++, url, caption: "" }]));
  };
  const setCap = (id, v) => setGallery((p) => p.map((g) => (g.id === id ? { ...g, caption: v.slice(0, CMAX) } : g)));
  const rmGal = (id) => setGallery((p) => p.filter((g) => g.id !== id));
  const save = async () => {
    const cl = window.shapeDb && window.shapeDb.client;
    if (busy || uploading || !cl || !uid) return;
    setBusy(true); setMsg("");
    try {
      // Backstop: never write an un-normalized doc (the load effect already
      // blocks the editor when the guard is missing).
      if (!lib || !lib.bsNormalizeListingMedia) throw new Error("Couldn't save — reload the page and try again.");
      const raw = { portrait, cover, gallery: gallery.map((g) => ({ url: g.url, caption: g.caption })), updatedAt: new Date().toISOString() };
      const clean = lib.bsNormalizeListingMedia(raw, uid);
      const { data: rows, error } = await cl.from(table).update({ listing_media: clean }).eq("owner_id", uid).select("id");
      if (error) throw error;
      if (!rows || !rows.length) throw new Error("Your coach listing was not found.");
      flash("Listing saved ✓");
      // A photo can be the last step to the marketplace; the Rates card above re-reads the listing.
      try { window.dispatchEvent(new Event("shape:listing-changed")); } catch (_) {}
    } catch (e) { flash((e && e.message) || "Could not save — try again."); }
    finally { setBusy(false); }
  };

  const off = uploading || busy;
  const linkBtn = { background: "transparent", border: 0, cursor: "pointer", fontFamily: PX.mono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(242,237,228,0.55)", padding: "6px 2px" };
  // A slot is its own upload button: empty, a dashed tile that says what goes in it; filled, the
  // photo, with Replace and Remove under it.
  const tile = (url, w, h, word, onPick) => (
    <label className={url ? "px-tile dash-photo" : "px-tile"} title={url ? "Replace" : "Add " + word.toLowerCase()} style={{ position: "relative", width: w, height: h, flex: "none", borderRadius: 12, cursor: off ? "progress" : "pointer", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 4, boxSizing: "border-box", border: url ? "1px solid rgba(242,237,228,0.16)" : "1.5px dashed rgba(242,237,228,0.24)", background: url ? `center/cover no-repeat url("${url}")` : "rgba(242,237,228,0.025)" }}>
      {url ? null : <>
        <span aria-hidden="true" style={{ fontFamily: PX.sans, fontSize: 20, lineHeight: 1, color: PX.teal }}>＋</span>
        <span style={{ fontFamily: PX.mono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(242,237,228,0.55)" }}>{word}</span>
      </>}
      <input type="file" accept="image/*" aria-label={(url ? "Replace " : "Add ") + word.toLowerCase()} style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }} disabled={off} onChange={onPick} />
    </label>
  );
  const slot = (label, word, url, ctl, w) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div style={pxLabel}>{label}</div>
      {tile(url, w, 96, word, pickSlot(ctl.set))}
      {portrait || cover ? (
        <div style={{ minHeight: 24, display: "flex", gap: 10 }}>
          {url ? <button style={linkBtn} onClick={() => ctl.clear()}>× Remove</button> : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="px-card" style={pxCard} data-px-card="photos">
      <PxHead title="Listing photos" desc={"Your box on the marketplace — a portrait of you, a cover (the box's background), and a studio gallery of your space."} />
      {meta.loading ? (
        <div style={pxQuiet}>Loading…</div>
      ) : meta.loadError ? (
        <div>
          <p style={pxBody}>Couldn't load your listing photos — your saved photos are untouched. Try again.</p>
          <button style={{ ...pxButton(false), marginTop: 12 }} onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
        </div>
      ) : !meta.signedIn ? (
        <p style={pxBody}>Sign in as a coach to manage your listing photos.</p>
      ) : !meta.hasRow ? (
        <p style={pxBody}>Your listing box appears once your coach application is approved.</p>
      ) : (
        <>
          <div style={{ ...pxRow, display: "flex", gap: 18, flexWrap: "wrap" }}>
            {slot("Portrait · you", "Portrait", portrait, { set: setPortrait, clear: () => setPortrait(null) }, 96)}
            {slot("Cover · your background", "Cover", cover, { set: setCover, clear: () => setCover(null) }, 172)}
          </div>
          <div style={pxRow}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
              <div style={pxLabel}>Studio gallery</div>
              <div style={{ fontFamily: PX.mono, fontSize: 10, color: PX.faint }}>{gallery.length} of {GMAX}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
              {gallery.map((g) => (
                <div key={g.id} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div className="dash-photo" aria-hidden="true" style={{ width: 52, height: 52, flex: "none", borderRadius: 10, border: "1px solid rgba(242,237,228,0.16)", background: `center/cover no-repeat url("${g.url}")` }} />
                  <input aria-label="Caption" style={{ ...pxInput, flex: 1 }} placeholder="Caption" maxLength={CMAX} value={g.caption} onChange={(e) => setCap(g.id, e.target.value)} />
                  <button aria-label="Remove" style={{ ...linkBtn, fontSize: 16, color: PX.rust, padding: "6px 8px" }} onClick={() => rmGal(g.id)}>×</button>
                </div>
              ))}
              {gallery.length < GMAX ? (
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  {tile(null, 52, 52, "Add", pickGallery)}
                  <span style={{ ...pxBody, fontSize: 12.5 }}>{gallery.length ? "Add another photo of your space." : "Show members where you coach: your gym, your kitchen, your studio."}</span>
                </div>
              ) : null}
            </div>
          </div>
          <div style={pxFoot}>
            <div role="status" style={pxMsg}>{uploading ? "Uploading…" : msg}</div>
            <button onClick={save} disabled={off} style={pxButton(true, off)}>{busy ? "Saving…" : "Save listing"}</button>
          </div>
        </>
      )}
    </div>
  );
}

function CoachAccountSettings({ accountId }) {
  const [details,setDetails]=React.useState(null);
  const [error,setError]=React.useState("");
  const [editing,setEditing]=React.useState(false);
  const load=React.useCallback(async()=>{
    if(!accountId)return;
    setError("");
    try {
      const lib=await cmeSettingsSync();
      const saved=await lib.loadSettings(window.shapeDb);
      if(saved.userId!==accountId)throw new Error("Your account changed. Reopen Settings.");
      setDetails(saved.profile);
    } catch(e) { setError(e.message || "Could not load your profile details."); }
  },[accountId]);
  React.useEffect(()=>{load();},[load]);
  async function persist(patch,uid) {
    try { const lib=await cmeSettingsSync();await lib.saveSettingsPatch(window.shapeDb,patch,uid);return null; }
    catch(e) { return e.message || "Could not save your profile details."; }
  }
  // ⚠ THE SAME PLATES AS THE REST OF SETTINGS — owner, 2026-10-15: "improve look and layout of
  // this on settings page in dashboard". This section was a 900px column centred under full-width
  // plates, with a bare heading and its own rounded cards, so the page changed width and style
  // halfway down. It uses the page's own card now (dash-plate, the mono eyebrow over its ledger),
  // the two short cards share a row, and the danger zone's eyebrow is the danger colour.
  const plate = (dac) => ({ "--dac": dac, paddingLeft: 24 });
  const note = { margin: "0 0 14px", fontSize: 12.5, lineHeight: 1.5, color: "var(--sh-ink2, #a09b94)" };
  const btn = (danger) => ({ background: "transparent", color: danger ? "var(--sh-danger, #e07856)" : "var(--sh-ink, #f2ede4)", border: `1px solid ${danger ? "rgba(224,120,86,0.45)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.2)"}`, padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif", textAlign: "left" });
  return (
    <React.Fragment>
      <div className="dk-3up" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginTop: 16 }}>
        <div className="dash-plate" style={plate("var(--sh-accent, #2ee0c4)")}>
          <div className="dash-eyebrow">Profile details</div>
          <div className="dash-ledger" />
          <p style={note}>Your name, handle, location and links are shared with the app. Manage your bio, credentials and listing on your profile.</p>
          {error && <p role="alert" style={{ ...note, color: "var(--sh-danger, #e07856)" }}>{error} <button type="button" onClick={load} style={{ ...btn(false), padding: "4px 10px", marginLeft: 6 }}>Retry</button></p>}
          <button type="button" disabled={!accountId || !details} style={{ ...btn(false), opacity: (!accountId || !details) ? 0.5 : 1 }} onClick={()=>setEditing(true)}>Edit profile details</button>
          {editing && <EditProfileModal initial={details} accountId={accountId} onClose={()=>setEditing(false)} onPersist={persist} onSaved={patch=>setDetails({...details,...patch})} />}
        </div>
        <div className="dash-plate" style={plate("var(--sh-accent, #2ee0c4)")}>
          <div className="dash-eyebrow">App tour</div>
          <div className="dash-ledger" />
          <p style={note}>A short walk through your dashboard and where everything lives.</p>
          <button style={btn(false)} onClick={() => { try { window.dispatchEvent(new Event("shape:startTour")); } catch (e) {} }}>Take the tour</button>
        </div>
      </div>
      <div className="dash-plate" style={{ ...plate("var(--sh-danger, #e07856)"), marginTop: 16 }}>
        <div className="dash-eyebrow">Account · Danger zone</div>
        <div className="dash-ledger" />
        <p style={note}>Download everything Shape holds about you, or close your account and erase it for good.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button style={btn(false)} onClick={async (ev) => {
            const b = ev && ev.currentTarget;
            if (b) b.disabled = true; // guard against double-submission
            try {
              // no-store: the export is the coach's full personal data — keep it out of the browser HTTP cache.
              const res = await fetch("/api/account/export", { credentials: "same-origin", cache: "no-store" });
              if (res.status === 401) { window.location.href = "/newdesign/Login.html"; return; }
              if (!res.ok) throw new Error("export failed");
              const blob = await res.blob(); const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url; a.download = `shape-data-export-${new Date().toISOString().slice(0, 10)}.json`;
              document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
            } catch (e) { alert("Could not export your data right now. Email privacy@theshapecommunity.com."); }
            finally { if (b) b.disabled = false; }
          }}>Export my data</button>
          <button style={btn(true)} onClick={async (ev) => {
            const b = ev && ev.currentTarget;
            if (!window.confirm("Permanently delete your Shape account and ALL your data? This cannot be undone.")) return;
            const typed = window.prompt("This erases your account, profile, and data for good. Type DELETE to confirm.");
            if ((typed || "").trim().toUpperCase() !== "DELETE") return;
            if (b) b.disabled = true; // destructive + non-idempotent — block re-clicks while in flight
            try {
              // Two requests (L1, 2026-10-08 review): the first earns a ten-minute confirmation token
              // bound to this account; the second, carrying it, deletes.
              let res = await fetch("/api/account/delete", { method: "POST", credentials: "same-origin" });
              if (res.status === 401) { window.location.href = "/newdesign/Login.html"; return; }
              if (res.status === 428) {
                const step = await res.json().catch(() => ({}));
                if (!step.confirmToken) throw new Error("delete failed");
                res = await fetch("/api/account/delete", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmToken: step.confirmToken }) });
                if (res.status === 401) { window.location.href = "/newdesign/Login.html"; return; }
              }
              if (!res.ok) throw new Error("delete failed");
              alert("Your account and data have been deleted.");
              try {
                if (window.shapeDb && window.shapeDb.signOut) await window.shapeDb.signOut();
                else if (window.shapeDb && window.shapeDb.client && window.shapeDb.client.auth) await window.shapeDb.client.auth.signOut();
              } catch (e) {}
              window.location.href = "/";
            } catch (e) { alert("Could not delete your account right now. Email privacy@theshapecommunity.com."); if (b) b.disabled = false; }
          }}>Close account</button>
        </div>
      </div>
    </React.Fragment>
  );
}

// The coach's own setup, under their profile: a heading that says only they see it, then the four
// cards in two columns on a wide screen, one on a phone. It takes the profile's own width (1240,
// as the hero and tabs do); at 900 it sat narrower than the tabs above it, off their edge.
function DashProfileExtras() {
  return (
    <section className="px-setup" aria-labelledby="px-setup-title" style={{ maxWidth: 1240, margin: "0 auto", padding: "44px 40px 34px", boxSizing: "border-box" }}>
      {/* A plain literal, as every stylesheet here is (tests/site-nav.test.mjs). */}
      <style>{`
        .px-setup .px-grid { columns: 2 440px; column-gap: 16px; }
        .px-setup input:focus-visible, .px-setup button:focus-visible, .px-setup label:focus-within { outline: 2px solid #2ee0c4; outline-offset: 2px; }
        .px-setup .px-money:focus-within { outline: 2px solid #2ee0c4; outline-offset: 2px; }
        .px-setup .px-tile:hover { border-color: rgba(46,224,196,0.55) !important; }
        @media (max-width: 760px) {
          .px-setup { padding: 28px 16px 24px !important; }
          .px-setup .px-cert { grid-template-columns: 1fr 1fr !important; }
          .px-setup .px-cert label { grid-column: 1 / -1; }
        }
      `}</style>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "12px 32px", flexWrap: "wrap", paddingBottom: 18, marginBottom: 22, borderBottom: "1px solid rgba(242,237,228,0.1)" }}>
        <div>
          <div style={{ fontFamily: PX.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: PX.teal }}>Coach setup · only you see this</div>
          <h2 id="px-setup-title" style={{ margin: "8px 0 0", fontFamily: PX.serif, fontSize: 30, fontWeight: 400, letterSpacing: "-0.015em", lineHeight: 1.1, color: PX.ink }}>Your listing, rates and verification</h2>
        </div>
        <p style={{ ...pxBody, maxWidth: 440 }}>What members find in the marketplace, what they pay you, and whether you're taking new clients.</p>
      </div>
      <div className="px-grid"><CoachCredentialsCard /><CoachListingRatesCard /><CoachCapacityCard /><CoachListingMediaCard /></div>
    </section>
  );
}
