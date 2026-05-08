// Trainer — Create a new program. Multi-week training block builder.

const TRAINER_CLIENTS = [
  { id: 1, name: "Priya Shah",    avatar: "PS", meta: "Strength · 14w" },
  { id: 2, name: "Jonah Wright",  avatar: "JW", meta: "Foundations · 8mo" },
  { id: 3, name: "Ana Perez",     avatar: "AP", meta: "Hypertrophy · 1yr" },
  { id: 4, name: "Marcus Lee",    avatar: "ML", meta: "Powerlifting · 2yr" },
  { id: 5, name: "Sofia Martinez",avatar: "SM", meta: "Return-to-lifting · 4w" },
  { id: 6, name: "Diego Romero",  avatar: "DR", meta: "Hybrid cut · 6w" },
  { id: 7, name: "Amira Khan",    avatar: "AK", meta: "Marathon base · 10w" },
  { id: 8, name: "Tom Becker",    avatar: "TB", meta: "Beginner barbell · new" },
];

const PROGRAM_TAGS = [
  "SIGNATURE",
  "FOUNDATIONS",
  "PERFORMANCE",
  "REHAB",
  "ENDURANCE",
  "HYPERTROPHY",
  "POWERLIFTING",
  "BODYBUILDING",
  "RUNNING",
  "MARATHON",
  "ULTRA",
  "MOBILITY",
  "FUNCTIONAL",
  "HYROX",
  "FAT LOSS",
  "SPORT",
  "AT HOME",
];

const PROGRAM_PRESETS = {
  "strength-plus-hybrid-12w": {
    name: "Strength + hybrid (12w)",
    weeks: 12,
    price: "220",
    kind: "subscription",
    tag: "SIGNATURE",
    goal: "Strength",
    level: "Intermediate",
    summary: "A 12-week strength block with conditioning touches, progression rules, and recovery weeks built in.",
    workouts: [
      { week: 1, day: "Mon", title: "Upper push", ref: "Strength focus - 4 x 6" },
      { week: 1, day: "Wed", title: "Lower pull", ref: "Posterior chain - 5 x 5" },
      { week: 1, day: "Sat", title: "Hybrid engine", ref: "Zone 2 + carries" },
    ],
  },
  "beginner-barbell-8w": {
    name: "Beginner barbell (8w)",
    weeks: 8,
    price: "180",
    kind: "subscription",
    tag: "FOUNDATIONS",
    goal: "Strength",
    level: "Beginner",
    summary: "An 8-week foundation block for new lifters learning squat, hinge, press, row, and safe loading.",
    workouts: [
      { week: 1, day: "Mon", title: "Squat pattern", ref: "Technique - 3 x 8" },
      { week: 1, day: "Wed", title: "Upper basics", ref: "Press + row - 3 x 10" },
      { week: 1, day: "Fri", title: "Full-body practice", ref: "Light barbell circuit" },
    ],
  },
  "hybrid-cut-protocol-10w": {
    name: "Hybrid cut protocol (10w)",
    weeks: 10,
    price: "240",
    kind: "subscription",
    tag: "PERFORMANCE",
    goal: "Fat loss",
    level: "Intermediate",
    summary: "A cut-phase program balancing heavy lifts, conditioning, and nutrition-aware recovery days.",
    workouts: [
      { week: 1, day: "Mon", title: "Heavy upper", ref: "Strength retention" },
      { week: 1, day: "Tue", title: "Tempo intervals", ref: "Conditioning - 30 min" },
      { week: 1, day: "Thu", title: "Lower strength", ref: "RPE-managed loading" },
    ],
  },
  "return-to-lifting-6w": {
    name: "Return-to-lifting (6w)",
    weeks: 6,
    price: "200",
    kind: "subscription",
    tag: "REHAB",
    goal: "General fitness",
    level: "Beginner",
    summary: "A conservative rebuild for clients returning after time off, injury, or inconsistent training.",
    workouts: [
      { week: 1, day: "Mon", title: "Movement screen", ref: "Tempo and control" },
      { week: 1, day: "Wed", title: "Pattern rebuild", ref: "Light load - high quality" },
      { week: 1, day: "Fri", title: "Capacity base", ref: "Low impact circuit" },
    ],
  },
  "marathon-base-16w": {
    name: "Marathon base (16w)",
    weeks: 16,
    price: "200",
    kind: "subscription",
    tag: "ENDURANCE",
    goal: "Endurance",
    level: "Intermediate",
    summary: "A marathon base cycle with easy mileage, long-run progression, strength support, and deload weeks.",
    workouts: [
      { week: 1, day: "Tue", title: "Easy base run", ref: "60 min - conversational" },
      { week: 1, day: "Thu", title: "Tempo run prep", ref: "6PM pace work" },
      { week: 1, day: "Sun", title: "Long run build", ref: "90+ min progression" },
    ],
  },
};

function getProgramPresetFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const key = params.get("program");
  return key ? PROGRAM_PRESETS[key] : null;
}

function NewProgramPage() {
  const urlMode = new URLSearchParams(window.location.search).get("mode");
  const initialProgram = getProgramPresetFromUrl();
  const isEditing = urlMode === "edit" && Boolean(initialProgram);
  const [name, setName] = React.useState(initialProgram?.name || "");
  const [weeks, setWeeks] = React.useState(initialProgram?.weeks || 6);
  const [price, setPrice] = React.useState(initialProgram?.price || "180");
  const [kind, setKind] = React.useState(initialProgram?.kind || "one-time");
  const [tag, setTag] = React.useState(initialProgram?.tag || "SIGNATURE");
  const [customTag, setCustomTag] = React.useState(initialProgram?.tag && !PROGRAM_TAGS.includes(initialProgram.tag) ? initialProgram.tag : "");
  const [goal, setGoal] = React.useState(initialProgram?.goal || "Strength");
  const [level, setLevel] = React.useState(initialProgram?.level || "Intermediate");
  const [summary, setSummary] = React.useState(initialProgram?.summary || "");
  const [workouts, setWorkouts] = React.useState(initialProgram?.workouts || [
    { week: 1, day: "Mon", title: "Lower — push", ref: "" },
  ]);
  const [assignedIds, setAssignedIds] = React.useState([]);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const addWorkout = () => setWorkouts([...workouts, { week: 1, day: "Mon", title: "", ref: "" }]);
  const setWorkout = (i, patch) => setWorkouts(workouts.map((w, j) => j === i ? { ...w, ...patch } : w));
  const removeWorkout = (i) => setWorkouts(workouts.filter((_, j) => j !== i));

  const toggleClient = (id) => setAssignedIds(assignedIds.includes(id) ? assignedIds.filter(x => x !== id) : [...assignedIds, id]);
  const removeClient = (id) => setAssignedIds(assignedIds.filter(x => x !== id));
  const sendToClients = () => {
    if (!assignedIds.length) return alert("Add at least one client first.");
    const names = TRAINER_CLIENTS.filter(c => assignedIds.includes(c.id)).map(c => c.name.split(" ")[0]).join(", ");
    alert(`Sent to ${assignedIds.length} client${assignedIds.length === 1 ? "" : "s"}: ${names}`);
    window.location.href = "TrainerPrograms.html";
  };

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const goals = ["Strength", "Hypertrophy", "Fat loss", "Endurance", "General fitness", "Sport-specific"];
  const levels = ["Beginner", "Intermediate", "Advanced"];
  const applyCustomTag = () => {
    const value = customTag.trim().replace(/\s+/g, " ").toUpperCase();
    if (!value) return;
    setCustomTag(value);
    setTag(value);
  };
  const applyDraft = (draft) => {
    setName(draft.title || name);
    setSummary(draft.summary || summary);
    setTag(draft.tag || tag);
    const generatedWeeks = Number(String(draft.duration || "").match(/\d+/)?.[0]);
    if (generatedWeeks) setWeeks(generatedWeeks);
    if (draft.blocks?.length) {
      setWorkouts(draft.blocks.map((block, index) => ({
        week: Number(String(block.label || "").match(/\d+/)?.[0]) || Math.min(index + 1, generatedWeeks || weeks),
        day: days[index % days.length],
        title: block.title || "",
        ref: [block.detail, block.note].filter(Boolean).join(" - "),
      })));
    }
  };

  return (
    <DashPage
      navItems={trainerNavItems("programs")}
      payoutCard={trainerPayoutCard}
      eyebrow={<a href="TrainerPrograms.html" style={{ color: "rgba(242,237,228,0.55)" }}>← PROGRAMS</a>}
      title={isEditing ? "Manage program" : "New program"}
      subtitle="A reusable training block you sell once or via subscription. Sessions cascade to every client on the block — their history stays intact."
      actions={<>
        <a href="TrainerPrograms.html" style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>Cancel</a>
        <button onClick={() => alert("Saved to your library.")} style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>Save to library</button>
        <button onClick={sendToClients} style={{ background: "transparent", color: TEAL_BRIGHT, border: `1px solid ${TEAL}`, padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Send to client{assignedIds.length > 1 ? "s" : ""}{assignedIds.length ? ` (${assignedIds.length})` : ""} →</button>
        <button onClick={() => { alert("Program published."); window.location.href = "TrainerPrograms.html"; }} style={{ background: TEAL, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Publish →</button>
      </>}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 20 }}>
        {/* LEFT — form */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <AIGeneratorCard kind="program" role="trainer" onApply={applyDraft} />
          <Card>
            <SectionTitle>Basics</SectionTitle>
            <Field label="Program name">
              <TextInput value={name} onChange={setName} placeholder="e.g. Strength + hybrid (12w)" />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              <Field label="Duration">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <NumInput value={weeks} onChange={setWeeks} min={1} max={52} />
                  <span style={{ fontSize: 13, color: "rgba(242,237,228,0.55)" }}>weeks</span>
                </div>
              </Field>
              <Field label="Goal">
                <Select value={goal} onChange={setGoal} options={goals} />
              </Field>
              <Field label="Level">
                <Select value={level} onChange={setLevel} options={levels} />
              </Field>
            </div>
            <Field label="Category tag">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {PROGRAM_TAGS.map(t => (
                  <button key={t} onClick={() => setTag(t)} style={{
                    padding: "7px 12px", borderRadius: 4, fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10.5, letterSpacing: "0.08em", cursor: "pointer",
                    background: tag === t ? TEAL : "rgba(242,237,228,0.06)",
                    color: tag === t ? PAPER : "rgba(242,237,228,0.7)",
                    border: tag === t ? "none" : "1px solid rgba(242,237,228,0.12)",
                  }}>{t}</button>
                ))}
                {tag && !PROGRAM_TAGS.includes(tag) && (
                  <button onClick={() => setTag(tag)} style={{
                    padding: "7px 12px", borderRadius: 4, fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10.5, letterSpacing: "0.08em", cursor: "pointer",
                    background: TEAL,
                    color: PAPER,
                    border: "none",
                  }}>{tag}</button>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 132px", gap: 8, marginTop: 10 }}>
                <input
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyCustomTag(); } }}
                  placeholder="Type custom category..."
                  style={{ width: "100%", background: "rgba(242,237,228,0.04)", color: INK, border: "1px solid rgba(242,237,228,0.12)", borderRadius: 6, padding: "9px 11px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.06em", outline: "none", textTransform: "uppercase" }}
                />
                <button onClick={applyCustomTag} style={{ background: "rgba(242,237,228,0.06)", color: INK, border: "1px solid rgba(242,237,228,0.14)", borderRadius: 6, padding: "9px 12px", fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.08em", cursor: "pointer" }}>Use custom</button>
              </div>
            </Field>
            <Field label="Summary (shown on your public profile)">
              <TextArea value={summary} onChange={setSummary} rows={3} placeholder="One or two sentences on what this program does and who it's for." />
            </Field>
          </Card>

          <Card>
            <SectionTitle right={`${workouts.length} WORKOUT${workouts.length === 1 ? "" : "S"}`}>Schedule</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {workouts.map((w, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "72px 80px 1fr 1.4fr 28px", gap: 10, alignItems: "center", padding: "10px 12px", background: "rgba(242,237,228,0.03)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 8 }}>
                  <Select value={`W${w.week}`} onChange={(v) => setWorkout(i, { week: Number(v.slice(1)) })} options={Array.from({ length: weeks }, (_, k) => `W${k + 1}`)} compact />
                  <Select value={w.day} onChange={(v) => setWorkout(i, { day: v })} options={days} compact />
                  <TextInput value={w.title} onChange={(v) => setWorkout(i, { title: v })} placeholder="Workout title" compact />
                  <TextInput value={w.ref} onChange={(v) => setWorkout(i, { ref: v })} placeholder="Attach a workout (from your library)" compact />
                  <button onClick={() => removeWorkout(i)} aria-label="Remove" style={{ background: "transparent", border: 0, color: "rgba(242,237,228,0.5)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
            <button onClick={addWorkout} style={{ marginTop: 14, background: "transparent", color: TEAL_BRIGHT, border: "1px dashed rgba(30,192,168,0.35)", padding: "10px 14px", borderRadius: 8, fontFamily: sans, fontSize: 13, cursor: "pointer", width: "100%" }}>+ Add workout</button>
            <div style={{ marginTop: 14, fontSize: 12, color: "rgba(242,237,228,0.5)" }}>
              Tip — leave workouts empty to fill in later, or link to ones already in your library.
              <a href="TrainerNewWorkout.html" style={{ color: TEAL_BRIGHT, marginLeft: 6 }}>Build a new workout →</a>
            </div>
          </Card>
        </div>

        {/* RIGHT — pricing + preview */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card>
            <SectionTitle>Pricing</SectionTitle>
            <Field label="Billing model">
              <div style={{ display: "flex", gap: 8 }}>
                {[["one-time", "One-time"], ["subscription", "Subscription"]].map(([v, l]) => (
                  <button key={v} onClick={() => setKind(v)} style={{
                    flex: 1, padding: "10px 14px", borderRadius: 8, cursor: "pointer",
                    background: kind === v ? INK : "rgba(242,237,228,0.04)",
                    color: kind === v ? PAPER : INK,
                    border: kind === v ? `1px solid ${TEAL}` : "1px solid rgba(242,237,228,0.1)",
                    fontFamily: sans, fontSize: 13, fontWeight: kind === v ? 500 : 400,
                  }}>{l}</button>
                ))}
              </div>
            </Field>
            <Field label={`Price ${kind === "subscription" ? "per month" : "(one-time)"}`}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 8, padding: "0 12px" }}>
                <span style={{ color: "rgba(242,237,228,0.55)" }}>$</span>
                <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} style={{ flex: 1, background: "transparent", border: 0, color: INK, fontSize: 14, padding: "10px 0", outline: "none" }} />
                <span style={{ color: "rgba(242,237,228,0.5)", fontSize: 12 }}>{kind === "subscription" ? "/mo" : ""}</span>
              </div>
            </Field>
            <div style={{ fontSize: 12, color: "rgba(242,237,228,0.55)", lineHeight: 1.5 }}>
              Shape keeps 8%. You receive <span style={{ color: INK, fontWeight: 500 }}>${price ? (Number(price) * 0.92).toFixed(2) : "—"}</span> per sale.
              Weekly payouts via Stripe Connect.
            </div>
          </Card>

          <Card>
            <SectionTitle right={assignedIds.length ? `${assignedIds.length} ASSIGNED` : null}>Assigned clients</SectionTitle>
            {assignedIds.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "rgba(242,237,228,0.55)", lineHeight: 1.5, marginBottom: 14 }}>
                Pick clients to assign this program to. They'll get it in their library the moment you publish, or when you hit "Send to clients".
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                {TRAINER_CLIENTS.filter(c => assignedIds.includes(c.id)).map(c => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "rgba(242,237,228,0.03)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 8 }}>
                    <Avatar initials={c.avatar} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: INK, fontWeight: 500 }}>{c.name}</div>
                      <div style={{ fontSize: 11.5, color: "rgba(242,237,228,0.55)" }}>{c.meta}</div>
                    </div>
                    <button onClick={() => removeClient(c.id)} aria-label="Remove" style={{ background: "transparent", border: 0, color: "rgba(242,237,228,0.5)", fontSize: 16, cursor: "pointer" }}>×</button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setPickerOpen(true)} style={{ width: "100%", background: "transparent", color: TEAL_BRIGHT, border: "1px dashed rgba(30,192,168,0.35)", padding: "10px 14px", borderRadius: 8, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>+ Add client</button>
          </Card>

          <Card>
            <SectionTitle>Preview</SectionTitle>
            <div style={{ background: "rgba(242,237,228,0.02)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 10, padding: 18 }}>
              <div style={{ height: 120, borderRadius: 6, background: "linear-gradient(135deg, rgba(30,192,168,0.16), rgba(242,237,228,0.04))", marginBottom: 14, display: "flex", alignItems: "flex-end", padding: 12 }}>
                <Pill>{tag}</Pill>
              </div>
              <div style={{ fontFamily: serif, fontSize: 19, marginBottom: 6 }}>{name || "Untitled program"}</div>
              <div style={{ fontSize: 12, color: "rgba(242,237,228,0.6)" }}>
                {weeks}w · {goal} · {level} · {kind === "subscription" ? `$${price || 0}/mo` : `$${price || 0}`}
              </div>
              <div style={{ marginTop: 12, fontSize: 13, color: "rgba(242,237,228,0.72)", lineHeight: 1.5 }}>
                {summary || "Your summary will appear here."}
              </div>
            </div>
          </Card>
        </div>
      </div>
      {pickerOpen && (
        <ClientPicker clients={TRAINER_CLIENTS} selectedIds={assignedIds} onToggle={toggleClient} onClose={() => setPickerOpen(false)} />
      )}
    </DashPage>
  );
}

function Avatar({ initials }) {
  return (
    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(30,192,168,0.15)", color: TEAL_BRIGHT, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 500, flex: "none" }}>
      {initials}
    </div>
  );
}

function ClientPicker({ clients, selectedIds, onToggle, onClose }) {
  const [query, setQuery] = React.useState("");
  const filtered = clients.filter(c => c.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,8,6,0.78)", backdropFilter: "blur(8px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#14110e", color: INK, borderRadius: 14, maxWidth: 520, width: "100%", maxHeight: "80vh", overflow: "hidden", border: "1px solid rgba(242,237,228,0.1)", boxShadow: "0 40px 80px rgba(0,0,0,0.6)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "22px 24px 16px", borderBottom: "1px solid rgba(242,237,228,0.08)" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL, marginBottom: 8 }}>Assign clients</div>
          <div style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.015em" }}>Pick who gets this</div>
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search clients..." style={{ width: "100%", marginTop: 14, background: "rgba(242,237,228,0.04)", color: INK, border: "1px solid rgba(242,237,228,0.1)", borderRadius: 8, padding: "10px 12px", fontSize: 13.5, outline: "none" }} />
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "8px 0" }}>
          {filtered.length === 0 && <div style={{ padding: "20px 24px", color: "rgba(242,237,228,0.5)", fontSize: 13 }}>No clients match "{query}".</div>}
          {filtered.map(c => {
            const checked = selectedIds.includes(c.id);
            return (
              <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 24px", cursor: "pointer", background: checked ? "rgba(30,192,168,0.06)" : "transparent" }}>
                <input type="checkbox" checked={checked} onChange={() => onToggle(c.id)} style={{ accentColor: TEAL, width: 16, height: 16 }} />
                <Avatar initials={c.avatar} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, color: INK, fontWeight: 500 }}>{c.name}</div>
                  <div style={{ fontSize: 11.5, color: "rgba(242,237,228,0.55)" }}>{c.meta}</div>
                </div>
              </label>
            );
          })}
        </div>
        <div style={{ padding: "14px 24px", borderTop: "1px solid rgba(242,237,228,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 12, color: "rgba(242,237,228,0.55)" }}>{selectedIds.length} selected</div>
          <button onClick={onClose} style={{ background: TEAL, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Done</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.1em", color: "rgba(242,237,228,0.55)", marginBottom: 6, textTransform: "uppercase" }}>{label}</div>
      {children}
    </label>
  );
}
function TextInput({ value, onChange, placeholder, compact }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", background: compact ? "transparent" : "rgba(242,237,228,0.04)", color: INK, border: compact ? 0 : "1px solid rgba(242,237,228,0.1)", borderRadius: 8, padding: compact ? "6px 8px" : "10px 12px", fontSize: 14, outline: "none" }} />;
}
function TextArea({ value, onChange, placeholder, rows = 3 }) {
  return <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{ width: "100%", background: "rgba(242,237,228,0.04)", color: INK, border: "1px solid rgba(242,237,228,0.1)", borderRadius: 8, padding: "10px 12px", fontSize: 14, outline: "none", resize: "vertical" }} />;
}
function NumInput({ value, onChange, min, max }) {
  return <input type="number" value={value} min={min} max={max} onChange={(e) => onChange(Number(e.target.value) || 0)} style={{ width: 80, background: "rgba(242,237,228,0.04)", color: INK, border: "1px solid rgba(242,237,228,0.1)", borderRadius: 8, padding: "10px 12px", fontSize: 14, outline: "none" }} />;
}
function Select({ value, onChange, options, compact }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", background: compact ? "transparent" : "rgba(242,237,228,0.04)", color: INK, border: compact ? 0 : "1px solid rgba(242,237,228,0.1)", borderRadius: 8, padding: compact ? "6px 6px" : "10px 12px", fontSize: 14, outline: "none", appearance: "none" }}>
      {options.map(o => <option key={o} value={o} style={{ background: "#14110e" }}>{o}</option>)}
    </select>
  );
}
