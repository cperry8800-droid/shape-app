// Cloudflare Turnstile (CAPTCHA) — mobile/web auth bot protection.
//
// Mirrors the website helper in public/supabase.js so BSLogin can render an
// explicit widget and hand the solved token to Supabase Auth (signIn / signUp /
// phone OTP). No-op (enabled() === false) until a site key is present, so the
// auth forms keep working pre-activation.
//
// The SITE key is PUBLIC (it ships in every Turnstile page's source) — same key
// the website uses. Override at build time with VITE_TURNSTILE_SITEKEY if a
// separate widget is configured for the native app's origin.
//
// NOTE (native builds): a Turnstile widget validates the page's hostname against
// the keys' allowed-hostnames in the Cloudflare dashboard. The website domains
// are configured; the Capacitor native origin (capacitor://localhost /
// https://localhost) must be ADDED to the widget's hostnames (or a separate key
// used) before enabling Supabase's Auth CAPTCHA, or native logins will be
// rejected server-side. The `/m/` web build (served from the website) is fine.

const SITE_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_TURNSTILE_SITEKEY) ||
  '0x4AAAAAADmrGKVw7Ghzs1gQ';

if (typeof window !== 'undefined') {
  window.SHAPE_TURNSTILE_SITEKEY = window.SHAPE_TURNSTILE_SITEKEY || SITE_KEY;

  let loading = null;
  function load() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.defer = true;
      s.onload = () => {
        if (window.turnstile) resolve(window.turnstile);
        else reject(new Error('Turnstile global missing after load'));
      };
      s.onerror = () => { loading = null; reject(new Error('Turnstile script failed to load')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  // Don't clobber the website helper if both somehow load (they're equivalent).
  window.ShapeTurnstile = window.ShapeTurnstile || {
    enabled: () => !!window.SHAPE_TURNSTILE_SITEKEY,
    siteKey: () => window.SHAPE_TURNSTILE_SITEKEY || '',
    // Render an explicit widget into `el`. onToken(token) on solve; onToken('')
    // on expire/error. Resolves to the widget id (or null when disabled / failed).
    render(el, onToken) {
      if (!el || !window.SHAPE_TURNSTILE_SITEKEY) return Promise.resolve(null);
      const cb = (tok) => { try { onToken(tok || ''); } catch (e) {} };
      return load()
        .then((ts) => ts.render(el, {
          sitekey: window.SHAPE_TURNSTILE_SITEKEY,
          // The launch/auth surfaces are fixed-dark; interaction-only keeps the
          // widget invisible unless Cloudflare actually needs a human click.
          theme: 'dark',
          appearance: 'interaction-only',
          callback: cb,
          'expired-callback': () => cb(''),
          'error-callback': () => cb(''),
        }))
        .catch((e) => { console.warn('[shape] turnstile render failed', e); return null; });
    },
    reset(id) { try { if (window.turnstile && id != null) window.turnstile.reset(id); } catch (e) {} },
    // Destroy a widget when its container unmounts so a fresh one renders next
    // time (the issued token is single-use) and the old one doesn't leak.
    remove(id) { try { if (window.turnstile && id != null) window.turnstile.remove(id); } catch (e) {} },
  };
}
