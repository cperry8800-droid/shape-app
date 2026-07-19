# The Cycle — menstrual-cycle awareness (tracking · phase engine · consented coach view)

**Date:** 2026-07-19 · **Status:** approved by owner (design round, this doc is the record)
**Surfaces:** mobile broadsheet + website (parity per house rule) · **Migration:** one (owner runs it)

## Why

The 2026-06-12 coach-metrics research pass registered this as a standing differentiator:
wearables carry cycle data, and **no coaching platform surfaces it** — not Trainerize,
Everfit, TrueCoach, or MyPTHub. Shape holds training + nutrition + recovery + habits in
one place, so it can do what a period app cannot: read a member's cycle **against** her
real training and recovery data, and adapt what the engine says.

**Engineering honesty that shaped v1:** the "wearables expose it" claim does not survive
contact with the APIs. Oura shows Cycle Insights in its own app but does not cleanly
expose phase via the public v2 API (our sync pulls sleep/readiness/activity only). Apple
Health has menstrual-flow data but is native-build-gated. Garmin has a Women's Health
API but our access request is still blocked. **Therefore v1's anchor is the member
logging period starts herself** — one tap on a calendar — with wearable import registered
as v2 riding the same rails.

## Owner decisions (2026-07-19, binding)

1. **Member + engine + consented coach view.** The engine adapts (directive copy +
   statistical reads) AND a linked coach can see cycle timing — but only behind the
   member's own share toggle. *(The design round first scoped member-only; the owner
   widened it to include the coach view in the same wave.)*
2. **Period starts only.** No flow levels, no end dates, no symptom picker. The existing
   Today check-in (energy · hunger · sleep · rested — already collected daily) is the
   symptom stream; cycle reads cross-reference it. New sensitive datum = exactly one
   date class.
3. **The member surface is a cycle calendar** — she logs by tapping the day, views
   logged days + the predicted window + phase bands on a month grid.
4. **Coach access = member share toggle, OFF by default, separate consent.** Opting
   into tracking never exposes anything to a coach. Two distinct `consent_log`
   receipts (`cycle_tracking`, `cycle_share`).
5. **Storage = dedicated `cycle_events` table** (not a `user_goals` doc) — chosen
   because coach share is in v1 scope, which needs the SECURITY DEFINER RPC pattern,
   and because v2 wearable import needs idempotent per-date upserts.

## Doctrine (hard rules, all copy and code)

- **Never speculate about pregnancy.** When a cycle runs past average + 7 days, the
  phase reads `paused` — *"Cycle running long — predictions paused."* No
  interpretation, no "you're late," ever. A tracker that hints at causes is a
  liability Shape never takes.
- **Not medical advice.** The opt-in screen carries verbatim: *"The Cycle is for
  training and recovery context only. It is not medical advice, not a diagnostic
  tool, and must never be used for contraception or fertility planning. Predictions
  are estimates from the dates you log."*
- **No Shape Score points for cycle logging, ever** (the meal-share doctrine,
  stronger here — never gamify reproductive data).
- **The engine never modifies a plan.** Copy and directives only; load changes stay
  human (the coach-adjust precedent).
- **Discretion on shared surfaces.** Plain cycle language (period / luteal / phase
  names) appears only on cycle surfaces (the calendar page, the Progress card, the
  coach station). If the Home directive takes a cycle lever it speaks neutrally —
  "Recovery emphasis today" — never naming the cycle. Shoulder-surfing is a real
  threat model for this data class.
- **Never-shaming** applies with extra force. Reads are framed as the body working
  with her, never as deficiency ("your sleep runs shorter in late luteal — the
  deload is working with you, not against you").
- **Absence, not a locked state.** A coach without share sees no CYCLE station at
  all — not a padlock (a padlock reveals that there is something being withheld;
  the live-progress lesson).

## Data model

### Migration `2026-07-19-cycle-events.sql` (idempotent; ⚠ OWNER runs it)

```sql
create table if not exists public.cycle_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  event_date date not null,
  kind       text not null default 'period_start' check (kind in ('period_start')),
  created_at timestamptz not null default now(),
  unique (user_id, event_date, kind)
);

alter table public.cycle_events enable row level security;

-- Owner-only. Deliberately NO coach policy on the table — coach access exists
-- ONLY through the definer RPC below, which checks the member's share flag.
drop policy if exists "cycle owner all" on public.cycle_events;
create policy "cycle owner all" on public.cycle_events
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Coach read: the get_client_goals pattern. Gated on BOTH an active coach link
-- AND the member's own share flag (user_goals('cycle_settings').share). Returns
-- share:false (and nothing else) when not shared — the caller renders absence.
-- Returns RAW recent starts, not derived phase: consumers derive via the ONE
-- pure module (cyclePhase.mjs) so SQL and JS can never drift.
create or replace function public.get_client_cycle(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_share boolean; v_starts jsonb;
begin
  if not is_coach_on_client(p_user_id) then return null; end if;
  select coalesce((data->>'share')::boolean, false) into v_share
    from user_goals where user_id = p_user_id and kind = 'cycle_settings';
  if not coalesce(v_share, false) then return jsonb_build_object('share', false); end if;
  select coalesce(jsonb_agg(event_date order by event_date desc), '[]'::jsonb)
    into v_starts
    from (select event_date from cycle_events
          where user_id = p_user_id and kind = 'period_start'
          order by event_date desc limit 13) s;
  return jsonb_build_object('share', true, 'starts', v_starts);
end $$;

revoke execute on function public.get_client_cycle(uuid) from public, anon;
grant  execute on function public.get_client_cycle(uuid) to authenticated;
```

### Settings doc — `user_goals('cycle_settings')`

`{ optIn: boolean, share: boolean }`. Owner-only by construction (user_goals RLS).
Dedicated key, never merged into `client_settings` (the no-clobber convention).

### Consent receipts (`consent_log`, existing table — built naming exactly these classes)

- `kind: 'cycle_tracking'` written on opt-in, with the exact disclaimer text shown.
- `kind: 'cycle_share'` written on enabling the coach share toggle, with its exact text.
- Withdrawal receipts on opt-out / share-off.

### Deletion (WA MHMD story)

Opt-out (Settings → Cycle → "Stop tracking & delete") deletes **all** `cycle_events`
rows + the `cycle_settings` doc, writes a withdrawal receipt, and the account-deletion
route (`/api/account/delete`) adds `cycle_events` to its purge list.

## Phase engine — pure `mobile-app/src/services/cyclePhase.mjs` (TDD)

One implementation, three consumers (member mobile, coach mobile, website — the
canonical-copy pattern; the website loads it like `shareCard.mjs`).

`bsDeriveCycle(starts, today)` → derived state. Calendar method:

- **Personal length `L`** = mean of the last ≤12 intervals (13 starts). `<2` starts →
  `L = 28`, confidence `low`. Intervals outside 15–60 days are discarded as
  data-entry noise before averaging (never silently mutated — just excluded from L).
- **Day of cycle** `d` = days since last logged start + 1.
- **Phases** (windows in days): menstrual `1–5` (fixed — no end dates collected) ·
  follicular `6 … L−17` · ovulatory `L−16 … L−12` (centered L−14) · luteal `L−11 … L`.
  Degenerate short cycles clamp windows in that priority order; never negative spans.
- **Confidence:** `high` = ≥3 intervals and stdev ≤ 3d · `medium` = 2 intervals or
  stdev ≤ 5d · `low` = otherwise (incl. the 28-default). stdev > 5d additionally
  widens the ovulatory window to ±4 and forces `low` — irregular cycles get honest
  vagueness, not false precision. Prediction renders as a **window**, not a date.
- **Paused:** `today > lastStart + L + 7` → `{ phase: 'paused' }` and every
  prediction field null. The paused copy is fixed by doctrine (above).
- **No starts** → `{ phase: null }` → setup state renders.

`bsCycleRead(days, cycle)` — the statistical reads, `crossoverRead`'s shape:
buckets the member's **existing** series (check-in energy/rested, sleep hours,
habit adherence, training volume — all already cached client-side) by phase across
complete cycles. **Floors:** ≥2 complete logged cycles AND ≥8 observed days in each
compared bucket; fires only when the gap clears both a per-metric materiality floor
(sleep ≥ 30 min · check-in scales ≥ 1.0 point · adherence ≥ 12pp) **and** ≥ 1.65·SE.
Below any floor → null → the card renders nothing (honest-null; no silent caps —
the card's register states how many cycles of data exist).

## Member surfaces (mobile)

1. **The cycle calendar page** — the #1712 unboxed month-grid grammar (hairline week
   rows, bare numerals): logged period days = filled accent discs; predicted window =
   dotted outline discs; phase bands = quiet underlay tints with a mono legend.
   **Tap a day to log a period start; tap a logged day to un-log** (delete own row,
   `bsAskConfirm`-guarded). Month nav as the house calendar. Reached from the
   Progress card and Settings → Cycle.
2. **Today page chip** — inside the expected window (predicted start −2d … +7d) a
   quiet one-line chip: "Period started? Log it →" (opens the calendar on today).
   Only when opted in; never on the Home slate.
3. **THE CYCLE card** (Progress hub, `BSCrossoverCard`'s sibling): phase + day-of-cycle
   headline, confidence + cycle-length register, predicted-window line, and the
   `bsCycleRead` findings once powered. Renders only when opted in.
4. **Home directive lever** — the engine may lead with a cycle-aware move, phrased
   neutrally per doctrine; detail lives on cycle surfaces.
5. **Settings → Cycle** — opt-in (disclaimer + consent receipt) · share toggle
   (own consent receipt) · open calendar · "Stop tracking & delete."

## Coach surface (share-gated)

Case File (Profile tab) gains a **CYCLE station** rendered ONLY when
`get_client_cycle` returns `share:true` — phase + day (derived client-side via the
same module), predicted next-period window, and that month's logged days as a small
month strip. **Phase and timing only** — no symptom inference, no check-in
cross-reads on the coach side (those are the member's own). Copy is professional
and directive-useful: "Week of the 24th is a natural deload window." At
`share:false` the station does not exist.

## Website parity

- Member: cycle calendar + THE CYCLE card on the dashboard Progress page, consuming
  the same `cyclePhase.mjs` (canonical module in `public/newdesign/`, mobile imports
  it — the `shareCard.mjs` pattern, one implementation).
- Coach: CYCLE station on `coachClientDetail.jsx` via the same RPC through
  `/api/clients/[id]/shared-overview` (adds a `cycle` leg, share-gated server-side).

## i18n

New `cycle` namespace ×13 locales, registered in **both** `mobile-app/src/i18n/index.js`
and `tests/i18n-catalog-complete.test.mjs` (the register-in-both trap). No dynamic
concatenated keys (the #1759 lesson — enumerate literally). tr-shadow greps both forms.
Phase names + all doctrine copy are keys; the medical disclaimer is one key whose
translations get flagged for the standing human review **with priority** (it's the
legally material string).

## Testing

- `tests/cycle-phase.test.mjs` — vectors: personal-length averaging + outlier
  discard · <2 starts → 28/low · phase windows at L=28 and irregular L ·
  stdev-widened ovulatory · paused past L+7 · no-starts null · clamped degenerate
  cycles · read floors (underpowered → null, powered → fires, materiality + SE both
  required).
- RPC shape validated read-only against prod post-migration (grants: anon=false,
  authenticated=true; share:false path).
- Standard gates: JSX parse · tsc · `/m/` PowerShell build · LF · catalog parity.
- **On-device (owner, registered in War Room):** log/un-log on the calendar ·
  predicted window renders · share toggle → coach Case File station appears/vanishes
  · opt-out wipes everything · discretion check (nothing cycle-named outside cycle
  surfaces).

## Build plan

- **PR A** — migration + `cyclePhase.mjs` + tests + `window.ShapeCycle` data layer
  (list/log/unlog/settings/optOut).
- **PR B** — member mobile: calendar page · Today chip · Progress card + reads ·
  Home lever · Settings section + consents. i18n ×13.
- **PR C** — coach: share wiring + Case File station + shared-overview leg.
- **PR D** — website parity (member + coach).

## Rejected alternatives (with receipts)

- **`daily_health_snapshot` column** — that table is coach-readable
  (`providers_read_subscriber_snapshots`) and RLS is row-level, not column-level;
  cycle data would leak to every linked coach. The exact lesson from the
  live-progress spec's rejection of a jsonb column on `user_activity`.
- **`user_goals` doc as primary storage** — right-sized for member-only, but coach
  share moved into v1 and needs the definer-RPC-over-a-table pattern; wearable
  import (v2) needs per-date idempotent upserts.
- **Symptom/flow logging** — duplicates the Today check-in and multiplies the most
  intimate data class for marginal read value.
- **Auto plan modification** — medical-adjacent, tramples coach-authored plans;
  human-in-the-loop doctrine.
- **Points for logging** — never gamify reproductive data.

## v2 (registered, not built)

Apple Health menstrual-flow import (native build) · Garmin Women's Health (access
blocked) · optional end dates / member-set period length · symptom overlay from
check-in data on the member's own calendar · coach-side nudge timing ("schedule the
deload") woven into Adjust.
