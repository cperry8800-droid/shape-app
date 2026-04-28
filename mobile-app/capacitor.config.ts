import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Reverse-DNS bundle ID. Must match the App Store Connect record exactly.
  // Change "com.theshapecommunity" if you register the app under a different
  // organization identifier in your Apple Developer account.
  appId: 'com.theshapecommunity.shape',
  appName: 'Shape',
  // Vite outputs to dist/. `cap sync` copies this folder into the iOS bundle.
  webDir: 'dist',
  ios: {
    contentInset: 'always',
    // Allow the app to load https://theshapecommunity.com inside webview
    // requests (Stripe Checkout, Supabase auth callbacks).
    limitsNavigationsToAppBoundDomains: false,
  },
  server: {
    // In dev you can point this at your laptop's IP + Vite port to hot-reload
    // straight onto a physical device. Leave commented for production builds.
    // url: 'http://192.168.1.10:5173',
    // cleartext: true,
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#1a1612',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
    },
    Keyboard: {
      resize: 'body',
    },
  },
};

export default config;
