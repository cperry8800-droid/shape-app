import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// The legacy shape-website static files live in /public. Next.js serves
// them automatically at their .html paths. Rewrites map the clean URLs
// (/, /home, /trainers, etc.) to the right .html file.

// Pages now served by Next.js app router: /trainers, /nutritionists,
// /pricing, /signup, /forgot-password, /reset-password — removed from
// this list. The rest of the old root site was retired on 2026-10-14
// (`retiredPages` below); these are the root pages that are still live.
const legacyPages = ['contact', 'help', 'privacy', 'terms', 'radio'];

// The old root site, retired on 2026-10-14. Owner, from the legacy-pages review: "2. Retire old
// pages w/ redirects". Each page left a copy of a flow the website now does (the dashboards,
// the marketplace, sign-up, Score, the Store), and those copies had drifted. Every old address,
// with or without `.html`, lands on the website page that does the same job. Permanent, since
// none of these pages is coming back. The gym, AI-trainer, integrations and radio sign-up pages
// were products Shape no longer offers, and are gone with no redirect (owner: "Delete, no
// redirect"), so they 404.
const retiredPages: Array<[string, string]> = [
  ['home', '/'],
  ['landing', '/newdesign/Landing.html'],
  ['marketplace', '/newdesign/Marketplace.html'],
  ['for-trainers', '/newdesign/Coach.html'],
  ['for-nutritionists', '/newdesign/Nutritionist.html'],
  ['for-clients', '/newdesign/Client.html'],
  ['shape-score', '/newdesign/Score.html'],
  ['shape-score-trainer', '/newdesign/Score.html'],
  ['shape-score-nutritionist', '/newdesign/Score.html'],
  ['shape-store', '/newdesign/Store.html'],
  ['community', '/newdesign/Community.html'],
  ['signup-client', '/newdesign/SignupClient.html'],
  // The three old dashboards go straight to their app shells, not the stubs: a browser keeps
  // the #fragment across a redirect, and the shells read the old tab names (Codex on #2352), where
  // the stubs replace any fragment with #today.
  ['trainer-dashboard', '/newdesign/TrainerApp.html'],
  ['nutrition-schedule', '/newdesign/NutritionistApp.html'],
  ['clients', '/newdesign/ClientApp.html'],
  // The member's own profile, in the app: ClientProfile.html is a demo persona with no backend
  // read (Codex on #2352).
  ['client-profile', '/newdesign/ClientApp.html#profile'],
  ['my-team', '/newdesign/ClientTeam.html'],
  // The member's team, where each coach has a Message button. No address opens the chat itself.
  ['messages', '/newdesign/ClientTeam.html'],
  ['dashboard-preview', '/newdesign/ClientApp.html'],
  ['my-workouts', '/newdesign/ClientTrain.html'],
  ['workout', '/newdesign/ClientTrain.html'],
  ['live-workout', '/newdesign/ClientTrain.html'],
];

const nextConfig: NextConfig = {
  async redirects() {
    // /pricing (old Next.js route) permanently lives at /newdesign/Pricing.html
    return [
      { source: '/pricing', destination: '/newdesign/Pricing.html', permanent: true },
      { source: '/pricing.html', destination: '/newdesign/Pricing.html', permanent: true },
      // Consultation booking now lives in newdesign (the legacy page is retired).
      { source: '/consultation', destination: '/newdesign/consultation.html', permanent: true },
      { source: '/consultation.html', destination: '/newdesign/consultation.html', permanent: true },
      // The About page is retired (owner, 2026-10-12: "remove the about page from
      // app and website"). Old links and bookmarks land on the homepage instead of
      // a 404. Temporary, so a browser does not cache it if the page comes back.
      { source: '/about', destination: '/newdesign/index.html', permanent: false },
      { source: '/about.html', destination: '/newdesign/index.html', permanent: false },
      { source: '/newdesign/About.html', destination: '/newdesign/index.html', permanent: false },
      // The legacy coach applications are retired (owner, 2026-10-12: "retire legacy pages"):
      // the root pages and the /mobile preview's sign-up pages each kept their own copy of the
      // application, which drifted from the rules the website and the app follow. Every old link
      // lands on the website's application. Temporary, like About.
      { source: '/signup-trainer', destination: '/newdesign/SignupTrainer.html', permanent: false },
      { source: '/signup-trainer.html', destination: '/newdesign/SignupTrainer.html', permanent: false },
      { source: '/signup-nutritionist', destination: '/newdesign/SignupNutritionist.html', permanent: false },
      { source: '/signup-nutritionist.html', destination: '/newdesign/SignupNutritionist.html', permanent: false },
      { source: '/mobile/SignupTrainer.html', destination: '/newdesign/SignupTrainer.html', permanent: false },
      { source: '/mobile/SignupNutritionist.html', destination: '/newdesign/SignupNutritionist.html', permanent: false },
      { source: '/mobile/SignupClient.html', destination: '/newdesign/SignupClient.html', permanent: false },
      // The retired root pages (above). `/trainers`, `/nutritionists` and `/login` are Next routes,
      // so only their old `.html` files redirect. A coach profile keeps its coach: the old pages
      // took the listing id as `?id=`, and `/trainers/<id>` and `/nutritionists/<id>` are the
      // profiles by listing id (the query is passed through, which the page ignores). Without an
      // id there is no coach to keep, so the marketplace.
      ...retiredPages.flatMap(([page, destination]) => [
        { source: `/${page}`, destination, permanent: true },
        { source: `/${page}.html`, destination, permanent: true },
      ]),
      { source: '/index.html', destination: '/', permanent: true },
      { source: '/login.html', destination: '/newdesign/Login.html', permanent: true },
      { source: '/trainers.html', destination: '/newdesign/Marketplace.html', permanent: true },
      { source: '/nutritionists.html', destination: '/newdesign/Marketplace.html', permanent: true },
      ...['trainer', 'nutritionist'].flatMap((role) => [`/${role}-profile`, `/${role}-profile.html`].flatMap((source) => [
        { source, has: [{ type: 'query' as const, key: 'id', value: '(?<id>\\d+)' }], destination: `/${role}s/:id`, permanent: true },
        // The old pages also took the listing as ?provider= (`params.get('id') || params.get('provider')`).
        { source, has: [{ type: 'query' as const, key: 'provider', value: '(?<id>\\d+)' }], destination: `/${role}s/:id`, permanent: true },
        { source, destination: '/newdesign/Marketplace.html', permanent: true },
      ])),
    ];
  },
  async rewrites() {
    // Root renders the cinematic intro via src/app/page.tsx. The CTA
    // inside the intro links to /newdesign/Landing.html for the real
    // marketing site.
    return [
      ...legacyPages.map((p) => ({
        source: `/${p}`,
        destination: `/${p}.html`,
      })),
      { source: '/newdesign', destination: '/newdesign/index.html' },
      { source: '/newdesign/', destination: '/newdesign/index.html' },
      // Recipes library lives at public/newdesign/Recipes.html.
      { source: '/recipes', destination: '/newdesign/Recipes.html' },
      { source: '/recipes.html', destination: '/newdesign/Recipes.html' },
      // Each recipe gets its own page: /recipes/<slug> -> RecipeDetail.html,
      // which reads the slug from the path (?r passed for direct access too).
      { source: '/recipes/:slug', destination: '/newdesign/RecipeDetail.html?r=:slug' },
      // Mobile preview lives at public/mobile/Mobile.html. Give it clean,
      // lowercase URLs so the mixed-case filename isn't the only way in.
      { source: '/mobile', destination: '/mobile/Mobile.html' },
      { source: '/mobile/', destination: '/mobile/Mobile.html' },
      { source: '/mobile.html', destination: '/mobile/Mobile.html' },
      { source: '/mobile/mobile.html', destination: '/mobile/Mobile.html' },
    ];
  },
};

// ⚠ Without SENTRY_AUTH_TOKEN the plugin SKIPS the source-map upload and warns.
// It must not fail the build — this ships before the Sentry account exists.
//
// ⚠ SOURCE MAPS ARE GATED ON ALL THREE UPLOAD VARS, not just the token. With a
// token but no org/project the plugin has a credential and nowhere to send the
// maps: it ENABLES source-map generation and then relies on its own post-upload
// auto-delete, which does not necessarily run when the upload is skipped —
// leaving .map files sitting in .next/static, i.e. this app's source served at a
// public URL. Requiring the full triple makes the half-configured state produce
// no maps at all, which is the safe direction and matches the mobile side, where
// @sentry/vite-plugin is gated on exactly the same three (see
// mobile-app/vite.config.ts). It also matches the runbook, which tells the owner
// to supply the Sentry variables together.
const sentryUploadConfigured = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT,
);

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  sourcemaps: { disable: !sentryUploadConfigured },
});
