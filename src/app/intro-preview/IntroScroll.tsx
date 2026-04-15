'use client';

// Cinematic intro. Two scenes on a single fullscreen canvas:
//
//   Scene 1 — hero video (beat-5) with the white Shape logo top-left
//             and a transparent "Get Started" CTA bottom-center.
//   Scene 2 — explainer video (beat-6) that crossfades in when the
//             user clicks Get Started. Fluid opacity blend, no page
//             navigation, horizon.trade-style continuity.
//
// When you're ready, drop the explainer clip at /public/intro/beat-6.mp4
// and it'll play automatically on the transition.

import { useEffect, useRef, useState } from 'react';

const SCENE_1 = '/intro/beat-5.mp4';
const SCENE_2 = '/intro/beat-6.mp4';

export default function IntroScroll() {
  const [scene, setScene] = useState<1 | 2>(1);
  const video1Ref = useRef<HTMLVideoElement>(null);
  const video2Ref = useRef<HTMLVideoElement>(null);

  // Autoplay both videos; crossfade via opacity so the motion stays
  // fluid and we don't flash black during the transition.
  useEffect(() => {
    video1Ref.current?.play().catch(() => {});
    video2Ref.current?.play().catch(() => {});
  }, []);

  const goToScene2 = () => {
    setScene(2);
    // Make sure scene-2 video is playing from the top as it fades in.
    const v = video2Ref.current;
    if (v) {
      v.currentTime = 0;
      v.play().catch(() => {});
    }
  };

  return (
    <main className="fixed inset-0 bg-black text-white">
      {/* Scene 1 video */}
      <video
        ref={video1Ref}
        src={SCENE_1}
        muted
        loop
        playsInline
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-[1400ms] ease-out"
        style={{ opacity: scene === 1 ? 1 : 0 }}
      />

      {/* Scene 2 video */}
      <video
        ref={video2Ref}
        src={SCENE_2}
        muted
        loop
        playsInline
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-[1400ms] ease-out"
        style={{ opacity: scene === 2 ? 1 : 0 }}
      />

      {/* Shape logo (always visible) */}
      <img
        src="/logo-original.png"
        alt="Shape"
        className="pointer-events-none absolute left-6 top-6 z-20 h-14 w-auto md:left-10 md:top-10 md:h-16"
        style={{ filter: 'brightness(0) invert(1)' }}
      />

      {/* Scene 1 CTA — fades out as scene 2 takes over */}
      <div
        className="absolute inset-x-0 bottom-[10vh] z-10 flex flex-col items-center gap-4 px-6 text-center transition-opacity duration-[1000ms] ease-out"
        style={{
          opacity: scene === 1 ? 1 : 0,
          pointerEvents: scene === 1 ? 'auto' : 'none',
        }}
      >
        <button
          type="button"
          onClick={goToScene2}
          className="inline-flex items-center justify-center border border-white bg-transparent px-10 py-4 text-[0.82rem] font-medium uppercase tracking-[0.12em] text-white transition-all hover:bg-white hover:text-neutral-950"
        >
          Get Started →
        </button>
      </div>

      {/* Scene 2 CTA — fades in after the transition */}
      <div
        className="absolute inset-x-0 bottom-[10vh] z-10 flex flex-col items-center gap-4 px-6 text-center transition-opacity duration-[1000ms] ease-out"
        style={{
          opacity: scene === 2 ? 1 : 0,
          pointerEvents: scene === 2 ? 'auto' : 'none',
          transitionDelay: scene === 2 ? '600ms' : '0ms',
        }}
      >
        <a
          href="/trainers"
          className="inline-flex items-center justify-center border border-white bg-transparent px-10 py-4 text-[0.82rem] font-medium uppercase tracking-[0.12em] text-white transition-all hover:bg-white hover:text-neutral-950"
        >
          Continue →
        </a>
      </div>
    </main>
  );
}
