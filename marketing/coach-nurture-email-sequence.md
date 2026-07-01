# Shape — Coach Nurture Email Sequence

**Goal:** Convert Founding Coach **list opt-ins** (from the awareness campaign) into marketplace applicants.
**Who gets this:** Warmer than cold outreach — these coaches raised their hand. So this sequence is give-first and educational early, with the ask escalating only at the end.
**Structure:** 5 emails over ~2 weeks, triggered on opt-in. One arc, with **[PT]/[NUT]** proof swaps inline (don't maintain two full copies).
**CTA:** soft early ("here's how it works"), hard late ("Apply to coach on Shape") —
**PT →** `theshapecommunity.com/newdesign/SignupTrainer.html` · **NUT →** `theshapecommunity.com/newdesign/SignupNutritionist.html` (send each coach their track's link).

**Personalization tokens:** `{{first_name}}`, `{{specialty}}`, `{{deadline_date}}`, `{{your_name}}`. Only use a token if you have the value — a wrong one kills trust faster than a generic line.

> This complements `coach-outreach-email-sequence.md` (cold 1:1 to your warm list). Use *that* for people you email directly; use *this* automated arc for anyone who opts into the Founding Coach list from social. Don't send both to the same person.

---

## Cadence

| # | Trigger | Purpose |
|---|---|---|
| 1 | On opt-in (Day 0) | Welcome + deliver the give + one-line what-Shape-is |
| 2 | Day 2 | The wedge — set your rate, pay only when you earn (flat 15%) |
| 3 | Day 5 | Proof — how coaching actually runs on Shape |
| 4 | Day 8 | Offer — Founding Coach + first hard apply CTA |
| 5 | Day 12 | Last call — low-pressure close + founder 1:1 offer |

---

### Email 1 · Welcome + the give
**Subject:** `You're on the Founding Coach list`

> Hi {{first_name}},
>
> You're in — thanks for putting your name down. Here's what you asked for: **[deliver the lead magnet / resource link].**
>
> One line on what Shape is, so it's clear what you're on the list for: a marketplace of vetted trainers and nutritionists where **you set your own rates and keep 85%** — Shape's commission is a flat 15%, only when a client pays you — and the app runs the whole loop (train → eat → recover → coach) so you're coaching, not doing admin.
>
> Over the next couple of weeks I'll show you exactly how it works and what the founding cohort gets. No spam — reply anytime with a question.
>
> {{your_name}}

---

### Email 2 · The wedge
**Subject:** `The part most coaching tools get backwards`

> Hi {{first_name}},
>
> Quick one, because it's the whole reason Shape exists.
>
> Most coaching tools bill you a monthly fee whether or not you have a single client — and lock your clients inside their platform. Shape's different:
>
> - **You set your rates and keep 85%.** Shape's commission is a flat 15% — charged only when a client actually pays you, with no monthly software fee.
> - **Members pay their own $5/mo** — and there's no software or setup fee to bring your current clients over.
> - **You keep your clients.** They're yours, not the platform's.
>
> That's it for today. Next: what a week of coaching actually looks like on Shape.
>
> {{your_name}}

---

### Email 3 · Proof — how it runs
**Subject:** `How coaching actually runs on Shape`

> Hi {{first_name}},
>
> The part coaches care about — how it works day to day:
>
> **[PT]**
> - **Plan loads the night before.** Every set, tempo and cue you wrote, on the client's card. No deciding at the rack.
> - **One number tells the truth.** Sleep, stress and Shape Score, read weekly, so you adjust *before* a client stalls.
> - **A real human in the loop — you.** Not a chatbot. The data comes to you; you rewrite the plan.
>
> **[NUT]**
> - **Macro plans you set, logged live.** The deficit updates as the client eats; travel and rest-day swaps are built in.
> - **One weekly number.** Shape Score (sleep, stress, training) sits next to nutrition, so you catch a stall early.
> - **You coach off real adherence,** not a PDF you hope they opened.
>
> And you're **vetted and listed** alongside real pros — not buried in an open directory.
>
> Want the full picture? **→ See what it's like to coach on Shape** [link to Coach/Nutritionist page]
>
> {{your_name}}

---

### Email 4 · Offer + first hard CTA
**Subject:** `What the founding cohort gets`

> Hi {{first_name}},
>
> You joined the Founding Coach list, so here's what that's actually for. Coaches who apply in the first cohort get:
>
> - A permanent **Founding Coach** badge + priority placement on the marketplace at launch *(planned founding-cohort perk)*
> - **Done-for-you migration** — we import your current clients and build your first two **[PT: program / NUT: meal-plan]** templates, so setup isn't all on you
>
> After the cohort closes, new coaches start from scratch. Applying takes about two minutes; the setup we handle.
>
> **→ Apply to coach on Shape**
>
> {{your_name}}

---

### Email 5 · Last call
**Subject:** `Ready when you are`

> Hi {{first_name}},
>
> I won't keep filling your inbox — last one for now.
>
> If running your coaching in one place, keeping your own rates, and getting set up for free sounds worth a look, the founding window's open today:
>
> **→ Apply to coach on Shape**
>
> Prefer to talk it through first? Reply and I'll send you a link to grab 15 minutes with me — I'm onboarding the founding coaches personally.
>
> If the timing's just wrong, reply "later" and I'll check back next quarter. No hard feelings.
>
> {{your_name}}

---

## Send notes

- **Verify the offer before Email 4 sends.** Founding Coach badge, priority placement, and done-for-you migration are conditional until ops/finance sign off — keep them framed as "planned" and drop anything you can't deliver.
- **Per-track apply link.** PT → `newdesign/SignupTrainer.html`, NUT → `newdesign/SignupNutritionist.html`. The wrong link routes a coach to the wrong intake.
- **Don't double-send.** Anyone already in the 1:1 outreach sequence should not also get this nurture arc — pick one.
- **Plain-text, single CTA, one link** per email — better deliverability and replies than a designed template.
- **Escalate the ask, not the pressure.** Emails 1–3 give; only 4–5 ask. If someone replies at any point, pull them out of automation and hand to the founder 1:1 step.
- **Verify every product claim** against the live site before scheduling (claims as of July 1, 2026).
