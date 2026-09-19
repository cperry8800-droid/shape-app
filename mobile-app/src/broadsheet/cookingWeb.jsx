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
await window.ShapeAuth?.getCurrentSession?.().catch(() => null);
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
