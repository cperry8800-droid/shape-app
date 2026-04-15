// ===== Nutrition Schedule & Tracker =====

// Generate demo dates relative to today
const _nToday = new Date();
function _nDate(daysAgo) {
  const d = new Date(_nToday);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

// Demo meal log data
const demoMealLog = [
  { name: "Overnight Oats", type: "Breakfast", calories: 380, protein: 14, carbs: 58, fat: 12, date: _nDate(0), notes: "With berries" },
  { name: "Grilled Chicken & Quinoa", type: "Lunch", calories: 560, protein: 46, carbs: 48, fat: 16, date: _nDate(0), notes: "" },
  { name: "Protein Shake", type: "Post-Workout", calories: 210, protein: 30, carbs: 15, fat: 5, date: _nDate(0), notes: "After training" },
  { name: "Smoothie Bowl", type: "Breakfast", calories: 340, protein: 18, carbs: 52, fat: 8, date: _nDate(1), notes: "Acai base" },
  { name: "Grilled Chicken & Rice", type: "Lunch", calories: 540, protein: 44, carbs: 50, fat: 14, date: _nDate(1), notes: "" },
  { name: "Protein Shake", type: "Post-Workout", calories: 210, protein: 30, carbs: 15, fat: 5, date: _nDate(1), notes: "After Tabata" },
  { name: "Greek Yogurt & Berries", type: "Breakfast", calories: 280, protein: 20, carbs: 35, fat: 8, date: _nDate(2), notes: "Added honey" },
  { name: "Grilled Chicken Salad", type: "Lunch", calories: 520, protein: 42, carbs: 28, fat: 22, date: _nDate(2), notes: "" },
  { name: "Protein Shake", type: "Post-Workout", calories: 210, protein: 30, carbs: 15, fat: 5, date: _nDate(2), notes: "With banana" },
  { name: "Salmon & Quinoa Bowl", type: "Dinner", calories: 620, protein: 38, carbs: 52, fat: 24, date: _nDate(3), notes: "Great recovery meal" },
  { name: "Overnight Oats", type: "Breakfast", calories: 380, protein: 14, carbs: 58, fat: 12, date: _nDate(3), notes: "" },
  { name: "Turkey Wrap", type: "Lunch", calories: 450, protein: 32, carbs: 40, fat: 16, date: _nDate(3), notes: "" },
  { name: "Almonds & Apple", type: "Snack", calories: 220, protein: 6, carbs: 25, fat: 14, date: _nDate(3), notes: "" },
  { name: "Egg White Omelette", type: "Breakfast", calories: 310, protein: 28, carbs: 12, fat: 16, date: _nDate(4), notes: "With spinach and mushrooms" },
  { name: "Grilled Steak & Sweet Potato", type: "Dinner", calories: 680, protein: 45, carbs: 48, fat: 28, date: _nDate(4), notes: "" },
  { name: "Chicken Stir-Fry", type: "Lunch", calories: 490, protein: 36, carbs: 42, fat: 18, date: _nDate(4), notes: "" },
  { name: "Smoothie Bowl", type: "Breakfast", calories: 340, protein: 18, carbs: 52, fat: 8, date: _nDate(5), notes: "Acai base" },
  { name: "Tuna Poke Bowl", type: "Lunch", calories: 510, protein: 38, carbs: 48, fat: 18, date: _nDate(5), notes: "" },
  { name: "Cottage Cheese & Fruit", type: "Snack", calories: 180, protein: 22, carbs: 18, fat: 4, date: _nDate(6), notes: "" },
  { name: "Pasta Bolognese", type: "Dinner", calories: 580, protein: 30, carbs: 68, fat: 18, date: _nDate(6), notes: "Lean beef" },
];

// Demo meal schedule
const demoMealSchedule = {
  [_nDate(4)]: [
    { name: "Egg White Omelette", type: "Breakfast", calories: 310 },
    { name: "Chicken Stir-Fry", type: "Lunch", calories: 490 },
    { name: "Grilled Steak & Sweet Potato", type: "Dinner", calories: 680 },
  ],
  [_nDate(3)]: [
    { name: "Overnight Oats", type: "Breakfast", calories: 380 },
    { name: "Turkey Wrap", type: "Lunch", calories: 450 },
    { name: "Salmon & Quinoa Bowl", type: "Dinner", calories: 620 },
  ],
  [_nDate(2)]: [
    { name: "Greek Yogurt & Berries", type: "Breakfast", calories: 280 },
    { name: "Grilled Chicken Salad", type: "Lunch", calories: 520 },
    { name: "Lean Beef Tacos", type: "Dinner", calories: 560 },
  ],
  [_nDate(1)]: [
    { name: "Smoothie Bowl", type: "Breakfast", calories: 340 },
    { name: "Tuna Poke Bowl", type: "Lunch", calories: 510 },
    { name: "Baked Chicken Thighs", type: "Dinner", calories: 580 },
  ],
  [_nDate(0)]: [
    { name: "Avocado Toast & Eggs", type: "Breakfast", calories: 420 },
    { name: "Shrimp Caesar Salad", type: "Lunch", calories: 460 },
    { name: "Salmon with Asparagus", type: "Dinner", calories: 540 },
  ],
  [_nDate(-1)]: [
    { name: "Protein Pancakes", type: "Breakfast", calories: 360 },
    { name: "Mediterranean Bowl", type: "Lunch", calories: 480 },
    { name: "Grilled Chicken & Veggies", type: "Dinner", calories: 500 },
  ],
  [_nDate(-2)]: [
    { name: "Overnight Oats", type: "Breakfast", calories: 380 },
    { name: "Turkey & Avocado Wrap", type: "Lunch", calories: 470 },
    { name: "Stir-Fry Tofu & Rice", type: "Dinner", calories: 520 },
  ],
};

// Macro goals
const macroGoals = { calories: 2200, protein: 160, carbs: 250, fat: 70 };

// localStorage helpers
function getMealLog() {
  const stored = localStorage.getItem('shapeMealLog');
  return stored ? JSON.parse(stored) : demoMealLog;
}

function saveMealLog(log) {
  localStorage.setItem('shapeMealLog', JSON.stringify(log));
}

function getMealSchedule() {
  const stored = localStorage.getItem('shapeMealSchedule');
  return stored ? JSON.parse(stored) : demoMealSchedule;
}

function saveMealSchedule(schedule) {
  localStorage.setItem('shapeMealSchedule', JSON.stringify(schedule));
}

function getWaterCount() {
  const stored = localStorage.getItem('shapeWaterToday');
  if (stored) {
    const data = JSON.parse(stored);
    const today = new Date().toISOString().split('T')[0];
    if (data.date === today) return data.count;
  }
  return 5; // Demo default
}

function saveWaterCount(count) {
  const today = new Date().toISOString().split('T')[0];
  localStorage.setItem('shapeWaterToday', JSON.stringify({ date: today, count }));
}

// ===== Macro Summary =====
function updateMacros() {
  const log = getMealLog();
  const today = new Date().toISOString().split('T')[0];
  const todayMeals = log.filter(m => m.date === today);

  const totals = todayMeals.reduce((acc, m) => {
    acc.calories += m.calories || 0;
    acc.protein += m.protein || 0;
    acc.carbs += m.carbs || 0;
    acc.fat += m.fat || 0;
    return acc;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

  document.getElementById('macroCalories').textContent = totals.calories.toLocaleString();
  document.getElementById('macroProtein').textContent = totals.protein + 'g';
  document.getElementById('macroCarbs').textContent = totals.carbs + 'g';
  document.getElementById('macroFat').textContent = totals.fat + 'g';

  document.getElementById('barCalories').style.width = Math.min((totals.calories / macroGoals.calories) * 100, 100) + '%';
  document.getElementById('barProtein').style.width = Math.min((totals.protein / macroGoals.protein) * 100, 100) + '%';
  document.getElementById('barCarbs').style.width = Math.min((totals.carbs / macroGoals.carbs) * 100, 100) + '%';
  document.getElementById('barFat').style.width = Math.min((totals.fat / macroGoals.fat) * 100, 100) + '%';
}

// ===== Water Tracker =====
function renderWater() {
  const count = getWaterCount();
  document.getElementById('waterCount').textContent = count;
  const container = document.getElementById('waterGlasses');
  container.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const glass = document.createElement('div');
    glass.className = 'water-glass' + (i < count ? ' filled' : '');
    glass.onclick = () => toggleWater(i);
    container.appendChild(glass);
  }
}

function toggleWater(index) {
  const current = getWaterCount();
  const newCount = (index + 1 === current) ? index : index + 1;
  saveWaterCount(newCount);
  renderWater();
}

// ===== Meal Schedule =====
let mealWeekOffset = 0;

function getMealWeekDates(offset) {
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

function formatDateStr(d) {
  return d.toISOString().split('T')[0];
}

function renderMealSchedule() {
  const days = getMealWeekDates(mealWeekOffset);
  const schedule = getMealSchedule();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const startStr = `${monthNames[days[0].getMonth()]} ${days[0].getDate()}`;
  const endStr = `${monthNames[days[6].getMonth()]} ${days[6].getDate()}`;
  document.getElementById('mealWeekLabel').textContent = `${startStr} — ${endStr}`;

  const grid = document.getElementById('mealDayGrid');
  grid.innerHTML = days.map((d, i) => {
    const dateStr = formatDateStr(d);
    const meals = schedule[dateStr] || [];
    const isToday = d.getTime() === today.getTime();

    const dayTotal = meals.reduce((sum, m) => sum + (m.calories || 0), 0);
    const goalPct = Math.min(Math.round((dayTotal / macroGoals.calories) * 100), 100);
    const totalColor = dayTotal === 0 ? 'var(--text-muted)' : dayTotal > macroGoals.calories ? '#EF4444' : '#10B981';

    return `
      <div class="meal-day ${isToday ? 'today' : ''}" onclick="openScheduleMealModal('${dateStr}')">
        <div class="meal-day-header">
          <span class="meal-day-name">${dayNames[i]}</span>
          <span class="meal-day-date">${d.getDate()}</span>
        </div>
        ${meals.length > 0 ? meals.map(m => `
          <div class="meal-entry">
            <div class="meal-entry-type">${m.type}</div>
            <div class="meal-entry-name">${m.name}</div>
            <div class="meal-entry-cal">${m.calories} cal</div>
          </div>
        `).join('') : `
          <div class="meal-day-empty">No meals planned</div>
        `}
        ${dayTotal > 0 ? `
          <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);">
            <div style="font-size:0.75rem;font-weight:600;color:${totalColor};">${dayTotal.toLocaleString()} cal</div>
            <div style="height:3px;background:var(--border);margin-top:4px;border-radius:2px;">
              <div style="height:100%;width:${goalPct}%;background:${totalColor};border-radius:2px;transition:width 0.4s;"></div>
            </div>
            <div style="font-size:0.62rem;color:var(--text-muted);margin-top:3px;">${goalPct}% of goal</div>
          </div>
        ` : ''}
        <div class="meal-day-add">+ Add meal</div>
      </div>
    `;
  }).join('');
}

function changeMealWeek(dir) {
  mealWeekOffset += dir;
  renderMealSchedule();
}

// ===== Weekly Calorie Chart =====
function renderWeeklyCalChart() {
  const schedule = getMealSchedule();
  const log = getMealLog();
  const chart = document.getElementById('weeklyCalChart');
  if (!chart) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];

    // Sum from schedule
    const scheduledCals = (schedule[dateStr] || []).reduce((s, m) => s + (m.calories || 0), 0);
    // Sum from logged meals
    const loggedCals = log.filter(m => m.date === dateStr).reduce((s, m) => s + (m.calories || 0), 0);
    const cals = loggedCals || scheduledCals;

    days.push({ label: dayNames[i], date: d.getDate(), cals, isToday: d.getTime() === today.getTime() });
  }

  const maxCals = Math.max(...days.map(d => d.cals), macroGoals.calories);

  chart.innerHTML = days.map(d => {
    const pct = d.cals > 0 ? Math.min((d.cals / maxCals) * 100, 100) : 0;
    const overGoal = d.cals > macroGoals.calories;
    const barColor = d.cals === 0 ? 'var(--border)' : overGoal ? '#EF4444' : '#10B981';
    const goalLine = Math.min((macroGoals.calories / maxCals) * 100, 100);
    return `
      <div class="chart-row" style="position:relative;">
        <div class="chart-label" style="${d.isToday ? 'color:var(--accent-dark);font-weight:600;' : ''}">${d.label} ${d.date}</div>
        <div class="chart-bar-container" style="position:relative;">
          <div class="chart-bar" style="width:${pct}%;background:${barColor};"></div>
          <div style="position:absolute;top:0;bottom:0;left:${goalLine}%;width:1px;background:rgba(255,255,255,0.15);pointer-events:none;"></div>
        </div>
        <div class="chart-value">${d.cals > 0 ? d.cals.toLocaleString() + ' cal' : '—'}</div>
      </div>
    `;
  }).join('') + `<div style="font-size:0.68rem;color:var(--text-muted);margin-top:8px;text-align:right;">Goal: ${macroGoals.calories.toLocaleString()} cal/day</div>`;
}

// ===== Meal Log =====
function renderMealLog() {
  const log = getMealLog().sort((a, b) => new Date(b.date) - new Date(a.date));
  const list = document.getElementById('mealLogList');

  if (log.length === 0) {
    list.innerHTML = '<div class="empty-state">No meals logged yet. Start by logging your first meal!</div>';
    return;
  }

  list.innerHTML = log.slice(0, 15).map(m => {
    const d = new Date(m.date + 'T00:00:00');
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `
      <div class="cl-meal-row">
        <div class="cl-meal-date">${dateStr}</div>
        <div class="cl-meal-name">${m.name}</div>
        <div class="cl-meal-meta">
          <span>${m.calories} cal</span>
          <span class="cl-meal-type">${m.type}</span>
          <span>${m.protein || 0}P / ${m.carbs || 0}C / ${m.fat || 0}F</span>
        </div>
        <button class="meal-log-delete" onclick="deleteMealEntry('${m.date}', '${m.name}')" title="Remove">&times;</button>
      </div>
    `;
  }).join('');
}

function deleteMealEntry(date, name) {
  let log = getMealLog();
  log = log.filter(m => !(m.date === date && m.name === name));
  saveMealLog(log);
  renderAll();
  showToast('Meal removed');
}

// ===== Appointments =====
function renderAppointments() {
  const consultations = JSON.parse(localStorage.getItem('shapeConsultations') || '[]');
  const list = document.getElementById('appointmentList');

  // Demo appointments + any real bookings
  const demoAppointments = [
    { professional: "Dr. Sarah Mitchell", type: "nutritionist", date: "2026-04-14", time: "10:00 AM", topic: "Weekly macro review", color: "#10B981" },
    { professional: "James Okafor", type: "nutritionist", date: "2026-04-18", time: "2:30 PM", topic: "Weight loss check-in", color: "#6C3AED" },
  ];

  const allAppts = [...demoAppointments, ...consultations.filter(c => c.type === 'nutritionist').map(c => ({
    professional: c.professional,
    type: c.type,
    date: c.date,
    time: c.time,
    topic: c.topic || 'Consultation',
    color: '#10B981',
  }))];

  if (allAppts.length === 0) {
    list.innerHTML = '<div class="empty-state">No upcoming check-ins. <a href="nutritionists.html" style="color:var(--accent-dark);">Book a consultation</a> with a nutritionist.</div>';
    return;
  }

  list.innerHTML = allAppts.map(a => {
    const d = new Date(a.date + 'T00:00:00');
    const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const initials = a.professional.split(' ').map(n => n[0]).join('');
    return `
      <div class="appointment-card">
        <div class="appointment-avatar" style="background: ${a.color || '#10B981'};">${initials}</div>
        <div class="appointment-info">
          <h4>${a.professional}</h4>
          <span>${a.topic}</span>
        </div>
        <div class="appointment-time">
          ${dateStr}
          <span>${a.time}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ===== Modals =====
let schedulingMealDate = '';

function openLogMealModal() {
  document.getElementById('mealName').value = '';
  document.getElementById('mealCalories').value = '';
  document.getElementById('mealProtein').value = '';
  document.getElementById('mealCarbs').value = '';
  document.getElementById('mealFat').value = '';
  document.getElementById('mealNotes').value = '';
  document.getElementById('logMealModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function saveLoggedMeal() {
  const name = document.getElementById('mealName').value.trim();
  const type = document.getElementById('mealType').value;
  const calories = parseInt(document.getElementById('mealCalories').value) || 0;
  const protein = parseInt(document.getElementById('mealProtein').value) || 0;
  const carbs = parseInt(document.getElementById('mealCarbs').value) || 0;
  const fat = parseInt(document.getElementById('mealFat').value) || 0;
  const notes = document.getElementById('mealNotes').value.trim();

  if (!name || !calories) {
    showToast('Please enter a meal name and calories');
    return;
  }

  const log = getMealLog();
  log.push({
    name, type, calories, protein, carbs, fat, notes,
    date: new Date().toISOString().split('T')[0]
  });
  saveMealLog(log);
  closeAllModals();
  renderAll();
  showToast('Meal logged!');
}

function openScheduleMealModal(dateStr) {
  schedulingMealDate = dateStr;
  const d = new Date(dateStr + 'T00:00:00');
  document.getElementById('scheduleMealDayLabel').textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  document.getElementById('scheduleMealName').value = '';
  document.getElementById('scheduleMealCal').value = '';
  document.getElementById('scheduleMealModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function saveScheduledMeal() {
  const name = document.getElementById('scheduleMealName').value.trim();
  const type = document.getElementById('scheduleMealType').value;
  const calories = parseInt(document.getElementById('scheduleMealCal').value) || 0;

  if (!name) {
    showToast('Please enter a meal name');
    return;
  }

  const schedule = getMealSchedule();
  if (!schedule[schedulingMealDate]) schedule[schedulingMealDate] = [];
  schedule[schedulingMealDate].push({ name, type, calories });
  saveMealSchedule(schedule);
  closeAllModals();
  renderAll();
  showToast('Meal scheduled!');
}

// ===== Render All =====
function renderAll() {
  updateMacros();
  renderWater();
  renderWeeklyCalChart();
  renderMealSchedule();
  renderMealLog();
  renderAppointments();
}

// Init
renderAll();
