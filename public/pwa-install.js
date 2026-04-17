// Shape PWA: service worker registration + "Add to Home Screen" install prompt
(function() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(function(){});
  }

  // Skip install prompt for pages where it would interfere
  var skipPaths = ['/radio.html', '/live-workout.html', '/intro.html'];
  if (skipPaths.indexOf(location.pathname) !== -1) return;

  var DISMISS_KEY = 'shape-pwa-dismissed';
  var INSTALLED_KEY = 'shape-pwa-installed';

  // Already installed? don't nag
  if (window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
    || localStorage.getItem(INSTALLED_KEY) === '1') return;

  // Recently dismissed? hold off for 7 days
  var dismissed = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
  if (dismissed && (Date.now() - dismissed) < 7 * 24 * 60 * 60 * 1000) return;

  var deferredPrompt = null;
  var banner = null;

  function buildBanner(onInstall, onDismiss) {
    var wrap = document.createElement('div');
    wrap.id = 'shape-pwa-banner';
    wrap.style.cssText = [
      'position:fixed','left:50%','bottom:16px','transform:translateX(-50%)',
      'z-index:99999','background:#141414','border:1px solid rgba(255,255,255,0.12)',
      'border-radius:14px','padding:14px 18px','display:flex','align-items:center',
      'gap:14px','box-shadow:0 20px 40px rgba(0,0,0,0.5)','max-width:92vw',
      'font-family:Inter,-apple-system,sans-serif','color:#fff',
      'animation:shapePwaIn 0.35s ease-out'
    ].join(';');

    var style = document.createElement('style');
    style.textContent = '@keyframes shapePwaIn{from{opacity:0;transform:translate(-50%,20px)}to{opacity:1;transform:translate(-50%,0)}}';
    document.head.appendChild(style);

    var icon = document.createElement('img');
    icon.src = '/icon-192.png';
    icon.alt = '';
    icon.style.cssText = 'width:40px;height:40px;border-radius:8px;flex-shrink:0';
    wrap.appendChild(icon);

    var txt = document.createElement('div');
    txt.style.cssText = 'flex:1;min-width:0';
    txt.innerHTML = '<div style="font-size:0.9rem;font-weight:600;margin-bottom:2px">Install Shape</div>'
      + '<div style="font-size:0.78rem;color:rgba(255,255,255,0.6);font-weight:300">Add to your home screen</div>';
    wrap.appendChild(txt);

    var install = document.createElement('button');
    install.textContent = 'Install';
    install.style.cssText = 'background:#2DD4BF;color:#0a0a0a;border:none;padding:9px 16px;border-radius:8px;font-family:inherit;font-size:0.82rem;font-weight:600;cursor:pointer;flex-shrink:0';
    install.addEventListener('click', onInstall);
    wrap.appendChild(install);

    var close = document.createElement('button');
    close.setAttribute('aria-label', 'Dismiss');
    close.innerHTML = '&times;';
    close.style.cssText = 'background:transparent;color:rgba(255,255,255,0.5);border:none;font-size:1.4rem;line-height:1;cursor:pointer;padding:0 4px;flex-shrink:0';
    close.addEventListener('click', onDismiss);
    wrap.appendChild(close);

    return wrap;
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
  }

  // Chrome / Android / Edge
  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
    setTimeout(function() {
      if (!deferredPrompt) return;
      banner = buildBanner(function() {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function(choice) {
          if (choice.outcome === 'accepted') {
            localStorage.setItem(INSTALLED_KEY, '1');
          } else {
            localStorage.setItem(DISMISS_KEY, String(Date.now()));
          }
          deferredPrompt = null;
          if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
        });
      }, dismiss);
      document.body.appendChild(banner);
    }, 8000);
  });

  window.addEventListener('appinstalled', function() {
    localStorage.setItem(INSTALLED_KEY, '1');
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
  });

  // iOS Safari: no beforeinstallprompt event — show a manual hint
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  var isSafari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
  if (isIOS && isSafari) {
    setTimeout(function() {
      banner = document.createElement('div');
      banner.id = 'shape-pwa-banner';
      banner.style.cssText = [
        'position:fixed','left:50%','bottom:16px','transform:translateX(-50%)',
        'z-index:99999','background:#141414','border:1px solid rgba(255,255,255,0.12)',
        'border-radius:14px','padding:14px 18px','display:flex','align-items:center',
        'gap:14px','box-shadow:0 20px 40px rgba(0,0,0,0.5)','max-width:92vw',
        'font-family:Inter,-apple-system,sans-serif','color:#fff'
      ].join(';');
      banner.innerHTML = '<img src="/icon-192.png" alt="" style="width:40px;height:40px;border-radius:8px;flex-shrink:0">'
        + '<div style="flex:1;min-width:0;font-size:0.82rem;font-weight:300;line-height:1.35">'
        + 'Install Shape: tap <span style="display:inline-block;vertical-align:-2px">&#x2B06;</span> then <b>Add to Home Screen</b>'
        + '</div>'
        + '<button aria-label="Dismiss" style="background:transparent;color:rgba(255,255,255,0.5);border:none;font-size:1.4rem;line-height:1;cursor:pointer;padding:0 4px;flex-shrink:0">&times;</button>';
      banner.querySelector('button').addEventListener('click', dismiss);
      document.body.appendChild(banner);
    }, 10000);
  }
})();
