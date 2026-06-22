**DRAFT — prepared for Shape's privacy counsel to review and finalize. Not legal advice.**

# Data Processing Agreement / Sub-Processor Compliance Checklist

**Controller (data exporter):** [Shape — legal entity to be confirmed by counsel]
**Operated from:** Brooklyn, NY, USA
**Website:** theshapecommunity.com
**General contact:** info@theshapecommunity.com
**Privacy / data-subject rights:** privacy@theshapecommunity.com
**EU Art.27 representative:** to be appointed **[VERIFY]**
**UK Art.27 representative:** to be appointed **[VERIFY]**

**Scope of processing:** Consumer fitness + coaching marketplace (web + iOS). Shape acts as **controller** for member personal data and consumer health data; vendors below act as **processors / sub-processors**. Independent trainers/nutritionists ("coaches") are **third-party recipients and independent controllers**, not sub-processors — they are out of scope for this Art.28 checklist and should be covered by a separate controller-to-controller arrangement **[VERIFY]**.

**Health-data note:** Health data handled by Shape is **consumer health data**, NOT HIPAA PHI. Where a sub-processor touches health data, heightened diligence applies (GDPR Art.9 explicit consent as lawful basis; Washington My Health My Data Act (MHMDA); Nevada SB370; CT consumer-health). Shape's stated postures (must be true in code — flag for engineering confirmation): **no data sale; no targeted/cross-context behavioral advertising; no ML/AI training on user health/fitness data; 18+ only.**

---

## Part A — How to use this checklist

For each sub-processor, confirm and date every column in the tracking table (Part B). Then verify the Art.28(3) clause set (Part C) is present in that vendor's executed DPA. Items marked **[VERIFY]** are open TODOs that counsel/engineering must confirm against the executed contract and the live codebase before this document is finalized. Do not treat any cell as satisfied until the underlying document is on file and dated.

**Legend:** ✅ asserted by Shape facts · ⬜ to be confirmed (no fact on file) · **[VERIFY]** flagged TODO · N/A not applicable.

**Transfer mechanism abbreviations:** SCCs = EU Standard Contractual Clauses · UK IDTA = UK International Data Transfer Agreement (or UK Addendum) · DPF = EU-US / UK Extension / Swiss-US Data Privacy Framework · TIA = Transfer Impact Assessment.

---

## Part B — Sub-processor tracking table

> Every "DPA signed?", date, and "on file?" cell below is **[VERIFY]** against the actual executed agreement — the source facts state the *intended* transfer posture per vendor but do not confirm execution. Confirm and date each before finalizing.

### B.1 — In-scope sub-processors (processors under Shape's controllership)

| Sub-processor | Purpose | Data categories | Health data? | Hosting region | DPA signed + dated? | Art.28 clauses present? | CCPA service-provider language? | SCCs / DPF / IDTA on file? | Audit rights? | Listed on public sub-processor list? |
|---|---|---|---|---|---|---|---|---|---|---|
| **Supabase** | Database / auth / storage | All Shape data incl. health (Postgres, owner-RLS, coach read via `is_coach_on_client`) | **YES** | US | **[VERIFY]** | **[VERIFY]** verify Part C | **[VERIFY]** | **SCCs + TIA + UK IDTA** (NOT DPF) — confirm on file **[VERIFY]** | **[VERIFY]** | **[VERIFY]** |
| **Stripe** | Payments | Billing, card last4 / brand / status (no full PAN) | No | US / global | **[VERIFY]** | **[VERIFY]** verify Part C | **[VERIFY]** | **DPF + SCCs** — confirm on file **[VERIFY]** | **[VERIFY]** | **[VERIFY]** |
| **Vercel** | Hosting / analytics | IP, usage | No | US | **[VERIFY]** | **[VERIFY]** verify Part C | **[VERIFY]** | **DPF** — confirm on file **[VERIFY]** | **[VERIFY]** | **[VERIFY]** |
| **Cloudflare** | DNS / Turnstile (CAPTCHA) | IP, Turnstile token | No | US | **[VERIFY]** | **[VERIFY]** verify Part C | **[VERIFY]** | **DPF** — confirm on file **[VERIFY]** | **[VERIFY]** | **[VERIFY]** |
| **OpenAI** | Nora chat / Whisper / TTS | Coaching + health context, **voice audio** | **YES** | US | **[VERIFY]** | **[VERIFY]** verify Part C | **[VERIFY]** | **SCCs** (NOT DPF) — confirm on file **[VERIFY]** | **[VERIFY]** | **[VERIFY]** |
| **Google Firebase (FCM)** | Push notifications | Push tokens, notification content | maybe **[VERIFY]** | US | **[VERIFY]** | **[VERIFY]** verify Part C | **[VERIFY]** | **DPF + SCCs** — confirm on file **[VERIFY]** | **[VERIFY]** | **[VERIFY]** |
| **Resend** | Transactional / marketing email | Name, email, message content | No | US | **[VERIFY]** | **[VERIFY]** verify Part C | **[VERIFY]** | **DPF / SCCs** — confirm on file **[VERIFY]** | **[VERIFY]** | **[VERIFY]** |

### B.2 — OpenAI-specific AI controls (in addition to row above)

| Control | Required posture | Status |
|---|---|---|
| Zero-retention / abuse-monitoring-exempt endpoint where feasible | Reduce retention of health/voice content | **[VERIFY]** confirm whether zero-retention is enabled for the API calls carrying health/voice data |
| No-training on Shape data (API default no-training terms) | OpenAI API content not used to train models | **[VERIFY]** — facts mark this "API no-training terms [VERIFY]"; confirm contractually and verify it covers Whisper/TTS audio, not just chat |
| Deletion on member erasure request | Request OpenAI deletion as part of <=30-day cascade | **[VERIFY]** confirm deletion request mechanism + SLA |
| Health-context flow-through | Art.9 explicit consent obtained before health context sent to OpenAI | **[VERIFY]** confirm consent gate exists in code |

### B.3 — Boundary / special-status vendors (confirm classification with counsel)

| Vendor | Purpose | Data | Health? | Region | Likely classification | Notes / TODO |
|---|---|---|---|---|---|---|
| **Instacart** | Grocery hand-off (when used) | Grocery list items | indirect | US | Per Instacart terms — **independent controller or recipient?** **[VERIFY]** | Confirm whether a DPA is required or whether this is a controller-to-controller / user-initiated hand-off. Confirm what triggers the transfer and whether consent is captured. **[VERIFY]** |
| **Apple HealthKit / MusicKit** | Health data import; music | Health metrics (HealthKit); music (MusicKit) | **YES** (HealthKit) | On-device + US | Apple developer terms govern; HealthKit largely on-device | Confirm Apple Developer Agreement / HealthKit terms cover health usage; member opt-in required. **[VERIFY]** |
| **Spotify** | Member playlists | Playlist data | No | **[VERIFY]** | Integration partner / recipient | Confirm transfer posture and whether a DPA/terms are on file. **[VERIFY]** |
| **Strava / Garmin / Whoop / Oura** | Wearable data sources | Health / fitness metrics via `user_integrations`, member opt-in | **YES** | **[VERIFY]** region | API integration partners (likely independent controllers of their own data) | Confirm each provider's developer/API terms, whether they are controller-to-controller, and token-deletion on member erasure. **[VERIFY]** each provider |
| **Independent coaches** | Deliver coaching | Member health + training data (read via RLS) | **YES** | US | **Third-party recipients / independent controllers** — NOT sub-processors | Out of scope for Art.28; cover via separate coach data-sharing terms + member transparency. **[VERIFY]** |

---

## Part C — Required GDPR Art.28(3) clauses to verify in each in-scope DPA

For every in-scope sub-processor (Part B.1), confirm the executed DPA contains each clause below. Use one copy of this checklist per vendor.

| # | Art.28(3) requirement | Present? | Notes |
|---|---|---|---|
| C.1 | **Documented instructions** — processor acts only on Shape's documented instructions, incl. for international transfers, unless required by EU/MS law (Art.28(3)(a)) | ⬜ **[VERIFY]** | |
| C.2 | **Confidentiality** — persons authorized to process are bound by confidentiality (Art.28(3)(b)) | ⬜ **[VERIFY]** | |
| C.3 | **Security of processing** — appropriate technical & organizational measures per Art.32 (encryption in transit/at rest, access control, RLS where applicable) (Art.28(3)(c)) | ⬜ **[VERIFY]** | For Supabase/OpenAI confirm health-grade measures + voice-audio handling |
| C.4 | **Sub-processor controls** — no onward sub-processor without prior specific or general written authorization; flow-down of equivalent obligations; advance notice of changes with objection right (Art.28(2), 28(4)) | ⬜ **[VERIFY]** | Confirm Shape receives change notifications |
| C.5 | **Assistance with data-subject rights** — processor helps Shape respond to access/erasure/portability/objection requests (Art.28(3)(e)) | ⬜ **[VERIFY]** | Critical for <=30-day erasure cascade |
| C.6 | **Assistance with Art.32–36 obligations** — security, breach notification, DPIAs, prior consultation (Art.28(3)(f)) | ⬜ **[VERIFY]** | Confirm breach-notice SLA aligns with CA SB1223 30-day (incl. health) |
| C.7 | **Breach notification to controller** — notify Shape without undue delay on becoming aware of a personal-data breach (Art.33(2)) | ⬜ **[VERIFY]** | Capture the contractual SLA |
| C.8 | **Deletion or return at end of services** — delete or return all personal data and delete copies, save where storage required by law (Art.28(3)(g)) | ⬜ **[VERIFY]** | Reconcile with Stripe 7-yr tax retention exception |
| C.9 | **Audit & inspection rights** — processor makes available info to demonstrate compliance and allows / contributes to audits and inspections (Art.28(3)(h)) | ⬜ **[VERIFY]** | Note whether satisfied via SOC 2 / ISO 27001 reports vs. on-site |
| C.10 | **Duty to flag unlawful instructions** — processor informs Shape if an instruction infringes GDPR (Art.28(3) final ¶) | ⬜ **[VERIFY]** | |
| C.11 | **Subject-matter, duration, nature & purpose, data types, categories of data subjects** documented (Art.28(3) chapeau) | ⬜ **[VERIFY]** | Usually a DPA schedule/annex |
| C.12 | **International transfer mechanism** — valid mechanism for US transfer: SCCs (+ TIA) / UK IDTA or Addendum / DPF certification as applicable | ⬜ **[VERIFY]** | Match to Part B transfer column per vendor |

---

## Part D — CCPA / CPRA service-provider terms to verify (all US in-scope vendors)

Confirm the DPA includes CCPA/CPRA §1798.140(ag) + §1798.100(d) "service provider" or "contractor" language, namely:

| # | CCPA/CPRA service-provider requirement | Present? | Notes |
|---|---|---|---|
| D.1 | Processing limited to the **business purpose(s)** specified in the contract | ⬜ **[VERIFY]** | |
| D.2 | **No selling or sharing** of personal information (aligns with Shape's "no data sale / no cross-context behavioral ads" posture) | ⬜ **[VERIFY]** | Confirm posture true in code |
| D.3 | **No retention, use, or disclosure** outside the direct business relationship or contract | ⬜ **[VERIFY]** | |
| D.4 | **No combining** PI with PI from other sources except as permitted | ⬜ **[VERIFY]** | |
| D.5 | Certification that the vendor **understands and will comply** with these restrictions | ⬜ **[VERIFY]** | |
| D.6 | Shape's right to **monitor / remediate** unauthorized use | ⬜ **[VERIFY]** | |
| D.7 | Flow-down of equivalent terms to onward sub-contractors | ⬜ **[VERIFY]** | |
| D.8 | Assistance with consumer rights requests (delete / correct / know / opt-out) | ⬜ **[VERIFY]** | |

> **Multi-state note:** Shape is subject to CCPA/CPRA plus ~19 US state privacy laws (VA, CO, CT, UT, TX, OR, MT, FL, DE, IA, NJ, NH, NE, MD-MODPA, MN, RI, IN, KY, TN), Washington MHMDA (private right of action), Nevada SB370, and CT consumer-health. Confirm vendor processing-agreement language is broad enough to satisfy these (most track CCPA service-provider concepts). MHMDA in particular requires explicit handling of consumer health data and has **no broad legal-retention loophole** — verify health-touching vendors (Supabase, OpenAI, Firebase if applicable, wearables) honor deletion accordingly. **[VERIFY]**

---

## Part E — Retention & deletion reconciliation (cross-check against each DPA)

Shape's deletion model must be reflected in vendor contractual deletion obligations (clause C.8 / D.8):

- **Active account:** retained while account active.
- **Erasure request:** erase within **<=30 days**, cascading across DB rows + Storage buckets (progress-photos, community-photos, meal-notes, coach-media) + push tokens + wearable tokens, **and** request deletion at **OpenAI** and **Resend**. **[VERIFY]** confirm each downstream deletion request mechanism exists.
- **Exceptions:** Stripe transaction/tax records **7 years** (legal obligation); backups expire **<=90 days**; support correspondence **2 years**.
- **MHMDA override:** consumer health data deletion has **no broad legal-retention loophole** — the 7-yr/90-day/2-yr exceptions must not be used to retain consumer health data beyond what MHMDA permits. **[VERIFY]** confirm health data is excluded from these retention exceptions in practice.

---

## Part F — Open TODOs for counsel / engineering (consolidated [VERIFY] list)

1. Confirm and insert Shape's **legal entity** name.
2. **Appoint EU and UK Art.27 representatives** and record contact details.
3. Confirm an **executed, dated DPA** is on file for every in-scope sub-processor (Part B.1) — all currently **[VERIFY]**.
4. Confirm the stated **transfer mechanism per vendor** is actually on file (Supabase SCCs+TIA+UK IDTA; Stripe DPF+SCCs; Vercel DPF; Cloudflare DPF; OpenAI SCCs; Firebase DPF+SCCs; Resend DPF/SCCs).
5. Verify the **Art.28(3) clause set** (Part C) in each DPA.
6. Verify **CCPA/CPRA service-provider language** (Part D) in each DPA.
7. **OpenAI:** confirm **zero-retention** option and **no-training (API) terms**, including coverage of **Whisper/TTS voice audio**, plus deletion-on-erasure. (Source fact flags OpenAI no-training as **[VERIFY]**.)
8. **Firebase/FCM:** resolve whether push payloads carry **health data** ("maybe") and apply heightened terms if so.
9. **Instacart:** determine classification (sub-processor vs. independent controller / user-initiated hand-off) and required terms.
10. **Wearables (Strava/Garmin/Whoop/Oura) + Spotify + Apple:** confirm developer/API terms, controller relationship, region, and **token deletion** on member erasure.
11. Confirm **coaches** are documented as independent controllers / third-party recipients via separate data-sharing terms (out of Art.28 scope).
12. Publish/maintain a **public sub-processor list** and confirm each in-scope vendor is listed with change-notification process.
13. Confirm code-level postures are **true in code**: no data sale; no targeted/cross-context behavioral ads; **no ML/AI training on user health/fitness data**; 18+ only.
14. Reconcile **retention exceptions vs. MHMDA** for consumer health data (Part E).
15. Confirm vendor **breach-notice SLAs** meet CA SB1223 30-day (incl. health) and GDPR Art.33 timelines.

---

*Document status: DRAFT for privacy-counsel review. Not legal advice. All cells marked **[VERIFY]** or ⬜ are unconfirmed against executed agreements and the live codebase and must be closed before reliance.*
