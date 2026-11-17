# python3 -I grid.py <mp3> <bpm guess>  ->  the track's measured tempo, the phase of its beat grid,
# and where the kick comes in and drops out (low-band energy), so cuts can sit on its own bars.
import sys, subprocess, numpy as np
path, guess = sys.argv[1], float(sys.argv[2])
SR = 11025
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
x = np.frombuffer(raw, dtype=np.float32)
H = 256                                    # hop: 23.2 ms
n = (len(x) - 1024) // H
win = np.hanning(1024)
S = np.abs(np.array([np.fft.rfft(x[i * H:i * H + 1024] * win) for i in range(n)]))
freqs = np.fft.rfftfreq(1024, 1 / SR)
low = S[:, (freqs >= 35) & (freqs <= 150)].sum(axis=1)
flux = np.maximum(0, np.diff(S, axis=0)).sum(axis=1)        # onset strength, all bands
lowflux = np.maximum(0, np.diff(low))
fps = SR / H
def score(bpm, env):
    per = 60 / bpm * fps
    best = (-1, 0)
    for ph in np.linspace(0, per, 48, endpoint=False):
        idx = np.round(np.arange(ph, len(env) - 1, per)).astype(int)
        v = env[idx].mean()
        if v > best[0]: best = (v, ph)
    return best
cands = np.arange(guess - 8, guess + 8.01, 0.05)
res = [(score(b, flux)[0], b) for b in cands]
bpm = max(res)[1]
_, ph = score(bpm, lowflux if lowflux.max() > 0 else flux)
beat = 60 / bpm
t0 = ph / fps
# kick presence per beat: low-band energy in each beat window against the track's own median
nb = int((len(low) / fps - t0) / beat)
e = np.array([low[int((t0 + k * beat) * fps):int((t0 + (k + 1) * beat) * fps)].mean() for k in range(nb)])
thr = 0.5 * np.median(e[e > 0])
on = e > thr
runs, k = [], 0
while k < nb:
    j = k
    while j < nb and on[j] == on[k]: j += 1
    runs.append((round(t0 + k * beat, 2), round(t0 + j * beat, 2), 'kick' if on[k] else 'no kick', j - k))
    k = j
print(f'bpm {bpm:.2f}  beat {beat:.4f}s  bar {beat * 4:.4f}s  first beat at {t0:.3f}s  length {len(x) / SR:.2f}s')
for r in runs: print('  ', r)
