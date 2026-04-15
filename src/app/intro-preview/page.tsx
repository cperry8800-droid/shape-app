// Cinematic scroll-driven intro (preview route).
//
// Lives at /intro-preview so we can iterate without touching the live
// landing page. Five scroll-locked "beats", each a full viewport with a
// sticky background video and overlaid copy that fades in/out based on
// scroll progress.
//
// Drop the Veo clips into /public/intro/beat-{0..4}.mp4 as they come
// out of Flow — this component picks them up automatically. Missing
// files fall back to a black background so the layout still works.

import IntroScroll from './IntroScroll';

export const metadata = { title: 'Shape — Intro (preview)' };

export default function IntroPreviewPage() {
  return <IntroScroll />;
}
