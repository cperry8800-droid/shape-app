'use client';

// Cinematic intro. Four scenes on a single fullscreen canvas:
//
//   Scene 1 — hero (beat-5) with Shape logo and Get Started CTA
//   Scene 2 — market (beat-6) with sequential one-liners
//   Scene 4 — client reviewing data (beat-8), last one-liner carries
//   Scene 5 — closer (beat-9) with "Built around you" + Enter Shape
//
// Transitions are fluid opacity crossfades (~1.4s) so the motion
// reads as one continuous film. Scene numbers skip 3 because beat-7
// was cut earlier for feeling choppy.

import { useEffect, useRef, useState } from 'react';

const SCENE_1 = '/intro/beat-5.mp4';
const SCENE_2 = '/intro/beat-6.mp4';
const SCENE_4 = '/intro/beat-8.mp4';
const SCENE_5 = '/intro/beat-9.mp4';

export default function IntroScroll() {
  const [scene, setScene] = useState<1 | 2 | 4 | 5>(1);
  const [step, setStep] = useState(0); // 0 = none, 1..4 = which line
  const [showHeadline, setShowHeadline] = useState(false);
  // Once the viewer has reached the end of the film, pin the final
  // CTAs on screen and keep looping the background film back to
  // scene 1 so nothing freezes.
  const [looped, setLooped] = useState(false);
  const scene4TriggeredRef = useRef(false);
  const scene5TriggeredRef = useRef(false);
  const video1Ref = useRef<HTMLVideoElement>(null);
  const video2Ref = useRef<HTMLVideoElement>(null);
  const video4Ref = useRef<HTMLVideoElement>(null);
  const video5Ref = useRef<HTMLVideoElement>(null);
  const wordTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // Scene 1 autoplays on mount. Later scenes start paused at frame 0
    // and force-load their first frame so there's no transparent gap
    // when the crossfade begins.
    video1Ref.current?.play().catch(() => {});
    [video2Ref, video4Ref, video5Ref].forEach((r) => {
      const v = r.current;
      if (!v) return;
      v.load();
      v.currentTime = 0;
    });

    // iOS Safari blocks autoplay until a user gesture, even for muted
    // video. The first tap on the page "primes" each later clip so it
    // can play on demand. We kick off a quick play() + pause() on the
    // prepped videos synchronously inside the gesture — no async .then
    // chain, because those late pauses would fight the real scene
    // transitions and freeze the film.
    const unlock = () => {
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
      // Make sure scene 1 is definitely playing after the gesture.
      video1Ref.current?.play().catch(() => {});
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('click', unlock);
    };
    // Only wire the unlock to touch — desktop doesn't need it and a
    // global click handler would race with the Get Started button.
    window.addEventListener('touchstart', unlock, { once: true, passive: true });

    return () => {
      wordTimersRef.current.forEach(clearTimeout);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('click', unlock);
    };
  }, []);

  // "Built around you" fades in 0.5s after scene 5 actually begins
  // (not when the word sequence says it should), and fades out again
  // whenever we leave scene 5 — e.g. during the background loop.
  useEffect(() => {
    if (scene !== 5) {
      setShowHeadline(false);
      return;
    }
    const t = setTimeout(() => setShowHeadline(true), 500);
    return () => clearTimeout(t);
  }, [scene]);

  const goToScene2 = () => {
    const v2 = video2Ref.current;
    if (v2) {
      v2.currentTime = 0;
      v2.play().catch(() => {});
    }
    // Brief head-start so video is rendering before the opacity
    // crossfade reveals it.
    setTimeout(() => setScene(2), 120);

    // Spread the four one-liners across scenes 2 + 4 (scene 5 holds
    // the headline + final CTAs, so the words don't need to stretch
    // into it). Derived from real durations so pacing stays matched
    // to the clips.
    const v4 = video4Ref.current;
    const d2 = Number.isFinite(v2?.duration) ? (v2!.duration as number) : 14;
    const d4 = Number.isFinite(v4?.duration) ? (v4!.duration as number) : 8;
    const total = (d2 + d4) * 1000; // ms
    const head = 600;
    const tail = 1400;
    const span = total - head - tail;
    const slot = span / 4;
    // Four one-liners, each holding for `slot` ms. The headline is
    // driven separately off the scene 4 transition (see useEffect).
    const timers = [
      setTimeout(() => setStep(1), head + slot * 0 + 120),
      setTimeout(() => setStep(2), head + slot * 1 + 120),
      setTimeout(() => setStep(3), head + slot * 2 + 120),
      setTimeout(() => setStep(4), head + slot * 3 + 120),
    ];
    wordTimersRef.current = timers;
  };

  const goToScene4 = () => {
    // Allow re-entry across loops; only block back-to-back calls in
    // the same pass of the film.
    if (scene4TriggeredRef.current) return;
    scene4TriggeredRef.current = true;
    const v = video4Ref.current;
    if (v) {
      v.currentTime = 0;
      v.play().catch(() => {});
    }
    setTimeout(() => setScene(4), 120);
  };

  const goToScene5 = () => {
    if (scene5TriggeredRef.current) return;
    scene5TriggeredRef.current = true;
    const v = video5Ref.current;
    if (v) {
      v.currentTime = 0;
      v.play().catch(() => {});
    }
    setTimeout(() => setScene(5), 120);
  };

  // When scene 5 finishes, loop the whole film back to scene 1. The
  // final CTAs remain pinned on top via `looped`.
  const loopBackToScene1 = () => {
    setLooped(true);
    scene4TriggeredRef.current = false;
    scene5TriggeredRef.current = false;
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
  };

  return (
    <main className="fixed inset-0 bg-black text-white">
      {/* Scene 1 video. Loops by itself on first play (hero), but once
          the film has looped back around it hands off to scene 2 on
          end so the background cycle keeps rolling. */}
      <video
        ref={video1Ref}
        src={SCENE_1}
        muted
        loop={!looped}
        playsInline
        onEnded={() => {
          if (looped) goToScene2();
        }}
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-[1400ms] ease-out"
        style={{ opacity: scene === 1 ? 1 : 0 }}
      />

      {/* Scene 2 video — plays once. Fires the scene 4 crossfade 1.2s
          before its natural end so there's no frozen-frame pause while
          the opacity transition runs. */}
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
        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-[1400ms] ease-out"
        style={{ opacity: scene === 2 ? 1 : 0 }}
      />

      {/* Scene 4 video — plays once. Crossfades into scene 5 1.2s
          before its natural end to avoid a frozen last-frame pause. */}
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
        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-[1400ms] ease-out"
        style={{ opacity: scene === 4 ? 1 : 0 }}
      />

      {/* Scene 5 video — closer (beat-9). Plays once, then loops the
          whole film back to scene 1. */}
      <video
        ref={video5Ref}
        src={SCENE_5}
        muted
        playsInline
        onEnded={loopBackToScene1}
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-[1400ms] ease-out"
        style={{ opacity: scene === 5 ? 1 : 0 }}
      />

      {/* Shape triangles — exact logo-full.svg geometry */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="70 8 60 84"
        aria-label="Shape"
        className="pointer-events-none absolute left-10 top-6 z-20 h-10 w-auto md:left-16 md:top-10 md:h-14"
      >
        <polygon points="72,44 72,88 105,66" fill="#FFFFFF" />
        <polygon points="128,12 128,56 95,34" fill="#FFFFFF" />
      </svg>

      {/* Scene 1 CTA — fades out as scene 2 takes over. Hidden once
          the film has looped because the final CTAs take its place. */}
      <div
        className="absolute inset-x-0 bottom-[10vh] z-10 flex flex-col items-center gap-5 px-6 text-center transition-opacity duration-[1000ms] ease-out"
        style={{
          opacity: scene === 1 && !looped ? 1 : 0,
          pointerEvents: scene === 1 && !looped ? 'auto' : 'none',
        }}
      >
        <div className="flex items-center justify-center gap-2.5 text-[1.1rem] font-extralight uppercase leading-none tracking-[0.28em] text-white md:gap-3 md:text-[clamp(1.3rem,2.6vw,2rem)]">
          <span>Welcome to</span>
          <img
            src="/logo-text-trimmed.png"
            alt="Shape"
            className="relative h-[0.78em] w-auto [filter:brightness(0)_invert(1)] md:-top-[2px] md:h-[0.83em]"
          />
        </div>
        <button
          type="button"
          onClick={goToScene2}
          className="inline-flex items-center justify-center border-[0.5px] border-white bg-transparent px-5 py-2 text-[0.58rem] font-normal uppercase tracking-[0.12em] text-white transition-all hover:bg-white hover:text-neutral-950 md:border md:px-8 md:py-3 md:text-[0.74rem] md:font-medium"
        >
          Get Started →
        </button>
      </div>

      {/* Four one-liners, evenly spaced across the combined runtime of
          scenes 2 and 3. Timings are set up in goToScene2(). */}
      {['One community', 'One platform', 'Real coaches', 'Real nutritionists'].map(
        (line, i) => (
          <div
            key={line}
            className="pointer-events-none absolute inset-x-0 top-[45%] -translate-y-1/2 z-10 px-6 text-center"
            style={{
              // Fade the last line out the moment scene 5 begins so
              // the final one-liner doesn't linger into the headline.
              opacity:
                !looped && step === i + 1 && !(i === 3 && scene === 5)
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

      {/* Scene 5 headline — fades in half a second after scene 5
          begins and fades out again when the film loops. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-[45%] -translate-y-1/2 z-10 px-6 text-center transition-opacity duration-[1000ms] ease-out"
        style={{
          opacity: scene === 5 && showHeadline && !looped ? 1 : 0,
        }}
      >
        <div className="text-[clamp(2rem,5vw,4rem)] font-normal leading-tight tracking-[-0.03em] text-white">
          Built around you
        </div>
      </div>

      {/* Dark gradient behind the final CTAs — pulls contrast up so
          the buttons pop against whatever frame of scene 5 is behind
          them. Fades in/out with the CTAs themselves. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[9] h-[42vh] bg-gradient-to-t from-black/80 via-black/40 to-transparent transition-opacity duration-[1000ms] ease-out"
        style={{
          opacity: (scene === 5 && showHeadline) || looped ? 1 : 0,
        }}
      />

      {/* Scene 5 final CTA — comes in a beat after the headline and
          stays pinned on top for every loop iteration. */}
      <div
        className="absolute inset-x-0 bottom-[10vh] z-10 flex flex-col items-center gap-4 px-6 text-center transition-opacity duration-[2200ms] ease-out"
        style={{
          opacity: (scene === 5 && showHeadline) || looped ? 1 : 0,
          pointerEvents: (scene === 5 && showHeadline) || looped ? 'auto' : 'none',
          transitionDelay: scene === 5 && showHeadline && !looped ? '2500ms' : '0ms',
        }}
      >
        <a
          href="/"
          className="group inline-flex items-center justify-center gap-2.5 border border-white bg-black/35 px-6 py-2.5 text-[0.62rem] font-light uppercase tracking-[0.12em] text-white shadow-[0_0_24px_rgba(0,0,0,0.45)] backdrop-blur-sm transition-all hover:bg-white hover:text-neutral-950 md:gap-3 md:px-10 md:py-4 md:text-[0.82rem] md:font-medium"
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
          className="inline-flex items-center justify-center border border-white bg-black/35 px-5 py-2 text-[0.58rem] font-light uppercase tracking-[0.12em] text-white shadow-[0_0_24px_rgba(0,0,0,0.45)] backdrop-blur-sm transition-all hover:bg-white hover:text-neutral-950 md:px-9 md:py-3.5 md:text-[0.76rem] md:font-medium"
        >
          Log in
        </a>
      </div>
    </main>
  );
}

