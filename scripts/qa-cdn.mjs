// Shared CDN interception for the QA scripts (egress-blocked container).
import { readFileSync } from "node:fs";

// This container's egress policy blocks unpkg/jsdelivr/supabase.co — serve the
// EXACT npm-published bytes locally (SRI hashes still match) and 404 the rest,
// so the pages run as they would in production demo mode.
const VENDOR = [
  [/unpkg\.com\/react@18\.3\.1\/umd\/react\.development\.js/, "/tmp/qa-vendor/react-18.3.1/umd/react.development.js"],
  [/unpkg\.com\/react-dom@18\.3\.1\/umd\/react-dom\.development\.js/, "/tmp/qa-vendor/react-dom-18.3.1/umd/react-dom.development.js"],
  [/unpkg\.com\/@babel\/standalone@7\.29\.0\/babel\.min\.js/, "/tmp/qa-vendor/babel-standalone-7.29.0/babel.min.js"],
  [/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/, "/tmp/qa-vendor/supabase-supabase-js-2.108.1/dist/umd/supabase.js"],
];
export async function routeCDN(ctx) {
  await ctx.route(/unpkg\.com|cdn\.jsdelivr\.net|supabase\.co|vercel-scripts|_vercel\//, async (route) => {
    const url = route.request().url();
    for (const [re, file] of VENDOR) {
      if (re.test(url)) return route.fulfill({ status: 200, contentType: "application/javascript", body: readFileSync(file) });
    }
    return route.abort("connectionfailed"); // supabase etc. — pages must degrade to demo
  });
}
