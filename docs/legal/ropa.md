**DRAFT — prepared for Shape's privacy counsel to review and finalize. Not legal advice.**

# Record of Processing Activities (ROPA)
## GDPR Article 30 (and UK GDPR Article 30)

This register documents the processing activities carried out by Shape in its capacity as controller. It is a working draft assembled from Shape's compliance facts and must be reviewed, completed, and finalized by privacy counsel before reliance. Items marked **[VERIFY]** are unresolved facts requiring confirmation (typically code-dependent or contractual).

---

## 1. Controller and contact details

| Field | Detail |
|---|---|
| Controller | [Shape — legal entity to be confirmed by counsel] |
| Operating location | Brooklyn, NY, USA |
| Website | theshapecommunity.com |
| General contact | info@theshapecommunity.com |
| Privacy / data-subject rights contact | privacy@theshapecommunity.com |
| EU representative (GDPR Art. 27) | **[VERIFY] / TODO** — to be appointed |
| UK representative (UK GDPR Art. 27) | **[VERIFY] / TODO** — to be appointed |
| Data Protection Officer | **[VERIFY] / TODO** — confirm whether a DPO is required/appointed |

**Product context.** Shape is a consumer fitness and coaching marketplace (web + iOS app) on which independent trainers/nutritionists coach members. Shape is **not** a healthcare provider; health data handled is **consumer health data, not HIPAA PHI**. The service is **18+ only**. Independent coaches are **third-party recipients acting as independent controllers**.

**Applicable law (for counsel's awareness; drives this register).** EU GDPR; UK GDPR; ePrivacy/PECR; CCPA/CPRA and ~19 US state privacy laws (VA, CO, CT, UT, TX, OR, MT, FL, DE, IA, NJ, NH, NE, MD-MODPA, MN, RI, IN, KY, TN); Washington My Health My Data Act (private right of action); Nevada SB370; Connecticut consumer-health provisions; COPPA; state breach laws (incl. CA SB1223 — 30-day, includes health); CAN-SPAM/CASL; ADA/WCAG 2.1 AA and EU Accessibility Act (28 Jun 2025); PCI-DSS v4.0.1 (SAQ A via Stripe-hosted fields).

---

## 2. Cross-cutting notes (apply to all activities below)

**Storage and access architecture.** Substantially all personal and health data is stored in **Supabase Postgres** with owner-level Row-Level Security (RLS). Coach read access is mediated by the `is_coach_on_client` relationship. Private storage buckets are used for progress photos, community photos, meal-note audio, and coach media.

**Posture commitments (each must be true in code; flagged where code-dependent).**
- No sale of personal data. **[VERIFY]** (code/contract-dependent)
- No targeted / cross-context behavioral advertising. **[VERIFY]** (code/contract-dependent)
- No ML/AI training on user health/fitness data. **[VERIFY]** (code/contract-dependent)
- 18+ only. **[VERIFY]** (age-gate enforcement is code-dependent)

**International transfers — general.** Shape operates from the USA and uses US-based sub-processors; processing of EU/UK personal data therefore involves transfers out of the EEA/UK. Safeguards are recorded per activity and per sub-processor in the table at Section 13. Note: **Supabase and OpenAI are not certified under the EU-US Data Privacy Framework (DPF)** and rely on **SCCs (+ TIA, + UK IDTA for Supabase)**; Stripe, Vercel, Cloudflare, Firebase/FCM, and Resend rely on **DPF and/or SCCs** as noted.

**Retention — general scheme.**
- Active data: retained while the account is active.
- On deletion request: erase within **≤ 30 days**, cascading across DB rows and Storage buckets (progress-photos, community-photos, meal-notes, coach-media), plus push tokens and wearable tokens, plus a deletion request issued to **OpenAI** and **Resend**.
- Backups expire within **≤ 90 days**.
- Exceptions: Stripe transaction/tax records retained **7 years** (legal obligation); support correspondence retained **2 years**.
- **MHMDA note:** consumer health data deletion has **no broad legal-retention loophole** — health-category data must be deleted on request notwithstanding general retention practices.

**Security measures — baseline (apply to all activities).** Owner-RLS in Supabase Postgres; coach access gated by `is_coach_on_client`; private storage buckets for sensitive media; encryption in transit (and at rest as provided by Supabase/sub-processors) **[VERIFY exact controls]**; Cloudflare for DNS and Turnstile (bot/abuse mitigation); PCI-DSS v4.0.1 SAQ A scope (card data handled by Stripe-hosted fields, never touching Shape systems); access limited via roles; cascading deletion tooling. Activity-specific measures are noted per row.

---

## 3. Processing Activity Register

### 3.1 Account / Authentication

| Art. 30 element | Detail |
|---|---|
| Purpose | Create and manage member/coach accounts; authenticate users; operate the service |
| Lawful basis | Contract (Art. 6(1)(b)); legitimate interests for account security (Art. 6(1)(f)) |
| Categories of data subjects | Members; independent coaches (trainers/nutritionists) |
| Categories of personal data | Account/identity: name, email, password hash, username, role, photo, bio. **Not special-category.** |
| Recipients / sub-processors | Supabase (DB/auth/storage); Cloudflare (DNS/Turnstile); coaches (independent controllers) where the relationship applies |
| International transfers + safeguard | US transfer. Supabase: **SCCs + TIA + UK IDTA (not DPF)**. Cloudflare: **DPF** |
| Retention | While account active; on deletion request erase ≤ 30 days (cascading); backups ≤ 90 days |
| Security measures | Owner-RLS; password hashing; Turnstile; coach access via `is_coach_on_client` |

### 3.2 Coaching & Health-Data Processing

| Art. 30 element | Detail |
|---|---|
| Purpose | Deliver coaching; health screening; progress tracking; training/nutrition programming and logging between members and their coaches |
| Lawful basis | Contract (Art. 6(1)(b)); **explicit consent for special-category health data (Art. 9(2)(a))** |
| Categories of data subjects | Members; independent coaches |
| Categories of personal data (SPECIAL-CATEGORY / HEALTH marked) | **HEALTH — special category:** `user_goals('health_profile')` PAR-Q answers, prescription medications, allergies, pregnancy/postpartum, conditions, injuries, emergency contact; `client_weigh_ins` (weight, body-fat); `client_measurements` (girths); `client_progress_photos` (private bucket); `daily_health_snapshot` (resting HR, HRV, sleep, recovery, workout minutes, calories, macros, mood); `client_checkins` (sleep/energy/stress/hunger ratings); training + nutrition logs; meal logs + macros; **meal-note AUDIO** (private bucket); grocery lists; `client_goals`. Non-health: programming metadata |
| Recipients / sub-processors | Supabase (DB/auth/storage — all incl. health); the member's coach(es) as **independent controllers** via `is_coach_on_client` |
| International transfers + safeguard | US transfer. Supabase: **SCCs + TIA + UK IDTA (not DPF)** |
| Retention | While account active; on deletion request erase ≤ 30 days incl. private buckets; **MHMDA — no broad legal-retention loophole for consumer health data**; backups ≤ 90 days |
| Security measures | Owner-RLS; coach read gated by `is_coach_on_client`; private buckets for progress photos and meal-note audio; explicit consent capture **[VERIFY consent mechanics in code]** |

### 3.3 Payments

| Art. 30 element | Detail |
|---|---|
| Purpose | Process payments and subscriptions; marketplace commerce; billing records |
| Lawful basis | Contract (Art. 6(1)(b)); legal obligation for tax/transaction records (Art. 6(1)(c)) |
| Categories of data subjects | Members (payers); coaches (payees, as applicable) |
| Categories of personal data | Stripe commerce data: card **last4**, brand, status (**no full card numbers**); `score_ledger`. **Not special-category.** |
| Recipients / sub-processors | Stripe (payments) |
| International transfers + safeguard | US/global transfer. Stripe: **DPF + SCCs** |
| Retention | Stripe transaction/tax records **7 years** (legal obligation); other billing data while account active |
| Security measures | PCI-DSS v4.0.1 SAQ A via Stripe-hosted fields (card data never touches Shape systems); only last4/brand/status stored |

### 3.4 AI Features (Nora / OpenAI)

| Art. 30 element | Detail |
|---|---|
| Purpose | AI assistant "Nora" — chat coaching; voice transcription (Whisper) and text-to-speech (TTS) |
| Lawful basis | Contract (Art. 6(1)(b)); **explicit consent for health context processed (Art. 9(2)(a))** |
| Categories of data subjects | Members |
| Categories of personal data (SPECIAL-CATEGORY / HEALTH marked) | **HEALTH — special category:** coaching + health context passed to Nora; **voice audio** (meal notes / spoken input) processed via Whisper/TTS |
| Recipients / sub-processors | OpenAI (Nora chat / Whisper / TTS); Supabase (storage of related records) |
| International transfers + safeguard | US transfer. OpenAI: **SCCs (not DPF)**; API **no-training terms [VERIFY]** |
| Retention | While account active; on deletion request erase ≤ 30 days **and issue deletion request to OpenAI**; **no ML/AI training on user health/fitness data [VERIFY in code/contract]** |
| Security measures | Posture: no AI training on health/fitness data **[VERIFY]**; explicit consent for health context; transmission over encrypted channels **[VERIFY]** |

### 3.5 Push Notifications

| Art. 30 element | Detail |
|---|---|
| Purpose | Deliver push notifications (e.g., coaching reminders, app events) |
| Lawful basis | Contract / legitimate interests (Art. 6(1)(b)/(f)); consent where required by device/platform |
| Categories of data subjects | Members; coaches |
| Categories of personal data | Push tokens; notification content. **May incidentally include health-related content** depending on the notification — handle as potentially health-sensitive |
| Recipients / sub-processors | Google Firebase Cloud Messaging (FCM) |
| International transfers + safeguard | US transfer. Firebase/FCM: **DPF + SCCs** |
| Retention | While account active; push tokens erased on deletion request (≤ 30 days, cascading) |
| Security measures | Token storage under RLS; deletion cascade includes push tokens; content minimization **[VERIFY whether health content is suppressed in notifications]** |

### 3.6 Marketing

| Art. 30 element | Detail |
|---|---|
| Purpose | Marketing/transactional email communications |
| Lawful basis | **Consent for marketing (Art. 6(1)(a))**; contract for transactional/service email (Art. 6(1)(b)) |
| Categories of data subjects | Members; prospects/recipients |
| Categories of personal data | Name, email, message content. **Not special-category** (do not include health content in marketing) |
| Recipients / sub-processors | Resend (email) |
| International transfers + safeguard | US transfer. Resend: **DPF / SCCs** |
| Retention | While account active / until consent withdrawn; on deletion request erase ≤ 30 days **and issue deletion request to Resend** |
| Security measures | Consent-based sending; unsubscribe handling (CAN-SPAM/CASL); RLS on contact data |

### 3.7 Community / Social

| Art. 30 element | Detail |
|---|---|
| Purpose | Operate community/social features — posts, messages, follows, shared playlists |
| Lawful basis | Contract (Art. 6(1)(b)); consent where user voluntarily shares health-related content |
| Categories of data subjects | Members |
| Categories of personal data | `community_posts` / `messages` / `follows`; `member_playlists`; community photos (private bucket). **User-generated content may include health information** if a member chooses to share it — treat such content as potentially special-category |
| Recipients / sub-processors | Supabase (DB/storage); Spotify (playlists — no health data); other members (as visible per feature settings) |
| International transfers + safeguard | US transfer. Supabase: **SCCs + TIA + UK IDTA (not DPF)**. Spotify: per its terms **[VERIFY transfer mechanism]** |
| Retention | While account active; on deletion request erase ≤ 30 days incl. community-photos bucket |
| Security measures | RLS; private buckets for community photos; visibility controls **[VERIFY feature-level visibility settings]** |

### 3.8 Analytics / Security

| Art. 30 element | Detail |
|---|---|
| Purpose | Product analytics/improvement; security; fraud and abuse/bot mitigation |
| Lawful basis | **Consent for analytics (Art. 6(1)(a))**; legitimate interests for security/fraud/Turnstile and product improvement (Art. 6(1)(f)) |
| Categories of data subjects | Members; coaches; site visitors |
| Categories of personal data | Device/usage: IP address, push tokens, timestamps, analytics events; Turnstile token. **Not special-category** (exclude health data from analytics) |
| Recipients / sub-processors | Vercel (hosting/analytics); Cloudflare (DNS/Turnstile); Supabase (logging/storage) |
| International transfers + safeguard | US transfer. Vercel: **DPF**. Cloudflare: **DPF** |
| Retention | While account active / per analytics retention window **[VERIFY exact window]**; backups ≤ 90 days |
| Security measures | Turnstile bot mitigation; legitimate-interests assessment **[VERIFY LIA documented]**; no targeted/behavioral ads posture **[VERIFY]** |

### 3.9 Product Analytics (Funnel / Drop-off)

| Art. 30 element | Detail |
|---|---|
| Purpose | Product funnel analysis; identify and fix the biggest user drop-off points in the onboarding and core flows |
| Lawful basis | **Legitimate interests (Art. 6(1)(f))** — understanding where members abandon the signup/onboarding/training/nutrition journeys to improve product |
| Categories of data subjects | Members |
| Categories of personal data | `analytics_events`: user id + behavioral event name (e.g. `signup`, `onboarding_start`, `first_workout`, `paid_subscription_start`, `day_30_retention`) + minimal non-PII properties (timestamp, event context). **Not special-category** (excludes health/fitness data; is minimal event-behavioral data only) |
| Recipients / sub-processors | Supabase (DB storage; admin-only read access via RLS) |
| International transfers + safeguard | US transfer. Supabase: **SCCs + TIA + UK IDTA (not DPF)** |
| Retention | **12 months**; daily cron (`/api/cron/analytics-purge`) purges events >12 months old; backups ≤ 90 days |
| Security measures | Admin-only RLS on `analytics_events`; service-role-only read via **`get_funnel` RPC** (computed 7-step funnel, exposed only to admin dashboard War Room panel); **client-gated event collection** (`/api/analytics/track` validates consent/GPC before accepting events); GPC-honored server-side (no events recorded when `x-gpc-optout: 1` is set) |

### 3.10 Legal / Tax

| Art. 30 element | Detail |
|---|---|
| Purpose | Comply with legal, tax, accounting and records obligations; handle disputes and support records |
| Lawful basis | Legal obligation (Art. 6(1)(c)); legitimate interests for dispute handling (Art. 6(1)(f)) |
| Categories of data subjects | Members; coaches |
| Categories of personal data | Stripe transaction/tax records; support correspondence (name, email, message content). **Not special-category** unless support content includes health detail — minimize |
| Recipients / sub-processors | Stripe (transaction/tax records); Resend (support email transport, as applicable) |
| International transfers + safeguard | US transfer. Stripe: **DPF + SCCs**. Resend: **DPF / SCCs** |
| Retention | Stripe transaction/tax records **7 years**; support correspondence **2 years** |
| Security measures | Restricted access; retention-limited storage; **no broad health-data retention exception (MHMDA)** |

---

## 4. Connected wearable sources (cross-references activity 3.2)

These integrations feed health data into the coaching activity (3.2) and are member opt-in via `user_integrations`.

| Source | Health data? | Notes |
|---|---|---|
| Apple HealthKit | **YES** | On-device + US |
| Apple MusicKit | No | On-device + US (playlists/music) |
| Strava | **YES** | Wearable/activity data |
| Garmin | **YES** | Wearable/activity data |
| Whoop | **YES** | Wearable/activity data |
| Oura | **YES** | Wearable/activity data |

Wearable tokens are erased on deletion request (≤ 30 days, cascading). Safeguard/transfer mechanism for each integration: **[VERIFY per provider]**.

---

## 5. Sub-processor register (transfers and safeguards)

| Vendor | Purpose | Data | Health? | Region | Transfer safeguard |
|---|---|---|---|---|---|
| Supabase | DB / auth / storage | All, incl. health | **YES** | US | **SCCs + TIA + UK IDTA (not DPF)** |
| Stripe | Payments | Billing / last4 | No | US / global | **DPF + SCCs** |
| Vercel | Hosting / analytics | IP / usage | No | US | **DPF** |
| Cloudflare | DNS / Turnstile | IP / token | No | US | **DPF** |
| OpenAI | Nora chat / Whisper / TTS | Coaching + health context, voice audio | **YES** | US | **SCCs (not DPF)**; API no-training terms **[VERIFY]** |
| Google Firebase (FCM) | Push | Tokens / notifications | Maybe | US | **DPF + SCCs** |
| Resend | Email | Name / email / content | No | US | **DPF / SCCs** |
| Instacart | Grocery handoff (when used) | List items | Indirect | US | Per its terms **[VERIFY]** |
| Apple HealthKit / MusicKit | Health integration / music | Health (HealthKit) | **YES** (HealthKit) | On-device + US | **[VERIFY]** |
| Spotify | Playlists | Playlist data | No | **[VERIFY region]** | Per its terms **[VERIFY]** |
| Strava / Garmin / Whoop / Oura | Wearable integrations | Wearable health data | **YES** | **[VERIFY]** | Per provider **[VERIFY]** |

**Independent coaches** are third-party recipients acting as **independent controllers**, not sub-processors.

---

## 6. Outstanding TODOs / [VERIFY] items

- Confirm Shape's **legal entity** name and registration.
- **Appoint EU and UK Art. 27 representatives**; confirm DPO requirement.
- Confirm **OpenAI API no-training terms** are in force [VERIFY].
- Confirm code-enforced postures: **no data sale; no targeted/behavioral ads; no AI training on health/fitness data; 18+ age gate** [VERIFY each].
- Confirm **exact encryption/at-rest controls** and document security measures formally.
- Confirm **analytics retention window** and that a **legitimate-interests assessment (LIA)** is documented.
- Confirm **transfer mechanisms** for Spotify, Instacart, and each wearable provider; confirm Spotify region.
- Confirm whether **push notification content** suppresses health-sensitive detail.
- Confirm **community-feature visibility settings** and consent capture mechanics for Art. 9 health data.

---

*End of draft. Prepared for Shape's privacy counsel to review and finalize. Not legal advice.*
