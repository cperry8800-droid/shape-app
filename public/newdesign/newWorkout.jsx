// Trainer — Create a new workout. Single-session exercise builder.

const WORKOUT_CLIENTS = [
  { id: 1, name: "Priya Shah",    avatar: "PS", meta: "Strength · 14w" },
  { id: 2, name: "Jonah Wright",  avatar: "JW", meta: "Foundations · 8mo" },
  { id: 3, name: "Ana Perez",     avatar: "AP", meta: "Hypertrophy · 1yr" },
  { id: 4, name: "Marcus Lee",    avatar: "ML", meta: "Powerlifting · 2yr" },
  { id: 5, name: "Sofia Martinez",avatar: "SM", meta: "Return-to-lifting · 4w" },
  { id: 6, name: "Diego Romero",  avatar: "DR", meta: "Hybrid cut · 6w" },
  { id: 7, name: "Amira Khan",    avatar: "AK", meta: "Marathon base · 10w" },
  { id: 8, name: "Tom Becker",    avatar: "TB", meta: "Beginner barbell · new" },
];

function NewWorkoutPage() {
  const [title, setTitle] = React.useState("");
  const [tag, setTag] = React.useState("Strength");
  const [minutes, setMinutes] = React.useState(60);
  const [rpe, setRpe] = React.useState("7-8");
  const [rest, setRest] = React.useState("90s");
  const [notes, setNotes] = React.useState("");
  const [price, setPrice] = React.useState("32");
  const [forSale, setForSale] = React.useState(true);
  const [blocks, setBlocks] = React.useState([
    { label: "A", name: "Back squat", detail: "4 × 5 @ 70%", note: "RPE 7" },
    { label: "B1", name: "", detail: "", note: "" },
  ]);
  const [assignedIds, setAssignedIds] = React.useState([]);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const addBlock = () => {
    const letters = "ABCDEFGHIJ";
    const next = letters[blocks.length] || String.fromCharCode(65 + blocks.length);
    setBlocks([...blocks, { label: next, name: "", detail: "", note: "" }]);
  };
  const setBlock = (i, patch) => setBlocks(blocks.map((b, j) => j === i ? { ...b, ...patch } : b));
  const removeBlock = (i) => setBlocks(blocks.filter((_, j) => j !== i));

  const toggleClient = (id) => setAssignedIds(assignedIds.includes(id) ? assignedIds.filter(x => x !== id) : [...assignedIds, id]);
  const removeClient = (id) => setAssignedIds(assignedIds.filter(x => x !== id));
  const sendToClients = () => {
    if (!assignedIds.length) return alert("Add at least one client first.");
    const names = WORKOUT_CLIENTS.filter(c => assignedIds.includes(c.id)).map(c => c.name.split(" ")[0]).join(", ");
    alert(`Sent to ${assignedIds.length} client${assignedIds.length === 1 ? "" : "s"}: ${names}`);
    window.location.href = "TrainerPrograms.html";
  };

  const tags = ["Strength", "Hypertrophy", "Cardio", "Mobility", "HIIT", "Skill", "Recovery"];

  return (
    <DashPage
      navItems={trainerNavItems("programs")}
      payoutCard={trainerPayoutCard}
      eyebrow={<a href="TrainerPrograms.html" style={{ color: "rgba(242,237,228,0.55)" }}>← PROGRAMS & WORKOUTS</a>}
      title="New workout"
      subtitle="Build a single session. Save to your library, attach to a program, or sell stand-alone."
      actions={<>
        <a href="TrainerPrograms.html" style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>Cancel</a>
        <button onClick={() => alert("Saved to your library.")} style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>Save to library</button>
        <button onClick={sendToClients} style={{ background: "transparent", color: TEAL_BRIGHT, border: `1px solid ${TEAL}`, padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Send to client{assignedIds.length > 1 ? "s" : ""}{assignedIds.length ? ` (${assignedIds.length})` : ""} →</button>
        <button onClick={() => { alert("Workout published."); window.location.href = "TrainerPrograms.html"; }} style={{ background: TEAL, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Publish →</button>
      </>}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 20 }}>
        {/* LEFT — builder */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card>
            <SectionTitle>Basics</SectionTitle>
            <Field label="Workout title">
              <TextInput value={title} onChange={setTitle} placeholder="e.g. Lower push — Week 6" />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
              <Field label="Focus">
                <Select value={tag} onChange={setTag} options={tags} />
              </Field>
              <Field label="Duration">
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <NumInput value={minutes} onChange={setMinutes} min={5} max={240} />
                  <span style={{ fontSize: 13, color: "rgba(242,237,228,0.55)" }}>min</span>
                </div>
              </Field>
              <Field label="Target RPE">
                <TextInput value={rpe} onChange={setRpe} placeholder="7-8" />
              </Field>
              <Field label="Rest">
                <TextInput value={rest} onChange={setRest} placeholder="90s" />
              </Field>
            </div>
          </Card>

          <Card>
            <SectionTitle right={`${blocks.length} BLOCK${blocks.length === 1 ? "" : "S"}`}>Exercises</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 1.2fr 1.4fr 28px", gap: 10, padding: "0 12px 8px", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(242,237,228,0.5)", letterSpacing: "0.08em" }}>
              <span>BLOCK</span>
              <span>EXERCISE</span>
              <span>SETS × REPS</span>
              <span>NOTES / CUES</span>
              <span></span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {blocks.map((b, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "60px 1fr 1.2fr 1.4fr 28px", gap: 10, alignItems: "center", padding: "10px 12px", background: "rgba(242,237,228,0.03)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 8 }}>
                  <input value={b.label} onChange={(e) => setBlock(i, { label: e.target.value })} style={{ background: "transparent", border: 0, color: TEAL, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, padding: 4, width: "100%", outline: "none" }} />
                  <TextInput value={b.name} onChange={(v) => setBlock(i, { name: v })} placeholder="Exercise name" compact />
                  <TextInput value={b.detail} onChange={(v) => setBlock(i, { detail: v })} placeholder="4 × 5 @ 225 lb" compact />
                  <TextInput value={b.note} onChange={(v) => setBlock(i, { note: v })} placeholder="Cue or tempo" compact />
                  <button onClick={() => removeBlock(i)} aria-label="Remove" style={{ background: "transparent", border: 0, color: "rgba(242,237,228,0.5)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
            <button onClick={addBlock} style={{ marginTop: 14, background: "transparent", color: TEAL_BRIGHT, border: "1px dashed rgba(30,192,168,0.35)", padding: "10px 14px", borderRadius: 8, fontFamily: sans, fontSize: 13, cursor: "pointer", width: "100%" }}>+ Add block</button>
          </Card>

          <Card>
            <SectionTitle>Coach notes (optional)</SectionTitle>
            <TextArea value={notes} onChange={setNotes} rows={4} placeholder="Warm-up guidance, progression rules, when to deload, etc." />
          </Card>
        </div>

        {/* RIGHT — pricing + preview */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card>
            <SectionTitle>Sell stand-alone</SectionTitle>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 14 }}>
              <input type="checkbox" checked={forSale} onChange={(e) => setForSale(e.target.checked)} style={{ accentColor: TEAL, width: 16, height: 16 }} />
              <span style={{ fontSize: 13 }}>List this workout for one-time purchase</span>
            </label>
            {forSale && (
              <Field label="Price">
                <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 8, padding: "0 12px" }}>
                  <span style={{ color: "rgba(242,237,228,0.55)" }}>$</span>
                  <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} style={{ flex: 1, background: "transparent", border: 0, color: INK, fontSize: 14, padding: "10px 0", outline: "none" }} />
                </div>
              </Field>
            )}
            <div style={{ fontSize: 12, color: "rgba(242,237,228,0.55)", lineHeight: 1.5 }}>
              {forSale
                ? <>Shape keeps 8%. You receive <span style={{ color: INK, fontWeight: 500 }}>${price ? (Number(price) * 0.92).toFixed(2) : "—"}</span> per sale.</>
                : "Workout lives in your library only. Attach it to a program or assign directly to a client."}
            </div>
          </Card>

          <Card>
            <SectionTitle right={assignedIds.length ? `${assignedIds.length} ASSIGNED` : null}>Assigned clients</SectionTitle>
            {assignedIds.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "rgba(242,237,228,0.55)", lineHeight: 1.5, marginBottom: 14 }}>
                Pick clients to push this workout to directly. It lands in their next-up list the moment you hit send.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                {WORKOUT_CLIENTS.filter(c => assignedIds.includes(c.id)).map(c => (
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
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, padding: "5px 10px", background: "rgba(30,192,168,0.1)", color: TEAL, borderRadius: 4, letterSpacing: "0.06em", textTransform: "uppercase", display: "inline-block" }}>
                {tag} · {minutes} min
              </div>
              <div style={{ fontFamily: serif, fontSize: 22, marginTop: 12, letterSpacing: "-0.01em" }}>{title || "Untitled workout"}</div>
              <div style={{ fontSize: 12, color: "rgba(242,237,228,0.55)", marginTop: 4 }}>RPE {rpe} · {rest} rest</div>
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                {blocks.filter(b => b.name).map((b, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "30px 1fr auto", gap: 10, fontSize: 12.5, padding: "6px 0", borderTop: i ? "1px solid rgba(242,237,228,0.06)" : 0 }}>
                    <span style={{ color: TEAL, fontFamily: "'JetBrains Mono', monospace" }}>{b.label}</span>
                    <span style={{ color: INK }}>{b.name}</span>
                    <span style={{ color: "rgba(242,237,228,0.7)" }}>{b.detail}</span>
                  </div>
                ))}
                {blocks.filter(b => b.name).length === 0 && (
                  <div style={{ fontSize: 12, color: "rgba(242,237,228,0.45)", fontStyle: "italic" }}>Add exercise blocks to see them here.</div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
      {pickerOpen && (
        <ClientPicker clients={WORKOUT_CLIENTS} selectedIds={assignedIds} onToggle={toggleClient} onClose={() => setPickerOpen(false)} />
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
function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", background: "rgba(242,237,228,0.04)", color: INK, border: "1px solid rgba(242,237,228,0.1)", borderRadius: 8, padding: "10px 12px", fontSize: 14, outline: "none", appearance: "none" }}>
      {options.map(o => <option key={o} value={o} style={{ background: "#14110e" }}>{o}</option>)}
    </select>
  );
}
