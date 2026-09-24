import { Capacitor } from '@capacitor/core';
import { createComponents } from '../../../public/newdesign/shapeVideo.mjs';

export function createMobileVideoComponents(React) {
  // iOS capacitor:// pages cannot send the HTTPS Referer required by YouTube.
  // Our HTTPS wrapper supplies it while keeping the player inline in the app.
  return createComponents(React, {
    embedBase: Capacitor.isNativePlatform() ? 'https://www.theshapecommunity.com/video-embed.html' : null,
  });
}
