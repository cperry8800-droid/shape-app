// Shape — shared exercise demo video library.
//
// Maps exercise names to YouTube demo video IDs so clients can watch
// proper form straight from the workout screens. Includes a fuzzy
// lookup (case/punctuation/plural-insensitive) and a lightweight
// modal player used across clients.html, live-workout.html, and the
// trainer program builder.
//
// To add or swap a video: update EXERCISE_VIDEO_LIBRARY below with the
// YouTube ID (the "v=" part of a watch URL).

(function () {
  if (typeof window === 'undefined') return;

  // ===== Library =====
  // Curated free-to-view demo videos. Keys are normalized exercise
  // names; the helper below handles casing and light variations.
  var EXERCISE_VIDEO_LIBRARY = {
    // Push
    'bench press':         { id: 'rT7DgCr-3pg', channel: 'Jeff Nippard' },
    'incline bench press': { id: 'SrqOu55lrYU', channel: 'ScottHermanFitness' },
    'incline db press':    { id: '8iPEnn-ltC8', channel: 'ATHLEAN-X' },
    'incline dumbbell press': { id: '8iPEnn-ltC8', channel: 'ATHLEAN-X' },
    'dumbbell press':      { id: 'VmB1G1K7v94', channel: 'ATHLEAN-X' },
    'overhead press':      { id: '2yjwXTZQDDI', channel: 'Jeff Nippard' },
    'military press':      { id: '2yjwXTZQDDI', channel: 'Jeff Nippard' },
    'shoulder press':      { id: 'qEwKCR5JCog', channel: 'ScottHermanFitness' },
    'push-up':             { id: 'IODxDxX7oi4', channel: 'Calisthenicmovement' },
    'push up':             { id: 'IODxDxX7oi4', channel: 'Calisthenicmovement' },
    'push-ups':            { id: 'IODxDxX7oi4', channel: 'Calisthenicmovement' },
    'tricep dips':         { id: '2z8JmcrW-As', channel: 'ScottHermanFitness' },
    'dips':                { id: '2z8JmcrW-As', channel: 'ScottHermanFitness' },
    'tricep extension':    { id: '_gsUck-7M74', channel: 'Jeff Nippard' },
    'skull crusher':       { id: 'd_KZxkY_0cM', channel: 'ScottHermanFitness' },
    'lateral raise':       { id: 'geenhiHju-o', channel: 'Jeff Nippard' },
    'front raise':         { id: 'ZhK1DVD1OG8', channel: 'ScottHermanFitness' },
    'chest fly':           { id: 'Z5z7T1WdQp0', channel: 'ScottHermanFitness' },
    'cable fly':           { id: 'Iwe6AmxVf7o', channel: 'ScottHermanFitness' },

    // Pull
    'pull-up':             { id: 'eGo4IYlbE5g', channel: 'Calisthenicmovement' },
    'pull up':             { id: 'eGo4IYlbE5g', channel: 'Calisthenicmovement' },
    'pull-ups':            { id: 'eGo4IYlbE5g', channel: 'Calisthenicmovement' },
    'chin-up':             { id: 'b-ztMQpj8yc', channel: 'Jeff Nippard' },
    'lat pulldown':        { id: 'CAwf7n6Luuc', channel: 'ScottHermanFitness' },
    'barbell row':         { id: 'G8l_8chR5BE', channel: 'ATHLEAN-X' },
    'barbell rows':        { id: 'G8l_8chR5BE', channel: 'ATHLEAN-X' },
    'bent over row':       { id: 'G8l_8chR5BE', channel: 'ATHLEAN-X' },
    'seated row':          { id: 'GZbfZ033f74', channel: 'ScottHermanFitness' },
    'cable row':           { id: 'GZbfZ033f74', channel: 'ScottHermanFitness' },
    'face pull':           { id: 'rep-qVOkqgk', channel: 'Jeff Nippard' },
    'face pulls':          { id: 'rep-qVOkqgk', channel: 'Jeff Nippard' },
    'bicep curl':          { id: 'ykJmrZ5v0Oo', channel: 'ScottHermanFitness' },
    'barbell curl':        { id: 'kwG2ipFRgfo', channel: 'ScottHermanFitness' },
    'barbell curls':       { id: 'kwG2ipFRgfo', channel: 'ScottHermanFitness' },
    'hammer curl':         { id: 'zC3nLlEvin4', channel: 'ScottHermanFitness' },

    // Legs
    'squat':               { id: 'ultWZbUMPL8', channel: 'ATHLEAN-X' },
    'back squat':          { id: 'ultWZbUMPL8', channel: 'ATHLEAN-X' },
    'barbell squat':       { id: 'ultWZbUMPL8', channel: 'ATHLEAN-X' },
    'front squat':         { id: 'tlfahNdNPPI', channel: 'ScottHermanFitness' },
    'goblet squat':        { id: '6xwGFn-J_Qw', channel: 'ScottHermanFitness' },
    'deadlift':            { id: 'op9kVnSso6Q', channel: 'ATHLEAN-X' },
    'conventional deadlift': { id: 'op9kVnSso6Q', channel: 'ATHLEAN-X' },
    'romanian deadlift':   { id: 'JCXUYuzwNrM', channel: 'ScottHermanFitness' },
    'sumo deadlift':       { id: 'wYREQkVtvEc', channel: 'Jeff Nippard' },
    'leg press':           { id: 'IZxyjW7MPJQ', channel: 'ScottHermanFitness' },
    'lunge':               { id: 'QOVaHwm-Q6U', channel: 'ATHLEAN-X' },
    'walking lunge':       { id: 'L8fvypPrzzs', channel: 'ScottHermanFitness' },
    'bulgarian split squat': { id: '2C-uNgKwPLE', channel: 'ScottHermanFitness' },
    'calf raise':          { id: 'gwLzBJYoWlI', channel: 'ScottHermanFitness' },
    'calf raises':         { id: 'gwLzBJYoWlI', channel: 'ScottHermanFitness' },
    'leg curl':            { id: '1Tq3QdYUuHs', channel: 'ScottHermanFitness' },
    'leg extension':       { id: 'YyvSfVjQeL0', channel: 'ScottHermanFitness' },
    'hip thrust':          { id: 'xDmFkJxPzeM', channel: 'Bret Contreras' },

    // Power / full body
    'clean and press':     { id: 'MKF6RIdhQAQ', channel: 'ScottHermanFitness' },
    'clean & press':       { id: 'MKF6RIdhQAQ', channel: 'ScottHermanFitness' },
    'power clean':         { id: 'KjGvwQl8tis', channel: 'CrossFit' },
    'snatch':              { id: '0PPzD5wqtsQ', channel: 'CrossFit' },
    'thruster':            { id: 'L219ltL15zk', channel: 'CrossFit' },
    'kettlebell swing':    { id: 'YSxHifyI6s8', channel: 'Onnit Academy' },
    'burpee':              { id: 'TU8QYVW0gDU', channel: 'ScottHermanFitness' },
    'box jump':            { id: '52r_Ul5k03g', channel: 'ScottHermanFitness' },
    'box jumps':           { id: '52r_Ul5k03g', channel: 'ScottHermanFitness' },
    'battle rope':         { id: 'r217TYWZCzc', channel: 'ScottHermanFitness' },

    // Core
    'plank':               { id: 'pSHjTRCQxIw', channel: 'ATHLEAN-X' },
    'plank hold':          { id: 'pSHjTRCQxIw', channel: 'ATHLEAN-X' },
    'side plank':          { id: 'K2VljzCC16g', channel: 'ScottHermanFitness' },
    'sit-up':              { id: '1fbU_MkV7NE', channel: 'ScottHermanFitness' },
    'crunch':              { id: 'Xyd_fa5zoEU', channel: 'ScottHermanFitness' },
    'russian twist':       { id: 'wkD8rjkodUI', channel: 'ScottHermanFitness' },
    'leg raise':           { id: 'l4kQd9eWclE', channel: 'Calisthenicmovement' },
    'hanging leg raise':   { id: 'Pr1ieGZ5atk', channel: 'Calisthenicmovement' },
    'ab rollout':          { id: 'rqiTPdK1c_I', channel: 'ATHLEAN-X' },
    'mountain climber':    { id: 'nmwgirgXLYM', channel: 'ScottHermanFitness' },

    // Recovery / misc
    'light stretching':    { id: 'sTxC3J3gQEU', channel: 'Tom Merrick' },
    'foam rolling':        { id: 'M5YinU0Z1Is', channel: 'ATHLEAN-X' },
    'mobility work':       { id: 'DdvOzCC8pcE', channel: 'Tom Merrick' },
    'jump rope':           { id: 'FJmRQ5iTXKE', channel: 'ScottHermanFitness' },
    'running':             { id: 'brFHyOtTwH4', channel: 'Global Triathlon Network' }
  };

  // Normalize an exercise name: lowercase, strip punctuation, collapse
  // whitespace. Used for both the library keys and the lookup input.
  function norm(name) {
    return (name || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Check the trainer-uploaded custom library first. Trainer uploads
  // always win over the curated defaults so trainers can brand their
  // own form demos. See trainer-exercise-videos.js for the writer.
  function findTrainerVideo(name) {
    try {
      var db = JSON.parse(localStorage.getItem('shapeTrainerCustomVideos_v1') || '{}');
      var key = norm(name);
      if (!key) return null;
      if (db[key]) return db[key];
      var singular = key.replace(/s$/, '');
      if (db[singular]) return db[singular];
      var plural = key + 's';
      if (db[plural]) return db[plural];
    } catch (e) {}
    return null;
  }

  // Try a handful of lookup strategies to match an exercise name to
  // a library entry: exact, singular/plural, substring on either side.
  function findVideo(name) {
    // Trainer-uploaded custom videos take priority.
    var trainer = findTrainerVideo(name);
    if (trainer) {
      if (trainer.type === 'file') {
        return { fileUrl: trainer.value, channel: 'Your trainer', source: 'trainer' };
      }
      if (trainer.type === 'youtube') {
        return { id: trainer.value, channel: 'Your trainer', source: 'trainer' };
      }
    }

    var key = norm(name);
    if (!key) return null;
    if (EXERCISE_VIDEO_LIBRARY[key]) return EXERCISE_VIDEO_LIBRARY[key];

    // Plural/singular swap
    var singular = key.replace(/s$/, '');
    if (EXERCISE_VIDEO_LIBRARY[singular]) return EXERCISE_VIDEO_LIBRARY[singular];
    var plural = key + 's';
    if (EXERCISE_VIDEO_LIBRARY[plural]) return EXERCISE_VIDEO_LIBRARY[plural];

    // Substring match — pick the longest key that is fully contained
    // in the query or the query fully contains the key. This catches
    // things like "DB Bench Press (close grip)" → "bench press".
    var best = null;
    Object.keys(EXERCISE_VIDEO_LIBRARY).forEach(function (k) {
      if (key.indexOf(k) >= 0 || k.indexOf(key) >= 0) {
        if (!best || k.length > best.length) best = k;
      }
    });
    return best ? EXERCISE_VIDEO_LIBRARY[best] : null;
  }

  // ===== Modal player =====
  // Lazily builds a single global modal the first time a video is
  // opened, then reuses it. The player is destroyed on close so the
  // video actually stops (YouTube iframes keep playing otherwise).
  function ensureModal() {
    var modal = document.getElementById('shapeExerciseVideoModal');
    if (modal) return modal;

    // Inject CSS once.
    if (!document.getElementById('shapeExerciseVideoStyles')) {
      var style = document.createElement('style');
      style.id = 'shapeExerciseVideoStyles';
      style.textContent =
        '.shape-ev-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px;}' +
        '.shape-ev-overlay.active{display:flex;}' +
        '.shape-ev-box{background:#0a0a0a;border:1px solid rgba(255,255,255,0.1);max-width:720px;width:100%;max-height:90vh;display:flex;flex-direction:column;}' +
        '.shape-ev-header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.08);}' +
        '.shape-ev-title{font-size:0.95rem;font-weight:500;color:#fff;margin:0;}' +
        '.shape-ev-sub{font-size:0.7rem;color:#888;font-weight:300;margin-top:2px;}' +
        '.shape-ev-close{background:none;border:none;color:#aaa;font-size:1.5rem;cursor:pointer;padding:0 4px;line-height:1;}' +
        '.shape-ev-close:hover{color:#fff;}' +
        '.shape-ev-body{position:relative;padding-top:56.25%;background:#000;}' +
        '.shape-ev-body iframe{position:absolute;inset:0;width:100%;height:100%;border:0;}' +
        '.shape-ev-empty{padding:40px 20px;text-align:center;color:#888;font-size:0.88rem;}' +
        '.shape-ev-link{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;font-size:0.7rem;color:#2DD4BF;background:rgba(45,212,191,0.1);border:1px solid rgba(45,212,191,0.3);cursor:pointer;font-family:inherit;transition:background 0.15s;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;}' +
        '.shape-ev-link:hover{background:rgba(45,212,191,0.2);}' +
        '.shape-ev-link::before{content:"▶";font-size:0.65rem;}';
      document.head.appendChild(style);
    }

    modal = document.createElement('div');
    modal.id = 'shapeExerciseVideoModal';
    modal.className = 'shape-ev-overlay';
    modal.innerHTML =
      '<div class="shape-ev-box" onclick="event.stopPropagation();">' +
      '  <div class="shape-ev-header">' +
      '    <div>' +
      '      <h3 class="shape-ev-title" id="shapeEvTitle">Exercise demo</h3>' +
      '      <div class="shape-ev-sub" id="shapeEvSub"></div>' +
      '    </div>' +
      '    <button class="shape-ev-close" onclick="window.shapeExerciseVideos.close()">&times;</button>' +
      '  </div>' +
      '  <div class="shape-ev-body" id="shapeEvBody"></div>' +
      '</div>';
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('active')) closeModal();
    });
    document.body.appendChild(modal);
    return modal;
  }

  function openModal(name) {
    var modal = ensureModal();
    var video = findVideo(name);
    var titleEl = document.getElementById('shapeEvTitle');
    var subEl = document.getElementById('shapeEvSub');
    var bodyEl = document.getElementById('shapeEvBody');
    titleEl.textContent = name || 'Exercise demo';

    if (!video) {
      subEl.textContent = '';
      bodyEl.innerHTML =
        '<div class="shape-ev-empty">' +
        'No demo video yet for "' + (name || 'this exercise') + '".<br>' +
        'Ask your trainer to add one, or ' +
        '<a href="https://www.youtube.com/results?search_query=' +
        encodeURIComponent(name + ' exercise form') +
        '" target="_blank" rel="noopener" style="color:#2DD4BF;">search YouTube</a>.' +
        '</div>';
      modal.classList.add('active');
      return;
    }

    subEl.textContent = 'Demo — ' + (video.channel || 'YouTube');
    if (video.fileUrl) {
      // Trainer-uploaded file — render a native <video> element.
      bodyEl.innerHTML =
        '<video src="' + video.fileUrl + '" controls autoplay playsinline ' +
        'style="position:absolute;inset:0;width:100%;height:100%;background:#000;"></video>';
    } else {
      bodyEl.innerHTML =
        '<iframe src="https://www.youtube.com/embed/' + video.id +
        '?autoplay=1&rel=0" title="' + (name || 'Exercise demo') +
        '" allow="autoplay; encrypted-media" allowfullscreen></iframe>';
    }
    modal.classList.add('active');
  }

  function closeModal() {
    var modal = document.getElementById('shapeExerciseVideoModal');
    if (!modal) return;
    modal.classList.remove('active');
    // Clear iframe/video so playback actually stops.
    var body = document.getElementById('shapeEvBody');
    if (body) body.innerHTML = '';
  }

  // Build a "Watch demo" button link string ready to drop into HTML.
  // Caller is responsible for escaping the exercise name if needed.
  function linkHtml(name) {
    var safe = (name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    return '<button type="button" class="shape-ev-link" onclick="event.stopPropagation(); window.shapeExerciseVideos.open(\'' +
      safe + '\')">Watch demo</button>';
  }

  window.shapeExerciseVideos = {
    open: openModal,
    close: closeModal,
    find: findVideo,
    linkHtml: linkHtml,
    LIBRARY: EXERCISE_VIDEO_LIBRARY
  };
})();
