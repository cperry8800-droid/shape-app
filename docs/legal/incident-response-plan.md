# Shape — Incident Response Plan & Breach-Notification Templates

**DRAFT — prepared for Shape's privacy counsel to review and finalize. Not legal advice.**

> Every section below is a DRAFT for privacy-counsel review, not legal advice. Items marked **[VERIFY]** are flagged TODOs that must be confirmed (by counsel or by checking code) before this plan is treated as final. Do not rely on this document operationally until counsel has signed off.

---

## 0. Document control

| Field | Value |
|---|---|
| Entity | **[Shape — legal entity to be confirmed by counsel]** |
| Operating location | Brooklyn, NY, USA |
| Website | theshapecommunity.com |
| General contact | info@theshapecommunity.com |
| Privacy / data-rights contact | privacy@theshapecommunity.com |
| EU Art.27 representative | **[VERIFY — to be appointed]** |
| UK Art.27 representative | **[VERIFY — to be appointed]** |
| Plan owner | **[VERIFY — assign named owner]** |
| Version / effective date | **[VERIFY — set on finalization]** |
| Review cadence | **[VERIFY — recommend at least annual + after each Sev-1/Sev-2 incident]** |

**Scope.** Shape is a consumer fitness + coaching marketplace (web + iOS). Independent trainers/nutritionists coach members. Shape is **not** a healthcare provider; health data handled here is **consumer health data, not HIPAA PHI**. Service is **18+ only**. This plan covers security incidents and personal-data breaches affecting the data inventory in Section 8.

> **Important classification note:** Because Shape holds sensitive **consumer health data** (PAR-Q answers, medications, allergies, pregnancy/postpartum status, conditions, injuries, weigh-ins, body-fat, measurements, progress photos, resting HR/HRV/sleep/recovery, mood, wearable streams, meal-note audio), breaches here are likely to trigger heightened notification duties (GDPR Art.9 special category; US state "medical/health information" breach rules incl. **CA SB1223**; **Washington My Health My Data Act**). Treat any incident touching the health inventory as **presumptively high-severity** until triage proves otherwise.

---

## 1. Roles & responsibilities

| Role | Held by | Core responsibilities |
|---|---|---|
| **Incident Lead (IC)** | **[VERIFY — name]** | Owns the incident end-to-end; declares severity; convenes the team; approves containment/eradication actions; signs off on closure. |
| **Privacy / Legal Lead** | **[VERIFY — privacy counsel]** | Makes the legal notifiability determinations (GDPR Art.33/34; US state breach laws; MHMDA); owns the regulatory and data-subject notification clocks; approves all external notices. |
| **Security / Technical Lead** | **[VERIFY — name]** | Runs detection, triage, containment, eradication, recovery; preserves forensic evidence; coordinates with sub-processors (Section 9). |
| **Data Protection point of contact** | privacy@theshapecommunity.com | Receives reports; central log; liaison to EU/UK Art.27 reps **[VERIFY — once appointed]**. Note: whether a statutory DPO is required is **[VERIFY — counsel to assess]**. |
| **Comms Lead** | **[VERIFY — name]** | Drafts user-facing and public messaging; coordinates support; ensures CAN-SPAM/CASL-compliant delivery of any email notices. |
| **Engineering on-call** | **[VERIFY — rota]** | First responders; execute technical containment in Supabase/Vercel/Cloudflare; rotate credentials/tokens. |
| **Coach liaison** | **[VERIFY — name]** | Note: independent coaches are **third-party recipients / independent controllers**. Determine notification duties owed to/by coaches **[VERIFY — counsel]**. |
| **Executive sponsor** | **[VERIFY — name]** | Authorizes spend, external counsel, and regulator engagement. |

**Anyone** (employee, coach, contractor, user, researcher) reporting a suspected incident: email **privacy@theshapecommunity.com** (and/or **[VERIFY — security/abuse alias]**). The clock for internal triage starts at first report.

---

## 2. Severity classification

Classify on **(a)** data sensitivity (health/special-category vs. ordinary), **(b)** volume/scope, **(c)** identifiability, and **(d)** likely harm. When in doubt, classify **up**.

| Severity | Definition (examples) | Health data involved? | Default response |
|---|---|---|---|
| **Sev-1 — Critical** | Confirmed unauthorized access/exfiltration/loss of **consumer health data** (health_profile/PAR-Q, meds, allergies, pregnancy, conditions, weigh-ins, body-fat, progress photos, daily_health_snapshot, meal-note audio, wearable streams) or credentials at scale; ransomware; full DB compromise. | Yes (or assume yes) | Full team; presume GDPR + US state + **MHMDA** + **SB1223** notification clocks may run. Engage counsel immediately. |
| **Sev-2 — High** | Unauthorized access to identity/account data (name, email, password hash, username), Stripe commerce metadata (last4/brand/status), or a **bounded** health-data exposure; RLS/`is_coach_on_client` failure exposing one user's data to another. | Maybe | Full team; counsel assesses notifiability under GDPR Art.33/34 and US state laws. |
| **Sev-3 — Medium** | Limited exposure of low-sensitivity data (e.g., device/usage, IP, push_tokens, public community_posts) with low harm; contained quickly. | No / unlikely | Security + Privacy leads; document; assess whether any clock triggers. |
| **Sev-4 — Low** | Near-miss, single-record internal mishandling, no confirmed external exposure, vuln found before exploitation. | No | Log, remediate, track to closure. Usually no external notice (confirm). |

> A breach involving **health data** should default to **Sev-1/Sev-2** even at low volume, because (i) GDPR treats it as Art.9 special-category, (ii) several US states impose specific rules for medical/health information, and (iii) **MHMDA** consumer-health protections apply.

---

## 3. Response lifecycle

### 3.1 Detection
- Sources: automated alerts/logs (Supabase logs/auth, Vercel, Cloudflare), error monitoring, anomaly detection, coach/member reports, sub-processor breach notices, external researchers, regulator/press inquiries.
- On any signal, open an **incident record** in the breach register (Section 6) with a timestamp. **The triage clock starts now.**

### 3.2 Triage
- Security Lead + Privacy Lead jointly assess: Is it a real incident? What data categories are implicated (map to Section 8 inventory)? How many data subjects? Which jurisdictions (EU/UK residents? CA/WA/other US-state residents?)?
- Assign **severity** (Section 2).
- Privacy Lead starts the **notification-clock assessment** (Section 4) in parallel — do not wait for full eradication.
- Preserve evidence (logs, snapshots, access records) before remediation alters them.

### 3.3 Containment
- Short-term: revoke/rotate compromised credentials, API keys, and tokens (Supabase service keys, `push_tokens`, wearable OAuth tokens, OpenAI/Resend/Stripe keys as applicable); disable affected accounts/sessions; tighten or block the exploited path; enable Cloudflare protections as needed.
- Verify **owner-RLS** and `is_coach_on_client` are enforcing correctly if access-control failure is suspected **[VERIFY — code]**.
- Isolate affected components without destroying forensic state.

### 3.4 Eradication
- Remove the root cause: patch the vulnerability, remove malware/backdoors, fix the misconfigured RLS policy or query, close the leaked bucket path (progress-photos, community-photos, meal-notes, coach-media).
- Confirm no persistence; rotate any secret that may have been exposed.

### 3.5 Recovery
- Restore from clean backups if needed (note: **backups expire ≤90 days** per retention policy — confirm a clean restore point exists).
- Validate integrity and access controls before returning to normal operation.
- Heightened monitoring for a defined post-incident window.

### 3.6 Post-incident
- Within **[VERIFY — recommend ≤2 weeks]** of closure: blameless post-mortem, root-cause, corrective actions with owners/dates.
- Update this plan and the breach register; confirm all notification obligations were met and documented (Art.33 requires documenting **all** breaches, notifiable or not).

---

## 4. Legal notification clocks

> **[VERIFY — counsel] for every clock below.** Applicability depends on residency of affected individuals, data categories, risk of harm, and the specific statutes in play. The plan applies EU GDPR + UK GDPR + ePrivacy/PECR; CCPA/CPRA + ~19 US state privacy laws (VA, CO, CT, UT, TX, OR, MT, FL, DE, IA, NJ, NH, NE, MD-MODPA, MN, RI, IN, KY, TN); Washington MHMDA + Nevada SB370 + CT consumer-health; COPPA; US state breach laws (incl. **CA SB1223**); CAN-SPAM/CASL.

### 4.1 GDPR / UK GDPR

| Obligation | Trigger | Clock |
|---|---|---|
| **Art.33 — notify supervisory authority** | Personal-data breach **unless** unlikely to result in risk to rights/freedoms. | **Without undue delay and, where feasible, not later than 72 hours** after becoming **aware**. If >72h, give reasons for delay. Phased/late info permitted. |
| **Art.34 — notify data subjects** | Breach **likely to result in *high* risk** to rights/freedoms (health/special-category data raises this likelihood). | **Without undue delay.** Exceptions: data was encrypted/unintelligible; measures since taken that eliminate the high risk; or disproportionate effort → public communication instead. |
| **Art.33(5) — internal documentation** | **All** breaches (notifiable or not). | Document facts, effects, remedial action. Ongoing. |

- **"Aware"** = reasonable degree of certainty a breach occurred. Triage promptly so awareness is not artificially delayed.
- **Lead authority / one-stop-shop:** Shape operates from the US with no EU establishment stated; lead-authority vs. each-Member-State-DPA approach is **[VERIFY — counsel]**. EU + UK **Art.27 representatives must be appointed** and named here **[VERIFY]**.
- **Processor → controller:** sub-processors must notify Shape "without undue delay"; confirm this is in each DPA **[VERIFY]**.

### 4.2 US state breach-notification laws (general)

| Item | Position |
|---|---|
| **Trigger** | Unauthorized acquisition of personal information (definitions vary by state; many now include **medical/health information** and biometric/health-derived data). |
| **Timing** | "Most expedient time possible / without unreasonable delay." Several states impose hard outer limits (e.g., 30/45/60 days) **[VERIFY — per state]**. |
| **Attorney General / regulator notice** | Required in many states above thresholds **[VERIFY — per-state thresholds and AG-notice rules]**. |
| **Content & method** | State-specific required contents and substitute-notice rules **[VERIFY]**. |

### 4.3 California SB1223 — health/medical data

| Item | Position |
|---|---|
| **What** | SB1223 brings **consumer health/medical data** within scope of California breach-notification duties. |
| **Clock** | **Notify affected California residents within 30 days** of discovery for breaches involving health/medical data **[VERIFY — exact statutory trigger, content, and any AG-notice duty]**. |
| **Relevance to Shape** | High — Shape's inventory is rich in consumer health/medical data. Treat CA residents' health-data breaches as a **30-day** clock. |

### 4.4 Washington My Health My Data Act (MHMDA)

| Item | Position |
|---|---|
| **What** | MHMDA regulates **consumer health data** and carries a **private right of action**. |
| **Breach posture** | MHMDA exposure materially raises litigation risk; consumer-health data has **no broad legal-retention loophole** under MHMDA (per Shape's retention policy). |
| **Notification** | MHMDA's interaction with WA's breach-notification statute and any direct notice duty is **[VERIFY — counsel]**. Treat WA-resident health-data incidents as high priority. |
| **Related** | Nevada SB370 and CT consumer-health rules may also apply to WA-adjacent/consumer-health scenarios **[VERIFY]**. |

### 4.5 Other clocks to assess per incident **[VERIFY]**
- **COPPA** — service is 18+; child-data breach should not arise, but confirm if a minor is implicated.
- **PCI-DSS v4.0.1 (SAQ A)** — Shape uses Stripe-hosted fields; no full card numbers stored (only last4/brand/status). Card-data breach exposure is limited but confirm card-brand/acquirer notification duties on any payment-path incident.
- **CAN-SPAM / CASL** — governs *delivery* of email notices, not the breach itself; ensure notice emails comply.
- **Sub-processor-driven breaches** — if the breach originates at Supabase/Stripe/Vercel/Cloudflare/OpenAI/Firebase/Resend/Instacart/Apple/Spotify/Strava/Garmin/Whoop/Oura, Shape's own controller clocks still run from Shape's awareness.

### 4.6 Master clock summary

| Recipient | Statute | Deadline (from awareness/discovery) | Notes |
|---|---|---|---|
| EU supervisory authority | GDPR Art.33 | ≤72h (where feasible) | Phased reporting allowed |
| UK ICO | UK GDPR Art.33 | ≤72h (where feasible) | |
| EU/UK data subjects | Art.34 | Without undue delay (high-risk) | Health data → high risk likely |
| California residents (health/medical) | **CA SB1223** | **≤30 days** | **[VERIFY exact terms]** |
| Other US-state residents/AGs | State breach laws | Without unreasonable delay; some hard caps | **[VERIFY per state]** |
| WA residents (consumer health) | MHMDA + WA breach law | **[VERIFY]** | Private right of action |
| Card brands/acquirer | PCI-DSS | **[VERIFY]** | Limited card data stored |

---

## 5. Notifiability decision checklist (per incident)

1. Is it a personal-data breach (confidentiality/integrity/availability)? ☐
2. Which inventory categories (Section 8)? Health/special-category involved? ☐
3. How many data subjects, and in which jurisdictions (EU/UK/CA/WA/other US)? ☐
4. Was the data encrypted/unintelligible (Art.34 exception)? **[VERIFY — encryption-at-rest/in-transit status]** ☐
5. Risk level: none / risk / high risk? ☐
6. Clocks triggered: Art.33 (72h)? Art.34 (high risk)? SB1223 (30d, CA health)? Other US state? MHMDA? PCI? ☐
7. Notices drafted, counsel-approved, delivery method compliant (CAN-SPAM/CASL)? ☐
8. Everything documented in the breach register (Art.33(5))? ☐

---

## 6. Breach register

> Maintained continuously. Records **every** breach (notifiable or not) to satisfy GDPR Art.33(5). Store securely with restricted access.

| ID | Date/time detected | Detected by / source | Severity | Description / root cause | Data categories affected | Health data? (Y/N) | Approx. # data subjects | Jurisdictions (EU/UK/CA/WA/other) | Containment actions | Eradication/recovery | Risk assessment | Art.33 authority notified? (date) | Art.34 subjects notified? (date) | US state / SB1223 / MHMDA notices (date) | Sub-processors involved | Status | Owner | Lessons / corrective actions |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| _e.g._ INC-2026-001 | | | | | | | | | | | | | | | | Open | | |

---

## 7. Notification-letter templates

> All templates are **DRAFTS for privacy-counsel review — not legal advice.** Fill bracketed fields; remove inapplicable clauses; counsel must confirm statutory-required contents per jurisdiction before sending.

### 7.1 Template A — Notice to supervisory authority (GDPR/UK GDPR Art.33)

> Submit via the authority's official breach-reporting portal/form where required. This text supports the portal fields.

```
To: [Supervisory authority — e.g., lead DPA / UK ICO]
From: [Shape — legal entity to be confirmed by counsel], Brooklyn, NY, USA
Acting through: [EU/UK Art.27 representative — VERIFY, once appointed]
Privacy contact: privacy@theshapecommunity.com
Date of this notification: [date]
Reference: [INC-ID]

Subject: Personal data breach notification under Article 33 GDPR / UK GDPR

1. Nature of the breach
   We became aware on [date/time] of a personal data breach affecting users of
   Shape, a consumer fitness and coaching marketplace (web + iOS).
   Type of breach: [confidentiality / integrity / availability].
   Summary: [factual description of what happened and how].
   This notification is made [within 72 hours of awareness / [N] hours late;
   reason for delay: [reason]]. [Where information is incomplete, further details
   will follow in phases.]

2. Categories and approximate numbers of data subjects
   Approx. [number] data subjects, including [EU/UK residents].

3. Categories and approximate volume of personal data records
   [Identity/account data; and/or special-category health data: e.g. PAR-Q/
   health_profile answers, medications, allergies, pregnancy/postpartum status,
   conditions, injuries, weigh-ins/body-fat, measurements, progress photos,
   daily health snapshot (HR/HRV/sleep/recovery/mood), meal-note audio, wearable
   data]. Approx. [number] records.

4. Likely consequences
   [Description of likely consequences / risk to rights and freedoms, with
   particular attention to the sensitivity of consumer health data.]

5. Measures taken or proposed
   Containment: [e.g., credential/token rotation, access disabled, path closed].
   Eradication/recovery: [details].
   Mitigation for data subjects: [details].
   [Encryption/unintelligibility status: VERIFY.]

6. Data Protection point of contact
   privacy@theshapecommunity.com / [Art.27 representative — VERIFY].

7. Data subject notification
   [We have notified / will notify / do not consider notification required
   because [Art.34 exception]] the affected data subjects. [If high risk:
   notification is being made without undue delay.]

[Name, role — VERIFY]
On behalf of [Shape — legal entity to be confirmed by counsel]
```

### 7.2 Template B — Notice to affected users (data subjects / consumers)

> Use for GDPR Art.34 high-risk notices and/or US state / SB1223 / MHMDA consumer notices. Counsel to confirm required content per applicable law and to confirm delivery complies with CAN-SPAM/CASL. Deliver via email (Resend) and/or in-app.

```
From: Shape <privacy@theshapecommunity.com>
Subject: Important security notice about your Shape account

Dear [first name / "Shape member"],

We are writing to let you know about a data security incident that [affected /
may have affected] some of your personal information held by Shape.

What happened
On [date], we [discovered / were informed] that [plain-language description of
the incident]. [We became aware on [date] and took action immediately.]

What information was involved
The information [involved / potentially involved] for your account was:
[list only the categories that apply to this user, e.g.: your name and email;
your health profile (PAR-Q answers, medications, allergies, pregnancy/postpartum
status, conditions, injuries); weigh-ins and body measurements; progress photos;
daily health metrics (heart rate, sleep, recovery, mood); meal-note audio;
connected wearable data; payment metadata (card type and last 4 digits only —
we never store full card numbers)].
[We do not believe full payment card numbers were involved, because Shape uses
Stripe-hosted payment fields and does not store them.]

What we are doing
[Containment, eradication, recovery steps in plain language. e.g., we closed the
issue, rotated credentials/tokens, and are monitoring for misuse.] We have
[notified / are notifying] the relevant authorities as required by law.

What you can do
[Recommended steps: change your password; enable [2FA — VERIFY availability];
watch for suspicious activity; how to revoke connected wearable apps; etc.]

For more information
Contact us at privacy@theshapecommunity.com. [Optional: dedicated page/FAQ at
[URL].] [Optional jurisdiction-specific resources / credit-monitoring offer —
VERIFY whether required or offered.]

We take the privacy of your health and fitness information very seriously and
apologize for any concern this causes.

The Shape Team
[Shape — legal entity to be confirmed by counsel]
privacy@theshapecommunity.com
```

### 7.3 Template C — Notice to US State Attorney General / regulator (incl. CA SB1223 health-data track)

> Use where a state requires AG/regulator notice (thresholds and contents vary — **[VERIFY per state]**). For California health/medical-data breaches, align to the **SB1223 30-day** consumer track and any AG-notice requirement.

```
To: [State Attorney General / regulator — e.g., California Office of the
     Attorney General]
From: [Shape — legal entity to be confirmed by counsel], Brooklyn, NY, USA
Privacy contact: privacy@theshapecommunity.com
Date: [date]
Reference: [INC-ID]

Re: Notice of data security breach [— including medical/health information]

1. Reporting entity
   [Shape — legal entity to be confirmed by counsel], a consumer fitness and
   coaching marketplace operated from Brooklyn, NY.

2. Date(s)
   Breach occurred/discovered on [date]; discovered on [date].

3. Affected residents
   Approx. [number] residents of [state].

4. Information involved
   [Categories, including whether consumer health/medical information was
   involved — e.g., health profile, weigh-ins/body metrics, progress photos,
   wearable/health snapshot data; and/or identity data; payment metadata
   (last 4 / brand only).]

5. Description
   [What happened and how.]

6. Remedial measures
   [Containment, eradication, recovery, and safeguards going forward.]

7. Consumer notice
   We [have notified / will notify] affected residents [within 30 days, for
   California health/medical-data breaches under SB1223 — VERIFY] [by email /
   substitute notice]. A sample consumer notice is enclosed (Template B).

8. Contact for follow-up
   privacy@theshapecommunity.com / [name, role — VERIFY].

[Name, role — VERIFY]
On behalf of [Shape — legal entity to be confirmed by counsel]
```

### 7.4 Template D — Internal incident record (breach-register entry)

```
Incident ID: INC-[YYYY]-[NNN]
Detected: [date/time]  |  Reported by: [source]
Incident Lead: [name]  |  Privacy Lead: [name]  |  Security Lead: [name]
Severity: [Sev-1/2/3/4]
Summary / root cause: [text]
Data categories affected: [list]  |  Health data? [Y/N]
Approx. data subjects: [n]  |  Jurisdictions: [EU/UK/CA/WA/other]
Sub-processors involved: [list, if any]
Containment: [actions + timestamps]
Eradication/recovery: [actions + timestamps]
Risk assessment: [none / risk / high risk] — rationale: [text]
Clocks triggered: Art.33 [Y/N] | Art.34 [Y/N] | SB1223 [Y/N] | other US state
[Y/N] | MHMDA [Y/N] | PCI [Y/N]
Notifications: authority [date] | subjects [date] | AG/state [date]
Status: [Open/Contained/Closed]  |  Corrective actions + owners + due dates: [list]
```

---

## 8. Personal / health data inventory (for triage mapping)

All data is in **Supabase Postgres** (owner-RLS; coach read via `is_coach_on_client`).

- **Account / identity:** name, email, password hash, username, role, photo, bio.
- **Health screening (`user_goals` = 'health_profile' / PAR-Q):** PAR-Q answers, prescription medications, allergies, pregnancy/postpartum, conditions, injuries, emergency contact. *(special-category)*
- **Body / progress:** `client_weigh_ins` (weight, body-fat), `client_measurements` (girths), `client_progress_photos` (private bucket), `daily_health_snapshot` (resting HR, HRV, sleep, recovery, workout minutes, calories, macros, mood), `client_checkins` (sleep/energy/stress/hunger ratings). *(special-category)*
- **Training & nutrition:** training + nutrition logs, meal logs + macros, **meal-note audio** (private bucket), grocery lists, `client_goals`.
- **Connected sources (`user_integrations`, opt-in):** Apple Health, Strava, Garmin, Whoop, Oura. *(special-category)*
- **Community:** `community_posts`/messages/follows/`member_playlists`.
- **Commerce (Stripe):** last4/brand/status (no full card numbers), `score_ledger`.
- **Device / usage:** IP, `push_tokens`, timestamps, analytics.

**Storage buckets to check on any exposure:** progress-photos, community-photos, meal-notes, coach-media.

---

## 9. Sub-processors (breach-coordination map)

| Vendor | Purpose | Data | Health? | Region | Transfer mechanism |
|---|---|---|---|---|---|
| Supabase | DB / auth / storage | all incl. health | **Yes** | US | SCCs + TIA + UK IDTA (not DPF) |
| Stripe | payments | billing / last4 | No | US/global | DPF + SCCs |
| Vercel | hosting / analytics | IP / usage | No | US | DPF |
| Cloudflare | DNS / Turnstile | IP / token | No | US | DPF |
| OpenAI | Nora chat / Whisper / TTS | coaching + health context, voice audio | **Yes** | US | SCCs (not DPF); API no-training terms **[VERIFY]** |
| Google Firebase FCM | push | tokens / notif | maybe | US | DPF + SCCs |
| Resend | email | name / email / content | No | US | DPF / SCCs |
| Instacart | grocery handoff (when used) | list items | indirect | US | per terms |
| Apple HealthKit/MusicKit | health/music | **Yes** | on-device + US | (per Apple terms) |
| Spotify | playlists | — | No | — | — |
| Strava / Garmin / Whoop / Oura | wearables | **Yes** | — | — | — |

- Independent **coaches** are third-party recipients / **independent controllers** — coordinate notification roles separately **[VERIFY]**.
- On any incident, determine if a sub-processor is the source; if so, obtain their breach details and confirm Shape's own clocks (which run from Shape's awareness).

---

## 10. Standing postures relevant to breach risk

These must each be **true in code** — flag **[VERIFY]** where code-dependent:
- **No data sale.** **[VERIFY — code]**
- **No targeted / cross-context behavioral advertising.** **[VERIFY — code]**
- **No ML/AI training on user health/fitness data.** **[VERIFY — code]** (and OpenAI API no-training terms **[VERIFY]**)
- **18+ only.** **[VERIFY — code]**

**Retention facts affecting recovery/notice:**
- Deletion request → erase **≤30 days** cascading across DB rows + Storage buckets (progress-photos, community-photos, meal-notes, coach-media) + push tokens + wearable tokens + request OpenAI/Resend deletion.
- Exceptions: **Stripe transaction/tax records 7 years** (legal obligation); **backups expire ≤90 days**; **support correspondence 2 years**.
- **MHMDA:** consumer health data deletion has **no broad legal-retention loophole**.

---

## 11. Open TODOs (must resolve before finalization)

- [ ] **[VERIFY]** Confirm Shape's legal entity name and fill throughout.
- [ ] **[VERIFY]** Appoint and name **EU** and **UK Art.27** representatives.
- [ ] **[VERIFY]** Assign named Incident Lead, Security Lead, Comms Lead, on-call rota, executive sponsor.
- [ ] **[VERIFY]** Counsel to confirm each notification clock's applicability and exact terms (Art.33/34; per-US-state breach laws and AG thresholds; **CA SB1223** 30-day terms; **MHMDA** notice interaction; PCI card-brand duties).
- [ ] **[VERIFY]** Encryption-at-rest/in-transit status (drives Art.34 exception).
- [ ] **[VERIFY]** Lead-authority / one-stop-shop analysis for an EU-establishment-less US operator.
- [ ] **[VERIFY]** Whether a statutory DPO is required.
- [ ] **[VERIFY]** Sub-processor DPAs require "without undue delay" breach notice to Shape.
- [ ] **[VERIFY]** OpenAI API no-training terms.
- [ ] **[VERIFY]** Coach (independent controller) notification roles and duties.
- [ ] **[VERIFY]** Code postures: no sale; no behavioral ads; no AI training on health/fitness data; 18+ enforcement.
- [ ] **[VERIFY]** Set plan version, effective date, owner, and review cadence; confirm post-mortem timing.

---

*End of DRAFT. Prepared for Shape's privacy counsel to review and finalize. Not legal advice.*
