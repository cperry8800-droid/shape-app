# Review · 2026-09-15 · The website login box, three ways

**Status: not built.** Records only — a review with live previews. No code changed, no
migration, no PR beyond this file. Owner: *"can you give me 3 new designs for this login box
on login page on website"*, with a screenshot of the shipped card.

**The board:** https://claude.ai/artifact/8adRRC3osuPWurMf5L437E — seven tabs: **Today · as
shipped** (the card rendered from `login.jsx`'s own source with the page's own CSS, over the
page's own photo), **A · The Pass**, **B · The Console**, **C · The Front Page** (each live:
every switch, tab and door works, and a 390px phone frame beside each shows the same box),
**Backbone**, **Carry-over** and **Pick**.

Measured on `main` = `1337ede`. Every figure below was read off the board's final render in
Chromium with the real faces served locally, never carried from a draft.

## 1 · What is there today

`public/newdesign/Login.html` + `login.jsx` (474 lines; the card is `LoginCard`).

- **Two type systems on one site.** The card is Fraunces (a 40px title with a stroked italic
  *Shape*), Space Grotesk and JetBrains Mono. The homepage (#2058), Coaches (#2064) and Members
  (#2070) pages moved to Anybody · Doto · Schibsted Grotesk. A member who taps Log in from the
  new nav lands in the old typeface.
- **The white box is a default, not a decision.** `ShapeTurnstile.render`
  (`public/supabase.js:1422–1432`) passes no `theme`, so Turnstile follows the visitor's OS
  scheme; on a light-mode machine it paints a 300×65 white panel with a green tick and the
  Cloudflare mark inside the dark card — the loudest element on the page, and a third party's.
  `theme:'dark'` + `size:'flexible'` are one line; `appearance:'interaction-only'` removes it
  at rest (the widget appears only when a challenge needs a click; the 7-second fall-open in
  `login.jsx:80` still holds).
- **Remember me changes nothing.** `remember` (`login.jsx:44`) is set by the checkbox
  (`:366`) and read by no code path. Supabase keeps the session either way.
- **"Log in as" is a comment away from retirement.** The source calls it a *dev switcher for
  prototype* (`:333`). It only picks the destination (`:149–152`), and `finishLogin` already
  selects `profiles.role` for the account that just signed in (`:114`).
- **Twelve controls in view plus the widget.** The card measures **709px** (widget drawn in at
  its 65px); with the page chrome (header 102 · main padding 40/80 · footer 66) that is
  **997px**, so a 768px laptop scrolls before it reaches Log in.
- **Three controls under this repo's 24px floor** (WCAG 2.5.8): Forgot? **17px**, the remember
  checkbox **16px**, Create an account **23px**. Show clears it at 26, the role segments at 31,
  the Email · Phone toggle at 33; only the submit reaches 44 (45).
- **The photo costs 8.4 MB.** `public/login page 1.png` is 1376×768 and **8,452,453 bytes**,
  served as the page background. The same pixels as a JPEG — the board's own backdrop — are
  **48,290 bytes**, 175× smaller. Until it arrives the card floats on `#0a0807`. (`public/login
  page.png`, 7.7 MB, and `public/login 1.png`, a 2-byte file, sit beside it — registered.)
- **Errors** render as a red box at the bottom of the card, not under the field they concern.
- **The copy is already right** — *Welcome back · Pick up where you left off · New to Shape?
  · Create an account →* — and carries over into all three.

## 2 · The three designs

All three: Anybody (display, the width axis), Schibsted Grotesk (body), Doto (eyebrows,
readings, the six code digits); the 11px top-right chamfer the settings Passport ruled for; no
radius, no blur; fields 48px, primary 50px, nothing under 26px; errors inline; the true sentence
*You stay signed in on this device.* where the dead checkbox was; Turnstile dark, flexible and
interaction-only.

- **A · The Pass.** Cream paper (the app's own, and GetApp's) on the dark stage. Progressive:
  one field that takes email, username **or** phone (a value that parses as a number takes the
  code path), then the proof — the password with Forgot? and Show, or six Doto cells for the
  SMS code — with the identity read back and a Change beside it. **No role picker**: the
  destination is derived from the `profiles.role` row `finishLogin` already reads. Measured
  **435px** at rest, 482 with the password step, 479 with the code.
- **B · The Console.** The house plate — 3px spine, notch, corner bracket — pointed at the
  form. Email · Phone as a two-position slide; three role cells whose selected top rule **and
  the plate's spine** take the role colour (teal / rust `#c0533b` / gold `#d8b25a`); the
  primary stays teal, because the house rule puts role colour on borders and spines, never on
  fills (rust under dark text measures **4.2:1** and fails AA; as a 3px line it needs 3:1 and
  measures 4.24). Two **readings** replace the third-party box and the dead checkbox: HUMAN
  CHECK (WAITING → PASSED ✓ when Turnstile issues its token) and CAPS LOCK (the keyboard's
  real modifier state on the password field). The plate carries no mark of its own — the page
  header holds it — and its lede is one line. Measured **583px** (615 with the code): the
  tallest of the three. ⚠ It plates a form, against the two-tier rule; named on the board.
- **C · The Front Page.** A 760px two-panel spread: the wordmark at width 150 over three
  **doors** — Member · Trainer · Nutritionist — each with one line of what is behind it, the
  selected door's spine in its colour; the form on the right. Stacks at 600px by container
  query (the doors become a three-chip strip). Measured **499px** on the desktop, 703 stacked at
  390. The door says *Member* where the shipped label says *Client* — flagged, not decided.

Verified on the final board: **zero page errors, zero horizontal overflow at 1280 and 400** on
every tab; the Anybody width axis moving (SHAPE at wdth 50 = 43px, at 150 = 203px, so the real
face rendered rather than its fallback); contrast — teal button text 10.6:1, paper button
16.6:1, paper label 5.2:1, plate label 5.7:1, error on plate 8.1:1, error on paper 5.4:1.

## 3 · Backbone

The ten fixes every option carries (Backbone tab): the new type system · chamfer, no radius,
no blur · nothing under 26px, a focus ring on everything · the whole box on a 768px laptop
(with the page's 40/80 main padding trimmed to 24/24 the budget is 618px; A 435, B 583, C 499;
the shipped 709 does not fit even then) · Turnstile dark / flexible / interaction-only ·
inline errors naming the fix · remember-me wired or retired · role answered by the account
where it can be · the backdrop as a 48 KB JPEG · the words stay.

## 4 · Carry-over

Every element on the shipped card and where it lives in A, B and C is the Carry-over tab —
fifteen rows, nothing dropped: the eyebrow, the title, the lede, the toggle, both fields,
Forgot?/Show, Log in as, remember me, the Cloudflare panel, the error, the button, the
Create-an-account link, the code entry, the mark, and Change number.

## 5 · Pick

**A · The Pass, with B's CAPS LOCK reading under the password field.** Fewest decisions; the
only option that retires the role question, which is the largest usability smell on the card
(the one system that already knows a member's role asks them for it); the smallest build (one
component, no route, no migration); and Shape's light rather than a generic one — the paper is
the app's own. From C, only the doors' one-line descriptions, which belong on Landing's
*Choose your path*. **Fallbacks:** B if the site must stay dark end to end (the two-tier rule
broken knowingly); C only if the role choice stays a first-class decision.

## 6 · Owner rulings needed before a build

| Question | Default if unruled | Why |
|---|---|---|
| Retire *Log in as* and derive the destination from `profiles.role`? | Yes (A); the in-app role switcher covers a dual-role coach | A wrong tap today lands a member on a coach dashboard |
| Remember me: wire a real session/persistent switch, or retire it? | Retire; say the true sentence | The checkbox has never done anything |
| Turnstile at rest: invisible (interaction-only) or a visible dark widget? | Invisible; the fall-open stays | Cloudflare's brand stops being the loudest thing on the card |
| A light card on the dark site? | Yes for A; B and C stay dark | The pick's one aesthetic risk |
| *Member* or *Client* on the login? | Keep *Client* until the site settles the word | The nav says Members, the app says Client; the login should not be a third vote |

## 7 · Not a ruling — lands with any pick

The 8.4 MB PNG becomes a JPEG or WebP; `ShapeTurnstile.render` gains its three options; the
login page's font link moves to the new system's; errors move inline; every text link gets its
padding; the page's main padding trims to 24/24.

## 8 · How it was verified, and what it was not

- The Today card is `renderToStaticMarkup(<LoginCard/>)` over `login.jsx` compiled with
  `@babel/preset-react`, with `pageShell.jsx`'s tokens supplied — the real markup, not a
  redrawing. The Turnstile panel is **drawn in** (labelled on the board) because the widget
  cannot mount without its script; the human check on B is **simulated** (WAITING → PASSED
  after 1.8 s) to show the reading's two states, and says so in the source.
- The board rendered locally with all six faces served from `@fontsource-variable` files
  (Google Fonts is blocked here) and the Google Fonts request rewritten to them with absolute
  URLs; the published page loads the same families from Google Fonts.
- **Not driven:** the shipped `Login.html` itself — it loads React and Babel from unpkg with
  SRI, which this container's proxy blocks, so the figures for the shipped card come from its
  markup rendered in the board, not from the live page. The 12-control count and the 709px
  are therefore the card without Vercel insights or the real widget's own chrome.
- **No on-account pass, and none possible here:** every preview is a design; none signs in.
