// Shape — mobile chat polish.
// Auto-scrolls messaging lists to the latest message when their parent
// tab becomes active on mobile. Works across clients.html,
// trainer-dashboard.html, and nutrition-schedule.html by targeting a
// known set of chat container IDs/classes.
(function () {
  if (typeof window === 'undefined') return;

  // Selectors for scrollable message containers across all dashboards.
  var MESSAGE_CONTAINERS = [
    '#activeChatMessages',         // clients.html — My Team
    '#tabCommunity .chat-messages',// clients.html — Chat
    '#tabCommunity .chat-channel-content',
    '#tdCommMessages',             // trainer — Community chat
    '#tdMsgChat .td-msg-thread',   // trainer — Messages
    '#ndCommMessages',             // nutri  — Community chat
    '#ndMsgChat .td-msg-thread'    // nutri  — Messages
  ];

  function isMobile() { return window.matchMedia('(max-width: 768px)').matches; }

  function scrollToBottom(el) {
    if (!el) return;
    // rAF twice to let the browser layout the new flex sizing first.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        el.scrollTop = el.scrollHeight;
      });
    });
  }

  function scrollAllActive() {
    if (!isMobile()) return;
    MESSAGE_CONTAINERS.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        // Only scroll if the element is visible (i.e. inside an active tab).
        if (el.offsetParent !== null) scrollToBottom(el);
      });
    });
  }

  // Observe class changes on any .dash-tab-content / .td-tab-content /
  // .nd-tab-content element — when one gets `.active`, scroll its chats.
  function bindObservers() {
    var nodes = document.querySelectorAll(
      '.dash-tab-content, .td-tab-content, .nd-tab-content'
    );
    if (!nodes.length) return;
    var mo = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          if (m.target.classList.contains('active')) {
            setTimeout(scrollAllActive, 60);
          }
        }
      });
    });
    nodes.forEach(function (n) {
      mo.observe(n, { attributes: true, attributeFilter: ['class'] });
    });
  }

  function init() {
    bindObservers();
    // Initial pass on page load.
    setTimeout(scrollAllActive, 200);
    // Rescroll on resize (keyboard open/close shifts viewport).
    window.addEventListener('resize', function () {
      setTimeout(scrollAllActive, 120);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.shapeChatMobile = { scroll: scrollAllActive };
})();
