// The website's cooking page: the app's own cook layer (/m/?cooking=1, see
// mobile-app/src/broadsheet/cookingWeb.jsx) given the whole screen under the site
// header, on its own paper: no frame and no intro. The layer's own top bar carries
// the title and an × that also returns to /recipes (cookingWeb.jsx exit()).
// ⚠ THE PAPER IS THE COOK LAYER'S, NOT THE KITCHEN PAGES'. cookingWeb.jsx mounts
// BSProvider paperMode="bone", and bone is #ece4d3 with ink #1a160e
// (mobile-app/src/broadsheet/iosAppBroadsheet.jsx). The page wears the same paper so
// the bar and the layer read as one surface; any other value draws a seam.
// ⚠ NO TEAL TEXT ON THIS PAPER. The site's light teal #0a7a72 reads 4.11:1 on bone,
// under AA for text, so the link stays ink and teal is only the focus ring (3:1 rule).
const KC_PAPER = '#ece4d3';
const KC_INK = '#1a160e';
const KC_TEAL = '#0a7a72';
const KC_SANS = "'Schibsted Grotesk', 'Schibsted Fallback', system-ui, sans-serif";
// The header is fixed at 72px with a 72px spacer under it (pageShell.jsx NAV_H).
const KC_HEADER_H = 72;

function KitchenCookPage() {
  const params = new URLSearchParams(location.search);
  const query = new URLSearchParams({ cooking: '1' });
  if (params.get('r')) query.set('r', params.get('r'));
  if (params.get('mode') === 'together') query.set('mode', 'together');
  const src = '/m/?' + query.toString();
  return <div className="ck">
    <style>{`
.ck { background: ${KC_PAPER}; color: ${KC_INK}; }
/* <main> keeps zero side padding: pageShell's phone rule pads every main by 18px. */
.ck main.ck-stage { display: flex; flex-direction: column; margin: 0; padding: 0 !important;
  height: calc(100vh - ${KC_HEADER_H}px); height: calc(100dvh - ${KC_HEADER_H}px); min-height: 460px; }
.ck .ck-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0;
  overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
/* Gutters follow the cook layer's own top bar: 32px from 1180, 20px from 760, 16px on a phone. */
.ck .ck-bar { flex: none; display: flex; align-items: center; min-height: 52px; padding: 4px 32px; }
.ck .ck-back { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 14px 0 10px;
  margin-left: -10px; border-radius: 10px; font-family: ${KC_SANS}; font-size: 15px; font-weight: 600;
  letter-spacing: -0.005em; line-height: 1; color: ${KC_INK}; text-decoration: none; white-space: nowrap;
  transition: background-color .16s ease; }
.ck .ck-back svg { width: 18px; height: 18px; flex: none; transition: transform .16s ease; }
.ck .ck-back:hover { background: rgba(26,22,14,0.07); }
.ck .ck-back:hover svg { transform: translateX(-2px); }
.ck .ck-back:active { background: rgba(26,22,14,0.11); }
.ck .ck-back:focus { outline: none; }
.ck .ck-back:focus-visible { outline: 2px solid ${KC_TEAL}; outline-offset: 2px; }
.ck .ck-frame { flex: 1 1 auto; min-height: 0; width: 100%; display: block; border: 0; background: ${KC_PAPER}; }
@media (max-width: 1179px) { .ck .ck-bar { padding: 4px 20px; } }
@media (max-width: 759px) { .ck .ck-bar { min-height: 48px; padding: 2px 16px; } }
@media (prefers-reduced-motion: reduce) { .ck .ck-back, .ck .ck-back svg { transition: none; } .ck .ck-back:hover svg { transform: none; } }
/* The floating chat launcher sits bottom-right, exactly over the layer's pinned controls. */
#shape-global-chat-button, #shape-global-chat-panel { display: none !important; }
`}</style>
    <Header active="Kitchen" />
    <main className="ck-stage">
      <h1 className="ck-sr">Let's cook.</h1>
      <div className="ck-bar">
        <a href="/recipes" className="ck-back">
          <svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M15 9H3.5M8 4 3 9l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" /></svg>
          <span>All recipes</span>
        </a>
      </div>
      <iframe className="ck-frame" title="Shape cooking tutorial and meal planner" src={src} allow="autoplay; microphone; screen-wake-lock" />
    </main>
  </div>;
}
ReactDOM.createRoot(document.getElementById('root')).render(<KitchenCookPage />);
