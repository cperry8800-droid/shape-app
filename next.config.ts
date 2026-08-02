import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// The legacy shape-website static files live in /public. Next.js serves
// them automatically at their .html paths. Rewrites map the clean URLs
// (/, /home, /trainers, etc.) to the right .html file.

// Pages now served by Next.js app router: /trainers, /nutritionists,
// /pricing, /signup, /forgot-password, /reset-password — removed from
// this list. Everything else still falls through to the legacy .html.
const legacyPages = [
  'home', 'landing',
  'gyms',
  'trainer-profile', 'nutritionist-profile', 'client-profile',
  'trainer-dashboard', 'gym-dashboard', 'nutrition-schedule', 'clients', 'my-team',
  'for-trainers', 'for-nutritionists', 'for-gyms', 'for-gym-owners', 'for-clients',
  'signup-client', 'signup-trainer', 'signup-nutritionist', 'signup-gym', 'signup-radio',
  'contact', 'help', 'community', 'integrations',
  'privacy', 'terms',
  'radio', 'ai-trainers', 'live-workout', 'messages',
  'shape-score', 'shape-score-trainer', 'shape-score-nutritionist', 'shape-store',
  'dashboard-preview',
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
      // About page lives at /public/newdesign/About.html. Rewrites (not
      // redirects) keep the clean URL in the bar and avoid the case-sensitivity
      // redirect loops Vercel can hit between lowercase/uppercase paths.
      { source: '/about', destination: '/newdesign/About.html' },
      { source: '/about.html', destination: '/newdesign/About.html' },
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
