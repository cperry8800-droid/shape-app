'use client';

// Splash: a single looping background video (beat-5) behind the Shape
// logo, "Welcome to Shape", and the entry CTAs.

import { useEffect, useRef, useState } from 'react';

const SCENE_1 = '/intro/beat-5.mp4';

export default function IntroScroll() {
  const [showCTAs, setShowCTAs] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    videoRef.current?.play().catch(() => {});
    const ctaTimer = setTimeout(() => setShowCTAs(true), 3000);

    // iOS Safari blocks autoplay until a user gesture.
    const unlock = () => {
      videoRef.current?.play().catch(() => {});
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('touchstart', unlock, { once: true, passive: true });

    return () => {
      clearTimeout(ctaTimer);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  return (
    <main className="fixed inset-0 bg-black text-white">
      {/* Single looping background video */}
      <video
        ref={videoRef}
        src={SCENE_1}
        poster="/intro/beat-5-poster.jpg"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="pointer-events-none absolute inset-0 h-full w-full scale-[1.04] object-cover"
      />

      {/* Shape triangles logo */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="70 8 60 84"
        aria-label="Shape"
        className="pointer-events-none absolute left-10 top-6 z-20 h-10 w-auto md:left-16 md:top-10 md:h-14"
      >
        <polygon points="72,44 72,88 105,66" fill="#FFFFFF" />
        <polygon points="128,12 128,56 95,34" fill="#FFFFFF" />
      </svg>

      {/* Welcome to Shape */}
      <div className="pointer-events-none absolute inset-x-0 top-[40%] -translate-y-1/2 z-30 flex flex-col items-center gap-5 px-6 text-center">
        <div className="flex items-center justify-center gap-2.5 text-[1.1rem] font-extralight uppercase leading-none tracking-[0.22em] text-white md:gap-3 md:text-[clamp(1.3rem,2.6vw,2rem)]">
          <span>Welcome to</span>
          <img
            src="/logo-text-trimmed.png"
            alt="Shape"
            className="relative h-[0.78em] w-auto [filter:brightness(0)_invert(1)] md:-top-[1.5px] md:h-[0.83em]"
          />
        </div>
      </div>

      {/* Dark gradient behind CTAs */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[9] h-[42vh] bg-gradient-to-t from-black/80 via-black/40 to-transparent transition-opacity duration-[1200ms] ease-out"
        style={{ opacity: showCTAs ? 1 : 0 }}
      />

      {/* Enter Shape + Log in — fade in shortly after load */}
      <div
        className="absolute inset-x-0 bottom-[10vh] z-30 flex flex-col items-center gap-4 px-6 text-center transition-opacity duration-[1200ms] ease-out"
        style={{
          opacity: showCTAs ? 1 : 0,
          pointerEvents: showCTAs ? 'auto' : 'none',
        }}
      >
        <a
          href="/newdesign/index.html"
          className="group inline-flex items-center justify-center gap-2 border border-white bg-black/35 px-6 py-2.5 text-[0.62rem] font-light uppercase tracking-[0.12em] text-white shadow-[0_0_24px_rgba(0,0,0,0.45)] backdrop-blur-sm transition-all hover:bg-white hover:text-neutral-950 md:px-7 md:py-2.5 md:text-[0.72rem] md:font-medium"
        >
          <span>Step Inside</span>
          <span>→</span>
        </a>
        <a
          href="/newdesign/Login.html"
          className="inline-flex items-center justify-center border border-white bg-black/35 px-5 py-2 text-[0.58rem] font-light uppercase tracking-[0.12em] text-white shadow-[0_0_24px_rgba(0,0,0,0.45)] backdrop-blur-sm transition-all hover:bg-white hover:text-neutral-950 md:px-6 md:py-2 md:text-[0.66rem] md:font-medium"
        >
          Log in
        </a>
      </div>
    </main>
  );
}
