# Club Shape — landing hero and store listings (draft)

Draft for the owner's review. The positioning: **coaching is the product; Shape Radio and the virtual
club are the twist.** Every first impression leads with finding a coach, and the club comes second.
Every claim below is something the app does today; the notes at the end say what each rests on and
what to confirm before it ships.

---

## Landing hero

Written for the homepage fold as it is built (`public/newdesign/index.html`, `<header class="hero">`):
an eyebrow, a two-line headline with one word in italics, a sub line, two buttons and three facts.

**Eyebrow**
> Club Shape · Your climb

**Headline** (recommended)
> Find your coach.
> Join the *club.*

Alternates, same shape:
> Different goals.
> One *club.*

> Get in shape.
> Stay for the *club.*

**Sub line**
> Vetted trainers and nutritionists, one app for training, food and habits, and a club with its own
> radio station. One membership opens all of it.

**Buttons**
- Primary: **Find your coach →** (to `/newdesign/Landing.html`, as "Get started" goes now)
- Secondary: **Step inside the club** (to `/newdesign/Radio.html`, where Nora's booth stands in Club Shape)

**The three facts** (the fold's `camps`)
| Figure | Line |
|---|---|
| **$5**/mo | one membership |
| **0** ads | Shape Radio, included |
| **1** club | coaches, training, food, community |

**Footer tagline** (`tag2`, now "Real coaches. One app. The whole loop.")
> Real coaches. One club. The whole loop.

---

## App Store (iOS)

**App name** (30 max)
> Club Shape: Coaching & Radio

**Subtitle** (30 max)
> Real coaches. Your own club.

**Promotional text** (170 max; can change without a new build)
> Find a vetted trainer or nutritionist, train and eat to a plan, and keep going with Shape Radio and
> the club. One membership opens all of it.

**Keywords** (100 max; words already in the name and subtitle are indexed, so they are not repeated)
> personal trainer,nutritionist,fitness,workout,meal plan,nutrition,diet,habits,gym,health,music

**Description** (4,000 max)

> Club Shape is a fitness and health platform for finding a real coach to change how you live, with a
> twist: the club has its own radio station, and a place of its own.
>
> FIND YOUR COACH
> Browse vetted personal trainers and nutritionists by specialty, city and rate. Read their pages,
> message them, and book when you're ready. Every coach sets their own price, and you pay them
> directly.
>
> TRAIN, EAT, BUILD THE HABIT
> • Your coach's program lands week after week, and you log it in a tap
> • Log meals, plan tomorrow's food the night before, and cook from Shape Kitchen's recipes, step by step
> • Keep your habits and goals in one place
> • Everything you log rolls into your Shape Score, one number that climbs as you do
>
> THE CLUB
> • Shape Radio: a live channel and your coaches' playlists, ad-free and included with your membership
> • Club Shape: the club's own 3D venue, where Nora holds the booth
> • The Wall: post your wins, and your coach and crew cheer them on
>
> MEET NORA
> Nora is the club's AI host. Ask her questions by voice or text, and she'll help you set up your
> goals and your account.
>
> WORKS WITH WHAT YOU USE
> Apple Health, Strava, Garmin, Oura, WHOOP, Apple Music and Spotify.
>
> In 13 languages.
>
> MEMBERSHIP
> One membership opens the whole club. Coaching is priced by each coach and paid to them directly.
>
> The Club Shape membership is an auto-renewing subscription. Payment is charged to your Apple ID
> when you confirm the purchase, and it renews automatically unless you cancel at least 24 hours
> before the end of the current period. Manage or cancel it in your App Store account settings.
>
> Terms: https://www.theshapecommunity.com/terms.html
> Privacy: https://www.theshapecommunity.com/privacy.html

---

## Google Play (Android)

**App name** (30 max)
> Club Shape: Coaching & Radio

**Short description** (80 max)
> Find a vetted trainer or nutritionist, plus a club with its own radio station.

**Full description** (4,000 max)

> Club Shape is a fitness and health platform for finding a real coach to change how you live, with a
> twist: the club has its own radio station, and a place of its own.
>
> FIND YOUR COACH
> Browse vetted personal trainers and nutritionists by specialty, city and rate. Read their pages,
> message them, and book when you're ready. Every coach sets their own price, and you pay them
> directly.
>
> TRAIN, EAT, BUILD THE HABIT
> • Your coach's program lands week after week, and you log it in a tap
> • Log meals, plan tomorrow's food the night before, and cook from Shape Kitchen's recipes, step by step
> • Keep your habits and goals in one place
> • Everything you log rolls into your Shape Score, one number that climbs as you do
>
> THE CLUB
> • Shape Radio: a live channel and your coaches' playlists, ad-free and included with your membership
> • Club Shape: the club's own 3D venue, where Nora holds the booth
> • The Wall: post your wins, and your coach and crew cheer them on
>
> MEET NORA
> Nora is the club's AI host. Ask her questions by voice or text, and she'll help you set up your
> goals and your account.
>
> WORKS WITH WHAT YOU USE
> Strava, Garmin, Oura, WHOOP and Spotify.
>
> In 13 languages.
>
> MEMBERSHIP
> One membership opens the whole club. Coaching is priced by each coach and paid to them directly.
> The membership renews automatically until you cancel; manage or cancel it any time in Google Play
> under Payments & subscriptions.
>
> Terms: https://www.theshapecommunity.com/terms.html
> Privacy: https://www.theshapecommunity.com/privacy.html

---

## Notes before this ships

**What each claim rests on**
- *$5/mo, one membership; coaches set their own rates, paid directly; every coach credential-checked:*
  the homepage's facts and `landing.jsx`'s Reassurance row.
- *Shape Radio, a live channel and coaches' playlists, ad-free, included:* the homepage's radio section.
- *Club Shape, the 3D venue with Nora's booth:* `public/newdesign/booth/` (Radio page and the app's radio screen).
- *Night-before food planning, Shape Kitchen recipes with guided cooking, Shape Score, the Wall:* the
  app as it ships (`services/prepAhead.mjs`, `BSPlanDay.jsx`, the Kitchen and Score screens).
- *Nora by voice or text, account setup:* `api/nutrition/voice`, `src/lib/ai/accountSetup.mjs`.
- *Integrations:* `BSIntegrationsPage.jsx` (Apple Health and Apple Music left off the Android list).
- *13 languages:* `mobile-app/src/i18n/catalogs/`.

**To confirm**
1. **Price in the stores.** The store copy leaves out "$5": the store shows each country's price, and
   in-app purchase outside the US is on hold. The landing hero keeps $5/mo, as the homepage does now.
2. **Shape Sets.** Left out of the store copy because the launch cut still marks them *coming*. Once
   sets are on the schedule, add to THE CLUB: "• Shape Sets: live DJ sets in Club Shape".
3. **Nora as DJ.** "Holds the booth" describes the booth as it stands; her hosting the station on air
   is Phase 2 (`docs/REVIEW-2026-09-29-nora-dj.md`), so the copy doesn't say she DJs yet.
4. **App name change** rides on the next store release; the bundle ID `com.theshapecommunity.app`
   stays. A trademark clearance search on "Club Shape" comes first.
5. **The store copy is English only.** The other 12 store locales need their own listings.
