import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.theshapecommunity.app',
  appName: 'Shape',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https'
  },
  ios: {
    contentInset: 'automatic'
  },
  plugins: {
    // Show the banner + play a sound even when the app is foregrounded (iOS);
    // backgrounded/closed pushes are handled by the OS automatically.
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
};

export default config;
