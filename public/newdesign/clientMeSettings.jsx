function Row({ label, value, action, onAction }) {
  const chipStyle = { fontSize: 12, color: TEAL_BRIGHT, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em", cursor: "pointer", background: "transparent", border: 0, padding: "4px 8px", margin: "-4px -8px", borderRadius: 6 };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, alignItems: "center", padding: "14px 0", borderTop: "1px solid rgba(242,237,228,0.06)" }}>
      <div style={{ fontSize: 13.5, color: "rgba(242,237,228,0.6)" }}>{label}</div>
      <div style={{ fontSize: 13.5 }}>{value}</div>
      {action && (onAction
        ? <button onClick={onAction} onMouseOver={e => e.currentTarget.style.background = "rgba(46,224,196,0.08)"} onMouseOut={e => e.currentTarget.style.background = "transparent"} style={chipStyle}>{action}</button>
        : <span style={{ ...chipStyle, cursor: "default", opacity: 0.5 }}>{action}</span>)}
    </div>
  );
}
const SAMPLE_PROFILE = {
  displayName: "Priya Shah",
  email: "priya.shah@hey.com",
  phone: "+1 (347) •••• 0412",
  location: "Brooklyn, NY",
  birthday: "Oct 4, 1993",
  heightWeight: "5'6\" · 171 lb",
  dietaryStyle: "Omnivore · high protein",
  allergies: "Shellfish, tree nuts",
  dislikes: "Cilantro, blue cheese",
  proteinTarget: "168 g / day",
  calorieRange: "Not tracked · by feel",
  mealCadence: "3 meals + 1 snack",
  kitchen: "Full kitchen · 30 min weekdays",
  supplements: "Creatine, vitamin D, omega-3",
  alcohol: "Socially · Fri / Sat",
  hydrationTarget: "3.0 L / day",
  primaryGoal: "Strength + hypertrophy",
  experience: "Intermediate · 3 yrs barbell",
  sessionsPerWeek: "4 · 60–75 min",
  equipmentAccess: "Full gym · home bands + DBs",
  injuries: "Left shoulder · avoid overhead pressing past 90°",
  preferredTimes: "Evenings · 6–8pm",
  instagram: "@priya.lifts",
  tiktok: "",
  strava: "priya-s · public",
  website: "",
  youtube: "",
  twitter: "@priyas",
  profileVisibility: "Community only",
  shareDataWithCoaches: "All metrics",
  communityPosts: true,
  coachMessages: "Push + email",
  weeklyDigest: "Sunday 8am",
  marketingEmails: false,
  appleHealth: true,
  whoop: true,
  stravaConnected: false,
  myFitnessPal: false,
  garmin: false
};

function SingleFieldModal({ label, fieldKey, initialValue, onClose, onSaved }) {
  const [val, setVal] = React.useState(initialValue == null ? "" : String(initialValue));
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState(null);
  async function save() {
    setSaving(true); setErr(null);
    onSaved(fieldKey, val, (errMsg) => { setSaving(false); if (errMsg) setErr(errMsg); else onClose(); });
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,8,6,0.7)", backdropFilter: "blur(6px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: PAPER, border: "1px solid rgba(242,237,228,0.1)", borderRadius: 14, padding: 28, width: "100%", maxWidth: 480 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: TEAL_BRIGHT }}>EDIT · {label.toUpperCase()}</div>
        <div style={{ fontFamily: serif, fontSize: 28, letterSpacing: "-0.02em", margin: "6px 0 20px", color: INK }}>{label}.</div>
        <input
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") save(); }}
          style={{ width: "100%", background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.14)", color: INK, padding: "12px 14px", borderRadius: 6, fontFamily: "'Space Grotesk', sans-serif", fontSize: 14 }}
        />
        {err && <div style={{ color: "#e07856", fontSize: 13, marginTop: 14 }}>{err}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
          <button onClick={onClose} style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button disabled={saving} onClick={save} style={{ background: INK, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

function EditProfileModal({ initial, onClose, onSaved }) {
  const [form, setForm] = React.useState(initial || {});
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const field = (key, label) => (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.12em", color: "rgba(242,237,228,0.55)" }}>{label}</span>
      <input
        value={form[key] || ""}
        onChange={e => setForm({ ...form, [key]: e.target.value })}
        style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.14)", color: INK, padding: "10px 12px", borderRadius: 6, fontFamily: sans, fontSize: 13.5 }}
      />
    </label>
  );
  async function save() {
    setSaving(true); setErr(null);
    if (!window.shapeDb || !window.shapeDb.saveClientProfile) {
      setErr("Supabase client not loaded."); setSaving(false); return;
    }
    const res = await window.shapeDb.saveClientProfile(form);
    setSaving(false);
    if (res && res.error) { setErr(res.error.message || "Save failed"); return; }
    onSaved(form); onClose();
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,8,6,0.7)", backdropFilter: "blur(6px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: PAPER, border: "1px solid rgba(242,237,228,0.1)", borderRadius: 14, padding: 28, width: "100%", maxWidth: 720, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: TEAL_BRIGHT }}>EDIT · PROFILE</div>
        <div style={{ fontFamily: serif, fontSize: 30, letterSpacing: "-0.02em", margin: "6px 0 20px", color: INK }}>Your profile.</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, color: INK }}>
          {field("displayName", "NAME")}
          {field("email", "EMAIL")}
          {field("phone", "PHONE")}
          {field("location", "LOCATION")}
          {field("birthday", "BIRTHDAY")}
          {field("heightWeight", "HEIGHT / WEIGHT")}
          {field("primaryGoal", "PRIMARY GOAL")}
          {field("experience", "EXPERIENCE")}
          {field("dietaryStyle", "DIETARY STYLE")}
          {field("allergies", "ALLERGIES")}
          {field("proteinTarget", "PROTEIN TARGET")}
          {field("hydrationTarget", "HYDRATION TARGET")}
          {field("instagram", "INSTAGRAM")}
          {field("strava", "STRAVA")}
        </div>
        {err && <div style={{ color: "#e07856", fontSize: 13, marginTop: 14 }}>{err}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
          <button onClick={onClose} style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button disabled={saving} onClick={save} style={{ background: INK, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Save changes"}</button>
        </div>
      </div>
    </div>
  );
}

// Plan & billing — LIVE. Shape membership from /api/stripe/subscription,
// coaching plans from /api/client/team (the real per-coach subscriptions), and
// the card on file from /api/stripe/payment-method (brand + last4 only). No
// invented amounts: an honest empty/portal state shows when data is absent.
function PlanBillingCard({ signedIn }) {
  const [sub, setSub] = React.useState(undefined);  // undefined=loading, null=inactive, obj=active
  const [coaches, setCoaches] = React.useState(undefined); // undefined=loading, array when known
  const [pm, setPm] = React.useState(undefined);    // undefined=loading, {hasMethod,…}
  React.useEffect(() => {
    if (!signedIn) { setSub(null); setCoaches(null); setPm(null); return; }
    const j = (p) => fetch(p, { credentials: "same-origin", cache: "no-store" }).then(r => (r.ok ? r.json() : null)).catch(() => null);
    j("/api/stripe/subscription").then(d => setSub(d && d.active ? d : null));
    j("/api/client/team").then(d => setCoaches(d && Array.isArray(d.coaches) ? d.coaches : []));
    j("/api/stripe/payment-method").then(d => setPm(d || { hasMethod: false }));
  }, [signedIn]);
  const money = (c) => (typeof c === "number" ? "$" + (c % 100 ? (c / 100).toFixed(2) : (c / 100)) + " / month" : "$5 / month");
  const date = (s) => { try { return s ? new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null; } catch (e) { return null; } };
  const renews = sub && date(sub.renewsAt);
  const memberValue = sub === undefined ? "Checking…"
    : sub ? (money(sub.priceCents) + (renews ? " · renews " + renews : ""))
    : (signedIn ? "Not active" : "$5 / month — example");
  const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : "Card");
  const pmValue = (pm && pm.hasMethod) ? (cap(pm.brand) + " •••• " + (pm.last4 || "----"))
    : (sub || (pm && pm.hasMethod === false && signedIn) ? "Manage in billing portal" : "—");
  let coachingRows;
  if (!signedIn) {
    coachingRows = <Row label="Coaching plans" value="Managed with your coach" action="VIEW COACHES" onAction={() => window.location.href = "/newdesign/Marketplace.html"} />;
  } else if (coaches === undefined) {
    coachingRows = <Row label="Coaching plans" value="Checking…" />;
  } else if (coaches.length) {
    coachingRows = coaches.map((c, i) => <Row key={i} label={c.name} value={c.plan || "Active"} action="MANAGE" onAction={() => window.location.href = "/pricing"} />);
  } else {
    coachingRows = <Row label="Coaching plans" value="None active" action="FIND A COACH" onAction={() => window.location.href = "/newdesign/Marketplace.html"} />;
  }
  return (
    <Card>
      <SectionTitle>Plan &amp; billing</SectionTitle>
      <Row label="Shape membership" value={memberValue} action={sub ? "MANAGE" : "JOIN"} onAction={() => window.location.href = "/pricing"} />
      {coachingRows}
      <Row label="Payment method" value={pmValue} action={(pm && pm.hasMethod) || sub ? "UPDATE" : undefined} onAction={(pm && pm.hasMethod) || sub ? () => window.location.href = "/pricing" : undefined} />
    </Card>
  );
}

// Connected apps — LIVE. Real connection state from /api/integrations/status;
// CONNECT runs the actual OAuth (/api/integrations/<id>/authorize), DISCONNECT
// revokes it. Providers without a web OAuth are labelled honestly (Apple Health
// is HealthKit/app-only; MyFitnessPal isn't wired yet) instead of a fake toggle.
function ConnectedAppsCard({ signedIn }) {
  const [connected, setConnected] = React.useState(null); // Set<id> | null = loading
  const load = React.useCallback(() => {
    if (!signedIn) { setConnected(new Set()); return; }
    fetch("/api/integrations/status", { credentials: "same-origin", cache: "no-store" })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const s = new Set();
        (d && Array.isArray(d.providers) ? d.providers : []).forEach(p => { if (p.connected) s.add(p.id); });
        setConnected(s);
      }).catch(() => setConnected(new Set()));
  }, [signedIn]);
  React.useEffect(() => { load(); }, [load]);
  const ret = () => encodeURIComponent(typeof window !== "undefined" ? (window.location.pathname + window.location.hash) : "/newdesign/ClientApp.html#profile");
  const connect = (id) => { window.location.href = "/api/integrations/" + id + "/authorize?return=" + ret(); };
  const disconnect = async (id) => {
    const name = String(id).replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    if (!(await window.ShapeConfirm.open({ title: "Disconnect this app?", name, message: "This stops syncing its data until you reconnect — you’ll need to re-authorize.", confirmLabel: "Disconnect" }))) return;
    fetch("/api/integrations/" + id + "/disconnect", { method: "POST", credentials: "same-origin" })
      .then(() => setConnected(prev => { const n = new Set(prev); n.delete(id); return n; }))
      .catch(() => {});
  };
  const oauthRow = (id, label, note) => {
    const loading = connected == null;
    const on = !loading && connected.has(id);
    return <Row key={id} label={label}
      value={loading ? "Checking…" : (on ? "Connected" + (note ? " · " + note : "") : "Not connected")}
      action={loading ? undefined : (on ? "DISCONNECT" : "CONNECT")}
      onAction={loading ? undefined : (on ? () => disconnect(id) : () => connect(id))} />;
  };
  return (
    <Card>
      <SectionTitle>Connected apps</SectionTitle>
      {oauthRow("strava", "Strava")}
      {oauthRow("whoop", "Whoop", "syncing")}
      {oauthRow("garmin", "Garmin")}
      {oauthRow("oura", "Oura")}
      <Row label="Apple Health" value="Sync from the iOS app" action="APP ONLY" />
      <Row label="MyFitnessPal" value="Not yet supported" action="SOON" />
    </Card>
  );
}

// Account & settings — rides BELOW the living profile (the page leads with
// the profile itself, same concept as the app's Me tab; signed-out = demo).
function ClientMeSettings() {
  const [profile, setProfile] = React.useState(SAMPLE_PROFILE);
  const [loaded, setLoaded] = React.useState(false);
  const [signedIn, setSignedIn] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [fieldEdit, setFieldEdit] = React.useState(null); // { key, label }
  const [toast, setToast] = React.useState(null);
  const [onlineVisible, setOnlineVisible] = React.useState(true);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2500); }

  async function toggleOnlineVisible() {
    const next = !onlineVisible;
    setOnlineVisible(next);
    try {
      if (window.ShapeWebPresence && window.ShapeWebPresence.setVisible) {
        await window.ShapeWebPresence.setVisible(next);
      }
    } catch (e) {}
    showToast(signedIn ? "Saved." : "Sample view — sign in to save.");
  }

  // Mirror the display name to profiles.full_name so a rename round-trips to
  // the dashboard / chat / leaderboard (which read profiles, not client_profiles).
  async function mirrorName(data) {
    try {
      const nm = ((data && data.displayName) || "").trim();
      const c = window.shapeDb && window.shapeDb.client;
      if (!nm || !c || !c.auth) return;
      const u = await c.auth.getUser();
      const uid = u && u.data && u.data.user && u.data.user.id;
      if (uid) await c.from("profiles").update({ full_name: nm }).eq("id", uid);
    } catch (e) {}
  }

  async function persist(next) {
    if (window.shapeDb && window.shapeDb.saveClientProfile) {
      const res = await window.shapeDb.saveClientProfile(next);
      if (res && res.error) return res.error.message || "Save failed";
    }
    await mirrorName(next);
    return null;
  }

  async function saveField(key, value, done) {
    const next = { ...profile, [key]: value };
    const err = await persist(next);
    if (err) { done(err); return; }
    setProfile(next);
    showToast(signedIn ? "Saved." : "Sample view — sign in to save.");
    done(null);
  }

  async function toggleField(key) {
    const next = { ...profile, [key]: !profile[key] };
    setProfile(next);
    const err = await persist(next);
    showToast(err ? err : (signedIn ? "Saved." : "Sample view — sign in to save."));
  }

  function openField(key, label) {
    setFieldEdit({ key, label });
  }

  React.useEffect(() => {
    (async () => {
      if (!window.shapeDb) { setLoaded(true); return; }
      const user = await window.shapeDb.getUser();
      if (!user) { setLoaded(true); return; }
      setSignedIn(true);
      const remote = await window.shapeDb.getClientProfile();
      // Signed in → drop the demo persona base so unfilled preferences read "—",
      // not Priya Shah's sample values (matches the app-wide demo zero-out). Only
      // the user's real saved fields show; the demo stays the signed-out preview.
      setProfile(remote && Object.keys(remote).length > 0 ? remote : {});
      try {
        if (window.ShapeWebPresence && typeof window.ShapeWebPresence.visible === "function") {
          setOnlineVisible(window.ShapeWebPresence.visible() !== false);
        }
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  async function handleLogout() {
    if (window.shapeDb) await window.shapeDb.signOut();
    window.location.href = "/login";
  }

  // Danger zone — wired to real flows. Membership pause/cancel goes to the Stripe
  // billing portal; data export + account deletion (no self-serve endpoint yet)
  // open the support channel so the request is actually actioned, not a no-op.
  async function pauseMembership() {
    if (!signedIn) { window.location.href = "/pricing"; return; }
    try {
      const r = await fetch("/api/stripe/billing-portal", { method: "POST", credentials: "same-origin" });
      const d = r.ok ? await r.json() : null;
      window.location.href = (d && d.url) ? d.url : "/pricing";
    } catch (e) { window.location.href = "/pricing"; }
  }
  function contactSupport() {
    try { if (typeof window.__openChat === "function") { window.__openChat(); return; } } catch (e) {}
    window.location.href = "/contact.html";
  }
  async function exportData(ev) {
    const btn = ev && ev.currentTarget;
    if (!signedIn) { window.location.href = "/login.html"; return; }
    if (!window.confirm("Download a copy of all the data Shape holds about you?")) return;
    if (btn) btn.disabled = true; // guard against double-submission
    try {
      // no-store: the export is all of the user's personal data — never let it sit in the browser HTTP cache.
      const res = await fetch("/api/account/export", { credentials: "same-origin", cache: "no-store" });
      if (res.status === 401) { window.location.href = "/login.html"; return; }
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `shape-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      alert("Could not export your data right now. Email privacy@theshapecommunity.com and we'll send it.");
    } finally {
      if (btn) btn.disabled = false;
    }
  }
  async function deleteAccount(ev) {
    const btn = ev && ev.currentTarget;
    if (!signedIn) { window.location.href = "/login.html"; return; }
    if (!window.confirm("Permanently delete your Shape account and ALL your data? This cannot be undone.")) return;
    const typed = window.prompt("This erases your health data, history, photos, and account for good. Type DELETE to confirm.");
    if ((typed || "").trim().toUpperCase() !== "DELETE") return;
    if (btn) btn.disabled = true; // destructive + non-idempotent — block re-clicks while in flight
    try {
      const res = await fetch("/api/account/delete", { method: "POST", credentials: "same-origin" });
      if (res.status === 401) { window.location.href = "/login.html"; return; }
      if (!res.ok) throw new Error("delete failed");
      alert("Your account and data have been deleted.");
      try { if (window.shapeDb && window.shapeDb.client && window.shapeDb.client.auth) await window.shapeDb.client.auth.signOut(); } catch (e) {}
      window.location.href = "/";
    } catch (e) {
      alert("Could not delete your account right now. Email privacy@theshapecommunity.com and we'll handle it.");
      if (btn) btn.disabled = false; // re-enable to retry (success navigates away)
    }
  }

  const p = profile;
  return (
    <section style={{ maxWidth: 1240, margin: "0 auto", padding: "30px 40px 40px", fontFamily: sans, color: INK }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)" }}>Account · Settings · Billing</div>
          <div style={{ fontFamily: serif, fontSize: 32, letterSpacing: "-0.02em", marginTop: 4 }}>Settings.</div>
          <div style={{ fontSize: 13, color: "rgba(242,237,228,0.55)", marginTop: 4 }}>{signedIn ? "Your plan, payments, preferences, and how Shape uses your data." : "Sample view — sign in to load your real settings."}</div>
        </div>
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          <button onClick={handleLogout} style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>Log out</button>
          <button onClick={() => setEditOpen(true)} style={{ background: INK, color: "#100d0a", border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Edit details</button>
        </div>
      </div>

      <div className="dk-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Card>
          <SectionTitle>Profile</SectionTitle>
          <Row label="Name" value={p.displayName || "—"} action="EDIT" onAction={() => openField("displayName", "Name")} />
          <Row label="Email" value={p.email || "—"} action="EDIT" onAction={() => openField("email", "Email")} />
          <Row label="Phone" value={p.phone || "—"} action="EDIT" onAction={() => openField("phone", "Phone")} />
          <Row label="Location" value={p.location || "—"} action="EDIT" onAction={() => openField("location", "Location")} />
          <Row label="Birthday" value={p.birthday || "—"} action="EDIT" onAction={() => openField("birthday", "Birthday")} />
          <Row label="Height / weight" value={p.heightWeight || "—"} action="UPDATE" onAction={() => openField("heightWeight", "Height / weight")} />
        </Card>

        <PlanBillingCard signedIn={signedIn} />

        <ConnectedAppsCard signedIn={signedIn} />

        <Card>
          <SectionTitle>Nutrition preferences</SectionTitle>
          <Row label="Dietary style" value={p.dietaryStyle || "—"} action="EDIT" onAction={() => openField("dietaryStyle", "Dietary style")} />
          <Row label="Allergies &amp; intolerances" value={p.allergies || "—"} action="EDIT" onAction={() => openField("allergies", "Allergies & intolerances")} />
          <Row label="Dislikes" value={p.dislikes || "—"} action="EDIT" onAction={() => openField("dislikes", "Dislikes")} />
          <Row label="Protein target" value={p.proteinTarget || "—"} action="EDIT" onAction={() => openField("proteinTarget", "Protein target")} />
          <Row label="Calorie range" value={p.calorieRange || "—"} action="CHANGE" onAction={() => openField("calorieRange", "Calorie range")} />
          <Row label="Meal cadence" value={p.mealCadence || "—"} action="EDIT" onAction={() => openField("mealCadence", "Meal cadence")} />
          <Row label="Kitchen &amp; cooking" value={p.kitchen || "—"} action="EDIT" onAction={() => openField("kitchen", "Kitchen & cooking")} />
          <Row label="Supplements" value={p.supplements || "—"} action="EDIT" onAction={() => openField("supplements", "Supplements")} />
          <Row label="Alcohol" value={p.alcohol || "—"} action="EDIT" onAction={() => openField("alcohol", "Alcohol")} />
          <Row label="Hydration target" value={p.hydrationTarget || "—"} action="EDIT" onAction={() => openField("hydrationTarget", "Hydration target")} />
        </Card>

        <Card>
          <SectionTitle>Training preferences</SectionTitle>
          <Row label="Primary goal" value={p.primaryGoal || "—"} action="EDIT" onAction={() => openField("primaryGoal", "Primary goal")} />
          <Row label="Experience" value={p.experience || "—"} action="EDIT" onAction={() => openField("experience", "Experience")} />
          <Row label="Sessions / week" value={p.sessionsPerWeek || "—"} action="EDIT" onAction={() => openField("sessionsPerWeek", "Sessions / week")} />
          <Row label="Equipment access" value={p.equipmentAccess || "—"} action="EDIT" onAction={() => openField("equipmentAccess", "Equipment access")} />
          <Row label="Injuries &amp; notes" value={p.injuries || "—"} action="EDIT" onAction={() => openField("injuries", "Injuries & notes")} />
          <Row label="Preferred training times" value={p.preferredTimes || "—"} action="EDIT" onAction={() => openField("preferredTimes", "Preferred training times")} />
        </Card>

        <Card>
          <SectionTitle>Privacy</SectionTitle>
          <Row label="Profile visibility" value={p.profileVisibility || "—"} action="CHANGE" onAction={() => openField("profileVisibility", "Profile visibility")} />
          <Row label="Show when I'm online" value={onlineVisible ? "On" : "Off"} action="TOGGLE" onAction={toggleOnlineVisible} />
          <Row label="Share data with coaches" value={p.shareDataWithCoaches || "—"} action="CHANGE" onAction={() => openField("shareDataWithCoaches", "Share data with coaches")} />
          <Row label="Community posts" value={p.communityPosts ? "On" : "Off"} action="TOGGLE" onAction={() => toggleField("communityPosts")} />
          <Row label="Marketing emails" value={p.marketingEmails ? "On" : "Off"} action="TOGGLE" onAction={() => toggleField("marketingEmails")} />
        </Card>
      </div>

      <HealthProfileCard />

      <ReminderCard signedIn={signedIn} />

      <NotificationDashboard signedIn={signedIn} />

      <Card style={{ marginTop: 20 }}>
        <SectionTitle>Social &amp; links</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 32px" }}>
          <Row label="Instagram" value={p.instagram || "Not connected"} action="EDIT" onAction={() => openField("instagram", "Instagram")} />
          <Row label="TikTok" value={p.tiktok || "Not connected"} action={p.tiktok ? "EDIT" : "CONNECT"} onAction={() => openField("tiktok", "TikTok")} />
          <Row label="Strava" value={p.strava || "Not connected"} action="EDIT" onAction={() => openField("strava", "Strava")} />
          <Row label="Website" value={p.website || "Not added"} action={p.website ? "EDIT" : "ADD"} onAction={() => openField("website", "Website")} />
          <Row label="YouTube" value={p.youtube || "Not connected"} action={p.youtube ? "EDIT" : "CONNECT"} onAction={() => openField("youtube", "YouTube")} />
          <Row label="Twitter / X" value={p.twitter || "Not connected"} action="EDIT" onAction={() => openField("twitter", "Twitter / X")} />
        </div>
      </Card>

      <Card style={{ marginTop: 20 }}>
        <SectionTitle>App tour</SectionTitle>
        <Row label="Take a tour" value="Walk through your dashboard" action="START" onAction={() => { try { window.dispatchEvent(new Event("shape:startTour")); } catch (e) {} }} />
      </Card>

      <Card style={{ marginTop: 20, padding: 22 }}>
        <SectionTitle>Danger zone</SectionTitle>
        <div className="dk-3up" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <button onClick={exportData} style={{ background: "transparent", color: "rgba(242,237,228,0.7)", border: "1px solid rgba(242,237,228,0.2)", padding: "14px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: sans, textAlign: "left" }}>Export all my data</button>
          <button onClick={pauseMembership} style={{ background: "transparent", color: "rgba(242,237,228,0.7)", border: "1px solid rgba(242,237,228,0.2)", padding: "14px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: sans, textAlign: "left" }}>Pause membership</button>
          <button onClick={deleteAccount} style={{ background: "transparent", color: "#e07856", border: "1px solid rgba(224,120,86,0.4)", padding: "14px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: sans, textAlign: "left" }}>Delete account</button>
        </div>
      </Card>
      {editOpen && (
        <EditProfileModal
          initial={profile}
          onClose={() => setEditOpen(false)}
          onSaved={(next) => {
            setProfile(prev => ({ ...prev, ...next }));
            mirrorName(next);
            showToast(signedIn ? "Profile saved." : "Sign in to save changes.");
          }}
        />
      )}
      {fieldEdit && (
        <SingleFieldModal
          label={fieldEdit.label}
          fieldKey={fieldEdit.key}
          initialValue={profile[fieldEdit.key]}
          onClose={() => setFieldEdit(null)}
          onSaved={saveField}
        />
      )}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: INK, color: "#100d0a", padding: "12px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, zIndex: 10000, boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>{toast}</div>
      )}
    </section>
  );
}
// ── HEALTH PROFILE (PAR-Q screening) — website parity with the mobile intake.
// Reads/writes via /api/client/checkin-kit; shared with linked coaches for
// safety & liability (not subject to the goals share toggle).
const HP_PARQ = [
  "Has a doctor ever said you have a heart condition and that you should only do activity recommended by a doctor?",
  "Do you feel pain in your chest when you do physical activity?",
  "In the past month, have you had chest pain while not doing physical activity?",
  "Do you lose your balance because of dizziness, or do you ever lose consciousness?",
  "Do you have a bone or joint problem that could be made worse by a change in your physical activity?",
  "Is a doctor currently prescribing medication for your blood pressure or a heart condition?",
  "Do you know of any other reason why you should not do physical activity?",
];
const HP_CONDITION_TAGS = ["Diabetes", "High blood pressure", "Asthma / respiratory", "Heart condition", "Thyroid", "High cholesterol", "Anxiety / depression", "Arthritis / joint", "Pregnant / postpartum"];
function HealthProfileCard() {
  const [doc, setDoc] = React.useState(null);
  const [loaded, setLoaded] = React.useState(false);
  const [answers, setAnswers] = React.useState(Array(HP_PARQ.length).fill(null));
  const [injuries, setInjuries] = React.useState("");
  const [medications, setMedications] = React.useState("");
  const [rxMeds, setRxMeds] = React.useState(null);
  const [conditions, setConditions] = React.useState("");
  const [conditionTags, setConditionTags] = React.useState([]);
  const [pregnancy, setPregnancy] = React.useState(null);
  const [allergies, setAllergies] = React.useState(null);
  const [allergyDetails, setAllergyDetails] = React.useState("");
  const [emName, setEmName] = React.useState("");
  const [emPhone, setEmPhone] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/client/checkin-kit", { credentials: "same-origin", cache: "no-store" })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled) { return; }
        setLoaded(true);
        const h = d && d.health;
        if (!h) return;
        setDoc(h);
        if (Array.isArray(h.parq)) setAnswers(h.parq);
        setInjuries(h.injuries || ""); setMedications(h.medications || "");
        setRxMeds(h.rxMeds || (h.medications ? "yes" : null));
        setConditions(h.conditions || ""); setConditionTags(Array.isArray(h.conditionTags) ? h.conditionTags : []);
        setPregnancy(h.pregnancy || null); setAllergies(h.allergies || null); setAllergyDetails(h.allergyDetails || "");
        setEmName((h.emergency && h.emergency.name) || ""); setEmPhone((h.emergency && h.emergency.phone) || "");
      }).catch(() => setLoaded(true));
    return () => { cancelled = true; };
  }, []);

  if (!loaded) return null;
  const allAnswered = answers.every(a => a === true || a === false);
  const rxOk = rxMeds === "no" || (rxMeds === "yes" && medications.trim().length > 0);
  const allergyOk = allergies === "no" || (allergies === "yes" && allergyDetails.trim().length > 0);
  const screenComplete = allAnswered && rxMeds !== null && pregnancy !== null && allergies !== null && rxOk && allergyOk;
  const toggleTag = (tag) => setConditionTags(cur => (cur.includes(tag) ? cur.filter(x => x !== tag) : [...cur, tag]));

  const save = async () => {
    if (!screenComplete || busy) return;
    setBusy(true); setNote("");
    const next = {
      parq: answers,
      flagged: answers.some(a => a === true) || pregnancy === "yes",
      injuries: injuries.trim() || null,
      rxMeds: rxMeds,
      medications: rxMeds === "yes" ? (medications.trim() || null) : null,
      conditions: conditions.trim() || null,
      conditionTags: conditionTags,
      pregnancy: pregnancy,
      allergies: allergies,
      allergyDetails: allergies === "yes" ? (allergyDetails.trim() || null) : null,
      emergency: { name: emName.trim() || null, phone: emPhone.trim() || null },
      consentAt: (doc && doc.consentAt) || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      const res = await fetch("/api/client/checkin-kit", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "health", doc: next }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not save");
      setDoc(next); setNote("Saved — visible to your linked coaches.");
    } catch (e) { setNote(e.message || "Could not save."); }
    finally { setBusy(false); }
  };

  const taStyle = { width: "100%", boxSizing: "border-box", minHeight: 52, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(242,237,228,0.12)", background: "rgba(242,237,228,0.04)", color: INK, fontFamily: sans, fontSize: 13, outline: "none", resize: "vertical" };
  const lbl = { fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.1em", color: "rgba(242,237,228,0.5)", textTransform: "uppercase", marginBottom: 6 };
  const qTxt = { fontSize: 12.5, color: "rgba(242,237,228,0.75)", lineHeight: 1.5 };
  const ynRow = (value, onPick, options) => (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: 6 }}>
      {options.map(([labelTxt, v, c]) => {
        const on = value === v;
        return <button key={labelTxt} type="button" onClick={() => onPick(v)} style={{ padding: "7px 0", borderRadius: 8, border: `1px solid ${on ? c : "rgba(242,237,228,0.14)"}`, background: on ? c + "22" : "transparent", color: on ? c : "rgba(242,237,228,0.6)", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>{labelTxt}</button>;
      })}
    </div>
  );

  return (
    <Card style={{ marginTop: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <SectionTitle>Health profile</SectionTitle>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: doc ? (doc.flagged ? "#d2693f" : "#0ac5a8") : "rgba(242,237,228,0.5)" }}>
          {doc ? (doc.flagged ? "PAR-Q · flagged" : "PAR-Q · all clear") : "Not completed yet"}
        </span>
      </div>
      <div style={{ fontSize: 12.5, color: "rgba(242,237,228,0.55)", lineHeight: 1.6, margin: "6px 0 14px" }}>
        Safety screening shared with the coaches you hire (for programming + liability). Required in the app before training starts.
      </div>
      <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
        {HP_PARQ.map((q, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 130px", gap: 14, alignItems: "center", padding: "9px 0", borderTop: i ? "1px solid rgba(242,237,228,0.06)" : "none" }}>
            <div style={{ fontSize: 12.5, color: "rgba(242,237,228,0.75)", lineHeight: 1.5 }}>{i + 1}. {q}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {[["No", false, "#0ac5a8"], ["Yes", true, "#d2693f"]].map(([labelTxt, v, c]) => {
                const on = answers[i] === v;
                return <button key={labelTxt} onClick={() => setAnswers(a => a.map((x, j) => (j === i ? v : x)))} style={{ padding: "7px 0", borderRadius: 8, border: `1px solid ${on ? c : "rgba(242,237,228,0.14)"}`, background: on ? c + "22" : "transparent", color: on ? c : "rgba(242,237,228,0.6)", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>{labelTxt}</button>;
              })}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gap: 14, marginBottom: 12 }}>
        <div>
          <div style={lbl}>Prescription medication · required</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 14, alignItems: "center" }}>
            <div style={qTxt}>Are you currently taking any prescription medication(s)?</div>
            {ynRow(rxMeds, setRxMeds, [["No", "no", "#0ac5a8"], ["Yes", "yes", "#d2693f"]])}
          </div>
          {rxMeds === "yes" && <textarea value={medications} onChange={(e) => setMedications(e.target.value)} placeholder="List your prescription medication(s) — e.g. Lisinopril (blood pressure)" style={{ ...taStyle, marginTop: 8 }} />}
        </div>
        <div>
          <div style={lbl}>Allergies · required</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 14, alignItems: "center" }}>
            <div style={qTxt}>Do you have any allergies (food, medication, or other)?</div>
            {ynRow(allergies, setAllergies, [["No", "no", "#0ac5a8"], ["Yes", "yes", "#d2693f"]])}
          </div>
          {allergies === "yes" && <textarea value={allergyDetails} onChange={(e) => setAllergyDetails(e.target.value)} placeholder="List your allergies — e.g. Peanuts (severe) · penicillin" style={{ ...taStyle, marginTop: 8 }} />}
        </div>
        <div>
          <div style={lbl}>Pregnancy · required</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: 14, alignItems: "center" }}>
            <div style={qTxt}>Are you currently pregnant, or have you given birth in the past 6 months?</div>
            {ynRow(pregnancy, setPregnancy, [["No", "no", "#0ac5a8"], ["Yes", "yes", "#d2693f"], ["N/A", "na", "#8a8378"]])}
          </div>
        </div>
        <div>
          <div style={lbl}>Ongoing medical conditions · optional</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 8 }}>
            {HP_CONDITION_TAGS.map(tag => { const on = conditionTags.includes(tag); return <button key={tag} onClick={() => toggleTag(tag)} style={{ padding: "6px 11px", borderRadius: 999, border: `1px solid ${on ? "#0ac5a8" : "rgba(242,237,228,0.14)"}`, background: on ? "#0ac5a822" : "transparent", color: on ? "#2ee0c4" : "rgba(242,237,228,0.6)", fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer" }}>{tag}</button>; })}
          </div>
          <textarea value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="Anything else your coach should know — e.g. Type 2 diabetes (diet-managed)" style={taStyle} />
        </div>
        <div><div style={lbl}>Injuries &amp; surgeries</div><textarea value={injuries} onChange={(e) => setInjuries(e.target.value)} placeholder="e.g. Left knee ACL repair 2022 · lower-back tightness" aria-label="Injuries and surgeries" style={taStyle} /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 200px", gap: 14, alignItems: "end" }}>
        <div><div style={lbl}>Emergency contact · name</div><input value={emName} onChange={(e) => setEmName(e.target.value)} style={{ ...taStyle, minHeight: 0 }} /></div>
        <div><div style={lbl}>Emergency contact · phone</div><input value={emPhone} onChange={(e) => setEmPhone(e.target.value)} style={{ ...taStyle, minHeight: 0 }} /></div>
        <button onClick={save} disabled={!screenComplete || busy} style={{ background: screenComplete ? "#0ac5a8" : "rgba(242,237,228,0.12)", color: screenComplete ? "#1a1612" : "rgba(242,237,228,0.45)", border: 0, padding: "12px 18px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: screenComplete ? "pointer" : "default" }}>{busy ? "Saving…" : "Save health profile"}</button>
      </div>
      {note && <div style={{ marginTop: 10, fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.06em", color: "rgba(242,237,228,0.65)" }}>{note}</div>}
    </Card>
  );
}
// ── REMINDERS — website parity with the mobile BSReminderManager. Members set
// their own nudges (weigh-in / check-in / water / photo / custom) with a time +
// days-of-week; the hourly tz-aware cron fires them via the notifications→push
// spine. CRUD hits /api/client/reminders (cookie session — no ShapeReminders
// helper on web). Signed-out shows an honest empty state (never fake reminders).
const REM_KINDS = [["weigh_in", "Weigh-in"], ["checkin", "Weekly check-in"], ["water", "Water"], ["photo", "Progress photo"], ["custom", "Custom"]];
const REM_DOW = [["Sun", 0], ["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6]];
function remKindLabel(k) { const f = REM_KINDS.find(x => x[0] === k); return f ? f[1] : "Reminder"; }
function remDaysLabel(days) { if (days && days.length === 7) return "Every day"; return (days || []).slice().sort((a, b) => a - b).map(d => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(" "); }
function remFmt12(hhmm) { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ""); if (!m) return hhmm || ""; let h = parseInt(m[1], 10); const ap = h < 12 ? "AM" : "PM"; h = h % 12; if (h === 0) h = 12; return h + ":" + m[2] + " " + ap; }
function remTz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; } }

function ReminderCard({ signedIn }) {
  const [reminders, setReminders] = React.useState(null); // null = loading
  const [editing, setEditing] = React.useState(null);     // draft { id?, kind, label, atTime, days, enabled } | null
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [failed, setFailed] = React.useState(false); // load failure — distinct from "no reminders"

  const load = React.useCallback(() => {
    if (!signedIn) { setFailed(false); setReminders([]); return; }
    fetch("/api/client/reminders", { credentials: "same-origin", cache: "no-store" })
      .then(r => { if (!r.ok) throw new Error("load"); return r.json(); })
      .then(d => { setReminders(Array.isArray(d && d.reminders) ? d.reminders : []); setFailed(false); })
      .catch(() => { setReminders([]); setFailed(true); });
  }, [signedIn]);
  React.useEffect(() => { load(); }, [load]);

  const saveDraft = async () => {
    const d = editing;
    if (!d || !(d.days || []).length || busy) return;
    setBusy(true); setNote("");
    try {
      // POST body uses camelCase atTime (GET/rows return at_time). id absent → insert.
      const res = await fetch("/api/client/reminders", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: d.id, kind: d.kind, label: d.kind === "custom" ? d.label : "", atTime: d.atTime, days: d.days, enabled: d.enabled !== false, tz: remTz() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error || "Could not save the reminder.");
      setEditing(null); setNote("Saved."); load();
    } catch (e) { setNote(e.message || "Could not save the reminder."); }
    finally { setBusy(false); }
  };

  const toggleEnabled = async (r) => {
    const next = !r.enabled;
    setReminders(list => (list || []).map(x => (x.id === r.id ? { ...x, enabled: next } : x)));
    try {
      // re-save the row with the flipped flag (map the row's at_time → atTime for the write path).
      await fetch("/api/client/reminders", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, kind: r.kind, label: r.kind === "custom" ? r.label : "", atTime: r.at_time, days: r.days, enabled: next, tz: remTz() }),
      });
    } catch (e) {}
    load();
  };

  const del = async (r) => {
    let ok;
    const opts = { title: "Delete this reminder?", name: r.label || remKindLabel(r.kind), message: "This removes the scheduled nudge.", confirmLabel: "Delete reminder" };
    if (window.ShapeConfirm && window.ShapeConfirm.open) ok = await window.ShapeConfirm.open(opts);
    else ok = window.confirm("Delete this reminder?");
    if (!ok) return;
    setReminders(list => (list || []).filter(x => x.id !== r.id));
    try { await fetch("/api/client/reminders?id=" + encodeURIComponent(r.id), { method: "DELETE", credentials: "same-origin" }); } catch (e) {}
    load();
  };

  const startAdd = () => setEditing({ kind: "weigh_in", label: "", atTime: "09:00", days: [1, 2, 3, 4, 5], enabled: true });
  const startEdit = (r) => setEditing({ id: r.id, kind: r.kind, label: r.label || "", atTime: r.at_time, days: r.days || [], enabled: r.enabled });

  const mono = "'JetBrains Mono', monospace";
  const chip = (on, square) => ({ padding: square ? "8px 0" : "6px 12px", borderRadius: square ? 8 : 999, border: "1px solid " + (on ? TEAL_BRIGHT : "rgba(242,237,228,0.14)"), background: on ? TEAL_BRIGHT + "22" : "transparent", color: on ? TEAL_BRIGHT : "rgba(242,237,228,0.6)", fontFamily: mono, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer" });
  const fieldStyle = { width: "100%", boxSizing: "border-box", background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.14)", color: INK, padding: "10px 12px", borderRadius: 6, fontFamily: sans, fontSize: 13.5, outline: "none" };
  const eyebrow = { fontFamily: mono, fontSize: 9.5, letterSpacing: "0.12em", color: "rgba(242,237,228,0.5)", textTransform: "uppercase", marginBottom: 6 };
  const actionChip = { fontSize: 11.5, color: TEAL_BRIGHT, fontFamily: mono, letterSpacing: "0.08em", cursor: "pointer", background: "transparent", border: 0, padding: "4px 6px", borderRadius: 6 };
  const muted = { fontSize: 13, color: "rgba(242,237,228,0.5)", padding: "8px 0" };

  const list = reminders;
  return (
    <Card style={{ marginTop: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <SectionTitle>Your reminders</SectionTitle>
        {signedIn && !editing && (
          <button onClick={startAdd} style={actionChip} onMouseOver={e => e.currentTarget.style.background = "rgba(46,224,196,0.08)"} onMouseOut={e => e.currentTarget.style.background = "transparent"}>＋ ADD</button>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: "rgba(242,237,228,0.55)", lineHeight: 1.6, margin: "6px 0 14px" }}>
        Nudges to weigh in, check in, hydrate, or anything else — delivered at your set time on the days you choose.
      </div>

      {list === null ? (
        <div style={muted}>Loading…</div>
      ) : !signedIn ? (
        <div style={muted}>Sign in to set up reminders that nudge you to weigh in, check in, hydrate, or anything else.</div>
      ) : (failed && !editing) ? (
        <div style={muted}>Couldn't load your reminders. Refresh to try again.</div>
      ) : (list.length === 0 && !editing) ? (
        <div style={muted}>No reminders yet — add one to nudge yourself.</div>
      ) : (
        <div>
          {list.map(r => (
            <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", padding: "13px 0", borderTop: "1px solid rgba(242,237,228,0.06)", opacity: r.enabled ? 1 : 0.5 }}>
              <div>
                <div style={{ fontSize: 13.5, color: INK }}>{r.label || remKindLabel(r.kind)}</div>
                <div style={{ fontSize: 12, color: "rgba(242,237,228,0.55)", marginTop: 2 }}>{remFmt12(r.at_time)} · {remDaysLabel(r.days)}</div>
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <button type="button" onClick={() => toggleEnabled(r)} aria-label={(r.enabled ? "Disable" : "Enable") + " reminder"} style={{ ...chip(r.enabled), padding: "5px 10px" }}>{r.enabled ? "On" : "Off"}</button>
                <button type="button" onClick={() => startEdit(r)} style={actionChip}>EDIT</button>
                <button type="button" onClick={() => del(r)} aria-label="Delete reminder" style={{ ...actionChip, color: "#e07856" }}>DELETE</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div style={{ marginTop: 14, padding: 16, borderRadius: 12, border: "1px solid rgba(242,237,228,0.12)", background: "rgba(242,237,228,0.03)" }}>
          <div style={eyebrow}>{editing.id ? "Edit · reminder" : "New · reminder"}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>
            {REM_KINDS.map(([k, l]) => (
              <button key={k} type="button" onClick={() => setEditing(d => ({ ...d, kind: k }))} style={chip(editing.kind === k)}>{l}</button>
            ))}
          </div>
          {editing.kind === "custom" && (
            <input value={editing.label || ""} maxLength={80} onChange={e => setEditing(d => ({ ...d, label: e.target.value }))} placeholder="What should we remind you?" aria-label="Custom reminder label" style={{ ...fieldStyle, marginBottom: 12 }} />
          )}
          <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 14, alignItems: "start" }}>
            <div>
              <div style={eyebrow}>Time</div>
              <input type="time" value={editing.atTime} onChange={e => setEditing(d => ({ ...d, atTime: e.target.value }))} aria-label="Reminder time" style={{ ...fieldStyle, colorScheme: "dark" }} />
            </div>
            <div>
              <div style={eyebrow}>Days</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
                {REM_DOW.map(([l, idx]) => {
                  const on = (editing.days || []).includes(idx);
                  return <button key={idx} type="button" aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][idx] + (on ? " (on)" : " (off)")} onClick={() => setEditing(d => { const set = new Set(d.days || []); if (set.has(idx)) set.delete(idx); else set.add(idx); return { ...d, days: Array.from(set).sort((a, b) => a - b) }; })} style={chip(on, true)}>{l}</button>;
                })}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
            <button onClick={() => setEditing(null)} style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "9px 18px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>Cancel</button>
            <button disabled={!(editing.days || []).length || busy} onClick={saveDraft} style={{ background: INK, color: PAPER, border: 0, padding: "9px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: (!(editing.days || []).length || busy) ? "default" : "pointer", opacity: (!(editing.days || []).length || busy) ? 0.5 : 1 }}>{busy ? "Saving…" : "Save reminder"}</button>
          </div>
        </div>
      )}

      {note && <div style={{ marginTop: 10, fontFamily: mono, fontSize: 10.5, letterSpacing: "0.06em", color: "rgba(242,237,228,0.65)" }}>{note}</div>}
    </Card>
  );
}
// ── NOTIFICATIONS DASHBOARD — website parity with the mobile BSNotifyPrefs.
// Wires to the REAL notification-center backend (notification_settings +
// notification_preferences + habit_reminders) via the get_notification_center()
// RPC + RLS-scoped upserts through window.shapeDb.client — the SAME tables
// src/lib/ai/notify-core.ts reads to decide what/when/how to notify. No new API
// route or migration (those tables are already live). notification_preferences
// stores only OVERRIDES; a missing (type,channel) row uses NP_DEF_CH.
const NP_HOURS = Array.from({ length: 24 }, (_, h) => ({ v: h, l: (h === 0 ? "12 AM" : h < 12 ? h + " AM" : h === 12 ? "12 PM" : (h - 12) + " PM") }));
const NP_DEF_CH = { inapp: true, push: true, email: false };
const NP_CHANNELS = [["inapp", "App"], ["push", "Push"], ["email", "Email"]];
const NP_CAPS = [2, 3, 4, 6, 8];
const NP_TYPES = [
  ["directive", "Your move", "The one thing to do today"],
  ["coach_message", "Coach messages", "When your coach writes"],
  ["checkin_due", "Check-in reminders", "Your weekly check-in is ready"],
  ["goal_slip", "Goal pace", "When your projected date slips"],
  ["score_drop", "Score dips", "When your Shape Score drops"],
  ["coach_cosign", "Co-signs", "When a coach co-signs your work"],
  ["streak_broken", "Streak restarts", "A gentle nudge — never shaming"],
  ["waitlist_invite", "Waitlist invites", "When a coach has room for you"],
  ["habit_reminder", "Habit reminders", "Set per-habit on the app's Habits page"],
];

function NotificationDashboard({ signedIn }) {
  const [state, setState] = React.useState(null); // null = loading; { settings, matrix, reminders }
  const [uid, setUid] = React.useState(null);
  const [saveErr, setSaveErr] = React.useState("");
  const empty = { settings: null, matrix: {}, reminders: [] };

  const load = React.useCallback(async () => {
    if (!signedIn || !(window.shapeDb && window.shapeDb.client)) { setState(empty); return; }
    try {
      const c = window.shapeDb.client;
      const u = await c.auth.getUser();
      setUid((u && u.data && u.data.user && u.data.user.id) || null);
      const { data, error } = await c.rpc("get_notification_center");
      if (error || !data) { setState(empty); return; }
      const m = {};
      (Array.isArray(data.prefs) ? data.prefs : []).forEach(p => { (m[p.type] = m[p.type] || {})[p.channel] = p.enabled; });
      const s = data.settings || {};
      setState({
        settings: { muted: s.muted === true, quiet_start: Number.isFinite(s.quiet_start) ? s.quiet_start : 22, quiet_end: Number.isFinite(s.quiet_end) ? s.quiet_end : 7, daily_cap: Number.isFinite(s.daily_cap) ? s.daily_cap : 4 },
        matrix: m,
        reminders: Array.isArray(data.reminders) ? data.reminders : [],
      });
    } catch (e) { setState(empty); }
  }, [signedIn]);
  React.useEffect(() => { load(); }, [load]);

  const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; } };
  const cli = () => (window.shapeDb && window.shapeDb.client) || null;

  // A Supabase write RESOLVES with { error } on an RLS/constraint failure and REJECTS on a
  // network error — surface both: on failure re-sync from the server (reverting the optimistic
  // UI so it never shows an unsaved change as saved) and flag it, instead of swallowing it.
  const onWrite = (builder) => {
    const fail = () => { setSaveErr("Couldn't save that change — reverted. Try again."); load(); };
    try { builder.then(res => { if (res && res.error) fail(); else setSaveErr(""); }, fail); }
    catch (e) { fail(); }
  };

  const saveSettings = (patch) => {
    setState(st => (st ? { ...st, settings: { ...st.settings, ...patch } } : st));
    const c = cli(); if (!uid || !c) return;
    onWrite(c.from("notification_settings").upsert({ user_id: uid, tz: tz(), updated_at: new Date().toISOString(), ...patch }, { onConflict: "user_id" }));
  };
  const chOn = (type, ch) => { const o = state && state.matrix[type]; return (o && o[ch] !== undefined) ? o[ch] : NP_DEF_CH[ch]; };
  const toggleCh = (type, ch) => {
    const next = !chOn(type, ch);
    setState(st => (st ? { ...st, matrix: { ...st.matrix, [type]: { ...(st.matrix[type] || {}), [ch]: next } } } : st));
    const c = cli(); if (!uid || !c) return;
    // notification_preferences is override-only (a missing row means "use the default"). When a
    // channel returns to its default, DELETE the override rather than freezing today's default
    // value into the user's data.
    if (next === NP_DEF_CH[ch]) {
      onWrite(c.from("notification_preferences").delete().eq("user_id", uid).eq("type", type).eq("channel", ch));
    } else {
      onWrite(c.from("notification_preferences").upsert({ user_id: uid, type, channel: ch, enabled: next, updated_at: new Date().toISOString() }, { onConflict: "user_id,type,channel" }));
    }
  };
  const toggleHabit = (r) => {
    const next = !r.enabled;
    setState(st => (st ? { ...st, reminders: st.reminders.map(x => (x.habit_id === r.habit_id ? { ...x, enabled: next } : x)) } : st));
    const c = cli(); if (!uid || !c) return;
    onWrite(c.from("habit_reminders").update({ enabled: next, updated_at: new Date().toISOString() }).eq("habit_id", r.habit_id).eq("user_id", uid));
  };

  const mono = "'JetBrains Mono', monospace";
  const muted = { fontSize: 13, color: "rgba(242,237,228,0.5)", padding: "8px 0" };
  const head = { marginTop: 18, marginBottom: 4, fontFamily: mono, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)" };
  const rowStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "11px 0", borderTop: "1px solid rgba(242,237,228,0.06)" };
  const lblStyle = { fontSize: 13.5, color: INK };
  const subStyle = { fontSize: 12, color: "rgba(242,237,228,0.5)", marginTop: 2 };
  const sel = { background: "transparent", color: TEAL_BRIGHT, border: "1px solid rgba(242,237,228,0.25)", borderRadius: 999, padding: "6px 10px", fontFamily: mono, fontSize: 11, fontWeight: 700, cursor: "pointer" };
  const chip = (on) => ({ width: 52, padding: "6px 0", borderRadius: 8, border: "1px solid " + (on ? TEAL_BRIGHT : "rgba(242,237,228,0.14)"), background: on ? TEAL_BRIGHT + "22" : "transparent", color: on ? TEAL_BRIGHT : "rgba(242,237,228,0.6)", fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer" });
  const Toggle = ({ on, onClick, label }) => (
    <button type="button" onClick={onClick} aria-label={label} style={{ width: 46, height: 27, borderRadius: 999, border: "1px solid " + (on ? TEAL_BRIGHT : "rgba(242,237,228,0.25)"), background: on ? TEAL_BRIGHT : "transparent", position: "relative", cursor: "pointer", flexShrink: 0 }}>
      <span style={{ position: "absolute", top: 2, left: on ? 21 : 2, width: 21, height: 21, borderRadius: 999, background: on ? "#100d0a" : "rgba(242,237,228,0.5)" }} />
    </button>
  );

  const s = state;
  return (
    <Card style={{ marginTop: 20 }}>
      <SectionTitle>Notifications</SectionTitle>
      <div style={{ fontSize: 12.5, color: "rgba(242,237,228,0.55)", lineHeight: 1.6, margin: "6px 0 8px" }}>
        What reaches you, when, and how. Shape only notifies on a real event — never a guilt-trip.
      </div>
      {s === null ? (
        <div style={muted}>Loading…</div>
      ) : !signedIn ? (
        <div style={muted}>Sign in to manage your notifications.</div>
      ) : !s.settings ? (
        <div style={muted}>Couldn't load your notification settings. Refresh to try again.</div>
      ) : (
        <div>
          <div style={{ ...rowStyle, borderTop: 0 }}>
            <div>
              <div style={lblStyle}>Mute everything</div>
              <div style={subStyle}>{s.settings.muted ? "All notifications paused" : "Real events only — never spam"}</div>
            </div>
            <Toggle on={s.settings.muted} onClick={() => saveSettings({ muted: !s.settings.muted })} label={s.settings.muted ? "Unmute all notifications" : "Mute all notifications"} />
          </div>

          {saveErr && <div role="alert" style={{ marginTop: 8, fontFamily: mono, fontSize: 10.5, letterSpacing: "0.04em", color: "#e07856" }}>{saveErr}</div>}

          {!s.settings.muted && (
            <div>
              <div style={head}>Quiet hours</div>
              <div style={rowStyle}>
                <div><div style={lblStyle}>From</div><div style={subStyle}>Held for a daily digest</div></div>
                <select value={s.settings.quiet_start} onChange={e => saveSettings({ quiet_start: Number(e.target.value) })} aria-label="Quiet hours start" style={sel}>{NP_HOURS.map(h => <option key={h.v} value={h.v} style={{ color: "#000" }}>{h.l}</option>)}</select>
              </div>
              <div style={rowStyle}>
                <div><div style={lblStyle}>To</div><div style={subStyle}>Uses your time zone</div></div>
                <select value={s.settings.quiet_end} onChange={e => saveSettings({ quiet_end: Number(e.target.value) })} aria-label="Quiet hours end" style={sel}>{NP_HOURS.map(h => <option key={h.v} value={h.v} style={{ color: "#000" }}>{h.l}</option>)}</select>
              </div>
              <div style={rowStyle}>
                <div><div style={lblStyle}>Daily limit</div><div style={subStyle}>Extra items batch into a digest</div></div>
                <select value={s.settings.daily_cap} onChange={e => saveSettings({ daily_cap: Number(e.target.value) })} aria-label="Daily notification limit" style={sel}>{NP_CAPS.map(n => <option key={n} value={n} style={{ color: "#000" }}>{n}/day</option>)}</select>
              </div>

              <div style={head}>What you hear about · per channel</div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, padding: "0 0 6px" }}>
                {NP_CHANNELS.map(([k, l]) => <span key={k} style={{ width: 52, textAlign: "center", fontFamily: mono, fontSize: 8, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)" }}>{l}</span>)}
              </div>
              {NP_TYPES.map(([type, label, sub]) => (
                <div key={type} style={rowStyle}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={lblStyle}>{label}</div>
                    <div style={{ fontSize: 11.5, color: "rgba(242,237,228,0.5)", marginTop: 1 }}>{sub}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {NP_CHANNELS.map(([k, l]) => <button key={k} type="button" onClick={() => toggleCh(type, k)} aria-label={label + " · " + l + " · " + (chOn(type, k) ? "on" : "off")} style={chip(chOn(type, k))}>{l}</button>)}
                  </div>
                </div>
              ))}

              {s.reminders.length > 0 && (
                <div>
                  <div style={head}>Habit reminders</div>
                  {s.reminders.map(r => (
                    <div key={r.habit_id} style={{ ...rowStyle, opacity: r.enabled ? 1 : 0.5 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={lblStyle}>{r.label || "Habit"}</div>
                        <div style={subStyle}>{remFmt12(r.at_time)} · {remDaysLabel(r.days)}</div>
                      </div>
                      <Toggle on={r.enabled} onClick={() => toggleHabit(r)} label={(r.enabled ? "Disable" : "Enable") + " habit reminder"} />
                    </div>
                  ))}
                  <div style={{ marginTop: 8, fontFamily: mono, fontSize: 9.5, letterSpacing: "0.04em", color: "rgba(242,237,228,0.45)" }}>Set the time + days on each habit in the app's Habits page.</div>
                </div>
              )}

              <div style={{ marginTop: 14, fontSize: 12, color: "rgba(242,237,228,0.55)", lineHeight: 1.6 }}>
                Push also needs your device's system permission. Each notification deep-links you in — nothing changes your data.
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
