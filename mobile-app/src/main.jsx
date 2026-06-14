import { Capacitor } from '@capacitor/core';

import './fonts.css';
import './services/shapeBackend.js';
import './services/shapeSignals.js'; // shared dashboard signal engine (window.DashSignals + window.ShapeSignals)

if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('is-native-app');
  document.documentElement.dataset.platform = Capacitor.getPlatform();
}

await import('./broadsheet/index.jsx');
