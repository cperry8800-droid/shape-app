**DRAFT — prepared for Shape's privacy counsel to review and finalize. Not legal advice.**

# Data Retention Schedule — Shape

**Entity:** [Shape — legal entity to be confirmed by counsel]
**Operated from:** Brooklyn, NY, USA
**Privacy/rights contact:** privacy@theshapecommunity.com
**Product:** Consumer fitness + coaching marketplace (web + iOS). Shape is NOT a healthcare provider; health data is treated as **consumer health data** (not HIPAA PHI). 18+ only.
**Document status:** DRAFT — for privacy-counsel review, not legal advice.

## How to read this schedule

- **Active retention:** Most member data is retained for as long as the account is active and is necessary to provide the account, coaching, and payment services.
- **Deletion-on-request standard:** On a verified deletion request (or account closure), Shape erases data within **≤ 30 days**, cascading across Supabase Postgres rows and Storage buckets (progress-photos, community-photos, meal-notes, coach-media), revoking push tokens and wearable tokens, and issuing deletion requests to relevant sub-processors (OpenAI, Resend).
- **Backups:** Production backups expire on a rolling basis **≤ 90 days**; deleted data persists in backups only until those backups age out.
- **Limited exceptions:** Stripe transaction/tax records (7 years) and support correspondence (2 years) are retained beyond deletion under a legal-obligation or legitimate-interest basis.
- **Washington My Health My Data Act (MHMDA):** Consumer health data has **NO broad legal-retention loophole.** Health-category data must be deleted on a valid consumer request; the Stripe/tax exception below applies only to non-health billing/tax records, not to health data. [VERIFY — counsel to confirm scoping so no health-category data is swept into any "legal obligation" carve-out.]

---

## Retention table

| Data category | Examples (from data inventory) | Retention period | Trigger / lawful basis | Deletion method |
|---|---|---|---|---|
| **Account / identity** | Name, email, password hash, username, role, profile photo, bio | While account active; erase **≤ 30 days** after deletion request / account closure | Active use under **contract** (account/coaching/payments) | Cascading delete of Supabase Postgres rows + profile photo in Storage; backups age out **≤ 90 days** |
| **Health / screening** | `user_goals` ('health_profile') = PAR-Q answers, prescription medications, allergies, pregnancy/postpartum, conditions, injuries, emergency contact | While account active; erase **≤ 30 days** after request | Active use under **explicit consent** (GDPR Art. 9 health data). **MHMDA: no broad retention loophole** — deleted on valid request, not held under the tax exception | Cascading row delete in Supabase; backups age out **≤ 90 days**. [VERIFY — confirm health data excluded from any legal-obligation carve-out] |
| **Body / progress (incl. photos)** | `client_weigh_ins` (weight, body-fat), `client_measurements` (girths), `client_progress_photos` (private bucket), `daily_health_snapshot` (resting HR, HRV, sleep, recovery, workout minutes, calories, macros, mood) | While account active; erase **≤ 30 days** after request | Active use under **explicit consent** (Art. 9 health data) | Delete DB rows + progress-photos private bucket objects; backups age out **≤ 90 days** |
| **Check-ins** | `client_checkins` (sleep / energy / stress / hunger ratings) | While account active; erase **≤ 30 days** after request | Active use under **explicit consent** (health data) | Cascading row delete; backups age out **≤ 90 days** |
| **Nutrition (incl. meal-note audio)** | Training + nutrition logs, meal logs + macros, **meal-note audio (private bucket)**, grocery lists, `client_goals` | While account active; erase **≤ 30 days** after request | Active use under **explicit consent** (health data) / **contract** (coaching) | Delete DB rows + meal-notes private bucket audio objects; request OpenAI (Whisper/TTS) deletion of any associated voice/audio context; backups age out **≤ 90 days** |
| **Wearable data** | `user_integrations` connections + data from Apple Health / Strava / Garmin / Whoop / Oura (member opt-in) | While account active; erase **≤ 30 days** after request | **Explicit consent** (member opt-in; health data) | Revoke/delete wearable tokens; delete synced rows; backups age out **≤ 90 days** |
| **Messages / community** | `community_posts`, messages, `follows`, `member_playlists` | While account active; erase **≤ 30 days** after request | **Contract** / **explicit consent** | Delete DB rows + community-photos and coach-media private bucket objects; backups age out **≤ 90 days**. [VERIFY — handling of others' threads/quoted content on deletion] |
| **Commerce / Stripe** | Stripe billing data (card last4, brand, status — no full card numbers) | Transaction / tax records retained **7 years**; non-record billing context erased **≤ 30 days** after request | **Legal obligation** (tax/records); **contract** for active billing | Stripe-side records retained for the 7-year period; Shape-side references deleted on cascade; backups age out **≤ 90 days** |
| **Score ledger** | `score_ledger` | While account active; erase **≤ 30 days** after request | **Contract** (service feature) / **legitimate interests** (product) | Cascading row delete; backups age out **≤ 90 days** |
| **Device / usage** | IP addresses, `push_tokens`, timestamps, analytics | While account active; erase **≤ 30 days** after request | **Legitimate interests** (security/fraud/product improvement); **explicit consent** for analytics | Revoke push tokens; delete usage/analytics rows; backups age out **≤ 90 days**. [VERIFY — analytics retention window in Vercel/code] |
| **Funnel analytics** | `analytics_events` (product funnel/drop-off events: user_id + event name + minimal non-PII props) | **12 months**; purged daily by `/api/cron/analytics-purge` | **Legitimate interests** (product improvement, find/fix funnel drop-off) | Daily cron purges events >12 months old; backups age out **≤ 90 days** |
| **Support** | Support correspondence (e.g., via Resend email) | **2 years** | **Legitimate interests** (handling/auditing support) | Delete after 2-year window; request Resend deletion of associated content; backups age out **≤ 90 days** |
| **Consent logs** | Records of explicit consent (health data, analytics, marketing) | [VERIFY — retention period for consent records; counsel to set proportionate term, typically aligned to account life + limitation period] | **Legal obligation** / **legitimate interests** (demonstrating consent / accountability) | Delete per counsel-defined schedule; backups age out **≤ 90 days** |
| **Audit logs** | Security / access / deletion-event audit records | [VERIFY — retention period for audit logs; counsel to set proportionate term] | **Legitimate interests** (security) / **legal obligation** | Delete per counsel-defined schedule; backups age out **≤ 90 days** |

---

## Sub-processor deletion coordination

On a verified deletion request, in addition to internal cascade, Shape requests deletion from relevant sub-processors:

- **OpenAI** (Nora chat / Whisper / TTS — coaching + health context, voice audio): request deletion. [VERIFY — API no-training terms and deletion mechanics]
- **Resend** (email — name/email/content): request deletion of associated correspondence (subject to the 2-year support window).
- **Supabase** (DB / auth / storage — all data incl. health): primary deletion target for rows and Storage buckets.
- **Stripe** (payments): subject to the 7-year transaction/tax retention obligation.

## Posture statements relevant to retention

- No data sale. [VERIFY — code-dependent]
- No targeted / cross-context behavioral advertising. [VERIFY — code-dependent]
- No ML/AI training on user health/fitness data. [VERIFY — code-dependent]
- 18+ only. [VERIFY — code-dependent]

## Open items for counsel ([VERIFY] / TODO)

- **Legal entity** to be confirmed.
- **EU + UK Art. 27 representatives** to be appointed.
- **Consent log** and **audit log** retention periods to be set.
- Confirm **no health-category data** falls under the Stripe/tax 7-year exception (MHMDA: no broad retention loophole).
- Confirm **analytics / device-usage** retention window as implemented in Vercel and code.
- Confirm **OpenAI API no-training terms** and deletion mechanics.
- Confirm handling of **community content authored by a deleting user** that appears in others' threads.
