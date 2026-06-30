**DRAFT — prepared for Shape's privacy counsel to review and finalize. Not legal advice.**

> Entity: [Shape — legal entity to be confirmed by counsel]. Operated from Brooklyn, NY, USA. Website: theshapecommunity.com.
> General contact: info@theshapecommunity.com. Privacy / rights requests: privacy@theshapecommunity.com.
> This document contains two sections: (A) Accessibility Statement and (B) PCI-DSS v4.0.1 SAQ A notes. Both are drafts for privacy-counsel review and are not legal advice.

---

# Section A — Accessibility Statement

## A.1 Our commitment

Shape is committed to making its consumer fitness and coaching marketplace — including our website (theshapecommunity.com) and our iOS app — accessible to the widest possible audience, including people with disabilities. We want every member, independent trainer, and nutritionist who uses Shape to be able to perceive, understand, navigate, and interact with our digital experiences.

We treat accessibility as an ongoing effort rather than a one-time project, and we work to improve the usability and accessibility of Shape on a continuing basis.

## A.2 Conformance target

Shape aims to conform to the **Web Content Accessibility Guidelines (WCAG) 2.1, Level AA**, as our technical accessibility standard across our web and mobile experiences.

This conformance target is intended to support our obligations under:

- The **Americans with Disabilities Act (ADA), Title III**, and
- The **European Accessibility Act (EAA)**, which is in force as of **28 June 2025**.

> **[VERIFY]** Confirm with counsel the precise scope of Shape's obligations under the EU Accessibility Act (in force 28 June 2025) given Shape's EU footprint, and whether any member-state implementing measures, exemptions, or microenterprise thresholds apply. EU and UK Article 27 representatives are **to be appointed** — coordinate accessibility-statement contact details with those appointments once made.

> **[VERIFY]** Confirm whether WCAG 2.1 AA remains the appropriate conformance target, or whether a later WCAG version should be adopted, before this statement is published.

## A.3 Measures we take

To support our conformance target, Shape works to:

- Apply WCAG 2.1 AA as the accessibility standard for new and updated features across web and the iOS app.
- Test accessibility as part of our design and development process.
- Treat accessibility defects as issues to be triaged and remediated on an ongoing basis (see the internal remediation checklist in A.6).

> **[VERIFY]** Describe the specific testing methods Shape actually uses (e.g., automated scans, manual keyboard/screen-reader testing, assistive-technology testing on iOS). Draft strictly from real practice — do not assert methods that are not in place.

## A.4 Known limitations

Despite our efforts, some content or functionality may not yet be fully accessible. We disclose known limitations here so that affected users know what to expect and how to get help.

> **[PLACEHOLDER — to be completed before publication]** List each known accessibility limitation, the area of the product affected (web and/or iOS), the reason or status, and any available workaround or target remediation timeframe. Do not publish this statement with an empty or generic limitations section; populate it from the results of the internal remediation checklist in A.6.

## A.5 Feedback and contact

We welcome feedback on the accessibility of Shape. If you encounter an accessibility barrier, or need information or functionality provided in a different accessible format, please contact us:

- **Accessibility / general feedback:** info@theshapecommunity.com
- **Privacy and rights requests:** privacy@theshapecommunity.com

When you contact us, please describe the barrier you encountered, the page or screen (web or iOS app) where it occurred, and the assistive technology you were using (if any), so that we can respond effectively.

> **[VERIFY]** Confirm the target response time Shape will commit to for accessibility feedback (e.g., a stated number of business days) before publishing, and confirm which mailbox (info@ vs privacy@) owns intake and triage of accessibility complaints.

## A.6 Internal remediation checklist (not for public publication)

This checklist is an internal working tool to drive A.4 (Known limitations) and ongoing conformance. It should not be published as part of the public accessibility statement.

- [ ] **Inventory surfaces in scope** — enumerate all in-scope web pages/flows and iOS app screens (marketplace browse, coach profiles, sign-up/18+ gate, payment/checkout, coaching/messaging, health-screening and logging flows, community).
- [ ] **Run automated accessibility scans** on each in-scope surface and record results.
- [ ] **Manual keyboard navigation testing** — confirm all interactive elements are reachable and operable without a pointer, with visible focus.
- [ ] **Screen-reader / assistive-technology testing** — web (with a major screen reader) and iOS (VoiceOver), including audio/voice features (e.g., meal-note audio, Nora voice).
- [ ] **Color contrast and text resize** — verify against WCAG 2.1 AA contrast and reflow/resize criteria.
- [ ] **Forms and error handling** — labels, instructions, and accessible error messages on all input flows (account, health profile/PAR-Q, check-ins, payment).
- [ ] **Media alternatives** — captions/transcripts/text alternatives for non-text and audio content where applicable.
- [ ] **Third-party / embedded components** — assess accessibility of embedded payment fields and any third-party widgets (see Section B re: Stripe-hosted fields).
- [ ] **Log each defect** with: surface, WCAG criterion, severity, owner, and target remediation date.
- [ ] **Populate the public "Known limitations" section (A.4)** from open defects, with workarounds where available.
- [ ] **Re-test after remediation** and update the statement.
- [ ] **Set a recurring review cadence** for the statement and the underlying testing.

> **[VERIFY]** Set the review cadence (e.g., quarterly/annually) and assign internal owners for each checklist item.

---

# Section B — PCI-DSS v4.0.1 SAQ A Notes

> These notes summarize why Shape believes it is SAQ A eligible and what it must attest. They are a working draft for counsel and Shape's payment/compliance owners; they are not a completed Self-Assessment Questionnaire and are not legal advice.

## B.1 Why Shape is SAQ A eligible

Shape uses **Stripe-hosted payment fields** to collect cardholder data. Card details are entered into Stripe-hosted fields rather than into Shape's own systems, and Shape stores only Stripe commerce metadata (card **last4**, **brand**, **status**) — **no full card numbers**. On this basis, Shape considers itself **SAQ A eligible**.

> **[VERIFY]** Confirm SAQ A eligibility against the current SAQ A eligibility criteria with counsel / Shape's acquirer or QSA, including confirmation that all cardholder-data functions are fully outsourced to Stripe and that Shape's web and iOS payment integrations do not bring Shape into a higher SAQ category.

## B.2 SAQ A scope

For SAQ A, the scope centers on the merchant's role as one that **fully outsources** all cardholder-data handling to a PCI-compliant third party (here, Stripe), while retaining responsibility for the small set of controls that remain with the merchant. In scope for Shape's self-assessment:

- The merchant **website/checkout and iOS payment flow** that present or redirect to the Stripe-hosted fields.
- The **stored payment metadata** Shape holds (last4, brand, status) and confirmation that **no full card numbers / sensitive authentication data** are stored, processed, or transmitted by Shape.
- Shape's **relationship with and reliance on Stripe** as the third-party service provider, including monitoring of Stripe's PCI compliance status.
- The **scripts loaded on the checkout / payment pages** (see B.3).
- The applicable **SAQ A administrative and policy controls** (e.g., service-provider management, applicable security policies and awareness, and confirmation of outsourced status).

> **[VERIFY]** Use the official PCI SSC SAQ A v4.0.1 document to enumerate the exact in-scope requirements and confirm which controls apply to Shape; the list above is a summary, not the authoritative requirement set.

## B.3 Mandatory v4.0.1 checkout script-integrity controls

PCI-DSS v4.0.1 introduced checkout **payment-page script** controls that became **mandatory as of 31 March 2025**. These now apply within SAQ A scope and are the key new obligations for a Stripe-hosted-fields merchant like Shape:

- **Requirement 6.4.3 — Manage and authorize payment-page scripts.** Maintain an inventory of all scripts loaded and executed on the payment/checkout page(s), confirm each script is **authorized**, ensure the **integrity** of each script, and justify why each is necessary.
- **Requirement 11.6.1 — Detect changes to the payment page.** Deploy a **change- and tamper-detection mechanism** that alerts on unauthorized modifications to the HTTP headers and the content of the payment page(s) as received by the consumer browser, with the mechanism evaluated on a defined frequency.

> **[VERIFY]** Confirm how Shape satisfies 6.4.3 and 11.6.1 in practice for both web and the iOS payment flow, including how the script inventory is maintained, how script integrity/authorization is evidenced, what tamper-detection mechanism is used, and the evaluation frequency. Confirm the division of responsibility between Shape and Stripe for these controls (responsibility may be shared depending on integration type) and document Stripe's stated coverage.

## B.4 What Shape must attest

To complete SAQ A v4.0.1, Shape (through an authorized officer) must attest, among the SAQ A requirements, that:

- All **cardholder-data functions are outsourced** to a PCI-DSS-compliant third party (Stripe), and Shape does **not** electronically store, process, or transmit full card numbers or sensitive authentication data on its own systems.
- Shape stores only the permitted **commerce metadata** (last4, brand, status).
- Shape **manages and monitors its third-party service provider (Stripe)**, including tracking Stripe's PCI compliance status.
- Shape meets the **payment-page script-integrity controls (6.4.3 and 11.6.1)** that are mandatory as of 31 March 2025.
- Shape has the applicable **policies, awareness, and administrative controls** required by SAQ A in place.
- The **Attestation of Compliance (AOC)** is completed, signed by an authorized Shape representative, and submitted as required.

> **[VERIFY]** Confirm with counsel / Shape's acquirer the exact attestation language, the responsible signing officer for [Shape — legal entity to be confirmed by counsel], the required submission cadence (e.g., annual), and whether a quarterly external vulnerability scan or any additional validation is required for Shape's specific SAQ A profile.

---

### Cross-references and open items

- **Legal entity** for both the accessibility statement and the PCI attestation: **[Shape — legal entity to be confirmed by counsel].**
- **EU / UK Article 27 representatives:** to be appointed; align accessibility-statement and any EU-facing contact details once appointments are confirmed.
- All items marked **[VERIFY]** and the **[PLACEHOLDER]** in A.4 must be resolved before either section is published or submitted.
