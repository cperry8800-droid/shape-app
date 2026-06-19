# Shape Radio — Background Audio Activation Steps

Background audio cannot be tested in the web container — it requires a native build.
The config changes below are already committed; activation is a native-build step.

## What is already done (in this repo)

- `ios/App/App/Info.plist` — `UIBackgroundModes: [audio]` declared.
- `android/app/src/main/AndroidManifest.xml` — `FOREGROUND_SERVICE` permission declared.
- `capacitor.config.ts` — intent documented.

## iOS (activates automatically on the native build)

The `UIBackgroundModes audio` entry in `Info.plist` is all iOS needs.
After `npx cap sync`, open the project in Xcode and build to a device.
Verify: start Shape Radio, lock the phone — audio continues.

## Android (requires a foreground-service plugin)

Android requires a running foreground service to keep a WebView `<audio>` stream alive
when backgrounded. The `FOREGROUND_SERVICE` permission in the manifest is a prerequisite,
but a plugin is also needed:

```bash
cd mobile-app
npm i capacitor-plugin-background-mode   # or @capawesome-team/capacitor-android-foreground-service
npx cap sync
```

Wire the plugin's `enable()` call when radio playback starts (in
`iosAppBroadsheetRadio.jsx` or `shapeBackend.js` `ShapeRadioLive.play()`), and
`disable()` when it stops. Then build via Android Studio and verify on-device by
locking the phone with radio playing.

Note: without this plugin the `FOREGROUND_SERVICE` permission alone does NOT keep
audio playing on Android — the OS will pause the stream when the app is backgrounded.

## Pattern reference

This mirrors how `@capacitor/push-notifications` was activated:
1. Declare the permission/capability in the plist/manifest (done).
2. `npm i` the plugin, `npx cap sync`.
3. Build via Xcode / Android Studio.
4. Verify on a real device.
