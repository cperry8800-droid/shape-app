import json,math,subprocess,numpy as np,beat,sys
m=json.load(open('meas_d1.json')); BPM=m['bpm'];PH=m['phase'];P=60.0/BPM; KB=m['kick_by_beat']
def beatt(n): return PH+n*P
def bar(b): return beatt(4*(b-1))
F=sys.argv[1]; LOOK=sys.argv[2]; W,H=1440,2560; CREAM=(LOOK=='print')
def frame(t):
    o=subprocess.run(['ffmpeg','-v','error','-ss',f'{t:.4f}','-i',F,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True).stdout
    return np.frombuffer(o,np.uint8).reshape(H,W,3).astype(int)
def teal(f): return int(((abs(f[...,0]-0x34)<40)&(abs(f[...,1]-0xd6)<40)&(abs(f[...,2]-0xc5)<40)).sum())
def cream(f): return int(((f[...,0]>200)&(f[...,1]>190)&(f[...,2]>170)).sum())
def ink(f): return int((f.max(-1)<60).sum())
text=ink if CREAM else cream
pr=subprocess.run(['ffprobe','-v','error','-select_streams','v','-count_frames','-show_entries','stream=nb_read_frames,r_frame_rate,width,height:format=duration','-of','json',F],capture_output=True,text=True).stdout
print('probe',' '.join(pr.split())); ok=0; bad=0
def chk(name,cond,detail):
    global ok,bad; ok+=cond; bad+=(not cond); print(('PASS' if cond else 'FAIL'),name,detail)
starts={'lifter':bar(3),'cook':bar(5),'yoga':bar(7),'cyclist':bar(9),'coach':bar(11),'radio':bar(14),'runner':bar(16),'skipper':bar(21),'montage':bar(23),'globe':bar(25)}
# the seam is an 8-frame crossfade, not a wipe: the page before it (T-0.15) differs from the page after it (T+0.40) by more than the page's own motion over one frame (T+0.40 -> T+0.45); both samples sit inside the montage's first slot
for nm,T in starts.items():
    a=frame(T-0.15); b=frame(T+0.40); c=frame(T+0.45)
    d1=float(np.abs(a-b).mean()); d2=float(np.abs(b-c).mean()); chk(f'seam {nm}',d1>2*d2+2,f'across {d1:.1f} within {d2:.1f}')
crop=(slice(140,300),slice(90,220)) if CREAM else (slice(20,200),slice(80,240))
for nm,nb in (('lifter beat 12',12),('cook beat 20',20),('skipper beat 84',84)):
    fb=frame(beatt(nb)+1/24)[crop]; fm=frame(beatt(nb)+P/2)[crop]; chk(f'mark on kick {nm}',teal(fb)>teal(fm)*1.02,f'on {teal(fb)} mid {teal(fm)} kb {KB[nb]}')
fb=frame(beatt(70)+1/24)[crop]; fm=frame(beatt(70)+P/2)[crop]; chk('mark still in the breakdown',abs(teal(fb)-teal(fm))<=max(60,0.03*teal(fb)),f'on {teal(fb)} mid {teal(fm)} kb {KB[70]}')
TS=bar(19); band=lambda f:f[150:262,540:1140]; chk('IN SYNC lands on bar 19',teal(band(frame(TS+0.4)))>3000 and teal(band(frame(TS-0.3)))<800,f'post {teal(band(frame(TS+0.4)))} pre {teal(band(frame(TS-0.3)))} TS {TS:.3f}')
for nm,T0,T1 in (('lifter',bar(3),bar(5)),('coach',bar(11),bar(14)),('radio',bar(14),bar(16))):
    c0=text(frame(T0+0.05)[2000:2180,90:1350]); c1=text(frame((T0+T1)/2)[2000:2180,90:1350]); chk(f'caption band {nm}',c1>c0+1500,f'start {c0} mid {c1}')
f=frame(bar(14)+2.0); chk('radio play glyph',teal(f[2040:2130,380:560])>400,f'teal in the glyph box {teal(f[2040:2130,380:560])}')   # the glyph sits 70 px left of the caption's left edge: x ~430-476 for 'Shape Radio.'
for nm,T in (('lifter',bar(3)+1.0),('coach',bar(11)+1.0)):
    f=frame(T); col=f[300:700,950:970]; chk(f'no column rule {nm}',(teal(col) if not CREAM else ink(col))<40,f'line px {teal(col) if not CREAM else ink(col)}')
f=frame(bar(31)-0.3); wm=int((f[560:760].min(-1)>200).sum()); lines=text(f[2000:2260,90:1350]); chk('globe close',wm>6000 and lines>3000,f'wordmark white px {wm} band text px {lines} mean luma {float((0.299*f[...,0]+0.587*f[...,1]+0.114*f[...,2]).mean()):.1f}')
a=frame(bar(23)+0.25); b=frame(bar(23)+P+0.25); chk('montage cut',float(np.abs(a-b).mean())>3,f'diff {float(np.abs(a-b).mean()):.1f}')
subprocess.run(['ffmpeg','-y','-v','error','-i',F,'-vn','-c:a','copy',F+'.m4a']); x=beat.decode(F+'.m4a'); o=beat.onset(beat.energy(beat.bandpass(x,40,120))); g=beat.grid(o,110.0,150.0)
chk('audio grid',abs(g['bpm']-BPM)<0.3,f"{g} dur {len(x)/beat.SR:.3f}")
print('RESULT',LOOK,ok,'PASS',bad,'FAIL'); print('VERIFYF2-DONE')
