// Mobile handling for the desktop marketing site. Only the HOME page redirects
// to /newdesign/GetApp.html — deep links (Pricing, coach profiles, Community…)
// now RENDER on phones, with a slim dismissible "get the app" banner instead,
// so a shared link never swallows its destination. ?desktop=1 (or having
// visited that way once in the same tab) bypasses both.
(function () {
  try {
    var params = new URLSearchParams(window.location.search);
    if (params.has('desktop')) {
      sessionStorage.setItem('shapeForceDesktop', '1');
      return;
    }
    if (sessionStorage.getItem('shapeForceDesktop') === '1') return;
    if (window.location.pathname.indexOf('/newdesign/GetApp') === 0) return;
    if (!window.matchMedia('(max-width: 760px)').matches) return;

    var isHome = /\/newdesign\/(index\.html)?$/.test(window.location.pathname);
    if (isHome) {
      window.location.replace('/newdesign/GetApp.html');
      return;
    }

    if (sessionStorage.getItem('shapeAppBannerDismissed') === '1') return;
    // This script is the first tag in <body>, so the banner exists from the
    // first paint — content lays out below it (no layout shift).
    var bar = document.createElement('div');
    bar.id = 'shape-app-banner';
    // Fixed 48px tall: pageShell's .shape-header is fixed at top:0 (z 60) and
    // would paint over an in-flow banner — the style below shifts that header
    // down by exactly the banner height while the banner exists.
    bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;height:48px;box-sizing:border-box;background:#10100e;border-bottom:1px solid rgba(46,224,196,0.4);padding:0 6px 0 14px;';
    var headerOffset = document.createElement('style');
    headerOffset.id = 'shape-app-banner-offset';
    headerOffset.textContent = '@media (max-width: 760px){ header.shape-header{ top: 48px !important; } }';
    document.head.appendChild(headerOffset);
    var label = document.createElement('a');
    label.href = '/newdesign/GetApp.html';
    label.style.cssText = "flex:1;display:inline-flex;align-items:center;gap:8px;min-height:44px;color:#f2ede4;text-decoration:none;font-family:'JetBrains Mono',Consolas,monospace;font-size:10.5px;letter-spacing:0.14em;text-transform:uppercase;";
    var labelText = document.createElement('span');
    labelText.textContent = 'Shape is better in the app';
    var labelCta = document.createElement('span');
    labelCta.style.cssText = 'color:#2ee0c4;white-space:nowrap;';
    labelCta.textContent = 'Get it →';
    label.appendChild(labelText);
    label.appendChild(labelCta);
    var close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Dismiss');
    close.style.cssText = 'width:44px;height:44px;background:transparent;border:0;color:rgba(242,237,228,0.6);font-size:18px;line-height:1;cursor:pointer;';
    close.textContent = '×';
    close.addEventListener('click', function () {
      try { sessionStorage.setItem('shapeAppBannerDismissed', '1'); } catch (e) {}
      if (bar.parentNode) bar.parentNode.removeChild(bar);
      if (headerOffset.parentNode) headerOffset.parentNode.removeChild(headerOffset);
    });
    bar.appendChild(label);
    bar.appendChild(close);
    document.body.appendChild(bar);
  } catch (e) {}
})();
