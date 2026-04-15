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
  const [step, setStep] = useState(0); // 0 = none, 1..4 = which line, 5 = done
  const scene4TriggeredRef = useRef(false);
  const video1Ref = useRef<HTMLVideoElement>(null);
  const video2Ref = useRef<HTMLVideoElement>(null);
  const video3Ref = useRef<HTMLVideoElement>(null);
  const video4Ref = useRef<HTMLVideoElement>(null);
  const wordTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

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
    return () => {
      wordTimersRef.current.forEach(clearTimeout);
    };
  }, []);

  const goToScene2 = () => {
    const v2 = video2Ref.current;
    const v3 = video3Ref.current;
    if (v2) {
      v2.currentTime = 0;
      v2.play().catch(() => {});
    }
    // Brief head-start so video is rendering before the opacity
    // crossfade reveals it.
    setTimeout(() => setScene(2), 120);

    // Schedule the four one-liners so they're evenly spaced across the
    // combined runtime of scene 2 + scene 3. This way pacing always
    // matches the clips — no guessing, no cut-off, no loops needed.
    const d2 = Number.isFinite(v2?.duration) ? (v2!.duration as number) : 10;
    const d3 = Number.isFinite(v3?.duration) ? (v3!.duration as number) : 10;
    const total = (d2 + d3) * 1000; // ms
    // Leave a small pad at the head so line 1 fades in after the
    // crossfade lands, and at the tail so line 4 isn't swallowed by
    // the scene 4 crossfade.
    const head = 600;
    const tail = 1400;
    const span = total - head - tail;
    const slot = span / 4;
    const timers = [
      setTimeout(() => setStep(1), head + slot * 0 + 120),
      setTimeout(() => setStep(2), head + slot * 1 + 120),
      setTimeout(() => setStep(3), head + slot * 2 + 120),
      setTimeout(() => setStep(4), head + slot * 3 + 120),
      setTimeout(() => setStep(5), head + slot * 4 + 120),
    ];
    // Stash the timers on the ref so they can be cleared if the user
    // navigates away mid-sequence (unmount cleanup below).
    wordTimersRef.current = timers;
  };

  const goToScene3 = () => {
    const v = video3Ref.current;
    if (v) {
      v.currentTime = 0;
      v.play().catch(() => {});
    }
    setTimeout(() => setScene(3), 120);
  };

  // Transitions fire on each clip's natural end — no timers, no freeze,
  // no guessing clip durations.

  const goToScene4 = () => {
    if (scene4TriggeredRef.current) return;
    scene4TriggeredRef.current = true;
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

      {/* Scene 2 video — plays once, hands off to scene 3 on end. */}
      <video
        ref={video2Ref}
        src={SCENE_2}
        muted
        playsInline
        onEnded={goToScene3}
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-[1400ms] ease-out"
        style={{ opacity: scene === 2 ? 1 : 0 }}
      />

      {/* Scene 3 video — plays once. Crossfade to scene 4 begins 1.3s
          before its natural end so there's no frozen-frame pause while
          the opacity transition runs. */}
      <video
        ref={video3Ref}
        src={SCENE_3}
        muted
        playsInline
        onTimeUpdate={(e) => {
          if (scene !== 3) return;
          const v = e.currentTarget;
          if (v.duration && v.currentTime >= v.duration - 1.3) {
            goToScene4();
          }
        }}
        onEnded={goToScene4}
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
        <div className="flex items-center justify-center gap-3 text-[clamp(1rem,2vw,1.55rem)] font-extralight uppercase leading-none tracking-[0.28em] text-white">
          <span>Welcome to</span>
          <img
            src="/logo-text-trimmed.png"
            alt="Shape"
            className="h-[0.83em] w-auto [filter:brightness(0)_invert(1)]"
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

      {/* Four one-liners, evenly spaced across the combined runtime of
          scenes 2 and 3. Timings are set up in goToScene2(). */}
      {['Real trainers', 'Real nutritionists', 'One platform', 'One community'].map(
        (line, i) => (
          <div
            key={line}
            className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 z-10 px-6 text-center"
            style={{
              opacity: scene !== 4 && step === i + 1 ? 1 : 0,
              transition: 'opacity 900ms ease-out',
            }}
          >
            <div className="text-[clamp(2rem,5vw,4rem)] font-light leading-tight tracking-[-0.03em] text-white">
              {line}
            </div>
          </div>
        )
      )}

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
          href="/"
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
          className="inline-flex items-center justify-center border border-white bg-transparent px-9 py-3.5 text-[0.76rem] font-medium uppercase tracking-[0.12em] text-white transition-all hover:bg-white hover:text-neutral-950"
        >
          Log in
        </a>
      </div>
    </main>
  );
}

