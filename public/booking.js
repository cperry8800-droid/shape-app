// Shape booking modal — include on any provider profile page.
// Usage:
//   <script src="booking.js"></script>
//   <button onclick="shapeBook.open({ providerId: 'uuid', providerRole: 'trainer', providerName: 'Marcus' })">
//     Book a session
//   </button>
(function () {
  var MODAL_HTML =
    '<div id="shapeBookBackdrop" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:9998;backdrop-filter:blur(6px);"></div>' +
    '<div id="shapeBookModal" role="dialog" aria-modal="true" style="display:none;position:fixed;z-index:9999;left:50%;top:50%;transform:translate(-50%,-50%);width:min(520px,92vw);max-height:92vh;overflow-y:auto;background:#1A1A1A;color:#fff;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:28px 26px;font-family:Inter,system-ui,sans-serif;">' +
    '  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">' +
    '    <div>' +
    '      <div id="shapeBookTitle" style="font-size:1.3rem;font-weight:300;letter-spacing:-0.02em;">Book a session</div>' +
    '      <div id="shapeBookSub" style="font-size:0.82rem;color:rgba(255,255,255,0.55);margin-top:4px;">with your provider</div>' +
    '    </div>' +
    '    <button id="shapeBookClose" aria-label="Close" style="background:none;border:none;color:rgba(255,255,255,0.5);font-size:1.5rem;cursor:pointer;line-height:1;padding:0 4px;">&times;</button>' +
    '  </div>' +
    '  <div id="shapeBookBody" style="margin-top:20px;">' +
    '    <div class="sb-field">' +
    '      <label>Session type</label>' +
    '      <div class="sb-type-grid">' +
    '        <label class="sb-type"><input type="radio" name="sbType" value="video" checked><span>Video call</span><em>Auto-generated link</em></label>' +
    '        <label class="sb-type"><input type="radio" name="sbType" value="phone"><span>Phone call</span><em>Provider calls you</em></label>' +
    '        <label class="sb-type"><input type="radio" name="sbType" value="inperson"><span>In person</span><em>Local sessions</em></label>' +
    '        <label class="sb-type"><input type="radio" name="sbType" value="message"><span>Async message</span><em>No live call</em></label>' +
    '      </div>' +
    '    </div>' +
    '    <div class="sb-field sb-phone-field" style="display:none;">' +
    '      <label>Your phone number</label>' +
    '      <input type="tel" id="sbPhone" placeholder="(555) 123-4567">' +
    '    </div>' +
    '    <div class="sb-row">' +
    '      <div class="sb-field"><label>Date</label><input type="date" id="sbDate"></div>' +
    '      <div class="sb-field"><label>Time</label><input type="time" id="sbTime"></div>' +
    '    </div>' +
    '    <div class="sb-field">' +
    '      <label>Duration</label>' +
    '      <select id="sbDuration"><option value="15">15 min</option><option value="30" selected>30 min</option><option value="45">45 min</option><option value="60">60 min</option></select>' +
    '    </div>' +
    '    <div class="sb-field">' +
    '      <label>Notes for your provider (optional)</label>' +
    '      <textarea id="sbNotes" rows="3" placeholder="Goals, questions, anything they should know..."></textarea>' +
    '    </div>' +
    '    <div id="sbError" style="display:none;color:#f87171;font-size:0.82rem;margin-bottom:10px;"></div>' +
    '    <button id="sbSubmit" class="sb-submit">Send request</button>' +
    '    <p style="font-size:0.72rem;color:rgba(255,255,255,0.45);text-align:center;margin-top:14px;">Your provider will confirm or propose a new time.</p>' +
    '  </div>' +
    '  <div id="shapeBookSuccess" style="display:none;text-align:center;padding:16px 0 4px;">' +
    '    <div style="font-size:2rem;margin-bottom:8px;">&#10003;</div>' +
    '    <div style="font-size:1.1rem;font-weight:400;margin-bottom:6px;">Request sent</div>' +
    '    <div style="font-size:0.86rem;color:rgba(255,255,255,0.6);margin-bottom:20px;">You\'ll see it under Upcoming sessions on your dashboard.</div>' +
    '    <button id="sbDone" class="sb-submit">Done</button>' +
    '  </div>' +
    '</div>';

  var STYLE_HTML =
    '<style>' +
    '#shapeBookModal .sb-field{margin-bottom:16px;}' +
    '#shapeBookModal .sb-field label{display:block;font-size:0.7rem;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.55);margin-bottom:8px;}' +
    '#shapeBookModal .sb-field input[type=date],#shapeBookModal .sb-field input[type=time],#shapeBookModal .sb-field input[type=tel],#shapeBookModal .sb-field select,#shapeBookModal .sb-field textarea{' +
    '  width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);color:#fff;padding:11px 14px;border-radius:10px;font-size:0.92rem;font-family:inherit;box-sizing:border-box;outline:none;transition:border-color 0.2s;' +
    '}' +
    '#shapeBookModal .sb-field input:focus,#shapeBookModal .sb-field select:focus,#shapeBookModal .sb-field textarea:focus{border-color:#fff;}' +
    '#shapeBookModal .sb-field textarea{resize:vertical;min-height:70px;}' +
    '#shapeBookModal .sb-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;}' +
    '#shapeBookModal .sb-type-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}' +
    '#shapeBookModal .sb-type{display:block;cursor:pointer;padding:12px 14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:10px;transition:all 0.2s;}' +
    '#shapeBookModal .sb-type:hover{border-color:rgba(255,255,255,0.3);}' +
    '#shapeBookModal .sb-type input{display:none;}' +
    '#shapeBookModal .sb-type span{display:block;font-size:0.88rem;font-weight:500;margin-bottom:2px;}' +
    '#shapeBookModal .sb-type em{font-size:0.7rem;color:rgba(255,255,255,0.5);font-style:normal;}' +
    '#shapeBookModal .sb-type.active{background:rgba(255,255,255,0.08);border-color:#fff;}' +
    '#shapeBookModal .sb-submit{width:100%;padding:14px;background:#fff;color:#0a0a0a;border:none;border-radius:999px;font-size:0.92rem;font-weight:600;cursor:pointer;font-family:inherit;transition:opacity 0.2s;}' +
    '#shapeBookModal .sb-submit:hover{opacity:0.85;}' +
    '#shapeBookModal .sb-submit:disabled{opacity:0.5;cursor:not-allowed;}' +
    '</style>';

  function ensureInjected() {
    if (document.getElementById('shapeBookModal')) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = STYLE_HTML + MODAL_HTML;
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    bind();
  }

  var currentOpts = null;

  function bind() {
    document.getElementById('shapeBookClose').addEventListener('click', close);
    document.getElementById('shapeBookBackdrop').addEventListener('click', close);
    document.getElementById('sbDone').addEventListener('click', close);
    document.getElementById('sbSubmit').addEventListener('click', submit);

    // Type selection highlighting + phone field toggle
    document.querySelectorAll('#shapeBookModal input[name="sbType"]').forEach(function (r) {
      r.addEventListener('change', syncType);
    });
    syncType();
  }

  function syncType() {
    var val = (document.querySelector('#shapeBookModal input[name="sbType"]:checked') || {}).value;
    document.querySelectorAll('#shapeBookModal .sb-type').forEach(function (el) {
      var input = el.querySelector('input');
      el.classList.toggle('active', input && input.checked);
    });
    document.querySelector('#shapeBookModal .sb-phone-field').style.display = val === 'phone' ? '' : 'none';
  }

  function open(opts) {
    ensureInjected();
    currentOpts = opts || {};
    document.getElementById('shapeBookTitle').textContent = 'Book a session';
    document.getElementById('shapeBookSub').textContent =
      'with ' + (currentOpts.providerName || 'your provider');

    // Default date = tomorrow, time = 9:00 AM
    var tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    var yyyy = tomorrow.getFullYear();
    var mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    var dd = String(tomorrow.getDate()).padStart(2, '0');
    document.getElementById('sbDate').value = yyyy + '-' + mm + '-' + dd;
    document.getElementById('sbTime').value = '09:00';
    document.getElementById('sbNotes').value = '';
    document.getElementById('sbPhone').value = '';
    document.getElementById('sbDuration').value = '30';
    document.querySelector('#shapeBookModal input[name="sbType"][value="video"]').checked = true;
    syncType();

    document.getElementById('sbError').style.display = 'none';
    document.getElementById('shapeBookBody').style.display = '';
    document.getElementById('shapeBookSuccess').style.display = 'none';
    document.getElementById('sbSubmit').disabled = false;
    document.getElementById('sbSubmit').textContent = 'Send request';

    document.getElementById('shapeBookBackdrop').style.display = 'block';
    document.getElementById('shapeBookModal').style.display = 'block';
  }

  function close() {
    document.getElementById('shapeBookBackdrop').style.display = 'none';
    document.getElementById('shapeBookModal').style.display = 'none';
  }

  function showError(msg) {
    var el = document.getElementById('sbError');
    el.textContent = msg;
    el.style.display = '';
  }

  async function submit() {
    if (!window.shapeDb) { showError('Auth not loaded. Refresh and try again.'); return; }
    var session = await window.shapeDb.getSession();
    if (!session) {
      showError('Please log in or sign up to book a session.');
      setTimeout(function () { window.location.href = 'login.html'; }, 1200);
      return;
    }
    if (!currentOpts || !currentOpts.providerId) {
      showError('Missing provider info.'); return;
    }
    var date = document.getElementById('sbDate').value;
    var time = document.getElementById('sbTime').value;
    if (!date || !time) { showError('Pick a date and time.'); return; }
    var scheduledAt = new Date(date + 'T' + time).toISOString();
    var type = (document.querySelector('#shapeBookModal input[name="sbType"]:checked') || {}).value || 'video';
    var phone = document.getElementById('sbPhone').value.trim();
    if (type === 'phone' && !phone) { showError('Enter a phone number so they can call you.'); return; }

    var btn = document.getElementById('sbSubmit');
    btn.disabled = true; btn.textContent = 'Sending...';

    var res = await window.shapeDb.requestSession({
      providerId: currentOpts.providerId,
      providerRole: currentOpts.providerRole || 'trainer',
      type: type,
      scheduledAt: scheduledAt,
      durationMin: parseInt(document.getElementById('sbDuration').value, 10) || 30,
      notes: document.getElementById('sbNotes').value.trim(),
      clientPhone: phone
    });

    if (res && res.error) {
      showError(res.error.message || 'Could not send request.');
      btn.disabled = false; btn.textContent = 'Send request';
      return;
    }
    document.getElementById('shapeBookBody').style.display = 'none';
    document.getElementById('shapeBookSuccess').style.display = '';
  }

  window.shapeBook = { open: open, close: close };
})();
