**DRAFT — prepared for Shape's privacy counsel to review and finalize. Not legal advice.**

# Data Protection Impact Assessment (DPIA) — GDPR Article 35

**Controller:** [Shape — legal entity to be confirmed by counsel]
**Operated from:** Brooklyn, NY, USA
**Website:** theshapecommunity.com
**Privacy / rights contact:** privacy@theshapecommunity.com
**General contact:** info@theshapecommunity.com
**EU representative (Art. 27):** to be appointed — **[VERIFY / TODO]**
**UK representative (Art. 27):** to be appointed — **[VERIFY / TODO]**
**DPIA status:** DRAFT — for privacy-counsel review, not legal advice
**Date:** **[VERIFY / TODO — insert assessment date]**
**Author / owner:** **[VERIFY / TODO — insert DPIA owner]**
**Next review date:** **[VERIFY / TODO]**

---

## 0. Why this DPIA is required (Art. 35 threshold)

A DPIA is mandatory under GDPR Art. 35(3) because the processing involves:

- **Large-scale processing of special-category data** (health data under Art. 9) — PAR-Q health screening, prescription medications, allergies, pregnancy/postpartum status, conditions, injuries, plus continuous body/biometric and wearable-derived health metrics.
- **Systematic profiling / evaluation** of individuals — the **Shape Score** (`score_ledger`) and inferences derived from health and activity data.
- **Innovative use of technology** combined with health data — the **Nora** AI assistant routing health context to **OpenAI** (chat, Whisper transcription, TTS), including voice audio.

This DPIA focuses on three high-risk processing activities:

1. **Large-scale special-category HEALTH data** processing.
2. **Nora / OpenAI AI flows** that transmit health context (and voice audio) to OpenAI.
3. **Shape Score profiling and inferences.**

> Scope note: Shape is a consumer fitness + coaching **marketplace** (web + iOS). It is **NOT a healthcare provider**; health data here is **consumer health data, NOT HIPAA PHI**. The service is **18+ only**.

---

## 1. Description of the processing and data flows

### 1.1 Nature, scope, context and purposes

| Element | Description |
|---|---|
| **Nature** | Collection, storage, organisation, profiling/inference, and transfer (to sub-processors and to independent coaches) of personal and special-category health data. |
| **Scope** | Health screening, body/progress metrics, wearable-sourced health metrics, training/nutrition logs, voice audio, community content, commerce metadata, device/usage data. |
| **Context** | Consumer marketplace connecting members with independent trainers/nutritionists. Members are data subjects; independent coaches are **third-party recipients / independent controllers**. |
| **Purposes** | Provide accounts and coaching; enable trainer/member matching and coaching delivery; provide the Nora AI assistant; compute the Shape Score; process payments; security/fraud prevention; product improvement; legally required record-keeping. |

### 1.2 Personal / health data inventory

All data resides in **Supabase Postgres**, with **owner row-level security (RLS)**; coach read access is gated by `is_coach_on_client`.

- **Account / identity:** name, email, password hash, username, role, photo, bio.
- **HEALTH screening** — `user_goals('health_profile')` = PAR-Q answers, **prescription medications, allergies, pregnancy/postpartum, conditions, injuries, emergency contact** (Art. 9 special category).
- **Body / progress:** `client_weigh_ins` (weight, body-fat); `client_measurements` (girths); `client_progress_photos` (private bucket); `daily_health_snapshot` (resting HR, HRV, sleep, recovery, workout minutes, calories, macros, mood); `client_checkins` (sleep/energy/stress/hunger ratings).
- **Training + nutrition:** training and nutrition logs, meal logs + macros, **meal-note AUDIO** (private bucket), grocery lists; `client_goals`.
- **Connected sources:** `user_integrations` (Apple Health / Strava / Garmin / Whoop / Oura — member opt-in).
- **Community:** `community_posts` / messages / follows / `member_playlists`.
- **Commerce:** Stripe data (last4 / brand / status — **no full card numbers**), `score_ledger`.
- **Device / usage:** IP, push tokens, timestamps, analytics.

### 1.3 Data flows — high-risk activity 1: Health data lifecycle

1. Member enters health screening / logs metrics, or opts in to a wearable integration (Apple Health / Strava / Garmin / Whoop / Oura).
2. Data is stored in Supabase Postgres (US) under owner-RLS; media in private Storage buckets.
3. **Coach access** is granted only where `is_coach_on_client` is true (share-gated). Coaches are **independent controllers / third-party recipients**.
4. Health data may flow to OpenAI **only** via Nora (see 1.4) and to other sub-processors per their defined purpose.

### 1.4 Data flows — high-risk activity 2: Nora / OpenAI AI flows

1. Member interacts with **Nora** (chat, and/or voice via Whisper transcription and TTS).
2. Coaching context **including health context**, and **voice audio**, is transmitted to **OpenAI (US)**.
3. OpenAI returns chat responses / transcriptions / synthesized speech.
4. Transfer mechanism: **SCCs** (OpenAI is **not** DPF-certified). API terms asserted as **no-training** — **[VERIFY]** that OpenAI API no-training terms are in force and contractually binding.
5. On deletion request, Shape requests **OpenAI deletion** (see Retention, §6).

### 1.5 Data flows — high-risk activity 3: Shape Score profiling / inferences

1. Health, body/progress, activity, and engagement data are processed to compute the **Shape Score** (`score_ledger`).
2. The score and any inferences are profiling outputs derived from special-category inputs.
3. Score data is stored in Supabase under owner-RLS.

### 1.6 Sub-processors and recipients

| Vendor | Purpose | Data | Health? | Region | Transfer |
|---|---|---|---|---|---|
| Supabase | DB / auth / storage | all incl. health | YES | US | SCCs + TIA + UK IDTA; **not DPF** |
| Stripe | payments | billing / last4 | No | US / global | DPF + SCCs |
| Vercel | hosting / analytics | IP / usage | No | US | DPF |
| Cloudflare | DNS / Turnstile | IP / token | No | US | DPF |
| OpenAI | Nora chat / Whisper / TTS | coaching + health context, voice audio | YES | US | SCCs; **not DPF**; API no-training terms **[VERIFY]** |
| Google Firebase FCM | push | tokens / notif | maybe | US | DPF + SCCs |
| Resend | email | name / email / content | No | US | DPF / SCCs |
| Instacart | grocery handoff (when used) | list items | indirect | US | per terms |
| Apple HealthKit / MusicKit | wearable / music | health (HealthKit) | YES | on-device + US | — |
| Spotify | playlists | — | No | — | — |
| Strava / Garmin / Whoop / Oura | wearables | health | YES | — | — |

**Independent coaches** are third-party recipients acting as **independent controllers**.

---

## 2. Necessity and proportionality

### 2.1 Lawful bases (GDPR)

- **Contract** (Art. 6(1)(b)) — account, coaching, payments.
- **Explicit consent** (Art. 9(2)(a) + Art. 6(1)(a)) — **health data**, analytics, marketing.
- **Legitimate interests** (Art. 6(1)(f)) — security, fraud prevention, Turnstile, product improvement.
- **Legal obligation** (Art. 6(1)(c)) — tax / records.

> Special-category health processing relies on **explicit consent (Art. 9(2)(a))**. Counsel to confirm consent capture is granular, freely given, informed, and unbundled from contract acceptance — **[VERIFY]**.

### 2.2 Necessity assessment

- **Health screening (PAR-Q etc.):** necessary so independent coaches can deliver safe coaching and so members are screened before training. Collection is purpose-limited to coaching safety.
- **Nora / OpenAI:** transmitting health context is necessary to provide AI-assisted coaching responses the member requests. Voice flows require Whisper/TTS. Proportionality depends on **scrubbing / minimisation** of health context sent to OpenAI — **[VERIFY]** scope of context actually transmitted.
- **Shape Score:** profiling derived from member data to support engagement / progress features. Counsel to confirm the score is not used for decisions producing legal/significant effects (Art. 22) — **[VERIFY]**.

### 2.3 Proportionality and data minimisation

- Owner-RLS confines each member's data to that member by default.
- Coach access is **share-gated** (`is_coach_on_client`) rather than blanket.
- Commerce stores only last4 / brand / status — **no full card numbers** (PCI-DSS v4.0.1, SAQ A via Stripe-hosted fields).
- Wearable connections are **opt-in** per source.

### 2.4 Compliance posture commitments (each must be true in code)

- **No data sale.** — **[VERIFY]**
- **No targeted / cross-context behavioral advertising.** — **[VERIFY]**
- **No ML/AI training on user health/fitness data.** — **[VERIFY]**
- **18+ only.** — **[VERIFY]**

### 2.5 Data subject rights

Rights (access, rectification, erasure, restriction, portability, objection, withdraw consent) are supported via privacy@theshapecommunity.com, with erasure executed per §6. Right to withdraw consent for health processing must be as easy as giving it — **[VERIFY]** implementation.

---

## 3. Consultation

- **Internal stakeholders:** **[VERIFY / TODO — record engineering, product, security, and privacy-counsel reviewers]**.
- **Data subjects / representatives:** **[VERIFY / TODO — note whether member views were sought or why not]**.
- **Processors:** sub-processor terms (DPAs, SCCs, TIAs, UK IDTA) reviewed — **[VERIFY]** that signed DPAs are in place with Supabase, OpenAI, Stripe, Vercel, Cloudflare, Firebase, Resend.
- **DPO / privacy counsel:** this DRAFT is prepared **for privacy-counsel review**; counsel sign-off required before finalisation.
- **Supervisory authority (Art. 36 prior consultation):** required only if high residual risk remains after mitigation — **[VERIFY]** following counsel review.

---

## 4. Risks to data subjects (likelihood × severity)

Scoring: Likelihood and Severity each rated Low / Medium / High. Ratings below are **preliminary DRAFT** assessments for counsel to validate.

| # | Risk | Affected activity | Likelihood | Severity | Overall (pre-mitigation) |
|---|---|---|---|---|---|
| R1 | **Re-identification** of pseudonymous / aggregated health or score data | 1, 3 | Medium | High | **High** |
| R2 | **Sensitive-data exposure** — health screening, conditions, pregnancy, medications, progress photos, audio leaking to wrong member/coach or publicly | 1 | Medium | High | **High** |
| R3 | **AI inference** — OpenAI processing infers additional sensitive attributes; health context over-shared or retained/used to train | 2 | Medium | High | **High** |
| R4 | **Coach misuse** — independent coach (independent controller) misuses health data accessed via `is_coach_on_client` | 1 | Medium | High | **High** |
| R5 | **Breach** — unauthorised access to Supabase DB / Storage buckets exposing large-scale health data | 1, 2, 3 | Medium | High | **High** |
| R6 | **Cross-border transfer** to US sub-processors without adequate safeguards | 1, 2 | Medium | Medium | **Medium** |
| R7 | **Profiling harm / opacity** — Shape Score produces unfair or non-transparent inferences | 3 | Medium | Medium | **Medium** |
| R8 | **Excessive retention** of health data beyond need | 1 | Low | High | **Medium** |

> Likelihood/severity values are DRAFT and must be re-scored by counsel against verified code postures (§2.4) and verified transfer/contract facts.

---

## 5. Mitigations

| Risk | Mitigations |
|---|---|
| **R1 Re-identification** | Owner-RLS limits row visibility to the data subject; coach access share-gated; private Storage buckets for photos/audio; Shape Score stored under RLS. **[VERIFY]** any aggregate/de-identified outputs cannot be re-linked. |
| **R2 Sensitive-data exposure** | Owner-RLS as default-deny; `is_coach_on_client` share-gating; private buckets (progress-photos, community-photos, meal-notes, coach-media); explicit consent (Art. 9) before health collection; encryption (in transit/at rest) — **[VERIFY]** encryption configuration. |
| **R3 AI inference** | **Scrubbing / minimisation** of health context before sending to OpenAI — **[VERIFY]** scope; SCCs with OpenAI; **no-training API terms [VERIFY]**; OpenAI deletion on erasure; consider not routing the most sensitive fields (medications, pregnancy, conditions) to Nora — **[VERIFY]**. |
| **R4 Coach misuse** | Access strictly gated by `is_coach_on_client`; coaches are independent controllers bound by Shape's terms; **[VERIFY]** coach contractual data-protection obligations and any access logging/audit. |
| **R5 Breach** | RLS, encryption, private buckets, access controls; Cloudflare/Turnstile for abuse; breach-notification readiness (CA SB1223 30-day incl. health; EU/UK 72-hour). **[VERIFY]** incident-response runbook and logging. |
| **R6 Transfers** | Supabase SCCs + TIA + UK IDTA; Stripe/Vercel/Cloudflare/Firebase/Resend DPF and/or SCCs; OpenAI SCCs (not DPF). **[VERIFY]** all DPAs/SCCs/TIAs executed and current. |
| **R7 Profiling** | Transparency in privacy notice about Shape Score inputs/outputs; confirm no Art. 22 solely-automated significant decisions — **[VERIFY]**; consent for non-essential analytics. |
| **R8 Retention** | Active = while account active. Deletion request = erase **≤30 days**, cascading across DB rows + Storage buckets + push tokens + wearable tokens + request OpenAI/Resend deletion. Exceptions: Stripe tax/transaction records **7 years** (legal obligation); backups expire **≤90 days**; support correspondence **2 years**. **MHMDA:** consumer-health-data deletion has **no broad legal-retention loophole**. |

### 5.1 Applicable-law mitigation coverage

EU GDPR + UK GDPR + ePrivacy/PECR; CCPA/CPRA + ~19 US state laws (VA, CO, CT, UT, TX, OR, MT, FL, DE, IA, NJ, NH, NE, MD-MODPA, MN, RI, IN, KY, TN); **Washington My Health My Data Act (private right of action)** + Nevada SB370 + CT consumer-health; COPPA; state breach laws (CA SB1223 30-day incl. health); CAN-SPAM/CASL; ADA/WCAG 2.1 AA + EU Accessibility Act (28 Jun 2025); PCI-DSS v4.0.1 (SAQ A via Stripe-hosted fields). **[VERIFY]** mapping of each control to these regimes by counsel.

---

## 6. Retention (detail)

- **Active accounts:** retained while the account is active.
- **Deletion request:** erase **within ≤30 days**, cascading across DB rows + Storage buckets (progress-photos, community-photos, meal-notes, coach-media) + push tokens + wearable tokens, and **requesting deletion from OpenAI and Resend**.
- **Exceptions:** Stripe transaction/tax records **7 years** (legal obligation); backups expire **≤90 days**; support correspondence **2 years**.
- **MHMDA:** no broad legal-retention loophole for consumer health data.

---

## 7. Residual risk

After applying the mitigations in §5, preliminary residual risk (DRAFT — to be re-scored by counsel against verified postures):

| Risk | Residual (post-mitigation, DRAFT) | Notes |
|---|---|---|
| R1 Re-identification | Medium → **Low/Medium [VERIFY]** | Depends on de-identification robustness. |
| R2 Sensitive-data exposure | High → **Low/Medium [VERIFY]** | Contingent on encryption + RLS verified in code. |
| R3 AI inference | High → **Medium [VERIFY]** | Hinges on scrubbing scope + binding no-training terms. |
| R4 Coach misuse | High → **Medium [VERIFY]** | Hinges on coach contract terms + audit logging. |
| R5 Breach | High → **Medium [VERIFY]** | Hinges on IR runbook + logging maturity. |
| R6 Transfers | Medium → **Low [VERIFY]** | Hinges on executed SCCs/DPF/TIA/IDTA. |
| R7 Profiling | Medium → **Low [VERIFY]** | Hinges on transparency + no Art. 22 effect. |
| R8 Retention | Medium → **Low** | Cascading ≤30-day deletion; MHMDA-aligned. |

**Open dependencies that gate residual-risk acceptance:**

- Code postures (§2.4): no data sale; no targeted/behavioral ads; no AI/ML training on health/fitness data; 18+ — all **[VERIFY]**.
- OpenAI no-training API terms in force — **[VERIFY]**.
- Encryption configuration (in transit + at rest) — **[VERIFY]**.
- Scope of health context transmitted to OpenAI and scrubbing — **[VERIFY]**.
- Executed DPAs/SCCs/TIAs/UK IDTA with all sub-processors — **[VERIFY]**.
- EU and UK Art. 27 representatives appointed — **[VERIFY]**.
- Consent capture for Art. 9 health data (granular, unbundled, withdrawable) — **[VERIFY]**.
- Confirmation Shape Score is not an Art. 22 solely-automated significant decision — **[VERIFY]**.
- Whether Art. 36 prior consultation with a supervisory authority is required — **[VERIFY]**.

---

## 8. Sign-off

This DPIA is a **DRAFT for privacy-counsel review** and is **not legal advice**. It must not be treated as final until all **[VERIFY]** items are resolved and the approvals below are recorded.

| Role | Name | Decision (approve / approve-with-conditions / reject) | Date | Signature |
|---|---|---|---|---|
| DPIA owner | **[VERIFY / TODO]** | | | |
| Privacy counsel | **[VERIFY / TODO]** | | | |
| DPO (if appointed) | **[VERIFY / TODO]** | | | |
| Security lead | **[VERIFY / TODO]** | | | |
| Product / engineering lead | **[VERIFY / TODO]** | | | |
| Accountable executive | **[VERIFY / TODO]** | | | |

**Residual-risk acceptance statement:** **[VERIFY / TODO — counsel to record whether residual risk is acceptable, and whether Art. 36 prior consultation is required before processing proceeds.]**

**Review cadence:** **[VERIFY / TODO]** — and re-run upon any material change to processing, sub-processors, the Nora/OpenAI flows, or the Shape Score model.

---

*DRAFT — prepared for Shape's privacy counsel to review and finalize. Not legal advice. Drafted strictly from Shape's compliance facts; figures, vendors, and dates not present in those facts were not invented, and code-dependent or unconfirmed items are flagged **[VERIFY]**.*
