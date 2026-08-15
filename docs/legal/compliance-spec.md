# Shape — Compliance Source of Truth

> **Status: SCAFFOLDING / DRAFT — NOT LEGAL ADVICE.** This document and every
> policy derived from it are engineering + drafting work product. They must be
> reviewed and signed off by qualified privacy counsel (US state + EU/UK) before
> launch. Several items carry direct, litigated legal risk — most acutely the
> **Washington My Health My Data Act (MHMDA)**, which has a **private right of
> action**. Do not treat publication of these documents as a determination of
> compliance.

This is the single source of truth that every Shape privacy/compliance document
(`privacy.html`, `terms.html`, `data-compliance.html`, `health-data-privacy.html`,
`subprocessors.html`) draws from. Update **here first**, then propagate, so the
documents never drift. Produced from the multi-agent compliance audit
(2026-06-22) + a codebase data-flow review.

`[VERIFY]` = a factual claim that must be confirmed (often in code) before
publication. `[COUNSEL]` = a legal determination for the attorney. `[TODO]` = an
operational task (e.g. appoint a representative) that must be done before the
related claim is true.

---

## 1. Entity & contacts

| Field | Value |
| --- | --- |
| Operator (trading name) | **Shape** |
| Legal entity | `[COUNSEL — confirm registered entity name + form, e.g. "Shape Community, Inc."]` |
| Operated from | United States (Brooklyn, NY) |
| Website | https://theshapecommunity.com |
| General contact | **info@theshapecommunity.com** |
| Privacy / data-rights requests | **privacy@theshapecommunity.com** `[TODO — create alias]` |
| Security reports | privacy@theshapecommunity.com |
| EU Art. 27 representative | `[TODO — appoint EU rep-as-a-service; publish name + EU address]` |
| UK Art. 27 representative | `[TODO — appoint separate UK rep; publish name + UK address]` |
| Data Protection Officer | Not appointed `[COUNSEL — Art. 37 likely triggered by large-scale special-category processing; assess]` |

## 2. What Shape is (for scoping)

Consumer **fitness + coaching marketplace** (web + iOS app). Independent trainers
and nutritionists (incl. RD/RDN) coach members. Shape is **not** a healthcare
provider, health plan, or clearinghouse; coaches are **not** the member's medical
providers. Health information entered is therefore **consumer health data, not
HIPAA PHI** `[COUNSEL — confirm; HIPAA exemptions in state privacy laws do NOT
help Shape because coaches are not covered entities/business associates, so the
consumer-health-data statutes (MHMDA etc.) apply in full]`.

## 3. Stated postures (Shape's strongest defenses — each must be TRUE in code)

| Posture | Status |
| --- | --- |
| We do **not sell** personal information | `[VERIFY — audit FCM, Instacart, Apple Music, Spotify, Vercel Analytics for any cross-context behavioral-advertising disclosure before publishing]` |
| We do **not share** for cross-context behavioral advertising / no targeted ads | `[VERIFY — same audit]` |
| We do **not train ML/AI models** on user fitness/health data | `[VERIFY — depends on OpenAI being on zero-retention/no-training API terms, see §6]` |
| **18+** only | `[TODO — real neutral DOB age gate + server-side enforcement is Wave 3; today it is self-declaration]` |
| Health data is **share-gated** to chosen coach(es) | TRUE (RLS); safety screening always visible to a linked coach |

## 4. Applicable laws (apply the strictest reasonable baseline to ALL users)

- **EU GDPR** + **UK GDPR** (DPA 2018 as amended by the Data (Use and Access) Act
  2025) — Art. 9 special-category health data (explicit consent), Art. 6 lawful
  basis per purpose, Art. 13/14 notice, Arts. 15–22 rights, Art. 27 EU **and**
  separate UK representative, Art. 28 DPAs, Art. 30 ROPA, Art. 32 security, Art.
  33/34 breach (72h), Art. 35 DPIA, Chapter V transfers (SCCs / DPF / UK IDTA).
- **ePrivacy Directive / UK PECR** — consent for device storage (cookies/SDKs)
  and electronic marketing.
- **California CCPA/CPRA** + CPPA regs — notice at collection, sensitive-PI limit
  right, **GPC honoring (mandatory)**, Do-Not-Sell/Share, financial-incentive
  notice, categories+retention table, risk assessments.
- **California / Maryland Age-Appropriate Design Codes** — note CA AB 2273 no
  longer enjoined after *NetChoice v. Bonta* (9th Cir., 2026-03-12). Over-covered
  by a real 18+ gate.
- **Washington My Health My Data Act (RCW 19.373)** — standalone CHD policy,
  separate collect/share consent, written authorization to sell, cascading
  deletion, geofencing ban; **private right of action**. **Highest exposure.**
- **Nevada SB370** + **Connecticut SB3** consumer-health amendments — parallel.
- **~19 other US state comprehensive laws** (VA, CO, CT, UT, TX, OR, MT, FL, DE,
  IA, NJ, NH, NE, **MD MODPA — strictest**, MN, RI, IN, KY, TN) — sensitive-data
  **opt-in consent**, rights + **appeal**, universal-opt-out/GPC, data-protection
  assessments, processor contracts; MD MODPA bans selling sensitive data and
  imposes strict data minimization.
- **COPPA** — under-13 (over-covered by 18+).
- **State breach-notification laws** (all 50; CA SB 1223 30-day incl. health).
- **CAN-SPAM** (US) + **CASL** (Canada) — marketing email; **TCPA** — SMS/push.
- **ADA Title III / WCAG 2.1 AA** + **EU Accessibility Act** (in force 2025-06-28).
- **PCI-DSS v4.0.1** (SAQ A via Stripe-hosted fields; script-integrity 6.4.3 /
  11.6.1 mandatory since 2025-03-31).
- **Apple HealthKit / MusicKit** platform terms (no advertising use, no sale,
  privacy-policy requirement).

## 5. Personal & consumer-health-data (CHD) inventory

All stored in Supabase Postgres, owner-scoped RLS, coach read via
`is_coach_on_client` / active subscription. Health/CHD marked **★**.

**Account & identity:** name, email, password hash, username/handle, role, profile
photo, bio, pronouns, links; coach application details (credentials, specialties,
COI/cert files in private bucket).

**Health & safety screening ★** (`user_goals('health_profile')`): PAR-Q answers;
**prescription medications**; **allergies**; **pregnancy/postpartum status**;
ongoing medical conditions; injuries/surgeries; emergency contact.

**Body & progress ★:** `client_weigh_ins` (weight, body-fat %); `client_measurements`
(girths); `client_progress_photos` (private bucket); `daily_health_snapshot`
(resting HR, HRV, sleep, recovery, workout minutes, calories, macros, hydration,
mood/stress where present).

**Check-ins ★:** `client_checkins` (sleep, energy, stress, hunger, adherence
ratings, wins/struggles, weight).

**Activity & nutrition ★:** training logs, workout sessions/set logs, meal logs +
macros, meal-note **audio** (private bucket), grocery lists.

**Goals ★:** `client_goals` / `user_goals` (body-comp targets, why).

**Connected sources ★** (`user_integrations`, member opt-in): Apple Health, Strava,
Garmin, Whoop, Oura — activities, HR, HRV, sleep, recovery, calories; Spotify
(playlist refs).

**Social / community:** `community_posts`, `messages` (1:1 + channels), follows,
reactions, `member_playlists`.

**Commerce:** Stripe customer/subscription/purchase records (last4, brand, status —
**no full card numbers**); `score_ledger` (Shape Score), store redemptions.

**Device & usage:** IP, device identifiers, `push_tokens`, session timestamps,
aggregate analytics.

## 6. Sub-processor inventory (the canonical list — `subprocessors.html` renders this)

| Vendor | Purpose | Data categories | Health data? | Region | Transfer mechanism |
| --- | --- | --- | --- | --- | --- |
| **Supabase** | Database, auth, file storage | Account, profile, **all health/CHD tables**, messages, photos/audio (Storage) | **YES (bulk)** | US (EU regions available) | **SCCs + TIA** (+ UK IDTA); not DPF-certified `[VERIFY residency choice — §10]` |
| **Stripe** | Payments, subscriptions, Connect payouts | Name, email, billing, last4/brand, transaction status | No | US / global | DPF + SCCs (Stripe DPA) `[VERIFY]` |
| **Vercel** | Web hosting, edge, product analytics | IP, request/usage data | Incidental | US / global | DPF `[VERIFY]` |
| **Cloudflare** | DNS, network security, **Turnstile** bot challenge | IP, challenge token | No | US / global | DPF `[VERIFY]` |
| **OpenAI** | "Nora" assistant chat, Whisper transcription, TTS | **Coaching text incl. HRV/sleep/recovery/weight/body-fat/mood + training adherence/avg calories/protein/weigh-ins; meal-note voice audio** | **YES** | US | **SCCs** (not DPF-certified); **requires zero-retention + no-training API terms** `[VERIFY — confirm Shape is on OpenAI API platform terms with no-training/zero-retention for ALL routes: ai/weekly-readout, ai/draft-message, support/chat, nutrition/voice, ai/speak]` |
| **Google / Firebase Cloud Messaging** | Push notifications | Device push tokens, notification content | Possibly (copy) | US / global | DPF + SCCs (Google DPA) `[VERIFY]` |
| **Resend** | Transactional + (future) marketing email | Name, email, message content | No | US | DPF / SCCs (Resend DPA) `[VERIFY]` |
| **Instacart** | Grocery-list hand-off (when enabled) | Grocery list items (diet-revealing) | Indirect (diet) | US | Per Instacart terms `[TODO — disclose BEFORE INSTACART_API_KEY is set]` |
| **Apple** (HealthKit / MusicKit) | Health import (iOS), music playlists | Health metrics (member-authorized), playlist refs | **YES (HealthKit)** | On-device + US | Apple platform terms |
| **Spotify** | Playlist sharing (in-workout audio) | Basic profile, playlist refs | No | US / global | Per Spotify terms |
| **Strava / Garmin / Whoop / Oura** | Wearable import (member opt-in) | Activities, HR, HRV, sleep, recovery, calories | **YES** | US / global | Per provider terms |
| **Radio.co** | Shape Radio audio stream (non-interactive webcast) | IP + user agent of the listening device; no account or health data | No | US / global (CDN) | `[VERIFY — DPA + which licences the plan carries; see §15]` |

**Recipients that are NOT processors:** the independent **coaches** a member links
with are **third-party recipients** of a consumer-directed disclosure (member
chooses them). `[COUNSEL — treat as independent controllers (default) vs joint
controllers; drives the coach agreement + CHD recipient language + liability]`.

## 7. Lawful bases (GDPR Art. 6/9) — per purpose

| Purpose | Art. 6 basis | Art. 9 (if health) |
| --- | --- | --- |
| Account, auth, core coaching, payments | Contract (6(1)(b)) | — |
| Health/fitness data to coach you | Contract + **explicit consent** | **9(2)(a) explicit consent** |
| Security, fraud, Turnstile, debugging | Legitimate interests (6(1)(f)) | — |
| Optional analytics | Consent (6(1)(a)) | — |
| Marketing (email/push) | Consent (6(1)(a)) — default OFF | — |
| Tax / legal records | Legal obligation (6(1)(c)) | — |

## 8. Consent model (unbundled — built in Wave 3; documents describe it)

Replace the single "I agree to Terms + Privacy" checkbox with separate, unticked,
independently-withdrawable consents, each logged to a `consent_log` table (who,
exact text + version, timestamp, scope):
1. **Health/sensitive-data** (Art. 9 / consumer-health) — before PAR-Q / first
   weigh-in / progress-photo.
2. **Per-wearable** — naming the exact metrics, at each connect.
3. **Share-with-coach** — distinct from collection.
4. **Marketing** — default OFF.
5. **Device storage / cookies** — via the consent banner.

## 9. Data-subject rights & SLAs

Access · correct · delete · portability (machine-readable) · opt-out of
sale/share/targeted-ads/profiling (**Shape does none** `[VERIFY]`) · limit use of
sensitive PI · withdraw consent · **appeal** (state laws) · authorized-agent
requests. Channel: **privacy@theshapecommunity.com** + the in-app
request/export/delete tools (Wave 3). SLAs: CCPA ack ≤10 business days / respond
≤45 days; GDPR/state ≤1 month (extendable). Identity verified proportionately.
**MHMDA:** access response must include the **list of recipients**; deletion of
CHD has **no broad legal-retention loophole**.

## 10. Retention

Active account: while active. Deletion request: erased ≤30 days, cascading across
DB rows + Storage objects (progress-photos, community-photos, meal-notes,
coach-media) + push tokens + wearable tokens, with deletion requested from OpenAI
& Resend. Exceptions (documented): **Stripe transaction/tax records 7 years**
(legal obligation); backups expire ≤90 days; support correspondence 2 years.
`[COUNSEL — confirm the exact preservation list matches the published schedule;
MHMDA gives no broad CHD retention exception]`.

## 11. International transfers

US-hosted. EU/UK → US safeguards **per importer** (see §6). **Highest-priority
decision** `[COUNSEL/OWNER]`: keep Supabase US-hosted with SCCs + a Transfer
Impact Assessment (+ UK IDTA), **or** move the health-data project to an EU
region. OpenAI + Firebase transfers must be papered (SCCs / DPF as applicable).

## 12. Children

18+. Neutral **date-of-birth age gate** with server-side enforcement + delete-on-
discovery (Wave 3). No service knowingly directed to or used to collect data from
under-18s. Keep an internal "not likely to be accessed by children" audience memo
to rebut design-code scope.

## 13. Open decisions for owner/counsel (from the audit)

1. Engage privacy counsel (US state + EU/UK) to review everything before launch.
2. Confirm OpenAI no-training/zero-retention API terms for all health-text routes.
3. Verify Vercel Analytics writes no device storage / processes no identifier
   (else gate behind the consent banner).
4. Run the sell/share audit (FCM, Instacart, Apple Music, Spotify, analytics)
   before publishing any "no sale/share" claim.
5. Coach legal status: independent vs joint controller.
6. Supabase residency: US + SCCs/TIA vs EU region.
7. Appoint EU + UK Art. 27 representatives (or geo-restrict EEA/UK at launch).
8. Treat Shape Score → Store as a CCPA financial incentive (recommended) — post
   the notice + document the analysis.
9. Retention exceptions list confirmed against the deletion endpoint.
10. Age-assurance level (neutral DOB vs harder verification).
11. Scope Accessibility (EU Accessibility Act) + PCI-DSS v4.0.1 script-integrity
    as their own workstreams before EU launch.

## 14. Document map

| Document | Path | Status |
| --- | --- | --- |
| Privacy Policy (comprehensive) | `public/privacy.html` | Wave 2 rewrite |
| Consumer Health Data Privacy Policy (MHMDA) | `public/health-data-privacy.html` | **Wave 1 (this)** |
| Sub-processor list | `public/subprocessors.html` | **Wave 1 (this)** |
| Data & Compliance | `public/data-compliance.html` | **Wave 1 correction** + Wave 2 |
| Terms of Service | `public/terms.html` | Wave 2 |
| Consent banner + GPC | `public/newdesign/consentBanner.jsx`, `src/lib/gpc.ts` | Wave 3 |
| Rights webform + export/delete APIs | `public/newdesign/privacy-request.*`, `src/app/api/account/*` | Wave 3 |
| Counsel-owned internal drafts (ROPA, DPIA, TIA, DPA checklist, IRP, retention schedule, LIA, accessibility statement, PCI SAQ) | `docs/legal/*.md` | Wave 4 |

## 15. Shape Radio — the NON-INTERACTIVE BOUNDARY (licensing constraint)

**Ruled 2026-08-15 (owner):** Shape Radio is a **non-interactive** stream; the US
statutory licence applies, and it must be kept that way **structurally**.

Shape **does** host and stream audio (via Radio.co) — it is not passthrough. This
is the opposite of coach playlists/soundtracks, which are genuine link-outs. The
two must never be described in the same breath; `terms.html` §07 conflated them
and has been corrected.

### The four prohibitions

A statutory licence (17 U.S.C. §114 / SoundExchange) is available **only** to a
service the listener cannot steer. Crossing any line below removes the licence
entirely and puts Shape into direct per-label master-rights negotiation:

1. **No track selection** — a listener may never choose what plays next.
2. **No on-demand replay** — a specific recording may never be replayed on request.
3. **No advance playlist** — never publish (or let anyone else publish) the titles
   of upcoming recordings or their featured artists before they air.
4. **No skip-to-specific** — no seek, no "play this one", no per-track skip that
   lets a listener converge on a chosen recording.

**This is a licensing constraint, not a product preference.** Any future feature
crossing it is an owner/counsel decision about becoming a different kind of
business — never an implementation workaround. The same note is carried at the top
of `mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx`, where the code lives.

### Verified compliant 2026-08-15 (and why)

| Feature | Finding | Why it holds |
| --- | --- | --- |
| `shape.radio.musicLibraries` (saved tracks) | **Cannot replay.** Zero UI consumers repo-wide; `saveTrackToLibrary`/`isTrackSaved` are unsurfaced | `makeRadioTrackPayload` stores **text metadata only** — key/title/artist/bpm/len/savedAt. No audio, no stream handle, no addressable track id. It is a bookmark for the member's own Spotify/Apple account. **Keep it metadata-only.** |
| `coach_soundtracks` / soundtrack assign | **Link-outs, not our stream** | Guaranteed at the schema layer: `provider` is CHECK-constrained to `('spotify','apple')`; playback is `window.open(url)` into the member's own account under that provider's licence to them. A coach ordering recordings *inside Shape's stream* would be interactive — never build it. |
| Upcoming-track UI | **None exists** | `nowPlaying` names the **current** recording only (contemporaneous display is permitted). No surface anywhere exposes a next/upcoming *recording*. |
| `trackIdx` / `setTrackIdx` | **Removed 2026-08-15** | The pair sat on `BSRadioContext` with **zero consumers** — a ready-made "play track N" affordance. Deleted rather than left as a foothold. Do not reintroduce. |
| Shape Sets (`nora_sets`) COMING UP | **Programme schedule, permitted** — with an authoring rule | It publishes **shows** (title/dj/time, ≤7 days ahead), not track lists. ⚠ But `title`, `dj` and `blurb` are **unconstrained free text** written by ops via `service_role`. A set named or described with a **featured artist** or a specific recording becomes a prior announcement and breaks prohibition 3. **Name shows for the DJ or the mood, never the music.** |

### Open — cannot be verified from the codebase

- **Performance complement enforcement** `[VERIFY — RADIO.CO]` The statutory licence
  caps, per listener per 3 hours: **≤4 tracks per featured artist** (≤3 consecutive)
  and **≤3 tracks per album** (≤2 consecutive). Whether Radio.co's rotation engine
  *enforces* this is a vendor capability question. **If it does not, the track pool
  and rotation must guarantee it structurally** — a policy nobody enforces is not a
  control.
- **Play-log reporting** `[VERIFY — RADIO.CO]` SoundExchange requires census
  reporting of actual performances (recording, artist, album, ISRC where available,
  performance counts). Confirm Radio.co produces reports in an accepted format, and
  who files them.
- **Rate classification — SETTLED 2026-08-15: subscription only.** The owner ruled
  the signed-out listening path **removed** rather than carry two rate
  classifications. `public/radio.html` had a live 10-minute signed-out preview
  (`shapeRadioPreviewConsumed`, 600s of counted playback); it is gone, and the page
  now fails **closed** to a sign-in gate — including when the auth client never
  loads, because an unlicensed-tier performance is worse than an unnecessary prompt.
  ⚠ **Reintroducing any signed-out listening re-opens the non-subscription rate
  ($0.0025) and permanently splits SoundExchange reporting.** It is a licensing
  decision, not a growth experiment.
- **Which licences Radio.co carries — SETTLED 2026-08-15: none.** Radio.co's own
  help documentation states they do **not** provide music licensing or royalty
  coverage. **Proceed on the basis that Shape pays SoundExchange and the PROs
  directly.** One confirmation email to Radio.co remains outstanding, to rule out a
  higher-tier plan that bundles it — `[TODO — OWNER]`, but not a blocker.
- **Territory** Licences below cover US + UK only; every other territory is
  **geo-blocked at Radio.co**, with graceful in-app handling.

### To build — 1: `play()` must return WHY it failed

`ShapeRadioLive.play()` (`shapeBackend.js`) collapses **every** failure to `false`,
and the caller (`iosAppBroadsheetRadio.jsx`) discards even that. So the UI cannot
distinguish a geo-block from an unconfigured station from a browser autoplay
policy — and a UI that guesses would tell a member "unavailable in your region"
when their browser merely required a tap. **Same doctrine as the progression
guardrail: no verdict the function can't support.**

Return a reason instead of a boolean:

| Reason | Cause | Honest UI |
| --- | --- | --- |
| `ok` | Playing | Normal player |
| `region_blocked` | Provider refused by territory (403 / geo-block) | "Shape Radio isn't available in your region yet." |
| `unconfigured` | No `stream_url` on the station row | "Shape Radio is off air." — never a region claim |
| `autoplay_blocked` | Browser/OS requires a gesture | "Tap to start" — never a region claim |
| `offline` | No network | "You're offline." |
| `unknown` | Anything else | "Couldn't start Shape Radio." + retry |

Notes for the build: `region_blocked` must be distinguished from a generic network
error by the **provider's response status**, not inferred from a failed
`audio.play()` — a rejected play promise is ambiguous by design, so the status
check belongs on a lightweight probe of `stream_url` (or a provider endpoint)
before/alongside playback. `unknown` must **not** fall back to a region message.
Both surfaces consume it: mobile (`radioOn` effect) and `public/radio.html`.

### To build — 2: a Shape Sets guard, not just a documented rule

The authoring rule above ("never name the music") will not survive staff turnover,
so it needs enforcement at the write path. Assessed options:

| Option | Verdict |
| --- | --- |
| `CHECK` constraint on `title`/`dj`/`blurb` | **Insufficient alone.** A CHECK is a predicate over the row's own text; it cannot know whether a string is a recording artist. It *can* catch the giveaway **forms** — `feat.`, `ft.`, `featuring`, `presents`, `w/`, a `—`/`·` attribution tail — which is worth having as a cheap tripwire. |
| Denylist table + `BEFORE INSERT/UPDATE` trigger | **Recommended.** A small ops-maintained `nora_set_forbidden_terms` table seeded with the artists in the station's actual rotation, checked case-insensitively (and accent-folded) against all three fields. Rejects by name with a clear error. Honest limit: a denylist is a tripwire, not a proof — it catches the careless case, not a determined one. |
| Controlled vocabulary — FK the set to a `nora_djs` row and template the public title | **Strongest, largest change.** Removes free text from the public-facing fields entirely, so there is nothing to lint. The right end state if Sets grows an editor UI. |

**Recommendation:** ship the form-pattern `CHECK` **and** the denylist trigger now
(both cheap, both at the write path, and writes are already `service_role`-only),
and treat the controlled vocabulary as the follow-up that lands with a Sets editor.
⚠ Whatever ships must fail **loud** — a rejected insert with a named reason. A guard
that silently strips the offending words would publish a mangled schedule and teach
ops nothing.

### Licence set (owner actions — external, not code)

| Licence | Covers | Status |
| --- | --- | --- |
| **SoundExchange** (§114 statutory) | Sound recordings — US | `[TODO — OWNER]` $1,000 annual minimum; $0.0032/performance subscription rate (see rate-classification flag) |
| **ASCAP**, **BMI**, **SESAC**, **GMR** | Musical compositions — US (all four; repertories do not overlap) | `[TODO — OWNER]` |
| **PRS for Music** + **PPL** | Compositions (PRS) + recordings (PPL) — UK | `[TODO — OWNER]` |
| Geo-block all other territories | — | `[TODO — OWNER]` configure at Radio.co |
