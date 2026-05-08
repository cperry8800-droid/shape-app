const SHAPE_RADIO_ROOMS_KEY = "shapeRadioRooms";
const SHAPE_RADIO_ROOMS_ENDPOINT = "/api/radio/rooms";

function readShapeRadioRooms() {
  try {
    return JSON.parse(localStorage.getItem(SHAPE_RADIO_ROOMS_KEY) || "[]");
  } catch (error) {
    return [];
  }
}

function writeShapeRadioRooms(rooms) {
  localStorage.setItem(SHAPE_RADIO_ROOMS_KEY, JSON.stringify(rooms));
}

function radioAudienceLabel(audience) {
  const value = String(audience || "");
  if (value === "clients_only") return "Clients only";
  if (value === "coaches_only") return "Coaches only";
  if (value === "public_shape") return "Public Shape members";
  return "Clients + coaches";
}

async function fetchShapeRadioRooms(role) {
  const params = role ? `?role=${encodeURIComponent(role)}` : "";
  try {
    const response = await fetch(`${SHAPE_RADIO_ROOMS_ENDPOINT}${params}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Could not load radio rooms.");
    }
    const data = await response.json();
    return Array.isArray(data.rooms) ? data.rooms : [];
  } catch (error) {
    const localRooms = readShapeRadioRooms();
    if (localRooms.length) return localRooms.filter((room) => !role || room.role === role);
    throw error;
  }
}

async function createShapeRadioRoom(room) {
  const response = await fetch(SHAPE_RADIO_ROOMS_ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(room),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not save radio room.");
  return data.room;
}

function nextRadioRoomDefaults(role) {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return {
    topic: role === "nutritionist" ? "Fueling Q&A" : "Training Q&A",
    date: tomorrow.toISOString().slice(0, 10),
    time: "19:00",
    audience: "Clients + coaches",
    description: role === "nutritionist"
      ? "Live nutrition room for client questions, templates, and weekly planning."
      : "Live training room for client questions, programming, and weekly planning.",
  };
}

function formatRadioRoomWhen(room) {
  if (room.scheduledAt) {
    const scheduled = new Date(room.scheduledAt);
    if (!Number.isNaN(scheduled.getTime())) {
      return scheduled.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    }
  }
  if (!room.date || !room.time) return "Scheduled";
  const date = new Date(`${room.date}T${room.time}`);
  if (Number.isNaN(date.getTime())) return `${room.date} - ${room.time}`;
  return date.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function RadioRoomScheduler({ open, role, onClose, onSave }) {
  const [draft, setDraft] = React.useState(() => nextRadioRoomDefaults(role));
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setDraft(nextRadioRoomDefaults(role));
      setSaving(false);
      setSaveError("");
    }
  }, [open, role]);

  if (!open) return null;

  const field = {
    width: "100%",
    border: "1px solid rgba(242,237,228,0.16)",
    background: "rgba(10,8,6,0.35)",
    color: INK,
    borderRadius: 12,
    padding: "12px 14px",
    fontFamily: sans,
    fontSize: 13,
    outline: "none",
  };

  function update(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      await onSave({ ...draft, role });
    } catch (error) {
      setSaveError(error.message || "Could not save radio room.");
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "rgba(0,0,0,0.68)",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          background: "#1a1612",
          color: INK,
          border: "1px solid rgba(30,192,168,0.35)",
          borderRadius: 24,
          boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
          padding: 24,
          fontFamily: sans,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em", color: TEAL_BRIGHT, textTransform: "uppercase", marginBottom: 8 }}>Shape Radio</div>
            <div style={{ fontFamily: serif, fontSize: 30, lineHeight: 1, letterSpacing: "-0.02em" }}>Schedule room</div>
            <div style={{ marginTop: 8, color: "rgba(242,237,228,0.62)", fontSize: 13, lineHeight: 1.45 }}>Create a live room for clients and coaches. It will be saved to this dashboard and can open Shape Radio.</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close scheduler" style={{ width: 34, height: 34, borderRadius: 999, border: "1px solid rgba(242,237,228,0.18)", background: "transparent", color: INK, cursor: "pointer" }}>x</button>
        </div>

        <label style={{ display: "grid", gap: 7, marginBottom: 12 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: "rgba(242,237,228,0.5)", textTransform: "uppercase" }}>Room topic</span>
          <input required value={draft.topic} onChange={(event) => update("topic", event.target.value)} style={field} />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <label style={{ display: "grid", gap: 7 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: "rgba(242,237,228,0.5)", textTransform: "uppercase" }}>Date</span>
            <input required type="date" value={draft.date} onChange={(event) => update("date", event.target.value)} style={field} />
          </label>
          <label style={{ display: "grid", gap: 7 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: "rgba(242,237,228,0.5)", textTransform: "uppercase" }}>Time</span>
            <input required type="time" value={draft.time} onChange={(event) => update("time", event.target.value)} style={field} />
          </label>
        </div>

        <label style={{ display: "grid", gap: 7, marginBottom: 12 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: "rgba(242,237,228,0.5)", textTransform: "uppercase" }}>Audience</span>
          <select value={draft.audience} onChange={(event) => update("audience", event.target.value)} style={field}>
            <option>Clients + coaches</option>
            <option>Clients only</option>
            <option>Coaches only</option>
            <option>Public Shape members</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: 7, marginBottom: 18 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: "rgba(242,237,228,0.5)", textTransform: "uppercase" }}>Description</span>
          <textarea rows="4" value={draft.description} onChange={(event) => update("description", event.target.value)} style={{ ...field, resize: "vertical", lineHeight: 1.45 }} />
        </label>
        {saveError ? <div style={{ color: "#ff6b5c", fontSize: 12.5, marginBottom: 12 }}>{saveError}</div> : null}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 10 }}>
          <button type="button" onClick={onClose} disabled={saving} style={{ border: "1px solid rgba(242,237,228,0.22)", background: "transparent", color: INK, borderRadius: 999, padding: "12px 18px", fontFamily: sans, fontSize: 13, cursor: saving ? "default" : "pointer", opacity: saving ? 0.55 : 1 }}>Cancel</button>
          <button type="submit" disabled={saving} style={{ border: 0, background: TEAL_BRIGHT, color: "#08100e", borderRadius: 999, padding: "12px 18px", fontFamily: sans, fontSize: 13, fontWeight: 700, cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving..." : "Save room"}</button>
        </div>
      </form>
    </div>
  );
}

function ScheduledRadioRoomCard({ room }) {
  return (
    <Card style={{ padding: 18, border: "1px solid rgba(30,192,168,0.22)", background: "rgba(30,192,168,0.045)" }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: TEAL_BRIGHT, marginBottom: 8, textTransform: "uppercase" }}>Scheduled room</div>
      <div style={{ fontFamily: serif, fontSize: 20, letterSpacing: "-0.01em", marginBottom: 6 }}>{room.topic}</div>
      <div style={{ fontSize: 12.5, color: "rgba(242,237,228,0.66)", lineHeight: 1.45 }}>{formatRadioRoomWhen(room)} - {radioAudienceLabel(room.audience)}</div>
      {room.description ? <div style={{ marginTop: 10, fontSize: 12.5, color: "rgba(242,237,228,0.58)", lineHeight: 1.45 }}>{room.description}</div> : null}
      <a href="Radio.html" style={{ marginTop: 14, width: "100%", background: PAPER, color: INK, border: 0, padding: "9px 0", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: sans, display: "block", textAlign: "center" }}>Open Radio</a>
    </Card>
  );
}
