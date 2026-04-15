// ===== Progress Tracker & Schedule =====

// Demo data for a new user — simulates a month of workouts
// Generate demo dates relative to today so data always looks fresh
const _today = new Date();
function _demoDate(daysAgo) {
  const d = new Date(_today);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

const demoWorkoutLog = [
  { name: "Living Room HIIT", type: "HIIT", trainer: "Nina Brooks", duration: 25, difficulty: "Easy", date: _demoDate(0), notes: "Morning session" },
  { name: "Tabata Inferno", type: "HIIT", trainer: "Sophie Turner", duration: 35, difficulty: "Hard", date: _demoDate(1), notes: "Pushed hard" },
  { name: "Upper Body Blast", type: "Strength", trainer: "Marcus Johnson", duration: 45, difficulty: "Hard", date: _demoDate(2), notes: "Increased weight on bench" },
  { name: "Band & Bodyweight Burn", type: "Resistance", trainer: "Nina Brooks", duration: 30, difficulty: "Moderate", date: _demoDate(3), notes: "" },
  { name: "HIIT Burn", type: "Cardio", trainer: "Damon Clarke", duration: 25, difficulty: "Moderate", date: _demoDate(4), notes: "Fun session" },
  { name: "Full Body Burn", type: "Cardio", trainer: "Damon Clarke", duration: 40, difficulty: "Hard", date: _demoDate(6), notes: "" },
  { name: "Living Room HIIT", type: "HIIT", trainer: "Nina Brooks", duration: 25, difficulty: "Easy", date: _demoDate(8), notes: "Great at-home session" },
  { name: "20-Min Torch", type: "HIIT", trainer: "Damon Clarke", duration: 20, difficulty: "Moderate", date: _demoDate(9), notes: "Quick morning session" },
  { name: "5x5 Foundation", type: "Strength", trainer: "Marcus Johnson", duration: 55, difficulty: "Hard", date: _demoDate(10), notes: "Felt strong on squats" },
];

const demoSchedule = {
  [_demoDate(4)]: { name: "HIIT Burn", type: "Cardio", trainer: "Damon Clarke", time: "7:00 AM" },
  [_demoDate(3)]: { name: "Band & Bodyweight Burn", type: "Resistance", trainer: "Nina Brooks", time: "6:30 AM" },
  [_demoDate(2)]: { name: "Upper Body Blast", type: "Strength", trainer: "Marcus Johnson", time: "7:00 AM" },
  [_demoDate(1)]: { name: "Tabata Inferno", type: "HIIT", trainer: "Sophie Turner", time: "6:00 AM" },
  [_demoDate(0)]: { name: "Living Room HIIT", type: "HIIT", trainer: "Nina Brooks", time: "8:00 AM" },
  [_demoDate(-1)]: { name: "Rest Day", type: "Rest Day", trainer: "", time: "" },
  [_demoDate(-2)]: { name: "Leg Day Legends", type: "Strength", trainer: "Marcus Johnson", time: "7:00 AM" },
};

// Load from localStorage or use demo data
function getWorkoutLog() {
  const stored = localStorage.getItem('shapeWorkoutLog');
  return stored ? JSON.parse(stored) : demoWorkoutLog;
}

function saveWorkoutLog(log) {
  localStorage.setItem('shapeWorkoutLog', JSON.stringify(log));
}

function getSchedule() {
  const stored = localStorage.getItem('shapeSchedule');
  return stored ? JSON.parse(stored) : demoSchedule;
}

function saveSchedule(schedule) {
  localStorage.setItem('shapeSchedule', JSON.stringify(schedule));
}

// ===== Stats =====
function updateStats() {
  const log = getWorkoutLog();
  const now = new Date();
  const thisMonth = log.filter(w => {
    const d = new Date(w.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const totalWorkouts = thisMonth.length;
  const totalMinutes = thisMonth.reduce((sum, w) => sum + (w.duration || 0), 0);
  const estCalories = Math.round(totalMinutes * 8.5);

  // Build sorted unique date set
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dateSet = new Set(log.map(w => new Date(w.date + 'T00:00:00').getTime()));
  const uniqueDates = [...dateSet].sort((a, b) => b - a);

  // Current streak
  let streak = 0;
  for (let i = 0; i < uniqueDates.length; i++) {
    const expected = new Date(today);
    expected.setDate(expected.getDate() - i);
    expected.setHours(0, 0, 0, 0);
    if (uniqueDates[i] === expected.getTime()) {
      streak++;
    } else {
      break;
    }
  }

  // Best streak (all-time)
  const allSorted = [...uniqueDates].sort((a, b) => a - b);
  let best = 0, run = 0;
  for (let i = 0; i < allSorted.length; i++) {
    if (i === 0) { run = 1; }
    else {
      const diff = (allSorted[i] - allSorted[i - 1]) / (1000 * 60 * 60 * 24);
      run = diff === 1 ? run + 1 : 1;
    }
    if (run > best) best = run;
  }

  document.getElementById('statWorkouts').textContent = totalWorkouts;
  document.getElementById('statMinutes').textContent = totalMinutes;
  document.getElementById('statStreak').textContent = streak;
  document.getElementById('statCalories').textContent = estCalories.toLocaleString();

  // Streak card styling
  const card = document.getElementById('streakCard');
  if (streak >= 3) card.classList.add('on-fire');
  else card.classList.remove('on-fire');

  // Best streak sub-label
  const bestEl = document.getElementById('statBestStreak');
  if (bestEl) bestEl.textContent = best > 0 ? `Best: ${best} days` : '';

  // 7-day activity strip
  renderStreakStrip(dateSet);
}

function renderStreakStrip(dateSet) {
  const container = document.getElementById('streakDots');
  if (!container) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dots = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const ts = d.getTime();
    const dayLabel = dayNames[d.getDay()];
    const isToday = i === 0;
    const isFuture = i < 0;
    const done = dateSet.has(ts);

    let cls, icon;
    if (isToday && done)      { cls = 'today'; icon = '✓'; }
    else if (isToday)         { cls = 'today'; icon = d.getDate(); }
    else if (done)            { cls = 'done'; icon = '✓'; }
    else if (isFuture)        { cls = 'future'; icon = '·'; }
    else                      { cls = 'missed'; icon = '·'; }

    dots.push(`
      <div class="streak-dot">
        <div class="streak-dot-circle ${cls}">${icon}</div>
        <div class="streak-dot-day">${dayLabel}</div>
      </div>
    `);
  }

  container.innerHTML = dots.join('');
}

// ===== Weekly Schedule =====
let currentWeekOffset = 0;

function getWeekDates(offset) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + (offset * 7));
  monday.setHours(0, 0, 0, 0);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  return days;
}

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

function renderSchedule() {
  const days = getWeekDates(currentWeekOffset);
  const schedule = getSchedule();
  const log = getWorkoutLog();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Update week label
  const startStr = `${monthNames[days[0].getMonth()]} ${days[0].getDate()}`;
  const endStr = `${monthNames[days[6].getMonth()]} ${days[6].getDate()}`;
  document.getElementById('weekLabel').textContent = `${startStr} — ${endStr}`;

  const grid = document.getElementById('scheduleGrid');
  grid.innerHTML = days.map((d, i) => {
    const dateStr = formatDate(d);
    const scheduled = schedule[dateStr];
    const completed = log.some(w => w.date === dateStr);
    const isToday = d.getTime() === today.getTime();
    const isPast = d < today;

    let statusClass = '';
    let statusIcon = '';
    if (completed) { statusClass = 'completed'; statusIcon = '&#10003;'; }
    else if (scheduled && isPast) { statusClass = 'missed'; statusIcon = '&#10007;'; }
    else if (scheduled) { statusClass = 'scheduled'; statusIcon = ''; }

    return `
      <div class="schedule-day ${isToday ? 'today' : ''} ${statusClass}" onclick="openScheduleModal('${dateStr}')">
        <div class="schedule-day-header">
          <span class="schedule-day-name">${dayNames[i]}</span>
          <span class="schedule-day-date">${d.getDate()}</span>
        </div>
        ${scheduled ? `
          <div class="schedule-day-workout">
            <div class="schedule-workout-name">${scheduled.name}</div>
            ${scheduled.trainer ? `<div class="schedule-workout-trainer">${scheduled.trainer}</div>` : ''}
            <div class="schedule-workout-meta">${scheduled.type}${scheduled.time ? ' &middot; ' + scheduled.time : ''}</div>
          </div>
        ` : `
          <div class="schedule-day-empty">
            <span>+ Add</span>
          </div>
        `}
        ${statusIcon ? `<div class="schedule-status-icon">${statusIcon}</div>` : ''}
      </div>
    `;
  }).join('');
}

function changeWeek(dir) {
  currentWeekOffset += dir;
  renderSchedule();
}

// ===== Progress Chart =====
function renderProgressChart() {
  const log = getWorkoutLog();
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  // Group by week
  const weeks = [];
  for (let w = 0; w < Math.ceil(daysInMonth / 7); w++) {
    const start = w * 7 + 1;
    const end = Math.min(start + 6, daysInMonth);
    const weekWorkouts = log.filter(entry => {
      const d = new Date(entry.date);
      if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false;
      return d.getDate() >= start && d.getDate() <= end;
    });
    weeks.push({ label: `Week ${w + 1}`, count: weekWorkouts.length, minutes: weekWorkouts.reduce((s, e) => s + (e.duration || 0), 0) });
  }

  const maxMin = Math.max(...weeks.map(w => w.minutes), 1);
  const chart = document.getElementById('progressChart');
  chart.innerHTML = weeks.map(w => `
    <div class="chart-row">
      <div class="chart-label">${w.label}</div>
      <div class="chart-bar-container">
        <div class="chart-bar" style="width: ${(w.minutes / maxMin) * 100}%;"></div>
      </div>
      <div class="chart-value">${w.count} workouts &middot; ${w.minutes} min</div>
    </div>
  `).join('');
}

// ===== Workout Log =====
function renderWorkoutLog() {
  const log = getWorkoutLog().sort((a, b) => new Date(b.date) - new Date(a.date));
  const list = document.getElementById('workoutLog');

  if (log.length === 0) {
    list.innerHTML = '<div class="empty-state">No workouts logged yet. Start by logging your first workout!</div>';
    return;
  }

  list.innerHTML = log.map(w => {
    const d = new Date(w.date + 'T00:00:00');
    const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const diffColor = { 'Easy': '#10B981', 'Moderate': '#F59E0B', 'Hard': '#EF4444', 'Intense': '#DC2626' }[w.difficulty] || '#888';
    return `
      <div class="log-entry">
        <div class="log-entry-date">${dateStr}</div>
        <div class="log-entry-info">
          <h4>${w.name}</h4>
          ${w.trainer ? `<div class="log-entry-trainer">by ${w.trainer}</div>` : ''}
          <div class="log-entry-meta">
            <span class="workout-tag">${w.type}</span>
            <span>${w.duration} min</span>
            <span style="color:${diffColor};font-weight:500;">${w.difficulty}</span>
          </div>
          ${w.notes ? `<p class="log-entry-notes">${w.notes}</p>` : ''}
        </div>
        <button class="log-delete" onclick="deleteLogEntry('${w.date}', '${w.name}')" title="Remove">&times;</button>
      </div>
    `;
  }).join('');
}

function deleteLogEntry(date, name) {
  let log = getWorkoutLog();
  log = log.filter(w => !(w.date === date && w.name === name));
  saveWorkoutLog(log);
  renderAll();
  showToast('Workout removed');
}

// ===== Purchased Plans =====
function renderPurchasedPlans() {
  const purchased = JSON.parse(localStorage.getItem('shapePurchasedWorkouts') || '[]');
  const list = document.getElementById('purchasedList');

  if (purchased.length === 0) {
    list.innerHTML = '<div class="empty-state">No purchased plans yet. <a href="trainers.html" style="color:var(--accent-dark);">Browse trainer workouts</a> to buy individual plans.</div>';
    return;
  }

  list.innerHTML = purchased.map(p => {
    const d = new Date(p.purchasedAt);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `
      <div class="purchased-item">
        <div class="purchased-item-info">
          <h4>${p.name}</h4>
          <span class="purchased-item-date">Purchased ${dateStr}</span>
        </div>
        <div class="purchased-item-price">$${p.price.toFixed(2)}</div>
      </div>
    `;
  }).join('');
}

// ===== Modals =====
let schedulingDate = '';

function openLogWorkoutModal() {
  document.getElementById('logName').value = '';
  document.getElementById('logDuration').value = '';
  document.getElementById('logNotes').value = '';
  document.getElementById('logWorkoutModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function saveLoggedWorkout() {
  const name = document.getElementById('logName').value.trim();
  const type = document.getElementById('logType').value;
  const duration = parseInt(document.getElementById('logDuration').value) || 0;
  const difficulty = document.getElementById('logDifficulty').value;
  const notes = document.getElementById('logNotes').value.trim();

  if (!name || !duration) {
    showToast('Please enter a workout name and duration');
    return;
  }

  const log = getWorkoutLog();
  log.push({
    name, type, duration, difficulty, notes,
    date: new Date().toISOString().split('T')[0]
  });
  saveWorkoutLog(log);
  closeAllModals();
  renderAll();
  showToast('Workout logged!');
}

function openScheduleModal(dateStr) {
  schedulingDate = dateStr;
  const d = new Date(dateStr + 'T00:00:00');
  document.getElementById('scheduleDayLabel').textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  document.getElementById('scheduleName').value = '';
  document.getElementById('scheduleTime').value = '';
  document.getElementById('scheduleWorkoutModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function saveScheduledWorkout() {
  const name = document.getElementById('scheduleName').value.trim();
  const type = document.getElementById('scheduleType').value;
  const time = document.getElementById('scheduleTime').value.trim();

  if (!name) {
    showToast('Please enter a workout name');
    return;
  }

  const schedule = getSchedule();
  schedule[schedulingDate] = { name, type, time };
  saveSchedule(schedule);
  closeAllModals();
  renderAll();
  showToast('Workout scheduled!');
}

// ===== Render All =====
function renderAll() {
  updateStats();
  renderSchedule();
  renderProgressChart();
  renderWorkoutLog();
  renderPurchasedPlans();
}

// Init
renderAll();
