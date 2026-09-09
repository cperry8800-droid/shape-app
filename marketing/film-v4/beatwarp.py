# beatwarp.py -- retime the runner so every footfall lands on a beat. python3 beatwarp.py runner.mp4 runner_hi.mp4 runner_beat.mp4 <beat period s>
# Footfalls are the frames where the figure's centroid sits lowest on the page (mid-stance); the clip is mapped piecewise-linearly so
# footfall k lands at k*P/STEPS_PER_BEAT, and the output is sampled from a motion-interpolated copy (its rate read off the file) with a
# linear blend between the two interpolated frames either side of the wanted instant, so the slow-down stays smooth. The output ends
# where the interpolated copy ends.
import sys,subprocess,numpy as np,json,os
SRC,SRCHI,OUT,P=sys.argv[1],sys.argv[2],sys.argv[3],float(sys.argv[4]); W,H=720,1280; FPS=24
SPB=float(os.environ.get('STEPS_PER_BEAT','1')); STEP=P/SPB
r=subprocess.run(['ffprobe','-v','error','-select_streams','v','-show_entries','stream=r_frame_rate','-of','csv=p=0',SRCHI],capture_output=True,text=True).stdout.strip(); a,b=r.split('/'); FPSHI=float(a)/float(b)
def frames(path,w,h):
    p=subprocess.Popen(['ffmpeg','-v','error','-i',path,'-vf',f'scale={w}:{h}','-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE,bufsize=10**8)
    while True:
        b=p.stdout.read(w*h*3)
        if len(b)<w*h*3: break
        yield np.frombuffer(b,np.uint8).reshape(h,w,3)
    p.wait()
cy=[]
for f in frames(SRC,W,H):
    g=0.299*f[...,0]+0.587*f[...,1]+0.114*f[...,2]; m=g<60; m[:125]=False; m[H-170:]=False; ys=np.nonzero(m)[0]; cy.append(float(ys.mean()) if len(ys) else np.nan)
cy=np.array(cy); s=np.nan_to_num(cy-np.nanmean(cy)); ss=np.convolve(s,np.ones(3)/3,mode='same')
peaks=[i for i in range(2,len(ss)-2) if ss[i]>ss[i-1] and ss[i]>=ss[i+1] and ss[i]>ss[i-2] and ss[i]>=ss[i+2]]
clean=[]   # drop double-detections closer than 4 frames
for i in peaks:
    if not clean or i-clean[-1]>=4: clean.append(i)
peaks=clean; src_t=np.array(peaks)/FPS; tgt_t=np.arange(len(peaks))*STEP
print('footfalls',len(peaks),'source frames',peaks,'mean source step',round(float(np.mean(np.diff(src_t))),3),'s -> target step',round(STEP,4),'(hi-rate copy at',FPSHI,'fps)')
json.dump(dict(footfall_frames=peaks,P=P,steps_per_beat=SPB,step=STEP,hi_fps=FPSHI),open('footfalls.json','w'))
def src_time(t):   # output time -> source time by the inverse piecewise-linear map (before the first footfall and after the last: the neighbouring segment's speed)
    if t<=tgt_t[0]: return src_t[0]+(t-tgt_t[0])*(src_t[1]-src_t[0])/(tgt_t[1]-tgt_t[0])
    k=int(np.searchsorted(tgt_t,t,side='right')-1)
    if k>=len(tgt_t)-1: k=len(tgt_t)-2
    a=(t-tgt_t[k])/(tgt_t[k+1]-tgt_t[k]); return src_t[k]+a*(src_t[k+1]-src_t[k])
NOUT=int(tgt_t[-1]*FPS)
wr=subprocess.Popen(['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-c:v','libx264','-preset','medium','-crf','14','-pix_fmt','yuv420p',OUT],stdin=subprocess.PIPE)
gen=frames(SRCHI,W,H); fa=next(gen); ia=0; fb=next(gen); ended=False; written=0
for n in range(NOUT):
    s=max(0.0,src_time(n/FPS)*FPSHI); i0=int(s); fr=s-i0
    while ia<i0 and not ended:
        try: fa=fb; fb=next(gen); ia+=1
        except StopIteration: ended=True
    if ended and ia<i0: break   # the interpolated copy is exhausted: stop rather than hold a frame
    out=fa if fr<0.02 else (fa.astype(np.float32)*(1-fr)+fb.astype(np.float32)*fr).clip(0,255).astype(np.uint8)
    wr.stdin.write(out.tobytes()); written+=1
wr.stdin.close(); wr.wait(); print('written',written,'frames =',round(written/FPS,3),'s of',NOUT,'planned; first footfall at output t',round(float(tgt_t[0]),3)); print('BEATWARP-DONE')
