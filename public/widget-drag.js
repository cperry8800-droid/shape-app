// Shape — unified widget drag & drop.
//
// Replaces the older HTML5-drag handler that required grabbing a tiny
// handle and didn't work on touch. This module uses Pointer Events so
// it works on mouse, touch, and pen. You can grab a widget from
// anywhere on its header (or anywhere on the widget body on touch via
// long-press) — no more hunting for the corner dot.
//
// Order for each grid is persisted in localStorage under a key derived
// from the grid's id.

(function () {
  if (typeof window === 'undefined') return;
  if (window.__shapeWidgetDragLoaded) return;
  window.__shapeWidgetDragLoaded = true;

  var LONG_PRESS_MS = 220;          // touch hold before drag starts
  var DRAG_THRESHOLD_PX = 6;        // mouse drag activation distance
  var SCROLL_EDGE = 60;             // auto-scroll near window edges
  var SCROLL_SPEED = 14;

  function storageKey(grid) {
    return 'shapeWidgetOrder_v2_' + (grid.id || 'grid');
  }

  function saveOrder(grid) {
    var ids = Array.prototype.map.call(grid.children, function (w) {
      return w.dataset && w.dataset.widgetId;
    }).filter(Boolean);
    try { localStorage.setItem(storageKey(grid), JSON.stringify(ids)); } catch (e) {}
  }

  function restoreOrder(grid) {
    var raw;
    try { raw = localStorage.getItem(storageKey(grid)); } catch (e) { return; }
    if (!raw) return;
    var ids;
    try { ids = JSON.parse(raw); } catch (e) { return; }
    if (!Array.isArray(ids)) return;
    ids.forEach(function (id) {
      var el = grid.querySelector('[data-widget-id="' + id + '"]');
      if (el) grid.appendChild(el);
    });
  }

  // Is the target something the user clearly meant to interact with
  // rather than drag? Inputs, buttons, links, selects, textareas etc.
  function isInteractive(el) {
    if (!el) return false;
    var tag = (el.tagName || '').toLowerCase();
    if (['input', 'select', 'textarea', 'button', 'a', 'label'].indexOf(tag) >= 0) return true;
    if (el.isContentEditable) return true;
    if (el.closest && el.closest('button, a, input, select, textarea, label, [contenteditable]')) return true;
    return false;
  }

  // Inject the drag-state styles once.
  function ensureStyles() {
    if (document.getElementById('shapeWidgetDragStyles')) return;
    var s = document.createElement('style');
    s.id = 'shapeWidgetDragStyles';
    s.textContent =
      '.widget[data-widget-id]{touch-action:auto;}' +
      '.widget.shape-wd-dragging{opacity:0.25;transform:scale(0.98);transition:opacity .15s, transform .15s;}' +
      '.widget.shape-wd-lift{cursor:grabbing!important;}' +
      '.shape-wd-ghost{position:fixed!important;pointer-events:none!important;z-index:99999!important;box-shadow:0 20px 60px rgba(0,0,0,0.6)!important;transform:rotate(1.5deg) scale(1.02)!important;opacity:0.95!important;transition:none!important;border:1px solid var(--accent,#2DD4BF)!important;}' +
      '.shape-wd-placeholder{border:2px dashed var(--accent,#2DD4BF)!important;border-radius:12px;background:rgba(45,212,191,0.06)!important;box-sizing:border-box;}' +
      '.widget-header{cursor:grab;-webkit-user-select:none;user-select:none;}' +
      '.widget-header:active{cursor:grabbing;}' +
      '@media (hover: none) { .widget[data-widget-id]{cursor:grab;} }' +
      // Move-to-top/bottom menu
      '.shape-wd-menu-wrap{position:relative;display:inline-block;}' +
      '.shape-wd-menu-btn{background:none;border:none;color:var(--text-muted,#888);cursor:pointer;font-size:1.1rem;padding:2px 8px;line-height:1;border-radius:4px;transition:background .15s,color .15s;}' +
      '.shape-wd-menu-btn:hover{background:rgba(255,255,255,0.06);color:var(--text,#fff);}' +
      '.shape-wd-menu{position:absolute;top:100%;right:0;margin-top:4px;background:#1A1A1A;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:4px;min-width:170px;box-shadow:0 10px 30px rgba(0,0,0,0.5);z-index:5000;display:none;}' +
      '.shape-wd-menu.open{display:block;}' +
      '.shape-wd-menu button{display:block;width:100%;text-align:left;background:none;border:none;color:#fff;padding:9px 12px;font-size:0.8rem;cursor:pointer;border-radius:5px;font-family:inherit;}' +
      '.shape-wd-menu button:hover{background:rgba(45,212,191,0.12);color:var(--accent,#2DD4BF);}' +
      '.shape-wd-menu button .shape-wd-kbd{float:right;opacity:0.5;font-size:0.7rem;}';
    document.head.appendChild(s);
  }

  // ===== Move-to-top / move-to-bottom menu =====
  function closeAllMenus() {
    document.querySelectorAll('.shape-wd-menu.open').forEach(function (m) {
      m.classList.remove('open');
    });
  }

  function moveToTop(widget) {
    var grid = widget.parentElement;
    if (!grid) return;
    grid.insertBefore(widget, grid.firstChild);
    saveOrder(grid);
    widget.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function moveToBottom(widget) {
    var grid = widget.parentElement;
    if (!grid) return;
    grid.appendChild(widget);
    saveOrder(grid);
    widget.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function moveUp(widget) {
    var prev = widget.previousElementSibling;
    if (prev && prev.classList.contains('widget')) {
      widget.parentElement.insertBefore(widget, prev);
      saveOrder(widget.parentElement);
    }
  }
  function moveDown(widget) {
    var next = widget.nextElementSibling;
    if (next && next.classList.contains('widget')) {
      widget.parentElement.insertBefore(next, widget);
      saveOrder(widget.parentElement);
    }
  }

  function injectMenus(grid) {
    grid.querySelectorAll('.widget[data-widget-id]').forEach(function (widget) {
      var header = widget.querySelector('.widget-header');
      if (!header) return;
      if (header.querySelector('.shape-wd-menu-wrap')) return;
      // Place into existing .widget-controls if present, else into header.
      var host = header.querySelector('.widget-controls') || header;
      var wrap = document.createElement('div');
      wrap.className = 'shape-wd-menu-wrap';
      wrap.innerHTML =
        '<button type="button" class="shape-wd-menu-btn" title="Reorder">&#8942;</button>' +
        '<div class="shape-wd-menu">' +
          '<button type="button" data-act="top">&#8593;&#8593;&nbsp; Move to top</button>' +
          '<button type="button" data-act="up">&#8593;&nbsp;&nbsp; Move up</button>' +
          '<button type="button" data-act="down">&#8595;&nbsp;&nbsp; Move down</button>' +
          '<button type="button" data-act="bottom">&#8595;&#8595;&nbsp; Move to bottom</button>' +
        '</div>';
      // Stop pointerdown here so the drag system doesn't grab the widget.
      wrap.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      wrap.addEventListener('click', function (e) { e.stopPropagation(); });

      var btn = wrap.querySelector('.shape-wd-menu-btn');
      var menu = wrap.querySelector('.shape-wd-menu');
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var wasOpen = menu.classList.contains('open');
        closeAllMenus();
        if (!wasOpen) menu.classList.add('open');
      });
      menu.querySelectorAll('button[data-act]').forEach(function (b) {
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          var act = b.getAttribute('data-act');
          if (act === 'top') moveToTop(widget);
          else if (act === 'bottom') moveToBottom(widget);
          else if (act === 'up') moveUp(widget);
          else if (act === 'down') moveDown(widget);
          closeAllMenus();
        });
      });
      host.appendChild(wrap);
    });
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.shape-wd-menu-wrap')) closeAllMenus();
  });

  // ===== Drag state =====
  var state = null;

  function startDrag(grid, widget, clientX, clientY) {
    var rect = widget.getBoundingClientRect();

    // Build a visual ghost that follows the pointer.
    var ghost = widget.cloneNode(true);
    ghost.classList.add('shape-wd-ghost');
    ghost.style.width = rect.width + 'px';
    ghost.style.height = rect.height + 'px';
    ghost.style.left = rect.left + 'px';
    ghost.style.top = rect.top + 'px';
    ghost.style.margin = '0';
    // Remove any id collisions inside the clone
    ghost.querySelectorAll('[id]').forEach(function (n) { n.removeAttribute('id'); });
    document.body.appendChild(ghost);

    // Placeholder takes the widget's spot in the grid flow.
    var placeholder = document.createElement('div');
    placeholder.className = 'widget shape-wd-placeholder';
    if (widget.classList.contains('widget-full')) placeholder.classList.add('widget-full');
    placeholder.style.minHeight = rect.height + 'px';
    grid.insertBefore(placeholder, widget);

    widget.classList.add('shape-wd-dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';

    state = {
      grid: grid,
      widget: widget,
      ghost: ghost,
      placeholder: placeholder,
      offsetX: clientX - rect.left,
      offsetY: clientY - rect.top,
      lastMoveAt: 0
    };
  }

  function moveDrag(clientX, clientY) {
    if (!state) return;
    var gx = clientX - state.offsetX;
    var gy = clientY - state.offsetY;
    state.ghost.style.left = gx + 'px';
    state.ghost.style.top = gy + 'px';

    // Auto-scroll window when near top/bottom edges.
    var vh = window.innerHeight;
    if (clientY < SCROLL_EDGE) {
      window.scrollBy(0, -SCROLL_SPEED * (1 - clientY / SCROLL_EDGE));
    } else if (clientY > vh - SCROLL_EDGE) {
      window.scrollBy(0, SCROLL_SPEED * (1 - (vh - clientY) / SCROLL_EDGE));
    }

    var grid = state.grid;
    var gridRect = grid.getBoundingClientRect();
    var gridMidX = gridRect.left + gridRect.width / 2;

    // Collect sibling widgets (exclude the one being dragged + placeholder).
    var siblings = [];
    for (var i = 0; i < grid.children.length; i++) {
      var c = grid.children[i];
      if (c === state.widget || c === state.placeholder) continue;
      if (!c.classList || !c.classList.contains('widget')) continue;
      siblings.push(c);
    }

    if (!siblings.length) {
      if (state.placeholder.parentNode !== grid) grid.appendChild(state.placeholder);
      return;
    }

    // Find the sibling whose center is closest to the cursor. This lets
    // the user drop into gaps or empty areas — placement follows the
    // cursor regardless of whether it's directly over a widget.
    var best = null;
    var bestDist = Infinity;
    for (var j = 0; j < siblings.length; j++) {
      var r = siblings[j].getBoundingClientRect();
      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      var dx = clientX - cx;
      var dy = clientY - cy;
      var d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; best = siblings[j]; }
    }
    if (!best) return;

    var rect = best.getBoundingClientRect();
    var isFullRow = best.classList.contains('widget-full') ||
                    state.placeholder.classList.contains('widget-full');
    var insertBefore;
    if (isFullRow) {
      insertBefore = clientY < rect.top + rect.height / 2;
    } else {
      // Row-first: if cursor is clearly above/below this widget's row, use Y.
      if (clientY < rect.top) insertBefore = true;
      else if (clientY > rect.bottom) insertBefore = false;
      else {
        var cursorLeft = clientX < gridMidX;
        var targetLeft = rect.left + rect.width / 2 < gridMidX;
        if (cursorLeft && !targetLeft) insertBefore = true;
        else if (!cursorLeft && targetLeft) insertBefore = false;
        else insertBefore = clientX < rect.left + rect.width / 2;
      }
    }
    if (insertBefore) {
      if (best.previousSibling !== state.placeholder) {
        grid.insertBefore(state.placeholder, best);
      }
    } else {
      var next = best.nextSibling;
      if (next !== state.placeholder) {
        grid.insertBefore(state.placeholder, next);
      }
    }
  }

  function endDrag(commit) {
    if (!state) return;
    var s = state; state = null;
    if (commit) {
      s.grid.insertBefore(s.widget, s.placeholder);
      saveOrder(s.grid);
    }
    if (s.placeholder.parentNode) s.placeholder.parentNode.removeChild(s.placeholder);
    if (s.ghost.parentNode) s.ghost.parentNode.removeChild(s.ghost);
    s.widget.classList.remove('shape-wd-dragging');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }

  // ===== Pointer plumbing =====
  // We track a "pending" drag until the user either moves past the
  // threshold (mouse) or holds long enough (touch).
  var pending = null;

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return; // left/primary only
    var widget = e.target.closest && e.target.closest('.widget[data-widget-id]');
    if (!widget) return;
    var grid = widget.parentElement;
    if (!grid || !grid.dataset || !grid.dataset.wdReady) return;
    if (isInteractive(e.target)) return;

    // On touch inside the widget body (not the header), require a long
    // press so the user can still scroll-within or tap inside.
    var inHeader = !!(e.target.closest && e.target.closest('.widget-header'));
    var isTouch = e.pointerType === 'touch';

    pending = {
      widget: widget,
      grid: grid,
      startX: e.clientX,
      startY: e.clientY,
      isTouch: isTouch,
      inHeader: inHeader,
      pointerId: e.pointerId,
      started: false,
      timer: null
    };

    if (isTouch && !inHeader) {
      pending.timer = setTimeout(function () {
        if (!pending) return;
        pending.started = true;
        startDrag(pending.grid, pending.widget, pending.startX, pending.startY);
        try { widget.setPointerCapture(e.pointerId); } catch (err) {}
      }, LONG_PRESS_MS);
    } else if (isTouch && inHeader) {
      // Header tap on touch — start after very short hold to disambiguate tap/scroll.
      pending.timer = setTimeout(function () {
        if (!pending) return;
        pending.started = true;
        startDrag(pending.grid, pending.widget, pending.startX, pending.startY);
        try { widget.setPointerCapture(e.pointerId); } catch (err) {}
      }, 90);
    }
    // Mouse: wait for movement past threshold in onPointerMove.
  }

  function onPointerMove(e) {
    if (state) {
      e.preventDefault();
      moveDrag(e.clientX, e.clientY);
      return;
    }
    if (!pending) return;
    var dx = e.clientX - pending.startX;
    var dy = e.clientY - pending.startY;

    if (pending.isTouch) {
      // If the user moved before the long-press fired, cancel the drag
      // intent so the page can scroll normally.
      if (!pending.started && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
        if (pending.timer) clearTimeout(pending.timer);
        pending = null;
      }
      return;
    }

    // Mouse: start drag once we exceed the threshold. We allow starting
    // from anywhere on the widget (header or body) — interactive targets
    // are already filtered out in onPointerDown via isInteractive().
    if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
    pending.started = true;
    startDrag(pending.grid, pending.widget, pending.startX, pending.startY);
    try { pending.widget.setPointerCapture(pending.pointerId); } catch (err) {}
    moveDrag(e.clientX, e.clientY);
    e.preventDefault();
  }

  function onPointerUp() {
    if (pending && pending.timer) clearTimeout(pending.timer);
    pending = null;
    if (state) {
      // Swallow the click that follows pointerup so dropping on a
      // button/link inside another widget doesn't trigger it.
      var swallow = function (e) {
        e.stopPropagation();
        e.preventDefault();
        document.removeEventListener('click', swallow, true);
      };
      document.addEventListener('click', swallow, true);
      setTimeout(function () {
        document.removeEventListener('click', swallow, true);
      }, 50);
      endDrag(true);
    }
  }
  function onPointerCancel() {
    if (pending && pending.timer) clearTimeout(pending.timer);
    pending = null;
    if (state) endDrag(false);
  }

  // Keep context menu quiet during a drag.
  function onContextMenu(e) { if (state) e.preventDefault(); }

  function bindGrid(grid) {
    if (!grid || grid.dataset.wdReady === '1') return;
    grid.dataset.wdReady = '1';
    // Remove legacy draggable attributes that conflict with pointer events.
    grid.querySelectorAll('.widget[draggable]').forEach(function (w) {
      w.setAttribute('draggable', 'false');
    });
    restoreOrder(grid);
    // Defer menu injection so any legacy initDrag has a chance to add
    // .widget-controls first — we'll reuse that container.
    setTimeout(function () { injectMenus(grid); }, 50);
    setTimeout(function () { injectMenus(grid); }, 400);
  }

  function boot() {
    ensureStyles();
    // Auto-bind any grid containing .widget[data-widget-id] children.
    var candidates = document.querySelectorAll('[id$="WidgetGrid"], .widget-grid');
    candidates.forEach(function (grid) {
      if (grid.querySelector('.widget[data-widget-id]')) bindGrid(grid);
    });
    // Global pointer handlers — one set for all grids.
    document.addEventListener('pointerdown', onPointerDown, { passive: false });
    document.addEventListener('pointermove', onPointerMove, { passive: false });
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerCancel);
    document.addEventListener('contextmenu', onContextMenu);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  // Re-scan a little later in case widgets are added after initial paint.
  setTimeout(function () {
    var candidates = document.querySelectorAll('[id$="WidgetGrid"], .widget-grid');
    candidates.forEach(function (grid) {
      if (grid.querySelector('.widget[data-widget-id]')) bindGrid(grid);
    });
  }, 600);

  // Expose for manual binding if a tab becomes visible later.
  window.shapeWidgetDrag = {
    bind: bindGrid,
    saveOrder: saveOrder,
    restoreOrder: restoreOrder
  };
})();
