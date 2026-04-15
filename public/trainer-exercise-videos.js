// Shape — trainer-uploaded exercise demo videos.
//
// Lets trainers attach their own video demos to any exercise they use
// in the program/workout builder. Videos can be either:
//   1. A YouTube URL (just stores the video ID — tiny)
//   2. An uploaded video file (stored as a data URL in localStorage;
//      a 6 MB per-file soft cap keeps us well under browser limits)
//
// The custom library is keyed by normalized exercise name, so once a
// trainer attaches a video to "Bench Press" that demo becomes the
// default for every Bench Press in their programs. When a client opens
// the exercise in clients.html / live-workout.html, exercise-videos.js
// checks this library FIRST before falling back to the curated
// default library.

(function () {
  if (typeof window === 'undefined') return;

  var STORAGE_KEY = 'shapeTrainerCustomVideos_v1';
  var MAX_FILE_BYTES = 6 * 1024 * 1024; // 6 MB soft cap

  function norm(s) {
    return (s || '')
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function save(db) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); return true; }
    catch (e) {
      alert('Could not save video — your browser storage is full. Try a shorter clip or a YouTube URL instead.');
      return false;
    }
  }

  function get(name) {
    var db = load();
    return db[norm(name)] || null;
  }
  function set(name, entry) {
    var db = load();
    db[norm(name)] = entry;
    return save(db);
  }
  function remove(name) {
    var db = load();
    delete db[norm(name)];
    save(db);
  }

  // Extract a YouTube video ID from any common URL shape.
  function extractYouTubeId(url) {
    if (!url) return null;
    url = url.trim();
    var patterns = [
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = url.match(patterns[i]);
      if (m) return m[1];
    }
    // Raw 11-char ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
    return null;
  }

  // ===== Modal (trainer-side) — upload / link / clear a video =====
  var modalBuilt = false;
  var currentExerciseInput = null;

  function buildModal() {
    if (modalBuilt) return;
    modalBuilt = true;

    var style = document.createElement('style');
    style.textContent =
      '.stv-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:10000;display:none;align-items:center;justify-content:center;padding:20px;}' +
      '.stv-overlay.open{display:flex;}' +
      '.stv-box{background:#1A1A1A;border:1px solid rgba(255,255,255,0.1);border-radius:14px;max-width:480px;width:100%;padding:24px;color:#fff;box-shadow:0 20px 60px rgba(0,0,0,0.5);}' +
      '.stv-box h3{font-size:1.1rem;font-weight:500;margin:0 0 6px;}' +
      '.stv-box p.stv-sub{font-size:0.8rem;color:#888;margin:0 0 18px;font-weight:300;}' +
      '.stv-label{font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:#888;margin:16px 0 8px;font-weight:500;}' +
      '.stv-input{width:100%;padding:10px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:#0F0F0F;color:#fff;font-size:0.85rem;font-family:inherit;box-sizing:border-box;}' +
      '.stv-input:focus{outline:none;border-color:#2DD4BF;}' +
      '.stv-divider{display:flex;align-items:center;gap:12px;margin:18px 0 0;color:#555;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.08em;}' +
      '.stv-divider::before,.stv-divider::after{content:"";flex:1;height:1px;background:rgba(255,255,255,0.08);}' +
      '.stv-file-btn{display:block;width:100%;padding:12px;border:1.5px dashed rgba(255,255,255,0.15);border-radius:8px;background:transparent;color:#ccc;font-size:0.82rem;cursor:pointer;text-align:center;margin-top:8px;transition:border-color .15s, color .15s;}' +
      '.stv-file-btn:hover{border-color:#2DD4BF;color:#2DD4BF;}' +
      '.stv-current{margin-top:18px;padding:12px;border-radius:8px;background:rgba(45,212,191,0.08);border:1px solid rgba(45,212,191,0.25);font-size:0.8rem;display:none;}' +
      '.stv-current.show{display:block;}' +
      '.stv-actions{display:flex;gap:8px;margin-top:22px;justify-content:flex-end;flex-wrap:wrap;}' +
      '.stv-btn{padding:9px 16px;border-radius:8px;font-size:0.8rem;font-weight:500;cursor:pointer;border:1px solid rgba(255,255,255,0.12);background:transparent;color:#fff;transition:background .15s;font-family:inherit;}' +
      '.stv-btn:hover{background:rgba(255,255,255,0.05);}' +
      '.stv-btn-primary{background:#2DD4BF;color:#000;border-color:#2DD4BF;}' +
      '.stv-btn-primary:hover{background:#26b3a2;}' +
      '.stv-btn-danger{color:#EF4444;border-color:rgba(239,68,68,0.3);}' +
      '.stv-btn-danger:hover{background:rgba(239,68,68,0.1);}';
    document.head.appendChild(style);

    var overlay = document.createElement('div');
    overlay.className = 'stv-overlay';
    overlay.id = 'stvOverlay';
    overlay.innerHTML =
      '<div class="stv-box" onclick="event.stopPropagation();">' +
        '<h3 id="stvTitle">Attach a demo video</h3>' +
        '<p class="stv-sub" id="stvSub">Clients will see this when they tap &ldquo;Watch demo&rdquo; on this exercise.</p>' +
        '<div class="stv-current" id="stvCurrent"></div>' +
        '<div class="stv-label">YouTube URL</div>' +
        '<input type="text" class="stv-input" id="stvYouTubeInput" placeholder="https://youtube.com/watch?v=...">' +
        '<div class="stv-divider">or</div>' +
        '<input type="file" id="stvFileInput" accept="video/*" style="display:none;">' +
        '<button type="button" class="stv-file-btn" id="stvFilePickBtn">Upload a video file</button>' +
        '<div id="stvFileName" style="font-size:0.75rem;color:#888;margin-top:8px;text-align:center;"></div>' +
        '<div class="stv-actions">' +
          '<button type="button" class="stv-btn stv-btn-danger" id="stvClearBtn" style="display:none;">Remove video</button>' +
          '<button type="button" class="stv-btn" onclick="window.shapeTrainerVideos.closeModal()">Cancel</button>' +
          '<button type="button" class="stv-btn stv-btn-primary" id="stvSaveBtn">Save</button>' +
        '</div>' +
      '</div>';
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });
    document.body.appendChild(overlay);

    var fileInput = document.getElementById('stvFileInput');
    var filePickBtn = document.getElementById('stvFilePickBtn');
    filePickBtn.addEventListener('click', function () { fileInput.click(); });

    var pendingFileDataUrl = null;
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) { pendingFileDataUrl = null; document.getElementById('stvFileName').textContent = ''; return; }
      if (f.size > MAX_FILE_BYTES) {
        alert('That file is ' + (f.size / 1024 / 1024).toFixed(1) + ' MB. Max is ' + (MAX_FILE_BYTES / 1024 / 1024) + ' MB — please use a shorter clip or a YouTube URL.');
        fileInput.value = '';
        return;
      }
      document.getElementById('stvFileName').textContent = 'Selected: ' + f.name + ' (' + (f.size / 1024 / 1024).toFixed(1) + ' MB)';
      var reader = new FileReader();
      reader.onload = function () { pendingFileDataUrl = reader.result; };
      reader.readAsDataURL(f);
      // Clear the URL field — file wins if both are set.
      document.getElementById('stvYouTubeInput').value = '';
    });

    document.getElementById('stvSaveBtn').addEventListener('click', function () {
      if (!currentExerciseInput) return;
      var exName = currentExerciseInput.value.trim();
      if (!exName) {
        alert('Name the exercise first (in the Exercise column), then attach a video.');
        return;
      }
      var urlVal = document.getElementById('stvYouTubeInput').value.trim();
      if (pendingFileDataUrl) {
        var ok = set(exName, { type: 'file', value: pendingFileDataUrl, savedAt: Date.now() });
        if (!ok) return;
      } else if (urlVal) {
        var ytId = extractYouTubeId(urlVal);
        if (!ytId) { alert('That doesn\u2019t look like a valid YouTube URL. Paste a link like https://youtube.com/watch?v=...'); return; }
        set(exName, { type: 'youtube', value: ytId, savedAt: Date.now() });
      } else {
        alert('Paste a YouTube URL or upload a video file.');
        return;
      }
      pendingFileDataUrl = null;
      closeModal();
      refreshRowBadges();
    });

    document.getElementById('stvClearBtn').addEventListener('click', function () {
      if (!currentExerciseInput) return;
      var exName = currentExerciseInput.value.trim();
      if (!exName) return;
      if (confirm('Remove the demo video for "' + exName + '"?')) {
        remove(exName);
        closeModal();
        refreshRowBadges();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });
  }

  function openModal(triggerBtn) {
    buildModal();
    var row = triggerBtn && triggerBtn.closest ? triggerBtn.closest('.pb-exercise-row') : null;
    if (!row) return;
    var exInput = row.querySelector('input.pb-input');
    currentExerciseInput = exInput;

    var nameVal = (exInput && exInput.value.trim()) || '';
    var existing = nameVal ? get(nameVal) : null;

    document.getElementById('stvTitle').textContent = nameVal ? 'Demo video — ' + nameVal : 'Attach a demo video';
    document.getElementById('stvSub').innerHTML = nameVal
      ? 'Clients will see this when they tap &ldquo;Watch demo&rdquo; on ' + nameVal + '.'
      : 'Name the exercise first, then attach a video.';

    document.getElementById('stvYouTubeInput').value = '';
    document.getElementById('stvFileInput').value = '';
    document.getElementById('stvFileName').textContent = '';

    var currentBox = document.getElementById('stvCurrent');
    var clearBtn = document.getElementById('stvClearBtn');
    if (existing) {
      currentBox.classList.add('show');
      currentBox.innerHTML = existing.type === 'youtube'
        ? '<strong>Current:</strong> YouTube video attached (ID ' + existing.value + ')'
        : '<strong>Current:</strong> Uploaded video file attached';
      clearBtn.style.display = '';
    } else {
      currentBox.classList.remove('show');
      currentBox.innerHTML = '';
      clearBtn.style.display = 'none';
    }

    document.getElementById('stvOverlay').classList.add('open');
  }

  function closeModal() {
    var ov = document.getElementById('stvOverlay');
    if (ov) ov.classList.remove('open');
    currentExerciseInput = null;
  }

  // Walk every .pb-exercise-row and highlight rows whose exercise name
  // has a custom video attached. Called after renders and after save.
  function refreshRowBadges() {
    var rows = document.querySelectorAll('.pb-exercise-row');
    rows.forEach(function (row) {
      var input = row.querySelector('input.pb-input');
      var btn = row.querySelector('.pb-video-btn');
      if (!input || !btn) return;
      var entry = input.value.trim() ? get(input.value.trim()) : null;
      btn.classList.toggle('has-video', !!entry);
      btn.title = entry ? 'Demo video attached — click to update' : 'Attach demo video';
    });
  }

  // Refresh badges when trainer edits the exercise name.
  document.addEventListener('input', function (e) {
    if (e.target && e.target.classList && e.target.classList.contains('pb-input')) {
      var row = e.target.closest('.pb-exercise-row');
      if (row && row.querySelector('input.pb-input') === e.target) {
        var btn = row.querySelector('.pb-video-btn');
        if (btn) {
          var entry = e.target.value.trim() ? get(e.target.value.trim()) : null;
          btn.classList.toggle('has-video', !!entry);
        }
      }
    }
  });

  // Initial pass once DOM is ready.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshRowBadges);
  } else {
    refreshRowBadges();
  }
  setTimeout(refreshRowBadges, 500);

  // ===== Public API =====
  window.shapeTrainerVideos = {
    get: get,
    set: set,
    remove: remove,
    openModal: openModal,
    closeModal: closeModal,
    refreshRowBadges: refreshRowBadges,
    extractYouTubeId: extractYouTubeId
  };
  // Convenience alias used from inline onclick.
  window.openTrainerVideoModal = function (btn) { openModal(btn); };
})();
