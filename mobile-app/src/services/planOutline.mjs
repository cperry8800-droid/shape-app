// Plan-outline parsers — shared by the coach Assign flow (iosAppBroadsheetPros)
// and the client Start-this-plan flow (a purchased plan → self-authored rows).
// Coach plans (coach_plans) store free-text outline blocks; these map them onto
// the shapes the client app consumes — client_workouts exercises (Train deck)
// and client_meal_plans days (Eat menu). Extracted verbatim so both callers
// share one implementation.

export const BS_ASSIGN_DOW = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function bsAssignSplitBlock(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  const m = s.match(/^(.*?)\s*[—–:]\s*(.+)$/);
  return { head: (m ? m[1] : s).trim(), tail: m ? m[2].trim() : '' };
}

// "Secondary compound · 4×8" / "Back squat — 4 × 6 · RPE 8" → exercise row.
export function bsAssignExercise(text) {
  const p = bsAssignSplitBlock(text);
  if (!p) return null;
  let { head, tail } = p;
  if (!tail) {
    const dot = head.split(/\s*·\s*/);
    if (dot.length > 1 && /\d/.test(dot.slice(1).join(''))) { head = dot[0].trim(); tail = dot.slice(1).join(' · '); }
  }
  const sx = tail.match(/(\d+)\s*[×x]\s*([\d–-]+)/);
  return {
    name: head,
    sets: sx ? sx[1] : '',
    reps: sx ? sx[2] : '',
    rest: '',
    load: sx ? tail.replace(sx[0], '').replace(/^[\s·,]+|[\s·,]+$/g, '') : tail,
  };
}

// "Mon — Upper (push)" → { dow: 0, title, rest }; null when not a weekday line.
export function bsAssignDayLine(text) {
  const p = bsAssignSplitBlock(text);
  if (!p) return null;
  const dow = BS_ASSIGN_DOW.indexOf(p.head.slice(0, 3).toLowerCase());
  if (dow < 0) return null;
  return { dow, title: p.tail || p.head, rest: /rest/i.test(p.tail || p.head) };
}

// "Breakfast — Greek yogurt bowl · 420 kcal" → meal-plan meal entry.
export function bsAssignMeal(text) {
  const p = bsAssignSplitBlock(text);
  if (!p) return null;
  const lower = p.head.toLowerCase();
  const slot = ['breakfast', 'lunch', 'dinner', 'snack'].find(w => lower.startsWith(w));
  const kcal = ((p.tail || p.head).match(/(\d{2,4})\s*kcal/i) || [])[1];
  return { slot: (slot || 'meal').toUpperCase(), title: p.tail || p.head, kcal: kcal ? Number(kcal) : 0 };
}

export function bsAssignIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Materialize a purchased plan's outline into self-authored client_workouts
// insert-payloads. Mirrors BSProAssignPage.apply's split-vs-exercise branch,
// but returns payloads (stamped payload.program:{id:'plan:'+planId, …}) instead
// of writing — the client's Start-this-plan flow inserts them as self rows.
//
//   plan     — { id, name, detail:{ blocks:[{text}|string], note } }
//   startISO — 'YYYY-MM-DD' the block begins on
//   weeks    — how many weeks to repeat
//   runId    — the materialization run stamp (for atomic re-start)
export function bsMaterializeOutline({ plan, startISO, weeks = 4, runId }) {
  if (!plan) return [];
  const id = `plan:${plan.id}`;
  const name = plan.name || 'Plan';
  const [sy, sm, sd] = String(startISO).split('-').map(Number);
  const start = new Date(sy, (sm || 1) - 1, sd || 1); // local midnight
  const monday = new Date(start); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const planNote = (plan.detail && plan.detail.note) || '';
  const blocks = (plan.detail && Array.isArray(plan.detail.blocks) ? plan.detail.blocks : [])
    .map(b => (b && b.text != null) ? b.text : b).map(s => String(s || '').trim()).filter(Boolean);
  const dayLines = blocks.map(bsAssignDayLine);
  const isSplit = dayLines.filter(Boolean).length >= 3;
  const nWeeks = Math.max(1, Math.min(26, Math.round(Number(weeks) || 1)));
  const rows = [];
  const stamp = (week, day) => ({ id, name, week, day, weeks: nWeeks, runId: runId || '' });

  if (isSplit) {
    for (let w = 0; w < nWeeks; w++) {
      for (const dl of dayLines) {
        if (!dl || dl.rest) continue;
        const d = new Date(monday); d.setDate(d.getDate() + w * 7 + dl.dow);
        if (d < start) continue;
        rows.push({
          title: dl.title,
          description: planNote || name,
          scheduledDate: bsAssignIso(d),
          payload: { exercises: [], program: stamp(w + 1, dl.dow) },
        });
      }
    }
  } else {
    const exercises = blocks.map(bsAssignExercise).filter(Boolean)
      .map(e => ({ name: e.name, sets: e.sets, reps: e.reps, load: e.load, seg: '' }));
    for (let w = 0; w < nWeeks; w++) {
      const d = new Date(start); d.setDate(d.getDate() + w * 7);
      const dow = (d.getDay() + 6) % 7;
      rows.push({
        title: name,
        description: planNote,
        scheduledDate: bsAssignIso(d),
        payload: { exercises, program: stamp(w + 1, dow) },
      });
    }
  }
  return rows;
}
