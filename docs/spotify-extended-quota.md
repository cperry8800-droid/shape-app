# Spotify Extended Quota Mode — application

Paste-ready text for the Extended Quota Mode request in the Spotify Developer
Dashboard. Fill the `[bracketed]` values before submitting. Approval lifts the
25-user Development-mode allowlist cap so **any** coach can connect their Spotify
and pick from their library (today it's allowlist-gated; see `WORKLOG.md`).

> Keep this in sync with `src/lib/integrations/providers.ts` (scopes) and the
> Spotify endpoints the app actually calls (below). Scope-vs-usage mismatches are
> the #1 cause of rejection.

---

**App name:** Shape

**App website:** https://theshapecommunity.com

**Redirect URI(s):**
- `https://theshapecommunity.com/api/integrations/spotify/callback`
- `https://www.theshapecommunity.com/api/integrations/spotify/callback`

**Is your app commercial?** Yes — Shape is a paid fitness-coaching platform
($5/month membership; coaches set their own prices). Spotify is a free, optional
integration, not a paid feature.

---

## What does your app do? (short)

Shape is a fitness coaching app where certified trainers and nutritionists build
training programs and meal plans for their clients. Coaches can attach a workout
playlist to a program so their clients train to the right music, and clients can
save those playlists to their own Spotify library in one tap. Spotify is used
purely to (1) let a coach pick one of their own playlists when building a
program, and (2) let a client follow a coach's recommended playlist so it appears
in their Spotify app.

## How do users interact with Spotify in your app? (long)

There are two flows, both initiated explicitly by the signed-in user via
Spotify's standard OAuth Authorization Code flow:

1. **Coach — attach a playlist to a program.** When a coach builds a "soundtrack"
   for a workout or plan, they can connect their Spotify account and pick one of
   their own playlists from a list, instead of pasting a link. We read their
   playlists to populate that picker and store only the playlist's public link,
   name, and track count alongside the program.

2. **Client — save a coach's playlist.** When a client views a program their
   coach assigned, they can tap "Save to my Spotify," which follows the coach's
   playlist so it shows up in the client's own Spotify library. Nothing is
   created or modified beyond following an existing public playlist.

Music always plays in the official Spotify app — Shape never streams audio
itself. We display playlist names, cover art, track counts, and links only.

## Which Spotify endpoints and scopes do you use, and why?

| Scope | Endpoint | Why |
|---|---|---|
| `playlist-read-private` | `GET /v1/me/playlists` | Populate the coach's playlist picker with their own playlists when building a program. |
| `playlist-read-collaborative` | `GET /v1/me/playlists` | Include collaborative playlists a coach co-owns in that same picker. |
| `playlist-modify-public` | `PUT /v1/playlists/{id}/followers` | Let a client follow ("Save to my Spotify") a coach's public playlist into their own library. |
| `playlist-modify-private` | `PUT /v1/playlists/{id}/followers` | Same follow action when the client chooses to save it privately. |

We also read public playlist metadata (`GET /v1/playlists/{id}`) via the Client
Credentials flow (no user scope) to display a playlist's name, track count, and
duration from a pasted link.

**We do not** stream audio, store Spotify content, build a competing player, use
audio-analysis/recommendation endpoints, or apply any Spotify data to ML/AI.

## Expected number of users

Currently approximately **[X]** monthly active users, of whom a subset (coaches +
their clients) use the optional Spotify integration. We project **[Y]** within 12
months. We have already validated the flows end-to-end with our allowlisted
Development-mode accounts.

---

## Pre-submission checklist

- [x] **Scopes match usage** — `user-read-email` removed; the app requests only
      the four scopes it actually calls (see `providers.ts`).
- [ ] **Record a 30–90s screen demo** of the real flow: coach connects Spotify →
      picks a playlist → it attaches to a program → client opens the program →
      taps "Save to my Spotify" → playlist appears in their Spotify library.
- [ ] Fill `[X]` / `[Y]` user numbers above.
- [ ] Confirm redirect URIs in the dashboard match the two listed above.

## Tips
- Be explicit that music plays **in Spotify, not in Shape** — reviewers reject
  anything that looks like it replaces the Spotify player.
- Keep the "commercial" answer honest (Shape is paid; Spotify is a free optional
  add-on) — that's fine and expected.
- Approval typically takes a few weeks; Development mode + the paste-a-link
  importer keep things working in the meantime.
