# Shape — iOS App

A Capacitor wrapper around a Vite + React SPA. Reuses Supabase auth and the
existing API on `theshapecommunity.com`. The visual designs in
`../public/mobile/*` are the source of truth — port screens into
`src/screens/` as you go.

## Architecture at a glance

```
┌──────────────────────────────────────────────────────────────┐
│                      iOS App (this repo)                     │
│                                                              │
│   ┌─────────────────┐      ┌─────────────────────────────┐   │
│   │ Vite + React    │ ───► │ Capacitor (native shell)    │   │
│   │ SPA — src/      │      │   ios/App/App.xcodeproj     │   │
│   └─────────────────┘      └─────────────────────────────┘   │
│            │                                                 │
│            ▼                                                 │
│   ┌─────────────────────────────────────────────────────┐    │
│   │ @supabase/supabase-js (auth + DB)                   │    │
│   │ fetch('https://theshapecommunity.com/api/...')      │    │
│   └─────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
                                ▲
                                │  same Supabase project,
                                │  same Stripe customers
                                ▼
              ┌───────────────────────────────┐
              │  Next.js web app (../)        │
              │  - server actions             │
              │  - /api/stripe/webhook        │
              └───────────────────────────────┘
```

## Local development (browser preview, no Mac required)

```bash
cd mobile-app
npm install
cp .env.example .env  # then paste your Supabase anon key
npm run dev           # http://localhost:5173 in a desktop browser
```

This runs the SPA in a regular browser tab. Capacitor APIs that require
native (Haptics, StatusBar, Push) silently no-op via `Capacitor.isNativePlatform()`.

## Adding the iOS native shell (Mac + Xcode required)

> You only do this once, on a Mac. After that the iOS project lives in
> `ios/App/` and is committed alongside the JS source.

```bash
# 1. Install CocoaPods if you haven't (Xcode dependency for Capacitor).
sudo gem install cocoapods   # Apple Silicon: see https://capacitorjs.com/docs/getting-started/environment-setup

# 2. Build the web bundle and add the iOS native project.
npm run build
npm run ios:add              # creates ios/ directory

# 3. Sync the dist/ build into ios/App/App/public.
npm run ios:sync

# 4. Open in Xcode. Build target = App. Pick a simulator and ⌘R.
npm run ios:open
```

## Iteration loop after the iOS project exists

```bash
npm run build && npm run ios:sync   # rebuild + copy into Xcode
# or, if Xcode is already open, just ⌘R again — it picks up the new bundle
```

Tip: for faster iteration during heavy UI work, point Capacitor at your
laptop's dev server. Uncomment `server.url` in `capacitor.config.ts`,
substitute your local IP and port, then `npm run dev` + run the app in
the simulator. Code changes hot-reload onto the device.

## Porting designs from `../public/mobile/`

The existing files are JSX rendered via `@babel/standalone` — useful for
fast Figma-style iteration but not shippable. The component bodies are
fine; just lift them into TSX modules.

For each screen you want to port:

1. Open the source, e.g. `../public/mobile/iosAppMain.jsx`.
2. Copy the function body into `src/screens/Whatever.tsx`.
3. Convert inline `className="phone"` shells to a flat layout — Capacitor
   already provides the phone canvas. Drop the `max-width: 430px` wrapper.
4. Replace `<a href="OtherPage.html">` with `<Link to="/other-route">`
   from `react-router-dom`.
5. Add the route in `src/App.tsx`.

The current `src/screens/Home.tsx` shows the rough shape: card primitives,
serif headings, teal accents — all variables are already defined in
`src/styles.css`.

## Auth + API

`src/lib/supabase.ts` is a working client that persists sessions via
`@capacitor/preferences` (safer than localStorage on iOS — survives app
upgrades). Sign-in / sign-up / password reset can use the same Supabase
methods you already call on the web; the auth callback flow needs a
small change (Capacitor uses the `App` plugin's URL listener instead of a
browser redirect). Wire that up when you implement the login screen.

For server actions that require the service-role key (refunds, Stripe
checkout creation, webhooks), keep calling
`https://theshapecommunity.com/api/...`. Don't try to embed service-role
secrets in the iOS bundle.

---

# App Store submission checklist

A tracked list — knock these out in order. None of them require you to
write code; they're paperwork inside Apple Developer + App Store Connect.

## Phase 1 — Apple Developer setup ($99/year)

- [ ] **Apple Developer Program** account active. Use the legal entity
      that owns "Shape" — App Store Connect uses this name on the listing.
      https://developer.apple.com/programs/
- [ ] In *Certificates, Identifiers & Profiles* → *Identifiers* → register
      a new **App ID** with bundle `com.theshapecommunity.shape`
      (must match `capacitor.config.ts` exactly). Enable capabilities
      you'll use: Push Notifications, Sign in with Apple, HealthKit,
      Associated Domains.
- [ ] Generate a **Distribution certificate** (Xcode → Settings →
      Accounts → Manage Certificates does this automatically).
- [ ] Create a **Provisioning Profile** for distribution.

## Phase 2 — App Store Connect record

- [ ] In *App Store Connect* → *My Apps* → *+* → New iOS App.
      App name "Shape", primary language English, bundle ID matches above,
      SKU is freeform (e.g. `shape-ios-001`).
- [ ] Fill *App Information*: category (Health & Fitness), age rating
      (questionnaire — answer truthfully; coaching content + community
      typically lands at 12+), content rights, contact info.
- [ ] *Privacy* → fill the **Privacy Manifest** (`ios/App/App/PrivacyInfo.xcprivacy`
      — Capacitor scaffolds a starter). Declare every category of user
      data the app collects and what it's linked to.
- [ ] *App Privacy Policy URL* → `https://theshapecommunity.com/privacy`.

## Phase 3 — Build + upload

- [ ] In Xcode, set the *Team* on the App target to your developer team.
- [ ] Product → Archive. Validate the archive (Apple checks for missing
      icons, entitlements, etc.).
- [ ] Distribute App → App Store Connect → Upload. The build appears
      in App Store Connect after ~10 minutes of processing.
- [ ] In App Store Connect → *TestFlight* → invite yourself + a few
      testers. Verify everything works end-to-end on a real device
      before submitting for review.

## Phase 4 — Marketing assets (most-rejected step)

- [ ] **App icon** — 1024×1024 PNG, no transparency, no rounded corners.
      Apple applies the squircle automatically.
- [ ] **Screenshots** — at minimum 6.5" iPhone (1284×2778). Three to ten
      images per device class. Don't include device frames (App Store
      adds them).
- [ ] **App description** — 4,000 char max. Lead with the value prop.
- [ ] **Promotional text** — 170 chars, can be edited without resubmitting.
- [ ] **Keywords** — 100 chars, comma-separated. Don't repeat the app name.
- [ ] **Support URL** — `https://theshapecommunity.com/help` works.

## Phase 5 — Review submission

- [ ] *App Review Information* → demo account credentials so the reviewer
      can sign in. Create a `reviewer@theshapecommunity.com` Supabase
      account with realistic seed data; share the password here.
- [ ] *Notes* → call out anything non-obvious. If you use Stripe, mention
      that subscriptions are sold by external coaches (so it's a
      marketplace, not a digital purchase requiring IAP — see
      [Guideline 3.1.3](https://developer.apple.com/app-store/review/guidelines/#3.1.3)).
      This is the most common rejection vector for marketplace apps.
- [ ] Submit. First review usually 24–48 hours. Be ready to reply
      same-day to reviewer messages — silence stalls review.

## Phase 6 — Post-launch

- [ ] Set up **App Store Connect API key** for automated builds (CI / Fastlane).
- [ ] Wire **App Tracking Transparency** prompt if you ever add IDFA-based
      analytics; otherwise skip and declare it in Privacy Manifest.
- [ ] Configure **Push Notifications** server-side. APNs key lives in
      Apple Developer; the iOS device token round-trips through Supabase
      (a `device_tokens` table is the simplest pattern).

---

## Notable Capacitor plugins you may want to add later

| Need                         | Plugin                            |
| ---------------------------- | --------------------------------- |
| Apple Sign-In                | `@capgo/capacitor-social-login`   |
| HealthKit (steps, sleep)     | `@perfood/capacitor-healthkit`    |
| Push notifications           | `@capacitor/push-notifications`   |
| In-app purchases (if needed) | `@revenuecat/purchases-capacitor` |
| Camera (form-check videos)   | `@capacitor/camera`               |
| Local notifications          | `@capacitor/local-notifications`  |

Install with `npm install <plugin>` then `npx cap sync ios`.
