import type { NextConfig } from "next";

// The legacy shape-website static files live in /public. Next.js serves
// them automatically at their .html paths. We just need rewrites so the
// clean URLs (/, /home, /trainers, etc.) resolve to the right .html file.

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
    return [
      // Root → legacy intro splash
      { source: '/', destination: '/index.html' },
      // Every legacy page at its clean URL
      ...legacyPages.map((p) => ({
        source: `/${p}`,
        destination: `/${p}.html`,
      })),
    ];
  },
};

export default nextConfig;
