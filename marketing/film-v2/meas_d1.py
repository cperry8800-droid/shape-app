import json, numpy as np, beat
x=beat.decode('d1.m4a'); dur=len(x)/beat.SR
kick=beat.bandpass(x,40,120); e=beat.energy(kick); o=beat.onset(e)
g=beat.grid(o,110.0,150.0); n=len(o)//2; g1=beat.grid(o[:n],110.0,150.0); g2=beat.grid(o[n:],110.0,150.0)
P=g['P']; ph=g['phase']; nb=int((dur-ph)/P); ek=e/e.max(); h=beat.HOP; kb=[]
for i in range(nb):
    t=ph+i*P; a=int((t-0.04)/h); b=int((t+0.04)/h)+1; kb.append(float(ek[max(0,a):b].max()) if b>a else 0.0)
kb=np.array(kb); pres=np.clip((kb-0.15)/0.30,0,1); first=[i for i,v in enumerate(kb) if v>0.3][0]
gaps=[]; run=None
for i,v in enumerate(pres):
    if v<0.5: run=[i,i] if run is None else [run[0],i]
    else:
        if run: gaps.append(run); run=None
if run: gaps.append(run)
gaps=[gg for gg in gaps if gg[1]-gg[0]>=2]
out=dict(bpm=g['bpm'],P=g['P'],phase=g['phase'],score=g['score'],halves=[g1['bpm'],g2['bpm']],first_kick_s=round(ph+first*P,3),dur=round(dur,3),kick_gaps_beats=[[int(a),int(b)] for a,b in gaps],kick_by_beat=[round(float(v),3) for v in kb])
json.dump(out,open('meas_d1.json','w')); o2=dict(out); o2.pop('kick_by_beat'); print(json.dumps(o2)); print('MEAS1-DONE')
