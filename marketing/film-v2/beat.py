import subprocess, numpy as np
SR=8000; HOP=0.005
def decode(path):
    o=subprocess.run(['ffmpeg','-v','error','-i',path,'-ac','1','-ar',str(SR),'-f','f32le','-'],
                     capture_output=True).stdout
    return np.frombuffer(o,dtype=np.float32).astype(np.float64)
def bandpass(x,lo,hi):
    n=len(x); X=np.fft.rfft(x); f=np.fft.rfftfreq(n,1.0/SR)
    X[(f<lo)|(f>hi)]=0
    return np.fft.irfft(X,n)
def energy(x):
    h=int(round(HOP*SR)); n=len(x)//h
    e=np.array([float((x[i*h:(i+1)*h]**2).mean()) for i in range(n)])
    return np.convolve(e,np.ones(3)/3.0,mode='same')
def onset(e):
    d=np.diff(e,prepend=e[0]); d[d<0]=0
    m=d.max()
    return d/m if m>0 else d
def grid(o,bpm_lo=110.0,bpm_hi=140.0):
    n=len(o); dur=n*HOP; best=None
    for bpm in np.arange(bpm_lo,bpm_hi+1e-9,0.05):
        P=60.0/bpm; nb=int(dur/P)
        if nb<8: continue
        for ph in np.arange(0.0,P,0.005):
            idx=np.round((ph+np.arange(nb)*P)/HOP).astype(int)
            idx=idx[(idx>=0)&(idx<n)]
            s=float(o[idx].sum())/max(1,len(idx))
            if best is None or s>best[0]: best=(s,float(bpm),float(P),float(ph))
    if best is None: return dict(bpm=None,P=None,phase=None,score=None)
    s,bpm,P,ph=best
    nb=int(dur/P); bb=None
    for ph2 in np.arange(max(0.0,ph-0.01),min(P,ph+0.01)+1e-9,0.002):
        idx=np.round((ph2+np.arange(nb)*P)/HOP).astype(int); idx=idx[(idx>=0)&(idx<n)]
        v=float(o[idx].sum())/max(1,len(idx))
        if bb is None or v>bb[0]: bb=(v,float(ph2))
    return dict(bpm=round(bpm,2),P=round(P,6),phase=round(bb[1],4),score=round(bb[0],4))
