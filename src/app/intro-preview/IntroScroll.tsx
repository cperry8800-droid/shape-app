'use client';

// Cinematic intro. Four scenes on a single fullscreen canvas:
//
//   Scene 1 — hero (beat-5) with Shape logo and Join the community CTA
//   Scene 2 — market (beat-6) with sequential one-liners + Continue CTA
//   Scene 3 — trainer + nutritionist (beat-7) + Continue CTA
//   Scene 4 — client reviewing data (beat-8) + Enter Shape CTA
//
// Each transition is a fluid opacity crossfade (~1.4s) so the motion
// reads as one continuous film, horizon.trade style.

import { useEffect, useRef, useState } from 'react';

const SCENE_1 = '/intro/beat-5.mp4';
const SCENE_2 = '/intro/beat-6.mp4';
const SCENE_3 = '/intro/beat-7.mp4';
const SCENE_4 = '/intro/beat-8.mp4';

export default function IntroScroll() {
  const [scene, setScene] = useState<1 | 2 | 3 | 4>(1);
  const video1Ref = useRef<HTMLVideoElement>(null);
  const video2Ref = useRef<HTMLVideoElement>(null);
  const video3Ref = useRef<HTMLVideoElement>(null);
  const video4Ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Scene 1 autoplays on mount. Later scenes start paused at frame 0
    // and force-load their first frame so there's no transparent gap
    // when the crossfade begins.
    video1Ref.current?.play().catch(() => {});
    [video2Ref, video3Ref, video4Ref].forEach((r) => {
      const v = r.current;
      if (!v) return;
      v.load();
      v.currentTime = 0;
    });
  }, []);

  const goToScene2 = () => {
    const v = video2Ref.current;
    if (v) {
      v.currentTime = 0;
      v.play().catch(() => {});
    }
    // Brief head-start so video is rendering before the opacity
    // crossfade reveals it.
    setTimeout(() => setScene(2), 120);
  };

  const goToScene3 = () => {
    const v = video3Ref.current;
    if (v) {
      v.currentTime = 0;
      v.play().catch(() => {});
    }
    setTimeout(() => setScene(3), 120);
  };

  // Auto-advance: scene 2 (after all 4 one-liners) -> scene 3 -> scene 4.
  useEffect(() => {
    if (scene === 2) {
      const t = setTimeout(() => goToScene3(), 7300);
      return () => clearTimeout(t);
    }
    if (scene === 3) {
      const t = setTimeout(() => goToScene4(), 3800);
      return () => clearTimeout(t);
    }
  }, [scene]);

  const goToScene4 = () => {
    const v = video4Ref.current;
    if (v) {
      v.currentTime = 0;
      v.play().catch(() => {});
    }
    setTimeout(() => setScene(4), 120);
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

      {/* Scene 2 video — no loop so the clip end doesn't restart */}
      <video
        ref={video2Ref}
        src={SCENE_2}
        muted
        playsInline
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-[1400ms] ease-out"
        style={{ opacity: scene === 2 ? 1 : 0 }}
      />

      {/* Scene 3 video — no loop so it doesn't rewind mid-crossfade */}
      <video
        ref={video3Ref}
        src={SCENE_3}
        muted
        playsInline
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-[1400ms] ease-out"
        style={{ opacity: scene === 3 ? 1 : 0 }}
      />

      {/* Scene 4 video */}
      <video
        ref={video4Ref}
        src={SCENE_4}
        muted
        loop
        playsInline
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-[1400ms] ease-out"
        style={{ opacity: scene === 4 ? 1 : 0 }}
      />

      {/* Shape triangles — exact logo-full.svg geometry */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="70 8 60 84"
        aria-label="Shape"
        className="pointer-events-none absolute left-10 top-6 z-20 h-12 w-auto md:left-16 md:top-10 md:h-14"
      >
        <polygon points="72,44 72,88 105,66" fill="#FFFFFF" />
        <polygon points="128,12 128,56 95,34" fill="#FFFFFF" />
      </svg>

      {/* Scene 1 CTA — fades out as scene 2 takes over */}
      <div
        className="absolute inset-x-0 bottom-[10vh] z-10 flex flex-col items-center gap-5 px-6 text-center transition-opacity duration-[1000ms] ease-out"
        style={{
          opacity: scene === 1 ? 1 : 0,
          pointerEvents: scene === 1 ? 'auto' : 'none',
        }}
      >
        <div className="flex items-center justify-center gap-3 text-[clamp(1rem,2vw,1.55rem)] font-thin uppercase leading-none tracking-[0.28em] text-white">
          <span>Welcome to</span>
          <img
            src="/logo-text-trimmed.png"
            alt="Shape"
            className="h-[0.92em] w-auto [filter:brightness(0)_invert(1)]"
          />
        </div>
        <button
          type="button"
          onClick={goToScene2}
          className="inline-flex items-center justify-center border border-white bg-transparent px-8 py-3 text-[0.74rem] font-medium uppercase tracking-[0.12em] text-white transition-all hover:bg-white hover:text-neutral-950"
        >
          Get Started →
        </button>
      </div>

      {/* Scene 2 sequential one-liners (auto-advance to scene 3) */}
      <Scene2Copy active={scene === 2} />

      {/* Scene 4 headline */}
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 z-10 px-6 text-center transition-opacity duration-[1000ms] ease-out"
        style={{
          opacity: scene === 4 ? 1 : 0,
          transitionDelay: scene === 4 ? '800ms' : '0ms',
        }}
      >
        <div className="text-[clamp(2rem,5vw,4rem)] font-light leading-tight tracking-[-0.03em] text-white">
          Built around you
        </div>
      </div>

      {/* Scene 4 final CTA */}
      <div
        className="absolute inset-x-0 bottom-[10vh] z-10 flex flex-col items-center gap-4 px-6 text-center transition-opacity duration-[1000ms] ease-out"
        style={{
          opacity: scene === 4 ? 1 : 0,
          pointerEvents: scene === 4 ? 'auto' : 'none',
          transitionDelay: scene === 4 ? '1600ms' : '0ms',
        }}
      >
        <a
          href="/trainers"
          className="group inline-flex items-center justify-center gap-3 border border-white bg-transparent px-10 py-4 text-[0.82rem] font-medium uppercase tracking-[0.12em] text-white transition-all hover:bg-white hover:text-neutral-950"
        >
          <span className="-mr-1">Enter</span>
          <img
            src="/logo-text-trimmed.png"
            alt="Shape"
            className="h-[0.7rem] w-auto [filter:brightness(0)_invert(1)] group-hover:[filter:brightness(0)]"
          />
          <span>→</span>
        </a>
        <a
          href="/login"
          className="inline-flex items-center justify-center border border-white bg-transparent px-7 py-2.5 text-[0.68rem] font-medium uppercase tracking-[0.12em] text-white transition-all hover:bg-white hover:text-neutral-950"
        >
          Log in
        </a>
      </div>
    </main>
  );
}

// Six sequential one-liners that fade in/out across scenes 2, 3, and 4.
// No Continue button — the film auto-advances through all scenes.
function Scene2Copy({ active }: { active: boolean }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!active) {
      setStep(0);
      return;
    }
    const timers = [
      setTimeout(() => setStep(1), 500),
      setTimeout(() => setStep(2), 2200),
      setTimeout(() => setStep(3), 3900),
      setTimeout(() => setStep(4), 5600),
    ];
    return () => timers.forEach(clearTimeout);
  }, [active]);

  const lines = ['Real trainers', 'Real nutritionists', 'One platform', 'One community'];

  return (
    <>
      {lines.map((line, i) => (
        <div
          key={i}
          className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 z-10 px-6 text-center"
          style={{
            opacity: step === i + 1 ? 1 : 0,
            transition: 'opacity 900ms ease-out',
          }}
        >
          <div className="text-[clamp(2rem,5vw,4rem)] font-light leading-tight tracking-[-0.03em] text-white">
            {line}
          </div>
        </div>
      ))}
    </>
  );
}

