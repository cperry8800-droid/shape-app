# Transfer Impact Assessment (TIA) — Shape EU/UK → US International Data Transfers

**DRAFT — prepared for Shape's privacy counsel to review and finalize. Not legal advice.**

---

## 0. Document control & scope

| Field | Value |
|---|---|
| Controller / data exporter | [Shape — legal entity to be confirmed by counsel], operated from Brooklyn, NY, USA |
| Product | Consumer fitness + coaching marketplace (web + iOS app); independent trainers/nutritionists coach members. **Not** a healthcare provider — health data is *consumer health data*, **not** HIPAA PHI. 18+ only. |
| Exporting jurisdictions | EU (GDPR) and UK (UK GDPR) data subjects |
| Importing jurisdiction | United States |
| Privacy contact | privacy@theshapecommunity.com / info@theshapecommunity.com |
| Art. 27 representatives (EU + UK) | **[VERIFY / TODO]** — to be appointed |
| Status | DRAFT — for privacy-counsel review, not legal advice |

**Purpose.** This TIA accompanies Shape's Standard Contractual Clauses (SCCs) / UK International Data Transfer Addendum (IDTA) for EU/UK → US transfers to sub-processors, per *Schrems II* (C-311/18) and EDPB Recommendations 01/2020 on supplementary measures. It assesses, per importer: (a) the transfer mechanism, (b) the nature of the data, (c) the risk of US government access (FISA 702 / EO 12333 context), (d) supplementary measures, and (e) a conclusion. Where an importer is certified under the EU-US Data Privacy Framework (DPF) and its UK Extension, that adequacy decision is the primary mechanism and SCCs/IDTA are noted as fallback.

**Methodology note (US law context — applies to all importers).**
- **FISA 50 U.S.C. § 1881a ("Section 702")** permits compelled disclosure by "electronic communication service providers" (ECSPs) of non-US persons' data for foreign-intelligence purposes. Relevance to a given importer depends on whether it qualifies as an ECSP and on the nature/volume of data held.
- **Executive Order 12333** governs signals-intelligence collection (including potential transit/upstream interception) and is not subject to the same statutory process as § 702; encryption in transit is the principal mitigant.
- **EO 14086 (Oct 2022)** and the resulting DPF redress mechanism (Data Protection Review Court) are the basis the European Commission relied on for the 2023 EU-US DPF adequacy decision and the UK Extension. For SCC-only importers, EO 14086's proportionality limits and redress are still relevant context to the "essential equivalence" analysis but should be assessed by counsel **[VERIFY]**.
- Shape holds **no indication** of any government access request to any importer to date **[VERIFY — confirm via vendor transparency reports / no warrant canary breach]**.

---

## 1. Per-importer summary table

| # | Importer | Mechanism | Health data? | Nature of data | § 702 ECSP risk* | Supplementary measures | Conclusion |
|---|---|---|---|---|---|---|---|
| 1 | **Supabase** (DB / auth / storage) | **SCCs + UK IDTA + this TIA** (NOT DPF) | **YES — bulk** | All Shape personal + special-category health data (see §2.1) | Elevated — large volume of sensitive data; assess ECSP status **[VERIFY]** | Encryption at rest + in transit; owner-level RLS; coach access gated by `is_coach_on_client`; private storage buckets; access controls; deletion ≤30 days; transparency/challenge obligations | Transfer may proceed **subject to documented supplementary measures**; **highest-priority** importer. |
| 2 | **OpenAI** (Nora chat / Whisper / TTS) | **SCCs** (NOT DPF) | **YES — health context + voice audio** | Coaching prompts/responses with health context; meal-note / voice audio sent for transcription/TTS | Elevated — sensitive content in transit/processing | API "no-training" terms **[VERIFY]**; encryption in transit; data-minimisation in prompts; deletion request on erasure; no model training on user health/fitness data (posture, **[VERIFY in code/terms]**) | Transfer may proceed **subject to supplementary measures + confirming no-training terms**. |
| 3 | **Stripe** (payments) | **DPF + SCCs fallback** | No | Billing data; card last4 / brand / status (no full PAN — SAQ A via Stripe-hosted fields) | Lower — financial, no health | DPF adequacy primary; PCI-DSS v4.0.1; tokenised card data; 7-yr tax/transaction retention (legal obligation) | Transfer permitted under DPF; SCCs as fallback. |
| 4 | **Vercel** (hosting / analytics) | **DPF** | No | IP, usage/analytics | Lower–moderate (transit) | DPF adequacy primary; TLS in transit; no health data | Transfer permitted under DPF; recommend SCC fallback on file **[VERIFY]**. |
| 5 | **Cloudflare** (DNS / Turnstile) | **DPF** | No | IP, Turnstile token | Lower–moderate (transit) | DPF adequacy primary; TLS; bot-mgmt only, no health data | Transfer permitted under DPF; recommend SCC fallback on file **[VERIFY]**. |
| 6 | **Google Firebase FCM** (push) | **DPF + SCCs** | Maybe | Push tokens, notification content | Moderate — Google is a named § 702 provider historically | DPF primary + SCCs; minimise health content in notifications; token deletion on erasure | Transfer permitted under DPF with SCC backstop; keep notification payloads non-sensitive. |
| 7 | **Resend** (email) | **DPF / SCCs** | No | Name, email, message content | Lower–moderate | DPF/SCCs; deletion request on erasure; TLS; avoid health content in email bodies | Transfer permitted; confirm whether DPF or SCC is operative **[VERIFY]**. |
| 8 | **Instacart** (grocery hand-off, when used) | **Per Instacart terms** | Indirect | Grocery list items at hand-off | Lower | User-initiated hand-off; list items only; governed by Instacart terms | Transfer is user-directed; counsel to confirm controller/processor status + mechanism **[VERIFY]**. |
| 9 | **Apple HealthKit / MusicKit** | On-device + US | **YES** (HealthKit) | Wearable/health data on-device; member opt-in | Lower (on-device, opt-in) | On-device processing; member opt-in integration | Member-initiated; confirm Apple DTA terms **[VERIFY]**. |
| 10 | **Spotify** (playlists) | Per terms | No | Playlist data | Lower | No health data | Low risk; confirm mechanism **[VERIFY]**. |
| 11 | **Strava / Garmin / Whoop / Oura** (wearables) | Per terms; member opt-in | **YES** | Wearable health/fitness data | Moderate (health) | Member opt-in via `user_integrations`; token deletion on erasure | Member-initiated; confirm each vendor's transfer mechanism + terms **[VERIFY]**. |

\* "§ 702 ECSP risk" is a **preliminary** qualitative flag for counsel, not a legal determination. Each importer's actual ECSP status must be confirmed **[VERIFY]**.

> **Note on independent coaches.** Independent trainers/nutritionists are **third-party recipients acting as independent controllers**, not sub-processors. Disclosures to coaches are governed by Shape's controller-to-controller terms and notice, not by this importer TIA. Coach access to member data is technically gated by `is_coach_on_client`. Counsel to confirm any cross-border element where a coach is outside the EU/UK **[VERIFY]**.

---

## 2. Per-importer detailed notes

### 2.1 Supabase — HIGHEST PRIORITY (bulk health data, SCCs not DPF)

**Mechanism.** SCCs (controller-to-processor module) **+ UK IDTA + this TIA**. Supabase is **not** DPF-certified, so SCCs/IDTA + supplementary measures are the *sole* lawful basis for this transfer — there is no adequacy backstop.

**Nature of data.** Supabase Postgres holds **all** Shape personal data, including the full special-category (Art. 9 GDPR) health inventory:
- Account / identity: name, email, password hash, username, role, photo, bio.
- **Health screening** (`user_goals` 'health_profile' = PAR-Q answers): prescription medications, allergies, pregnancy/postpartum status, medical conditions, injuries, emergency contact.
- Body / progress: `client_weigh_ins` (weight, body-fat), `client_measurements` (girths), `client_progress_photos` (private bucket), `daily_health_snapshot` (resting HR, HRV, sleep, recovery, workout minutes, calories, macros, mood), `client_checkins` (sleep/energy/stress/hunger ratings).
- Training + nutrition logs, meal logs + macros, meal-note **audio** (private bucket), grocery lists, `client_goals`.
- Connected wearable sources (`user_integrations`), community posts/messages/follows/playlists, Stripe commerce metadata, `score_ledger`, device/usage (IP, push tokens, timestamps, analytics).

This is the most sensitive and highest-volume transfer in Shape's stack — the central focus of this TIA.

**US-law / government-access risk.** Because Supabase hosts a large, concentrated store of special-category health data in the US, the § 702 / EO 12333 exposure is the most material of any importer. Counsel must assess **[VERIFY]** whether Supabase (or its underlying infrastructure provider) qualifies as an ECSP subject to § 702 compelled disclosure, and whether EO 14086 proportionality/redress meaningfully constrains that exposure for SCC-only transfers. Shape is aware of **no** government-access request to date **[VERIFY]**.

**Supplementary measures (technical + organisational + contractual).**
- *Technical:* encryption in transit (TLS) and at rest; owner-level Row-Level Security (RLS) so each member sees only their own rows; coach read access gated by `is_coach_on_client`; progress photos, community photos, meal notes and coach media held in **private** storage buckets; access controls and least-privilege.
- *Organisational:* deletion request honoured ≤30 days, cascading across DB rows + Storage buckets + push tokens + wearable tokens; backups expire ≤90 days; documented sub-processor governance.
- *Contractual:* SCCs/IDTA transparency and government-access-challenge obligations; importer to notify Shape of any access request and to challenge unlawful requests where legally able **[VERIFY clause present]**.
- **[VERIFY / strengthen]:** Evaluate additional measures for the most sensitive fields — e.g. application-layer / column-level encryption or pseudonymisation of `health_profile` and audio, and whether Supabase region pinning / key management (BYOK) is available — and document why current measures are deemed sufficient (or upgrade them).

**Conclusion.** Transfer to Supabase may proceed **only on the basis of SCCs + UK IDTA + the documented supplementary measures above**, subject to counsel completing the [VERIFY] items (ECSP analysis; access-challenge clause; enhanced encryption of the most sensitive fields). This is the **highest-priority** importer for Shape's transfer governance.

---

### 2.2 OpenAI — health context + voice audio (SCCs, not DPF)

**Mechanism.** SCCs. **Not** DPF-certified — no adequacy backstop.

**Nature of data.** Powers the "Nora" assistant (chat), Whisper (speech-to-text) and TTS. Receives **coaching prompts/responses with health context** and **voice / meal-note audio**. This carries special-category (Art. 9) content and so warrants heightened treatment.

**US-law / government-access risk.** Sensitive content is transmitted to and processed in the US; § 702/EO 12333 context applies as for any US processor of EU/UK personal data. Risk is mitigated by data-minimisation (limit what health context is sent in prompts) and the no-retention/no-training posture.

**Supplementary measures.**
- API **"no-training" terms** so user content is not used to train models **[VERIFY — confirm contractual terms in effect]**; consistent with Shape posture "no ML/AI training on user health/fitness data" **[VERIFY in code/terms]**.
- Encryption in transit; data-minimisation in prompt construction; deletion request to OpenAI on member erasure.
- **[VERIFY]:** confirm OpenAI retention window for API inputs/outputs and that it aligns with Shape's ≤30-day erasure commitment; confirm abuse-monitoring retention does not undermine no-training/no-retention posture.

**Conclusion.** Transfer may proceed under SCCs **subject to confirming the no-training/no-retention terms and minimising health context in prompts**. Treat as a high-sensitivity importer (second after Supabase).

---

### 2.3 Stripe — payments (DPF + SCCs fallback)

**Mechanism.** **DPF** (EU-US DPF + UK Extension) as primary mechanism, with **SCCs as fallback**.

**Nature of data.** Billing data; card **last4 / brand / status** only — **no full card numbers** (PCI-DSS v4.0.1, SAQ A via Stripe-hosted fields). No health data.

**US-law / government-access risk.** Lower sensitivity (financial, no special-category data). DPF adequacy decision plus EO 14086 redress reduces residual risk.

**Supplementary measures.** DPF certification (primary); PCI-DSS v4.0.1; card data tokenised / hosted by Stripe; Stripe transaction & tax records retained **7 years** under legal obligation (a recognised exception to Shape's deletion cascade).

**Conclusion.** Transfer permitted under DPF; SCCs available as fallback if DPF status changes. Low residual risk.

---

### 2.4 Vercel — hosting / analytics (DPF)

**Mechanism.** **DPF.** **Nature of data:** IP and usage/analytics; **no health data.**
**Risk:** lower–moderate (mainly transit). **Supplementary measures:** DPF adequacy primary; TLS in transit.
**Conclusion:** Permitted under DPF. **[VERIFY]** keep an SCC fallback on file in case DPF status lapses.

---

### 2.5 Cloudflare — DNS / Turnstile (DPF)

**Mechanism.** **DPF.** **Nature of data:** IP and Turnstile token; **no health data.**
**Risk:** lower–moderate (transit / edge). **Supplementary measures:** DPF adequacy primary; TLS; bot-management/CAPTCHA only.
**Conclusion:** Permitted under DPF. **[VERIFY]** SCC fallback on file.

---

### 2.6 Google Firebase FCM — push (DPF + SCCs)

**Mechanism.** **DPF + SCCs.** **Nature of data:** push tokens and notification content; health relevance **"maybe"** (depends on notification payload).
**Risk:** moderate — Google has historically been a named § 702 provider, so government-access context is more salient; mitigated by keeping notification payloads non-sensitive.
**Supplementary measures:** DPF primary + SCCs backstop; **minimise health content in notification bodies**; push-token deletion on member erasure.
**Conclusion:** Permitted under DPF with SCC backstop, **provided notification payloads avoid special-category content**.

---

### 2.7 Resend — email (DPF / SCCs)

**Mechanism.** **DPF / SCCs** — counsel to confirm which is operative **[VERIFY]**. **Nature of data:** name, email, message content; **no health data** (provided email bodies avoid health detail).
**Risk:** lower–moderate. **Supplementary measures:** DPF/SCCs; TLS; deletion request to Resend on member erasure; avoid special-category content in email bodies.
**Conclusion:** Permitted; **[VERIFY]** confirm operative mechanism and that email content excludes health data.

---

### 2.8 Instacart — grocery hand-off, when used (per Instacart terms)

**Mechanism.** Per Instacart's own terms. **Nature of data:** grocery list items at the point of a **user-initiated** hand-off; health relevance **indirect**.
**Risk:** lower. **Supplementary measures:** user-directed transfer; only list items shared.
**Conclusion:** This is a **user-directed** disclosure. **[VERIFY]** counsel to confirm Instacart's controller/processor status and the applicable transfer mechanism, and whether separate notice/consent is needed at hand-off.

---

### 2.9 Apple HealthKit / MusicKit (on-device + US)

**Mechanism.** On-device processing + US. **Nature of data:** HealthKit = special-category (**YES**); member opt-in.
**Risk:** lower — primarily on-device, member-initiated. **Supplementary measures:** on-device processing; explicit member opt-in.
**Conclusion:** Member-initiated integration. **[VERIFY]** confirm Apple developer/data-transfer terms and that no health data leaves the device except as the member directs.

---

### 2.10 Spotify — playlists (per terms)

**Mechanism.** Per Spotify terms. **Nature of data:** playlist data; **no health data.** **Risk:** low.
**Conclusion:** Low risk. **[VERIFY]** confirm applicable transfer mechanism.

---

### 2.11 Strava / Garmin / Whoop / Oura — wearables (per terms; member opt-in)

**Mechanism.** Per each vendor's terms; **member opt-in** via `user_integrations`. **Nature of data:** wearable health/fitness data (**YES** — special-category).
**Risk:** moderate (health data). **Supplementary measures:** member opt-in connection; wearable-token deletion on member erasure.
**Conclusion:** Member-initiated. **[VERIFY]** confirm each vendor's transfer mechanism and terms, and document the opt-in/consent flow.

---

## 3. Cross-cutting supplementary measures (all importers)

- **Encryption:** TLS in transit for all importers; encryption at rest for Supabase. Consider enhanced field-level encryption/pseudonymisation for the most sensitive Supabase data **[VERIFY]**.
- **Access controls:** owner-RLS; coach access gated by `is_coach_on_client`; private storage buckets; least-privilege.
- **Transparency & challenge:** SCC/IDTA clauses requiring importers to notify Shape of, and challenge where lawful, any government access request; Shape to maintain a record and (if applicable) a warrant-canary / transparency check **[VERIFY]**.
- **Data minimisation:** limit health context sent to OpenAI; keep FCM/Resend payloads free of special-category content.
- **Deletion:** member erasure cascades ≤30 days across DB + Storage + push tokens + wearable tokens, with deletion requests issued to OpenAI and Resend. Documented exceptions: Stripe records 7 years (legal obligation), backups expire ≤90 days, support correspondence 2 years. **MHMDA note:** consumer-health-data deletion has **no** broad legal-retention loophole.
- **Postures to confirm in code [VERIFY]:** no data sale; no targeted/cross-context behavioural ads; no ML/AI training on user health/fitness data; 18+ only.

## 4. Overall conclusion & open TODOs

Transfers to **DPF-certified** importers (Stripe, Vercel, Cloudflare, Firebase, and Resend if DPF) rest on the 2023 EU-US DPF adequacy decision + UK Extension, with SCCs/IDTA as fallback. Transfers to **SCC-only** importers — **Supabase (highest priority)** and **OpenAI** — rely on SCCs/IDTA + documented supplementary measures and require completion of the [VERIFY] items before they can be treated as final.

**Open TODOs for counsel ([VERIFY]):**
1. Confirm Shape's legal entity and appoint EU + UK Art. 27 representatives.
2. Complete ECSP / § 702 analysis for Supabase (and infra provider) and for OpenAI; document EO 14086 reliance for SCC-only transfers.
3. Confirm SCC/IDTA government-access notification + challenge clauses are in each importer's agreement.
4. Confirm OpenAI API **no-training** + retention terms and alignment with ≤30-day erasure.
5. Decide on / document enhanced encryption or pseudonymisation for Supabase `health_profile`, progress photos and audio.
6. Confirm DPF vs SCC operative mechanism for Resend; keep SCC fallbacks on file for Vercel and Cloudflare.
7. Confirm transfer mechanism + terms for Instacart, Apple, Spotify, and each wearable (Strava/Garmin/Whoop/Oura).
8. Confirm in code the four postures (no sale; no behavioural ads; no AI training on health/fitness data; 18+).
9. Verify no government-access request received to date across importers.

---
*End of DRAFT. Prepared for Shape's privacy counsel to review and finalize. Not legal advice.*
