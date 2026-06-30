**DRAFT — prepared for Shape's privacy counsel to review and finalize. Not legal advice.**

# Legitimate Interests Assessments (LIAs)

**Controller:** [Shape — legal entity to be confirmed by counsel]
**Operated from:** Brooklyn, NY, USA
**Website:** theshapecommunity.com
**Privacy / rights contact:** privacy@theshapecommunity.com
**EU + UK Art. 27 representatives:** to be appointed [VERIFY]
**Document status:** DRAFT — for privacy-counsel review, not legal advice.
**Date:** 2026-06-20

---

## 0. Scope and how to read this document

This document records the three-part Legitimate Interests Assessment (LIA) required to rely on **Art. 6(1)(f) UK/EU GDPR** (legitimate interests) as a lawful basis for processing personal data. It covers three processing activities for which Shape relies on legitimate interests:

1. **Security and fraud prevention** (including Cloudflare Turnstile bot/abuse mitigation);
2. **Product improvement and debugging**;
3. **Core service operation** (the operational processing necessary to run the platform that is not already covered by contract).

Each assessment applies the standard three tests:

- **Purpose test** — is there a legitimate interest?
- **Necessity test** — is the processing necessary for that interest?
- **Balancing test** — do the individual's interests, rights and freedoms override the legitimate interest? This includes the impact on data subjects, the safeguards applied, and the data subjects' reasonable expectations.

### Important scoping constraints (apply across all three LIAs)

- **Special-category / health data is NOT processed under legitimate interests.** Shape's health and fitness data is processed under **explicit consent (Art. 9)** and, where applicable, **contract**. The lawful-basis map is: contract (account/coaching/payments); explicit consent (Art. 9 health data + analytics + marketing); legitimate interests (security/fraud/Turnstile/product improvement); legal obligation (tax/records). The legitimate-interests activities in this document are therefore limited, so far as the code permits, to non-special-category personal data such as IP address, device and usage data, push tokens, timestamps, and analytics identifiers. **[VERIFY in code]** that the security, debugging, and core-operation pipelines do not ingest health/special-category fields under the legitimate-interests basis; where they unavoidably touch health data, that processing must be re-papered under Art. 9 consent (or another Art. 9 condition) rather than this LIA.
- **Consumer health data and US state law.** Even where US frameworks rather than GDPR apply, note that the Washington My Health My Data Act (MHMDA) treats much of Shape's fitness/health data as consumer health data and carries a private right of action; MHMDA deletion has no broad legal-retention loophole. Security/debugging logs must not become a backdoor store of consumer health data.
- **Postures assumed true in code (each [VERIFY]):** no data sale; no targeted/cross-context behavioral advertising; no ML/AI training on user health/fitness data; 18+ only. These postures materially reduce the privacy intrusion in the balancing tests below and must remain true.
- **Data subjects are adults (18+ only).** No children's data is in scope (COPPA notwithstanding, as a posture). [VERIFY age-gating in code.]

---

## 1. LIA — Security and Fraud Prevention (incl. Cloudflare Turnstile)

### 1.1 Purpose test — the legitimate interest

**Processing activity.** Protecting the Shape platform, its members, and independent coaches against unauthorized access, account takeover, credential-stuffing, bot traffic, scraping, spam, payment fraud, and other abuse. This includes:

- Operation of **Cloudflare Turnstile** (CAPTCHA-alternative bot/abuse mitigation) and Cloudflare DNS, which processes **IP address and a Turnstile token** (Cloudflare | DNS/Turnstile | IP/token | not health | US | DPF).
- Use of authentication and database security controls in Supabase, including owner-level Row-Level Security (owner-RLS) and the `is_coach_on_client` predicate that gates coach read access.
- Logging of device/usage signals already in the data inventory: **IP, push tokens, timestamps, and analytics**, used to detect and investigate abuse.
- Fraud-related signals around Stripe commerce (e.g., payment status), noting Shape stores only last4/brand/status and **no full card numbers**, with Stripe-hosted fields under PCI-DSS v4.0.1 SAQ A.

**Why this is a legitimate interest.** Preventing fraud and ensuring network and information security are expressly recognized as legitimate interests under GDPR (Recital 49 treats network and information security as a legitimate interest; Recital 47 recognizes fraud prevention). Shape has a clear commercial and ethical interest in keeping member accounts — which can contain sensitive health and fitness information — secure from takeover and abuse. The interest is real, specific, and present (an operating consumer marketplace handling sensitive data and payments), not speculative.

**Whose interests.** Shape's own interests as controller; the interests of members and coaches in a secure service; and a broader public/third-party interest in not having the platform used as a vector for fraud, spam, or automated abuse.

### 1.2 Necessity test

- **Bot and abuse mitigation (Turnstile).** Processing the IP address and a verification token is necessary to distinguish automated from human traffic at sign-up/login and on abuse-prone endpoints. A challenge mechanism cannot function without some client signal; Turnstile is designed to minimize friction and data exposure relative to traditional CAPTCHAs.
- **Account-takeover / credential-stuffing defense.** IP, timestamps, and device/usage signals are necessary to detect anomalous access patterns; without them, Shape cannot meaningfully detect or respond to account compromise affecting accounts that may hold health data.
- **Access control.** Owner-RLS and `is_coach_on_client` are necessary, data-minimizing controls — they enforce that only the data subject (owner) and authorized coaches can read a member's rows.
- **Proportionality / no less intrusive means.** The signals used (IP, token, timestamps, push tokens, analytics) are the minimum class of data needed to operate these defenses. Health/special-category data is **not** necessary for, and should not be used in, security/fraud processing **[VERIFY in code that abuse logs exclude health fields]**. Shape relies on a reputable processor (Cloudflare) rather than building bespoke surveillance, which limits data spread.

**Conclusion on necessity.** The processing is necessary and proportionate; the legitimate interest cannot reasonably be achieved by a materially less intrusive route.

### 1.3 Balancing test

**Impact on data subjects.**
- IP and token processing for bot mitigation is low-intrusion and largely invisible but routine; it does not by itself reveal sensitive attributes about the individual.
- Security logging of IP/timestamps/usage is a limited intrusion; the principal risk is that logs could incidentally aggregate behavioral data or (if mis-scoped) health data.
- Data subjects generally benefit from this processing: it protects their accounts and sensitive data.

**Safeguards.**
- Data minimization: only non-special-category signals (IP, token, push tokens, timestamps, analytics) are used for this purpose. **[VERIFY]** security/fraud pipelines exclude health fields.
- Reputable sub-processor with appropriate transfer mechanism: **Cloudflare** is US-based and covered by **DPF**; the data shared is limited to **IP/token**.
- Stripe-hosted payment fields mean Shape never handles full card numbers (PCI-DSS v4.0.1 SAQ A), reducing fraud-related data exposure.
- Access controls (owner-RLS, `is_coach_on_client`) limit who can read member data.
- Retention discipline: device/usage signals follow Shape's retention model (active while account active; deletion request honored ≤30 days; backups expire ≤90 days). Security logs should have a defined, limited retention period **[VERIFY specific log retention in code/infra]**.
- Transparency via the privacy notice and the privacy@ rights channel; EU/UK Art. 27 representatives to be appointed.

**Reasonable expectations.** Adult users of a consumer fitness marketplace that holds health data and processes payments reasonably expect the operator to run bot defenses, secure logins, and detect fraud. The use of a CAPTCHA-style challenge (Turnstile) at sign-up/login is a widely understood, expected control. This processing does not involve any unexpected secondary use (no data sale, no behavioral advertising — both [VERIFY]).

**Outcome of balance.** The limited, expected, low-intrusion nature of the security/fraud processing, combined with the safeguards and the benefit to data subjects, means the individuals' interests and rights do not override Shape's legitimate interest — **provided** health/special-category data stays out of this pipeline.

### 1.4 Conclusion

**Legitimate interests (Art. 6(1)(f)) is an appropriate lawful basis for security and fraud prevention, including Cloudflare Turnstile**, for non-special-category personal data (IP, token, push tokens, timestamps, analytics). The balancing test favors processing given the strong security rationale, the alignment with reasonable expectations, the data minimization, and the safeguards. **Conditions:** (i) [VERIFY] no health/special-category data is processed under this basis; (ii) define and document security-log retention; (iii) maintain the postures (no sale, no behavioral ads); (iv) appoint Art. 27 representatives; (v) honor the right to object under Art. 21.

---

## 2. LIA — Product Improvement and Debugging

### 2.1 Purpose test — the legitimate interest

**Processing activity.** Improving, maintaining, and debugging the Shape web and iOS application: diagnosing errors and crashes, investigating support issues, understanding aggregate product usage to fix and improve features, and ensuring reliability. Data classes involved are limited to **device/usage data — IP, push tokens, timestamps, analytics** — and, where unavoidable for debugging a specific incident, technical logs.

Relevant sub-processors:
- **Vercel** (hosting/analytics | IP/usage | not health | US | DPF).
- **Supabase** (DB/auth/storage), which holds all data including health, with owner-RLS — relevant when debugging requires constrained access to production. Supabase: US | SCCs + TIA + UK IDTA, not DPF.

**Why this is a legitimate interest.** Operating, securing the quality of, and improving an online service is a recognized legitimate interest of the controller; Shape has a genuine, present interest in a functioning, reliable, debuggable product. The interest is specific (fix bugs, prevent regressions, improve UX) and benefits users directly.

### 2.2 Necessity test

- **Debugging.** Technical logs, error/crash data, IP, and timestamps are necessary to reproduce and fix defects. Without diagnostic data, Shape cannot reliably resolve incidents that may degrade or expose the service.
- **Analytics for improvement.** Aggregate usage analytics (Vercel) are necessary to identify which features fail, are slow, or need improvement.
- **No less intrusive alternative for the improvement aim.** Where the improvement aim can be met with **aggregated or de-identified** analytics, that is the less intrusive route and should be preferred. Note that under **ePrivacy/PECR**, non-essential analytics cookies/identifiers generally require **consent**; Shape's lawful-basis map already lists **analytics under explicit consent**. Accordingly, legitimate interests covers operational debugging and product improvement that is **not** dependent on consent-gated analytics storage/access on the user's device; the consent-based analytics track is governed separately. **[VERIFY]** the split between (a) consent-gated client-side analytics and (b) server-side debugging/operational telemetry relied on under LI.
- **Health data is not necessary and must be excluded.** Product improvement and debugging must not use user health/fitness content as an input. The posture "**no ML/AI training on user health/fitness data**" must hold. **[VERIFY in code]** that debugging access to production health data is constrained (owner-RLS), logged, and minimized, and that any developer access to health rows is exceptional, access-controlled, and not used for "improvement."

**Conclusion on necessity.** Operational debugging and non-consent-dependent product-improvement telemetry are necessary and proportionate when limited to device/usage signals and de-identified/aggregated data where feasible.

### 2.3 Balancing test

**Impact on data subjects.**
- Debugging/analytics on device/usage data is generally low-intrusion, especially where aggregated/de-identified.
- The salient risk is engineer access to a production database that contains health data while debugging. If mishandled, that is a high-impact intrusion into special-category data.
- Cross-border transfer: Supabase is US-based on SCCs + TIA + UK IDTA (not DPF); Vercel is US-based on DPF.

**Safeguards.**
- Data minimization and, where feasible, **aggregation/de-identification** for product-improvement analytics.
- Owner-RLS and `is_coach_on_client` constrain who can read member rows even in production; developer/debug access to health data should be exceptional, role-limited, logged, and time-bound **[VERIFY]**.
- Posture: **no ML/AI training on user health/fitness data** [VERIFY]; **no data sale** [VERIFY].
- Appropriate transfer mechanisms in place for each US sub-processor (Supabase SCCs+TIA+UK IDTA; Vercel DPF).
- Retention: device/usage data follows the retention model; deletion requests honored ≤30 days cascading across DB rows and Storage buckets; backups expire ≤90 days; support correspondence retained 2 years.
- Transparency via privacy notice; right to object (Art. 21) available.

**Reasonable expectations.** Adult users expect the operator to monitor for and fix bugs, investigate crashes, and improve the product using technical and usage data. Users do **not** reasonably expect their **health/fitness content** to be mined for "improvement" or used to train models — hence the strict exclusion of health data from this basis and the no-training posture. Provided that line holds, the processing is within reasonable expectations.

**Outcome of balance.** For device/usage and aggregated data, the individuals' interests do not override Shape's interest. The balance only holds if health/special-category data is excluded from the legitimate-interests improvement/debugging use and protected by access controls when incidentally touched during debugging.

### 2.4 Conclusion

**Legitimate interests (Art. 6(1)(f)) is an appropriate lawful basis for operational debugging and product improvement** limited to device/usage data (IP, push tokens, timestamps) and de-identified/aggregated telemetry. **Conditions:** (i) consent-gated client-side analytics remain on the consent basis (ePrivacy/PECR), not LI; (ii) [VERIFY] health data is excluded from improvement use and the no-AI-training posture holds; (iii) constrain, log, and time-limit any developer/debug access to production health data; (iv) prefer aggregation/de-identification; (v) honor Art. 21 objections.

---

## 3. LIA — Core Service Operation

### 3.1 Purpose test — the legitimate interest

**Processing activity.** Operational processing necessary to run the Shape marketplace that supports, but is ancillary to, the contractual service — for example: routing transactional/system communications, operating the hosting and delivery infrastructure, maintaining service integrity and availability, and the administrative back-office processing needed to keep the platform functioning. Data classes are primarily **account/identity, device/usage (IP, push tokens, timestamps), and transactional metadata**.

**Relationship to contract (important).** Much of Shape's "core" processing — account creation, delivery of coaching, and payments — is governed by **contract (Art. 6(1)(b))**, not legitimate interests, and special-category/health data is governed by **explicit consent (Art. 9)**. Legitimate interests under this LIA is therefore a **residual/complementary** basis for operational processing that is genuinely necessary to operate the service but not strictly necessary to perform a specific contractual term — for example, certain operational logging, infrastructure resilience, and transactional/service messaging that supports the relationship.

Relevant sub-processors for operational messaging/infrastructure:
- **Resend** (email | name/email/content | not health | US | DPF/SCCs) — transactional/service email.
- **Google Firebase FCM** (push | tokens/notif | maybe health | US | DPF + SCCs) — push delivery; note **[VERIFY]** whether any notification content could reveal health context, in which case consent/Art. 9 considerations apply.
- **Supabase** (hosting of data/auth/storage), **Vercel** (hosting).

**Why this is a legitimate interest.** Running a reliable, available, well-administered service is a genuine and present interest of the controller and is expected by users. The interest is specific to keeping the marketplace operational.

### 3.2 Necessity test

- **Service/transactional messaging.** Processing name/email (Resend) and push tokens (FCM) is necessary to deliver account, security, and service messages that keep the service usable. Note **CAN-SPAM/CASL** govern commercial messaging; transactional/service messages are distinct, and **marketing is on a separate consent basis** in the lawful-basis map.
- **Infrastructure operation.** Hosting and delivery (Vercel/Supabase) necessarily process IP/usage to serve the application.
- **Minimization and alternatives.** The data used is the minimum to operate (identity + contact + device tokens + technical signals). Where a given operation is in fact strictly necessary to perform the contract, the lawful basis should be **contract**, not LI — counsel to confirm the boundary. Health/special-category data is processed under **consent/contract**, not under this operational LI; **[VERIFY]** that FCM notification payloads do not embed health content.

**Conclusion on necessity.** The residual operational processing is necessary and proportionate when limited to account/identity, contact, device tokens, and technical signals.

### 3.3 Balancing test

**Impact on data subjects.**
- Operational processing (service email, push delivery, infrastructure logging) is low-intrusion and expected.
- The main risks are: (a) notification content inadvertently revealing health context (FCM "maybe health"), and (b) US cross-border transfers.

**Safeguards.**
- Sub-processors are bound by appropriate transfer mechanisms: Resend (DPF/SCCs), FCM (DPF + SCCs), Vercel (DPF), Supabase (SCCs + TIA + UK IDTA).
- Data minimization; **[VERIFY]** push payloads avoid health content (or move that flow to consent/Art. 9).
- Retention model applies: active while account active; deletion ≤30 days cascading across DB rows + Storage buckets (progress-photos, community-photos, meal-notes, coach-media) + push tokens + wearable tokens + request OpenAI/Resend deletion. Exceptions: Stripe transaction/tax records 7 years (legal obligation); backups expire ≤90 days; support correspondence 2 years.
- Owner-RLS / `is_coach_on_client` access controls; no data sale and no behavioral advertising postures [VERIFY].
- Transparency via privacy notice; right to object (Art. 21); Art. 27 representatives to be appointed.

**Reasonable expectations.** Adult users expect the operator to send service/transactional messages, run hosting infrastructure, and perform routine administration to keep the marketplace working. This is squarely within reasonable expectations and involves no unexpected secondary use.

**Outcome of balance.** The individuals' interests do not override Shape's legitimate interest in operating the service, given the low intrusion, expected nature, minimization, transfer safeguards, and retention controls — provided health-revealing content is kept off this basis and marketing stays on consent.

### 3.4 Conclusion

**Legitimate interests (Art. 6(1)(f)) is an appropriate residual lawful basis for core service operation** that is not already covered by contract, limited to account/identity, contact, device tokens, and technical signals. **Conditions:** (i) where processing is strictly necessary to perform the contract, rely on Art. 6(1)(b) instead; (ii) keep health/special-category data on consent/Art. 9 — [VERIFY] FCM payloads exclude health content; (iii) keep marketing on consent; (iv) maintain retention/deletion discipline and transfer safeguards; (v) honor Art. 21 objections.

---

## 4. Cross-cutting conclusions, conditions and TODOs

**Overall:** Legitimate interests is an appropriate Art. 6(1)(f) basis for (1) security/fraud incl. Turnstile, (2) product improvement/debugging, and (3) core service operation, in each case **only for non-special-category personal data** and subject to the conditions in each section. Health/special-category data remains on **explicit consent (Art. 9)**; contractual processing remains on **Art. 6(1)(b)**; tax/records remain on **legal obligation**; marketing/analytics remain on **consent**.

**Standing safeguards across all three:**
- Right to object (Art. 21) must be available and operable via privacy@theshapecommunity.com.
- Data minimization; reputable sub-processors with documented transfer mechanisms.
- Retention/deletion model enforced (≤30-day cascading deletion; ≤90-day backup expiry; documented exceptions).
- Postures maintained: no data sale; no targeted/cross-context behavioral ads; no ML/AI training on health/fitness data; 18+ only.

**Open TODOs / items to verify (do not finalize without resolving):**
- **[VERIFY]** Shape legal entity name and form.
- **[VERIFY]** Appoint EU and UK Art. 27 representatives.
- **[VERIFY in code]** Security/fraud, debugging, and core-operation pipelines exclude health/special-category fields; any incidental access to production health data during debugging is constrained (owner-RLS), logged, role-limited, and time-bound.
- **[VERIFY]** Split between consent-gated client-side analytics (ePrivacy/PECR) and server-side operational telemetry relied on under LI.
- **[VERIFY]** FCM push notification payloads do not embed health-revealing content (else move to consent/Art. 9).
- **[VERIFY]** Postures true in code: no data sale; no behavioral ads; no AI/ML training on user health/fitness data; 18+ only.
- **[VERIFY]** OpenAI API "no-training" terms for the Nora/Whisper/TTS flows (separate from these LIAs but relevant to the no-training posture).
- **[VERIFY]** Defined retention period for security/operational logs.
- **[VERIFY]** Consider whether some "core operation" items are better placed on Art. 6(1)(b) contract rather than legitimate interests.

*DRAFT — for privacy-counsel review, not legal advice.*
