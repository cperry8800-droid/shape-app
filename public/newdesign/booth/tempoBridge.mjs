// The booth's tempo readout is MEASURED by Shape Radio's own detector — the same module the
// Signal Field ships (public/newdesign/radioTempo.mjs) — never typed in. It returns null
// ("—") until the audio has earned a number, exactly as on the Radio page.
import { createTempoDetector, tempoEnergyFromBins } from '../radioTempo.mjs';

export function createTempoTracker() {
  const det = createTempoDetector();
  let last = null;
  return {
    push(bins, t) {
      const e = tempoEnergyFromBins(bins);
      if (e != null) det.push(t, e);
      last = det.read(t);
    },
    bpm() { return last && Number.isFinite(last.bpm) ? last.bpm : null; },
    phase() { return last ? last.phase : null; },
    reset() { det.reset && det.reset(); last = null; },
  };
}
