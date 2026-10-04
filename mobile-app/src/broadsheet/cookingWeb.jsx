import React from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { initI18n, i18n } from '../i18n/index.js';
import './tweaks.js';
import './iosAppBroadsheet.jsx';
import './clientChatThreads.jsx';
import './iosAppReactive.jsx';
import './iosAppBroadsheetRadio.jsx';
import { SHAPE_KITCHEN_RECIPES } from './shapeKitchenData.js';
import { bsCookableFromRecipe, bsCookSlug } from '../services/cookable.mjs';

// Website cooking uses the actual app player and scheduler. Load window-backed
// dependencies before evaluating the client module, exactly like the app entry.
await initI18n();
await Promise.all([
  import('./iosAppBroadsheetCalendar.jsx'), import('./iosAppBroadsheetProviderApply.jsx'),
  import('./iosAppBroadsheetMarketplace.jsx'), import('./iosAppBroadsheetWidgets.jsx'),
  import('./iosAppBroadsheetHabits.jsx'),
]);
await import('./iosAppBroadsheetClient.jsx');
// Signed in with the website's session (shapeBackend.js), hydrating it reads the profile and
// bridges the session to the API, two round trips with no timeout. Nothing here needs them
// before the first paint, so the page waits a moment for them and then renders anyway.
const signedIn = () => !!window.ShapeAuth?.getCachedState?.()?.user?.id;
const boot = Promise.resolve(window.ShapeAuth?.getCurrentSession?.()).catch(() => null);
await Promise.race([boot, new Promise((resolve) => setTimeout(resolve, 2500))]);
// Nora's voice and mic are for signed-in members. The app shell sets this flag; this page
// never loads the shell, and an unset flag reads as a member, so a signed-out visitor could
// turn Nora on and get an error instead of being told to sign in.
window.ShapeCanChat = signedIn();
boot.then(() => {
  window.ShapeCanChat = signedIn();
  try { window.dispatchEvent(new Event('shape:canchat')); } catch { /* listeners re-read on mount */ }
});
const { BSProvider, BSRadioProvider, BSSheetProvider, BSToastHost, BSConfirmHost, BSCookMode, BSPrepSession } = window;
const params = new URLSearchParams(location.search);
const slug = params.get('r');
const recipe = SHAPE_KITCHEN_RECIPES.find(r => bsCookSlug(r.title) === slug);
const cookable = recipe ? bsCookableFromRecipe(recipe) : null;
const navigateWebsite = path => {
  try {
    if (window.parent !== window && window.parent.location.origin === location.origin) {
      window.parent.location.assign(path); return;
    }
  } catch { /* A third-party embed cannot control its parent's navigation. */ }
  location.assign(path);
};
const exit = () => navigateWebsite('/recipes');
// Catalog instructions are public; account writes retain their normal auth checks.
window.bsRequireAccount = () => {
  if (window.ShapeAuth?.getCachedState?.().user) return true;
  navigateWebsite('/login?next=' + encodeURIComponent(location.pathname + location.search));
  return false;
};
function bsBoundaryT(key, fallback) { try { return window.ShapeI18n?.t?.(key) || fallback; } catch { return fallback; } }
class CookingBoundary extends React.Component {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <div role="alert" style={{ padding: 24 }}><p>{bsBoundaryT('common:error.title', 'Something went wrong')}</p><button onClick={() => location.reload()}>{bsBoundaryT('common:error.reload', 'Reload')}</button> <a href="/recipes">{bsBoundaryT('common:nav.eat', 'Eat')}</a></div> : this.props.children; }
}
createRoot(document.getElementById('root')).render(
  <CookingBoundary><I18nextProvider i18n={i18n}>
    <BSProvider paperMode="bone" accentKey="teal" densityKey="comfortable" borderKey="hairlines" weightKey="regular" textScaleKey="medium" textureKey="none">
      <BSRadioProvider><BSSheetProvider>
        <div id="bs-phone-surface" style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden' }}>
          {slug && !cookable ? <div role="alert" style={{ padding: 24 }}>{bsBoundaryT('common:error.title', 'Something went wrong')} <a href="/recipes">{bsBoundaryT('common:nav.eat', 'Eat')}</a></div>
            : cookable && params.get('mode') !== 'together' ? <BSCookMode cookable={cookable} onClose={exit} />
            : <BSPrepSession catalog program={[]} seed={cookable ? { cookable } : null} onClose={exit} />}
          <BSToastHost /><BSConfirmHost />
        </div>
      </BSSheetProvider></BSRadioProvider>
    </BSProvider>
  </I18nextProvider></CookingBoundary>
);
