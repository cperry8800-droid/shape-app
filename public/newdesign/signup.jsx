// Signup — multi-role. Reads ?role= from query, defaults to "client".
// Roles: client, trainer, nutritionist

const ROLE_CONFIG = {
  client: {
    kicker: "Start training with Shape",
    titleLeft: "Train with the best coaches - one marketplace - one platform.",
    perks: [
      "Access every trainer and nutritionist",
      "Workout + meal plans in one app",
      "Direct messaging with your coaches",
      "Cancel any subscription anytime",
      "Shape Radio included free",
    ],
    formTitle: "Create your client profile",
    steps: ["Personal", "Goals", "Coaching"],
    submitLabel: "Create profile",
    doneTitle: "You're in.",
    doneBody: "Your client profile is ready. Jump into the marketplace and find your first coach.",
    doneCta: { label: "Go to dashboard", href: "ClientDashboard.html" },
  },
  trainer: {
    kicker: "Grow your training business",
    titleLeft: "Build a training business that pays recurring. Your brand, your pricing, your clients.",
    perks: [
      "Free to join — no upfront costs",
      "Set your own pricing",
      "Publish programs and sessions",
      "Payouts straight to your bank, on your Stripe schedule",
      "Shape handles billing & marketing",
    ],
    formTitle: "Apply as a trainer",
    steps: ["Personal", "Credentials", "Specialty", "Availability & pricing"],
    submitLabel: "Submit application",
    doneTitle: "Application submitted.",
    doneBody: "Our team will review your credentials and reach out within 2–3 business days.",
    doneCta: { label: "Back to home", href: "Landing.html" },
  },
  nutritionist: {
    kicker: "Build a nutrition practice",
    titleLeft: "Coach clients on what they eat. Earn recurring revenue. Keep your license clean.",
    perks: [
      "Free to join — no upfront costs",
      "Set your own pricing",
      "Meal plan builder + macro tools",
      "Payouts straight to your bank, on your Stripe schedule",
      "Shape handles billing & marketing",
    ],
    formTitle: "Apply as a nutritionist",
    steps: ["Personal", "Credentials", "Specialty", "Availability & pricing"],
    submitLabel: "Submit application",
    doneTitle: "Application submitted.",
    doneBody: "Our team will review your credentials and reach out within 2–3 business days.",
    doneCta: { label: "Back to home", href: "Landing.html" },
  },
};

// -------------- Utility styles --------------
const labelStyle = { display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(242,237,228,0.55)", marginBottom: 8 };
const inputStyle = { width: "100%", background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.12)", borderRadius: 8, padding: "12px 14px", color: INK, fontFamily: sans, fontSize: 14, outline: "none" };
const selectStyle = { ...inputStyle, appearance: "none", WebkitAppearance: "none", backgroundImage: "linear-gradient(45deg, transparent 48%, rgba(242,237,228,0.5) 48% 52%, transparent 52%), linear-gradient(-45deg, transparent 48%, rgba(242,237,228,0.5) 48% 52%, transparent 52%)", backgroundSize: "6px 6px, 6px 6px", backgroundPosition: "right 16px top 50%, right 10px top 50%", backgroundRepeat: "no-repeat", paddingRight: 36 };
// Shape's standard is 5 years of professional experience. Less is never a refusal (owner,
// 2026-10-12: "dont make it a hard no"): the applicant tells us where they have worked and what
// kind of experience it is, and the application is reviewed and approved on its own. The same
// choices and the same reading are in mobile-app/src/config/providerApplications.js and
// src/lib/provider-applications.ts (a test holds them equal).
const proExperienceOptions = ["Less than 1 year", "1-2 years", "3-4 years", "5-7 years", "7-10 years", "10-15 years", "15+ years"];
const EXPERIENCE_STANDARD_YEARS = 5;
function experienceYearsOf(label) {
  const text = String(label || "").trim();
  if (!text) return null;
  if (/less than/i.test(text)) return 0;
  const m = text.match(/\d+/);
  return m ? Number(m[0]) : null;
}
const TRAINER_SPECS = ["Strength & Powerlifting", "HIIT & Fat Loss", "At-home Workouts", "Cardio & Endurance", "Functional Fitness", "Bodybuilding", "Sports Performance", "Mobility", "Run coaching"];
const NUTRI_SPECS = ["Weight management", "Sports nutrition", "Plant-based", "Gut health", "Hormonal health", "Pre/postnatal", "Endurance fueling", "Clinical / medical"];
// ⚠ WHAT A COACH SELECT SHOWS BEFORE IT IS TOUCHED IS WHAT IT SENDS. A select with nothing
// stored draws its first option, while the request read the empty stored value, so an
// untouched "Years professional experience" showed 7-10 years and sent "" (refused by the
// years check), and insurance, specialty and response time went out blank. Every coach select
// and the request both read through proPick(). (The values stay out of the form state so
// Nora is told only what the person filled.)
// ⚠ EXCEPT THE YEARS, WHICH HAVE NO DEFAULT. The list now starts at "Less than 1 year", so a
// shown default would put an untouched form below the standard; the select shows "Select…"
// and the application asks for an answer.
const PRO_SELECT_DEFAULTS = { insurance: "Yes", accepting: "Yes", oneOnOne: "Yes", response: "Within 24 hours", intro: "15-minute free intro" };
function proPick(v, key, kind) {
  if (v[key]) return v[key];
  if (key === "primary") return (kind === "trainer" ? TRAINER_SPECS : NUTRI_SPECS)[0];
  return PRO_SELECT_DEFAULTS[key] || "";
}
// The application's documents, by category (window.ShapeApplicationFiles, the classic-script
// mirror of src/lib/application-files.mjs, loaded by the page). They no longer ride the
// application request, which the platform caps at 4.5 MB: each file goes straight to private
// storage through a signed link from /api/apply/uploads, and the application carries the ticket.
function applicationDocs(v) {
  const docs = v.docs && typeof v.docs === "object" ? v.docs : {};
  const lib = window.ShapeApplicationFiles;
  const kinds = lib ? lib.APPLICATION_FILE_KINDS.map(k => k.kind) : Object.keys(docs);
  return kinds.flatMap(kind => (Array.isArray(docs[kind]) ? docs[kind] : []).map(file => ({ kind, file })));
}
// Never filled by Nora, whatever her card carries: the password, documents, every consent
// or agreement box and the license rows stay the person's own (src/lib/ai/noraForms.mjs
// has no field for any of them either).
const SIGNUP_NORA_NEVER = ["password", "tos", "waiver", "verify", "conduct", "bgcheck", "attest", "docs", "resumeFile", "credentialFile", "insuranceFile", "licenses"];

// A same-site return path from ?next= (the retired signup-client.html honoured it, and its old
// links redirect here with the query; Codex on #2352), checked as login.jsx checks it: one leading
// slash, no second slash or backslash after it, no control characters.
function suSafeNext() {
  try {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next && next.startsWith("/") && !next.startsWith("//") && next.charAt(1) !== "\\" && !/[\x00-\x1f\x7f]/.test(next)) return next;
  } catch (e) {}
  return null;
}
// Sign in, keeping that return path (owner, 2026-10-18). A visitor sent here from a coach's
// profile ("Join Shape", livingShared.jsx lvAccountHref) who has to confirm their email, or who
// already has an account, went on to a bare Login.html and so to their dashboard, not back to the
// coach they came to hire.
function suLoginHref() {
  const next = suSafeNext();
  return "Login.html" + (next ? "?next=" + encodeURIComponent(next) : "");
}
// ⚠ AND THROUGH THE EMAIL CONFIRMATION (Codex on #2399). The confirmation link opens Login.html as
// Supabase's redirect list holds it, without this page's ?next=, so a visitor who joined from a
// coach's profile was signed in to their dashboard instead. Adding ?next= to emailRedirectTo could
// fail that list and land them on the site root, so the return path is kept in this browser for two
// days instead; login.jsx reads it once on the first sign-in with no ?next= of its own, then forgets it.
function suRememberNext() {
  const next = suSafeNext();
  if (!next) return;
  try { localStorage.setItem("shape.signupNext", JSON.stringify({ next, at: Date.now() })); } catch (e) {}
}

function Field({ label, children, span = 1 }) {
  return (
    <div style={{ gridColumn: `span ${span}` }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function TextInput(props) { return <input type="text" style={inputStyle} {...props} />; }
function Select({ options, placeholder, ...rest }) {
  return (
    <select style={selectStyle} {...rest}>
      {placeholder ? <option value="" disabled>{placeholder}</option> : null}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function Chip({ on, onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{ padding: "10px 16px", borderRadius: 999, border: `1px solid ${on ? TEAL : "rgba(242,237,228,0.15)"}`, background: on ? "rgba(10,197,168,0.12)" : "transparent", color: on ? INK : "rgba(242,237,228,0.75)", fontFamily: sans, fontSize: 13, cursor: "pointer", fontWeight: on ? 500 : 400 }}>{children}</button>
  );
}

function Check({ on, onClick, children }) {
  return (
    <label onClick={onClick} style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", padding: "6px 0" }}>
      <span style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${on ? TEAL : "rgba(242,237,228,0.25)"}`, background: on ? TEAL : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
        {on && <span style={{ color: PAPER, fontSize: 12, fontWeight: 700 }}>✓</span>}
      </span>
      <span style={{ fontFamily: sans, fontSize: 13.5, color: "rgba(242,237,228,0.8)", lineHeight: 1.5 }}>{children}</span>
    </label>
  );
}

// -------------- Step bodies --------------

// Username — the member's Shape handle (@username). Live availability check
// via the is_username_available RPC (anon-allowed, so it works pre-account).
function UsernameField({ v, set, span = 2 }) {
  const [status, setStatus] = React.useState(null); // null=idle/checking · true · false
  const u = v.username || "";
  React.useEffect(() => {
    if (!u) { setStatus(null); return; }
    if (!/^[a-z0-9][a-z0-9._]{2,19}$/.test(u)) { setStatus(false); return; }
    let dead = false;
    setStatus(null);
    const id = setTimeout(() => {
      const sb = window.shapeDb && window.shapeDb.client;
      if (!sb) { if (!dead) setStatus(true); return; }
      sb.rpc("is_username_available", { p_username: u })
        .then(r => { if (!dead) setStatus(r && r.data === false ? false : true); })
        .catch(() => { if (!dead) setStatus(true); });
    }, 300);
    return () => { dead = true; clearTimeout(id); };
  }, [u]);
  return (
    <Field label="Username — your Shape handle" span={span}>
      <TextInput value={u} onChange={e => set({ username: e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 20) })} placeholder="your.handle" autoComplete="username" />
      <div style={{ marginTop: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: !u ? "rgba(242,237,228,0.45)" : status === false ? "#ff9b7a" : status ? "#0ac5a8" : "rgba(242,237,228,0.45)" }}>
        {!u ? "Letters · numbers · . _ (3–20 chars)" : status === false ? "Taken or invalid — try another" : status ? `@${u} is yours` : "Checking…"}
      </div>
    </Field>
  );
}

function ClientPersonal({ v, set }) {
  return (
    <div className="su-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
      <Field label="First name"><TextInput value={v.firstName || ""} onChange={e => set({ firstName: e.target.value })} /></Field>
      <Field label="Last name"><TextInput value={v.lastName || ""} onChange={e => set({ lastName: e.target.value })} /></Field>
      <UsernameField v={v} set={set} />
      <Field label="Email" span={2}><TextInput type="email" value={v.email || ""} onChange={e => set({ email: e.target.value })} /></Field>
      <Field label="Password" span={2}><TextInput type="password" value={v.password || ""} onChange={e => set({ password: e.target.value })} placeholder="At least 8 characters" /></Field>
      <Field label="Date of birth — Shape is for adults 18 and over" span={2}><TextInput type="date" value={v.dob || ""} onChange={e => set({ dob: e.target.value })} /></Field>
    </div>
  );
}

// ⚠ THE ANSWERS ARE KEPT NOW (client-onboarding review H4). This form used to ask a goal, a
// health intake and preferences, and send none of it. What it asks is the app's own vocabulary
// (the goals, experience and weekly sessions the app stores), sent as tokens in the sign-up's
// metadata and written to the app's records on the first signed-in visit
// (src/lib/signup-answers.mjs, POST /api/me/onboarding). The labels are what the person and Nora
// see; SU_* maps them to the tokens. tests/signup-answers.test.mjs holds these lists equal to the
// app's.
//
// No health questions: only a member who wants personal coaching is screened, and the screening
// is one form (the app's), not a second copy here whose answers went nowhere.
const SU_GOALS = [
  { id: "fat_loss", en: "Lose fat" },
  { id: "muscle", en: "Build muscle" },
  { id: "recomp", en: "Recomp" },
  { id: "maintain", en: "Maintain" },
  { id: "strength", en: "Get stronger" },
  { id: "endurance", en: "Endurance" },
  { id: "mobility", en: "Mobility" },
  { id: "athletic", en: "Athletic performance" },
  { id: "health", en: "General health" },
  { id: "tone", en: "Tone up" },
  { id: "race", en: "Run a race" },
  { id: "postpartum", en: "Postpartum" },
];
const SU_EXPERIENCE = [
  { id: "beginner", en: "Beginner" },
  { id: "intermediate", en: "Intermediate" },
  { id: "advanced", en: "Advanced" },
];
const SU_SESSIONS = [
  { id: "2", en: "2 days a week" },
  { id: "3", en: "3 days a week" },
  { id: "4", en: "4 days a week" },
  { id: "5", en: "5 days a week" },
  { id: "6", en: "6 days a week" },
];
const SU_COACHING = [
  { id: "training", en: "A trainer" },
  { id: "nutrition", en: "A nutritionist" },
  { id: "both", en: "Both" },
  { id: "no", en: "Not right now" },
];
const suTokenOf = (list, label) => { const row = list.find(o => o.en === label); return row ? row.id : null; };

// The answers as the metadata carries them: tokens only, and nothing that was not picked.
function suOnboardingAnswers(v) {
  const coaching = suTokenOf(SU_COACHING, v.coaching);
  return {
    goal: suTokenOf(SU_GOALS, v.goal),
    experience: suTokenOf(SU_EXPERIENCE, v.experience),
    sessionsPerWeek: suTokenOf(SU_SESSIONS, v.frequency),
    wantsCoaching: coaching === null ? null : coaching !== "no",
    coachingFor: coaching === "both" ? ["training", "nutrition"] : coaching === "training" || coaching === "nutrition" ? [coaching] : [],
  };
}

function ClientGoals({ v, set }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      <Field label="What brings you to Shape?">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {SU_GOALS.map(g => <Chip key={g.id} on={v.goal === g.en} onClick={() => set({ goal: g.en })}>{g.en}</Chip>)}
        </div>
      </Field>
      <Field label="Experience level">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {SU_EXPERIENCE.map(x => <Chip key={x.id} on={v.experience === x.en} onClick={() => set({ experience: x.en })}>{x.en}</Chip>)}
        </div>
      </Field>
      <Field label="How often do you want to train?">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {SU_SESSIONS.map(x => <Chip key={x.id} on={v.frequency === x.en} onClick={() => set({ frequency: x.en })}>{x.en}</Chip>)}
        </div>
      </Field>
    </div>
  );
}

function ClientCoaching({ v, set }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <Field label="Are you looking for personal coaching?">
        <p style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)", margin: "0 0 12px", lineHeight: 1.55 }}>A coach builds your plan and checks in with you. You can add one any time, and the app works without one. If you want a coach, we'll ask a short health screening before you start, so they can train you safely.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {SU_COACHING.map(x => <Chip key={x.id} on={v.coaching === x.en} onClick={() => set({ coaching: x.en })}>{x.en}</Chip>)}
        </div>
      </Field>
      <Check on={v.tos} onClick={() => set({ tos: !v.tos })}>I agree to the <a href="/terms" style={{ color: TEAL, textDecoration: "underline", textUnderlineOffset: 2 }}>Terms of Service</a> and <a href="/privacy" style={{ color: TEAL, textDecoration: "underline", textUnderlineOffset: 2 }}>Privacy Policy</a>.</Check>
    </div>
  );
}

// ---- Trainer / Nutritionist ----

function ProPersonal({ v, set, roleNoun }) {
  return (
    <div className="su-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
      <Field label="First name"><TextInput value={v.firstName || ""} onChange={e => set({ firstName: e.target.value })} /></Field>
      <Field label="Last name"><TextInput value={v.lastName || ""} onChange={e => set({ lastName: e.target.value })} /></Field>
      <UsernameField v={v} set={set} />
      <Field label="Email"><TextInput type="email" value={v.email || ""} onChange={e => set({ email: e.target.value })} /></Field>
      <Field label="Phone"><TextInput type="tel" value={v.phone || ""} onChange={e => set({ phone: e.target.value })} /></Field>
      {/* Shape is 18+ for coaches too: approval provisions a real account and coach
          roles satisfy membership, so a provider row with no DOB is an ungated
          account. Validated server-side in /api/apply and carried into profiles. */}
      <Field label="Date of birth"><TextInput type="date" value={v.dob || ""} onChange={e => set({ dob: e.target.value })} /></Field>
      <Field label="City, State / Country" span={2}><TextInput value={v.city || ""} onChange={e => set({ city: e.target.value })} placeholder="e.g. Brooklyn, NY · USA" /></Field>
      <Field label="Time zone"><TextInput value={v.tz || ""} onChange={e => set({ tz: e.target.value })} placeholder="e.g. America/New_York" /></Field>
      <Field label="Social handles (optional)"><TextInput value={v.social || ""} onChange={e => set({ social: e.target.value })} placeholder="@handle, ig.com/..." /></Field>
      <Field label={`Short bio — why you got into ${roleNoun}`} span={2}>
        <textarea value={v.bio || ""} onChange={e => set({ bio: e.target.value })} style={{ ...inputStyle, minHeight: 96, resize: "vertical", fontFamily: sans }} />
      </Field>
    </div>
  );
}

function ProCredentials({ v, set, kind }) {
  const isTrainer = kind === "trainer";
  const isDietitian = !isTrainer && /dietitian/i.test(v.nutritionType || "");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {!isTrainer && (
        <div>
          <Field label="Professional type" span={2}>
            <Select value={v.nutritionType || "Nutritionist"} onChange={e => set({ nutritionType: e.target.value })} options={["Nutritionist", "Dietitian (RD / RDN)"]} />
          </Field>
          <p style={{ fontFamily: sans, fontSize: 12.5, color: "rgba(242,237,228,0.6)", margin: "8px 0 0", lineHeight: 1.5 }}>
            {isDietitian
              ? "Registered Dietitians get a verified RD/RDN badge once we confirm your license — same nutrition tools, credentialed."
              : "Are you a Registered Dietitian (RD/RDN)? Select it above for the credentialed profile."}
          </p>
        </div>
      )}
      <div className="su-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <Field label={isTrainer ? "Primary certification" : isDietitian ? "RD/RDN registration number" : "License type"}><TextInput value={v.cert || ""} onChange={e => set({ cert: e.target.value })} placeholder={isTrainer ? "NASM, ACE, NSCA, CSCS..." : isDietitian ? "RD #, RDN #..." : "RD, RDN, LDN, CNS..."} /></Field>
        <Field label={isTrainer ? "Expiration / renewal" : "License state + number"}><TextInput value={v.certExp || ""} onChange={e => set({ certExp: e.target.value })} /></Field>
      </div>
      <div className="su-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <Field label="Degree / school"><TextInput value={v.edu || ""} onChange={e => set({ edu: e.target.value })} placeholder={isTrainer ? "BS Kinesiology — UT Austin" : "MS Nutrition — NYU"} /></Field>
        <Field label="Years professional experience"><Select value={proPick(v, "years", kind)} onChange={e => set({ years: e.target.value })} options={proExperienceOptions} placeholder="Select…" /></Field>
      </div>
      <p style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.68)", margin: 0, lineHeight: 1.55 }}>
        Shape's standard is {EXPERIENCE_STANDARD_YEARS} years of professional {isTrainer ? "training or coaching" : "nutrition coaching or clinical"} experience. With less, you can still apply: tell us where you've worked and what kind of experience it is, and we review your application individually.
      </p>
      {(() => {
        const yrs = experienceYearsOf(v.years);
        if (yrs === null || yrs >= EXPERIENCE_STANDARD_YEARS) return null;
        return (
          <div style={{ display: "grid", gap: 18 }}>
            <Field label="Where you've worked">
              <textarea value={v.experienceHistory || ""} onChange={e => set({ experienceHistory: e.target.value })} placeholder="Each place, your role and how long you were there" style={{ ...inputStyle, minHeight: 96, resize: "vertical", fontFamily: sans }} />
            </Field>
            <Field label="Type of experience">
              <textarea value={v.experienceType || ""} onChange={e => set({ experienceType: e.target.value })} placeholder={isTrainer ? "Gym floor, online coaching, a sports team, an internship…" : "Clinical or dietetic practice, online coaching, a sports team, an internship…"} style={{ ...inputStyle, minHeight: 72, resize: "vertical", fontFamily: sans }} />
            </Field>
            <Field label="Anything else we should know (optional)">
              <textarea value={v.experienceNotes || ""} onChange={e => set({ experienceNotes: e.target.value })} style={{ ...inputStyle, minHeight: 72, resize: "vertical", fontFamily: sans }} />
            </Field>
          </div>
        );
      })()}
      <div className="su-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <Field label="Liability insurance"><Select value={proPick(v, "insurance", kind)} onChange={e => set({ insurance: e.target.value })} options={["Yes", "No", "In progress"]} /></Field>
        <Field label="Previous platforms (optional)"><TextInput value={v.prev || ""} onChange={e => set({ prev: e.target.value })} placeholder="Trainerize, MyFitnessPal Pro..." /></Field>
      </div>
      <ApplicationDocuments v={v} set={set} />
      {!isTrainer && <NutritionCompliance v={v} set={set} isDietitian={isDietitian} />}
      <Check on={v.verify} onClick={() => set({ verify: !v.verify })}>I understand my credentials may be verified by Shape's trust team.</Check>
    </div>
  );
}

// NC1 — nutrition-provider compliance capture (state licensure + insurance +
// attestations). A dietitian must be licensed in EACH client's state to provide
// individualized (medical) nutrition therapy; we re-check the match on every
// pairing. A nutritionist without a state license is limited to general wellness.
// Engineering controls only — NOT legal advice; production enablement requires
// healthcare-regulatory counsel sign-off.
function NutritionCompliance({ v, set, isDietitian }) {
  const mono = "'JetBrains Mono', monospace";
  const licenses = (Array.isArray(v.licenses) && v.licenses.length) ? v.licenses : [{ state: "", number: "", expires: "" }];
  const setLicense = (i, patch) => set({ licenses: licenses.map((l, idx) => idx === i ? { ...l, ...patch } : l) });
  const addLicense = () => set({ licenses: [...licenses, { state: "", number: "", expires: "" }] });
  const removeLicense = (i) => set({ licenses: licenses.filter((_, idx) => idx !== i) });
  const att = v.attest || {};
  const toggleAtt = (k) => set({ attest: { ...att, [k]: !att[k] } });
  const subLabel = { ...labelStyle, marginBottom: 6 };
  return (
    <div style={{ paddingTop: 16, borderTop: "1px solid rgba(242,237,228,0.08)", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL, marginBottom: 6 }}>Nutrition practice · compliance</div>
        <p style={{ fontFamily: sans, fontSize: 12.5, color: "rgba(242,237,228,0.62)", margin: 0, lineHeight: 1.5 }}>
          {isDietitian
            ? "To provide individualized (medical) nutrition therapy, you must be licensed in each client's state. Add your CDR registration, state license(s), and liability insurance — Shape re-checks the state match on every client pairing."
            : "Without a state dietitian license you can offer general wellness guidance only — not individualized or clinical nutrition plans. Add a state license below to unlock individualized care for clients in that state."}
        </p>
      </div>
      {isDietitian && (
        <div className="su-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="CDR registration number (RD/RDN)"><TextInput value={v.cdrId || ""} onChange={e => set({ cdrId: e.target.value })} placeholder="e.g. 1234567" /></Field>
          <Field label="Credential type"><Select value={v.rdCredential || "rd"} onChange={e => set({ rdCredential: e.target.value })} options={["rd", "rdn"]} /></Field>
        </div>
      )}
      <div>
        <div style={subLabel}>State license(s) — you may only serve clients in states you are licensed in</div>
        {licenses.map((l, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "64px 1fr 150px 30px", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <input type="text" value={l.state || ""} onChange={e => setLicense(i, { state: e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) })} placeholder="NY" style={{ ...inputStyle, textAlign: "center", letterSpacing: "0.1em" }} aria-label="State" />
            <input type="text" value={l.number || ""} onChange={e => setLicense(i, { number: e.target.value })} placeholder="License number" style={inputStyle} aria-label="License number" />
            <input type="date" value={l.expires || ""} onChange={e => setLicense(i, { expires: e.target.value })} style={inputStyle} aria-label="Expiration" />
            <button type="button" onClick={() => licenses.length > 1 ? removeLicense(i) : setLicense(i, { state: "", number: "", expires: "" })} aria-label="Remove license" style={{ background: "transparent", border: "1px solid rgba(242,237,228,0.14)", borderRadius: 8, color: "rgba(242,237,228,0.6)", cursor: "pointer", height: 38, fontSize: 16, lineHeight: 1 }}>×</button>
          </div>
        ))}
        <button type="button" onClick={addLicense} style={{ background: "transparent", border: "1px dashed rgba(242,237,228,0.18)", borderRadius: 8, color: TEAL, fontFamily: mono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", padding: "8px 12px", cursor: "pointer" }}>+ Add another state</button>
      </div>
      <div className="su-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Field label="Insurance carrier"><TextInput value={v.insCarrier || ""} onChange={e => set({ insCarrier: e.target.value })} placeholder="e.g. HPSO" /></Field>
        <Field label="Policy number"><TextInput value={v.insPolicy || ""} onChange={e => set({ insPolicy: e.target.value })} /></Field>
        <Field label="Insurance expiration"><input type="date" value={v.insExpires || ""} onChange={e => set({ insExpires: e.target.value })} style={inputStyle} aria-label="Insurance expiration" /></Field>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={subLabel}>Attestations (required)</div>
        <Check on={att.independent_contractor} onClick={() => toggleAtt("independent_contractor")}>I am an independent contractor. Shape is a marketplace, not my employer, and does not direct my clinical judgment.</Check>
        <Check on={att.maintains_licensure} onClick={() => toggleAtt("maintains_licensure")}>I will maintain valid licensure in every state where I provide individualized nutrition care, and only accept clients I am licensed to serve.</Check>
        <Check on={att.maintains_insurance} onClick={() => toggleAtt("maintains_insurance")}>I maintain current professional liability (malpractice) insurance.</Check>
        <Check on={att.scope_understood} onClick={() => toggleAtt("scope_understood")}>I understand the difference between general wellness guidance and individualized medical nutrition therapy, and will practice within my scope and license.</Check>
      </div>
    </div>
  );
}

// One picker per category; each takes several files, and each chosen file can be taken off.
function ApplicationDocuments({ v, set }) {
  const lib = window.ShapeApplicationFiles;
  if (!lib) {
    return <p style={{ fontFamily: sans, fontSize: 12.5, color: "#e8a07a", margin: 0 }}>Couldn't load the document uploader. Reload the page to attach your files.</p>;
  }
  const docs = v.docs && typeof v.docs === "object" ? v.docs : {};
  const setKind = (kind, files) => set({ docs: { ...docs, [kind]: files } });
  const kb = (n) => (n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ ...labelStyle, marginBottom: 0 }}>Documents</div>
      {lib.APPLICATION_FILE_KINDS.map(k => {
        const files = Array.isArray(docs[k.kind]) ? docs[k.kind] : [];
        return (
          <div key={k.kind} style={{ display: "grid", gap: 8, padding: "12px 14px", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 10 }}>
            <div style={{ fontFamily: sans, fontSize: 14, color: INK }}>{k.label}</div>
            <div style={{ fontFamily: sans, fontSize: 12.5, color: "rgba(242,237,228,0.6)", lineHeight: 1.45 }}>{k.help}</div>
            {files.map((file, i) => (
              <div key={`${file.name}-${i}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.85)" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name} · {kb(file.size || 0)}</span>
                <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setKind(k.kind, files.filter((_, j) => j !== i))} style={{ background: "transparent", border: 0, color: "rgba(242,237,228,0.6)", cursor: "pointer", fontSize: 16 }}>×</button>
              </div>
            ))}
            {files.length < k.max && (
              <input type="file" multiple accept={lib.APPLICATION_FILE_ACCEPT} aria-label={`Add ${k.label}`}
                onChange={e => { const picked = Array.from(e.target.files || []); e.target.value = ""; if (picked.length) setKind(k.kind, [...files, ...picked].slice(0, k.max)); }}
                style={{ ...inputStyle, cursor: "pointer", fontSize: 12 }} />
            )}
          </div>
        );
      })}
      <p style={{ fontFamily: sans, fontSize: 12.5, color: "rgba(242,237,228,0.6)", margin: 0, lineHeight: 1.5 }}>PDF, DOC, DOCX, PNG, JPEG or WebP. Up to 10 MB a file and 75 MB in all.</p>
    </div>
  );
}

function ProSpecialty({ v, set, kind }) {
  const specs = kind === "trainer" ? TRAINER_SPECS : NUTRI_SPECS;
  const populations = kind === "trainer"
    ? ["Beginners", "Women 30-50", "Men 40+", "Postnatal", "Athletes", "Seniors", "Rehab", "Youth"]
    : ["Endurance athletes", "Strength athletes", "Weight loss", "Clinical conditions", "Plant-based", "Postnatal", "Youth"];
  const toggle = (key, val) => {
    const cur = v[key] || [];
    set({ [key]: cur.includes(val) ? cur.filter(x => x !== val) : [...cur, val] });
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <Field label="Primary specialty">
        <Select value={proPick(v, "primary", kind)} onChange={e => set({ primary: e.target.value })} options={specs} />
      </Field>
      <Field label="Secondary specialties">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {specs.map(s => <Chip key={s} on={(v.secondary || []).includes(s)} onClick={() => toggle("secondary", s)}>{s}</Chip>)}
        </div>
      </Field>
      <Field label="Populations you work best with">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {populations.map(s => <Chip key={s} on={(v.populations || []).includes(s)} onClick={() => toggle("populations", s)}>{s}</Chip>)}
        </div>
      </Field>
      <Field label="Coaching style (one sentence)">
        <TextInput value={v.style || ""} onChange={e => set({ style: e.target.value })} placeholder={kind === "trainer" ? "Data-driven, warm, no shouting" : "Evidence-based, no restriction, real food"} />
      </Field>
    </div>
  );
}

function ProAvailability({ v, set, kind }) {
  const noun = kind === "trainer" ? "clients" : "clients";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div className="su-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <Field label={`Max ${noun} you can take`}><TextInput type="number" value={v.maxClients || ""} onChange={e => set({ maxClients: e.target.value })} placeholder="e.g. 25" /></Field>
        <Field label="Accepting new clients">
          <Select value={proPick(v, "accepting", kind)} onChange={e => set({ accepting: e.target.value })} options={["Yes", "Waitlist", "Not yet"]} />
        </Field>
      </div>
      <div className="su-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <Field label={kind === "trainer" ? "Offer 1-on-1 sessions" : "Offer 1-on-1 consults"}>
          <Select value={proPick(v, "oneOnOne", kind)} onChange={e => set({ oneOnOne: e.target.value })} options={["Yes", "No"]} />
        </Field>
        <Field label="Response time commitment">
          <Select value={proPick(v, "response", kind)} onChange={e => set({ response: e.target.value })} options={["Within 12 hours", "Within 24 hours", "Within 48 hours"]} />
        </Field>
      </div>
      <div className="su-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <Field label={kind === "trainer" ? "Monthly subscription ($/mo)" : "Monthly plan ($/mo)"}>
          <TextInput type="number" value={v.subPrice || ""} onChange={e => set({ subPrice: e.target.value })} placeholder={kind === "trainer" ? "280" : "320"} />
        </Field>
        <Field label={kind === "trainer" ? "Single session ($)" : "Single consult ($)"}>
          <TextInput type="number" value={v.sessionPrice || ""} onChange={e => set({ sessionPrice: e.target.value })} placeholder={kind === "trainer" ? "55" : "150"} />
        </Field>
      </div>
      <Field label="Offer free intro">
        <Select value={proPick(v, "intro", kind)} onChange={e => set({ intro: e.target.value })} options={["15-minute free intro", "30-minute free intro", "No free intro"]} />
      </Field>

      <div style={{ paddingTop: 14, borderTop: "1px solid rgba(242,237,228,0.08)", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(242,237,228,0.55)", marginBottom: 4 }}>Agreements</div>
        <Check on={v.tos} onClick={() => set({ tos: !v.tos })}>I agree to the <a href="/terms" style={{ color: TEAL }}>{kind === "trainer" ? "Trainer" : "Nutritionist"} Agreement</a> and <a href="/terms" style={{ color: TEAL }}>Terms of Service</a>.</Check>
        <Check on={v.conduct} onClick={() => set({ conduct: !v.conduct })}>I agree to Shape's <a href="/code-of-conduct.html" style={{ color: TEAL }}>code of conduct</a>.</Check>
        <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.62)", lineHeight: 1.55, border: "1px solid rgba(242,237,228,0.12)", borderRadius: 10, padding: 12 }}>
          Background checks are required before a provider profile can go live. Shape uses Checkr first; the review team sends the screening invite after application review.
        </div>
        <Check on={v.bgcheck} onClick={() => set({ bgcheck: !v.bgcheck })}>I consent to a required background check through Shape's screening partner before my provider profile can go live.</Check>
      </div>
    </div>
  );
}

// ⚠ A STEP SAYS WHAT IS WRONG WITH IT BEFORE YOU LEAVE IT (client-onboarding review, L6). Every
// check ran only on the last step's submit, so a mistyped email or a short password on Personal was
// reported two steps later. Continue runs this on Personal, and submit runs the same function.
function suPersonalError(values) {
  if (!values.firstName || !values.lastName) return "First and last name are required.";
  if (!values.email || !values.email.trim()) return "Enter your email.";
  // The field is type="email", but Continue is a plain button and no form is submitted, so the
  // browser never checks it (Codex on #2379): a malformed address reached the last step.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) return "Enter a valid email address.";
  if (!values.password || values.password.length < 8) return "Choose a password with at least 8 characters.";
  // Normalize the username the same way it'll be submitted, THEN validate, so
  // a value like " Jane.Doe " / "@jane" can't fail the check on a stray char.
  const cleanUsername = String(values.username || "").trim().replace(/^@/, "").toLowerCase();
  if (!cleanUsername || !/^[a-z0-9][a-z0-9._]{2,19}$/.test(cleanUsername)) return "Pick a valid username — letters, numbers, . _ (3–20 chars).";
  // ⚠ 18+ gate — the SHARED derivation, not a restatement. The instant
  // comparison this replaced read ADULT for DOB 2008-08-17 at
  // 2026-08-17T00:30:00Z, which is still Aug 16 in Los Angeles: a minor
  // admitted on their local birthday eve, the exact case the read-time gate
  // reads the calendar day at UTC−12 to prevent.
  const ageApi = window.ShapeAgeDerive;
  // Fail closed — cannot verify an age ⇒ refuse, never admit.
  if (!ageApi || typeof ageApi.isMinorFromDob !== "function") return "Could not verify your age. Reload the page and try again.";
  const minor = ageApi.isMinorFromDob(values.dob);
  if (minor === null) return "Enter a valid date of birth — Shape is for adults 18 and over.";
  if (minor === true) return "You must be 18 or older to use Shape.";
  return "";
}

// -------------- Main form --------------

function SignupForm({ role }) {
  const cfg = ROLE_CONFIG[role];
  const [step, setStep] = React.useState(0);
  const [values, setValues] = React.useState({});
  const [done, setDone] = React.useState(false);
  const [confirmEmail, setConfirmEmail] = React.useState(false);
  const [existingAccount, setExistingAccount] = React.useState(false);
  const [resendState, setResendState] = React.useState("");
  const [error, setError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const set = (patch) => setValues(v => ({ ...v, ...patch }));

  const totalSteps = cfg.steps.length;
  const isLast = step === totalSteps - 1;

  // ── Nora fills it in with you (the Ask Nora plan, step 5) ──
  // Nora is told which form and step this is and which fields hold something, never what
  // they hold, and her "Fill these in" card calls fill(). She never submits, and the keys
  // above are refused here as well as on the server.
  const noraKind = role === "trainer" ? "apply_trainer" : role === "nutritionist" ? "apply_nutritionist" : "signup";
  const noraFormRef = React.useRef({ step: 0, values: {} });
  noraFormRef.current = { step, values };
  const formOpen = !done && !confirmEmail;
  React.useEffect(() => {
    if (!formOpen) return undefined;
    const bridge = {
      kind: noraKind,
      state: () => {
        const v = noraFormRef.current.values;
        const filled = Object.keys(v).filter((k) => !SIGNUP_NORA_NEVER.includes(k) && (Array.isArray(v[k]) ? v[k].length > 0 : v[k] !== "" && v[k] != null && v[k] !== false));
        return { kind: noraKind, step: noraFormRef.current.step, filled };
      },
      fill: (patch) => {
        const safe = {};
        Object.keys(patch || {}).forEach((k) => { if (!SIGNUP_NORA_NEVER.includes(k)) safe[k] = patch[k]; });
        if (!Object.keys(safe).length) return false;
        setValues((v) => ({ ...v, ...safe }));
        return true;
      },
    };
    window.shapeNoraForm = bridge;
    return () => { if (window.shapeNoraForm === bridge) window.shapeNoraForm = null; };
  }, [noraKind, formOpen]);
  const askNora = () => { if (window.__openChatTo) window.__openChatTo({ who: "Nora", tab: "support", draft: "Can you help me fill this in?" }); };

  // Cloudflare Turnstile (CAPTCHA) — Auth CAPTCHA is enabled, so a tokenless
  // signUp is REJECTED. Mirror login.jsx: render a widget on the FINAL step, block
  // submit until a token exists, pass it to auth.signUp (or, for a coach, to
  // /api/apply), and say so plainly if the human-check can't load.
  const captchaOn = typeof window !== "undefined" && window.ShapeTurnstile && window.ShapeTurnstile.enabled();
  const [captchaToken, setCaptchaToken] = React.useState("");
  const [captchaUnavailable, setCaptchaUnavailable] = React.useState(false);
  const captchaRef = React.useRef(null);
  const captchaIdRef = React.useRef(null);
  const captchaTokenRef = React.useRef("");
  React.useEffect(() => { captchaTokenRef.current = captchaToken; }, [captchaToken]);
  // Render the widget on the final step (where it's shown). The coach application needs it
  // too: /api/apply refuses a signed-out application without a token once the server's
  // Turnstile secret is set.
  // The confirm screen has one too: Resend is another auth request, and the form's token was spent
  // creating the account (L6). The widget moves when the screen changes.
  const captchaVisible = captchaOn && (isLast || confirmEmail);
  React.useEffect(() => {
    if (captchaIdRef.current != null) { window.ShapeTurnstile.remove(captchaIdRef.current); captchaIdRef.current = null; }
    setCaptchaToken("");
    if (!captchaVisible) return;
    if (!captchaRef.current) return;
    setCaptchaUnavailable(false);
    let alive = true;
    window.ShapeTurnstile.render(captchaRef.current, setCaptchaToken).then((id) => {
      if (!alive) return;
      captchaIdRef.current = id;
      if (id == null) setCaptchaUnavailable(true); // the Turnstile script never loaded
    });
    const failTimer = setTimeout(() => { if (alive && !captchaTokenRef.current) setCaptchaUnavailable(true); }, 7000);
    return () => { alive = false; clearTimeout(failTimer); };
  }, [captchaVisible, confirmEmail]);
  // Tokens are single-use — clear after a failed attempt so a retry re-solves.
  const resetCaptcha = () => { setCaptchaToken(""); if (captchaIdRef.current != null) window.ShapeTurnstile.reset(captchaIdRef.current); };

  const body = (() => {
    if (role === "client") {
      return [
        <ClientPersonal v={values} set={set} />,
        <ClientGoals v={values} set={set} />,
        <ClientCoaching v={values} set={set} />,
      ][step];
    }
    if (role === "trainer" || role === "nutritionist") {
      return [
        <ProPersonal v={values} set={set} roleNoun={role === "trainer" ? "coaching" : "nutrition"} />,
        <ProCredentials v={values} set={set} kind={role} />,
        <ProSpecialty v={values} set={set} kind={role} />,
        <ProAvailability v={values} set={set} kind={role} />,
      ][step];
    }
    return null;
  })();

  // Resend the confirmation (L6): the same link, to the same address. Supabase allows one a minute.
  async function resendConfirmation() {
    if (resendState === "sending") return;
    if (captchaOn && !captchaToken) { setResendState(captchaUnavailable ? "captchaFailed" : "captcha"); return; }
    const sb = window.shapeDb && window.shapeDb.client;
    if (!sb) { setResendState("error"); return; }
    setResendState("sending");
    try {
      const { error } = await sb.auth.resend({
        type: "signup",
        email: String(values.email || "").trim(),
        options: { emailRedirectTo: window.location.origin + "/newdesign/Login.html", ...(captchaOn && captchaToken ? { captchaToken } : {}) },
      });
      setResendState(error ? "error" : "sent");
    } catch (e) {
      setResendState("error");
    } finally {
      if (captchaOn) resetCaptcha();
    }
  }
  const RESEND_NOTE = {
    sending: "Sending…",
    sent: "Sent again. Check your inbox and your spam folder.",
    error: "Couldn't send it again. Wait a minute, then try once more.",
    captcha: "Just a moment — confirming you're human…",
    captchaFailed: "Couldn't load the human-check. Refresh the page or disable any blockers, then try again.",
  };

  if (existingAccount) {
    return (
      <div className="su-done" style={{ padding: "60px 48px", textAlign: "left", background: "rgba(242,237,228,0.03)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 14 }}>
        <h2 style={{ fontFamily: serif, fontSize: 48, letterSpacing: "-0.025em", fontWeight: 400, margin: "0 0 12px", lineHeight: 1 }}>You already have an account.</h2>
        <p style={{ fontFamily: sans, fontSize: 16, color: "rgba(242,237,228,0.7)", margin: "0 0 32px", lineHeight: 1.55, maxWidth: 500 }}>{values.email} is already a Shape account, so no new one was made. Sign in with it, or reset its password if you can't remember it.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a href={suLoginHref()} style={{ padding: "14px 24px", borderRadius: 8, background: INK, color: PAPER, border: 0, fontFamily: sans, fontSize: 14, fontWeight: 500, textDecoration: "none", display: "inline-block" }}>Sign in</a>
          <a href="/forgot-password" style={{ padding: "14px 24px", borderRadius: 8, background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.2)", fontFamily: sans, fontSize: 14, textDecoration: "none", display: "inline-block" }}>Reset your password</a>
        </div>
      </div>
    );
  }

  if (confirmEmail) {
    return (
      <div className="su-done" style={{ padding: "60px 48px", textAlign: "left", background: "rgba(242,237,228,0.03)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: TEAL, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none"><rect x="3" y="6" width="20" height="15" rx="2" stroke={PAPER} strokeWidth="2.2"/><path d="M4 7l9 6 9-6" stroke={PAPER} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <h2 style={{ fontFamily: serif, fontSize: 48, letterSpacing: "-0.025em", fontWeight: 400, margin: "0 0 12px", lineHeight: 1 }}>Confirm your email.</h2>
        <p style={{ fontFamily: sans, fontSize: 16, color: "rgba(242,237,228,0.7)", margin: "0 0 32px", lineHeight: 1.55, maxWidth: 500 }}>We sent a confirmation link to {values.email}. Click it, then sign in to finish — we'll claim @{(values.username || "").trim().replace(/^@/, "").toLowerCase()} for you then, if it's still available.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a href={suLoginHref()} style={{ padding: "14px 24px", borderRadius: 8, background: INK, color: PAPER, border: 0, fontFamily: sans, fontSize: 14, fontWeight: 500, textDecoration: "none", display: "inline-block" }}>Go to sign in</a>
          <a href="Landing.html" style={{ padding: "14px 24px", borderRadius: 8, background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.2)", fontFamily: sans, fontSize: 14, textDecoration: "none", display: "inline-block" }}>Back to landing</a>
        </div>
        <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid rgba(242,237,228,0.1)" }}>
          <div style={{ fontFamily: sans, fontSize: 14, color: "rgba(242,237,228,0.7)" }}>No email after a few minutes?</div>
          {captchaVisible ? <div ref={captchaRef} style={{ marginTop: 12, minHeight: captchaUnavailable ? 0 : 65, display: captchaUnavailable ? "none" : "block" }} /> : null}
          <button type="button" onClick={resendConfirmation} disabled={resendState === "sending"} style={{ marginTop: 12, padding: "12px 18px", borderRadius: 8, background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.2)", fontFamily: sans, fontSize: 13, cursor: resendState === "sending" ? "wait" : "pointer" }}>Send it again</button>
          {resendState ? <div role="status" style={{ marginTop: 10, fontFamily: sans, fontSize: 13, color: resendState === "error" ? "#ff7b6e" : "rgba(242,237,228,0.7)" }}>{RESEND_NOTE[resendState]}</div> : null}
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="su-done" style={{ padding: "60px 48px", textAlign: "left", background: "rgba(242,237,228,0.03)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: TEAL, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none"><path d="M5 13.5l5 5 11-11" stroke={PAPER} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <h2 style={{ fontFamily: serif, fontSize: 48, letterSpacing: "-0.025em", fontWeight: 400, margin: "0 0 12px", lineHeight: 1 }}>{cfg.doneTitle}</h2>
        <p style={{ fontFamily: sans, fontSize: 16, color: "rgba(242,237,228,0.7)", margin: "0 0 32px", lineHeight: 1.55, maxWidth: 500 }}>{cfg.doneBody}</p>
        <div style={{ display: "flex", gap: 10 }}>
          <a href={cfg.doneCta.href} style={{ padding: "14px 24px", borderRadius: 8, background: INK, color: PAPER, border: 0, fontFamily: sans, fontSize: 14, fontWeight: 500, textDecoration: "none", display: "inline-block" }}>{cfg.doneCta.label}</a>
          <a href="Landing.html" style={{ padding: "14px 24px", borderRadius: 8, background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.2)", fontFamily: sans, fontSize: 14, textDecoration: "none", display: "inline-block" }}>Back to landing</a>
        </div>
      </div>
    );
  }

  // Continue: the member sign-up's Personal step is checked before it is left (L6); its other steps
  // are chips and agreements, which the last step's submit checks. The coach application keeps its
  // checks on submit, where its credentials and documents are checked together.
  function advance() {
    const isClient = role !== "trainer" && role !== "nutritionist";
    const err = isClient && step === 0 ? suPersonalError(values) : "";
    if (err) { setError(err); return; }
    setError("");
    setStep(step + 1);
  }

  async function submitApplication() {
    setError("");
    // ---- CLIENT path: create a REAL Supabase auth account (mirrors the mobile app) ----
    if (role !== "trainer" && role !== "nutritionist") {
      // Validate the collected fields: the Personal step's own check, which Continue runs too (L6).
      const personal = suPersonalError(values);
      if (personal) { setError(personal); return; }
      const cleanUsername = String(values.username || "").trim().replace(/^@/, "").toLowerCase();
      // Require Terms + Privacy acceptance before creating a real account (the
      // ClientCoaching step collects values.tos — gate on it like the coach path does).
      if (!values.tos) { setError("Please accept the Terms of Service and Privacy Policy to continue."); return; }
      // Whether to screen them is decided by this answer, so it is not optional.
      if (!suTokenOf(SU_COACHING, values.coaching)) { setError("Tell us whether you're looking for personal coaching."); return; }
      // Captcha gate — Auth CAPTCHA is enabled, so a tokenless signUp is REJECTED by
      // the server. If the human-check can't load, BLOCK with a retry message rather
      // than falling open into a confusing server-side rejection.
      if (captchaOn && !captchaToken) {
        setError(captchaUnavailable
          ? "Couldn't load the human-check. Refresh the page or disable any blockers, then try again."
          : "Just a moment — confirming you're human…");
        return;
      }
      const sb = window.shapeDb && window.shapeDb.client;
      if (!sb) { setError("Auth is still loading. Try again."); return; }

      setSubmitting(true);
      try {
        const { data, error } = await sb.auth.signUp({
          email: values.email.trim(),
          password: values.password,
          options: {
            emailRedirectTo: window.location.origin + "/newdesign/Login.html",
            ...(captchaOn && captchaToken ? { captchaToken } : {}),
            data: {
              full_name: (values.firstName + " " + values.lastName).trim(),
              role: "client",
              roles: ["client"],
              username: cleanUsername,
              date_of_birth: values.dob,
              // The goal, experience, weekly sessions and coaching answer, as tokens. The first
              // signed-in visit writes them to the app's records (POST /api/me/onboarding).
              onboarding: suOnboardingAnswers(values),
              // Where this sign-up came from (/signup-source.js; counted on the admin console).
              signup_source: (window.shapeSignupSource && window.shapeSignupSource.forSignup("website")) || { surface: "website" },
              // The Terms tick above is required (client-onboarding review, M4: it was required and
              // never recorded). The server records the versions in force when the account was made.
              terms_accepted_at: new Date().toISOString(),
            },
          },
        });
        if (error) {
          if (captchaOn) resetCaptcha();
          setError(error.message || "Could not create your account.");
          return;
        }
        // Email confirmation enabled → signUp returns a user but no session until
        // the emailed link is clicked → show "check your inbox". If a session IS
        // returned (auto-confirm), the account is already signed in → dashboard.
        // ⚠ AN ADDRESS THAT ALREADY HAS AN ACCOUNT WAS TOLD TO CONFIRM IT (L6). Supabase answers a
        // sign-up for a confirmed address with a user that has no identities and sends nothing, so
        // "Confirm your email" waited on an email that never came. Say so, with the way back in.
        if (data && data.user && !data.session && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setExistingAccount(true);
        } else if (data && data.user && !data.session) {
          suRememberNext();
          setConfirmEmail(true);
        } else {
          // Auto-confirm (no email step): a session exists immediately and we go
          // straight to the dashboard, skipping the login path — so provision the
          // account HERE (create the profile, persist DOB → the over_18 trigger,
          // claim the username), mirroring the mobile signUp's post-session steps.
          // The profiles upsert can return { error } WITHOUT throwing, and the
          // dashboard NEEDS the row — so on failure send them to sign in (the
          // account exists; Login.html provisions the profile) rather than into a
          // broken dashboard. The username claim stays best-effort.
          const u = data && data.user;
          if (u && u.id) {
            let pErr = null;
            try {
              const res = await sb.from("profiles").upsert({
                id: u.id, email: u.email,
                full_name: (values.firstName + " " + values.lastName).trim(),
                role: "client", roles: ["client"],
                date_of_birth: values.dob, updated_at: new Date().toISOString(),
              }, { onConflict: "id" });
              pErr = res && res.error;
            } catch (e) { pErr = e; }
            if (pErr) { setError("Your account was created — please sign in to finish setting up your profile."); return; }
            try { await sb.rpc("set_my_username", { p_username: cleanUsername }); } catch (e) {}
          }
          window.location.href = suSafeNext() || "ClientDashboard.html";
        }
      } catch (err) {
        if (captchaOn) resetCaptcha();
        setError(err?.message || "Could not create your account.");
      } finally {
        setSubmitting(false);
      }
      return;
    }
    // ---- COACH path (trainer / nutritionist) — UNCHANGED below ----
    if (!values.firstName || !values.lastName || !values.email) {
      setError("First name, last name, and email are required.");
      return;
    }
    // Experience is never a refusal: under the standard, the application asks where the
    // person has worked and what kind of experience it is, and is reviewed individually.
    const years = experienceYearsOf(proPick(values, "years", role));
    if (years === null) {
      setError("Choose your years of professional experience.");
      return;
    }
    if (years < EXPERIENCE_STANDARD_YEARS && (!String(values.experienceHistory || "").trim() || !String(values.experienceType || "").trim())) {
      setError(`With under ${EXPERIENCE_STANDARD_YEARS} years, tell us where you've worked and what type of experience you have, so we can review your application.`);
      return;
    }
    if (!values.tos || !values.conduct || !values.bgcheck) {
      setError("Terms, code of conduct, and background check consent are required.");
      return;
    }
    if (role === "nutritionist") {
      const att = values.attest || {};
      const required = ["independent_contractor", "maintains_licensure", "maintains_insurance", "scope_understood"];
      if (required.some((k) => att[k] !== true)) {
        setError("All nutrition compliance attestations are required.");
        return;
      }
    }

    // Within the nutritionist application you can declare you're a Registered
    // Dietitian (RD/RDN). The provider rails stay 'nutritionist' (same discipline +
    // write path); nutrition_role + credential ride in details so the reviewer sets
    // profiles.role='dietitian' + the RD credential at setup.
    const isDietitian = role === "nutritionist" && /dietitian/i.test(values.nutritionType || "");
    const form = new FormData();
    form.append("providerType", role);
    form.append("firstName", values.firstName || "");
    form.append("lastName", values.lastName || "");
    // ⚠ COACHES ARE 18+ TOO. Approval provisions a real auth user AND a coach
    // profile, and coach roles satisfy membership automatically — so an approved
    // provider with no date of birth is an entitled account the gates cannot place.
    // Same shared rule; /api/apply re-validates server-side.
    const proAge = window.ShapeAgeDerive;
    if (!proAge || typeof proAge.isMinorFromDob !== "function") {
      setError("Could not verify your age. Reload the page and try again.");
      return;
    }
    const proMinor = proAge.isMinorFromDob(values.dob);
    if (proMinor === null) { setError("Enter a valid date of birth — Shape is for adults 18 and over."); return; }
    if (proMinor === true) { setError("You must be 18 or older to apply as a coach."); return; }
    const docList = applicationDocs(values);
    const filesLib = window.ShapeApplicationFiles;
    if (docList.length) {
      if (!filesLib) { setError("Couldn't load the document uploader. Reload the page and try again."); return; }
      const fileProblem = filesLib.applicationFilesProblem(docList.map(({ kind, file }) => ({ kind, name: file.name, type: file.type, size: file.size })));
      if (fileProblem) { setError(fileProblem); return; }
    }
    // The same human check the member sign-up carries: /api/apply refuses a signed-out
    // application without a token once the server's Turnstile secret is set.
    if (captchaOn && !captchaToken) {
      setError(captchaUnavailable
        ? "Couldn't load the human-check. Refresh the page or disable any blockers, then try again."
        : "Just a moment — confirming you're human…");
      return;
    }
    form.append("email", values.email || "");
    form.append("phone", values.phone || "");
    form.append("location", values.city || "");
    form.append("specialty", proPick(values, "primary", role));
    form.append("yearsExperience", proPick(values, "years", role));
    form.append("monthlyPrice", values.subPrice || "");
    form.append("dob", values.dob || "");
    form.append("details", JSON.stringify({
      username: values.username || "",
      timezone: values.tz || "",
      social: values.social || "",
      bio: values.bio || "",
      nutrition_role: role === "nutritionist" ? (isDietitian ? "dietitian" : "nutritionist") : undefined,
      credential: isDietitian ? (values.rdCredential === "rdn" ? "rdn" : "rd") : undefined,
      certification: values.cert || "",
      certification_expiration: values.certExp || "",
      education: values.edu || "",
      // NC1 — structured nutrition-compliance capture (the reviewer seeds
      // provider_credentials + provider_licenses from this).
      ...(role === "nutritionist" ? {
        cdr_id: values.cdrId || "",
        state_licenses: (values.licenses || [])
          .filter(l => l && /^[A-Za-z]{2}$/.test((l.state || "").trim()))
          .map(l => ({ state: (l.state || "").toUpperCase(), number: l.number || "", expires: l.expires || "" })),
        insurance_carrier: values.insCarrier || "",
        insurance_policy: values.insPolicy || "",
        insurance_expires: values.insExpires || "",
        compliance_attestations: values.attest || {},
      } : {}),
      insurance_status: proPick(values, "insurance", role),
      previous_platforms: values.prev || "",
      // The Specialty and Availability steps, which were collected (and Nora can fill)
      // but never sent. Same keys as the app's application.
      secondary_specialties: values.secondary || [],
      populations: values.populations || [],
      coaching_style: values.style || "",
      max_clients: values.maxClients || "",
      accepting_new_clients: proPick(values, "accepting", role),
      one_on_one: proPick(values, "oneOnOne", role),
      response_time: proPick(values, "response", role),
      single_session_price: values.sessionPrice || "",
      intro_offer: proPick(values, "intro", role),
      // The boxes as ticked; the route records them with its own timestamp.
      agreements: {
        credential_verification: values.verify === true,
        terms: values.tos === true,
        code_of_conduct: values.conduct === true,
        background_check: values.bgcheck === true,
      },
      experience_standard_years: EXPERIENCE_STANDARD_YEARS,
      experience_history: values.experienceHistory || "",
      experience_type: values.experienceType || "",
      experience_notes: values.experienceNotes || "",
      background_check_provider: "checkr",
      background_check_required: true,
      background_check_consent: true,
      background_check_status: "consent_received",
    }));
    setSubmitting(true);
    try {
      // The documents first, straight to storage: /api/apply/uploads checks them, runs the human
      // check and answers with a signed link per file and a ticket, which the application then
      // carries in place of the human-check token (a token is single-use).
      if (docList.length) {
        const meta = docList.map(({ kind, file }) => ({ kind, name: file.name, type: file.type, size: file.size }));
        const linkRes = await fetch("/api/apply/uploads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ providerType: role, files: meta, ...(captchaToken ? { turnstileToken: captchaToken } : {}) }),
        });
        const links = await linkRes.json().catch(() => ({}));
        if (!linkRes.ok || !Array.isArray(links.uploads) || links.uploads.length !== docList.length) {
          throw new Error(links.error || "Could not upload your files. Check your connection and try again.");
        }
        const sb = window.shapeDb && window.shapeDb.client;
        if (!sb || !sb.storage) throw new Error("Could not upload your files. Reload the page and try again.");
        for (const [i, link] of links.uploads.entries()) {
          // ⚠ THE CLIENT SENDS A FILE UNDER ITS OWN TYPE, whatever contentType says (a File goes in a
          // multipart body), so a file the browser left untyped would reach the bucket as
          // application/octet-stream and be refused. It goes up as a copy carrying the type the
          // rules settled on from its extension (Codex on #2319).
          const original = docList[i].file;
          const body = link.type && original.type !== link.type ? new File([original], original.name, { type: link.type }) : original;
          const { error: upErr } = await sb.storage.from(links.bucket).uploadToSignedUrl(link.path, link.token, body, { contentType: link.type || undefined });
          if (upErr) throw new Error(`${docList[i].file.name} did not upload. Check your connection and try again.`);
        }
        form.append("uploadTicket", links.ticket);
        form.append("uploads", JSON.stringify(links.uploads.map(link => ({ path: link.path, name: link.name }))));
      } else if (captchaToken) {
        form.append("turnstileToken", captchaToken);
      }
      const res = await fetch("/api/apply", { method: "POST", body: form });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Could not submit application.");
      setDone(true);
    } catch (err) {
      // Tokens are single-use, so a retry re-solves.
      if (captchaOn) resetCaptcha();
      setError(err?.message || "Could not submit application.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="su-card" style={{ background: "rgba(242,237,228,0.03)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 14, padding: "40px 44px 36px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: TEAL }}>Step {step + 1} of {totalSteps}</div>
        <div style={{ fontFamily: sans, fontSize: 12, color: "rgba(242,237,228,0.55)" }}>{cfg.steps[step]}</div>
      </div>
      <h2 style={{ fontFamily: serif, fontSize: 36, letterSpacing: "-0.025em", fontWeight: 400, margin: "0 0 12px", lineHeight: 1.05 }}>{cfg.formTitle}</h2>
      <button type="button" data-nora-form-help onClick={askNora} style={{ display: "inline-flex", alignItems: "center", gap: 8, margin: "0 0 24px", padding: "7px 12px", borderRadius: 999, border: "1px solid rgba(242,237,228,0.16)", background: "transparent", color: "rgba(242,237,228,0.8)", fontFamily: sans, fontSize: 12.5, cursor: "pointer" }}>
        <span aria-hidden="true" style={{ color: TEAL }}>✦</span> Questions? Ask Nora, and she can fill this in with you
      </button>

      {/* Progress */}
      <div style={{ display: "flex", gap: 6, marginBottom: 32 }}>
        {cfg.steps.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? TEAL : "rgba(242,237,228,0.1)" }} />
        ))}
      </div>

      <div>{body}</div>

      {error && <div style={{ marginTop: 18, color: "#ff7b6e", fontFamily: sans, fontSize: 13 }}>{error}</div>}

      {/* Turnstile bot challenge — the final step of the member sign-up and of the
          coach application. If it can't load, submit is blocked with a retry notice
          (Auth CAPTCHA rejects a tokenless signUp and /api/apply a tokenless
          application, so falling open would only hit a server rejection). */}
      {captchaVisible ? (
        <div style={{ marginTop: 18 }}>
          <div ref={captchaRef} style={{ minHeight: captchaUnavailable ? 0 : 65, display: captchaUnavailable ? "none" : "block" }} />
          {captchaUnavailable ? (
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.06em", color: "rgba(242,237,228,0.5)" }}>Couldn't load the human-check. Refresh the page or disable any blockers, then try again.</div>
          ) : null}
        </div>
      ) : null}

      <div style={{ marginTop: 36, display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
        <button
          type="button"
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          style={{ padding: "12px 18px", borderRadius: 8, background: "transparent", color: step === 0 ? "rgba(242,237,228,0.3)" : INK, border: "1px solid rgba(242,237,228,0.15)", fontFamily: sans, fontSize: 13, cursor: step === 0 ? "default" : "pointer" }}>
          ← Back
        </button>
        <button
          type="button"
          onClick={() => isLast ? submitApplication() : advance()}
          disabled={submitting}
          style={{ padding: "14px 24px", borderRadius: 8, background: INK, color: PAPER, border: 0, fontFamily: sans, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
          {submitting ? "Submitting..." : isLast ? cfg.submitLabel : "Continue"}
        </button>
      </div>
    </div>
  );
}

// -------------- Page shell --------------

function SignupPage({ role }) {
  const cfg = ROLE_CONFIG[role] || ROLE_CONFIG.client;
  return (
    <div style={{ background: PAPER, color: INK, fontFamily: sans, minHeight: "100vh" }}>
      {/* ⚠ THE PAGE WAS A FIXED TWO-COLUMN GRID WITH 72PX SIDES (client-onboarding review, L7), so a
          phone got a squeezed form beside a pitch it could not see. Below 900px it is one column with
          16px sides; below 560px the paired fields stack. The rules beat the inline styles, hence
          !important. */}
      <style>{`
@media (max-width: 900px) {
  .su-pad { padding-left: 16px !important; padding-right: 16px !important; }
  .su-main { padding-top: 28px !important; padding-bottom: 48px !important; }
  .su-page { grid-template-columns: minmax(0, 1fr) !important; gap: 32px !important; }
  .su-aside { position: static !important; }
  .su-title { font-size: 40px !important; }
  .su-done { padding: 32px 20px !important; }
  .su-card { padding: 28px 18px 24px !important; }
}
@media (max-width: 560px) {
  .su-2col { grid-template-columns: minmax(0, 1fr) !important; }
  .su-2col > * { grid-column: auto !important; }
  .su-done h2 { font-size: 36px !important; }
}
`}</style>
      {/* Minimal header */}
      <header className="su-pad" style={{ padding: "24px 72px", borderBottom: "1px solid rgba(242,237,228,0.08)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <a href="Landing.html" aria-label="Shape" style={{ flex: "none", display: "inline-flex" }}><Logo variant="white" size={50} /></a>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <span style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.55)" }}>Already have an account?</span>
            <a href={suLoginHref()} style={{ fontFamily: sans, fontSize: 13, color: INK, fontWeight: 500, borderBottom: `1.5px solid ${TEAL}`, paddingBottom: 3 }}>Log in</a>
          </div>
        </div>
      </header>

      <main className="su-pad su-main" style={{ padding: "60px 72px 80px" }}>
        <div className="su-page" style={{ maxWidth: 1220, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1.15fr", gap: 64, alignItems: "start" }}>
          {/* Left — pitch */}
          <aside className="su-aside" style={{ position: "sticky", top: 100 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 20 }}>{cfg.kicker}</div>
            <h1 className="su-title" style={{ fontFamily: serif, fontSize: 56, letterSpacing: "-0.03em", fontWeight: 400, margin: 0, lineHeight: 1.02 }}>{cfg.titleLeft}</h1>
            <ul style={{ listStyle: "none", padding: 0, margin: "32px 0 0", display: "flex", flexDirection: "column", gap: 12 }}>
              {cfg.perks.map(p => (
                <li key={p} style={{ fontFamily: sans, fontSize: 14.5, color: "rgba(242,237,228,0.8)", display: "flex", gap: 10, alignItems: "baseline" }}>
                  <span style={{ color: TEAL }}>→</span>{p}
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 40, fontFamily: sans, fontSize: 12, color: "rgba(242,237,228,0.45)" }}>
              <a href="Landing.html" style={{ color: "rgba(242,237,228,0.55)" }}>← Back to profile selection</a>
            </div>
          </aside>

          {/* Right — form */}
          <div><SignupForm role={role} /></div>
        </div>
      </main>

      <footer className="su-pad" style={{ padding: "30px 72px", borderTop: "1px solid rgba(242,237,228,0.08)", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.45)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <span>© 2026 Shape</span>
          <div style={{ display: "flex", gap: 24 }}>
            <a href="/privacy">Privacy</a><a href="/terms">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Determine role: prefer window.__SIGNUP_ROLE (set by HTML), then ?role=, then default client.
const role = window.__SIGNUP_ROLE || new URLSearchParams(window.location.search).get("role") || "client";
ReactDOM.createRoot(document.getElementById("root")).render(<SignupPage role={role} />);
