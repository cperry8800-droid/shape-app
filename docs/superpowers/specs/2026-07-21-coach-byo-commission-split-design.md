# Coach BYO commission split — client-origin attribution + differential fees

**Date:** 2026-07-21 · **Status:** DRAFT — awaiting owner go before any build
**Motivated by:** `docs/MARKET-RESEARCH-2026-07.md` (the #1 pricing-design risk + the #1 cold-start move)

---

## Why

The market research surfaced one pricing flaw and one growth lever, and they are the same feature:

- **The flaw:** Shape charges a flat 15% commission on every coach subscription. Successful coaches already acquire clients free through organic Instagram; incumbent SaaS (Trainerize/TrueCoach/Everfit) effectively costs them 3–7% of revenue for clients they bring themselves. A coach with 30 existing clients at $200/mo would pay Shape $900/mo for clients Shape did nothing to find — so the coaches most worth having (the ones who arrive with full rosters) have a hard reason to say no.
- **The lever:** coach-imported rosters are the single best marketplace cold-start move available — one coach joining with 30 clients seeds both sides at once (30 new $5/mo members in the feed, logging, earning Score). ClassPass cracked its cold start with exactly this shape of supply pitch: no upfront cost, the platform earns only when it delivers new business.

**The rule this spec implements (owner-ruled 2026-07-21):** *Shape's 15% applies only to clients Shape delivered. Clients a coach brings pay the coach's price with **0% Shape commission**.* **Every client is still a $5/mo Shape member either way** — the membership stays universal (owner-confirmed), so BYO clients are new membership revenue even at 0% commission.

## Owner decisions needed before build

1. ~~The BYO rate~~ **RULED (owner, 2026-07-21): 0% commission on coach-brought clients — and the $5/mo Shape membership STAYS for every member, BYO included** (owner-confirmed explicitly). So a BYO client = $0 commission to Shape + a full $5/mo membership; a marketplace client = 15% commission + the $5/mo membership. Note: at 0%, Shape absorbs Stripe's processing cost (~2.9%+30¢) on BYO coach charges — a deliberate launch-phase growth subsidy funded by the membership revenue. Marketing copy reserves the right to change the rate for NEW links (never retroactively on an active subscription).
2. ~~Attribution window~~ **RULED (owner, 2026-07-21): 30 days** (invite/link → first checkout). A member who converts more than 30 days after the last invite/link touch resolves `marketplace`. Re-inviting or re-opening the coach's link refreshes the window (the upsert semantics below), so an active coach relationship never silently lapses — only cold trails do.
3. **The generous-attribution stance** (§Abuse): v1 deliberately does NOT police "coach invites a prospect who actually found them on Shape." Confirm this is acceptable launch posture.
4. **Window edge — touch-based semantics** (§Abuse): a client who FIRST presents the coach's link late (>30 days after receiving it) starts their window at that touch — consistent with the ruled "re-opening refreshes"; a DM invite older than 30 days with no re-touch expires to `marketplace`. Confirm alongside #3.

## The origin taxonomy

Every coach↔client monetary link gets exactly one immutable `origin`, stamped at creation:

| `origin` | How the link was created | Commission |
| --- | --- | --- |
| `marketplace` | Member found the coach through Shape (directory, search, Listing, featured, **waitlist/first-dibs**) with no referral in play | **15%** (unchanged) |
| `coach_invite` | The coach sent this member an in-app invite (#1706's `coach_invite` DM) before checkout, inside the window | **0% (owner-ruled)** |
| `coach_link` | Checkout arrived through the coach's ref-tagged share link (text / email / share sheet / bio) inside the window | **0% (owner-ruled)** |

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
  token uuid unique,             -- the ?ref= value — set ONLY on the durable link-token row
  channel text not null check (channel in ('dm','link')),
  created_at timestamptz not null default now(),
  -- NO column defaults on token/expires_at (review round): defaults let a
  -- client-bound row receive a bindable share token and the durable row
  -- silently expire. The two row shapes are ENFORCED — the RPCs set every
  -- field explicitly. Durable link row = token, never expires; client-bound
  -- row = no token, carries the 30-day clock from the client's last touch.
  expires_at timestamptz,
  constraint referral_row_shape check (
    (client_id is null     and token is not null and expires_at is null and channel = 'link') or
    (client_id is not null and token is null     and expires_at is not null)
  ),
  consumed_at timestamptz,
  consumed_kind text check (consumed_kind in ('subscription','purchase')),
  -- Consumption is all-or-nothing and only ever on a CLIENT-BOUND row (review
  -- round): both fields move together, and a durable link-token row can never
  -- be marked consumed.
  constraint consumption_consistent check (
    (consumed_at is null and consumed_kind is null)
    or (consumed_at is not null and consumed_kind is not null and client_id is not null)
  )
);

-- Upsert conflict targets (review round: the RPC upserts below need real
-- unique constraints or they fail / race into stacked ambiguous rows):
-- ONE durable link-token row per provider…
create unique index coach_referrals_link_token_uq
  on coach_referrals (provider_role, provider_id) where client_id is null;
-- …and ONE client-bound row per coach↔client pair — the LAST touch wins:
-- both RPCs upsert this same row, atomically refreshing channel + expires_at.
create unique index coach_referrals_bound_uq
  on coach_referrals (coach_user_id, provider_role, provider_id, client_id)
  where client_id is not null;
```

- **Writes are RPC-only**, with the house DEFINER hardening on every function (review round — ownership checks alone don't close the privilege boundary): `set search_path = public, pg_temp`, `revoke execute … from public, anon`, `grant execute … to authenticated` (the #1459 grant lesson). The `shape.cycle_rpc`-style GUC guard is overkill here; validated DEFINER bodies suffice:
  - `create_coach_referral(p_provider_role, p_provider_id, p_client_id)` — validates `auth.uid()` **owns the provider row** (owner→provider lookup, the #1495/#1706 pattern), `p_client_id <> auth.uid()` (no self-referral), and upserts the client-bound row — `ON CONFLICT (coach_user_id, provider_role, provider_id, client_id) WHERE client_id IS NOT NULL DO UPDATE` (review round: Postgres targets a PARTIAL unique index by column list + predicate inference, never `ON CONSTRAINT <name>`) — setting channel 'dm', token NULL, fresh 30-day expiry so re-inviting refreshes the window instead of stacking rows. Called by the add-client sheet alongside the invite DM.
  - `create_coach_referral_link(p_provider_role, p_provider_id)` — same ownership check; returns the coach's **durable** link `token` (one per provider row, reused, `expires_at` NULL — the share link in a bio/text/email never goes stale; only client windows do).
  - `bind_coach_referral(p_token)` — called by a SIGNED-IN member: validates the token, then upserts the same **client-bound** row (identical column-list + predicate conflict target) as `(coach, provider, client_id = auth.uid(), channel 'link', token NULL)` with a fresh 30-day `expires_at`. This is the touch that starts (or refreshes) the clock. Fired on: opening a ref link while signed in, first sign-in/signup with a stored ref, and as a last resort at checkout when `body.ref` arrives unbound.
- RLS: coach SELECTs own rows (`coach_user_id = auth.uid()`); no client access needed; webhook consumes via service role. No UPDATE/DELETE policies — rows expire, they don't mutate (except `consumed_*`, service-role only).
- **Trivially forgeable by design within its own scope:** a coach can only create referrals naming providers they own and clients other than themselves, and a referral only matters if that exact client later subscribes to that exact coach. Spraying referrals at strangers gains nothing (§Abuse).

### New column — `origin` on the money rows

```sql
alter table subscriptions add column origin text not null
  check (origin in ('marketplace','coach_invite','coach_link')) default 'marketplace';
alter table one_time_purchases add column origin text not null
  check (origin in ('marketplace','coach_invite','coach_link')) default 'marketplace';
-- The RESOLVED fee, in basis points (1500 = 15%), stamped at checkout. Origin
-- says WHY; fee_bps says WHAT. (Review round: the BYO rate may change for NEW
-- links, so origin alone can't reconstruct what an older row actually pays —
-- roster labels, analytics, refunds, and support read the stored rate, never
-- re-derive it from origin + the current constant.)
alter table subscriptions add column fee_bps integer not null
  check (fee_bps between 0 and 10000) default 1500;
alter table one_time_purchases add column fee_bps integer not null
  check (fee_bps between 0 and 10000) default 1500;
-- Write-once (review round): "immutable" must be enforced, not declared. The
-- webhook's ON CONFLICT DO UPDATE list EXCLUDES origin + fee_bps, so a
-- replayed/late Stripe delivery can never rewrite historical attribution or
-- rates; a belt-and-braces BEFORE UPDATE trigger preserves OLD.origin/
-- OLD.fee_bps on any other writer.
```

Pre-feature rows default `marketplace` / `1500` — correct, since no referral machinery existed when they were created and every pre-feature row charged 15% (and at launch the tables are effectively empty; no grandfathering complexity).

### Fee constants — `src/lib/platform-fee.ts`

`PLATFORM_FEE_RATE` (0.15) stays. Add `BYO_FEE_RATE = 0` (owner-ruled 2026-07-21). **EVERY helper in the module goes rate-aware, not just `feeSplit()`** (review round): `feeSplit()`, `maxCreditCents()`, and `coachCutCents()` all take the resolved rate (default `PLATFORM_FEE_RATE`) — otherwise a BYO checkout would still apply the 15% store-credit cap while charging a 0% fee. At rate 0 the credit cap computes to 0, which IS the no-credit rule falling out of the math. The subscription path sets `application_fee_percent` from the resolved rate. **One module remains the single fee authority** — no rate literals in routes.

## The attribution flow

**Resolution happens at CHECKOUT-SESSION CREATION, in ONE shared server resolver consumed by EVERY Stripe-session-creation site** — because that is where Stripe's fee is fixed, and the sites are plural (review round, Codex P1): `/api/stripe/checkout-session` (app + newdesign) AND the live server-action checkouts `src/app/subscribe/actions.ts` + `src/app/purchase/actions.ts` (still reached from `publicProfile.jsx` / `trainer-profile.html`), which today hardcode 15%. A new `resolveCoachCheckoutOrigin(clientId, providerRole, providerId, ref?)` in `src/lib/` returns `{ origin, feeBps, referralId }`; all three sites call it and feed the rate-aware fee helpers. **Build gate:** grep-audit every `stripe.checkout.sessions.create` with an application fee — each must consume the resolver, or a BYO/ref-link client checking out through a legacy page is silently recorded and charged as marketplace. The webhook only copies the verdict onto the row.

1. The route resolves origin — **waitlist first, then only client-bound rows count**:
   a. **Waitlist wins, before any referral lookup** (review round — the taxonomy declared it but the order must enforce it): if a `coach_waitlist` row exists for `(client, this provider)` in status `waiting` or `invited` (the same machinery checkout already queries for the at-capacity gate, #1495/#1498), origin is **`marketplace` — full stop**. The member demonstrably found this coach on Shape; a later invite/link touch cannot re-class Shape-originated demand as BYO. Residual: a genuine BYO client who independently joined the coach's waiting room resolves `marketplace` — rare, revenue-protective, consistent with fail-toward-15%.
   b. If `body.ref` is present: validate the token belongs to THIS provider → `bind_coach_referral` semantics (bind/refresh the client-bound row) → proceed to (c). Invalid/cross-provider tokens are ignored silently.
   c. An **unexpired client-bound** `coach_referrals` row matching `(client_id = user.id, provider_role, provider_id)` → its channel decides `coach_invite` vs `coach_link`.
   d. No bound row in window → `marketplace`. (The durable link-token row alone never resolves an origin — a token must bind to a client to count.)
2. **The resolver's `feeBps` is THE single fee value** (review round — nothing downstream re-derives from `origin`, or a rate change could charge one rate and persist another): subscription mode → `application_fee_percent: feeBps / 100`; payment mode → `feeSplit(gross, charge, feeBps / 10_000)`; and the SAME `feeBps` (+ `origin` + `referral_id`) is stamped into the session `metadata` for the webhook to persist. The bps→percent and bps→rate conversions are defined ONCE in the fee module.
3. **Webhook** (`checkout.session.completed`), in this ORDER (review round — Stripe retries deliveries): (a) upsert the `subscriptions` / `one_time_purchases` row with `metadata.origin` + `metadata.fee_bps` and **check the database error**; (b) only on a confirmed write, mark the referral `consumed_at`/`consumed_kind` — conditionally (`where consumed_at is null`), so a retry is a no-op and a failed row-write never burns the referral without recording the purchase. The row upsert is idempotent on the Stripe id; the ON CONFLICT UPDATE list excludes `origin`/`fee_bps` (write-once). Missing/invalid metadata falls back to `'marketplace'` / `1500` — fail toward Shape's fee, never toward a free ride.
4. **Renewals need nothing:** Stripe applies the subscription's stored `application_fee_percent` to every invoice.
5. **Store-credit interplay:** the existing credit cap (`maxCreditCents` = Shape's 15% cut) must use the RESOLVED rate — on a BYO checkout at 0% there is no Shape fee to absorb credit from, so store credit does not apply (the honest rule; document in the credit copy).

### The ref-tagged link, sendable by text or email (owner requirement)

The share link becomes `https://theshapecommunity.com/newdesign/MemberProfile.html?u=<uid>&ref=<token>`.

- **Web side** (`MemberProfile.html` / the profile page shell): on load with `?ref=`, persist `{token, providerRole, providerId, at}` to `localStorage('shape.coachRef')` — and when the visitor is SIGNED IN, **call `bind_coach_referral(token)` right there** (review round: the touch semantics define signed-in link-opening as a touch, so the page must actually fire the bind, not just store); fire it again after a sign-in/signup completes with a stored ref. Every subscribe/book/purchase handler still passes the stored token to checkout as `body.ref` — the checkout-time bind stays as the LAST-RESORT fallback, not the primary path. Expiry honored client-side for hygiene; the SERVER re-validates token + provider + window regardless (client storage is a courtesy, never the authority).
- **Mobile app deep-path:** the #1706 invite DM already writes the referral row with `client_id` at send time, so the app checkout needs no token — resolution (1a) covers it.
- **The share sheet gains explicit send channels** (`BSProAddClientSheet`, replacing the single "↗ Share your listing link" action):
  - **✉ Email it** — `mailto:?subject=<i18n subject>&body=<i18n pitch + link>` (prefilled, coach edits freely in their mail app).
  - **✆ Text it** — `sms:?&body=<i18n pitch + link>` (note the iOS `sms:&body=` vs Android `sms:?body=` quirk — the build handles both). Glyph rule (review round): **monochrome typographic glyphs only** (✉ / ✆ text-presentation, or plain labels) — never colored emoji, per the AGENTS.md new-additions rule; if a glyph renders emoji-styled on device, drop to the bare text label.
  - **↗ Share / copy** — the existing `navigator.share` / clipboard path, now with the ref-tagged URL.
  - **URI encoding (review round):** every interpolation — localized subject, localized body, and the ref-tagged URL — is `encodeURIComponent`-encoded before entering the `mailto:`/`sms:` URI; raw `&`, `?`, `#`, spaces, or non-ASCII copy would otherwise truncate or corrupt the prefill (i18n bodies are non-ASCII in most locales).
  - Prefill copy (i18n `coach:` keys ×13 at build): short, coach-voiced — "I'm coaching on Shape now — my programs, your logging, and our chat all live in one app. Join me here: {link}".
- **Website parity:** the coach Business page gets the same link block (copy + email + the raw URL for pasting into an Instagram bio) — desktop is where coaches actually send email.

## Surfaces

1. **Add-client sheet** (#1706): the send channels above, plus one honest pitch line: "Clients you bring pay no Shape commission — you keep your full rate. They join Shape as members at $5/mo." — with the honest qualifier (review round): *members already in your Shape waiting room count as Shape-found*, so the UI never promises 0% where checkout will apply 15%.
2. **Coach Business page / roster:** each active client labeled by origin — "You brought" vs "Found you on Shape" — with the per-client fee read from the STORED `fee_bps` (never re-derived from origin + the current constant). The label IS the pitch: it shows the coach they only pay when Shape delivers.
3. **War Room / analytics:** the `origin` column makes the health metric queryable — clients + GMV by origin. This is the number that says whether the marketplace generates demand or coasts on imported rosters. v1 = a registered checklist metric (SQL), not a dashboard build.

## Abuse & edge cases

- **Referral spraying:** a coach mass-inviting members to pre-claim BYO on anyone who might subscribe. Bounded by design — a referral pays out only if that client subscribes to that coach, and the "loss" is Shape's commission on someone the coach did actively recruit. v1 posture: accept it (it IS the generous rule), watch the origin mix, tighten to first-touch attribution later if the marketplace share collapses (the data to do so exists: referral timestamps vs listing-view analytics).
- **The steal-a-prospect case:** member finds the coach on Shape, coach says "let me invite you first." Same posture — tolerated at launch, tightenable with first-touch rules; policing it now costs goodwill worth more than the fee.
- **Self-referral:** blocked in the RPC (`p_client_id <> auth.uid()`); a coach's own membership is unrelated to commissions anyway.
- **Cross-provider tokens:** a token only resolves for the provider row it names — coach A's link can never discount coach B's subscription (and a mismatched `body.ref` silently resolves `marketplace`).
- **Resubscribe after cancel:** origin re-resolves at the new checkout. An unexpired referral applies again; an expired one doesn't. Correct on both sides.
- **Invite to an already-subscribed client:** the referral row sits unconsumed; the active subscription's rate never changes (origin is immutable post-creation).
- **Window semantics, made precise (review round — no unstated exceptions to the 30-day ruling):** the window is **touch-based**. ANY client presentation of the coach's durable link or invite (link open while signed in, first sign-in with a stored ref, bind-at-checkout) is a touch that starts or refreshes the client-bound row's 30-day clock; checkout requires an unexpired bound row. This is the same semantic as the ruling's own "re-opening the link refreshes the window" — a late first-bind is indistinguishable in substance from a legitimate re-open of the same link, so no anonymous-visitor tracking infrastructure is needed. What the window genuinely gates is **commitment recency**: BYO applies only when the client acted on the coach's link/invite within 30 days of buying; arriving via the marketplace without presenting the ref resolves `marketplace` regardless of any old stored token. The client-side stored-ref expiry stays as hygiene, not enforcement. ⚠ Listed in §Owner decisions for explicit confirm (it pins the ruling's edge case).
- **Token hygiene:** UUIDs (unguessable), no PII in the URL, server-side validation only.

## What this does NOT change

- The $5/mo member fee and `platform_subscriptions` — untouched.
- `is_coach_on_client` and every RLS gate built on it — the coach↔client link is origin-blind; only the FEE differs.
- The waitlist (#1495), Listing (#1634), and checkout security posture (server-authoritative pricing, #1337) — the origin lookup performs a read PLUS a controlled bind upsert (`bind_coach_referral`, only when a valid token is presented) — and never trusts a client-supplied price or rate.
- Existing subscriptions — no retroactive rate changes, ever.

## Build plan (after owner go)

- **PR A — rails:** migration (`coach_referrals` + RPCs + `origin` columns; ⚠ OWNER-run, raw link per convention) · `platform-fee.ts` rate parameter · the shared `resolveCoachCheckoutOrigin` resolver wired into ALL THREE session-creation sites (checkout-session route + subscribe/purchase server actions) + the rate-aware fee branch · webhook origin stamp + referral consume. Post-migration validation: RPC ownership denial (coach can't referral another coach's provider row; no self-referral), token cross-provider denial, and a live probe that a BYO-resolved session carries the BYO `application_fee_percent`.
- **PR B — surfaces:** add-client sheet send channels (email / text / share, ref-tagged link, pitch line, i18n ×13) · web `?ref=` capture + checkout passthrough · coach Business page link block + origin labels · War Room registration.
- Tests: origin-resolution unit vectors (referral match / valid token / expired / cross-provider / none) in a pure module both the route and tests import (the one-implementation pattern); fee-split rate vectors.

## Acceptance criteria

1. A member who checks out from a coach's ref link (opened from a text or an email) creates a subscription with `origin='coach_link'` and **`fee_bps=0`**; renewals keep the 0% `application_fee_percent` with zero additional logic.
2. A member invited via the #1706 DM who subscribes inside the window → `origin='coach_invite'`, `fee_bps=0` — with no token anywhere in the flow.
3. A member who finds the coach through the marketplace with no referral → `origin='marketplace'`, `fee_bps=1500`, byte-identical to today's flow.
4. A waitlist first-dibs conversion → `origin='marketplace'`, `fee_bps=1500` — **even when an unexpired referral exists for the same coach↔client pair** (waitlist precedence beats referrals).
5. Coach A's token can never alter the fee on coach B's checkout; an expired referral resolves `marketplace`; a malformed `body.ref` resolves `marketplace`.
6. Re-sending an invite (or re-opening the link) UPDATES the one client-bound row (fresh expiry, latest channel) — a second row is impossible by constraint (`coach_referrals_bound_uq`).
7. The coach can send their link via the email and text actions with prefilled localized copy on a real device; every new label glyph is monochrome.
8. Store credit does not apply on a 0%-fee BYO checkout, and the UI says why.
9. The Business page's per-client fee reads the stored `fee_bps`; changing `BYO_FEE_RATE` for new links alters no existing row's display or billing.
10. A BYO checkout through the LEGACY paths (`/subscribe`, `/purchase` server actions) resolves origin + 0% identically to the API route — no session-creation site bypasses the resolver.
11. A replayed `checkout.session.completed` delivery is a no-op: the row upsert is idempotent, `origin`/`fee_bps` are write-once, and the referral consume is conditional — and a failed row-write never consumes the referral.
12. Store credit on a BYO checkout caps at 0 BY THE MATH (`maxCreditCents(gross, rate 0) = 0`), not by a UI-only rule.
13. Window semantics: a DM invite older than 30 days with no re-touch resolves `marketplace`; presenting the durable link at checkout is a fresh touch and resolves BYO (bind timestamps make the pattern auditable); Stripe is always billed from the same `feeBps` the row persists — the two can never diverge.
