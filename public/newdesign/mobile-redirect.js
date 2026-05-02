// Mobile visitors get routed to /newdesign/GetApp.html instead of the
// desktop marketing page. ?desktop=1 (or having visited that way once
// in the same tab) bypasses the redirect.
(function () {
  try {
    var params = new URLSearchParams(window.location.search);
    if (params.has('desktop')) {
      sessionStorage.setItem('shapeForceDesktop', '1');
      return;
    }
    if (sessionStorage.getItem('shapeForceDesktop') === '1') return;
    if (window.location.pathname.indexOf('/newdesign/GetApp') === 0) return;
    var isMobile = window.matchMedia('(max-width: 760px)').matches;
    if (isMobile) {
      window.location.replace('/newdesign/GetApp.html');
    }
  } catch (e) {}
})();
