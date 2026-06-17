# Shape — Nutrition-provider compliance brief (NC1)

**Status:** Engineering controls implemented · **NOT YET ENABLED in production.**
**⚠️ This document is not legal advice.** Turning on hard enforcement
(`NUTRITION_COMPLIANCE_ENFORCE=true`) and going live with paid nutrition services
requires sign-off from **healthcare-regulatory counsel** familiar with dietetics
licensure, scope-of-practice, telehealth, and consumer-health-data law in the
states Shape operates in.

This brief explains *why* the controls exist and *what* they do, so the team and
counsel can review the posture before flipping it on.

---

## 1. The risk we are managing

Shape hosts independent nutrition providers and lets them work with clients
across the country. Two provider populations exist:

- **Registered Dietitians (RD / RDN)** — credentialed by the Commission on
  Dietetic Registration (CDR). In ~all states, providing *individualized* /
  *clinical* nutrition care ("Medical Nutrition Therapy," MNT) is a **licensed
  act** restricted to dietitians (and, where recognized, Certified Nutrition
  Specialists, CNS) **licensed in the client's state**.
- **Nutritionists / health coaches** — *not* a protected, licensed role in most
  states. They may share **general wellness information** but may **not** provide
  individualized medical nutrition therapy, diagnose, or treat.

The core legal exposure: an out-of-state or unlicensed provider delivering what a
regulator would consider individualized/clinical nutrition care = **unlicensed
practice**. Licensure is **per-state and per-client** — a provider licensed in NY
cannot lawfully give MNT to a client physically in TX unless also licensed in TX.

We do **not** rely on the **Dietitian Licensure Compact** to confer cross-state
privileges. It is early; we gate strictly on an actual state license until counsel
advises otherwise.

## 2. The controls (what this PR implements)

All logic lives in the pure module `src/lib/compliance/nutrition.mjs` (node-tested)
and is wired server-side via `src/lib/compliance/server.ts`.

### 2a. Credential capture & verification

- `provider_credentials` — credential type (`rd` | `rdn` | `cns` | `nutritionist`),
  CDR registration id, `verified_rd` + `verified_at` (CDR verification), liability
  insurance (carrier / policy / expiration), and onboarding attestations.
- `provider_licenses` — per-state license rows with expirations.
- `credentialStatus()` flags **expiring (≤60d)** and **expired** licenses/insurance.
- Onboarding captures these (nutritionist application) and the provider manages
  them ongoing at `POST /api/coach/credentials`.

### 2b. Licensure-to-client-state matching (the critical gate)

- `client_compliance.us_state` records the client's state.
- `canServeClient(provider, clientState)` returns **allowed only if** the provider
  holds a **non-expired license in the client's state** AND has **non-expired
  insurance** AND holds a license-eligible credential. Re-checked **on every match
  and every individualized write** — never cached into a pairing.
- Block reasons are explicit: `unlicensed_general_only`, `client_state_unknown`,
  `not_licensed_in_client_state`, `insurance_expired`.

### 2c. Scope gating (general vs. individualized / MNT)

- `actionScope(actionType)`: `meal_plan`, `set_program_detail`,
  `condition_guidance`, `macro_prescription` are **individualized**; everything
  else is **general**.
- `gateAction()`: general always passes; individualized requires `canServeClient`.
- `disclaimerFor()`: licensed individualized care carries professional MNT framing;
  everything else carries **"General wellness information only — not medical or
  individualized nutrition advice, not a diagnosis or treatment…"** No diagnosis or
  treatment language is presented for non-licensed providers.

### 2d. Shared-record consent & data governance

- `client_compliance.cross_discipline_consent` — the client's explicit consent to
  share their record across disciplines (trainer ⇄ nutrition provider).
- Role-based access stays enforced by existing RLS (`is_coach_on_client`,
  `is_discipline_coach_on_client`); a coach may **read** the client's state +
  consent (to match licensure / honor sharing) but never writes it.
- `compliance_events` — an **audit log** of every gate decision, consent change,
  and individualized write (actor, subject, decision, reason). Supports breach-
  notification obligations (e.g. the **FTC Health Breach Notification Rule** and
  applicable state consumer-health-data laws).
- **HIPAA / insurance billing posture is OFF** (`HIPAA_BILLING_ENABLED = false`).
  Shape is cash-pay and likely outside HIPAA; do not enable BAAs / insurance
  billing without counsel + signed BAAs.

### 2e. Marketplace terms hooks

- Onboarding attestations (`REQUIRED_ATTESTATIONS`): **independent contractor**
  (Shape is a marketplace, not the employer; does not direct clinical judgment),
  **maintains licensure**, **maintains malpractice insurance**, **scope understood**.
- These attach to the provider's record at signup and are re-affirmable.

## 3. Enforcement posture (read before flipping the flag)

The licensure block + scope gate are **computed and audited on every action right
now**, but they **HARD-BLOCK only when `NUTRITION_COMPLIANCE_ENFORCE=true`**.

Why gated: before credential/state data is populated for existing providers and
clients, hard enforcement would wrongly block legitimate pairings. The flag lets
us (1) ship the controls, (2) backfill data, (3) review with counsel, then (4)
enable. While off, individualized actions still **attach the disclaimer** and
**log the would-be decision** so we can review real traffic before enforcing.

**Go-live checklist (counsel-gated):**
1. Healthcare-regulatory counsel reviews this posture + the disclaimers.
2. Backfill `provider_credentials` / `provider_licenses` for live providers; CDR-
   verify RDs (`verified_rd`).
3. Collect `client_compliance.us_state` for active clients.
4. Confirm marketplace Terms / provider agreement reflect §2e.
5. Set `NUTRITION_COMPLIANCE_ENFORCE=true`.

## 4. What this does NOT do

- It is **not** legal advice and does not certify compliance.
- It does not verify a license with each state board automatically (CDR
  verification covers the RD credential; state-board license verification is a
  manual/trust-team step today).
- It does not implement HIPAA controls or insurance billing (intentionally off).
- It does not honor the Dietitian Licensure Compact (intentionally — strict
  per-state license only).
