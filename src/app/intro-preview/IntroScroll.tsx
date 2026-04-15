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
    // Only scene 1 autoplays on mount. Later scenes start paused at
    // frame 0 and begin playing on transition — this avoids a mid-clip
    // jump or loop-seam stutter when the scene finally becomes visible.
    video1Ref.current?.play().catch(() => {});
  }, []);

  const goToScene2 = () => {
    setScene(2);
    const v = video2Ref.current;
    if (v) {
      v.currentTime = 0;
      v.play().catch(() => {});
    }
  };

  const goToScene3 = () => {
    setScene(3);
    const v = video3Ref.current;
    if (v) {
      v.currentTime = 0;
      v.play().catch(() => {});
    }
  };

  // Auto-advance from scene 3 to scene 4 so the film flows straight
  // through to the final Enter Shape CTA without a second Continue click.
  useEffect(() => {
    if (scene !== 3) return;
    const t = setTimeout(() => goToScene4(), 5000);
    return () => clearTimeout(t);
  }, [scene]);

  const goToScene4 = () => {
    setScene(4);
    const v = video4Ref.current;
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

      {/* Scene 3 video */}
      <video
        ref={video3Ref}
        src={SCENE_3}
        muted
        loop
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

      {/* Shape logo (always visible) */}
      <img
        src="/logo-original.png"
        alt="Shape"
        className="pointer-events-none absolute left-6 top-6 z-20 h-16 w-auto md:left-10 md:top-10 md:h-20"
        style={{ filter: 'brightness(0) invert(1)' }}
      />

      {/* Scene 1 CTA — fades out as scene 2 takes over */}
      <div
        className="absolute inset-x-0 bottom-[10vh] z-10 flex flex-col items-center gap-5 px-6 text-center transition-opacity duration-[1000ms] ease-out"
        style={{
          opacity: scene === 1 ? 1 : 0,
          pointerEvents: scene === 1 ? 'auto' : 'none',
        }}
      >
        <div className="text-[clamp(1.3rem,2.7vw,2rem)] font-light leading-tight tracking-[-0.02em] text-white">
          Join the community
        </div>
        <button
          type="button"
          onClick={goToScene2}
          className="inline-flex items-center justify-center border border-white bg-transparent px-8 py-3 text-[0.74rem] font-medium uppercase tracking-[0.12em] text-white transition-all hover:bg-white hover:text-neutral-950"
        >
          Get Started →
        </button>
      </div>

      {/* Scene 2 sequential one-liners + Continue -> scene 3 */}
      <Scene2Copy active={scene === 2} onContinue={goToScene3} />

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
          <span>Enter</span>
          <img
            src="/logo-text-trimmed.png"
            alt="Shape"
            className="h-[0.7rem] w-auto"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
          <span>→</span>
        </a>
      </div>
    </main>
  );
}

// Four sequential one-liners that fade in/out over scene 2, then a
// Continue button that triggers scene 3.
function Scene2Copy({
  active,
  onContinue,
}: {
  active: boolean;
  onContinue: () => void;
}) {
  const [step, setStep] = useState(0);
  const [showContinue, setShowContinue] = useState(false);

  useEffect(() => {
    if (!active) {
      setStep(0);
      setShowContinue(false);
      return;
    }
    const timers = [
      setTimeout(() => setStep(1), 1000),
      setTimeout(() => setStep(2), 4500),
      setTimeout(() => setStep(3), 8000),
      setTimeout(() => setStep(4), 11500),
      setTimeout(() => setShowContinue(true), 2000),
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

      <div
        className="absolute inset-x-0 bottom-[10vh] z-10 flex flex-col items-center gap-4 px-6 text-center"
        style={{
          opacity: showContinue ? 1 : 0,
          pointerEvents: showContinue ? 'auto' : 'none',
          transition: 'opacity 1000ms ease-out',
        }}
      >
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex items-center justify-center border border-white bg-transparent px-10 py-4 text-[0.82rem] font-medium uppercase tracking-[0.12em] text-white transition-all hover:bg-white hover:text-neutral-950"
        >
          Continue →
        </button>
      </div>
    </>
  );
}

