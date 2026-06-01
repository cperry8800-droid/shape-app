# Shape — Work Log

A durable record of recent work, settings, conventions, and pending steps. The
remote dev environment is ephemeral, so anything not committed is lost — this
file is the narrative companion to the live status dashboard in
`src/lib/warroom.ts` and the git history.

> Live status (env keys present, services reachable, go-live checklist) is
> computed at runtime by `src/lib/warroom.ts` — check that for the current
> "is it configured" truth. This file is the "what we did and why."

---

## Workflow & conventions

- **Active feature branch:** `claude/sleepy-feynman-RtyIr`. All work is developed
  here, PR'd to `main`, squash-merged, then the branch is hard-synced back to
  `main` (`git fetch origin main && git reset --hard origin/main && git push
  --force-with-lease`).
- **Do not** create PRs/merge unless asked — though the established pattern this
  cycle has been: ship each change as its own PR and squash-merge to `main`.
- **Deploy:** Vercel auto-deploys `main`. "Changes not showing" is almost always
  device cache (especially the home-screen standalone PWA) — hard-refresh or
  bump a `?v=` query, not a redeploy.

## Mobile app build & deploy (the `/m/` broadsheet SPA)

The mobile app is a Capacitor/Vite "broadsheet" SPA served at `/m/`.

```bash
cd mobile-app
VITE_BASE=/m/ npm run build         # outputs to mobile-app/dist
# then from repo root:
rm -rf public/m && cp -r mobile-app/dist public/m
```

Parse-check a single source before building (fast feedback):

```bash
cd mobile-app
node -e "require('@babel/parser').parse(require('fs').readFileSync('src/broadsheet/<file>.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"
```

TypeScript (website / API routes): `npx tsc --noEmit` from repo root.

### Architecture gotchas
- **Window-globals load order:** modules expose components via
  `Object.assign(window, {...})` and consume them via top-level
  `const {...} = window`. If a role module reads a global before a feature
  module defines it, you get React error #130 (undefined component). The shell
  loaders in `iosAppBroadsheetMain.jsx` load feature modules *first*, then the
  role module.
- **Pros vs client bundles:** clients load `iosAppBroadsheetClient.jsx`; trainers
  and nutritionists load `iosAppBroadsheetPros.jsx`. Pros reuse client-module
  globals (e.g. `BSClientChat`) off `window`.

---

## What shipped this cycle (PRs #712–#725, all on `main`)

### Community feed / chat (mobile)
- **#712** Chat tab rebuilt as **"The feed."** — role-aware filter chips:
  everyone sees **Shape** (all members) + **their own role** chip (Client /
  Trainer / Nutri) + **Community**. Teams tab gained **Channels** + **Coaches**.
- **#713** Teams sections styled as chips; **trainer & nutritionist chat now
  uses the shared role-aware feed** (`BSClientChat` delegates to `BSClientFeed`
  with a `role` prop; composer slot added to both pro shells). Opening a chat no
  longer hard-gates browse users to login.
- **#714** Teams = **Channels/Coaches selector** (tap to reveal the list);
  **Friends = people list** (tap a person to open the chat); **Community =
  Strava-style workout activity feed** (PR / run-with-splits / logged-workout
  cards with real stats), mirroring the website's "Today on Shape".
- **#716 / #717** Evenly spaced (grid) the Teams selector chips and the role
  filter chips.
- **#719** Removed the dot-texture wash from the chat masthead.

### Login & radio (mobile)
- **#715 / #720** Shape logo raised, wider logo→heading gap, browse section
  lowered/separated.
- **#718** Radio intro hero moved lower; Home week-day strip compacted.
- **#725** Radio intro: **flowing sound-wave backdrop** (soft teal lines,
  reduced-motion aware), dark theme only.

### Integrations (mobile + website)
- **#721** (mobile) **Spotify** connect/disconnect surfaced; **Apple Music**
  on-device MusicKit auth flow; **Instacart** grocery hand-off.
- **#722** (website) Same parity on `dashboard/settings/IntegrationsPanel.tsx`
  and public `integrations.html`.

### Website chat bubble
- **#723** Chat bubble tabs made **role-aware** (peer tab filtered to the
  viewer's role); removed a **duplicate close (×)** on the rich widget.
- **#724** Role filtering **only applies once logged in** — logged-out visitors
  see the full default tab set; cached role cleared on logout.

---

## Integrations status

| Service | Code | What's left to go live |
|---|---|---|
| **Spotify** | ✅ OAuth 2.0 + PKCE backend + connect/disconnect UI (mobile + web) | Set `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`; add the `/api/integrations/spotify/callback` redirect URI in the Spotify dashboard |
| **Apple Music** | ✅ Developer-token endpoint + on-device MusicKit `authorize()` → stores Music-User-Token under synthetic `apple_music` provider; connect/disconnect + status | Set `APPLE_MUSIC_TEAM_ID` / `APPLE_MUSIC_KEY_ID` / `APPLE_MUSIC_PRIVATE_KEY`. MusicKit popup works on web; verify in the native Capacitor shell |
| **Instacart** | ✅ `/api/integrations/instacart/shopping-list` builds an IDP `products_link` from coach-pushed grocery items; "Send grocery list" button | Set `INSTACART_API_KEY` (and optionally `INSTACART_CONNECT_URL` → `https://connect.dev.instacart.tools` for the dev catalog) |

Key routes added:
`/api/integrations/apple-music/connect` (POST),
`/api/integrations/apple-music/disconnect` (POST),
`/api/integrations/instacart/shopping-list` (POST).
Each returns a clear "not configured" error until its env keys are present.

### Role-aware website chat (how it works)
- `public/newdesign/globalChatButton.js` defines `window.shapeViewerRole()`
  (returns `""` when logged out) and `window.__shapeFilterChatTabs(tabs, role)`
  (no filtering when role is empty). It resolves the role from
  `shapeDb.getProfile().role`, caches it on `window` + `localStorage`
  (`shape.viewerRole`), and clears it on logout.
- Both the rich `ChatWidget` (`clientChatThreads.jsx` → `window.clientChatTabs`)
  and the fallback panel filter through the same helper, so behavior is
  identical regardless of which loads.

---

## Pending manual steps (owner: account holder, not code)

1. **Supabase dashboard:** enable the **Apple** auth provider; toggle **Confirm
   email** on. (Code paths are already in place.)
   - Project ref `zznufekgjngecelwxndw`; callback
     `https://zznufekgjngecelwxndw.supabase.co/auth/v1/callback`; app redirect
     `https://www.theshapecommunity.com/m/`.
2. **Provider keys** (Vercel env): `SPOTIFY_CLIENT_ID/SECRET`,
   `APPLE_MUSIC_TEAM_ID/KEY_ID/PRIVATE_KEY`, `INSTACART_API_KEY`
   (+ optional `INSTACART_CONNECT_URL`). See `.env.example`.
3. **Native Sign in with Apple** plugin for the iOS App Store build.

## Known follow-ups / explicitly deferred

- Website **community page** role-aware feed: explicitly **left as-is**
  (`dashboardCommunity.jsx` is marketing). The role-aware "chat feature" was
  applied to the **chat bubble** instead.
- Chat demo **thread content** is still client-flavored seed data; only *which
  tabs* appear is role-aware. Rewriting each thread's contents per role is a
  potential follow-up.
