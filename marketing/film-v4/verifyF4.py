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
starts={'cook':bar(4),'yoga':bar(6),'cyclist':bar(8),'coach':bar(10),'radio':bar(13),'runner':bar(16),'skipper':bar(21),'montage':bar(23),'globe':bar(25)}   # v4: no dancer, the lifter opens on bar 1
# the seam is an 8-frame crossfade, not a wipe or a cut: (1) CONTINUITY -- the first frame after the seam (T+1/24) differs from the last frame before it (T-1/24) by no more than the page's own motion over one frame (T+0.40 -> T+0.45) plus a margin, where a cut would jump by the whole page; (2) A CHANGE -- the page before the seam (T-0.15) differs from the page after it (T+0.40) by more than that one-frame motion. v3's instrument asked only for the change, at twice the motion plus 2, and the thinner v4 outline made two mostly-black pages read alike (across 4.0-8.5 against within 1.7-5.0) on seams that were crossfades; the continuity test is what 'crossfade, not a wipe' means. Both samples sit inside the montage's first slot
# ⚠ the continuity margin is measured on BOTH pages: the two frames either side of the seam are 96 % the OLD page (the crossfade's first frame sits at 4 % of the new one), so the jump they show is mostly the old page's own motion over two frames -- the skipper's 2.1 a frame read as a 4.3 'jump' into the montage when the margin was taken from the montage slot's 0.5. The reference is twice the larger of the old page's one-frame motion (T-2/24 -> T-1/24) and the new page's (T+0.40 -> T+0.45), plus 2
for nm,T in starts.items():
    a00=frame(T-2/24); a0=frame(T-1/24); a1=frame(T+1/24); a=frame(T-0.15); b=frame(T+0.40); c=frame(T+0.45)
    w0=float(np.abs(a0-a00).mean()); jump=float(np.abs(a1-a0).mean()); d1=float(np.abs(a-b).mean()); d2=float(np.abs(b-c).mean()); chk(f'seam {nm}',jump<2*max(w0,d2)+2 and d1>d2+1,f'jump at the seam {jump:.1f} (old page motion {w0:.1f}) across {d1:.1f} within {d2:.1f}')
crop=(slice(140,300),slice(90,220)) if CREAM else (slice(20,200),slice(80,240))
for nm,nb in (('lifter beat 12',12),('cook beat 20',20),('skipper beat 84',84)):
    fb=frame(beatt(nb)+1/24)[crop]; fm=frame(beatt(nb)+P/2)[crop]; chk(f'mark on kick {nm}',teal(fb)>teal(fm)*1.02,f'on {teal(fb)} mid {teal(fm)} kb {KB[nb]}')
fb=frame(beatt(70)+1/24)[crop]; fm=frame(beatt(70)+P/2)[crop]; chk('mark still in the breakdown',abs(teal(fb)-teal(fm))<=max(60,0.03*teal(fb)),f'on {teal(fb)} mid {teal(fm)} kb {KB[70]}')
TS=bar(19); band=lambda f:f[150:262,540:1140]; chk('IN SYNC lands on bar 19',teal(band(frame(TS+0.4)))>3000 and teal(band(frame(TS-0.3)))<800,f'post {teal(band(frame(TS+0.4)))} pre {teal(band(frame(TS-0.3)))} TS {TS:.3f}')
# the caption fades in from T0+0.35, after the 8-frame crossfade; 'start' is sampled at T0+0.30 (the crossfade at 97 %, the previous page's ink already lightened past the ink threshold, the caption not yet drawn) in the glyph rows only, so a figure standing under the band counts the same in both samples
for nm,T0,T1 in (('lifter',bar(1),bar(4)),('coach',bar(10),bar(13)),('radio',bar(13),bar(16))):
    c0=text(frame(T0+0.30)[2040:2140,200:1240]); c1=text(frame((T0+T1)/2)[2040:2140,200:1240]); chk(f'caption band {nm}',c1>c0+1500,f'start {c0} mid {c1}')
f=frame(bar(13)+2.0); chk('radio play glyph',teal(f[2040:2130,380:560])>400,f'teal in the glyph box {teal(f[2040:2130,380:560])}')   # the glyph sits 70 px left of the caption's left edge: x ~430-476 for 'Shape Radio.'
for nm,T,x0 in (('lifter',bar(1)+1.0,505),('coach',bar(10)+1.0,950)):   # the lifter's probe sits on the 12-px dark column its clip draws at x 517 (struck as a rule), not in the kettlebell's path
    f=frame(T); col=f[300:700,x0:x0+20]; chk(f'no column rule {nm}',(teal(col) if not CREAM else ink(col))<40,f'line px {teal(col) if not CREAM else ink(col)}')
f=frame(bar(31)-0.3); wm=int((f[480:720].min(-1)>200).sum()); lines=text(f[2000:2260,90:1350]); chk('globe close',wm>6000 and lines>3000,f'wordmark white px {wm} band text px {lines} mean luma {float((0.299*f[...,0]+0.587*f[...,1]+0.114*f[...,2]).mean()):.1f}')
# v3: one mark on the globe page (the lockup's), none in the corner; the sphere smaller with the lockup above it (owner, on v2)
chk('globe page has no corner mark',teal(f[20:200,80:240])<60,f'corner teal px {teal(f[20:200,80:240])}')
cx=f[900:2100,300:1140]; lit=int(((0.299*cx[...,0]+0.587*cx[...,1]+0.114*cx[...,2])>40).sum()); out=f[900:2100,0:120]; outl=int(((0.299*out[...,0]+0.587*out[...,1]+0.114*out[...,2])>40).sum()); chk('sphere sits smaller, under the lockup',lit>50000 and outl<2000,f'lit px inside {lit} at the left edge {outl}')
pins=teal(f[600:1100,200:1240]); chk('pins above the sphere carry the mark',pins>300,f'teal px between the rule and the sphere {pins}')
# v4: no more than MAXPINS beams stand above the sphere (bright cool column groups in the rows between the rule and the disc)
g=f.astype(float); lum=0.299*g[...,0]+0.587*g[...,1]+0.114*g[...,2]; cool=(lum>136)&((g[...,1]+g[...,2])>(2*g[...,0]+40))
st=cool&~np.roll(cool,1,axis=1); st[:,0]=cool[:,0]; rid=np.cumsum(st.ravel())*cool.ravel(); ln=np.bincount(rid); cool=(cool.ravel()&(ln[rid]<=30)).reshape(cool.shape)   # runs wider than a beam (the rim's arcs) dropped first, or one arc would bridge every column it spans and the count would read 1 whatever stood
cols=np.nonzero(cool[700:1000].any(0))[0]; groups=[]
for x in cols:
    if groups and x-groups[-1][-1]<=3: groups[-1].append(int(x))
    else: groups.append([int(x)])
nb=len([gp for gp in groups if len(gp)<=60]); chk('at most eight beams above the sphere',nb<=10,f'beam column groups in rows 700-1000: {nb}')
# v4: the runner's footfalls land on the beats -- the figure's centroid sits lowest on the page on a beat (the print look reads the figure's ink, the black look its outline)
cys=[]; T0=bar(16)+0.3
for i in range(72):
    fr=frame(T0+i/24); m=(fr.max(-1)<60)[300:2200] if CREAM else (((abs(fr[...,0]-0x34)<40)&(abs(fr[...,1]-0xd6)<40)&(abs(fr[...,2]-0xc5)<40)))[300:2200]
    ys=np.nonzero(m)[0]; cys.append(float(ys.mean()) if len(ys) else np.nan)
cys=np.nan_to_num(np.array(cys)-np.nanmean(cys)); ss=np.convolve(cys,np.ones(3)/3,mode='same'); pk=[i for i in range(2,len(ss)-2) if ss[i]>ss[i-1] and ss[i]>=ss[i+1] and ss[i]>ss[i-2] and ss[i]>=ss[i+2]]
offs=[]
for i in pk:
    t=T0+i/24; n=round((t-PH)/P); offs.append(abs(t-(PH+n*P)))
chk('runner footfalls on the beat',len(pk)>=4 and float(np.mean(offs))<0.07,f'{len(pk)} lows in 3 s, mean offset from a beat {float(np.mean(offs)) if offs else -1:.3f} s (a frame is 0.042)')
a=frame(bar(23)+0.25); b=frame(bar(23)+P+0.25); chk('montage cut',float(np.abs(a-b).mean())>3,f'diff {float(np.abs(a-b).mean()):.1f}')
subprocess.run(['ffmpeg','-y','-v','error','-i',F,'-vn','-c:a','copy',F+'.m4a']); x=beat.decode(F+'.m4a'); o=beat.onset(beat.energy(beat.bandpass(x,40,120))); g=beat.grid(o,110.0,150.0)
chk('audio grid',abs(g['bpm']-BPM)<0.3,f"{g} dur {len(x)/beat.SR:.3f}")
print('RESULT',LOOK,ok,'PASS',bad,'FAIL'); print('VERIFYF2-DONE')
