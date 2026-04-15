// ===== Trainer Dashboard =====

// Dynamic date helper
const _tdToday = new Date();
function _tdDate(daysAgo) {
  const d = new Date(_tdToday);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

// Demo client data
const clients = [
  {
    id: 1, name: "Jake Roberts", plan: "Monthly Subscription", status: "active",
    joined: "2026-01-15", lastWorkout: _tdDate(0), workoutsThisMonth: 12,
    totalMinutes: 540, streak: 5, goal: "Build Muscle",
    progress: [
      { week: "Week 1", workouts: 3, minutes: 135 },
      { week: "Week 2", workouts: 4, minutes: 180 },
      { week: "Week 3", workouts: 3, minutes: 135 },
      { week: "Week 4", workouts: 2, minutes: 90 },
    ],
    recentWorkouts: [
      { name: "5x5 Foundation", date: _tdDate(0), duration: 55, difficulty: "Hard", completed: true },
      { name: "Upper Body Blast", date: _tdDate(2), duration: 45, difficulty: "Moderate", completed: true },
      { name: "Leg Day Legends", date: _tdDate(4), duration: 50, difficulty: "Hard", completed: true },
    ]
  },
  {
    id: 2, name: "Sarah Kim", plan: "Monthly Subscription", status: "active",
    joined: "2026-02-03", lastWorkout: _tdDate(1), workoutsThisMonth: 10,
    totalMinutes: 420, streak: 3, goal: "Weight Loss",
    progress: [
      { week: "Week 1", workouts: 3, minutes: 120 },
      { week: "Week 2", workouts: 3, minutes: 105 },
      { week: "Week 3", workouts: 2, minutes: 90 },
      { week: "Week 4", workouts: 2, minutes: 105 },
    ],
    recentWorkouts: [
      { name: "Full Body Burn", date: _tdDate(1), duration: 40, difficulty: "Moderate", completed: true },
      { name: "Core Crusher", date: _tdDate(3), duration: 15, difficulty: "Easy", completed: true },
      { name: "20-Min Torch", date: _tdDate(5), duration: 20, difficulty: "Moderate", completed: true },
    ]
  },
  {
    id: 3, name: "Marcus Lee", plan: "5x5 Foundation (One-time)", status: "active",
    joined: "2026-03-20", lastWorkout: _tdDate(2), workoutsThisMonth: 6,
    totalMinutes: 270, streak: 0, goal: "Strength",
    progress: [
      { week: "Week 1", workouts: 2, minutes: 110 },
      { week: "Week 2", workouts: 2, minutes: 100 },
      { week: "Week 3", workouts: 1, minutes: 30 },
      { week: "Week 4", workouts: 1, minutes: 30 },
    ],
    recentWorkouts: [
      { name: "5x5 Foundation", date: _tdDate(2), duration: 55, difficulty: "Hard", completed: true },
      { name: "5x5 Foundation", date: _tdDate(5), duration: 50, difficulty: "Moderate", completed: true },
    ]
  },
  {
    id: 4, name: "Priya Patel", plan: "Monthly Subscription", status: "active",
    joined: "2025-11-08", lastWorkout: _tdDate(0), workoutsThisMonth: 15,
    totalMinutes: 675, streak: 8, goal: "General Fitness",
    progress: [
      { week: "Week 1", workouts: 4, minutes: 180 },
      { week: "Week 2", workouts: 4, minutes: 175 },
      { week: "Week 3", workouts: 4, minutes: 160 },
      { week: "Week 4", workouts: 3, minutes: 160 },
    ],
    recentWorkouts: [
      { name: "Deadlift Domination", date: _tdDate(0), duration: 60, difficulty: "Intense", completed: true },
      { name: "Upper Body Blast", date: _tdDate(1), duration: 45, difficulty: "Hard", completed: true },
      { name: "Leg Day Legends", date: _tdDate(2), duration: 50, difficulty: "Hard", completed: true },
    ]
  },
  {
    id: 5, name: "Tom Wilson", plan: "Monthly Subscription", status: "inactive",
    joined: "2026-01-22", lastWorkout: "2026-03-28", workoutsThisMonth: 1,
    totalMinutes: 45, streak: 0, goal: "Build Muscle",
    progress: [
      { week: "Week 1", workouts: 1, minutes: 45 },
      { week: "Week 2", workouts: 0, minutes: 0 },
      { week: "Week 3", workouts: 0, minutes: 0 },
      { week: "Week 4", workouts: 0, minutes: 0 },
    ],
    recentWorkouts: [
      { name: "5x5 Foundation", date: "2026-03-28", duration: 45, difficulty: "Moderate", completed: true },
    ]
  },
  {
    id: 6, name: "Emma Chen", plan: "Deadlift Domination (One-time)", status: "active",
    joined: _tdDate(10), lastWorkout: _tdDate(1), workoutsThisMonth: 4,
    totalMinutes: 240, streak: 2, goal: "Powerlifting",
    progress: [
      { week: "Week 1", workouts: 2, minutes: 120 },
      { week: "Week 2", workouts: 2, minutes: 120 },
      { week: "Week 3", workouts: 0, minutes: 0 },
      { week: "Week 4", workouts: 0, minutes: 0 },
    ],
    recentWorkouts: [
      { name: "Deadlift Domination", date: _tdDate(1), duration: 60, difficulty: "Intense", completed: true },
      { name: "Deadlift Domination", date: _tdDate(4), duration: 60, difficulty: "Hard", completed: true },
    ]
  },
  {
    id: 7, name: "David Nguyen", plan: "Monthly Subscription", status: "inactive",
    joined: "2025-12-10", lastWorkout: _tdDate(8), workoutsThisMonth: 2,
    totalMinutes: 90, streak: 0, goal: "Weight Loss",
    progress: [
      { week: "Week 1", workouts: 2, minutes: 90 },
      { week: "Week 2", workouts: 0, minutes: 0 },
      { week: "Week 3", workouts: 0, minutes: 0 },
      { week: "Week 4", workouts: 0, minutes: 0 },
    ],
    recentWorkouts: [
      { name: "Upper Body Blast", date: _tdDate(8), duration: 45, difficulty: "Hard", completed: true },
      { name: "Leg Day Legends", date: _tdDate(8), duration: 45, difficulty: "Moderate", completed: true },
    ]
  },
  {
    id: 8, name: "Lisa Johnson", plan: "Monthly Subscription", status: "active",
    joined: "2026-03-01", lastWorkout: _tdDate(0), workoutsThisMonth: 9,
    totalMinutes: 405, streak: 4, goal: "Tone & Sculpt",
    progress: [
      { week: "Week 1", workouts: 2, minutes: 90 },
      { week: "Week 2", workouts: 3, minutes: 135 },
      { week: "Week 3", workouts: 2, minutes: 90 },
      { week: "Week 4", workouts: 2, minutes: 90 },
    ],
    recentWorkouts: [
      { name: "Upper Body Blast", date: _tdDate(0), duration: 45, difficulty: "Moderate", completed: true },
      { name: "Leg Day Legends", date: _tdDate(1), duration: 50, difficulty: "Hard", completed: true },
      { name: "5x5 Foundation", date: _tdDate(3), duration: 55, difficulty: "Hard", completed: true },
    ]
  },
];

const recentSales = [
  { client: "Emma Chen", plan: "Deadlift Domination", price: 34.99, date: _tdDate(10), type: "One-time" },
  { client: "Marcus Lee", plan: "5x5 Foundation", price: 29.99, date: _tdDate(20), type: "One-time" },
  { client: "New User", plan: "Upper Body Blast", price: 27.99, date: _tdDate(4), type: "One-time" },
  { client: "Sarah Kim", plan: "Monthly Subscription", price: 49.99, date: _tdDate(6), type: "Recurring" },
  { client: "Priya Patel", plan: "Monthly Subscription", price: 49.99, date: _tdDate(8), type: "Recurring" },
  { client: "Jake Roberts", plan: "Monthly Subscription", price: 49.99, date: _tdDate(8), type: "Recurring" },
  { client: "Lisa Johnson", plan: "Monthly Subscription", price: 49.99, date: _tdDate(8), type: "Recurring" },
  { client: "New User", plan: "Leg Day Legends", price: 29.99, date: _tdDate(2), type: "One-time" },
];

// ===== Render Client List =====
function renderClients(filter) {
  const filtered = filter === 'all' ? clients :
    filter === 'active' ? clients.filter(c => c.status === 'active' && c.workoutsThisMonth >= 3) :
    clients.filter(c => c.status === 'inactive' || c.workoutsThisMonth < 3);

  const list = document.getElementById('clientList');
  list.innerHTML = filtered.map(c => {
    const initials = c.name.split(' ').map(n => n[0]).join('');
    const isLow = c.status === 'inactive' || c.workoutsThisMonth < 3;
    const lastDate = new Date(c.lastWorkout + 'T00:00:00');
    const daysAgo = Math.floor((new Date() - lastDate) / (1000 * 60 * 60 * 24));
    const lastStr = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`;

    return `
      <div class="td-client-row ${isLow ? 'needs-attention' : ''}" data-name="${c.name.toLowerCase()}" onclick="showClientDetail(${c.id})">
        <div class="td-client-avatar">
          <div class="avatar">${initials}</div>
        </div>
        <div class="td-client-info">
          <h4>${c.name}</h4>
          <span>${c.plan}</span>
        </div>
        <div class="td-client-stats-mini">
          <div class="td-mini-stat">
            <strong>${c.workoutsThisMonth}</strong>
            <span>workouts</span>
          </div>
          <div class="td-mini-stat">
            <strong>${c.streak}</strong>
            <span>streak</span>
          </div>
          <div class="td-mini-stat">
            <strong>${lastStr}</strong>
            <span>last active</span>
          </div>
        </div>
        <div class="td-client-status">
          ${isLow ? '<span class="status-badge status-warning">Needs Attention</span>' : '<span class="status-badge status-good">On Track</span>'}
        </div>
      </div>
    `;
  }).join('');
}

function filterClients(filter, btn) {
  document.querySelectorAll('#tab-clients .td-filters .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderClients(filter);
  // Re-apply search after filter change
  const q = (document.getElementById('clientSearchInput') || {}).value || '';
  searchClients(q);
}

function searchClients(q) {
  const term = q.toLowerCase().trim();
  document.querySelectorAll('#clientList .td-client-row').forEach(row => {
    const name = row.dataset.name || '';
    row.style.display = (!term || name.includes(term)) ? '' : 'none';
  });
  // Show empty state if no results
  const list = document.getElementById('clientList');
  if (list) {
    let empty = list.querySelector('.client-search-empty');
    const visible = list.querySelectorAll('.td-client-row:not([style*="none"])').length;
    if (term && visible === 0) {
      if (!empty) {
        empty = document.createElement('div');
        empty.className = 'client-search-empty';
        empty.style.cssText = 'text-align:center;padding:40px 16px;color:var(--text-muted);font-size:0.85rem;';
        empty.textContent = 'No clients match "' + q + '"';
        list.appendChild(empty);
      } else {
        empty.textContent = 'No clients match "' + q + '"';
      }
    } else if (empty) {
      empty.remove();
    }
  }
}

// ===== Client Detail =====
function showClientDetail(id) {
  const c = clients.find(cl => cl.id === id);
  if (!c) return;

  document.getElementById('clientDetailSection').style.display = '';
  document.getElementById('clientDetailName').textContent = c.name;

  const maxMin = Math.max(...c.progress.map(w => w.minutes), 1);

  document.getElementById('clientDetailContent').innerHTML = `
    <div class="progress-stats-row" style="margin-bottom:36px;">
      <div class="progress-stat-card">
        <div class="progress-stat-number">${c.workoutsThisMonth}</div>
        <div class="progress-stat-label">Workouts This Month</div>
      </div>
      <div class="progress-stat-card">
        <div class="progress-stat-number">${c.totalMinutes}</div>
        <div class="progress-stat-label">Total Minutes</div>
      </div>
      <div class="progress-stat-card">
        <div class="progress-stat-number">${c.streak}</div>
        <div class="progress-stat-label">Day Streak</div>
      </div>
      <div class="progress-stat-card">
        <div class="progress-stat-number">${c.goal}</div>
        <div class="progress-stat-label">Fitness Goal</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:36px;">
      <div>
        <h3 style="font-size:0.78rem;font-weight:500;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin-bottom:20px;">Weekly Progress</h3>
        <div class="progress-bar-chart">
          ${c.progress.map(w => `
            <div class="chart-row">
              <div class="chart-label">${w.week}</div>
              <div class="chart-bar-container">
                <div class="chart-bar" style="width: ${(w.minutes / maxMin) * 100}%;"></div>
              </div>
              <div class="chart-value">${w.workouts} workouts &middot; ${w.minutes} min</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div>
        <h3 style="font-size:0.78rem;font-weight:500;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin-bottom:20px;">Recent Workouts</h3>
        ${c.recentWorkouts.map(w => {
          const d = new Date(w.date + 'T00:00:00');
          const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const diffColor = { 'Easy': '#10B981', 'Moderate': '#F59E0B', 'Hard': '#EF4444', 'Intense': '#DC2626' }[w.difficulty] || '#888';
          return `
            <div class="log-entry" style="cursor:default;">
              <div class="log-entry-date">${dateStr}</div>
              <div class="log-entry-info">
                <h4>${w.name}</h4>
                <div class="log-entry-meta">
                  <span>${w.duration} min</span>
                  <span style="color:${diffColor};font-weight:500;">${w.difficulty}</span>
                  ${w.completed ? '<span style="color:#10B981;">&#10003; Completed</span>' : ''}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <div style="margin-top:36px;padding-top:24px;border-top:1px solid var(--border);display:flex;gap:12px;">
      <span style="font-size:0.82rem;color:var(--text-muted);">Member since ${new Date(c.joined + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
    </div>
  `;

  document.getElementById('clientDetailSection').scrollIntoView({ behavior: 'smooth' });
}

function closeClientDetail() {
  document.getElementById('clientDetailSection').style.display = 'none';
}

// ===== Sales List =====
function renderSales() {
  const list = document.getElementById('salesList');
  const totalSales = recentSales.reduce((sum, s) => sum + s.price, 0);
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
  ` + recentSales.map(s => {
    const d = new Date(s.date + 'T00:00:00');
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const earned = (s.price * 0.8).toFixed(2);
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

// Init
renderClients('all');
renderSales();

// ===== Direct Messages =====
const TD_MSG_KEY = 'shapeTrainerMessages';

function getTdMessages() {
  try { return JSON.parse(localStorage.getItem(TD_MSG_KEY)) || {}; } catch(e) { return {}; }
}
function saveTdMessages(msgs) { localStorage.setItem(TD_MSG_KEY, JSON.stringify(msgs)); }

// Demo messages for some clients
(function initTdMessages() {
  const existing = getTdMessages();
  if (Object.keys(existing).length > 0) return;
  const demo = {
    1: [
      { from: 'them', text: 'Hey coach, should I increase weight on squats this week?', time: '9:15 AM', date: _tdDate(1) },
      { from: 'me', text: 'Yes! Go up 10lbs. You handled last week\'s sets great.', time: '9:22 AM', date: _tdDate(1) },
      { from: 'them', text: 'Got it, thanks! Feeling strong 💪', time: '9:24 AM', date: _tdDate(1) },
    ],
    2: [
      { from: 'them', text: 'I\'m feeling sore from yesterday\'s HIIT session', time: '8:00 AM', date: _tdDate(0) },
      { from: 'me', text: 'That\'s normal! Make sure you\'re stretching and staying hydrated. Take it easy today.', time: '8:15 AM', date: _tdDate(0) },
    ],
    4: [
      { from: 'me', text: 'Great work on your deadlift PR today Priya!', time: '6:30 PM', date: _tdDate(0) },
      { from: 'them', text: 'Thank you!! Couldn\'t have done it without your programming 🙏', time: '6:45 PM', date: _tdDate(0) },
    ],
    5: [
      { from: 'me', text: 'Hey Tom, noticed you haven\'t logged in a while. Everything ok?', time: '10:00 AM', date: _tdDate(3) },
      { from: 'them', text: 'Yeah been busy with work. I\'ll try to get back this week.', time: '2:30 PM', date: _tdDate(3) },
      { from: 'me', text: 'No pressure! Even a 20 min session counts. Let me know if you need a modified plan.', time: '2:45 PM', date: _tdDate(3) },
    ],
    8: [
      { from: 'them', text: 'Can we adjust my program to focus more on glutes?', time: '7:00 PM', date: _tdDate(2) },
      { from: 'me', text: 'Absolutely! I\'ll update your next week\'s plan with more hip thrusts and RDLs.', time: '7:15 PM', date: _tdDate(2) },
    ],
  };
  saveTdMessages(demo);
})();

let tdActiveChat = null;

function renderTdMsgSidebar() {
  const msgs = getTdMessages();
  const sidebar = document.getElementById('tdMsgSidebar');

  sidebar.innerHTML = clients.map(c => {
    const convo = msgs[c.id] || [];
    const lastMsg = convo.length > 0 ? convo[convo.length - 1] : null;
    const initials = c.name.split(' ').map(n => n[0]).join('');
    const preview = lastMsg ? (lastMsg.from === 'me' ? 'You: ' : '') + lastMsg.text : 'No messages yet';
    const time = lastMsg ? lastMsg.time : '';

    return `
      <div class="td-msg-contact ${tdActiveChat === c.id ? 'active' : ''}" onclick="openTdChat(${c.id})">
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

function openTdChat(clientId) {
  tdActiveChat = clientId;
  const c = clients.find(cl => cl.id === clientId);
  if (!c) return;

  const msgs = getTdMessages();
  const convo = msgs[clientId] || [];
  const initials = c.name.split(' ').map(n => n[0]).join('');

  const chatDiv = document.getElementById('tdMsgChat');
  chatDiv.innerHTML = `
    <div class="td-msg-chat-header">
      <div class="avatar">${initials}</div>
      <div>
        <h4>${c.name}</h4>
        <span>${c.plan}</span>
      </div>
    </div>
    <div class="td-msg-chat-body" id="tdMsgBody">
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
      <input type="text" id="tdMsgInput" placeholder="Type a message..." onkeydown="if(event.key==='Enter')sendTdMessage()">
      <button onclick="sendTdMessage()">Send</button>
    </div>
  `;

  const body = document.getElementById('tdMsgBody');
  body.scrollTop = body.scrollHeight;
  document.getElementById('tdMsgInput').focus();
  renderTdMsgSidebar();
}

function sendTdMessage() {
  if (!tdActiveChat) return;
  const input = document.getElementById('tdMsgInput');
  const text = input.value.trim();
  if (!text) return;

  const msgs = getTdMessages();
  if (!msgs[tdActiveChat]) msgs[tdActiveChat] = [];

  const now = new Date();
  const hours = now.getHours();
  const mins = now.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const timeStr = (hours % 12 || 12) + ':' + (mins < 10 ? '0' : '') + mins + ' ' + ampm;

  msgs[tdActiveChat].push({
    from: 'me', text: text, time: timeStr, date: new Date().toISOString().split('T')[0]
  });
  saveTdMessages(msgs);

  input.value = '';
  openTdChat(tdActiveChat);
  showToast('Message sent!');
}

// Also add "Message" button to client rows
const origRenderClients = renderClients;
renderClients = function(filter) {
  origRenderClients(filter);
  // Add message buttons to each client row
  document.querySelectorAll('.td-client-row').forEach(row => {
    const onclick = row.getAttribute('onclick');
    const idMatch = onclick && onclick.match(/showClientDetail\((\d+)\)/);
    if (idMatch) {
      const id = idMatch[1];
      const actionsDiv = document.createElement('div');
      actionsDiv.style.cssText = 'margin-left:auto;';
      actionsDiv.innerHTML = '<button class="btn btn-sm btn-outline" onclick="event.stopPropagation();openTdChat(' + id + ');document.getElementById(\'tdMessagesPanel\').scrollIntoView({behavior:\'smooth\'})" style="font-size:0.72rem;padding:6px 14px;">Message</button>';
      row.appendChild(actionsDiv);
    }
  });
};

// Init messages
renderTdMsgSidebar();

// Re-render clients to add message buttons
renderClients('all');

// ===== Check-In Scheduling =====
const TD_CHECKIN_KEY = 'shapeTrainerCheckIns';

function getTdCheckIns() {
  try { return JSON.parse(localStorage.getItem(TD_CHECKIN_KEY)) || []; } catch(e) { return []; }
}
function saveTdCheckIns(data) { localStorage.setItem(TD_CHECKIN_KEY, JSON.stringify(data)); }

// Seed demo check-in data
(function initTdCheckIns() {
  const existing = getTdCheckIns();
  if (existing.length > 0) return;
  const demo = [
    { clientId: 1, frequency: 'weekly', day: 'Monday', time: '10:00 AM', notes: 'Review weekly lifts and form', createdAt: _tdDate(14), active: true },
    { clientId: 3, frequency: 'bi-weekly', day: 'Wednesday', time: '2:00 PM', notes: 'Check strength progress', createdAt: _tdDate(10), active: true },
    { clientId: 4, frequency: 'monthly', day: 'Friday', time: '9:00 AM', notes: 'Monthly progress photos and measurements', createdAt: _tdDate(20), active: true },
  ];
  saveTdCheckIns(demo);
})();

let _tdCheckInClientId = null;

function openTdCheckInModal(clientId) {
  _tdCheckInClientId = clientId;
  const c = clients.find(cl => cl.id === clientId);
  if (!c) return;

  document.getElementById('tdCheckInClientName').textContent = c.name;
  // Reset selections
  document.querySelectorAll('.td-checkin-freq-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.td-checkin-day-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tdCheckInTime').value = '10:00';
  document.getElementById('tdCheckInNotes').value = '';
  document.getElementById('tdCheckInModal').classList.add('active');
}

function closeTdCheckInModal() {
  _tdCheckInClientId = null;
  document.getElementById('tdCheckInModal').classList.remove('active');
}

function selectTdCheckInFreq(btn) {
  document.querySelectorAll('.td-checkin-freq-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function selectTdCheckInDay(btn) {
  document.querySelectorAll('.td-checkin-day-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function _formatTime12(time24) {
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
}

function saveTdCheckIn() {
  if (!_tdCheckInClientId) return;

  const freqBtn = document.querySelector('.td-checkin-freq-btn.active');
  const dayBtn = document.querySelector('.td-checkin-day-btn.active');
  const timeInput = document.getElementById('tdCheckInTime').value;
  const notes = document.getElementById('tdCheckInNotes').value.trim();

  if (!freqBtn) { showToast('Please select a frequency'); return; }
  if (!dayBtn) { showToast('Please select a day'); return; }
  if (!timeInput) { showToast('Please select a time'); return; }

  const checkIns = getTdCheckIns();
  checkIns.push({
    clientId: _tdCheckInClientId,
    frequency: freqBtn.dataset.value,
    day: dayBtn.dataset.value,
    time: _formatTime12(timeInput),
    notes: notes,
    createdAt: new Date().toISOString().split('T')[0],
    active: true
  });
  saveTdCheckIns(checkIns);
  closeTdCheckInModal();
  showToast('Check-in scheduled!');

  // Refresh detail view if it's open for this client
  const detailSection = document.getElementById('clientDetailSection');
  if (detailSection.style.display !== 'none') {
    const nameEl = document.getElementById('clientDetailName');
    const c = clients.find(cl => cl.id === _tdCheckInClientId);
    if (c && nameEl.textContent === c.name) {
      showClientDetail(_tdCheckInClientId);
    }
  }
}

function cancelTdCheckIn(clientId, index) {
  const checkIns = getTdCheckIns();
  const clientCheckIns = checkIns.filter(ci => ci.clientId === clientId && ci.active);
  if (index >= 0 && index < clientCheckIns.length) {
    // Find the actual index in the full array
    let count = 0;
    for (let i = 0; i < checkIns.length; i++) {
      if (checkIns[i].clientId === clientId && checkIns[i].active) {
        if (count === index) {
          checkIns[i].active = false;
          break;
        }
        count++;
      }
    }
    saveTdCheckIns(checkIns);
    showToast('Check-in cancelled');
    showClientDetail(clientId);
  }
}

function _renderTdCheckInsSection(clientId) {
  const checkIns = getTdCheckIns().filter(ci => ci.clientId === clientId && ci.active);
  if (checkIns.length === 0) {
    return `
      <div style="margin-top:36px;padding-top:24px;border-top:1px solid var(--border);">
        <h3 style="font-size:0.78rem;font-weight:500;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin-bottom:16px;">Upcoming Check-Ins</h3>
        <p style="font-size:0.82rem;color:var(--text-muted);">No check-ins scheduled.
          <a href="javascript:void(0)" onclick="openTdCheckInModal(${clientId})" style="color:var(--accent);text-decoration:underline;cursor:pointer;">Schedule one</a>
        </p>
      </div>
    `;
  }
  const cards = checkIns.map((ci, idx) => {
    const freqLabel = ci.frequency === 'bi-weekly' ? 'Bi-Weekly' : ci.frequency.charAt(0).toUpperCase() + ci.frequency.slice(1);
    return `
      <div class="td-checkin-card">
        <div class="td-checkin-card-info">
          <div class="td-ci-freq">${freqLabel} &mdash; ${ci.day}s at ${ci.time}</div>
          <div class="td-ci-detail">Since ${new Date(ci.createdAt + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
          ${ci.notes ? `<div class="td-ci-notes">"${ci.notes}"</div>` : ''}
        </div>
        <button class="td-checkin-cancel-btn" onclick="cancelTdCheckIn(${clientId}, ${idx})">Cancel</button>
      </div>
    `;
  }).join('');

  return `
    <div style="margin-top:36px;padding-top:24px;border-top:1px solid var(--border);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h3 style="font-size:0.78rem;font-weight:500;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin:0;">Upcoming Check-Ins</h3>
        <button class="btn btn-sm btn-outline" onclick="openTdCheckInModal(${clientId})" style="font-size:0.72rem;padding:6px 14px;">+ Add Check-In</button>
      </div>
      ${cards}
    </div>
  `;
}

// Monkey-patch showClientDetail to inject check-ins section
const _origShowClientDetail = showClientDetail;
showClientDetail = function(id) {
  _origShowClientDetail(id);
  // Append check-ins section to the detail content
  const detailContent = document.getElementById('clientDetailContent');
  if (detailContent) {
    detailContent.insertAdjacentHTML('beforeend', _renderTdCheckInsSection(id));
  }
};

// Monkey-patch renderClients again to also add "Schedule Check-In" button
const _origRenderClientsWithMsg = renderClients;
renderClients = function(filter) {
  _origRenderClientsWithMsg(filter);
  document.querySelectorAll('.td-client-row').forEach(row => {
    const onclick = row.getAttribute('onclick');
    const idMatch = onclick && onclick.match(/showClientDetail\((\d+)\)/);
    if (idMatch) {
      const id = idMatch[1];
      // Find the actions div (already added by the message monkey-patch)
      const existingActions = row.querySelector('div[style*="margin-left:auto"]');
      if (existingActions) {
        const checkInBtn = document.createElement('button');
        checkInBtn.className = 'btn btn-sm btn-outline';
        checkInBtn.style.cssText = 'font-size:0.72rem;padding:6px 14px;margin-left:6px;border-color:var(--accent);color:var(--accent);';
        checkInBtn.textContent = 'Check-In';
        checkInBtn.onclick = function(e) {
          e.stopPropagation();
          openTdCheckInModal(Number(id));
        };
        existingActions.appendChild(checkInBtn);
      }
    }
  });
};

// Re-render to apply check-in buttons
renderClients('all');

// ===== Check-in Banner: flagged clients with specific issues =====
function tdGetFlaggedClients() {
  const today = new Date();
  return clients.map(c => {
    const lastDate = new Date(c.lastWorkout + 'T00:00:00');
    const daysAgo = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
    const issues = [];
    if (c.status === 'inactive' || daysAgo >= 7) {
      issues.push(`Hasn't worked out in ${daysAgo} days`);
    } else if (c.workoutsThisMonth < 3) {
      issues.push(`Only ${c.workoutsThisMonth} workout${c.workoutsThisMonth === 1 ? '' : 's'} this month`);
    } else if (c.streak === 0 && c.workoutsThisMonth < 5) {
      issues.push('Lost streak · low activity');
    }
    return { client: c, issue: issues[0], daysAgo };
  }).filter(x => x.issue);
}

function tdOpenFlaggedClient(id) {
  const btn = document.querySelector('.td-tab-btn[data-tab=clients]');
  if (typeof switchTrainerTab === 'function') switchTrainerTab('clients', btn);
  setTimeout(() => {
    if (typeof showClientDetail === 'function') showClientDetail(id);
    const detail = document.getElementById('clientDetailSection');
    if (detail && detail.scrollIntoView) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 60);
}

function renderTdCheckinBanner() {
  const list = document.getElementById('tdCheckinBannerList');
  const title = document.getElementById('tdCheckinBannerTitle');
  const banner = document.getElementById('tdCheckinBanner');
  if (!list || !banner) return;
  const flagged = tdGetFlaggedClients();
  if (!flagged.length) {
    banner.style.display = 'none';
    return;
  }
  if (title) title.textContent = `${flagged.length} client${flagged.length === 1 ? '' : 's'} need${flagged.length === 1 ? 's' : ''} attention`;
  list.innerHTML = flagged.map(f => {
    const c = f.client;
    const initials = c.name.split(' ').map(n => n[0]).join('');
    return `
      <button type="button" class="td-checkin-banner-row" onclick="tdOpenFlaggedClient(${c.id})">
        <div class="avatar">${initials}</div>
        <div class="td-checkin-banner-row-info">
          <div class="td-checkin-banner-row-name">${c.name}</div>
          <div class="td-checkin-banner-row-issue">${f.issue}</div>
        </div>
        <span class="td-checkin-banner-row-arrow">›</span>
      </button>
    `;
  }).join('');
}

renderTdCheckinBanner();
