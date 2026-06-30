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
