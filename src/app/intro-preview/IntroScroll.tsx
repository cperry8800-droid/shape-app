'use client';

// Cinematic intro. The full montage plays automatically on page load.
// Enter Shape + Log in CTAs fade in shortly after and stay on screen.
//
//   Scene 1 — hero (beat-5) plays once, then auto-transitions
//   Scene 2 — market (beat-6) with sequential one-liners
//   Scene 4 — client reviewing data (beat-8), last one-liners
//   Scene 5 — closer (beat-9) with "Built around you"
//
// Transitions are fluid opacity crossfades (~1.4s) so the motion
// reads as one continuous film.

import { useEffect, useRef, useState, useCallback } from 'react';

const SCENE_1 = '/intro/beat-5.mp4';
const SCENE_2 = '/intro/beat-6.mp4';
const SCENE_4 = '/intro/beat-8.mp4';
const SCENE_5 = '/intro/beat-9.mp4';

export default function IntroScroll() {
  const [scene, setScene] = useState<1 | 2 | 4 | 5>(1);
  const [step, setStep] = useState(0); // 0 = none, 1..5 = which line
  const [showHeadline, setShowHeadline] = useState(false);
  const [showCTAs, setShowCTAs] = useState(false);
  const scene4TriggeredRef = useRef(false);
  const scene5TriggeredRef = useRef(false);
  const unlockedRef = useRef(false);
  const video1Ref = useRef<HTMLVideoElement>(null);
  const video2Ref = useRef<HTMLVideoElement>(null);
  const video4Ref = useRef<HTMLVideoElement>(null);
  const video5Ref = useRef<HTMLVideoElement>(null);
  const wordTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Reliable video play helper — waits for any pending pause to
  // settle before starting playback.
  const safePlay = useCallback((v: HTMLVideoElement) => {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        v.play().then(resolve).catch(() => resolve());
      }, 50);
    });
  }, []);

  useEffect(() => {
    // Scene 1 autoplays on mount. Later scenes start paused at frame 0.
    video1Ref.current?.play().catch(() => {});
    [video2Ref, video4Ref, video5Ref].forEach((r) => {
      const v = r.current;
      if (!v) return;
      v.load();
      v.currentTime = 0;
    });

    // Show Enter Shape + Log in after a short delay
    const ctaTimer = setTimeout(() => setShowCTAs(true), 1500);

    // iOS Safari blocks autoplay until a user gesture.
    const unlock = () => {
      if (unlockedRef.current) return;
      unlockedRef.current = true;
      [video2Ref, video4Ref, video5Ref].forEach((r) => {
        const v = r.current;
        if (!v) return;
        try {
          const p = v.play();
          if (p && typeof p.then === 'function') p.catch(() => {});
          v.pause();
          v.currentTime = 0;
        } catch {
          /* ignore */
        }
      });
      video1Ref.current?.play().catch(() => {});
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('touchstart', unlock, { once: true, passive: true });

    return () => {
      clearTimeout(ctaTimer);
      wordTimersRef.current.forEach(clearTimeout);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  // "Built around you" fades in 0.5s after scene 5 begins.
  useEffect(() => {
    if (scene !== 5) {
      setShowHeadline(false);
      return;
    }
    const t = setTimeout(() => setShowHeadline(true), 500);
    return () => clearTimeout(t);
  }, [scene]);

  const goToScene2 = useCallback(() => {
    // On iOS, run unlock inline if needed.
    if (!unlockedRef.current) {
      unlockedRef.current = true;
      [video2Ref, video4Ref, video5Ref].forEach((r) => {
        const v = r.current;
        if (!v) return;
        try {
          const p = v.play();
          if (p && typeof p.then === 'function') p.catch(() => {});
          v.pause();
          v.currentTime = 0;
        } catch {
          /* ignore */
        }
      });
    }

    const v2 = video2Ref.current;
    if (v2) {
      v2.currentTime = 0;
      safePlay(v2);
    }
    setTimeout(() => setScene(2), 170);

    // Spread the five one-liners across scenes 2 + 4.
    const v4 = video4Ref.current;
    const d2 = Number.isFinite(v2?.duration) ? (v2!.duration as number) : 14;
    const d4 = Number.isFinite(v4?.duration) ? (v4!.duration as number) : 8;
    const total = (d2 + d4) * 1000;
    const head = 600;
    const tail = 1400;
    const span = total - head - tail;
    const slot = span / 5;
    const timers = [
      setTimeout(() => setStep(1), head + slot * 0 + 170),
      setTimeout(() => setStep(2), head + slot * 1 + 170),
      setTimeout(() => setStep(3), head + slot * 2 + 170),
      setTimeout(() => setStep(4), head + slot * 3 + 170),
      setTimeout(() => setStep(5), head + slot * 4 + 170),
    ];
    wordTimersRef.current = timers;
  }, [safePlay]);

  const goToScene4 = useCallback(() => {
    if (scene4TriggeredRef.current) return;
    scene4TriggeredRef.current = true;
    const v = video4Ref.current;
    if (v) {
      v.currentTime = 0;
      safePlay(v);
    }
    setTimeout(() => setScene(4), 120);
  }, [safePlay]);

  const goToScene5 = useCallback(() => {
    if (scene5TriggeredRef.current) return;
    scene5TriggeredRef.current = true;
    const v = video5Ref.current;
    if (v) {
      v.currentTime = 0;
      safePlay(v);
    }
    setTimeout(() => setScene(5), 120);
  }, [safePlay]);

  const loopBackToScene1 = useCallback(() => {
    scene4TriggeredRef.current = false;
    scene5TriggeredRef.current = false;
    setStep(0);
    const v1 = video1Ref.current;
    const v2 = video2Ref.current;
    const v4 = video4Ref.current;
    const v5 = video5Ref.current;
    if (v1) {
      v1.currentTime = 0;
      v1.play().catch(() => {});
    }
    if (v2) v2.currentTime = 0;
    if (v4) v4.currentTime = 0;
    if (v5) v5.currentTime = 0;
    setTimeout(() => setScene(1), 120);
  }, []);

  return (
    <main className="fixed inset-0 bg-black text-white">
      {/* Scene 1 — plays once then auto-transitions to scene 2. */}
      <video
        ref={video1Ref}
        src={SCENE_1}
        poster="/intro/beat-5-poster.jpg"
        muted
        playsInline
        onEnded={goToScene2}
        preload="auto"
        className="pointer-events-none absolute inset-0 h-full w-full scale-[1.04] object-cover transition-opacity duration-[1400ms] ease-out"
        style={{ opacity: scene === 1 ? 1 : 0 }}
      />

      {/* Scene 2 — crossfades to scene 4 near its end. */}
      <video
        ref={video2Ref}
        src={SCENE_2}
        muted
        playsInline
        onTimeUpdate={(e) => {
          if (scene !== 2) return;
          const v = e.currentTarget;
          if (v.duration && v.currentTime >= v.duration - 1.2) {
            goToScene4();
          }
        }}
        onEnded={goToScene4}
        preload="auto"
        className="pointer-events-none absolute inset-0 h-full w-full scale-[1.04] object-cover transition-opacity duration-[1400ms] ease-out"
        style={{ opacity: scene === 2 ? 1 : 0 }}
      />

      {/* Scene 4 — crossfades to scene 5 near its end. */}
      <video
        ref={video4Ref}
        src={SCENE_4}
        muted
        playsInline
        onTimeUpdate={(e) => {
          if (scene !== 4) return;
          const v = e.currentTarget;
          if (v.duration && v.currentTime >= v.duration - 1.2) {
            goToScene5();
          }
        }}
        onEnded={goToScene5}
        preload="auto"
        className="pointer-events-none absolute inset-0 h-full w-full scale-[1.04] object-cover transition-opacity duration-[1400ms] ease-out"
        style={{ opacity: scene === 4 ? 1 : 0 }}
      />

      {/* Scene 5 — loops back to scene 1 on end. */}
      <video
        ref={video5Ref}
        src={SCENE_5}
        muted
        playsInline
        onEnded={loopBackToScene1}
        preload="auto"
        className="pointer-events-none absolute inset-0 h-full w-full scale-[1.04] object-cover transition-opacity duration-[1400ms] ease-out"
        style={{ opacity: scene === 5 ? 1 : 0 }}
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

      {/* Welcome to Shape — shows during scene 1, fades when montage starts */}
      <div
        className="pointer-events-none absolute inset-x-0 top-[40%] -translate-y-1/2 z-30 flex flex-col items-center gap-5 px-6 text-center transition-opacity duration-[1000ms] ease-out"
        style={{
          opacity: scene === 1 ? 1 : 0,
        }}
      >
        <div className="flex items-center justify-center gap-2.5 text-[1.1rem] font-extralight uppercase leading-none tracking-[0.22em] text-white md:gap-3 md:text-[clamp(1.3rem,2.6vw,2rem)]">
          <span>Welcome to</span>
          <img
            src="/logo-text-trimmed.png"
            alt="Shape"
            className="relative h-[0.78em] w-auto [filter:brightness(0)_invert(1)] md:-top-[1.5px] md:h-[0.83em]"
          />
        </div>
      </div>

      {/* Five one-liners during scenes 2 + 4 */}
      {['No more guessing', 'No more going alone', 'Real coaches. Real plans.', 'One marketplace.', 'One community.'].map(
        (line, i) => (
          <div
            key={line}
            className="pointer-events-none absolute inset-x-0 top-[45%] -translate-y-1/2 z-10 px-6 text-center"
            style={{
              opacity:
                step === i + 1 && !(i === 4 && scene === 5)
                  ? 1
                  : 0,
              transition: 'opacity 900ms ease-out',
            }}
          >
            <div className="text-[clamp(2rem,5vw,4rem)] font-normal leading-tight tracking-[-0.03em] text-white">
              {line}
            </div>
          </div>
        )
      )}

      {/* Scene 5 headline */}
      <div
        className="pointer-events-none absolute inset-x-0 top-[45%] -translate-y-1/2 z-10 px-6 text-center transition-opacity duration-[1000ms] ease-out"
        style={{
          opacity: scene === 5 && showHeadline ? 1 : 0,
        }}
      >
        <div className="text-[clamp(2rem,5vw,4rem)] font-normal leading-tight tracking-[-0.03em] text-white">
          Built around you
        </div>
      </div>

      {/* Dark gradient behind CTAs */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[9] h-[42vh] bg-gradient-to-t from-black/80 via-black/40 to-transparent transition-opacity duration-[1200ms] ease-out"
        style={{
          opacity: showCTAs ? 1 : 0,
        }}
      />

      {/* Enter Shape + Log in — fades in shortly after page load,
          stays on screen through the entire montage. */}
      <div
        className="absolute inset-x-0 bottom-[10vh] z-30 flex flex-col items-center gap-4 px-6 text-center transition-opacity duration-[1200ms] ease-out"
        style={{
          opacity: showCTAs ? 1 : 0,
          pointerEvents: showCTAs ? 'auto' : 'none',
        }}
      >
        <a
          href="/home"
          className="group inline-flex items-center justify-center gap-2.5 border border-white bg-black/35 px-6 py-2.5 text-[0.62rem] font-light uppercase tracking-[0.12em] text-white shadow-[0_0_24px_rgba(0,0,0,0.45)] backdrop-blur-sm transition-all hover:bg-white hover:text-neutral-950 md:gap-2.5 md:px-7 md:py-2.5 md:text-[0.72rem] md:font-medium"
        >
          <span className="-mr-1">Enter</span>
          <img
            src="/logo-text-trimmed.png"
            alt="Shape"
            className="relative top-[-0.075em] h-[0.78em] w-auto [filter:brightness(0)_invert(1)] group-hover:[filter:brightness(0)] md:top-0 md:h-[0.7rem]"
          />
          <span>→</span>
        </a>
        <a
          href="/login"
          className="inline-flex items-center justify-center border border-white bg-black/35 px-5 py-2 text-[0.58rem] font-light uppercase tracking-[0.12em] text-white shadow-[0_0_24px_rgba(0,0,0,0.45)] backdrop-blur-sm transition-all hover:bg-white hover:text-neutral-950 md:px-6 md:py-2 md:text-[0.66rem] md:font-medium"
        >
          Log in
        </a>
      </div>
    </main>
  );
}
