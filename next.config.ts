import type { NextConfig } from "next";

// The legacy shape-website static files live in /public. Next.js serves
// them automatically at their .html paths. Rewrites map the clean URLs
// (/, /home, /trainers, etc.) to the right .html file.

const legacyPages = [
  'home', 'landing',
  'trainers', 'nutritionists', 'gyms',
  'trainer-profile', 'nutritionist-profile', 'client-profile',
  'trainer-dashboard', 'gym-dashboard', 'nutrition-schedule', 'clients', 'my-team',
  'for-trainers', 'for-nutritionists', 'for-gyms', 'for-gym-owners', 'for-clients',
  'signup-client', 'signup-trainer', 'signup-nutritionist', 'signup-gym', 'signup-radio',
  'reset-password',
  'pricing', 'contact', 'help', 'community', 'integrations',
  'privacy', 'terms',
  'radio', 'ai-trainers', 'live-workout', 'messages', 'consultation',
  'shape-score', 'shape-score-trainer', 'shape-score-nutritionist', 'shape-store',
];

const nextConfig: NextConfig = {
  async rewrites() {
    // Root now renders the cinematic intro via src/app/page.tsx.
    // The legacy static index.html is still in public/ but no longer
    // mapped to `/` — other legacy pages keep their rewrites.
    return [
      ...legacyPages.map((p) => ({
        source: `/${p}`,
        destination: `/${p}.html`,
      })),
    ];
  },
};

export default nextConfig;
