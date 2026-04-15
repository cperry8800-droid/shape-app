// ===== Nutritionist Dashboard =====

// Dynamic date helper
const _ndToday = new Date();
function _ndDate(daysAgo) {
  const d = new Date(_ndToday);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

// Demo client data
const ndClients = [
  {
    id: 1, name: "Olivia Martinez", plan: "Monthly Subscription", status: "active",
    joined: "2026-01-10", lastCheckin: _ndDate(0), checkinsThisMonth: 8,
    mealsLogged: 84, adherence: 92, goal: "Weight Loss",
    progress: [
      { week: "Week 1", meals: 21, adherence: 95 },
      { week: "Week 2", meals: 20, adherence: 90 },
      { week: "Week 3", meals: 19, adherence: 88 },
      { week: "Week 4", meals: 24, adherence: 96 },
    ],
    recentMeals: [
      { name: "Greek Yogurt Bowl", date: _ndDate(0), calories: 380, type: "Breakfast", onPlan: true },
      { name: "Grilled Chicken Salad", date: _ndDate(0), calories: 520, type: "Lunch", onPlan: true },
      { name: "Salmon & Quinoa", date: _ndDate(1), calories: 610, type: "Dinner", onPlan: true },
    ]
  },
  {
    id: 2, name: "James Thompson", plan: "Monthly Subscription", status: "active",
    joined: "2026-02-05", lastCheckin: _ndDate(1), checkinsThisMonth: 6,
    mealsLogged: 72, adherence: 85, goal: "Muscle Gain",
    progress: [
      { week: "Week 1", meals: 21, adherence: 88 },
      { week: "Week 2", meals: 18, adherence: 82 },
      { week: "Week 3", meals: 17, adherence: 80 },
      { week: "Week 4", meals: 16, adherence: 90 },
    ],
    recentMeals: [
      { name: "Protein Pancakes", date: _ndDate(1), calories: 520, type: "Breakfast", onPlan: true },
      { name: "Turkey & Rice Bowl", date: _ndDate(1), calories: 680, type: "Lunch", onPlan: true },
      { name: "Steak & Sweet Potato", date: _ndDate(2), calories: 750, type: "Dinner", onPlan: false },
    ]
  },
  {
    id: 3, name: "Sophia Nguyen", plan: "Clean Eating Reset (One-time)", status: "active",
    joined: "2026-03-15", lastCheckin: _ndDate(2), checkinsThisMonth: 4,
    mealsLogged: 56, adherence: 78, goal: "General Health",
    progress: [
      { week: "Week 1", meals: 18, adherence: 85 },
      { week: "Week 2", meals: 15, adherence: 75 },
      { week: "Week 3", meals: 12, adherence: 70 },
      { week: "Week 4", meals: 11, adherence: 82 },
    ],
    recentMeals: [
      { name: "Avocado Toast & Eggs", date: _ndDate(2), calories: 420, type: "Breakfast", onPlan: true },
      { name: "Buddha Bowl", date: _ndDate(2), calories: 490, type: "Lunch", onPlan: true },
      { name: "Pizza (off-plan)", date: _ndDate(3), calories: 880, type: "Dinner", onPlan: false },
    ]
  },
  {
    id: 4, name: "Marcus Williams", plan: "Monthly Subscription", status: "active",
    joined: "2025-11-20", lastCheckin: _ndDate(0), checkinsThisMonth: 10,
    mealsLogged: 95, adherence: 96, goal: "Athletic Performance",
    progress: [
      { week: "Week 1", meals: 24, adherence: 98 },
      { week: "Week 2", meals: 23, adherence: 95 },
      { week: "Week 3", meals: 24, adherence: 96 },
      { week: "Week 4", meals: 24, adherence: 95 },
    ],
    recentMeals: [
      { name: "Overnight Oats & Berries", date: _ndDate(0), calories: 450, type: "Breakfast", onPlan: true },
      { name: "Grilled Fish Tacos", date: _ndDate(0), calories: 580, type: "Lunch", onPlan: true },
      { name: "Chicken Stir Fry", date: _ndDate(0), calories: 620, type: "Dinner", onPlan: true },
    ]
  },
  {
    id: 5, name: "Rachel Kim", plan: "Monthly Subscription", status: "inactive",
    joined: "2026-01-28", lastCheckin: "2026-03-25", checkinsThisMonth: 1,
    mealsLogged: 12, adherence: 45, goal: "Weight Loss",
    progress: [
      { week: "Week 1", meals: 8, adherence: 55 },
      { week: "Week 2", meals: 4, adherence: 40 },
      { week: "Week 3", meals: 0, adherence: 0 },
      { week: "Week 4", meals: 0, adherence: 0 },
    ],
    recentMeals: [
      { name: "Smoothie Bowl", date: "2026-03-25", calories: 340, type: "Breakfast", onPlan: true },
    ]
  },
  {
    id: 6, name: "Daniel Park", plan: "Macro Mastery (One-time)", status: "active",
    joined: _ndDate(12), lastCheckin: _ndDate(1), checkinsThisMonth: 5,
    mealsLogged: 60, adherence: 88, goal: "Muscle Gain",
    progress: [
      { week: "Week 1", meals: 20, adherence: 90 },
      { week: "Week 2", meals: 18, adherence: 85 },
      { week: "Week 3", meals: 22, adherence: 92 },
      { week: "Week 4", meals: 0, adherence: 0 },
    ],
    recentMeals: [
      { name: "Egg White Omelette", date: _ndDate(1), calories: 310, type: "Breakfast", onPlan: true },
      { name: "Lean Beef & Broccoli", date: _ndDate(1), calories: 590, type: "Lunch", onPlan: true },
      { name: "Protein Shake & Banana", date: _ndDate(2), calories: 280, type: "Snack", onPlan: true },
    ]
  },
  {
    id: 7, name: "Emily Foster", plan: "Monthly Subscription", status: "inactive",
    joined: "2025-12-15", lastCheckin: _ndDate(10), checkinsThisMonth: 2,
    mealsLogged: 18, adherence: 52, goal: "Hormone Balance",
    progress: [
      { week: "Week 1", meals: 14, adherence: 65 },
      { week: "Week 2", meals: 4, adherence: 38 },
      { week: "Week 3", meals: 0, adherence: 0 },
      { week: "Week 4", meals: 0, adherence: 0 },
    ],
    recentMeals: [
      { name: "Salmon & Avocado Bowl", date: _ndDate(10), calories: 560, type: "Lunch", onPlan: true },
      { name: "Veggie Wrap", date: _ndDate(10), calories: 380, type: "Dinner", onPlan: false },
    ]
  },
  {
    id: 8, name: "Aisha Johnson", plan: "Monthly Subscription", status: "active",
    joined: "2026-03-01", lastCheckin: _ndDate(0), checkinsThisMonth: 7,
    mealsLogged: 68, adherence: 82, goal: "Maintenance",
    progress: [
      { week: "Week 1", meals: 18, adherence: 85 },
      { week: "Week 2", meals: 17, adherence: 80 },
      { week: "Week 3", meals: 16, adherence: 78 },
      { week: "Week 4", meals: 17, adherence: 84 },
    ],
    recentMeals: [
      { name: "Acai Bowl", date: _ndDate(0), calories: 410, type: "Breakfast", onPlan: true },
      { name: "Mediterranean Salad", date: _ndDate(0), calories: 480, type: "Lunch", onPlan: true },
      { name: "Pasta Bolognese", date: _ndDate(1), calories: 720, type: "Dinner", onPlan: false },
    ]
  },
];

const ndRecentSales = [
  { client: "Daniel Park", plan: "Macro Mastery", price: 39.99, date: _ndDate(12), type: "One-time" },
  { client: "Sophia Nguyen", plan: "Clean Eating Reset", price: 34.99, date: _ndDate(15), type: "One-time" },
  { client: "New User", plan: "Anti-Inflammatory Plan", price: 29.99, date: _ndDate(3), type: "One-time" },
  { client: "Olivia Martinez", plan: "Monthly Subscription", price: 49.99, date: _ndDate(6), type: "Recurring" },
  { client: "Marcus Williams", plan: "Monthly Subscription", price: 49.99, date: _ndDate(6), type: "Recurring" },
  { client: "James Thompson", plan: "Monthly Subscription", price: 49.99, date: _ndDate(8), type: "Recurring" },
  { client: "Aisha Johnson", plan: "Monthly Subscription", price: 49.99, date: _ndDate(8), type: "Recurring" },
  { client: "New User", plan: "Keto Kickstart", price: 27.99, date: _ndDate(1), type: "One-time" },
];

// ===== Render Client List =====
let _ndSelectedClientId = null;
let _ndCurrentFilter = 'all';

function _ndBuildClientRowHtml(c) {
  const initials = c.name.split(' ').map(n => n[0]).join('');
  const isLow = c.status === 'inactive' || c.adherence < 70;
  const lastDate = new Date(c.lastCheckin + 'T00:00:00');
  const daysAgo = Math.floor((new Date() - lastDate) / (1000 * 60 * 60 * 24));
  const lastStr = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`;
  return `
    <div class="td-client-row ${isLow ? 'needs-attention' : ''}" data-name="${c.name.toLowerCase()}" onclick="showNdClientDetail(${c.id})">
      <div class="td-client-avatar">
        <div class="avatar">${initials}</div>
      </div>
      <div class="td-client-info">
        <h4>${c.name}</h4>
        <span>${c.plan}</span>
      </div>
      <div class="td-client-stats-mini">
        <div class="td-mini-stat">
          <strong>${c.mealsLogged}</strong>
          <span>meals logged</span>
        </div>
        <div class="td-mini-stat">
          <strong>${c.adherence}%</strong>
          <span>adherence</span>
        </div>
        <div class="td-mini-stat">
          <strong>${lastStr}</strong>
          <span>last check-in</span>
        </div>
      </div>
      <div class="td-client-status">
        ${isLow ? '<span class="status-badge status-warning">Needs Attention</span>' : '<span class="status-badge status-good">On Track</span>'}
      </div>
    </div>
  `;
}

function renderNdClients(filter) {
  _ndCurrentFilter = filter || _ndCurrentFilter || 'all';
  const f = _ndCurrentFilter;
  const filtered = f === 'all' ? ndClients :
    f === 'active' ? ndClients.filter(c => c.status === 'active' && c.adherence >= 70) :
    ndClients.filter(c => c.status === 'inactive' || c.adherence < 70);

  const list = document.getElementById('ndClientList');
  if (!list) return;

  // Preserve selection if still in filtered list, else pick first
  if (!filtered.find(c => c.id === _ndSelectedClientId)) {
    _ndSelectedClientId = filtered.length ? filtered[0].id : null;
  }

  if (!filtered.length) {
    list.innerHTML = '<div style="text-align:center;padding:40px 16px;color:var(--text-muted);font-size:0.85rem;">No clients match this filter.</div>';
    return;
  }

  const options = filtered.map(c => {
    const badge = (c.status === 'inactive' || c.adherence < 70) ? ' — Needs Attention' : '';
    const sel = c.id === _ndSelectedClientId ? ' selected' : '';
    return `<option value="${c.id}"${sel}>${c.name} · ${c.plan}${badge}</option>`;
  }).join('');

  const selected = filtered.find(c => c.id === _ndSelectedClientId) || filtered[0];

  list.innerHTML = `
    <div style="margin-bottom:18px;">
      <label style="display:block;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin-bottom:8px;">Select client (${filtered.length})</label>
      <select id="ndClientSelect" onchange="selectNdClient(this.value)" style="width:100%;padding:12px 14px;font-size:0.9rem;background:var(--bg-card);border:1px solid var(--border);color:var(--text);border-radius:8px;cursor:pointer;">
        ${options}
      </select>
    </div>
    ${_ndBuildClientRowHtml(selected)}
  `;
}

function selectNdClient(id) {
  _ndSelectedClientId = Number(id);
  renderNdClients(_ndCurrentFilter);
}

function filterNdClients(filter, btn) {
  document.querySelectorAll('#ndTabClients .td-filters .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderNdClients(filter);
  // Re-apply search after filter change
  const q = (document.getElementById('ndClientSearchInput') || {}).value || '';
  searchNdClients(q);
}

function searchNdClients(q) {
  const term = (q || '').toLowerCase().trim();
  const select = document.getElementById('ndClientSelect');
  if (!select) return;
  let firstVisible = null;
  Array.from(select.options).forEach(opt => {
    const match = !term || opt.textContent.toLowerCase().includes(term);
    opt.hidden = !match;
    opt.disabled = !match;
    if (match && firstVisible === null) firstVisible = Number(opt.value);
  });
  // If current selection is hidden, jump to first visible
  const currentOpt = select.querySelector('option[value="' + _ndSelectedClientId + '"]');
  if (term && currentOpt && currentOpt.hidden && firstVisible !== null) {
    _ndSelectedClientId = firstVisible;
    renderNdClients(_ndCurrentFilter);
    // Re-apply search after re-render
    searchNdClients(q);
  }
}

// ===== Client Detail =====
let _ndCalMonth = new Date().getMonth();
let _ndCalYear = new Date().getFullYear();
let _ndCurrentDetailId = null;

function _ndBuildCalendar(clientId, month, year) {
  const c = ndClients.find(cl => cl.id === clientId);
  if (!c) return '';

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const monthName = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Build meal map for this month from recentMeals
  const mealMap = {};
  c.recentMeals.forEach(m => {
    const d = new Date(m.date + 'T00:00:00');
    if (d.getMonth() === month && d.getFullYear() === year) {
      const day = d.getDate();
      if (!mealMap[day]) mealMap[day] = { count: 0, onPlan: 0, offPlan: 0 };
      mealMap[day].count++;
      if (m.onPlan) mealMap[day].onPlan++;
      else mealMap[day].offPlan++;
    }
  });

  // Also simulate some extra meal data for demo
  for (let d = 1; d <= Math.min(daysInMonth, today.getDate()); d++) {
    const checkDate = new Date(year, month, d);
    if (checkDate > today) break;
    if (!mealMap[d] && Math.random() > 0.3) {
      const count = Math.floor(Math.random() * 3) + 1;
      const onPlan = Math.floor(Math.random() * (count + 1));
      mealMap[d] = { count, onPlan, offPlan: count - onPlan };
    }
  }

  let cells = '';
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  days.forEach(d => { cells += '<div class="nd-cal-head">' + d + '</div>'; });

  for (let i = 0; i < firstDay; i++) cells += '<div class="nd-cal-day empty"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    const meal = mealMap[d];
    let dotClass = '';
    if (meal) {
      if (meal.offPlan === 0) dotClass = 'on-plan';
      else if (meal.onPlan === 0) dotClass = 'off-plan';
      else dotClass = 'mixed';
    }
    cells += '<div class="nd-cal-day' + (isToday ? ' today' : '') + (meal ? ' has-meals' : '') + '">'
      + '<div class="nd-cal-day-num">' + d + '</div>'
      + (meal ? '<div class="nd-cal-day-dot ' + dotClass + '"></div><div class="nd-cal-day-meals">' + meal.count + 'm</div>' : '')
      + '</div>';
  }

  return '<div class="nd-month-header">'
    + '<h4>' + monthName + '</h4>'
    + '<div class="nd-month-nav">'
    + '<button onclick="ndCalPrev()">&#8249;</button>'
    + '<button onclick="ndCalNext()">&#8250;</button>'
    + '</div></div>'
    + '<div style="display:flex;gap:12px;margin-bottom:12px;font-size:0.68rem;color:var(--text-muted);">'
    + '<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10B981;margin-right:4px;"></span>On Plan</span>'
    + '<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#F59E0B;margin-right:4px;"></span>Mixed</span>'
    + '<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#EF4444;margin-right:4px;"></span>Off Plan</span>'
    + '</div>'
    + '<div class="nd-cal-grid">' + cells + '</div>';
}

function ndCalPrev() {
  _ndCalMonth--;
  if (_ndCalMonth < 0) { _ndCalMonth = 11; _ndCalYear--; }
  document.getElementById('ndCalContainer').innerHTML = _ndBuildCalendar(_ndCurrentDetailId, _ndCalMonth, _ndCalYear);
}

function ndCalNext() {
  _ndCalMonth++;
  if (_ndCalMonth > 11) { _ndCalMonth = 0; _ndCalYear++; }
  document.getElementById('ndCalContainer').innerHTML = _ndBuildCalendar(_ndCurrentDetailId, _ndCalMonth, _ndCalYear);
}

function ndSwitchMealView(view, btn) {
  document.querySelectorAll('.nd-view-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('ndWeeklyView').style.display = view === 'weekly' ? '' : 'none';
  document.getElementById('ndMonthlyView').style.display = view === 'monthly' ? '' : 'none';
}

function showNdClientDetail(id) {
  const c = ndClients.find(cl => cl.id === id);
  if (!c) return;

  _ndCurrentDetailId = id;
  _ndCalMonth = new Date().getMonth();
  _ndCalYear = new Date().getFullYear();

  document.getElementById('ndClientDetailSection').style.display = '';
  document.getElementById('ndClientDetailName').textContent = c.name;

  const maxAdherence = Math.max(...c.progress.map(w => w.adherence), 1);

  document.getElementById('ndClientDetailContent').innerHTML = `
    <div class="progress-stats-row" style="margin-bottom:36px;">
      <div class="progress-stat-card">
        <div class="progress-stat-number">${c.checkinsThisMonth}</div>
        <div class="progress-stat-label">Check-ins This Month</div>
      </div>
      <div class="progress-stat-card">
        <div class="progress-stat-number">${c.mealsLogged}</div>
        <div class="progress-stat-label">Meals Logged</div>
      </div>
      <div class="progress-stat-card">
        <div class="progress-stat-number">${c.adherence}%</div>
        <div class="progress-stat-label">Adherence Rate</div>
      </div>
      <div class="progress-stat-card">
        <div class="progress-stat-number">${c.goal}</div>
        <div class="progress-stat-label">Nutrition Goal</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:36px;">
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <h3 style="font-size:0.78rem;font-weight:500;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin:0;">Meal Schedule</h3>
          <div class="nd-view-toggle">
            <button class="nd-view-btn active" onclick="ndSwitchMealView('weekly', this)">Weekly</button>
            <button class="nd-view-btn" onclick="ndSwitchMealView('monthly', this)">Monthly</button>
          </div>
        </div>
        <div id="ndWeeklyView">
          <div class="progress-bar-chart">
            ${c.progress.map(w => `
              <div class="chart-row">
                <div class="chart-label">${w.week}</div>
                <div class="chart-bar-container">
                  <div class="chart-bar" style="width: ${(w.adherence / maxAdherence) * 100}%;"></div>
                </div>
                <div class="chart-value">${w.meals} meals &middot; ${w.adherence}%</div>
              </div>
            `).join('')}
          </div>
        </div>
        <div id="ndMonthlyView" style="display:none;">
          <div id="ndCalContainer">
            ${_ndBuildCalendar(id, _ndCalMonth, _ndCalYear)}
          </div>
        </div>
      </div>

      <div>
        <h3 style="font-size:0.78rem;font-weight:500;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin-bottom:12px;">Recent Meals</h3>
        <div style="background:var(--bg-alt);border-radius:6px;overflow:hidden;">
          ${c.recentMeals.map(m => {
            const d = new Date(m.date + 'T00:00:00');
            const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return `
              <div class="nd-meal-row">
                <div class="nd-meal-date">${dateStr}</div>
                <div class="nd-meal-name">${m.name}</div>
                <div class="nd-meal-meta">
                  <span>${m.calories} cal</span>
                  <span class="nd-meal-type">${m.type}</span>
                  <span class="nd-meal-status ${m.onPlan ? 'on' : 'off'}">${m.onPlan ? '✓' : '✗'}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>

    <div style="margin-top:36px;padding-top:24px;border-top:1px solid var(--border);display:flex;gap:12px;">
      <span style="font-size:0.82rem;color:var(--text-muted);">Member since ${new Date(c.joined + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
    </div>
  `;

  document.getElementById('ndClientDetailSection').scrollIntoView({ behavior: 'smooth' });
}

function closeNdClientDetail() {
  document.getElementById('ndClientDetailSection').style.display = 'none';
}

// ===== Sales List =====
function renderNdSales() {
  const list = document.getElementById('ndSalesList');
  const totalSales = ndRecentSales.reduce((sum, s) => sum + s.price, 0);
  const yourEarnings = totalSales * 0.85;
  const shapeFee = totalSales * 0.15;

  list.innerHTML = `
    <div style="display:flex;gap:24px;margin-bottom:24px;padding:20px;background:var(--bg-alt);border-radius:8px;">
      <div style="flex:1;text-align:center;">
        <div style="font-size:1.2rem;font-weight:600;">$${totalSales.toFixed(2)}</div>
        <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">Total Sales</div>
      </div>
      <div style="flex:1;text-align:center;">
        <div style="font-size:1.2rem;font-weight:600;color:#10B981;">$${yourEarnings.toFixed(2)}</div>
        <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">Your Earnings (85%)</div>
      </div>
      <div style="flex:1;text-align:center;">
        <div style="font-size:1.2rem;font-weight:600;color:var(--text-muted);">$${shapeFee.toFixed(2)}</div>
        <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">Shape Fee (15%)</div>
      </div>
    </div>
  ` + ndRecentSales.map(s => {
    const d = new Date(s.date + 'T00:00:00');
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const earned = (s.price * 0.85).toFixed(2);
    return `
      <div class="td-sale-row">
        <div class="td-sale-info">
          <h4>${s.client}</h4>
          <span>${s.plan}</span>
        </div>
        <div class="td-sale-type">
          <span class="workout-tag">${s.type}</span>
        </div>
        <div class="td-sale-amount">
          <strong style="color:#10B981;">$${earned}</strong>
          <span>of $${s.price.toFixed(2)} &middot; ${dateStr}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ===== Dashboard Meal Schedule & Logs =====
let _ndDashMonth = new Date().getMonth();
let _ndDashYear = new Date().getFullYear();

function ndSwitchDashView(view, btn) {
  document.querySelectorAll('.td-section-header .nd-view-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('ndDashWeeklyView').style.display = view === 'weekly' ? '' : 'none';
  document.getElementById('ndDashMonthlyView').style.display = view === 'monthly' ? '' : 'none';
}

function renderDashWeekly() {
  const container = document.getElementById('ndDashWeeklyContent');
  const activeClients = ndClients.filter(c => c.status === 'active');
  const maxAdherence = Math.max(...activeClients.map(c => c.adherence), 1);

  container.innerHTML = '<div class="progress-bar-chart">' + activeClients.map(c => `
    <div class="chart-row">
      <div class="chart-label" style="min-width:100px;">${c.name.split(' ')[0]}</div>
      <div class="chart-bar-container">
        <div class="chart-bar" style="width:${(c.adherence / maxAdherence) * 100}%;background:${c.adherence >= 85 ? 'var(--accent)' : c.adherence >= 70 ? '#F59E0B' : '#EF4444'};"></div>
      </div>
      <div class="chart-value">${c.adherence}%</div>
    </div>
  `).join('') + '</div>';
}

// Helper: get dates for a recurring nutritionist check-in in a given month
function _ndGetCheckInDates(dayName, frequency, month, year, createdAt) {
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const targetDow = dayNames.indexOf(dayName);
  if (targetDow === -1) return [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const allDates = [];
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(year, month, d).getDay() === targetDow) allDates.push(d);
  }
  if (frequency === 'weekly') return allDates;
  if (frequency === 'monthly') return allDates.slice(0, 1);
  const refDate = new Date((createdAt || new Date().toISOString().split('T')[0]) + 'T00:00:00');
  while (refDate.getDay() !== targetDow) refDate.setDate(refDate.getDate() + 1);
  return allDates.filter(d => {
    const diff = Math.round((new Date(year, month, d) - refDate) / 86400000);
    return diff >= 0 && diff % 14 === 0;
  });
}

function _ndBuildDashCalendar(month, year) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const monthName = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Aggregate all client meals for this month (also track which clients logged)
  const mealMap = {};
  ndClients.forEach(c => {
    const first = (c.name || '').split(' ')[0];
    c.recentMeals.forEach(m => {
      const d = new Date(m.date + 'T00:00:00');
      if (d.getMonth() === month && d.getFullYear() === year) {
        const day = d.getDate();
        if (!mealMap[day]) mealMap[day] = { count: 0, onPlan: 0, offPlan: 0, clients: {} };
        mealMap[day].count++;
        if (m.onPlan) mealMap[day].onPlan++; else mealMap[day].offPlan++;
        mealMap[day].clients[first] = (mealMap[day].clients[first] || 0) + 1;
      }
    });
  });

  // Build check-in / consultation map for this month
  const ciMap = {};
  const ndCheckIns = getNdCheckIns().filter(ci => ci.active);
  ndCheckIns.forEach(ci => {
    const c = ndClients.find(cl => cl.id === ci.clientId);
    const name = c ? c.name.split(' ')[0] : 'Client';
    _ndGetCheckInDates(ci.day, ci.frequency, month, year, ci.createdAt).forEach(d => {
      if (!ciMap[d]) ciMap[d] = [];
      ciMap[d].push({ client: name, time: ci.time, label: 'Check-In' });
    });
  });
  let ndConsults = [];
  try { ndConsults = JSON.parse(localStorage.getItem('shapeConsultations') || '[]'); } catch(e) {}
  ndConsults.filter(c => c.type === 'nutritionist').forEach(con => {
    const d = new Date(con.date + 'T00:00:00');
    if (d.getMonth() === month && d.getFullYear() === year) {
      const day = d.getDate();
      if (!ciMap[day]) ciMap[day] = [];
      ciMap[day].push({ client: con.clientName || 'Client', time: con.time, label: 'Consult' });
    }
  });

  // Simulate extra data for demo
  const demoNames = ndClients.map(c => (c.name || '').split(' ')[0]).filter(Boolean);
  function pickDemoName(seed) { return demoNames.length ? demoNames[seed % demoNames.length] : 'Client'; }
  for (let d = 1; d <= Math.min(daysInMonth, today.getDate()); d++) {
    const checkDate = new Date(year, month, d);
    if (checkDate > today) break;
    if (!mealMap[d]) {
      const count = Math.floor(Math.random() * 8) + 5;
      const onPlan = Math.floor(count * (0.7 + Math.random() * 0.25));
      mealMap[d] = { count, onPlan, offPlan: count - onPlan, clients: {} };
      const n1 = pickDemoName(d), n2 = pickDemoName(d + 3);
      mealMap[d].clients[n1] = Math.ceil(count / 2);
      if (n2 !== n1) mealMap[d].clients[n2] = count - mealMap[d].clients[n1];
    } else {
      mealMap[d].count += Math.floor(Math.random() * 6) + 3;
      mealMap[d].onPlan += Math.floor(Math.random() * 4) + 2;
      if (!mealMap[d].clients) mealMap[d].clients = {};
    }
  }

  let cells = '';
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  days.forEach(d => { cells += '<div class="nd-cal-head">' + d + '</div>'; });

  for (let i = 0; i < firstDay; i++) cells += '<div class="nd-cal-day empty"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    const meal = mealMap[d];
    const ciItems = ciMap[d];
    let dotClass = '';
    if (meal) {
      if (meal.offPlan === 0) dotClass = 'on-plan';
      else if (meal.onPlan === 0) dotClass = 'off-plan';
      else dotClass = 'mixed';
    }
    var ciPreview = '';
    if (ciItems && ciItems.length) {
      var first = ciItems[0];
      var label = first.client + ' · ' + first.time;
      if (ciItems.length > 1) label += ' +' + (ciItems.length - 1);
      ciPreview = '<div style="display:flex;align-items:center;gap:4px;margin-top:2px;font-size:0.58rem;color:#A78BFA;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;">'
        + '<span style="width:5px;height:5px;border-radius:50%;background:#8B5CF6;flex-shrink:0;"></span>'
        + '<span style="overflow:hidden;text-overflow:ellipsis;">' + label + '</span>'
        + '</div>';
    }
    var mealPreview = '';
    if (meal) {
      var topNames = Object.keys(meal.clients || {}).sort(function(a,b){ return meal.clients[b] - meal.clients[a]; });
      var nameLine = '';
      if (topNames.length) {
        nameLine = topNames[0];
        if (topNames.length > 1) nameLine += ' +' + (topNames.length - 1);
      }
      mealPreview = '<div class="nd-cal-day-dot ' + dotClass + '"></div><div class="nd-cal-day-meals">' + meal.count + 'm</div>'
        + (nameLine ? '<div style="font-size:0.56rem;color:var(--text-muted);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;">' + nameLine + '</div>' : '');
    }
    cells += '<div class="nd-cal-day' + (isToday ? ' today' : '') + ((meal || ciItems) ? ' has-meals' : '') + '">'
      + '<div class="nd-cal-day-num">' + d + '</div>'
      + mealPreview
      + ciPreview
      + '</div>';
  }

  return '<div class="nd-month-header">'
    + '<h4>' + monthName + '</h4>'
    + '<div class="nd-month-nav">'
    + '<button onclick="ndDashCalPrev()">&#8249;</button>'
    + '<button onclick="ndDashCalNext()">&#8250;</button>'
    + '</div></div>'
    + '<div style="display:flex;gap:12px;margin-bottom:12px;font-size:0.68rem;color:var(--text-muted);flex-wrap:wrap;">'
    + '<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10B981;margin-right:4px;"></span>On Plan</span>'
    + '<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#F59E0B;margin-right:4px;"></span>Mixed</span>'
    + '<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#EF4444;margin-right:4px;"></span>Off Plan</span>'
    + '<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#8B5CF6;margin-right:4px;"></span>Check-In</span>'
    + '</div>'
    + '<div class="nd-cal-grid">' + cells + '</div>';
}

function ndDashCalPrev() {
  _ndDashMonth--;
  if (_ndDashMonth < 0) { _ndDashMonth = 11; _ndDashYear--; }
  document.getElementById('ndDashCalContainer').innerHTML = _ndBuildDashCalendar(_ndDashMonth, _ndDashYear);
}

function ndDashCalNext() {
  _ndDashMonth++;
  if (_ndDashMonth > 11) { _ndDashMonth = 0; _ndDashYear++; }
  document.getElementById('ndDashCalContainer').innerHTML = _ndBuildDashCalendar(_ndDashMonth, _ndDashYear);
}

function renderDashMealLog() {
  const container = document.getElementById('ndDashMealLog');
  // Collect all recent meals from all clients, sorted by date
  const allMeals = [];
  ndClients.forEach(c => {
    c.recentMeals.forEach(m => {
      allMeals.push({ ...m, client: c.name.split(' ')[0] });
    });
  });
  allMeals.sort((a, b) => b.date.localeCompare(a.date));

  container.innerHTML = allMeals.map(m => {
    const d = new Date(m.date + 'T00:00:00');
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `
      <div class="nd-meal-row">
        <div class="nd-meal-date">${dateStr}</div>
        <div class="nd-meal-name" title="${m.name}">${m.client} — ${m.name}</div>
        <div class="nd-meal-meta">
          <span>${m.calories} cal</span>
          <span class="nd-meal-type">${m.type}</span>
          <span class="nd-meal-status ${m.onPlan ? 'on' : 'off'}">${m.onPlan ? '✓' : '✗'}</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderDashMealSchedule() {
  renderDashWeekly();
  document.getElementById('ndDashCalContainer').innerHTML = _ndBuildDashCalendar(_ndDashMonth, _ndDashYear);
  renderDashMealLog();
}

// Init
renderNdClients('all');
renderNdSales();
renderDashMealSchedule();

// ===== Direct Messages =====
const ND_MSG_KEY = 'shapeNutritionistMessages';

function getNdMessages() {
  try { return JSON.parse(localStorage.getItem(ND_MSG_KEY)) || {}; } catch(e) { return {}; }
}
function saveNdMessages(msgs) { localStorage.setItem(ND_MSG_KEY, JSON.stringify(msgs)); }

(function initNdMessages() {
  const existing = getNdMessages();
  if (Object.keys(existing).length > 0) return;
  const demo = {
    1: [
      { from: 'them', text: 'Hi! Quick question - can I swap the brown rice for quinoa in my meal plan?', time: '10:30 AM', date: _ndDate(1) },
      { from: 'me', text: 'Absolutely! Quinoa is a great swap - similar calories with more protein. Go for it!', time: '10:45 AM', date: _ndDate(1) },
      { from: 'them', text: 'Perfect, thanks! \u{1F64C}', time: '10:47 AM', date: _ndDate(1) },
    ],
    2: [
      { from: 'them', text: 'I\'ve been struggling to hit my protein goal. Any easy snack ideas?', time: '3:00 PM', date: _ndDate(0) },
      { from: 'me', text: 'Try Greek yogurt with nuts, protein shakes, or cottage cheese with berries. All easy and high protein!', time: '3:20 PM', date: _ndDate(0) },
    ],
    4: [
      { from: 'me', text: 'Great job on your meal prep this week Jasmine! Your adherence is 96% \u{1F389}', time: '5:00 PM', date: _ndDate(0) },
      { from: 'them', text: 'Thank you! The meal plan templates make it so much easier', time: '5:15 PM', date: _ndDate(0) },
    ],
    6: [
      { from: 'them', text: 'Is it ok to have a cheat meal this weekend? It\'s my birthday', time: '11:00 AM', date: _ndDate(2) },
      { from: 'me', text: 'Happy birthday! Of course! One meal won\'t derail your progress. Enjoy it guilt-free!', time: '11:30 AM', date: _ndDate(2) },
    ],
  };
  saveNdMessages(demo);
})();

let ndActiveChat = null;

function renderNdMsgSidebar() {
  const msgs = getNdMessages();
  const sidebar = document.getElementById('ndMsgSidebar');

  sidebar.innerHTML = ndClients.map(c => {
    const convo = msgs[c.id] || [];
    const lastMsg = convo.length > 0 ? convo[convo.length - 1] : null;
    const initials = c.name.split(' ').map(n => n[0]).join('');
    const preview = lastMsg ? (lastMsg.from === 'me' ? 'You: ' : '') + lastMsg.text : 'No messages yet';
    const time = lastMsg ? lastMsg.time : '';

    return `
      <div class="td-msg-contact ${ndActiveChat === c.id ? 'active' : ''}" onclick="openNdChat(${c.id})">
        <div class="avatar">${initials}</div>
        <div class="td-msg-contact-info">
          <div class="td-msg-contact-name">${c.name}</div>
          <div class="td-msg-contact-preview">${preview}</div>
        </div>
        <div class="td-msg-contact-time">${time}</div>
      </div>
    `;
  }).join('');
}

function openNdChat(clientId) {
  ndActiveChat = clientId;
  const c = ndClients.find(cl => cl.id === clientId);
  if (!c) return;

  const msgs = getNdMessages();
  const convo = msgs[clientId] || [];
  const initials = c.name.split(' ').map(n => n[0]).join('');

  const chatDiv = document.getElementById('ndMsgChat');
  chatDiv.innerHTML = `
    <div class="td-msg-chat-header">
      <div class="avatar">${initials}</div>
      <div>
        <h4>${c.name}</h4>
        <span>${c.plan}</span>
      </div>
    </div>
    <div class="td-msg-chat-body" id="ndMsgBody">
      ${convo.length === 0 ? '<div class="td-msg-empty">Start a conversation with ' + c.name + '</div>' :
        convo.map(m => `
          <div class="td-msg-bubble ${m.from === 'me' ? 'sent' : 'received'}">
            <div>${m.text}</div>
            <div class="td-msg-bubble-time">${m.time}</div>
          </div>
        `).join('')
      }
    </div>
    <div class="td-msg-input-area">
      <input type="text" id="ndMsgInput" placeholder="Type a message..." onkeydown="if(event.key==='Enter')sendNdMessage()">
      <button onclick="sendNdMessage()">Send</button>
    </div>
  `;

  const body = document.getElementById('ndMsgBody');
  body.scrollTop = body.scrollHeight;
  document.getElementById('ndMsgInput').focus();
  renderNdMsgSidebar();
}

function sendNdMessage() {
  if (!ndActiveChat) return;
  const input = document.getElementById('ndMsgInput');
  const text = input.value.trim();
  if (!text) return;

  const msgs = getNdMessages();
  if (!msgs[ndActiveChat]) msgs[ndActiveChat] = [];

  const now = new Date();
  const hours = now.getHours();
  const mins = now.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const timeStr = (hours % 12 || 12) + ':' + (mins < 10 ? '0' : '') + mins + ' ' + ampm;

  msgs[ndActiveChat].push({
    from: 'me', text: text, time: timeStr, date: new Date().toISOString().split('T')[0]
  });
  saveNdMessages(msgs);

  input.value = '';
  openNdChat(ndActiveChat);
  showToast('Message sent!');
}

// Add "Message" button to client rows
const origRenderNdClients = renderNdClients;
renderNdClients = function(filter) {
  origRenderNdClients(filter);
  document.querySelectorAll('.td-client-row').forEach(row => {
    const onclick = row.getAttribute('onclick');
    const idMatch = onclick && onclick.match(/showNdClientDetail\((\d+)\)/);
    if (idMatch) {
      const id = idMatch[1];
      const actionsDiv = document.createElement('div');
      actionsDiv.style.cssText = 'margin-left:auto;';
      actionsDiv.innerHTML = '<button class="btn btn-sm btn-outline" onclick="event.stopPropagation();openNdChat(' + id + ');document.getElementById(\'ndMessagesPanel\').scrollIntoView({behavior:\'smooth\'})" style="font-size:0.72rem;padding:6px 14px;">Message</button>';
      row.appendChild(actionsDiv);
    }
  });
};

// ===== Schedule Check-Ins =====
const ND_CHECKIN_KEY = 'shapeNutritionistCheckIns';

function getNdCheckIns() {
  try { return JSON.parse(localStorage.getItem(ND_CHECKIN_KEY)) || []; } catch(e) { return []; }
}
function saveNdCheckIns(data) { localStorage.setItem(ND_CHECKIN_KEY, JSON.stringify(data)); }

// Seed demo check-in data
(function initNdCheckIns() {
  const existing = getNdCheckIns();
  if (existing.length > 0) return;
  const demo = [
    { clientId: 1, frequency: 'weekly', day: 'Tuesday', time: '11:00 AM', notes: 'Review food log and adjust macros', createdAt: _ndDate(14), active: true },
    { clientId: 2, frequency: 'monthly', day: 'Thursday', time: '3:00 PM', notes: 'Monthly progress review', createdAt: _ndDate(20), active: true },
    { clientId: 4, frequency: 'bi-weekly', day: 'Monday', time: '9:00 AM', notes: 'Performance nutrition check', createdAt: _ndDate(10), active: true },
    { clientId: 8, frequency: 'weekly', day: 'Friday', time: '2:00 PM', notes: '', createdAt: _ndDate(5), active: true },
  ];
  saveNdCheckIns(demo);
})();

let _ndCheckInClientId = null;

function openNdCheckInModal(clientId) {
  _ndCheckInClientId = clientId;
  const c = ndClients.find(cl => cl.id === clientId);
  if (!c) return;

  document.getElementById('ndCheckInClientName').textContent = c.name;
  // Reset selections
  document.querySelectorAll('.nd-checkin-freq-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.nd-checkin-day-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('ndCheckInTime').value = '10:00';
  document.getElementById('ndCheckInNotes').value = '';

  document.getElementById('ndCheckInModal').classList.add('active');
}

function closeNdCheckInModal() {
  document.getElementById('ndCheckInModal').classList.remove('active');
  _ndCheckInClientId = null;
}

function selectNdFreq(btn) {
  document.querySelectorAll('.nd-checkin-freq-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function selectNdDay(btn) {
  document.querySelectorAll('.nd-checkin-day-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function _ndFormatTime(timeVal) {
  if (!timeVal) return '10:00 AM';
  const [h, m] = timeVal.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
}

function saveNdCheckIn() {
  if (!_ndCheckInClientId) return;

  const freqBtn = document.querySelector('.nd-checkin-freq-btn.active');
  const dayBtn = document.querySelector('.nd-checkin-day-btn.active');
  const timeVal = document.getElementById('ndCheckInTime').value;
  const notes = document.getElementById('ndCheckInNotes').value.trim();

  if (!freqBtn) { showToast('Please select a frequency'); return; }
  if (!dayBtn) { showToast('Please select a day'); return; }

  const checkIns = getNdCheckIns();
  checkIns.push({
    clientId: _ndCheckInClientId,
    frequency: freqBtn.dataset.freq,
    day: dayBtn.dataset.day,
    time: _ndFormatTime(timeVal),
    notes: notes,
    createdAt: new Date().toISOString().split('T')[0],
    active: true
  });
  saveNdCheckIns(checkIns);
  closeNdCheckInModal();
  showToast('Check-in scheduled!');

  // Refresh detail view if open
  const detailSection = document.getElementById('ndClientDetailSection');
  if (detailSection && detailSection.style.display !== 'none') {
    showNdClientDetail(_ndCheckInClientId);
  }
}

function cancelNdCheckIn(clientId, index) {
  const checkIns = getNdCheckIns();
  const clientCheckIns = checkIns.filter(ci => ci.clientId === clientId && ci.active);
  if (index >= 0 && index < clientCheckIns.length) {
    // Find the actual index in the full array
    let count = -1;
    for (let i = 0; i < checkIns.length; i++) {
      if (checkIns[i].clientId === clientId && checkIns[i].active) {
        count++;
        if (count === index) {
          checkIns[i].active = false;
          break;
        }
      }
    }
    saveNdCheckIns(checkIns);
    showToast('Check-in cancelled');
    showNdClientDetail(clientId);
  }
}

// Monkey-patch renderNdClients to add "Schedule Check-In" button alongside Message
const _origRenderNdClientsForCheckIn = renderNdClients;
renderNdClients = function(filter) {
  _origRenderNdClientsForCheckIn(filter);
  document.querySelectorAll('.td-client-row').forEach(row => {
    const onclick = row.getAttribute('onclick');
    const idMatch = onclick && onclick.match(/showNdClientDetail\((\d+)\)/);
    if (idMatch) {
      const id = idMatch[1];
      // Find the actions div that was added by the Message monkey-patch
      const existingActions = row.querySelector('div[style*="margin-left"]');
      if (existingActions) {
        const checkInBtn = document.createElement('button');
        checkInBtn.className = 'btn btn-sm btn-outline';
        checkInBtn.style.cssText = 'font-size:0.72rem;padding:6px 14px;margin-left:6px;border-color:var(--accent);color:var(--accent);';
        checkInBtn.textContent = 'Schedule Check-In';
        checkInBtn.onclick = function(e) { e.stopPropagation(); openNdCheckInModal(Number(id)); };
        existingActions.appendChild(checkInBtn);
      }
    }
  });
};

// Monkey-patch showNdClientDetail to inject Upcoming Check-Ins section
const _origShowNdClientDetail = showNdClientDetail;
showNdClientDetail = function(id) {
  _origShowNdClientDetail(id);

  const checkIns = getNdCheckIns().filter(ci => ci.clientId === id && ci.active);
  const content = document.getElementById('ndClientDetailContent');
  if (!content) return;

  // Find the member-since footer div and inject check-ins section before it
  const footer = content.querySelector('div[style*="border-top"]');

  const checkInHtml = `
    <div style="margin-top:36px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h3 style="font-size:0.78rem;font-weight:500;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin:0;">Upcoming Check-Ins</h3>
        <button class="btn btn-sm btn-outline" onclick="openNdCheckInModal(${id})" style="font-size:0.72rem;padding:5px 14px;border-color:var(--accent);color:var(--accent);">+ Schedule</button>
      </div>
      ${checkIns.length === 0 ? '<div style="font-size:0.82rem;color:var(--text-muted);padding:16px;background:var(--bg-alt);border-radius:8px;">No check-ins scheduled. Click "+ Schedule" to add one.</div>' :
        checkIns.map((ci, idx) => `
          <div class="nd-checkin-item">
            <div class="nd-checkin-item-info">
              <div class="nd-checkin-item-freq">${ci.frequency} &mdash; ${ci.day}s at ${ci.time}</div>
              <div class="nd-checkin-item-detail">Scheduled ${new Date(ci.createdAt + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
              ${ci.notes ? '<div class="nd-checkin-item-notes">' + ci.notes + '</div>' : ''}
            </div>
            <button class="nd-checkin-cancel-btn" onclick="cancelNdCheckIn(${id}, ${idx})">Cancel</button>
          </div>
        `).join('')
      }
    </div>
  `;

  if (footer) {
    footer.insertAdjacentHTML('beforebegin', checkInHtml);
  } else {
    content.insertAdjacentHTML('beforeend', checkInHtml);
  }
};

// Init messages
renderNdMsgSidebar();
renderNdClients('all');

// ===== Check-in Banner: flagged clients with specific issues =====
function ndGetFlaggedClients() {
  const today = new Date();
  return ndClients.map(c => {
    const lastDate = new Date(c.lastCheckin + 'T00:00:00');
    const daysAgo = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
    let issue = null;
    if (c.status === 'inactive' || daysAgo >= 7) {
      issue = `Hasn't checked in in ${daysAgo} days`;
    } else if (c.adherence < 70) {
      issue = `Adherence dropped to ${c.adherence}%`;
    } else if (c.checkinsThisMonth < 3) {
      issue = `Only ${c.checkinsThisMonth} check-in${c.checkinsThisMonth === 1 ? '' : 's'} this month`;
    }
    return { client: c, issue, daysAgo };
  }).filter(x => x.issue);
}

function ndOpenFlaggedClient(id) {
  const btn = document.querySelector('.nd-tab-btn[data-tab=clients]');
  if (typeof ndSwitchTab === 'function') ndSwitchTab('clients', btn);
  setTimeout(() => {
    if (typeof showNdClientDetail === 'function') showNdClientDetail(id);
    const detail = document.getElementById('ndClientDetailSection');
    if (detail && detail.scrollIntoView) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 60);
}

function renderNdCheckinBanner() {
  const list = document.getElementById('ndCheckinBannerList');
  const title = document.getElementById('ndCheckinBannerTitle');
  const banner = document.getElementById('ndCheckinBanner');
  if (!list || !banner) return;
  const flagged = ndGetFlaggedClients();
  if (!flagged.length) {
    banner.style.display = 'none';
    return;
  }
  if (title) title.textContent = `${flagged.length} client${flagged.length === 1 ? '' : 's'} need${flagged.length === 1 ? 's' : ''} attention`;
  list.innerHTML = flagged.map(f => {
    const c = f.client;
    const initials = c.name.split(' ').map(n => n[0]).join('');
    return `
      <button type="button" class="nd-checkin-banner-row" onclick="ndOpenFlaggedClient(${c.id})">
        <div class="avatar">${initials}</div>
        <div class="nd-checkin-banner-row-info">
          <div class="nd-checkin-banner-row-name">${c.name}</div>
          <div class="nd-checkin-banner-row-issue">${f.issue}</div>
        </div>
        <span class="nd-checkin-banner-row-arrow">›</span>
      </button>
    `;
  }).join('');
}

renderNdCheckinBanner();
