# Coach BYO commission split — client-origin attribution + differential fees

**Date:** 2026-07-21 · **Status:** DRAFT — awaiting owner go before any build
**Motivated by:** `docs/MARKET-RESEARCH-2026-07.md` (the #1 pricing-design risk + the #1 cold-start move)

---

## Why

The market research surfaced one pricing flaw and one growth lever, and they are the same feature:

- **The flaw:** Shape charges a flat 15% commission on every coach subscription. Successful coaches already acquire clients free through organic Instagram; incumbent SaaS (Trainerize/TrueCoach/Everfit) effectively costs them 3–7% of revenue for clients they bring themselves. A coach with 30 existing clients at $200/mo would pay Shape $900/mo for clients Shape did nothing to find — so the coaches most worth having (the ones who arrive with full rosters) have a hard reason to say no.
- **The lever:** coach-imported rosters are the single best marketplace cold-start move available — one coach joining with 30 clients seeds both sides at once (30 new $5/mo members in the feed, logging, earning Score). ClassPass cracked its cold start with exactly this shape of supply pitch: no upfront cost, the platform earns only when it delivers new business.

**The rule this spec implements:** *Shape's 15% applies only to clients Shape delivered. Clients a coach brings pay the coach's price with no Shape commission* (rate = an owner decision, §Owner decisions). Every client is still a $5/mo Shape member either way — BYO clients are new membership revenue even at 0% commission.

## Owner decisions needed before build

1. **The BYO rate.** Options: **0%** (recommended — the unbeatable outreach pitch; Shape still earns the $5/mo membership per imported client), **5%** (covers Stripe's ~2.9%+30¢ with margin), or a **flat monthly platform fee per BYO client**. The research's recommendation is 0% at launch, tightenable later — a launch-phase growth subsidy, not a permanent vow. Marketing copy must reserve the right to change the rate for NEW links (never retroactively on an active subscription).
2. ~~Attribution window~~ **RULED (owner, 2026-07-21): 30 days** (invite/link → first checkout). A member who converts more than 30 days after the last invite/link touch resolves `marketplace`. Re-inviting or re-opening the coach's link refreshes the window (the upsert semantics below), so an active coach relationship never silently lapses — only cold trails do.
3. **The generous-attribution stance** (§Abuse): v1 deliberately does NOT police "coach invites a prospect who actually found them on Shape." Confirm this is acceptable launch posture.

## The origin taxonomy

Every coach↔client monetary link gets exactly one immutable `origin`, stamped at creation:

| `origin` | How the link was created | Commission |
| --- | --- | --- |
| `marketplace` | Member found the coach through Shape (directory, search, Listing, featured, **waitlist/first-dibs**) with no referral in play | **15%** (unchanged) |
| `coach_invite` | The coach sent this member an in-app invite (#1706's `coach_invite` DM) before checkout, inside the window | **BYO rate** |
| `coach_link` | Checkout arrived through the coach's ref-tagged share link (text / email / share sheet / bio) inside the window | **BYO rate** |

Notes:
- **Waitlist invites are `marketplace`.** A member who joined a coach's waiting room found that coach on Shape; the coach's invite-from-waitlist (#1495) is fulfillment of Shape-originated demand, not BYO.
- The **$5/mo platform membership (`platform_subscriptions`) is untouched** — this spec concerns only the coach commission (`subscriptions` + `one_time_purchases`).
- Origin is stamped **once, at checkout-session creation**, and never rewritten. Stripe persists `application_fee_percent` for the life of a subscription, so the rate chosen at creation applies to every renewal automatically — no per-invoice logic.

## Data model

### New table — `coach_referrals`

```sql
create table coach_referrals (
  id uuid primary key default gen_random_uuid(),
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  provider_role text not null check (provider_role in ('trainer','nutritionist')),
  provider_id bigint not null,
  client_id uuid references auth.users(id) on delete cascade,  -- null ONLY on the durable link-token row
  token uuid unique default gen_random_uuid(),                  -- the ?ref= value (link-token row only)
  channel text not null check (channel in ('dm','link')),
  created_at timestamptz not null default now(),
  -- The 30-day clock lives on CLIENT-BOUND rows (client_id set) and runs from the
  -- client's last touch. The coach's durable link-token row (channel='link',
  -- client_id null) carries expires_at NULL — a bio link must never go stale;
  -- only the client-specific window expires.
  expires_at timestamptz default now() + interval '30 days',
  constraint bound_rows_expire check (client_id is null or expires_at is not null),
  consumed_at timestamptz,
  consumed_kind text check (consumed_kind in ('subscription','purchase'))
);
```

- **Writes are RPC-only** (the `shape.cycle_rpc`-style GUC guard is overkill here; plain SECURITY DEFINER validation suffices):
  - `create_coach_referral(p_provider_role, p_provider_id, p_client_id)` — validates `auth.uid()` **owns the provider row** (owner→provider lookup, the #1495/#1706 pattern), `p_client_id <> auth.uid()` (no self-referral), and upserts per (coach, client) so re-inviting refreshes the window instead of stacking rows. Called by the add-client sheet alongside the invite DM.
  - `create_coach_referral_link(p_provider_role, p_provider_id)` — same ownership check; returns the coach's **durable** link `token` (one per provider row, reused, `expires_at` NULL — the share link in a bio/text/email never goes stale; only client windows do).
  - `bind_coach_referral(p_token)` — called by a SIGNED-IN member: validates the token, then upserts a **client-bound** row `(coach, provider, client_id = auth.uid(), channel 'link')` with a fresh 30-day `expires_at`. This is the touch that starts (or refreshes) the clock. Fired on: opening a ref link while signed in, first sign-in/signup with a stored ref, and as a last resort at checkout when `body.ref` arrives unbound.
- RLS: coach SELECTs own rows (`coach_user_id = auth.uid()`); no client access needed; webhook consumes via service role. No UPDATE/DELETE policies — rows expire, they don't mutate (except `consumed_*`, service-role only).
- **Trivially forgeable by design within its own scope:** a coach can only create referrals naming providers they own and clients other than themselves, and a referral only matters if that exact client later subscribes to that exact coach. Spraying referrals at strangers gains nothing (§Abuse).

### New column — `origin` on the money rows

```sql
alter table subscriptions add column origin text
  check (origin in ('marketplace','coach_invite','coach_link')) default 'marketplace';
alter table one_time_purchases add column origin text
  check (origin in ('marketplace','coach_invite','coach_link')) default 'marketplace';
```

Pre-feature rows default `marketplace` — correct, since no referral machinery existed when they were created (and at launch the table is effectively empty; no grandfathering complexity).

### Fee constants — `src/lib/platform-fee.ts`

`PLATFORM_FEE_RATE` (0.15) stays. Add `BYO_FEE_RATE` (owner decision, proposed 0). `feeSplit()` gains a rate parameter (default `PLATFORM_FEE_RATE`) so the one-time path computes correctly; the subscription path sets `application_fee_percent` from the resolved rate. **One module remains the single fee authority** — no rate literals in routes.

## The attribution flow

**Resolution happens at CHECKOUT-SESSION CREATION** (`/api/stripe/checkout-session`), because that is where Stripe's fee is fixed. The webhook only copies the verdict onto the row.

1. The route resolves origin — **only client-bound rows count**:
   a. If `body.ref` is present: validate the token belongs to THIS provider → `bind_coach_referral` semantics (bind/refresh the client-bound row) → proceed to (b). Invalid/cross-provider tokens are ignored silently.
   b. An **unexpired client-bound** `coach_referrals` row matching `(client_id = user.id, provider_role, provider_id)` → its channel decides `coach_invite` vs `coach_link`.
   c. No bound row in window → `marketplace`. (The durable link-token row alone never resolves an origin — a token must bind to a client to count.)
2. The resolved `origin` (+ `referral_id` when present) is stamped into the Stripe session `metadata`, and the fee branches: subscription mode → `application_fee_percent: origin is BYO ? BYO_RATE*100 : 15`; payment mode → `feeSplit(gross, charge, rate)`.
3. **Webhook** (`checkout.session.completed`): copies `metadata.origin` onto the `subscriptions` / `one_time_purchases` upsert and marks the referral `consumed_at`/`consumed_kind` (service role). A missing/invalid origin in metadata falls back to `'marketplace'` — fail toward Shape's fee, never toward a free ride.
4. **Renewals need nothing:** Stripe applies the subscription's stored `application_fee_percent` to every invoice.
5. **Store-credit interplay:** the existing credit cap (`maxCreditCents` = Shape's 15% cut) must use the RESOLVED rate — on a BYO checkout at 0% there is no Shape fee to absorb credit from, so store credit does not apply (the honest rule; document in the credit copy).

### The ref-tagged link, sendable by text or email (owner requirement)

The share link becomes `https://theshapecommunity.com/newdesign/MemberProfile.html?u=<uid>&ref=<token>`.

- **Web side** (`MemberProfile.html` / the profile page shell): on load with `?ref=`, persist `{token, providerRole, providerId, at}` to `localStorage('shape.coachRef')`; every subscribe/book/purchase handler passes the stored token to checkout as `body.ref` when it matches the provider being bought. Expiry honored client-side for hygiene; the SERVER re-validates token + provider + window regardless (client storage is a courtesy, never the authority).
- **Mobile app deep-path:** the #1706 invite DM already writes the referral row with `client_id` at send time, so the app checkout needs no token — resolution (1a) covers it.
- **The share sheet gains explicit send channels** (`BSProAddClientSheet`, replacing the single "↗ Share your listing link" action):
  - **✉ Email it** — `mailto:?subject=<i18n subject>&body=<i18n pitch + link>` (prefilled, coach edits freely in their mail app).
  - **💬 Text it** — `sms:?&body=<i18n pitch + link>` (note the iOS `sms:&body=` vs Android `sms:?body=` quirk — the build handles both; monochrome glyphs per the emoji rule).
  - **↗ Share / copy** — the existing `navigator.share` / clipboard path, now with the ref-tagged URL.
  - Prefill copy (i18n `coach:` keys ×13 at build): short, coach-voiced — "I'm coaching on Shape now — my programs, your logging, and our chat all live in one app. Join me here: {link}".
- **Website parity:** the coach Business page gets the same link block (copy + email + the raw URL for pasting into an Instagram bio) — desktop is where coaches actually send email.

## Surfaces

1. **Add-client sheet** (#1706): the send channels above, plus one honest pitch line: "Clients you bring pay no Shape commission — you keep your full rate." (copy tracks the owner's rate decision).
2. **Coach Business page / roster:** each active client labeled by origin — "You brought" vs "Found you on Shape" — with the per-client fee visible. The label IS the pitch: it shows the coach they only pay when Shape delivers.
3. **War Room / analytics:** the `origin` column makes the health metric queryable — clients + GMV by origin. This is the number that says whether the marketplace generates demand or coasts on imported rosters. v1 = a registered checklist metric (SQL), not a dashboard build.

## Abuse & edge cases

- **Referral spraying:** a coach mass-inviting members to pre-claim BYO on anyone who might subscribe. Bounded by design — a referral pays out only if that client subscribes to that coach, and the "loss" is Shape's commission on someone the coach did actively recruit. v1 posture: accept it (it IS the generous rule), watch the origin mix, tighten to first-touch attribution later if the marketplace share collapses (the data to do so exists: referral timestamps vs listing-view analytics).
- **The steal-a-prospect case:** member finds the coach on Shape, coach says "let me invite you first." Same posture — tolerated at launch, tightenable with first-touch rules; policing it now costs goodwill worth more than the fee.
- **Self-referral:** blocked in the RPC (`p_client_id <> auth.uid()`); a coach's own membership is unrelated to commissions anyway.
- **Cross-provider tokens:** a token only resolves for the provider row it names — coach A's link can never discount coach B's subscription (and a mismatched `body.ref` silently resolves `marketplace`).
- **Resubscribe after cancel:** origin re-resolves at the new checkout. An unexpired referral applies again; an expired one doesn't. Correct on both sides.
- **Invite to an already-subscribed client:** the referral row sits unconsumed; the active subscription's rate never changes (origin is immutable post-creation).
- **The anonymous-open residual:** an anonymous visitor who opens a ref link has no server-side touch record until they sign in (the bind fires at first auth with the stored ref). If they sign up 40+ days after the open, the client-side 30-day courtesy expiry drops the stored ref, so the honest path self-enforces — but a tampered client could hold the token past 30 days and bind late (the durable token itself never expires). Accepted residual: it converges to the generous-attribution stance, the cost is one BYO-rated subscription the coach's link genuinely produced, and the bind timestamp makes it measurable if it ever needs tightening.
- **Token hygiene:** UUIDs (unguessable), no PII in the URL, server-side validation only.

## What this does NOT change

- The $5/mo member fee and `platform_subscriptions` — untouched.
- `is_coach_on_client` and every RLS gate built on it — the coach↔client link is origin-blind; only the FEE differs.
- The waitlist (#1495), Listing (#1634), and checkout security posture (server-authoritative pricing, #1337) — the origin lookup adds a read, never trusts a client-supplied price or rate.
- Existing subscriptions — no retroactive rate changes, ever.

## Build plan (after owner go)

- **PR A — rails:** migration (`coach_referrals` + RPCs + `origin` columns; ⚠ OWNER-run, raw link per convention) · `platform-fee.ts` rate parameter · checkout-session origin resolution + fee branch · webhook origin stamp + referral consume. Post-migration validation: RPC ownership denial (coach can't referral another coach's provider row; no self-referral), token cross-provider denial, and a live probe that a BYO-resolved session carries the BYO `application_fee_percent`.
- **PR B — surfaces:** add-client sheet send channels (email / text / share, ref-tagged link, pitch line, i18n ×13) · web `?ref=` capture + checkout passthrough · coach Business page link block + origin labels · War Room registration.
- Tests: origin-resolution unit vectors (referral match / valid token / expired / cross-provider / none) in a pure module both the route and tests import (the one-implementation pattern); fee-split rate vectors.

## Acceptance criteria

1. A member who checks out from a coach's ref link (opened from a text or an email) creates a subscription with `origin='coach_link'` and the BYO `application_fee_percent`; renewals keep it with zero additional logic.
2. A member invited via the #1706 DM who subscribes inside the window → `origin='coach_invite'`, BYO rate — with no token anywhere in the flow.
3. A member who finds the coach through the marketplace with no referral → `origin='marketplace'`, 15%, byte-identical to today's flow.
4. A waitlist first-dibs conversion → `origin='marketplace'`.
5. Coach A's token can never alter the fee on coach B's checkout; an expired referral resolves `marketplace`; a malformed `body.ref` resolves `marketplace`.
6. The coach can send their link via the email and text actions with prefilled localized copy on a real device.
7. Store credit does not apply on a 0%-fee BYO checkout, and the UI says why.
