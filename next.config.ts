import type { NextConfig } from "next";

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
  'radio', 'ai-trainers', 'live-workout', 'messages', 'consultation',
  'shape-score', 'shape-score-trainer', 'shape-score-nutritionist', 'shape-store',
  'dashboard-preview',
];

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      // beforeFiles runs before static files and app router pages — lets
      // us serve the redesign at `/` while keeping `public/index.html`
      // and the app-router tree untouched.
      beforeFiles: [
        { source: '/', destination: '/newdesign/Landing.html' },
      ],
      afterFiles: [
        ...legacyPages.map((p) => ({
          source: `/${p}`,
          destination: `/${p}.html`,
        })),
        { source: '/newdesign', destination: '/newdesign/index.html' },
        { source: '/newdesign/', destination: '/newdesign/index.html' },
      ],
      fallback: [],
    };
  },
};

export default nextConfig;
