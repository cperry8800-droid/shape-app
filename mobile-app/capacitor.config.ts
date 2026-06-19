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
    // Background audio intent (Shape Radio live stream):
    //   iOS  — the `audio` UIBackgroundMode declared in ios/App/App/Info.plist keeps
    //           the <audio> stream alive when the phone is locked or the app is
    //           backgrounded. No additional plugin config is required; it activates
    //           on the native Xcode build after `npx cap sync`.
    //   Android — the FOREGROUND_SERVICE permission in AndroidManifest.xml is a
    //             prerequisite only. Full background audio additionally requires a
    //             foreground-service/background-mode Capacitor plugin wired in the
    //             native build (e.g. `npm i capacitor-plugin-background-mode` in
    //             mobile-app/, then `npx cap sync`). Without that plugin the stream
    //             will be paused by Android when the app is backgrounded.
    //             See mobile-app/RADIO-BACKGROUND-AUDIO.md for activation steps.
  }
};

export default config;
