import { Capacitor } from '@capacitor/core';
import { createComponents, resolve } from '../../../public/newdesign/shapeVideo.mjs';

// iOS capacitor:// pages cannot send the HTTPS Referer required by YouTube.
// Our HTTPS wrapper supplies it while keeping the player inline in the app.
const embedBase = () => (Capacitor.isNativePlatform() ? 'https://www.theshapecommunity.com/video-embed.html' : null);

export function createMobileVideoComponents(React) {
  return createComponents(React, {
    translate: (key, values) => window.ShapeI18n?.t?.(key, values),
    subscribe: callback => window.ShapeLocale?.subscribe?.(callback),
    embedBase: embedBase(),
  });
}

// A clip resolved for this app (ShapeVideo.resolve's policy), its embed routed through the same
// HTTPS wrapper the player uses in the native shell. Null for anything resolve refuses.
export function resolveMobileVideo(value) {
  const source = resolve(value);
  if (!source) return null;
  const base = source.kind === 'embed' ? embedBase() : null;
  return base ? { ...source, src: base + '?video=' + encodeURIComponent(source.url) } : source;
}
